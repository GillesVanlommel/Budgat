import { db } from '../core/database.js';
import {
  clearCurrentHousehold,
  getCurrentHousehold,
  getHouseholds,
  getSelectedHouseholdId,
  setCurrentHousehold,
  setHouseholds,
  setSelectedHouseholdId
} from '../core/app_state.js';

let cachedHouseholdInvites = [];

export async function listHouseholds() {
  const { data, error } = await db.rpc('list_my_households');
  if (error) throw error;
  return data || [];
}

export async function createHousehold({ name, baseCurrency = 'EUR', ownerDisplayName = '' }) {
  const { data, error } = await db.rpc('create_household', {
    p_name: name,
    p_base_currency: baseCurrency,
    p_owner_display_name: ownerDisplayName || null
  });

  if (error) throw error;
  return data?.[0] || null;
}

export async function createHouseholdCategoryByKind({ householdId, name, categoryKindKey }) {
  const { data, error } = await db.rpc('create_household_category_by_kind', {
    p_household_id: householdId,
    p_name: name,
    p_category_kind_key: categoryKindKey
  });

  if (error) throw error;
  return data || null;
}

export async function createHouseholdInvite({
  householdId,
  role = 'member',
  expiresInDays = 14
}) {
  const { data, error } = await db.rpc('create_household_invite', {
    p_household_id: householdId,
    p_role: role,
    p_expires_days: expiresInDays
  });

  if (error) throw error;
  return data?.[0] || null;
}

export async function listHouseholdInvites(householdId) {
  const { data, error } = await db.rpc('list_household_invites', {
    p_household_id: householdId
  });

  if (error) throw error;
  return data || [];
}

export async function revokeHouseholdInvite(inviteId) {
  const { error } = await db.rpc('revoke_household_invite', {
    p_invite_id: inviteId
  });

  if (error) throw error;
}

export async function joinHouseholdByInvite({
  inviteCode,
  displayName = ''
}) {
  const { data, error } = await db.rpc('join_household_with_invite', {
    p_invite_code: inviteCode,
    p_display_name: displayName || null
  });

  if (error) throw error;
  return data?.[0] || null;
}

export async function hydrateHouseholdContext() {
  const households = await listHouseholds();
  const selectedHouseholdId = getSelectedHouseholdId();

  setHouseholds(households);

  if (households.length === 0) {
    clearCurrentHousehold();
    return [];
  }

  const selectedHousehold = households.find(
    household => household.household_id === selectedHouseholdId
  ) || households[0];

  setSelectedHouseholdId(selectedHousehold.household_id);
  setCurrentHousehold(selectedHousehold);

  return households;
}

function getHouseholdUiElements() {
  return {
    switcher: document.getElementById('householdSwitcher'),
    select: document.getElementById('householdSelect'),
    currentName: document.getElementById('currentHouseholdName'),
    currentMeta: document.getElementById('currentHouseholdMeta'),
    setupSection: document.getElementById('householdSetupSection'),
    form: document.getElementById('householdCreateForm'),
    nameInput: document.getElementById('householdNameInput'),
    displayNameInput: document.getElementById('householdDisplayNameInput'),
    currencyInput: document.getElementById('householdCurrencyInput'),
    submitBtn: document.getElementById('createHouseholdBtn'),
    errorBox: document.getElementById('householdSetupError'),
    joinForm: document.getElementById('householdJoinForm'),
    inviteCodeInput: document.getElementById('householdInviteCodeInput'),
    joinDisplayNameInput: document.getElementById('householdJoinDisplayNameInput'),
    joinSubmitBtn: document.getElementById('joinHouseholdBtn'),
    joinErrorBox: document.getElementById('householdJoinError'),
    toggleCreateBtn: document.getElementById('toggleHouseholdCreateBtn'),
    inviteRoleInput: document.getElementById('inviteRoleInput'),
    inviteExpiryDaysInput: document.getElementById('inviteExpiryDaysInput'),
    inviteForm: document.getElementById('householdInviteForm'),
    inviteSubmitBtn: document.getElementById('createInviteBtn'),
    inviteErrorBox: document.getElementById('householdInviteError'),
    inviteSuccessBox: document.getElementById('householdInviteSuccess'),
    inviteList: document.getElementById('householdInviteList'),
    inviteHint: document.getElementById('householdInviteHint')
  };
}

