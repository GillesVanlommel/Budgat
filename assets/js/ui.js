// budgat/assets/js/ui.js

// 1. Define the available views
const views = ['view-add', 'view-history', 'view-budget', 'view-graphs', 'view-settings'];

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
  // 1. Hide all
  views.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.add('hidden');
  });

  // 2. Show target
  const targetElement = document.getElementById(targetId);
  if (targetElement) {
    targetElement.classList.remove('hidden');

    // Trigger specific loads
    if (targetId === 'view-budget' && window.loadBudget) window.loadBudget();
    
    // NEW: Load history when tab is clicked
    if (targetId === 'view-history' && window.loadAllTransactions) window.loadAllTransactions();
    
    // Refresh recent list if going back to add
    if (targetId === 'view-add' && window.loadRecentTransactions) window.loadRecentTransactions();
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