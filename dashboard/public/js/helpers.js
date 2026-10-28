// ==========================================
// 📊 GLOBAL STATE
// ==========================================
let globalAccounts = [];
let globalBannedOrders = [];
let globalGiftCards = [];
let chartInstance = null;
let cardSelections = {}; 
let weekOffsets = {}; 
let squareToggleState = {}; 
let globalGoalMap2 = {}; 
let globalReached2 = 0;      
let currentForecastView = 'goal'; 
let globalRedeemStartDate = '';
let currentPage = 1;
let pageSize = 6;
let pagesCount = 1;

// Constants
const itemMap = {
    '000899045004': 'B-Tech E£100 eGift Card',
    '000899045005': 'B-Tech E£200 eGift Card',
    '000899045006': 'B-Tech E£250 eGift Card'
};

// ==========================================
// 🛠️ HELPER UTILITIES
// ==========================================

/**
 * Calculates the true points earned for any specific day by subtracting 
 * the previous day's final points from the target day's final points.
 * If a redemption occurred (causing a drop in points), it falls back 
 * to the API's pointsSummary array ONLY IF the bot actually ran that day.
 */
function getRealPointsForDay(acc, targetDate) {
    if (!acc || !acc.history || acc.history.length === 0) {
        return 0;
    }
    
    const history = acc.history;
    const targetIndex = history.findIndex(h => h.date === targetDate);
    
    if (targetIndex === -1) {
        return 0; // Date not found in history
    }
    
    const targetDay = history[targetIndex];
    let calculatedDiff = 0;

    // 1. Mathematical calculation
    if (targetIndex === 0) {
        calculatedDiff = targetDay.finalPoints || targetDay.apiPointsToday || targetDay.collectedPoints || 0;
    } else {
        const previousDay = history[targetIndex - 1];
        calculatedDiff = (targetDay.finalPoints || 0) - (previousDay.finalPoints || 0);
    }

    // 2. Fallback check for Redemptions / Negative Math
    if (calculatedDiff <= 0 && targetDay.lastUpdated) {
        if (targetDay.accountInfo && Array.isArray(targetDay.accountInfo.pointsSummary) && targetDay.accountInfo.pointsSummary.length > 0) {
            return targetDay.accountInfo.pointsSummary[0].pointsEarned || 0;
        }
    }

    // 3. Return the calculated difference (or 0 if everything fails or it hasn't run yet)
    return calculatedDiff > 0 ? calculatedDiff : 0;
}

/**
 * Calculates the number of accounts that ran today and merges 
 * both the "Ran Today" and "Total" counts into a single UI badge.
 * (Animation removed!)
 */
function updateAccountsBadge() {
    if (!globalAccounts) return;

    const totalCount = globalAccounts.filter(a => !a.parked).length;

    // Get today's date in YYYY-MM-DD format
    const d = new Date();
    const todayStr = d.getFullYear() + '-' + 
                     String(d.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(d.getDate()).padStart(2, '0');

    let ranTodayCount = 0;
    
    // Count accounts ONLY if they have today's date AND a valid 'lastUpdated' timestamp
    globalAccounts.forEach(acc => {
        if (acc.parked) return;
        if (acc.latest && acc.latest.date === todayStr && acc.latest.lastUpdated) {
            ranTodayCount++;
        } else if (acc.history) {
            const todayHistory = acc.history.find(h => h.date === todayStr);
            if (todayHistory && todayHistory.lastUpdated) {
                ranTodayCount++;
            }
        }
    });

    // Find the main total accounts badge
    const badge = document.getElementById('totalAccountsBadge') || document.querySelector('.totalAccountsBadge');
    
    if (badge) {
        badge.classList.remove('hidden'); // Ensure it is visible
        
        // Decide the dot color: Green if all accounts ran, Orange if still running
        const dotColor = (ranTodayCount === totalCount && totalCount > 0) ? 'bg-emerald-500' : 'bg-orange-400';

        // Merge both counts into the single badge (without pulse animation)
        badge.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="inline-block w-2 h-2 rounded-full ${dotColor}"></span>
                <span>${ranTodayCount} / ${totalCount} Accounts</span>
            </div>
        `;
    }
}

function copyToClipboard(text, btn) {
    const flash = () => {
        if (!btn) return;
        const orig = btn.textContent;
        btn.textContent = '✅ Copied';
        setTimeout(() => { btn.textContent = orig; }, 1200);
    };

    // Synchronous in-gesture copy (works on localhost AND LAN IP)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);

    if (ok) {
        flash();
        return;
    }

    // Fallback: modern async API (requires secure context + user gesture)
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(flash).catch(() => alert('Copy failed — select the code manually'));
    } else {
        alert('Copy failed — select the code manually');
    }
}

function getUpdDateEG(d) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', day: '2-digit', month: 'short' }).formatToParts(new Date(d));
    return `${parts.find(p => p.type === 'day').value}/${parts.find(p => p.type === 'month').value}`;
}

function getCreatedDateEG(d) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date(d));
    return `${parts.find(p => p.type === 'day').value}/${parts.find(p => p.type === 'month').value}/${parts.find(p => p.type === 'year').value}`;
}

function getDaysSinceEG(d) {
    const dayNum = date => Math.floor(date.getTime() / 86400000);
    return dayNum(new Date()) - dayNum(new Date(d));
}

function getUpdTimeEG(d) {
    return new Date(d).toLocaleTimeString('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function toggleInfoPanel() {
    const content = document.getElementById('infoPanelContent');
    const isHidden = content.classList.contains('opacity-0');
    
    if (isHidden) {
        content.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
        content.classList.add('opacity-100', 'translate-y-0');
    } else {
        content.classList.remove('opacity-100', 'translate-y-0');
        content.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
    }
}

function changeCardDate(email, date) {
    cardSelections[email] = date;
    if (window.renderCards) window.renderCards(); 
}

function changeWeek(event, email, delta) {
    event.stopPropagation();
    weekOffsets[email] = (weekOffsets[email] || 0) + delta;
    if (window.renderCards) window.renderCards();
}

function getScoreColor(score) {
    if (score === 'Unknown' || score === 'N/A' || !score) return 'text-slate-400';
    const num = parseFloat(score);
    if (isNaN(num)) return 'text-slate-400';
    if (num > 50 || num > 0.6) return 'danger font-bold';
    if (num > 20 || num > 0.4) return 'warn font-bold';
    return 'good';
}

function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ⏱ Shared 30-second TOTP countdown (used by card popup and TOTP modal)
function createCountdown(barEl, timerEl, onRollover) {
    function tick() {
        const epoch = Math.floor(Date.now() / 1000);
        const remaining = 30 - (epoch % 30);
        timerEl.innerText = remaining + 's';
        barEl.style.width = (remaining / 30 * 100) + '%';
        barEl.className = remaining <= 5
            ? 'h-full bg-red-500 transition-all duration-1000 ease-linear rounded-full'
            : 'h-full bg-blue-500 transition-all duration-1000 ease-linear rounded-full';
        if (remaining === 30 && onRollover) onRollover();
    }
    tick();
    return setInterval(tick, 1000);
}
