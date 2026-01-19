import { db } from './database.js';

// 1. ADD TRANSACTION
export async function addTransaction() {
  const amount = document.getElementById('amount').value;
  const category = document.getElementById('categorySelect').value;
  
  // Get current user
  const { data: { user } } = await db.auth.getUser();

  if (!category) {
    alert("Please select a category first!");
    return;
  }
  
  if (!amount) {
    alert("Please enter an amount!");
    return;
  }

  const { error } = await db
    .from('transactions')
    .insert([{ 
      amount: parseFloat(amount), 
      category: category, 
      user_id: user.id 
    }]);

  if (error) {
    alert(error.message);
  } else {
    // Clear the form
    document.getElementById('amount').value = '';
    
    // Refresh the list
    loadTransactions();
  }
}

// 2. LOAD TRANSACTIONS
export async function loadTransactions() {
  const { data, error } = await db
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const list = document.getElementById('transactionList');
  
  if (data.length === 0) {
    list.innerHTML = '<li class="p-4 text-center text-slate-400">No transactions yet.</li>';
    return;
  }

  list.innerHTML = data.map(t => `
    <li class="py-3 flex justify-between border-b border-slate-100 last:border-0">
        <span class="font-medium text-slate-700">${t.category}</span>
        <span class="text-slate-500 font-mono">€${parseFloat(t.amount).toFixed(2)}</span>
    </li>
  `).join('');
}