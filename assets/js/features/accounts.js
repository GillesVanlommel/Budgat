import { db } from '../core/database.js';
import {
  getCurrentHousehold,
  getHouseholdAccounts,
  getHouseholdMembers,
  setHouseholdAccounts,
  setHouseholdMembers
} from '../core/app_state.js';

function getAccountsUiElements() {
  return {
    form: document.getElementById('accountCreateForm'),
    nameInput: document.getElementById('accountNameInput'),
    typeInput: document.getElementById('accountTypeInput'),
    ownerInput: document.getElementById('accountOwnerInput'),
    openingBalanceInput: document.getElementById('accountOpeningBalanceInput'),
    includeInBudgetInput: document.getElementById('accountIncludeInBudgetInput'),
    submitBtn: document.getElementById('createAccountBtn'),
    errorBox: document.getElementById('accountSetupError'),
    list: document.getElementById('accountList'),
    settingsHint: document.getElementById('accountSettingsHint'),
    transactionHint: document.getElementById('addViewAccountHint')
  };
}

function setAccountError(message) {
  const { errorBox } = getAccountsUiElements();
  if (!errorBox) return;

  if (!message) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    return;
  }

  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

export async function listHouseholdMembers(householdId) {
  const { data, error } = await db.rpc('list_household_members', {
    p_household_id: householdId
  });

  if (error) throw error;
  return data || [];
}

export async function listHouseholdAccounts(householdId) {
  const { data, error } = await db.rpc('list_household_accounts', {
    p_household_id: householdId
  });

  if (error) throw error;
  return data || [];
}

export async function createHouseholdAccount({
  householdId,
  name,
  accountType,
  ownerMemberId = null,
  openingBalance = 0,
  includeInBudget = true
}) {
  const { data, error } = await db.rpc('create_household_account', {
    p_household_id: householdId,
    p_name: name,
    p_account_type: accountType,
    p_owner_member_id: ownerMemberId || null,
    p_opening_balance: openingBalance,
    p_include_in_budget: includeInBudget
  });

  if (error) throw error;
  return data || null;
}

export async function hydrateAccountContext() {
  const household = getCurrentHousehold();

  if (!household?.household_id) {
    setHouseholdAccounts([]);
    setHouseholdMembers([]);
    return { accounts: [], members: [] };
  }

  const [accounts, members] = await Promise.all([
    listHouseholdAccounts(household.household_id),
    listHouseholdMembers(household.household_id)
  ]);

  setHouseholdAccounts(accounts);
  setHouseholdMembers(members);

  return { accounts, members };
}

export function renderAccountsSetup() {
  const { ownerInput, list, settingsHint, transactionHint } = getAccountsUiElements();
  const accounts = getHouseholdAccounts();
  const members = getHouseholdMembers();

  if (ownerInput) {
    ownerInput.innerHTML = `
      <option value="">Shared household account</option>
      ${members.map(member => `
        <option value="${member.member_id}">
          ${member.display_name || member.user_id} (${member.role})
        </option>
      `).join('')}
    `;
  }

  if (list) {
    if (accounts.length === 0) {
      list.innerHTML = `
        <div class="text-sm text-slate-500 italic">
          No household accounts yet. Add your first account to start tracking balances properly.
        </div>
      `;
    } else {
      list.innerHTML = accounts.map(account => `
        <div class="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
          <div>
            <div class="font-medium text-slate-800">${account.name}</div>
            <div class="text-xs text-slate-500">
              ${account.account_type.replace('_', ' ')} · ${account.owner_display_name || 'Shared'} · ${account.include_in_budget ? 'In budget' : 'Excluded'}
            </div>
          </div>
          <div class="text-right">
            <div class="text-sm font-mono text-slate-700">€${Number(account.opening_balance || 0).toFixed(2)}</div>
            <div class="text-[11px] text-slate-400">Opening balance</div>
          </div>
        </div>
      `).join('');
    }
  }

  if (settingsHint) {
    settingsHint.classList.toggle('hidden', accounts.length > 0);
  }

  if (transactionHint) {
    transactionHint.classList.toggle('hidden', accounts.length > 0);
  }
}

export function bindAccountsUi({ onAccountsChanged }) {
  const {
    form,
    nameInput,
    typeInput,
    ownerInput,
    openingBalanceInput,
    includeInBudgetInput,
    submitBtn
  } = getAccountsUiElements();

  if (!form) return;

  form.onsubmit = async (event) => {
    event.preventDefault();
    setAccountError('');

    const household = getCurrentHousehold();
    if (!household?.household_id) {
      setAccountError('Select or create a household first.');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      await createHouseholdAccount({
        householdId: household.household_id,
        name: nameInput?.value || '',
        accountType: typeInput?.value || 'checking',
        ownerMemberId: ownerInput?.value || null,
        openingBalance: Number(openingBalanceInput?.value || 0),
        includeInBudget: Boolean(includeInBudgetInput?.checked)
      });

      if (nameInput) nameInput.value = '';
      if (typeInput) typeInput.value = 'checking';
      if (ownerInput) ownerInput.value = '';
      if (openingBalanceInput) openingBalanceInput.value = '0';
      if (includeInBudgetInput) includeInBudgetInput.checked = true;

      await hydrateAccountContext();
      renderAccountsSetup();

      if (onAccountsChanged) {
        await onAccountsChanged();
      }
    } catch (error) {
      setAccountError(error.message || 'Failed to create account.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };
}
