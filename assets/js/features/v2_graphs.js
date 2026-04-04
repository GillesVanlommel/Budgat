import { getCurrentHousehold } from '../core/app_state.js';
import { db } from '../core/database.js';

let monthlyChartInstance = null;
let categoryChartInstance = null;
let accountChartInstance = null;

function getV2GraphsUiElements() {
  return {
    monthInput: document.getElementById('v2GraphMonthSelector'),
    setupHint: document.getElementById('v2GraphSetupHint'),
    emptyHint: document.getElementById('v2GraphEmptyHint'),
    metricExpense: document.getElementById('v2MetricExpense'),
    metricIncome: document.getElementById('v2MetricIncome'),
    metricNet: document.getElementById('v2MetricNet'),
    metricTransfers: document.getElementById('v2MetricTransfers'),
    monthlyCanvas: document.getElementById('v2MonthlyCashflowChart'),
    categoryCanvas: document.getElementById('v2SpendingByCategoryChart'),
    accountCanvas: document.getElementById('v2AccountActivityChart')
  };
}

function getCurrentMonthString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function monthFromDateString(dateStr) {
  return `${dateStr.slice(0, 4)}-${dateStr.slice(5, 7)}`;
}

function formatCurrency(value) {
  return `EUR ${Number(value || 0).toFixed(2)}`;
}

function destroyCharts() {
  if (monthlyChartInstance) {
    monthlyChartInstance.destroy();
    monthlyChartInstance = null;
  }

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }

  if (accountChartInstance) {
    accountChartInstance.destroy();
    accountChartInstance = null;
  }
}

function setMetricValues({ expense = 0, income = 0, net = 0, transfers = 0 }) {
  const { metricExpense, metricIncome, metricNet, metricTransfers } = getV2GraphsUiElements();

  if (metricExpense) metricExpense.textContent = formatCurrency(expense);
  if (metricIncome) metricIncome.textContent = formatCurrency(income);
  if (metricNet) metricNet.textContent = formatCurrency(net);
  if (metricTransfers) metricTransfers.textContent = formatCurrency(transfers);
}

function setEmptyState({ showSetup, showEmpty }) {
  const { setupHint, emptyHint } = getV2GraphsUiElements();
  if (setupHint) setupHint.classList.toggle('hidden', !showSetup);
  if (emptyHint) emptyHint.classList.toggle('hidden', !showEmpty);
}

export async function listV2AnalyticsTransactions(householdId, limit = 5000) {
  const { data, error } = await db.rpc('list_household_transactions', {
    p_household_id: householdId,
    p_search: null,
    p_kind: null,
    p_account_id: null,
    p_category_id: null,
    p_month: null,
    p_limit: limit
  });

  if (error) throw error;
  return data || [];
}

function buildMonthlySeries(transactions, months) {
  const monthMap = {};
  months.forEach(month => {
    monthMap[month] = { income: 0, expense: 0, transfers: 0 };
  });

  transactions.forEach(transaction => {
    const month = monthFromDateString(transaction.transaction_date);
    if (!monthMap[month]) return;

    if (transaction.kind === 'income') {
      monthMap[month].income += Number(transaction.amount || 0);
      return;
    }

    if (transaction.kind === 'expense') {
      monthMap[month].expense += Number(transaction.amount || 0);
      return;
    }

    if (transaction.kind === 'transfer') {
      monthMap[month].transfers += Number(transaction.amount || 0);
    }
  });

  return monthMap;
}

function getRecentMonths(count = 6) {
  const months = [];
  const now = new Date();

  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  return months;
}

