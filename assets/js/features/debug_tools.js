import { db } from '../core/database.js';
import { getCurrentHousehold } from '../core/app_state.js';

function getDebugUiElements() {
  return {
    resetBtn: document.getElementById('debugResetHouseholdBtn'),
    seedBtn: document.getElementById('debugSeedHouseholdBtn'),
    errorBox: document.getElementById('debugToolsError'),
    successBox: document.getElementById('debugToolsSuccess')
  };
}

function setDebugError(message) {
  const { errorBox } = getDebugUiElements();
  if (!errorBox) return;

  if (!message) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    return;
  }

  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function setDebugSuccess(message) {
  const { successBox } = getDebugUiElements();
  if (!successBox) return;

  if (!message) {
    successBox.classList.add('hidden');
    successBox.textContent = '';
    return;
  }

  successBox.textContent = message;
  successBox.classList.remove('hidden');
}

async function runResetToBase() {
  const household = getCurrentHousehold();
  if (!household?.household_id) {
    throw new Error('Select or create a household first.');
  }

  const { data, error } = await db.rpc('debug_reset_household_to_base', {
    p_household_id: household.household_id
  });

  if (error) throw error;
  return data || {};
}

async function runSeedMockData() {
  const household = getCurrentHousehold();
  if (!household?.household_id) {
    throw new Error('Select or create a household first.');
  }

  const { data, error } = await db.rpc('debug_seed_household_mock_data', {
    p_household_id: household.household_id,
    p_days: 60,
    p_transactions_per_account: 30
  });

  if (error) throw error;
  return data || {};
}

export function bindDebugToolsUi({ onDebugDataChanged }) {
  const { resetBtn, seedBtn } = getDebugUiElements();

  if (resetBtn) {
    resetBtn.onclick = async () => {
      setDebugError('');
      setDebugSuccess('');

      const confirmed = window.confirm('Reset this household to base data? This deletes transactions, categories, budgets, reconciliations, and recreates personal checking accounts.');
      if (!confirmed) return;

      resetBtn.disabled = true;
      if (seedBtn) seedBtn.disabled = true;

      try {
        const result = await runResetToBase();
        if (onDebugDataChanged) {
          await onDebugDataChanged();
        }
        setDebugSuccess(`Household reset complete. Created ${result.created_base_accounts || 0} base accounts.`);
      } catch (error) {
        setDebugError(error.message || 'Failed to reset household.');
      } finally {
        resetBtn.disabled = false;
        if (seedBtn) seedBtn.disabled = false;
      }
    };
  }

  if (seedBtn) {
    seedBtn.onclick = async () => {
      setDebugError('');
      setDebugSuccess('');

      const confirmed = window.confirm('Reset this household and seed mock categories + transactions?');
      if (!confirmed) return;

      seedBtn.disabled = true;
      if (resetBtn) resetBtn.disabled = true;

      try {
        const result = await runSeedMockData();
        if (onDebugDataChanged) {
          await onDebugDataChanged();
        }
        setDebugSuccess(
          `Mock data seeded. Categories: ${result.created_categories || 0}, income tx: ${result.created_income_transactions || 0}, expense tx: ${result.created_expense_transactions || 0}, transfers: ${result.created_transfer_transactions || 0}.`
        );
      } catch (error) {
        setDebugError(error.message || 'Failed to seed mock data.');
      } finally {
        seedBtn.disabled = false;
        if (resetBtn) resetBtn.disabled = false;
      }
    };
  }
}
