import { db } from './database.js';

let isGridView = false;
let globalData = null; // Cache fetched data

export async function loadBudget() {
  // 1. Setup Toggle Button Logic
  const toggleBtn = document.getElementById('toggleBudgetViewBtn');
  if (toggleBtn) {
    // Remove old listener to prevent duplicates if function is called multiple times
    const newBtn = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);
    
    newBtn.addEventListener('click', () => {
      isGridView = !isGridView;
      newBtn.innerText = isGridView ? "Switch to List" : "Switch to Grid";
      updateViewVisibility();
    });
    // Set initial text
    newBtn.innerText = isGridView ? "Switch to List" : "Switch to Grid";
  }

  // 2. Fetch Data
  const { data: categories } = await db.from('categories').select('*').order('name');
  const { data: transactions } = await db.from('transactions').select('category, amount, date').order('date', { ascending: true });

  globalData = { categories, transactions };

  updateViewVisibility();
}

function updateViewVisibility() {
  const listView = document.getElementById('budgetListView');
  const gridView = document.getElementById('budgetGridView');
  const subtitle = document.getElementById('budgetSubtitle');

  if (isGridView) {
    listView.classList.add('hidden');
    gridView.classList.remove('hidden');
    subtitle.innerText = "Historical spending vs Budget";
    renderGrid();
  } else {
    listView.classList.remove('hidden');
    gridView.classList.add('hidden');
    subtitle.innerText = "Overview for this month";
    renderList();
  }
}

// ==========================================
// VIEW 1: The Original List View
// ==========================================
function renderList() {
  const container = document.getElementById('budgetContainer');
  if (!container || !globalData) return;

  const { categories, transactions } = globalData;
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let totalBudgetPlan = 0;
  let currentMonthNet = 0;
  
  const budgetHTML = categories.map((cat) => {
      const thisMonthBudget = parseFloat(cat.monthly_budget || 0);
      totalBudgetPlan += thisMonthBudget;

      const monthNetVal = transactions
        .filter(t => t.category === cat.name && t.date.startsWith(currentMonthKey))
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      currentMonthNet += monthNetVal;

      const available = thisMonthBudget - monthNetVal;
      let pct = 0;
      if (Math.abs(thisMonthBudget) > 0) {
        pct = (Math.abs(monthNetVal) / Math.abs(thisMonthBudget)) * 100;
      }

      let labelColor = available < 0 ? 'text-red-500' : 'text-emerald-500';
      let barColor = available < 0 ? 'bg-red-500' : 'bg-indigo-500';
      let labelText = available < 0 ? `€${Math.abs(available).toFixed(2)} Over` : `€${available.toFixed(2)} Left`;

      return `
        <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4">
          <div class="flex justify-between items-end mb-2">
            <h3 class="font-bold text-slate-700">${cat.name}</h3>
            <div class="text-right">
              <span class="text-sm font-bold ${labelColor}">${labelText}</span>
              <span class="text-xs text-slate-400 block">Plan: €${thisMonthBudget.toFixed(0)}</span>
            </div>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
             <div class="${barColor} h-3 rounded-full" style="width: ${Math.min(pct, 100)}%"></div>
          </div>
        </div>
      `;
  });

  container.innerHTML = budgetHTML.join('');
}

