import { getCurrentHousehold, getHouseholdAccounts } from '../core/app_state.js';
import { db } from '../core/database.js';

let cachedBudgetLines = [];

function getV2BudgetUiElements() {
  return {
    monthInput: document.getElementById('v2BudgetMonth'),
    accountInput: document.getElementById('v2BudgetAccount'),
    list: document.getElementById('v2BudgetList'),
    emptyHint: document.getElementById('v2BudgetEmptyHint'),
    setupHint: document.getElementById('v2BudgetSetupHint'),
    totals: document.getElementById('v2BudgetTotals'),
    errorBox: document.getElementById('v2BudgetError')
  };
}

function setV2BudgetError(message) {
  const { errorBox } = getV2BudgetUiElements();
  if (!errorBox) return;

  if (!message) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    return;
  }

  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function getTodayMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeMonthInput(value) {
  if (!value) return null;
  return `${value}-01`;
}

function formatCurrency(value) {
  return `EUR ${Number(value || 0).toFixed(2)}`;
}

export async function listV2BudgetMonthLines(householdId, month, accountId) {
  const { data, error } = await db.rpc('list_budget_month_lines', {
    p_household_id: householdId,
    p_month: normalizeMonthInput(month),
    p_account_id: accountId
  });

  if (error) throw error;
  cachedBudgetLines = data || [];
  return cachedBudgetLines;
}

export async function setV2BudgetLine({ householdId, month, categoryId, plannedAmount }) {
  const { data, error } = await db.rpc('set_household_budget_line', {
    p_household_id: householdId,
    p_month: normalizeMonthInput(month),
    p_category_id: categoryId,
    p_planned_amount: Number(plannedAmount || 0)
  });

  if (error) throw error;
  return data || null;
}

export async function loadV2Budget() {
  const household = getCurrentHousehold();
  const { monthInput, accountInput } = getV2BudgetUiElements();
  const accounts = getHouseholdAccounts().filter(account => !account.archived);
  const selectedAccountId = accountInput?.value || '';
  const fallbackAccountId = accounts[0]?.account_id || '';
  const activeAccountId = accounts.some(account => account.account_id === selectedAccountId)
    ? selectedAccountId
    : fallbackAccountId;

  if (monthInput && !monthInput.value) {
    monthInput.value = getTodayMonthString();
  }

  if (accountInput) {
    accountInput.innerHTML = `
      <option value="">Select account</option>
      ${accounts.map(account => `
        <option value="${account.account_id}">${account.name}</option>
      `).join('')}
    `;
    accountInput.value = activeAccountId;
  }

  if (!household?.household_id) {
    cachedBudgetLines = [];
    renderV2Budget();
    return [];
  }

  if (!activeAccountId) {
    cachedBudgetLines = [];
    renderV2Budget();
    return [];
  }

  const month = monthInput?.value || getTodayMonthString();
  const lines = await listV2BudgetMonthLines(household.household_id, month, activeAccountId);
  renderV2Budget();
  return lines;
}

export function renderV2Budget() {
  const { monthInput, list, emptyHint, setupHint, totals } = getV2BudgetUiElements();

  if (monthInput && !monthInput.value) {
    monthInput.value = getTodayMonthString();
  }

  if (setupHint) {
    setupHint.classList.toggle('hidden', cachedBudgetLines.length > 0);
  }

  if (totals) {
    const planned = cachedBudgetLines.reduce((sum, line) => sum + Number(line.planned_amount || 0), 0);
    const actual = cachedBudgetLines.reduce((sum, line) => sum + Number(line.actual_amount || 0), 0);
    const remaining = planned - actual;

    totals.innerHTML = `
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-xs text-slate-500">Planned</div>
        <div class="font-bold text-slate-800">${formatCurrency(planned)}</div>
      </div>
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-xs text-slate-500">Actual</div>
        <div class="font-bold text-slate-800">${formatCurrency(actual)}</div>
      </div>
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-xs text-slate-500">Remaining</div>
        <div class="font-bold ${remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}">${formatCurrency(remaining)}</div>
      </div>
    `;
  }

  if (!list) return;

  if (cachedBudgetLines.length === 0) {
    list.innerHTML = '';
    if (emptyHint) emptyHint.classList.remove('hidden');
    return;
  }

  if (emptyHint) emptyHint.classList.add('hidden');

  list.innerHTML = cachedBudgetLines.map(line => `
    <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm" data-category-id="${line.category_id}">
      <div class="flex items-start justify-between gap-4 mb-3">
        <div>
          <div class="font-semibold text-slate-800">${line.category_name}</div>
          <div class="text-xs text-slate-500">${line.category_kind_name}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-slate-500">Actual</div>
          <div class="font-bold ${line.over_budget ? 'text-red-600' : 'text-slate-800'}">${formatCurrency(line.actual_amount)}</div>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
        <input
          type="number"
          step="0.01"
          class="v2-budget-planned-input w-full p-2 border rounded-lg"
          value="${Number(line.planned_amount || 0).toFixed(2)}"
        >
        <div class="text-sm ${Number(line.remaining_amount || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}">
          ${formatCurrency(line.remaining_amount)} left
        </div>
        <button
          type="button"
          class="v2-budget-save-btn bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          Save
        </button>
      </div>
    </div>
  `).join('');
}

export function bindV2BudgetUi() {
  const { monthInput, accountInput, list } = getV2BudgetUiElements();

  if (monthInput) {
    monthInput.onchange = async () => {
      setV2BudgetError('');
      await loadV2Budget();
    };
  }

  if (accountInput) {
    accountInput.onchange = async () => {
      setV2BudgetError('');
      await loadV2Budget();
    };
  }

  if (list) {
    list.onclick = async (event) => {
      const button = event.target.closest('.v2-budget-save-btn');
      if (!button) return;

      const row = button.closest('[data-category-id]');
      const input = row?.querySelector('.v2-budget-planned-input');
      const categoryId = row?.dataset.categoryId;
      const household = getCurrentHousehold();
      const month = monthInput?.value || getTodayMonthString();

      if (!household?.household_id || !categoryId || !input) return;

      button.disabled = true;
      setV2BudgetError('');

      try {
        await setV2BudgetLine({
          householdId: household.household_id,
          month,
          categoryId,
          plannedAmount: input.value
        });

        await loadV2Budget();
      } catch (error) {
        setV2BudgetError(error.message || 'Failed to save V2 budget line.');
      } finally {
        button.disabled = false;
      }
    };
  }
}
