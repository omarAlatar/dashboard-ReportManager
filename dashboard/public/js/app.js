// ==========================================
// 🚀 MAIN ORCHESTRATOR & FETCH ENGINE
// ==========================================

async function fetchData() {
    try {
        const response = await fetch('/api/data');
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        
        if (Array.isArray(data)) { 
            globalAccounts = data; 
        } else {
            globalAccounts = data.accounts || [];
            globalBannedOrders = data.bannedOrders || [];
            globalGiftCards = data.giftCards || [];
            globalRedeemStartDate = data.giftCardStartDate || globalRedeemStartDate || '';
            window.orderLinks = data.orderLinks || {};
        }
        
        // Fetch batch state & render Master Run Progress panel
        try {
            const batchRes = await fetch('/api/batch-state');
            if (batchRes.ok) {
                window.globalBatchState = await batchRes.json();
            }
        } catch(e) {}
        renderBatchState();

        updateAccountsBadge();
        renderChart();
        renderCards(); // This automatically redraws the Swap View panel!

    } catch (err) {
        console.error("Fetch data failed:", err);
        const grid = document.getElementById('grid');
        if (grid) {
            grid.innerHTML = '<div class="col-span-full text-center danger">Error loading data. Make sure the server is running.</div>';
        }
    }
}

// ==========================================
// 🧮 MANUAL POINTS CALCULATOR LOGIC
// ==========================================

window.toggleCalcPanel = function() {
    const panel = document.getElementById('calcPanelContent');
    const isHidden = panel.classList.contains('opacity-0');
    
    // Auto-inject Visual Search tracker & Gift Card Goal into UI if missing
    const btnRow = panel.querySelector('button')?.parentElement;
    if (btnRow && !document.getElementById('calcVisualInput')) {
        const html = `
            <div class="mb-3">
                <label class="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1 block">Visual Search Tracker</label>
                <select id="calcVisualInput" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm text-slate-300 outline-none focus:border-blue-500 shadow-inner">
                    <option value="true">Enabled (4 Pieces / Wk)</option>
                    <option value="false">Disabled (3 Pieces / Wk)</option>
                </select>
            </div>
            <div class="mb-4">
                <label class="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1 flex justify-between">
                    <span>Gift Card Goal</span>
                    <span class="text-indigo-400 font-normal lowercase">(optional)</span>
                </label>
                <input type="number" id="calcGiftCardPrice" min="0" placeholder="e.g. 2780 for 100 EGP" class="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono outline-none focus:border-indigo-500 shadow-inner">
            </div>
        `;
        btnRow.insertAdjacentHTML('beforebegin', html);
    }

    if (isHidden) {
        panel.classList.remove('opacity-0', 'pointer-events-none', '-translate-x-4');
        panel.classList.add('opacity-100', 'translate-x-0');
        const startDateInput = document.getElementById('calcStartDateInput');
        if (startDateInput && !startDateInput.value) {
            const now = new Date();
            startDateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }
        setTimeout(() => document.getElementById('calcEndDayInput').focus(), 100);
    } else {
        panel.classList.remove('opacity-100', 'translate-x-0');
        panel.classList.add('opacity-0', 'pointer-events-none', '-translate-x-4');
    }
};