// ==========================================
// VIEW 2: The New Grid View
// ==========================================
function renderGrid() {
  const table = document.getElementById('budgetGridTable');
  if (!table || !globalData) return;

  const { categories, transactions } = globalData;

  // 1. Identify all unique months from transactions
  const monthSet = new Set();
  transactions.forEach(t => {
    const m = t.date.substring(0, 7); // YYYY-MM
    monthSet.add(m);
  });
  // Sort months chronologically
  const months = Array.from(monthSet).sort();

  // If no data, show minimal
  if (months.length === 0) {
    table.innerHTML = '<tr><td class="p-4 text-center">No data available</td></tr>';
    return;
  }

  // 2. Build Header Row
  let thead = `
    <thead class="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0">
      <tr>
        <th class="px-4 py-3 font-bold sticky left-0 bg-slate-50 border-r border-slate-200 z-10">Category</th>
        ${months.map(m => `<th class="px-4 py-3 text-center min-w-[120px] border-r border-slate-100">${m}</th>`).join('')}
        <th class="px-4 py-3 font-bold text-center bg-slate-50">Total</th>
      </tr>
      <tr>
        <th class="px-4 py-1 text-[10px] text-slate-400 sticky left-0 bg-slate-50 border-r border-slate-200 z-10 text-right font-normal italic">Format:</th>
        ${months.map(() => `<th class="px-4 py-1 text-[10px] text-slate-400 text-center font-normal border-r border-slate-100 italic">Spent / Budget</th>`).join('')}
        <th class="px-4 py-1 text-[10px] text-slate-400 text-center font-normal italic">Spent / Budget</th>
      </tr>
    </thead>
  `;

  // 3. Build Body Rows
  let tbody = '<tbody class="divide-y divide-slate-100">';
  
  // Calculate Column Totals on the fly
  const colTotalSpent = new Array(months.length).fill(0);
  const colTotalBudget = new Array(months.length).fill(0);

  categories.forEach(cat => {
    let rowSpent = 0;
    let rowBudget = 0;
    const catBudget = parseFloat(cat.monthly_budget || 0);

    const cells = months.map((m, index) => {
      // Calculate Spent for this Month + Category
      const spent = transactions
        .filter(t => t.category === cat.name && t.date.startsWith(m))
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      // Accumulate Row & Col totals
      rowSpent += spent;
      rowBudget += catBudget;
      colTotalSpent[index] += spent;
      colTotalBudget[index] += catBudget;

      // Color coding logic
      const isOver = spent > catBudget;
      const textClass = isOver ? 'text-red-500 font-bold' : 'text-slate-700';
      const bgClass = isOver ? 'bg-red-50' : '';

      return `
        <td class="px-4 py-3 text-center border-r border-slate-100 ${bgClass}">
          <div class="${textClass}">€${spent.toFixed(0)}</div>
          <div class="text-xs text-slate-400">/ €${catBudget.toFixed(0)}</div>
        </td>
      `;
    }).join('');

    // Row Total Cell
    const rowIsOver = rowSpent > rowBudget;
    const rowTotalClass = rowIsOver ? 'text-red-600 font-bold' : 'text-slate-800 font-bold';

    tbody += `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-3 font-medium text-slate-700 bg-white sticky left-0 border-r border-slate-200 z-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
          ${cat.name}
        </td>
        ${cells}
        <td class="px-4 py-3 text-center bg-slate-50">
          <div class="${rowTotalClass}">€${rowSpent.toFixed(0)}</div>
          <div class="text-xs text-slate-400">/ €${rowBudget.toFixed(0)}</div>
        </td>
      </tr>
    `;
  });

  // 4. Build Footer Row (Grand Totals)
  const footerCells = months.map((m, i) => {
    const s = colTotalSpent[i];
    const b = colTotalBudget[i];
    const isOver = s > b;
    return `
      <td class="px-4 py-3 text-center border-r border-slate-200 font-bold ${isOver ? 'text-red-600' : 'text-slate-700'}">
        <div>€${s.toFixed(0)}</div>
        <div class="text-xs text-slate-400 font-normal">/ €${b.toFixed(0)}</div>
      </td>
    `;
  }).join('');

  const grandTotalSpent = colTotalSpent.reduce((a,b)=>a+b,0);
  const grandTotalBudget = colTotalBudget.reduce((a,b)=>a+b,0);

  tbody += `
      <tr class="bg-slate-100 border-t-2 border-slate-200">
        <td class="px-4 py-3 font-bold text-slate-800 sticky left-0 bg-slate-100 border-r border-slate-200">TOTAL</td>
        ${footerCells}
        <td class="px-4 py-3 text-center font-bold text-slate-900 border-l border-slate-200">
           <div>€${grandTotalSpent.toFixed(0)}</div>
           <div class="text-xs text-slate-500 font-normal">/ €${grandTotalBudget.toFixed(0)}</div>
        </td>
      </tr>
  `;

  tbody += '</tbody>';
  table.innerHTML = thead + tbody;
}