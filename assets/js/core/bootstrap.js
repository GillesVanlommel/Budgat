import { markViewsLoaded } from './app_state.js';
import { handleAuth, checkUser, setupLogoutListener } from './auth.js';
import { loadViews } from './loader.js';
import { addCategory, deleteCategory, editCategory, loadCategories } from '../features/categories.js';
import { bindAccountsUi, createHouseholdAccount, hydrateAccountContext, renderAccountsSetup } from '../features/accounts.js';
import {
  bindHouseholdUi,
  createHousehold,
  createHouseholdCategoryByKind,
  hydrateHouseholdContext,
  listHouseholds,
  renderHouseholdShell
} from '../features/households.js';
import {
  saveTransaction,
  loadRecentTransactions,
  loadAllTransactions,
  setHistoryTypeFilter,
  editTransaction,
  cancelEdit,
  deleteTransaction,
  loadCategoryTypes,
  setTransactionType
} from '../features/transactions.js';
import { loadBudget } from '../features/budget.js';
import { loadGraphs } from '../features/graphs.js';
import { addReconciliation, deleteReconciliation, loadReconciliationList } from '../features/reconciliation.js';
import { exportCSV, importCSV } from '../utils/csv_utils.js';
import { initNavigation } from '../ui.js';

const globalActions = {
  saveTransaction,
  editTransaction,
  cancelEdit,
  deleteTransaction,
  setTransactionType,
  addCategory,
  editCategory,
  deleteCategory,
  createHouseholdAccount,
  createHousehold,
  createHouseholdCategoryByKind,
  loadBudget,
  loadRecentTransactions,
  loadAllTransactions,
  loadGraphs,
  setHistoryTypeFilter,
  listHouseholds,
  exportCSV,
  importCSV,
  addReconciliation,
  deleteReconciliation,
  loadReconciliationList
};

function registerGlobalActions() {
  Object.entries(globalActions).forEach(([name, handler]) => {
    window[name] = handler;
  });
}

function setAppMode(mode) {
  const setupSection = document.getElementById('householdSetupSection');
  const contentSection = document.getElementById('householdAppContent');
  const bottomNav = document.getElementById('bottomNav');

  if (!setupSection || !contentSection || !bottomNav) return;

  if (mode === 'setup') {
    setupSection.classList.remove('hidden');
    contentSection.classList.add('hidden');
    bottomNav.classList.add('hidden');
    return;
  }

  setupSection.classList.add('hidden');
  contentSection.classList.remove('hidden');
  bottomNav.classList.remove('hidden');
}

function bindAuthButtons() {
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const user = await handleAuth('login');
      if (user) {
        await initializeAuthenticatedApp();
      }
    });
  }

  if (signupBtn) {
    signupBtn.addEventListener('click', async () => {
      const user = await handleAuth('signup');
      if (user) {
        await initializeAuthenticatedApp();
      }
    });
  }
}

async function initializeAuthenticatedApp() {
  const households = await hydrateHouseholdContext();
  renderHouseholdShell(households);

  if (households.length === 0) {
    setAppMode('setup');
    return;
  }

  setAppMode('active');

  await hydrateAccountContext();
  renderAccountsSetup();

  await Promise.all([
    loadCategories(),
    loadCategoryTypes()
  ]);

  cancelEdit();
  initNavigation();
}

export async function initApp() {
  await loadViews();
  markViewsLoaded();

  registerGlobalActions();
  bindAuthButtons();
  setupLogoutListener();
  bindHouseholdUi({
    onHouseholdChange: async () => {
      await initializeAuthenticatedApp();
    }
  });
  bindAccountsUi({
    onAccountsChanged: async () => {
      renderAccountsSetup();
    }
  });

  const user = await checkUser();
  if (user) {
    await initializeAuthenticatedApp();
  }
}