function setError(message) {
  const { errorBox } = getHouseholdUiElements();
  if (!errorBox) return;

  if (!message) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    return;
  }

  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function setJoinError(message) {
  const { joinErrorBox } = getHouseholdUiElements();
  if (!joinErrorBox) return;

  if (!message) {
    joinErrorBox.classList.add('hidden');
    joinErrorBox.textContent = '';
    return;
  }

  joinErrorBox.textContent = message;
  joinErrorBox.classList.remove('hidden');
}

function setInviteError(message) {
  const { inviteErrorBox } = getHouseholdUiElements();
  if (!inviteErrorBox) return;

  if (!message) {
    inviteErrorBox.classList.add('hidden');
    inviteErrorBox.textContent = '';
    return;
  }

  inviteErrorBox.textContent = message;
  inviteErrorBox.classList.remove('hidden');
}

function setInviteSuccess(message) {
  const { inviteSuccessBox } = getHouseholdUiElements();
  if (!inviteSuccessBox) return;

  if (!message) {
    inviteSuccessBox.classList.add('hidden');
    inviteSuccessBox.textContent = '';
    return;
  }

  inviteSuccessBox.textContent = message;
  inviteSuccessBox.classList.remove('hidden');
}

function toggleSetupForm(forceVisible) {
  const { setupSection } = getHouseholdUiElements();
  const currentHousehold = getCurrentHousehold();
  if (!setupSection) return;

  if (!currentHousehold) {
    setupSection.classList.remove('hidden');
    return;
  }

  if (typeof forceVisible === 'boolean') {
    setupSection.classList.toggle('hidden', !forceVisible);
    return;
  }

  setupSection.classList.toggle('hidden');
}

