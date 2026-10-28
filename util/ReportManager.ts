import fs from 'fs'
import path from 'path'
import type { MicrosoftRewardsBot } from '../index'
import type { DashboardData } from '../interface/DashboardData'
import type { AppDashboardData } from '../interface/AppDashBoardData'
import type { AppUserData } from '../interface/AppUserData'
import type { PanelFlyoutData } from '../interface/PanelFlyoutData'

export interface PointsBreakdown {
    pcSearch: number
    mobileSearch: number
    appPromotions: number
    dailySet: number
    specialPromotions: number
    morePromotions: number
    dailyCheckIn: number
    readToEarn: number
    punchCards: number
    unknown: number
}

export interface AccountInfo {
    level: string
    levelProgress: string
    puzzlePieces: string
    referralData: unknown
    createdDate: string | Date
    lifetimePoints: number
    lifetimeRedeemed: number
    currentStreak: number
    bingSearchStreak: number
    dailySetStreak: number
    bingAppStreak: number
    visualSearchStreak: number
    edgeBrowsingStreak: number
    edgeOnboarding10Days: number
    bingPoints: number[]
    dailySetPoint: number[]
    edgePoints: number[]
    sapphirePoints: number[]
    visualSearchPoints: number[]
    bingSearchInfo: { completed: boolean; totalSteps: number }
    dailySetInfo: { completed: boolean; totalSteps: number }
    sapphireInfo: { completed: boolean; totalSteps: number }
    visualSearchInfo: { enabled: boolean; completed: boolean; totalSteps: number }
    bonuses: {
        goodUser: { max: number; progress: number; state: string }
        monthlyDse: { max: number; state: string }
        monthlyLevel: { max: number; state: string }
        gamificationStreak: { name: string; progress: number; max: number; earned: number }
        gamificationStreak10: { name: string; progress: number; max: number; earned: number }
    }
    streakProtection: { enabled: boolean; daysRemaining: number }
    giveModeOn: boolean
    lifetimeDonations: number
    goal: unknown
    referrals: { count: number; pointsClaimed: number }
    irisSegmentation: string
    lastOrderStatus: string
    orderHistory: unknown[]
    pointsSummary: unknown[]
}

export interface AccountHealth {
    country: string
    runIp: string
    botScore: string
    botScoreUpd: string | Date
    warnings: unknown[]
    unusualActivityFlag: boolean
    disableBotRedemptions: boolean
    autoRedeemEligible: boolean
    oneClickRedemptionEligible: boolean
    hasBotWarning: boolean
    isBanned?: boolean
}

export interface DailyReportEntry {
    date: string
    lastUpdated: string
    hasBotWarning: boolean
    accountInfo: AccountInfo
    accountHealth: AccountHealth
    initialPoints: number
    finalPoints: number
    collectedPoints: number
    coupons: unknown[]
    discountAmount: number
    autoRedeemItem: string | null
    pointsBreakdown: PointsBreakdown
}

