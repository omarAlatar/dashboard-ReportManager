// ==========================================
// 🃏 CARDS & PAGINATION MODULE
// ==========================================

// 🔐 TOTP inline popup for email cards
let activeTotpPopup = null
let activeTotpTimer = null

function showTotpCode(email, btnEl) {
    if (activeTotpPopup) {
        activeTotpPopup.remove()
        activeTotpPopup = null
        if (activeTotpTimer) clearInterval(activeTotpTimer)
        return
    }

    const popup = document.createElement('div')
    popup.className = 'fixed z-50 bg-slate-900 border border-slate-600 rounded-xl shadow-2xl p-4 w-64'
    popup.style.backdropFilter = 'blur(16px)'
    const rect = btnEl.getBoundingClientRect()
    popup.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px'
    popup.style.top = (rect.bottom + 8) + 'px'
    popup.innerHTML = `
        <div class="text-center">
            <p class="text-xs text-slate-400 truncate mb-2" title="${email}">${email}</p>
            <div id="totpPopupCode" class="text-3xl font-black text-white tracking-[0.2em] font-mono mb-2 cursor-pointer hover:text-blue-400 transition" title="Click to copy">--- ---</div>
            <div class="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden mb-1">
                <div id="totpPopupBar" class="h-full bg-blue-500 transition-all duration-1000 ease-linear rounded-full" style="width:100%"></div>
            </div>
            <p id="totpPopupTimer" class="text-xs text-slate-500 font-mono">30s</p>
            <button id="totpCloseBtn" class="mt-2 text-xs text-slate-500 hover:text-slate-300 transition">✕ Close</button>
        </div>
    `
    document.body.appendChild(popup)
    activeTotpPopup = popup

    const codeEl = popup.querySelector('#totpPopupCode')
    const barEl = popup.querySelector('#totpPopupBar')
    const timerEl = popup.querySelector('#totpPopupTimer')
    const closeBtn = popup.querySelector('#totpCloseBtn')

    function closePopup() {
        popup.remove()
        activeTotpPopup = null
        if (activeTotpTimer) {
            clearInterval(activeTotpTimer)
            activeTotpTimer = null
        }
    }

    closeBtn.onclick = function(e) { e.stopPropagation(); closePopup() }
    codeEl.onclick = function(e) {
        e.stopPropagation()
        const rawCode = codeEl.innerText.replace(/\s/g, '')
        navigator.clipboard.writeText(rawCode).then(() => {
            codeEl.innerText = 'COPIED!'
            codeEl.style.color = '#34d399'
            setTimeout(() => {
                if (popup.isConnected) {
                    const epoch = Math.floor(Date.now() / 1000)
                    const remaining = 30 - (epoch % 30)
                    fetchAndUpdate()
                    codeEl.style.color = '#f1f5f9'
                }
            }, 800)
        })
    }

    async function fetchAndUpdate() {
        try {
            const res = await fetch(`/api/totp-code?email=${encodeURIComponent(email)}`)
            const data = await res.json()
            if (data.code) {
                codeEl.innerText = `${data.code.slice(0, 3)} ${data.code.slice(3)}`
                codeEl.style.color = '#f1f5f9'
            } else {
                codeEl.innerText = 'NO SECRET'
                codeEl.style.color = '#f87171'
            }
        } catch {
            codeEl.innerText = 'ERROR'
            codeEl.style.color = '#f87171'
        }
    }

    fetchAndUpdate()
    if (activeTotpTimer) clearInterval(activeTotpTimer)
    activeTotpTimer = createCountdown(barEl, timerEl, fetchAndUpdate)
}

function buildSimConfig(info, baselineStreak, isSignUpDay, accRef = null, targetDateStr = null) {
    let config = {
        baselineStreak: baselineStreak,
        bingAppStreak: info.bingAppStreak !== undefined ? parseInt(info.bingAppStreak) : baselineStreak,
        dailySetStreak: info.dailySetStreak !== undefined ? parseInt(info.dailySetStreak) : baselineStreak,
        bingSearchStreak: info.bingSearchStreak !== undefined ? parseInt(info.bingSearchStreak) : baselineStreak,
        visualSearchStreak: info.visualSearchStreak !== undefined ? parseInt(info.visualSearchStreak) : baselineStreak,
        baselinePieces: parseInt(info.puzzlePieces) || 0,
        visualSearchEnabled: info.visualSearchInfo?.enabled !== false,
        isSignUpDay: isSignUpDay,
        edgeOnboarding10Days: parseInt(info.edgeOnboarding10Days) || 0,
        monthlyLevelState: info.bonuses?.monthlyLevel?.state || '',
        monthlyLevelStateDate: targetDateStr || null,
        monthlyDseState: info.bonuses?.monthlyDse?.state || '',
        monthlyDseStateDate: targetDateStr || null
    };

    if (accRef && targetDateStr) {
        const hIdx = accRef.history.findIndex(x => x.date === targetDateStr);
        if (hIdx !== -1) {
            // ⭐ BUG FIX: History is Oldest-to-Newest. hIdx - 1 is Yesterday.
            const prevH = hIdx > 0 ? accRef.history[hIdx - 1] : null;
            if (prevH) {
                config.prevPuzzlePieces = parseInt(prevH.accountInfo?.puzzlePieces) || 0;
            }
        }
    }

    return config;
}

