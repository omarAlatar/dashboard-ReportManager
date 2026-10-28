// ==========================================
// 🔎 ACCOUNT MODAL MODULE
// ==========================================

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatWarning(w) {
    if (typeof w === 'string') {
        return `<li class="text-red-400 text-sm list-disc ml-4">${escapeHtml(w)}</li>`;
    }
    if (w && typeof w === 'object') {
        const attrs = w.attributes || {};
        const title = w.name || w.title || attrs.title || attrs.name || '';
        const desc = w.description || attrs.description || (attrs.complete === 'False' ? 'Incomplete' : '') || '';
        const type = w.promotionType || attrs.type || attrs.offerid || '';
        const priority = w.priority;
        const dest = w.destinationUrl || attrs.destination || '';
        const isBot = /UserWarning|BotScore/i.test(title + ' ' + String(w.name || ''));
        return `
            <li class="text-red-400 text-sm list-disc ml-4 my-1">
                <span class="${isBot ? 'text-red-500 font-bold' : 'text-red-400 font-medium'}">⚠️ ${escapeHtml(title || 'Account Warning')}</span>
                ${desc ? `<div class="text-red-400/80 text-xs mt-0.5">${escapeHtml(desc)}</div>` : ''}
                <div class="text-[10px] uppercase text-red-300/60 mt-0.5">
                    ${type ? `<span>${escapeHtml(type)}</span>` : ''}
                    ${priority ? `<span class="ml-1">priority ${escapeHtml(priority)}</span>` : ''}
                    ${dest ? `<a class="text-red-300 underline normal-case ml-1" href="${escapeHtml(dest)}" target="_blank" rel="noopener">learn more</a>` : ''}
                </div>
            </li>`;
    }
    return `<li class="text-red-400 text-sm list-disc ml-4">Unknown warning: ${escapeHtml(String(w))}</li>`;
}

