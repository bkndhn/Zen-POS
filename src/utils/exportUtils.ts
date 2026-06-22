// CSV-based exports (xlsx package removed for security — prototype pollution / ReDoS)

const csvEscape = (val: any): string => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const rowsToCsv = (rows: Record<string, any>[]): string => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  return lines.join('\r\n');
};

const downloadCsv = (filename: string, content: string) => {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Define interfaces for different report types
interface ExpenseForPDF {
  expense_name?: string;
  category: string;
  amount: number;
  date: string;
  note?: string;
}

interface ExpenseForExport {
  expense_name?: string;
  category: string;
  amount: number;
  date: string;
  note?: string;
  created_at: string;
}

interface BillForExport {
  bill_no: string;
  date: string;
  time: string;
  total_amount: number;
  discount: number;
  payment_mode: string;
  items_count: number;
}

interface ItemForExport {
  item_name: string;
  category: string;
  total_quantity: number;
  total_revenue: number;
  unit?: string;
}

// Get short unit format (pc, g, kg, ml, L)
const getShortUnitFormat = (unit?: string): string => {
  if (!unit) return 'pc';
  
  const unitLower = unit.toLowerCase().trim();
  
  // Check for common unit patterns and return short form
  if (unitLower.includes('kilogram') || unitLower === 'kg' || unitLower.includes('(kg)')) return 'kg';
  if (unitLower.includes('milliliter') || unitLower === 'ml' || unitLower.includes('(ml)')) return 'ml';
  if (unitLower.includes('gram') || unitLower === 'g' || unitLower.includes('(g)')) return 'g';
  if (unitLower.includes('liter') || unitLower === 'l' || unitLower.includes('(l)')) return 'L';
  if (unitLower.includes('piece') || unitLower === 'pc' || unitLower.includes('(pc)')) return 'pc';
  if (unitLower.includes('plate') || unitLower.includes('(plate)')) return 'plate';
  if (unitLower.includes('box') || unitLower.includes('(box)')) return 'box';
  if (unitLower.includes('pack') || unitLower.includes('(pack)')) return 'pack';
  if (unitLower.includes('dozen') || unitLower.includes('(dz)')) return 'dz';
  
  // If unit contains parentheses with short form, extract it
  const match = unit.match(/\(([^)]+)\)/);
  if (match) return match[1];
  
  // Default: return first 2-3 characters as short form
  return unit.substring(0, 3).toLowerCase();
};

// Format quantity with unit and smart conversion (g→kg, ml→L)
const formatQtyWithUnit = (qty: number, unit?: string): string => {
  const shortUnit = getShortUnitFormat(unit);

  // Convert g to kg if >= 1000
  if (shortUnit === 'g' && qty >= 1000) {
    return `${(qty / 1000).toFixed(2)} kg`;
  }

  // Convert ml to L if >= 1000
  if (shortUnit === 'ml' && qty >= 1000) {
    return `${(qty / 1000).toFixed(2)} L`;
  }

  // For whole numbers, don't show decimal
  if (Number.isInteger(qty)) {
    return `${qty} ${shortUnit}`;
  }

  return `${qty.toFixed(1)} ${shortUnit}`;
};

interface PaymentForExport {
  payment_method: string;
  total_amount: number;
  transaction_count: number;
  percentage: number;
}

interface ProfitLossForExport {
  totalSales: number;
  totalCOGS: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  totalPurchases: number;
  netCashFlow: number;
}

