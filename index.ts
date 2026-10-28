import { AsyncLocalStorage } from 'node:async_hooks'
import cluster, { Worker } from 'cluster'
import type { BrowserContext, Cookie, Page } from 'patchright'
import pkg from '../package.json'

import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

import Browser from './browser/Browser'
import BrowserFunc from './browser/BrowserFunc'
import BrowserUtils from './browser/BrowserUtils'
import ReactFunc from './browser/ReactFunc'
import type { PageSnapshot } from './browser/ReactFunc'

import { IpcLog, Logger } from './logging/Logger'
import Utils, { isBrowserClosedError } from './util/Utils'
import { loadAccounts, loadConfig } from './util/Load'
import { closeSessionStore } from './util/SessionStore'
import { checkNodeVersion } from './util/Validator'

import { Login } from './browser/auth/Login'
import { Workers } from './functions/Workers'
import Activities from './functions/Activities'
import { SearchManager } from './functions/SearchManager'
import { PunchcardManager } from './functions/PunchcardManager'

import type { Account } from './interface/Account'
import HttpClient from './util/Http'
import { sendDiscord, flushDiscordQueue } from './logging/Discord'
import { sendNtfy, flushNtfyQueue } from './logging/Ntfy'
import type { DashboardData } from './interface/DashboardData'
import type { AppDashboardData } from './interface/AppDashBoardData'
import type { AppEarnablePoints } from './interface/Points'
import type { AppUserData } from './interface/AppUserData'
import type { PanelFlyoutData } from './interface/PanelFlyoutData'
import { ReportManager } from './util/ReportManager'

interface ExecutionContext {
    isMobile: boolean
    account: Account
}

interface BrowserSession {
    context: BrowserContext
    fingerprint: BrowserFingerprintWithHeaders
}

interface AccountStats {
    email: string
    initialPoints: number
    finalPoints: number
    collectedPoints: number
    duration: number
    success: boolean
    error?: string
}

const executionContext = new AsyncLocalStorage<ExecutionContext>()

export function getCurrentContext(): ExecutionContext {
    const context = executionContext.getStore()
    if (!context) {
        return { isMobile: false, account: {} as Account }
    }
    return context
}

async function flushAllWebhooks(timeoutMs = 5000): Promise<void> {
    await Promise.allSettled([flushDiscordQueue(timeoutMs), flushNtfyQueue(timeoutMs)])
    closeSessionStore()
}

interface UserData {
    userName: string
    geoLocale: string
    langCode: string
    timezoneOffset: string
    initialPoints: number
    currentPoints: number
    gainedPoints: number
    sapphireId: string
}

export class MicrosoftRewardsBot {
    public logger: Logger
    public config
    public utils: Utils
    public activities: Activities = new Activities(this)
    public browser: { func: BrowserFunc; utils: BrowserUtils; react: ReactFunc }

    public mainMobilePage!: Page
    public mainDesktopPage!: Page

    public userData: UserData

    public nextActions: Record<string, string> = {}
    public nextRouterStateTree = ''
    public reactSnapshot: PageSnapshot | null = null

    public accessToken = ''
    public cookies: { mobile: Cookie[]; desktop: Cookie[] }
    private fingerprintMobile?: BrowserFingerprintWithHeaders
    private fingerprintDesktop?: BrowserFingerprintWithHeaders

    get fingerprint(): BrowserFingerprintWithHeaders {
        const ctx = this.isMobile ? this.fingerprintMobile : this.fingerprintDesktop
        return (ctx ?? this.fingerprintMobile ?? this.fingerprintDesktop) as BrowserFingerprintWithHeaders
    }

    private activeWorkers: number
    private exitedWorkers: number[]
    private browserFactory: Browser = new Browser(this)
    private accounts: Account[]
    public workers: Workers
    private searchManager: SearchManager
    private punchcardManager: PunchcardManager
    private login = new Login(this)

    public http!: HttpClient
    public reportManager!: ReportManager

    public currentAccountEmail: string | null = null
    public isSessionActive = false

