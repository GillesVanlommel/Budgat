import { db } from './database.js';

// 1. ADD CATEGORY
export async function addCategory() {
  const name = document.getElementById('newCategoryName').value;
  
  // We need the user ID to insert a row securely
  const { data: { user } } = await db.auth.getUser();

  if (!name) {
    alert("Please enter a category name");
    return;
  }

  const { error } = await db
    .from('categories')
    .insert([{ name, user_id: user.id }]);

  if (error) {
    alert(error.message);
  } else {
    document.getElementById('newCategoryName').value = '';
    loadCategories(); // Refresh the list immediately
  }
}

// 2. LOAD CATEGORIES
export async function loadCategories() {
  const { data, error } = await db
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) return;

  // A. Update the Dropdown in the Transaction Form
  const select = document.getElementById('categorySelect');
  // Keep the default option
  select.innerHTML = '<option value="">Select a Category</option>' +
    data.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

  // B. Update the Badges in the Management section
  const badgeList = document.getElementById('categoryBadgeList');
  badgeList.innerHTML = data.map(c => `
    <span class="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2">
        ${c.name}
        <button onclick="deleteCategory('${c.id}')" class="text-indigo-400 hover:text-red-500">×</button>
    </span>
  `).join('');
}

// 3. DELETE CATEGORY
export async function deleteCategory(id) {
  if(!confirm("Are you sure you want to delete this category?")) return;

  const { error } = await db.from('categories').delete().eq('id', id);
  
  if (error) {
    alert(error.message);
  } else {
    loadCategories(); // Refresh the list to remove the deleted badge
  }
}