window.runManualCalc = function() {
    const startDateStr = document.getElementById('calcStartDateInput').value;
    const endDayInput = document.getElementById('calcEndDayInput').value;
    const level = document.getElementById('calcLevelInput').value;
    const resultDiv = document.getElementById('calcResult');
    
    // Read the value from the Visual Search toggle
    const visualSelect = document.getElementById('calcVisualInput');
    const visualEnabled = visualSelect ? visualSelect.value === 'true' : true;

    // Read the Gift Card Goal Value
    const gcPriceInput = document.getElementById('calcGiftCardPrice');
    const gcPrice = gcPriceInput && gcPriceInput.value ? parseInt(gcPriceInput.value) : 0;
    
    const endDay = parseInt(endDayInput);
    
    // Parse the From Date in LOCAL time (avoid UTC drift on month/day boundaries)
    const dateParts = startDateStr ? startDateStr.split('-').map(Number) : null;
    if (!dateParts || dateParts.length !== 3 || isNaN(endDay) || endDay < 1) {
        resultDiv.innerHTML = '<div class="text-red-400 font-bold text-center">⚠️ Please enter a valid From Date and To Day.</div>';
        resultDiv.classList.remove('hidden');
        return;
    }

    // Day 1 of the simulation = the selected From Date (fresh account starting there)
    const baseDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);

    // Mathematically calculate how many absolute pieces a continuous streak would have accumulated before the Start Day
    const piecesPerWeek = visualEnabled ? 4 : 3;
    const absoluteStartPieces = 0;

    let totalEarned = 0;
    let currentBalance = 0;
    let milestones = [];

    for (let i = 1; i <= endDay; i++) {
        let simDate = new Date(baseDate);
        simDate.setDate(baseDate.getDate() + (i - 1));
        let simDateStr = `${simDate.getFullYear()}-${String(simDate.getMonth() + 1).padStart(2, '0')}-${String(simDate.getDate()).padStart(2, '0')}`;
        
        let calcConfig = { 
            baselineStreak: 0,
            bingAppStreak: 0,
            dailySetStreak: 0,
            bingSearchStreak: 0,
            visualSearchStreak: 0,
            baselinePieces: absoluteStartPieces,
            visualSearchEnabled: visualEnabled,
            isSignUpDay: (i === 1),
            edgeOnboarding10Days: 1
        };

        const dayPoints = window.calculateExpectedPoints(simDateStr, i, level, calcConfig).total;
        
        totalEarned += dayPoints;
        currentBalance += dayPoints;

        // Milestone Deduction Logic
        if (gcPrice > 0 && currentBalance >= gcPrice) {
            const timesReached = Math.floor(currentBalance / gcPrice);
            for (let j = 0; j < timesReached; j++) {
                milestones.push(i);
                currentBalance -= gcPrice; // Deduct the points after redeeming
            }
        }
    }

    const endSimDate = new Date(baseDate);
    endSimDate.setDate(baseDate.getDate() + (endDay - 1));
    const endSimDateStr = `${endSimDate.getFullYear()}-${String(endSimDate.getMonth() + 1).padStart(2, '0')}-${String(endSimDate.getDate()).padStart(2, '0')}`;
    
    let finalCalcConfig = { 
        baselineStreak: 0,
        bingAppStreak: 0,
        dailySetStreak: 0,
        bingSearchStreak: 0,
        visualSearchStreak: 0,
        baselinePieces: absoluteStartPieces,
            visualSearchEnabled: visualEnabled,
            isSignUpDay: (endDay === 1),
            edgeOnboarding10Days: 1
        };

        const { total, breakdown } = window.calculateExpectedPoints(endSimDateStr, endDay, level, finalCalcConfig);
    const oneTimeQuests = breakdown.oneTimePromos;
    
    let html = `
        <div class="text-center mb-3 pb-3 border-b border-slate-700/80">
            <span class="text-[10px] text-slate-400 uppercase tracking-wider font-bold block mb-1">Total Earned (${startDateStr} → ${endSimDateStr})</span>
            <div class="text-3xl font-black text-emerald-400 leading-none mb-3" title="Cumulative Total without deductions">+${totalEarned.toLocaleString()} <span class="text-sm font-normal text-slate-500">pts</span></div>
            
            <span class="text-[10px] text-slate-400 uppercase tracking-wider font-bold block mb-1">Points Gained ON ${endSimDateStr}</span>
            <div class="text-xl font-black text-indigo-400 leading-none" title="Points for this specific day">+${total.toLocaleString()} <span class="text-sm font-normal text-slate-500">pts</span></div>
        </div>
        
        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-mono">
            <div class="flex justify-between text-slate-300"><span>SignIn:</span> <span class="text-green-400">+${breakdown.dailySignIn}</span></div>
            <div class="flex justify-between text-slate-300"><span>Set:</span> <span class="text-green-400">+${breakdown.dailySet}</span></div>
            <div class="flex justify-between text-slate-300"><span>Search:</span> <span class="text-green-400">+${breakdown.dailySearch}</span></div>
            <div class="flex justify-between text-slate-300"><span>Read:</span> <span class="text-green-400">+${breakdown.readToEarn}</span></div>
            <div class="flex justify-between text-slate-300"><span>MorePromo:</span> <span class="text-green-400">+${breakdown.morePromo}</span></div>
        </div>
    `;
    
    if (breakdown.edgeOnboarding > 0) {
        html += `
            <div class="flex justify-between items-center border-t border-slate-700/80 pt-2 mt-2">
                <span class="text-[10px] uppercase font-bold text-blue-300">🎁 Edge Onboard:</span> 
                <span class="text-blue-400 font-black text-sm">+${breakdown.edgeOnboarding}</span>
            </div>
        `;
    }

    if (breakdown.starBonus > 0) {
        html += `
            <div class="flex justify-between items-center border-t border-slate-700/80 pt-2 mt-2">
                <span class="text-[10px] uppercase font-bold text-yellow-300">⭐ Star Bonus:</span> 
                <span class="text-yellow-400 font-black text-sm">+${breakdown.starBonus}</span>
            </div>
        `;
    }

    if (breakdown.monthlyLevel > 0) {
        html += `
            <div class="flex justify-between items-center border-t border-slate-700/80 pt-2 mt-2">
                <span class="text-[10px] uppercase font-bold text-indigo-300">🎁 Monthly Level Bonus:</span> 
                <span class="text-indigo-400 font-black text-sm">+${breakdown.monthlyLevel}</span>
            </div>
        `;
    }

    if (breakdown.monthlyLevelCoupon > 0) {
        html += `
            <div class="flex justify-between items-center border-t border-slate-700/80 pt-2 mt-2">
                <span class="text-[10px] uppercase font-bold text-pink-300">🎟️ Redemption Coupon:</span> 
                <span class="text-pink-400 font-black text-sm">+${breakdown.monthlyLevelCoupon}</span>
            </div>
        `;
    }

    if (breakdown.monthlyDse > 0) {
        html += `
            <div class="flex justify-between items-center border-t border-slate-700/80 pt-2 mt-2">
                <span class="text-[10px] uppercase font-bold text-cyan-300">🔍 Default Search Bonus:</span> 
                <span class="text-cyan-400 font-black text-sm">+${breakdown.monthlyDse}</span>
            </div>
        `;
    }

    if (oneTimeQuests > 0) {
        html += `
            <div class="flex justify-between items-center border-t border-slate-700/80 pt-2 mt-2">
                <span class="text-[10px] uppercase font-bold text-purple-300">🎁 One-Time Quests:</span> 
                <span class="text-purple-400 font-black text-sm">+${oneTimeQuests.toLocaleString()}</span>
            </div>
        `;
    }

    // NEW: Goal Tracker Render Logic
    if (gcPrice > 0) {
        let milestonesHtml = milestones.length > 0
            ? milestones.map((day, idx) => `
                <div class="flex justify-between items-center text-[11px] border-t border-slate-700/50 pt-1.5 mt-1.5">
                    <span class="text-indigo-300 font-mono">Redemption #${idx + 1}:</span>
                    <span class="text-green-400 font-bold bg-green-900/30 px-1.5 py-0.5 rounded">Reached Day ${day}</span>
                </div>`).join('')
            : `<div class="text-[11px] text-slate-500 text-center italic mt-2 mb-1">Goal not reached in this timeframe.</div>`;

        html += `
            <div class="mt-4 p-2.5 bg-slate-950/80 rounded-lg border border-indigo-500/40 shadow-inner">
                <span class="text-[10px] text-indigo-400 uppercase tracking-wider font-bold block mb-1">🏆 Goal Tracker (${gcPrice.toLocaleString()} pts)</span>
                <div class="max-h-32 overflow-y-auto pr-1">
                    ${milestonesHtml}
                </div>
                <div class="flex justify-between items-center text-[11px] border-t border-slate-600 pt-2 mt-2 font-bold">
                    <span class="text-slate-400">Remaining Balance:</span>
                    <span class="text-yellow-400">${currentBalance.toLocaleString()} pts</span>
                </div>
            </div>
        `;
    }
    
    resultDiv.innerHTML = html;
    resultDiv.classList.remove('hidden');
};

