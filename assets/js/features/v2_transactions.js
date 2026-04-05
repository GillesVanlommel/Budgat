import {
  getCurrentHousehold,
  getHouseholdAccounts,
  getV2RecentTransactions,
  getV2HouseholdCategories,
  setV2RecentTransactions
} from '../core/app_state.js';
import { db } from '../core/database.js';

const DEFAULT_LIMIT = 10;

function getV2TransactionUiElements() {
  return {
    form: document.getElementById('v2TransactionForm'),
    dateInput: document.getElementById('v2TransactionDate'),
    kindInput: document.getElementById('v2TransactionKind'),
    descriptionInput: document.getElementById('v2TransactionDescription'),
    amountInput: document.getElementById('v2TransactionAmount'),
    notesInput: document.getElementById('v2TransactionNotes'),
    accountInput: document.getElementById('v2TransactionAccount'),
    destinationAccountInput: document.getElementById('v2TransactionDestinationAccount'),
    categoryInput: document.getElementById('v2TransactionCategory'),
    clearedInput: document.getElementById('v2TransactionCleared'),
    submitBtn: document.getElementById('v2TransactionSubmitBtn'),
    errorBox: document.getElementById('v2TransactionError'),
    destinationWrapper: document.getElementById('v2DestinationAccountWrap'),
    categoryWrapper: document.getElementById('v2CategoryWrap'),
    list: document.getElementById('v2RecentTransactionList'),
    listEmptyHint: document.getElementById('v2TransactionEmptyHint'),
    setupHint: document.getElementById('v2TransactionSetupHint'),
    metricIncome: document.getElementById('dashboardMetricIncome'),
    metricExpense: document.getElementById('dashboardMetricExpense'),
    metricTransfers: document.getElementById('dashboardMetricTransfers'),
    metricNet: document.getElementById('dashboardMetricNet')
  };
}

function setV2TransactionError(message) {
  const { errorBox } = getV2TransactionUiElements();
  if (!errorBox) return;

  if (!message) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    return;
  }

  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function listRecentV2Transactions(householdId, limit = DEFAULT_LIMIT) {
  const { data, error } = await db.rpc('list_recent_household_transactions', {
    p_household_id: householdId,
    p_limit: limit
  });

  if (error) throw error;
  const transactions = data || [];
  setV2RecentTransactions(transactions);
  return transactions;
}

export async function createV2Transaction({
  householdId,
  transactionDate,
  kind,
  description,
  notes = '',
  amount,
  accountId,
  toAccountId = null,
  categoryId = null,
  isCleared = false
}) {
  const { data, error } = await db.rpc('create_household_transaction', {
    p_household_id: householdId,
    p_transaction_date: transactionDate,
    p_kind: kind,
    p_description: description,
    p_notes: notes || null,
    p_amount: amount,
    p_account_id: accountId,
    p_to_account_id: toAccountId || null,
    p_category_id: categoryId || null,
    p_is_cleared: isCleared
  });

  if (error) throw error;
  return data || null;
}