    constructor() {
        this.userData = {
            userName: '',
            geoLocale: 'US',
            langCode: 'en',
            timezoneOffset: '60',
            initialPoints: 0,
            currentPoints: 0,
            gainedPoints: 0,
            sapphireId: ''
        }
        this.logger = new Logger(this)
        this.accounts = []
        this.cookies = { mobile: [], desktop: [] }
        this.utils = new Utils()
        this.workers = new Workers(this)
        this.searchManager = new SearchManager(this)
        this.punchcardManager = new PunchcardManager(this)
        this.browser = {
            func: new BrowserFunc(this),
            utils: new BrowserUtils(this),
            react: new ReactFunc(this)
        }
        this.config = loadConfig()
        this.reportManager = new ReportManager(this)
        this.activeWorkers = this.config.clusters
        this.exitedWorkers = []
    }

    get isMobile(): boolean {
        return getCurrentContext().isMobile
    }

    async initialize(): Promise<void> {
        this.accounts = loadAccounts()
        const accountsArg = process.argv.indexOf('--accounts')
        if (accountsArg !== -1 && accountsArg + 1 < process.argv.length) {
            const raw = process.argv[accountsArg + 1]
            if (raw) {
                const indices = new Set<number>()
                for (const segment of raw.split(',')) {
                    const s = segment.trim()
                    if (!s) continue
                    const dashIdx = s.indexOf('-')
                    if (dashIdx !== -1) {
                        const start = parseInt(s.substring(0, dashIdx))
                        const end = parseInt(s.substring(dashIdx + 1))
                        if (!isNaN(start) && !isNaN(end)) {
                            for (let i = start; i <= end; i++) indices.add(i)
                        }
                    } else {
                        const n = parseInt(s)
                        if (!isNaN(n)) indices.add(n)
                    }
                }
                if (indices.size > 0) {
                    this.accounts = this.accounts.filter((_, i) => indices.has(i + 1))
                }
            }
        }
        this.warnExperimental()
    }

    private warnExperimental(): void {
        const exp = this.config.experimental
        const enabled = [exp.apiSearch && 'apiSearch', exp.apiSearchOnBing && 'apiSearchOnBing'].filter(
            Boolean
        ) as string[]
        if (!enabled.length) return

        this.logger.warn(
            'main',
            'EXPERIMENTAL',
            `${enabled.join(' + ')} enabled - these perform searches over HTTP with no real browser. ` +
                `This path is EXPERIMENTAL and UNSAFE and may get your account flagged or banned. ` +
                `Disable it under config.experimental if you are unsure.`,
            'redBright'
        )
    }

    async run(): Promise<void> {
        const totalAccounts = this.accounts.length
        const runStartTime = Date.now()

        this.logger.info(
            'main',
            'RUN-START',
            `Starting Microsoft Rewards Script | v${pkg.version} | Accounts: ${totalAccounts} | Clusters: ${this.config.clusters}`
        )

        if (this.config.clusters > 1) {
            if (cluster.isPrimary) {
                await this.runMaster(runStartTime)
            } else {
                this.runWorker(runStartTime)
            }
        } else {
            await this.runTasks(this.accounts, runStartTime)
        }
    }

