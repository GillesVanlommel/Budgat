export { checkUser, handleAuth, setupLogoutListener } from './core/auth.js';
export { initApp } from './core/bootstrap.js';
export { loadViews } from './core/loader.js';

export {
  bindAccountsUi,
  createHouseholdAccount,
  hydrateAccountContext,
  listHouseholdAccounts,
  listHouseholdMembers,
  renderAccountsSetup
} from './features/accounts.js';
export {
  bindV2CategoryUi,
  hydrateV2CategoryContext,
  listV2HouseholdCategories,
  renderV2Categories
} from './features/v2_categories.js';
export {
  bindV2BudgetUi,
  listV2BudgetMonthLines,
  loadV2Budget,
  renderV2Budget,
  setV2BudgetLine
} from './features/v2_budget.js';
export {
  bindV2HistoryUi,
  listV2HistoryTransactions,
  loadV2History,
  renderV2History
} from './features/v2_history.js';
export {
  bindV2GraphsUi,
  listV2AnalyticsTransactions,
  loadV2Graphs
} from './features/v2_graphs.js';
export {
  bindV2ReconciliationUi,
  deleteV2AccountReconciliation,
  listHouseholdAccountBalances,
  listV2AccountReconciliations,
  loadV2Reconciliation,
  renderV2Reconciliation,
  upsertV2AccountReconciliation
} from './features/v2_reconciliation.js';
export {
  bindV2TransactionUi,
  createV2Transaction,
  hydrateV2TransactionContext,
  listRecentV2Transactions,
  loadV2TransactionView,
  renderV2RecentTransactions,
  renderV2TransactionForm
} from './features/v2_transactions.js';
export {
  bindHouseholdUi,
  createHouseholdInvite,
  createHousehold,
  createHouseholdCategoryByKind,
  hydrateHouseholdContext,
  joinHouseholdByInvite,
  listHouseholdInvites,
  listHouseholds,
  revokeHouseholdInvite,
  renderHouseholdShell
} from './features/households.js';
export { exportCSV, importCSV } from './utils/v2_csv_utils.js';

export { initNavigation, switchView } from './ui.js';
