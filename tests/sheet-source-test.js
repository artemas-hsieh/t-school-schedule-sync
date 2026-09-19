'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const create = require('../sheet-source.js');
const data = require('../schedule-data.js');
const setup = require('../setup-code.js');
const parser = create();
const range = { key: '115-1-high2', validFrom: '2026-08-24', validUntil: '2027-02-10' };
const headers = ['日期', '週次', '星期', '節次', '實體', '線上', '非同步', '課程地點', '實體課程教室', '單元主題', '課程內容'];
const lesson = (date = '9/18', periods = '34') => [date, 3, 5, periods, 2, '', '', '吉林基地', '教室', '主題', '內容'];
const parse = (rows, merges) => parser.parseOutline(rows, '測試課程', range, merges);

assert.equal(parser.dateKey('115年9月18日', range), '2026-09-18');
assert.equal(parser.dateKey('2026/1/5', range), '2027-01-05');
assert.equal(parser.dateKey('9/18（五）', range), '2026-09-18');
assert.equal(parser.dateKey(String((Date.UTC(2026, 8, 18) - Date.UTC(1899, 11, 30)) / 86400000), range), '2026-09-18');
assert.equal(parser.dateKey('2/30', range), '');
assert.equal(parser.dateKey('9/18', { validFrom: '2026-01-01', validUntil: '2027-12-31' }), '');
assert.deepEqual(parser.dates('10/7-9', range), ['2026-10-07', '2026-10-08', '2026-10-09']);
assert.deepEqual(parser.periods('第２～４節'), [{ periodStart: 2, periodEnd: 4 }]);
assert.deepEqual(parser.periods('第1、3、5-6節'), [{ periodStart: 1, periodEnd: 1 }, { periodStart: 3, periodEnd: 3 }, { periodStart: 5, periodEnd: 6 }]);
assert.deepEqual(parser.periods('18'), [{ periodStart: 1, periodEnd: 1 }, { periodStart: 8, periodEnd: 8 }]);
assert.deepEqual(parser.periods('9'), []);
assert.deepEqual(parser.periods('4-2'), []);
let result = parse([headers, lesson()]);
assert.equal(result.events.length, 1);
assert.equal(result.events[0].start.toISOString(), '2026-09-18T02:15:00.000Z');
assert.equal(result.events[0].courseOutline.content, '內容');
assert.deepEqual(result.issues, []);

// Rows above the header, inserted columns, multiline/renamed headers and optional fields.
const shifted = [headers, lesson()].map(row => ['', ...row.slice(0, 4), '', ...row.slice(4)]);
shifted[0][1] = '上課\n日期'; shifted[0][shifted[0].indexOf('課程內容')] = '數A課程內容';
assert.equal(parse([['教師說明'], [], ...shifted]).events.length, 1);
assert.equal(parse([['日期', '節次'], ['9/18', '56']]).events[0].courseOutline.content, '');
const renamed = headers.slice(); renamed[3] = '時段';
assert.equal(parse([renamed, lesson(), lesson('9/19')]).events.length, 2);
const noDateHeader = headers.slice(); noDateHeader[0] = '';
assert.equal(parse([noDateHeader, lesson(), lesson('9/19')]).events.length, 2);
assert.ok(parse([['日期', '???'], ['9/18', '34']]).issues.length);

// Only real merges propagate dates. A missing date in an ordinary row stops sync.
const second = lesson('', '56');
assert.equal(parse([headers, lesson(), second]).issues.length, 1);
result = parse([headers, lesson(), second], [{ startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1 }]);
assert.equal(result.events.length, 2);
assert.equal(result.issues.length, 0);
const asyncRow = ['', 4, '', '', '', '', 2, '非同步', '', '自主學習', '內容'];
assert.equal(parse([headers, lesson(), asyncRow]).events.length, 1);
assert.equal(parse([headers, lesson(), asyncRow]).issues.length, 0);
assert.ok(parse([headers, asyncRow]).issues.length, '全空或純非同步分頁不能證明該門課已結束');
assert.equal(parse([headers, lesson('取消'), lesson()]).events.length, 1);
assert.equal(parse([headers, lesson(), lesson()]).events.length, 1);
const conflict = lesson(); conflict[7] = '弘道基地';
assert.ok(parse([headers, lesson(), conflict]).issues.length);
assert.ok(parse([headers, lesson(), lesson('9/18', '45')]).issues.some(issue => issue.includes('重疊')));
const mixed = lesson(); mixed[4] = '✓'; mixed[6] = '２';
assert.equal(parse([headers, mixed]).events.length, 1, '勾選實體課與非同步混合時仍保留課程');

