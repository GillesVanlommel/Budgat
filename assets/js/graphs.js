import { db } from './database.js';
google.charts.load('current', { 'packages': ['sankey'] });

let categoryChartInstance = null;
let historyChartInstance = null;
let dailyChartInstance = null;

export async function loadGraphs() {
  const { data: { user } } = await db.auth.getUser();
  if(!user) return;

  const monthSelector = document.getElementById('graphMonthSelector');
  let selectedDate = new Date();

  if (monthSelector && monthSelector.value) {
    const [year, month] = monthSelector.value.split('-').map(Number);
    selectedDate = new Date(year, month - 1, 1);
  } else if (monthSelector) {
    const now = new Date();
    const monthStr = String(now.getMonth() + 1).padStart(2, '0');
    monthSelector.value = `${now.getFullYear()}-${monthStr}`;
    selectedDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const { data: transactions, error: tError } = await db.from('transactions').select('*').order('date', { ascending: true });
  const { data: categories, error: cError } = await db.from('categories').select('*');

  if (tError || cError) return;

  const currentMonthKey = selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const lastMonthDate = new Date(selectedDate);
  lastMonthDate.setMonth(selectedDate.getMonth() - 1);
  const lastMonthKey = lastMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  let thisMonthExpense = 0;
  let thisMonthIncome = 0; 
  let lastMonthExpense = 0;
  
  // NEW: Object to hold both Income and Expense for history
  const monthlyStats = {}; 
  
  const categoryTotals = {}; 
  const dailyAccumulation = {}; 

  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  for(let i=1; i<=daysInMonth; i++) dailyAccumulation[i] = 0;

  transactions.forEach(t => {
    const [year, month, day] = t.date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const monthKey = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const amount = parseFloat(t.amount);
    const isIncomeCat = t.category.toLowerCase() === 'inkomsten';

    // Initialize monthly stats if not exists
    if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = { income: 0, expense: 0 };
    }

    // Logic: Negative amount = Income (green in list), Positive = Expense
    if (amount < 0) {
        monthlyStats[monthKey].income += Math.abs(amount);
    } else if (!isIncomeCat) {
        monthlyStats[monthKey].expense += amount;
    }

    // Current Month Totals for Top Cards
    if (monthKey === currentMonthKey) {
      if (amount < 0) {
        thisMonthIncome += Math.abs(amount);
      }
      
      if (!isIncomeCat && amount > 0) {
        thisMonthExpense += amount;
        if (!categoryTotals[t.category]) categoryTotals[t.category] = 0;
        categoryTotals[t.category] += amount;
        dailyAccumulation[day] += amount;
      }
    }

    if (monthKey === lastMonthKey && !isIncomeCat && amount > 0) {
      lastMonthExpense += amount;
    }
  });

  const nu = new Date();
  const isHuidigeMaand = selectedDate.getMonth() === nu.getMonth() && selectedDate.getFullYear() === nu.getFullYear();
  const dagLimiet = isHuidigeMaand ? nu.getDate() : daysInMonth; 
  
  let runningTotal = 0;
  const dailyLabels = [];
  const dailyData = [];

  for(let i=1; i<=daysInMonth; i++) {
    runningTotal += dailyAccumulation[i];
    if(i <= dagLimiet) {
      dailyLabels.push(i);
      dailyData.push(runningTotal);
    }
  }

  document.getElementById('metricTotal').innerText = `€${thisMonthExpense.toFixed(0)}`;

  const totalExpenseBudget = categories
    .filter(c => c.name.toLowerCase() !== 'inkomsten')
    .reduce((sum, c) => sum + (c.monthly_budget || 0), 0);
    
  const statusEl = document.getElementById('metricStatus');
  const cardStatus = document.getElementById('cardStatus');
  
  if (totalExpenseBudget === 0) {
    statusEl.innerText = "No Budget";
    cardStatus.className = "bg-white p-3 rounded-xl shadow-sm border border-slate-200 text-center";
  } else {
    const pct = (thisMonthExpense / totalExpenseBudget) * 100;
    statusEl.innerText = `${pct.toFixed(0)}%`;
    cardStatus.className = "p-3 rounded-xl shadow-sm border border-slate-200 text-center transition-colors duration-500 text-white";
    if (pct < 75) cardStatus.classList.add('bg-emerald-500'); 
    else if (pct < 100) cardStatus.classList.add('bg-yellow-500'); 
    else cardStatus.classList.add('bg-red-500'); 
  }

  const diff = thisMonthExpense - lastMonthExpense;
  const trendEl = document.getElementById('metricTrend');
  if (diff > 0) {
    trendEl.innerText = `+€${diff.toFixed(0)}`;
    trendEl.className = "text-lg sm:text-xl font-bold text-red-500 mt-1";
  } else {
    trendEl.innerText = `${diff.toFixed(0)}`; 
    trendEl.className = "text-lg sm:text-xl font-bold text-emerald-500 mt-1";
  }

  // Pass the full stats object to the renderer
  renderHistoryChart(monthlyStats);
  renderDailyChart(dailyLabels, dailyData);
  
  if (typeof google !== 'undefined' && google.charts) {
    google.charts.setOnLoadCallback(() => renderSankeyChart(thisMonthIncome, categoryTotals, thisMonthExpense));
  }
}