function formatInviteExpiry(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function refreshInviteManager() {
  const {
    inviteRoleInput,
    inviteHint,
    inviteList
  } = getHouseholdUiElements();
  const currentHousehold = getCurrentHousehold();
  const canManageInvites = currentHousehold?.member_role === 'owner' || currentHousehold?.member_role === 'admin';

  if (inviteRoleInput) {
    inviteRoleInput.innerHTML = `
      <option value="member">Member</option>
      <option value="admin">Admin</option>
    `;
  }

  if (!canManageInvites || !currentHousehold?.household_id) {
    cachedHouseholdInvites = [];
    if (inviteHint) inviteHint.classList.remove('hidden');
    if (inviteList) inviteList.innerHTML = '';
    return;
  }

  if (inviteHint) inviteHint.classList.add('hidden');

  try {
    cachedHouseholdInvites = await listHouseholdInvites(currentHousehold.household_id);
  } catch (error) {
    cachedHouseholdInvites = [];
    setInviteError(error.message || 'Failed to load invites.');
    return;
  }

  if (!inviteList) return;

  if (cachedHouseholdInvites.length === 0) {
    inviteList.innerHTML = '<div class="text-sm text-slate-500 italic">No active invites.</div>';
    return;
  }

  inviteList.innerHTML = cachedHouseholdInvites.map(invite => `
    <div class="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-3">
      <div>
        <div class="font-mono text-sm font-semibold text-slate-800">${invite.invite_code}</div>
        <div class="text-xs text-slate-500">
          Role: ${invite.role} · Expires: ${formatInviteExpiry(invite.expires_at)}
        </div>
      </div>
      <button
        type="button"
        class="household-invite-revoke text-xs px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
        data-invite-id="${invite.invite_id}"
      >
        Revoke
      </button>
    </div>
  `).join('');
}

export function renderHouseholdShell(households = getHouseholds()) {
  const {
    switcher,
    select,
    currentName,
    currentMeta,
    setupSection,
    toggleCreateBtn
  } = getHouseholdUiElements();
  const currentHousehold = getCurrentHousehold();

  if (switcher) {
    switcher.classList.toggle('hidden', households.length === 0);
  }

  if (toggleCreateBtn) {
    toggleCreateBtn.classList.toggle('hidden', households.length === 0);
  }

  if (select) {
    select.innerHTML = households.map(household => `
      <option value="${household.household_id}">${household.household_name}</option>
    `).join('');

    select.value = currentHousehold?.household_id || '';
  }

  if (currentName) {
    currentName.textContent = currentHousehold?.household_name || 'No household selected';
  }

  if (currentMeta) {
    if (!currentHousehold) {
      currentMeta.textContent = 'Create a household to start setup.';
    } else {
      currentMeta.textContent = `${currentHousehold.member_role} · ${currentHousehold.base_currency}`;
    }
  }

  if (setupSection && households.length === 0) {
    setupSection.classList.remove('hidden');
  }

  refreshInviteManager();
}

export function bindHouseholdUi({ onHouseholdChange }) {
  const {
    select,
    form,
    nameInput,
    displayNameInput,
    currencyInput,
    submitBtn,
    joinForm,
    inviteCodeInput,
    joinDisplayNameInput,
    joinSubmitBtn,
    toggleCreateBtn
  } = getHouseholdUiElements();

  if (select) {
    select.onchange = async () => {
      setSelectedHouseholdId(select.value);
      await hydrateHouseholdContext();
      renderHouseholdShell();
      setInviteError('');
      setInviteSuccess('');

      if (onHouseholdChange) {
        await onHouseholdChange();
      }
    };
  }

  if (toggleCreateBtn) {
    toggleCreateBtn.onclick = () => {
      setError('');
      setJoinError('');
      toggleSetupForm();
    };
  }

  if (form) {
    form.onsubmit = async (event) => {
      event.preventDefault();
      setError('');

      if (submitBtn) submitBtn.disabled = true;

      try {
        await createHousehold({
          name: nameInput?.value || '',
          baseCurrency: currencyInput?.value || 'EUR',
          ownerDisplayName: displayNameInput?.value || ''
        });

        if (nameInput) nameInput.value = '';
        if (displayNameInput) displayNameInput.value = '';
        if (currencyInput) currencyInput.value = 'EUR';

        await hydrateHouseholdContext();
        renderHouseholdShell();
        toggleSetupForm(false);
        setInviteError('');
        setInviteSuccess('');

        if (onHouseholdChange) {
          await onHouseholdChange();
        }
      } catch (error) {
        setError(error.message || 'Failed to create household.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    };
  }

  if (joinForm) {
    joinForm.onsubmit = async (event) => {
      event.preventDefault();
      setJoinError('');

      if (joinSubmitBtn) joinSubmitBtn.disabled = true;

      try {
        await joinHouseholdByInvite({
          inviteCode: inviteCodeInput?.value || '',
          displayName: joinDisplayNameInput?.value || ''
        });

        if (inviteCodeInput) inviteCodeInput.value = '';
        if (joinDisplayNameInput) joinDisplayNameInput.value = '';

        await hydrateHouseholdContext();
        renderHouseholdShell();
        toggleSetupForm(false);
        setInviteError('');
        setInviteSuccess('');

        if (onHouseholdChange) {
          await onHouseholdChange();
        }
      } catch (error) {
        setJoinError(error.message || 'Failed to join household.');
      } finally {
        if (joinSubmitBtn) joinSubmitBtn.disabled = false;
      }
    };
  }

  const {
    inviteForm,
    inviteRoleInput,
    inviteExpiryDaysInput,
    inviteSubmitBtn,
    inviteList
  } = getHouseholdUiElements();

  if (inviteForm) {
    inviteForm.onsubmit = async (event) => {
      event.preventDefault();
      setInviteError('');
      setInviteSuccess('');

      const currentHousehold = getCurrentHousehold();
      if (!currentHousehold?.household_id) {
        setInviteError('Select a household first.');
        return;
      }

      if (inviteSubmitBtn) inviteSubmitBtn.disabled = true;

      try {
        const invite = await createHouseholdInvite({
          householdId: currentHousehold.household_id,
          role: inviteRoleInput?.value || 'member',
          expiresInDays: Number(inviteExpiryDaysInput?.value || 14)
        });

        setInviteSuccess(`Invite code created: ${invite.invite_code}`);
        await refreshInviteManager();
      } catch (error) {
        setInviteError(error.message || 'Failed to create invite.');
      } finally {
        if (inviteSubmitBtn) inviteSubmitBtn.disabled = false;
      }
    };
  }

  if (inviteList) {
    inviteList.onclick = async (event) => {
      const revokeBtn = event.target.closest('.household-invite-revoke');
      if (!revokeBtn) return;

      if (!confirm('Revoke this invite code?')) {
        return;
      }

      setInviteError('');
      setInviteSuccess('');

      try {
        await revokeHouseholdInvite(revokeBtn.dataset.inviteId);
        await refreshInviteManager();
      } catch (error) {
        setInviteError(error.message || 'Failed to revoke invite.');
      }
    };
  }

  refreshInviteManager();
}