function renderCards() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';

    if (globalAccounts.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10">No reports found. Run the bot first!</div>';
        return;
    }

    const sortVal = document.getElementById('sortFilter').value;
    const flagVal = document.getElementById('flagFilter').value;
    const todayStr = getTodayString();
    
    let sortedAccounts = [...globalAccounts];

    if (flagVal !== 'all') {
        sortedAccounts = sortedAccounts.filter(acc => {
            const selectedDate = cardSelections[acc.email] || acc.latest.date;
            const entry = acc.history.find(h => h.date === selectedDate) || acc.latest;
            const health = entry.accountHealth || {};
            
            const hasBotWarning = !!entry.hasBotWarning;
            const isRedeemBlocked = !!health.disableBotRedemptions;
            const isFlagged = !!health.unusualActivityFlag;
            const hasWarningsList = health.warnings && health.warnings.length > 0;
            const isRiskReview = JSON.stringify(entry).includes('RiskReview');
            
            const isBanned = health.isBanned || (health.warnings && JSON.stringify(health.warnings).includes('SUSPENDED'));

            let ranToday = false;
            if (acc.latest && acc.latest.date === todayStr && acc.latest.lastUpdated) {
                ranToday = true;
            } else if (acc.history) {
                const todayHistory = acc.history.find(h => h.date === todayStr);
                if (todayHistory && todayHistory.lastUpdated) {
                    ranToday = true;
                }
            }

            if (flagVal === 'banned') return isBanned;
            if (flagVal === 'ranToday') return ranToday;
            if (flagVal === 'didNotRunToday') return !ranToday;
            if (flagVal === 'botWarning') return hasBotWarning;
            if (flagVal === 'redeemBlocked') return isRedeemBlocked;
            if (flagVal === 'flagged') return isFlagged;
            if (flagVal === 'riskReview') return isRiskReview;
            if (flagVal === 'anyIssue') return hasBotWarning || isRedeemBlocked || isFlagged || hasWarningsList || isRiskReview;
            if (flagVal === 'clean') return !hasBotWarning && !isRedeemBlocked && !isFlagged && !hasWarningsList && !isRiskReview;
            return true;
        });
    }

    sortedAccounts.sort((a, b) => {
        const aLatest = a.latest || {};
        const bLatest = b.latest || {};
        const aHealth = aLatest.accountHealth || {};
        const bHealth = bLatest.accountHealth || {};
        const aTodayPts = aLatest.date === todayStr ? getRealPointsForDay(a, todayStr) : 0;
        const bTodayPts = bLatest.date === todayStr ? getRealPointsForDay(b, todayStr) : 0;
        const getScore = (h) => parseFloat(h.botScore) || 0;
        const getScoreDiff = (acc) => {
            const tScore = parseFloat((acc.latest?.accountHealth || {}).botScore) || 0;
            const yEntry = acc.history.length > 1 ? acc.history[acc.history.length - 2] : {};
            const yScore = parseFloat((yEntry.accountHealth || {}).botScore) || 0;
            return tScore - yScore;
        };
        // Expected Points diff (same math as the card's Exp: | diff row)
        const getExpDiff = (acc) => {
            const sDate = cardSelections[acc.email] || acc.latest.date;
            const entry = acc.history.find(h => h.date === sDate) || acc.latest;
            const info = entry.accountInfo || {};
            const todayPts = getRealPointsForDay(acc, sDate);
            if (!entry.lastUpdated) return null; // dummy day — no real diff
            let sDay = Math.max(1, parseInt(info.currentStreak) || 1);
            const isSignUp = (acc.history.length > 0 && acc.history[0].date === sDate && sDay === 1);
            let cfg = buildSimConfig(info, sDay, isSignUp, acc, sDate);
            const res = window.calculateExpectedPoints(sDate, sDay, info.level || 'Unknown', cfg);
            const expected = res.total - (res.breakdown.monthlyLevelCoupon || 0);
            return todayPts - expected;
        };
        
        if (sortVal === 'config') return a.configIndex - b.configIndex;
        if (sortVal === 'balanceDesc') return (bLatest.finalPoints || 0) - (aLatest.finalPoints || 0);
        if (sortVal === 'balanceAsc') return (aLatest.finalPoints || 0) - (bLatest.finalPoints || 0);
        if (sortVal === 'todayDesc') return bTodayPts - aTodayPts;
        if (sortVal === 'todayAsc') return aTodayPts - bTodayPts;
        if (sortVal === 'botScoreDesc') return getScore(bHealth) - getScore(aHealth);
        if (sortVal === 'botScoreAsc') return getScore(aHealth) - getScore(bHealth);
        if (sortVal === 'botScoreDiffDesc') return getScoreDiff(b) - getScoreDiff(a);
        if (sortVal === 'botScoreDiffAsc') return getScoreDiff(a) - getScoreDiff(b);
        if (sortVal === 'expDiffDesc') return (getExpDiff(b) ?? -Infinity) - (getExpDiff(a) ?? -Infinity);
        if (sortVal === 'expDiffAsc') return (getExpDiff(a) ?? Infinity) - (getExpDiff(b) ?? Infinity);
        if (sortVal === 'lastRunDesc') {
            const aTime = aLatest.lastUpdated ? new Date(aLatest.lastUpdated).getTime() : 0;
            const bTime = bLatest.lastUpdated ? new Date(bLatest.lastUpdated).getTime() : 0;
            return bTime - aTime;
        }
        return 0;
    });

    globalGoalMap2 = {};
    globalReached2 = 0;

    sortedAccounts.forEach(acc => {
        const selectedDate = cardSelections[acc.email] || acc.latest.date;
        const displayedEntry = acc.history.find(h => h.date === selectedDate) || acc.latest;
        const info = displayedEntry.accountInfo || {};
        const lvl = info.level || 'Unknown';

        const rawCoupons = displayedEntry.coupons || [];
        const activeCoupons = rawCoupons.filter(c => {
            const status = c.status || (c.attributes && c.attributes.coupon_status);
            return status !== 'redeemed' && status !== 'Redeemed';
        });

        const totalCouponValue = activeCoupons.reduce((sum, c) => {
            const val = c.couponValue || (c.attributes && c.attributes.coupon_value ? parseFloat(c.attributes.coupon_value) : 0);
            return sum + val;
        }, 0);

        const currentPoints = displayedEntry.finalPoints || 0;
        const target2 = 6950 - totalCouponValue;
        
        const pointsNeeded2 = Math.max(0, target2 - currentPoints);
        
        const isGoal2Reached = pointsNeeded2 === 0;
        
        if (isGoal2Reached) globalReached2++;

        let simDays2 = 0;
        let simBal = currentPoints;
        let simStreakDay = parseInt(info.currentStreak) || 0;
        let simCyclePos = window.flaggedCycleSeed(parseInt(displayedEntry.pointsBreakdown?.dailyCheckIn) || 0);
        let cycleSkipDays = window.flaggedRestDays(acc.email, 0);
        let cycleIndex = 0;
        let isFlagged = window.isBotFlaggedAccount(acc);
        let totalSimDays = 0;
        
        let simConfig = buildSimConfig(info, simStreakDay, false, null, selectedDate);
        let simDateObj = new Date(selectedDate);
        
        while (simBal < target2 && totalSimDays < 100) {
            totalSimDays++;
            simDateObj.setDate(simDateObj.getDate() + 1);
            let simDateStr = `${simDateObj.getFullYear()}-${String(simDateObj.getMonth() + 1).padStart(2, '0')}-${String(simDateObj.getDate()).padStart(2, '0')}`;
            
            if (isFlagged) {
                const fd = window.flaggedForecastDay(simDateStr, simCyclePos, true, cycleSkipDays, lvl, simConfig);
                simCyclePos = fd.nextPos;
                if (fd.rest) { cycleIndex++; cycleSkipDays = window.flaggedRestDays(acc.email, cycleIndex); }
                simBal += fd.points;
            } else {
                simStreakDay++;
                simBal += window.calculateExpectedPoints(simDateStr, simStreakDay, lvl, simConfig).total;
            }
            
            if (simBal >= target2 && simDays2 === 0 && !isGoal2Reached) {
                simDays2 = totalSimDays;
            }
        }

        if (!isGoal2Reached && simDays2 > 0 && simDays2 < 100) {
            if (!globalGoalMap2[simDays2]) globalGoalMap2[simDays2] = [];
            globalGoalMap2[simDays2].push(acc.email);
        }
    });

    const totalAccounts = sortedAccounts.length;
    const pSize = pageSize === 'all' ? totalAccounts : parseInt(pageSize);
    pagesCount = Math.ceil(totalAccounts / pSize) || 1;

    if (currentPage > pagesCount) currentPage = pagesCount;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * pSize;
    const endIndex = Math.min(startIndex + pSize, totalAccounts);
    const accountsToRender = pageSize === 'all' ? sortedAccounts : sortedAccounts.slice(startIndex, endIndex);

    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const pageIndicator = document.getElementById('pageIndicator');
    
    if (pageSize === 'all' || totalAccounts <= pSize) {
        if (prevBtn) prevBtn.classList.add('hidden');
        if (nextBtn) nextBtn.classList.add('hidden');
        if (pageIndicator) pageIndicator.classList.add('hidden');
    } else {
        if (prevBtn) {
            prevBtn.classList.remove('hidden');
            if (currentPage === 1) prevBtn.classList.add('opacity-0', 'pointer-events-none');
            else prevBtn.classList.remove('opacity-0', 'pointer-events-none');
        }
        if (nextBtn) {
            nextBtn.classList.remove('hidden');
            if (currentPage === pagesCount) nextBtn.classList.add('opacity-0', 'pointer-events-none');
            else nextBtn.classList.remove('opacity-0', 'pointer-events-none');
        }
        if (pageIndicator) {
            pageIndicator.classList.remove('hidden');
            const pageNumInput = document.getElementById('pageNumberInput');
            if (pageNumInput) pageNumInput.value = currentPage;
            const totalPagesInfo = document.getElementById('totalPagesInfo');
            if (totalPagesInfo) totalPagesInfo.innerText = pagesCount;
        }
    }

    accountsToRender.forEach((acc) => {
        const index = sortedAccounts.indexOf(acc);
        const selectedDate = cardSelections[acc.email] || acc.latest.date;
        const displayedEntry = acc.history.find(h => h.date === selectedDate) || acc.latest;
        const health = displayedEntry.accountHealth || {};
        const info = displayedEntry.accountInfo || {};
        
        const displayTodayPts = getRealPointsForDay(acc, selectedDate);
        const isDummyDay = !displayedEntry.lastUpdated;
        
        let expectedToday = 0;
        let lvl = info.level || 'Unknown';

        let strkDay = Math.max(1, parseInt(info.currentStreak) || 1);
        const isSignUp = (acc.history.length > 0 && acc.history[0].date === selectedDate && strkDay === 1);
        let cardConfig = buildSimConfig(info, strkDay, isSignUp, acc, selectedDate);
        
        // 👻 GHOST DAY FIX FOR CALCULATOR: Advance config if it hasn't run today
        if (isDummyDay) {
            //strkDay += 1;
            cardConfig.baselineStreak = strkDay;
            cardConfig.bingAppStreak = (cardConfig.bingAppStreak % 7) + 1;
            cardConfig.dailySetStreak = (cardConfig.dailySetStreak % 7) + 1;
            cardConfig.bingSearchStreak = (cardConfig.bingSearchStreak % 7) + 1;
            cardConfig.visualSearchStreak = (cardConfig.visualSearchStreak % 7) + 1;
        }
        
        const expectedResult = window.calculateExpectedPoints(selectedDate, strkDay, lvl, cardConfig);
        // Hide the redemption coupon from the card's expected display (it's not a bankable point reward)
        expectedToday = expectedResult.total - (expectedResult.breakdown.monthlyLevelCoupon || 0);

        let todayPtsHTML = '';
        if (isDummyDay && displayTodayPts === 0) {
            todayPtsHTML = `<p class="text-lg mt-0.5 text-slate-500 font-mono" title="Expected: Hasn't run yet">~${expectedToday}</p>`;
        } else {
            let diff = displayTodayPts - expectedToday;
            let diffColor = diff > 0 ? 'text-green-400' : (diff < 0 ? 'text-red-400' : 'text-slate-500');
            let diffPrefix = diff > 0 ? '+' : '';
            todayPtsHTML = `
                <p class="text-lg mt-0.5 leading-none mb-1 ${displayTodayPts > 0 ? 'good' : 'text-slate-500'}">+${displayTodayPts}</p>
                <div class="flex justify-center items-center gap-1 mt-1 border-t border-slate-700/50 pt-1">
                    <span class="text-slate-400 text-[10px]" title="Expected Points">Exp: ${expectedToday}</span>
                    <span class="text-slate-600 text-[10px]">|</span>
                    <span class="${diffColor} text-[10px] font-bold" title="Difference">${diffPrefix}${diff}</span>
                </div>
            `;
        }
        
        const selectedDateObj = new Date(selectedDate);
        selectedDateObj.setDate(selectedDateObj.getDate() - 1);
        const prevDateStr = `${selectedDateObj.getFullYear()}-${String(selectedDateObj.getMonth() + 1).padStart(2, '0')}-${String(selectedDateObj.getDate()).padStart(2, '0')}`;
        
        const prevEntry = acc.history.find(h => h.date === prevDateStr) || {};
        const prevHealth = prevEntry.accountHealth || {};
        const prevScore = prevHealth.botScore || 'N/A';
        const currentScore = health.botScore || 'N/A';
        
        let scoreDiffText = '';
        const cScoreNum = parseFloat(currentScore);
        const pScoreNum = parseFloat(prevScore);
        
        if (!isNaN(cScoreNum) && !isNaN(pScoreNum)) {
            const diff = cScoreNum - pScoreNum;
            const displayDiff = parseFloat(Math.abs(diff).toFixed(2)); 
            
            if (diff > 0) scoreDiffText = `<span class="text-red-400 text-[10px] font-bold">▲ +${displayDiff}</span>`;
            else if (diff < 0) scoreDiffText = `<span class="text-green-400 text-[10px] font-bold">▼ ${displayDiff}</span>`;
            else scoreDiffText = `<span class="text-slate-500 text-[10px] font-bold">No Change</span>`;
        } else {
            scoreDiffText = `<span class="text-slate-600 text-[10px] italic">No History</span>`;
        }
        
        const isBanned = health.isBanned || (health.warnings && JSON.stringify(health.warnings).includes('SUSPENDED'))
            ? '<span class="bg-red-600 text-white text-[10px] px-2 py-1 rounded ml-1 mb-1 inline-block border border-red-500 font-extrabold">🚫 BANNED</span>' : '';
        const isFlagged = health.unusualActivityFlag ? '<span class="bg-red-900 text-red-200 text-[10px] px-2 py-1 rounded ml-1 mb-1 inline-block border border-red-700">⚠️ Flagged</span>' : '';
        const isRedeemBlocked = health.disableBotRedemptions ? '<span class="bg-red-900 text-red-200 text-[10px] px-2 py-1 rounded ml-1 mb-1 inline-block border border-blue-700">🚫 Redeem Blocked</span>' : '';
        const isOneClick = health.oneClickRedemptionEligible ? '<span class="bg-blue-900 text-blue-200 text-[10px] px-2 py-1 rounded ml-1 mb-1 inline-block border border-blue-700">⚡ One-Click</span>' : '';
        const hasWarnings = health.warnings && health.warnings.length > 0 ? `<span class="bg-orange-900 text-orange-200 text-[10px] px-2 py-1 rounded ml-1 mb-1 inline-block border border-orange-700">${health.warnings.length} Warnings</span>` : '';
        const hasBotWarningBadge = displayedEntry.hasBotWarning ? '<span class="bg-red-900 text-red-200 text-[10px] px-2 py-1 rounded ml-1 mb-1 inline-block border border-red-700">🤖 Bot Warning</span>' : '';
        const botFlagCheckIn = parseInt(displayedEntry.pointsBreakdown?.dailyCheckIn) || 0;
        const botFlagBadge = window.isBotFlaggedAccount(acc) ? `<span class="bg-red-900 text-red-200 text-[10px] px-2 py-1 rounded ml-1 mb-1 inline-block border border-red-700" title="Bot-flagged account — check-in cycle day ${botFlagCheckIn >= 20 ? '7' : botFlagCheckIn >= 15 ? '5-6' : botFlagCheckIn >= 10 ? '3-4' : '1-2'} (${botFlagCheckIn} pts)">🤖 ${botFlagCheckIn}/7</span>` : '';
        
        const badges = isBanned + isFlagged + isRedeemBlocked + isOneClick + hasWarnings + hasBotWarningBadge + botFlagBadge;
        let displayCurrentStreak = parseInt(info.currentStreak) || 0;
        
        let bingSearchStreak = parseInt(info.bingSearchStreak) || 0;
        let dailySetStreak = parseInt(info.dailySetStreak) || 0;
        let bingAppStreak = parseInt(info.bingAppStreak) || 0;
        const hasVisualSearchStreak = info.visualSearchStreak !== undefined;
        let visualSearchStreakVal = hasVisualSearchStreak ? parseInt(info.visualSearchStreak) : 0;
        const visualSearchEnabled = info.visualSearchInfo && info.visualSearchInfo.enabled !== undefined ? info.visualSearchInfo.enabled : true;

        let bingCompleted = info.bingSearchInfo ? info.bingSearchInfo.completed : false;
        let dailySetCompleted = info.dailySetInfo ? info.dailySetInfo.completed : false;
        let bingAppCompleted = info.sapphireInfo ? info.sapphireInfo.completed : false;
        let visualCompleted = info.visualSearchInfo ? info.visualSearchInfo.completed : false;

        // 👻 GHOST DAY LOGIC: If it hasn't run today, project +1 day and mark incomplete
        if (isDummyDay) {
            //displayCurrentStreak += 1;
            
            // Fix: Wrap ALL streaks to max at 7, then reset back to 1
            bingSearchStreak = (bingSearchStreak % 7) + 1;
            dailySetStreak = (dailySetStreak % 7) + 1;   // <-- This wrap was missing!
            bingAppStreak = (bingAppStreak % 7) + 1;
            
            if (hasVisualSearchStreak) {
                visualSearchStreakVal = (visualSearchStreakVal % 7) + 1;
            }

            // Force all completions to false for the new ghost day
            bingCompleted = false;
            dailySetCompleted = false;
            bingAppCompleted = false;
            visualCompleted = false;
        }

        const streakText = info.streakProtection?.enabled 
            ? `${displayCurrentStreak}🔥 <span class="text-[10px] text-blue-400">(🛡️ ${info.streakProtection.daysRemaining}d)</span>` 
            : `${displayCurrentStreak}🔥`;

        const bingPts = info.bingPoints || [3,3,3,3,3,3,100];
        const dailySetPts = info.dailySetPoint || [30,30,30,30,30,30,100];
        const sapphirePts = info.sapphirePoints || [5,5,10,10,15,15,50];
        const visualPts = info.visualSearchPoints || [5,5,5,5,5,5,100];

        function renderCircle(dayNum, currentDay, pts, isCompleted) {
            let displayText = String(pts);
            if (pts > 999) displayText = '🎯';
            
            if (dayNum < currentDay) {
                // Past days: Blue
                return `<div class="streak-circle circle-filled" title="Day ${dayNum}: +${pts} pts ✓">${displayText}</div>`;
            } else if (dayNum === currentDay) {
                // Today: Check completion
                if (isCompleted) {
                    // Completed today: Green
                    return `<div class="streak-circle circle-quest" title="Day ${dayNum} (Completed): +${pts} pts ✓">${displayText}</div>`;
                } else {
                    // Not completed today: Red
                    return `<div class="streak-circle circle-danger" title="Day ${dayNum} (Not Complete): +${pts} pts">${displayText}</div>`;
                }
            } else {
                // Future days: Faded gray
                return `<div class="streak-circle circle-holo" title="Day ${dayNum}: +${pts} pts">${displayText}</div>`;
            }
        }

        let streakBoardHTML = '';
        let bingCircles = '';
        for (let i = 1; i <= 7; i++) {
            const pts = bingPts[Math.min(i - 1, bingPts.length - 1)] || 3;
            bingCircles += renderCircle(i, bingSearchStreak, pts, bingCompleted);
        }
        streakBoardHTML += `<div class="streak-row"><span class="streak-label">🔍 Bing</span><div class="streak-circles">${bingCircles}</div></div>`;

        let dsCircles = '';
        for (let i = 1; i <= 7; i++) {
            const pts = dailySetPts[Math.min(i - 1, dailySetPts.length - 1)] || 30;
            dsCircles += renderCircle(i, dailySetStreak, pts, dailySetCompleted);
        }
        streakBoardHTML += `<div class="streak-row"><span class="streak-label">📋 Set</span><div class="streak-circles">${dsCircles}</div></div>`;

        let baCircles = '';
        for (let i = 1; i <= 7; i++) {
            const pts = sapphirePts[Math.min(i - 1, sapphirePts.length - 1)] || 5;
            baCircles += renderCircle(i, bingAppStreak, pts, bingAppCompleted);
        }
        streakBoardHTML += `<div class="streak-row"><span class="streak-label">📱 App</span><div class="streak-circles">${baCircles}</div></div>`;

        if (hasVisualSearchStreak && visualSearchEnabled) {
            let vsCircles = '';
            for (let i = 1; i <= 7; i++) {
                const pts = visualPts[Math.min(i - 1, visualPts.length - 1)] || 5;
                vsCircles += renderCircle(i, visualSearchStreakVal, pts, visualCompleted);
            }
            streakBoardHTML += `<div class="streak-row"><span class="streak-label">👁 Visual</span><div class="streak-circles">${vsCircles}</div></div>`;
        }

        const currentPieces = parseInt(info.puzzlePieces) || 0;
        let pzCircles = '';
        for (let i = 1; i <= 12; i++) {
            let isEarned = i <= currentPieces;
            let isNext = i === currentPieces + 1;
            
            let bgClass = isEarned 
                ? 'bg-yellow-500 text-yellow-950 border-yellow-400 shadow-[0_0_4px_rgba(234,179,8,0.5)]' 
                : (isNext ? 'bg-yellow-900/40 text-yellow-400 border-yellow-500 border-dashed' : 'bg-slate-800/60 text-slate-600 border-slate-700');
                
            let icon = i === 12 ? '⭐' : '🧩';
            if (isEarned && i === 12) icon = '🎯'; 
            
            pzCircles += `<div class="flex items-center justify-center w-4 h-4 rounded-full border text-[8px] ${bgClass}" title="Piece ${i}${isEarned ? ' (Earned)' : ''}">${icon}</div>`;
        }
        
        streakBoardHTML += `
            <div class="streak-row mt-1.5 pt-1.5 border-t border-slate-700/50">
                <span class="streak-label text-yellow-400">🧩 Puzzle</span>
                <div class="flex flex-wrap gap-[3px] flex-1 ml-1">
                    ${pzCircles}
                </div>
            </div>`;

        if (streakBoardHTML) {
            streakBoardHTML = `<div class="streak-board"><div class="streak-board-title">📊 Streak Board</div>${streakBoardHTML}</div>`;
        }

        const rawCoupons = displayedEntry.coupons || [];
        const activeCoupons = rawCoupons.filter(c => {
            const status = c.status || (c.attributes && c.attributes.coupon_status);
            return status !== 'redeemed' && status !== 'Redeemed';
        });

        const hasCoupons = activeCoupons.length > 0;
        const goal = (displayedEntry.accountInfo && displayedEntry.accountInfo.goal) || null;
        const goalTitle = goal && goal.title ? String(goal.title).replace(/\s*eGift Card/gi, '') : '';
        
        const totalCouponValue = activeCoupons.reduce((sum, c) => {
            const val = c.couponValue || (c.attributes && c.attributes.coupon_value ? parseFloat(c.attributes.coupon_value) : 0);
            return sum + val;
        }, 0);

        const currentPoints = displayedEntry.finalPoints || 0;
        const target2 = 6950 - totalCouponValue;
        const pointsNeeded2 = Math.max(0, target2 - currentPoints);
        const isGoal2Reached = pointsNeeded2 === 0;
        const isGoalReached = isGoal2Reached; 

        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const historyIdx = acc.history.findIndex(h => h.date === selectedDate);
        const relevantHistory = acc.history.slice(0, historyIdx + 1);

        let simDays2 = 0, expectedDateStr2 = '';
        let simBal = currentPoints;
        let simStreakDay = parseInt(info.currentStreak) || 0;
        let simCyclePos = window.flaggedCycleSeed(parseInt(displayedEntry.pointsBreakdown?.dailyCheckIn) || 0);
        let cycleSkipDays = window.flaggedRestDays(acc.email, 0);
        let cycleIndex = 0;
        let simIsFlagged = window.isBotFlaggedAccount(acc);
        let totalSimDays = 0;
        
        let displaySimConfig = buildSimConfig(info, simStreakDay, false, null, selectedDate);
        let displaySimDate = new Date(selectedDate);
        
        while (simBal < target2 && totalSimDays < 100) {
            totalSimDays++;
            displaySimDate.setDate(displaySimDate.getDate() + 1);
            let dStr = `${displaySimDate.getFullYear()}-${String(displaySimDate.getMonth() + 1).padStart(2, '0')}-${String(displaySimDate.getDate()).padStart(2, '0')}`;
            
            if (simIsFlagged) {
                const fd = window.flaggedForecastDay(dStr, simCyclePos, true, cycleSkipDays, lvl, displaySimConfig);
                simCyclePos = fd.nextPos;
                if (fd.rest) { cycleIndex++; cycleSkipDays = window.flaggedRestDays(acc.email, cycleIndex); }
                simBal += fd.points;
            } else {
                simStreakDay++;
                simBal += window.calculateExpectedPoints(dStr, simStreakDay, lvl, displaySimConfig).total;
            }
            
            if (simBal >= target2 && simDays2 === 0 && !isGoal2Reached) {
                simDays2 = totalSimDays;
                expectedDateStr2 = `${String(displaySimDate.getMonth() + 1).padStart(2, '0')}-${String(displaySimDate.getDate()).padStart(2, '0')}`;
            }
        }

        let estBlockHTML = `
        <div class="flex gap-2 mb-2 mt-2">
            <div class="flex-1 border rounded px-2 py-1 text-xs flex flex-col items-center justify-center shadow-inner ${isGoal2Reached ? 'bg-green-900/40 border-green-700/50' : 'bg-indigo-900/40 border-indigo-700/50'}">
                <span class="text-[9px] uppercase tracking-wider font-bold ${isGoal2Reached ? 'text-green-300' : 'text-indigo-300'}">Target (6.9K)</span>
                <span class="font-bold ${isGoal2Reached ? 'text-green-400' : 'text-indigo-300'}">${isGoal2Reached ? 'Reached! 🎉' : `${simDays2} Days <span class="text-[9px] opacity-70 ml-0.5">(${expectedDateStr2})</span>`}</span>
            </div>
        </div>`;

        const dateOptionsHTML = acc.history.map(h => `<option value="${h.date}" ${h.date === selectedDate ? 'selected' : ''}>${h.date}</option>`).reverse().join('');
        const dateSelectHTML = `
            <select onclick="event.stopPropagation()" onchange="changeCardDate('${acc.email}', this.value)" class="bg-slate-800/80 text-blue-300 border border-slate-600 rounded px-1.5 py-0.5 text-[11px] font-mono outline-none cursor-pointer hover:border-blue-400 transition ml-2 shadow-inner">
                ${dateOptionsHTML}
            </select>
        `;

        let couponHTML = `
        <div class="mt-3 p-3 bg-slate-900/40 rounded border border-slate-700/50 text-xs">
            <div class="flex justify-between items-center mb-1">
                <span class="text-slate-400 uppercase tracking-wider text-[10px] font-bold">Target (6,950)</span>
                <span class="${isGoal2Reached ? 'text-green-400 font-bold' : 'text-orange-400 font-bold'}">${isGoal2Reached ? 'Reached! 🎉' : `${pointsNeeded2.toLocaleString()} needed`}</span>
            </div>
            <div class="flex justify-between items-center border-t border-slate-700/50 pt-1 mt-1 mb-1">
                <span class="text-slate-400 uppercase tracking-wider text-[10px] font-bold">Coupons</span>
                <span class="${hasCoupons ? 'text-green-400 font-bold' : 'text-slate-500'}">${hasCoupons ? `Active (-${totalCouponValue.toLocaleString()} pts)` : 'None'}</span>
            </div>
            <div class="flex justify-between items-center border-t border-slate-700/50 pt-1 mt-1">
                <span class="text-slate-400 uppercase tracking-wider text-[10px] font-bold">Goal</span>
                <span class="${goal ? 'text-blue-400 font-bold text-right' : 'text-slate-500'}" title="${goal ? goal.title || '' : ''}">${goal ? `${goalTitle}${goal.price ? ` (${goal.price.toLocaleString()} pts)` : ''}` : 'Not Set'}</span>
            </div>
        </div>`;

        let historyHTML = '';
        const startIndex7 = Math.max(0, historyIdx - 6);
        const past7Days = relevantHistory.slice(startIndex7, historyIdx + 1);

        past7Days.forEach(h => {
            let d = new Date(h.date);
            let dayName = daysOfWeek[d.getDay()];
            let actualPts = getRealPointsForDay(acc, h.date);
            
            let pastLevel = (h.accountInfo && h.accountInfo.level) ? h.accountInfo.level : 'Unknown';
            let pastStreakDay = Math.max(1, parseInt(h.accountInfo?.currentStreak) || 1);
            let pastIsSignUp = (acc.history.length > 0 && acc.history[0].date === h.date && pastStreakDay === 1);
            let pastConfig = buildSimConfig(h.accountInfo || {}, pastStreakDay, pastIsSignUp, acc, h.date);
            
            let isDummy = !h.lastUpdated;
            
            // 👻 GHOST DAY FIX FOR CUBES: Only wrap the sub-streaks, don't touch pastStreakDay!
            if (isDummy) {
                pastConfig.bingAppStreak = (pastConfig.bingAppStreak % 7) + 1;
                pastConfig.dailySetStreak = (pastConfig.dailySetStreak % 7) + 1;
                pastConfig.bingSearchStreak = (pastConfig.bingSearchStreak % 7) + 1;
                pastConfig.visualSearchStreak = (pastConfig.visualSearchStreak % 7) + 1;
            }

            let expectedPts;
            if (window.isBotFlaggedAccount(acc)) {
                expectedPts = window.flaggedForecastDay(h.date, window.flaggedCycleSeed(parseInt(h.pointsBreakdown?.dailyCheckIn) || 0), true, 2, pastLevel, pastConfig).points;
            } else {
                expectedPts = window.calculateExpectedPoints(h.date, pastStreakDay, pastLevel, pastConfig).total;
            }
            let diff = actualPts - expectedPts;
            let displayPts = actualPts;
            let prefix = '+';
            let boxClass = '';
            
            let tooltip = window.getPointsTooltip(h.date, pastStreakDay, pastLevel, actualPts, pastConfig);

            if (isDummy && actualPts === 0) {
                displayPts = expectedPts;
                prefix = '~';
                boxClass = 'bg-slate-800/80 border-slate-600 border-dashed text-slate-500';
                tooltip = `${h.date}\nStatus: Hasn't run yet\n` + window.getPointsTooltip(h.date, pastStreakDay, pastLevel, null, pastConfig);
            } else {
                let isBonus = actualPts >= (expectedPts + 50) || actualPts >= 250;
                boxClass = isBonus ? 'bg-green-900/40 border-green-500/50 text-green-300' : 'bg-slate-800/80 border-slate-700 text-slate-300';
                if (diff < -30) boxClass = 'bg-red-900/20 border-red-500/50 text-red-300';
            }

            historyHTML += `
                <div class="flex-1 flex flex-col items-center justify-center py-1.5 rounded border ${boxClass}" title="${tooltip}">
                    <span class="text-[9px] uppercase opacity-70 mb-0.5">${dayName}</span>
                    <span class="text-[11px] font-bold">${prefix}${displayPts}</span>
                </div>
            `;
        });

        let missingDays = 7 - past7Days.length;
        for (let i = 0; i < missingDays; i++) {
             historyHTML = `
                <div class="flex-1 flex flex-col items-center justify-center py-1.5 rounded border border-slate-800/50 bg-slate-900/30 text-slate-600">
                    <span class="text-[9px] uppercase opacity-40 mb-0.5">-</span>
                    <span class="text-[11px] font-bold">-</span>
                </div>
            ` + historyHTML;
        }

        let projectionsHTML = '';
        let baseDateObj = new Date(selectedDate);
        let projConfig = buildSimConfig(info, parseInt(info.currentStreak) || 0, false, null, selectedDate);
        let projIsFlagged = window.isBotFlaggedAccount(acc);
        let projCyclePos = window.flaggedCycleSeed(parseInt(displayedEntry.pointsBreakdown?.dailyCheckIn) || 0);
        let projCycleSkip = window.flaggedRestDays(acc.email, 0);
        let projCycleIndex = 0;

        for (let i = 1; i <= 7; i++) {
            let projDate = new Date(baseDateObj);
            projDate.setDate(baseDateObj.getDate() + i);
            let dayName = daysOfWeek[projDate.getDay()];
            let projDateStr = `${projDate.getFullYear()}-${String(projDate.getMonth() + 1).padStart(2, '0')}-${String(projDate.getDate()).padStart(2, '0')}`;
            
            let projStreakDay = (parseInt(info.currentStreak) || 0) + i;
            let totalScore, isBonusDay;
            if (projIsFlagged) {
                const fd = window.flaggedForecastDay(projDateStr, projCyclePos, true, projCycleSkip, lvl, projConfig);
                projCyclePos = fd.nextPos;
                if (fd.rest) { projCycleIndex++; projCycleSkip = window.flaggedRestDays(acc.email, projCycleIndex); }
                totalScore = fd.points;
                isBonusDay = totalScore >= 150;
            } else {
                const expectedResult = window.calculateExpectedPoints(projDateStr, projStreakDay, lvl, projConfig);
                totalScore = expectedResult.total;
                isBonusDay = totalScore >= 150 || projStreakDay % 7 === 0;
            }
            let boxClass = isBonusDay 
                ? 'bg-blue-900/40 border-blue-500/50 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.15)]' 
                : 'bg-slate-800/80 border-slate-700 text-slate-400';
                
            let tooltip = window.getPointsTooltip(projDateStr, projStreakDay, lvl, null, projConfig);

            projectionsHTML += `
                <div class="flex-1 flex flex-col items-center justify-center py-1.5 rounded border ${boxClass}" title="${tooltip}">
                    <span class="text-[9px] uppercase opacity-70 mb-0.5">${dayName}</span>
                    <span class="text-[11px] font-bold">+${totalScore}</span>
                </div>
            `;
        }

        const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        
        let wOffset = weekOffsets[acc.email] || 0;
        let tObj = new Date();
        tObj.setHours(12,0,0,0);
        
        let currentDayOfWeek = tObj.getDay() || 7; 
        let mondayObj = new Date(tObj);
        mondayObj.setDate(tObj.getDate() - currentDayOfWeek + 1 + (wOffset * 7));
        
        let weekDates = [];
        for(let i=0; i<7; i++) {
            let d = new Date(mondayObj);
            d.setDate(mondayObj.getDate() + i);
            weekDates.push(d);
        }
        
        let dayDataMap = {};
        acc.history.forEach(h => {
            let pastLevel = (h.accountInfo && h.accountInfo.level) ? h.accountInfo.level : 'Unknown';
            let pastStreakDay = Math.max(1, parseInt(h.accountInfo?.currentStreak) || 1);
            let pastIsSignUp = (acc.history.length > 0 && acc.history[0].date === h.date && pastStreakDay === 1);
            let pastCalConfig = buildSimConfig(h.accountInfo || {}, pastStreakDay, pastIsSignUp, acc, h.date);
            
            let isDummy = !h.lastUpdated;
            
            // 👻 GHOST DAY FIX FOR CALENDAR CUBES
            if (isDummy) {
                pastCalConfig.bingAppStreak = (pastCalConfig.bingAppStreak % 7) + 1;
                pastCalConfig.dailySetStreak = (pastCalConfig.dailySetStreak % 7) + 1;
                pastCalConfig.bingSearchStreak = (pastCalConfig.bingSearchStreak % 7) + 1;
                pastCalConfig.visualSearchStreak = (pastCalConfig.visualSearchStreak % 7) + 1;
            }

            let expectedPts;
            if (window.isBotFlaggedAccount(acc)) {
                expectedPts = window.flaggedForecastDay(h.date, window.flaggedCycleSeed(parseInt(h.pointsBreakdown?.dailyCheckIn) || 0), true, 2, pastLevel, pastCalConfig).points;
            } else {
                expectedPts = window.calculateExpectedPoints(h.date, pastStreakDay, pastLevel, pastCalConfig).total;
            }
            let actualPts = getRealPointsForDay(acc, h.date);

            dayDataMap[h.date] = { 
                pts: actualPts, 
                expected: expectedPts,
                isDummy: isDummy,
                bal: h.finalPoints || 0, 
                isProj: false,
                desc: window.getPointsTooltip(h.date, pastStreakDay, pastLevel, actualPts, pastCalConfig)
            };
        });
        
        let lParts = acc.latest.date.split('-');
        let latestObj = new Date(parseInt(lParts[0]), parseInt(lParts[1]) - 1, parseInt(lParts[2]), 12, 0, 0);
        
        let simBalCalendar = acc.latest.finalPoints || 0;
        let simStreakCalendar = parseInt((acc.latest.accountInfo || {}).currentStreak) || 0;
        let endOfTargetWeek = weekDates[6];
        let calIsFlagged = window.isBotFlaggedAccount(acc);
        let calCyclePos = window.flaggedCycleSeed(parseInt(acc.latest.pointsBreakdown?.dailyCheckIn) || 0);
        let calCycleSkip = window.flaggedRestDays(acc.email, 0);
        let calCycleIndex = 0;
        
        let calProjConfig = buildSimConfig(acc.latest.accountInfo || {}, simStreakCalendar, false, null, acc.latest.date);

        if (endOfTargetWeek > latestObj) {
            let simDate = new Date(latestObj);
            simDate.setDate(simDate.getDate() + 1);
            
            while(simDate <= endOfTargetWeek) {
                let sDateStr = fmt(simDate);
                let dailyPts;
                if (calIsFlagged) {
                    const fd = window.flaggedForecastDay(sDateStr, calCyclePos, true, calCycleSkip, lvl, calProjConfig);
                    calCyclePos = fd.nextPos;
                    if (fd.rest) { calCycleIndex++; calCycleSkip = window.flaggedRestDays(acc.email, calCycleIndex); }
                    dailyPts = fd.points;
                } else {
                    simStreakCalendar++;
                    dailyPts = window.calculateExpectedPoints(sDateStr, simStreakCalendar, lvl, calProjConfig).total;
                }
                simBalCalendar += dailyPts;
                
                let isBonusDay = dailyPts >= 150 || (!calIsFlagged && simStreakCalendar % 7 === 0);
                
                dayDataMap[sDateStr] = {
                    pts: dailyPts,
                    bal: simBalCalendar,
                    isProj: true,
                    isBonusDay: isBonusDay,
                    desc: `Projected Balance: ${simBalCalendar.toLocaleString()}\n-------------------\n` + window.getPointsTooltip(sDateStr, simStreakCalendar, lvl, null, calProjConfig)
                };
                simDate.setDate(simDate.getDate() + 1);
            }
        }
        
        let gridHTML = '';
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        
        for(let i=0; i<7; i++) {
            let dStr = fmt(weekDates[i]);
            let data = dayDataMap[dStr];
            
            if (!data) {
                gridHTML += `
                    <div class="flex-1 flex flex-col items-center justify-center py-1.5 rounded border border-slate-800/50 bg-slate-900/30 text-slate-600" title="${dStr}\nNo Data Available">
                        <span class="text-[9px] uppercase opacity-40 mb-0.5">${dayNames[i]}</span>
                        <span class="text-[11px] font-bold">-</span>
                    </div>
                `;
            } else {
                let boxClass = '';
                let displayPts = data.pts;
                let prefix = '+';

                if (data.isProj) {
                    boxClass = data.isBonusDay 
                        ? 'bg-blue-900/40 border-blue-500/50 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.15)] border-dashed' 
                        : 'bg-slate-800/80 border-slate-600 border-dashed text-slate-400';
                } else if (data.isDummy && data.pts === 0) {
                    boxClass = 'bg-slate-800/80 border-slate-600 border-dashed text-slate-500';
                    displayPts = data.expected;
                    prefix = '~';
                    data.desc = `Status: Hasn't run yet\n` + data.desc;
                } else {
                    let isHistoricalBonus = data.pts >= (data.expected + 50) || data.pts >= 250;
                    boxClass = isHistoricalBonus
                        ? 'bg-green-900/40 border-green-500/50 text-green-300 shadow-[0_0_10px_rgba(74,222,128,0.15)]'
                        : 'bg-slate-800/80 border-slate-600 text-slate-300';
                }
                
                let tooltip = `Date: ${dStr}\nTOTAL BALANCE: ${data.bal.toLocaleString()}\n------------------\n${data.desc}`;
                
                gridHTML += `
                    <div class="flex-1 flex flex-col items-center justify-center py-1.5 rounded border ${boxClass}" title="${tooltip}">
                        <span class="text-[9px] uppercase opacity-70 mb-0.5">${dayNames[i]}</span>
                        <span class="text-[11px] font-bold">${prefix}${displayPts}</span>
                    </div>
                `;
            }
        }
        
        let calendarModule = `
            <div class="mt-3 bg-slate-900/60 rounded border border-slate-700/50 p-2 cursor-default" onclick="event.stopPropagation()">
                <div class="flex justify-between items-center mb-2">
                    <button onclick="changeWeek(event, '${acc.email}', -1)" class="text-slate-400 hover:text-white hover:bg-slate-700 rounded px-2 py-0.5 transition font-bold" title="Last Week">◀</button>
                    <span class="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Week of ${fmt(mondayObj)}</span>
                    <button onclick="changeWeek(event, '${acc.email}', 1)" class="text-slate-400 hover:text-white hover:bg-slate-700 rounded px-2 py-0.5 transition font-bold" title="Next Week">▶</button>
                </div>
                <div class="flex justify-between gap-1">
                    ${gridHTML}
                </div>
            </div>
        `;

        const card = document.createElement('div');
        const isBannedBool = health.isBanned || (health.warnings && JSON.stringify(health.warnings).includes('SUSPENDED'));
        const cardTheme = isBannedBool
            ? 'bg-gradient-to-br from-[#250d0d] to-[#140606] border-red-800/60 shadow-[0_4px_20px_rgba(239,68,68,0.05)] hover:border-red-500 hover:shadow-[0_0_30px_rgba(239,68,68,0.2)] backdrop-blur-md'
            : (isGoalReached 
                ? 'bg-gradient-to-br from-[#0c2e1a] to-[#04120a] border-emerald-800/60 shadow-[0_4px_20px_rgba(16,185,129,0.05)] hover:border-emerald-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.2)] backdrop-blur-md' 
                : 'bg-gradient-to-br from-[#131b2e]/90 to-[#0c1220]/90 border-slate-700/60 shadow-[0_4px_20px_rgba(59,130,246,0.03)] hover:border-blue-500/80 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] backdrop-blur-md');
        
        const boxStyle = isBannedBool
            ? 'bg-red-950/30 p-2 rounded text-center border border-red-900/40 shadow-inner group-hover:bg-red-900/20 transition-colors flex flex-col justify-center'
            : 'bg-slate-800/80 p-2 rounded text-center border border-slate-700 shadow-inner group-hover:bg-slate-700/50 transition-colors flex flex-col justify-center';

        const normalBoxStyle = isBannedBool
            ? 'bg-red-950/30 p-2 rounded text-center border border-red-900/40 shadow-inner group-hover:bg-red-900/20 transition-colors'
            : 'bg-slate-800/80 p-2 rounded text-center border border-slate-700 shadow-inner group-hover:bg-slate-700/50 transition-colors';

        card.className = `rounded-xl p-6 border shadow-lg relative flex flex-col h-full cursor-pointer hover:-translate-y-1 transition-all duration-200 group ${cardTheme}`;
        card.onclick = () => openModal(acc.email, selectedDate);
        
        const lastUpdatedText = displayedEntry.lastUpdated ? new Date(displayedEntry.lastUpdated).toLocaleString('en-US', { hour12: true }) : 'Not Run Yet Today';
        const hoverTitleColor = isBannedBool ? 'group-hover:text-red-400' : (isGoalReached ? 'group-hover:text-green-400' : 'group-hover:text-blue-400');

        card.innerHTML = `
            <div class="mb-3">
                <div class="flex justify-between items-start mb-1">
                    <h2 class="text-xl font-semibold text-white truncate ${hoverTitleColor} transition-colors flex-grow flex items-center" title="${acc.email}">
                       <span class="text-slate-500 mr-2 text-base font-normal flex-shrink-0">
                            #${index + 1}
                             ${acc.jsonIndex ? `<span class="text-[10px] text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded border border-blue-800/50 ml-1 relative -top-0.5" title=".env index">[${acc.jsonIndex}]</span>` : ''}
                            ${acc.envIndex ? `<span class="text-[10px] text-emerald-400 bg-emerald-900/30 px-1.5 py-0.5 rounded border border-emerald-800/50 ml-1 relative -top-0.5" title=".env account number">#${acc.envIndex}</span>` : ''}
                        </span>
                        <span class="truncate">${acc.email}</span>
                        <button onclick="event.stopPropagation(); showTotpCode('${acc.email}', this)"
                                class="ml-2 text-[10px] bg-blue-900/50 hover:bg-blue-800/70 text-blue-300 px-1.5 py-0.5 rounded border border-blue-700/50 hover:border-blue-500 transition flex-shrink-0"
                                title="Generate TOTP Code">🔑</button>
                    </h2>
                    ${dateSelectHTML}
                </div>
                <div class="flex justify-between items-center text-xs mt-1 mb-2 font-mono">
                    <span class="flex items-center gap-1 text-slate-400" title="Last Run Time">⏱️ ${lastUpdatedText}</span>
                </div>
                ${estBlockHTML}
                <div class="flex flex-wrap mt-1">${badges}</div>
            </div>
            
            <div class="grid grid-cols-3 gap-3 mb-2 text-sm">
                <div class="${boxStyle}">
                    <p class="text-slate-400 text-[10px] uppercase tracking-wider mb-1">Bot Score (T|Y)</p>
                    <div class="flex justify-center items-center gap-1 mb-0.5">
                        <span class="${getScoreColor(currentScore)} font-bold">${currentScore}</span>
                        <span class="text-slate-500 text-[10px]">|</span>
                        <span class="${getScoreColor(prevScore)} text-xs">${prevScore}</span>
                    </div>
                    <div class="text-center">${scoreDiffText}</div>
                    ${health.botScoreUpd && health.botScoreUpd !== 'Unknown' ? `<div class="text-center text-[10px] text-slate-300 mt-1 uppercase border-t border-slate-700/50 pt-1">Upd: ${getUpdDateEG(health.botScoreUpd)}<br>${getUpdTimeEG(health.botScoreUpd)}</div>` : ''}
                </div>
                <div class="${normalBoxStyle}">
                    <p class="text-slate-400 text-[10px] uppercase tracking-wider">Today's Pts</p>
                    ${todayPtsHTML}
                </div>
                <div class="${normalBoxStyle}">
                    <p class="text-slate-400 text-[10px] uppercase tracking-wider">Balance</p>
                    <p class="text-lg mt-0.5 ${isBannedBool ? 'text-red-400 font-extrabold' : (isGoalReached ? 'text-green-400' : 'text-blue-400')}">${displayedEntry.finalPoints?.toLocaleString() || 0}</p>
                </div>
            </div>

            <div class="space-y-1 text-sm flex-grow mt-2 mb-2">
                <div class="flex justify-between border-b border-slate-700/30 pb-1">
                    <span class="text-slate-400 text-[10px]">Level / Streak</span>
                    <span class="font-medium text-xs">${info.level || '?'} / ${streakText}</span>
                </div>

                ${info.referralData?.referral_hash ? `
                    <div class="flex justify-between border-t border-slate-700/30 pt-1 mt-1 items-center">
                        <span class="text-slate-400 text-[10px]">Referral</span>
                        <div class="flex items-center gap-2">
                            <span class="font-medium text-xs truncate max-w-[140px] text-right text-blue-400" 
                                  title="https://rewards.bing.com/welcome?rh=${info.referralData.referral_hash}&ref=rafsrchae">
                                ${info.referralData.referral_hash}
                            </span>
                            <button onclick="event.stopPropagation(); copyToClipboard('https://rewards.bing.com/welcome?rh=${info.referralData.referral_hash}&ref=rafsrchae')" 
                                    class="text-slate-500 hover:text-blue-400 transition" 
                                    title="Copy Link">📋</button>
                        </div>
                    </div>
                    ${info.createdDate ? `
                        <div class="flex justify-between border-t border-slate-700/30 pt-1 mt-1 items-center">
                            <span class="text-slate-400 text-[10px]">Created</span>
                            <span class="text-[10px] text-slate-500" title="Days since account creation">${getDaysSinceEG(info.createdDate) === 0 ? 'Today' : `${getDaysSinceEG(info.createdDate)} day${getDaysSinceEG(info.createdDate) === 1 ? '' : 's'}`}</span>
                            <span class="font-medium text-xs text-blue-400" title="${new Date(info.createdDate).toLocaleString()}">${getCreatedDateEG(info.createdDate)}</span>
                        </div>
                    ` : ''}
                ` : ''}
            </div>
            
            ${streakBoardHTML}
            ${couponHTML}
            ${calendarModule}
            
            <div class="mt-4 text-center text-[10px] ${isGoalReached ? 'text-green-600/60' : 'text-slate-500'} uppercase tracking-widest font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                Click to view full details
            </div>
        `;
        grid.appendChild(card);
    });
    
    renderGoalTable();
}

function changePageSize() {
    const select = document.getElementById('pageSizeFilter');
    if (select) {
        const val = select.value;
        pageSize = val === 'all' ? 'all' : parseInt(val);
        currentPage = 1;
        renderCards();
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderCards();
        document.getElementById('grid').scrollIntoView({ behavior: 'smooth' });
    }
}

function nextPage() {
    currentPage++;
    renderCards();
    document.getElementById('grid').scrollIntoView({ behavior: 'smooth' });
}

function jumpToPage(val) {
    const pageNum = parseInt(val);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > pagesCount) {
        const input = document.getElementById('pageNumberInput');
        if (input) input.value = currentPage;
        return;
    }
    currentPage = pageNum;
    renderCards();
    document.getElementById('grid').scrollIntoView({ behavior: 'smooth' });
}