    private async runMaster(runStartTime: number): Promise<void> {
        void this.logger.info('main', 'CLUSTER-PRIMARY', `Primary process started | PID: ${process.pid}`)

        const rawChunks = this.utils.chunkArray(this.accounts, this.config.clusters)
        const accountChunks = rawChunks.filter(c => c && c.length > 0)
        this.activeWorkers = accountChunks.length

        const allAccountStats: AccountStats[] = []
        let hadWorkerFailure = false

        for (const chunk of accountChunks) {
            const worker = cluster.fork()
            worker.send?.({ chunk, runStartTime })

            worker.on('message', (msg: { __ipcLog?: IpcLog; __stats?: AccountStats[] }) => {
                if (msg.__stats) {
                    allAccountStats.push(...msg.__stats)
                }

                const log = msg.__ipcLog
                if (log && typeof log.content === 'string') {
                    const { webhook } = this.config
                    const { content, level } = log

                    if (webhook.discord?.enabled && webhook.discord.url) {
                        sendDiscord(webhook.discord.url, content, level)
                    }
                    if (webhook.ntfy?.enabled && webhook.ntfy.url) {
                        sendNtfy(webhook.ntfy, content, level)
                    }
                }
            })

            // Startup delay for clusters due to resource usage
            if (accountChunks.indexOf(chunk) !== accountChunks.length - 1) {
                await this.utils.wait(5000)
            }
        }

        const onWorkerExit = async (worker: Worker, code?: number, signal?: string): Promise<void> => {
            const { pid } = worker.process

            if (!pid || this.exitedWorkers.includes(pid)) {
                return
            }

            this.exitedWorkers.push(pid)
            this.activeWorkers -= 1

            const failed = (code ?? 0) !== 0 || Boolean(signal)
            if (failed) {
                hadWorkerFailure = true
            }

            this.logger.warn(
                'main',
                'CLUSTER-WORKER-EXIT',
                `Worker ${pid} exit | Code: ${code ?? 'n/a'} | Signal: ${signal ?? 'n/a'} | Active workers: ${this.activeWorkers}`
            )

            if (this.activeWorkers <= 0) {
                const totalCollectedPoints = allAccountStats.reduce((sum, s) => sum + s.collectedPoints, 0)
                const totalInitialPoints = allAccountStats.reduce((sum, s) => sum + s.initialPoints, 0)
                const totalFinalPoints = allAccountStats.reduce((sum, s) => sum + s.finalPoints, 0)
                const totalDurationMinutes = ((Date.now() - runStartTime) / 1000 / 60).toFixed(1)

                this.logger.info(
                    'main',
                    'RUN-END',
                    `Completed all accounts | Accounts processed: ${allAccountStats.length} | Total points collected: +${totalCollectedPoints} | Old total: ${totalInitialPoints} → New total: ${totalFinalPoints} | Total runtime: ${totalDurationMinutes}min`,
                    'green'
                )

                await flushAllWebhooks()

                process.exit(hadWorkerFailure ? 1 : 0)
            }
        }

        cluster.on('exit', (worker, code, signal) => {
            void onWorkerExit(worker, code ?? undefined, signal ?? undefined)
        })

        cluster.on('disconnect', worker => {
            const pid = worker.process?.pid
            this.logger.warn('main', 'CLUSTER-WORKER-DISCONNECT', `Worker ${pid ?? '?'} disconnected`)
        })
    }

    private runWorker(runStartTimeFromMaster?: number): void {
        void this.logger.info('main', 'CLUSTER-WORKER-START', `Worker spawned | PID: ${process.pid}`)

        process.on('message', async ({ chunk, runStartTime }: { chunk: Account[]; runStartTime: number }) => {
            void this.logger.info(
                'main',
                'CLUSTER-WORKER-TASK',
                `Worker ${process.pid} received ${chunk.length} accounts.`
            )

            try {
                const stats = await this.runTasks(chunk, runStartTime ?? runStartTimeFromMaster ?? Date.now())

                if (process.send) {
                    process.send({ __stats: stats })
                }

                await flushAllWebhooks()
                process.exit(0)
            } catch (error) {
                this.logger.error(
                    'main',
                    'CLUSTER-WORKER-ERROR',
                    `Worker task crash: ${error instanceof Error ? error.message : String(error)}`
                )

                await flushAllWebhooks()
                process.exit(1)
            }
        })
    }

