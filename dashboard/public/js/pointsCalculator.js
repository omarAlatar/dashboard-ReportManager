/**
 * Microsoft Rewards Points Calculator - 100% ACCURATE ENGINE
 * Decouples streaks, perfectly predicts multi-piece jumps, wrap-arounds, and Visual Search toggles.
 */

window.calculateExpectedPoints = function(targetDateStr, simulatedStreak, levelStr, config) {
    simulatedStreak = Math.max(1, parseInt(simulatedStreak) || 1);
    
    const dateObj = targetDateStr ? new Date(targetDateStr) : new Date();
    const dow = dateObj.getDay(); 

    config = config || {};
    const baselineStreak = config.baselineStreak !== undefined ? parseInt(config.baselineStreak) : simulatedStreak;
    const offset = simulatedStreak - baselineStreak; 

    // Individual decoupled streaks - explicitly checking undefined to preserve "0" values if dropped
    const baselineApp = config.bingAppStreak !== undefined ? parseInt(config.bingAppStreak) : baselineStreak;
    const baselineSet = config.dailySetStreak !== undefined ? parseInt(config.dailySetStreak) : baselineStreak;
    const baselineSearch = config.bingSearchStreak !== undefined ? parseInt(config.bingSearchStreak) : baselineStreak;
    const baselineVisual = config.visualSearchStreak !== undefined ? parseInt(config.visualSearchStreak) : baselineStreak;

    const currentAppStreak = Math.max(0, baselineApp + offset);
    const currentDailySetStreak = Math.max(0, baselineSet + offset);
    const currentSearchStreak = Math.max(0, baselineSearch + offset);
    const currentVisualStreak = Math.max(0, baselineVisual + offset);
    
    const baselinePieces = parseInt(config.baselinePieces) || 0;
    const isVisualSearchEnabled = config.visualSearchEnabled !== false; 
    const isSignUpDay = config.isSignUpDay === true; 

    let breakdown = {
        oneTimePromos: 0,
        morePromo: 0,
        readToEarn: 30, //30
        dailySignIn: 0,
        dailySet: 0,
        dailySearch: 0,
        visualSearch: 0,
        edgeOnboarding: 0,
        starBonus: 0,
        monthlyLevel: 0,
        monthlyLevelCoupon: 0,
        monthlyDse: 0
    };

    // ========== ONE-TIME PROMOS ==========
    if (isSignUpDay && simulatedStreak === 1) {
//breakdown = BeforeSignUp + SignUpQuest1 + Search1 + You_set_a_Rewards_goal + Search 1 time + Finish a Daily Set + Browse the Earn page + Learn your level + Explore the dashboard + SearchBox + //Score + AppPromo
        breakdown.oneTimePromos = 201 + 80 + 15 + 50 + 15 + 50 + 10 + 10 + 45 + 100 + 100; 
        const morePromoDay1Map = { 1: 80, 2: 85, 3: 90, 4: 95, 5: 100, 6: 105, 0: 75 };
        breakdown.morePromo = morePromoDay1Map[dow];
    } else {
        breakdown.morePromo = (dow === 2) ? 35 : 5;
    }

    // ========== DAILY SIGN-IN ==========
    const isAppDay7 = currentAppStreak > 0 && currentAppStreak % 7 === 0;
    const appCycleDay = Math.max(0, currentAppStreak - 1) % 7; 
    const appWeekCycle = Math.floor(Math.max(0, currentAppStreak - 1) / 7);

    if (!isAppDay7) {
        breakdown.dailySignIn = [10, 10, 20, 20, 30, 30][appCycleDay] || 0;
    } else {
        breakdown.dailySignIn = [70, 80, 90, 100][appWeekCycle % 4] || 70;
    }

    // ========== DAILY SET & GAMIFICATION ==========
    const isSetDay7 = currentDailySetStreak > 0 && currentDailySetStreak % 7 === 0;
    breakdown.dailySet = isSetDay7 ? 100 : 30;
    
    // Gamification Milestones track the master simulated day, NOT the fragile Daily Set Streak
    //if (simulatedStreak === 3) breakdown.dailySet += 45;
    //if (simulatedStreak === 8 || simulatedStreak === 13) breakdown.dailySet += 75;
    //if (simulatedStreak === 20 || simulatedStreak === 27 || simulatedStreak === 34) breakdown.dailySet += 105;
    //if (simulatedStreak > 34 && ((simulatedStreak - 34) % 10 === 0)) breakdown.dailySet += 150;

    // ========== DAILY SEARCH ==========
    const isSearchDay7 = currentSearchStreak > 0 && currentSearchStreak % 7 === 0;
    const isEffectivelyGold = (String(levelStr || '').toLowerCase().includes('gold')) || (currentSearchStreak >= 7);
    breakdown.dailySearch = isEffectivelyGold ? 60 : 30;
    
    if (isSearchDay7) {
        breakdown.dailySearch += 97;
    }

    // ========== VISUAL SEARCH ==========
    const isVisualDay7 = currentVisualStreak > 0 && currentVisualStreak % 7 === 0;
    if (isVisualSearchEnabled) {
        breakdown.visualSearch = isVisualDay7 ? 100 : 5;
    }

    // ========== EDGE ONBOARDING ==========
    //if (simulatedStreak === 6) breakdown.edgeOnboarding = 1160;
    //else if (simulatedStreak === 9 && config.edgeOnboarding10Days > 0) breakdown.edgeOnboarding = 1180;

    // ========== PUZZLE PIECE STAR BONUS (1000 PTS) ==========
    
    const getPiecesGained = (baseStrk, currentStrk) => {
        if (currentStrk <= 0) return 0;
        return Math.floor(currentStrk / 7) - Math.floor(Math.max(0, baseStrk) / 7);
    };

    if (offset === 0) {
        // Historical API Check: Evaluating TODAY's Real Data
        if (config.prevPuzzlePieces !== undefined) {
            const prev = parseInt(config.prevPuzzlePieces) || 0;
            const curr = baselinePieces; 
            
            if (curr >= 12 && prev < 12) {
                // Hit exactly 12 from below
                breakdown.starBonus = 1000;
            } else if (curr < prev && prev < 12) {
                // Wrapped around the 12-mark (e.g. jumped from 11 pieces up to 15, which API reports as 3)
                breakdown.starBonus = 1000;
            }
        } else {
            // No history available. We manually subtract today's earned pieces to detect the wrap-around.
            const piecesEarnedToday = 
                (isAppDay7 ? 1 : 0) + 
                (isSetDay7 ? 1 : 0) + 
                (isSearchDay7 ? 1 : 0) + 
                (isVisualDay7 && isVisualSearchEnabled ? 1 : 0);
                
            if (piecesEarnedToday > 0) {
                const estimatedPrev = baselinePieces - piecesEarnedToday;
                if (baselinePieces >= 12 && estimatedPrev < 12) {
                    breakdown.starBonus = 1000;
                } else if (estimatedPrev < 0) {
                    breakdown.starBonus = 1000;
                }
            }
        }
    } else if (offset > 0) {
        // Predictive Future Forecasting (Simulating Days/Weeks Forward into the Target Predictions)
        const prevApp = Math.max(0, baselineApp + offset - 1);
        const prevSet = Math.max(0, baselineSet + offset - 1);
        const prevSearch = Math.max(0, baselineSearch + offset - 1);
        const prevVisual = Math.max(0, baselineVisual + offset - 1);
        
        // Sum all pieces predicted to be acquired up to YESTERDAY
        const piecesYesterday = baselinePieces + 
            getPiecesGained(baselineApp, prevApp) +
            getPiecesGained(baselineSet, prevSet) +
            getPiecesGained(baselineSearch, prevSearch) +
            (isVisualSearchEnabled ? getPiecesGained(baselineVisual, prevVisual) : 0);

        // Sum all pieces predicted to be acquired up to TODAY
        const piecesToday = baselinePieces + 
            getPiecesGained(baselineApp, currentAppStreak) +
            getPiecesGained(baselineSet, currentDailySetStreak) +
            getPiecesGained(baselineSearch, currentSearchStreak) +
            (isVisualSearchEnabled ? getPiecesGained(baselineVisual, currentVisualStreak) : 0);

        // If today's streak jump pushes the pieces count across ANY 12-piece boundary (12, 24, 36, etc.)
        if (piecesToday > piecesYesterday && Math.floor(piecesYesterday / 12) < Math.floor(piecesToday / 12)) {
            breakdown.starBonus = 1000;
        }
    }

    // ========== MONTHLY BONUSES (Program Restructure) ==========
    // Level bonus + redemption coupon land if the account existed before this
    // month; default search bonus lands if 14+ days were searched in the
    // previous month ("paid in the new month"). The report's bonus state picks
    // the landing day: COMPLETE → month day 1; PENDING → the day AFTER the
    // report date (shifted forward day by day until received); NOT_ELIGIBLE → none.
    const monthStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
    const streakStart = new Date(dateObj);
    streakStart.setHours(0, 0, 0, 0);
    streakStart.setDate(streakStart.getDate() - (simulatedStreak - 1));

    const lvlLow = String(levelStr || '').toLowerCase();
    const isGold = lvlLow.includes('gold') || currentSearchStreak >= 7;
    const isSilver = !isGold && lvlLow.includes('silver');

    const parseDate = (s) => {
        const d = s ? new Date(s) : null;
        if (d && !isNaN(d.getTime())) {
            d.setHours(0, 0, 0, 0);
            return d;
        }
        return null;
    };
    const sameDate = (a, b) => !!a && !!b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    // The bonus state only applies to the month of the report date it came from.
    // Other months (forecast past the known report) fall back to month day 1.
    const awardDay = (state, stateDateStr) => {
        const st = String(state || '').toUpperCase();
        const sd = parseDate(stateDateStr);
        const stateApplies = sd && sd.getFullYear() === dateObj.getFullYear() && sd.getMonth() === dateObj.getMonth();
        if (stateApplies) {
            if (st === 'NOT_ELIGIBLE') return null;
            if (st === 'PENDING') {
                const next = new Date(sd);
                next.setDate(next.getDate() + 1);
                return next;
            }
        }
        return monthStart;
    };

    if (streakStart < monthStart) {
        const levelAward = awardDay(config.monthlyLevelState, config.monthlyLevelStateDate);
        if (levelAward && sameDate(dateObj, levelAward)) {
            breakdown.monthlyLevel = isGold ? 420 : (isSilver ? 180 : 60);
            breakdown.monthlyLevelCoupon = isGold ? 200 : (isSilver ? 100 : 0);
        }

        const dseAward = awardDay(config.monthlyDseState, config.monthlyDseStateDate);
        if (dseAward && sameDate(dateObj, dseAward)) {
            const prevMonthStart = new Date(monthStart);
            prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
            const prevMonthEnd = new Date(monthStart);
            prevMonthEnd.setDate(0);

            const searchStart = streakStart > prevMonthStart ? streakStart : prevMonthStart;
            const daysSearchedPrevMonth = Math.max(0, Math.floor((prevMonthEnd - searchStart) / 86400000) + 1);
            if (daysSearchedPrevMonth >= 14) {
                breakdown.monthlyDse = isGold ? 210 : (isSilver ? 90 : 30);
            }
        }
    }

    const total = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

    return { total, breakdown };
};

