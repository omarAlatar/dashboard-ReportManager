import http from 'http'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import * as OTPAuth from 'otpauth'
import { getDashboardData, getSingleAccount, getBatchState, invalidateCache } from './dataService'
import { loadAccounts } from '../util/Load'

const PORT = 3000
const GIFT_CARDS_PATH = path.join(__dirname, '../../reports/giftCard', 'giftCards.json')

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk })
        req.on('end', () => resolve(body))
        req.on('error', reject)
    })
}

function splitMetaAndCards(giftCards: any[]): { meta: any[]; cards: any[] } {
    const meta = giftCards.filter((c: any) => c && c.startDate !== undefined)
    const cards = giftCards.filter((c: any) => c && c.startDate === undefined)
    return { meta, cards }
}

function findEnvFile(): string | undefined {
    const root = path.resolve(__dirname, '../..')
    const candidates = [
        path.join(process.cwd(), '.env'),
        path.join(root, '.env'),
        path.join(root, 'dist', '.env'),
        path.join(root, 'src', '.env')
    ]
    return candidates.find(p => fs.existsSync(p))
}

function buildEnvIndexMap(): Record<string, number> {
    const map: Record<string, number> = {}
    const envFile = findEnvFile()
    if (envFile) {
        const lines = fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)
        for (const line of lines) {
            const m = line.match(/^ACCOUNT_(\d+)_EMAIL=(.+)/i)
            if (m && m[1] && m[2]) {
                map[m[2].trim().toLowerCase()] = parseInt(m[1])
            }
        }
    }
    // Fallback: scan process.env
    if (Object.keys(map).length === 0) {
        for (let i = 1; ; i++) {
            const email = process.env[`ACCOUNT_${i}_EMAIL`]
            if (!email) break
            map[email.trim().toLowerCase()] = i
        }
    }
    return map
}

function parseEnvAccounts(): { email: string; index: number; totpSecret: string }[] {
    const envIndexMap = buildEnvIndexMap()
    const accounts = loadAccounts()
    const accountsWithIndex = accounts.map(a => ({
        email: a.email,
        index: envIndexMap[a.email.toLowerCase()] || 0,
        totpSecret: a.totpSecret || ''
    }))
    // Include any accounts found in .env that loadAccounts() missed due to gaps
    const knownEmails = new Set(accounts.map(a => a.email.toLowerCase()))
    for (const [email, index] of Object.entries(envIndexMap)) {
        if (!knownEmails.has(email)) {
            accountsWithIndex.push({ email, index, totpSecret: '' })
        }
    }
    return accountsWithIndex.sort((a, b) => a.index - b.index)
}

function sendJson(res: http.ServerResponse, data: any, status = 200) {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.writeHead(status)
    res.end(JSON.stringify(data))
}

function sendError(res: http.ServerResponse, error: string, status = 500) {
    sendJson(res, { error }, status)
}

async function serveStaticFile(res: http.ServerResponse, filePath: string, contentType: string) {
    try {
        const fullPath = path.join(__dirname, 'public', filePath)
        const data = await fsPromises.readFile(fullPath)
        res.setHeader('Content-Type', contentType)
        res.writeHead(200)
        res.end(data)
    } catch {
        res.writeHead(404)
        res.end('File Not Found')
    }
}