    private async runTasks(accounts: Account[], runStartTime: number): Promise<AccountStats[]> {
        const accountStats: AccountStats[] = []

        for (const account of accounts) {
            const accountStartTime = Date.now()
            const accountEmail = account.email
            this.userData.userName = this.utils.getEmailUsername(accountEmail)
            this.userData.timezoneOffset = String(new Date().getTimezoneOffset())
            this.userData.langCode = account.langCode ?? 'en'

            try {
                this.logger.info(
                    'main',
                    'ACCOUNT-START',
                    `Starting account: ${accountEmail} | geoLocale: ${account.geoLocale}`
                )

                this.http = new HttpClient(account.proxy)

                const result: { initialPoints: number; collectedPoints: number } | undefined = await this.Main(
                    account
                ).catch(error => {
                    void this.logger.error(
                        true,
                        'FLOW',
                        `Mobile flow failed for ${accountEmail}: ${error instanceof Error ? error.message : String(error)}`
                    )
                    return undefined
                })

                const durationSeconds = ((Date.now() - accountStartTime) / 1000).toFixed(1)

                if (result) {
                    const collectedPoints = result.collectedPoints ?? 0
                    const accountInitialPoints = result.initialPoints ?? 0
                    const accountFinalPoints = accountInitialPoints + collectedPoints

                    accountStats.push({
                        email: accountEmail,
                        initialPoints: accountInitialPoints,
                        finalPoints: accountFinalPoints,
                        collectedPoints: collectedPoints,
                        duration: parseFloat(durationSeconds),
                        success: true
                    })

                    this.logger.info(
                        'main',
                        'ACCOUNT-END',
                        `Completed account: ${accountEmail} | Total: +${collectedPoints} | Old: ${accountInitialPoints} → New: ${accountFinalPoints} | Duration: ${durationSeconds}s`,
                        'green'
                    )
                } else {
                    accountStats.push({
                        email: accountEmail,
                        initialPoints: 0,
                        finalPoints: 0,
                        collectedPoints: 0,
                        duration: parseFloat(durationSeconds),
                        success: false,
                        error: 'Flow failed'
                    })
                }
            } catch (error) {
                const durationSeconds = ((Date.now() - accountStartTime) / 1000).toFixed(1)
                this.logger.error(
                    'main',
                    'ACCOUNT-ERROR',
                    `${accountEmail}: ${error instanceof Error ? error.message : String(error)}`
                )

                accountStats.push({
                    email: accountEmail,
                    initialPoints: 0,
                    finalPoints: 0,
                    collectedPoints: 0,
                    duration: parseFloat(durationSeconds),
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                })
            }
        }

        if (this.config.clusters <= 1 && cluster.isPrimary) {
            const totalCollectedPoints = accountStats.reduce((sum, s) => sum + s.collectedPoints, 0)
            const totalInitialPoints = accountStats.reduce((sum, s) => sum + s.initialPoints, 0)
            const totalFinalPoints = accountStats.reduce((sum, s) => sum + s.finalPoints, 0)
            const totalDurationMinutes = ((Date.now() - runStartTime) / 1000 / 60).toFixed(1)

            this.logger.info(
                'main',
                'RUN-END',
                `Completed all accounts | Accounts processed: ${accountStats.length} | Total points collected: +${totalCollectedPoints} | Old total: ${totalInitialPoints} → New total: ${totalFinalPoints} | Total runtime: ${totalDurationMinutes}min`,
                'green'
            )

            await flushAllWebhooks()
            process.exit(0)
        }

        return accountStats
    }

    async createDesktopSession(account: Account): Promise<BrowserSession> {
        const session = await this.browserFactory.createBrowser(account)
        this.mainDesktopPage = await session.context.newPage()
        this.fingerprintDesktop = session.fingerprint

        this.logger.info(this.isMobile, 'BROWSER', `Desktop Browser started | ${account.email}`)

        await this.login.login(this.mainDesktopPage, account)
        this.cookies.desktop = await session.context.cookies()

        return session
    }