function renderMonthlyCashflowChart(monthMap, months) {
  const { monthlyCanvas } = getV2GraphsUiElements();
  if (!monthlyCanvas) return;

  const labels = months.map(month => {
    const [year, monthNum] = month.split('-').map(Number);
    return new Date(year, monthNum - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  });

  monthlyChartInstance = new Chart(monthlyCanvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: months.map(month => monthMap[month].income),
          backgroundColor: '#10b981'
        },
        {
          label: 'Expense',
          data: months.map(month => monthMap[month].expense),
          backgroundColor: '#ef4444'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function renderSpendingByCategoryChart(monthTransactions) {
  const { categoryCanvas } = getV2GraphsUiElements();
  if (!categoryCanvas) return;

  const byCategory = {};
  monthTransactions
    .filter(transaction => transaction.kind === 'expense')
    .forEach(transaction => {
      const key = transaction.category_name || 'Uncategorized';
      byCategory[key] = (byCategory[key] || 0) + Number(transaction.amount || 0);
    });

  const entries = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  categoryChartInstance = new Chart(categoryCanvas, {
    type: 'doughnut',
    data: {
      labels: entries.map(entry => entry[0]),
      datasets: [
        {
          data: entries.map(entry => entry[1]),
          backgroundColor: [
            '#6366f1',
            '#ef4444',
            '#f59e0b',
            '#22c55e',
            '#0ea5e9',
            '#8b5cf6',
            '#ec4899',
            '#64748b'
          ]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

function renderAccountActivityChart(monthTransactions) {
  const { accountCanvas } = getV2GraphsUiElements();
  if (!accountCanvas) return;

  const byAccount = {};
  monthTransactions.forEach(transaction => {
    const sourceKey = transaction.account_name || 'Unknown';
    byAccount[sourceKey] = byAccount[sourceKey] || { inflow: 0, outflow: 0 };

    if (transaction.kind === 'income') {
      byAccount[sourceKey].inflow += Number(transaction.amount || 0);
    } else {
      byAccount[sourceKey].outflow += Number(transaction.amount || 0);
    }

    if (transaction.kind === 'transfer' && transaction.to_account_name) {
      const destinationKey = transaction.to_account_name;
      byAccount[destinationKey] = byAccount[destinationKey] || { inflow: 0, outflow: 0 };
      byAccount[destinationKey].inflow += Number(transaction.amount || 0);
    }
  });

  const accountNames = Object.keys(byAccount).slice(0, 8);

  accountChartInstance = new Chart(accountCanvas, {
    type: 'bar',
    data: {
      labels: accountNames,
      datasets: [
        {
          label: 'Inflow',
          data: accountNames.map(name => byAccount[name].inflow),
          backgroundColor: '#10b981'
        },
        {
          label: 'Outflow',
          data: accountNames.map(name => byAccount[name].outflow),
          backgroundColor: '#f97316'
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      },
      scales: {
        x: {
          beginAtZero: true
        }
      }
    }
  });
}

export async function loadV2Graphs() {
  const household = getCurrentHousehold();
  const { monthInput } = getV2GraphsUiElements();

  if (!monthInput) return;
  if (!monthInput.value) {
    monthInput.value = getCurrentMonthString();
  }

  if (!household?.household_id) {
    destroyCharts();
    setMetricValues({});
    setEmptyState({ showSetup: true, showEmpty: false });
    return;
  }

  const transactions = await listV2AnalyticsTransactions(household.household_id, 5000);
  const hasTransactions = transactions.length > 0;

  if (!hasTransactions) {
    destroyCharts();
    setMetricValues({});
    setEmptyState({ showSetup: false, showEmpty: true });
    return;
  }

  const selectedMonth = monthInput.value;
  const monthTransactions = transactions.filter(
    transaction => monthFromDateString(transaction.transaction_date) === selectedMonth
  );

  const monthIncome = monthTransactions
    .filter(transaction => transaction.kind === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const monthExpense = monthTransactions
    .filter(transaction => transaction.kind === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const monthTransfers = monthTransactions
    .filter(transaction => transaction.kind === 'transfer')
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

  setMetricValues({
    expense: monthExpense,
    income: monthIncome,
    net: monthIncome - monthExpense,
    transfers: monthTransfers
  });

  setEmptyState({ showSetup: false, showEmpty: monthTransactions.length === 0 });
  destroyCharts();

  const months = getRecentMonths(6);
  const monthMap = buildMonthlySeries(transactions, months);
  renderMonthlyCashflowChart(monthMap, months);
  renderSpendingByCategoryChart(monthTransactions);
  renderAccountActivityChart(monthTransactions);
}

export function bindV2GraphsUi() {
  const { monthInput } = getV2GraphsUiElements();
  if (!monthInput) return;

  monthInput.onchange = () => {
    loadV2Graphs();
  };
}
