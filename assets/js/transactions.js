import { db } from './database.js';
import { switchView } from './ui.js';

let historyTypeFilter = 'all';

export function setHistoryTypeFilter(type) {
  historyTypeFilter = type;

  const buttons = {
    all: document.getElementById('filterBtnAll'),
    positive: document.getElementById('filterBtnPos'),
    negative: document.getElementById('filterBtnNeg')
  };

  Object.keys(buttons).forEach(key => {
    if (!buttons[key]) return;
    buttons[key].className = key === type 
      ? "flex-1 py-1 text-xs font-bold rounded-md bg-indigo-600 text-white border border-indigo-600"
      : "flex-1 py-1 text-xs font-bold rounded-md bg-white text-slate-500 border border-slate-200";
  });

  loadAllTransactions();
}

export async function saveTransaction() {
  const id = document.getElementById('transactionId').value;
  const date = document.getElementById('date').value;
  const description = document.getElementById('description').value;
  const category = document.getElementById('categorySelect').value;
  const amount = document.getElementById('amount').value;
  const remark = document.getElementById('remark').value;

  const { data: { user } } = await db.auth.getUser();

  if (!date || !description || !category || !amount) {
    alert("Please fill in all required fields.");
    return;
  }

  const payload = { date, description, category, amount: parseFloat(amount), remark, user_id: user.id };

  const { error } = id 
    ? await db.from('transactions').update(payload).eq('id', id)
    : await db.from('transactions').insert([payload]);

  if (error) {
    alert(error.message);
  } else {
    cancelEdit();
    loadRecentTransactions();
    if (window.loadAllTransactions) window.loadAllTransactions();
    if (window.loadBudget) window.loadBudget();
  }
}

