const appState = {
  currentUser: null,
  currentHousehold: null,
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
