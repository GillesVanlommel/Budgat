import { db } from './database.js';

export async function addCategory() {
  const nameInput = document.getElementById('newCategoryName');
  const budgetInput = document.getElementById('newCategoryBudget');

  const name = nameInput.value;
  const budget = budgetInput.value;

  const { data: { user } } = await db.auth.getUser();

  if (!name) {
    alert("Please enter a category name");
    return;
  }

  const { error } = await db.from('categories').insert([{
      name: name,
      monthly_budget: budget ? parseFloat(budget) : 0,
      user_id: user.id
    }]);

  if (error) {
    alert(error.message);
  } else {
    nameInput.value = '';
    budgetInput.value = '';
    loadCategories();
  }
}

export async function loadCategories() {
  const { data, error } = await db.from('categories').select('*').order('name', { ascending: true });
  if (error) return;

  const select = document.getElementById('categorySelect');
  if (select) {
    select.innerHTML = '<option value="">Select a Category</option>' +
      data.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  }

  const badgeList = document.getElementById('categoryBadgeList');
  if (badgeList) {
    if (data.length === 0) {
      badgeList.innerHTML = '<p class="text-slate-400 text-sm italic">No categories set.</p>';
      return;
    }

    badgeList.innerHTML = data.map(c => `
      <div class="flex items-center justify-between p-2 px-3 bg-white rounded-lg border border-slate-200 hover:border-indigo-100 transition-colors">
          <div class="flex items-center gap-3">
              <span class="font-semibold text-slate-700 text-sm">${c.name}</span>
              <span class="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">€${parseFloat(c.monthly_budget || 0).toFixed(0)}</span>
          </div>
          <div class="flex items-center">
              <button onclick="editCategory('${c.id}', '${c.name}', ${c.monthly_budget})" class="text-slate-400 hover:text-indigo-600 p-1.5 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
              </button>
              <button onclick="deleteCategory('${c.id}')" class="text-slate-400 hover:text-red-500 p-1.5 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </button>
          </div>
      </div>
    `).join('');
  }
}

export async function deleteCategory(id) {
  if (!confirm("Are you sure? This will delete the category.")) return;
  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) alert(error.message);
  else loadCategories();
}

export async function editCategory(id, currentName, currentBudget) {
  const nameInput = document.getElementById('newCategoryName');
  const budgetInput = document.getElementById('newCategoryBudget');
  const addBtn = document.querySelector('button[onclick="addCategory()"]');

  nameInput.value = currentName;
  budgetInput.value = currentBudget;

  addBtn.innerText = 'Update';
  addBtn.onclick = () => updateCategory(id);

  if (!document.getElementById('cancelCatEdit')) {
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancelCatEdit';
    cancelBtn.innerText = 'Cancel';
    cancelBtn.className = 'bg-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-300 font-medium';
    cancelBtn.onclick = resetCategoryForm;
    addBtn.parentNode.appendChild(cancelBtn);
  }
}

async function updateCategory(id) {
  const name = document.getElementById('newCategoryName').value;
  const budget = document.getElementById('newCategoryBudget').value;

  const { error } = await db.from('categories').update({
      name: name,
      monthly_budget: budget ? parseFloat(budget) : 0
    }).eq('id', id);

  if (error) {
    alert(error.message);
  } else {
    resetCategoryForm();
    loadCategories();
  }
}

function resetCategoryForm() {
  const nameInput = document.getElementById('newCategoryName');
  const budgetInput = document.getElementById('newCategoryBudget');
  const addBtn = document.querySelector('button[onclick^="updateCategory"]'); 
  const cancelBtn = document.getElementById('cancelCatEdit');

  nameInput.value = '';
  budgetInput.value = '';

  if (addBtn) {
    addBtn.innerText = 'Add';
    addBtn.onclick = addCategory;
  }
  if (cancelBtn) cancelBtn.remove();
}