import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/financial-report-loader.mjs', import.meta.url);
const { GET } = await import('../app/api/v1/summary/route.js');
const { buildInsights } = await import('../lib/insights.js');

function fixture() {
  const now = new Date();
  const month = offset => { const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const date = `${month(0)}-01`;
  globalThis.__financialReportUser = { id: 'test-director', roles: ['DIRECTOR'] };
  globalThis.__financialReportFixture = {
    transaction: [
      { type: 'income', amount: 100, currency: 'USD', fxRate: 25_000, date },
      { type: 'income', amount: 50, currency: 'EUR', fxRate: 30_000, date },
      { type: 'income', amount: 200_000, currency: 'VND', fxRate: 99, date },
      { type: 'expense', amount: 20, currency: 'USD', fxRate: 25_000, date },
      { type: 'expense', amount: 10, currency: 'EUR', fxRate: 30_000, date },
      { type: 'expense', amount: 100_000, currency: 'VND', date },
      { type: 'income', amount: 40, currency: 'USD', fxRate: 25_000, date: `${month(-1)}-01` },
    ],
    invoice: [
      { id: 'eur', status: 'sent', currency: 'EUR', fxRate: 30_000, date, dueDate: '2000-01-01', items: '[{"qty":1,"price":100}]', vat: 10, payments: '[{"amount":20,"fxRate":31000}]' },
      { id: 'usd', status: 'sent', currency: 'USD', fxRate: 25_000, date, items: '[{"qty":1,"price":200}]', payments: '[{"amount":50}]' },
      { id: 'vnd', status: 'sent', currency: 'VND', fxRate: 99, date, items: '[{"qty":1,"price":1000000}]', payments: '[{"amount":100000}]' },
      { id: 'void', status: 'void', currency: 'USD', date, items: '[{"qty":1,"price":999999}]' },
    ],
  };
}

test('actual summary route reconciles monthly money and cash balance in VND', async () => {
  fixture();
  const response = await GET(new Request('http://localhost/api/v1/summary'));
  assert.equal(response.status, 200);
  const body = response.body;
  assert.equal(body.kpiCurrency.revenue, 'VND');
  assert.equal(body.kpiCurrency.cashBalance, 'VND');
  assert.equal(body.kpi.revenue, 4_200_000);
  assert.equal(body.kpi.revenuePrev, 1_000_000);
  assert.equal(body.kpi.expense, 900_000);
  assert.equal(body.kpi.profit, 3_300_000);
  assert.equal(body.kpi.cashBalance, 4_300_000);
  assert.equal(body.kpi.ar, 7_350_000);
  assert.ok(body.insights.some(insight => /quá hạn.*3 triệu/.test(insight.text)));
});

test('actual insights uses converted revenue, then suppresses monetary claims on invalid rate', async () => {
  fixture();
  const insights = await buildInsights();
  assert.ok(insights.some(insight => /tăng 320%/.test(insight.text)));
  globalThis.__financialReportFixture.transaction[0].fxRate = 0;
  const invalidInsights = await buildInsights();
  assert.ok(invalidInsights.some(insight => /tỷ giá không hợp lệ/.test(insight.text)));
  assert.ok(!invalidInsights.some(insight => /Doanh thu tháng này|Burn rate trung bình/.test(insight.text)));
  const response = await GET(new Request('http://localhost/api/v1/summary'));
  assert.equal(response.status, 503);
  const body = response.body;
  assert.equal(body.code, 'financial_data_invalid');
  assert.equal('kpi' in body, false);
});

test('summary financial data stays unavailable to unauthenticated or non-director API keys', async () => {
  fixture();
  globalThis.__financialReportUser = null;
  assert.equal((await GET(new Request('http://localhost/api/v1/summary'))).status, 401);
  globalThis.__financialReportUser = { roles: ['ACCOUNTANT'] };
  assert.equal((await GET(new Request('http://localhost/api/v1/summary'))).status, 403);
});
