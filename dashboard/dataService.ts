import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const itemMap: Record<string, string> = {
    '000899045004': 'B-Tech E£100 eGift Card',
    '000899045005': 'B-Tech E£200 eGift Card',
    '000899045006': 'B-Tech E£250 eGift Card'
}

const reportsDir = path.join(__dirname, '../../reports/emails')

function createDummyToday(latestDay: any) {
    const d = new Date()
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const dummy = JSON.parse(JSON.stringify(latestDay))
    dummy.date = todayStr
    dummy.collectedPoints = 0
    dummy.apiPointsToday = 0
    dummy.isDummy = true
    dummy.pointsBreakdown = {}
    dummy.completedTasks = []
    dummy.searchQueries = []
    dummy.lastUpdated = null
    let oldStreak = 0
    if (dummy.accountInfo && dummy.accountInfo.currentStreak !== undefined) {
        oldStreak = parseInt(dummy.accountInfo.currentStreak) || 0
    }
    if (!dummy.accountInfo) dummy.accountInfo = {}
    dummy.accountInfo.currentStreak = oldStreak + 1
    return dummy
}

const ramCache: { data: any; lastFetch: number } = {
    data: null,
    lastFetch: 0
}
const CACHE_TTL = 5 * 1000

export function invalidateCache() {
    ramCache.data = null
    ramCache.lastFetch = 0
}

export async function getDashboardData(configDetails: any, configOrder: string[]) {
    if (ramCache.data && Date.now() - ramCache.lastFetch < CACHE_TTL) {
        return ramCache.data
    }

    if (!existsSync(reportsDir)) return { accounts: [], bannedOrders: [], giftCards: [] }

    const entries = await fs.readdir(reportsDir, { withFileTypes: true })
    const folders = entries
        .filter(dirent => dirent.isDirectory() && !['userinfo', 'banned', 'userInfo', '../giftCard'].includes(dirent.name))
        .map(dir => dir.name)

    const accountsData = await Promise.all(folders.map(async (email) => {
        try {
            const accountFolder = path.join(reportsDir, email)
            const filesEntries = await fs.readdir(accountFolder)

            const reportFiles = filesEntries.filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/)).sort()
            if (reportFiles.length === 0) return null

            const latestReportFile = reportFiles[reportFiles.length - 1]!
            const latestReportPath = path.join(accountFolder, latestReportFile)
            const summaryPath = path.join(accountFolder, '_dashboard_summary.json')

            let parsedSummary: any = null

            if (existsSync(summaryPath)) {
                const latestStat = await fs.stat(latestReportPath)
                const summaryStat = await fs.stat(summaryPath)

                if (summaryStat.mtimeMs >= latestStat.mtimeMs) {
                    const summaryContent = await fs.readFile(summaryPath, 'utf-8')
                    parsedSummary = JSON.parse(summaryContent)

                    if (parsedSummary.history) {
                        parsedSummary.history = parsedSummary.history.filter((h: any) => h.lastUpdated !== null && !h.isDummy)
                        if (parsedSummary.history.length > 0) {
                            parsedSummary.latest = parsedSummary.history[parsedSummary.history.length - 1]
                        }
                    }

                    parsedSummary.configIndex = configOrder.indexOf(email) !== -1 ? configOrder.indexOf(email) : 9999
                    parsedSummary.jsonIndex = configDetails[email]?.index || ''
                }
            }

            if (!parsedSummary) {
                const recentFiles = reportFiles.slice(-35)
                const historyArray = await Promise.all(recentFiles.map(async (f) => {
                    const fileContent = await fs.readFile(path.join(accountFolder, f), 'utf-8')
                    return JSON.parse(fileContent)
                }))

                historyArray.forEach((dayData: any) => {
                    dayData.apiPointsToday = dayData.collectedPoints || 0
                    delete dayData.searchQueries
                    delete dayData.completedTasks
                })

                const cleanHistory = historyArray.filter((h: any) => h.lastUpdated !== null && !h.isDummy)
                const latestDay = cleanHistory[cleanHistory.length - 1]
                const configIndex = configOrder.indexOf(email)

                parsedSummary = {
                    email: email,
                    jsonIndex: configDetails[email]?.index || '',
                    configIndex: configIndex !== -1 ? configIndex : 9999,
                    latest: latestDay,
                    history: cleanHistory
                }

                await fs.writeFile(summaryPath, JSON.stringify(parsedSummary), 'utf-8')
            }

            const d = new Date()
            const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            let latestDay = parsedSummary.latest

            if (latestDay && latestDay.date !== todayStr) {
                const dummyToday = createDummyToday(latestDay)
                parsedSummary.history.push(dummyToday)
                parsedSummary.latest = dummyToday
            }

            return parsedSummary

        } catch {
            return null
        }
    }))

    let giftCards: any[] = []
    let giftCardStartDate = ''
    try {
        const gcPath = path.join(reportsDir, '../giftCard', 'giftCards.json')
        if (existsSync(gcPath)) {
            giftCards = JSON.parse(await fs.readFile(gcPath, 'utf-8'))
            const meta = giftCards.find((c: any) => c && c.startDate !== undefined)
            giftCardStartDate = String(meta?.startDate || '')
            giftCards = giftCards.filter((c: any) => c && c.startDate === undefined)
        }
    } catch { }

    const result = {
        accounts: accountsData.filter(Boolean),
        bannedOrders: await getBannedOrders(configDetails),
        giftCards: giftCards,
        giftCardStartDate: giftCardStartDate,
        orderLinks: await loadOrderLinks()
    }

    ramCache.data = result
    ramCache.lastFetch = Date.now()

    return result
}