// Export all reports to Excel with separate sheets
export const exportAllReportsToExcel = (data: {
  bills: BillForExport[];
  items: ItemForExport[];
  payments: PaymentForExport[];
  profitLoss: ProfitLossForExport;
  dateRange: string;
  branchName?: string;
}) => {
  const sections: string[] = [];

  // Bills section
  if (data.bills.length > 0) {
    const billsData: Record<string, any>[] = data.bills.map((bill, index) => ({
      '#': index + 1,
      'Bill No': bill.bill_no,
      'Date': bill.date,
      'Time': bill.time,
      'Amount': bill.total_amount,
      'Discount': bill.discount,
      'Payment Mode': bill.payment_mode,
      'Items': bill.items_count,
    }));
    billsData.push({
      '#': '',
      'Bill No': '',
      'Date': 'TOTAL',
      'Time': '',
      'Amount': data.bills.reduce((s, b) => s + b.total_amount, 0),
      'Discount': data.bills.reduce((s, b) => s + b.discount, 0),
      'Payment Mode': '',
      'Items': data.bills.reduce((s, b) => s + b.items_count, 0),
    });
    sections.push('Bills Report\r\n' + rowsToCsv(billsData));
  }

  // Items section
  if (data.items.length > 0) {
    const itemsData: Record<string, any>[] = data.items.map((item, index) => ({
      '#': index + 1,
      'Item Name': item.item_name,
      'Category': item.category,
      'Quantity': formatQtyWithUnit(item.total_quantity, item.unit),
      'Revenue': item.total_revenue,
    }));
    itemsData.push({
      '#': '',
      'Item Name': '',
      'Category': 'TOTAL',
      'Quantity': data.items.reduce((s, i) => s + i.total_quantity, 0),
      'Revenue': data.items.reduce((s, i) => s + i.total_revenue, 0),
    });
    sections.push('Items Report\r\n' + rowsToCsv(itemsData));
  }

  // Payments section
  if (data.payments.length > 0) {
    const paymentsData: Record<string, any>[] = data.payments.map((p, index) => ({
      '#': index + 1,
      'Payment Method': p.payment_method,
      'Amount': p.total_amount,
      'Transactions': p.transaction_count,
      'Percentage': p.percentage + '%',
    }));
    paymentsData.push({
      '#': '',
      'Payment Method': 'TOTAL',
      'Amount': data.payments.reduce((s, p) => s + p.total_amount, 0),
      'Transactions': data.payments.reduce((s, p) => s + p.transaction_count, 0),
      'Percentage': '100%',
    });
    sections.push('Payments Report\r\n' + rowsToCsv(paymentsData));
  }

  // P&L section
  if (data.profitLoss) {
    const plData: Record<string, any>[] = [
      { 'Metric': 'Total Sales (Revenue)', 'Amount': data.profitLoss.totalSales },
      { 'Metric': 'Cost of Goods Sold (COGS)', 'Amount': data.profitLoss.totalCOGS },
      { 'Metric': 'Gross Profit', 'Amount': data.profitLoss.grossProfit },
      { 'Metric': 'Operating Expenses', 'Amount': data.profitLoss.totalExpenses },
      { 'Metric': 'Net Profit (COGS-based)', 'Amount': data.profitLoss.netProfit },
      { 'Metric': 'Stock Purchases', 'Amount': data.profitLoss.totalPurchases },
      { 'Metric': 'Net Cash Flow', 'Amount': data.profitLoss.netCashFlow },
    ];
    sections.push('Profit & Loss Statement\r\n' + rowsToCsv(plData));
  }

  const today = new Date().toISOString().split('T')[0];
  const cleanDateRange = data.dateRange.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const branchSlug = data.branchName
    ? data.branchName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    : 'all-branches';
  const filename = `reports-${branchSlug}-${cleanDateRange}-${today}.csv`;
  downloadCsv(filename, sections.join('\r\n\r\n'));
};