// Tooltip Helper for the UI Hover effect
window.getPointsTooltip = function(targetDateStr, simulatedStreak, level, actualPts, config) {
    const { total, breakdown } = window.calculateExpectedPoints(targetDateStr, simulatedStreak, level, config);
    const diff = actualPts != null ? actualPts - total : null;

    let str = actualPts != null
        ? `Streak Day ${simulatedStreak} | Actual: ${actualPts} | Expected: ${total} | Diff: ${diff > 0 ? '+' : ''}${diff}\n`
        : `Streak Day ${simulatedStreak} | Expected: ${total}\n`;

    str += `───────────────────────\n`;
    str += `ReadToEarn: ${breakdown.readToEarn}\n`;
    str += `DailySignIn: ${breakdown.dailySignIn}\n`;
    str += `DailySet: ${breakdown.dailySet}\n`;
    str += `DailySearch: ${breakdown.dailySearch}\n`;
    if (breakdown.visualSearch) str += `VisualSearch: ${breakdown.visualSearch}\n`;
    str += `MorePromo: ${breakdown.morePromo}\n`;

    if (breakdown.edgeOnboarding > 0) str += `🎁 Edge Onboarding: +${breakdown.edgeOnboarding}\n`;
    if (breakdown.starBonus > 0) str += `⭐ Puzzle Star Bonus: +${breakdown.starBonus}\n`;
    if (breakdown.monthlyLevel > 0) str += `🎁 Monthly Level Bonus: +${breakdown.monthlyLevel}\n`;
    if (breakdown.monthlyLevelCoupon > 0) str += `🎟️ Redemption Coupon: +${breakdown.monthlyLevelCoupon}\n`;
    if (breakdown.monthlyDse > 0) str += `🔍 Default Search Bonus: +${breakdown.monthlyDse}\n`;
    
    if (config && config.isSignUpDay && simulatedStreak === 1) {
        str += `\n--- One-Time Sign-Up Promos ---\n`;
        str += `Total One-Time: +${breakdown.oneTimePromos}\n`;
    }

    return str;
};