const server = http.createServer(async (req, res) => {
    if (req.url === '/api/data') {
        try {
            const envAccounts = parseEnvAccounts()
            const envIndexMap: Record<string, number> = {}
            const configOrder = envAccounts.sort((a, b) => a.index - b.index).map(a => a.email)
            const configDetails: Record<string, { index: number }> = {}
            envAccounts.forEach(a => { envIndexMap[a.email.toLowerCase()] = a.index; configDetails[a.email] = { index: a.index } })

            // Include parked accounts (store.env — bot-flagged, resting) so they still show on the dashboard
            const parkedEmails = new Set<string>()
            try {
                const storeEnvPath = path.join(path.resolve(__dirname, '../..'), 'store.env')
                if (fs.existsSync(storeEnvPath)) {
                    const lines = fs.readFileSync(storeEnvPath, 'utf-8').split(/\r?\n/)
                    for (const line of lines) {
                        const m = line.match(/^ACCOUNT_(\d+)_EMAIL=(.+)/i)
                        if (m && m[1] && m[2]) {
                            const email = m[2].trim()
                            if (envIndexMap[email.toLowerCase()] === undefined) {
                                parkedEmails.add(email.toLowerCase())
                            }
                        }
                    }
                }
            } catch { }

            const data = await getDashboardData(configDetails, configOrder)
            if (data && data.accounts) {
                // Filter out accounts that are not in the .env file (unless parked in store.env)
                data.accounts = data.accounts.filter((acc: any) => {
                    const email = acc.email?.toLowerCase()
                    return email && (envIndexMap[email] !== undefined || parkedEmails.has(email))
                })
                data.accounts.forEach((acc: any) => {
                    acc.envIndex = envIndexMap[acc.email?.toLowerCase()] || ''
                    if (parkedEmails.has(acc.email?.toLowerCase())) acc.parked = true
                })
            }
            sendJson(res, data)
        } catch {
            sendError(res, 'Server error')
        }
        return
    }

    if (req.method === 'POST' && req.url === '/api/giftcard/add') {
        try {
            const body = JSON.parse((await readBody(req)) || '{}')
            const serial = String(body.serial || '').replace(/\s+/g, '')
            const amount = parseInt(body.amount, 10)

            if (!/^\d{16}$/.test(serial)) {
                sendError(res, 'Serial must be exactly 16 digits', 400)
                return
            }
            if (![100, 200, 250].includes(amount)) {
                sendError(res, 'Amount must be 100, 200 or 250', 400)
                return
            }

            let giftCards: any[] = []
            if (fs.existsSync(GIFT_CARDS_PATH)) {
                giftCards = JSON.parse(await fsPromises.readFile(GIFT_CARDS_PATH, 'utf-8'))
            }
            const { meta, cards } = splitMetaAndCards(giftCards)

            if (cards.some((c: any) => String(c.serial || '') === serial)) {
                sendError(res, 'Serial already exists', 409)
                return
            }

            const maxIndex = cards.reduce((max: number, c: any) => Math.max(max, parseInt(c.index) || 0), 0)
            const newCard = {
                index: maxIndex > 0 ? maxIndex + 1 : cards.length + 1,
                serial: serial,
                amount: `EGP ${amount}`
            }
            cards.push(newCard)
            await fsPromises.writeFile(GIFT_CARDS_PATH, JSON.stringify([...meta, ...cards], null, 2), 'utf-8')
            invalidateCache()
            sendJson(res, { success: true, card: newCard }, 201)
        } catch {
            sendError(res, 'Invalid JSON body or failed to write gift card file')
        }
        return
    }

    if (req.method === 'POST' && req.url === '/api/giftcard/remove') {
        try {
            const body = JSON.parse((await readBody(req)) || '{}')
            let giftCards: any[] = []
            if (fs.existsSync(GIFT_CARDS_PATH)) {
                giftCards = JSON.parse(await fsPromises.readFile(GIFT_CARDS_PATH, 'utf-8'))
            }
            const { meta, cards } = splitMetaAndCards(giftCards)

            let removed = 0
            if (body.all === true) {
                removed = cards.length
                giftCards = meta
            } else {
                const serial = String(body.serial || '').replace(/\s+/g, '')
                if (!/^\d{16}$/.test(serial)) {
                    sendError(res, 'Serial must be exactly 16 digits', 400)
                    return
                }
                const before = cards.length
                const remaining = cards.filter((c: any) => String(c.serial || '') !== serial)
                removed = before - remaining.length
                if (removed === 0) {
                    sendError(res, 'Serial not found', 404)
                    return
                }
                giftCards = [...meta, ...remaining.map((c: any, i: number) => ({ ...c, index: i + 1 }))]
            }

            await fsPromises.writeFile(GIFT_CARDS_PATH, JSON.stringify(giftCards, null, 2), 'utf-8')
            invalidateCache()
            sendJson(res, { success: true, removed, giftCards: giftCards.filter((c: any) => c.startDate === undefined) })
        } catch {
            sendError(res, 'Invalid JSON body or failed to write gift card file')
        }
        return
    }

    if (req.method === 'POST' && req.url === '/api/giftcard/startdate') {
        try {
            const body = JSON.parse((await readBody(req)) || '{}')
            const startDate = String(body.startDate || '').trim()
            if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
                sendError(res, 'Date must be in YYYY-MM-DD format', 400)
                return
            }

            let giftCards: any[] = []
            if (fs.existsSync(GIFT_CARDS_PATH)) {
                giftCards = JSON.parse(await fsPromises.readFile(GIFT_CARDS_PATH, 'utf-8'))
            }
            const { meta, cards } = splitMetaAndCards(giftCards)
            if (meta.length > 0) {
                meta[0].startDate = startDate
            } else {
                meta.unshift({ startDate })
            }
            await fsPromises.writeFile(GIFT_CARDS_PATH, JSON.stringify([...meta, ...cards], null, 2), 'utf-8')
            invalidateCache()
            sendJson(res, { success: true, startDate })
        } catch {
            sendError(res, 'Invalid JSON body or failed to write gift card file')
        }
        return
    }

    if (req.url === '/api/batch-state') {
        try {
            const data = await getBatchState()
            sendJson(res, data || [])
        } catch {
            sendJson(res, [])
        }
        return
    }

    if (req.url && req.url.startsWith('/api/account?email=')) {
        try {
            const email = decodeURIComponent(req.url.split('email=')[1]?.split('&')[0] || '')
            const data = await getSingleAccount(email)
            sendJson(res, data)
        } catch (error: any) {
            const status = error.message === 'Account not found' ? 404 : 500
            sendError(res, error.message, status)
        }
        return
    }

    if (req.url && req.url.startsWith('/api/totp-code?email=')) {
        try {
            const email = decodeURIComponent(req.url.split('email=')[1]?.split('&')[0] || '').toLowerCase()
            const envAccounts = parseEnvAccounts()
            const acc = envAccounts.find(a => a.email.toLowerCase() === email)
            if (!acc || !acc.totpSecret) {
                sendError(res, 'No TOTP secret found for this email', 404)
                return
            }
            const cleanSecret = acc.totpSecret.replace(/\s+/g, '')
            const totp = new OTPAuth.TOTP({
                issuer: 'Microsoft', label: email, algorithm: 'SHA1',
                digits: 6, period: 30,
                secret: OTPAuth.Secret.fromBase32(cleanSecret)
            })
            sendJson(res, { email, code: totp.generate(), expiresIn: 30 - (Math.floor(Date.now() / 1000) % 30) })
        } catch {
            sendError(res, 'Failed to generate TOTP code')
        }
        return
    }

    if (req.url === '/api/totp-accounts') {
        sendJson(res, parseEnvAccounts().map(a => ({ email: a.email, totpSecret: a.totpSecret })))
        return
    }

    if (req.url === '/' || req.url === '/index.html') {
        return serveStaticFile(res, 'index.html', 'text/html')
    }

    if (req.url?.startsWith('/js/')) {
        return serveStaticFile(res, req.url, 'application/javascript')
    }

    if (req.url?.startsWith('/assets/')) {
        return serveStaticFile(res, req.url.replace('/assets/', ''), 'application/javascript')
    }

    res.writeHead(404)
    res.end('Not found')
})

server.listen(PORT, () => {
    console.log(`\n==============================================`)
    console.log(`Live Dashboard running at: http://localhost:${PORT}`)
    console.log(`==============================================\n`)
})

process.on('SIGINT', () => {
    console.log('\nStopping Web Dashboard Server...\n')
    server.close(() => process.exit(0))
})
