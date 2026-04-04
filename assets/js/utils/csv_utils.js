import { db } from '../core/database.js';

export async function exportCSV() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;

  const { data, error } = await db.from('transactions').select('*').order('date', { ascending: false });
  if (error || !data.length) return;

  const headers = ["WANNEER", "WAT", "HOEVEEL", "CATEGORIE", "OPMERKING"];
  const csvRows = [headers.join(',')];

  data.forEach(t => {
    csvRows.push([
      `"${t.date}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${t.amount}"`,
      `"${(t.category || '').replace(/"/g, '""')}"`,
      `"${(t.remark || '').replace(/"/g, '""')}"`
    ].join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budgat_export.csv';
  a.click();
}

export async function importCSV() {
  const file = document.getElementById('csvInput').files[0];
  const { data: { user } } = await db.auth.getUser();
  if (!file || !user) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const lines = e.target.result.split('\n').map(l => l.trim()).filter(l => l);
    const transactions = [];

    for (let i = 1; i < lines.length; i++) {
      let row = [], inQuotes = false, currentVal = '';
      for (let char of lines[i]) {
        if (char === '"') { inQuotes = !inQuotes; continue; }
        if (char === ',' && !inQuotes) { row.push(currentVal); currentVal = ''; continue; }
        currentVal += char;
      }
      row.push(currentVal);

      if (row.length >= 4) {
        transactions.push({
          user_id: user.id,
          date: row[0].trim(),
          description: row[1].trim(),
          amount: parseFloat(row[2].replace(',', '.')),
          category: row[3].trim(),
          remark: row[4] ? row[4].trim() : ''
        });
      }
    }

    if (transactions.length && confirm(`Import ${transactions.length} transactions?`)) {
      const { error } = await db.from('transactions').insert(transactions);
      if (!error) {
        alert("Success!");
        location.reload();
      }
    }
  };
  reader.readAsText(file);
}