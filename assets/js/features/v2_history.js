import {
  getCurrentHousehold,
  getHouseholdAccounts,
  getV2HistoryTransactions,
  getV2HouseholdCategories,
  setV2HistoryTransactions
} from '../core/app_state.js';
import { db } from '../core/database.js';

function getV2HistoryUiElements() {
  return {
    searchInput: document.getElementById('v2HistorySearch'),
    monthInput: document.getElementById('v2HistoryMonth'),
    kindInput: document.getElementById('v2HistoryKind'),
    accountInput: document.getElementById('v2HistoryAccount'),
    categoryInput: document.getElementById('v2HistoryCategory'),
    list: document.getElementById('v2HistoryList'),
    emptyHint: document.getElementById('v2HistoryEmptyHint'),
    setupHint: document.getElementById('v2HistorySetupHint'),
    resultsMeta: document.getElementById('v2HistoryResultsMeta')
  };
}

function getTodayMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeMonthInput(value) {
  if (!value) return null;
  return `${value}-01`;
}

export async function listV2HistoryTransactions({
  householdId,
  search = '',
  kind = '',
  accountId = '',
  categoryId = '',
  month = '',
  limit = 200
}) {
  const { data, error } = await db.rpc('list_household_transactions', {
    p_household_id: householdId,
    p_search: search || null,
    p_kind: kind || null,
    p_account_id: accountId || null,
    p_category_id: categoryId || null,
    p_month: normalizeMonthInput(month),
    p_limit: limit
  });

  if (error) throw error;
  const transactions = data || [];
  setV2HistoryTransactions(transactions);
  return transactions;
}

export async function updateV2HistoryTransaction({
  householdId,
  transactionId,
  transactionDate,
  description,
  notes = '',
  amount,
  isCleared = false
}) {
  const payload = {
    transaction_date: transactionDate,
    description,
    notes: notes || null,
    amount,
    is_cleared: isCleared
  };

  const { data, error } = await db
    .from('household_transactions')
    .update(payload)
    .eq('id', transactionId)
    .eq('household_id', householdId)
    .select('id')
    .single();

  if (error) throw error;
  return data || null;
}

export async function deleteV2HistoryTransaction({ householdId, transactionId }) {
  const { error } = await db
    .from('household_transactions')
    .delete()
    .eq('id', transactionId)
    .eq('household_id', householdId);

  if (error) throw error;
}

function renderHistoryFilters() {
  const { monthInput, accountInput, categoryInput } = getV2HistoryUiElements();
  const accounts = getHouseholdAccounts().filter(account => !account.archived);
  const categories = getV2HouseholdCategories().filter(category => !category.archived);

  if (monthInput && !monthInput.value) {
    monthInput.value = getTodayMonthString();
  }

  if (accountInput) {
    const selected = accountInput.value || '';
    accountInput.innerHTML = `
      <option value="">All Accounts</option>
      ${accounts.map(account => `
        <option value="${account.account_id}">${account.name}</option>
      `).join('')}
    `;
    accountInput.value = accounts.some(account => account.account_id === selected) ? selected : '';
  }

  if (categoryInput) {
    const selected = categoryInput.value || '';
    categoryInput.innerHTML = `
      <option value="">All Categories</option>
      ${categories.map(category => `
        <option value="${category.category_id}">
          ${category.name} (${category.flow_type})
        </option>
      `).join('')}
    `;
    categoryInput.value = categories.some(category => category.category_id === selected) ? selected : '';
  }
}