async function openModal(email, specificDate) {
    document.getElementById('accountModal').classList.remove('hidden');
    document.getElementById('modalTitle').innerText = email + ' (Loading...)';
    document.getElementById('modalBody').innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 text-slate-400">
            <svg class="w-10 h-10 text-blue-500 mb-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p class="font-bold tracking-wider uppercase text-xs">Downloading full account details...</p>
        </div>
    `;

    try {
        const res = await fetch(`/api/account?email=${encodeURIComponent(email)}`);
        const fullAccData = await res.json();
        
        if (fullAccData.error) throw new Error(fullAccData.error);
        
        const acc = fullAccData;
        if (fullAccData.orderLinks) window.orderLinks = fullAccData.orderLinks || window.orderLinks || {};

        const targetDate = specificDate || cardSelections[email] || acc.latest.date;
        const displayedEntry = acc.history.find(h => h.date === targetDate) || acc.latest;
        
        const b = displayedEntry.pointsBreakdown || {};
        const h = displayedEntry.accountHealth || {};
        const i = displayedEntry.accountInfo || {};
        const apiPointsToday = getRealPointsForDay(acc, targetDate);
        const scriptCollectedPts = displayedEntry.collectedPoints || 0;
        
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
        const adjustedTarget = 6950 - totalCouponValue;
        const pointsNeeded = Math.max(0, adjustedTarget - currentPoints);
        const isGoalReached = pointsNeeded === 0;

        let simDays = 0;
        let expectedDateStr = '';
        
        if (!isGoalReached) {
            let simBal = currentPoints;
            let simStreakDay = parseInt(i.currentStreak) || 0;
            let simCyclePos = window.flaggedCycleSeed(parseInt(b.dailyCheckIn) || 0);
            let cycleSkipDays = window.flaggedRestDays(acc.email, 0);
            let cycleIndex = 0;
            let isFlagged = window.isBotFlaggedAccount(acc);
            let lvl = i.level || 'Unknown';
            
            let simConfig = {
                baselineStreak: simStreakDay,
                bingAppStreak: parseInt(i.bingAppStreak) || simStreakDay,
                dailySetStreak: parseInt(i.dailySetStreak) || simStreakDay,
                bingSearchStreak: parseInt(i.bingSearchStreak) || simStreakDay,
                visualSearchStreak: parseInt(i.visualSearchStreak) || simStreakDay,
                baselinePieces: parseInt(i.puzzlePieces) || 0,
                visualSearchEnabled: i.visualSearchInfo?.enabled !== false,
                isSignUpDay: false,
                edgeOnboarding10Days: parseInt(i.edgeOnboarding10Days) || 0,
                monthlyLevelState: i.bonuses?.monthlyLevel?.state || '',
                monthlyLevelStateDate: targetDate,
                monthlyDseState: i.bonuses?.monthlyDse?.state || '',
                monthlyDseStateDate: targetDate
            };
            
            let simDateObj = new Date(targetDate);
            
            while (simBal < adjustedTarget && simDays < 100) {
                simDays++;
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
            }
            
            expectedDateStr = `${String(simDateObj.getMonth() + 1).padStart(2, '0')}-${String(simDateObj.getDate()).padStart(2, '0')}`;
        }
        
        document.getElementById('modalTitle').innerText = acc.email + ` (${targetDate})`;

        const rawWarnings = h.warnings || [];
        const seenWarnings = new Set();
        let warningsHTML = '';
        for (const w of rawWarnings) {
            const key = typeof w === 'string' ? w : JSON.stringify(w);
            if (seenWarnings.has(key)) continue;
            seenWarnings.add(key);
            warningsHTML += formatWarning(w);
        }
        if (displayedEntry.hasBotWarning && !/UserWarning|BotScore/i.test(JSON.stringify(rawWarnings))) {
            warningsHTML += `<li class="text-red-500 text-sm list-disc ml-4 font-bold">⚠️ Bot Warning: Impression_Fraud_UserWarning_BotScore Detected!</li>`;
        }

        let ordersHTML = '';
        if (i.orderHistory && i.orderHistory.length > 0) {
            const orderedHistory = [...i.orderHistory].reverse();
            ordersHTML = `
            <div class="bg-slate-900/50 p-5 rounded-xl border border-slate-700">
                <h3 class="text-blue-400 font-bold mb-3 border-b border-slate-700 pb-2 uppercase tracking-wide text-xs">Order History</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm text-slate-300">
                        <thead class="text-xs uppercase text-slate-400 border-b border-slate-700">
                            <tr>
                                <th class="pb-2">Date</th>
                                <th class="pb-2">Item</th>
                                <th class="pb-2">Points</th>
                                <th class="pb-2">Status</th>
                                <th class="pb-2">Link</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-700/50">
                            ${orderedHistory.map(o => {
                                let mappedTitle = itemMap[o.title] || itemMap[o.id] || o.title || 'Unknown Reward';
                                const savedLink = window.orderLinks && window.orderLinks[o.id] ? window.orderLinks[o.id] : null;
                                return `
                                <tr class="hover:bg-slate-800/50">
                                    <td class="py-2 whitespace-nowrap">${new Date(o.date).toLocaleDateString('en-GB', { timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric' })} ${new Date(o.date).toLocaleTimeString('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' })}</td>
                                    <td class="py-2 truncate max-w-[150px]" title="${mappedTitle}">${mappedTitle}</td>
                                    <td class="py-2">${o.points.toLocaleString()}</td>
                                    <td class="py-2 font-bold ${o.status === 'Cancelled' ? 'text-red-400' : o.status === 'Shipped' ? 'text-green-400' : 'text-orange-400'}">${o.status}</td>
                                    <td class="py-2">${savedLink ? (savedLink.link ? `<a href="${savedLink.link}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-[10px] bg-blue-900/50 hover:bg-blue-800/70 text-blue-300 px-2 py-1 rounded border border-blue-700/50 hover:border-blue-500 transition" title="${savedLink.link}">🔗 Open</a>` : (savedLink.codes && savedLink.codes.length > 0 ? `<span class="flex flex-wrap gap-1">${savedLink.codes.map(c => `<button onclick="event.stopPropagation(); copyToClipboard('${String(c).replace(/'/g, "\\'")}', this)" class="inline-flex items-center gap-1 text-[10px] bg-green-900/50 hover:bg-green-800/70 text-green-300 px-2 py-1 rounded border border-green-700/50 hover:border-green-500 transition" title="${c}">📋 Code</button>`).join('')}</span>` : `<span class="text-[10px] text-gray-500 px-2 py-1 rounded bg-gray-900 border border-gray-700" title="No redeem instructions returned">🚫 No link</span>`)) : ''}</td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
        }

        const availableDates = acc.history.map(entry => entry.date).reverse();
        const defaultDate = availableDates.includes(targetDate) ? targetDate : availableDates[0];
        const dateOptionsHTML = availableDates.map(d => `<option value="${d}" ${d === defaultDate ? 'selected' : ''}>${d}</option>`).join('');

        const modalDateSelectHTML = `
            <select onchange="openModal('${acc.email}', this.value)" class="bg-slate-800 text-slate-300 border border-slate-600 rounded px-2 py-1 text-xs outline-none cursor-pointer focus:border-blue-500">
                ${dateOptionsHTML}
            </select>
        `;

        const renderHealthRow = (label, value, date) => {
            if (!value || value === 'Unknown' || value === 'N/A') return '';
            return `
                <li class="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span>${label}:</span> 
                    <span class="text-right">
                        <span class="${getScoreColor(value)} font-bold">${value}</span>
                        <span class="block text-[10px] text-slate-300 uppercase mt-0.5">Upd: ${date && date !== 'Unknown' ? `${getUpdDateEG(date)}<br>${getUpdTimeEG(date)}` : 'Unknown'}</span>
                    </span>
                </li>`;
        };

        document.getElementById('modalBody').innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-slate-900/50 p-5 rounded-xl border border-slate-700">
                    <div class="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-3 border-b border-slate-700 pb-2">
                        <h3 class="text-blue-400 font-bold uppercase tracking-wide text-xs">Points Breakdown</h3>
                        ${modalDateSelectHTML}
                    </div>
                    <ul class="space-y-2 text-sm text-slate-300">
                        <li class="flex justify-between"><span>💻 PC Searches:</span> <span class="${b.pcSearch ? 'font-medium text-white' : 'text-slate-600'}">${b.pcSearch || 0}</span></li>
                        <li class="flex justify-between"><span>📱 Mobile Searches:</span> <span class="${b.mobileSearch ? 'font-medium text-white' : 'text-slate-600'}">${b.mobileSearch || 0}</span></li>
                        <li class="flex justify-between"><span>📅 Daily Set:</span> <span class="${b.dailySet ? 'font-medium text-white' : 'text-slate-600'}">${b.dailySet || 0}</span></li>
                        <li class="flex justify-between"><span>⭐ More Promos:</span> <span class="${b.morePromotions ? 'font-medium text-white' : 'text-slate-600'}">${b.morePromotions || 0}</span></li>
                        <li class="flex justify-between"><span>🎯 Punch Cards:</span> <span class="${b.punchCards ? 'font-medium text-white' : 'text-slate-600'}">${b.punchCards || 0}</span></li>
                        <li class="flex justify-between"><span>📰 Read to Earn:</span> <span class="${b.readToEarn ? 'font-medium text-white' : 'text-slate-600'}">${b.readToEarn || 0}</span></li>
                        <li class="flex justify-between"><span>✅ Daily Check-in:</span> <span class="${b.dailyCheckIn ? 'font-medium text-white' : 'text-slate-600'}">${b.dailyCheckIn || 0}</span></li>
                        <li class="flex justify-between"><span>🎁 App Promotions:</span> <span class="${b.appPromotions ? 'font-medium text-white' : 'text-slate-600'}">${b.appPromotions || 0}</span></li>
                        <li class="flex justify-between"><span>✨ Special Promos:</span> <span class="${b.specialPromotions ? 'font-medium text-white' : 'text-slate-600'}">${b.specialPromotions || 0}</span></li>
                        <li class="flex justify-between text-orange-400"><span>❓ Unknown Points:</span> <span class="${b.unknown ? 'font-medium text-white' : 'text-slate-600'}">${b.unknown || 0}</span></li>
                        <li class="flex justify-between border-t border-slate-700 pt-2 mt-2 text-white font-bold">
                            <span>Bot Collected (Script):</span> <span class="${scriptCollectedPts > 0 ? 'text-green-400' : 'text-slate-500'}">+${scriptCollectedPts}</span>
                        </li>
                        <li class="flex justify-between border-t border-slate-700/50 pt-2 mt-2 text-white font-bold">
                            <span>Today's Pts (API Summary):</span> <span class="${apiPointsToday > 0 ? 'text-blue-400' : 'text-slate-500'}">+${apiPointsToday}</span>
                        </li>
                    </ul>
                </div>
                
                <div class="bg-slate-900/50 p-5 rounded-xl border border-slate-700">
                    <div class="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-3 border-b border-slate-700 pb-2">
                        <h3 class="text-blue-400 font-bold uppercase tracking-wide text-xs">Health & Background Info</h3>
                        ${modalDateSelectHTML}
                    </div>
                    <ul class="space-y-3 text-sm text-slate-300">
                        <li class="flex justify-between items-center border-b border-indigo-900/50 pb-2 bg-indigo-950/30 -mx-2 px-2 py-1.5 rounded shadow-sm">
                            <span class="text-indigo-300 font-bold uppercase tracking-wider text-[10px]">Target Est.</span> 
                            <span class="text-right">
                                ${isGoalReached 
                                    ? '<span class="text-green-400 font-bold">Reached! 🎉</span>' 
                                    : `<span class="text-indigo-300 font-bold">${simDays} Days</span> <span class="text-indigo-400/80 text-[10px] ml-1">(${expectedDateStr})</span>`}
                            </span>
                        </li>

                        ${renderHealthRow('Serp Bot Score', h.botScore, h.botScoreUpd)}
                        ${renderHealthRow('Risk Bot Score (rbs)', h.riskBotScore, h.riskBotScoreUpd)}
                        ${renderHealthRow('Ads Bot Score', h.adsBotScore, h.adsBotScoreUpd)}
                        ${renderHealthRow('DBS Score', h.dbs, h.dbsUpd)}

                        <li class="flex justify-between items-center">
                            <span>Country | Run IP:</span> 
                            <span class="font-medium uppercase">${h.country || '?'} <span class="text-slate-500 lowercase">(${h.runIp || 'Unknown'})</span></span>
                        </li>
                        <li class="flex justify-between items-center">
                            <span>Puzzle Pieces:</span> 
                            <span class="font-medium text-yellow-400">${i.puzzlePieces || '0'}</span>
                        </li>
                        <li class="flex justify-between items-center">
                            <span>MUID Trial User:</span> 
                            <span class="${i.isMuidTrialUser ? 'text-red-400 font-bold' : 'text-slate-400'}">${i.isMuidTrialUser ? 'YES' : 'NO'}</span>
                        </li>
                        <li class="flex justify-between border-t border-slate-700 pt-3 mt-2">
                            <span>Redeem Status:</span> 
                            <span class="${h.disableBotRedemptions ? 'text-red-500 font-bold' : 'text-green-500 font-medium'}">${h.disableBotRedemptions ? 'BLOCKED' : 'Allowed'}</span>
                        </li>
                    </ul>
                </div>
            </div>

            ${warningsHTML ? `<div class="bg-red-950/30 p-5 rounded-xl border border-red-900/50">
                <h3 class="text-red-400 font-bold mb-2 uppercase tracking-wide text-xs">Active Account Warnings</h3>
                <ul class="mt-2">${warningsHTML}</ul>
            </div>` : ''}
            
            ${ordersHTML}
            
            <div class="bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden mt-4">
                <details class="group">
                    <summary class="flex justify-between items-center font-medium cursor-pointer list-none p-5 text-blue-400 uppercase tracking-wide text-xs">
                        <span>View Raw JSON Output</span>
                        <span class="">
                            <svg fill="none" height="24" shape-rendering="geometricPrecision" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
                        </span>
                    </summary>
                    <div class="text-slate-400 px-5 pb-5">
                        <pre class="text-[11px] overflow-x-auto p-4 bg-slate-950 rounded-lg border border-slate-800 leading-relaxed">${JSON.stringify(acc, null, 2)}</pre>
                    </div>
                </details>
            </div>
        `;
    } catch (err) {
        document.getElementById('modalBody').innerHTML = `
            <div class="text-center py-10 text-red-400 font-bold">
                Failed to fetch account details. <br>
                <span class="text-xs text-red-500/80">${err.message}</span>
            </div>
        `;
    }
}

function closeModal() {
    document.getElementById('accountModal').classList.add('hidden');
}