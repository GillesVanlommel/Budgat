import { db } from './database.js';
import { loadCategories } from './categories.js';
import { loadTransactions } from './transactions.js';

// 1. SELECT DOM ELEMENTS
// We select these once so we can use them in multiple functions below
const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const logoutBtn = document.getElementById('logoutBtn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

// 2. CHECK USER (The function you asked about)
// This runs on page load to see if we already have a session.
export async function checkUser() {
  // Get the current user from Supabase
  const { data: { user } } = await db.auth.getUser();

  if (user) {
    // A. User is logged in: Show App, Hide Login
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');

    // B. Load the user's data
    loadCategories();
    loadTransactions();
  } else {
    // C. User is logged out: Show Login, Hide App
    // (This is the default HTML state, but good to be explicit)
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    logoutBtn.classList.add('hidden');
  }
}

// 3. HANDLE LOGIN / SIGNUP
export async function handleAuth(type) {
  const email = emailInput.value;
  const password = passwordInput.value;

  if (!email || !password) {
    alert("Please enter both email and password.");
    return;
  }

  // Attempt login or signup based on the 'type' argument
  const { error } = type === 'login'
    ? await db.auth.signInWithPassword({ email, password })
    : await db.auth.signUp({ email, password });

  if (error) {
    alert(error.message);
  } else {
    // If successful, checkUser will handle the UI switching
    checkUser();
  }
}

// 4. LOGOUT LOGIC
// We attach the listener directly here
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    const { error } = await db.auth.signOut();
    if (error) {
      alert(error.message);
    } else {
      // Reloading the page is the cleanest way to reset the app state
      window.location.reload();
    }
  };
}