// ========== BOT-FLAGGED ACCOUNTS (Fraud_UserWarning_BotScore_UX) ==========
// These accounts have all streaks frozen at 0 (no day-7 bonuses ever), but the
// daily check-in keeps working on its own 7-day cycle: 5,5,10,10,15,15 then
// day 7 = 20/30/40/50 (escalating weekly), then reset to 5. The bot rests them
// 1-3 days after each day 7. This helper models exactly that for forecasts:
// 7 earning days (base points + check-in tier) then skipDays rest days (0 pts).

window.isBotFlaggedAccount = function(acc) {
    const warnings = (acc && acc.latest && acc.latest.accountHealth && acc.latest.accountHealth.warnings) || [];
    return /Fraud|UserWarning|BotScore/i.test(JSON.stringify(warnings));
};

// Maps a real check-in points value to its position in the 7-day cycle (0-based).
// 5 → day 1-2 (pos 0), 10 → day 3-4 (pos 2), 15 → day 5-6 (pos 4),
// 20+ → day 7 completed today → forecast starts on rest day 1 (pos 7)
window.flaggedCycleSeed = function(checkIn) {
    if (checkIn >= 20) return 7;
    if (checkIn >= 15) return 4;
    if (checkIn >= 10) return 2;
    return 0;
};

