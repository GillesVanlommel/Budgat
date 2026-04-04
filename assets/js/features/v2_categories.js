import { db } from '../core/database.js';
import {
  getCurrentHousehold,
  getV2CategoryKinds,
  getV2HouseholdCategories,
  setV2CategoryKinds,
  setV2HouseholdCategories
} from '../core/app_state.js';

function getV2CategoryUiElements() {
  return {
    form: document.getElementById('v2CategoryCreateForm'),
    nameInput: document.getElementById('v2CategoryNameInput'),
    kindInput: document.getElementById('v2CategoryKindInput'),
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

export async function listCategoryKinds() {
  const { data, error } = await db.rpc('list_category_kinds');
  if (error) throw error;
  setV2CategoryKinds(data || []);
  return getV2CategoryKinds();
}

export async function listV2HouseholdCategories(householdId) {
  const { data, error } = await db.rpc('list_household_categories', {
    p_household_id: householdId
  });

  if (error) throw error;
  setV2HouseholdCategories(data || []);
  return getV2HouseholdCategories();
}

export async function hydrateV2CategoryContext() {
  const household = getCurrentHousehold();
  const householdId = household?.household_id;

  const categoryKindsPromise = getV2CategoryKinds().length > 0
    ? Promise.resolve(getV2CategoryKinds())
    : listCategoryKinds();

  if (!householdId) {
    const categoryKinds = await categoryKindsPromise;
    setV2HouseholdCategories([]);
    return { categoryKinds, categories: [] };
  }

  const [categoryKinds, categories] = await Promise.all([
    categoryKindsPromise,
    listV2HouseholdCategories(householdId)
  ]);

  return { categoryKinds, categories };
}

export function renderV2Categories() {
  const { kindInput, list, hint } = getV2CategoryUiElements();
  const categoryKinds = getV2CategoryKinds();
  const categories = getV2HouseholdCategories();

  if (kindInput) {
    kindInput.innerHTML = categoryKinds.map(kind => `
      <option value="${kind.key}">
        ${kind.display_name} (${kind.flow_type})
      </option>
    `).join('');
  }

  if (list) {
    if (categories.length === 0) {
      list.innerHTML = `
        <div class="text-sm text-slate-500 italic">
          No V2 household categories yet. Create categories from stable kinds so the new budgeting model stays consistent.
        </div>
      `;
    } else {
      list.innerHTML = categories.map(category => `
        <div class="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
          <div>
            <div class="font-medium text-slate-800">${category.name}</div>
            <div class="text-xs text-slate-500">
              ${category.category_kind_name} · ${category.flow_type} · ${category.budgetable ? 'Budgetable' : 'Not budgeted'}
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs text-slate-400">${category.category_kind_key}</div>
          </div>
        </div>
      `).join('');
    }
  }

  if (hint) {
    hint.classList.toggle('hidden', categories.length > 0);
  }
}

export function bindV2CategoryUi({ onCategoriesChanged }) {
  const { form, nameInput, kindInput, submitBtn } = getV2CategoryUiElements();

  if (!form) return;

  form.onsubmit = async (event) => {
    event.preventDefault();
    setV2CategoryError('');

    const household = getCurrentHousehold();
    if (!household?.household_id) {
      setV2CategoryError('Select or create a household first.');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      const { error } = await db.rpc('create_household_category_by_kind', {
        p_household_id: household.household_id,
        p_name: nameInput?.value || '',
        p_category_kind_key: kindInput?.value || ''
      });

      if (error) throw error;

      if (nameInput) nameInput.value = '';

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