async function getBannedOrders(configDetails: any) {
    const bannedDir = path.join(reportsDir, 'banned')
    const doneDir = path.join(bannedDir, 'Done')
    let bannedOrders: any[] = []
    let bannedGiftCardsOutput: any[] = []

    if (!existsSync(bannedDir)) return bannedOrders

    if (!existsSync(doneDir)) {
        await fs.mkdir(doneDir, { recursive: true })
    }

    async function getEntriesFrom(dir: string, isDoneFolder: boolean) {
        if (!existsSync(dir)) return []
        const items = await fs.readdir(dir, { withFileTypes: true })
        return items.map(item => ({ item, dir, isDoneFolder }))
    }

    const rootEntries = await getEntriesFrom(bannedDir, false)
    const doneEntries = await getEntriesFrom(doneDir, true)
    const allEntries = [...rootEntries, ...doneEntries]

    const standaloneFiles = new Set(
        allEntries
            .filter(e => e.item.isFile() && e.item.name.endsWith('.json') && e.item.name !== 'banned_giftcards.json')
            .map(e => e.item.name.replace('.json', ''))
    )

    await Promise.all(allEntries.map(async ({ item: entry, dir: currentDir, isDoneFolder }) => {
        if (entry.name === 'userInfo' || entry.name === 'banned_giftcards.json' || entry.name === 'Done' || entry.name.startsWith('.')) return

        let email = entry.name.replace('.json', '')

        if (entry.isDirectory() && standaloneFiles.has(email)) {
            if (!isDoneFolder) console.log(`[i] Ignored old folder for ${email} because a newer .json file exists.`)
            return
        }

        let orderHistoryToUse: any[] = []
        const entryPath = path.join(currentDir, entry.name)

        try {
            let filesToRead: string[] = []

            if (entry.isDirectory()) {
                const files = await fs.readdir(entryPath)
                filesToRead = files.filter(f => f.endsWith('.json')).sort().reverse().map(f => path.join(entryPath, f))
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                filesToRead = [entryPath]
            }

            for (const filePath of filesToRead) {
                const fileStr = await fs.readFile(filePath, 'utf-8')
                const data = JSON.parse(fileStr)

                if (Array.isArray(data)) {
                    for (let i = data.length - 1; i >= 0; i--) {
                        const dayData = data[i]
                        const history = dayData?.accountInfo?.orderHistory || dayData?.orderHistory
                        if (Array.isArray(history) && history.length > 0) {
                            orderHistoryToUse = history
                            break
                        }
                    }
                } else {
                    const history = data?.accountInfo?.orderHistory || data?.orderHistory || data?.latest?.accountInfo?.orderHistory
                    if (Array.isArray(history) && history.length > 0) {
                        orderHistoryToUse = history
                    }
                }

                if (orderHistoryToUse.length > 0) break
            }

            if (orderHistoryToUse.length > 0) {
                const shippedOrders = orderHistoryToUse.filter((order: any) => order.status === 'Shipped')

                if (shippedOrders.length > 0) {
                    if (!isDoneFolder) console.log(`[+] Found ${shippedOrders.length} 'Shipped' orders for: ${email}`)

                    shippedOrders.forEach((order: any) => {
                        const mappedTitle = itemMap[order.title] || itemMap[order.id] || order.title || 'Unknown Reward'

                        bannedOrders.push({
                            email: email,
                            id: order.id || '',
                            date: order.date || new Date().toISOString(),
                            title: mappedTitle,
                            points: order.points || 0,
                            status: order.status,
                            isBanned: true
                        })

                        if (mappedTitle.includes('B-Tech') || mappedTitle.includes('eGift Card') || Object.values(itemMap).includes(mappedTitle)) {
                            bannedGiftCardsOutput.push({
                                email: email,
                                giftCard: mappedTitle,
                                status: order.status,
                                date: order.date || new Date().toISOString(),
                                points: order.points || 0
                            })
                        }
                    })

                    if (!isDoneFolder) {
                        const destPath = path.join(doneDir, entry.name)
                        try {
                            await fs.rename(entryPath, destPath)
                            console.log(`    -> Moved ${email} to 'Done' folder.`)
                        } catch { }
                    }
                }
            }
        } catch { }
    }))

    if (bannedGiftCardsOutput.length > 0) {
        try {
            await fs.writeFile(path.join(bannedDir, 'banned_giftcards.json'), JSON.stringify(bannedGiftCardsOutput, null, 4), 'utf-8')
        } catch { }
    }

    return bannedOrders
}