export function renderV2History() {
  const { list, emptyHint, setupHint, resultsMeta } = getV2HistoryUiElements();
  const household = getCurrentHousehold();
  const transactions = household ? getV2HistoryTransactions() : [];
  const hasAccounts = getHouseholdAccounts().length > 0;
  const hasCategories = getV2HouseholdCategories().length > 0;

  renderHistoryFilters();

  if (setupHint) {
    const shouldShowSetup = !hasAccounts || !hasCategories;
    setupHint.classList.toggle('hidden', !shouldShowSetup);
  }

  if (resultsMeta) {
    resultsMeta.textContent = `${transactions.length} result${transactions.length === 1 ? '' : 's'}`;
  }

  if (!list) return;

  if (transactions.length === 0) {
    list.innerHTML = '';
    if (emptyHint) emptyHint.classList.remove('hidden');
    return;
  }

  if (emptyHint) emptyHint.classList.add('hidden');

  list.innerHTML = transactions.map(transaction => {
    const badgeClass = transaction.kind === 'expense'
      ? 'bg-red-50 text-red-700 border-red-100'
      : transaction.kind === 'income'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
        : 'bg-blue-50 text-blue-700 border-blue-100';

    const secondary = transaction.kind === 'transfer'
      ? `${transaction.account_name} -> ${transaction.to_account_name || 'Unknown'}`
      : `${transaction.account_name} · ${transaction.category_name || 'No category'}`;

    return `
      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm" data-history-transaction-id="${transaction.transaction_id}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] px-2 py-0.5 rounded-full border ${badgeClass}">${transaction.kind}</span>
              ${transaction.is_cleared ? '<span class="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500">cleared</span>' : ''}
            </div>
            <div class="font-semibold text-slate-800 truncate">${transaction.description}</div>
            <div class="text-xs text-slate-500">${transaction.transaction_date} · ${secondary}</div>
            ${transaction.notes ? `<div class="text-xs text-slate-400 italic mt-1">${transaction.notes}</div>` : ''}
          </div>
          <div class="text-right shrink-0">
            <div class="font-mono font-bold text-slate-800">€${Number(transaction.amount || 0).toFixed(2)}</div>
            <div class="mt-2 flex items-center justify-end gap-2">
              <button type="button" class="text-xs px-2 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50" data-history-transaction-action="edit">Edit</button>
              <button type="button" class="text-xs px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50" data-history-transaction-action="delete">Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export async function loadV2History() {
  const household = getCurrentHousehold();
  const {
    searchInput,
    monthInput,
    kindInput,
    accountInput,
    categoryInput
  } = getV2HistoryUiElements();

  renderHistoryFilters();

  if (!household?.household_id) {
    setV2HistoryTransactions([]);
    renderV2History();
    return;
  }

  const transactions = await listV2HistoryTransactions({
    householdId: household.household_id,
    search: searchInput?.value || '',
    kind: kindInput?.value || '',
    accountId: accountInput?.value || '',
    categoryId: categoryInput?.value || '',
    month: monthInput?.value || '',
    limit: 200
  });

  setV2HistoryTransactions(transactions);
  renderV2History();
}

export function bindV2HistoryUi({ onTransactionsChanged } = {}) {
  const {
    searchInput,
    monthInput,
    kindInput,
    accountInput,
    categoryInput,
    list
  } = getV2HistoryUiElements();

  if (searchInput) searchInput.oninput = () => { loadV2History(); };
  if (monthInput) monthInput.onchange = () => { loadV2History(); };
  if (kindInput) kindInput.onchange = () => { loadV2History(); };
  if (accountInput) accountInput.onchange = () => { loadV2History(); };
  if (categoryInput) categoryInput.onchange = () => { loadV2History(); };

  if (list) {
    list.onclick = async (event) => {
      const actionButton = event.target.closest('[data-history-transaction-action]');
      if (!actionButton) return;

      const row = actionButton.closest('[data-history-transaction-id]');
      const transactionId = row?.dataset.historyTransactionId;
      const action = actionButton.dataset.historyTransactionAction;
      const household = getCurrentHousehold();

      if (!transactionId || !household?.household_id) return;

      const transaction = getV2HistoryTransactions().find(tx => tx.transaction_id === transactionId);
      if (!transaction) return;

      actionButton.disabled = true;

      try {
        if (action === 'delete') {
          const confirmed = window.confirm('Delete this transaction?');
          if (!confirmed) return;

          await deleteV2HistoryTransaction({
            householdId: household.household_id,
            transactionId
          });
        }

        if (action === 'edit') {
          const nextDateInput = window.prompt('Transaction date (YYYY-MM-DD)', transaction.transaction_date || '');
          if (nextDateInput === null) return;
          const nextDescriptionInput = window.prompt('Description', transaction.description || '');
          if (nextDescriptionInput === null) return;
          const nextAmountRawInput = window.prompt('Amount', String(transaction.amount || ''));
          if (nextAmountRawInput === null) return;
          const nextNotesInput = window.prompt('Notes (optional)', transaction.notes || '');
          if (nextNotesInput === null) return;
          const nextClearedRawInput = window.prompt('Cleared? (yes/no)', transaction.is_cleared ? 'yes' : 'no');
          if (nextClearedRawInput === null) return;

          const nextDate = nextDateInput;
          const nextDescription = nextDescriptionInput;
          const nextAmountRaw = nextAmountRawInput;
          const nextNotes = nextNotesInput;
          const nextClearedRaw = nextClearedRawInput;
          const nextAmount = Number(nextAmountRaw);
          const normalizedCleared = nextClearedRaw.trim().toLowerCase();
          const nextCleared = normalizedCleared === 'yes' || normalizedCleared === 'y' || normalizedCleared === 'true' || normalizedCleared === '1';

          if (!nextDate || Number.isNaN(new Date(nextDate).getTime())) {
            throw new Error('Valid transaction date is required (YYYY-MM-DD).');
          }

          if (!nextDescription.trim()) {
            throw new Error('Description is required.');
          }

          if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
            throw new Error('Amount must be greater than zero.');
          }

          await updateV2HistoryTransaction({
            householdId: household.household_id,
            transactionId,
            transactionDate: nextDate,
            description: nextDescription.trim(),
            notes: nextNotes.trim(),
            amount: nextAmount,
            isCleared: nextCleared
          });
        }

        await loadV2History();

        if (onTransactionsChanged) {
          await onTransactionsChanged();
        }
      } catch (error) {
        window.alert(error.message || 'Failed to update transaction.');
      } finally {
        actionButton.disabled = false;
      }
    };
  }
}
