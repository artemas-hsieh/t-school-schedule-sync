'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const scheduleData = require(path.join(root, 'configurator/schedule-data.js'));

global.window = global;
require(path.join(root, 'configurator/sidebar-template.js'));
require(path.join(root, 'configurator/code-template.js'));

const generatedCode = global.buildAppsScriptCode({
  appVersion: '2.0.0-mvp',
  sourceApiUrl: scheduleData.API_URL,
  gradeName: '高一',
  calendarName: 'T-SCHOOL 課表',
  notificationEmail: 'test@example.com',
  autoSyncHours: [5, 12, 18, 22],
  notifySyncHour: 5,
  includeActivities: true,
  excludedActivities: ['高一全校活動'],
  selectedCourses: ['公民'],
  notificationPreset: 'standard',
  customNotification: '{type}｜{course}',
  descriptionPreset: 'standard',
  customDescription: '{course}',
  reminderMode: 'none',
  reminderMinutes: 10,
  initialTermKey: '',
  initialSourceFingerprint: '',
  initialKnownTitles: []
});

assert.doesNotThrow(() => new Function(generatedCode));
assert.equal(generatedCode.includes('COURSE_DICTIONARY'), false);
assert.equal(generatedCode.includes('function previewSettingsImpactFromUi('), true);
assert.equal(generatedCode.includes('function showSettingsSidebar('), true);
assert.equal(generatedCode.includes('function getNotificationTemplate_('), true);

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function formatDate(dateValue, pattern) {
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(dateValue)).map(part => [part.type, part.value])
  );

  if (pattern === 'yyyy') {
    return parts.year;
  }

  if (pattern === 'yyyy/MM/dd HH:mm') {
    return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

const context = vm.createContext({
  console,
  Intl,
  Utilities: {
    formatDate(dateValue, timezone, pattern) {
      assert.equal(timezone, 'Asia/Taipei');
      return formatDate(dateValue, pattern);
    }
  }
});

vm.runInContext(generatedCode, context);

const fixtures = [
  { grade: '高一', file: '/tmp/tschool-requirements-grade1.json' },
  { grade: '高二', file: '/tmp/tschool-requirements-grade2.json' },
  { grade: '高三', file: '/tmp/tschool-requirements-grade3.json' }
];

const results = fixtures.map(fixture => {
  if (!fs.existsSync(fixture.file)) {
    return { grade: fixture.grade, skipped: true, reason: `找不到 ${fixture.file}` };
  }

  const payload = JSON.parse(fs.readFileSync(fixture.file, 'utf8'));
  const installerSummary = scheduleData.summarizePayload(payload, new Date('2026-07-20T12:00:00+08:00'));
  const runtimeSummary = context.parseSchedulePayload_(payload, fixture.grade, new Date('2026-07-20T12:00:00+08:00'));

  assert.deepEqual(
    Array.from(runtimeSummary.catalog.courses, item => item.title).sort(),
    Array.from(installerSummary.catalog.courses, item => item.title).sort(),
    `${fixture.grade} 的課程目錄不一致`
  );
  assert.deepEqual(
    Array.from(runtimeSummary.catalog.activities, item => item.title).sort(),
    Array.from(installerSummary.catalog.activities, item => item.title).sort(),
    `${fixture.grade} 的活動目錄不一致`
  );
  assert.equal(runtimeSummary.firstDateKey, installerSummary.firstDateKey);
  assert.equal(runtimeSummary.lastDateKey, installerSummary.lastDateKey);
  assert.equal(runtimeSummary.events.some(event => /\[[^\]]+\]\s*$/.test(event.originalTitle)), false);
  assert.equal(runtimeSummary.catalog.activities.every(item => context.isActivityTitle_(item.title)), true);

  return {
    grade: fixture.grade,
    courses: runtimeSummary.catalog.courses.length,
    activities: runtimeSummary.catalog.activities.length,
    events: runtimeSummary.events.length,
    range: `${runtimeSummary.firstDateKey}..${runtimeSummary.lastDateKey}`
  };
});

console.log(JSON.stringify({
  generatedCharacters: generatedCode.length,
  generatedLines: generatedCode.split('\n').length,
  results
}, null, 2));
