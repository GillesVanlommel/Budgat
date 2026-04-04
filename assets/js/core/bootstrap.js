import { markViewsLoaded } from './app_state.js';
import { handleAuth, checkUser, setupLogoutListener } from './auth.js';
import { loadViews } from './loader.js';
import { addCategory, deleteCategory, editCategory, loadCategories } from '../features/categories.js';
import { bindAccountsUi, createHouseholdAccount, hydrateAccountContext, renderAccountsSetup } from '../features/accounts.js';
import { bindV2BudgetUi, loadV2Budget, renderV2Budget } from '../features/v2_budget.js';
import { bindV2GraphsUi, loadV2Graphs } from '../features/v2_graphs.js';
import { bindV2HistoryUi, loadV2History, renderV2History } from '../features/v2_history.js';
import { bindV2CategoryUi, hydrateV2CategoryContext, renderV2Categories } from '../features/v2_categories.js';
import { bindV2ReconciliationUi, loadV2Reconciliation, renderV2Reconciliation } from '../features/v2_reconciliation.js';
import { bindV2TransactionUi, loadV2TransactionView, renderV2RecentTransactions, renderV2TransactionForm } from '../features/v2_transactions.js';
import {
  bindHouseholdUi,
  createHousehold,
  createHouseholdCategoryByKind,
  hydrateHouseholdContext,
  listHouseholds,
  renderHouseholdShell
} from '../features/households.js';
import { addReconciliation, deleteReconciliation, loadReconciliationList } from '../features/reconciliation.js';
import { exportCSV, importCSV } from '../utils/csv_utils.js';
import { initNavigation } from '../ui.js';

const globalActions = {
  addCategory,
  editCategory,
  deleteCategory,
  createHouseholdAccount,
  createHousehold,
  createHouseholdCategoryByKind,
  loadCategories,
  loadV2Budget,
  loadV2Graphs,
  loadV2TransactionView,
  loadV2Reconciliation,
  loadV2History,
  listHouseholds,
  renderV2History,
  renderV2Budget,
  renderV2Categories,
  renderV2Reconciliation,
  renderV2RecentTransactions,
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

function bindLegacyToolsUi() {
  const legacyToolsPanel = document.getElementById('legacyToolsPanel');

  if (!legacyToolsPanel) return;

  legacyToolsPanel.ontoggle = async () => {
    if (!legacyToolsPanel.open) return;

    await Promise.all([
      loadCategories(),
      loadReconciliationList()
    ]);
  };
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
  await hydrateV2CategoryContext();
  renderV2Categories();
  await loadV2TransactionView();
  await loadV2History();
  await loadV2Budget();
  await loadV2Graphs();
  await loadV2Reconciliation();
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
      renderV2TransactionForm();
      await loadV2History();
      await loadV2Reconciliation();
    }
  });
  bindV2CategoryUi({
    onCategoriesChanged: async () => {
      renderV2TransactionForm();
      renderV2Categories();
      await loadV2History();
      await loadV2Budget();
    }
  });
  bindV2TransactionUi({
    onTransactionsChanged: async () => {
      renderV2RecentTransactions();
      await loadV2History();
      await loadV2Budget();
      await loadV2Reconciliation();
    }
  });
  bindV2HistoryUi();
  bindV2BudgetUi();
  bindV2GraphsUi();
  bindV2ReconciliationUi();
  bindLegacyToolsUi();

  const user = await checkUser();
  if (user) {
    await initializeAuthenticatedApp();
  }
}
