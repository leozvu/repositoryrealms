import { docGrand, itemsTotal, paidOf, parseItems, remainOf } from './format.js';
import { amountInVnd, transactionAmountVnd } from './money.js';

// Receivables retain the invoice book rate. Collections use each receipt's
// recorded rate; older JSON receipts have only the invoice rate available.
export const invoiceTotalVnd = invoice => amountInVnd(docGrand(invoice), invoice.currency, invoice.fxRate);
export const invoiceReceivableVnd = invoice => amountInVnd(remainOf(invoice), invoice.currency, invoice.fxRate);
export const invoiceSubtotalVnd = invoice => amountInVnd(itemsTotal(invoice), invoice.currency, invoice.fxRate);
export const invoiceVatVnd = invoice => amountInVnd(Math.round(itemsTotal(invoice) * (invoice.vat || 0) / 100), invoice.currency, invoice.fxRate);
export const invoiceCollectedVnd = invoice => parseItems(invoice.payments).reduce((sum, payment) =>
  sum + amountInVnd(payment.amount, payment.currency ?? invoice.currency, payment.fxRate ?? invoice.fxRate), 0);

export function transactionTotalsVnd(transactions) {
  let income = 0, expense = 0;
  for (const transaction of transactions) {
    const amount = transactionAmountVnd(transaction);
    if (transaction.type === 'income') income += amount;
    else if (transaction.type === 'expense') expense += amount;
  }
  return { income, expense, balance: income - expense };
}

// Do not publish a partial or zero-valued total when a foreign book rate is
// missing. Callers surface these identifiers and keep the source rows intact.
export function financialConversionIssues({ transactions = [], invoices = [], shipments = [] } = {}) {
  const issues = [];
  const check = (resource, rows, convert) => {
    for (const row of rows) {
      try { convert(row); }
      catch (error) {
        if (!(error instanceof RangeError)) throw error;
        issues.push({ resource, id: row.id ?? row.code ?? null, currency: row.currency || 'VND' });
      }
    }
  };
  check('transactions', transactions, transactionAmountVnd);
  check('invoices', invoices.filter(invoice => !['draft', 'void'].includes(invoice.status)), invoice => {
    amountInVnd(docGrand(invoice), invoice.currency, invoice.fxRate);
    amountInVnd(paidOf(invoice), invoice.currency, invoice.fxRate);
    invoiceCollectedVnd(invoice);
  });
  check('shipments', shipments.filter(shipment => !['draft', 'paid', 'void'].includes(shipment.status)), transactionAmountVnd);
  return issues;
}