const catalog = parser.parseCatalog(parser.parseCsv('\uFEFF課程名稱,課程類別,預設選取\r\n必修甲,必修,否\r\n選修乙,學科選修,是\r\n"課程,丙",多元選修,是'));
assert.equal(catalog[0].defaultSelected, true);
assert.equal(catalog[1].defaultSelected, false);
assert.equal(catalog[2].title, '課程,丙');
assert.throws(() => parser.parseCsv('<html>登入</html>'));
assert.throws(() => parser.parseCatalog([['課程名稱', '課程類別'], ['課程', '必修'], ['課程', '選修']]));
assert.throws(() => parser.parseCatalog([['課程名稱', '課程類別']]));
assert.ok(parser.catalogUrl('高一').includes(encodeURIComponent('高一')));
assert.equal(data.isDefaultSelectedTitle(catalog[0]), true);
assert.equal(data.isDefaultSelectedTitle(catalog[1]), false);
assert.equal(data.isCourseSelectionHidden('自然進階(二)'), false);
assert.deepEqual(data.applyCourseSelectionRules(['自然進階(二)'], [{ title: '自然進階(二)', category: '學科選修' }]), ['自然進階(二)']);

// Build the actual deployable program; stub Google IO, not the source adapter.
global.window = global;
require('../sidebar-template.js'); require('../setup-dialog-template.js'); require('../code-template.js');
const code = global.buildAppsScriptCode({ sourceApiUrl: data.API_URL, emailTemplateManifestUrl:
  'https://raw.githubusercontent.com/artemas-hsieh/t-school-schedule-sync/5f31cd2fb263b9b5e579eab0d25c1b4f278f854f/notification-email-templates.json' });
new Function(code);
const ctx = vm.createContext({ console, Date, Set, Map });
vm.runInContext(code, ctx);
const sourceApi = vm.runInContext('SHEET_SCHEDULE_SOURCE', ctx);
const stores = new Map();
ctx.readChunkedJson_ = (key, fallback) => stores.has(key) ? stores.get(key) : fallback;
ctx.writeChunkedJson_ = (key, value) => stores.set(key, value);
ctx.hashText_ = value => require('node:crypto').createHash('sha256').update(String(value)).digest('hex');
ctx.sortCatalogItemsByPeriod_ = values => values;
let currentRows = [headers, lesson('2026/9/18')], nextRows = [headers, lesson('2027/2/15')];
let currentEnabled = true, nextEnabled = true, live = true, failNext = false, nextGrade = false;
const currentSet = { ...range, spreadsheetIds: ['current'] };
const nextSet = { key: '115-2-high2', validFrom: '2027-02-11', validUntil: '2027-08-01', spreadsheetIds: ['next'] };
ctx.loadCourseOutlineSourceIndex_ = () => ({ source: live ? 'live' : 'last_success', setsByGrade: {
  高一: [], 高二: [...(currentEnabled ? [currentSet] : []), ...(nextEnabled && !nextGrade ? [nextSet] : [])],
  高三: nextEnabled && nextGrade ? [nextSet] : []
} });
ctx.readSheetsWorkbookMetadata_ = id => {
  if (id === 'next' && failNext) throw new Error('Forbidden');
  return { properties: { title: id }, sheets: [{ properties: { sheetId: 1, title: '測試課程' }, merges: [] }] };
};
ctx.readSheetsDisplayValues_ = (id, titles) => Object.fromEntries(titles.map(title => [title,
  id === parser.COURSE_INDEX_ID ? [['課程名稱', '課程類別'], ['測試課程', '必修']] : id === 'current' ? currentRows : nextRows
]));
const settings = { gradeName: '高二', termKey: '二年級|2026-1', setupComplete: true, selectedTitles: [], knownTitles: [], pendingTitles: [], excludedTitles: [] };
const beforeEnd = new Date('2026-09-18T11:54:59+08:00'), afterEnd = new Date('2026-09-18T11:55:00+08:00');
assert.equal(sourceApi.loadSource('高二', settings, beforeEnd).termKey, settings.termKey, '未選取的課程也會阻止提早切換');
let source = sourceApi.loadSource('高二', settings, afterEnd);
assert.equal(source.termKey, '二年級|2026-2', '已啟用下學期且全部課程結束，不必等待適用起日');
assert.equal(source.transitionEligible, true);
assert.equal(source.catalog.all[0].category, '必修');
nextEnabled = false;
assert.equal(sourceApi.loadSource('高二', settings, afterEnd).termKey, settings.termKey);
nextEnabled = true; failNext = true;
assert.equal(sourceApi.loadSource('高二', settings, afterEnd).termKey, settings.termKey, '下學期尚未可讀時仍維持原學期');
failNext = false; live = false;
assert.throws(() => sourceApi.loadSource('高二', settings, afterEnd), /索引/);
live = true; currentEnabled = false;
assert.throws(() => sourceApi.loadSource('高二', settings, afterEnd), /停用或移除/);
currentEnabled = true; currentRows = [headers, lesson('', '56')];
assert.throws(() => sourceApi.loadSource('高二', settings, afterEnd), /日期/);
currentRows = [headers, lesson('2026/9/18')];
currentRows.push(lesson('2026/12/18'));
sourceApi.loadSource('高二', settings, afterEnd);
currentRows.pop();
assert.equal(sourceApi.loadSource('高二', settings, afterEnd).termKey, settings.termKey, '刪掉最後幾列不會提早切換');
stores.clear();

