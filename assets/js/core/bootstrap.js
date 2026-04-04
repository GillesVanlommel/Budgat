import { markViewsLoaded } from './app_state.js';
import { handleAuth, checkUser, setupLogoutListener } from './auth.js';
import { loadViews } from './loader.js';
import { addCategory, deleteCategory, editCategory, loadCategories } from '../features/categories.js';
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
  loadBudget,
  loadRecentTransactions,
  loadAllTransactions,
  loadGraphs,
  setHistoryTypeFilter,
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

  const user = await checkUser();
  if (user) {
    await initializeAuthenticatedApp();
  }
}
