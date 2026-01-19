import { db } from './database.js';
import { loadCategories } from './categories.js';
import { loadRecentTransactions } from './transactions.js';
import { initNavigation } from './ui.js'; // Import navigation logic

const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const bottomNav = document.getElementById('bottomNav'); // Select bottom nav

export async function checkUser() {
  const { data: { user } } = await db.auth.getUser();

  if (user) {
    // 1. User is logged in
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    
    // Show Bottom Nav
    bottomNav.classList.remove('hidden');

    // Load Data
    loadCategories();
    loadRecentTransactions();
    
    // Initialize UI (Navigation Tabs)
    initNavigation();

  } else {
    // 2. User is logged out
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    
    // Hide Bottom Nav
    bottomNav.classList.add('hidden');
  }
}

export async function handleAuth(type) {
  const email = emailInput.value;
  const password = passwordInput.value;

  if (!email || !password) {
    alert("Please enter both email and password.");
    return;
  }

  const { error } = type === 'login'
    ? await db.auth.signInWithPassword({ email, password })
    : await db.auth.signUp({ email, password });

  if (error) {
    alert(error.message);
  } else {
    checkUser();
  }
}

// 4. SETUP LOGOUT LISTENER
// Export this function so we can call it after views are loaded
export function setupLogoutListener() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      const { error } = await db.auth.signOut();
      if (error) {
        alert(error.message);
      } else {
        window.location.reload();
      }
    };
  }
}