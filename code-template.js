(function () {
  'use strict';

  function escapeJsonForScript(json) {
    return json.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }

  function formatString(value) {
    return escapeJsonForScript(JSON.stringify(String(value == null ? '' : value)));
  }

  function formatLongString(value) {
    const text = String(value == null ? '' : value);
    const chunks = [];

    for (let index = 0; index < text.length; index += 7000) {
      chunks.push(formatString(text.slice(index, index + 7000)));
    }

    return chunks.length ? chunks.join(' +\n  ') : "''";
  }

  function formatObject(value) {
    return escapeJsonForScript(JSON.stringify(value || {}, null, 2));
  }

  function normalizeHour(value, fallback) {
    const hour = Number(value);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
  }

  function normalizeHourArray(values, fallbackHour) {
    const result = [];

    (Array.isArray(values) ? values : []).forEach(value => {
      const hour = normalizeHour(value, null);

      if (hour !== null && !result.includes(hour)) {
        result.push(hour);
      }
    });

    if (result.length === 0) {
      result.push(fallbackHour);
    }

    return result.sort((a, b) => a - b);
  }

  const STANDARD_CUSTOM_DESCRIPTION_TEMPLATE = [
    '第 {week} 週 / 週{weekday} / 第 {period} 節',
    '',
    '**# 單元主題**',
    '{topic}',
    '',
    '**# 課程內容**',
    '{content}'
  ].join('\n');

  function buildHighLoadTestAppsScriptCode() {
    return `
const HIGH_LOAD_TEST_CONFIG_STORE = 'TSCHOOL_HIGH_LOAD_TEST_CONFIG';
const HIGH_LOAD_TEST_SOURCE_STORE = 'TSCHOOL_HIGH_LOAD_TEST_SOURCE';
const HIGH_LOAD_TEST_OUTLINE_STORE = 'TSCHOOL_HIGH_LOAD_TEST_OUTLINE';
const HIGH_LOAD_TEST_STATE_STORE = 'TSCHOOL_HIGH_LOAD_TEST_STATE';
const HIGH_LOAD_TEST_REPORT_STORE = 'TSCHOOL_HIGH_LOAD_TEST_REPORT';
const HIGH_LOAD_TEST_CALENDAR_PREFIX = '[TEST]';
const HIGH_LOAD_TEST_SIMULATED_NOW = '2026-02-23T06:00:00+08:00';
const HIGH_LOAD_TEST_EXPECTED = {
  totalFuture: 422,
  courseFuture: 380,
  activityFuture: 42,
  outlineWindow: 79,
  outlineCourseNames: 20,
  firstDateKey: '2026-02-23',
  lastDateKey: '2026-08-16'
};

function showHighLoadTestGuide() {
  assertHighLoadTestingEnabled_();
  SpreadsheetApp.getUi().alert(
    '高負載測試',
    '這是開發者測試工具，只能安裝在全新的控制臺副本。\\n\\n' +
    '執行「模擬控制臺首次同步」後，程式會以 2026/02/23 的高二開學資料，' +
    '一次完成來源檢查、30 天課綱讀取、建立 [TEST] 專用日曆，' +
    '並沿用正式控制臺的 40 筆分批與背景續跑機制同步全部 422 筆行程。\\n\\n' +
    '不需要另外執行分段測試。完成後可查看進度或開啟測試日曆。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function runHighLoadFirstSyncTest() {
  assertHighLoadTestingEnabled_();
  const ui = SpreadsheetApp.getUi();
  const regularSettings = loadSettings_();
  const regularState = loadSyncState_();
  if (regularSettings.setupComplete ||
      Object.keys(regularState).length > 0 ||
      isActiveSyncJob_(loadSyncJob_())) {
    throw new Error(
      '安全檢查失敗：這份控制臺已有同步狀態。請建立全新的試算表副本，再安裝測試版 Code.gs。'
    );
  }
  const response = ui.alert(
    '模擬控制臺首次同步',
    '程式將模擬 2026/02/23 高二剛開學，讀取 30 天課綱，' +
    '自動建立名稱以 [TEST] 開頭的專用日曆，並開始同步全部 422 筆行程。\\n\\n' +
    '這與控制臺按下「儲存並首次同步」使用相同的分批同步流程。是否繼續？',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return { ok: false, cancelled: true };

  cleanupHighLoadTestEnvironmentCore_(true);
  const startedAt = Date.now();
  const calendarName = HIGH_LOAD_TEST_CALENDAR_PREFIX + ' 114-2 首次同步 ' +
    Utilities.formatDate(new Date(), TIMEZONE, 'MMdd-HHmm');
  const config = {
    calendarId: '',
    calendarName,
    simulatedNow: HIGH_LOAD_TEST_SIMULATED_NOW,
    createdAt: new Date().toISOString(),
    sourceFingerprint: '',
    expectedEvents: HIGH_LOAD_TEST_EXPECTED.totalFuture
  };
  writeChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, config);

  const payload = fetchSchedulePayload_('高二');
  const source = parseSchedulePayload_(payload, '高二', highLoadTestBusinessNow_());
  const report = buildHighLoadReadOnlyReport_(source, Date.now() - startedAt);
  if (!report.ok) {
    throw new Error('高二開學測試資料與 422 筆基準不一致：' + report.mismatches.join('、'));
  }
  config.sourceFingerprint = source.fingerprint;
  writeChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, config);

  const settings = buildHighLoadTestSettings_(source);
  const outlineEvents = filterCourseOutlineLookaheadEvents_(
    getHighLoadTestDesiredEvents_(source),
    highLoadTestBusinessNow_(),
    COURSE_OUTLINE_LOOKAHEAD_DAYS
  ).filter(event => event.type === 'course' && !event.isAllDay);
  const sourceSets = getRelevantCourseOutlineSourceSets_('高二', outlineEvents);
  if (!sourceSets.length) {
    throw new Error('模擬日期沒有可使用的高二課綱來源組。');
  }
  const snapshot = collectCourseOutlineSnapshot_(settings, source, outlineEvents, sourceSets);
  if (snapshot.diagnostics.missingSheetNames.length) {
    throw new Error(
      '30 天課綱找不到精確分頁：' +
      snapshot.diagnostics.missingSheetNames.join('、') +
      '。已停止首次同步，避免建立缺少課綱內容的測試事件。'
    );
  }
  publishCourseOutlineSnapshot_(snapshot);
  const enrichedOutlineEvents = attachCourseOutlineLookup_(
    outlineEvents,
    snapshot.lookup || {}
  );
  const classroomEvents = enrichedOutlineEvents.filter(event =>
    event.courseOutline && event.courseOutline.classroom
  );
  const testNotificationEmail =
    Session.getActiveUser().getEmail() ||
    Session.getEffectiveUser().getEmail();
  assertSingleEmail_(testNotificationEmail);

  let syncResponse;
  try {
    syncResponse = saveSettingsAndSyncFromUi({
      gradeName: '高二',
      selectedCourses: source.catalog.courses.map(item => item.title),
      includeActivities: true,
      excludedActivities: [],
      calendarId: '',
      calendarName,
      notificationEmail: testNotificationEmail,
      autoSyncEnabled: true,
      autoSyncHours: [6],
      notifySyncHour: 6,
      descriptionPreset: 'standard',
      customDescription: '',
      reminderMode: 'none',
      reminderMinutes: 10
    });
  } finally {
    const activeSettings = loadSettings_();
    if (activeSettings.calendarId) {
      config.calendarId = activeSettings.calendarId;
      config.calendarName = activeSettings.calendarName;
      writeChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, config);
    }
  }

  saveHighLoadTestReport_('first_sync', {
    ok: true,
    expectedEvents: HIGH_LOAD_TEST_EXPECTED.totalFuture,
    outlineCandidates: outlineEvents.length,
    outlineEvents: enrichedOutlineEvents.filter(event => event.outlineHash).length,
    classroomEvents: classroomEvents.length,
    pending: Boolean(syncResponse && syncResponse.pending),
    jobId: syncResponse && syncResponse.jobId || '',
    elapsedMs: Date.now() - startedAt
  });
  ui.alert(
    '首次同步已開始',
    '預計同步：422 筆\\n' +
    '30 天內已套用課綱：' +
      enrichedOutlineEvents.filter(event => event.outlineHash).length +
      ' / ' + outlineEvents.length + ' 筆\\n' +
    '其中含實體課程教室：' + classroomEvents.length + ' 筆\\n\\n' +
    (syncResponse && syncResponse.pending
      ? '第一批已保存，剩餘行程會由背景觸發器自動續跑，不需再執行其他測試項目。'
      : '全部行程已完成同步。') +
    '\\n可使用「查看首次同步進度」確認結果。',
    ui.ButtonSet.OK
  );
  return syncResponse;
}

function setupHighLoadTestEnvironment() {
  assertHighLoadTestingEnabled_();
  const ui = SpreadsheetApp.getUi();
  const regularSettings = loadSettings_();
  const regularState = loadSyncState_();
  if (regularSettings.setupComplete || Object.keys(regularState).length > 0) {
    throw new Error(
      '安全檢查失敗：這份控制臺已有正式同步狀態。請先建立全新的試算表副本，再安裝測試版 Code.gs。'
    );
  }
  const response = ui.alert(
    '建立高負載測試環境',
    '程式將建立一個名稱以 [TEST] 開頭的獨立 Google 日曆，並以目前的高二課表資料模擬 2026/02/23。\\n\\n' +
    '請確認這份 Apps Script 是測試副本，不是正式使用中的控制臺。是否繼續？',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return { ok: false, cancelled: true };

  cleanupHighLoadTestEnvironmentCore_(true);
  const startedAt = Date.now();
  const payload = fetchSchedulePayload_('高二');
  const source = parseSchedulePayload_(payload, '高二', highLoadTestBusinessNow_());
  const calendarName = HIGH_LOAD_TEST_CALENDAR_PREFIX + ' 114-2 開學高負載 ' +
    Utilities.formatDate(new Date(), TIMEZONE, 'MMdd-HHmm');
  const calendar = CalendarApp.createCalendar(calendarName);
  if (typeof calendar.setTimeZone === 'function') calendar.setTimeZone(TIMEZONE);
  assertHighLoadTestCalendar_(calendar);

  const serializedSource = {
    gradeName: '高二',
    termKey: source.termKey,
    fingerprint: source.fingerprint,
    firstDateKey: source.firstDateKey,
    lastDateKey: source.lastDateKey,
    catalog: source.catalog,
    events: source.events.map(serializeHighLoadTestEvent_)
  };
  writeChunkedJson_(HIGH_LOAD_TEST_SOURCE_STORE, serializedSource);
  writeChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, {
    calendarId: calendar.getId(),
    calendarName,
    simulatedNow: HIGH_LOAD_TEST_SIMULATED_NOW,
    createdAt: new Date().toISOString(),
    sourceFingerprint: source.fingerprint,
    lastStageLimit: 0
  });
  writeChunkedJson_(HIGH_LOAD_TEST_STATE_STORE, {
    status: 'ready',
    stageLimit: 0,
    eventIdsByKey: {},
    completedAt: ''
  });
  const report = buildHighLoadReadOnlyReport_(source, Date.now() - startedAt);
  saveHighLoadTestReport_('setup', report);
  showHighLoadTestReportAlert_('測試環境已建立', report);
  return report;
}

function runHighLoadReadOnlyTest() {
  assertHighLoadTestingEnabled_();
  const startedAt = Date.now();
  const source = loadHighLoadTestSource_();
  const report = buildHighLoadReadOnlyReport_(source, Date.now() - startedAt);
  saveHighLoadTestReport_('read_only', report);
  showHighLoadTestReportAlert_('唯讀資料檢查', report);
  return report;
}

function runHighLoadCourseOutlineReadTest() {
  assertHighLoadTestingEnabled_();
  const source = loadHighLoadTestSource_();
  const settings = buildHighLoadTestSettings_(source);
  const desiredEvents = filterCourseOutlineLookaheadEvents_(
    getHighLoadTestDesiredEvents_(source),
    highLoadTestBusinessNow_(),
    COURSE_OUTLINE_LOOKAHEAD_DAYS
  ).filter(event => event.type === 'course' && !event.isAllDay);
  const sourceSets = getRelevantCourseOutlineSourceSets_('高二', desiredEvents);
  if (!sourceSets.length) {
    throw new Error('模擬日期沒有可使用的高二課綱來源組。');
  }
  const startedAt = Date.now();
  const snapshot = collectCourseOutlineSnapshot_(
    settings,
    source,
    desiredEvents,
    sourceSets
  );
  writeChunkedJson_(HIGH_LOAD_TEST_OUTLINE_STORE, snapshot);
  const enrichedEvents = attachCourseOutlineLookup_(desiredEvents, snapshot.lookup || {});
  const report = {
    ok: true,
    courseEvents: desiredEvents.length,
    courseNames: uniqueExactStrings_(desiredEvents.map(event => event.originalTitle)).length,
    enrichedEvents: enrichedEvents.filter(event => event.outlineHash).length,
    classroomEvents: enrichedEvents.filter(event =>
      event.courseOutline && event.courseOutline.classroom
    ).length,
    spreadsheetCount: snapshot.diagnostics.spreadsheetCount,
    scannedSheetCount: snapshot.diagnostics.scannedSheetCount,
    matchedRecordCount: snapshot.diagnostics.matchedRecordCount,
    missingSheetNames: snapshot.diagnostics.missingSheetNames,
    ignoredCrossSchoolSheetNames: snapshot.diagnostics.ignoredCrossSchoolSheetNames,
    nearMatchSheetNames: snapshot.diagnostics.nearMatchSheetNames,
    elapsedMs: Date.now() - startedAt
  };
  saveHighLoadTestReport_('outline_read_30_days', report);
  SpreadsheetApp.getUi().alert(
    '30 天課綱讀取',
    '課程節次：' + report.courseEvents +
    '\\n課程名稱：' + report.courseNames +
    '\\n已套用課綱：' + report.enrichedEvents +
    '\\n含實體課程教室：' + report.classroomEvents +
    '\\n開啟課綱檔案：' + report.spreadsheetCount +
    '\\n實際讀取分頁：' + report.scannedSheetCount +
    '\\n成功配對資料：' + report.matchedRecordCount +
    '\\n找不到分頁：' +
      (report.missingSheetNames.length ? report.missingSheetNames.join('、') : '無') +
    '\\n已略過跨校課程：' +
      (report.ignoredCrossSchoolSheetNames.length ? report.ignoredCrossSchoolSheetNames.join('、') : '無') +
    '\\n疑似只差空格或全形字元：' +
      (report.nearMatchSheetNames.length
        ? report.nearMatchSheetNames.map(item => item.courseName + ' → ' + item.candidates.join('／')).join('、')
        : '無') +
    '\\n耗時：' + Math.round(report.elapsedMs / 100) / 10 + ' 秒' +
    '\\n\\n結果：完成。這份課綱資料將套用至後續 Calendar 寫入測試。' +
    '若「找不到分頁」有內容，請停止並回報；疑似名稱不會自動配對。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  return report;
}

function runHighLoadCalendarTest10() { return runHighLoadCalendarStage_(10); }
function runHighLoadCalendarTest25() { return runHighLoadCalendarStage_(25); }
function runHighLoadCalendarTest50() { return runHighLoadCalendarStage_(50); }
function runHighLoadCalendarTest100() { return runHighLoadCalendarStage_(100); }
function runHighLoadCalendarTest200() { return runHighLoadCalendarStage_(200); }
function runHighLoadCalendarTest422() { return runHighLoadCalendarStage_(422); }

function runHighLoadCalendarStage_(limit) {
  assertHighLoadTestingEnabled_();
  const ui = SpreadsheetApp.getUi();
  const config = loadHighLoadTestConfig_();
  const source = loadHighLoadTestSource_();
  const desired = getHighLoadTestDesiredEvents_(source).slice(0, Number(limit) || 0);
  const response = ui.alert(
    '測試 ' + desired.length + ' 筆 Calendar 寫入',
    '程式會先刪除上一階段的 [TEST] 測試日曆、建立全新的隔離日曆，再寫入 ' + desired.length +
    ' 筆測試事件。\\n\\n執行期間請勿關閉試算表；若 Google 顯示執行逾時，請停止後把畫面或錯誤訊息傳回。',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return { ok: false, cancelled: true };

  const calendar = replaceHighLoadTestCalendarForStage_(config, desired.length);
  const startedAt = Date.now();
  const testSettings = buildHighLoadTestSettings_(source);
  const testState = {
    status: 'running',
    stageLimit: desired.length,
    eventIdsByKey: {},
    startedAt: new Date().toISOString(),
    completedAt: ''
  };
  writeChunkedJson_(HIGH_LOAD_TEST_STATE_STORE, testState);

  try {
    const plan = buildSyncPlan_(
      {},
      desired,
      formatDateKey_(highLoadTestBusinessNow_())
    );
    const result = applySyncPlan_(
      calendar,
      {},
      plan,
      testSettings,
      { forceCalendarCheck: false, trackProgress: false }
    );
    Object.keys(result.state).forEach(key => {
      testState.eventIdsByKey[key] = result.state[key].calendarEventId;
    });
    testState.created = result.created;
    testState.updated = result.updated;
    testState.deleted = result.deleted;
    testState.unchanged = result.unchanged;
  } catch (error) {
    testState.status = 'failed';
    testState.error = userFacingError_(error);
    testState.elapsedMs = Date.now() - startedAt;
    writeChunkedJson_(HIGH_LOAD_TEST_STATE_STORE, testState);
    saveHighLoadTestReport_('calendar_' + desired.length, {
      ok: false,
      stageLimit: desired.length,
      created: '執行失敗，請直接查看測試日曆',
      elapsedMs: testState.elapsedMs,
      error: testState.error
    });
    throw error;
  }

  testState.status = 'completed';
  testState.created = Number(testState.created) || 0;
  testState.elapsedMs = Date.now() - startedAt;
  testState.completedAt = new Date().toISOString();
  writeChunkedJson_(HIGH_LOAD_TEST_STATE_STORE, testState);
  config.lastStageLimit = desired.length;
  writeChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, config);

  const report = {
    ok: testState.created === desired.length,
    stageLimit: desired.length,
    created: testState.created,
    elapsedMs: testState.elapsedMs,
    elapsedSeconds: Math.round(testState.elapsedMs / 100) / 10,
    nextAction: '請執行「驗證第二次同步」。'
  };
  saveHighLoadTestReport_('calendar_' + desired.length, report);
  showHighLoadTestReportAlert_('Calendar 寫入完成', report);
  return report;
}

function verifyHighLoadSecondSync() {
  assertHighLoadTestingEnabled_();
  const config = loadHighLoadTestConfig_();
  const source = loadHighLoadTestSource_();
  const calendar = getHighLoadTestCalendar_(config);
  const state = readChunkedJson_(HIGH_LOAD_TEST_STATE_STORE, null);
  if (!state || state.status !== 'completed' || !state.stageLimit || !state.eventIdsByKey) {
    throw new Error('請先完成一個 Calendar 寫入階段。');
  }

  const desired = getHighLoadTestDesiredEvents_(source).slice(0, state.stageLimit);
  const testSettings = buildHighLoadTestSettings_(source);
  const reconstructedState = {};
  desired.forEach(item => {
    const stateKey = makeOccurrenceKey_(item);
    const eventId = state.eventIdsByKey[stateKey];
    if (!eventId) return;
    reconstructedState[stateKey] = serializeStateItem_(
      item,
      eventId,
      makeEventSignature_(item, testSettings),
      testSettings
    );
  });
  const startedAt = Date.now();
  const plan = buildSyncPlan_(
    reconstructedState,
    desired,
    formatDateKey_(highLoadTestBusinessNow_())
  );
  const syncResult = applySyncPlan_(
    calendar,
    reconstructedState,
    plan,
    testSettings,
    { forceCalendarCheck: false, trackProgress: false }
  );
  let missing = 0;
  let invalid = 0;
  const seenIds = {};

  Object.keys(syncResult.state).forEach(stateKey => {
    const eventId = syncResult.state[stateKey].calendarEventId;
    if (seenIds[eventId]) {
      invalid += 1;
      return;
    }
    seenIds[eventId] = true;
    const event = calendar.getEventById(eventId);
    if (!event) {
      missing += 1;
      return;
    }
    const description = String(event.getDescription() || '');
    if (!isManagedEvent_(event, stateKey) ||
        description.indexOf(MANAGED_MARKER) !== -1 ||
        description.indexOf('同步識別碼：') !== -1) {
      invalid += 1;
    }
  });

  const rangeStart = new Date(desired[0].start);
  const rangeEnd = new Date(desired[desired.length - 1].end);
  rangeStart.setDate(rangeStart.getDate() - 1);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  const managedCalendarEvents = calendar.getEvents(rangeStart, rangeEnd)
    .filter(event => isManagedEvent_(event, null));
  const duplicateEvents = Math.max(0, managedCalendarEvents.length - desired.length);

  const report = {
    ok: missing === 0 &&
      invalid === 0 &&
      duplicateEvents === 0 &&
      syncResult.created === 0 &&
      syncResult.updated === 0 &&
      syncResult.deleted === 0 &&
      syncResult.unchanged === desired.length,
    stageLimit: state.stageLimit,
    expected: desired.length,
    found: Object.keys(syncResult.state).length - missing,
    missing,
    invalid,
    duplicateIds: Object.keys(syncResult.state).length - Object.keys(seenIds).length,
    duplicateEvents,
    created: syncResult.created,
    updated: syncResult.updated,
    deleted: syncResult.deleted,
    unchanged: syncResult.unchanged,
    elapsedMs: Date.now() - startedAt
  };
  state.eventIdsByKey = {};
  Object.keys(syncResult.state).forEach(key => {
    state.eventIdsByKey[key] = syncResult.state[key].calendarEventId;
  });
  writeChunkedJson_(HIGH_LOAD_TEST_STATE_STORE, state);
  saveHighLoadTestReport_('second_sync_' + state.stageLimit, report);
  showHighLoadTestReportAlert_('第二次同步驗證', report);
  return report;
}

function showHighLoadTestStatus() {
  assertHighLoadTestingEnabled_();
  const config = readChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, null);
  const job = loadSyncJob_();
  const progress = readChunkedJson_(SYNC_PROGRESS_STORE, null);
  const settings = loadSettings_();
  const status = loadStatus_();
  const eventCount = Object.keys(loadSyncState_()).length;
  const reports = readChunkedJson_(HIGH_LOAD_TEST_REPORT_STORE, []);
  if (!config) {
    SpreadsheetApp.getUi().alert(
      '高負載測試',
      '尚未執行「模擬控制臺首次同步」。',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return { ready: false };
  }
  const latest = reports.length ? reports[reports.length - 1] : null;
  const active = isActiveSyncJob_(job);
  const state = active
    ? job.status
    : (settings.setupComplete ? 'complete' : progress && progress.state || 'ready');
  const result = {
    ready: true,
    calendarName: config.calendarName,
    simulatedNow: config.simulatedNow,
    state,
    setupComplete: Boolean(settings.setupComplete),
    eventCount,
    processed: active ? Number(job.processedOperations) || 0 : eventCount,
    total: active
      ? Math.max(Number(job.initialOperationCount) || 0, Number(job.desiredCount) || 0)
      : HIGH_LOAD_TEST_EXPECTED.totalFuture,
    remaining: active
      ? Math.max(0, Number(job.initialOperationCount) - Number(job.processedOperations))
      : Math.max(0, HIGH_LOAD_TEST_EXPECTED.totalFuture - eventCount),
    latestReport: latest
  };
  SpreadsheetApp.getUi().alert(
    '首次同步進度',
    '測試日曆：' + config.calendarName +
    '\\n模擬日期：2026/02/23' +
    '\\n目前狀態：' + result.state +
    '\\n已保存事件：' + result.eventCount + ' / ' + HIGH_LOAD_TEST_EXPECTED.totalFuture +
    '\\n已處理操作：' + result.processed + ' / ' + result.total +
    '\\n剩餘操作：約 ' + result.remaining +
    '\\n控制臺首次設定：' + (result.setupComplete ? '完成' : '尚在背景同步') +
    (status && status.message ? '\\n同步訊息：' + status.message : '') +
    (latest && latest.report
      ? '\\n30 天課綱：' + latest.report.outlineEvents +
        ' / ' + latest.report.outlineCandidates +
        ' 筆；含實體課程教室：' + latest.report.classroomEvents + ' 筆'
      : ''),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  return result;
}

function openHighLoadTestCalendar() {
  assertHighLoadTestingEnabled_();
  const config = loadHighLoadTestConfig_();
  getHighLoadTestCalendar_(config);
  const url = 'https://calendar.google.com/calendar/u/0/r?cid=' +
    encodeURIComponent(config.calendarId);
  const html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.6 sans-serif;padding:20px">' +
    '<p>點下方按鈕開啟目前的 [TEST] 測試日曆。</p>' +
    '<p><a href="' + url + '" target="_blank" rel="noopener" ' +
    'style="display:inline-block;padding:10px 14px;background:#007c59;color:white;text-decoration:none">' +
    '開啟測試日曆</a></p></div>'
  ).setWidth(360).setHeight(170);
  SpreadsheetApp.getUi().showModalDialog(html, '高負載測試');
}

function cleanupHighLoadTestEnvironment() {
  assertHighLoadTestingEnabled_();
  if (isActiveSyncJob_(loadSyncJob_())) {
    throw new Error('首次同步仍在背景執行，請等待完成後再清除測試環境。');
  }
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '清除高負載測試環境',
    '將刪除 [TEST] 測試日曆及本工具保存的測試資料。正式專用日曆不會被操作。是否繼續？',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return { ok: false, cancelled: true };
  const result = cleanupHighLoadTestEnvironmentCore_(true);
  ui.alert('高負載測試', result.message, ui.ButtonSet.OK);
  return result;
}

function cleanupHighLoadTestEnvironmentCore_(deleteCalendar) {
  const config = readChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, null);
  let calendarDeleted = false;
  if (deleteCalendar && config && config.calendarId) {
    const calendar = CalendarApp.getCalendarById(config.calendarId);
    if (calendar) {
      assertHighLoadTestCalendar_(calendar);
      calendar.deleteCalendar();
      calendarDeleted = true;
    }
  }
  clearChunkedStore_(HIGH_LOAD_TEST_CONFIG_STORE);
  clearChunkedStore_(HIGH_LOAD_TEST_SOURCE_STORE);
  clearChunkedStore_(HIGH_LOAD_TEST_OUTLINE_STORE);
  clearChunkedStore_(HIGH_LOAD_TEST_STATE_STORE);
  clearChunkedStore_(HIGH_LOAD_TEST_REPORT_STORE);
  clearHighLoadFirstSyncStores_();
  return {
    ok: true,
    calendarDeleted,
    message: calendarDeleted
      ? '測試日曆與測試資料已清除。'
      : '測試資料已清除；沒有需要刪除的測試日曆。'
  };
}

function clearHighLoadFirstSyncStores_() {
  deleteAutoSyncTriggersUnlocked_();
  deleteTriggersByHandlers_([
    SYNC_CONTINUATION_HANDLER,
    SYNC_WATCHDOG_HANDLER,
    TERM_TRANSITION_NOTICE_HANDLER
  ]);
  [
    SETTINGS_STORE,
    SYNC_STATE_STORE,
    SYNC_JOB_STORE,
    STATUS_STORE,
    SYNC_PROGRESS_STORE,
    NOTICE_STORE,
    NOTIFICATION_QUEUE_STORE,
    COURSE_OUTLINE_STATE_STORE
  ].forEach(clearChunkedStore_);
  const properties = PropertiesService.getScriptProperties();
  const outlineVersion = properties.getProperty(COURSE_OUTLINE_ACTIVE_VERSION_PROPERTY) || '';
  if (outlineVersion) clearChunkedStore_(courseOutlineSnapshotStoreKey_(outlineVersion));
  properties.deleteProperty(COURSE_OUTLINE_ACTIVE_VERSION_PROPERTY);
  cleanupInactiveCourseOutlineSnapshotStores_('');
}

function buildHighLoadReadOnlyReport_(source, elapsedMs) {
  const events = getHighLoadTestDesiredEvents_(source);
  const courseEvents = events.filter(event => event.type === 'course' && !event.isAllDay);
  const activityEvents = events.filter(event => event.type === 'activity');
  const outlineEvents = filterCourseOutlineLookaheadEvents_(
    courseEvents,
    highLoadTestBusinessNow_(),
    COURSE_OUTLINE_LOOKAHEAD_DAYS
  );
  const outlineCourseNames = uniqueExactStrings_(outlineEvents.map(event => event.originalTitle));
  const actual = {
    totalFuture: events.length,
    courseFuture: courseEvents.length,
    activityFuture: activityEvents.length,
    outlineWindow: outlineEvents.length,
    outlineCourseNames: outlineCourseNames.length,
    firstDateKey: source.firstDateKey || (events.length ? events[0].dateKey : ''),
    lastDateKey: source.lastDateKey || (events.length ? events[events.length - 1].dateKey : '')
  };
  const mismatches = Object.keys(HIGH_LOAD_TEST_EXPECTED).filter(key =>
    String(actual[key]) !== String(HIGH_LOAD_TEST_EXPECTED[key])
  );
  return {
    ok: mismatches.length === 0,
    simulatedNow: HIGH_LOAD_TEST_SIMULATED_NOW,
    expected: HIGH_LOAD_TEST_EXPECTED,
    actual,
    mismatches,
    elapsedMs: Number(elapsedMs) || 0
  };
}

function showHighLoadTestReportAlert_(title, report) {
  const lines = [];
  if (report.actual) {
    lines.push(
      '未來行程：' + report.actual.totalFuture + '（預期 422）',
      '課程：' + report.actual.courseFuture + '（預期 380）',
      '活動：' + report.actual.activityFuture + '（預期 42）',
      '30 天課綱：' + report.actual.outlineWindow + '（預期 79）',
      '30 天課程名稱：' + report.actual.outlineCourseNames + '（預期 20）',
      '日期範圍：' + report.actual.firstDateKey + '～' + report.actual.lastDateKey
    );
  } else {
    Object.keys(report).forEach(key => {
      if (typeof report[key] !== 'object') lines.push(key + '：' + report[key]);
    });
  }
  lines.push('', report.ok ? '結果：通過' : '結果：未通過，請停止下一階段並保存畫面。');
  SpreadsheetApp.getUi().alert(title, lines.join('\\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

function saveHighLoadTestReport_(scenario, report) {
  const reports = readChunkedJson_(HIGH_LOAD_TEST_REPORT_STORE, []);
  reports.push({
    scenario,
    createdAt: new Date().toISOString(),
    report
  });
  while (reports.length > 30) reports.shift();
  writeChunkedJson_(HIGH_LOAD_TEST_REPORT_STORE, reports);
}

function loadHighLoadTestConfig_() {
  const config = readChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, null);
  if (!config || !config.calendarId) {
    throw new Error('尚未建立測試環境。請先執行「建立／重設測試環境」。');
  }
  return config;
}

function loadHighLoadTestSource_() {
  const source = readChunkedJson_(HIGH_LOAD_TEST_SOURCE_STORE, null);
  if (!source || !Array.isArray(source.events)) {
    throw new Error('找不到固定測試資料。請重新建立測試環境。');
  }
  return Object.assign({}, source, {
    events: source.events.map(hydrateHighLoadTestEvent_)
  });
}

function getHighLoadTestCalendar_(config) {
  const calendar = CalendarApp.getCalendarById(config.calendarId);
  if (!calendar) throw new Error('找不到測試日曆，請重新建立測試環境。');
  assertHighLoadTestCalendar_(calendar);
  return calendar;
}

function replaceHighLoadTestCalendarForStage_(config, stageLimit) {
  const current = CalendarApp.getCalendarById(config.calendarId);
  if (current) {
    assertHighLoadTestCalendar_(current);
    current.deleteCalendar();
  }
  const calendarName = HIGH_LOAD_TEST_CALENDAR_PREFIX + ' 114-2 高負載 ' +
    stageLimit + '筆 ' + Utilities.formatDate(new Date(), TIMEZONE, 'MMdd-HHmm');
  const calendar = CalendarApp.createCalendar(calendarName, {
    description: 'T-SCHOOL 高負載測試專用，可安全刪除。',
    timeZone: TIMEZONE,
    selected: true
  });
  assertHighLoadTestCalendar_(calendar);
  config.calendarId = calendar.getId();
  config.calendarName = calendarName;
  config.lastStageLimit = stageLimit;
  writeChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, config);
  writeChunkedJson_(HIGH_LOAD_TEST_STATE_STORE, {
    status: 'ready',
    stageLimit: 0,
    eventIdsByKey: {},
    completedAt: ''
  });
  return calendar;
}

function assertHighLoadTestCalendar_(calendar) {
  if (!calendar || String(calendar.getName() || '').indexOf(HIGH_LOAD_TEST_CALENDAR_PREFIX) !== 0) {
    throw new Error('安全檢查失敗：測試只能操作名稱以 [TEST] 開頭的日曆。');
  }
  if (calendar.getId() === CalendarApp.getDefaultCalendar().getId()) {
    throw new Error('安全檢查失敗：測試不得操作主要日曆。');
  }
  if (typeof calendar.isOwnedByMe === 'function' && !calendar.isOwnedByMe()) {
    throw new Error('安全檢查失敗：測試只能操作自己擁有的日曆。');
  }
  return calendar;
}

function assertHighLoadTestingEnabled_() {
  if (!HIGH_LOAD_TESTING_ENABLED) {
    throw new Error('這份 Code.gs 未啟用高負載測試功能。');
  }
}

function highLoadTestBusinessNow_() {
  return new Date(HIGH_LOAD_TEST_SIMULATED_NOW);
}

function serializeHighLoadTestEvent_(event) {
  const copy = Object.assign({}, event);
  copy.start = event.start instanceof Date ? event.start.toISOString() : event.start;
  copy.end = event.end instanceof Date ? event.end.toISOString() : event.end;
  return copy;
}

function hydrateHighLoadTestEvent_(event) {
  const copy = Object.assign({}, event);
  copy.start = new Date(event.start);
  copy.end = new Date(event.end);
  return copy;
}

function getHighLoadTestDesiredEvents_(source) {
  const todayKey = formatDateKey_(highLoadTestBusinessNow_());
  const events = source.events
    .filter(event => event.dateKey >= todayKey)
    .sort((left, right) => {
      const timeDifference = left.start.getTime() - right.start.getTime();
      return timeDifference || String(left.originalTitle).localeCompare(String(right.originalTitle), 'zh-Hant');
    });
  return attachHighLoadTestCourseOutlines_(events, source);
}

function attachHighLoadTestCourseOutlines_(events, source) {
  const snapshot = readChunkedJson_(HIGH_LOAD_TEST_OUTLINE_STORE, null);
  if (!snapshot ||
      snapshot.schemaVersion !== COURSE_OUTLINE_CACHE_SCHEMA_VERSION ||
      snapshot.gradeName !== '高二' ||
      snapshot.termKey !== (source && source.termKey || '')) {
    return events;
  }
  return attachCourseOutlineLookup_(events, snapshot.lookup || {});
}

function buildHighLoadTestSettings_(source) {
  return {
    gradeName: '高二',
    selectedCourses: source.catalog.courses.map(item => item.title),
    includeActivities: true,
    excludedActivities: [],
    pendingTitles: [],
    excludedTitles: [],
    descriptionPreset: 'standard',
    customDescription: '',
    reminderMode: 'none',
    reminderMinutes: 10
  };
}

`;
  }

  window.buildAppsScriptCode = function buildAppsScriptCode(settings) {
    const requestedNotifyHour = normalizeHour(settings.notifySyncHour, 5);
    const autoSyncHours = normalizeHourArray(
      settings.autoSyncHours,
      requestedNotifyHour
    );
    const notifyHour = autoSyncHours[autoSyncHours.length - 1];
    const gradeName = settings.gradeName || '高一';
    const defaultCalendarName = `${gradeName}行程｜T-SCHOOL Schedule Sync`;
    const initialSettings = {
      schemaVersion: 4,
      appVersion: settings.appVersion || '2.0.0-mvp',
      setupComplete: false,
      gradeName,
      calendarId: '',
      calendarName: settings.calendarName || defaultCalendarName,
      notificationEmail: settings.notificationEmail || '',
      selectedCourses: settings.selectedCourses || [],
      includeActivities: settings.includeActivities !== false,
      excludedActivities: settings.excludedActivities || [],
      autoSyncEnabled: true,
      autoSyncHours,
      notifySyncHour: notifyHour,
      notificationPreset: 'standard',
      customNotification: '',
      descriptionPreset: settings.descriptionPreset === 'custom' ? 'custom' : 'standard',
      customDescription: settings.customDescription || STANDARD_CUSTOM_DESCRIPTION_TEMPLATE,
      reminderMode: settings.reminderMode || 'none',
      reminderMinutes: Number(settings.reminderMinutes) || 10,
      knownTitles: settings.initialKnownTitles || [],
      pendingTitles: [],
      excludedTitles: [],
      termKey: settings.initialTermKey || '',
      sourceFingerprint: settings.initialSourceFingerprint || '',
      pendingTermKey: '',
      pausedReason: '',
      autoSyncEnabledBeforeTermTransition: null,
      termTransitionNoticeAttempts: 0,
      termTransitionNoticeSentAt: '',
      termTransitionNoticeLastError: '',
      calendarMigrationFromId: ''
    };
    const sidebarHtml = window.TSCHOOL_SIDEBAR_HTML || '';
    const highLoadTestingEnabled = settings.highLoadTestingEnabled === true;
    const highLoadTestCode = highLoadTestingEnabled
      ? buildHighLoadTestAppsScriptCode()
      : '';

    return `const APP_VERSION = ${formatString(settings.appVersion || '2.0.0-mvp')};
const SETTINGS_SCHEMA_VERSION = 4;
const TIMEZONE = 'Asia/Taipei';
const SOURCE_API_URL = ${formatString(settings.sourceApiUrl)};
const EMAIL_TEMPLATE_MANIFEST_URL = 'https://artemas-hsieh.github.io/t-school-schedule-sync/notification-email-templates.json';
const EMAIL_TEMPLATE_CACHE_KEY = 'TSCHOOL_EMAIL_TEMPLATE_MANIFEST_V1';
const EMAIL_TEMPLATE_CACHE_SECONDS = 60 * 60;
const EMAIL_TEMPLATE_MAX_BYTES = 100 * 1024;
const SETTINGS_STORE = 'TSCHOOL_SETTINGS';
const SYNC_STATE_STORE = 'TSCHOOL_SYNC_STATE';
const SYNC_JOB_STORE = 'TSCHOOL_SYNC_JOB';
const STATUS_STORE = 'TSCHOOL_STATUS';
const SYNC_PROGRESS_STORE = 'TSCHOOL_SYNC_PROGRESS';
const NOTICE_STORE = 'TSCHOOL_NOTICE_STATE';
const NOTIFICATION_QUEUE_STORE = 'TSCHOOL_NOTIFICATION_QUEUE';
const COURSE_OUTLINE_INDEX_CACHE_STORE = 'TSCHOOL_COURSE_OUTLINE_INDEX_CACHE';
const SYNC_JOB_SCHEMA_VERSION = 1;
const SYNC_CONTINUATION_HANDLER = 'continueScheduleSync';
const SYNC_WATCHDOG_HANDLER = 'watchScheduleSync';
const SYNC_INITIAL_SETUP_BATCH_OPERATIONS = 40;
const SYNC_BATCH_MAX_CALENDAR_OPERATIONS = 80;
const SYNC_BATCH_SOFT_LIMIT_MS = 150 * 1000;
const SYNC_CONTINUATION_DELAY_MS = 60 * 1000;
const SYNC_RETRY_DELAY_MS = 2 * 60 * 1000;
const SYNC_WATCHDOG_DELAY_MS = 5 * 60 * 1000;
const SYNC_RUNNING_STALE_MS = 4 * 60 * 1000;
const SYNC_CHANGE_DETAIL_LIMIT = 100;
const SYNC_STATE_PAST_RETENTION_DAYS = 120;
const SCRIPT_PROPERTY_CHUNK_SAFE_BYTES = 7500;
const SCRIPT_PROPERTIES_SAFE_BUDGET_BYTES = 430 * 1024;
const COURSE_OUTLINE_STATE_STORE = 'TSCHOOL_COURSE_OUTLINE_STATE';
const COURSE_OUTLINE_SNAPSHOT_PREFIX = 'TSCHOOL_COURSE_OUTLINE_SNAPSHOT_';
const COURSE_OUTLINE_ACTIVE_VERSION_PROPERTY = 'TSCHOOL_COURSE_OUTLINE_ACTIVE_VERSION';
const COURSE_OUTLINE_CACHE_SCHEMA_VERSION = 1;
const COURSE_OUTLINE_HEADER_SCAN_LIMIT = 100;
const COURSE_OUTLINE_LOOKAHEAD_DAYS = 30;
const COURSE_OUTLINE_RETRY_DELAY_MS = 30 * 60 * 1000;
const COURSE_OUTLINE_WATCHDOG_DELAY_MS = 8 * 60 * 1000;
const COURSE_OUTLINE_RUNNING_STALE_MS = 7 * 60 * 1000;
const COURSE_OUTLINE_DAILY_HANDLER = 'refreshCourseOutlinesDaily';
const COURSE_OUTLINE_ONCE_HANDLER = 'refreshCourseOutlinesOnce';
const COURSE_OUTLINE_RETRY_HANDLER = 'retryCourseOutlineRefresh';
const COURSE_OUTLINE_WATCHDOG_HANDLER = 'watchCourseOutlineRefresh';
const COURSE_OUTLINE_APPLY_HANDLER = 'applyCourseOutlineSnapshotToCalendar';
const TERM_TRANSITION_NOTICE_HANDLER = 'retryTermTransitionNotice';
const TERM_TRANSITION_NOTICE_RETRY_DELAY_MS = 30 * 60 * 1000;
const TERM_TRANSITION_NOTICE_MAX_ATTEMPTS = 2;
const COURSE_OUTLINE_INDEX_SPREADSHEET_ID = '1zS6TdGMTPhz2Ja8bRs2AKAg0mRsBfXET9nmXi9wSBjY';
const COURSE_OUTLINE_INDEX_SHEET_NAME = '課綱來源';
const COURSE_OUTLINE_INDEX_HEADER_SCAN_LIMIT = 20;
const EVENT_METADATA_VERSION = 2;
const MANAGED_EVENT_TAG_KEY = 'tschool_managed';
const SYNC_ID_EVENT_TAG_KEY = 'tschool_sync_id';
const METADATA_VERSION_EVENT_TAG_KEY = 'tschool_meta_version';
const MANAGED_EVENT_TAG_VALUE = '1';
const STANDARD_DESCRIPTION_TEMPLATE = ${formatString(STANDARD_CUSTOM_DESCRIPTION_TEMPLATE)};
const VISIBLE_DESCRIPTION_FOOTER = '[T-SCHOOL Schedule Sync]';
const COURSE_OUTLINE_DISCLAIMER = '＊部分資訊來自課綱，請以教師最新說明為主';
// 只供辨識既有事件；新版不再把技術標記寫入使用者可見的說明欄。
const MANAGED_MARKER = '[T-SCHOOL-SCHEDULE-SYNC]';
const DESCRIPTION_MARKER = '[T-SCHOOL 行程同步]';
const LEGACY_DESCRIPTION_MARKER = '[T-SCHOOL 課表同步]';
const ALLOW_QUICK_DELETE_ALL = false;
const HIGH_LOAD_TESTING_ENABLED = ${highLoadTestingEnabled ? 'true' : 'false'};
const DEFAULT_SETTINGS = ${formatObject(initialSettings)};
const SETTINGS_SIDEBAR_HTML = ${formatLongString(sidebarHtml)};
const GRADE_API_NAMES = { '高一': '一年級', '高二': '二年級', '高三': '三年級' };
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const MANUAL_MERGE_EXCEPTIONS = {};
// 中央索引暫時不可讀且沒有最後成功快取時使用，避免既有 114-2 課綱立即失效。
const COURSE_OUTLINE_SOURCE_SETS_BY_GRADE = {
  '高一': [],
  '高二': [
    {
      key: '114-2-high2',
      label: '114-2 高二',
      validFrom: '2026-01-01',
      validUntil: '2026-08-31',
      spreadsheetIds: [
        '1DNgZbfEimK17It55NxoEwoj7340ebmyUpvbcKFMXQnQ',
        '1svJvrtitw5KB3AcI5rOiO1XP-XxSPMFeD4Ku4eVIGS4',
        '1H3mapcy0OtYA1LXA9v2beNYoxCbDDF5IJVXK7y4o0T0',
        '1p_2fJjvwpl_hOgh_vo6h_2-zrQ0c81-nF464rRI5VzQ'
      ]
    }
  ],
  '高三': []
};
let courseOutlineSourceIndexRuntimeCache_ = null;
const ACTIVITY_PATTERNS = [
  /全校(?:性)?活動/,
  /^高[一二三](?:導入期|全校活動)$/,
  /^休業式(?:_高[一二三])?$/,
  /^勞動節$/,
  /模擬考/,
  /校際交流/,
  /教育局.*(?:協作坊|輔導團)/,
  /^全天(?:吉林|弘道)$/,
  /防災|避難演練|畢業典禮|畢展布展/
];

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui
    .createMenu('行程同步')
    .addItem('開啟設定', 'showSettingsSidebar')
    .addSeparator()
    .addItem('立即同步', 'syncMyScheduleToCalendar')
    .addItem('暫停／恢復自動同步', 'toggleAutoSyncFromMenu')
    .addItem('查看同步狀態', 'showSyncStatus')
    .addItem('強制修復', 'forceFullSyncMyScheduleToCalendar')
    .addSeparator();

  if (HIGH_LOAD_TESTING_ENABLED) {
    menu.addSubMenu(
      ui.createMenu('高負載測試')
        .addItem('操作說明', 'showHighLoadTestGuide')
        .addItem('模擬控制臺首次同步', 'runHighLoadFirstSyncTest')
        .addSeparator()
        .addItem('查看首次同步進度', 'showHighLoadTestStatus')
        .addItem('開啟測試日曆', 'openHighLoadTestCalendar')
        .addItem('清除測試環境', 'cleanupHighLoadTestEnvironment')
    );
    menu.addSeparator();
  }

  menu
    .addItem('移除受管理事件', 'confirmQuickDeleteSyncedEvents')
    .addToUi();
}

function showSettingsSidebar() {
  const output = HtmlService.createHtmlOutput(SETTINGS_SIDEBAR_HTML)
    .setTitle('T-SCHOOL 行程同步');
  SpreadsheetApp.getUi().showSidebar(output);
}

function getSettingsUiData() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('背景同步正在保存行程，請稍後重新開啟控制臺。');
  }
  let settings;
  let source;
  try {
    settings = loadSettings_();
    source = loadSourceContext_(settings.gradeName);
    settings = applyTermTransitionIfNeeded_(settings, source, true);
  } finally {
    lock.releaseLock();
  }
  return buildUiData_(settings, source);
}

function getSyncProgressForUi(jobId) {
  const progress = readChunkedJson_(SYNC_PROGRESS_STORE, {
    state: 'idle',
    percent: 0,
    message: '等待開始同步'
  });
  const job = loadSyncJob_();
  if (job && isActiveSyncJob_(job) &&
      (!progress.jobId ||
       progress.jobId !== job.jobId ||
       progress.state === 'complete' ||
       progress.state === 'error')) {
    const total = Math.max(Number(job.initialOperationCount) || 0, Number(job.processedOperations) || 0);
    const processed = Math.min(total, Number(job.processedOperations) || 0);
    return {
      state: job.status === 'retry_pending' ? 'retry_pending' :
        (job.status === 'queued' ? 'queued' : 'running'),
      percent: total ? Math.min(95, Math.round(40 + processed / total * 55)) : 40,
      jobId: job.jobId,
      processed,
      total,
      remaining: Math.max(0, total - processed),
      nextAttemptAt: job.nextAttemptAt || '',
      message: job.status === 'retry_pending'
        ? '已保存進度，正在等待 Google 服務重試。'
        : (job.status === 'queued'
          ? '本批已保存，正在等待下一批背景續跑。'
          : '正在分批同步行程。'),
      updatedAt: job.updatedAt
    };
  }
  if (jobId && job && job.jobId !== jobId && isActiveSyncJob_(job)) {
    return Object.assign({}, progress, {
      jobId: job.jobId,
      message: '已有較新的同步工作，正在改用最新進度。'
    });
  }
  return progress;
}

function getSourceCatalogForUi(gradeName) {
  const cleanGrade = sanitizeGrade_(gradeName);
  return buildSourceUiModel_(loadSourceContext_(cleanGrade), cleanGrade);
}

function saveSettingsFromUi(input) {
  const result = saveSettingsCore_(input);
  scheduleCourseOutlineRefreshIfNeeded_(result.settings, result.source);
  return {
    message: '設定已儲存',
    uiData: buildUiData_(result.settings, result.source)
  };
}

function previewSettingsImpactFromUi(input) {
  const previous = loadSettings_();
  const source = loadSourceContext_(sanitizeGrade_(input && input.gradeName));
  const next = sanitizeSettingsInput_(input, previous, source);
  const businessNow = scheduleBusinessNow_();
  const todayKey = formatDateKey_(businessNow);
  const oldState = pruneExpiredSyncState_(loadSyncState_(), businessNow);
  const desiredEvents = dedupeAndValidateDesiredEvents_(
    enrichEventsWithCourseOutlines_(source.events
      .filter(event => event.dateKey >= todayKey)
      .filter(event => shouldIncludeEvent_(event, next)), next, source)
  );
  const calendarChanged = Boolean(
    previous.calendarId && previous.calendarId !== next.calendarId
  );
  const plan = buildSyncPlan_(oldState, desiredEvents, todayKey);
  const approvalToken = makeSyncApprovalToken_(next, source, desiredEvents, plan);

  if (calendarChanged) {
    return {
      calendarChanged: true,
      created: desiredEvents.length,
      updated: 0,
      deleted: Object.keys(oldState).filter(key => oldState[key].dateKey >= todayKey).length,
      unchanged: 0,
      approvalToken
    };
  }

  const changedExact = plan.exact.filter(pair =>
    !storedEventSignatureMatches_(pair.oldItem, pair.newItem, next)
  ).length;
  return {
    calendarChanged: false,
    created: plan.additions.length,
    updated: plan.moved.length + changedExact,
    deleted: plan.deletions.length,
    unchanged: plan.exact.length - changedExact,
    approvalToken
  };
}

function saveSettingsAndSyncFromUi(input) {
  const result = saveSettingsCore_(input);
  const firstSetup = !result.previousSetupComplete;
  try {
    const syncResult = syncSchedule_({
      reason: firstSetup ? 'setup' : 'settings',
      firstSetup,
      forceCalendarCheck: true,
      notifyOnSuccess: false,
      trackProgress: true,
      approvalToken: String(input && input.syncApprovalToken || '')
    });
    return buildSyncUiResponse_(
      syncResult,
      firstSetup ? '第一次同步完成，請檢查專用日曆' : '設定已儲存並同步'
    );
  } catch (error) {
    notifySyncFailureUnlessActionRequired_(error);
    throw error;
  }
}

function runSyncFromUi() {
  try {
    const result = syncSchedule_({ reason: 'manual', trackProgress: true });
    return buildSyncUiResponse_(result, formatSyncResultMessage_(result));
  } catch (error) {
    notifySyncFailureUnlessActionRequired_(error);
    throw error;
  }
}

function forceRepairFromUi() {
  try {
    const result = syncSchedule_({ reason: 'repair', forceCalendarCheck: true, trackProgress: true });
    return buildSyncUiResponse_(result, '修復完成：' + formatSyncResultMessage_(result));
  } catch (error) {
    notifySyncFailureUnlessActionRequired_(error);
    throw error;
  }
}

function buildSyncUiResponse_(result, completeMessage) {
  const pending = Boolean(result && result.pending);
  return {
    pending,
    jobId: result && result.jobId || '',
    message: pending
      ? (result.retrying
        ? 'Google 服務暫時無法完成，已保存進度並安排重試。'
        : '第一批已安全保存，剩餘行程會在背景分批完成；現在可以關閉側欄。')
      : completeMessage,
    uiData: getSettingsUiData()
  };
}

function createDedicatedCalendarForUi(input) {
  const settings = loadSettings_();
  const gradeName = sanitizeGrade_(input && input.gradeName || settings.gradeName);
  const calendarName = sanitizeCalendarName_(input && input.calendarName, gradeName);
  const calendar = CalendarApp.createCalendar(calendarName);
  return {
    message: '已建立專用日曆',
    calendarId: calendar.getId(),
    calendarName,
    calendars: listOwnedCalendars_()
  };
}

function confirmPendingTitleFromUi(title) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('背景同步正在保存行程，請稍後再試。');
  try {
    const settings = loadSettings_();
    const normalized = normalizeTitle_(title);
    settings.pendingTitles = settings.pendingTitles.filter(item => normalizeTitle_(item) !== normalized);

    if (!settings.selectedCourses.some(item => normalizeTitle_(item) === normalized)) {
      settings.selectedCourses.push(String(title));
    }

    settings.excludedTitles = settings.excludedTitles.filter(item => normalizeTitle_(item) !== normalized);
    saveSettings_(settings);
  } finally {
    lock.releaseLock();
  }
  return { message: '已保留「' + title + '」', uiData: getSettingsUiData() };
}

function rejectPendingTitleFromUi(title) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('背景同步正在保存行程，請稍後再試。');
  try {
    const settings = loadSettings_();
    const normalized = normalizeTitle_(title);
    settings.pendingTitles = settings.pendingTitles.filter(item => normalizeTitle_(item) !== normalized);
    settings.selectedCourses = settings.selectedCourses.filter(item => normalizeTitle_(item) !== normalized);

    if (!settings.excludedTitles.some(item => normalizeTitle_(item) === normalized)) {
      settings.excludedTitles.push(String(title));
    }

    saveSettings_(settings);
  } finally {
    lock.releaseLock();
  }
  return { message: '已排除「' + title + '」，下次同步會移除同名活動', uiData: getSettingsUiData() };
}

function saveSettingsCore_(input) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('背景同步正在保存行程，暫時無法改設定。請稍後再試。');
  }
  try {
    const oldSettings = loadSettings_();
    const source = loadSourceContext_(sanitizeGrade_(input && input.gradeName));
    const next = sanitizeSettingsInput_(input, oldSettings, source);

    cancelActiveSyncJob_('設定已更新，將依新設定重新規劃。');
    saveSettings_(next);
    if (!next.pendingTermKey) {
      deleteTriggersByHandlers_([TERM_TRANSITION_NOTICE_HANDLER]);
    }
    if (next.setupComplete) refreshAutoSyncTriggers_(next);
    else deleteAutoSyncTriggersUnlocked_();
    return {
      settings: next,
      source,
      previousSetupComplete: Boolean(oldSettings.setupComplete)
    };
  } finally {
    lock.releaseLock();
  }
}

function sanitizeSettingsInput_(input, previous, source) {
  const value = input || {};
  const gradeName = sanitizeGrade_(value.gradeName);
  const gradeChanged = previous.gradeName !== gradeName;
  const selectedCourses = uniqueStrings_(Array.isArray(value.selectedCourses) ? value.selectedCourses : []);
  const excludedActivities = uniqueStrings_(Array.isArray(value.excludedActivities) ? value.excludedActivities : []);
  const sourceTitles = source.catalog.all.map(item => item.title);
  const sourceKeys = sourceTitles.map(normalizeTitle_);
  const sourceTitleByKey = {};
  sourceTitles.forEach(title => {
    const key = normalizeTitle_(title);
    if (!sourceTitleByKey[key]) sourceTitleByKey[key] = title;
  });
  const cleanSelected = uniqueStrings_(selectedCourses
    .map(title => sourceTitleByKey[normalizeTitle_(title)] || '')
    .filter(Boolean));
  const activityKeys = source.catalog.activities.map(item => normalizeTitle_(item.title));
  const cleanExcludedActivities = uniqueStrings_(excludedActivities
    .filter(title => activityKeys.indexOf(normalizeTitle_(title)) !== -1)
    .map(title => sourceTitleByKey[normalizeTitle_(title)] || title));
  const notificationEmail = String(value.notificationEmail || '').trim();

  if (notificationEmail) {
    assertSingleEmail_(notificationEmail);
  }

  if (previous.pendingTermKey && cleanSelected.length === 0) {
    throw new Error('新學期必須重新選擇至少一門課程後才能儲存。');
  }

  const calendarId = String(value.calendarId || '').trim();
  const calendarName = sanitizeCalendarName_(value.calendarName || previous.calendarName, gradeName);
  const migrationPending = Boolean(
    previous.calendarMigrationFromId &&
    previous.calendarMigrationFromId !== previous.calendarId
  );

  if (migrationPending && calendarId !== previous.calendarId) {
    throw new Error(
      '上一次專用日曆搬移尚未清理完成，現在不能再次更換日曆。' +
      '請先完成目前同步，再重新選擇新的日曆。'
    );
  }

  if (calendarId) {
    assertDedicatedCalendar_(calendarId);
  }

  const requestedNotifyHour = normalizeHour_(value.notifySyncHour, 5);
  const hours = normalizeHourArray_(
    (Array.isArray(value.autoSyncHours) ? value.autoSyncHours : [])
      .concat([requestedNotifyHour]),
    requestedNotifyHour
  );
  const notifyHour = Math.max.apply(null, hours);
  const reminderMode = ['none', 'popup', 'email'].indexOf(value.reminderMode) !== -1
    ? value.reminderMode
    : 'none';
  const descriptionPreset = value.descriptionPreset === 'custom' ? 'custom' : 'standard';
  const customDescription = descriptionPreset === 'custom'
    ? String(
      value.customDescription ||
      previous.customDescription ||
      STANDARD_DESCRIPTION_TEMPLATE
    ).slice(0, 4000)
    : String(
      previous.customDescription ||
      value.customDescription ||
      STANDARD_DESCRIPTION_TEMPLATE
    ).slice(0, 4000);
  let calendarMigrationFromId = previous.calendarMigrationFromId || '';
  if (previous.calendarId && previous.calendarId !== calendarId) {
    calendarMigrationFromId = previous.calendarId;
  }

  return Object.assign({}, previous, {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    gradeName,
    selectedCourses: cleanSelected,
    includeActivities: value.includeActivities !== false,
    excludedActivities: cleanExcludedActivities,
    calendarId,
    calendarName,
    notificationEmail,
    autoSyncEnabled: value.autoSyncEnabled !== false,
    autoSyncHours: hours,
    notifySyncHour: notifyHour,
    notificationPreset: 'standard',
    customNotification: '',
    descriptionPreset,
    customDescription,
    reminderMode,
    reminderMinutes: sanitizeReminderMinutes_(value.reminderMinutes),
    knownTitles: sourceTitles,
    pendingTitles: gradeChanged ? [] : previous.pendingTitles.filter(title => sourceKeys.indexOf(normalizeTitle_(title)) !== -1),
    excludedTitles: gradeChanged ? [] : previous.excludedTitles,
    termKey: source.termKey,
    sourceFingerprint: source.fingerprint,
    pendingTermKey: '',
    pausedReason: '',
    autoSyncEnabledBeforeTermTransition: null,
    termTransitionNoticeAttempts: 0,
    termTransitionNoticeSentAt: '',
    termTransitionNoticeLastError: '',
    calendarMigrationFromId
  });
}

function buildUiData_(settings, source) {
  return {
    appVersion: APP_VERSION,
    settings,
    source: buildSourceUiModel_(source, settings.gradeName),
    calendars: listOwnedCalendars_(),
    status: loadStatus_(),
    courseOutlineStatus: buildCourseOutlineUiStatus_(settings, source),
    termTransition: buildTermTransitionUiModel_(settings, source)
  };
}

function buildTermTransitionUiModel_(settings, source) {
  const required = Boolean(settings && settings.pendingTermKey);
  const resumeAutoSync = required
    ? (typeof settings.autoSyncEnabledBeforeTermTransition === 'boolean'
      ? settings.autoSyncEnabledBeforeTermTransition
      : true)
    : Boolean(settings && settings.autoSyncEnabled);
  return {
    required,
    pendingTermKey: required ? settings.pendingTermKey : '',
    firstDate: source && source.firstDateKey || '',
    lastDate: source && source.lastDateKey || '',
    resumeAutoSync,
    noticeFailed: required &&
      Number(settings.termTransitionNoticeAttempts) >= TERM_TRANSITION_NOTICE_MAX_ATTEMPTS &&
      !settings.termTransitionNoticeSentAt,
    noticeLastError: required ? settings.termTransitionNoticeLastError || '' : ''
  };
}

function buildSourceUiModel_(source, gradeName) {
  return {
    gradeName,
    firstDate: source.firstDateKey,
    lastDate: source.lastDateKey,
    courseCount: source.catalog.courses.length,
    activityCount: source.catalog.activities.length,
    updateLabel: source.sourceUpdatedLabel,
    warning: source.sourceStale,
    catalog: source.catalog,
    termKey: source.termKey,
    fingerprint: source.fingerprint
  };
}

function listOwnedCalendars_() {
  const defaultId = CalendarApp.getDefaultCalendar().getId();
  return CalendarApp.getAllOwnedCalendars()
    .filter(calendar => calendar.getId() !== defaultId)
    .map(calendar => ({ id: calendar.getId(), name: calendar.getName() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildDedicatedCalendarName_(settings) {
  return sanitizeCalendarName_(settings.calendarName, settings.gradeName);
}

function ensureDedicatedCalendar_(settings) {
  if (settings.calendarId) {
    return assertDedicatedCalendar_(settings.calendarId);
  }

  const calendar = CalendarApp.createCalendar(buildDedicatedCalendarName_(settings));
  settings.calendarId = calendar.getId();
  saveSettings_(settings);
  return calendar;
}

function assertDedicatedCalendar_(calendarId) {
  const calendar = CalendarApp.getCalendarById(calendarId);

  if (!calendar) {
    throw new Error('找不到選擇的專用日曆。');
  }

  if (calendar.getId() === CalendarApp.getDefaultCalendar().getId()) {
    throw new Error('不能使用主要日曆，請建立或選擇專用日曆。');
  }

  if (typeof calendar.isOwnedByMe === 'function' && !calendar.isOwnedByMe()) {
    throw new Error('只能使用自己擁有的專用日曆。');
  }

  return calendar;
}

function defaultCalendarNameForGrade_(gradeName) {
  return sanitizeGrade_(gradeName) + '行程｜T-SCHOOL Schedule Sync';
}

function sanitizeCalendarName_(value, gradeName) {
  const name = normalizeText_(value).slice(0, 100);
  return name || defaultCalendarNameForGrade_(gradeName);
}

function syncMyScheduleToCalendar() {
  return runSyncEntryPoint_({ reason: 'source' });
}

function syncMyScheduleToCalendarWithNotification() {
  return runSyncEntryPoint_({ reason: 'source', notifyOnSuccess: true });
}

function forceFullSyncMyScheduleToCalendar() {
  return runSyncEntryPoint_({ reason: 'repair', forceCalendarCheck: true });
}

function runSyncEntryPoint_(options) {
  try {
    return syncSchedule_(options || {});
  } catch (error) {
    notifySyncFailureUnlessActionRequired_(error);
    throw error;
  }
}

function continueScheduleSync() {
  try {
    return syncSchedule_({ reason: 'continuation', continuation: true });
  } catch (error) {
    Logger.log('背景同步續跑失敗：' + userFacingError_(error));
    return { ok: false, message: userFacingError_(error) };
  }
}

function watchScheduleSync() {
  deleteTriggersByHandlers_([SYNC_WATCHDOG_HANDLER]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    try {
      ensureOneTimeTrigger_(SYNC_WATCHDOG_HANDLER, SYNC_CONTINUATION_DELAY_MS);
      return { ok: true, deferred: true };
    } catch (error) {
      const message = '無法延後同步逾時檢查：' + userFacingError_(error);
      notifySyncFailureSafe_(new Error(message));
      return { ok: false, deferred: false, message };
    }
  }
  let failureMessage = '';
  let result = { ok: true, skipped: true };
  try {
    const job = loadSyncJob_();
    if (!isActiveSyncJob_(job)) return result;
    if (job.status === 'queued' || job.status === 'retry_pending') {
      ensureOneTimeTrigger_(SYNC_CONTINUATION_HANDLER, SYNC_CONTINUATION_DELAY_MS);
      return { ok: true, resumed: true, jobId: job.jobId };
    }
    if ((job.status !== 'running' && job.status !== 'finalizing') || !job.runStartedAt) {
      return result;
    }
    const elapsed = Date.now() - Date.parse(job.runStartedAt);
    if (!Number.isFinite(elapsed) || elapsed < SYNC_RUNNING_STALE_MS) return result;

    if (Number(job.retryCount) < 1) {
      job.retryCount = Number(job.retryCount) + 1;
      job.status = 'retry_pending';
      job.lastError = '上一批同步沒有在預期時間內完成，將從安全存檔點續跑。';
      job.updatedAt = new Date().toISOString();
      job.nextAttemptAt = new Date(Date.now() + SYNC_CONTINUATION_DELAY_MS).toISOString();
      saveSyncJob_(job);
      ensureOneTimeTrigger_(SYNC_CONTINUATION_HANDLER, SYNC_CONTINUATION_DELAY_MS);
      writeSyncJobProgress_(job, '偵測到執行逾時，已安排從安全存檔點續跑。', 'retry_pending');
      return { ok: false, timedOut: true, retrying: true, jobId: job.jobId };
    }

    failureMessage = '同步連續兩次未能在 Apps Script 執行時間內完成，已停止自動續跑。';
    job.status = 'failed';
    job.lastError = failureMessage;
    job.updatedAt = new Date().toISOString();
    job.nextAttemptAt = '';
    saveSyncJob_(job);
    deleteTriggersByHandlers_([SYNC_CONTINUATION_HANDLER]);
    writeFailedSyncStatus_(failureMessage);
    writeSyncJobProgress_(job, failureMessage, 'error');
    result = { ok: false, timedOut: true, retrying: false, jobId: job.jobId };
  } catch (error) {
    failureMessage = '無法建立同步續跑觸發器：' + userFacingError_(error);
    try {
      const failedJob = loadSyncJob_();
      if (isActiveSyncJob_(failedJob)) {
        failedJob.status = 'failed';
        failedJob.lastError = failureMessage;
        failedJob.updatedAt = new Date().toISOString();
        failedJob.nextAttemptAt = '';
        saveSyncJob_(failedJob);
        result = { ok: false, retrying: false, jobId: failedJob.jobId };
      } else {
        result = { ok: false, retrying: false };
      }
      deleteTriggersByHandlers_([SYNC_CONTINUATION_HANDLER, SYNC_WATCHDOG_HANDLER]);
      writeFailedSyncStatus_(failureMessage);
      if (failedJob) writeSyncJobProgress_(failedJob, failureMessage, 'error');
    } catch (statusError) {
      Logger.log('同步續跑失敗狀態無法完整保存：' + userFacingError_(statusError));
    }
  } finally {
    lock.releaseLock();
  }
  if (failureMessage) notifySyncFailureSafe_(new Error(failureMessage));
  return result;
}

function syncSchedule_(options) {
  const trackProgress = Boolean(options && options.trackProgress);
  if (trackProgress) writeSyncProgress_(2, '正在等待同步資源…', 'running');
  if (options && options.continuation) {
    deleteTriggersByHandlers_([SYNC_CONTINUATION_HANDLER]);
  }
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(15000)) {
    const existingJob = loadSyncJob_();
    if (isActiveSyncJob_(existingJob)) {
      try {
        ensureOneTimeTrigger_(SYNC_CONTINUATION_HANDLER, SYNC_CONTINUATION_DELAY_MS);
      } catch (triggerError) {
        const failure = new Error(
          '另一個同步正在執行，且無法建立背景續跑觸發器：' +
          userFacingError_(triggerError)
        );
        notifySyncFailureSafe_(failure);
        failure.syncFailureHandled = true;
        throw failure;
      }
      return buildSyncJobResult_(existingJob, true);
    }
    if (trackProgress) writeSyncProgress_(0, '另一個同步仍在執行，請稍後再試。', 'error');
    throw new Error('另一個同步仍在執行，請稍後再試。');
  }

  let job = null;
  try {
    job = loadSyncJob_();
    if (isActiveSyncJob_(job)) {
      job.status = 'running';
      job.runId = hashText_(job.jobId + '|preflight|' + Date.now() + '|' + Math.random());
      job.runStartedAt = new Date().toISOString();
      job.updatedAt = job.runStartedAt;
      saveSyncJob_(job);
      ensureOneTimeTrigger_(SYNC_WATCHDOG_HANDLER, SYNC_WATCHDOG_DELAY_MS);
    }
    if (trackProgress) writeSyncProgress_(8, '正在讀取控制臺設定…', 'running');
    let settings = loadSettings_();
    if (trackProgress) writeSyncProgress_(16, '正在取得最新課表…', 'running');
    const source = loadSourceContext_(settings.gradeName);
    settings = applyTermTransitionIfNeeded_(settings, source, false);
    settings = registerNewTitles_(settings, source);
    if (trackProgress) writeSyncProgress_(30, '正在確認專用日曆…', 'running');
    const calendar = ensureDedicatedCalendar_(settings);
    const businessNow = scheduleBusinessNow_();
    const todayKey = formatDateKey_(businessNow);
    const desiredEvents = dedupeAndValidateDesiredEvents_(
      enrichEventsWithCourseOutlines_(source.events
        .filter(event => event.dateKey >= todayKey)
        .filter(event => shouldIncludeEvent_(event, settings)), settings, source)
    );
    const oldState = pruneExpiredSyncState_(loadSyncState_(), businessNow);
    const input = buildSyncJobInput_(settings, source, desiredEvents, calendar);
    job = loadSyncJob_() || job;

    const requestedForceCheck = Boolean(options && options.forceCalendarCheck);
    if (isActiveSyncJob_(job) &&
        (!syncJobInputMatches_(job.input, input) ||
         requestedForceCheck && !job.forceCalendarCheck)) {
      job = supersedeSyncJob_(job, '同步期間設定、課表或課綱已更新，改用最新資料重新規劃。');
    }

    if (!isActiveSyncJob_(job)) {
      const plan = buildSyncPlan_(oldState, desiredEvents, todayKey);
      if (trackProgress) writeSyncProgress_(42, '正在比對課表與日曆…', 'running');
      const expectedApprovalToken = makeSyncApprovalToken_(settings, source, desiredEvents, plan);
      const deletionApproved = Boolean(
        options && options.reason === 'settings' &&
        options.approvalToken &&
        options.approvalToken === expectedApprovalToken
      );
      assertSafeDeletionPlan_(plan, oldState, options && options.reason, deletionApproved);
      const jobOptions = Object.assign({}, options || {}, { deletionApproved });
      job = createSyncJob_(
        settings,
        source,
        desiredEvents,
        input,
        plan,
        oldState,
        jobOptions,
        job
      );
    }

    deleteTriggersByHandlers_([SYNC_CONTINUATION_HANDLER]);
    job.status = 'running';
    job.runId = hashText_(job.jobId + '|' + Date.now() + '|' + Math.random());
    job.runStartedAt = new Date().toISOString();
    job.updatedAt = job.runStartedAt;
    saveSyncJob_(job);
    ensureOneTimeTrigger_(SYNC_WATCHDOG_HANDLER, SYNC_WATCHDOG_DELAY_MS);

    const batchResult = runSyncJobBatch_(job, calendar, oldState, desiredEvents, settings, todayKey);
    try {
      writeChunkedJson_(SYNC_STATE_STORE, batchResult.state);
    } catch (stateError) {
      job = loadSyncJob_() || job;
      throw stateError;
    }
    job = applySyncBatchResultToJob_(job, batchResult);

    if (batchResult.pending) {
      job.status = 'queued';
      job.runId = '';
      job.runStartedAt = '';
      job.updatedAt = new Date().toISOString();
      job.nextAttemptAt = new Date(Date.now() + SYNC_CONTINUATION_DELAY_MS).toISOString();
      saveSyncJob_(job);
      if (job.firstSetup &&
          job.processedOperations >= SYNC_INITIAL_SETUP_BATCH_OPERATIONS &&
          !job.firstBatchNotificationClaimed) {
        job.firstBatchNotificationClaimed = true;
        saveSyncJob_(job);
        if (!sendFirstBatchStartedNotificationSafe_(settings, job)) {
          job.firstBatchNotificationClaimed = false;
          saveSyncJob_(job);
        }
      }
      ensureOneTimeTrigger_(SYNC_CONTINUATION_HANDLER, SYNC_CONTINUATION_DELAY_MS);
      deleteTriggersByHandlers_([SYNC_WATCHDOG_HANDLER]);
      writeSyncJobProgress_(job, batchResult.message, 'queued');
      return buildSyncJobResult_(job, true);
    }

    return finalizeSyncJob_(job, settings, source, batchResult.state, calendar);
  } catch (error) {
    deleteTriggersByHandlers_([SYNC_WATCHDOG_HANDLER]);
    const recovery = handleSyncJobFailure_(job, error);
    if (recovery) return recovery;
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function buildSyncJobInput_(settings, source, desiredEvents, calendar) {
  const outlineVersion = PropertiesService.getScriptProperties()
    .getProperty(COURSE_OUTLINE_ACTIVE_VERSION_PROPERTY) || '';
  const scheduleRows = (desiredEvents || []).map(item => [
    item.originalTitle,
    item.type,
    Boolean(item.isAllDay),
    item.dateKey,
    Number(item.periodStart) || 0,
    Number(item.periodEnd) || 0,
    item.start.toISOString(),
    item.end.toISOString(),
    item.location || ''
  ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const desiredRows = (desiredEvents || []).map(item => [
    makeOccurrenceKey_(item),
    makeEventSignature_(item, settings),
    item.outlineHash || ''
  ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const settingsRows = [
    settings.gradeName,
    settings.termKey,
    calendar.getId(),
    uniqueStrings_(settings.selectedCourses).map(normalizeTitle_).sort(),
    Boolean(settings.includeActivities),
    uniqueStrings_(settings.excludedActivities).map(normalizeTitle_).sort(),
    uniqueStrings_(settings.excludedTitles).map(normalizeTitle_).sort(),
    settings.descriptionPreset,
    settings.customDescription,
    settings.reminderMode,
    settings.reminderMinutes
  ];
  return {
    gradeName: settings.gradeName,
    termKey: source.termKey,
    calendarId: calendar.getId(),
    scheduleFingerprint: hashText_(JSON.stringify(scheduleRows)),
    settingsFingerprint: hashText_(JSON.stringify(settingsRows)),
    outlineVersion,
    desiredFingerprint: hashText_(JSON.stringify(desiredRows))
  };
}

function makeSyncApprovalToken_(settings, source, desiredEvents, plan) {
  return hashText_(JSON.stringify([
    settings.gradeName,
    source.termKey,
    source.fingerprint,
    uniqueStrings_(settings.selectedCourses).map(normalizeTitle_).sort(),
    Boolean(settings.includeActivities),
    uniqueStrings_(settings.excludedActivities).map(normalizeTitle_).sort(),
    uniqueStrings_(settings.excludedTitles).map(normalizeTitle_).sort(),
    (desiredEvents || []).map(item => [
      makeOccurrenceKey_(item),
      makeEventSignature_(item, settings)
    ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    (plan.deletions || []).map(item => item.stateKey).sort()
  ]));
}

function syncJobInputMatches_(left, right) {
  if (!left || !right) return false;
  return [
    'gradeName',
    'termKey',
    'calendarId',
    'scheduleFingerprint',
    'settingsFingerprint',
    'outlineVersion',
    'desiredFingerprint'
  ].every(key => String(left[key] || '') === String(right[key] || ''));
}

function createSyncJob_(settings, source, desiredEvents, input, plan, oldState, options, previousJob) {
  const migrationFromId = settings.calendarMigrationFromId &&
    settings.calendarMigrationFromId !== input.calendarId
    ? settings.calendarMigrationFromId
    : '';
  let migrationEntries = [];
  if (migrationFromId) {
    if (previousJob && previousJob.migrationFromId === migrationFromId &&
        Array.isArray(previousJob.migrationEntries)) {
      migrationEntries = previousJob.migrationEntries.slice();
    } else {
      const todayKey = formatDateKey_(scheduleBusinessNow_());
      migrationEntries = Object.keys(oldState)
        .filter(stateKey => oldState[stateKey].dateKey >= todayKey)
        .map(stateKey => ({
          stateKey,
          calendarEventId: oldState[stateKey].calendarEventId
        }));
    }
  }
  const forceCalendarCheck = Boolean(options.forceCalendarCheck || migrationFromId);
  const estimatedOperations = countPendingSyncOperations_(
    plan,
    settings,
    forceCalendarCheck,
    {}
  ) + migrationEntries.length;
  const now = new Date().toISOString();
  const job = {
    schemaVersion: SYNC_JOB_SCHEMA_VERSION,
    jobId: hashText_(input.desiredFingerprint + '|' + Date.now() + '|' + Math.random()),
    status: 'queued',
    phase: 'calendar',
    reason: options.reason || 'source',
    firstSetup: Boolean(options.firstSetup),
    forceCalendarCheck,
    notifyOnSuccess: Boolean(options.notifyOnSuccess),
    notificationWindow: Boolean(
      options.notificationWindow || isConfiguredNotificationHour_(settings)
    ),
    deletionApproved: Boolean(options.deletionApproved),
    input,
    createdAt: now,
    updatedAt: now,
    runId: '',
    runStartedAt: '',
    nextAttemptAt: '',
    retryCount: 0,
    lastError: '',
    desiredCount: desiredEvents.length,
    initialOperationCount: estimatedOperations,
    processedOperations: 0,
    created: 0,
    updated: 0,
    outlineUpdated: 0,
    deleted: 0,
    migrationDeleted: 0,
    forceProcessedKeys: {},
    inFlight: [],
    changes: [],
    omittedChangeCount: 0,
    migrationFromId,
    migrationEntries,
    migrationCursor: 0,
    completionNotificationClaimed: false,
    firstBatchNotificationClaimed: false
  };
  saveSyncJob_(job);
  return job;
}

function runSyncJobBatch_(job, calendar, oldState, desiredEvents, settings, todayKey) {
  const startedAt = Date.now();
  const batchOperationLimit = job.firstSetup && Number(job.processedOperations) === 0
    ? SYNC_INITIAL_SETUP_BATCH_OPERATIONS
    : SYNC_BATCH_MAX_CALENDAR_OPERATIONS;
  let state = Object.assign({}, oldState);
  let operations = Array.isArray(job.inFlight) && job.inFlight.length
    ? job.inFlight.map(hydrateSyncOperation_)
    : [];
  let recovering = operations.length > 0;

  if (!operations.length) {
    const plan = buildSyncPlan_(state, desiredEvents, todayKey);
    assertSafeDeletionPlan_(plan, state, job.reason, job.deletionApproved);
    const prepared = prepareSyncOperations_(plan, state, settings, job);
    state = prepared.state;
    operations = prepared.operations.slice(0, batchOperationLimit);

    if (!operations.length && job.migrationFromId &&
        job.migrationCursor < job.migrationEntries.length) {
      operations = job.migrationEntries
        .slice(job.migrationCursor, job.migrationCursor + batchOperationLimit)
        .map(entry => ({
          type: 'migration_delete',
          oldKey: entry.stateKey,
          calendarEventId: entry.calendarEventId
        }));
    }

    job.inFlight = operations.map(serializeSyncOperation_);
    job.updatedAt = new Date().toISOString();
    saveSyncJob_(job);
  }

  const completed = [];
  const changes = [];
  const stats = { created: 0, updated: 0, outlineUpdated: 0, deleted: 0, migrationDeleted: 0 };

  for (let index = 0; index < operations.length; index += 1) {
    if (index > 0 && Date.now() - startedAt >= SYNC_BATCH_SOFT_LIMIT_MS) break;
    const operation = operations[index];
    applySyncOperation_(operation, state, calendar, settings, recovering, stats, changes, job);
    completed.push(operation);
  }

  const remainingInFlight = operations.slice(completed.length);
  job.inFlight = remainingInFlight.map(serializeSyncOperation_);
  if (completed.some(operation => operation.type === 'migration_delete')) {
    job.migrationCursor += completed.filter(operation => operation.type === 'migration_delete').length;
  }

  const nextPlan = buildSyncPlan_(state, desiredEvents, todayKey);
  const nextPrepared = prepareSyncOperations_(nextPlan, state, settings, job);
  state = nextPrepared.state;
  const mainPending = remainingInFlight.length > 0 || nextPrepared.operations.length > 0;
  const migrationPending = Boolean(job.migrationFromId &&
    job.migrationCursor < job.migrationEntries.length);
  return {
    state,
    changes,
    stats,
    completedOperations: completed.length,
    pending: mainPending || migrationPending,
    remainingOperations: remainingInFlight.length + nextPrepared.operations.length +
      Math.max(0, job.migrationEntries.length - job.migrationCursor),
    message: remainingInFlight.length
      ? '本批已達安全時間上限，將從批次存檔點繼續。'
      : (mainPending
        ? '本批已安全保存，等待下一批建立或更新行程。'
        : '新日曆已完成，正在分批清理舊日曆的受管理事件。')
  };
}

function prepareSyncOperations_(plan, state, settings, job) {
  const operations = [];
  plan.exact.forEach(pair => {
    const signature = makeEventSignature_(pair.newItem, settings);
    const baseSignature = makeBaseEventSignature_(pair.newItem, settings);
    const previousOutlineHash = pair.oldItem.outlineHash || '';
    const nextOutlineHash = pair.newItem.outlineHash || '';
    const outlineOnlyChanged = storedBaseSignatureMatches_(pair.oldItem, pair.newItem, settings) &&
      previousOutlineHash !== nextOutlineHash;
    const metadataOnlyChanged = needsEventMetadataMigration_(pair.oldItem) &&
      storedEventContentSignatureMatches_(pair.oldItem, pair.newItem, settings);
    const forceToken = pair.newKey;
    const forcePending = job.forceCalendarCheck && !job.forceProcessedKeys[forceToken];

    if (!forcePending && storedEventSignatureMatches_(pair.oldItem, pair.newItem, settings)) {
      state[pair.newKey] = serializeStateItem_(
        pair.newItem,
        pair.oldItem.calendarEventId,
        signature,
        settings
      );
      return;
    }
    operations.push({
      type: !forcePending && metadataOnlyChanged
        ? 'metadata'
        : (!forcePending && outlineOnlyChanged ? 'outline' : 'update'),
      oldKey: pair.oldItem.stateKey,
      newKey: pair.newKey,
      oldItem: pair.oldItem,
      newItem: pair.newItem,
      signature,
      baseSignature,
      forceToken: forcePending ? forceToken : ''
    });
  });
  plan.moved.forEach(pair => {
    operations.push({
      type: 'update',
      oldKey: pair.oldItem.stateKey,
      newKey: pair.newKey,
      oldItem: pair.oldItem,
      newItem: pair.newItem,
      signature: makeEventSignature_(pair.newItem, settings),
      forceToken: job.forceCalendarCheck ? pair.newKey : ''
    });
  });
  plan.additions.forEach(item => {
    operations.push({
      type: 'create',
      newKey: makeOccurrenceKey_(item),
      newItem: item,
      signature: makeEventSignature_(item, settings)
    });
  });
  plan.deletions.forEach(item => {
    operations.push({
      type: 'delete',
      oldKey: item.stateKey,
      oldItem: item,
      calendarEventId: item.calendarEventId
    });
  });
  return { state, operations };
}

function countPendingSyncOperations_(plan, settings, forceCalendarCheck, forceProcessedKeys) {
  const fakeJob = {
    forceCalendarCheck: Boolean(forceCalendarCheck),
    forceProcessedKeys: forceProcessedKeys || {}
  };
  return prepareSyncOperations_(plan, {}, settings, fakeJob).operations.length;
}

function applySyncOperation_(operation, state, calendar, settings, recovering, stats, changes, job) {
  if (operation.type === 'migration_delete') {
    const oldCalendar = CalendarApp.getCalendarById(job.migrationFromId);
    if (oldCalendar &&
        deleteCalendarEvent_(oldCalendar, operation.calendarEventId, operation.oldKey)) {
      stats.migrationDeleted += 1;
    }
    return;
  }

  if (operation.type === 'create') {
    const event = createCalendarEventIdempotent_(
      calendar,
      operation.newItem,
      operation.newKey,
      settings
    );
    state[operation.newKey] = serializeStateItem_(
      operation.newItem,
      event.getId(),
      operation.signature,
      settings
    );
    stats.created += 1;
    if (job.forceCalendarCheck) job.forceProcessedKeys[operation.newKey] = true;
    changes.push({ type: '新增', newItem: operation.newItem });
    return;
  }

  if (operation.type === 'delete') {
    if (deleteCalendarEvent_(calendar, operation.calendarEventId, operation.oldKey)) {
      stats.deleted += 1;
      changes.push({ type: '取消', oldItem: operation.oldItem });
    }
    delete state[operation.oldKey];
    return;
  }

  if (job.forceCalendarCheck) {
    const duplicates = findManagedCalendarEventsByStateKey_(
      calendar,
      operation.newItem,
      operation.newKey,
      settings
    );
    if (duplicates.length > 1) {
      throw new Error(
        '[ACTION_REQUIRED] 強制修復發現多筆相同同步識別碼的事件，已停止自動修改：' +
        operation.newItem.originalTitle + '（' + operation.newItem.dateKey + '）。'
      );
    }
  }

  const updateOptions = { recovering };
  let calendarEventId;
  if (operation.type === 'metadata') {
    calendarEventId = migrateCalendarEventMetadata_(
      calendar,
      operation.oldItem.calendarEventId,
      operation.newItem,
      operation.newKey,
      settings,
      operation.oldKey
    );
  } else if (operation.type === 'outline') {
    calendarEventId = updateCalendarOutlineFields_(
      calendar,
      operation.oldItem.calendarEventId,
      operation.newItem,
      operation.newKey,
      settings,
      operation.oldKey,
      updateOptions
    );
  } else {
    calendarEventId = updateCalendarEvent_(
      calendar,
      operation.oldItem.calendarEventId,
      operation.newItem,
      operation.newKey,
      settings,
      operation.oldKey,
      updateOptions
    );
  }
  if (operation.oldKey !== operation.newKey) delete state[operation.oldKey];
  state[operation.newKey] = serializeStateItem_(
    operation.newItem,
    calendarEventId,
    operation.signature,
    settings
  );
  if (operation.forceToken) job.forceProcessedKeys[operation.forceToken] = true;
  if (operation.type === 'metadata') {
    return;
  }
  if (operation.type === 'outline') {
    stats.outlineUpdated += 1;
  } else {
    stats.updated += 1;
    changes.push({
      type: operation.oldKey === operation.newKey ? '更新' : '調整',
      oldItem: operation.oldItem,
      newItem: operation.newItem
    });
  }
}

function applySyncBatchResultToJob_(job, batchResult) {
  job.created += batchResult.stats.created;
  job.updated += batchResult.stats.updated;
  job.outlineUpdated += batchResult.stats.outlineUpdated;
  job.deleted += batchResult.stats.deleted;
  job.migrationDeleted += batchResult.stats.migrationDeleted;
  job.processedOperations += batchResult.completedOperations;
  appendSyncJobChanges_(job, batchResult.changes);
  job.updatedAt = new Date().toISOString();
  job.lastError = '';
  if (batchResult.completedOperations > 0) job.retryCount = 0;
  return job;
}

function appendSyncJobChanges_(job, changes) {
  (changes || []).forEach(change => {
    if (job.changes.length < SYNC_CHANGE_DETAIL_LIMIT) {
      job.changes.push(serializeSyncChange_(change));
    } else {
      job.omittedChangeCount += 1;
    }
  });
}

function finalizeSyncJob_(job, settings, source, state, calendar) {
  job.status = 'finalizing';
  job.updatedAt = new Date().toISOString();
  saveSyncJob_(job);
  writeSyncJobProgress_(job, '正在完成設定、通知與自動同步…', 'running');

  settings.setupComplete = true;
  settings.sourceFingerprint = source.fingerprint;
  settings.knownTitles = uniqueStrings_(
    settings.knownTitles.concat(source.catalog.all.map(item => item.title))
  );
  if (job.migrationFromId) settings.calendarMigrationFromId = '';
  saveSettings_(settings);
  refreshAutoSyncTriggers_(settings);
  scheduleCourseOutlineRefreshIfNeeded_(settings, source);

  const result = buildSyncJobResult_(job, false);
  result.state = state;
  result.calendarId = calendar.getId();
  result.unchanged = Math.max(
    0,
    job.desiredCount - result.created - result.updated - result.outlineUpdated
  );
  const status = {
    ok: true,
    message: formatSyncResultMessage_(result),
    lastSync: new Date().toISOString(),
    lastSyncLabel: formatDateTime_(new Date()),
    eventCount: Object.keys(state).length,
    created: result.created,
    updated: result.updated,
    outlineUpdated: result.outlineUpdated,
    deleted: result.deleted,
    unchanged: result.unchanged
  };
  writeChunkedJson_(STATUS_STORE, status);

  if (!job.completionNotificationClaimed) {
    job.completionNotificationClaimed = true;
    saveSyncJob_(job);
    sendSyncNotificationsSafe_(settings, result, {
      reason: job.reason,
      notifyOnSuccess: job.notifyOnSuccess,
      notificationWindow: job.notificationWindow
    });
    if (job.firstSetup) sendFirstSetupNotificationSafe_(result);
  }

  writeSyncProgress_(100, '同步完成', 'complete', {
    jobId: job.jobId,
    processed: job.processedOperations,
    total: Math.max(job.initialOperationCount, job.processedOperations),
    remaining: 0
  });
  clearChunkedStore_(SYNC_JOB_STORE);
  deleteTriggersByHandlers_([SYNC_CONTINUATION_HANDLER, SYNC_WATCHDOG_HANDLER]);
    return result;
}

function handleSyncJobFailure_(job, error) {
  const message = userFacingError_(error);
  const actionRequired = String(error && error.message || error).indexOf('[ACTION_REQUIRED]') === 0;
  if (!job || !job.jobId) {
    writeFailedSyncStatus_(message);
    return null;
  }
  job.lastError = message;
  job.updatedAt = new Date().toISOString();
  job.runId = '';
  job.runStartedAt = '';

  if (!actionRequired && Number(job.retryCount) < 1) {
    job.retryCount = Number(job.retryCount) + 1;
    job.status = 'retry_pending';
    job.nextAttemptAt = new Date(Date.now() + SYNC_RETRY_DELAY_MS).toISOString();
    saveSyncJob_(job);
    try {
      ensureOneTimeTrigger_(SYNC_CONTINUATION_HANDLER, SYNC_RETRY_DELAY_MS);
    } catch (triggerError) {
      job.status = 'failed';
      job.lastError = message + '；且無法建立背景重試：' + userFacingError_(triggerError);
      job.nextAttemptAt = '';
      saveSyncJob_(job);
      writeFailedSyncStatus_(job.lastError);
      writeSyncJobProgress_(job, job.lastError, 'error');
      notifySyncFailureSafe_(new Error(job.lastError));
      error.syncFailureHandled = true;
      return null;
    }
    writeSyncJobProgress_(job, '暫時失敗，已保存進度並安排再試一次：' + message, 'retry_pending');
    return Object.assign(buildSyncJobResult_(job, true), { retrying: true });
  }

  job.status = 'failed';
  job.nextAttemptAt = '';
  saveSyncJob_(job);
  deleteTriggersByHandlers_([SYNC_CONTINUATION_HANDLER, SYNC_WATCHDOG_HANDLER]);
  writeFailedSyncStatus_(message);
  writeSyncJobProgress_(job, message, 'error');
  if (actionRequired) {
    sendActionRequiredSafe_(
      loadSettings_(),
      '同步已停止，需要檢查',
      message,
      '',
      'sync_stopped',
      { message },
      { immediate: true }
    );
  } else {
    notifySyncFailureSafe_(error);
  }
  error.syncFailureHandled = true;
  return null;
}

function writeFailedSyncStatus_(message) {
  writeChunkedJson_(STATUS_STORE, {
    ok: false,
    message,
    lastSync: new Date().toISOString(),
    lastSyncLabel: formatDateTime_(new Date()),
    eventCount: Object.keys(readChunkedJson_(SYNC_STATE_STORE, {})).length
  });
}

function buildSyncJobResult_(job, pending) {
  const changes = (job.changes || []).map(hydrateSyncChange_);
  return {
    pending: Boolean(pending),
    jobId: job.jobId,
    created: Number(job.created) || 0,
    updated: Number(job.updated) || 0,
    outlineUpdated: Number(job.outlineUpdated) || 0,
    deleted: Number(job.deleted) || 0,
    unchanged: 0,
    changes,
    omittedChangeCount: Number(job.omittedChangeCount) || 0
  };
}

function loadSyncJob_() {
  const job = readChunkedJson_(SYNC_JOB_STORE, null);
  return job && job.schemaVersion === SYNC_JOB_SCHEMA_VERSION ? job : null;
}

function saveSyncJob_(job) {
  writeChunkedJson_(SYNC_JOB_STORE, job);
}

function isActiveSyncJob_(job) {
  return Boolean(job && ['queued', 'running', 'retry_pending', 'finalizing'].indexOf(job.status) !== -1);
}

function supersedeSyncJob_(job, message) {
  if (job) {
    job.status = 'superseded';
    job.updatedAt = new Date().toISOString();
    job.lastError = message;
    saveSyncJob_(job);
  }
  deleteTriggersByHandlers_([SYNC_CONTINUATION_HANDLER, SYNC_WATCHDOG_HANDLER]);
  return job;
}

function cancelActiveSyncJob_(message) {
  const job = loadSyncJob_();
  if (!isActiveSyncJob_(job)) return false;
  supersedeSyncJob_(job, message || '同步工作已取消。');
  clearChunkedStore_(SYNC_JOB_STORE);
  return true;
}

function writeSyncJobProgress_(job, message, state) {
  const total = Math.max(Number(job.initialOperationCount) || 0, Number(job.processedOperations) || 0);
  const processed = Math.min(total, Number(job.processedOperations) || 0);
  const percent = total ? Math.min(95, Math.round(40 + processed / total * 55)) : 90;
  writeSyncProgress_(percent, message, state || 'running', {
    jobId: job.jobId,
    processed,
    total,
    remaining: Math.max(0, total - processed),
    nextAttemptAt: job.nextAttemptAt || ''
  });
}

function serializeSyncOperation_(operation) {
  return JSON.parse(JSON.stringify(operation));
}

function hydrateSyncOperation_(operation) {
  const result = Object.assign({}, operation);
  if (result.newItem) result.newItem = hydrateSyncEventItem_(result.newItem);
  return result;
}

function hydrateSyncEventItem_(item) {
  const result = Object.assign({}, item);
  result.start = new Date(item.start);
  result.end = new Date(item.end);
  return result;
}

function serializeSyncChange_(change) {
  return {
    type: change.type,
    oldItem: compactSyncChangeItem_(change.oldItem),
    newItem: compactSyncChangeItem_(change.newItem)
  };
}

function hydrateSyncChange_(change) {
  return Object.assign({}, change);
}

function compactSyncChangeItem_(item) {
  if (!item) return null;
  return {
    originalTitle: item.originalTitle,
    dateKey: item.dateKey,
    isAllDay: Boolean(item.isAllDay),
    periodStart: Number(item.periodStart) || 0,
    periodEnd: Number(item.periodEnd) || 0,
    startTime: item.startTime || '',
    endTime: item.endTime || '',
    location: item.location || ''
  };
}

function dedupeAndValidateDesiredEvents_(events) {
  const seen = {};
  const result = [];
  (events || []).forEach(item => {
    const key = makeOccurrenceKey_(item);
    const fingerprint = hashText_(JSON.stringify([
      normalizeTitle_(item.originalTitle),
      item.type,
      item.start.toISOString(),
      item.end.toISOString(),
      normalizeTitle_(item.location),
      item.outlineHash || ''
    ]));
    if (seen[key] && seen[key] !== fingerprint) {
      throw new Error(
        '[ACTION_REQUIRED] 課表中有兩筆不同內容被正規化成相同事件：' +
        item.originalTitle + '（' + item.dateKey + '）。系統已停止，避免錯誤合併。'
      );
    }
    if (!seen[key]) result.push(item);
    seen[key] = fingerprint;
  });
  return result;
}

function applyTermTransitionIfNeeded_(settings, source, quiet) {
  if (!settings.setupComplete || !settings.termKey || settings.termKey === source.termKey) {
    return settings;
  }

  if (settings.pendingTermKey !== source.termKey) {
    if (!settings.pendingTermKey ||
        typeof settings.autoSyncEnabledBeforeTermTransition !== 'boolean') {
      settings.autoSyncEnabledBeforeTermTransition = Boolean(settings.autoSyncEnabled);
    }
    settings.selectedCourses = [];
    settings.excludedActivities = [];
    settings.pendingTitles = [];
    settings.pendingTermKey = source.termKey;
    settings.autoSyncEnabled = false;
    settings.pausedReason = '偵測到新學期，請重新選擇課程。';
    settings.termTransitionNoticeAttempts = 0;
    settings.termTransitionNoticeSentAt = '';
    settings.termTransitionNoticeLastError = '';
    saveSettings_(settings);
    deleteAutoSyncTriggersUnlocked_();
    deliverTermTransitionNotice_(settings, source);
  }

  if (!quiet) {
    throw new Error('[ACTION_REQUIRED] 偵測到新學期，請先開啟設定並重新選課。');
  }

  return settings;
}

function buildTermTransitionNotice_(settings, source) {
  const dateRange = source && source.firstDateKey
    ? source.firstDateKey + (source.lastDateKey ? '–' + source.lastDateKey : '')
    : '新學期';
  return {
    subject: '新學期行程已更新',
    dateRange,
    body:
      '系統偵測到 ' + dateRange + ' 的新學期行程\\n\\n' +
      '自動同步已暫停，既有日曆事件會完整保留。' +
      '請開啟「行程同步」→「開啟設定」，重新選擇本學期課程並儲存。'
  };
}

function deliverTermTransitionNotice_(settings, source) {
  if (!settings || !settings.pendingTermKey || settings.termTransitionNoticeSentAt) return true;
  const notice = buildTermTransitionNotice_(settings, source);
  const result = sendActionRequiredSafe_(
    settings,
    notice.subject,
    notice.body,
    'term-transition|' + settings.pendingTermKey,
    'term_transition',
    { dateRange: notice.dateRange }
  );
  settings.termTransitionNoticeAttempts =
    Math.max(0, Number(settings.termTransitionNoticeAttempts) || 0) +
    (result.alreadySent ? 0 : 1);
  if (result.ok) {
    settings.termTransitionNoticeSentAt = new Date().toISOString();
    settings.termTransitionNoticeLastError = '';
    deleteTriggersByHandlers_([TERM_TRANSITION_NOTICE_HANDLER]);
  } else {
    settings.termTransitionNoticeLastError = result.error || '通知寄送失敗';
  }
  saveSettings_(settings);
  if (!result.ok &&
      settings.termTransitionNoticeAttempts < TERM_TRANSITION_NOTICE_MAX_ATTEMPTS) {
    ensureOneTimeTrigger_(
      TERM_TRANSITION_NOTICE_HANDLER,
      TERM_TRANSITION_NOTICE_RETRY_DELAY_MS
    );
  }
  return result.ok;
}

function retryTermTransitionNotice() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return false;
  try {
    const settings = loadSettings_();
    if (!settings.pendingTermKey || settings.termTransitionNoticeSentAt ||
        Number(settings.termTransitionNoticeAttempts) >= TERM_TRANSITION_NOTICE_MAX_ATTEMPTS) {
      return false;
    }
    const source = loadSourceContext_(settings.gradeName);
    if (source.termKey !== settings.pendingTermKey) return false;
    return deliverTermTransitionNotice_(settings, source);
  } finally {
    lock.releaseLock();
  }
}

function registerNewTitles_(settings, source) {
  if (!settings.setupComplete) {
    return settings;
  }

  const known = settings.knownTitles.map(normalizeTitle_);
  const excluded = settings.excludedTitles.map(normalizeTitle_);
  const pending = settings.pendingTitles.map(normalizeTitle_);
  const activityKeys = source.catalog.activities.map(item => normalizeTitle_(item.title));
  const discovered = source.catalog.all
    .map(item => item.title)
    .filter(title => known.indexOf(normalizeTitle_(title)) === -1)
    .filter(title => excluded.indexOf(normalizeTitle_(title)) === -1);

  if (discovered.length === 0) {
    return settings;
  }

  discovered.forEach(title => {
    settings.knownTitles.push(title);
    if (!settings.includeActivities && activityKeys.indexOf(normalizeTitle_(title)) !== -1) {
      return;
    }
    if (pending.indexOf(normalizeTitle_(title)) === -1) {
      settings.pendingTitles.push(title);
    }
  });

  saveSettings_(settings);
  const pendingDiscovered = discovered.filter(title =>
    settings.pendingTitles.some(item => normalizeTitle_(item) === normalizeTitle_(title))
  );
  if (pendingDiscovered.length) {
    sendActionRequiredSafe_(
      settings,
      '發現新的行程項目',
      '下列項目已先加入日曆，請在控制臺確認是否屬於你：\\n\\n' +
        pendingDiscovered.join('\\n'),
      '',
      'new_schedule_items',
      {
        itemCount: pendingDiscovered.length,
        items: pendingDiscovered.map(label => ({ label }))
      }
    );
  }
  return settings;
}

function shouldIncludeEvent_(event, settings) {
  const normalized = normalizeTitle_(event.originalTitle);

  if (settings.excludedTitles.some(title => normalizeTitle_(title) === normalized)) {
    return false;
  }

  if (event.type === 'activity' && settings.excludedActivities.some(title => normalizeTitle_(title) === normalized)) {
    return false;
  }

  if (event.type === 'activity' && !settings.includeActivities) {
    return false;
  }

  if (settings.pendingTitles.some(title => normalizeTitle_(title) === normalized)) {
    return true;
  }

  if (event.type === 'activity') {
    return true;
  }

  return settings.selectedCourses.some(title => normalizeTitle_(title) === normalized);
}

function buildSyncPlan_(oldState, desiredEvents, todayKey) {
  const oldFuture = Object.keys(oldState)
    .map(key => Object.assign({ stateKey: key }, oldState[key]))
    .filter(item => item.dateKey >= todayKey);
  const oldPast = Object.keys(oldState)
    .filter(key => oldState[key].dateKey < todayKey)
    .reduce((result, key) => { result[key] = oldState[key]; return result; }, {});
  const oldByKey = {};
  oldFuture.forEach(item => { oldByKey[item.stateKey] = item; });

  const exact = [];
  const unmatchedNew = [];
  const matchedOld = {};

  desiredEvents.forEach(event => {
    const key = makeOccurrenceKey_(event);
    if (oldByKey[key]) {
      exact.push({ oldItem: oldByKey[key], newItem: event, newKey: key });
      matchedOld[key] = true;
    } else {
      unmatchedNew.push(event);
    }
  });

  const unmatchedOld = oldFuture.filter(item => !matchedOld[item.stateKey]);
  const moved = [];
  const usedOld = {};
  const stillNew = [];

  unmatchedNew.forEach(newItem => {
    const candidates = unmatchedOld
      .filter(oldItem =>
        !usedOld[oldItem.stateKey] &&
        normalizeTitle_(oldItem.originalTitle) === normalizeTitle_(newItem.originalTitle)
      )
      .map(oldItem => ({
        oldItem,
        distance: Math.abs(new Date(oldItem.start).getTime() - newItem.start.getTime())
      }))
      .filter(candidate => candidate.distance <= 21 * 24 * 60 * 60 * 1000)
      .sort((left, right) => left.distance - right.distance);
    const best = candidates.length &&
      (candidates.length === 1 || candidates[0].distance < candidates[1].distance)
      ? candidates[0]
      : null;

    if (best) {
      usedOld[best.oldItem.stateKey] = true;
      moved.push({ oldItem: best.oldItem, newItem, newKey: makeOccurrenceKey_(newItem) });
    } else {
      stillNew.push(newItem);
    }
  });

  return {
    oldPast,
    oldFutureCount: oldFuture.length,
    exact,
    moved,
    additions: stillNew,
    deletions: unmatchedOld.filter(item => !usedOld[item.stateKey])
  };
}

function assertSafeDeletionPlan_(plan, oldState, reason, deletionApproved) {
  if (reason === 'setup' || reason === 'settings' && deletionApproved) {
    return;
  }

  const oldCount = Number(plan.oldFutureCount) ||
    Object.keys(oldState).filter(key =>
      oldState[key].dateKey >= formatDateKey_(scheduleBusinessNow_())
    ).length;
  const deletedCount = plan.deletions.length;

  if (oldCount >= 5 && deletedCount >= 5 && deletedCount / oldCount > 0.4) {
    throw new Error('來源變動會一次移除過多事件，系統已停止同步以保護日曆。請開啟控制臺檢查課表來源。');
  }
}

function applySyncPlan_(calendar, oldState, plan, settings, options) {
  const newState = Object.assign({}, plan.oldPast);
  const changes = [];
  const totalOperations = plan.exact.length + plan.moved.length + plan.additions.length + plan.deletions.length;
  let completedOperations = 0;
  let lastReportedPercent = 42;
  let created = 0;
  let updated = 0;
  let outlineUpdated = 0;
  let deleted = 0;
  let unchanged = 0;

  function reportProgress_(message) {
    completedOperations += 1;
    if (!options.trackProgress) return;
    const percent = totalOperations
      ? Math.min(88, Math.round(42 + completedOperations / totalOperations * 46))
      : 88;
    if (percent < 88 && percent - lastReportedPercent < 4) return;
    lastReportedPercent = percent;
    writeSyncProgress_(percent, message, 'running');
  }

  if (options.trackProgress && totalOperations === 0) {
    writeSyncProgress_(88, '日曆已是最新狀態', 'running');
  }

  plan.exact.concat(plan.moved).forEach(pair => {
    const signature = makeEventSignature_(pair.newItem, settings);
    const baseSignature = makeBaseEventSignature_(pair.newItem, settings);
    const previousOutlineHash = pair.oldItem.outlineHash || '';
    const nextOutlineHash = pair.newItem.outlineHash || '';
    const outlineOnlyChanged = storedBaseSignatureMatches_(pair.oldItem, pair.newItem, settings) &&
      previousOutlineHash !== nextOutlineHash &&
      pair.oldItem.stateKey === pair.newKey;
    const metadataOnlyChanged = needsEventMetadataMigration_(pair.oldItem) &&
      storedEventContentSignatureMatches_(pair.oldItem, pair.newItem, settings);
    let calendarEventId = pair.oldItem.calendarEventId;

    if (!options.forceCalendarCheck &&
        storedEventSignatureMatches_(pair.oldItem, pair.newItem, settings)) {
      unchanged += 1;
    } else if (!options.forceCalendarCheck && metadataOnlyChanged) {
      calendarEventId = migrateCalendarEventMetadata_(
        calendar,
        calendarEventId,
        pair.newItem,
        pair.newKey,
        settings,
        pair.oldItem.stateKey
      );
      unchanged += 1;
    } else if (!options.forceCalendarCheck && outlineOnlyChanged) {
      calendarEventId = updateCalendarOutlineFields_(calendar, calendarEventId, pair.newItem, pair.newKey, settings);
      outlineUpdated += 1;
    } else {
      calendarEventId = updateCalendarEvent_(calendar, calendarEventId, pair.newItem, pair.newKey, settings);
      updated += 1;
      changes.push({ type: pair.oldItem.stateKey === pair.newKey ? '更新' : '調整', oldItem: pair.oldItem, newItem: pair.newItem });
    }

    newState[pair.newKey] = serializeStateItem_(pair.newItem, calendarEventId, signature, settings);
    reportProgress_('正在更新日曆事件…');
  });

  plan.additions.forEach(item => {
    const key = makeOccurrenceKey_(item);
    const signature = makeEventSignature_(item, settings);
    const event = createCalendarEvent_(calendar, item, key, settings);
    newState[key] = serializeStateItem_(item, event.getId(), signature, settings);
    created += 1;
    changes.push({ type: '新增', newItem: item });
    reportProgress_('正在建立日曆事件…');
  });

  plan.deletions.forEach(item => {
    if (deleteCalendarEvent_(calendar, item.calendarEventId, item.stateKey)) {
      deleted += 1;
      changes.push({ type: '取消', oldItem: item });
    }
    reportProgress_('正在移除已取消事件…');
  });

  return { state: newState, changes, created, updated, outlineUpdated, deleted, unchanged };
}

function createCalendarEvent_(calendar, item, stateKey, settings) {
  const options = {
    location: buildEventLocation_(item),
    description: buildManagedDescription_(item, stateKey, settings)
  };
  const event = item.isAllDay
    ? calendar.createAllDayEvent(buildEventTitle_(item, settings), item.start, options)
    : calendar.createEvent(buildEventTitle_(item, settings), item.start, item.end, options);
  setManagedEventTags_(event, stateKey);
  applyEventReminders_(event, settings);
  return event;
}

function createCalendarEventIdempotent_(calendar, item, stateKey, settings) {
  const matches = findManagedCalendarEventsByStateKey_(calendar, item, stateKey, settings);
  if (matches.length > 1) {
    throw new Error(
      '[ACTION_REQUIRED] 日曆中出現多筆相同同步識別碼的事件，系統已停止，避免再建立重複事件：' +
      item.originalTitle + '（' + item.dateKey + '）。'
    );
  }
  if (matches.length === 1) {
    const event = matches[0];
    const title = buildEventTitle_(item, settings);
    const location = buildEventLocation_(item);
    const description = buildManagedDescription_(item, stateKey, settings);
    setManagedEventTags_(event, stateKey);
    if (event.getTitle() !== title) event.setTitle(title);
    if ((event.getLocation() || '') !== location) event.setLocation(location);
    if ((event.getDescription() || '') !== description) event.setDescription(description);
    applyEventReminders_(event, settings);
    return event;
  }
  return createCalendarEvent_(calendar, item, stateKey, settings);
}

function findManagedCalendarEventsByStateKey_(calendar, item, stateKey, settings) {
  const rangeStart = new Date(item.start);
  const rangeEnd = new Date(item.end);
  rangeStart.setDate(rangeStart.getDate() - 1);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  const events = calendar.getEvents(rangeStart, rangeEnd);
  const managedMatches = events.filter(event => isManagedEvent_(event, stateKey));
  if (managedMatches.length) return managedMatches;

  // CalendarApp 建立事件與 setTag 無法形成單一交易。若剛建立就逾時，
  // 只接回內容完全相同、而且尚未帶任何管理標籤的唯一事件。
  return events.filter(event =>
    !isManagedEvent_(event, null) &&
    calendarEventMatchesExpectedContent_(event, item, stateKey, settings)
  );
}

function updateCalendarEvent_(calendar, eventId, item, stateKey, settings, expectedOldStateKey, options) {
  const event = calendar.getEventById(eventId);

  if (!event) {
    return createCalendarEventIdempotent_(calendar, item, stateKey, settings).getId();
  }

  if (!isManagedEvent_(event, expectedOldStateKey) &&
      !isManagedEvent_(event, stateKey)) {
    throw new Error(
      '[ACTION_REQUIRED] 找到原事件，但管理標記已被移除或不相符。系統已保留該事件並停止修改：' +
      item.originalTitle + '（' + item.dateKey + '）。'
    );
  }

  if (event.isAllDayEvent() !== Boolean(item.isAllDay)) {
    event.deleteEvent();
    return createCalendarEventIdempotent_(calendar, item, stateKey, settings).getId();
  }

  const title = buildEventTitle_(item, settings);
  const location = buildEventLocation_(item);
  const description = buildManagedDescription_(item, stateKey, settings);
  if (event.getTitle() !== title) event.setTitle(title);
  if (item.isAllDay) {
    if (formatDateKey_(event.getAllDayStartDate()) !== item.dateKey) event.setAllDayDate(item.start);
  } else if (event.getStartTime().getTime() !== item.start.getTime() || event.getEndTime().getTime() !== item.end.getTime()) {
    event.setTime(item.start, item.end);
  }
  if ((event.getLocation() || '') !== location) event.setLocation(location);
  setManagedEventTags_(event, stateKey);
  if ((event.getDescription() || '') !== description) event.setDescription(description);
  applyEventReminders_(event, settings);
  return event.getId();
}

function updateCalendarOutlineFields_(calendar, eventId, item, stateKey, settings, expectedOldStateKey, options) {
  const event = calendar.getEventById(eventId);
  if (!event) {
    return createCalendarEventIdempotent_(calendar, item, stateKey, settings).getId();
  }
  if (!isManagedEvent_(event, expectedOldStateKey) &&
      !isManagedEvent_(event, stateKey)) {
    throw new Error(
      '[ACTION_REQUIRED] 課綱要更新的事件已失去管理標記，系統已保留原事件並停止修改：' +
      item.originalTitle + '（' + item.dateKey + '）。'
    );
  }
  const title = buildEventTitle_(item, settings);
  const location = buildEventLocation_(item);
  const description = buildManagedDescription_(item, stateKey, settings);
  if (event.getTitle() !== title) event.setTitle(title);
  if ((event.getLocation() || '') !== location) event.setLocation(location);
  setManagedEventTags_(event, stateKey);
  if ((event.getDescription() || '') !== description) event.setDescription(description);
  return event.getId();
}

function migrateCalendarEventMetadata_(calendar, eventId, item, stateKey, settings, expectedOldStateKey) {
  const event = calendar.getEventById(eventId);
  if (!event) {
    return createCalendarEventIdempotent_(calendar, item, stateKey, settings).getId();
  }
  if (!isManagedEvent_(event, expectedOldStateKey) &&
      !isManagedEvent_(event, stateKey)) {
    throw new Error(
      '[ACTION_REQUIRED] 要遷移的事件已失去管理標記，系統已保留原事件並停止修改：' +
      item.originalTitle + '（' + item.dateKey + '）。'
    );
  }
  const title = buildEventTitle_(item, settings);
  const location = buildEventLocation_(item);
  const description = buildManagedDescription_(item, stateKey, settings);
  setManagedEventTags_(event, stateKey);
  if (event.getTitle() !== title) event.setTitle(title);
  if ((event.getLocation() || '') !== location) event.setLocation(location);
  if ((event.getDescription() || '') !== description) event.setDescription(description);
  return event.getId();
}

function deleteCalendarEvent_(calendar, eventId, stateKey) {
  if (!eventId) return false;
  const event = calendar.getEventById(eventId);
  if (!event) return false;
  if (!isManagedEvent_(event, stateKey)) {
    throw new Error(
      '[ACTION_REQUIRED] 事件的管理標記已被移除或不相符，系統已保留它並停止刪除。'
    );
  }
  event.deleteEvent();
  return true;
}

function isManagedEvent_(event, stateKey) {
  const managedTag = getEventTagSafe_(event, MANAGED_EVENT_TAG_KEY);
  if (managedTag === MANAGED_EVENT_TAG_VALUE) {
    return !stateKey ||
      getEventTagSafe_(event, SYNC_ID_EVENT_TAG_KEY) === hashText_(stateKey);
  }

  // 向下相容：既有部署曾把識別資訊寫在說明欄。
  const description = String(event.getDescription() || '');
  const hasManagedMarker = description.indexOf(MANAGED_MARKER) !== -1;
  if (!hasManagedMarker) return false;
  if (!stateKey || description.indexOf('同步識別碼：' + hashText_(stateKey)) !== -1) return true;
  return (description.indexOf(DESCRIPTION_MARKER) !== -1 || description.indexOf(LEGACY_DESCRIPTION_MARKER) !== -1) &&
    /來源儲存格：[A-Z]+\\d+/.test(description) &&
    description.indexOf('原始內容：') !== -1;
}

function setManagedEventTags_(event, stateKey) {
  // 最後才寫 managed flag。若中途逾時，下一次可用完整內容接回尚未完成標記的事件。
  event.setTag(SYNC_ID_EVENT_TAG_KEY, hashText_(stateKey));
  event.setTag(METADATA_VERSION_EVENT_TAG_KEY, String(EVENT_METADATA_VERSION));
  event.setTag(MANAGED_EVENT_TAG_KEY, MANAGED_EVENT_TAG_VALUE);
}

function getEventTagSafe_(event, key) {
  if (!event || typeof event.getTag !== 'function') return '';
  try {
    return String(event.getTag(key) || '');
  } catch (error) {
    return '';
  }
}

function calendarEventMatchesExpectedContent_(event, item, stateKey, settings) {
  if (!event || event.isAllDayEvent() !== Boolean(item.isAllDay)) return false;
  if (event.getTitle() !== buildEventTitle_(item, settings)) return false;
  if ((event.getLocation() || '') !== buildEventLocation_(item)) return false;
  if ((event.getDescription() || '') !== buildManagedDescription_(item, stateKey, settings)) return false;
  if (item.isAllDay) {
    return formatDateKey_(event.getAllDayStartDate()) === item.dateKey;
  }
  return event.getStartTime().getTime() === item.start.getTime() &&
    event.getEndTime().getTime() === item.end.getTime();
}

function applyEventReminders_(event, settings) {
  event.removeAllReminders();
  if (settings.reminderMode === 'popup') event.addPopupReminder(settings.reminderMinutes);
  if (settings.reminderMode === 'email') event.addEmailReminder(settings.reminderMinutes);
}

function buildEventLocation_(item) {
  const outline = item && item.courseOutline;
  const values = [item && item.location, outline && outline.classroom];
  const seen = {};
  return values.map(normalizeText_).filter(value => {
    if (!value) return false;
    const key = normalizeTitle_(value);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  }).join('-');
}

function buildEventTitle_(item) {
  const baseTitle = item.type === 'activity'
    ? '活動｜' + item.originalTitle
    : item.originalTitle;
  const location = buildEventLocation_(item);
  return location ? baseTitle + ' [' + location + ']' : baseTitle;
}

function buildManagedDescription_(item, stateKey, settings) {
  const outline = item && item.courseOutline || {};
  const displayLocation = buildEventLocation_(item);
  const values = {
    course: item.originalTitle,
    date: item.dateKey.replace(/-/g, '/'),
    weekday: item.weekday,
    week: String(item.weekNum),
    period: item.isAllDay ? '全天' : (item.periodStart === item.periodEnd ? String(item.periodStart) : item.periodStart + '–' + item.periodEnd),
    startTime: item.isAllDay ? '全天' : item.startTime,
    endTime: item.isAllDay ? '全天' : item.endTime,
    location: item.location || '未註明',
    classroom: outline.classroom || '',
    displayLocation: displayLocation || '未註明',
    topic: outline.topic || '',
    content: outline.content || '',
    sourceUpdatedAt: item.sourceUpdatedLabel || '未提供'
  };
  const customTemplate = String(settings.customDescription || '').trim();
  const body = settings.descriptionPreset === 'custom' &&
      customTemplate &&
      customTemplate !== STANDARD_DESCRIPTION_TEMPLATE
    ? renderDescriptionTemplateHtml_(customTemplate, values)
    : buildStandardDescriptionHtml_(values);
  const footer = escapeDescriptionHtml_(VISIBLE_DESCRIPTION_FOOTER);
  const outlineDisclaimer = hasCourseOutlineInformation_(item)
    ? '<br>' + escapeDescriptionHtml_(COURSE_OUTLINE_DISCLAIMER)
    : '';
  return body + '<br><br><br>' + footer + outlineDisclaimer;
}

function hasCourseOutlineInformation_(item) {
  const outline = item && item.courseOutline;
  return Boolean(outline && (outline.classroom || outline.topic || outline.content));
}

function buildStandardDescriptionHtml_(values) {
  const lines = [
    '第 ' + escapeDescriptionHtml_(values.week) +
      ' 週 / 週' + escapeDescriptionHtml_(values.weekday) +
      ' / ' + (values.period === '全天'
        ? '全天'
        : '第 ' + escapeDescriptionHtml_(values.period) + ' 節')
  ];
  if (values.topic) {
    lines.push('', '<b># 單元主題</b>', escapeDescriptionHtml_(values.topic));
  }
  if (values.content) {
    lines.push('', '<b># 課程內容</b>', escapeDescriptionHtml_(values.content));
  }
  return lines.join('<br>');
}

function renderDescriptionTemplateHtml_(template, values) {
  const safeTemplate = escapeDescriptionHtml_(template);
  return safeTemplate
    .replace(/\\{([A-Za-z]+)\\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(values, key)
        ? escapeDescriptionTemplateValueHtml_(values[key])
        : match
    )
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<b>$1</b>')
    .replace(/\\r?\\n/g, '<br>')
    .trim();
}

function escapeDescriptionHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeDescriptionTemplateValueHtml_(value) {
  return escapeDescriptionHtml_(value).replace(/\\*/g, '&#42;');
}

function renderTemplate_(template, values) {
  return String(template || '').replace(/\\{([A-Za-z]+)\\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );
}

function makeOccurrenceKey_(item) {
  return [normalizeTitle_(item.originalTitle), item.dateKey, item.isAllDay ? 'all-day' : item.periodStart, item.isAllDay ? 'all-day' : item.periodEnd, normalizeTitle_(item.location)].join('|');
}

function makeBaseEventSignature_(item, settings) {
  return hashText_(makeBaseEventSignaturePayload_(item, settings));
}

function makeBaseEventSignaturePayload_(item, settings) {
  return JSON.stringify([
    item.originalTitle, item.type, item.isAllDay, item.dateKey, item.periodStart, item.periodEnd,
    eventDateIso_(item.start), eventDateIso_(item.end), item.location,
    settings.descriptionPreset, settings.customDescription,
    settings.reminderMode, settings.reminderMinutes
  ]);
}

function makeEventSignature_(item, settings) {
  const payload = makeBaseEventSignaturePayload_(item, settings);
  return hashText_(item.outlineHash ? payload + '|outline:' + item.outlineHash : payload);
}

function eventDateIso_(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function storedBaseSignatureMatches_(oldItem, newItem, settings) {
  const expected = makeBaseEventSignature_(newItem, settings);
  if (oldItem.baseSyncSignature === expected) return true;
  if (Number(oldItem.signatureVersion) >= 2) return false;
  if (!oldItem.start || !oldItem.end) return false;
  const legacyPayload = makeBaseEventSignaturePayload_(oldItem, settings);
  return oldItem.baseSyncSignature === legacyPayload ||
    (!oldItem.baseSyncSignature && oldItem.syncSignature === legacyPayload);
}

function needsEventMetadataMigration_(oldItem) {
  return Number(oldItem.metadataVersion) !== EVENT_METADATA_VERSION;
}

function storedEventContentSignatureMatches_(oldItem, newItem, settings) {
  const expected = makeEventSignature_(newItem, settings);
  if (oldItem.syncSignature === expected) return true;
  if (Number(oldItem.signatureVersion) >= 2) return false;
  if (!oldItem.start || !oldItem.end) return false;
  const legacyPayload = makeBaseEventSignaturePayload_(oldItem, settings);
  const legacySignature = oldItem.outlineHash
    ? legacyPayload + '|outline:' + oldItem.outlineHash
    : legacyPayload;
  return oldItem.syncSignature === legacySignature &&
    hashText_(legacySignature) === expected;
}

function storedEventSignatureMatches_(oldItem, newItem, settings) {
  return !needsEventMetadataMigration_(oldItem) &&
    storedEventContentSignatureMatches_(oldItem, newItem, settings);
}

function serializeStateItem_(item, calendarEventId, signature, settings) {
  return {
    signatureVersion: 2,
    metadataVersion: EVENT_METADATA_VERSION,
    originalTitle: item.originalTitle,
    type: item.type,
    isAllDay: Boolean(item.isAllDay),
    dateKey: item.dateKey,
    weekday: item.weekday,
    weekNum: item.weekNum,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    start: item.start.toISOString(),
    end: item.end.toISOString(),
    startTime: item.startTime,
    endTime: item.endTime,
    location: item.location,
    sourceUpdatedLabel: item.sourceUpdatedLabel,
    stateKey: makeOccurrenceKey_(item),
    calendarEventId,
    syncSignature: signature,
    baseSyncSignature: makeBaseEventSignature_(item, settings),
    outlineHash: item.outlineHash || ''
  };
}

function getConfiguredCourseOutlineSourceSets_(gradeName) {
  const sourceIndex = loadCourseOutlineSourceIndex_();
  const sets = sourceIndex.setsByGrade[sanitizeGrade_(gradeName)];
  return (Array.isArray(sets) ? sets : []).filter(set =>
    set &&
    set.key &&
    /^\\d{4}-\\d{2}-\\d{2}$/.test(set.validFrom) &&
    /^\\d{4}-\\d{2}-\\d{2}$/.test(set.validUntil) &&
    Array.isArray(set.spreadsheetIds) &&
    set.spreadsheetIds.length > 0
  );
}

function resetCourseOutlineSourceIndexRuntimeCache_() {
  courseOutlineSourceIndexRuntimeCache_ = null;
}

function getCourseOutlineIndexHeaders_() {
  return [
    '啟用',
    '來源組鍵',
    '課綱名稱',
    '年級',
    '適用起日',
    '適用迄日',
    '課綱試算表連結'
  ];
}

function findCourseOutlineIndexHeader_(values) {
  const required = getCourseOutlineIndexHeaders_();
  const limit = Math.min(COURSE_OUTLINE_INDEX_HEADER_SCAN_LIMIT, (values || []).length);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const columns = {};
    (values[rowIndex] || []).forEach((value, columnIndex) => {
      const label = String(value == null ? '' : value).trim();
      if (label && !Object.prototype.hasOwnProperty.call(columns, label)) columns[label] = columnIndex;
    });
    if (required.every(label => Object.prototype.hasOwnProperty.call(columns, label))) {
      return { rowIndex, columns };
    }
  }
  throw new Error(
    '課綱來源索引找不到必要欄位：' + required.join('、') + '。'
  );
}

function parseCourseOutlineIndexEnabled_(value, rowNumber) {
  if (value === true) return true;
  if (value === false || value == null || String(value).trim() === '') return false;
  const normalized = String(value).trim().toUpperCase();
  if (normalized === 'TRUE' || normalized === '1' || normalized === '是' || normalized === '啟用') return true;
  if (normalized === 'FALSE' || normalized === '0' || normalized === '否' || normalized === '停用') return false;
  throw new Error('課綱來源索引第 ' + rowNumber + ' 列的「啟用」必須是 TRUE 或 FALSE。');
}

function extractCourseOutlineSpreadsheetId_(value, rowNumber) {
  const url = String(value || '').trim();
  const match = url.match(/^https:\\/\\/docs\\.google\\.com\\/spreadsheets\\/d\\/([A-Za-z0-9_-]+)(?:\\/|$)/);
  if (!match) {
    throw new Error(
      '課綱來源索引第 ' + rowNumber + ' 列的連結不是一般 Google Sheets /edit 網址。'
    );
  }
  return match[1];
}

function parseCourseOutlineSourceIndexValues_(values) {
  const header = findCourseOutlineIndexHeader_(values);
  const groups = {};
  const setsByGrade = { '高一': [], '高二': [], '高三': [] };
  const spreadsheetOrigins = {};

  (values || []).slice(header.rowIndex + 1).forEach((row, offset) => {
    const rowNumber = header.rowIndex + offset + 2;
    const cellValue = label => row ? row[header.columns[label]] : '';
    const read = label => {
      const value = cellValue(label);
      return String(value == null ? '' : value).trim();
    };
    const enabledValue = cellValue('啟用');
    const hasContent = getCourseOutlineIndexHeaders_()
      .some(label => read(label) !== '');
    if (!hasContent || !parseCourseOutlineIndexEnabled_(enabledValue, rowNumber)) return;

    const key = read('來源組鍵');
    const outlineName = read('課綱名稱');
    const gradeName = read('年級');
    const validFrom = read('適用起日');
    const validUntil = read('適用迄日');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,80}$/.test(key)) {
      throw new Error('課綱來源索引第 ' + rowNumber + ' 列的「來源組鍵」格式不正確。');
    }
    if (!outlineName) throw new Error('課綱來源索引第 ' + rowNumber + ' 列缺少「課綱名稱」。');
    if (['高一', '高二', '高三'].indexOf(gradeName) === -1) {
      throw new Error('課綱來源索引第 ' + rowNumber + ' 列的年級必須是高一、高二或高三。');
    }
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(validFrom) ||
        !/^\\d{4}-\\d{2}-\\d{2}$/.test(validUntil) ||
        validFrom > validUntil) {
      throw new Error('課綱來源索引第 ' + rowNumber + ' 列的適用日期格式或範圍不正確。');
    }

    const spreadsheetId = extractCourseOutlineSpreadsheetId_(
      read('課綱試算表連結'),
      rowNumber
    );
    if (spreadsheetOrigins[spreadsheetId]) {
      throw new Error(
        '課綱來源索引的試算表連結重複出現在第 ' +
        spreadsheetOrigins[spreadsheetId] + '、' + rowNumber + ' 列。'
      );
    }
    spreadsheetOrigins[spreadsheetId] = rowNumber;

    let sourceSet = groups[key];
    if (!sourceSet) {
      sourceSet = {
        key,
        label: '',
        outlineNames: [],
        validFrom,
        validUntil,
        spreadsheetIds: []
      };
      groups[key] = sourceSet;
      setsByGrade[gradeName].push(sourceSet);
      sourceSet.gradeName = gradeName;
    } else if (sourceSet.gradeName !== gradeName ||
               sourceSet.validFrom !== validFrom ||
               sourceSet.validUntil !== validUntil) {
      throw new Error(
        '課綱來源索引中的來源組「' + key + '」必須使用相同年級與適用日期。'
      );
    }
    sourceSet.outlineNames.push(outlineName);
    sourceSet.spreadsheetIds.push(spreadsheetId);
  });

  Object.keys(groups).forEach(key => {
    const sourceSet = groups[key];
    sourceSet.outlineNames = uniqueExactStrings_(sourceSet.outlineNames);
    sourceSet.label = sourceSet.outlineNames.join('、') || sourceSet.key;
    delete sourceSet.gradeName;
  });

  return {
    setsByGrade,
    fingerprint: hashText_(JSON.stringify(setsByGrade))
  };
}

function assertCourseOutlineSourceIndexPayload_(payload) {
  if (!payload || !payload.setsByGrade || typeof payload.setsByGrade !== 'object') {
    throw new Error('課綱來源索引快取格式不正確。');
  }
  ['高一', '高二', '高三'].forEach(gradeName => {
    const sets = payload.setsByGrade[gradeName];
    if (!Array.isArray(sets)) throw new Error('課綱來源索引缺少' + gradeName + '資料。');
    sets.forEach(set => {
      if (!set || !set.key ||
          !/^\\d{4}-\\d{2}-\\d{2}$/.test(set.validFrom) ||
          !/^\\d{4}-\\d{2}-\\d{2}$/.test(set.validUntil) ||
          !Array.isArray(set.spreadsheetIds) ||
          !set.spreadsheetIds.length) {
        throw new Error('課綱來源索引快取包含無效來源組。');
      }
    });
  });
  return payload;
}

function readCourseOutlineSourceIndexSpreadsheet_() {
  const spreadsheet = SpreadsheetApp.openById(COURSE_OUTLINE_INDEX_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(COURSE_OUTLINE_INDEX_SHEET_NAME);
  if (!sheet) throw new Error('課綱來源索引缺少「' + COURSE_OUTLINE_INDEX_SHEET_NAME + '」分頁。');
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (!lastRow || !lastColumn) throw new Error('課綱來源索引沒有可讀取的資料。');
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  return parseCourseOutlineSourceIndexValues_(values);
}

function loadCourseOutlineSourceIndex_() {
  if (courseOutlineSourceIndexRuntimeCache_) return courseOutlineSourceIndexRuntimeCache_;

  try {
    const live = readCourseOutlineSourceIndexSpreadsheet_();
    const payload = assertCourseOutlineSourceIndexPayload_({
      setsByGrade: live.setsByGrade,
      fingerprint: live.fingerprint,
      refreshedAt: new Date().toISOString()
    });
    courseOutlineSourceIndexRuntimeCache_ = Object.assign({}, payload, {
      source: 'live',
      warning: ''
    });
    try {
      writeChunkedJson_(COURSE_OUTLINE_INDEX_CACHE_STORE, payload);
    } catch (cacheError) {
      if (typeof Logger !== 'undefined' && Logger &&
          typeof Logger.log === 'function') {
        Logger.log('課綱來源索引快取保存失敗：' + cacheError.message);
      }
    }
    return courseOutlineSourceIndexRuntimeCache_;
  } catch (liveError) {
    try {
      const cached = readChunkedJson_(COURSE_OUTLINE_INDEX_CACHE_STORE, null);
      assertCourseOutlineSourceIndexPayload_(cached);
      courseOutlineSourceIndexRuntimeCache_ = Object.assign({}, cached, {
        source: 'last_success',
        warning: '中央課綱索引暫時無法讀取，已沿用最後成功版本：' + liveError.message
      });
      return courseOutlineSourceIndexRuntimeCache_;
    } catch (cacheError) {
      const fallback = assertCourseOutlineSourceIndexPayload_({
        setsByGrade: JSON.parse(JSON.stringify(COURSE_OUTLINE_SOURCE_SETS_BY_GRADE)),
        fingerprint: hashText_(JSON.stringify(COURSE_OUTLINE_SOURCE_SETS_BY_GRADE)),
        refreshedAt: ''
      });
      courseOutlineSourceIndexRuntimeCache_ = Object.assign({}, fallback, {
        source: 'embedded_fallback',
        warning: '中央課綱索引尚未成功讀取，暫時使用內建 114-2 來源：' + liveError.message
      });
      return courseOutlineSourceIndexRuntimeCache_;
    }
  }
}

function isDateInCourseOutlineSourceSet_(dateKey, sourceSet) {
  return Boolean(dateKey && sourceSet && dateKey >= sourceSet.validFrom && dateKey <= sourceSet.validUntil);
}

function getRelevantCourseOutlineSourceSets_(gradeName, events) {
  const datedEvents = (events || []).filter(event => event && event.type === 'course' && !event.isAllDay && event.dateKey);
  return getConfiguredCourseOutlineSourceSets_(gradeName)
    .filter(sourceSet => datedEvents.some(event => isDateInCourseOutlineSourceSet_(event.dateKey, sourceSet)));
}

function makeCourseOutlineSourceSetsFingerprint_(sourceSets) {
  return hashText_(JSON.stringify((sourceSets || []).map(sourceSet => [
    sourceSet.key,
    sourceSet.validFrom,
    sourceSet.validUntil,
    sourceSet.spreadsheetIds
  ])));
}

function makeCourseOutlineContextFingerprint_(settings, source, events, sourceSets) {
  const courseNames = uniqueExactStrings_((events || [])
    .filter(event => event && event.type === 'course' && !event.isAllDay)
    .map(event => event.originalTitle))
    .sort();
  return hashText_(JSON.stringify([
    settings.gradeName,
    source && source.termKey || '',
    courseNames,
    makeCourseOutlineSourceSetsFingerprint_(sourceSets)
  ]));
}

function makeCourseOutlineOccurrenceKey_(sheetName, dateKey, periodStart, periodEnd) {
  return JSON.stringify([String(sheetName || ''), dateKey, Number(periodStart), Number(periodEnd)]);
}

function enrichEventsWithCourseOutlines_(events, settings, source) {
  const desiredEvents = events || [];
  const sourceSets = getRelevantCourseOutlineSourceSets_(settings.gradeName, desiredEvents);
  if (!sourceSets.length) return desiredEvents;
  const snapshot = readActiveCourseOutlineSnapshot_();
  if (!snapshot || snapshot.schemaVersion !== COURSE_OUTLINE_CACHE_SCHEMA_VERSION) return desiredEvents;
  if (snapshot.gradeName !== settings.gradeName ||
      snapshot.termKey !== (source && source.termKey || '') ||
      snapshot.sourceSetsFingerprint !== makeCourseOutlineSourceSetsFingerprint_(sourceSets)) {
    return desiredEvents;
  }
  return attachCourseOutlineLookup_(desiredEvents, snapshot.lookup || {});
}

function attachCourseOutlineLookup_(events, lookup) {
  return (events || []).map(event => {
    if (!event || event.type !== 'course' || event.isAllDay) return event;
    const key = makeCourseOutlineOccurrenceKey_(event.originalTitle, event.dateKey, event.periodStart, event.periodEnd);
    const outline = lookup && lookup[key];
    if (!outline || !outline.hash) return event;
    return Object.assign({}, event, {
      courseOutline: {
        classroom: outline.classroom || '',
        topic: outline.topic || '',
        content: outline.content || ''
      },
      outlineHash: outline.hash
    });
  });
}

function findCourseOutlineColumns_(values) {
  const required = ['日期', '節次', '實體課程教室', '單元主題', '課程內容'];
  const optional = ['實體', '線上', '非同步'];
  const limit = Math.min(COURSE_OUTLINE_HEADER_SCAN_LIMIT, (values || []).length);

  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const columns = {};
    (values[rowIndex] || []).forEach((value, columnIndex) => {
      const name = normalizeCourseOutlineHeader_(value);
      if (required.indexOf(name) !== -1 || optional.indexOf(name) !== -1) columns[name] = columnIndex;
    });
    if (required.every(name => Object.prototype.hasOwnProperty.call(columns, name))) {
      return { headerRowIndex: rowIndex, columns };
    }
  }

  return null;
}

function normalizeCourseOutlineHeader_(value) {
  return String(value == null ? '' : value).replace(/[\\s\\u3000]+/g, '').trim();
}

function resolveCourseOutlineDateKey_(value, candidateDateKeys) {
  const candidates = uniqueExactStrings_(candidateDateKeys || []);
  const numbers = String(value == null ? '' : value).match(/\\d+/g);
  if (!numbers || numbers.length < 2) return '';

  if (numbers.length >= 3) {
    let year = Number(numbers[0]);
    const month = Number(numbers[1]);
    const day = Number(numbers[2]);
    if (year > 0 && year < 1911) year += 1911;
    const direct = year + '-' + pad2_(month) + '-' + pad2_(day);
    return candidates.indexOf(direct) !== -1 ? direct : '';
  }

  const suffix = '-' + pad2_(Number(numbers[0])) + '-' + pad2_(Number(numbers[1]));
  const matches = candidates.filter(dateKey => String(dateKey).slice(-6) === suffix);
  return matches.length === 1 ? matches[0] : '';
}

function parseCourseOutlinePeriod_(value) {
  const text = normalizeText_(value).replace(/[第節]/g, '').trim();
  if (!text) return null;
  let numbers = text.match(/\\d+/g);
  if (!numbers || !numbers.length) return null;

  if (numbers.length === 1 && /^\\d{2}$/.test(numbers[0])) {
    numbers = [numbers[0].charAt(0), numbers[0].charAt(1)];
  }

  const periodStart = Number(numbers[0]);
  const periodEnd = Number(numbers[numbers.length - 1]);
  if (!Number.isInteger(periodStart) || !Number.isInteger(periodEnd) ||
      periodStart < 1 || periodEnd > 8 || periodEnd < periodStart) {
    return null;
  }
  return { periodStart, periodEnd };
}

function parseCourseOutlineHours_(value) {
  const match = String(value == null ? '' : value).replace(/,/g, '').match(/-?\\d+(?:\\.\\d+)?/);
  return match ? Number(match[0]) || 0 : 0;
}

function isPureAsynchronousCourseOutlineRow_(row, columns) {
  if (!Object.prototype.hasOwnProperty.call(columns, '非同步')) return false;
  const asynchronous = parseCourseOutlineHours_(row[columns['非同步']]);
  const physical = Object.prototype.hasOwnProperty.call(columns, '實體')
    ? parseCourseOutlineHours_(row[columns['實體']])
    : 0;
  const online = Object.prototype.hasOwnProperty.call(columns, '線上')
    ? parseCourseOutlineHours_(row[columns['線上']])
    : 0;
  return asynchronous > 0 && physical <= 0 && online <= 0;
}

function expandVerticalMergedCourseOutlineValues_(values, mergedRanges) {
  const expanded = (values || []).map(row => (row || []).slice());
  (mergedRanges || []).forEach(mergedRange => {
    const rowCount = Number(mergedRange.getNumRows()) || 0;
    const columnCount = Number(mergedRange.getNumColumns()) || 0;
    if (rowCount <= 1 || columnCount !== 1) return;
    const startRow = Number(mergedRange.getRow()) - 1;
    const startColumn = Number(mergedRange.getColumn()) - 1;
    if (startRow < 0 || startColumn < 0 || !expanded[startRow]) return;
    const mergedValue = typeof mergedRange.getDisplayValue === 'function'
      ? mergedRange.getDisplayValue()
      : expanded[startRow][startColumn];
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
      const rowIndex = startRow + rowOffset;
      if (expanded[rowIndex] && startColumn < expanded[rowIndex].length) {
        expanded[rowIndex][startColumn] = mergedValue;
      }
    }
  });
  return expanded;
}

function parseCourseOutlineSheetValues_(values, sheetName, desiredEvents, sourceInfo) {
  const header = findCourseOutlineColumns_(values);
  if (!header) throw new Error('課綱分頁「' + sheetName + '」找不到必要欄位。');
  const candidates = uniqueExactStrings_((desiredEvents || []).map(event => event.dateKey));
  const desiredKeys = {};
  (desiredEvents || []).forEach(event => {
    desiredKeys[makeCourseOutlineOccurrenceKey_(sheetName, event.dateKey, event.periodStart, event.periodEnd)] = true;
  });
  const records = [];

  for (let rowIndex = header.headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const dateKey = resolveCourseOutlineDateKey_(row[header.columns['日期']], candidates);
    const period = parseCourseOutlinePeriod_(row[header.columns['節次']]);
    if (!dateKey || !period || isPureAsynchronousCourseOutlineRow_(row, header.columns)) continue;
    const key = makeCourseOutlineOccurrenceKey_(sheetName, dateKey, period.periodStart, period.periodEnd);
    if (!desiredKeys[key]) continue;
    const classroom = normalizeText_(row[header.columns['實體課程教室']]);
    const topic = normalizeText_(row[header.columns['單元主題']]);
    const content = normalizeText_(row[header.columns['課程內容']]);
    if (!classroom && !topic && !content) continue;
    records.push({
      key,
      sheetName,
      dateKey,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      classroom,
      topic,
      content,
      hash: hashText_(JSON.stringify([classroom, topic, content])),
      sourceSetKey: sourceInfo.sourceSetKey,
      spreadsheetId: sourceInfo.spreadsheetId,
      spreadsheetName: sourceInfo.spreadsheetName,
      rowNumber: rowIndex + 1
    });
  }

  return {
    headerRow: header.headerRowIndex + 1,
    records
  };
}

function collectCourseOutlineSnapshot_(settings, source, desiredEvents, sourceSets) {
  const lookup = {};
  const origins = {};
  const foundSheetNames = {};
  const availableSheetNames = {};
  const desiredCourseNames = uniqueExactStrings_((desiredEvents || [])
    .filter(event => event.type === 'course' && !event.isAllDay)
    .map(event => event.originalTitle));
  const diagnostics = {
    sourceSetCount: sourceSets.length,
    spreadsheetCount: 0,
    scannedSheetCount: 0,
    matchedRecordCount: 0,
    missingSheetNames: [],
    ignoredCrossSchoolSheetNames: [],
    nearMatchSheetNames: [],
    sources: []
  };

  sourceSets.forEach(sourceSet => {
    const setEvents = (desiredEvents || []).filter(event =>
      event.type === 'course' &&
      !event.isAllDay &&
      isDateInCourseOutlineSourceSet_(event.dateKey, sourceSet)
    );
    const setCourseNames = uniqueExactStrings_(setEvents.map(event => event.originalTitle));

    sourceSet.spreadsheetIds.forEach(spreadsheetId => {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const spreadsheetName = spreadsheet.getName();
      const sourceSummary = {
        sourceSetKey: sourceSet.key,
        spreadsheetId,
        spreadsheetName,
        scannedSheets: 0,
        matchedRecords: 0
      };
      diagnostics.spreadsheetCount += 1;

      spreadsheet.getSheets().forEach(sheet => {
        const sheetName = sheet.getName();
        availableSheetNames[sheetName] = true;
        if (setCourseNames.indexOf(sheetName) === -1) return;
        foundSheetNames[sheetName] = true;
        const lastRow = sheet.getLastRow();
        const lastColumn = sheet.getLastColumn();
        if (!lastRow || !lastColumn) throw new Error('課綱分頁「' + sheetName + '」沒有可讀取的資料。');
        const range = sheet.getRange(1, 1, lastRow, lastColumn);
        const values = expandVerticalMergedCourseOutlineValues_(
          range.getDisplayValues(),
          typeof range.getMergedRanges === 'function' ? range.getMergedRanges() : []
        );
        const sheetEvents = setEvents.filter(event => event.originalTitle === sheetName);
        const parsed = parseCourseOutlineSheetValues_(values, sheetName, sheetEvents, {
          sourceSetKey: sourceSet.key,
          spreadsheetId,
          spreadsheetName
        });
        sourceSummary.scannedSheets += 1;
        sourceSummary.matchedRecords += parsed.records.length;
        diagnostics.scannedSheetCount += 1;

        parsed.records.forEach(record => {
          if (lookup[record.key]) {
            const previous = origins[record.key];
            throw new Error(
              '課綱資料重複：' + record.sheetName + ' ' + record.dateKey +
              ' 第 ' + record.periodStart + '–' + record.periodEnd + ' 節（' +
              previous.spreadsheetName + '、' + record.spreadsheetName + '）。'
            );
          }
          lookup[record.key] = {
            classroom: record.classroom,
            topic: record.topic,
            content: record.content,
            hash: record.hash
          };
          origins[record.key] = record;
          diagnostics.matchedRecordCount += 1;
        });
      });

      diagnostics.sources.push(sourceSummary);
    });
  });

  const missing = desiredCourseNames.filter(name => !foundSheetNames[name]);
  diagnostics.ignoredCrossSchoolSheetNames = missing.filter(isCrossSchoolCourseName_);
  diagnostics.missingSheetNames = missing.filter(name => !isCrossSchoolCourseName_(name));
  const allSheetNames = Object.keys(availableSheetNames);
  diagnostics.nearMatchSheetNames = diagnostics.missingSheetNames.map(name => ({
    courseName: name,
    candidates: allSheetNames.filter(sheetName =>
      sheetName !== name && normalizeTitle_(sheetName) === normalizeTitle_(name)
    )
  })).filter(item => item.candidates.length > 0);
  const now = new Date();
  return {
    schemaVersion: COURSE_OUTLINE_CACHE_SCHEMA_VERSION,
    gradeName: settings.gradeName,
    termKey: source.termKey,
    sourceSetKeys: sourceSets.map(sourceSet => sourceSet.key),
    sourceSetsFingerprint: makeCourseOutlineSourceSetsFingerprint_(sourceSets),
    contextFingerprint: makeCourseOutlineContextFingerprint_(settings, source, desiredEvents, sourceSets),
    refreshedAt: now.toISOString(),
    refreshedAtLabel: formatDateTime_(now),
    lookup,
    diagnostics
  };
}

function courseOutlineSnapshotStoreKey_(version) {
  return COURSE_OUTLINE_SNAPSHOT_PREFIX + String(version || '');
}

function readActiveCourseOutlineSnapshot_() {
  const version = PropertiesService.getScriptProperties().getProperty(COURSE_OUTLINE_ACTIVE_VERSION_PROPERTY);
  return version ? readChunkedJson_(courseOutlineSnapshotStoreKey_(version), null) : null;
}

function publishCourseOutlineSnapshot_(snapshot) {
  const properties = PropertiesService.getScriptProperties();
  const previousVersion = properties.getProperty(COURSE_OUTLINE_ACTIVE_VERSION_PROPERTY) || '';
  const previousSnapshot = previousVersion
    ? readChunkedJson_(courseOutlineSnapshotStoreKey_(previousVersion), null)
    : null;
  const version = Date.now() + '_' + hashText_(JSON.stringify(snapshot));
  const storeKey = courseOutlineSnapshotStoreKey_(version);
  writeChunkedJson_(storeKey, snapshot);
  const verified = readChunkedJson_(storeKey, null);
  if (!verified || verified.contextFingerprint !== snapshot.contextFingerprint) {
    clearChunkedStore_(storeKey);
    throw new Error('課綱快照寫入後驗證失敗。');
  }
  properties.setProperty(COURSE_OUTLINE_ACTIVE_VERSION_PROPERTY, version);
  if (previousVersion && previousVersion !== version) clearChunkedStore_(courseOutlineSnapshotStoreKey_(previousVersion));
  cleanupInactiveCourseOutlineSnapshotStores_(version);
  return {
    version,
    changed: !previousSnapshot || hashText_(JSON.stringify(previousSnapshot.lookup || {})) !== hashText_(JSON.stringify(snapshot.lookup || {}))
  };
}

function cleanupInactiveCourseOutlineSnapshotStores_(activeVersion) {
  const properties = PropertiesService.getScriptProperties();
  const prefix = COURSE_OUTLINE_SNAPSHOT_PREFIX;
  properties.getKeys()
    .filter(key => key.indexOf(prefix) === 0 && /_COUNT$/.test(key))
    .map(key => key.slice(0, -6))
    .filter(storeKey => storeKey !== courseOutlineSnapshotStoreKey_(activeVersion))
    .forEach(clearChunkedStore_);
}

function loadCourseOutlineState_() {
  return readChunkedJson_(COURSE_OUTLINE_STATE_STORE, {
    status: 'idle',
    attempt: 0,
    incidentId: '',
    runId: '',
    startedAt: '',
    watchdogTriggerId: '',
    retryTriggerId: '',
    failureNotifiedAt: '',
    notificationPending: false,
    lastError: '',
    lastSuccessAt: ''
  });
}

function saveCourseOutlineState_(state) {
  writeChunkedJson_(COURSE_OUTLINE_STATE_STORE, state);
}

function buildCourseOutlineUiStatus_(settings, source) {
  const sourceIndex = loadCourseOutlineSourceIndex_();
  const configuredSets = getConfiguredCourseOutlineSourceSets_(settings.gradeName);
  const relevantSets = source && Array.isArray(source.events)
    ? getRelevantCourseOutlineSourceSets_(settings.gradeName, source.events)
    : configuredSets;
  const state = loadCourseOutlineState_();
  const snapshot = readActiveCourseOutlineSnapshot_();
  return {
    enabled: relevantSets.length > 0,
    configured: configuredSets.length > 0,
    sourceSetLabels: relevantSets.map(sourceSet => sourceSet.label),
    indexSource: sourceIndex.source || '',
    indexWarning: sourceIndex.warning || '',
    state: state.status || 'idle',
    lastSuccessAt: state.lastSuccessAt || snapshot && snapshot.refreshedAt || '',
    lastSuccessLabel: snapshot && snapshot.refreshedAtLabel || '',
    lastError: state.lastError || '',
    matchedRecordCount: snapshot && snapshot.diagnostics
      ? Number(snapshot.diagnostics.matchedRecordCount) || 0
      : 0,
    missingSheetNames: snapshot && snapshot.diagnostics
      ? snapshot.diagnostics.missingSheetNames || []
      : [],
    nearMatchSheetNames: snapshot && snapshot.diagnostics
      ? snapshot.diagnostics.nearMatchSheetNames || []
      : []
  };
}

function scheduleCourseOutlineRefreshIfNeeded_(settings) {
  const activeSettings = settings || loadSettings_();
  if (!activeSettings.setupComplete || !activeSettings.autoSyncEnabled ||
      !getConfiguredCourseOutlineSourceSets_(activeSettings.gradeName).length) {
    return false;
  }
  const state = loadCourseOutlineState_();
  if (state.status === 'running' || state.status === 'retry_pending') return false;
  return ensureOneTimeTrigger_(COURSE_OUTLINE_ONCE_HANDLER, 60 * 1000);
}

function refreshCourseOutlinesDaily() {
  return runCourseOutlineRefreshAttempt_(1, 'daily');
}

function refreshCourseOutlinesOnce() {
  return runCourseOutlineRefreshAttempt_(1, 'scheduled');
}

function retryCourseOutlineRefresh() {
  return runCourseOutlineRefreshAttempt_(2, 'retry');
}

function refreshCourseOutlinesNow() {
  const result = runCourseOutlineRefreshAttempt_(1, 'manual');
  Logger.log(JSON.stringify(result));
  try {
    const message = result.skipped
      ? result.message
      : (result.ok ? '課綱已更新，行事曆說明將於下一次同步套用。' : '課綱更新失敗，系統已依規則安排重試。');
    SpreadsheetApp.getUi().alert('課綱更新', message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (error) {
    Logger.log('無法顯示課綱更新結果：' + error.message);
  }
  return result;
}

function applyCourseOutlineSnapshotToCalendar() {
  try {
    return syncSchedule_({ reason: 'outline' });
  } catch (error) {
    Logger.log('課綱快照套用至日曆失敗，將由下一次一般同步再試：' + userFacingError_(error));
    return { ok: false, message: userFacingError_(error) };
  }
}

function runCourseOutlineRefreshAttempt_(attempt, reason) {
  const settings = loadSettings_();
  const configuredSets = getConfiguredCourseOutlineSourceSets_(settings.gradeName);
  if (!configuredSets.length) {
    return { ok: true, skipped: true, message: '目前年級尚未設定課綱來源。' };
  }
  if (!settings.setupComplete) {
    return { ok: true, skipped: true, message: '完成第一次同步後才會更新課綱。' };
  }
  if (reason !== 'manual' && !settings.autoSyncEnabled) {
    return { ok: true, skipped: true, message: '自動同步目前已暫停。' };
  }

  flushPendingCourseOutlineFailureNotification_();
  let run = null;
  try {
    run = beginCourseOutlineRefreshRun_(settings, attempt, reason);
    if (!run) return { ok: true, skipped: true, message: '已有課綱更新正在執行或等待重試。' };
    const source = loadSourceContext_(settings.gradeName);
    if (settings.termKey && source.termKey !== settings.termKey) {
      finishCourseOutlineRefreshRun_(run, null);
      return { ok: true, skipped: true, message: '偵測到課表學期轉換，等待使用者重新選課。' };
    }
    const outlineNow = scheduleBusinessNow_();
    const desiredEvents = filterCourseOutlineLookaheadEvents_(
      source.events,
      outlineNow,
      COURSE_OUTLINE_LOOKAHEAD_DAYS
    )
      .filter(event => shouldIncludeEvent_(event, settings))
      .filter(event => event.type === 'course' && !event.isAllDay);
    const sourceSets = getRelevantCourseOutlineSourceSets_(settings.gradeName, desiredEvents);
    if (!sourceSets.length) {
      finishCourseOutlineRefreshRun_(run, null);
      return { ok: true, skipped: true, message: '目前沒有落在已設定課綱期間內的未來課程。' };
    }
    const snapshot = collectCourseOutlineSnapshot_(settings, source, desiredEvents, sourceSets);
    if (loadCourseOutlineState_().runId !== run.runId) {
      return { ok: true, skipped: true, message: '課綱更新已由較新的設定取消。' };
    }
    const published = publishCourseOutlineSnapshot_(snapshot);
    finishCourseOutlineRefreshRun_(run, published.version);
    if (published.changed) ensureOneTimeTrigger_(COURSE_OUTLINE_APPLY_HANDLER, 60 * 1000);
    return {
      ok: true,
      skipped: false,
      matchedRecordCount: snapshot.diagnostics.matchedRecordCount,
      missingSheetNames: snapshot.diagnostics.missingSheetNames,
      nearMatchSheetNames: snapshot.diagnostics.nearMatchSheetNames
    };
  } catch (error) {
    if (run) handleCourseOutlineRefreshFailure_(run, error);
    else Logger.log('課綱更新無法開始：' + userFacingError_(error));
    return { ok: false, skipped: false, message: userFacingError_(error) };
  }
}

function beginCourseOutlineRefreshRun_(settings, attempt, reason) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return null;
  try {
    const state = loadCourseOutlineState_();
    const startedAtMs = Date.parse(state.startedAt || '');
    const isRunningFresh = state.status === 'running' &&
      Number.isFinite(startedAtMs) &&
      Date.now() - startedAtMs < COURSE_OUTLINE_RUNNING_STALE_MS;
    if (isRunningFresh || state.status === 'retry_pending' && reason !== 'retry') return null;
    if (reason === 'retry' && state.retryTriggerId) deleteProjectTriggerById_(state.retryTriggerId);
    if (state.watchdogTriggerId) deleteProjectTriggerById_(state.watchdogTriggerId);

    const incidentId = state.incidentId ||
      hashText_(settings.gradeName + '|' + Date.now() + '|' + Math.random());
    const runId = hashText_(incidentId + '|' + attempt + '|' + Date.now() + '|' + Math.random());
    const watchdog = ScriptApp.newTrigger(COURSE_OUTLINE_WATCHDOG_HANDLER)
      .timeBased()
      .after(COURSE_OUTLINE_WATCHDOG_DELAY_MS)
      .create();
    const next = Object.assign({}, state, {
      status: 'running',
      attempt,
      incidentId,
      runId,
      reason,
      startedAt: new Date().toISOString(),
      watchdogTriggerId: watchdog.getUniqueId(),
      retryTriggerId: reason === 'retry' ? '' : state.retryTriggerId || '',
      lastError: ''
    });
    saveCourseOutlineState_(next);
    return next;
  } finally {
    lock.releaseLock();
  }
}

function finishCourseOutlineRefreshRun_(run, activeVersion) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('無法完成課綱更新狀態寫入。');
  try {
    const state = loadCourseOutlineState_();
    if (state.runId !== run.runId) return;
    if (state.watchdogTriggerId) deleteProjectTriggerById_(state.watchdogTriggerId);
    if (state.retryTriggerId) deleteProjectTriggerById_(state.retryTriggerId);
    saveCourseOutlineState_({
      status: 'idle',
      attempt: 0,
      incidentId: '',
      runId: '',
      startedAt: '',
      watchdogTriggerId: '',
      retryTriggerId: '',
      failureNotifiedAt: '',
      notificationPending: false,
      lastError: '',
      lastSuccessAt: new Date().toISOString(),
      activeVersion: activeVersion || state.activeVersion || ''
    });
  } finally {
    lock.releaseLock();
  }
}

function handleCourseOutlineRefreshFailure_(run, error) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log('課綱失敗狀態無法取得鎖定：' + userFacingError_(error));
    return;
  }
  let shouldNotify = false;
  let incidentId = run.incidentId;
  try {
    const state = loadCourseOutlineState_();
    if (state.runId !== run.runId) return;
    if (state.watchdogTriggerId) deleteProjectTriggerById_(state.watchdogTriggerId);
    const lastError = userFacingError_(error);

    if (Number(run.attempt) < 2) {
      try {
        deleteTriggersByHandlers_([COURSE_OUTLINE_RETRY_HANDLER]);
        const retry = ScriptApp.newTrigger(COURSE_OUTLINE_RETRY_HANDLER)
          .timeBased()
          .after(COURSE_OUTLINE_RETRY_DELAY_MS)
          .create();
        saveCourseOutlineState_(Object.assign({}, state, {
          status: 'retry_pending',
          runId: '',
          startedAt: '',
          watchdogTriggerId: '',
          retryTriggerId: retry.getUniqueId(),
          lastError
        }));
        return;
      } catch (retryError) {
        error = new Error(lastError + '；且無法建立重試觸發器：' + userFacingError_(retryError));
      }
    }

    shouldNotify = !state.failureNotifiedAt;
    saveCourseOutlineState_(Object.assign({}, state, {
      status: 'failed',
      runId: '',
      startedAt: '',
      watchdogTriggerId: '',
      retryTriggerId: '',
      lastError: userFacingError_(error),
      notificationPending: shouldNotify || Boolean(state.notificationPending)
    }));
  } finally {
    lock.releaseLock();
  }
  if (shouldNotify) sendCourseOutlineFailureNotification_(incidentId);
}

function watchCourseOutlineRefresh() {
  const state = loadCourseOutlineState_();
  if (state.status !== 'running' || !state.startedAt) return { ok: true, skipped: true };
  const elapsed = Date.now() - Date.parse(state.startedAt);
  if (!Number.isFinite(elapsed) || elapsed < COURSE_OUTLINE_RUNNING_STALE_MS) {
    return { ok: true, skipped: true };
  }
  handleCourseOutlineRefreshFailure_(state, new Error('課綱讀取超過 Apps Script 單次執行時間，推定已逾時。'));
  return { ok: false, timedOut: true };
}

function sendCourseOutlineFailureNotification_(incidentId) {
  const state = loadCourseOutlineState_();
  if (!state.notificationPending || state.failureNotifiedAt || state.incidentId !== incidentId) return;
  try {
    const snapshot = readActiveCourseOutlineSnapshot_();
    const lastSuccess = snapshot && snapshot.refreshedAtLabel
      ? snapshot.refreshedAtLabel
      : (state.lastSuccessAt ? formatDateTime_(new Date(state.lastSuccessAt)) : '尚無成功快照');
    sendEmail_(
      loadSettings_(),
      'course_outline_failure',
      '課綱更新連續失敗',
      '課綱已嘗試兩次仍無法更新。\\n\\n錯誤：' + (state.lastError || '未知錯誤') +
      '\\n最後成功課綱：' + lastSuccess +
      '\\n\\n基本行程與行事曆同步仍會使用最後成功快照；若沒有快照，則只同步基本行程。',
      {
        message: state.lastError || '未知錯誤',
        lastSuccess
      }
    );
    const latest = loadCourseOutlineState_();
    if (latest.incidentId === incidentId) {
      latest.failureNotifiedAt = new Date().toISOString();
      latest.notificationPending = false;
      saveCourseOutlineState_(latest);
    }
  } catch (mailError) {
    Logger.log('課綱失敗通知寄送失敗，將於後續執行重試：' + mailError.message);
  }
}

function flushPendingCourseOutlineFailureNotification_() {
  const state = loadCourseOutlineState_();
  if (state.notificationPending && !state.failureNotifiedAt && state.incidentId) {
    sendCourseOutlineFailureNotification_(state.incidentId);
  }
}

function loadSourceContext_(gradeName) {
  const payload = fetchSchedulePayload_(gradeName);
  return parseSchedulePayload_(payload, gradeName, scheduleBusinessNow_());
}

function scheduleBusinessNow_() {
  if (HIGH_LOAD_TESTING_ENABLED &&
      typeof HIGH_LOAD_TEST_CONFIG_STORE !== 'undefined') {
    const config = readChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, null);
    if (config && config.simulatedNow) return new Date(config.simulatedNow);
  }
  return new Date();
}

function fetchSchedulePayload_(gradeName) {
  const apiGrade = GRADE_API_NAMES[sanitizeGrade_(gradeName)];
  const response = UrlFetchApp.fetch(SOURCE_API_URL + '?grade=' + encodeURIComponent(apiGrade), {
    followRedirects: true,
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code !== 200) throw new Error('課表來源回應失敗（HTTP ' + code + '）。');
  let payload;
  try { payload = JSON.parse(response.getContentText('UTF-8')); }
  catch (error) { throw new Error('課表來源不是有效的 JSON。'); }
  assertSourcePayload_(payload, apiGrade);
  return payload;
}

function assertSourcePayload_(payload, expectedGrade) {
  if (!payload || typeof payload !== 'object') throw new Error('課表來源沒有回傳可讀取的資料。');
  if (payload.currentGrade !== expectedGrade) throw new Error('課表來源回傳了錯誤的年級。');
  if (!Array.isArray(payload.tableData) || payload.tableData.length < 10) throw new Error('課表來源缺少完整表格。');
  if (!Array.isArray(payload.weekDataList) || payload.weekDataList.length === 0) throw new Error('課表來源缺少週次。');
}

function parseSchedulePayload_(payload, gradeName, now) {
  const datedHeaders = inferHeaderDates_(payload, now);
  const dateLookup = {};
  datedHeaders.forEach(item => { dateLookup[item.rowIndex + '|' + item.dayIndex] = item.dateKey; });
  const events = [];
  const headerIndexes = [];
  payload.tableData.forEach((row, index) => { if (row && row.isHeader) headerIndexes.push(index); });

  headerIndexes.forEach(headerIndex => {
    const header = payload.tableData[headerIndex];
    const weekNum = Number(header.weekNum) || headerIndexes.indexOf(headerIndex) + 1;
    const bodyRows = payload.tableData.slice(headerIndex + 1, headerIndex + 9);
    if (bodyRows.length < 8) throw new Error('第 ' + weekNum + ' 週缺少節次資料。');
    const times = bodyRows.map(row => parsePeriodTime_(row.cells && row.cells[0] && row.cells[0].value));
    if (times.some(item => !item)) throw new Error('第 ' + weekNum + ' 週包含無法辨識的節次時間。');
    const noteRow = payload.tableData[headerIndex + 9];
    const sourceUpdatedLabel = extractUpdateLabel_(noteRow);
    const occupiedUntil = {};

    bodyRows.forEach((row, periodIndex) => {
      const cells = Array.isArray(row.cells) ? row.cells : [];
      let logicalColumn = 2;

      cells.slice(2).forEach(cell => {
        while (occupiedUntil[logicalColumn] >= periodIndex) logicalColumn += 1;
        if (logicalColumn > 8) return;
        const dayIndex = logicalColumn - 2;
        const rowSpan = Math.max(1, Number(cell.rowSpan) || 1);
        const periodEnd = Math.min(8, periodIndex + rowSpan);
        const dateKey = dateLookup[headerIndex + '|' + dayIndex];

        splitCellEntries_(cell.value).forEach(rawEntry => {
          if (isStructuralValue_(rawEntry)) return;
          const parsed = parseEntry_(rawEntry);
          if (!parsed.title || !dateKey) return;
          events.push({
            originalTitle: parsed.title,
            type: isActivityTitle_(parsed.title) ? 'activity' : 'course',
            isAllDay: false,
            weekNum,
            weekday: WEEKDAY_LABELS[dayIndex],
            dateKey,
            periodStart: periodIndex + 1,
            periodEnd,
            startTime: times[periodIndex].start,
            endTime: times[periodEnd - 1].end,
            start: makeTaipeiDate_(dateKey, times[periodIndex].start),
            end: makeTaipeiDate_(dateKey, times[periodEnd - 1].end),
            location: parsed.location,
            sourceUpdatedLabel
          });
        });

        occupiedUntil[logicalColumn] = periodIndex + rowSpan - 1;
        logicalColumn += 1;
      });
    });

    (noteRow && noteRow.cells || []).slice(2, 9).forEach((cell, dayIndex) => {
      const dateKey = dateLookup[headerIndex + '|' + dayIndex];
      splitCellEntries_(cell.value).forEach(rawEntry => {
        if (isStructuralValue_(rawEntry)) return;
        const parsed = parseEntry_(rawEntry);
        if (!parsed.title || !dateKey || !isActivityTitle_(parsed.title)) return;
        const start = makeTaipeiDate_(dateKey, '00:00');
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        events.push({
          originalTitle: parsed.title,
          type: 'activity',
          isAllDay: true,
          weekNum,
          weekday: WEEKDAY_LABELS[dayIndex],
          dateKey,
          periodStart: 0,
          periodEnd: 0,
          startTime: '',
          endTime: '',
          start,
          end,
          location: parsed.location,
          sourceUpdatedLabel
        });
      });
    });
  });

  const catalogAll = extractCatalogFromPayload_(payload);
  const firstDateKey = datedHeaders[0].dateKey;
  const lastDateKey = datedHeaders[datedHeaders.length - 1].dateKey;
  const termKey = GRADE_API_NAMES[gradeName] + '|' + firstDateKey;
  const sourceUpdatedLabel = latestUpdateLabel_(events.map(event => event.sourceUpdatedLabel));
  const sourceEventRows = events.map(event => [
    event.originalTitle,
    event.type,
    Boolean(event.isAllDay),
    event.dateKey,
    event.periodStart,
    event.periodEnd,
    eventDateIso_(event.start),
    eventDateIso_(event.end),
    event.location || ''
  ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  return {
    gradeName,
    firstDateKey,
    lastDateKey,
    termKey,
    fingerprint: hashText_(JSON.stringify([
      termKey,
      lastDateKey,
      catalogAll.map(item => item.title),
      sourceEventRows
    ])),
    sourceUpdatedLabel,
    sourceStale: isSourceStale_(sourceUpdatedLabel, now),
    catalog: {
      all: catalogAll,
      courses: catalogAll.filter(item => item.type === 'course'),
      activities: catalogAll.filter(item => item.type === 'activity'),
      vacationItems: catalogAll.filter(item => item.period === 'vacation')
    },
    events
  };
}

function getVacationWeekNumbersFromPayload_(payload) {
  const weekNumbers = (payload.weekDataList || [])
    .map(item => Number(item && item.week))
    .filter(Number.isFinite)
    .filter((weekNumber, index, values) => values.indexOf(weekNumber) === index)
    .sort((a, b) => a - b);
  const vacationStartIndex = weekNumbers.findIndex((weekNumber, index) =>
    index > 0 && weekNumber - weekNumbers[index - 1] >= 3
  );
  const vacationWeeks = {};
  if (vacationStartIndex !== -1) {
    weekNumbers.slice(vacationStartIndex).forEach(weekNumber => {
      vacationWeeks[weekNumber] = true;
    });
  }
  return vacationWeeks;
}

function extractCatalogFromPayload_(payload) {
  const catalogMap = {};
  const vacationWeeks = getVacationWeekNumbersFromPayload_(payload);
  (payload.tableData || []).forEach(row => {
    if (!row || row.isHeader || !Array.isArray(row.cells)) return;
    row.cells.forEach(cell => {
      splitCellEntries_(cell && cell.value).forEach(rawEntry => {
        if (isStructuralValue_(rawEntry)) return;
        const parsed = parseEntry_(rawEntry);
        const key = normalizeTitle_(parsed.title);
        if (!key) return;
        const existing = catalogMap[key] || {
          title: parsed.title,
          type: isActivityTitle_(parsed.title) ? 'activity' : 'course',
          hasVacationOccurrence: false
        };
        existing.hasVacationOccurrence =
          existing.hasVacationOccurrence ||
          Boolean(vacationWeeks[Number(row.weekNum)]);
        catalogMap[key] = existing;
      });
    });
  });
  return Object.keys(catalogMap)
    .map(key => ({
      title: catalogMap[key].title,
      type: catalogMap[key].type,
      period: catalogMap[key].hasVacationOccurrence ? 'vacation' : 'term'
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function inferHeaderDates_(payload, now) {
  const records = [];
  payload.tableData.forEach((row, rowIndex) => {
    if (!row || !row.isHeader) return;
    (row.cells || []).slice(2, 9).forEach((cell, dayIndex) => {
      const monthDay = parseMonthDay_(cell.value);
      if (monthDay) records.push({ rowIndex, dayIndex, month: monthDay.month, day: monthDay.day });
    });
  });
  if (records.length < 7) throw new Error('課表日期不足，無法判定學期。');
  const currentYear = Number(Utilities.formatDate(now, TIMEZONE, 'yyyy'));
  let best = null;
  [currentYear - 1, currentYear, currentYear + 1].forEach(year => {
    let activeYear = year;
    let previousMonth = null;
    const dated = records.map(record => {
      if (previousMonth !== null && previousMonth >= 10 && record.month <= 3) activeYear += 1;
      previousMonth = record.month;
      const dateKey = activeYear + '-' + pad2_(record.month) + '-' + pad2_(record.day);
      return Object.assign({}, record, { dateKey, timestamp: Date.parse(dateKey + 'T12:00:00+08:00') });
    });
    const nearest = Math.min.apply(null, dated.map(item => Math.abs(item.timestamp - now.getTime())));
    if (!best || nearest < best.nearest) best = { dated, nearest };
  });
  if (!best || best.nearest > 220 * 24 * 60 * 60 * 1000) throw new Error('課表日期與現在相距過遠，無法安全判定年份。');
  return best.dated;
}

function parseMonthDay_(value) {
  const match = normalizeText_(value).match(/\\(?\\s*(\\d{1,2})\\s*\\/\\s*(\\d{1,2})\\s*\\)?/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { month, day } : null;
}

function parsePeriodTime_(value) {
  const match = normalizeText_(value).replace(/\\n/g, '').match(/(\\d{1,2}:\\d{2})\\s*[~～-]\\s*(\\d{1,2}:\\d{2})/);
  return match ? { start: match[1], end: match[2] } : null;
}

function makeTaipeiDate_(dateKey, time) {
  const date = new Date(dateKey + 'T' + time + ':00+08:00');
  if (isNaN(date.getTime())) throw new Error('課表包含無法辨識的日期或時間。');
  return date;
}

function splitCellEntries_(value) {
  const text = normalizeText_(value);
  return text ? text.split(/\\n[-─━—]{4,}\\n/g).map(normalizeText_).filter(Boolean) : [];
}

function parseEntry_(value) {
  let title = normalizeText_(value);
  const locations = [];
  let match = title.match(/\\s*\\[([^\\]]+)\\]\\s*$/);
  while (match) {
    locations.unshift(normalizeText_(match[1]));
    title = normalizeText_(title.slice(0, match.index));
    match = title.match(/\\s*\\[([^\\]]+)\\]\\s*$/);
  }
  return { title: MANUAL_MERGE_EXCEPTIONS[normalizeTitle_(title)] || title, location: locations.join('、') };
}

function isStructuralValue_(value) {
  const text = normalizeText_(value);
  return !text || /^第\\s*\\d+\\s*週$/.test(text) || /^星期[一二三四五六日]/.test(text) || /^[1-8]$/.test(text) || text === '節次' || text === '備註' || text.indexOf('更新時間') === 0 || /^\\d{1,2}:\\d{2}/.test(text);
}

function isActivityTitle_(title) {
  return ACTIVITY_PATTERNS.some(pattern => pattern.test(normalizeText_(title)));
}

function isCrossSchoolCourseName_(title) {
  return /跨校/.test(normalizeText_(title));
}

function extractUpdateLabel_(row) {
  let result = '';
  (row && row.cells || []).forEach(cell => {
    const match = normalizeText_(cell.value).match(/^更新時間\\n?(\\d{8})/);
    if (match && match[1] > result) result = match[1];
  });
  return result;
}

function latestUpdateLabel_(values) {
  return values.filter(Boolean).sort().pop() || '';
}

function isSourceStale_(label, now) {
  if (!/^\\d{8}$/.test(label)) return true;
  const month = Number(label.slice(0, 2));
  const day = Number(label.slice(2, 4));
  const currentYear = Number(Utilities.formatDate(now, TIMEZONE, 'yyyy'));
  let candidate = new Date(currentYear + '-' + pad2_(month) + '-' + pad2_(day) + 'T12:00:00+08:00');
  if (candidate.getTime() - now.getTime() > 60 * 24 * 60 * 60 * 1000) candidate = new Date((currentYear - 1) + '-' + pad2_(month) + '-' + pad2_(day) + 'T12:00:00+08:00');
  return now.getTime() - candidate.getTime() > 30 * 24 * 60 * 60 * 1000;
}

function loadSettings_() {
  const stored = readChunkedJson_(SETTINGS_STORE, null);
  const settings = Object.assign({}, DEFAULT_SETTINGS, stored || {});
  settings.schemaVersion = SETTINGS_SCHEMA_VERSION;
  settings.selectedCourses = uniqueStrings_(settings.selectedCourses || []);
  settings.excludedActivities = uniqueStrings_(settings.excludedActivities || []);
  settings.knownTitles = uniqueStrings_(settings.knownTitles || []);
  settings.pendingTitles = uniqueStrings_(settings.pendingTitles || []);
  settings.excludedTitles = uniqueStrings_(settings.excludedTitles || []);
  if (settings.pendingTermKey &&
      typeof settings.autoSyncEnabledBeforeTermTransition !== 'boolean') {
    settings.autoSyncEnabledBeforeTermTransition = true;
  }
  settings.termTransitionNoticeAttempts =
    Math.max(0, Number(settings.termTransitionNoticeAttempts) || 0);
  settings.termTransitionNoticeSentAt =
    String(settings.termTransitionNoticeSentAt || '');
  settings.termTransitionNoticeLastError =
    String(settings.termTransitionNoticeLastError || '');
  const customDescriptionSelected = settings.descriptionPreset === 'custom';
  settings.descriptionPreset = customDescriptionSelected ? 'custom' : 'standard';
  settings.customDescription = String(
    settings.customDescription || STANDARD_DESCRIPTION_TEMPLATE
  ).slice(0, 4000);
  return settings;
}

function loadSyncState_() {
  let state = readChunkedJson_(SYNC_STATE_STORE, null);
  const properties = PropertiesService.getScriptProperties();

  if (state === null) {
    const legacyRaw = properties.getProperty('SYNC_STATE');
    if (legacyRaw) {
      try { state = JSON.parse(legacyRaw); } catch (error) { state = {}; }
    }
  }

  const normalized = normalizeStoredState_(state || {});
  if (properties.getProperty('SYNC_STATE')) {
    writeChunkedJson_(SYNC_STATE_STORE, normalized);
    properties.deleteProperty('SYNC_STATE');
  }
  return normalized;
}

function normalizeStoredState_(state) {
  const result = {};
  Object.keys(state || {}).forEach(key => {
    const item = state[key] || {};
    const start = item.start ? new Date(item.start) : (item.date ? new Date(item.date) : null);
    const dateKey = item.dateKey || (start && !isNaN(start.getTime()) ? formatDateKey_(start) : '');
    const periodStart = Number(item.periodStart) || 0;
    const periodEnd = Number(item.periodEnd) || periodStart;
    const isAllDay = Boolean(item.isAllDay);
    if (!item.originalTitle || !dateKey || (!isAllDay && !periodStart) || !item.calendarEventId) return;
    const normalizedKey = [normalizeTitle_(item.originalTitle), dateKey, isAllDay ? 'all-day' : periodStart, isAllDay ? 'all-day' : periodEnd, normalizeTitle_(item.location)].join('|');
    result[normalizedKey] = Object.assign({}, item, {
      dateKey,
      periodStart,
      periodEnd,
      isAllDay,
      stateKey: normalizedKey
    });
  });
  return result;
}

function pruneExpiredSyncState_(state, now) {
  const cutoff = new Date(now || new Date());
  cutoff.setDate(cutoff.getDate() - SYNC_STATE_PAST_RETENTION_DAYS);
  const cutoffKey = formatDateKey_(cutoff);
  return Object.keys(state || {}).reduce((result, key) => {
    if (state[key] && state[key].dateKey >= cutoffKey) result[key] = state[key];
    return result;
  }, {});
}

function saveSettings_(settings) {
  writeChunkedJson_(SETTINGS_STORE, settings);
}

function loadStatus_() {
  return readChunkedJson_(STATUS_STORE, { ok: null, message: '完成設定後即可開始同步。', eventCount: 0 });
}

function writeSyncProgress_(percent, message, state, detail) {
  writeChunkedJson_(SYNC_PROGRESS_STORE, Object.assign({
    state: state || 'running',
    percent: Math.max(0, Math.min(100, Number(percent) || 0)),
    message: String(message || '正在同步…'),
    updatedAt: new Date().toISOString()
  }, detail || {}));
}

function readChunkedJson_(key, fallback) {
  const properties = PropertiesService.getScriptProperties();
  const count = Number(properties.getProperty(key + '_COUNT')) || 0;
  if (!count) return fallback;
  let raw = '';
  for (let index = 0; index < count; index += 1) raw += properties.getProperty(key + '_' + index) || '';
  try { return JSON.parse(raw); } catch (error) { return fallback; }
}

function writeChunkedJson_(key, value) {
  const properties = PropertiesService.getScriptProperties();
  const raw = JSON.stringify(value);
  const chunks = splitUtf8Chunks_(raw, SCRIPT_PROPERTY_CHUNK_SAFE_BYTES);
  const oldCount = Number(properties.getProperty(key + '_COUNT')) || 0;
  const updates = {};
  chunks.forEach((chunk, index) => { updates[key + '_' + index] = chunk; });
  updates[key + '_COUNT'] = String(chunks.length);
  if (typeof properties.getProperties === 'function') {
    const existing = properties.getProperties();
    let estimatedBytes = 0;
    Object.keys(existing).forEach(propertyKey => {
      if (propertyKey === key + '_COUNT' ||
          propertyKey.indexOf(key + '_') === 0 && /^\\d+$/.test(propertyKey.slice(key.length + 1))) {
        return;
      }
      estimatedBytes += utf8ByteLength_(propertyKey) + utf8ByteLength_(existing[propertyKey]);
    });
    Object.keys(updates).forEach(propertyKey => {
      estimatedBytes += utf8ByteLength_(propertyKey) + utf8ByteLength_(updates[propertyKey]);
    });
    if (estimatedBytes > SCRIPT_PROPERTIES_SAFE_BUDGET_BYTES) {
      throw new Error(
        '[ACTION_REQUIRED] 同步狀態接近 Apps Script 儲存上限，系統已停止寫入以免狀態損壞。' +
        '請先保留畫面並聯絡維護者。'
      );
    }
  }
  properties.setProperties(updates, false);
  for (let index = chunks.length; index < oldCount; index += 1) properties.deleteProperty(key + '_' + index);
}

function splitUtf8Chunks_(value, maxBytes) {
  const text = String(value == null ? '' : value);
  const limit = Math.max(4, Number(maxBytes) || SCRIPT_PROPERTY_CHUNK_SAFE_BYTES);
  const chunks = [];
  let start = 0;
  let index = 0;
  let chunkBytes = 0;

  while (index < text.length) {
    const first = text.charCodeAt(index);
    const width = first >= 0xD800 && first <= 0xDBFF &&
      index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xDC00 &&
      text.charCodeAt(index + 1) <= 0xDFFF
      ? 2
      : 1;
    const characterBytes = utf8ByteLength_(text.slice(index, index + width));
    if (chunkBytes > 0 && chunkBytes + characterBytes > limit) {
      chunks.push(text.slice(start, index));
      start = index;
      chunkBytes = 0;
    }
    chunkBytes += characterBytes;
    index += width;
  }

  chunks.push(text.slice(start));
  return chunks;
}

function utf8ByteLength_(value) {
  const text = String(value == null ? '' : value);
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xD800 && code <= 0xDBFF &&
             index + 1 < text.length &&
             text.charCodeAt(index + 1) >= 0xDC00 &&
             text.charCodeAt(index + 1) <= 0xDFFF) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function clearChunkedStore_(key) {
  const properties = PropertiesService.getScriptProperties();
  const count = Number(properties.getProperty(key + '_COUNT')) || 0;
  for (let index = 0; index < count; index += 1) properties.deleteProperty(key + '_' + index);
  properties.deleteProperty(key + '_COUNT');
  if (key === SYNC_STATE_STORE) properties.deleteProperty('SYNC_STATE');
}

function setupAutoSyncTriggers() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('背景同步正在保存行程，請稍後再試。');
  try {
    const settings = loadSettings_();
    settings.autoSyncEnabled = true;
    saveSettings_(settings);
    refreshAutoSyncTriggers_(settings);
  } finally {
    lock.releaseLock();
  }
}

function refreshAutoSyncTriggers_(settings) {
  deleteDailySyncTriggers_();
  if (!settings.autoSyncEnabled) {
    deleteCourseOutlineMaintenanceTriggers_();
    return;
  }
  settings.autoSyncHours.forEach(hour => {
    const handler = hour === settings.notifySyncHour ? 'syncMyScheduleToCalendarWithNotification' : 'syncMyScheduleToCalendar';
    ScriptApp.newTrigger(handler).timeBased().atHour(hour).everyDays(1).inTimezone(TIMEZONE).create();
  });
  if (getConfiguredCourseOutlineSourceSets_(settings.gradeName).length) {
    const outlineHour = getCourseOutlineDailyRefreshHour_(settings);
    ScriptApp.newTrigger(COURSE_OUTLINE_DAILY_HANDLER)
      .timeBased()
      .atHour(outlineHour)
      .everyDays(1)
      .inTimezone(TIMEZONE)
      .create();
  } else {
    deleteCourseOutlineMaintenanceTriggers_();
  }
}

function getCourseOutlineDailyRefreshHour_(settings) {
  const hours = normalizeHourArray_(settings.autoSyncHours, settings.notifySyncHour);
  const earliest = Math.min.apply(null, hours);
  return (earliest + 22) % 24;
}

function deleteDailySyncTriggers_() {
  deleteTriggersByHandlers_([
    'syncMyScheduleToCalendar',
    'syncMyScheduleToCalendarWithNotification',
    COURSE_OUTLINE_DAILY_HANDLER
  ]);
}

function deleteCourseOutlineMaintenanceTriggers_() {
  deleteTriggersByHandlers_([
    COURSE_OUTLINE_ONCE_HANDLER,
    COURSE_OUTLINE_RETRY_HANDLER,
    COURSE_OUTLINE_WATCHDOG_HANDLER,
    COURSE_OUTLINE_APPLY_HANDLER
  ]);
  const state = loadCourseOutlineState_();
  if (state.status === 'running' || state.status === 'retry_pending') {
    saveCourseOutlineState_(Object.assign({}, state, {
      status: 'idle',
      attempt: 0,
      incidentId: '',
      runId: '',
      startedAt: '',
      watchdogTriggerId: '',
      retryTriggerId: '',
      lastError: ''
    }));
  }
}

function deleteTriggersByHandlers_(handlers) {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger);
  });
}

function deleteProjectTriggerById_(triggerId) {
  if (!triggerId) return false;
  const trigger = ScriptApp.getProjectTriggers()
    .find(item => item.getUniqueId() === triggerId);
  if (!trigger) return false;
  try {
    ScriptApp.deleteTrigger(trigger);
    return true;
  } catch (error) {
    Logger.log('刪除課綱維護觸發器失敗：' + error.message);
    return false;
  }
}

function ensureOneTimeTrigger_(handler, delayMs) {
  const exists = ScriptApp.getProjectTriggers()
    .some(trigger => trigger.getHandlerFunction() === handler);
  if (exists) return false;
  ScriptApp.newTrigger(handler).timeBased().after(delayMs).create();
  return true;
}

function deleteAutoSyncTriggers() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('背景同步正在保存行程，請稍後再試。');
  try {
    deleteAutoSyncTriggersUnlocked_();
  } finally {
    lock.releaseLock();
  }
}

function deleteAutoSyncTriggersUnlocked_() {
  deleteDailySyncTriggers_();
  deleteCourseOutlineMaintenanceTriggers_();
}

function toggleAutoSyncFromMenu() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('背景同步正在保存行程，請稍後再試。');
  let settings;
  try {
    settings = loadSettings_();
    settings.autoSyncEnabled = !settings.autoSyncEnabled;
    settings.pausedReason = settings.autoSyncEnabled ? '' : '由使用者暫停。';
    saveSettings_(settings);
    refreshAutoSyncTriggers_(settings);
  } finally {
    lock.releaseLock();
  }
  SpreadsheetApp.getUi().alert(settings.autoSyncEnabled ? '已恢復自動同步。' : '已暫停自動同步。');
}

function showSyncStatus() {
  const status = loadStatus_();
  const outline = buildCourseOutlineUiStatus_(loadSettings_());
  const outlineMessage = outline.enabled
    ? '\\n\\n課綱狀態：' + outline.state +
      '\\n課綱上次成功：' + (outline.lastSuccessLabel || '尚無紀錄') +
      (outline.missingSheetNames.length
        ? '\\n找不到精確課綱分頁：' + outline.missingSheetNames.join('、')
        : '') +
      (outline.nearMatchSheetNames.length
        ? '\\n疑似只差空格或全形字元：' + outline.nearMatchSheetNames
          .map(item => item.courseName + ' → ' + item.candidates.join('／')).join('、')
        : '') +
      (outline.lastError ? '\\n課綱錯誤：' + outline.lastError : '')
    : '';
  SpreadsheetApp.getUi().alert(
    'T-SCHOOL 行程同步',
    (status.message || '尚未同步') + '\\n\\n上次執行：' + (status.lastSyncLabel || '尚無紀錄') + outlineMessage,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function previewParsedEvents() {
  const settings = loadSettings_();
  const source = loadSourceContext_(settings.gradeName);
  const events = source.events.filter(item => shouldIncludeEvent_(item, settings));
  Logger.log(JSON.stringify(events.slice(0, 50), null, 2));
  Logger.log('共解析 ' + events.length + ' 筆個人事件。');
}

function confirmQuickDeleteSyncedEvents() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('移除受管理事件', '只會刪除本工具建立且仍可辨識的事件。是否繼續？', ui.ButtonSet.YES_NO);
  if (response === ui.Button.YES) {
    const count = quickDeleteSyncedCalendarEvents();
    ui.alert('已移除 ' + count + ' 筆事件。');
  }
}

function quickDeleteSyncedCalendarEvents() {
  if (isActiveSyncJob_(loadSyncJob_())) {
    throw new Error('同步仍在背景執行，請等待完成後再移除事件。');
  }
  const settings = loadSettings_();
  const count = settings.calendarId ? removeManagedEventsFromCalendar_(settings.calendarId, true) : 0;
  clearChunkedStore_(SYNC_STATE_STORE);
  return count;
}

function removeManagedEventsFromCalendar_(calendarId, clearState) {
  const calendar = CalendarApp.getCalendarById(calendarId);
  const state = loadSyncState_();
  let deleted = 0;
  if (!calendar) return deleted;
  Object.keys(state).forEach(key => { if (deleteCalendarEvent_(calendar, state[key].calendarEventId, key)) deleted += 1; });
  if (clearState) clearChunkedStore_(SYNC_STATE_STORE);
  return deleted;
}

function removeStateEventsFromCalendar_(calendarId, state) {
  const calendar = CalendarApp.getCalendarById(calendarId);
  let deleted = 0;
  if (!calendar) return deleted;
  Object.keys(state || {}).forEach(key => {
    if (deleteCalendarEvent_(calendar, state[key].calendarEventId, key)) deleted += 1;
  });
  return deleted;
}

function quickDeleteAllCalendarEvents() {
  if (!ALLOW_QUICK_DELETE_ALL) throw new Error('此危險功能預設停用。');
}

function resetSyncState() {
  if (isActiveSyncJob_(loadSyncJob_())) {
    throw new Error('同步仍在背景執行，請等待完成後再重設狀態。');
  }
  clearChunkedStore_(SYNC_STATE_STORE);
  clearChunkedStore_(STATUS_STORE);
}

function sendSyncNotificationsSafe_(settings, result, options) {
  try {
    const notificationWindow = Boolean(options.notificationWindow);
    let changeNotificationSent = false;

    if (options.reason === 'source' && result.changes.length > 0) {
      const changeData = buildChangeEmailData_(result);
      if (notificationWindow) {
        changeNotificationSent = deliverScheduleChangeNotification_(
          settings,
          changeData
        );
      } else {
        queueScheduleChangeNotification_(changeData);
      }
    } else if (notificationWindow) {
      changeNotificationSent = deliverScheduleChangeNotification_(settings, null);
    }

    if (notificationWindow) {
      flushQueuedNotificationsSafe_(settings);
    }

    if (options.notifyOnSuccess && notificationWindow &&
        !changeNotificationSent && !hasChangeNotificationToday_()) {
      sendEmail_(
        settings,
        'sync_success',
        '行程同步完成',
        formatSyncResultMessage_(result),
        buildSyncEmailData_(result)
      );
    }
  } catch (error) {
    Logger.log('同步通知寄送失敗：' + error.message);
  }
}

function sendFirstSetupNotificationSafe_(result) {
  try {
    sendEmail_(
      loadSettings_(),
      'setup_complete',
      '行程已開始同步',
      '首批事件已同步，課綱資訊稍待幾分鐘便會載入！' +
        '之後系統會依設定自動更新',
      buildSyncEmailData_(result)
    );
  } catch (error) {
    Logger.log('行程開始同步通知寄送失敗：' + error.message);
  }
}

function sendFirstBatchStartedNotificationSafe_(settings, job) {
  try {
    const processed = Number(job.processedOperations) || 0;
    const created = Number(job.created) || 0;
    const total = Number(job.desiredCount) || 0;
    const remaining = Math.max(0, total - created);
    const progressPercent = total
      ? Math.max(0, Math.min(100, Math.round(created / total * 100)))
      : 0;
    sendEmail_(
      settings,
      'setup_started',
      '首批 ' + created + ' 筆同步完成',
      '首批 ' + processed + ' 次操作已成功保存。\\n\\n' +
        '目前已建立 ' + created + ' 筆行程，' +
        '其餘約 ' + remaining + ' 筆會在背景自動繼續。\\n\\n' +
        '你現在可以關閉控制臺，基本行程全部寫入後會再收到「行程已開始同步」通知。',
      {
        processed,
        created,
        total,
        remaining,
        progressPercent
      }
    );
    return true;
  } catch (error) {
    Logger.log('首次同步開始通知寄送失敗：' + error.message);
    return false;
  }
}

function notifySyncFailureSafe_(error) {
  try {
    const message = userFacingError_(error);
    sendEmail_(
      loadSettings_(),
      'sync_failure',
      '行程同步失敗',
      message + '\\n\\n請開啟行程同步控制臺查看狀態。',
      { message }
    );
  } catch (mailError) {
    Logger.log('同步失敗通知寄送失敗：' + mailError.message);
  }
}

function notifySyncFailureUnlessActionRequired_(error) {
  if (error && error.syncFailureHandled) return;
  if (String(error.message || error).indexOf('[ACTION_REQUIRED]') !== 0) {
    notifySyncFailureSafe_(error);
  }
}

function sendActionRequiredSafe_(
  settings,
  subject,
  body,
  dedupeKey,
  templateKind,
  templateData,
  deliveryOptions
) {
  const noticeState = readChunkedJson_(NOTICE_STORE, {});
  const key = hashText_(dedupeKey || subject + '|' + body);
  if (noticeState[key]) return { ok: true, alreadySent: true, error: '' };

  if (!(deliveryOptions && deliveryOptions.immediate) &&
      !isConfiguredNotificationHour_(settings)) {
    queueNotification_({
      key,
      templateKind: templateKind || 'action_required',
      subject,
      body,
      templateData: Object.assign({ message: body, subject }, templateData || {})
    });
    noticeState[key] = true;
    writeChunkedJson_(NOTICE_STORE, noticeState);
    return { ok: true, alreadySent: false, queued: true, error: '' };
  }

  try {
    sendEmail_(
      settings,
      templateKind || 'action_required',
      subject,
      body,
      Object.assign({ message: body, subject }, templateData || {})
    );
    noticeState[key] = true;
    writeChunkedJson_(NOTICE_STORE, noticeState);
    return { ok: true, alreadySent: false, error: '' };
  } catch (error) {
    Logger.log('操作提醒寄送失敗：' + error.message);
    return { ok: false, alreadySent: false, error: userFacingError_(error) };
  }
}

function isConfiguredNotificationHour_(settings) {
  const hours = normalizeHourArray_(
    settings && settings.autoSyncHours,
    settings && settings.notifySyncHour
  );
  const currentHour = Number(
    Utilities.formatDate(new Date(), TIMEZONE, 'H')
  );
  return hours.indexOf(currentHour) !== -1;
}

function loadNotificationQueueState_() {
  const stored = readChunkedJson_(NOTIFICATION_QUEUE_STORE, {});
  return {
    schemaVersion: 1,
    pending: Array.isArray(stored.pending) ? stored.pending.slice(0, 50) : [],
    pendingChangeData: stored.pendingChangeData || null,
    lastChangeDate: String(stored.lastChangeDate || '')
  };
}

function saveNotificationQueueState_(state) {
  writeChunkedJson_(NOTIFICATION_QUEUE_STORE, {
    schemaVersion: 1,
    pending: Array.isArray(state.pending) ? state.pending.slice(0, 50) : [],
    pendingChangeData: state.pendingChangeData || null,
    lastChangeDate: String(state.lastChangeDate || '')
  });
}

function queueNotification_(notification) {
  const state = loadNotificationQueueState_();
  if (!state.pending.some(item => item.key === notification.key)) {
    state.pending.push(notification);
  }
  saveNotificationQueueState_(state);
}

function flushQueuedNotificationsSafe_(settings) {
  const state = loadNotificationQueueState_();
  if (!state.pending.length) return 0;
  const remaining = [];
  let sent = 0;

  state.pending.forEach(notification => {
    try {
      sendEmail_(
        settings,
        notification.templateKind,
        notification.subject,
        notification.body,
        notification.templateData
      );
      sent += 1;
    } catch (error) {
      remaining.push(notification);
      Logger.log('排程通知寄送失敗，保留至下個通知時間：' + error.message);
    }
  });

  state.pending = remaining;
  saveNotificationQueueState_(state);
  return sent;
}

function queueScheduleChangeNotification_(changeData) {
  const state = loadNotificationQueueState_();
  state.pendingChangeData = mergeChangeEmailData_(
    state.pendingChangeData,
    changeData
  );
  state.lastChangeDate = formatDateKey_(new Date());
  saveNotificationQueueState_(state);
}

function deliverScheduleChangeNotification_(settings, currentChangeData) {
  const state = loadNotificationQueueState_();
  const changeData = mergeChangeEmailData_(
    state.pendingChangeData,
    currentChangeData
  );
  if (!changeData || !changeData.changeCount) return false;

  try {
    sendEmail_(
      settings,
      'schedule_changes',
      '行程調整 ' + changeData.changeCount + ' 項',
      formatChangeDigestFromEmailData_(changeData),
      changeData
    );
    state.pendingChangeData = null;
    state.lastChangeDate = formatDateKey_(new Date());
    saveNotificationQueueState_(state);
    return true;
  } catch (error) {
    state.pendingChangeData = changeData;
    state.lastChangeDate = formatDateKey_(new Date());
    saveNotificationQueueState_(state);
    throw error;
  }
}

function hasChangeNotificationToday_() {
  return loadNotificationQueueState_().lastChangeDate === formatDateKey_(new Date());
}

function mergeChangeEmailData_(left, right) {
  if (!left && !right) return null;
  const sources = [left, right].filter(Boolean);
  const merged = {
    created: 0,
    updated: 0,
    outlineUpdated: 0,
    deleted: 0,
    unchanged: 0,
    omittedCount: 0,
    changes: []
  };

  sources.forEach(source => {
    ['created', 'updated', 'outlineUpdated', 'deleted', 'unchanged']
      .forEach(key => { merged[key] += Number(source[key]) || 0; });
    merged.omittedCount += Number(source.omittedCount) || 0;
    merged.changes = merged.changes.concat(
      Array.isArray(source.changes) ? source.changes : []
    );
  });

  const seen = {};
  merged.changes = merged.changes.filter(change => {
    const key = JSON.stringify([
      change.type,
      change.course,
      change.oldStandard,
      change.newStandard
    ]);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, SYNC_CHANGE_DETAIL_LIMIT);
  merged.changeCount = merged.changes.length + merged.omittedCount;
  merged.omittedNote = merged.omittedCount
    ? '另有 ' + merged.omittedCount + ' 項行程調整未逐項列出'
    : '';
  merged.summary = formatSyncEmailDataSummary_(merged);
  return merged;
}

function formatChangeDigestFromEmailData_(changeData) {
  const lines = changeData.changes.map(change => change.displayText);
  if (changeData.omittedNote) lines.push(changeData.omittedNote);
  lines.push('', changeData.summary);
  return lines.join('\\n');
}

function sendEmail_(settings, templateKind, subject, body, templateData) {
  const recipient = getNotificationEmail_(settings);
  const formattedSubject = formatNotificationSubject_(subject);
  const cleanTemplateData = sanitizeNotificationTemplateData_(
    Object.assign(buildEmailBaseData_(), templateData || {})
  );
  const message = {
    to: recipient,
    subject: formattedSubject,
    body: stripNotificationSentencePeriods_(body || ''),
    name: 'T-SCHOOL Schedule Sync'
  };
  const htmlBody = buildEmailHtmlSafe_(
    templateKind,
    formattedSubject,
    cleanTemplateData
  );
  if (htmlBody) message.htmlBody = htmlBody;
  MailApp.sendEmail(message);
}

function formatNotificationSubject_(subject) {
  const brandSuffix = '｜T-SCHOOL Schedule Sync';
  const cleanSubject = String(subject == null ? '' : subject)
    .replace(/^\\[T-SCHOOL\\]\\s*/, '')
    .replace(/\\s*｜\\s*T-SCHOOL Schedule Sync\\s*$/, '')
    .trim();
  return (cleanSubject || '行程同步通知') + brandSuffix;
}

function stripNotificationSentencePeriods_(value) {
  return String(value == null ? '' : value).replace(/。/g, '');
}

function sanitizeNotificationTemplateData_(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeNotificationTemplateData_);
  }
  if (value && typeof value === 'object') {
    const result = {};
    Object.keys(value).forEach(key => {
      result[key] = sanitizeNotificationTemplateData_(value[key]);
    });
    return result;
  }
  return typeof value === 'string'
    ? stripNotificationSentencePeriods_(value)
    : value;
}

function buildEmailBaseData_() {
  return {
    sentAt: formatDateTime_(new Date()),
    controlUrl: getControlSpreadsheetUrl_(),
    calendarUrl: 'https://calendar.google.com/calendar/u/0/r'
  };
}

function getControlSpreadsheetUrl_() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    return spreadsheet && typeof spreadsheet.getUrl === 'function'
      ? String(spreadsheet.getUrl() || '')
      : '';
  } catch (error) {
    return '';
  }
}

function buildEmailHtmlSafe_(templateKind, subject, templateData) {
  try {
    const manifest = loadEmailTemplateManifest_();
    if (!manifest) return '';
    const notification = manifest.notifications[templateKind];
    if (!notification) return '';
    const values = Object.assign({
      subject,
      summary: '',
      message: '',
      omittedNote: ''
    }, templateData || {});
    const rawSections = {};

    Object.keys(notification.repeaters || {}).forEach(outputKey => {
      const repeater = notification.repeaters[outputKey] || {};
      const items = Array.isArray(values[repeater.source])
        ? values[repeater.source].slice(0, SYNC_CHANGE_DETAIL_LIMIT)
        : [];
      rawSections[outputKey] = items
        .map(item => renderEmailHtmlTemplate_(repeater.template, item, {}))
        .join('');
    });

    const content = renderEmailHtmlTemplate_(
      notification.content,
      values,
      rawSections
    );
    const shellValues = Object.assign({}, values, {
      subject,
      preheader: renderEmailTextTemplate_(notification.preheader, values),
      statusLabel: renderEmailTextTemplate_(notification.statusLabel, values),
      headline: renderEmailTextTemplate_(notification.headline, values),
      lede: renderEmailTextTemplate_(notification.lede, values),
      accent: normalizeEmailTemplateColor_(notification.accent, '#00a676'),
      accentDark: normalizeEmailTemplateColor_(notification.accentDark, '#007c59'),
      accentSoft: normalizeEmailTemplateColor_(notification.accentSoft, '#dcefe7')
    });
    return renderEmailHtmlTemplate_(manifest.shell, shellValues, { content });
  } catch (error) {
    Logger.log('HTML 信件版型無法套用，改寄純文字：' + error.message);
    return '';
  }
}

function loadEmailTemplateManifest_() {
  let cache = null;
  try {
    cache = CacheService.getScriptCache();
    const cached = cache.get(EMAIL_TEMPLATE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      assertEmailTemplateManifest_(parsed);
      return parsed;
    }
  } catch (cacheError) {
    Logger.log('HTML 信件版型快取無法讀取：' + cacheError.message);
  }

  try {
    const response = UrlFetchApp.fetch(EMAIL_TEMPLATE_MANIFEST_URL, {
      followRedirects: true,
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('HTTP ' + response.getResponseCode());
    }
    const text = response.getContentText('UTF-8');
    if (!text || text.length > EMAIL_TEMPLATE_MAX_BYTES) {
      throw new Error('版型檔案為空或超過大小限制');
    }
    const manifest = JSON.parse(text);
    assertEmailTemplateManifest_(manifest);
    if (cache) {
      try {
        cache.put(EMAIL_TEMPLATE_CACHE_KEY, text, EMAIL_TEMPLATE_CACHE_SECONDS);
      } catch (cacheWriteError) {
        Logger.log('HTML 信件版型快取無法寫入：' + cacheWriteError.message);
      }
    }
    return manifest;
  } catch (fetchError) {
    Logger.log('HTML 信件版型無法下載：' + fetchError.message);
    return null;
  }
}

function assertEmailTemplateManifest_(manifest) {
  if (!manifest || Number(manifest.schemaVersion) !== 1) {
    throw new Error('HTML 信件版型 schemaVersion 不支援');
  }
  if (typeof manifest.shell !== 'string' || !manifest.shell) {
    throw new Error('HTML 信件版型缺少 shell');
  }
  if (!manifest.notifications || typeof manifest.notifications !== 'object') {
    throw new Error('HTML 信件版型缺少 notifications');
  }
  Object.keys(manifest.notifications).forEach(key => {
    const notification = manifest.notifications[key];
    if (!notification || typeof notification.content !== 'string') {
      throw new Error('HTML 信件版型內容無效：' + key);
    }
    Object.keys(notification.repeaters || {}).forEach(outputKey => {
      const repeater = notification.repeaters[outputKey];
      if (!repeater || typeof repeater.source !== 'string' ||
          typeof repeater.template !== 'string') {
        throw new Error('HTML 信件重複區塊無效：' + key + '/' + outputKey);
      }
    });
  });
}

function renderEmailTextTemplate_(template, values) {
  return String(template || '').replace(/\\{\\{([A-Za-z][A-Za-z0-9]*)\\}\\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values || {}, key)
      ? String(values[key] == null ? '' : values[key])
      : ''
  );
}

function renderEmailHtmlTemplate_(template, values, rawValues) {
  const withRawSections = String(template || '').replace(
    /\\{\\{\\{([A-Za-z][A-Za-z0-9]*)\\}\\}\\}/g,
    (match, key) => Object.prototype.hasOwnProperty.call(rawValues || {}, key)
      ? String(rawValues[key] || '')
      : ''
  );
  return withRawSections.replace(
    /\\{\\{([A-Za-z][A-Za-z0-9]*)\\}\\}/g,
    (match, key) => Object.prototype.hasOwnProperty.call(values || {}, key)
      ? escapeEmailHtml_(values[key])
      : ''
  );
}

function escapeEmailHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeEmailTemplateColor_(value, fallback) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function buildSyncEmailData_(result) {
  const data = {
    created: Number(result.created) || 0,
    updated: Number(result.updated) || 0,
    outlineUpdated: Number(result.outlineUpdated) || 0,
    deleted: Number(result.deleted) || 0,
    unchanged: Number(result.unchanged) || 0
  };
  data.summary = formatSyncEmailDataSummary_(data);
  return data;
}

function formatSyncEmailDataSummary_(data) {
  const outlineUpdated = Number(data.outlineUpdated) || 0;
  return '新增 ' + (Number(data.created) || 0) +
    '、更新 ' + (Number(data.updated) || 0) +
    (outlineUpdated ? '、課綱說明更新 ' + outlineUpdated : '') +
    '、移除 ' + (Number(data.deleted) || 0) +
    '、未變更 ' + (Number(data.unchanged) || 0);
}

function buildChangeEmailData_(result) {
  const omittedCount = Number(result.omittedChangeCount) || 0;
  return Object.assign(buildSyncEmailData_(result), {
    omittedCount,
    changeCount: result.changes.length + omittedCount,
    omittedNote: omittedCount
      ? '另有 ' + omittedCount + ' 項行程調整未逐項列出'
      : '',
    changes: result.changes.map(change => {
      const values = buildChangeTemplateValues_(change);
      return Object.assign({}, values, {
        oldStandard: formatChangeEmailSide_(values, 'old', false),
        newStandard: formatChangeEmailSide_(values, 'new', false),
        displayText: renderTemplate_(
          getNotificationTemplate_(),
          values
        ).trim()
      });
    })
  });
}

function formatChangeEmailSide_(values, prefix, detailed) {
  const parts = [
    values[prefix + 'Date'],
    values[prefix + 'Period']
  ];
  if (detailed) parts.push(values[prefix + 'Time']);
  parts.push(values[prefix + 'Location']);
  return parts.filter(value => value && value !== '—').join(detailed ? '｜' : ' ') || '—';
}

function getNotificationEmail_(settings) {
  const configured = String(settings.notificationEmail || '').trim();
  const email = configured || Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  assertSingleEmail_(email);
  return email;
}

function assertSingleEmail_(email) {
  if (!/^[^\\s@,;<>]+@[^\\s@,;<>]+$/.test(String(email || ''))) throw new Error('找不到可用的通知 Email，請在控制臺填入單一信箱。');
}

function formatChangeDigest_(result, settings) {
  const lines = result.changes.map(change =>
    renderTemplate_(getNotificationTemplate_(), buildChangeTemplateValues_(change)).trim()
  );
  if (Number(result.omittedChangeCount) > 0) {
    lines.push('另有 ' + result.omittedChangeCount + ' 項行程調整未逐項列出');
  }
  lines.push('', stripNotificationSentencePeriods_(formatSyncResultMessage_(result)));
  return lines.join('\\n');
}

function getNotificationTemplate_() {
  return '{type}｜{course}\\n原：{oldDate} {oldPeriod} {oldLocation}\\n新：{newDate} {newPeriod} {newLocation}';
}

function buildChangeTemplateValues_(change) {
  const oldItem = change.oldItem;
  const newItem = change.newItem;
  const activeItem = newItem || oldItem || {};
  return {
    type: change.type,
    course: activeItem.originalTitle || '',
    oldDate: oldItem ? oldItem.dateKey.replace(/-/g, '/') : '—',
    newDate: newItem ? newItem.dateKey.replace(/-/g, '/') : '—',
    oldPeriod: oldItem ? formatPeriodValue_(oldItem) : '—',
    newPeriod: newItem ? formatPeriodValue_(newItem) : '—',
    oldTime: oldItem ? formatTimeValue_(oldItem) : '—',
    newTime: newItem ? formatTimeValue_(newItem) : '—',
    oldLocation: oldItem && oldItem.location ? oldItem.location : '—',
    newLocation: newItem && newItem.location ? newItem.location : '—'
  };
}

function formatPeriodValue_(item) {
  if (item.isAllDay) return '全天';
  return '第 ' + (item.periodStart === item.periodEnd ? item.periodStart : item.periodStart + '–' + item.periodEnd) + ' 節';
}

function formatTimeValue_(item) {
  if (item.isAllDay) return '全天';
  return (item.startTime || '') + (item.endTime ? '–' + item.endTime : '');
}

function formatEventLine_(item, includeTitle) {
  if (!item) return '';
  const period = item.isAllDay ? '全天' : '第 ' + (item.periodStart === item.periodEnd ? item.periodStart : item.periodStart + '–' + item.periodEnd) + ' 節';
  const detail = item.dateKey.replace(/-/g, '/') + ' ' + period + (item.location ? ' ' + item.location : '');
  return includeTitle === false ? detail : item.originalTitle + '｜' + detail;
}

function formatSyncResultMessage_(result) {
  const outlineUpdated = Number(result.outlineUpdated) || 0;
  return '新增 ' + result.created +
    '、更新 ' + result.updated +
    (outlineUpdated ? '、課綱說明更新 ' + outlineUpdated : '') +
    '、移除 ' + result.deleted +
    '、未變更 ' + result.unchanged + '。';
}

function userFacingError_(error) {
  return String(error && error.message ? error.message : error).replace(/^\\[ACTION_REQUIRED\\]\\s*/, '');
}

function normalizeText_(value) {
  let text = String(value == null ? '' : value);
  if (typeof text.normalize === 'function') text = text.normalize('NFKC');
  return text.replace(/[\\u200B-\\u200D\\uFEFF]/g, '').replace(/\\r/g, '\\n').replace(/（/g, '(').replace(/）/g, ')').replace(/＿/g, '_').replace(/[\\t\\u3000]+/g, ' ').replace(/[ ]+/g, ' ').replace(/\\n{2,}/g, '\\n').trim();
}

function normalizeTitle_(value) {
  return normalizeText_(value).replace(/\\s+/g, '').toLowerCase();
}

function uniqueStrings_(values) {
  const seen = {};
  return (values || []).map(value => String(value || '').trim()).filter(value => {
    const key = normalizeTitle_(value);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function uniqueExactStrings_(values) {
  const seen = {};
  return (values || []).map(value => String(value == null ? '' : value).trim()).filter(value => {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}

function sanitizeGrade_(value) {
  return GRADE_API_NAMES[value] ? value : '高一';
}

function normalizeHour_(value, fallback) {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

function normalizeHourArray_(values, fallback) {
  const result = [];
  (Array.isArray(values) ? values : []).forEach(value => {
    const hour = normalizeHour_(value, null);
    if (hour !== null && result.indexOf(hour) === -1) result.push(hour);
  });
  if (!result.length) result.push(fallback);
  return result.sort((a, b) => a - b);
}

function sanitizeReminderMinutes_(value) {
  const minutes = Number(value);
  return [10, 30, 60, 1440].indexOf(minutes) !== -1 ? minutes : 10;
}

function formatDateKey_(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy/MM/dd HH:mm');
}

function addDaysToDateKey_(date, days) {
  const startKey = formatDateKey_(date);
  const base = new Date(startKey + 'T00:00:00Z');
  base.setUTCDate(base.getUTCDate() + Math.max(0, Number(days) || 0));
  return base.toISOString().slice(0, 10);
}

function filterCourseOutlineLookaheadEvents_(events, now, days) {
  const startKey = formatDateKey_(now);
  const endKey = addDaysToDateKey_(now, days);
  return (events || []).filter(event =>
    event &&
    event.dateKey >= startKey &&
    event.dateKey <= endKey
  );
}

function pad2_(value) {
  return String(value).padStart(2, '0');
}

function hashText_(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
${highLoadTestCode}
`;
  };
})();