function todayStr(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export class ReportManager {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    private reportsDir(): string {
        return path.join(__dirname, '../../reports/emails')
    }

    private accountFolder(email: string): string {
        return path.join(this.reportsDir(), email)
    }

    private dailyReportPath(email: string): string {
        return path.join(this.accountFolder(email), `${todayStr()}.json`)
    }

    private userInfoDir(email: string): string {
        return path.join(this.reportsDir(), 'userinfo', email)
    }

    private ensureDir(dir: string): void {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    }

    private readJson<T>(filePath: string): T | null {
        if (!fs.existsSync(filePath)) return null
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
        } catch {
            return null
        }
    }

    private writeJson(filePath: string, data: unknown): void {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
    }

    markSuspended(email: string): void {
        try {
            const dateStr = todayStr()
            const folder = this.accountFolder(email)
            this.ensureDir(folder)

            const reportPath = path.join(folder, `${dateStr}.json`)
            const entry: any = this.readJson(reportPath) ?? {
                date: dateStr,
                collectedPoints: 0,
                pointsBreakdown: {},
                accountInfo: {},
                accountHealth: {}
            }

            entry.accountHealth = entry.accountHealth ?? {}
            entry.accountHealth.disableBotRedemptions = true
            entry.accountHealth.unusualActivityFlag = true
            entry.accountHealth.isBanned = true

            const banMsg = 'ACCOUNT SUSPENDED BY MICROSOFT'
            entry.accountHealth.warnings = entry.accountHealth.warnings ?? []
            if (!entry.accountHealth.warnings.includes(banMsg)) {
                entry.accountHealth.warnings.push(banMsg)
            }

            entry.lastUpdated = new Date().toISOString()
            this.writeJson(reportPath, entry)

            this.bot.logger.info('main', 'REPORT', `Recorded suspension in reports/${email}/${dateStr}.json`)
        } catch (err) {
            this.bot.logger.error('main', 'REPORT', `Failed to write suspension report: ${err}`)
        }
    }

    async saveRawUserInfo(email: string, cookieString: string): Promise<unknown> {
        try {
            const apiResponse = await this.bot.http.request({
                url: 'https://rewards.bing.com/api/getuserinfo',
                method: 'GET',
                headers: {
                    Cookie: cookieString,
                    'User-Agent': this.bot.fingerprint?.fingerprint.navigator.userAgent,
                    Accept: 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9',
                    Referer: 'https://rewards.bing.com/'
                }
            })

            if (apiResponse.data) {
                const dir = this.userInfoDir(email)
                this.ensureDir(dir)
                const filePath = path.join(dir, `${todayStr()}.json`)
                this.writeJson(filePath, apiResponse.data)
                this.bot.logger.info('main', 'REPORT', `Saved raw API userinfo to reports/userinfo/${email}/${todayStr()}.json`)
                return apiResponse.data
            }
        } catch (err) {
            this.bot.logger.warn('main', 'REPORT', `Failed to fetch/save raw userinfo: ${err instanceof Error ? err.message : String(err)}`)
        }
        return null
    }

    async fetchReferralData(cookieString: string): Promise<unknown> {
        try {
            const refResponse = await this.bot.http.request({
                url: 'https://rewards.bing.com/api/getreferrallink',
                method: 'GET',
                params: {
                    ref: 'rafsrchae',
                    'X-Requested-With': 'XMLHttpRequest',
                    _: String(Date.now())
                },
                headers: {
                    Cookie: cookieString,
                    Referer: 'https://rewards.bing.com/referandearn/',
                    'User-Agent': this.bot.fingerprint?.fingerprint.navigator.userAgent,
                    'Accept-Language': 'en-US,en;q=0.9',
                    Accept: 'application/json'
                }
            })

            const data = refResponse.data ?? null
            this.bot.logger.info('main', 'REPORT', `Captured referral link: ${(data as any)?.referral_link ?? 'N/A'}`)
            return data
        } catch {
            this.bot.logger.warn('main', 'REPORT', 'Could not fetch referral link.')
            return null
        }
    }

    async writeDailyReport(opts: {
        email: string
        initialPoints: number
        finalPoints: number
        collectedPoints: number
        breakdown: PointsBreakdown
        finalDashData: DashboardData
        finalAppData: AppDashboardData
        appUserData: AppUserData | null
        panelData: PanelFlyoutData | null
        rawUserInfo: unknown
        referralData: unknown
        runIp: string
    }): Promise<void> {
        const {
            email, initialPoints, finalPoints, collectedPoints,
            breakdown, finalDashData, finalAppData, appUserData,
            panelData, rawUserInfo, referralData, runIp
        } = opts

        const dash = finalDashData.dashboard

        const coupons: unknown[] = dash.coupons ?? []
        const discountAmount: number = dash.autoRedeemItem?.couponDiscount ?? 0
        const autoRedeemItem: string | null = dash.autoRedeemItem?.name ?? null

        const activeLevel: string = dash.userStatus?.levelInfo?.activeLevelName ?? 'Unknown'
        const levelProgress: number = dash.userStatus?.levelInfo?.progress ?? 0
        const levelProgressMax: number = dash.userStatus?.levelInfo?.progressMax ?? 0

        const accountCreationDate: string | Date = dash.userProfile?.attributes?.created ?? 'Unknown'
        const lifetimePoints: number = dash.userStatus?.lifetimePoints ?? 0
        const lifetimeRedeemed: number = dash.userStatus?.lifetimePointsRedeemed ?? 0
        const lifetimeGivingPoints: number = dash.userStatus?.lifetimeGivingPoints ?? 0
        const giveModeOn: boolean = dash.userStatus?.isGiveModeOn ?? false

        let puzzlePiecesAmount = '0'
        try {
            const statusString = JSON.stringify(dash.userStatus ?? {})
            const m = statusString.match(/"hva_puzzle_pieces_completed_amount"\s*:\s*"?(\d+)"?/i)
                ?? statusString.match(/"hvaPuzzlePiecesCompletedAmount"\s*:\s*"?(\d+)"?/i)
            if (m?.[1]) puzzlePiecesAmount = m[1]
        } catch { /* keep '0' */ }

        const redeemGoal = dash.userStatus?.redeemGoal
            ? { title: dash.userStatus.redeemGoal.title, price: dash.userStatus.redeemGoal.price }
            : null

        const currentStreak: number =
            dash.streakPromotion?.activityProgress
            ?? dash.userStatus?.levelInfo?.levelUpActivityDailySetStreakDays
            ?? 0

        // streaks from panel flyout data (has partner_* fields that Dashboard API doesn't)
        let streakAttr: Record<string, string> = {}

        if (panelData?.userInfo?.promotions) {
            const streakPromo = panelData.userInfo.promotions.find(
                (p: any) => p.attributes?.partner_bing_currentStep !== undefined
            )
            if (streakPromo?.attributes) {
                streakAttr = streakPromo.attributes as unknown as Record<string, string>
            }
        }

        const bingSearchStreak: number = streakAttr.partner_bing_currentStep ? parseInt(streakAttr.partner_bing_currentStep) : 0
        const dailySetStreak: number = streakAttr.partner_dset_currentStep ? parseInt(streakAttr.partner_dset_currentStep) : 0
        const bingAppStreak: number = streakAttr.partner_sapphire_currentStep ? parseInt(streakAttr.partner_sapphire_currentStep) : 0
        const edgeBrowsingStreak: number = streakAttr.partner_edge_currentStep ? parseInt(streakAttr.partner_edge_currentStep) : 0
        const visualSearchStreak: number = streakAttr.partner_visualsearch_currentStep ? parseInt(streakAttr.partner_visualsearch_currentStep) : 0

        // point arrays + task completions
        let bingPoints: number[] = [], dailySetPoint: number[] = [], edgePoints: number[] = []
        let sapphirePoints: number[] = [], visualSearchPoints: number[] = []
        let bingSearchCompleted = false, bingSearchTotalSteps = 0
        let dailySetCompleted = false, dailySetTotalSteps = 0
        let sapphireCompleted = false, sapphireTotalSteps = 0
        let visualSearchCompleted = false, visualSearchTotalSteps = 0, visualSearchEnabled = false

        try {
            if (streakAttr.partner_bing_points) bingPoints = JSON.parse(streakAttr.partner_bing_points)
            if (streakAttr.partner_bing_completed) bingSearchCompleted = streakAttr.partner_bing_completed === 'True'
            if (streakAttr.partner_bing_totalSteps) bingSearchTotalSteps = parseInt(streakAttr.partner_bing_totalSteps)
            if (streakAttr.partner_dset_points) dailySetPoint = JSON.parse(streakAttr.partner_dset_points)
            if (streakAttr.partner_dset_completed) dailySetCompleted = streakAttr.partner_dset_completed === 'True'
            if (streakAttr.partner_dset_totalSteps) dailySetTotalSteps = parseInt(streakAttr.partner_dset_totalSteps)
            if (streakAttr.partner_edge_points) edgePoints = JSON.parse(streakAttr.partner_edge_points)
            if (streakAttr.partner_sapphire_points) sapphirePoints = JSON.parse(streakAttr.partner_sapphire_points)
            if (streakAttr.partner_sapphire_completed) sapphireCompleted = streakAttr.partner_sapphire_completed === 'True'
            if (streakAttr.partner_sapphire_totalSteps) sapphireTotalSteps = parseInt(streakAttr.partner_sapphire_totalSteps)
            if (streakAttr.partner_visualsearch_isEnabled) visualSearchEnabled = streakAttr.partner_visualsearch_isEnabled === 'True'
            if (visualSearchEnabled && streakAttr.partner_visualsearch_points) visualSearchPoints = JSON.parse(streakAttr.partner_visualsearch_points)
            if (streakAttr.partner_visualsearch_completed) visualSearchCompleted = streakAttr.partner_visualsearch_completed === 'True'
            if (streakAttr.partner_visualsearch_totalSteps) visualSearchTotalSteps = parseInt(streakAttr.partner_visualsearch_totalSteps)
        } catch (e) {
            this.bot.logger.warn('main', 'REPORT', `Failed to parse streak points arrays: ${e}`)
        }

        // 10-day edge onboarding from panel flyout data
        let edgeOnboarding10Days = 0
        if (panelData?.flyoutResult?.onboardingChecklistPromotions) {
            const edgePromo = (panelData.flyoutResult.onboardingChecklistPromotions as any[]).find(
                (p: any) => p.offerId === 'BingFlyout_Onboarding_Checklist_BingEdgeSearchOffer'
            )
            edgeOnboarding10Days = edgePromo?.activityProgress ?? 0
        }

        // streak protection
        const streakProtectionOn: boolean = dash.streakProtectionPromo?.streakProtectionStatus === 'True'
        const streakProtectionDays: number = parseInt(dash.streakProtectionPromo?.remainingDays ?? '0')

        // referrals
        let referralCount = 0, referralPointsClaimed = 0, unusualActivityFlag = false
        if (dash.referAndEarnPromotion?.attributes) {
            const refAttrs = dash.referAndEarnPromotion.attributes
            referralCount = parseInt(refAttrs.firstLayerRefereeCount ?? '0')
            referralPointsClaimed = parseInt(refAttrs.totalClaimedPoints ?? '0')
            unusualActivityFlag = refAttrs.showUnusualActivityBanner === 'True'
        }

        // health fields
        const botScore: string = dash.userProfile?.attributes?.serpbotscore ?? 'Unknown'
        const botScoreUpd: string | Date = dash.userProfile?.attributes?.serpbotscore_upd ?? 'Unknown'
        const accountCountry: string = dash.userProfile?.attributes?.country ?? 'Unknown'
        const isAutoRedeemEligible: boolean = dash.isAutoRedeemEligible ?? false
        const oneClickRedemption: boolean = dash.userStatus?.isUserEligibleForOneClickRedemption ?? false
        const userWarnings: unknown[] = dash.userWarnings ?? []
        const hasBotWarning: boolean = dash.userStatus?.hasBotWarning ?? false
        const irisSegmentation: string = dash.userProfile?.attributes?.iris_segmentation ?? 'Unknown'

        // orders + disableBotRedemptions
        let disableBotRedemptions = false
        let lastOrderStatus = 'None'
        let orderHistory: unknown[] = []

        // disableBotRedemptions from AppUserData (SAAndroid channel)
        if (appUserData?.response) {
            const goalAttrs = appUserData.response.goal_item?.attributes
            if (goalAttrs) {
                disableBotRedemptions = goalAttrs.disable_bot_redemptions === 'true' || goalAttrs.disable_bot_redemptions === 'True'
            }
        }

        // orders from AppDashboardData (SAAndroid channel)
        if (finalAppData?.response) {
            const orders = finalAppData.response.orders as any[]
            if (orders && orders.length > 0) {
                lastOrderStatus = orders[0].s ?? 'Unknown'
                orderHistory = orders.map((o: any) => ({
                    id: o.id,
                    date: o.t,
                    title: o.item_snapshot?.name ?? 'Unknown Item',
                    points: o.p,
                    status: o.s
                }))
            }
        }

        // pointsSummary
        const pointsSummaryData: unknown[] = (rawUserInfo as any)?.status?.pointsSummary
            ?? finalDashData.status?.pointsSummary
            ?? []

        // bonuses from panel flyout data
        let goodUserBonusMax = 0, goodUserBonusProgress = 0, goodUserBonusState = 'Unknown'
        let monthlyDseBonusMax = 0, monthlyDseBonusState = 'Unknown'
        let monthlyLevelBonusMax = 0, monthlyLevelBonusState = 'Unknown'
        let gamificationStreakName = 'None', gamificationStreakProgress = 0, gamificationStreakMax = 0, gamificationStreakEarned = 0
        let gamificationStreakName10 = 'None', gamificationStreakProgress10 = 0, gamificationStreakMax10 = 0, gamificationStreakEarned10 = 0

        if (panelData?.userInfo?.promotions) {
            // Find level_info promotion for program restructure bonuses
            const levelInfoPromo = panelData.userInfo.promotions.find((p: any) => p.name === 'level_info')
            if (levelInfoPromo?.attributes) {
                const lAttr = levelInfoPromo.attributes as any
                if (lAttr.program_restructure_good_user_bonus_max) goodUserBonusMax = parseInt(lAttr.program_restructure_good_user_bonus_max)
                if (lAttr.program_restructure_good_user_bonus_progress) goodUserBonusProgress = parseInt(lAttr.program_restructure_good_user_bonus_progress)
                if (lAttr.program_restructure_good_user_bonus_state) goodUserBonusState = lAttr.program_restructure_good_user_bonus_state
                if (lAttr.program_restructure_monthly_dse_bonus_max) monthlyDseBonusMax = parseInt(lAttr.program_restructure_monthly_dse_bonus_max)
                if (lAttr.program_restructure_monthly_dse_bonus_state) monthlyDseBonusState = lAttr.program_restructure_monthly_dse_bonus_state
                if (lAttr.program_restructure_monthly_level_bonus_max) monthlyLevelBonusMax = parseInt(lAttr.program_restructure_monthly_level_bonus_max)
                if (lAttr.program_restructure_monthly_level_bonus_state) monthlyLevelBonusState = lAttr.program_restructure_monthly_level_bonus_state
            }

            // Find Gamification streak bonus (dynamically catches 3Days, 8Days, etc.)
            const gamificationPromo = panelData.userInfo.promotions.find(
                (p: any) => p.name?.startsWith('Gamification_Streak_Bonus_Promotion')
                    && !p.name?.startsWith('Gamification_Streak_Bonus_Promotion_Every10Days')
            )
            if (gamificationPromo?.attributes) {
                gamificationStreakName = gamificationPromo.name ?? 'None'
                const g = gamificationPromo.attributes as any
                if (g.activity_progress) gamificationStreakProgress = parseInt(g.activity_progress)
                if (g.activity_max) gamificationStreakMax = parseInt(g.activity_max)
                if (g.bonus_earned) gamificationStreakEarned = parseInt(g.bonus_earned)
            }

            // Find Gamification streak bonus (Every10Days)
            const gamificationPromo10 = panelData.userInfo.promotions.find(
                (p: any) => p.name?.startsWith('Gamification_Streak_Bonus_Promotion_Every10Days')
            )
            if (gamificationPromo10?.attributes) {
                gamificationStreakName10 = gamificationPromo10.name ?? 'None'
                const g10 = gamificationPromo10.attributes as any
                if (g10.activity_progress) gamificationStreakProgress10 = parseInt(g10.activity_progress)
                if (g10.activity_max) gamificationStreakMax10 = parseInt(g10.activity_max)
                if (g10.bonus_earned) gamificationStreakEarned10 = parseInt(g10.bonus_earned)
            }
        }

        // build structured objects
        const newAccountInfo: AccountInfo = {
            level: activeLevel,
            levelProgress: `${levelProgress} / ${levelProgressMax}`,
            puzzlePieces: puzzlePiecesAmount,
            referralData,
            createdDate: accountCreationDate,
            lifetimePoints,
            lifetimeRedeemed,
            currentStreak,
            bingSearchStreak,
            dailySetStreak,
            bingAppStreak,
            visualSearchStreak,
            edgeBrowsingStreak,
            edgeOnboarding10Days,
            bingPoints,
            dailySetPoint,
            edgePoints,
            sapphirePoints,
            visualSearchPoints,
            bingSearchInfo: { completed: bingSearchCompleted, totalSteps: bingSearchTotalSteps },
            dailySetInfo: { completed: dailySetCompleted, totalSteps: dailySetTotalSteps },
            sapphireInfo: { completed: sapphireCompleted, totalSteps: sapphireTotalSteps },
            visualSearchInfo: { enabled: visualSearchEnabled, completed: visualSearchCompleted, totalSteps: visualSearchTotalSteps },
            bonuses: {
                goodUser: { max: goodUserBonusMax, progress: goodUserBonusProgress, state: goodUserBonusState },
                monthlyDse: { max: monthlyDseBonusMax, state: monthlyDseBonusState },
                monthlyLevel: { max: monthlyLevelBonusMax, state: monthlyLevelBonusState },
                gamificationStreak: { name: gamificationStreakName, progress: gamificationStreakProgress, max: gamificationStreakMax, earned: gamificationStreakEarned },
                gamificationStreak10: { name: gamificationStreakName10, progress: gamificationStreakProgress10, max: gamificationStreakMax10, earned: gamificationStreakEarned10 }
            },
            streakProtection: { enabled: streakProtectionOn, daysRemaining: streakProtectionDays },
            giveModeOn,
            lifetimeDonations: lifetimeGivingPoints,
            goal: redeemGoal,
            referrals: { count: referralCount, pointsClaimed: referralPointsClaimed },
            irisSegmentation,
            lastOrderStatus,
            orderHistory,
            pointsSummary: pointsSummaryData
        }

        const newAccountHealth: AccountHealth = {
            country: accountCountry,
            runIp,
            botScore,
            botScoreUpd,
            warnings: userWarnings,
            unusualActivityFlag,
            disableBotRedemptions,
            autoRedeemEligible: isAutoRedeemEligible,
            oneClickRedemptionEligible: oneClickRedemption,
            hasBotWarning
        }

        // write / merge today's report file
        try {
            const folder = this.accountFolder(email)
            this.ensureDir(folder)
            const reportPath = this.dailyReportPath(email)
            const dateStr = todayStr()
            const now = new Date()

            let todayEntry: DailyReportEntry | null = this.readJson<DailyReportEntry>(reportPath)

            if (todayEntry) {
                todayEntry.finalPoints = finalPoints
                todayEntry.collectedPoints += collectedPoints
                todayEntry.hasBotWarning = hasBotWarning
                todayEntry.pointsBreakdown = todayEntry.pointsBreakdown ?? {} as PointsBreakdown
                todayEntry.pointsBreakdown.pcSearch = (todayEntry.pointsBreakdown.pcSearch ?? 0) + breakdown.pcSearch
                todayEntry.pointsBreakdown.mobileSearch = (todayEntry.pointsBreakdown.mobileSearch ?? 0) + breakdown.mobileSearch
                todayEntry.pointsBreakdown.appPromotions = (todayEntry.pointsBreakdown.appPromotions ?? 0) + breakdown.appPromotions
                todayEntry.pointsBreakdown.dailySet = (todayEntry.pointsBreakdown.dailySet ?? 0) + breakdown.dailySet
                todayEntry.pointsBreakdown.specialPromotions = (todayEntry.pointsBreakdown.specialPromotions ?? 0) + breakdown.specialPromotions
                todayEntry.pointsBreakdown.morePromotions = (todayEntry.pointsBreakdown.morePromotions ?? 0) + breakdown.morePromotions
                todayEntry.pointsBreakdown.dailyCheckIn = (todayEntry.pointsBreakdown.dailyCheckIn ?? 0) + breakdown.dailyCheckIn
                todayEntry.pointsBreakdown.readToEarn = (todayEntry.pointsBreakdown.readToEarn ?? 0) + breakdown.readToEarn
                todayEntry.pointsBreakdown.punchCards = (todayEntry.pointsBreakdown.punchCards ?? 0) + breakdown.punchCards
                todayEntry.pointsBreakdown.unknown = (todayEntry.pointsBreakdown.unknown ?? 0) + breakdown.unknown
                todayEntry.coupons = coupons
                todayEntry.discountAmount = discountAmount
                todayEntry.autoRedeemItem = autoRedeemItem
                todayEntry.lastUpdated = now.toISOString()
                todayEntry.accountInfo = newAccountInfo
                todayEntry.accountHealth = newAccountHealth
            } else {
                todayEntry = {
                    date: dateStr,
                    lastUpdated: now.toISOString(),
                    hasBotWarning,
                    accountInfo: newAccountInfo,
                    accountHealth: newAccountHealth,
                    initialPoints,
                    finalPoints,
                    collectedPoints,
                    coupons,
                    discountAmount,
                    autoRedeemItem,
                    pointsBreakdown: { ...breakdown }
                }
            }

            this.writeJson(reportPath, todayEntry)
            this.bot.logger.info('main', 'REPORT', `Updated daily report in reports/${email}/${dateStr}.json`)
        } catch (err) {
            this.bot.logger.error('main', 'REPORT', `Failed to save daily report: ${err}`)
        }
    }

    emergencySave(email: string, initialPoints: number, currentBalance: number): void {
        try {
            if (currentBalance <= initialPoints) {
                this.bot.logger.info('main', 'PROCESS', 'No new points to emergency-save.')
                return
            }

            const collectedPoints = currentBalance - initialPoints
            const dateStr = todayStr()
            const folder = this.accountFolder(email)
            this.ensureDir(folder)
            const reportPath = path.join(folder, `${dateStr}.json`)
            const now = new Date()

            let todayEntry: any = this.readJson(reportPath)

            if (todayEntry) {
                const extraPoints = currentBalance - (todayEntry.finalPoints ?? initialPoints)
                if (extraPoints > 0) {
                    todayEntry.finalPoints = currentBalance
                    todayEntry.collectedPoints += extraPoints
                    todayEntry.pointsBreakdown = todayEntry.pointsBreakdown ?? {}
                    todayEntry.pointsBreakdown.unknown = (todayEntry.pointsBreakdown.unknown ?? 0) + extraPoints
                    todayEntry.lastUpdated = now.toISOString()
                }
            } else {
                todayEntry = {
                    date: dateStr,
                    lastUpdated: now.toISOString(),
                    initialPoints,
                    finalPoints: currentBalance,
                    collectedPoints,
                    pointsBreakdown: { unknown: collectedPoints }
                }
            }

            this.writeJson(reportPath, todayEntry)
            this.bot.logger.info('main', 'PROCESS', `Emergency save complete — rescued +${collectedPoints} points.`)
        } catch (err) {
            this.bot.logger.warn('main', 'PROCESS', `Emergency save failed: ${err}`)
        }
    }
}
