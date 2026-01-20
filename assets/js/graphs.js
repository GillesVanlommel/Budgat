import { db } from './database.js';

let categoryChartInstance = null;
let historyChartInstance = null;
let dailyChartInstance = null;

export async function loadGraphs() {
  const { data: { user } } = await db.auth.getUser();
  if(!user) return;

  // 1. FETCH ALL DATA NEEDED
  // Fetch Transactions
  const { data: transactions, error: tError } = await db
    .from('transactions')
    .select('*')
    .order('date', { ascending: true }); // Oldest first is easier for accumulation

  // Fetch Categories (for Budget limit)
  const { data: categories, error: cError } = await db
    .from('categories')
    .select('monthly_budget');

  if (tError || cError) {
    console.error("Error loading graph data");
    return;
  }

  // 2. PROCESS DATA
  const today = new Date();
  const currentMonthKey = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(today.getMonth() - 1);
  const lastMonthKey = lastMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // -- Calculate Totals
  let thisMonthTotal = 0;
  let lastMonthTotal = 0;
  const categoryTotals = {}; 
  const historyMap = {}; // { "January 2024": 500 }
  const dailyAccumulation = {}; // { "1": 50, "2": 50, "3": 120... }

  // Initialize daily accumulation for every day of current month (to avoid gaps)
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  for(let i=1; i<=daysInMonth; i++) {
    dailyAccumulation[i] = 0;
  }

  transactions.forEach(t => {
    const [year, month, day] = t.date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const monthKey = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const amount = parseFloat(t.amount);

    // History (All time)
    if (!historyMap[monthKey]) historyMap[monthKey] = 0;
    historyMap[monthKey] += amount;

    // Current Month Logic
    if (monthKey === currentMonthKey) {
      thisMonthTotal += amount;
      
      // Category Breakdown
      if (!categoryTotals[t.category]) categoryTotals[t.category] = 0;
      categoryTotals[t.category] += amount;

      // Daily Accumulation (Add to specific day)
      dailyAccumulation[day] += amount;
    }

    // Last Month Logic
    if (monthKey === lastMonthKey) {
      lastMonthTotal += amount;
    }
  });

  // -- Convert Daily Accumulation to Running Total
  let runningTotal = 0;
  const dailyLabels = [];
  const dailyData = [];
  // Only go up to "today" if in current month, or end of month if viewing past? 
  // Let's just show whole month or up to today
  const dayLimit = today.getDate(); 
  
  for(let i=1; i<=daysInMonth; i++) {
    // Optional: Stop line at today's date so it doesn't flatline for future days
    if(i > dayLimit) break;

    runningTotal += dailyAccumulation[i];
    dailyLabels.push(i);
    dailyData.push(runningTotal);
  }

  // 3. UPDATE METRIC CARDS
  
  // A. Total Spent
  document.getElementById('metricTotal').innerText = `€${thisMonthTotal.toFixed(0)}`;

  // B. Budget Status
  const totalBudget = categories.reduce((sum, c) => sum + (c.monthly_budget || 0), 0);
  const statusEl = document.getElementById('metricStatus');
  const cardStatus = document.getElementById('cardStatus');
  
  if (totalBudget === 0) {
    statusEl.innerText = "No Limit";
    cardStatus.className = "bg-slate-50 p-3 rounded-xl shadow-sm border border-slate-200 text-center";
  } else {
    const pct = (thisMonthTotal / totalBudget) * 100;
    statusEl.innerText = `${pct.toFixed(0)}%`;
    
    // Color Logic
    cardStatus.className = "p-3 rounded-xl shadow-sm border border-slate-200 text-center transition-colors duration-500 text-white";
    if (pct < 75) cardStatus.classList.add('bg-emerald-500'); // Safe
    else if (pct < 100) cardStatus.classList.add('bg-yellow-500'); // Warning
    else cardStatus.classList.add('bg-red-500'); // Danger
  }

  // C. Trend (Vs Last Month)
  const diff = thisMonthTotal - lastMonthTotal;
  const trendEl = document.getElementById('metricTrend');
  if (diff > 0) {
    trendEl.innerText = `+€${diff.toFixed(0)}`;
    trendEl.className = "text-lg sm:text-xl font-bold text-red-500 mt-1";
  } else {
    trendEl.innerText = `-€${Math.abs(diff).toFixed(0)}`;
    trendEl.className = "text-lg sm:text-xl font-bold text-emerald-500 mt-1";
  }


  // 4. RENDER CHARTS
  renderCategoryChart(categoryTotals);
  renderHistoryChart(historyMap);
  renderDailyChart(dailyLabels, dailyData);
}

// --- CHART RENDERING FUNCTIONS ---

function renderCategoryChart(dataObj) {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;

  // Sort by value (Highest first)
  const sortedEntries = Object.entries(dataObj).sort((a, b) => b[1] - a[1]);
  
  if(categoryChartInstance) categoryChartInstance.destroy();

  categoryChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sortedEntries.map(e => e[0]),
      datasets: [{
        data: sortedEntries.map(e => e[1]),
        backgroundColor: [
          '#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#3b82f6'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } }
      }
    }
  });
}

function renderHistoryChart(historyMap) {
  const ctx = document.getElementById('historyChart');
  if (!ctx) return;

  // Get last 6 months keys
  const keys = Object.keys(historyMap);
  const recentKeys = keys.slice(-6); 

  if(historyChartInstance) historyChartInstance.destroy();

  historyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: recentKeys.map(k => k.split(' ')[0]), // Just Month Name
      datasets: [{
        label: 'Spent',
        data: recentKeys.map(k => historyMap[k]),
        backgroundColor: '#cbd5e1',
        borderRadius: 4,
        hoverBackgroundColor: '#6366f1' // Indigo on hover
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { display: false } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderDailyChart(labels, data) {
  const ctx = document.getElementById('dailyChart');
  if (!ctx) return;

  if(dailyChartInstance) dailyChartInstance.destroy();

  dailyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Cumulative',
        data: data,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4, // Smooth curves
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true },
        x: { grid: { display: false } }
      }
    }
  });
}