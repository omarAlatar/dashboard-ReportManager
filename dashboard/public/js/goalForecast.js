// ==========================================
// 🎯 GOAL, FORECAST & RUN TRACKER MODULE
// ==========================================

window.activeTab = window.activeTab || 'goal';

window.setForecastView = function(view) {
    window.activeTab = view;
    renderGoalTable();
};

function renderGoalTable() {
    const container = document.getElementById('goalForecastContainer');

    function buildForecastCells(goalMap, targetName) {
        const days = Object.keys(goalMap).map(Number).sort((a, b) => a - b);
        let cellsHTML = '';
        if (days.length === 0) {
            return `<div class="text-slate-500 italic text-sm p-2 w-full">No accounts pending for ${targetName}.</div>`;
        }
        days.forEach(day => {
            let accountsList = goalMap[day];
            let count = accountsList.length;
            let expectedDate = new Date();
            expectedDate.setDate(expectedDate.getDate() + day);
            let dateStr = `${String(expectedDate.getMonth() + 1).padStart(2, '0')}-${String(expectedDate.getDate()).padStart(2, '0')}`;
            let tooltip = accountsList.join('\n');
            cellsHTML += `
                <div class="flex-none min-w-[100px] bg-slate-800/80 border border-slate-700 p-3 rounded-xl text-center shadow-md flex flex-col justify-center hover:bg-slate-700 transition cursor-help" title="${tooltip}">
                    <span class="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">In ${day} Day${day > 1 ? 's' : ''}</span>
                    <span class="text-2xl font-black text-indigo-400">${count} <span class="text-[10px] text-slate-500 font-normal">Acc${count > 1 ? 's' : ''}</span></span>
                    <span class="text-[10px] text-slate-500 mt-1 font-mono">${dateStr}</span>
                </div>
            `;
        });
        return cellsHTML;
    }

    let allForecastsHTML = `
        <div class="w-full">
            <h4 class="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-2 ml-1 border-b border-slate-700 pb-1">Target (6,950 Pts)</h4>
            <div class="flex overflow-x-auto gap-3 pb-2" style="scrollbar-width: thin; scrollbar-color: #334155 transparent;">
                <div class="flex-none min-w-[100px] bg-green-900/30 border border-green-700/50 p-3 rounded-xl text-center shadow-md flex flex-col justify-center">
                    <span class="text-[10px] text-green-400 uppercase tracking-wider font-bold mb-1">Reached</span>
                    <span class="text-2xl font-black text-green-400">${globalReached2} <span class="text-[10px] text-green-500 font-normal">Accs</span></span>
                </div>
                ${buildForecastCells(globalGoalMap2, "Target")}
            </div>
        </div>
    `;

    let rawRedemptions = [];
    globalAccounts.forEach(acc => {
        const info = (acc.latest && acc.latest.accountInfo) ? acc.latest.accountInfo : {};
        if (info.orderHistory && Array.isArray(info.orderHistory) && info.orderHistory.length > 0) {
            info.orderHistory.forEach(order => {
                let mappedTitle = itemMap[order.title] || itemMap[order.id] || order.title || 'Unknown Reward';
                rawRedemptions.push({
                    email: acc.email,
                    id: order.id || '',
                    dateObj: new Date(order.date),
                    dateStr: new Date(order.date).toLocaleDateString(),
                    title: mappedTitle,
                    points: order.points || 0,
                    status: order.status || 'Unknown',
                    isBanned: false
                });
            });
        }
    });
    
    globalBannedOrders.forEach(order => {
        let mappedTitle = itemMap[order.title] || itemMap[order.id] || order.title || 'Unknown Reward';
        rawRedemptions.push({
            email: order.email,
            id: order.id || '',
            dateObj: new Date(order.date),
            dateStr: new Date(order.date).toLocaleDateString(),
            title: mappedTitle,
            points: order.points,
            status: order.status,
            isBanned: true
        });
    });

    let isCancelledStatus = s => s === 'Cancelled' || s.includes('Cancelled');
    let isRiskReviewStatus = s => s === 'RiskReview' || s.includes('RiskReview');

    let filterDateObj = globalRedeemStartDate ? new Date(globalRedeemStartDate) : new Date(0);
    
    let filteredRedemptions = rawRedemptions.filter(r => {
        if (!r.isBanned && isCancelledStatus(r.status)) return false;
        if (r.dateObj < filterDateObj) return false;
        return true;
    });

    filteredRedemptions.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    // Only show the B-Tech eGift cards
    const btechTitles = new Set(['B-Tech E£250 eGift Card', 'B-Tech E£200 eGift Card', 'B-Tech E£100 eGift Card'])
    filteredRedemptions = filteredRedemptions.filter(r => btechTitles.has((r.title || '').trim()))

    let redeemedTotalValue = 0;
    let redeemedCount100 = 0, redeemedCount200 = 0, redeemedCount250 = 0, redeemedCalculatedCount = 0, inReviewCount = 0;
    let redeemedCardsHTML = '';
    
    if (filteredRedemptions.length === 0) {
        redeemedCardsHTML = '<div class="text-slate-500 italic text-sm p-2 w-full">No valid redemptions found for this period.</div>';
    } else {
        filteredRedemptions.forEach(r => {
            let title = r.title || '';
            if (isRiskReviewStatus(r.status)) {
                inReviewCount++;
            } else {
                redeemedCalculatedCount++;
                if (title.includes('100')) { redeemedCount100++; redeemedTotalValue += 100; }
                else if (title.includes('200')) { redeemedCount200++; redeemedTotalValue += 200; }
                else if (title.includes('250')) { redeemedCount250++; redeemedTotalValue += 250; }
            }

            let statusColor = isCancelledStatus(r.status) ? 'text-red-400' : (isRiskReviewStatus(r.status) ? 'text-amber-400' : 'text-green-400');
            let bannedBadge = r.isBanned ? '<span class="text-[9px] bg-red-900 text-red-200 px-1.5 py-0.5 rounded border border-red-700 ml-1">BANNED</span>' : '';

            let linkBtn = '';
            const savedLink = r.id && window.orderLinks && window.orderLinks[r.id] ? window.orderLinks[r.id] : null;
            if (savedLink && savedLink.link) {
                linkBtn = `<a href="${savedLink.link}" target="_blank" rel="noopener" title="${savedLink.label || savedLink.link}" class="inline-flex items-center text-[9px] bg-blue-900/50 hover:bg-blue-800/70 text-blue-300 px-1.5 py-0.5 rounded border border-blue-700/50 hover:border-blue-500 transition">🔗</a>`;
            } else if (savedLink && savedLink.codes && savedLink.codes.length > 0) {
                linkBtn = `<button onclick="copyToClipboard('${String(savedLink.codes[0]).replace(/'/g, "\\'")}', this)" title="Copy code" class="inline-flex items-center text-[9px] bg-green-900/50 hover:bg-green-800/70 text-green-300 px-1.5 py-0.5 rounded border border-green-700/50 hover:border-green-500 transition">📋</button>`;
            }
            
            redeemedCardsHTML += `
                <div class="flex-none min-w-[240px] max-w-[280px] bg-slate-800/80 border border-slate-700 p-3 rounded-xl shadow-md hover:bg-slate-700 transition flex flex-col gap-1">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-xs font-bold text-purple-400 truncate pr-2" title="${r.title}">${r.title}</span>
                        <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-900 ${statusColor}">${r.status}</span>
                    </div>
                    <div class="text-lg font-black text-white leading-none">${r.points.toLocaleString()} <span class="text-[10px] text-slate-400 font-normal">pts</span></div>
                    <div class="border-t border-slate-600 my-1.5"></div>
                    <div class="text-[11px] text-slate-300 truncate font-medium" title="${r.email}">✉️ ${r.email} ${bannedBadge}</div>
                    <div class="flex justify-between items-center text-[10px] mt-1">
                        <span class="text-slate-400 font-mono">${r.dateStr} <span class="text-purple-400 ml-1">${r.dateObj.toLocaleTimeString('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' })}</span></span>
                        ${linkBtn}
                    </div>
                </div>
            `;
        });
    }

    let redeemedOverviewCube = `
        <div class="flex-none min-w-[150px] bg-purple-900/20 border border-purple-700/50 p-2 rounded-xl shadow-md flex flex-col gap-0.5 cursor-default hover:bg-purple-900/30 transition text-center">
            <span class="text-[10px] text-purple-400 uppercase tracking-wider font-bold mb-1 border-b border-purple-800/50 pb-1">Redeemed Summary</span>
            <div class="text-2xl font-black text-purple-400 leading-none mb-1">E£ ${redeemedTotalValue.toLocaleString()}</div>
            <div class="text-[11px] text-purple-300/80 font-medium">${redeemedCalculatedCount} Total Cards</div>
            ${inReviewCount > 0 ? `<div class="text-[10px] text-amber-400/90 font-medium">${inReviewCount} In Review</div>` : ''}
            <div class="flex justify-center gap-4 text-[11px] text-purple-200/80 mt-1 pt-1.5 border-t border-purple-800/50 font-mono">
                ${redeemedCount100 > 0 ? `<span title="100 EGP Cards">100:<b class="text-purple-300 ml-1">${redeemedCount100}</b></span>` : ''}
                ${redeemedCount200 > 0 ? `<span title="200 EGP Cards">200:<b class="text-purple-300 ml-1">${redeemedCount200}</b></span>` : ''}
                ${redeemedCount250 > 0 ? `<span title="250 EGP Cards">250:<b class="text-purple-300 ml-1">${redeemedCount250}</b></span>` : ''}
            </div>
        </div>
    `;

    let redeemedHTML = redeemedOverviewCube + redeemedCardsHTML;
    
    let totalAmount = 0;
    let count100 = 0, count200 = 0, count250 = 0;
    let cardsHTML = '';
    let flatGiftCards = Array.isArray(globalGiftCards) ? globalGiftCards.flat(Infinity) : [];

    if (flatGiftCards.length === 0) {
        cardsHTML = '<div class="text-slate-500 italic text-sm p-2 w-full">No gift cards found in reports/giftCard/giftCards.json</div>';
    } else {
        flatGiftCards.forEach(card => {
            let amt = 0;
            let rawAmount = card.amount || card.Amount || card.AMOUNT || '';
            let numericString = String(rawAmount).replace(/[^0-9]/g, '');
            if (numericString.length > 0) amt = parseInt(numericString, 10);
            
            totalAmount += amt;
            if (amt === 100) count100++;
            if (amt === 200) count200++;
            if (amt === 250) count250++;

            cardsHTML += `
                <div class="flex-none min-w-[200px] bg-slate-800/80 border border-slate-700 p-3 rounded-xl shadow-md hover:bg-slate-700 transition flex flex-col gap-1 self-center">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-xs font-bold text-emerald-400">Card #${card.index || '?'}</span>
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">${rawAmount || 'N/A'}</span>
                    </div>
                    <div class="text-[13px] font-mono text-slate-200 bg-slate-900 p-2 rounded text-center select-all border border-slate-700/50 hover:bg-slate-950 transition cursor-text">${card.serial || 'N/A'}</div>
                </div>
            `;
        });
    }

    let overviewCube = `
        <div class="flex-none min-w-[150px] bg-emerald-900/20 border border-emerald-700/50 p-2 rounded-xl shadow-md flex flex-col gap-0.5 cursor-default hover:bg-emerald-900/30 transition text-center">
            <span class="text-[10px] text-emerald-400 uppercase tracking-wider font-bold mb-1 border-b border-emerald-800/50 pb-1">Total Vault Value</span>
            <div class="text-2xl font-black text-emerald-400 leading-none mb-1">E£ ${totalAmount.toLocaleString()}</div>
            <div class="text-[11px] text-emerald-300/80 font-medium">${flatGiftCards.length} Total Cards</div>
            <div class="flex justify-center gap-4 text-[11px] text-emerald-200/80 mt-1 pt-1.5 border-t border-emerald-800/50 font-mono">
                ${count100 > 0 ? `<span title="100 EGP Cards">100:<b class="text-emerald-300 ml-1">${count100}</b></span>` : ''}
                ${count200 > 0 ? `<span title="200 EGP Cards">200:<b class="text-emerald-300 ml-1">${count200}</b></span>` : ''}
                ${count250 > 0 ? `<span title="250 EGP Cards">250:<b class="text-emerald-300 ml-1">${count250}</b></span>` : ''}
            </div>
        </div>
    `;

    let giftcardsViewHTML = overviewCube + cardsHTML;

    // ==========================================
    // 🚀 BATCH PROGRESS VIEW LOGIC
    // ==========================================
    let batches = window.globalBatchState || [];
    let batchHTML = '';
    const batchState = window.globalBatchState || {};
    batches = Array.isArray(batchState) ? batchState : (batchState.batches || []);
    const spread = (!Array.isArray(batchState) && batchState.spread) || null;

    const fmtGap = (ms) => {
        const totalMin = Math.round((ms || 0) / 60000);
        const h = Math.floor(totalMin / 60), m = totalMin % 60;
        return h > 0 ? `${h}h ${m}m` : `${m} min`;
    };

    if (batches.length === 0) {
        batchHTML = '<div class="text-slate-500 italic text-sm p-2 w-full">No active run data found. Start a run via Master Script.</div>';
    } else {
        let firstStartTime = null;
        let lastEndTime = null;
        let completedCount = 0;

        const batchesWithIndex = batches.map((b, idx) => ({ ...b, displayIndex: idx + 1 }));

        batchesWithIndex.sort((a, b) => {
            if (a.completed && !b.completed) return 1;
            if (!a.completed && b.completed) return -1;
            return a.displayIndex - b.displayIndex;
        });

        // --- Spread gap cards placement (computed before cards so gaps interleave) ---
        let currentGapHtml = '', gapsByEmail = {};
        let consumedEmails = 0;
        const batchOfEmail = [];
        if (spread && spread.gaps && spread.gaps.length > 0) {
            let openFound = false;
            batches.forEach((b, bi) => {
                const cnt = (parseInt(b.end) || 0) - (parseInt(b.start) || 0) + 1;
                if (!openFound) {
                    if (b.completed) consumedEmails += cnt;
                    else { openFound = true; consumedEmails += (parseInt(b.emailsDone) || 0); }
                }
                for (let e = 1; e <= cnt; e++) batchOfEmail.push(bi);
            });
            const gapEntries = [];
            spread.gaps.forEach((g, i) => {
                if ((g || 0) > 0) {
                    const nextEmailPos = i + 2;
                    const done = consumedEmails >= nextEmailPos;
                    const isCurrent = !done && consumedEmails > 0 && i === consumedEmails - 1;
                    const attachBatch = batchOfEmail[i] ?? 0;
                    const nextBatchNum = (batchOfEmail[nextEmailPos - 1] ?? 0) + 1;
                    gapEntries.push({ ms: g, nextBatchNum, attachBatch, done, isCurrent });
                }
            });
            const gapCardHtml = (ms, batchNum, state) => {
                const isNow = state === 'now', isDone = state === 'done';
                return `
                <div class="flex-none min-w-[200px] ${isNow ? 'bg-blue-900/30 border-blue-500' : 'bg-slate-800/80 border-slate-700'} border p-3 rounded-xl flex flex-col gap-1 shadow-md ${isNow ? '' : 'hover:bg-slate-700'} transition">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-xs font-bold text-slate-200">⏳ Gap</span>
                        <span class="${isDone ? 'text-green-400' : isNow ? 'text-blue-300' : 'text-blue-400'} text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900${isNow ? ' animate-pulse' : ''}">${isDone ? '✅ Done' : isNow ? 'Now' : 'Wait'}</span>
                    </div>
                    <div class="text-[11px] text-slate-400 mb-1">Before Batch <span class="text-white">${batchNum}</span></div>
                    <div class="flex flex-col bg-slate-900 rounded p-1.5 font-mono mt-auto border border-slate-700/50 shadow-inner text-[10px] text-slate-400">
                        <div class="text-center text-blue-400 font-bold border-t border-slate-800 pt-1 mt-0.5">⏱️ ${fmtGap(ms)}</div>
                    </div>
                </div>
            `;
            };
            gapEntries.forEach(({ ms, nextBatchNum, attachBatch, done, isCurrent }) => {
                if (isCurrent) {
                    currentGapHtml = gapCardHtml(ms, nextBatchNum, 'now');
                } else {
                    (gapsByEmail[attachBatch] = gapsByEmail[attachBatch] || []).push(gapCardHtml(ms, nextBatchNum, done ? 'done' : 'wait'));
                }
            });
        }

        const batchCards = batchesWithIndex.map((b) => {
            if (b.startTime && (!firstStartTime || new Date(b.startTime) < new Date(firstStartTime))) firstStartTime = b.startTime;
            if (b.endTime && (!lastEndTime || new Date(b.endTime) > new Date(lastEndTime))) lastEndTime = b.endTime;
            if (b.completed) completedCount++;

            const statusColor = b.completed ? 'text-green-400' : (b.startTime ? 'text-blue-400 animate-pulse' : 'text-slate-500');
            const statusIcon = b.completed ? '✅' : (b.startTime ? '⏳' : '⏸️');
            
            let durationStr = 'Waiting';
            if (b.startTime) {
                const end = b.endTime ? new Date(b.endTime) : new Date();
                durationStr = `${Math.round((end - new Date(b.startTime)) / 60000)}m`;
                if (!b.endTime) durationStr += ' (Active)';
            }

            const accsDisplay = b.start === b.end ? b.start : `${b.start} - ${b.end}`;
            const startTimeStr = b.startTime ? new Date(b.startTime).toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit'}) : '--:--';
            const endTimeStr = b.endTime ? new Date(b.endTime).toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit'}) : '--:--';

            return `
                <div class="flex-none min-w-[200px] bg-slate-800/80 border border-slate-700 p-3 rounded-xl flex flex-col gap-1 shadow-md hover:bg-slate-700 transition">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-xs font-bold text-slate-200">Batch ${b.displayIndex}</span>
                        <span class="${statusColor} text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900">${statusIcon} ${b.completed ? 'Done' : (b.startTime ? 'Active' : 'Pending')}</span>
                    </div>
                    <div class="text-[11px] text-slate-400 mb-1">Accs <span class="text-white">${accsDisplay}</span></div>
                    <div class="flex flex-col bg-slate-900 rounded p-1.5 font-mono mt-auto border border-slate-700/50 shadow-inner text-[10px] text-slate-400">
                        <div class="flex justify-between mb-1">
                            <span title="Start Time">▶ ${startTimeStr}</span>
                            <span title="End Time">⏹ ${endTimeStr}</span>
                        </div>
                        <div class="text-center text-blue-400 font-bold border-t border-slate-800 pt-1 mt-0.5">
                            ⏱️ ${durationStr}
                        </div>
                    </div>
                </div>
            ` + (gapsByEmail[b.displayIndex - 1] || []).join('');
        }).join('');

        let overallDuration = 'N/A';
        let totalWorkMs = 0;
        batches.forEach(b => {
            if (b.startTime) {
                const end = b.endTime ? new Date(b.endTime) : new Date();
                totalWorkMs += Math.max(0, end - new Date(b.startTime));
            }
        });
        if (totalWorkMs > 0) {
            const totalMin = Math.round(totalWorkMs / 60000);
            const h = Math.floor(totalMin / 60), m = totalMin % 60;
            overallDuration = h > 0 ? `${h}h ${m}m` : `${m} min`;
        }
        const progressPercent = Math.round((completedCount / batches.length) * 100) || 0;
        const runEnded = !!(lastEndTime && completedCount === batches.length);

        let accountsTotal = 0, accountsDone = 0;
        batches.forEach(b => {
            const cnt = (parseInt(b.end) || 0) - (parseInt(b.start) || 0) + 1;
            accountsTotal += cnt;
            if (b.completed) accountsDone += cnt;
        });
        const accountsLeft = Math.max(0, accountsTotal - accountsDone);

        // --- ETA Calculation ---
        const accountMap = {};
        (window.globalAccounts || []).forEach(acc => {
            if (acc.envIndex) accountMap[acc.envIndex] = acc;
        });
        const completedWithTiming = batches.filter(b => b.completed && b.startTime && b.endTime);
        const avgBatchMs = completedWithTiming.length > 0
            ? completedWithTiming.reduce((sum, b) => sum + (new Date(b.endTime) - new Date(b.startTime)), 0) / completedWithTiming.length
            : 0;
        const GOLD_MIN = 8.5, NORMAL_MIN = 5.5;
        let estRemainingMs = 0, estGold = 0, estNormal = 0;
        batches.forEach(b => {
            if (b.completed) return;
            if (avgBatchMs > 0) {
                estRemainingMs += avgBatchMs;
                return;
            }
            let hasStreak7 = false;
            for (let i = b.start; i <= b.end; i++) {
                const acc = accountMap[i];
                if (acc?.latest?.accountInfo) {
                    const streak = parseInt(acc.latest.accountInfo.currentStreak) || 0;
                    if (streak >= 7) { hasStreak7 = true; break; }
                }
            }
            if (hasStreak7) { estRemainingMs += GOLD_MIN * 60000; estGold++; }
            else { estRemainingMs += NORMAL_MIN * 60000; estNormal++; }
        });
        // --- End ETA ---

        // --- Spread waits still to come (per-email random gaps) ---
        let spreadRemainingMs = 0, gapsLeft = 0, nextGapMs = null;
        if (spread && spread.gaps && spread.gaps.length > 0) {
            const remainingGaps = consumedEmails <= 0 ? spread.gaps : spread.gaps.slice(consumedEmails - 1);
            const activeGaps = remainingGaps.filter(g => (g || 0) > 0);
            spreadRemainingMs = remainingGaps.reduce((a, g) => a + (g || 0), 0);
            gapsLeft = activeGaps.length;
            nextGapMs = activeGaps[0] || null;
            if (avgBatchMs === 0) estRemainingMs += spreadRemainingMs;
        }
        // --- End spread ETA ---

        batchHTML = `
            <div class="w-full flex flex-col pt-1">
                <div class="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden shadow-inner border border-slate-700">
                    <div class="bg-blue-500 h-2 rounded-full transition-all duration-500 ease-in-out" style="width: ${progressPercent}%"></div>
                </div>
                <div class="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[10px] text-slate-400 mb-3 uppercase font-bold tracking-wider">
                    <span>Started: ${firstStartTime ? new Date(firstStartTime).toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit'}) : 'Waiting...'}</span>
                    ${runEnded ? `<span>Ended: <span class="text-blue-400">${new Date(lastEndTime).toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit'})}</span></span>` : ''}
                    <span>Total Time: <span class="text-blue-400">${overallDuration}</span></span>
                    <span>${completedCount} / ${batches.length} Done (${progressPercent}%)</span>
                    <span>${accountsLeft > 0 ? `<span class="text-blue-400">👤 Accounts Left: ${accountsLeft}</span>` : '<span class="text-green-400">👤 All Accounts Done</span>'}</span>
                </div>
                ${spread ? `
                <div class="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[10px] text-blue-400 mb-2 font-mono">
                    <span>⏳ Spread: <b>${fmtGap(spread.totalMs)}</b> total</span>
                    <span>Remaining: <b>${fmtGap(spreadRemainingMs)}</b> (${gapsLeft} gaps)</span>
                    ${nextGapMs ? `<span>Next gap: <b>${fmtGap(nextGapMs)}</b></span>` : ''}
                </div>` : ''}
                <div class="flex justify-between text-[10px] text-slate-400 mb-3 font-mono border-t border-slate-700/50 pt-2">
                    <span>⏱️ Remaining: <span class="${estRemainingMs === 0 ? 'text-green-400' : 'text-blue-400'} font-bold">${estRemainingMs <= 0 ? 'Done' : `${Math.round(estRemainingMs / 60000)} min`}</span></span>
                    ${estRemainingMs > 0 ? `<span>🎯 Est. Finish: <span class="text-blue-400 font-bold">${new Date(Date.now() + estRemainingMs).toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit'})}</span></span>` : ''}
                    ${avgBatchMs === 0 && estRemainingMs > 0 ? `<span class="text-[9px] text-slate-500">${estGold > 0 ? `🐂${estGold}` : ''}${estGold > 0 && estNormal > 0 ? ' ' : ''}${estNormal > 0 ? `⚪${estNormal}` : ''} (streak estimate)</span>` : ''}
                    ${avgBatchMs > 0 ? `<span class="text-[9px] text-slate-500">based on ${completedWithTiming.length} completed run${completedWithTiming.length > 1 ? 's' : ''}</span>` : ''}
                </div>
                <div class="flex overflow-x-auto gap-3 pb-2" style="scrollbar-width: thin; scrollbar-color: #334155 transparent;">
                    ${currentGapHtml}${batchCards}
                </div>
            </div>
        `;
    }

    container.classList.remove('hidden');

    const tabs = [
        { id: 'goal', icon: '🎯', label: 'Forecast', active: 'text-indigo-300 border-indigo-500 bg-indigo-900/40 shadow-[0_0_10px_rgba(99,102,241,0.2)]', inactive: 'text-slate-400 border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-slate-200' },
        { id: 'batch', icon: '🚀', label: 'Master Run', active: 'text-blue-300 border-blue-500 bg-blue-900/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]', inactive: 'text-slate-400 border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-slate-200' },
        { id: 'redeemed', icon: '🛍️', label: 'Redeemed', active: 'text-purple-300 border-purple-500 bg-purple-900/40 shadow-[0_0_10px_rgba(168,85,247,0.2)]', inactive: 'text-slate-400 border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-slate-200' },
        { id: 'giftcards', icon: '💳', label: 'Vault', active: 'text-emerald-300 border-emerald-500 bg-emerald-900/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]', inactive: 'text-slate-400 border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-slate-200' }
    ];

    let tabsHTML = `<div class="flex flex-wrap gap-2">`;
    tabs.forEach(tab => {
        const isActive = window.activeTab === tab.id;
        const colorClasses = isActive ? tab.active : tab.inactive;
        tabsHTML += `
            <button onclick="window.setForecastView('${tab.id}')" class="px-3 py-1.5 rounded-lg border text-[10px] uppercase font-bold tracking-wider transition-all duration-200 flex items-center gap-1.5 outline-none ${colorClasses}">
                <span class="text-xs">${tab.icon}</span> ${tab.label}
            </button>
        `;
    });
    tabsHTML += `</div>`;

    container.innerHTML = `
        <div class="glass-panel p-5 shadow-2xl">
            <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 gap-4">
                ${tabsHTML}
                
                <div class="flex gap-2">
                    <div class="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner ${window.activeTab !== 'goal' ? 'hidden' : ''}">
                        <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">How many in:</span>
                        <input type="number" id="customGoalDays" min="1" class="bg-slate-800 text-indigo-300 font-bold border border-slate-600 rounded px-2 py-0.5 text-xs w-16 outline-none text-center" onkeyup="checkCustomGoal()" onchange="checkCustomGoal()" placeholder="Days">
                        <span id="customGoalResult" class="text-xs font-bold text-slate-300 min-w-[80px]">-</span>
                    </div>
                    
                    <div class="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner ${window.activeTab !== 'redeemed' ? 'hidden' : ''}">
                        <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Start Date:</span>
                        <input type="date" id="redeemStartDate" value="${globalRedeemStartDate}" class="bg-slate-800 text-purple-300 font-bold border border-slate-600 rounded px-2 py-0.5 text-[11px] outline-none cursor-pointer">
                        <button onclick="window.saveRedeemStartDate(this)" class="bg-purple-700 hover:bg-purple-600 text-white px-2 py-0.5 rounded text-[10px] font-bold border border-purple-500 transition shadow">💾 SAVE</button>
                    </div>

                    <div class="flex items-center flex-wrap gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner ${window.activeTab !== 'giftcards' ? 'hidden' : ''}">
                        <button onclick="window.copyAllGiftCards(this)" class="bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-500 transition shadow">📋 Copy All</button>
                        <button onclick="window.toggleAddGiftCardForm()" class="bg-slate-700 hover:bg-slate-600 text-white px-2 py-0.5 rounded text-[10px] font-bold border border-slate-500 transition shadow">➕ Add Card</button>
                        <button onclick="window.toggleRemoveGiftCardForm()" class="bg-slate-700 hover:bg-slate-600 text-white px-2 py-0.5 rounded text-[10px] font-bold border border-red-500/50 transition shadow">🗑️ Remove</button>
                        <div id="addGiftCardForm" class="hidden w-full flex flex-col gap-1.5 mt-1">
                            <input id="newGiftCardSerial" type="text" maxlength="16" placeholder="Serial (16 digits)" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm font-mono text-slate-200 outline-none focus:border-emerald-500 shadow-inner">
                            <div class="flex gap-1.5 justify-between">
                                <button onclick="window.selectGiftCardAmount(this, 100)" class="amount-box flex-1 bg-slate-900 border border-slate-700 rounded py-1 text-[11px] font-bold text-slate-300 hover:border-emerald-500 transition">100</button>
                                <button onclick="window.selectGiftCardAmount(this, 200)" class="amount-box flex-1 bg-slate-900 border border-slate-700 rounded py-1 text-[11px] font-bold text-slate-300 hover:border-emerald-500 transition">200</button>
                                <button onclick="window.selectGiftCardAmount(this, 250)" class="amount-box flex-1 bg-slate-900 border border-slate-700 rounded py-1 text-[11px] font-bold text-slate-300 hover:border-emerald-500 transition">250</button>
                            </div>
                            <div id="addGiftCardMsg" class="text-[10px] font-bold text-red-400 hidden"></div>
                            <div class="flex gap-1.5">
                                <button onclick="window.submitNewGiftCard()" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded py-1.5 text-[10px] font-bold uppercase tracking-wider transition shadow border border-emerald-500">Add</button>
                                <button onclick="window.toggleAddGiftCardForm()" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded py-1.5 text-[10px] font-bold uppercase tracking-wider transition shadow border border-slate-500">Cancel</button>
                            </div>
                        </div>
                        <div id="removeGiftCardForm" class="hidden w-full flex flex-col gap-1.5 mt-1">
                            <select id="removeGiftCardSelect" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm font-mono text-slate-200 outline-none focus:border-red-500 shadow-inner">
                                ${flatGiftCards.map(c => `<option value="${c.serial}">Card #${c.index || '?'} — ${c.amount || c.serial}</option>`).join('')}
                            </select>
                            <div id="removeGiftCardMsg" class="text-[10px] font-bold text-red-400 hidden"></div>
                            <div class="flex gap-1.5">
                                <button onclick="window.submitRemoveGiftCard()" class="flex-1 bg-red-600 hover:bg-red-500 text-white rounded py-1.5 text-[10px] font-bold uppercase tracking-wider transition shadow border border-red-500">Remove</button>
                                <button onclick="window.removeAllGiftCards()" class="flex-1 bg-red-900 hover:bg-red-800 text-white rounded py-1.5 text-[10px] font-bold uppercase tracking-wider transition shadow border border-red-700">Remove All</button>
                            </div>
                            <button onclick="window.toggleRemoveGiftCardForm()" class="w-full bg-slate-700 hover:bg-slate-600 text-white rounded py-1.5 text-[10px] font-bold uppercase tracking-wider transition shadow border border-slate-500">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="forecastView" class="flex flex-col gap-2 pb-2 ${window.activeTab === 'goal' ? '' : 'hidden'}">
                ${allForecastsHTML}
            </div>
            
            <div id="redeemedView" class="flex overflow-x-auto gap-3 pb-2 ${window.activeTab === 'redeemed' ? '' : 'hidden'}" style="scrollbar-width: thin; scrollbar-color: #334155 transparent;">
                ${redeemedHTML}
            </div>
            
            <div id="giftcardsView" class="flex overflow-x-auto gap-3 pb-2 ${window.activeTab === 'giftcards' ? '' : 'hidden'}" style="scrollbar-width: thin; scrollbar-color: #334155 transparent;">
                ${giftcardsViewHTML}
            </div>

            <div id="batchView" class="flex flex-col gap-2 pb-2 ${window.activeTab === 'batch' ? '' : 'hidden'}">
                ${batchHTML}
            </div>
        </div>
    `;
    
    if (window.activeTab === 'goal') checkCustomGoal(); 
}

function checkCustomGoal() {
    const input = document.getElementById('customGoalDays');
    const resultSpan = document.getElementById('customGoalResult');
    if (!input || !input.value) { resultSpan.innerHTML = '-'; return; }
    
    const daysToCheck = parseInt(input.value);
    if (isNaN(daysToCheck) || daysToCheck < 1) { resultSpan.innerHTML = '-'; return; }
    
    let total2 = 0;
    for (let d = 1; d <= daysToCheck; d++) {
        if (globalGoalMap2[d]) total2 += globalGoalMap2[d].length;
    }
    
    resultSpan.innerHTML = `<span class="text-green-400 font-bold">${total2}</span> <span class="text-slate-400">Accs</span>`;
}

// Toggle the Add Gift Card inline form in the Vault cube
window.toggleAddGiftCardForm = function() {
    const form = document.getElementById('addGiftCardForm');
    if (!form) return;
    const wasHidden = form.classList.contains('hidden');
    form.classList.toggle('hidden', !wasHidden);
    if (wasHidden) {
        const msg = document.getElementById('addGiftCardMsg');
        if (msg) msg.classList.add('hidden');
        form.querySelectorAll('.amount-box').forEach(b => {
            b.classList.remove('border-emerald-500', 'text-emerald-400');
        });
    }
};

// Highlight the selected amount box (100 / 200 / 250)
window.selectGiftCardAmount = function(btn, amount) {
    btn.closest('div').querySelectorAll('.amount-box').forEach(b => {
        b.classList.remove('border-emerald-500', 'text-emerald-400');
    });
    btn.classList.add('border-emerald-500', 'text-emerald-400');
};

// Submit the new gift card to the server
window.submitNewGiftCard = async function() {
    const serialEl = document.getElementById('newGiftCardSerial');
    const msgEl = document.getElementById('addGiftCardMsg');
    const selected = document.querySelector('#addGiftCardForm .amount-box.border-emerald-500');
    if (!serialEl || !msgEl) return;

    const serial = serialEl.value.replace(/\s+/g, '');
    const amount = selected ? parseInt(selected.textContent, 10) : 0;

    msgEl.classList.remove('hidden');
    if (!/^\d{16}$/.test(serial)) {
        msgEl.textContent = 'Serial must be exactly 16 digits';
        msgEl.className = 'text-[10px] font-bold text-red-400';
        return;
    }
    if (![100, 200, 250].includes(amount)) {
        msgEl.textContent = 'Select an amount (100 / 200 / 250)';
        msgEl.className = 'text-[10px] font-bold text-red-400';
        return;
    }

    try {
        const res = await fetch('/api/giftcard/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serial, amount })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            globalGiftCards = (Array.isArray(globalGiftCards) ? globalGiftCards : []).concat(data.card);
            msgEl.textContent = 'Card added!';
            msgEl.className = 'text-[10px] font-bold text-emerald-400';
            setTimeout(() => renderGoalTable(), 600);
        } else {
            msgEl.textContent = data.error || 'Failed to add card';
            msgEl.className = 'text-[10px] font-bold text-red-400';
        }
    } catch (err) {
        msgEl.textContent = 'Network error: ' + (err.message || 'Unknown error');
        msgEl.className = 'text-[10px] font-bold text-red-400';
    }
};

// Toggle the Remove Gift Card inline form in the Vault cube
window.toggleRemoveGiftCardForm = function() {
    const form = document.getElementById('removeGiftCardForm');
    if (!form) return;
    const wasHidden = form.classList.contains('hidden');
    form.classList.toggle('hidden', !wasHidden);
    if (wasHidden) {
        const msg = document.getElementById('removeGiftCardMsg');
        if (msg) msg.classList.add('hidden');
    }
};

// Remove a specific gift card selected from the dropdown
window.submitRemoveGiftCard = async function() {
    const selectEl = document.getElementById('removeGiftCardSelect');
    const msgEl = document.getElementById('removeGiftCardMsg');
    if (!selectEl || !msgEl) return;

    const serial = selectEl.value;
    if (!serial) {
        msgEl.classList.remove('hidden');
        msgEl.textContent = 'No gift cards in the vault';
        msgEl.className = 'text-[10px] font-bold text-red-400';
        return;
    }

    try {
        const res = await fetch('/api/giftcard/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serial })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            globalGiftCards = data.giftCards || [];
            msgEl.textContent = 'Card removed!';
            msgEl.className = 'text-[10px] font-bold text-emerald-400';
            setTimeout(() => renderGoalTable(), 600);
        } else {
            msgEl.textContent = data.error || 'Failed to remove card';
            msgEl.className = 'text-[10px] font-bold text-red-400';
        }
    } catch (err) {
        msgEl.textContent = 'Network error: ' + (err.message || 'Unknown error');
        msgEl.className = 'text-[10px] font-bold text-red-400';
    }
};

// Remove ALL gift cards from the vault (with confirmation)
window.removeAllGiftCards = async function() {
    if (!confirm('Remove ALL gift cards from the vault?')) return;
    try {
        const res = await fetch('/api/giftcard/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ all: true })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            globalGiftCards = [];
            renderGoalTable();
        } else {
            alert(data.error || 'Failed to remove cards');
        }
    } catch (err) {
        alert('Network error: ' + (err.message || 'Unknown error'));
    }
};

// Save the Redeemed start date to giftCards.json
window.saveRedeemStartDate = async function(btnElement) {
    const inputEl = document.getElementById('redeemStartDate');
    if (!inputEl || !btnElement) return;

    const originalText = btnElement.innerHTML;
    try {
        const res = await fetch('/api/giftcard/startdate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: inputEl.value })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            globalRedeemStartDate = data.startDate || '';
            btnElement.innerHTML = '<span>✅ SAVED</span>';
            setTimeout(() => renderGoalTable(), 600);
        } else {
            btnElement.innerHTML = '<span>⚠️ ' + (data.error || 'FAILED') + '</span>';
            setTimeout(() => { btnElement.innerHTML = originalText; }, 2000);
        }
    } catch (err) {
        btnElement.innerHTML = '<span>⚠️ ERROR</span>';
        setTimeout(() => { btnElement.innerHTML = originalText; }, 2000);
    }
};

// Function to copy all gift card serials from the vault
window.copyAllGiftCards = function(btnElement) {
    let flatGiftCards = Array.isArray(globalGiftCards) ? globalGiftCards.flat(Infinity) : [];
    
    let codes = flatGiftCards
        .map(c => c.serial)
        .filter(s => s && s !== 'N/A')
        .join('\n');
    
    if (codes) {
        navigator.clipboard.writeText(codes).then(() => {
            const originalText = btnElement.innerHTML;
            btnElement.innerHTML = '<span>✅ COPIED!</span>';
            btnElement.classList.replace('bg-emerald-700', 'bg-green-600');
            btnElement.classList.replace('hover:bg-emerald-600', 'hover:bg-green-500');
            
            setTimeout(() => {
                btnElement.innerHTML = originalText;
                btnElement.classList.replace('bg-green-600', 'bg-emerald-700');
                btnElement.classList.replace('hover:bg-green-500', 'hover:bg-emerald-600');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy', err);
            alert('Clipboard access denied or failed.');
        });
    } else {
        alert('No codes available to copy!');
    }
};