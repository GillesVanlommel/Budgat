import { VIEW_DEFINITIONS } from './views.js';

export async function loadViews() {
  for (const view of VIEW_DEFINITIONS) {
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
