import { db } from './database.js';

// 1. ADD TRANSACTION
export async function addTransaction() {
  // Get all values based on your new order
  const date = document.getElementById('date').value;
  const description = document.getElementById('description').value;
  const category = document.getElementById('categorySelect').value;
  const amount = document.getElementById('amount').value;
  const remark = document.getElementById('remark').value; // Optional
  
  const { data: { user } } = await db.auth.getUser();

  // Validate required fields
  if (!date) { alert("Please select a date!"); return; }
  if (!description) { alert("Please enter a description!"); return; }
  if (!category) { alert("Please select a category!"); return; }
  if (!amount) { alert("Please enter an amount!"); return; }

  const { error } = await db
    .from('transactions')
    .insert([{ 
      date: date,
      description: description,
      category: category, 
      amount: parseFloat(amount),
      remark: remark,
      user_id: user.id 
    }]);

  if (error) {
    alert(error.message);
  } else {
    // Clear the form fields
    document.getElementById('date').value = '';
    document.getElementById('description').value = '';
    document.getElementById('categorySelect').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('remark').value = '';
    
    loadTransactions();
  }
}

// 2. LOAD TRANSACTIONS
export async function loadTransactions() {
  const { data, error } = await db
    .from('transactions')
    .select('*')
    // Order by the new 'date' column instead of created_at
    .order('date', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const list = document.getElementById('transactionList');
  
  if (data.length === 0) {
    list.innerHTML = '<li class="p-4 text-center text-slate-400">No transactions yet.</li>';
    return;
  }

  // Updated display to show Date and Description
  list.innerHTML = data.map(t => `
    <li class="py-3 flex justify-between items-center border-b border-slate-100 last:border-0">
        <div>
          <div class="font-medium text-slate-800">${t.description}</div>
          <div class="text-xs text-slate-500">
            ${t.date} • <span class="text-indigo-600 font-medium">${t.category}</span>
            ${t.remark ? `• <span class="italic text-slate-400">${t.remark}</span>` : ''}
          </div>
        </div>
        <span class="text-slate-700 font-mono font-bold">€${parseFloat(t.amount).toFixed(2)}</span>
    </li>
  `).join('');
}