function renderList(data, elementId) {
  const list = document.getElementById(elementId);
  if (!list) return;

  if (data.length === 0) {
    list.innerHTML = '<li class="p-4 text-center text-slate-400">No transactions found.</li>';
    return;
  }

  list.innerHTML = data.map(t => {
    const isNegative = parseFloat(t.amount) < 0;
    const amountClass = isNegative ? "text-emerald-600" : "text-slate-700";
    
    return `
    <li class="py-3 flex justify-between items-center border-b border-slate-100 last:border-0 group">
        <div class="flex-1">
          <div class="font-medium text-slate-800">${t.description}</div>
          <div class="text-xs text-slate-500">
            ${t.date} • <span class="text-indigo-600 font-medium">${t.category}</span>
            ${t.remark ? `• <span class="italic text-slate-400">${t.remark}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-3">
            <span class="${amountClass} font-mono font-bold">€${parseFloat(t.amount).toFixed(2)}</span>
            <button onclick="editTransaction('${t.id}')" class="text-slate-300 hover:text-indigo-600 transition p-1">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
            </button>
            <button onclick="deleteTransaction('${t.id}')" class="text-slate-300 hover:text-red-500 transition p-1">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </button>
        </div>
    </li>
  `}).join('');
}

async function renderHistoryGrouped(data, elementId) {
  const container = document.getElementById(elementId);
  if (!container) return;

  if (data.length === 0) {
    container.innerHTML = `<div class="m-auto bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center min-w-[300px]"><p class="text-slate-400">No history available yet.</p></div>`;
    return;
  }
  
  const catDropdown = document.getElementById('historyCategoryFilter');
  if (catDropdown && catDropdown.options.length <= 1) { 
    const { data: categories } = await db.from('categories').select('name').order('name');
    if (categories) {
      catDropdown.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }
  }

  const monthlyData = {};
  data.forEach(t => {
    const [year, month, day] = t.date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const monthKey = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (!monthlyData[monthKey]) monthlyData[monthKey] = { totalExpense: 0, items: [] };
    monthlyData[monthKey].items.push({ ...t, dateObj });
    
    if (t.category.toLowerCase() !== 'inkomsten') {
        monthlyData[monthKey].totalExpense += parseFloat(t.amount);
    }
  });

  let html = '';
  let currentMonth = null;

  data.forEach((t) => {
    const [year, month, day] = t.date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (monthLabel !== currentMonth) {
      if (currentMonth !== null) html += '</ul></div>';
      html += `
      <div class="snap-center shrink-0 bg-white p-5 rounded-xl shadow-sm border border-slate-200 h-fit w-[calc(100vw-32px)] md:w-[400px] flex flex-col">
          <div class="flex justify-between items-end mb-4 pb-2 border-b border-slate-100">
            <h3 class="text-lg font-bold text-slate-700 capitalize">${monthLabel}</h3>
            <div class="text-right">
                <span class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Expenses</span>
                <div class="text-indigo-600 font-bold text-lg">€${monthlyData[monthLabel].totalExpense.toFixed(2)}</div>
            </div>
          </div>
          <ul class="divide-y divide-slate-50 flex-1 overflow-y-auto max-h-[60vh]">`;
      currentMonth = monthLabel;
    }

    const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = dateObj.getDate();
    const isNegative = parseFloat(t.amount) < 0;
    const amountClass = isNegative ? "text-emerald-600" : "text-slate-700";

    html += `
      <li class="py-3 flex justify-between items-center hover:bg-slate-50 transition rounded-lg px-2 -mx-2 group">
          <div class="flex items-center gap-3 flex-1 min-w-0">
              <div class="flex flex-col items-center justify-center bg-slate-100 text-slate-500 rounded-lg w-12 h-12 shrink-0 border border-slate-200">
                  <span class="text-[10px] uppercase font-bold leading-none mb-0.5">${weekday}</span>
                  <span class="text-lg font-bold leading-none text-slate-700">${dayNum}</span>
              </div>
              <div class="min-w-0 pr-2">
                  <div class="font-semibold text-slate-700 truncate">${t.description}</div>
                  <div class="text-xs text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span class="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium text-[10px] border border-indigo-100">${t.category}</span>
                      ${t.remark ? `<span class="truncate text-slate-400 italic">• ${t.remark}</span>` : ''}
                  </div>
              </div>
          </div>
          <div class="flex flex-col items-end gap-1 ml-2 shrink-0">
              <span class="${amountClass} font-bold">€${parseFloat(t.amount).toFixed(2)}</span>
              <div class="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button onclick="editTransaction('${t.id}')" class="text-slate-300 hover:text-indigo-600"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                   <button onclick="deleteTransaction('${t.id}')" class="text-slate-300 hover:text-red-500"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
              </div>
          </div>
      </li>`;
  });

  if (currentMonth !== null) html += '</ul></div>';
  container.innerHTML = html;
}

export async function loadRecentTransactions() {
  const { data, error } = await db.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(10);
  if (!error) renderList(data, 'transactionList');
}

export async function loadAllTransactions() {
  const { data, error } = await db.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false });
  if (error) return;

  const searchTerm = document.getElementById('historySearch')?.value.toLowerCase() || '';
  const categoryFilter = document.getElementById('historyCategoryFilter')?.value || '';

  const filteredData = data.filter(t => {
    const matchesSearch = t.description.toLowerCase().includes(searchTerm) || (t.remark && t.remark.toLowerCase().includes(searchTerm));
    const matchesCategory = categoryFilter === '' || t.category === categoryFilter;
    let matchesType = true;
    if (historyTypeFilter === 'positive') matchesType = parseFloat(t.amount) < 0;
    if (historyTypeFilter === 'negative') matchesType = parseFloat(t.amount) > 0;
    return matchesSearch && matchesCategory && matchesType;
  });

  renderHistoryGrouped(filteredData, 'fullTransactionList');
}

export async function editTransaction(id) {
  const { data, error } = await db.from('transactions').select('*').eq('id', id).single();
  if (error) return;
  
  document.getElementById('transactionId').value = data.id;
  document.getElementById('date').value = data.date;
  document.getElementById('description').value = data.description;
  document.getElementById('categorySelect').value = data.category;
  document.getElementById('amount').value = data.amount;
  document.getElementById('remark').value = data.remark || '';
  document.getElementById('formTitle').innerText = 'Edit Transaction';
  
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.innerText = 'Update Transaction';
  saveBtn.classList.replace('bg-emerald-500', 'bg-indigo-600');
  saveBtn.classList.replace('hover:bg-emerald-600', 'hover:bg-indigo-700');
  document.getElementById('cancelBtn').classList.remove('hidden');
  
  switchView('view-add');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function cancelEdit() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  document.getElementById('transactionId').value = '';
  document.getElementById('date').value = `${year}-${month}-${day}`;
  document.getElementById('description').value = '';
  document.getElementById('categorySelect').value = '';
  document.getElementById('amount').value = '';
  document.getElementById('remark').value = '';
  document.getElementById('formTitle').innerText = 'Add Transaction';
  
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.innerText = 'Save Transaction';
  saveBtn.classList.replace('bg-indigo-600', 'bg-emerald-500');
  saveBtn.classList.replace('hover:bg-indigo-700', 'hover:bg-emerald-600');
  document.getElementById('cancelBtn').classList.add('hidden');
}

export async function deleteTransaction(id) {
  if (!confirm("Are you sure?")) return;
  const { error } = await db.from('transactions').delete().eq('id', id);
  if (!error) {
    loadRecentTransactions();
    if (window.loadAllTransactions) window.loadAllTransactions();
    if (window.loadBudget) window.loadBudget();
  }
}

export async function exportCSV() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;

  const { data, error } = await db.from('transactions').select('*').order('date', { ascending: false });
  if (error || !data.length) return;

  const headers = ["WANNEER", "WAT", "HOEVEEL", "CATEGORIE", "OPMERKING"];
  const csvRows = [headers.join(',')];

  data.forEach(t => {
    csvRows.push([
      `"${t.date}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${t.amount}"`,
      `"${(t.category || '').replace(/"/g, '""')}"`,
      `"${(t.remark || '').replace(/"/g, '""')}"`
    ].join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budgat_export.csv';
  a.click();
}

export async function importCSV() {
  const file = document.getElementById('csvInput').files[0];
  const { data: { user } } = await db.auth.getUser();
  if (!file || !user) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const lines = e.target.result.split('\n').map(l => l.trim()).filter(l => l);
    const transactions = [];

    for (let i = 1; i < lines.length; i++) {
      let row = [], inQuotes = false, currentVal = '';
      for (let char of lines[i]) {
        if (char === '"') { inQuotes = !inQuotes; continue; }
        if (char === ',' && !inQuotes) { row.push(currentVal); currentVal = ''; continue; }
        currentVal += char;
      }
      row.push(currentVal);

      if (row.length >= 4) {
        transactions.push({
          user_id: user.id,
          date: row[0].trim(),
          description: row[1].trim(),
          amount: parseFloat(row[2].replace(',', '.')),
          category: row[3].trim(),
          remark: row[4] ? row[4].trim() : ''
        });
      }
    }

    if (transactions.length && confirm(`Import ${transactions.length} transactions?`)) {
      const { error } = await db.from('transactions').insert(transactions);
      if (!error) {
        alert("Success!");
        location.reload();
      }
    }
  };
  reader.readAsText(file);
}