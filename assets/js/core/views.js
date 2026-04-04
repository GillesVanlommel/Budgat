export const DEFAULT_VIEW = 'view-add';

export const VIEW_DEFINITIONS = [
  { id: 'view-add', file: 'views/add.html' },
  { id: 'view-history', file: 'views/history.html' },
  { id: 'view-budget', file: 'views/budget.html' },
  { id: 'view-settings', file: 'views/settings.html' }
];

export function getViewIds() {
  return VIEW_DEFINITIONS.map(view => view.id);
}
