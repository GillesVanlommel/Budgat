import { db } from '../core/database.js';
import {
  getCurrentHousehold,
  getHouseholdAccounts,
  getV2HouseholdCategories,
  setV2HouseholdCategories
} from '../core/app_state.js';

function getV2CategoryUiElements() {
  return {
    form: document.getElementById('v2CategoryCreateForm'),
    nameInput: document.getElementById('v2CategoryNameInput'),
    accountInput: document.getElementById('v2CategoryAccountInput'),
    flowInput: document.getElementById('v2CategoryFlowInput'),
    submitBtn: document.getElementById('createV2CategoryBtn'),
    errorBox: document.getElementById('v2CategoryError'),
    list: document.getElementById('v2CategoryList'),
    hint: document.getElementById('v2CategorySetupHint')
  };
}

function setV2CategoryError(message) {
  const { errorBox } = getV2CategoryUiElements();
  if (!errorBox) return;

  if (!message) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    return;
  }

  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function getCategoryManageableAccounts() {
  const household = getCurrentHousehold();
  const memberId = household?.member_id || null;
  if (!memberId) return [];

  return getHouseholdAccounts().filter(account => {
    if (account.archived) return false;
    return account.owner_member_id === memberId;
  });
}

export async function listV2HouseholdCategories(householdId, accountId = null) {
  const { data, error } = await db.rpc('list_household_categories', {
    p_household_id: householdId,
    p_account_id: accountId
  });

  if (error) throw error;
  setV2HouseholdCategories(data || []);
  return getV2HouseholdCategories();
}

export async function hydrateV2CategoryContext() {
  const household = getCurrentHousehold();
  const householdId = household?.household_id;

  if (!householdId) {
    setV2HouseholdCategories([]);
    return { categories: [] };
  }

  const categories = await listV2HouseholdCategories(householdId);

  return { categories };
}

export function renderV2Categories() {
  const { flowInput, accountInput, list, hint } = getV2CategoryUiElements();
  const accounts = getCategoryManageableAccounts();
  const manageableAccountIds = new Set(accounts.map(account => account.account_id));
  const categories = getV2HouseholdCategories().filter(category => manageableAccountIds.has(category.account_id));
  const selectedAccountId = accountInput?.value || '';
  const fallbackAccountId = accounts[0]?.account_id || '';
  const activeAccountId = accounts.some(account => account.account_id === selectedAccountId)
    ? selectedAccountId
    : fallbackAccountId;
  const visibleCategories = activeAccountId
    ? categories.filter(category => category.account_id === activeAccountId)
    : [];

  if (accountInput) {
    accountInput.innerHTML = `
      <option value="">Select account</option>
      ${accounts.map(account => `
        <option value="${account.account_id}">${account.name}</option>
      `).join('')}
    `;
    accountInput.value = activeAccountId;
  }

  if (flowInput) {
    flowInput.innerHTML = `
      <option value="expense">Expense</option>
      <option value="income">Income</option>
    `;
  }

  if (list) {
    if (!activeAccountId) {
      list.innerHTML = `
        <div class="text-sm text-slate-500 italic">
          You can create categories on your own accounts. Create/select one to continue.
        </div>
      `;
    } else if (visibleCategories.length === 0) {
      list.innerHTML = `
        <div class="text-sm text-slate-500 italic">
          No categories for this account yet.
        </div>
      `;
    } else {
      list.innerHTML = visibleCategories.map(category => `
        <div class="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
          <div>
            <div class="font-medium text-slate-800">${category.name}</div>
            <div class="text-xs text-slate-500">
              ${category.flow_type} · ${category.budgetable ? 'Budgetable' : 'Not budgeted'}
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs text-slate-400">${category.account_name || 'Unknown account'}</div>
          </div>
        </div>
      `).join('');
    }
  }

  if (hint) {
    hint.classList.toggle('hidden', accounts.length > 0 && visibleCategories.length > 0);
  }
}

export function bindV2CategoryUi({ onCategoriesChanged }) {
  const { form, nameInput, accountInput, flowInput, submitBtn } = getV2CategoryUiElements();

  if (accountInput) {
    accountInput.onchange = () => {
      renderV2Categories();
    };
  }

  if (!form) return;

  form.onsubmit = async (event) => {
    event.preventDefault();
    setV2CategoryError('');

    const household = getCurrentHousehold();
    if (!household?.household_id) {
      setV2CategoryError('Select or create a household first.');
      return;
    }

    if (!accountInput?.value) {
      setV2CategoryError('Select an account for this category.');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      const { error } = await db.rpc('create_household_category_simple', {
        p_household_id: household.household_id,
        p_account_id: accountInput.value,
        p_name: nameInput?.value || '',
        p_flow_type: flowInput?.value || ''
      });

      if (error) throw error;

      if (nameInput) nameInput.value = '';
      if (flowInput) flowInput.value = 'expense';

      await hydrateV2CategoryContext();
      renderV2Categories();

      if (onCategoriesChanged) {
        await onCategoriesChanged();
      }
    } catch (error) {
      setV2CategoryError(error.message || 'Failed to create V2 category.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };
}