async function loadOrderLinks(): Promise<Record<string, { link: string; label?: string; codes?: string[]; savedAt?: string; unavailable?: boolean }>> {
    const map: Record<string, { link: string; label?: string; codes?: string[]; savedAt?: string; unavailable?: boolean }> = {}
    try {
        const collect = (e: any) => {
            if (e && e.orderId) {
                map[e.orderId] = { link: e.link, label: e.label, codes: e.codes, savedAt: e.savedAt, unavailable: e.unavailable }
            }
        }

        for (const linksPath of [
            path.join(reportsDir, '../giftCard', 'order_links.json'),
            path.join(reportsDir, '../giftCard', 'order_links_banned.json')
        ]) {
            if (existsSync(linksPath)) {
                const parsed = JSON.parse(await fs.readFile(linksPath, 'utf-8'))

                if (Array.isArray(parsed)) {
                    // legacy flat array format
                    parsed.forEach(collect)
                } else if (parsed && typeof parsed === 'object') {
                    // new format: { email: [links...] }
                    for (const list of Object.values(parsed)) {
                        if (Array.isArray(list)) list.forEach(collect)
                    }
                }
            }
        }
    } catch { }
    return map
}

export async function getSingleAccount(email: string) {
    const accountFolder = path.join(reportsDir, email)
    if (!existsSync(accountFolder)) throw new Error('Account not found')

    const summaryPath = path.join(accountFolder, '_dashboard_summary.json')
    let accountData: any = null

    if (existsSync(summaryPath)) {
        const filesEntries = await fs.readdir(accountFolder)
        const reportFiles = filesEntries.filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/)).sort()
        if (reportFiles.length > 0) {
            const latestReportPath = path.join(accountFolder, reportFiles[reportFiles.length - 1]!)
            const latestStat = await fs.stat(latestReportPath)
            const summaryStat = await fs.stat(summaryPath)

            if (summaryStat.mtimeMs >= latestStat.mtimeMs) {
                const summaryContent = await fs.readFile(summaryPath, 'utf-8')
                accountData = JSON.parse(summaryContent)
                if (accountData.history) {
                    accountData.history = accountData.history.filter((h: any) => h.lastUpdated !== null && !h.isDummy)
                    accountData.latest = accountData.history[accountData.history.length - 1]
                }
            }
        }
    }

    if (!accountData) {
        const filesEntries = await fs.readdir(accountFolder)
        const reportFiles = filesEntries.filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/)).sort()
        const historyArray = await Promise.all(reportFiles.map(async f => JSON.parse(await fs.readFile(path.join(accountFolder, f), 'utf-8'))))

        const cleanHistory = historyArray.filter((h: any) => h.lastUpdated !== null && !h.isDummy)
        const latestDay = cleanHistory[cleanHistory.length - 1]
        if (latestDay) {
            latestDay.apiPointsToday = latestDay.collectedPoints || 0
        }
        accountData = { email, latest: latestDay, history: cleanHistory }
    }

    const d = new Date()
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    let latestDay = accountData.latest

    if (latestDay && latestDay.date !== todayStr) {
        const dummyToday = createDummyToday(latestDay)
        accountData.history.push(dummyToday)
        accountData.latest = dummyToday
    }

    accountData.orderLinks = await loadOrderLinks()

    return accountData
}

export async function getBatchState() {
    const batchPath = path.join(__dirname, '../../reports/batch_state.json')
    if (existsSync(batchPath)) {
        try {
            const content = await fs.readFile(batchPath, 'utf-8')
            const batches = JSON.parse(content)

            const spreadPath = path.join(__dirname, '../../reports/spread_state.json')
            let spread: any = null
            if (existsSync(spreadPath)) {
                try {
                    const spreadContent = JSON.parse(await fs.readFile(spreadPath, 'utf-8'))
                    if (Array.isArray(spreadContent.gaps) && spreadContent.gaps.length > 0) {
                        spread = {
                            gaps: spreadContent.gaps,
                            totalMs: spreadContent.gaps.reduce((a: number, b: number) => a + (b || 0), 0),
                            savedAt: spreadContent.savedAt || null
                        }
                    }
                } catch { }
            }

            return { batches: Array.isArray(batches) ? batches : [], spread }
        } catch {
            return { batches: [], spread: null }
        }
    }
    return { batches: [], spread: null }
}
