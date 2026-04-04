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
    toggleCreateBtn: document.getElementById('toggleHouseholdCreateBtn')
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
}

export function bindHouseholdUi({ onHouseholdChange }) {
  const {
    select,
    form,
    nameInput,
    displayNameInput,
    currencyInput,
    submitBtn,
    toggleCreateBtn
  } = getHouseholdUiElements();

  if (select) {
    select.onchange = async () => {
      setSelectedHouseholdId(select.value);
      await hydrateHouseholdContext();
      renderHouseholdShell();

      if (onHouseholdChange) {
        await onHouseholdChange();
      }
    };
  }

  if (toggleCreateBtn) {
    toggleCreateBtn.onclick = () => {
      setError('');
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
}