// Deterministic rest-day count (0-1, matching the CLI randomInt(0,2) range) —
// stable per account+cycle so the forecast never changes between refreshes.
window.flaggedRestDays = function(email, cycleIndex) {
    let h = 7;
    const s = email + '#' + cycleIndex;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 2;
};

// cyclePos: 0-based position in the repeating (7 + skipDays) cycle.
// Non-flagged accounts pass through unchanged (cyclePos = raw streak day, 1-based).
window.flaggedForecastDay = function(dateStr, cyclePos, flagged, skipDays, lvl, config) {
    if (!flagged) {
        return { points: window.calculateExpectedPoints(dateStr, cyclePos, lvl, config).total, rest: false, nextPos: cyclePos + 1 };
    }

    const cycleLen = 7 + (skipDays || 2);
    const pos = Math.max(0, cyclePos) % cycleLen;

    if (pos >= 7) {
        return { points: 0, rest: true, nextPos: cyclePos + 1 };
    }

    // Frozen streaks: force every baseline to 0 so no day-7 bonus is ever predicted
    const frozenConfig = Object.assign({}, config || {}, {
        baselineStreak: 1,
        bingAppStreak: 0,
        dailySetStreak: 0,
        bingSearchStreak: 0,
        visualSearchStreak: 0,
        baselinePieces: 0
    });
    const base = window.calculateExpectedPoints(dateStr, 1, lvl, frozenConfig).total;

    const weekIndex = Math.floor(Math.max(0, cyclePos) / cycleLen);
    const checkIn = pos === 6
        ? ([20, 30, 40, 50][weekIndex % 4] || 20)
        : ([5, 5, 10, 10, 15, 15][pos] || 5);

    return { points: base + checkIn, rest: false, nextPos: cyclePos + 1 };
};