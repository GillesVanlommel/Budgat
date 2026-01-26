import { db } from './database.js';

async function ensureMonthlyBudget(categoryId, defaultAmount, monthKey) {
  const { data: { user } } = await db.auth.getUser();

  const { data: existing } = await db
    .from('monthly_budgets')
    .select('*')
    .eq('category_id', categoryId)
    .eq('month', monthKey)
    .single();

  if (existing) return existing.amount;

  const { data: newRecord, error } = await db
    .from('monthly_budgets')
    .insert([{
      user_id: user.id,
      category_id: categoryId,
      month: monthKey,
      amount: defaultAmount
    }])
    .select()
    .single();

  if (error) console.error("Error creating monthly budget", error);
  return newRecord ? newRecord.amount : defaultAmount;
}

export async function loadBudget() {
  const container = document.getElementById('budgetContainer');
  if (!container) return;

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: categories } = await db.from('categories').select('*');
  const { data: allTransactions } = await db.from('transactions').select('category, amount, date');
  const { data: allBudgetHistory } = await db.from('monthly_budgets').select('*');

  let totalBudgetPlan = 0;
  let currentMonthNet = 0;
  
  const budgetHTML = await Promise.all(categories.map(async (cat) => {
      const thisMonthBudget = await ensureMonthlyBudget(cat.id, cat.monthly_budget, currentMonthKey);
      
      totalBudgetPlan += parseFloat(thisMonthBudget);

      const catHistory = allBudgetHistory ? allBudgetHistory.filter(h => h.category_id === cat.id) : [];
      let totalBudgetedLifetime = catHistory.reduce((sum, h) => sum + parseFloat(h.amount), 0);
      
      const alreadyInHistory = catHistory.find(h => h.month === currentMonthKey);
      if (!alreadyInHistory) totalBudgetedLifetime += parseFloat(thisMonthBudget);

      const totalNetVal = allTransactions
          .filter(t => t.category === cat.name)
          .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      const available = totalBudgetedLifetime - totalNetVal;
      
      const monthNetVal = allTransactions
        .filter(t => t.category === cat.name && t.date.startsWith(currentMonthKey))
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      currentMonthNet += monthNetVal;

      let pct = 0;
      if (Math.abs(thisMonthBudget) > 0) {
        pct = (Math.abs(monthNetVal) / Math.abs(thisMonthBudget)) * 100;
      }

      let labelColor, barColor, labelText;

      if (available < 0) {
          labelColor = 'text-red-500';
          barColor = 'bg-red-500';
          labelText = `€${Math.abs(available).toFixed(2)} ${thisMonthBudget < 0 ? 'to go' : 'Over'}`;
      } else {
          labelColor = 'text-emerald-500';
          barColor = 'bg-indigo-500';
          labelText = `€${available.toFixed(2)} ${thisMonthBudget < 0 ? 'Surplus' : 'Left'}`;
      }

      return `
        <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4">
          <div class="flex justify-between items-end mb-2">
            <h3 class="font-bold text-slate-700">${cat.name}</h3>
            <div class="text-right">
              <span class="text-sm font-bold ${labelColor}">${labelText}</span>
              <span class="text-xs text-slate-400 block">Plan: €${thisMonthBudget} + Rollover</span>
            </div>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
             <div class="${barColor} h-3 rounded-full" style="width: ${Math.min(pct, 100)}%"></div>
          </div>
        </div>
      `;
  }));

  container.innerHTML = budgetHTML.join('');

  const headerEl = document.querySelector('#view-budget h2');
  if (headerEl) {
    headerEl.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-baseline gap-2">
        <span>Monthly Budget</span>
        <span class="text-sm font-normal text-slate-400">
          (Net Plan: €${totalBudgetPlan.toFixed(0)}) 
          <span class="${currentMonthNet > totalBudgetPlan ? 'text-red-500' : 'text-emerald-500'} font-bold">
            Actual: €${currentMonthNet.toFixed(0)}
          </span>
        </span>
      </div>
    `;
  }
}