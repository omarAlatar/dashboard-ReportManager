// ==========================================
// 📈 CHART MODULE
// ==========================================

function renderChart() {
    if (!globalAccounts || globalAccounts.length === 0) return;
    
    const filterValue = document.getElementById('chartFilter').value;
    const daysToView = filterValue === 'all' ? 365 : parseInt(filterValue);
    const todayStr = getTodayString();
    
    let allDates = new Set();
    globalAccounts.forEach(acc => {
        acc.history.forEach(entry => allDates.add(entry.date));
    });
    
    let sortedDates = Array.from(allDates).sort();
    
    let todayTotal = 0;
    let totalBalance = 0;
    globalAccounts.forEach(acc => {
        // Use the new math function for the top header total
        todayTotal += getRealPointsForDay(acc, todayStr);
        
        const latest = acc.latest || {};
        totalBalance += (latest.finalPoints || 0);
    });
    document.getElementById('todayTotalDisplay').innerText = `+${todayTotal.toLocaleString()}`;
    document.getElementById('totalBalanceDisplay').innerText = totalBalance.toLocaleString();

    if (filterValue !== 'all') {
        sortedDates = sortedDates.slice(-daysToView);
    }

    const dailyCollected = sortedDates.map(date => {
        return globalAccounts.reduce((sum, acc) => {
            // Use the new math function for the bar chart
            return sum + getRealPointsForDay(acc, date);
        }, 0);
    });

    const dailyBalances = sortedDates.map(date => {
        return globalAccounts.reduce((sum, acc) => {
            const pastEntries = acc.history.filter(entry => entry.date <= date);
            const dayData = pastEntries.length > 0 ? pastEntries[pastEntries.length - 1] : null;
            return sum + (dayData ? (dayData.finalPoints || 0) : 0);
        }, 0);
    });

    const ctx = document.getElementById('pointsChart').getContext('2d');
    
    if (chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx, {
        data: {
            labels: sortedDates,
            datasets: [
                {
                    type: 'line',
                    label: 'Total Balance (All Accounts)',
                    data: dailyBalances,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y',
                    pointBackgroundColor: '#c084fc',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    order: 1
                },
                {
                    type: 'bar',
                    label: 'Points Collected Today',
                    data: dailyCollected,
                    backgroundColor: 'rgba(59, 130, 246, 0.8)',
                    borderRadius: 4,
                    yAxisID: 'y1',
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: true, labels: { color: '#94a3b8' } },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: { 
                y: { 
                    type: 'linear', display: true, position: 'left',
                    title: { display: true, text: 'Total Balance', color: '#a855f7' },
                    grid: { color: '#334155' }, ticks: { color: '#a855f7' } 
                }, 
                y1: { 
                    type: 'linear', display: true, position: 'right',
                    title: { display: true, text: 'Collected Points', color: '#60a5fa' },
                    grid: { drawOnChartArea: false }, ticks: { color: '#60a5fa' } 
                },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } } 
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
}
