import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_STAGES, assertLeadBoardAccess, forecastMonths, readLeadBoard } from '../lib/lead-board.js';
import { decodeLeadBoard, leadCsv } from '../lib/lead-board-client.js';
import { readCollection } from '../lib/collection-query.js';
import { RESOURCES } from '../lib/registry.js';
import { createLeadBoardDb } from './helpers/lead-board-db.mjs';
import { registerHooks } from 'node:module';
import { leadBoardRouteState } from './helpers/lead-board-route-boundary.mjs';

const boardRouteURL = new URL('../app/api/leads/board/route.js', import.meta.url).href;
const hook = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL === boardRouteURL) {
    if (['next/server', '@/lib/auth', '@/lib/prisma', '@/lib/module-guard'].includes(specifier)) {
      return { url: new URL('./helpers/lead-board-route-boundary.mjs', import.meta.url).href, shortCircuit: true };
    }
    if (specifier === '@/lib/lead-board') return { url: new URL('../lib/lead-board.js', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { GET: getLeadBoard } = await import(boardRouteURL);
hook.deregister();

const sales = { id: 'sales-a', roles: ['AM'] };
const director = { id: 'director', roles: ['DIRECTOR'] };
const now = new Date('2026-01-31T23:59:59Z');
function fixtureRows() {
  return BOARD_STAGES.flatMap((stage, stageIndex) => Array.from({ length: 42 }, (_, i) => ({
    id: `${stage}-${String(i).padStart(3, '0')}`, name: `Contact ${stage} ${i}`, company: `Company ${i}`,
    stage, ownerId: i < 28 ? sales.id : i < 31 ? null : 'sales-b',
    value: (stageIndex + 1) * 100 + i, campaign: i % 3 === 0 ? 'Spring' : i % 3 === 1 ? 'Partners' : null,
    expectedClose: i % 5 === 0 ? null : i % 5 === 1 ? '' : ['2026-01-31', '2026-02-28', '2026-03-31'][i % 3],
    // Identical timestamps exercise the unique ID tie-breaker.
    createdAt: '2026-01-01T00:00:00Z',
  })));
}
const scoped = rows => rows.filter(row => row.ownerId === sales.id || row.ownerId === null);

test('Lead board rejects unauthenticated, internal non-sales and freelancer users before any database reads', async () => {
  for (const [user, status] of [
    [null, 401], [{ roles: ['DIRECTOR'] }, 401], [{ id: 'staff', roles: ['STAFF'] }, 403],
    [{ id: 'pm', roles: ['PM'] }, 403], [{ id: 'ext', roles: ['DIRECTOR'], userType: 'freelancer' }, 403],
    [{ id: 'ext', roles: ['AM', 'FREELANCER'] }, 403],
  ]) {
    const f = createLeadBoardDb(fixtureRows());
    assert.throws(() => assertLeadBoardAccess(user), error => error.status === status);
    await assert.rejects(readLeadBoard(f.db, user), error => error.status === status);
    assert.equal(f.calls.length, 0); assert.equal(f.transactions.length, 0);
  }
  assert.doesNotThrow(() => assertLeadBoardAccess({ id: 'legacy', role: 'MANAGER' }));
});

test('Lead board route enforces session/module access and retains private no-store on successful and failed responses', async () => {
  const request = query => new Request('http://localhost/api/leads/board' + (query ? '?' + query : ''));
  const f = createLeadBoardDb(fixtureRows());
  for (const [user, enabled, status] of [[null, true, 401], [{ id: 'ext', roles: ['AM'], userType: 'freelancer' }, true, 403], [sales, false, 403]]) {
    Object.assign(leadBoardRouteState, { user, enabled, db: f.db, enabledReads: 0 });
    const response = await getLeadBoard(request());
    assert.equal(response.status, status);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(f.transactions.length, 0);
    if (!user || user.userType === 'freelancer') assert.equal(leadBoardRouteState.enabledReads, 0);
  }
  Object.assign(leadBoardRouteState, { user: sales, enabled: true });
  const response = await getLeadBoard(request());
  assert.equal(response.status, 200); assert.equal(response.body.summary.total, 186);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  const malformed = await getLeadBoard(request('newCursor=invalid!'));
  assert.equal(malformed.status, 400); assert.equal(malformed.body.code, 'collection_cursor_invalid');
  assert.equal(malformed.headers['Cache-Control'], 'private, no-store');
  leadBoardRouteState.db = { $transaction: async () => { throw new Error('SECRET_DB_CONNECTION'); } };
  const failed = await getLeadBoard(request());
  assert.equal(failed.status, 500); assert.equal(failed.body.code, 'lead_board_error');
  assert.ok(!JSON.stringify(failed.body).includes('SECRET_DB_CONNECTION'));
  assert.equal(failed.headers['Cache-Control'], 'private, no-store');
});

test('each stage reads only 25 plus one rows and later pages retain scope and stable ordering', async () => {
  const rows = fixtureRows(), f = createLeadBoardDb(rows);
  const first = await readLeadBoard(f.db, sales, new URLSearchParams(), now);
  const cursors = new URLSearchParams();
  for (const stage of BOARD_STAGES) {
    const column = first.columns[stage];
    assert.equal(column.rows.length, 25); assert.equal(column.page.size, 25); assert.equal(column.page.hasMore, true);
    assert.equal(column.rows[0].id, `${stage}-000`);
    assert.ok(column.rows.every(row => row.stage === stage && (row.ownerId === sales.id || row.ownerId === null)));
    cursors.set(`${stage}Cursor`, column.page.nextCursor);
  }
  const next = await readLeadBoard(f.db, sales, cursors, now);
  for (const stage of BOARD_STAGES) {
    assert.equal(next.columns[stage].rows.length, 6);
    assert.deepEqual(next.columns[stage].page, { size: 25, hasMore: false, nextCursor: null });
    const combined = [...first.columns[stage].rows, ...next.columns[stage].rows].map(row => row.id);
    assert.equal(new Set(combined).size, 31);
    assert.deepEqual(combined, scoped(rows).filter(row => row.stage === stage).map(row => row.id));
  }
  assert.deepEqual(next.summary, first.summary, 'KPIs cannot become totals of the selected page');
  const reads = f.calls.filter(call => call.operation === 'findMany');
  assert.equal(reads.length, 12);
  assert.ok(reads.every(call => call.args.take === 26 && call.transaction !== null));
  assert.ok(reads.every(call => call.args.orderBy.some(order => order.id === 'asc')));
});

test('full-scope totals, forecast and campaign attribution include rows beyond visible cards but exclude other owners', async () => {
  const rows = fixtureRows(), allowed = scoped(rows), f = createLeadBoardDb(rows, { probNew: 50, probContacted: 25, probProposal: 75, probNegotiation: 80, monthlyTarget: 50000 });
  const { summary, columns } = await readLeadBoard(f.db, sales, new URLSearchParams(), now);
  assert.equal(summary.total, 186);
  assert.equal(Object.values(columns).reduce((n, column) => n + column.rows.length, 0), 150);
  const open = allowed.filter(row => !['won', 'lost'].includes(row.stage));
  assert.equal(summary.openCount, 124);
  assert.equal(summary.openValue, open.reduce((n, row) => n + row.value, 0));
  assert.equal(summary.noDateCount, open.filter(row => !row.expectedClose).length);
  assert.equal(summary.target, 50000);
  assert.deepEqual(summary.months, ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(summary.forecast, summary.months.map(month => Math.round(open.filter(row => row.expectedClose?.startsWith(month))
    .reduce((n, row) => n + row.value * summary.probability[row.stage] / 100, 0))));
  for (const campaign of summary.campaigns) {
    const leads = allowed.filter(row => (row.campaign || '(không gắn chiến dịch)') === campaign.key);
    assert.equal(campaign.total, leads.length);
    assert.equal(campaign.won, leads.filter(row => row.stage === 'won').length);
    assert.equal(campaign.wonValue, leads.filter(row => row.stage === 'won').reduce((n, row) => n + row.value, 0));
    assert.equal(campaign.openValue, leads.filter(row => !['won', 'lost'].includes(row.stage)).reduce((n, row) => n + row.value, 0));
  }
  assert.equal(summary.hasCampaigns, true);
  const all = await readLeadBoard(f.db, director, new URLSearchParams(), now);
  assert.equal(all.summary.total, 252);
  assert.ok(all.summary.openValue > summary.openValue);
});

test('board reads all pages, aggregate groups and settings inside one requested RepeatableRead transaction', async () => {
  const rows = fixtureRows(); let changed = false;
  const f = createLeadBoardDb(rows, {}, ({ data, operation }) => {
    if (changed || operation !== 'findMany') return;
    changed = true;
    data.lead.push({ ...rows[0], id: 'concurrent-insert', value: 1000000 });
  });
  const board = await readLeadBoard(f.db, sales, new URLSearchParams(), now);
  assert.deepEqual(f.transactions, [{ isolationLevel: 'RepeatableRead', timeout: 15000 }]);
  assert.ok(f.calls.every(call => call.transaction === 1));
  assert.equal(board.summary.total, 186);
  const following = await readLeadBoard(f.db, sales, new URLSearchParams(), now);
  assert.equal(following.summary.total, 187);
  assert.equal(board.generatedAt, now.toISOString());
});

test('campaign top ten ranking considers the entire scoped campaign set, including wins absent from the visible page', async () => {
  const rows = Array.from({ length: 70 }, (_, i) => ({
    id: `win-${String(i).padStart(3, '0')}`, name: 'Won deal', ownerId: sales.id, stage: 'won', value: i * 1000,
    campaign: `Campaign ${i}`, createdAt: '2026-01-01', expectedClose: '2026-01-31',
  }));
  rows.push({ ...rows[0], id: 'foreign-win', campaign: 'Private campaign', ownerId: 'sales-b', value: 9000000 });
  rows.push({ ...rows[0], id: 'lost-high', campaign: 'Lost campaign', stage: 'lost', value: 8000000 });
  rows.push({ ...rows[0], id: 'open-high', campaign: 'Open campaign', stage: 'proposal', value: 7000000 });
  const board = await readLeadBoard(createLeadBoardDb(rows).db, sales, new URLSearchParams(), now);
  assert.equal(board.columns.won.rows.length, 25);
  assert.equal(board.summary.total, 72);
  assert.equal(board.summary.stages.won.count, 70);
  assert.equal(board.summary.openValue, 7000000);
  assert.deepEqual(board.summary.campaigns.map(item => item.key), Array.from({ length: 10 }, (_, i) => `Campaign ${69 - i}`));
  assert.ok(board.summary.campaigns.every(item => item.total === 1 && item.won === 1 && item.openValue === 0));
});

test('malformed, stage-swapped, other-user and reassigned-anchor cursors fail closed', async () => {
  const f = createLeadBoardDb(fixtureRows());
  const board = await readLeadBoard(f.db, sales, new URLSearchParams(), now);
  const cursor = board.columns.new.page.nextCursor;
  for (const params of [new URLSearchParams({ newCursor: '%%%invalid' }), new URLSearchParams({ newCursor: '' }),
    new URLSearchParams({ contactedCursor: cursor }), new URLSearchParams({ pageSize: '999' }), new URLSearchParams('newCursor=a&newCursor=b')]) {
    await assert.rejects(readLeadBoard(f.db, sales, params, now), error => error.status === 400);
  }
  await assert.rejects(readLeadBoard(f.db, { id: 'sales-b', roles: ['AM'] }, new URLSearchParams({ newCursor: cursor }), now),
    error => error.code === 'collection_cursor_invalid');
  const anchor = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  // The binding hash is not an authorization token: even a forged foreign ID
  // with the original binding must be checked against current row scope.
  const forged = Buffer.from(JSON.stringify({ ...anchor, id: 'new-041' })).toString('base64url');
  await assert.rejects(readLeadBoard(f.db, sales, new URLSearchParams({ newCursor: forged }), now),
    error => error.code === 'collection_cursor_expired' && error.status === 409);
  f.data.lead.find(row => row.id === anchor.id).ownerId = 'sales-b';
  await assert.rejects(readLeadBoard(f.db, sales, new URLSearchParams({ newCursor: cursor }), now),
    error => error.code === 'collection_cursor_expired' && error.status === 409);
});

test('forecast month calculation preserves end-of-month and year rollover and invalid settings fall back safely', async () => {
  for (const [date, expected] of [
    ['2026-01-31T23:59:59Z', ['2026-01', '2026-02', '2026-03']],
    ['2024-02-29T12:00:00Z', ['2024-02', '2024-03', '2024-04']],
    ['2026-12-31T12:00:00Z', ['2026-12', '2027-01', '2027-02']],
  ]) assert.deepEqual(forecastMonths(new Date(date)), expected);
  const f = createLeadBoardDb([], '{invalid json');
  const board = await readLeadBoard(f.db, sales, new URLSearchParams(), now);
  assert.deepEqual(board.summary.probability, { new: 10, contacted: 20, proposal: 40, negotiation: 60 });
  assert.equal(board.summary.target, 0); assert.equal(board.summary.total, 0);
  assert.deepEqual(board.summary.forecast, [0, 0, 0]);
  f.data.settings = JSON.stringify({ probNew: -2, probContacted: 900, probProposal: '75', probNegotiation: null });
  assert.deepEqual((await readLeadBoard(f.db, sales)).summary.probability, { new: 0, contacted: 100, proposal: 40, negotiation: 60 });
});

test('board decoder accepts real envelopes and rejects absent columns, rows and invalid metadata', async () => {
  const f = createLeadBoardDb(fixtureRows());
  const body = await readLeadBoard(f.db, sales, new URLSearchParams(), now);
  const decoded = decodeLeadBoard(body);
  assert.equal(decoded.rows.length, 150); assert.equal(decoded.metadata, body);
  for (const malformed of [null, {}, { ...body, summary: { total: NaN } }, { ...body, columns: {} },
    { ...body, columns: { ...body.columns, new: { rows: null, page: { hasMore: false } } } },
    { ...body, columns: { ...body.columns, new: { ...body.columns.new, rows: [null] } } },
    { ...body, columns: { ...body.columns, new: { ...body.columns.new, rows: [{ id: 'x', stage: 'won' }] } } },
    { ...body, columns: { ...body.columns, new: { ...body.columns.new, page: { size: 25, hasMore: true, nextCursor: null } } } },
    { ...body, columns: { ...body.columns, new: { ...body.columns.new, page: { size: 25, hasMore: true, nextCursor: '' } } } },
  ]) assert.throws(() => decodeLeadBoard(malformed));
});

test('CSV can include the full authorized collection rather than only the current board page', async () => {
  const f = createLeadBoardDb(fixtureRows());
  const board = await readLeadBoard(f.db, sales, new URLSearchParams(), now);
  const full = await readCollection(f.db, { resource: 'leads', cfg: RESOURCES.leads, user: sales, params: new URLSearchParams() });
  const csv = leadCsv(full.rows);
  assert.equal(full.page, null); assert.equal(full.rows.length, 186);
  assert.equal(csv.split('\r\n').length, 187);
  assert.equal(leadCsv(decodeLeadBoard(board).rows).split('\r\n').length, 151);
  assert.ok(csv.includes('Contact new 30')); assert.ok(!csv.includes('Contact new 41'));
});

test('CSV quotes delimiters/newlines and neutralizes spreadsheet formulas from every text field', () => {
  const csv = leadCsv([{
    company: '=HYPERLINK("x")', name: 'Jane, "A"\r\nB', stage: '+RUN()', value: -42,
    source: '\t@SUM(1)', campaign: '\r\n=CMD()', region: '-2+3', serviceLine: ' +SUM(A1)', expectedClose: '=TODAY()', ownerId: 'sales-a',
  }], () => '@OWNER');
  assert.ok(csv.startsWith('\ufeff"Deal"'));
  for (const text of ["'", '=HYPERLINK(""x"")', "'+RUN()", "'\t@SUM(1)", "'\r\n=CMD()", "'-2+3", "' +SUM(A1)", "'=TODAY()", "'@OWNER"])
    assert.ok(csv.includes(text), text);
  assert.ok(csv.includes('"Jane, ""A""\r\nB"'));
  assert.ok(csv.includes('"-42"'), 'numeric negative values remain numeric');
  assert.throws(() => leadCsv(null));
});