// Graduation to next grade requires the current grade's entire last term to end.
currentSet.key = '115-2-high2'; currentSet.validFrom = '2027-02-01'; currentSet.validUntil = '2027-08-01';
nextSet.key = '116-1-high3'; nextSet.validFrom = '2027-08-02'; nextSet.validUntil = '2028-02-01';
currentRows = [headers, lesson('2027/6/1')]; nextRows = [headers, lesson('2027/9/1')];
nextGrade = true;
source = sourceApi.loadSource('高二', { ...settings, termKey: '二年級|2026-2' }, new Date('2027-07-01T00:00:00+08:00'));
assert.equal(source.gradeName, '高三');
assert.equal(source.transitionEligible, true);
assert.equal(source.termKey, '三年級|2027-1');

// Catalog-only codes never claim a semester that the public website cannot verify.
const summary = data.summarizePayload({ sourceKind: 'course-index', gradeName: '高二', catalog });
const payload = setup.makePayload({ sourceKind: 'course-index', gradeName: '高二', selectedTitles: ['必修甲'], initialCatalogFingerprint: summary.catalogFingerprint, initialCatalogFingerprintVersion: 3, notificationHours: [6] });
assert.equal(payload.termKey, '');
assert.equal(payload.sourceKind, 'course-index');
assert.equal(ctx.buildSetupSourceContextFromPayload_(payload), null);
ctx.loadSourceContext_ = () => source;
const importPayload = { ...payload, gradeName: '高三', selectedTitles: ['測試課程'], notificationEmail: 'student@example.com' };
importPayload.catalogFingerprint = ctx.makeSetupCatalogFingerprint_('', '', source.catalog.all);
const preview = ctx.buildSetupImportPreview_('', {}, { payload: importPayload, codeHash: 'test-code' });
assert.equal(preview.source_.termKey, '三年級|2027-1');
assert.equal(preview.selectedTitles.join(','), '測試課程');
assert.equal(preview.sourceChanged, false, '讀入實際學期不會被誤認為課程列表變更');
assert.throws(() => ctx.buildSetupImportPreview_('', {}, { payload: { ...importPayload, selectedTitles: ['索引缺課'] }, codeHash: 'test-code' }), /索引與當期課綱/);
const migrated = ctx.registerNewTitles_({ ...settings, selectedTitles: ['全校活動'] }, source);
assert.equal(migrated.selectedTitles.length, 0, '更新來源不會重新勾選使用者原先未選的必修');
assert.equal(migrated.outlineSourceMigrated, true);

// A complete source contains only course events. Normal managed-event planning
// removes old future activities, retains past events, and cannot see private events.
const past = { originalTitle: '全校活動', dateKey: '2026-09-17', start: '2026-09-17T00:00:00Z', end: '2026-09-17T01:00:00Z' };
const future = { ...past, dateKey: '2026-09-19', start: '2026-09-19T00:00:00Z', end: '2026-09-19T01:00:00Z' };
const plan = ctx.buildSyncPlan_({ past, future }, [], '2026-09-18');
assert.equal(plan.deletions.length, 1);
assert.equal(plan.deletions[0].stateKey, 'future');
assert.ok(plan.oldPast.past);

async function testWebsite() {
  const response = await data.fetchGradeSchedule('高二', async (url, options) => {
    assert.equal(url, parser.catalogUrl('高二'));
    assert.equal(options.credentials, 'omit');
    return { ok: true, text: async () => '課程名稱,課程類別\n必修甲,必修\n選修乙,學科選修' };
  });
  assert.equal(data.summarizePayload(response).catalog.all.length, 2);
  console.log('PASS: outline parser, catalog-only setup, semester eligibility, fail-closed Sheets adapter and managed migration');
}
testWebsite().catch(error => { console.error(error); process.exitCode = 1; });