function renderHistoryChart(monthlyStats) {
  const ctx = document.getElementById('historyChart');
  if (!ctx) return;
  
  const keys = Object.keys(monthlyStats);
  const recentKeys = keys.slice(-6); // Last 6 months
  
  if (historyChartInstance) historyChartInstance.destroy();
  
  historyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: recentKeys.map(k => k.split(' ')[0]), // Just the Month Name
      datasets: [
        {
          label: 'Income',
          data: recentKeys.map(k => monthlyStats[k].income),
          backgroundColor: '#10b981', // Emerald 500
          borderRadius: 4,
          hoverBackgroundColor: '#059669'
        },
        {
          label: 'Expenses',
          data: recentKeys.map(k => monthlyStats[k].expense),
          backgroundColor: '#ef4444', // Red 500
          borderRadius: 4,
          hoverBackgroundColor: '#dc2626'
        }
      ]
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false,
      plugins: { 
          legend: { 
              display: true,
              position: 'bottom',
              labels: {
                  boxWidth: 12,
                  font: { size: 10 }
              }
          } 
      },
      scales: { 
          y: { 
              beginAtZero: true, 
              grid: { display: false } 
          }, 
          x: { 
              grid: { display: false } 
          } 
      }
    }
  });
}

function renderDailyChart(labels, data) {
  const ctx = document.getElementById('dailyChart');
  if (!ctx) return;
  if (dailyChartInstance) dailyChartInstance.destroy();
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
        tension: 0.4,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
    }
  });
}

function renderSankeyChart(totalIncome, categoryTotals, totalSpent) {
  const container = document.getElementById('sankey_chart');
  if (!container) return;

  const data = new google.visualization.DataTable();
  data.addColumn('string', 'From');
  data.addColumn('string', 'To');
  data.addColumn('number', 'Weight');

  const rows = [];

  const sourceNode = totalIncome > 0 ? `Income (€${totalIncome.toFixed(0)})` : 'Funds';

  Object.entries(categoryTotals).forEach(([category, amount]) => {
    if (amount > 0) {
      rows.push([sourceNode, category, amount]);
    }
  });

  if (totalIncome > totalSpent) {
    const savings = totalIncome - totalSpent;
    rows.push([sourceNode, 'Savings / Unallocated', savings]);
  }

  if (rows.length === 0) {
    container.innerHTML = '<p class="text-center text-slate-400">No data for flow chart.</p>';
    return;
  }

  data.addRows(rows);

  const options = {
    width: '100%',
    sankey: {
      node: {
        label: { fontSize: 12, color: '#334155', bold: true },
        interactivity: true,
        width: 15
      },
      link: {
        colorMode: 'gradient',
        color: { fill: '#6366f1', fillOpacity: 0.2 }
      }
    }
  };

  const chart = new google.visualization.Sankey(container);
  chart.draw(data, options);
}