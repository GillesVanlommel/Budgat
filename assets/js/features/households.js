import { db } from '../core/database.js';
import {
  clearCurrentHousehold,
  getSelectedHouseholdId,
  setCurrentHousehold,
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