export async function updateV2Transaction({
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

export async function deleteV2Transaction({ householdId, transactionId }) {
  const { error } = await db
    .from('household_transactions')
    .delete()
    .eq('id', transactionId)
    .eq('household_id', householdId);

  if (error) throw error;
}

export async function hydrateV2TransactionContext() {
  const household = getCurrentHousehold();

  if (!household?.household_id) {
    setV2RecentTransactions([]);
    return { transactions: [] };
  }

  const transactions = await listRecentV2Transactions(household.household_id);
  return { transactions };
}

export async function loadV2TransactionView() {
  await hydrateV2TransactionContext();
  renderV2TransactionForm();
  renderV2RecentTransactions();
}

function getVisibleCategoriesForKind(kind, accountId) {
  if (!accountId) return [];

  return getV2HouseholdCategories().filter(category => {
    if (category.account_id !== accountId) return false;
    if (kind === 'expense') return category.flow_type === 'expense';
    if (kind === 'income') return category.flow_type === 'income';
    return false;
  });
}

export function renderV2TransactionForm() {
  const {
    dateInput,
    kindInput,
    accountInput,
    destinationAccountInput,
    categoryInput,
    destinationWrapper,
    categoryWrapper,
    setupHint
  } = getV2TransactionUiElements();

  const accounts = getHouseholdAccounts().filter(account => !account.archived);
  const currentMemberId = getCurrentHousehold()?.member_id || null;
  const directlyVisibleAccounts = accounts.filter(account => (
    !account.owner_member_id || account.owner_member_id === currentMemberId
  ));
  const kind = kindInput?.value || 'expense';
  const selectableSourceAccounts = kind === 'transfer' ? accounts : directlyVisibleAccounts;
  const selectedSourceId = accountInput?.value || '';
  const selectedDestinationId = destinationAccountInput?.value || '';
  const selectedCategoryId = categoryInput?.value || '';
  const fallbackSourceId = selectableSourceAccounts[0]?.account_id || '';

  if (dateInput && !dateInput.value) {
    dateInput.value = getTodayString();
  }

  if (accountInput) {
    accountInput.innerHTML = `
      <option value="">Select source account</option>
      ${selectableSourceAccounts.map(account => `
        <option value="${account.account_id}">${account.name}</option>
      `).join('')}
    `;
    accountInput.value = selectableSourceAccounts.some(account => account.account_id === selectedSourceId)
      ? selectedSourceId
      : fallbackSourceId;
  }

  const currentSourceId = accountInput?.value || '';
  const categories = getVisibleCategoriesForKind(kind, currentSourceId);

  if (destinationAccountInput) {
    const destinationAccounts = accounts.filter(account => account.account_id !== currentSourceId);
    destinationAccountInput.innerHTML = `
      <option value="">Select destination account</option>
      ${destinationAccounts.map(account => `
        <option value="${account.account_id}">${account.name}</option>
      `).join('')}
    `;
    destinationAccountInput.value = destinationAccounts.some(account => account.account_id === selectedDestinationId)
      ? selectedDestinationId
      : '';
  }

  if (categoryInput) {
    const categoryPlaceholder = currentSourceId ? 'Select category' : 'Select source account first';
    categoryInput.innerHTML = `
      <option value="">${categoryPlaceholder}</option>
      ${categories.map(category => `
        <option value="${category.category_id}">
          ${category.name} (${category.category_kind_name})
        </option>
      `).join('')}
    `;
    categoryInput.value = categories.some(category => category.category_id === selectedCategoryId) ? selectedCategoryId : '';
    categoryInput.disabled = kind === 'transfer' || !currentSourceId;
  }

  if (destinationWrapper) {
    destinationWrapper.classList.toggle('hidden', kind !== 'transfer');
  }

  if (categoryWrapper) {
    categoryWrapper.classList.toggle('hidden', kind === 'transfer');
  }

  if (setupHint) {
    const missingAccounts = accounts.length === 0;
    const missingCategories = kind !== 'transfer' && !!currentSourceId && categories.length === 0;
    setupHint.classList.toggle('hidden', !(missingAccounts || missingCategories));
  }
}

export function renderV2RecentTransactions() {
  const {
    list,
    listEmptyHint,
    metricIncome,
    metricExpense,
    metricTransfers,
    metricNet
  } = getV2TransactionUiElements();
  const transactions = getCurrentHousehold() ? getV2RecentTransactions() : [];
  const totals = transactions.reduce((acc, tx) => {
    const amount = Number(tx.amount || 0);
    if (tx.kind === 'income') acc.income += amount;
    if (tx.kind === 'expense') acc.expense += amount;
    if (tx.kind === 'transfer') acc.transfers += amount;
    return acc;
  }, { income: 0, expense: 0, transfers: 0 });
  const net = totals.income - totals.expense;

  if (metricIncome) metricIncome.textContent = `EUR ${totals.income.toFixed(2)}`;
  if (metricExpense) metricExpense.textContent = `EUR ${totals.expense.toFixed(2)}`;
  if (metricTransfers) metricTransfers.textContent = `EUR ${totals.transfers.toFixed(2)}`;
  if (metricNet) metricNet.textContent = `EUR ${net.toFixed(2)}`;

  if (!list) return;

  if (transactions.length === 0) {
    list.innerHTML = '';
    if (listEmptyHint) listEmptyHint.classList.remove('hidden');
    return;
  }

  if (listEmptyHint) listEmptyHint.classList.add('hidden');

  list.innerHTML = transactions.map(transaction => {
    const secondary = transaction.kind === 'transfer'
      ? `${transaction.account_name} -> ${transaction.to_account_name || 'Unknown'}`
      : `${transaction.account_name} · ${transaction.category_name || 'No category'}`;

    const kindStyle = transaction.kind === 'expense'
      ? 'bg-red-50 text-red-700 border-red-100'
      : transaction.kind === 'income'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
        : 'bg-blue-50 text-blue-700 border-blue-100';

    return `
      <li class="py-3 flex items-center justify-between border-b border-slate-100 last:border-0" data-transaction-id="${transaction.transaction_id}">
        <div class="min-w-0 pr-3">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[10px] px-2 py-0.5 rounded-full border ${kindStyle}">${transaction.kind}</span>
            ${transaction.is_cleared ? '<span class="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500">cleared</span>' : ''}
          </div>
          <div class="font-medium text-slate-800 truncate">${transaction.description}</div>
          <div class="text-xs text-slate-500 truncate">${transaction.transaction_date} · ${secondary}</div>
          ${transaction.notes ? `<div class="text-xs text-slate-400 italic truncate">${transaction.notes}</div>` : ''}
        </div>
        <div class="text-right shrink-0">
          <div class="font-mono font-bold text-slate-800">€${Number(transaction.amount || 0).toFixed(2)}</div>
          <div class="mt-2 flex items-center justify-end gap-2">
            <button type="button" class="text-xs px-2 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50" data-transaction-action="edit">Edit</button>
            <button type="button" class="text-xs px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50" data-transaction-action="delete">Delete</button>
          </div>
        </div>
      </li>
    `;
  }).join('');
}

function resetV2TransactionForm() {
  const {
    dateInput,
    kindInput,
    descriptionInput,
    amountInput,
    notesInput,
    accountInput,
    destinationAccountInput,
    categoryInput,
    clearedInput
  } = getV2TransactionUiElements();

  if (dateInput) dateInput.value = getTodayString();
  if (kindInput) kindInput.value = 'expense';
  if (descriptionInput) descriptionInput.value = '';
  if (amountInput) amountInput.value = '';
  if (notesInput) notesInput.value = '';
  if (accountInput) accountInput.value = '';
  if (destinationAccountInput) destinationAccountInput.value = '';
  if (categoryInput) categoryInput.value = '';
  if (clearedInput) clearedInput.checked = false;
}

export function bindV2TransactionUi({ onTransactionsChanged }) {
  const {
    form,
    kindInput,
    accountInput,
    dateInput,
    descriptionInput,
    amountInput,
    notesInput,
    destinationAccountInput,
    categoryInput,
    clearedInput,
    submitBtn,
    list
  } = getV2TransactionUiElements();

  if (kindInput) {
    kindInput.onchange = () => {
      renderV2TransactionForm();
    };
  }

  if (accountInput) {
    accountInput.onchange = () => {
      renderV2TransactionForm();
    };
  }

  if (!form) return;

  form.onsubmit = async (event) => {
    event.preventDefault();
    setV2TransactionError('');

    const household = getCurrentHousehold();
    if (!household?.household_id) {
      setV2TransactionError('Select or create a household first.');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      await createV2Transaction({
        householdId: household.household_id,
        transactionDate: dateInput?.value || '',
        kind: kindInput?.value || 'expense',
        description: descriptionInput?.value || '',
        notes: notesInput?.value || '',
        amount: Number(amountInput?.value || 0),
        accountId: accountInput?.value || null,
        toAccountId: destinationAccountInput?.value || null,
        categoryId: categoryInput?.value || null,
        isCleared: Boolean(clearedInput?.checked)
      });

      resetV2TransactionForm();
      renderV2TransactionForm();
      await hydrateV2TransactionContext();
      renderV2RecentTransactions();

      if (onTransactionsChanged) {
        await onTransactionsChanged();
      }
    } catch (error) {
      setV2TransactionError(error.message || 'Failed to create V2 transaction.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };

  if (list) {
    list.onclick = async (event) => {
      const actionButton = event.target.closest('[data-transaction-action]');
      if (!actionButton) return;

      const row = actionButton.closest('[data-transaction-id]');
      const transactionId = row?.dataset.transactionId;
      const action = actionButton.dataset.transactionAction;
      const household = getCurrentHousehold();

      if (!transactionId || !household?.household_id) return;

      const transaction = getV2RecentTransactions().find(tx => tx.transaction_id === transactionId);
      if (!transaction) return;

      setV2TransactionError('');
      actionButton.disabled = true;

      try {
        if (action === 'delete') {
          const confirmed = window.confirm('Delete this transaction?');
          if (!confirmed) return;

          await deleteV2Transaction({
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

          await updateV2Transaction({
            householdId: household.household_id,
            transactionId,
            transactionDate: nextDate,
            description: nextDescription.trim(),
            notes: nextNotes.trim(),
            amount: nextAmount,
            isCleared: nextCleared
          });
        }

        await hydrateV2TransactionContext();
        renderV2RecentTransactions();

        if (onTransactionsChanged) {
          await onTransactionsChanged();
        }
      } catch (error) {
        setV2TransactionError(error.message || 'Failed to update transaction.');
      } finally {
        actionButton.disabled = false;
      }
    };
  }
}