// Export all reports to PDF using HTML (supports Tamil and all Unicode)
export const exportAllReportsToPDF = (data: {
  bills: BillForExport[];
  items: ItemForExport[];
  payments: PaymentForExport[];
  profitLoss: ProfitLossForExport;
  dateRange: string;
  branchName?: string;
}) => {
  // Calculate totals
  const billsTotal = data.bills.reduce((sum, bill) => sum + bill.total_amount, 0);
  const itemsTotal = data.items.reduce((sum, item) => sum + item.total_revenue, 0);
  const paymentsTotal = data.payments.reduce((sum, payment) => sum + payment.total_amount, 0);

  // Simple HTML like browserPrinter.ts - works on mobile
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reports - ${data.dateRange}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; padding: 10px; background: white; color: black; }
    h1 { font-size: 18px; margin-bottom: 5px; }
    h2 { font-size: 14px; margin: 15px 0 5px; background: #2980b9; color: white; padding: 5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th { background: #3498db; color: white; padding: 4px; text-align: left; font-size: 10px; }
    td { padding: 3px 4px; border-bottom: 1px solid #ddd; font-size: 10px; }
    .r { text-align: right; }
    .b { font-weight: bold; background: #ecf0f1; }
  </style>
</head>
<body>
  <h1>Business Reports${data.branchName ? ` — ${data.branchName}` : ''}</h1>
  <p>Branch: ${data.branchName || 'All Branches'} | Period: ${data.dateRange} | Generated: ${new Date().toLocaleDateString()}</p>

${data.items.length > 0 ? `
  <h2>Items Sales Report</h2>
  <table>
    <tr><th>#</th><th>Item Name</th><th>Category</th><th class="r">Qty</th><th class="r">Revenue</th></tr>
    ${data.items.map((item, i) => `<tr><td>${i + 1}</td><td>${item.item_name}</td><td>${item.category}</td><td class="r">${formatQtyWithUnit(item.total_quantity, item.unit)}</td><td class="r">${item.total_revenue.toFixed(0)}</td></tr>`).join('')}
    <tr class="b"><td></td><td>TOTAL</td><td></td><td class="r">-</td><td class="r">${itemsTotal.toFixed(0)}</td></tr>
  </table>
` : ''}

${data.bills.length > 0 ? `
  <h2>Bills Report</h2>
  <table>
    <tr><th>#</th><th>Bill No</th><th>Date</th><th class="r">Amount</th><th>Payment</th></tr>
    ${data.bills.map((bill, i) => `<tr><td>${i + 1}</td><td>${bill.bill_no}</td><td>${bill.date}</td><td class="r">${bill.total_amount.toFixed(0)}</td><td>${bill.payment_mode}</td></tr>`).join('')}
    <tr class="b"><td></td><td>TOTAL</td><td></td><td class="r">${billsTotal.toFixed(0)}</td><td></td></tr>
  </table>
` : ''}

${data.payments.length > 0 ? `
  <h2>Payments</h2>
  <table>
    <tr><th>Method</th><th class="r">Amount</th><th class="r">Count</th><th class="r">%</th></tr>
    ${data.payments.map(p => `<tr><td>${p.payment_method}</td><td class="r">${p.total_amount.toFixed(0)}</td><td class="r">${p.transaction_count}</td><td class="r">${p.percentage.toFixed(0)}%</td></tr>`).join('')}
    <tr class="b"><td>TOTAL</td><td class="r">${paymentsTotal.toFixed(0)}</td><td class="r">${data.payments.reduce((s, p) => s + p.transaction_count, 0)}</td><td class="r">100%</td></tr>
  </table>
` : ''}

${data.profitLoss ? `
  <h2>Profit & Loss Statement</h2>
  <table>
    <tr><th>Metric</th><th class="r">Amount</th></tr>
    <tr><td>Total Sales (Revenue)</td><td class="r">₹${data.profitLoss.totalSales.toFixed(0)}</td></tr>
    <tr><td>Cost of Goods Sold (COGS)</td><td class="r">₹${data.profitLoss.totalCOGS.toFixed(0)}</td></tr>
    <tr class="b"><td>Gross Profit</td><td class="r">₹${data.profitLoss.grossProfit.toFixed(0)}</td></tr>
    <tr><td>Operating Expenses</td><td class="r">₹${data.profitLoss.totalExpenses.toFixed(0)}</td></tr>
    <tr class="b"><td>Net Profit (COGS-based)</td><td class="r" style="color:${data.profitLoss.netProfit >= 0 ? 'green' : 'red'}">₹${data.profitLoss.netProfit.toFixed(0)}</td></tr>
    <tr><td>Stock Purchases (Cash Outflow)</td><td class="r">₹${data.profitLoss.totalPurchases.toFixed(0)}</td></tr>
    <tr class="b"><td>Net Cash Flow</td><td class="r" style="color:${data.profitLoss.netCashFlow >= 0 ? 'green' : 'red'}">₹${data.profitLoss.netCashFlow.toFixed(0)}</td></tr>
  </table>
` : ''}

</body>
</html>`;

  // Open new window and print - EXACT same method as browserPrinter.ts
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    alert('Please allow popups to print reports');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for document to fully load before printing
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  };

  // Fallback if onload doesn't fire
  setTimeout(() => {
    if (printWindow && !printWindow.closed) {
      printWindow.focus();
      printWindow.print();
    }
  }, 1000);
};

// Keep the old functions for backward compatibility
export const exportToPDF = (expenses: ExpenseForPDF[], title: string = 'Expenses Report') => {
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; padding: 10px; background: white; color: black; }
  h1 { font-size: 18px; margin-bottom: 5px; }
  h2 { font-size: 14px; margin: 15px 0 5px; background: #2980b9; color: white; padding: 5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #3498db; color: white; padding: 4px; text-align: left; font-size: 10px; }
  td { padding: 3px 4px; border-bottom: 1px solid #ddd; font-size: 10px; }
  .r { text-align: right; }
  .b { font-weight: bold; background: #ecf0f1; }
</style></head><body>
  <h1>${title}</h1>
  <p>Generated: ${new Date().toLocaleDateString()} | Total: ${total.toFixed(2)}</p>
  <h2>Expenses</h2>
  <table>
    <tr><th>#</th><th>Name</th><th>Category</th><th class="r">Amount</th><th>Date</th><th>Note</th></tr>
    ${expenses.map((e, i) => `<tr><td>${i + 1}</td><td>${e.expense_name || 'Unnamed'}</td><td>${e.category}</td><td class="r">${e.amount.toFixed(2)}</td><td>${new Date(e.date).toLocaleDateString()}</td><td>${e.note || '-'}</td></tr>`).join('')}
    <tr class="b"><td></td><td>TOTAL</td><td></td><td class="r">${total.toFixed(2)}</td><td></td><td></td></tr>
  </table>
</body></html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) { alert('Please allow popups to print reports'); return; }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => { setTimeout(() => { printWindow.focus(); printWindow.print(); }, 300); };
  setTimeout(() => { if (printWindow && !printWindow.closed) { printWindow.focus(); printWindow.print(); } }, 1000);
};

export const exportToExcel = (expenses: ExpenseForPDF[], title: string = 'Expenses Report') => {
  const excelData = expenses.map((expense, index) => ({
    '#': index + 1,
    'Name': expense.expense_name || 'Unnamed Expense',
    'Category': expense.category,
    'Amount': expense.amount,
    'Date': new Date(expense.date).toLocaleDateString(),
    'Note': expense.note || '-'
  }));

  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  excelData.push({
    '#': '',
    'Name': '',
    'Category': 'TOTAL',
    'Amount': total,
    'Date': '',
    'Note': ''
  } as any);

  downloadCsv(`${title.toLowerCase().replace(/\s+/g, '-')}.csv`, rowsToCsv(excelData as Record<string, any>[]));
};

export const exportExpensesToPDF = exportToPDF;
export const exportExpensesToExcel = exportToExcel;
