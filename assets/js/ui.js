import { setCurrentView } from './core/app_state.js';
import { DEFAULT_VIEW, getViewIds } from './core/views.js';

const VIEW_REFRESHERS = {
  'view-add': () => window.loadV2TransactionView && window.loadV2TransactionView(),
  'view-history': () => {
    if (window.loadV2History) window.loadV2History();
  },
  'view-budget': () => {
    if (window.loadV2Budget) window.loadV2Budget();
  },
  'view-graphs': () => {
    if (window.loadV2Graphs) window.loadV2Graphs();
  },
  'view-settings': () => {
    if (window.loadV2Reconciliation) window.loadV2Reconciliation();
  }
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
    container.classList.add('max-w-7xl');
    container.classList.remove('max-w-md');
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
      btn.classList.add('text-indigo-700', 'border-indigo-200', 'bg-indigo-50');
      btn.classList.remove('text-slate-500', 'border-slate-300', 'bg-white');
    } else {
      btn.classList.add('text-slate-500', 'border-slate-300', 'bg-white');
      btn.classList.remove('text-indigo-700', 'border-indigo-200', 'bg-indigo-50');
    }
  });
}
