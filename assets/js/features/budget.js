import { db } from '../core/database.js';
import { getTransactionType } from './transactions.js';

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
  const container = document.getElementById('mainContainer'); // Get the container

  if (isGridView) {
    listView.classList.add('hidden');
    gridView.classList.remove('hidden');
    subtitle.innerText = "Historical spending vs Budget";
    
    // Expand to wide view
    if (container) {
      container.classList.remove('max-w-md');
      container.classList.add('max-w-7xl'); // Wide mode
    }

    renderGrid();
  } else {
    listView.classList.remove('hidden');
    gridView.classList.add('hidden');
    subtitle.innerText = "Overview for this month";

    // Shrink back to mobile view
    if (container) {
      container.classList.add('max-w-md');
      container.classList.remove('max-w-7xl'); // Narrow mode
    }

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

  // Derive category type from transactions if not set
  const categoryTypes = {};
  transactions.forEach(t => {
    if (!categoryTypes[t.category] && t.type) {
      categoryTypes[t.category] = t.type;
    }
  });

  // Group categories by type (use derived type if not set)
  const incomeCats = categories.filter(c => (c.type || categoryTypes[c.name]) === 'income');
  const transferCats = categories.filter(c => (c.type || categoryTypes[c.name]) === 'transfer');
  const expenseCats = categories.filter(c => (c.type || categoryTypes[c.name]) === 'expense' || (!c.type && !categoryTypes[c.name]));

  let totalIncome = 0;
  let totalTransfer = 0;
  let totalExpenses = 0;
  let totalBudgetPlan = 0;

  function renderCategoryList(cats, type) {
    return cats.map((cat) => {
      const thisMonthBudget = parseFloat(cat.monthly_budget || 0);
      
      const monthTxns = transactions.filter(t => t.category === cat.name && t.date.startsWith(currentMonthKey));
      const monthTotal = monthTxns.reduce((sum, t) => {
        const txType = t.type || categoryTypes[cat.name] || (Math.abs(parseFloat(t.amount)) > 0 ? 'expense' : 'expense');
        return sum + (txType === type ? Math.abs(parseFloat(t.amount)) : 0);
      }, 0);
      
      if (type === 'income') totalIncome += monthTotal;
      else if (type === 'transfer') totalTransfer += monthTotal;
      else {
        totalExpenses += monthTotal;
        totalBudgetPlan += thisMonthBudget;
      }

      const isOver = type === 'expense' && monthTotal > thisMonthBudget;
      const available = type === 'expense' ? thisMonthBudget - monthTotal : 0;
      
      let labelColor, barColor, labelText;
      if (type === 'income') {
        labelColor = 'text-emerald-600';
        labelText = `€${monthTotal.toFixed(0)}`;
      } else if (type === 'transfer') {
        labelColor = 'text-blue-600';
        labelText = `€${monthTotal.toFixed(0)}`;
      } else {
        labelColor = available < 0 ? 'text-red-500' : 'text-emerald-500';
        labelText = available < 0 ? `€${Math.abs(available).toFixed(0)} Over` : `€${available.toFixed(0)} Left`;
      }
      
      barColor = isOver ? 'bg-red-500' : (type === 'income' ? 'bg-emerald-500' : type === 'transfer' ? 'bg-blue-500' : 'bg-indigo-500');

      let pct = 0;
      if (type === 'expense' && thisMonthBudget > 0) {
        pct = (monthTotal / thisMonthBudget) * 100;
      } else if (type !== 'expense') {
        pct = 100;
      }

      const typeLabel = type === 'income' ? '💰' : type === 'transfer' ? '🔄' : '';

      return `
        <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4">
          <div class="flex justify-between items-end mb-2">
            <h3 class="font-bold text-slate-700">${typeLabel} ${cat.name}</h3>
            <div class="text-right">
              <span class="text-sm font-bold ${labelColor}">${labelText}</span>
              ${type === 'expense' ? `<span class="text-xs text-slate-400 block">Plan: €${thisMonthBudget.toFixed(0)}</span>` : ''}
            </div>
          </div>
          ${type === 'expense' ? `
          <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
             <div class="${barColor} h-3 rounded-full" style="width: ${Math.min(pct, 100)}%"></div>
          </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  let html = '';

  // Income Section
  if (incomeCats.length > 0) {
    html += `<h3 class="text-sm font-bold text-emerald-600 uppercase mb-2 mt-4">Income</h3>`;
    html += renderCategoryList(incomeCats, 'income');
  }

  // Transfer Section
  if (transferCats.length > 0) {
    html += `<h3 class="text-sm font-bold text-blue-600 uppercase mb-2 mt-4">Transfers / Savings</h3>`;
    html += renderCategoryList(transferCats, 'transfer');
  }

  // Expense Section
  if (expenseCats.length > 0) {
    html += `<h3 class="text-sm font-bold text-red-600 uppercase mb-2 mt-4">Expenses</h3>`;
    html += renderCategoryList(expenseCats, 'expense');
  }

  // Summary
  const netBalance = totalIncome - totalTransfer - totalExpenses;
  html += `
    <div class="bg-slate-800 p-4 rounded-xl shadow-sm mt-6">
      <div class="flex justify-between text-white">
        <div>
          <span class="text-xs text-slate-400 block">Income</span>
          <span class="text-lg font-bold text-emerald-400">€${totalIncome.toFixed(0)}</span>
        </div>
        <div class="text-center">
          <span class="text-xs text-slate-400 block">Transfers</span>
          <span class="text-lg font-bold text-blue-400">€${totalTransfer.toFixed(0)}</span>
        </div>
        <div class="text-right">
          <span class="text-xs text-slate-400 block">Expenses</span>
          <span class="text-lg font-bold text-red-400">€${totalExpenses.toFixed(0)}</span>
        </div>
      </div>
      <div class="mt-3 pt-3 border-t border-slate-600 text-center">
        <span class="text-sm text-slate-400">Net Balance</span>
        <span class="text-xl font-bold block ${netBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}">€${netBalance.toFixed(0)}</span>
      </div>
    </div>
  `;

  container.innerHTML = html;
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

  // Group categories by type
  // Derive category type from transactions if not set
  const categoryTypes = {};
  transactions.forEach(t => {
    if (!categoryTypes[t.category] && t.type) {
      categoryTypes[t.category] = t.type;
    }
  });

  const incomeCats = categories.filter(c => (c.type || categoryTypes[c.name]) === 'income');
  const transferCats = categories.filter(c => (c.type || categoryTypes[c.name]) === 'transfer');
  const expenseCats = categories.filter(c => (c.type || categoryTypes[c.name]) === 'expense' || (!c.type && !categoryTypes[c.name]));

  // 2. Build Header Row
  let thead = `
    <thead class="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0">
      <tr>
        <th class="px-4 py-3 font-bold sticky left-0 bg-slate-50 border-r border-slate-200 z-10">Category</th>
        ${months.map(m => `<th class="px-4 py-3 text-center min-w-[120px] border-r border-slate-100">${m}</th>`).join('')}
        <th class="px-4 py-3 font-bold text-center bg-slate-50">Total</th>
      </tr>
      <tr>
        <th class="px-4 py-1 text-[10px] text-slate-400 sticky left-0 bg-slate-50 border-r border-slate-200 z-10 text-right font-normal italic">Type:</th>
        ${months.map(() => `<th class="px-4 py-1 text-[10px] text-slate-400 text-center font-normal border-r border-slate-100 italic">Spent / Budget</th>`).join('')}
        <th class="px-4 py-1 text-[10px] text-slate-400 text-center font-normal italic">Spent / Budget</th>
      </tr>
    </thead>
  `;

  // 3. Build Body Rows
  let tbody = '<tbody class="divide-y divide-slate-100">';
  
  // Calculate Column Totals on the fly
  const colTotalIncome = new Array(months.length).fill(0);
  const colTotalTransfer = new Array(months.length).fill(0);
  const colTotalExpense = new Array(months.length).fill(0);
  const colTotalBudget = new Array(months.length).fill(0);

  function renderCategoryRows(cats, type) {
    let html = '';
    
    cats.forEach(cat => {
      let rowTotal = 0;
      let rowBudget = parseFloat(cat.monthly_budget || 0);
      const catType = cat.type || categoryTypes[cat.name];

      const cells = months.map((m, index) => {
        const monthTxns = transactions.filter(t => t.category === cat.name && t.date.startsWith(m));
        let spent = monthTxns.reduce((sum, t) => {
          const txType = t.type || catType || 'expense';
          return sum + (txType === type ? Math.abs(parseFloat(t.amount)) : 0);
        }, 0);
        
        rowTotal += spent;
        
        if (type === 'expense') {
          colTotalExpense[index] += spent;
          colTotalBudget[index] += rowBudget;
        } else if (type === 'income') {
          colTotalIncome[index] += spent;
        } else if (type === 'transfer') {
          colTotalTransfer[index] += spent;
        }

        const isOver = type === 'expense' && spent > rowBudget;
        const textClass = isOver ? 'text-red-500 font-bold' : 
                         type === 'income' ? 'text-emerald-600' : 
                         type === 'transfer' ? 'text-blue-600' : 'text-slate-700';
        const bgClass = isOver ? 'bg-red-50' : '';

        return `
          <td class="px-4 py-3 text-center border-r border-slate-100 ${bgClass}">
            <div class="${textClass}">€${spent.toFixed(0)}</div>
            ${type === 'expense' ? `<div class="text-xs text-slate-400">/ €${rowBudget.toFixed(0)}</div>` : ''}
          </td>
        `;
      }).join('');

      const rowTotalClass = type === 'income' ? 'text-emerald-600 font-bold' : 
                           type === 'transfer' ? 'text-blue-600 font-bold' : 
                           rowTotal > rowBudget ? 'text-red-600 font-bold' : 'text-slate-800 font-bold';

      const typeEmoji = type === 'income' ? '💰' : type === 'transfer' ? '🔄' : '';

      html += `
        <tr class="hover:bg-slate-50">
          <td class="px-4 py-3 font-medium text-slate-700 bg-white sticky left-0 border-r border-slate-200 z-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
            ${typeEmoji} ${cat.name}
          </td>
          ${cells}
          <td class="px-4 py-3 text-center bg-slate-50">
            <div class="${rowTotalClass}">€${rowTotal.toFixed(0)}</div>
            ${type === 'expense' ? `<div class="text-xs text-slate-400">/ €${rowBudget.toFixed(0)}</div>` : ''}
          </td>
        </tr>
      `;
    });

    return html;
  }

  tbody += renderCategoryRows(incomeCats, 'income');
  tbody += renderCategoryRows(transferCats, 'transfer');
  tbody += renderCategoryRows(expenseCats, 'expense');

  // 4. Build Footer Row (Grand Totals)
  const footerCells = months.map((m, i) => {
    const income = colTotalIncome[i];
    const transfer = colTotalTransfer[i];
    const expense = colTotalExpense[i];
    const budget = colTotalBudget[i];
    const net = income - transfer - expense;

    return `
      <td class="px-4 py-3 text-center border-r border-slate-200 font-bold">
        <div class="flex flex-col gap-0.5 text-xs">
          <div class="text-emerald-600">€${income.toFixed(0)}</div>
          <div class="text-blue-600">€${transfer.toFixed(0)}</div>
          <div class="text-red-500">€${expense.toFixed(0)}</div>
        </div>
        <div class="text-xs ${net >= 0 ? 'text-emerald-600' : 'text-red-500'} font-bold mt-1">
          Net: €${net.toFixed(0)}
        </div>
        <div class="text-[10px] text-slate-400 font-normal mt-1">Budget: €${budget.toFixed(0)}</div>
      </td>
    `;
  }).join('');

  const grandTotalIncome = colTotalIncome.reduce((a,b)=>a+b,0);
  const grandTotalTransfer = colTotalTransfer.reduce((a,b)=>a+b,0);
  const grandTotalExpense = colTotalExpense.reduce((a,b)=>a+b,0);
  const grandTotalBudget = colTotalBudget.reduce((a,b)=>a+b,0);
  const grandNet = grandTotalIncome - grandTotalTransfer - grandTotalExpense;

  tbody += `
      <tr class="bg-slate-100 border-t-2 border-slate-200">
        <td class="px-4 py-3 font-bold text-slate-800 sticky left-0 bg-slate-100 border-r border-slate-200">TOTAL</td>
        ${footerCells}
        <td class="px-4 py-3 text-center font-bold text-slate-900 border-l border-slate-200">
           <div class="flex flex-col gap-1 text-xs">
             <div class="text-emerald-600 font-bold">💰 €${grandTotalIncome.toFixed(0)}</div>
             <div class="text-blue-600 font-bold">🔄 €${grandTotalTransfer.toFixed(0)}</div>
             <div class="text-red-500 font-bold">€${grandTotalExpense.toFixed(0)}</div>
           </div>
           <div class="text-sm ${grandNet >= 0 ? 'text-emerald-600' : 'text-red-500'} font-bold mt-2 pt-2 border-t border-slate-200">
             Net: €${grandNet.toFixed(0)}
           </div>
        </td>
      </tr>
  `;

  tbody += '</tbody>';
  table.innerHTML = thead + tbody;
}