    async Main(account: Account): Promise<{ initialPoints: number; collectedPoints: number }> {
        const accountEmail = account.email
        this.currentAccountEmail = accountEmail
        this.logger.info('main', 'FLOW', `Starting session for ${accountEmail}`)

        let mobileSession: BrowserSession | null = null
        let mobileContextClosed = false

        try {
            return await executionContext.run({ isMobile: true, account }, async () => {
                mobileSession = await this.browserFactory.createBrowser(account)
                const initialContext: BrowserContext = mobileSession.context
                this.mainMobilePage = await initialContext.newPage()

                this.logger.info('main', 'BROWSER', `Mobile Browser started | ${accountEmail}`)

                await this.login.login(this.mainMobilePage, account)

                try {
                    this.accessToken = await this.login.getAppAccessToken(this.mainMobilePage, accountEmail)
                } catch (error) {
                    this.logger.error(
                        'main',
                        'FLOW',
                        `Failed to get mobile access token: ${error instanceof Error ? error.message : String(error)}`
                    )
                }

                this.cookies.mobile = await initialContext.cookies()
                this.fingerprintMobile = mobileSession.fingerprint

                // Pace the post-login dashboard reads — Microsoft returns intermittent
                // throttling-404s on /api/getuserinfo when requests arrive in rapid succession
                await this.utils.wait(1000)

                const data: DashboardData = await this.browser.func.getDashboardData(undefined, this.mainMobilePage)

                // The app access token can be unavailable (empty token => 401 on dapi/me).
                // App activities are optional, so a failure here must not abort the account run.
                let appData: AppDashboardData | null = null
                let appEarnable: AppEarnablePoints | null = null
                try {
                    appData = await this.browser.func.getAppDashboardData()
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error)
                    this.logger.warn(
                        'main',
                        'LOGIN-APP',
                        `App dashboard unavailable - app activities will be skipped this run | message=${msg}`
                    )
                }

                this.userData.geoLocale =
                    account.geoLocale === 'auto'
                        ? data.dashboard.userProfile.attributes.country
                        : account.geoLocale.toLowerCase()
                if (this.userData.geoLocale.length > 2) {
                    this.logger.warn(
                        'main',
                        'GEO-LOCALE',
                        `The provided geoLocale is longer than 2 (${this.userData.geoLocale} | auto=${account.geoLocale === 'auto'}), this is likely invalid and can cause errors!`
                    )
                }

                this.userData.initialPoints = data.dashboard.userStatus.availablePoints
                this.userData.currentPoints = data.dashboard.userStatus.availablePoints
                const initialPoints = this.userData.initialPoints ?? 0

                const browserEarnable = await this.browser.func.getBrowserEarnablePoints(this.mainMobilePage)
                // Only attempt this when the app dashboard succeeded: a failure there means the
                // token is unusable, so a second doomed request would just add noise. Still
                // caught independently because one channel can succeed where the other fails.
                if (appData) {
                    try {
                        appEarnable = await this.browser.func.getAppEarnablePoints()
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : String(error)
                        this.logger.warn(
                            'main',
                            'LOGIN-APP',
                            `App earnable points unavailable - continuing without app estimate | message=${msg}`
                        )
                    }
                }

                const pointsCanCollect = browserEarnable.mobileSearchPoints + (appEarnable?.totalEarnablePoints ?? 0)

                this.logger.info(
                    'main',
                    'POINTS',
                    `Earnable today | Mobile: ${pointsCanCollect} | Browser: ${
                        browserEarnable.mobileSearchPoints
                    } | App: ${appEarnable?.totalEarnablePoints ?? 0} | ${accountEmail} | locale: ${this.userData.geoLocale}`
                )

                // Track points per category
                let currentBalance = initialPoints
                let appPromoPoints = 0, dailySetPoints = 0, specialPromoPoints = 0, morePromoPoints = 0
                let dailyCheckInPoints = 0, readToEarnPoints = 0, punchCardPoints = 0

                const checkBalance = async (): Promise<number> => {
                    try {
                        const p = await this.browser.func.getCurrentPoints()
                        const diff = p - currentBalance
                        currentBalance = p
                        return diff
                    } catch { return 0 }
                }

                if (this.config.disableStreakProtection && this.config.ensureStreakProtection) {
                    console.log('⚠️ Both ensureStreakProtection and disableStreakProtection are enabled — disable wins.')
                }
                if (this.config.disableStreakProtection) {
                    await this.activities.doDisableStreakProtection(data)
                } else if (this.config.ensureStreakProtection) {
                    await this.activities.doEnsureStreakProtection(data)
                }
                if (this.config.workers.doDailySet) { await this.workers.doDailySet(data); dailySetPoints = await checkBalance() }
                if (this.config.workers.doActivateSearchPerk) await this.activities.doActivateSearchPerk(data)
                if (this.config.workers.doMorePromotions) { await this.workers.doMorePromotions(data); morePromoPoints = await checkBalance() }
                if (this.config.workers.doDailyCheckIn) { await this.activities.doDailyCheckIn(); dailyCheckInPoints = await checkBalance() }
                if (this.config.workers.doAppPromotions && appData) { await this.workers.doAppPromotions(appData); appPromoPoints = await checkBalance() }
                if (this.config.workers.doReadToEarn) { await this.activities.doReadToEarn(); readToEarnPoints = await checkBalance() }
                if (this.config.workers.doPunchCards) { await this.punchcardManager.run(account, data); punchCardPoints = await checkBalance() }

                let mobilePoints = 0, desktopPoints = 0
                if (this.config.workers.doMobileSearch || this.config.workers.doDesktopSearch) {
                    const searchResult = await this.searchManager.doSearches(account)
                    mobilePoints = searchResult.mobilePoints
                    desktopPoints = searchResult.desktopPoints
                }
                currentBalance += (mobilePoints + desktopPoints)

                // Bonus farming is its own pass that runs AFTER the normal searches
                if (this.config.workers.doBonusSearches) {
                    await this.searchManager.doBonusSearches(account)
                }

                // Do this last due to random bonus points from searching
                if (this.config.workers.doClaimBonusPoints) { await this.workers.doClaimBonusPoints(data); specialPromoPoints = await checkBalance() }

                // Visual Search streak
                try {
                    this.logger.info('main', 'VISUAL-SEARCH', 'Starting Visual Search...')
                    await this.activities.doVisualSearch(this.mainMobilePage)
                } catch (vsError) {
                    this.logger.warn('main', 'VISUAL-SEARCH', `Visual Search failed: ${vsError instanceof Error ? vsError.message : String(vsError)}`)
                }

                this.cookies.mobile = await initialContext.cookies()
                this.isSessionActive = true

                // Fetch raw API data and referral data for reporting
                const cookieString = this.cookies.mobile.map(c => `${c.name}=${c.value}`).join('; ')
                const [rawUserInfo, referralData] = await Promise.all([
                    this.reportManager.saveRawUserInfo(accountEmail, cookieString),
                    this.reportManager.fetchReferralData(cookieString)
                ])

                // Get run IP
                let runIp = 'Unknown'
                try {
                    const ipRes = await this.http.request({ url: 'https://api.ipify.org?format=json' }) as any
                    if (ipRes.data?.ip) runIp = ipRes.data.ip
                } catch {
                    this.logger.warn('main', 'IP', 'Failed to fetch run IP')
                }

                // Collect redemption links for recent Shipped orders (browser must still be open)
                if (this.config.fetchOrderLinks) {
                    await this.activities.doFetchOrderLinks(accountEmail, this.mainMobilePage)
                }

                // Read final points + report data BEFORE closing the browser so the in-page
                // dashboard fetch (which the external HTTP client cannot do reliably) is used.
                const finalPoints = await this.browser.func.getCurrentPoints()

                // Refresh dashboard data for final report (browser still open)
                let finalDashData: DashboardData | null = null
                let finalAppData: AppDashboardData | null = null
                let appUserData: AppUserData | null = null
                let panelData: PanelFlyoutData | null = null
                try {
                    finalDashData = await this.browser.func.getDashboardData(undefined, this.mainMobilePage)
                } catch {
                    this.logger.warn('main', 'REPORT', 'Failed to refresh dashboard data for report')
                }
                // Each source is independent: the app dashboard is token-based while the
                // flyout is cookie-based, so one failing must not discard the other.
                try {
                    finalAppData = await this.browser.func.getAppDashboardData()
                } catch {
                    this.logger.warn('main', 'REPORT', 'Failed to refresh app dashboard data for report')
                }
                try {
                    appUserData = await this.browser.func.getAppUserData()
                } catch {
                    this.logger.warn('main', 'REPORT', 'Failed to refresh app user data for report')
                }
                try {
                    panelData = await this.browser.func.getPanelFlyoutData()
                } catch {
                    this.logger.warn('main', 'REPORT', 'Failed to refresh panel flyout data for report')
                }

                await this.browser.func.closeBrowser(initialContext, accountEmail)
                mobileContextClosed = true

                const collectedPoints = finalPoints - initialPoints

                this.logger.info('main', 'FLOW', `Collected: +${collectedPoints} | ${accountEmail}`)

                // Generate report
                if (finalDashData) {
                    const knownPoints = mobilePoints + desktopPoints + appPromoPoints + dailySetPoints + specialPromoPoints + morePromoPoints + dailyCheckInPoints + readToEarnPoints + punchCardPoints
                    const unknownPoints = collectedPoints - knownPoints

                    await this.reportManager.writeDailyReport({
                        email: accountEmail,
                        initialPoints,
                        finalPoints,
                        collectedPoints,
                        breakdown: {
                            pcSearch: desktopPoints,
                            mobileSearch: mobilePoints,
                            appPromotions: appPromoPoints,
                            dailySet: dailySetPoints,
                            specialPromotions: specialPromoPoints,
                            morePromotions: morePromoPoints,
                            dailyCheckIn: dailyCheckInPoints,
                            readToEarn: readToEarnPoints,
                            punchCards: punchCardPoints,
                            unknown: unknownPoints > 0 ? unknownPoints : 0
                        },
                        finalDashData,
                        finalAppData: finalAppData ?? ({} as AppDashboardData),
                        appUserData,
                        panelData,
                        rawUserInfo,
                        referralData,
                        runIp
                    })
                }

                this.isSessionActive = false

                return {
                    initialPoints,
                    collectedPoints: collectedPoints || 0
                }
            })
        } finally {
            this.isSessionActive = false
            if (mobileSession && !mobileContextClosed) {
                try {
                    await executionContext.run({ isMobile: true, account }, async () => {
                        await this.browser.func.closeBrowser(mobileSession!.context, accountEmail)
                    })
                } catch (error) {
                    this.logger.debug(
                        'main',
                        'CLEANUP',
                        `Mobile context close failed | ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }
        }
    }
}

export { executionContext }

async function main(): Promise<void> {
    checkNodeVersion()
    const rewardsBot = new MicrosoftRewardsBot()

    process.on('beforeExit', () => {
        void flushAllWebhooks()
    })
    process.on('SIGINT', async () => {
        rewardsBot.logger.warn('main', 'PROCESS', 'SIGINT received! Intercepting shutdown to save points...')

        if (rewardsBot.currentAccountEmail && rewardsBot.isSessionActive && rewardsBot.browser?.func) {
            try {
                rewardsBot.logger.info('main', 'PROCESS', `Checking final points for ${rewardsBot.currentAccountEmail}...`)
                const currentBalance = await rewardsBot.browser.func.getCurrentPoints()
                const initialPoints = rewardsBot.userData.initialPoints
                rewardsBot.reportManager.emergencySave(rewardsBot.currentAccountEmail, initialPoints, currentBalance)
            } catch {
                rewardsBot.logger.warn('main', 'PROCESS', 'Browser closed early. Skipping emergency save.')
            }
        }

        await flushAllWebhooks()
        process.exit(130)
    })
    process.on('SIGTERM', async () => {
        rewardsBot.logger.warn('main', 'PROCESS', 'SIGTERM received, flushing and exiting...')
        await flushAllWebhooks()
        process.exit(143)
    })
    process.on('uncaughtException', async error => {
        if (isBrowserClosedError(error)) {
            rewardsBot.logger.debug(
                'main',
                'UNCAUGHT-EXCEPTION',
                `Ignoring benign browser-closed error during teardown | ${error instanceof Error ? error.message : String(error)}`
            )
            return
        }
        rewardsBot.logger.error('main', 'UNCAUGHT-EXCEPTION', error)
        await flushAllWebhooks()
        process.exit(1)
    })
    process.on('unhandledRejection', async reason => {
        if (isBrowserClosedError(reason)) {
            rewardsBot.logger.debug(
                'main',
                'UNHANDLED-REJECTION',
                `Ignoring benign browser-closed rejection during teardown | ${reason instanceof Error ? reason.message : String(reason)}`
            )
            return
        }
        rewardsBot.logger.error('main', 'UNHANDLED-REJECTION', reason as Error)
        await flushAllWebhooks()
        process.exit(1)
    })

    try {
        await rewardsBot.initialize()
        await rewardsBot.run()
    } catch (error) {
        rewardsBot.logger.error('main', 'MAIN-ERROR', error as Error)
    }
}

main().catch(async error => {
    const tmpBot = new MicrosoftRewardsBot()
    tmpBot.logger.error('main', 'MAIN-ERROR', error as Error)
    await flushAllWebhooks()
    process.exit(1)
})
