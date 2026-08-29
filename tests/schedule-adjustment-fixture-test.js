'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const resourceFiles = [
  path.join(root, 'resources', 'schedule-data-1.json'),
  path.join(root, 'resources', 'schedule-data-2.json')
];
const verifyExpectedBehavior = process.argv.includes('--verify');
const writePreview = process.argv.includes('--write-preview');
const planningMode = !verifyExpectedBehavior;
const previewOutputFile = path.join(root, 'outputs', 'schedule-adjustment-email-preview.html');
const simulatedNow = new Date('2026-08-29T12:00:00+08:00');
const immutableManifestUrl =
  'https://raw.githubusercontent.com/artemas-hsieh/t-school-schedule-sync/' +
  '5f31cd2fb263b9b5e579eab0d25c1b4f278f854f/notification-email-templates.json';
const periodRanges = [
  ['08:25', '09:15'],
  ['09:15', '10:05'],
  ['10:15', '11:05'],
  ['11:05', '11:55'],
  ['13:25', '14:15'],
  ['14:15', '15:05'],
  ['15:15', '16:05'],
  ['16:05', '16:55']
];

function loadPayload(file) {
  assert.equal(fs.existsSync(file), true, `找不到課表資源檔：${file}`);
  const text = fs.readFileSync(file, 'utf8');
  assert.notEqual(text.trim(), '', `課表資源檔是空的：${file}`);
  let payload;
  assert.doesNotThrow(() => {
    payload = JSON.parse(text);
  }, `課表資源檔不是有效 JSON：${file}`);
  assert.equal(typeof payload.currentGrade, 'string', `${file} 缺少 currentGrade`);
  assert.equal(Array.isArray(payload.weekDataList), true, `${file} 缺少 weekDataList`);
  assert.equal(Array.isArray(payload.tableData), true, `${file} 缺少 tableData`);
  return { file, text, payload };
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function formatTaipeiDate(dateValue, pattern) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(dateValue)).map(part => [part.type, part.value])
  );
  if (pattern === 'yyyy') return parts.year;
  if (pattern === 'H') return String(Number(parts.hour));
  if (pattern === 'yyyy/MM/dd HH:mm') {
    return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function createScriptProperties() {
  const values = new Map();
  return {
    clear() {
      values.clear();
    },
    service: {
      getProperty(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setProperty(key, value) {
        values.set(key, String(value));
        return this;
      },
      setProperties(nextValues) {
        Object.keys(nextValues || {}).forEach(key => values.set(key, String(nextValues[key])));
        return this;
      },
      deleteProperty(key) {
        values.delete(key);
        return this;
      },
      getProperties() {
        return Object.fromEntries(values);
      }
    }
  };
}

function buildRuntime(emailTemplateManifestText) {
  global.window = global;
  require(path.join(root, 'sidebar-template.js'));
  require(path.join(root, 'setup-dialog-template.js'));
  require(path.join(root, 'code-template.js'));
  const scheduleData = require(path.join(root, 'schedule-data.js'));
  const generatedCode = global.buildAppsScriptCode({
    appVersion: 'schedule-adjustment-fixture-test',
    sourceApiUrl: scheduleData.API_URL,
    emailTemplateManifestUrl: immutableManifestUrl,
    gradeName: '高一',
    calendarName: 'T-SCHOOL 課表',
    notificationEmail: 'schedule-adjustment-test@example.com',
    instantNotificationsEnabled: true,
    notificationHours: [6],
    notifySyncHour: 6,
    selectedTitles: [],
    descriptionPreset: 'standard',
    customDescription: '{course}',
    reminderMode: 'none',
    reminderMinutes: 10,
    initialTermKey: '',
    initialCatalogFingerprintVersion: 0,
    initialCatalogFingerprint: '',
    initialKnownTitles: []
  });
  const sentMessages = [];
  const properties = createScriptProperties();
  const context = vm.createContext({
    console,
    Intl,
    Utilities: {
      formatDate(dateValue, timezone, pattern) {
        assert.equal(timezone, 'Asia/Taipei');
        return formatTaipeiDate(dateValue, pattern);
      },
      sleep() {},
      base64DecodeWebSafe(value) {
        return Array.from(Buffer.from(
          String(value).replace(/-/g, '+').replace(/_/g, '/'),
          'base64'
        ));
      },
      newBlob(bytes) {
        return {
          getDataAsString(encoding) {
            assert.equal(encoding, 'UTF-8');
            return Buffer.from(bytes).toString('utf8');
          }
        };
      }
    }
  });
  vm.runInContext(generatedCode, context);
  context.PropertiesService = {
    getScriptProperties() {
      return properties.service;
    }
  };
  context.CacheService = {
    getScriptCache() {
      return {
        get() {
          return emailTemplateManifestText;
        },
        put() {}
      };
    }
  };
  context.DocumentApp = {
    getActiveDocument() {
      return {
        getName() {
          return '行程調整測試控制臺';
        },
        getUrl() {
          return 'https://docs.google.com/document/d/schedule-adjustment-test/edit';
        }
      };
    }
  };
  context.Session = {
    getActiveUser() {
      return { getEmail: () => 'schedule-adjustment-test@example.com' };
    },
    getEffectiveUser() {
      return { getEmail: () => 'schedule-adjustment-test@example.com' };
    }
  };
  context.MailApp = {
    sendEmail(message) {
      sentMessages.push(message);
    }
  };
  context.Logger = { log() {} };
  return { context, properties, sentMessages };
}

function internalGradeName(apiGradeName) {
  const result = {
    '一年級': '高一',
    '二年級': '高二',
    '三年級': '高三'
  }[apiGradeName];
  assert.ok(result, `不支援的課表年級：${apiGradeName}`);
  return result;
}

function chooseScenarioDates(context, payload) {
  const headers = Array.from(context.inferHeaderDates_(payload, simulatedNow));
  const weekdayDates = [];
  const seen = new Set();
  headers.forEach(item => {
    if (Number(item.dayIndex) > 4 || seen.has(item.dateKey)) return;
    seen.add(item.dateKey);
    weekdayDates.push(item.dateKey);
  });
  assert.ok(weekdayDates.length >= 11, '課表中沒有足夠的平日可建立調課情境');
  const selected = weekdayDates.slice(5, 11);
  assert.ok(
    Date.parse(`${selected.at(-1)}T12:00:00+08:00`) -
      Date.parse(`${selected[0]}T12:00:00+08:00`) <= 21 * 24 * 60 * 60 * 1000,
    '調課情境日期必須位於 21 日配對範圍內'
  );
  return {
    d: selected[0],
    d1: selected[1],
    d2: selected[2],
    d4: selected[3],
    d5: selected[4],
    d6: selected[5]
  };
}

function chooseScenarioLocation(source) {
  const counts = new Map();
  Array.from(source.events || []).forEach(event => {
    const location = String(event.location || '').trim();
    if (location) counts.set(location, (counts.get(location) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((left, right) =>
    right[1] - left[1] || left[0].localeCompare(right[0], 'zh-Hant')
  )[0]?.[0] || '吉林基地';
}

function makeEvent(
  id,
  title,
  dateKey,
  periodStart,
  periodEnd,
  location
) {
  const startTime = periodRanges[periodStart - 1][0];
  const endTime = periodRanges[periodEnd - 1][1];
  return {
    scenarioId: id,
    originalTitle: `調整測試｜${title}`,
    isAllDay: false,
    weekNum: 0,
    weekday: '',
    dateKey,
    periodStart,
    periodEnd,
    startTime,
    endTime,
    start: new Date(`${dateKey}T${startTime}:00+08:00`),
    end: new Date(`${dateKey}T${endTime}:00+08:00`),
    location,
    sourceUpdatedLabel: '',
    outlineIdentityHash: ''
  };
}

function buildScenarioEvents(dates, location) {
  const oldEvents = [
    makeEvent('1-a-old', '課程 A', dates.d, 2, 2, location),
    makeEvent('2-b-old', '課程 B', dates.d1, 4, 4, location),
    makeEvent('3-c-double-old', '課程 C', dates.d5, 5, 6, location),
    makeEvent('3-c-single-old', '課程 C', dates.d4, 1, 1, location),
    makeEvent('3-d-old', '課程 D', dates.d4, 2, 2, location),
    makeEvent('4-e-course-old', '課程 E', dates.d6, 5, 5, location),
    makeEvent('4-e-exam-old', '課程 E', dates.d, 7, 7, 'X基地'),
    makeEvent('5-f-old', '課程 F', dates.d, 1, 2, location),
    makeEvent('5-g-old', '課程 G', dates.d, 3, 4, location)
  ];
  const newEvents = [
    makeEvent('1-a-new', '課程 A', dates.d, 1, 1, location),
    makeEvent('2-b-new', '課程 B', dates.d2, 2, 2, location),
    makeEvent('3-c-double-new', '課程 C', dates.d4, 1, 2, location),
    makeEvent('3-c-single-new', '課程 C', dates.d5, 5, 5, location),
    makeEvent('3-d-new', '課程 D', dates.d5, 6, 6, location),
    makeEvent('4-e-course-new', '課程 E', dates.d, 7, 7, location),
    makeEvent('4-e-exam-new', '課程 E', dates.d6, 5, 5, 'X基地'),
    makeEvent('5-f-new', '課程 F', dates.d, 3, 4, location),
    makeEvent('5-g-new', '課程 G', dates.d, 1, 2, location)
  ];
  return { oldEvents, newEvents };
}

function buildState(context, events) {
  const state = {};
  events.forEach((event, index) => {
    const stateKey = context.makeOccurrenceKey_(event);
    assert.equal(
      Object.prototype.hasOwnProperty.call(state, stateKey),
      false,
      `模擬舊狀態出現重複 occurrence key：${event.originalTitle} ${event.dateKey}`
    );
    state[stateKey] = Object.assign({}, event, {
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      calendarEventId: `fixture-calendar-event-${index}`
    });
  });
  return state;
}

function normalizePairs(plan) {
  return Array.from(plan.moved || [], pair => [
    pair.oldItem.scenarioId,
    pair.newItem.scenarioId
  ]).filter(pair => pair[0] || pair[1]).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

function expectedPairs() {
  return [
    ['1-a-old', '1-a-new'],
    ['2-b-old', '2-b-new'],
    ['3-c-double-old', '3-c-double-new'],
    ['3-c-single-old', '3-c-single-new'],
    ['3-d-old', '3-d-new'],
    ['4-e-course-old', '4-e-course-new'],
    ['4-e-exam-old', '4-e-exam-new'],
    ['5-f-old', '5-f-new'],
    ['5-g-old', '5-g-new']
  ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function scenarioItems(plan, key) {
  return Array.from(plan[key] || []).filter(item =>
    key === 'exact'
      ? item.oldItem?.scenarioId || item.newItem?.scenarioId
      : item.scenarioId
  );
}

function buildObservedResult(context, plan) {
  const changes = [];
  Array.from(plan.moved || []).forEach(pair => {
    changes.push({ type: '調整', oldItem: pair.oldItem, newItem: pair.newItem });
  });
  Array.from(plan.additions || []).forEach(newItem => {
    changes.push({ type: '新增', newItem });
  });
  Array.from(plan.deletions || []).forEach(oldItem => {
    changes.push({ type: '取消', oldItem });
  });
  return {
    created: plan.additions.length,
    updated: plan.moved.length,
    outlineUpdated: 0,
    deleted: plan.deletions.length,
    unchanged: plan.exact.length,
    omittedChangeCount: 0,
    changes: changes.map(change => context.serializeSyncChange_(change))
  };
}

const resources = resourceFiles.map(loadPayload);
assert.equal(resources[0].payload.currentGrade, resources[1].payload.currentGrade);
assert.equal(
  sha256(resources[0].text),
  sha256(resources[1].text),
  '前置情境要求兩份資源先是完全相同的基準課表'
);

const emailTemplateManifestText = fs.readFileSync(
  path.join(root, 'notification-email-templates.json'),
  'utf8'
);
JSON.parse(emailTemplateManifestText);
const { context, properties, sentMessages } = buildRuntime(emailTemplateManifestText);
const gradeName = internalGradeName(resources[0].payload.currentGrade);
const sourceA = context.parseSchedulePayload_(resources[0].payload, gradeName, simulatedNow);
const sourceB = context.parseSchedulePayload_(resources[1].payload, gradeName, simulatedNow);
assert.equal(sourceA.scheduleFingerprint, sourceB.scheduleFingerprint);
assert.equal(sourceA.events.length, sourceB.events.length);

const dates = chooseScenarioDates(context, resources[0].payload);
const location = chooseScenarioLocation(sourceA);
const baselineOldEvents = Array.from(sourceA.events).filter(event =>
  event.dateKey >= sourceA.firstDateKey
);
const baselineNewEvents = Array.from(sourceB.events).filter(event =>
  event.dateKey >= sourceA.firstDateKey
);
const baselinePlan = context.buildSyncPlan_(
  buildState(context, baselineOldEvents),
  baselineNewEvents,
  sourceA.firstDateKey
);
assert.equal(baselinePlan.moved.length, 0, '相同真實課表不得判定為調整');
assert.equal(baselinePlan.additions.length, 0, '相同真實課表不得判定為新增');
assert.equal(baselinePlan.deletions.length, 0, '相同真實課表不得判定為取消');

properties.clear();
const noChangeEmailData = context.buildChangeEmailData_(buildObservedResult(context, baselinePlan));
assert.equal(context.deliverScheduleChangeNotification_({
  notificationEmail: 'schedule-adjustment-test@example.com'
}, noChangeEmailData), false, '沒有行程調整時不得寄信');
assert.equal(sentMessages.length, 0);

const scenario = buildScenarioEvents(dates, location);
const oldEvents = baselineOldEvents.concat(scenario.oldEvents);
const newEvents = baselineNewEvents.concat(scenario.newEvents);
const plan = context.buildSyncPlan_(
  buildState(context, oldEvents),
  newEvents,
  sourceA.firstDateKey
);
const observedPairs = normalizePairs(plan);
expectedPairs().forEach(pair => {
  assert.equal(
    observedPairs.some(observed => observed[0] === pair[0] && observed[1] === pair[1]),
    true,
    `缺少預期調整配對：${pair[0]} -> ${pair[1]}`
  );
});

const result = buildObservedResult(context, plan);
const emailData = context.buildChangeEmailData_(result);
properties.clear();
assert.equal(context.deliverScheduleChangeNotification_({
  notificationEmail: 'schedule-adjustment-test@example.com'
}, emailData), true, '有行程調整時應建立通知信');
assert.equal(sentMessages.length, 1);
const message = sentMessages[0];
assert.equal(message.subject, `有 ${emailData.changeCount} 項行程調整｜T-SCHOOL Schedule Sync`);
assert.match(message.body, new RegExp(`新增 ${result.created}、調整 ${result.updated}、取消 ${result.deleted}`));
assert.equal(typeof message.htmlBody, 'string');
assert.match(message.htmlBody, new RegExp(`有 ${emailData.changeCount} 項行程調整`));
expectedPairs().forEach(pair => {
  const courseLetter = pair[0].match(/^\d-([a-g])-/)?.[1]?.toUpperCase();
  if (courseLetter) assert.match(message.body, new RegExp(`課程 ${courseLetter}`));
});

const expected = {
  moved: 9,
  additions: 0,
  deletions: 0,
  pairs: expectedPairs(),
  emailChangeCount: 9,
  emailSubject: '有 9 項行程調整｜T-SCHOOL Schedule Sync'
};
const observed = {
  moved: scenario.oldEvents.length - scenarioItems(plan, 'exact').length -
    scenarioItems(plan, 'deletions').length,
  additions: scenarioItems(plan, 'additions').length,
  deletions: scenarioItems(plan, 'deletions').length,
  exactScenarioPairs: scenarioItems(plan, 'exact').map(pair => [
    pair.oldItem.scenarioId,
    pair.newItem.scenarioId
  ]),
  pairs: observedPairs,
  emailChangeCount: emailData.changeCount,
  emailSubject: message.subject
};

if (verifyExpectedBehavior) {
  assert.deepEqual(observed.pairs, expected.pairs);
  assert.equal(observed.additions, expected.additions);
  assert.equal(observed.deletions, expected.deletions);
  assert.equal(observed.emailChangeCount, expected.emailChangeCount);
  assert.equal(observed.emailSubject, expected.emailSubject);
  assert.match(message.body, /調整｜調整測試｜課程 E/);
}

if (writePreview) {
  fs.mkdirSync(path.dirname(previewOutputFile), { recursive: true });
  fs.writeFileSync(previewOutputFile, message.htmlBody, 'utf8');
}

console.log(JSON.stringify({
  mode: planningMode ? 'plan' : 'verify',
  fixture: {
    files: resources.map(resource => path.relative(root, resource.file)),
    sha256: sha256(resources[0].text),
    grade: resources[0].payload.currentGrade,
    rows: resources[0].payload.tableData.length,
    parsedEvents: sourceA.events.length,
    dateRange: `${sourceA.firstDateKey}..${sourceA.lastDateKey}`
  },
  scenario: {
    dates,
    location,
    oldItems: scenario.oldEvents.length,
    newItems: scenario.newEvents.length
  },
  expected,
  observed,
  previewOutput: writePreview ? path.relative(root, previewOutputFile) : ''
}, null, 2));