// ==========================================
// 🛠️ EVENTS & INITIALIZATION
// ==========================================

document.getElementById('calcStartDateInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') window.runManualCalc();
});
document.getElementById('calcEndDayInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') window.runManualCalc();
});

window.onclick = function(event) {
    const modal = document.getElementById('accountModal');
    if (event.target == modal) { 
        if (window.closeModal) window.closeModal(); 
    }
}

// Initial fire
fetchData();
setInterval(fetchData, 60000);

// ==========================================
// 🚀 MASTER RUN PROGRESS TRACKER
// ==========================================
async function renderBatchState() {
    try {
        const response = await fetch('/api/batch-state');
        if (!response.ok) return;
        
        const payload = await response.json();
        const batches = Array.isArray(payload) ? payload : (payload?.batches || []);
        const spread = (!Array.isArray(payload) && payload?.spread) || null;
        const container = document.getElementById('batch-state-container');
        if (!container) return;

        // Hide section if no run data exists
        if (!batches || batches.length === 0) {
            container.innerHTML = '';
            return;
        }

        const fmtGap = (ms) => {
            const totalMin = Math.round((ms || 0) / 60000);
            const h = Math.floor(totalMin / 60), m = totalMin % 60;
            return h > 0 ? `${h}h ${m}m` : `${m} min`;
        };

        let consumedEmails = 0;
        let spreadRemainingMs = 0;
        let nextGapMs = null;
        let gapsLeft = 0;
        let currentGapHtml = '', gapsByEmail = {};
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
            const remainingGaps = consumedEmails <= 0 ? spread.gaps : spread.gaps.slice(consumedEmails - 1);
            const activeGaps = remainingGaps.filter(g => (g || 0) > 0);
            spreadRemainingMs = remainingGaps.reduce((a, g) => a + (g || 0), 0);
            gapsLeft = activeGaps.length;
            nextGapMs = activeGaps[0] || null;

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
                <div class="${isNow ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-800 border-gray-700'} rounded-lg p-3 border flex flex-col justify-between shadow-sm">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-bold text-gray-200">⏳ Gap</span>
                        <span class="${isDone ? 'text-green-400' : isNow ? 'text-blue-300' : 'text-blue-400'} text-xs font-bold px-2 py-1 rounded bg-gray-900${isNow ? ' animate-pulse' : ''}">${isDone ? '✅ Done' : isNow ? 'Now' : 'Wait'}</span>
                    </div>
                    <div class="text-sm text-gray-400 mb-2">Before Batch <span class="text-white">${batchNum}</span></div>
                    <div class="text-xs text-gray-500 bg-gray-900 rounded p-2 text-center">
                        <span class="text-blue-400 font-bold">⏱️ ${fmtGap(ms)}</span>
                    </div>
                </div>
            `;
            };

            gapsByEmail = {};
            gapEntries.forEach(({ ms, nextBatchNum, attachBatch, done, isCurrent }) => {
                if (isCurrent) {
                    currentGapHtml = gapCardHtml(ms, nextBatchNum, 'now');
                } else {
                    (gapsByEmail[attachBatch] = gapsByEmail[attachBatch] || []).push(gapCardHtml(ms, nextBatchNum, done ? 'done' : 'wait'));
                }
            });
        }

        let firstStartTime = null;
        let lastEndTime = null;
        let completedCount = 0;

        const batchesWithIndex = batches.map((b, idx) => ({ ...b, displayIndex: idx + 1 }));

        batchesWithIndex.sort((a, b) => {
            if (a.completed && !b.completed) return 1;
            if (!a.completed && b.completed) return -1;
            return a.displayIndex - b.displayIndex;
        });

        const batchCards = batchesWithIndex.map((b) => {
            if (b.startTime && (!firstStartTime || new Date(b.startTime) < new Date(firstStartTime))) {
                firstStartTime = b.startTime;
            }
            if (b.endTime && (!lastEndTime || new Date(b.endTime) > new Date(lastEndTime))) {
                lastEndTime = b.endTime;
            }
            if (b.completed) completedCount++;

            const statusColor = b.completed ? 'text-green-400' : (b.startTime ? 'text-blue-400 animate-pulse' : 'text-gray-500');
            const statusIcon = b.completed ? '✅' : (b.startTime ? '⏳' : '⏸️');
            
            let durationStr = 'Waiting';
            if (b.startTime) {
                const end = b.endTime ? new Date(b.endTime) : new Date();
                durationStr = `${Math.round((end - new Date(b.startTime)) / 60000)} min`;
                if (!b.endTime) durationStr += ' (Active)';
            }

            const emailList = Array.isArray(b.emails) ? b.emails.join(', ') : '';
            const emailHtml = emailList ? `
                    <div class="text-xs text-gray-500 mt-1 truncate" title="${emailList}">📧 ${emailList}</div>` : '';

            return `
                <div class="bg-gray-800 rounded-lg p-3 border border-gray-700 flex flex-col justify-between shadow-sm">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-bold text-gray-200">Batch ${b.displayIndex}</span>
                        <span class="${statusColor} text-xs font-bold px-2 py-1 rounded bg-gray-900">${statusIcon} ${b.completed ? 'Done' : (b.startTime ? 'Active' : 'Pending')}</span>
                    </div>
                    <div class="text-sm text-gray-400 mb-2">Accounts <span class="text-white">${b.start} - ${b.end}</span></div>
                    ${emailHtml}
                    <div class="text-xs text-gray-500 flex justify-between bg-gray-900 rounded p-2">
                        <span>⏱️ ${durationStr}</span>
                        <span>🕒 ${b.endTime ? new Date(b.endTime).toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit'}) : (b.startTime ? new Date(b.startTime).toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit'}) : '--:--')}</span>
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
        const runEnded = !!(lastEndTime && completedCount === batches.length);

        let accountsTotal = 0, accountsDone = 0;
        batches.forEach(b => {
            const cnt = (parseInt(b.end) || 0) - (parseInt(b.start) || 0) + 1;
            accountsTotal += cnt;
            if (b.completed) accountsDone += cnt;
            else accountsDone += (parseInt(b.emailsDone) || 0);
        });
        const accountsLeft = Math.max(0, accountsTotal - accountsDone);

        const progressPercent = Math.round((completedCount / batches.length) * 100) || 0;

        const html = `
            <div class="bg-gray-900 rounded-xl p-6 shadow-xl border border-gray-800 h-full flex flex-col">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-white flex items-center"><span class="mr-2">🚀</span> Master Run Progress</h3>
                    <span class="text-sm text-gray-400">Total Time: <span class="text-blue-400 font-bold">${overallDuration}</span></span>
                </div>
                
                ${spread ? `
                <div class="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-blue-400 bg-gray-800/60 rounded-lg px-3 py-2 mb-2">
                    <span>⏳ Spread: <b>${fmtGap(spread.totalMs)}</b> total</span>
                    <span>Remaining: <b>${fmtGap(spreadRemainingMs)}</b> (${gapsLeft} gaps)</span>
                    ${nextGapMs ? `<span>Next gap: <b>${fmtGap(nextGapMs)}</b></span>` : ''}
                </div>` : ''}
                
                <div class="w-full bg-gray-800 rounded-full h-3 mb-2 overflow-hidden">
                    <div class="bg-blue-500 h-3 rounded-full transition-all duration-500 ease-in-out" style="width: ${progressPercent}%"></div>
                </div>
                <div class="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-gray-400 mb-2">
                    <span>Started: ${firstStartTime ? new Date(firstStartTime).toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit'}) : 'Waiting...'}</span>
                    ${runEnded ? `<span>Ended: <span class="text-blue-400 font-bold">${new Date(lastEndTime).toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit'})}</span></span>` : ''}
                    <span>${completedCount} of ${batches.length} batches completed (${progressPercent}%)</span>
                    <span>${accountsLeft > 0 ? `Accounts left: <span class="text-blue-400 font-bold">${accountsLeft}</span>` : '<span class="text-green-400 font-bold">All accounts done</span>'}</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pr-2 custom-scrollbar flex-grow">
                    ${currentGapHtml}${batchCards}
                </div>
            </div>
        `;

        container.innerHTML = html;
    } catch (error) {
        console.error('Error rendering batch state:', error);
    }
}