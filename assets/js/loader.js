// budgat/assets/js/loader.js

export async function loadViews() {
  const views = [
    { id: 'view-add', file: 'views/add.html' },
    { id: 'view-history', file: 'views/history.html' },
    { id: 'view-budget', file: 'views/budget.html' },
    { id: 'view-graphs', file: 'views/graphs.html' },
    { id: 'view-settings', file: 'views/settings.html' }
  ];

  // We loop through the list and fetch each file
  for (const view of views) {
    const container = document.getElementById(view.id);
    if (container) {
      try {
        const response = await fetch(view.file);
        const html = await response.text();
        container.innerHTML = html;
      } catch (error) {
        console.error(`Error loading view ${view.id}:`, error);
      }
    }
  }
}