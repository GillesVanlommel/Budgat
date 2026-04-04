import { db } from './database.js';
import { clearCurrentHousehold, setCurrentUser } from './app_state.js';

const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const bottomNav = document.getElementById('bottomNav');

function updateAuthUI(user) {
  setCurrentUser(user);

  if (user) {
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    bottomNav.classList.add('hidden');
  } else {
    clearCurrentHousehold();
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    bottomNav.classList.add('hidden');
  }

  return user || null;
}

export async function checkUser() {
  const { data: { user } } = await db.auth.getUser();
  return updateAuthUI(user);
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
    return null;
  }

  return checkUser();
}

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
