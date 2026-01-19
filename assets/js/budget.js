import { db } from './database.js';

export async function loadBudget() {
  const container = document.getElementById('budgetContainer');
  if (!container) return; // Safety check

  // 1. Get Dates for Current Month
  const date = new Date();
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
  // We use ISO strings for Supabase comparison

  // 2. Fetch Categories (with their budgets)
  const { data: categories, error: catError } = await db
    .from('categories')
    .select('*')
    .order('name');
  
  // 3. Fetch Transactions (only for this month)
  const { data: transactions, error: transError } = await db
    .from('transactions')
    .select('*')
    .gte('date', firstDay); // "Greater than or equal to" 1st of month

  if (catError || transError) {
    console.error("Error loading budget data");
    return;
  }

  // 4. Calculate Totals
  // Create a map to store spending: { "Groceries": 150.00, "Rent": 800.00 }
  const spendingMap = {};
  
  transactions.forEach(t => {
    // If we haven't seen this category yet, init to 0
    if (!spendingMap[t.category]) spendingMap[t.category] = 0;
    spendingMap[t.category] += parseFloat(t.amount);
  });

  // 5. Generate HTML
  if (categories.length === 0) {
    container.innerHTML = '<p class="text-center text-slate-400 mt-10">No categories set up yet.</p>';
    return;
  }

  container.innerHTML = categories.map(cat => {
    const spent = spendingMap[cat.name] || 0;
    const limit = parseFloat(cat.monthly_budget) || 0;
    
    // Avoid division by zero
    let percentage = 0;
    if (limit > 0) {
      percentage = (spent / limit) * 100;
    }
    
    // Determine Color
    let colorClass = 'bg-emerald-500'; // Green (Safe)
    if (percentage >= 80) colorClass = 'bg-yellow-400'; // Warning
    if (percentage >= 100) colorClass = 'bg-red-500';   // Danger/Over

    // Cap the visual bar at 100% so it doesn't break layout
    const visualWidth = Math.min(percentage, 100);

    return `
      <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        
        <div class="flex justify-between items-end mb-2">
          <h3 class="font-bold text-slate-700">${cat.name}</h3>
          <div class="text-right">
            <span class="text-sm font-semibold ${spent > limit ? 'text-red-500' : 'text-slate-700'}">€${spent.toFixed(2)}</span>
            <span class="text-xs text-slate-400"> / €${limit.toFixed(2)}</span>
          </div>
        </div>

        <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div class="${colorClass} h-3 rounded-full transition-all duration-500" 
               style="width: ${visualWidth}%"></div>
        </div>

        <div class="mt-1 text-xs text-right ${percentage >= 100 ? 'text-red-500 font-bold' : 'text-slate-400'}">
          ${percentage.toFixed(0)}% Used
        </div>

      </div>
    `;
  }).join('');
}