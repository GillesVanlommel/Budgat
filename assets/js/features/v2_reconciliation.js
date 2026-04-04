import { getCurrentHousehold } from '../core/app_state.js';
import { db } from '../core/database.js';

let cachedAccountBalances = [];
let cachedReconciliations = [];

function getV2ReconciliationUiElements() {
  return {
    accountSelect: document.getElementById('v2ReconciliationAccount'),
    dateInput: document.getElementById('v2ReconciliationDate'),
    actualBalanceInput: document.getElementById('v2ReconciliationActual'),
    notesInput: document.getElementById('v2ReconciliationNotes'),
    form: document.getElementById('v2ReconciliationForm'),
    submitBtn: document.getElementById('v2ReconciliationSubmitBtn'),
    errorBox: document.getElementById('v2ReconciliationError'),
    setupHint: document.getElementById('v2ReconciliationSetupHint'),
    accountSummary: document.getElementById('v2ReconciliationAccountSummary'),
    selectedSummary: document.getElementById('v2ReconciliationSelectedSummary'),
    list: document.getElementById('v2ReconciliationList'),
    emptyHint: document.getElementById('v2ReconciliationEmptyHint')
  };
}

function setV2ReconciliationError(message) {
  const { errorBox } = getV2ReconciliationUiElements();
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

function formatCurrency(value) {
  return `EUR ${Number(value || 0).toFixed(2)}`;
}

function formatSignedCurrency(value) {
  const numericValue = Number(value || 0);

  if (numericValue > 0) {
    return `+EUR ${numericValue.toFixed(2)}`;
  }

  if (numericValue < 0) {
    return `-EUR ${Math.abs(numericValue).toFixed(2)}`;
  }

  return 'EUR 0.00';
}

function getSelectedAccountBalance() {
  const { accountSelect } = getV2ReconciliationUiElements();
  const selectedAccountId = accountSelect?.value || '';
  return cachedAccountBalances.find(account => account.account_id === selectedAccountId) || null;
}

function prefillSelectedAccountBalance() {
  const { actualBalanceInput, dateInput } = getV2ReconciliationUiElements();
  const selectedAccount = getSelectedAccountBalance();

  if (dateInput && !dateInput.value) {
    dateInput.value = getTodayString();
  }

  if (actualBalanceInput && selectedAccount) {
    actualBalanceInput.value = Number(selectedAccount.current_balance || 0).toFixed(2);
  }
}

function renderSelectedAccountSummary(selectedAccount) {
  const { selectedSummary } = getV2ReconciliationUiElements();
  if (!selectedSummary) return;

  if (!selectedAccount) {
    selectedSummary.innerHTML = `
      <div class="text-sm text-slate-500 italic">
        Select an account to review its expected balance and checkpoint history.
      </div>
    `;
    return;
  }

  const latestDiff = Number(selectedAccount.latest_difference_amount || 0);
  const hasLatestReconciliation = Boolean(selectedAccount.latest_reconciliation_id);
  const latestStatus = !hasLatestReconciliation
    ? '<span class="text-[11px] px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500">No checkpoints yet</span>'
    : selectedAccount.latest_is_matched
      ? '<span class="text-[11px] px-2 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">Latest checkpoint matched</span>'
      : `<span class="text-[11px] px-2 py-1 rounded-full border border-red-200 bg-red-50 text-red-700">Latest diff ${formatSignedCurrency(latestDiff)}</span>`;

  selectedSummary.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Calculated Balance</div>
        <div class="text-lg font-semibold text-slate-800">${formatCurrency(selectedAccount.current_balance)}</div>
        <div class="text-xs text-slate-500 mt-1">Opening balance ${formatCurrency(selectedAccount.opening_balance)}</div>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Latest Actual</div>
        <div class="text-lg font-semibold text-slate-800">${hasLatestReconciliation ? formatCurrency(selectedAccount.latest_actual_balance) : 'Not set'}</div>
        <div class="text-xs text-slate-500 mt-1">${hasLatestReconciliation ? selectedAccount.latest_reconciliation_date : 'Save your first checkpoint'}</div>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Latest Status</div>
        <div class="mt-1">${latestStatus}</div>
        <div class="text-xs text-slate-500 mt-2">${selectedAccount.owner_display_name || 'Shared household account'} · ${selectedAccount.account_type.replace('_', ' ')}</div>
      </div>
    </div>
  `;
}

export async function listHouseholdAccountBalances(householdId) {
  const { data, error } = await db.rpc('list_household_account_balances', {
    p_household_id: householdId
  });

  if (error) throw error;
  return data || [];
}

export async function listV2AccountReconciliations(householdId, accountId) {
  const { data, error } = await db.rpc('list_account_reconciliations', {
    p_household_id: householdId,
    p_account_id: accountId
  });

  if (error) throw error;
  return data || [];
}

export async function upsertV2AccountReconciliation({
  householdId,
  accountId,
  reconciliationDate,
  actualBalance,
  notes = ''
}) {
  const { data, error } = await db.rpc('upsert_account_reconciliation', {
    p_household_id: householdId,
    p_account_id: accountId,
    p_reconciliation_date: reconciliationDate,
    p_actual_balance: actualBalance,
    p_notes: notes || null
  });

  if (error) throw error;
  return data || null;
}

export async function deleteV2AccountReconciliation(reconciliationId) {
  const { error } = await db.rpc('delete_account_reconciliation', {
    p_reconciliation_id: reconciliationId
  });

  if (error) throw error;
}

export function renderV2Reconciliation() {
  const {
    accountSelect,
    setupHint,
    accountSummary,
    emptyHint,
    list
  } = getV2ReconciliationUiElements();

  if (accountSelect) {
    const selectedAccountId = accountSelect.value;
    const activeAccounts = cachedAccountBalances.filter(account => !account.archived);
    accountSelect.innerHTML = `
      <option value="">Select account</option>
      ${activeAccounts.map(account => `
        <option value="${account.account_id}">${account.account_name}</option>
      `).join('')}
    `;

    if (activeAccounts.some(account => account.account_id === selectedAccountId)) {
      accountSelect.value = selectedAccountId;
    } else if (activeAccounts[0]) {
      accountSelect.value = activeAccounts[0].account_id;
    }
  }

  if (setupHint) {
    setupHint.classList.toggle('hidden', cachedAccountBalances.some(account => !account.archived));
  }

  if (accountSummary) {
    if (cachedAccountBalances.length === 0) {
      accountSummary.innerHTML = '';
    } else {
      const selectedAccountId = accountSelect?.value || '';
      accountSummary.innerHTML = cachedAccountBalances
        .filter(account => !account.archived)
        .map(account => {
          const diff = Number(account.latest_difference_amount || 0);
          const latestBadge = !account.latest_reconciliation_id
            ? '<span class="text-[10px] px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500">No checkpoints</span>'
            : account.latest_is_matched
              ? '<span class="text-[10px] px-2 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">Matched</span>'
              : `<span class="text-[10px] px-2 py-1 rounded-full border border-red-200 bg-red-50 text-red-700">Diff ${formatSignedCurrency(diff)}</span>`;

          return `
            <button
              type="button"
              class="v2-reconciliation-account-card rounded-lg border p-3 text-left transition-colors ${selectedAccountId === account.account_id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}"
              data-account-id="${account.account_id}"
            >
              <div class="flex items-center justify-between gap-2 mb-2">
                <div>
                  <div class="font-medium text-slate-800">${account.account_name}</div>
                  <div class="text-xs text-slate-500">${account.account_type.replace('_', ' ')} · ${account.owner_display_name || 'Shared'}</div>
                </div>
                ${latestBadge}
              </div>
              <div class="text-lg font-semibold text-slate-800">${formatCurrency(account.current_balance)}</div>
              <div class="text-xs text-slate-500 mt-1">Current calculated balance</div>
            </button>
          `;
        }).join('');
    }
  }

  const selectedAccount = getSelectedAccountBalance();
  renderSelectedAccountSummary(selectedAccount);

  if (!list) return;

  if (cachedReconciliations.length === 0) {
    list.innerHTML = '';
    if (emptyHint) emptyHint.classList.remove('hidden');
    return;
  }

  if (emptyHint) emptyHint.classList.add('hidden');

  list.innerHTML = cachedReconciliations.map(reconciliation => {
    const difference = Number(reconciliation.difference_amount || 0);
    const statusClass = reconciliation.is_matched
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-red-200 bg-red-50 text-red-700';

    return `
      <div class="rounded-xl border border-slate-200 bg-white p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-medium text-slate-800">${reconciliation.reconciliation_date}</div>
            <div class="text-sm text-slate-500 mt-1">
              Actual ${formatCurrency(reconciliation.actual_balance)} · Expected ${formatCurrency(reconciliation.expected_balance)}
            </div>
            ${reconciliation.notes ? `<div class="text-xs text-slate-400 mt-2 italic">${reconciliation.notes}</div>` : ''}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-xs px-2 py-1 rounded-full border ${statusClass}">
              ${reconciliation.is_matched ? 'Matched' : `Diff ${formatSignedCurrency(difference)}`}
            </span>
            <button
              type="button"
              class="v2-reconciliation-delete text-slate-300 hover:text-red-500 p-2 transition-colors"
              data-reconciliation-id="${reconciliation.reconciliation_id}"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export async function loadV2Reconciliation({ accountId = null } = {}) {
  const household = getCurrentHousehold();
  const { accountSelect, actualBalanceInput, notesInput } = getV2ReconciliationUiElements();

  if (!household?.household_id) {
    cachedAccountBalances = [];
    cachedReconciliations = [];
    renderV2Reconciliation();
    return;
  }

  cachedAccountBalances = await listHouseholdAccountBalances(household.household_id);
  renderV2Reconciliation();

  const activeAccounts = cachedAccountBalances.filter(account => !account.archived);
  const selectedAccountId = accountId
    || accountSelect?.value
    || activeAccounts[0]?.account_id
    || null;

  if (accountSelect) {
    accountSelect.value = selectedAccountId || '';
  }

  if (!selectedAccountId) {
    cachedReconciliations = [];
    if (actualBalanceInput) actualBalanceInput.value = '';
    if (notesInput) notesInput.value = '';
    renderV2Reconciliation();
    return;
  }

  cachedReconciliations = await listV2AccountReconciliations(household.household_id, selectedAccountId);
  renderV2Reconciliation();
  prefillSelectedAccountBalance();
}

export function bindV2ReconciliationUi() {
  const {
    accountSelect,
    dateInput,
    actualBalanceInput,
    notesInput,
    form,
    submitBtn,
    list,
    accountSummary
  } = getV2ReconciliationUiElements();

  if (dateInput && !dateInput.value) {
    dateInput.value = getTodayString();
  }

  if (accountSelect) {
    accountSelect.onchange = async () => {
      setV2ReconciliationError('');
      await loadV2Reconciliation({ accountId: accountSelect.value || null });
      prefillSelectedAccountBalance();
      if (notesInput) notesInput.value = '';
    };
  }

  if (!form) return;

  form.onsubmit = async (event) => {
    event.preventDefault();
    setV2ReconciliationError('');

    const household = getCurrentHousehold();
    if (!household?.household_id) {
      setV2ReconciliationError('Select or create a household first.');
      return;
    }

    if (!accountSelect?.value) {
      setV2ReconciliationError('Select an account to reconcile.');
      return;
    }

    if (actualBalanceInput && actualBalanceInput.value === '') {
      setV2ReconciliationError('Enter the actual account balance.');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      await upsertV2AccountReconciliation({
        householdId: household.household_id,
        accountId: accountSelect.value,
        reconciliationDate: dateInput?.value || getTodayString(),
        actualBalance: Number(actualBalanceInput?.value || 0),
        notes: notesInput?.value || ''
      });

      await loadV2Reconciliation({ accountId: accountSelect.value });
      prefillSelectedAccountBalance();
      if (notesInput) notesInput.value = '';
    } catch (error) {
      setV2ReconciliationError(error.message || 'Failed to save reconciliation.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };

  if (list) {
    list.onclick = async (event) => {
      const deleteButton = event.target.closest('.v2-reconciliation-delete');
      if (!deleteButton) return;

      if (!confirm('Delete this reconciliation checkpoint?')) {
        return;
      }

      try {
        await deleteV2AccountReconciliation(deleteButton.dataset.reconciliationId);
        await loadV2Reconciliation({ accountId: accountSelect?.value || null });
      } catch (error) {
        setV2ReconciliationError(error.message || 'Failed to delete reconciliation.');
      }
    };
  }

  if (accountSummary) {
    accountSummary.onclick = async (event) => {
      const accountCard = event.target.closest('.v2-reconciliation-account-card');
      if (!accountCard || !accountSelect) return;

      accountSelect.value = accountCard.dataset.accountId || '';
      setV2ReconciliationError('');
      await loadV2Reconciliation({ accountId: accountSelect.value || null });
      prefillSelectedAccountBalance();
      if (notesInput) notesInput.value = '';
    };
  }
}
