// budgat/assets/js/ui.js

// 1. Define the available views
const views = ['view-add', 'view-budget', 'view-graphs', 'view-settings'];

export function initNavigation() {
  // Attach click listeners to the bottom nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Find the closest button element (in case user clicks the icon SVG)
      const targetBtn = e.target.closest('.nav-btn');
      const viewId = targetBtn.dataset.target;
      switchView(viewId);
    });
  });

  // Set default view
  switchView('view-add');
}

export function switchView(targetId) {
  // 1. Hide all views
  views.forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });

  // 2. Show target view
  const targetElement = document.getElementById(targetId);
  if (targetElement) {
    targetElement.classList.remove('hidden');
    if (targetId === 'view-budget' && window.loadBudget) {
      window.loadBudget();
    }
  }

  // 3. Update Bottom Nav Active State
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