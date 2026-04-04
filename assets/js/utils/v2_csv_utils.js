import { getCurrentHousehold, getHouseholdAccounts, getV2HouseholdCategories } from '../core/app_state.js';
import { db } from '../core/database.js';

function parseCsvLine(line) {
  const row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value.trim());
      value = '';
      continue;
    }

    value += char;
  }

  row.push(value.trim());
  return row;
}

function toCsvValue(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportCSV() {
  const household = getCurrentHousehold();
  if (!household?.household_id) {
    alert('Select a household first.');
    return;
  }

  const { data, error } = await db.rpc('list_household_transactions', {
    p_household_id: household.household_id,
    p_search: null,
    p_kind: null,
    p_account_id: null,
    p_category_id: null,
    p_month: null,
    p_limit: 10000
  });

  if (error) {
    alert(error.message || 'Failed to export CSV.');
    return;
  }

  const transactions = data || [];
  if (transactions.length === 0) {
    alert('No transactions to export.');
    return;
  }

  const headers = ['DATE', 'KIND', 'AMOUNT', 'DESCRIPTION', 'SOURCE_ACCOUNT', 'DESTINATION_ACCOUNT', 'CATEGORY', 'NOTES', 'CLEARED'];
  const rows = [headers.join(',')];

  transactions.forEach(transaction => {
    rows.push([
      toCsvValue(transaction.transaction_date),
      toCsvValue(transaction.kind),
      toCsvValue(Number(transaction.amount || 0).toFixed(2)),
      toCsvValue(transaction.description || ''),
      toCsvValue(transaction.account_name || ''),
      toCsvValue(transaction.to_account_name || ''),
      toCsvValue(transaction.category_name || ''),
      toCsvValue(transaction.notes || ''),
      toCsvValue(transaction.is_cleared ? 'true' : 'false')
    ].join(','));
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `budgat_v2_${household.household_id}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importCSV() {
  const household = getCurrentHousehold();
  if (!household?.household_id) {
    alert('Select a household first.');
    return;
  }

  const input = document.getElementById('csvInput');
  const file = input?.files?.[0];
  if (!file) {
    alert('Choose a CSV file first.');
    return;
  }

  const accounts = getHouseholdAccounts().filter(account => !account.archived);
  const categories = getV2HouseholdCategories().filter(category => !category.archived);

  const accountByName = {};
  accounts.forEach(account => {
    accountByName[account.name.trim().toLowerCase()] = account.account_id;
  });

  const categoryByName = {};
  categories.forEach(category => {
    categoryByName[category.name.trim().toLowerCase()] = category.category_id;
  });

  const content = await file.text();
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    alert('CSV has no data rows.');
    return;
  }

  const header = parseCsvLine(lines[0]).map(column => column.trim().toUpperCase());
  const expectedHeader = ['DATE', 'KIND', 'AMOUNT', 'DESCRIPTION', 'SOURCE_ACCOUNT', 'DESTINATION_ACCOUNT', 'CATEGORY', 'NOTES', 'CLEARED'];
  const isValidHeader = expectedHeader.every((column, index) => header[index] === column);

  if (!isValidHeader) {
    alert(`Invalid CSV headers. Expected: ${expectedHeader.join(', ')}`);
    return;
  }

  const payloads = [];
  const errors = [];

  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    if (row.length < 6) continue;

    const [date, kind, amountRaw, description, sourceAccountName, destinationAccountName, categoryName, notes, clearedRaw] = row;
    const normalizedKind = (kind || '').toLowerCase();
    const amount = Number(String(amountRaw || '0').replace(',', '.'));
    const sourceAccountId = accountByName[(sourceAccountName || '').trim().toLowerCase()] || null;
    const destinationAccountId = accountByName[(destinationAccountName || '').trim().toLowerCase()] || null;
    const categoryId = categoryByName[(categoryName || '').trim().toLowerCase()] || null;
    const isCleared = String(clearedRaw || '').toLowerCase() === 'true';

    if (!['expense', 'income', 'transfer'].includes(normalizedKind)) {
      errors.push(`Row ${i + 1}: invalid kind "${kind}"`);
      continue;
    }

    if (!sourceAccountId) {
      errors.push(`Row ${i + 1}: source account "${sourceAccountName}" not found`);
      continue;
    }

    if (!description) {
      errors.push(`Row ${i + 1}: description is required`);
      continue;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`Row ${i + 1}: amount must be > 0`);
      continue;
    }

    if (normalizedKind === 'transfer') {
      if (!destinationAccountId) {
        errors.push(`Row ${i + 1}: destination account required for transfers`);
        continue;
      }
    } else if (!categoryId) {
      errors.push(`Row ${i + 1}: category "${categoryName}" not found`);
      continue;
    }

    payloads.push({
      p_household_id: household.household_id,
      p_transaction_date: date,
      p_kind: normalizedKind,
      p_description: description,
      p_notes: notes || null,
      p_amount: amount,
      p_account_id: sourceAccountId,
      p_to_account_id: normalizedKind === 'transfer' ? destinationAccountId : null,
      p_category_id: normalizedKind === 'transfer' ? null : categoryId,
      p_is_cleared: isCleared
    });
  }

  if (errors.length > 0) {
    alert(`Import blocked:\n${errors.slice(0, 8).join('\n')}`);
    return;
  }

  if (payloads.length === 0) {
    alert('No valid rows to import.');
    return;
  }

  if (!confirm(`Import ${payloads.length} transactions into this household?`)) {
    return;
  }

  for (let i = 0; i < payloads.length; i += 1) {
    const { error } = await db.rpc('create_household_transaction', payloads[i]);
    if (error) {
      alert(`Import failed at row ${i + 2}: ${error.message}`);
      return;
    }
  }

  if (input) input.value = '';
  alert(`Imported ${payloads.length} transactions.`);
}
