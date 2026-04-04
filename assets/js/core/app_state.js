const appState = {
  currentUser: null,
  currentHousehold: null,
  households: [],
  householdAccounts: [],
  householdMembers: [],
  v2CategoryKinds: [],
  v2HouseholdCategories: [],
  v2RecentTransactions: [],
  currentView: 'view-add',
  viewsLoaded: false
};

const SELECTED_HOUSEHOLD_STORAGE_KEY = 'budgat:selectedHouseholdId';

export function setCurrentUser(user) {
  appState.currentUser = user || null;
}

export function getCurrentUser() {
  return appState.currentUser;
}

export function setCurrentHousehold(household) {
  appState.currentHousehold = household || null;
}

export function getCurrentHousehold() {
  return appState.currentHousehold;
}

export function setHouseholds(households) {
  appState.households = Array.isArray(households) ? households : [];
}

export function getHouseholds() {
  return appState.households;
}

export function setHouseholdAccounts(accounts) {
  appState.householdAccounts = Array.isArray(accounts) ? accounts : [];
}

export function getHouseholdAccounts() {
  return appState.householdAccounts;
}

export function setHouseholdMembers(members) {
  appState.householdMembers = Array.isArray(members) ? members : [];
}

export function getHouseholdMembers() {
  return appState.householdMembers;
}

export function setV2CategoryKinds(categoryKinds) {
  appState.v2CategoryKinds = Array.isArray(categoryKinds) ? categoryKinds : [];
}

export function getV2CategoryKinds() {
  return appState.v2CategoryKinds;
}

export function setV2HouseholdCategories(categories) {
  appState.v2HouseholdCategories = Array.isArray(categories) ? categories : [];
}

export function getV2HouseholdCategories() {
  return appState.v2HouseholdCategories;
}

export function setV2RecentTransactions(transactions) {
  appState.v2RecentTransactions = Array.isArray(transactions) ? transactions : [];
  window.__budgat_v2_recent_transactions__ = appState.v2RecentTransactions;
}

export function getV2RecentTransactions() {
  return appState.v2RecentTransactions;
}

export function setSelectedHouseholdId(householdId) {
  if (!householdId) {
    localStorage.removeItem(SELECTED_HOUSEHOLD_STORAGE_KEY);
    return;
  }

  localStorage.setItem(SELECTED_HOUSEHOLD_STORAGE_KEY, householdId);
}

export function getSelectedHouseholdId() {
  return localStorage.getItem(SELECTED_HOUSEHOLD_STORAGE_KEY);
}

export function clearCurrentHousehold() {
  appState.currentHousehold = null;
  appState.households = [];
  appState.householdAccounts = [];
  appState.householdMembers = [];
  appState.v2CategoryKinds = [];
  appState.v2HouseholdCategories = [];
  appState.v2RecentTransactions = [];
  window.__budgat_v2_recent_transactions__ = [];
  localStorage.removeItem(SELECTED_HOUSEHOLD_STORAGE_KEY);
}

export function setCurrentView(viewId) {
  appState.currentView = viewId;
}

export function getCurrentView() {
  return appState.currentView;
}

export function markViewsLoaded() {
  appState.viewsLoaded = true;
}

export function areViewsLoaded() {
  return appState.viewsLoaded;
}
