import { db } from './database.js';

export async function addReconciliation() {
  const amountInput = document.getElementById('reconAmount');
  const amount = parseFloat(amountInput.value);

  if (isNaN(amount)) {
    alert("Please enter a valid amount.");
    return;
  }

  // Generate "Today" in YYYY-MM-DD format based on local time
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const { data: { user } } = await db.auth.getUser();

  // Check if we already have a checkpoint for today (Update vs Insert)
  const { data: existing } = await db.from('reconciliations')
    .select('id')
    .eq('balance_date', date)
    .single();

  let error;
  if (existing) {
    const res = await db.from('reconciliations').update({ amount }).eq('id', existing.id);
    error = res.error;
  } else {
    const res = await db.from('reconciliations').insert([{ user_id: user.id, balance_date: date, amount }]);
    error = res.error;
  }

  if (error) {
    alert("Error saving checkpoint: " + error.message);
  } else {
    amountInput.value = '';
    loadReconciliationList();
  }
}

export async function deleteReconciliation(id) {
  if(!confirm("Are you sure you want to delete this checkpoint?")) return;
  await db.from('reconciliations').delete().eq('id', id);
  loadReconciliationList();
}

export async function loadReconciliationList() {
  const container = document.getElementById('reconciliationList');
  if (!container) return;

  const { data: { user } } = await db.auth.getUser();

  // 1. Fetch all checkpoints
  const { data: points, error: rError } = await db
    .from('reconciliations')
    .select('*')
    .order('balance_date', { ascending: true });

  if (rError || !points.length) {
    container.innerHTML = '<p class="text-slate-400 text-sm italic">No checkpoints set yet. Add one to start tracking.</p>';
    return;
  }

  // 2. Fetch transactions starting from the VERY FIRST checkpoint date
  const firstDate = points[0].balance_date;
  const { data: transactions } = await db
    .from('transactions')
    .select('date, amount')
    .gte('date', firstDate)
    .order('date', { ascending: true });

  // 3. Perform Logic
  const results = points.map((point, index) => {
    const dateStr = new Date(point.balance_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    const actual = parseFloat(point.amount);
    let statusHtml = '';
    let isMatch = true;

    if (index === 0) {
      statusHtml = `<span class="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 uppercase tracking-wide">Baseline</span>`;
    } else {
      const prevPoint = points[index - 1];
      const relevantTrans = transactions.filter(t => 
        t.date > prevPoint.balance_date && t.date <= point.balance_date
      );

      const delta = relevantTrans.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const expected = parseFloat(prevPoint.amount) - delta;
      
      const diff = actual - expected;
      isMatch = Math.abs(diff) < 0.05;

      if (isMatch) {
        statusHtml = `<span class="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center gap-1">✓ Matched</span>`;
      } else {
        statusHtml = `
          <div class="text-right">
            <span class="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100 block">
              Diff: ${diff > 0 ? '+' : ''}€${diff.toFixed(2)}
            </span>
            <span class="text-[10px] text-slate-400 block mt-1">
              System thought: €${expected.toFixed(2)}
            </span>
          </div>`;
      }
    }

    return { id: point.id, dateStr, actual, statusHtml, isMatch };
  });

  // 4. Render
  container.innerHTML = results.reverse().map(r => `
    <div class="flex justify-between items-center p-4 bg-white border ${r.isMatch ? 'border-slate-100' : 'border-red-200 ring-1 ring-red-50'} rounded-xl mb-3 shadow-sm">
      <div>
        <div class="font-bold text-slate-700">${r.dateStr}</div>
        <div class="text-sm text-slate-500">Balance: <span class="font-mono text-slate-700 font-medium">€${r.actual.toFixed(2)}</span></div>
      </div>
      <div class="flex items-center gap-3">
        ${r.statusHtml}
        <button onclick="deleteReconciliation('${r.id}')" class="text-slate-300 hover:text-red-500 p-2 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
             <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}