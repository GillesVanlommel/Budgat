import { setCurrentView } from './core/app_state.js';
import { DEFAULT_VIEW, getViewIds } from './core/views.js';

const VIEW_REFRESHERS = {
  'view-add': () => window.loadRecentTransactions && window.loadRecentTransactions(),
  'view-history': () => {
    if (window.loadV2History) window.loadV2History();
    if (window.loadAllTransactions) window.loadAllTransactions();
  },
  'view-budget': () => {
    if (window.loadV2Budget) window.loadV2Budget();
    if (window.loadBudget) window.loadBudget();
  },
  'view-graphs': () => window.loadGraphs && window.loadGraphs(),
  'view-settings': () => window.loadReconciliationList && window.loadReconciliationList()
};

export function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('.nav-btn');
      if (!targetBtn) return;

      const viewId = targetBtn.dataset.target;
      switchView(viewId);
    });
  });

  switchView(DEFAULT_VIEW);
}

export function switchView(targetId) {
  getViewIds().forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const container = document.getElementById('mainContainer');
  if (container) {
    container.classList.add('max-w-md');
    container.classList.remove('max-w-7xl');
  }

  const targetElement = document.getElementById(targetId);
  if (targetElement) {
    targetElement.classList.remove('hidden');
    setCurrentView(targetId);

    const refreshView = VIEW_REFRESHERS[targetId];
    if (refreshView) refreshView();
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.dataset.target === targetId) {
      btn.classList.add('text-indigo-600');
      btn.classList.remove('text-slate-400');
    } else {
      btn.classList.add('text-slate-400');
      btn.classList.remove('text-indigo-600');
    }
  });
}
