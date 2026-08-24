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
  firstDateKey: '2026-02-23',
  lastDateKey: '2026-08-16'
};

function showHighLoadTestGuide() {
  assertHighLoadTestingEnabled_();
  getControlPanelUi_().alert(
    '高負載測試',
    '這是開發者測試工具，只能安裝在全新的控制臺副本。\\n\\n' +
    '執行「模擬控制臺首次同步」後，程式會以 2026/02/23 的高二開學資料，' +
    '一次完成來源檢查、30 天課綱讀取、建立 [TEST] 專用日曆，' +
    '並沿用正式控制臺的 40 筆分批與背景續跑機制同步全部 422 筆行程。\\n\\n' +
    '不需要另外執行分段測試。完成後可查看進度或開啟測試日曆。',
    getControlPanelUi_().ButtonSet.OK
  );
}

function runHighLoadFirstSyncTest() {
  assertHighLoadTestingEnabled_();
  const ui = getControlPanelUi_();
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
    scheduleFingerprint: '',
    expectedEvents: HIGH_LOAD_TEST_EXPECTED.totalFuture
  };
  writeChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, config);

  const payload = fetchSchedulePayload_('高二');
  const source = parseSchedulePayload_(payload, '高二', highLoadTestBusinessNow_());
  const report = buildHighLoadReadOnlyReport_(source, Date.now() - startedAt);
  if (!report.ok) {
    throw new Error('高二開學測試資料與 422 筆基準不一致：' + report.mismatches.join('、'));
  }
  config.scheduleFingerprint = source.scheduleFingerprint;
  writeChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, config);

  const settings = buildHighLoadTestSettings_(source);
  const outlineEvents = filterCourseOutlineLookaheadEvents_(
    getHighLoadTestDesiredEvents_(source),
    highLoadTestBusinessNow_(),
    COURSE_OUTLINE_LOOKAHEAD_DAYS
  ).filter(event => !event.isAllDay);
  const sourceSets = getRelevantCourseOutlineSourceSets_('高二', outlineEvents);
  if (!sourceSets.length) {
    throw new Error('模擬日期沒有可使用的高二課綱來源組。');
  }
  const snapshot = collectCourseOutlineSnapshot_(settings, source, outlineEvents, sourceSets);
  if (snapshot.diagnostics.missingSheetNames.length) {
    throw new Error(
      '30 天課綱找不到可匹配分頁：' +
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
      selectedTitles: source.catalog.all.map(item => item.title),
      calendarId: '',
      calendarName,
      notificationEmail: testNotificationEmail,
      autoSyncEnabled: true,
      notificationHours: [6],
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
  const ui = getControlPanelUi_();
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
  const calendar = CalendarApp.createCalendar(calendarName, { selected: true });
  if (typeof calendar.setTimeZone === 'function') calendar.setTimeZone(TIMEZONE);
  assertHighLoadTestCalendar_(calendar);

  const serializedSource = {
    gradeName: '高二',
    termKey: source.termKey,
    scheduleFingerprint: source.scheduleFingerprint,
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
    scheduleFingerprint: source.scheduleFingerprint,
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
  ).filter(event => !event.isAllDay);
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
  getControlPanelUi_().alert(
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
    '\\n仍有其他名稱差異：' +
      (report.nearMatchSheetNames.length
        ? report.nearMatchSheetNames.map(item => item.courseName + ' → ' + item.candidates.join('／')).join('、')
        : '無') +
    '\\n耗時：' + Math.round(report.elapsedMs / 100) / 10 + ' 秒' +
    '\\n\\n結果：完成。這份課綱資料將套用至後續 Calendar 寫入測試。' +
    '若「找不到分頁」有內容，請停止並回報；全半形、空白與大小寫以外的差異不會自動配對。',
    getControlPanelUi_().ButtonSet.OK
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
  const ui = getControlPanelUi_();
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
    getControlPanelUi_().alert(
      '高負載測試',
      '尚未執行「模擬控制臺首次同步」。',
      getControlPanelUi_().ButtonSet.OK
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
  getControlPanelUi_().alert(
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
    getControlPanelUi_().ButtonSet.OK
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
  getControlPanelUi_().showModalDialog(html, '高負載測試');
}

function cleanupHighLoadTestEnvironment() {
  assertHighLoadTestingEnabled_();
  if (isActiveSyncJob_(loadSyncJob_())) {
    throw new Error('首次同步仍在背景執行，請等待完成後再清除測試環境。');
  }
  const ui = getControlPanelUi_();
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
    TERM_TRANSITION_NOTICE_HANDLER,
    TERM_TRANSITION_VERIFICATION_HANDLER
  ]);
  [
    SETTINGS_STORE,
    SYNC_STATE_STORE,
    SYNC_JOB_STORE,
    STATUS_STORE,
    SYNC_PROGRESS_STORE,
    NOTICE_STORE,
    SOURCE_OBSERVATION_STORE,
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
  const timedEvents = events.filter(event => !event.isAllDay);
  const allDayEvents = events.filter(event => event.isAllDay);
  const outlineEvents = filterCourseOutlineLookaheadEvents_(
    timedEvents,
    highLoadTestBusinessNow_(),
    COURSE_OUTLINE_LOOKAHEAD_DAYS
  );
  const outlineCourseNames = uniqueExactStrings_(outlineEvents.map(event => event.originalTitle));
  const actual = {
    totalFuture: events.length,
    timedFuture: timedEvents.length,
    allDayFuture: allDayEvents.length,
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
      '有時間行程：' + report.actual.timedFuture,
      '全日行程：' + report.actual.allDayFuture,
      '30 天課綱候選：' + report.actual.outlineWindow,
      '30 天行程名稱：' + report.actual.outlineCourseNames,
      '日期範圍：' + report.actual.firstDateKey + '～' + report.actual.lastDateKey
    );
  } else {
    Object.keys(report).forEach(key => {
      if (typeof report[key] !== 'object') lines.push(key + '：' + report[key]);
    });
  }
  lines.push('', report.ok ? '結果：通過' : '結果：未通過，請停止下一階段並保存畫面。');
  getControlPanelUi_().alert(title, lines.join('\\n'), getControlPanelUi_().ButtonSet.OK);
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
      !termKeysMatch_(snapshot.termKey, source && source.termKey || '')) {
    return events;
  }
  return attachCourseOutlineLookup_(events, snapshot.lookup || {});
}

function buildHighLoadTestSettings_(source) {
  return {
    gradeName: '高二',
    selectedTitles: source.catalog.all.map(item => item.title),
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
    settings = settings || {};
    const notificationHours = [6];
    const notifyHour = 6;
    const sourceApiUrl = String(settings.sourceApiUrl || '').trim();
    const emailTemplateManifestUrl = String(settings.emailTemplateManifestUrl || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(sourceApiUrl)) {
      throw new Error('Generic Code.gs generation requires the published Apps Script /exec sourceApiUrl.');
    }
    if (!/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\/notification-email-templates\.json$/.test(emailTemplateManifestUrl)) {
      throw new Error('Production Code.gs generation requires an immutable emailTemplateManifestUrl.');
    }
    const initialSettings = {
      schemaVersion: 9,
      appVersion: settings.appVersion || '2.0.0-rc.2',
      setupComplete: false,
      setupImportedAt: '',
      setupCodeVersion: 0,
      gradeName: '',
      calendarId: '',
      calendarName: '',
      notificationEmail: '',
      selectedTitles: [],
      autoSyncEnabled: true,
      autoSyncHours: [3, 11, 18, 21],
      instantNotificationsEnabled: true,
      notificationHours,
      notifySyncHour: notifyHour,
      notificationPreset: 'standard',
      customNotification: '',
      descriptionPreset: 'standard',
      customDescription: STANDARD_CUSTOM_DESCRIPTION_TEMPLATE,
      reminderMode: 'none',
      reminderMinutes: 10,
      knownTitles: [],
      pendingTitles: [],
      excludedTitles: [],
      termKey: '',
      scheduleFingerprint: '',
      setupContextFingerprint: '',
      pendingTermKey: '',
      pausedReason: '',
      autoSyncEnabledBeforeTermTransition: null,
      termTransitionNoticeAttempts: 0,
      termTransitionNoticeScheduledFor: '',
      termTransitionNoticeSentAt: '',
      termTransitionNoticeLastError: '',
      calendarMigrationFromId: ''
    };
    const sidebarHtml = window.TSCHOOL_SIDEBAR_HTML || '';
    const setupDialogHtml = window.TSCHOOL_SETUP_DIALOG_HTML || '';
    const highLoadTestingEnabled = settings.highLoadTestingEnabled === true;
    const highLoadTestCode = highLoadTestingEnabled
      ? buildHighLoadTestAppsScriptCode()
      : '';
    const highLoadMenuCode = highLoadTestingEnabled
      ? `
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
`
      : '';
    const highLoadConstantCode = highLoadTestingEnabled
      ? 'const HIGH_LOAD_TESTING_ENABLED = true;\n'
      : '';
    const highLoadBusinessNowCode = highLoadTestingEnabled
      ? `  const config = readChunkedJson_(HIGH_LOAD_TEST_CONFIG_STORE, null);
  if (config && config.simulatedNow) return new Date(config.simulatedNow);
`
      : '';

return `/**
 * @OnlyCurrentDoc
 */
// GENERATED UNIVERSAL GOOGLE DOCS TEMPLATE — do not paste a personalized or archived Code.gs here.
const APP_VERSION = ${formatString(settings.appVersion || '2.0.0-rc.2')};
const SETTINGS_SCHEMA_VERSION = 9;
const TIMEZONE = 'Asia/Taipei';
const SCHEDULE_SYNC_HOURS = [3, 11, 18, 21];
const SCHEDULE_SYNC_WINDOW_HALF_MINUTES = 60;
const TIME_TRIGGER_NEAR_MINUTE_TOLERANCE = 15;
const INSTANT_NOTIFICATION_SUMMARY_HOUR = 6;
const SOURCE_API_URL = ${formatString(sourceApiUrl)};
const SOURCE_FETCH_MAX_ATTEMPTS = 3;
const SOURCE_FETCH_RETRY_DELAY_MS = 750;
const EMAIL_TEMPLATE_MANIFEST_URL = ${formatString(emailTemplateManifestUrl)};
const EMAIL_TEMPLATE_CACHE_KEY = 'TSCHOOL_EMAIL_TEMPLATE_MANIFEST_' + ${formatString(emailTemplateManifestUrl.match(/[0-9a-f]{40}/)[0].slice(0, 8).toUpperCase())};
const EMAIL_TEMPLATE_CACHE_SECONDS = 60 * 60;
const EMAIL_TEMPLATE_MAX_BYTES = 100 * 1024;
const EMAIL_TEMPLATE_FETCH_MAX_ATTEMPTS = 3;
const EMAIL_TEMPLATE_FETCH_RETRY_DELAY_MS = 500;
const EMAIL_LINK_ALLOWED_HOSTS = ['calendar.google.com', 'docs.google.com'];
const SETTINGS_STORE = 'TSCHOOL_SETTINGS';
const SETUP_SOURCE_CONTEXT_STORE = 'TSCHOOL_SETUP_SOURCE_CONTEXT';
const SOURCE_UI_CACHE_STORE = 'TSCHOOL_SOURCE_UI_CACHE';
const SOURCE_OBSERVATION_STORE = 'TSCHOOL_SOURCE_OBSERVATION';
const SYNC_STATE_STORE = 'TSCHOOL_SYNC_STATE';
const SYNC_JOB_STORE = 'TSCHOOL_SYNC_JOB';
const STATUS_STORE = 'TSCHOOL_STATUS';
const SYNC_PROGRESS_STORE = 'TSCHOOL_SYNC_PROGRESS';
const NOTICE_STORE = 'TSCHOOL_NOTICE_STATE';
const NOTIFICATION_QUEUE_STORE = 'TSCHOOL_NOTIFICATION_QUEUE';
const NOTIFICATION_DELIVERY_REQUEST_STORE = 'TSCHOOL_NOTIFICATION_DELIVERY_REQUEST';
const COURSE_OUTLINE_INDEX_CACHE_STORE = 'TSCHOOL_COURSE_OUTLINE_INDEX_CACHE';
const SYNC_JOB_SCHEMA_VERSION = 2;
const SYNC_CONTINUATION_HANDLER = 'continueScheduleSync';
const SYNC_WATCHDOG_HANDLER = 'watchScheduleSync';
const NOTIFICATION_HANDLER = 'sendScheduledNotifications';
const FINAL_NOTIFICATION_HANDLER = 'sendScheduledNotificationsWithDailySummary';
const NOTIFICATION_DELIVERY_RETRY_HANDLER = 'retryScheduledNotificationDelivery';
const SYNC_INITIAL_SETUP_BATCH_OPERATIONS = 40;
const SYNC_BATCH_MAX_CALENDAR_OPERATIONS = 80;
const SYNC_BATCH_SOFT_LIMIT_MS = 150 * 1000;
const SYNC_PROGRESS_CALENDAR_START_PERCENT = 35;
const SYNC_PROGRESS_CALENDAR_END_PERCENT = 90;
const SYNC_PROGRESS_REPORT_INTERVAL_MS = 10 * 1000;
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
const COURSE_OUTLINE_CACHE_SCHEMA_VERSION = 2;
const COURSE_OUTLINE_SOURCE_INDEX_FINGERPRINT_VERSION = 1;
const COURSE_OUTLINE_HEADER_SCAN_LIMIT = 100;
const COURSE_OUTLINE_LOOKAHEAD_DAYS = 30;
const COURSE_OUTLINE_FIRST_SETUP_MAX_MS = 60 * 1000;
const COURSE_OUTLINE_RETRY_DELAY_MS = 30 * 60 * 1000;
const COURSE_OUTLINE_WATCHDOG_DELAY_MS = 8 * 60 * 1000;
const COURSE_OUTLINE_RUNNING_STALE_MS = 7 * 60 * 1000;
const COURSE_OUTLINE_DAILY_HANDLER = 'refreshCourseOutlinesDaily';
const COURSE_OUTLINE_ONCE_HANDLER = 'refreshCourseOutlinesOnce';
const COURSE_OUTLINE_MANUAL_ONCE_HANDLER = 'refreshCourseOutlinesManualOnce';
const COURSE_OUTLINE_RETRY_HANDLER = 'retryCourseOutlineRefresh';
const COURSE_OUTLINE_WATCHDOG_HANDLER = 'watchCourseOutlineRefresh';
const COURSE_OUTLINE_APPLY_HANDLER = 'applyCourseOutlineSnapshotToCalendar';
const NATURAL_ADVANCED_BASE_TITLE = '自然進階(二)';
const NATURAL_ADVANCED_VARIANT_TITLES = [
  '自然進階(二)_化學',
  '自然進階(二)_生物',
  '自然進階(二)_物理'
];
const TERM_TRANSITION_NOTICE_HANDLER = 'retryTermTransitionNotice';
const TERM_TRANSITION_VERIFICATION_HANDLER = 'verifyTermTransitionCandidate';
const TERM_TRANSITION_VERIFICATION_DELAY_MS = 30 * 60 * 1000;
const NEW_TITLE_OBSERVATION_DELAY_MS = 24 * 60 * 60 * 1000;
const TERM_TRANSITION_NOTICE_RETRY_DELAY_MS = 30 * 60 * 1000;
const TERM_TRANSITION_NOTICE_MAX_ATTEMPTS = 2;
const COURSE_OUTLINE_INDEX_SPREADSHEET_ID = '1zS6TdGMTPhz2Ja8bRs2AKAg0mRsBfXET9nmXi9wSBjY';
const COURSE_OUTLINE_INDEX_SHEET_NAME = '課綱來源';
const COURSE_OUTLINE_INDEX_HEADER_SCAN_LIMIT = 20;
const COURSE_OUTLINE_INDEX_NOTICE_DETAIL_LIMIT = 12;
const EVENT_METADATA_VERSION = 2;
const MANAGED_EVENT_TAG_KEY = 'tschool_managed';
const SYNC_ID_EVENT_TAG_KEY = 'tschool_sync_id';
const METADATA_VERSION_EVENT_TAG_KEY = 'tschool_meta_version';
const MANAGED_EVENT_TAG_VALUE = '1';
const STANDARD_DESCRIPTION_TEMPLATE = ${formatString(STANDARD_CUSTOM_DESCRIPTION_TEMPLATE)};
const VISIBLE_DESCRIPTION_FOOTER = '[T-SCHOOL Schedule Sync]';
const COURSE_OUTLINE_DISCLAIMER = '＊部分資訊來自課綱，請以教師最新說明為主';
const DEFAULT_CONTROL_PANEL_NAME = '行程同步控制臺｜T-SCHOOL Schedule Sync';
const MANAGED_CALENDAR_DESCRIPTION = 'T-SCHOOL Schedule Sync managed calendar';
// 只供辨識既有事件；新版不再把技術標記寫入使用者可見的說明欄。
const MANAGED_MARKER = '[T-SCHOOL-SCHEDULE-SYNC]';
const DESCRIPTION_MARKER = '[T-SCHOOL 行程同步]';
const LEGACY_DESCRIPTION_MARKER = '[T-SCHOOL 課表同步]';
const ALLOW_QUICK_DELETE_ALL = false;
${highLoadConstantCode}const DEFAULT_SETTINGS = ${formatObject(initialSettings)};
const SETTINGS_SIDEBAR_HTML = ${formatLongString(sidebarHtml)};
const SETUP_DIALOG_HTML = ${formatLongString(setupDialogHtml)};
const SETUP_CODE_PREFIX = 'TSCHOOL_SETUP_V1';
const SETUP_CODE_SCHEMA_VERSION = 2;
const SETUP_CODE_MAX_LENGTH = 32 * 1024;
const SETUP_CATALOG_FINGERPRINT_VERSION = 3;
const SETUP_CONTEXT_FINGERPRINT_VERSION = 3;
const SCHEDULE_FINGERPRINT_VERSION = 3;
const GRADE_API_NAMES = { '高一': '一年級', '高二': '二年級', '高三': '三年級' };
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const MANUAL_MERGE_EXCEPTIONS = {};
const TITLE_SIMILARITY_CLUSTER_THRESHOLD = 0.34;
const TITLE_SIMILARITY_EPSILON = 1e-12;
const TRADITIONAL_CHINESE_STROKE_COLLATOR = (() => {
  try {
    return new Intl.Collator('zh-Hant-u-co-stroke', { numeric: true, sensitivity: 'base' });
  } catch (error) {
    return {
      compare: (left, right) => String(left).localeCompare(String(right), 'zh-Hant', {
        numeric: true,
        sensitivity: 'base'
      })
    };
  }
})();
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
let scheduleSourceRuntimeCache_ = Object.create(null);
let emailTemplateManifestRuntimeCache_ = null;
let emailTemplateManifestRuntimeLoadAttempted_ = false;

function getControlPanelUi_() {
  return DocumentApp.getUi();
}

function getControlPanelUrl_() {
  try {
    const document = DocumentApp.getActiveDocument();
    return document && typeof document.getUrl === 'function'
      ? String(document.getUrl() || '')
      : '';
  } catch (error) {
    return '';
  }
}

function getControlPanelName_() {
  try {
    const document = DocumentApp.getActiveDocument();
    const name = document && typeof document.getName === 'function'
      ? String(document.getName() || '').trim()
      : '';
    return name || DEFAULT_CONTROL_PANEL_NAME;
  } catch (error) {
    return DEFAULT_CONTROL_PANEL_NAME;
  }
}

function hasImportedSetup_(settings) {
  return Boolean(settings && settings.setupImportedAt && settings.setupCodeVersion);
}

function assertSetupImported_(settings) {
  if (!hasImportedSetup_(settings)) {
    throw new Error('請先開啟控制臺介面，貼上網站產生的設定碼。');
  }
}

function onOpen() {
  const ui = getControlPanelUi_();
  const settings = loadSettings_();
  const menu = ui
    .createMenu('T-SCHOOL Schedule Sync')
    .addItem('開啟控制臺介面', 'showSettingsSidebar');

  if (!hasImportedSetup_(settings)) {
    menu.addToUi();
    return;
  }

  menu
    .addSeparator()
    .addItem('立即同步', 'syncMyScheduleToCalendar')
    .addItem('關閉 / 啟用自動同步', 'toggleAutoSyncFromMenu')
    .addItem('查看同步狀態', 'showSyncStatus')
    .addItem('強制修復', 'forceFullSyncMyScheduleToCalendar')
    .addSeparator();

${highLoadMenuCode}

  menu
    .addItem('移除受管理事件', 'confirmQuickDeleteSyncedEvents')
    .addToUi();
}

function showSettingsSidebar() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const settings = loadSettings_();
  if (!hasImportedSetup_(settings) ||
      (!settings.setupComplete && !hasSetupSourceContext_(settings))) {
    showSetupImportDialog();
    return;
  }
  const output = HtmlService.createHtmlOutput(SETTINGS_SIDEBAR_HTML)
    .setTitle('行程同步控制臺');
  getControlPanelUi_().showSidebar(output);
}

function showSetupImportDialog() {
  const settings = loadSettings_();
  if (settings.setupComplete) {
    throw new Error('首次同步已完成，為了保護現有日曆與同步狀態，不能再匯入安裝設定碼。');
  }
  const output = HtmlService.createHtmlOutput(SETUP_DIALOG_HTML)
    .setWidth(560)
    .setHeight(640);
  getControlPanelUi_().showModalDialog(output, '匯入設定');
}

function getSettingsUiData() {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const observedSettings = loadSettings_();
    assertSetupImported_(observedSettings);
    const source = !observedSettings.setupComplete
      ? loadSetupSourceContext_(observedSettings)
      : loadSourceContextForUi_(observedSettings);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) {
      throw new Error('背景同步正在保存行程，請稍後重新開啟控制臺。');
    }
    let settings;
    let stateStillMatches = false;
    try {
      settings = loadSettings_();
      assertSetupImported_(settings);
      stateStillMatches = settings.gradeName === observedSettings.gradeName &&
        termKeysMatch_(settings.termKey, observedSettings.termKey) &&
        Boolean(settings.setupComplete) === Boolean(observedSettings.setupComplete) &&
        (settings.setupComplete || !settings.setupContextFingerprint ||
          settings.setupContextFingerprint === source.setupContextFingerprint);
      if (stateStillMatches && !source.sourceUnavailable) {
        settings = applyTermTransitionIfNeeded_(settings, source, true);
      }
    } finally {
      lock.releaseLock();
    }
    if (stateStillMatches) return buildUiData_(settings, source);
  }
  throw new Error('設定剛剛被其他執行更新，請重新開啟控制臺。');
}

function previewSetupCodeForUi(code) {
  const settings = loadSettings_();
  if (settings.setupComplete) {
    throw new Error('首次同步已完成，不能再匯入安裝設定碼。');
  }
  return setupImportPreviewForClient_(buildSetupImportPreview_(code, settings));
}

function importSetupCodeFromUi(code, confirmUnverifiedAccount) {
  const beforeImport = loadSettings_();
  if (beforeImport.setupComplete) {
    throw new Error('首次同步已完成，不能再匯入安裝設定碼。');
  }
  const decoded = decodeSetupCode_(code);
  const notificationEmail = String(decoded.payload && decoded.payload.notificationEmail || '').trim();
  assertSingleEmail_(notificationEmail);
  const accountCheck = getActiveGoogleAccountCheck_(notificationEmail);
  if (accountCheck.accountMismatch) {
    return {
      applied: false,
      accountMismatch: true,
      accountVerificationUnavailable: false,
      notificationEmail
    };
  }
  if (accountCheck.accountVerificationUnavailable && !confirmUnverifiedAccount) {
    return {
      applied: false,
      accountMismatch: false,
      accountVerificationUnavailable: true,
      requiresAccountConfirmation: true,
      notificationEmail
    };
  }
  const preview = buildSetupImportPreview_(code, beforeImport, decoded);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('控制臺正在處理其他資料，請稍後重試。');
  try {
    const previous = loadSettings_();
    if (previous.setupComplete) {
      throw new Error('首次同步已完成，不能再匯入安裝設定碼。');
    }
    return Object.assign({
      applied: true,
      accountMismatch: false,
      accountVerificationUnavailable: accountCheck.accountVerificationUnavailable,
      requiresAccountConfirmation: false,
      notificationEmail
    },
      applySetupImportPreview_(preview, previous));
  } finally {
    lock.releaseLock();
  }
}

function applySetupCodeFromUi(code, confirmationToken) {
  const beforeImport = loadSettings_();
  if (beforeImport.setupComplete) {
    throw new Error('首次同步已完成，不能再匯入安裝設定碼。');
  }
  const preview = buildSetupImportPreview_(code, beforeImport);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('控制臺正在處理其他資料，請稍後重試。');
  try {
    const previous = loadSettings_();
    if (previous.setupComplete) {
      throw new Error('首次同步已完成，不能再匯入安裝設定碼。');
    }
    if (!confirmationToken || confirmationToken !== preview.confirmationToken) {
      throw new Error('課表在確認期間又有變動，請重新檢查設定碼。');
    }
    return applySetupImportPreview_(preview, previous);
  } finally {
    lock.releaseLock();
  }
}

function applySetupImportPreview_(preview, previous) {
  const input = {
    gradeName: preview.gradeName,
    selectedTitles: preview.selectedTitles,
    notificationEmail: preview.notificationEmail,
    instantNotificationsEnabled: preview.instantNotificationsEnabled,
    notificationHours: preview.notificationHours,
    notifySyncHour: preview.notificationHours[preview.notificationHours.length - 1],
    autoSyncEnabled: true,
    calendarId: '',
    calendarName: defaultCalendarNameForGrade_(preview.gradeName),
    reminderMode: 'none',
    reminderMinutes: 10
  };
  const setupSource = normalizeSetupSourceContext_(preview.source_, preview.gradeName);
  const next = sanitizeSettingsInput_(input, previous, setupSource);
  next.setupComplete = false;
  next.setupImportedAt = new Date().toISOString();
  next.setupCodeVersion = preview.schemaVersion || SETUP_CODE_SCHEMA_VERSION;
  next.setupContextFingerprint = setupSource.setupContextFingerprint;
  next.calendarId = '';
  next.calendarMigrationFromId = '';
  next.pendingTermKey = '';
  next.pausedReason = '';
  saveSetupSourceContext_(setupSource, preview.gradeName);
  saveSettings_(next);
  let operationWarning = '';
  try {
    cancelActiveSyncJob_('已重新匯入安裝設定。');
    deleteAutoSyncTriggersUnlocked_();
  } catch (cleanupError) {
    operationWarning = '網站設定已匯入，但舊的背景工作暫時無法完全整理。';
    Logger.log('重新匯入後無法完全整理舊背景工作：' + userFacingError_(cleanupError));
  }
  return { message: '網站設定已匯入', operationWarning };
}

function saveSetupSourceContext_(source, gradeName) {
  if (!source || !source.catalog) return;
  const normalized = normalizeSetupSourceContext_(source, gradeName);
  writeChunkedJson_(SETUP_SOURCE_CONTEXT_STORE, normalized);
}

function loadSetupSourceContext_(settings) {
  const stored = readChunkedJson_(SETUP_SOURCE_CONTEXT_STORE, null);
  if (!stored || !stored.catalog ||
      stored.gradeName !== settings.gradeName ||
      !termKeysMatch_(stored.termKey, settings.termKey)) {
    throw new Error('請重新貼上行程同步設定碼，再開啟控制臺。');
  }
  const source = normalizeSetupSourceContext_(stored, settings.gradeName);
  const expectedContextFingerprint = String(settings.setupContextFingerprint || '');
  const storedContextFingerprint = String(
    stored.setupContextFingerprint || stored.contextFingerprint || ''
  );
  if (expectedContextFingerprint &&
      expectedContextFingerprint !== source.setupContextFingerprint &&
      expectedContextFingerprint !== storedContextFingerprint &&
      Number(settings.setupCodeVersion) !== 1) {
    throw new Error('設定碼課表摘要已改變，請重新貼上行程同步設定碼。');
  }
  return source;
}

function loadSourceContextForUi_(settings) {
  try {
    const source = loadSourceContext_(settings.gradeName);
    saveSourceUiCacheSafely_(source);
    return source;
  } catch (error) {
    Logger.log('控制臺無法讀取即時課表，改用唯讀來源摘要：' + userFacingError_(error));
    return loadSourceUiFallback_(settings, error);
  }
}

function saveSourceUiCacheSafely_(source) {
  if (!source || !source.catalog) return false;
  const snapshot = {
    gradeName: String(source.gradeName || ''),
    firstDateKey: String(source.firstDateKey || ''),
    lastDateKey: String(source.lastDateKey || ''),
    termKey: String(source.termKey || ''),
    catalogFingerprintVersion: Number(source.catalogFingerprintVersion) || 0,
    catalogFingerprint: String(source.catalogFingerprint || ''),
    scheduleFingerprint: String(source.scheduleFingerprint || ''),
    sourceUpdatedLabel: String(source.sourceUpdatedLabel || ''),
    sourceStale: Boolean(source.sourceStale),
    catalog: {
      all: (source.catalog.all || []).map(item => ({
        title: String(item.title || ''),
        period: item.period === 'vacation' ? 'vacation' : 'term'
      }))
    },
    cachedAt: new Date().toISOString()
  };
  snapshot.catalog.termItems = snapshot.catalog.all.filter(item => item.period === 'term');
  snapshot.catalog.vacationItems = snapshot.catalog.all.filter(item => item.period === 'vacation');
  try {
    writeChunkedJson_(SOURCE_UI_CACHE_STORE, snapshot);
    return true;
  } catch (error) {
    Logger.log('無法更新控制臺課表備援摘要：' + userFacingError_(error));
    return false;
  }
}

function loadSourceUiFallback_(settings, sourceError) {
  const cached = readChunkedJson_(SOURCE_UI_CACHE_STORE, null);
  const observation = loadSourceObservation_();
  const acceptedTerms = uniqueStrings_([
    settings.pendingTermKey,
    settings.termKey,
    observation.termCandidate && observation.termCandidate.termKey
  ].map(normalizeTermKey_));
  let fallback = cached && cached.catalog &&
    cached.gradeName === settings.gradeName &&
    (!acceptedTerms.length || acceptedTerms.indexOf(normalizeTermKey_(cached.termKey)) !== -1)
    ? cached
    : null;

  if (!fallback) {
    const setupSource = readChunkedJson_(SETUP_SOURCE_CONTEXT_STORE, null);
    if (setupSource && setupSource.catalog && setupSource.gradeName === settings.gradeName &&
        (!acceptedTerms.length || acceptedTerms.indexOf(normalizeTermKey_(setupSource.termKey)) !== -1)) {
      fallback = setupSource;
    }
  }

  if (!fallback) fallback = buildSettingsSourceUiFallback_(settings);
  const catalogAll = sortCatalogItemsByPeriod_((fallback.catalog && fallback.catalog.all || []).map(item => ({
    title: String(item.title || ''),
    period: item.period === 'vacation' ? 'vacation' : 'term'
  })));
  return Object.assign({}, fallback, {
    gradeName: settings.gradeName,
    catalog: {
      all: catalogAll,
      termItems: catalogAll.filter(item => item.period === 'term'),
      vacationItems: catalogAll.filter(item => item.period === 'vacation')
    },
    events: [],
    initialSetupSnapshot: true,
    sourceUnavailable: true,
    sourceUnavailableMessage: '課表來源暫時無法連線；目前顯示上次可用摘要，恢復連線後才能儲存或同步。',
    sourceUnavailableDetail: userFacingError_(sourceError),
    sourceCacheSavedAt: String(fallback.cachedAt || '')
  });
}

function buildSettingsSourceUiFallback_(settings) {
  const titles = uniqueStrings_([].concat(
    settings.knownTitles || [],
    settings.selectedTitles || [],
    settings.pendingTitles || [],
    settings.excludedTitles || []
  ));
  const catalogAll = titles.map(title => ({
    title,
    period: 'term'
  }));
  return {
    gradeName: settings.gradeName,
    firstDateKey: '',
    lastDateKey: '',
    termKey: String(settings.pendingTermKey || settings.termKey || ''),
    catalogFingerprintVersion: 0,
    catalogFingerprint: '',
    scheduleFingerprint: String(settings.scheduleFingerprint || ''),
    sourceUpdatedLabel: '',
    sourceStale: true,
    catalog: { all: catalogAll },
    cachedAt: ''
  };
}

function compareCanonicalStrings_(left, right) {
  const leftText = String(left == null ? '' : left);
  const rightText = String(right == null ? '' : right);
  return leftText < rightText ? -1 : (leftText > rightText ? 1 : 0);
}

function sortCanonicalRows_(rows) {
  return (Array.isArray(rows) ? rows : []).slice().sort((left, right) =>
    compareCanonicalStrings_(JSON.stringify(left), JSON.stringify(right))
  );
}

function normalizeSimilarityTitle_(value) {
  return normalizeText_(value)
    .replace(/\\s+/g, '')
    .replace(/[・．.。:：/／|｜_＿\\-‐‑–—]/g, '')
    .toLowerCase();
}

function compareDisplayTitles_(left, right) {
  const leftText = String(left == null ? '' : left);
  const rightText = String(right == null ? '' : right);
  return TRADITIONAL_CHINESE_STROKE_COLLATOR.compare(leftText, rightText) ||
    compareCanonicalStrings_(leftText, rightText);
}

function normalizedEditSimilarity_(left, right) {
  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  const longestLength = Math.max(leftCharacters.length, rightCharacters.length);
  if (longestLength === 0) return 1;
  let previous = Array.from(
    { length: rightCharacters.length + 1 },
    (unused, index) => index
  );
  leftCharacters.forEach((leftCharacter, leftIndex) => {
    const current = [leftIndex + 1];
    rightCharacters.forEach((rightCharacter, rightIndex) => {
      current[rightIndex + 1] = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + (leftCharacter === rightCharacter ? 0 : 1)
      );
    });
    previous = current;
  });
  return 1 - previous[rightCharacters.length] / longestLength;
}

function commonPrefixCoverage_(left, right) {
  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  const shortestLength = Math.min(leftCharacters.length, rightCharacters.length);
  let sharedLength = 0;
  while (
    sharedLength < shortestLength &&
    leftCharacters[sharedLength] === rightCharacters[sharedLength]
  ) {
    sharedLength += 1;
  }
  return shortestLength ? sharedLength / shortestLength : 0;
}

function bigramDiceSimilarity_(left, right) {
  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  if (leftCharacters.length < 2 || rightCharacters.length < 2) {
    return left === right ? 1 : 0;
  }
  const leftBigrams = new Map();
  let matches = 0;
  for (let index = 0; index < leftCharacters.length - 1; index += 1) {
    const bigram = leftCharacters[index] + leftCharacters[index + 1];
    leftBigrams.set(bigram, (leftBigrams.get(bigram) || 0) + 1);
  }
  for (let index = 0; index < rightCharacters.length - 1; index += 1) {
    const bigram = rightCharacters[index] + rightCharacters[index + 1];
    const available = leftBigrams.get(bigram) || 0;
    if (available > 0) {
      matches += 1;
      leftBigrams.set(bigram, available - 1);
    }
  }
  return (2 * matches) / (leftCharacters.length + rightCharacters.length - 2);
}

function calculateTitleSimilarity_(left, right) {
  const leftTitle = normalizeSimilarityTitle_(left);
  const rightTitle = normalizeSimilarityTitle_(right);
  if (leftTitle === rightTitle) return 1;
  const leftLeadingCharacters = Array.from(leftTitle).slice(0, 3).join('');
  const rightLeadingCharacters = Array.from(rightTitle).slice(0, 3).join('');
  return (
    0.5 * normalizedEditSimilarity_(leftLeadingCharacters, rightLeadingCharacters) +
    0.25 * commonPrefixCoverage_(leftTitle, rightTitle) +
    0.15 * bigramDiceSimilarity_(leftTitle, rightTitle) +
    0.1 * normalizedEditSimilarity_(leftTitle, rightTitle)
  );
}

// This rule controls initial selection and list placement only. It does not
// assign a course/activity type or affect event parsing.
function isDefaultSelectedTitle_(value) {
  const title = normalizeTitle_(value);
  return /全校|學習分享會|補假|補課|放假|節假日|國定假日|模擬考|模考|春節|元旦|端午節|中秋節|清明節|兒童節|國慶日|和平紀念日|開國紀念日|勞動節|光復節|教師節|行憲紀念日/.test(title);
}

function compareSimilarityLeaves_(left, right) {
  return compareDisplayTitles_(left.title, right.title) ||
    compareCanonicalStrings_(left.period, right.period) ||
    left.originalIndex - right.originalIndex;
}

function compareSimilaritySequences_(left, right) {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const comparison = compareSimilarityLeaves_(left[index], right[index]);
    if (comparison !== 0) return comparison;
  }
  return left.length - right.length;
}

function parseClassVariantTitle_(title) {
  const match = normalizeSimilarityTitle_(title).match(/^(.*)(海風班|山嵐班)$/);
  return match && match[1]
    ? { base: match[1], variant: match[2] }
    : null;
}

function buildInitialSimilarityClusters_(leaves) {
  const families = new Map();
  leaves.forEach(leaf => {
    const parsed = parseClassVariantTitle_(leaf.title);
    if (!parsed) return;
    if (!families.has(parsed.base)) {
      families.set(parsed.base, { leaves: [], variants: new Set() });
    }
    const family = families.get(parsed.base);
    family.leaves.push(leaf);
    family.variants.add(parsed.variant);
  });

  const hardBlockFamilies = new Set();
  families.forEach((family, base) => {
    if (family.variants.has('海風班') && family.variants.has('山嵐班')) {
      hardBlockFamilies.add(base);
    }
  });

  const emittedFamilies = new Set();
  const clusters = [];
  leaves.forEach(leaf => {
    const parsed = parseClassVariantTitle_(leaf.title);
    const familyBase = parsed && hardBlockFamilies.has(parsed.base)
      ? parsed.base
      : '';
    if (familyBase) {
      if (emittedFamilies.has(familyBase)) return;
      emittedFamilies.add(familyBase);
      const familyLeaves = families.get(familyBase).leaves
        .slice()
        .sort(compareSimilarityLeaves_);
      clusters.push({
        id: clusters.length,
        anchor: familyLeaves[0],
        leaves: familyLeaves
      });
      return;
    }
    clusters.push({
      id: clusters.length,
      anchor: leaf,
      leaves: [leaf]
    });
  });
  return clusters;
}

function calculateCompleteLinkSimilarity_(first, second) {
  let similarity = 1;
  first.leaves.forEach(firstLeaf => {
    second.leaves.forEach(secondLeaf => {
      similarity = Math.min(
        similarity,
        calculateTitleSimilarity_(firstLeaf.title, secondLeaf.title)
      );
    });
  });
  return similarity;
}

function orientSimilarityClusters_(first, second) {
  const firstForward = first.leaves.slice();
  const firstReverse = first.leaves.slice().reverse();
  const secondForward = second.leaves.slice();
  const secondReverse = second.leaves.slice().reverse();
  const candidates = [];
  [firstForward, firstReverse].forEach(firstSequence => {
    [secondForward, secondReverse].forEach(secondSequence => {
      candidates.push({
        joinIndex: firstSequence.length,
        leaves: firstSequence.concat(secondSequence)
      });
      candidates.push({
        joinIndex: secondSequence.length,
        leaves: secondSequence.concat(firstSequence)
      });
    });
  });
  candidates.sort((left, right) => {
    const leftSimilarity = calculateTitleSimilarity_(
      left.leaves[left.joinIndex - 1].title,
      left.leaves[left.joinIndex].title
    );
    const rightSimilarity = calculateTitleSimilarity_(
      right.leaves[right.joinIndex - 1].title,
      right.leaves[right.joinIndex].title
    );
    return rightSimilarity - leftSimilarity ||
      compareSimilaritySequences_(left.leaves, right.leaves);
  });
  return candidates[0].leaves;
}

function sortCatalogItemsBySimilarity_(catalogItems) {
  const sourceItems = Array.isArray(catalogItems) ? catalogItems : [];
  const leaves = sourceItems.map((item, originalIndex) => ({
    item,
    originalIndex,
    title: String(item && item.title || ''),
    period: item && item.period === 'vacation' ? 'vacation' : 'term'
  })).sort(compareSimilarityLeaves_);
  if (leaves.length < 2) return leaves.map(leaf => leaf.item);

  let clusters = buildInitialSimilarityClusters_(leaves);
  let nextClusterId = clusters.length;
  const clusterSimilarities = new Map();
  const pairKey = (leftId, rightId) => leftId < rightId
    ? leftId + ':' + rightId
    : rightId + ':' + leftId;
  const getClusterSimilarity = (left, right) =>
    clusterSimilarities.get(pairKey(left.id, right.id));
  const setClusterSimilarity = (left, right, similarity) => {
    clusterSimilarities.set(pairKey(left.id, right.id), similarity);
  };

  for (let leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex += 1) {
      setClusterSimilarity(
        clusters[leftIndex],
        clusters[rightIndex],
        calculateCompleteLinkSimilarity_(clusters[leftIndex], clusters[rightIndex])
      );
    }
  }

  while (clusters.length > 1) {
    clusters.sort((left, right) => compareSimilarityLeaves_(left.anchor, right.anchor));
    let bestPair = null;
    for (let leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex += 1) {
        const similarity = getClusterSimilarity(clusters[leftIndex], clusters[rightIndex]);
        if (
          similarity >= TITLE_SIMILARITY_CLUSTER_THRESHOLD &&
          (!bestPair || similarity > bestPair.similarity + TITLE_SIMILARITY_EPSILON)
        ) {
          bestPair = { leftIndex, rightIndex, similarity };
        }
      }
    }
    if (!bestPair) break;
    const first = clusters[bestPair.leftIndex];
    const second = clusters[bestPair.rightIndex];
    const remaining = clusters.filter((cluster, index) =>
      index !== bestPair.leftIndex && index !== bestPair.rightIndex
    );
    const mergedLeaves = orientSimilarityClusters_(first, second);
    const merged = {
      id: nextClusterId,
      anchor: mergedLeaves.slice().sort(compareSimilarityLeaves_)[0],
      leaves: mergedLeaves
    };
    nextClusterId += 1;
    remaining.forEach(cluster => {
      setClusterSimilarity(
        merged,
        cluster,
        Math.min(
          getClusterSimilarity(first, cluster),
          getClusterSimilarity(second, cluster)
        )
      );
    });
    clusters = remaining.concat(merged);
  }

  const orderedLeaves = [];
  clusters
    .sort((left, right) => compareSimilarityLeaves_(left.anchor, right.anchor))
    .forEach(cluster => {
      Array.prototype.push.apply(orderedLeaves, cluster.leaves);
    });
  return orderedLeaves.map(leaf => leaf.item);
}

function sortCatalogItemsForSelection_(catalogItems) {
  const items = Array.isArray(catalogItems) ? catalogItems : [];
  const regularItems = items.filter(item => !isDefaultSelectedTitle_(item && item.title));
  const defaultSelectedItems = items.filter(item => isDefaultSelectedTitle_(item && item.title));
  return sortCatalogItemsBySimilarity_(regularItems)
    .concat(sortCatalogItemsBySimilarity_(defaultSelectedItems));
}

function sortCatalogItemsByPeriod_(catalogItems) {
  const items = Array.isArray(catalogItems) ? catalogItems : [];
  return sortCatalogItemsForSelection_(items.filter(item => item.period === 'term'))
    .concat(sortCatalogItemsForSelection_(items.filter(item => item.period === 'vacation')));
}

function makeCatalogFingerprintRows_(catalogItems) {
  return sortCanonicalRows_((Array.isArray(catalogItems) ? catalogItems : []).map(item => [
    String(item && item.title || ''),
    item && item.period === 'vacation' ? 'vacation' : 'term'
  ]));
}

function makeAcademicTermKey_(gradeApiName, firstDateKey) {
  const match = String(firstDateKey || '').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (!gradeApiName || !match) throw new Error('無法判定課表屬於哪一個學期。');
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) throw new Error('無法判定課表屬於哪一個學期。');
  const academicYear = month >= 8 ? year : year - 1;
  const semester = month >= 8 || month === 1 ? 1 : 2;
  return String(gradeApiName) + '|' + academicYear + '-' + semester;
}

function normalizeTermKey_(termKey) {
  const value = String(termKey || '').trim();
  const canonical = value.match(/^(.+)\\|(\\d{4})-([12])$/);
  if (canonical) return canonical[1] + '|' + canonical[2] + '-' + canonical[3];
  const legacy = value.match(/^(.+)\\|(\\d{4}-\\d{2}-\\d{2})$/);
  if (!legacy) return value;
  try {
    return makeAcademicTermKey_(legacy[1], legacy[2]);
  } catch (error) {
    return value;
  }
}

function termKeysMatch_(left, right) {
  return Boolean(left && right && normalizeTermKey_(left) === normalizeTermKey_(right));
}

function makeSetupCatalogFingerprint_(termKey, lastDateKey, catalogItems) {
  return hashText_(JSON.stringify([
    'setup-catalog',
    SETUP_CATALOG_FINGERPRINT_VERSION,
    String(termKey || ''),
    String(lastDateKey || ''),
    makeCatalogFingerprintRows_(catalogItems)
  ]));
}

function makeLegacyV2SetupCatalogFingerprint_(termKey, lastDateKey, catalogItems) {
  return hashText_(JSON.stringify([
    'setup-catalog',
    2,
    String(termKey || ''),
    String(lastDateKey || ''),
    makeCatalogFingerprintRows_(catalogItems)
  ]));
}

function makeLegacySetupCatalogFingerprint_(termKey, lastDateKey, catalogItems) {
  const titles = (Array.isArray(catalogItems) ? catalogItems : [])
    .map(item => String(item && item.title || ''))
    .sort((left, right) => left.localeCompare(right, 'zh-Hant'));
  return hashText_(JSON.stringify([
    String(termKey || ''),
    String(lastDateKey || ''),
    titles
  ]));
}

function makeLegacyClassifiedSetupCatalogFingerprint_(termKey, lastDateKey, catalogItems) {
  const rows = sortCanonicalRows_((Array.isArray(catalogItems) ? catalogItems : []).map(item => [
    String(item && item.title || ''),
    item && item.type === 'activity' ? 'activity' : 'course',
    item && item.period === 'vacation' ? 'vacation' : 'term'
  ]));
  return hashText_(JSON.stringify([
    'setup-catalog',
    1,
    String(termKey || ''),
    String(lastDateKey || ''),
    rows
  ]));
}

function makeSetupContextFingerprintVersion_(source, version) {
  return hashText_(JSON.stringify([
    'setup-context',
    version,
    String(source && source.gradeName || ''),
    String(source && source.termKey || ''),
    String(source && source.firstDateKey || ''),
    String(source && source.lastDateKey || ''),
    Number(source && source.catalogFingerprintVersion) || 0,
    String(source && source.catalogFingerprint || ''),
    makeCatalogFingerprintRows_(source && source.catalog && source.catalog.all)
  ]));
}

function makeSetupContextFingerprint_(source) {
  return makeSetupContextFingerprintVersion_(source, SETUP_CONTEXT_FINGERPRINT_VERSION);
}

function normalizeSetupSourceContext_(source, gradeName) {
  if (!source || !source.catalog || !Array.isArray(source.catalog.all)) {
    throw new Error('設定碼的課表摘要無法辨識，請回網站重新產生。');
  }
  const sourceCatalogItems = source.catalog.all;
  const sourceFingerprintVersion = Number(source.catalogFingerprintVersion) || 0;
  const suppliedFingerprint = String(source.catalogFingerprint || source.fingerprint || '');
  const seen = {};
  const catalogAll = sortCatalogItemsByPeriod_(sourceCatalogItems.map(item => {
    const title = String(item && item.title || '').trim().slice(0, 300);
    const period = item && item.period;
    const key = normalizeTitle_(title);
    if (!key || seen[key] || ['term', 'vacation'].indexOf(period) === -1) {
      throw new Error('設定碼的課表摘要無法辨識，請回網站重新產生。');
    }
    seen[key] = true;
    return { title, period };
  }));
  if (sourceFingerprintVersion === SETUP_CATALOG_FINGERPRINT_VERSION) {
    const expected = makeSetupCatalogFingerprint_(source.termKey, source.lastDateKey, catalogAll);
    if (!suppliedFingerprint || suppliedFingerprint !== expected) {
      throw new Error('設定碼的課表摘要指紋不一致，請回網站重新產生。');
    }
  } else if (sourceFingerprintVersion === 2) {
    const expected = makeLegacyV2SetupCatalogFingerprint_(
      source.termKey,
      source.lastDateKey,
      catalogAll
    );
    if (!suppliedFingerprint || suppliedFingerprint !== expected) {
      throw new Error('舊版設定碼的課表摘要指紋不一致，請回網站重新產生。');
    }
  } else if (sourceFingerprintVersion === 1) {
    const expected = makeLegacyClassifiedSetupCatalogFingerprint_(
      source.termKey,
      source.lastDateKey,
      sourceCatalogItems
    );
    if (!suppliedFingerprint || suppliedFingerprint !== expected) {
      throw new Error('舊版設定碼的課表摘要指紋不一致，請回網站重新產生。');
    }
  } else if (sourceFingerprintVersion !== 0) {
    throw new Error('設定碼的課表摘要版本無法辨識，請回網站重新產生。');
  }
  const normalized = {
    gradeName: String(source.gradeName || gradeName || ''),
    firstDateKey: String(source.firstDateKey || ''),
    lastDateKey: String(source.lastDateKey || ''),
    sourceUpdatedLabel: String(source.sourceUpdatedLabel || ''),
    sourceStale: Boolean(source.sourceStale),
    catalog: {
      all: catalogAll,
      termItems: catalogAll.filter(item => item.period === 'term'),
      vacationItems: catalogAll.filter(item => item.period === 'vacation')
    },
    termKey: normalizeTermKey_(source.termKey),
    catalogFingerprintVersion: SETUP_CATALOG_FINGERPRINT_VERSION,
    catalogFingerprint: makeSetupCatalogFingerprint_(
      normalizeTermKey_(source.termKey),
      source.lastDateKey,
      catalogAll
    ),
    events: [],
    initialSetupSnapshot: true
  };
  normalized.setupContextFingerprint = makeSetupContextFingerprint_(normalized);
  const suppliedContextFingerprint = String(
    source.setupContextFingerprint || source.contextFingerprint || ''
  );
  if (suppliedContextFingerprint) {
    const expectedContextFingerprint = sourceFingerprintVersion === 2
      ? makeSetupContextFingerprintVersion_(source, 2)
      : normalized.setupContextFingerprint;
    if (suppliedContextFingerprint !== expectedContextFingerprint) {
      throw new Error('設定碼課表摘要已改變，請重新貼上行程同步設定碼。');
    }
  }
  return normalized;
}

function getSetupPayloadCatalogFingerprint_(payload) {
  return String(payload && (payload.catalogFingerprint || payload.sourceFingerprint) || '').trim();
}

function setupPayloadCatalogMatchesSource_(payload, source) {
  const supplied = getSetupPayloadCatalogFingerprint_(payload);
  const version = Number(payload && payload.catalogFingerprintVersion) || 0;
  if (!supplied) return false;
  if (version === SETUP_CATALOG_FINGERPRINT_VERSION) {
    return Number(source.catalogFingerprintVersion) === version &&
      supplied === source.catalogFingerprint;
  }
  if (version === 2) {
    return supplied === makeLegacyV2SetupCatalogFingerprint_(
      payload.termKey,
      source.lastDateKey,
      source.catalog.all
    );
  }
  if (version === 1) {
    return Boolean(payload && payload.sourceSnapshot);
  }
  if (version !== 0) return false;
  return supplied === source.catalogFingerprint || supplied === makeLegacySetupCatalogFingerprint_(
    source.termKey,
    source.lastDateKey,
    source.catalog.all
  );
}

function hasSetupSourceContext_(settings) {
  try {
    loadSetupSourceContext_(settings);
    return true;
  } catch (error) {
    return false;
  }
}

function buildSetupImportPreview_(code, previous, decodedSetup) {
  const decoded = decodedSetup || decodeSetupCode_(code);
  const payload = decoded.payload;
  if (!GRADE_API_NAMES[payload.gradeName]) {
    throw new Error('設定碼的年級無法辨識，請回網站重新產生。');
  }
  if (!String(payload.termKey || '').trim() || !getSetupPayloadCatalogFingerprint_(payload)) {
    throw new Error('設定碼缺少課表版本，請回網站重新產生。');
  }
  if (typeof payload.instantNotificationsEnabled !== 'boolean' ||
      (payload.schemaVersion === SETUP_CODE_SCHEMA_VERSION && !Array.isArray(payload.selectedTitles)) ||
      (payload.schemaVersion === 1 &&
        (!Array.isArray(payload.selectedCourses) || !Array.isArray(payload.excludedActivities) ||
          typeof payload.includeActivities !== 'boolean'))) {
    throw new Error('設定碼的設定欄位無法辨識，請回網站重新產生。');
  }
  const notificationEmail = String(payload.notificationEmail || '').trim();
  assertSingleEmail_(notificationEmail);
  const notificationHours = validateSetupNotificationHours_(payload.notificationHours);
  const embeddedSource = buildSetupSourceContextFromPayload_(payload);
  const source = embeddedSource || loadSourceContext_(payload.gradeName);
  if (payload.termKey && source.termKey && !termKeysMatch_(payload.termKey, source.termKey)) {
    throw new Error('這份設定碼屬於不同學期，請回網站依目前課表重新產生。');
  }

  const itemByKey = {};
  source.catalog.all.forEach(item => {
    itemByKey[normalizeTitle_(item.title)] = item.title;
  });
  const missingItems = [];
  const requestedTitles = getSelectedTitlesFromSetupPayload_(payload, source);
  const selectedTitles = applyCourseSelectionRules_(requestedTitles.map(title => {
    const current = itemByKey[normalizeTitle_(title)] || '';
    if (!current) missingItems.push(String(title));
    return current;
  }).filter(Boolean), source.catalog.all);
  const sourceChanged = Boolean(
    missingItems.length ||
    !setupPayloadCatalogMatchesSource_(payload, source)
  );
  const confirmationToken = hashText_([
    decoded.codeHash,
    source.catalogFingerprint,
    source.setupContextFingerprint || '',
    payload.gradeName,
    selectedTitles.join('|'),
    notificationEmail,
    notificationHours.join(',')
  ].join('::'));

  return {
    schemaVersion: payload.schemaVersion,
    gradeName: payload.gradeName,
    selectedTitles,
    notificationEmail,
    instantNotificationsEnabled: payload.instantNotificationsEnabled !== false,
    notificationHours,
    sourceChanged,
    missingItems: uniqueStrings_(missingItems),
    confirmationToken,
    source_: source
  };
}

function getSelectedTitlesFromSetupPayload_(payload, source) {
  if (payload && payload.schemaVersion === SETUP_CODE_SCHEMA_VERSION) {
    return uniqueStrings_(payload.selectedTitles || []);
  }
  const snapshotItems = payload && payload.sourceSnapshot && payload.sourceSnapshot.items;
  const sourceItems = source && source.catalog && Array.isArray(source.catalog.all)
    ? source.catalog.all
    : [];
  const legacyItems = Array.isArray(snapshotItems) ? snapshotItems : sourceItems;
  const excludedKeys = uniqueStrings_(payload.excludedActivities || []).map(normalizeTitle_);
  const selected = uniqueStrings_(payload.selectedCourses || []);
  if (payload.includeActivities !== false) {
    legacyItems.forEach(item => {
      const selectedByLegacyType = Array.isArray(snapshotItems) && item && item.type === 'activity';
      const selectedByCurrentDefault = !Array.isArray(snapshotItems) &&
        isDefaultSelectedTitle_(item && item.title);
      if ((selectedByLegacyType || selectedByCurrentDefault) &&
          excludedKeys.indexOf(normalizeTitle_(item.title)) === -1) {
        selected.push(String(item.title || ''));
      }
    });
  }
  return uniqueStrings_(selected);
}

function buildSetupSourceContextFromPayload_(payload) {
  if (!Object.prototype.hasOwnProperty.call(payload || {}, 'sourceSnapshot')) return null;
  const snapshot = payload && payload.sourceSnapshot;
  const items = snapshot && Array.isArray(snapshot.items) ? snapshot.items : [];
  const firstDateKey = String(snapshot && snapshot.firstDateKey || '').trim();
  const lastDateKey = String(snapshot && snapshot.lastDateKey || '').trim();
  if (!snapshot || !/^\\d{4}-\\d{2}-\\d{2}$/.test(firstDateKey) ||
      !/^\\d{4}-\\d{2}-\\d{2}$/.test(lastDateKey) ||
      Date.parse(firstDateKey + 'T12:00:00+08:00') > Date.parse(lastDateKey + 'T12:00:00+08:00') ||
      !items.length || items.length > 500) {
    throw new Error('設定碼的課表摘要無法辨識，請回網站重新產生。');
  }

  const seen = {};
  const catalogAll = items.map(item => {
    const title = String(item && item.title || '').trim().slice(0, 300);
    const period = item && item.period;
    const key = normalizeTitle_(title);
    const legacyTypeValid = payload.schemaVersion !== 1 ||
      ['course', 'activity'].indexOf(item && item.type) !== -1;
    if (!key || seen[key] || !legacyTypeValid ||
        ['term', 'vacation'].indexOf(period) === -1) {
      throw new Error('設定碼的課表摘要無法辨識，請回網站重新產生。');
    }
    seen[key] = true;
    return payload.schemaVersion === 1
      ? { title, type: item.type, period }
      : { title, period };
  });
  const updateMatch = String(snapshot.sourceUpdatedLabel || '').match(/(\\d{8})/);
  const sourceUpdatedLabel = updateMatch ? updateMatch[1] : '';

  return normalizeSetupSourceContext_({
    gradeName: payload.gradeName,
    firstDateKey,
    lastDateKey,
    sourceUpdatedLabel,
    sourceStale: isSourceStale_(sourceUpdatedLabel, scheduleBusinessNow_()),
    catalog: {
      all: catalogAll
    },
    termKey: String(payload.termKey || ''),
    catalogFingerprintVersion: Number(payload.catalogFingerprintVersion) || 0,
    catalogFingerprint: getSetupPayloadCatalogFingerprint_(payload),
    events: [],
    initialSetupSnapshot: true
  }, payload.gradeName);
}

function setupImportPreviewForClient_(preview) {
  const accountCheck = getActiveGoogleAccountCheck_(preview.notificationEmail);
  return {
    gradeName: preview.gradeName,
    selectedTitles: preview.selectedTitles,
    notificationEmail: preview.notificationEmail,
    instantNotificationsEnabled: preview.instantNotificationsEnabled,
    notificationHours: preview.notificationHours,
    accountMismatch: accountCheck.accountMismatch,
    accountVerificationUnavailable: accountCheck.accountVerificationUnavailable,
    sourceChanged: preview.sourceChanged,
    missingItems: preview.missingItems,
    confirmationToken: preview.confirmationToken
  };
}

function activeGoogleAccountDoesNotMatch_(notificationEmail) {
  return getActiveGoogleAccountCheck_(notificationEmail).accountMismatch;
}

function getActiveGoogleAccountCheck_(notificationEmail) {
  const expectedEmail = String(notificationEmail || '').trim().toLowerCase();
  try {
    const activeUser = Session.getActiveUser();
    const activeEmail = String(activeUser && activeUser.getEmail
      ? activeUser.getEmail()
      : '').trim().toLowerCase();
    return {
      accountMismatch: Boolean(activeEmail && expectedEmail && activeEmail !== expectedEmail),
      accountVerificationUnavailable: Boolean(expectedEmail && !activeEmail)
    };
  } catch (error) {
    return {
      accountMismatch: false,
      accountVerificationUnavailable: Boolean(expectedEmail)
    };
  }
}

function decodeSetupCode_(code) {
  const normalized = String(code || '').trim();
  if (!normalized) throw new Error('請貼上設定碼。');
  if (normalized.length > SETUP_CODE_MAX_LENGTH) throw new Error('設定碼過長。');
  const parts = normalized.split('.');
  if (parts.length !== 3 || parts[0] !== SETUP_CODE_PREFIX) {
    throw new Error('這不是可用的 T-SCHOOL 設定碼。');
  }
  if (hashText_(parts[1]) !== parts[2]) {
    throw new Error('設定碼不完整，請回網站重新複製。');
  }
  let payload;
  try {
    const padding = '='.repeat((4 - parts[1].length % 4) % 4);
    const bytes = Utilities.base64DecodeWebSafe(parts[1] + padding);
    payload = JSON.parse(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
  } catch (error) {
    throw new Error('設定碼內容無法讀取，請回網站重新複製。');
  }
  if (!payload || [1, SETUP_CODE_SCHEMA_VERSION].indexOf(payload.schemaVersion) === -1) {
    throw new Error('設定碼版本不受支援，請回網站重新產生。');
  }
  return { payload, codeHash: hashText_(normalized) };
}

function validateSetupNotificationHours_(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 4) {
    throw new Error('設定碼的通知時間無法辨識。');
  }
  const result = [];
  values.forEach(value => {
    const hour = Number(value);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || result.indexOf(hour) !== -1) {
      throw new Error('設定碼的通知時間無法辨識。');
    }
    result.push(hour);
  });
  return result.sort((a, b) => a - b);
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
    const detail = getSyncJobProgressDetail_(job);
    return {
      state: job.status === 'retry_pending' ? 'retry_pending' :
        (job.status === 'queued' ? 'queued' : 'running'),
      percent: job.status === 'finalizing'
        ? 92
        : calculateSyncJobProgressPercent_(job),
      jobId: job.jobId,
      processed: detail.processed,
      total: detail.total,
      remaining: detail.remaining,
      nextAttemptAt: job.nextAttemptAt || '',
      message: job.status === 'retry_pending'
        ? '已保存進度，正在等待 Google 服務重試。'
        : (job.status === 'queued'
          ? '本批已保存，正在等待下一批背景續跑。'
          : (job.status === 'finalizing'
            ? '行程已寫入，正在完成控制臺設定。'
            : '正在分批同步行程。')),
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
  assertSetupImported_(loadSettings_());
  const cleanGrade = sanitizeGrade_(gradeName);
  return buildSourceUiModel_(loadSourceContext_(cleanGrade), cleanGrade);
}

function getGradeContextForUi(gradeName) {
  const settings = loadSettings_();
  assertSetupImported_(settings);
  const cleanGrade = sanitizeGrade_(gradeName);
  const source = loadSourceContext_(cleanGrade);
  const prospectiveSettings = Object.assign({}, settings, { gradeName: cleanGrade });
  const sourceIndex = loadCourseOutlineSourceIndex_();
  return {
    source: buildSourceUiModel_(source, cleanGrade),
    courseOutlineStatus: buildCourseOutlineUiStatus_(
      prospectiveSettings,
      source,
      sourceIndex
    ),
    termTransition: buildTermTransitionUiModel_(settings, source)
  };
}

function saveSettingsFromUi(input) {
  const result = saveSettingsCore_(input);
  const response = {
    message: '設定已儲存',
    operationWarning: result.operationWarning || ''
  };
  try {
    scheduleCourseOutlineRefreshIfNeeded_(result.settings, result.source);
  } catch (error) {
    response.operationWarning = appendWarning_(
      response.operationWarning,
      '設定已儲存，但課綱背景更新暫時無法排程。'
    );
    Logger.log('設定儲存後無法排程課綱背景更新：' + userFacingError_(error));
  }
  return attachUiDataSafely_(response, () =>
    buildUiData_(result.settings, result.source)
  );
}

function previewSettingsImpactFromUi(input) {
  const previous = loadSettings_();
  assertSetupImported_(previous);
  const source = loadSourceContext_(sanitizeGrade_(input && input.gradeName));
  assertFirstSetupTermStillCurrent_(previous, source);
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

function prepareFirstSyncCourseOutlinesFromUi(input) {
  const startedAt = Date.now();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return {
      prepared: false,
      skipped: false,
      busy: true,
      elapsedMs: Date.now() - startedAt,
      message: '另一個同步或課綱工作正在保存資料；基本行程可先同步，課綱稍後在背景補上。'
    };
  }
  try {
    try {
      const previous = loadSettings_();
      assertSetupImported_(previous);
      if (previous.setupComplete) {
        return { prepared: false, skipped: true, message: '已完成第一次同步，不需要再次預先載入課綱資料。' };
      }
      const gradeName = sanitizeGrade_(input && input.gradeName);
      const source = loadSourceContext_(gradeName);
      const settings = sanitizeSettingsInput_(input || {}, previous, source);
      const desiredEvents = getDesiredCourseOutlineEvents_(settings, source, scheduleBusinessNow_());
      const sourceSets = getRelevantCourseOutlineSourceSets_(settings.gradeName, desiredEvents);
      if (!sourceSets.length || !desiredEvents.length) {
        return {
          prepared: false,
          skipped: true,
          elapsedMs: Date.now() - startedAt,
          message: '近期沒有需要在第一次同步前載入的課綱資料。'
        };
      }

      const snapshot = collectCourseOutlineSnapshot_(settings, source, desiredEvents, sourceSets);
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs > COURSE_OUTLINE_FIRST_SETUP_MAX_MS) {
        return {
          prepared: false,
          skipped: false,
          elapsedMs,
          message: '課綱讀取超過 1 分鐘，為了保護第一次同步，將改由背景工作更新。'
        };
      }

      const published = publishCourseOutlineSnapshot_(snapshot);
      let stateWarning = '';
      try {
        saveCourseOutlineState_({
          status: 'idle',
          attempt: 0,
          incidentId: '',
          runId: '',
          scheduledAt: '',
          startedAt: '',
          watchdogTriggerId: '',
          retryTriggerId: '',
          failureNotifiedAt: '',
          notificationPending: false,
          lastError: '',
          lastSuccessAt: new Date().toISOString(),
          activeVersion: published.version
        });
      } catch (stateError) {
        stateWarning = '課綱快照已準備，但背景狀態暫時無法更新。';
        Logger.log('課綱快照發佈後無法儲存狀態：' + userFacingError_(stateError));
      }
      return {
        prepared: true,
        skipped: false,
        elapsedMs,
        matchedRecordCount: snapshot.diagnostics.matchedRecordCount,
        missingSheetNames: snapshot.diagnostics.missingSheetNames,
        message: '未來 30 天的課綱資料已準備完成，第一批行程會直接帶入。' +
          (stateWarning ? '\\n' + stateWarning : '')
      };
    } catch (error) {
      Logger.log('第一次同步前無法預先載入課綱，將改由背景工作更新：' + userFacingError_(error));
      return {
        prepared: false,
        skipped: false,
        elapsedMs: Date.now() - startedAt,
        message: '課綱資料暫時無法預先載入，基本行程會先同步，課綱稍後在背景補上。'
      };
    }
  } finally {
    lock.releaseLock();
  }
}

function saveSettingsAndSyncFromUi(input) {
  const result = saveSettingsCore_(input);
  const firstSetup = !result.previousSetupComplete;
  let syncResult;
  try {
    syncResult = syncSchedule_({
      reason: firstSetup ? 'setup' : 'settings',
      firstSetup,
      forceCalendarCheck: true,
      notifyOnSuccess: false,
      trackProgress: true,
      approvalToken: String(input && input.syncApprovalToken || '')
    });
  } catch (error) {
    notifySyncFailureUnlessActionRequired_(error);
    throw error;
  }
  const response = buildSyncUiResponse_(
    syncResult,
    firstSetup ? '第一次同步完成，請檢查專用日曆' : '設定已儲存並同步'
  );
  response.operationWarning = appendWarning_(
    result.operationWarning,
    response.operationWarning
  );
  return response;
}

function runSyncFromUi() {
  let result;
  try {
    result = syncSchedule_({ reason: 'manual', trackProgress: true });
  } catch (error) {
    notifySyncFailureUnlessActionRequired_(error);
    throw error;
  }
  return buildSyncUiResponse_(result, formatSyncResultMessage_(result));
}

function forceRepairFromUi() {
  let result;
  try {
    result = syncSchedule_({ reason: 'repair', forceCalendarCheck: true, trackProgress: true });
  } catch (error) {
    notifySyncFailureUnlessActionRequired_(error);
    throw error;
  }
  return buildSyncUiResponse_(result, '修復完成：' + formatSyncResultMessage_(result));
}

function attachUiDataSafely_(response, loadUiData) {
  const result = Object.assign({}, response || {});
  try {
    result.uiData = loadUiData();
  } catch (error) {
    Logger.log('主要操作已完成，但控制臺資料重新載入失敗：' + userFacingError_(error));
    result.uiData = null;
    result.uiRefreshWarning = '操作已完成，但控制臺資料暫時無法重新載入；請稍後重新開啟控制臺。';
  }
  return result;
}

function appendWarning_(current, next) {
  return [String(current || '').trim(), String(next || '').trim()]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join('\\n');
}

function buildSyncUiResponse_(result, completeMessage) {
  const pending = Boolean(result && result.pending);
  return attachUiDataSafely_({
    pending,
    jobId: result && result.jobId || '',
    message: pending
      ? (result.retrying
        ? 'Google 服務暫時無法完成，已保存進度並安排重試。'
        : '第一批已安全保存，剩餘行程會在背景分批完成；現在可以關閉控制臺。')
      : completeMessage,
    operationWarning: result && Array.isArray(result.completionWarnings)
      ? result.completionWarnings.join('\\n')
      : ''
  }, getSettingsUiData);
}

function createDedicatedCalendarForUi(input) {
  const settings = loadSettings_();
  assertSetupImported_(settings);
  const gradeName = sanitizeGrade_(input && input.gradeName || settings.gradeName);
  const calendarName = sanitizeCalendarName_(input && input.calendarName, gradeName);
  const calendar = CalendarApp.createCalendar(calendarName, { selected: true });
  try {
    if (typeof calendar.setDescription === 'function') {
      calendar.setDescription(MANAGED_CALENDAR_DESCRIPTION);
    }
  } catch (descriptionError) {
    Logger.log('專用日曆已建立，但無法寫入復原標記：' + userFacingError_(descriptionError));
  }
  const result = {
    message: '已建立專用日曆',
    calendarId: calendar.getId(),
    calendarName
  };
  try {
    result.calendars = listOwnedCalendars_();
  } catch (error) {
    Logger.log('專用日曆已建立，但日曆清單重新載入失敗：' + userFacingError_(error));
    result.calendars = [{ id: result.calendarId, name: calendarName }];
    result.calendarListWarning = '專用日曆已建立，但日曆清單暫時無法重新載入。';
  }
  return result;
}

function confirmPendingTitleFromUi(title) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('背景同步正在保存行程，請稍後再試。');
  try {
    const settings = loadSettings_();
    const normalized = normalizeTitle_(title);
    settings.pendingTitles = settings.pendingTitles.filter(item => normalizeTitle_(item) !== normalized);

    if (!settings.selectedTitles.some(item => normalizeTitle_(item) === normalized)) {
      settings.selectedTitles.push(String(title));
    }

    settings.excludedTitles = settings.excludedTitles.filter(item => normalizeTitle_(item) !== normalized);
    saveSettings_(settings);
  } finally {
    lock.releaseLock();
  }
  return attachUiDataSafely_({ message: '已保留「' + title + '」' }, getSettingsUiData);
}

function rejectPendingTitleFromUi(title) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('背景同步正在保存行程，請稍後再試。');
  try {
    const settings = loadSettings_();
    const normalized = normalizeTitle_(title);
    settings.pendingTitles = settings.pendingTitles.filter(item => normalizeTitle_(item) !== normalized);
    settings.selectedTitles = settings.selectedTitles.filter(item => normalizeTitle_(item) !== normalized);

    if (!settings.excludedTitles.some(item => normalizeTitle_(item) === normalized)) {
      settings.excludedTitles.push(String(title));
    }

    saveSettings_(settings);
  } finally {
    lock.releaseLock();
  }
  return attachUiDataSafely_({
    message: '已排除「' + title + '」，下次同步會移除同名行程'
  }, getSettingsUiData);
}

function saveSettingsCore_(input) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('背景同步正在保存行程，暫時無法改設定。請稍後再試。');
  }
  try {
    const oldSettings = loadSettings_();
    assertSetupImported_(oldSettings);
    const source = loadSourceContext_(sanitizeGrade_(input && input.gradeName));
    assertFirstSetupTermStillCurrent_(oldSettings, source);
    if (oldSettings.setupComplete && !oldSettings.pendingTermKey &&
        oldSettings.gradeName === source.gradeName) {
      applyTermTransitionIfNeeded_(oldSettings, source, true);
    }
    if (loadSourceObservation_().termCandidate) {
      throw new Error(
        '[ACTION_REQUIRED] 正在確認課表是否已轉入新學期，' +
        '期間不能儲存、同步或修復。'
      );
    }
    const next = sanitizeSettingsInput_(input, oldSettings, source);

    saveSettings_(next);
    const observation = loadSourceObservation_();
    observation.termCandidate = null;
    observation.newTitleCandidates = observation.newTitleCandidates.filter(candidate =>
      !termKeysMatch_(candidate.termKey, source.termKey)
    );
    if (observation.pendingNewTitleNotice &&
        termKeysMatch_(observation.pendingNewTitleNotice.termKey, source.termKey)) {
      observation.pendingNewTitleNotice = null;
    }
    saveSourceObservation_(observation);
    const operationWarnings = [];
    try {
      cancelActiveSyncJob_('設定已更新，將依新設定重新規劃。');
      if (!next.pendingTermKey) {
        deleteTriggersByHandlers_([
          TERM_TRANSITION_NOTICE_HANDLER,
          TERM_TRANSITION_VERIFICATION_HANDLER
        ]);
      }
      if (next.setupComplete) refreshAutoSyncTriggers_(next);
      else deleteAutoSyncTriggersUnlocked_();
    } catch (automationError) {
      operationWarnings.push('設定已儲存，但自動同步觸發器暫時無法更新。');
      Logger.log('設定儲存後無法更新自動同步觸發器：' + userFacingError_(automationError));
    }
    return {
      settings: next,
      source,
      previousSetupComplete: Boolean(oldSettings.setupComplete),
      operationWarning: operationWarnings.join('\\n')
    };
  } finally {
    lock.releaseLock();
  }
}

function assertFirstSetupTermStillCurrent_(settings, source) {
  if (settings && !settings.setupComplete && settings.termKey && source && source.termKey &&
      !termKeysMatch_(settings.termKey, source.termKey)) {
    throw new Error('課表已進入不同學期，請回設定網站重新選擇課程與活動並產生新的設定碼。');
  }
}

function sanitizeSettingsInput_(input, previous, source) {
  const value = input || {};
  const gradeName = sanitizeGrade_(value.gradeName);
  const gradeChanged = previous.gradeName !== gradeName;
  const selectedTitles = uniqueStrings_(Array.isArray(value.selectedTitles) ? value.selectedTitles : []);
  const sourceTitles = source.catalog.all.map(item => item.title);
  const sourceKeys = sourceTitles.map(normalizeTitle_);
  const sourceTitleByKey = {};
  sourceTitles.forEach(title => {
    const key = normalizeTitle_(title);
    if (!sourceTitleByKey[key]) sourceTitleByKey[key] = title;
  });
  const cleanSelected = applyCourseSelectionRules_(uniqueStrings_(selectedTitles
    .map(title => sourceTitleByKey[normalizeTitle_(title)] || '')
    .filter(Boolean)), source.catalog.all);
  const notificationEmail = String(value.notificationEmail || '').trim();

  if (notificationEmail) {
    assertSingleEmail_(notificationEmail);
  }

  if (cleanSelected.length === 0) {
    throw new Error(previous.pendingTermKey
      ? '新學期必須重新選擇至少一項課程或活動後才能儲存。'
      : '請至少選擇一項課程或活動後再儲存。');
  }
  if (previous.pendingTermKey && value.termGradeConfirmed !== true) {
    throw new Error('請先確認新學期就讀年級，再儲存課程與活動選擇。');
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
  const notificationHours = normalizeHourArray_(
    (Array.isArray(value.notificationHours)
      ? value.notificationHours
      : (Array.isArray(value.autoSyncHours) ? value.autoSyncHours : []))
      .concat([requestedNotifyHour]),
    requestedNotifyHour
  );
  const notifyHour = Math.max.apply(null, notificationHours);
  const instantNotificationsEnabled = Object.prototype.hasOwnProperty.call(
    value,
    'instantNotificationsEnabled'
  )
    ? value.instantNotificationsEnabled !== false
    : previous.instantNotificationsEnabled !== false;
  const reminderMode = ['none', 'popup', 'email'].indexOf(value.reminderMode) !== -1
    ? value.reminderMode
    : 'none';
  const descriptionPreset = Object.prototype.hasOwnProperty.call(value, 'descriptionPreset')
    ? (value.descriptionPreset === 'custom' ? 'custom' : 'standard')
    : (previous.descriptionPreset === 'custom' ? 'custom' : 'standard');
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

  const next = Object.assign({}, previous, {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    gradeName,
    selectedTitles: cleanSelected,
    calendarId,
    calendarName,
    notificationEmail,
    autoSyncEnabled: value.autoSyncEnabled !== false,
    autoSyncHours: SCHEDULE_SYNC_HOURS.slice(),
    instantNotificationsEnabled,
    notificationHours,
    notifySyncHour: notifyHour,
    notificationPreset: 'standard',
    customNotification: '',
    descriptionPreset,
    customDescription,
    reminderMode,
    reminderMinutes: sanitizeReminderMinutes_(value.reminderMinutes),
    knownTitles: sourceTitles,
    pendingTitles: gradeChanged ? [] : previous.pendingTitles.filter(title =>
      !isCourseSelectionHidden_(title) && sourceKeys.indexOf(normalizeTitle_(title)) !== -1
    ),
    excludedTitles: gradeChanged ? [] : previous.excludedTitles.filter(title =>
      sourceKeys.indexOf(normalizeTitle_(title)) !== -1 &&
      cleanSelected.map(normalizeTitle_).indexOf(normalizeTitle_(title)) === -1
    ),
    termKey: source.termKey,
    scheduleFingerprint: String(source.scheduleFingerprint || previous.scheduleFingerprint || ''),
    pendingTermKey: '',
    pausedReason: '',
    autoSyncEnabledBeforeTermTransition: null,
    termTransitionNoticeAttempts: 0,
    termTransitionNoticeScheduledFor: '',
    termTransitionNoticeSentAt: '',
    termTransitionNoticeLastError: '',
    calendarMigrationFromId
  });
  delete next.selectedCourses;
  delete next.includeActivities;
  delete next.excludedActivities;
  return next;
}

function buildUiData_(settings, source) {
  return {
    appVersion: APP_VERSION,
    settings,
    source: buildSourceUiModel_(source, settings.gradeName),
    calendars: listOwnedCalendars_(),
    status: loadStatus_(),
    courseOutlineStatus: buildCourseOutlineUiStatus_(
      settings,
      source && (source.initialSetupSnapshot || source.sourceUnavailable) ? null : source,
      loadCourseOutlineSourceIndexForUi_()
    ),
    termTransition: buildTermTransitionUiModel_(settings, source)
  };
}

function loadSourceObservation_() {
  const stored = readChunkedJson_(SOURCE_OBSERVATION_STORE, null) || {};
  return {
    schemaVersion: 1,
    termCandidate: stored.termCandidate && typeof stored.termCandidate === 'object'
      ? stored.termCandidate
      : null,
    newTitleCandidates: Array.isArray(stored.newTitleCandidates)
      ? stored.newTitleCandidates
      : [],
    pendingNewTitleNotice: stored.pendingNewTitleNotice &&
      typeof stored.pendingNewTitleNotice === 'object'
      ? stored.pendingNewTitleNotice
      : null
  };
}

function saveSourceObservation_(observation) {
  writeChunkedJson_(SOURCE_OBSERVATION_STORE, Object.assign(
    loadSourceObservation_(),
    observation || {},
    { schemaVersion: 1 }
  ));
}

function clearTermCandidate_(observation) {
  const next = observation || loadSourceObservation_();
  next.termCandidate = null;
  saveSourceObservation_(next);
  try {
    deleteTriggersByHandlers_([TERM_TRANSITION_VERIFICATION_HANDLER]);
  } catch (error) {
    Logger.log('新學期候選已清除，但驗證觸發器暫時無法整理：' +
      userFacingError_(error));
  }
  return next;
}

function buildTermTransitionUiModel_(settings, source) {
  const observation = loadSourceObservation_();
  const candidate = observation.termCandidate;
  const required = Boolean(settings && settings.pendingTermKey);
  const verifying = Boolean(!required && candidate && candidate.termKey);
  const resumeAutoSync = required
    ? (typeof settings.autoSyncEnabledBeforeTermTransition === 'boolean'
      ? settings.autoSyncEnabledBeforeTermTransition
      : true)
    : Boolean(settings && settings.autoSyncEnabled);
  return {
    state: required ? 'required' : (verifying ? 'verifying' : 'none'),
    required,
    verifying,
    pendingTermKey: required ? settings.pendingTermKey : '',
    candidateTermKey: verifying ? candidate.termKey : '',
    verificationDueAt: verifying ? candidate.verificationDueAt || '' : '',
    firstDate: source && source.firstDateKey || '',
    lastDate: source && source.lastDateKey || '',
    resumeAutoSync,
    noticeState: !required
      ? 'none'
      : (settings.termTransitionNoticeSentAt
        ? 'sent'
        : ((Number(settings.termTransitionNoticeAttempts) >= TERM_TRANSITION_NOTICE_MAX_ATTEMPTS ||
            settings.termTransitionNoticeLastError && !settings.termTransitionNoticeScheduledFor)
          ? 'failed'
          : (settings.termTransitionNoticeScheduledFor ? 'scheduled' : 'none'))),
    noticeScheduledFor: required ? settings.termTransitionNoticeScheduledFor || '' : '',
    noticeFailed: required && !settings.termTransitionNoticeSentAt && Boolean(
      Number(settings.termTransitionNoticeAttempts) >= TERM_TRANSITION_NOTICE_MAX_ATTEMPTS ||
      settings.termTransitionNoticeLastError && !settings.termTransitionNoticeScheduledFor
    ),
    noticeLastError: required ? settings.termTransitionNoticeLastError || '' : ''
  };
}

function buildSourceUiModel_(source, gradeName) {
  const visibleCatalogAll = (source.catalog.all || []).filter(item =>
    !isCourseSelectionHidden_(item && item.title)
  );
  return {
    gradeName,
    firstDate: source.firstDateKey,
    lastDate: source.lastDateKey,
    itemCount: visibleCatalogAll.length,
    updateLabel: source.sourceUpdatedLabel,
    warning: source.sourceStale || source.sourceUnavailable,
    unavailable: Boolean(source.sourceUnavailable),
    unavailableMessage: String(source.sourceUnavailableMessage || ''),
    cacheSavedAt: String(source.sourceCacheSavedAt || ''),
    catalog: {
      all: visibleCatalogAll,
      termItems: visibleCatalogAll.filter(item => item.period === 'term'),
      vacationItems: visibleCatalogAll.filter(item => item.period === 'vacation')
    },
    termKey: source.termKey,
    catalogFingerprintVersion: Number(source.catalogFingerprintVersion) || 0,
    catalogFingerprint: source.catalogFingerprint || '',
    scheduleFingerprint: source.scheduleFingerprint || ''
  };
}

function listOwnedCalendars_() {
  const defaultId = CalendarApp.getDefaultCalendar().getId();
  return CalendarApp.getAllOwnedCalendars()
    .reduce((items, calendar) => {
      const id = calendar.getId();
      if (id !== defaultId) items.push({ id, name: calendar.getName() });
      return items;
    }, [])
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildDedicatedCalendarName_(settings) {
  return sanitizeCalendarName_(settings.calendarName, settings.gradeName);
}

function ensureDedicatedCalendar_(settings) {
  if (settings.calendarId) {
    return assertDedicatedCalendar_(settings.calendarId);
  }

  const calendarName = buildDedicatedCalendarName_(settings);
  const recoverableCalendars = findRecoverableDedicatedCalendars_(calendarName);
  if (recoverableCalendars.length > 1) {
    throw new Error(
      '[ACTION_REQUIRED] 找到多個先前建立但尚未綁定的專用日曆，' +
      '請在控制臺手動選擇要使用的日曆。'
    );
  }
  if (recoverableCalendars.length === 1) {
    settings.calendarId = recoverableCalendars[0].getId();
    saveSettings_(settings);
    return recoverableCalendars[0];
  }

  const calendar = CalendarApp.createCalendar(calendarName, {
    selected: true
  });
  try {
    if (typeof calendar.setDescription === 'function') {
      calendar.setDescription(MANAGED_CALENDAR_DESCRIPTION);
    }
  } catch (descriptionError) {
    Logger.log('專用日曆已建立，但無法寫入復原標記：' + userFacingError_(descriptionError));
  }
  settings.calendarId = calendar.getId();
  saveSettings_(settings);
  return calendar;
}

function findRecoverableDedicatedCalendars_(calendarName) {
  const defaultId = CalendarApp.getDefaultCalendar().getId();
  return CalendarApp.getAllOwnedCalendars().filter(calendar => {
    if (!calendar || calendar.getId() === defaultId || calendar.getName() !== calendarName) {
      return false;
    }
    try {
      return typeof calendar.getDescription === 'function' &&
        calendar.getDescription() === MANAGED_CALENDAR_DESCRIPTION;
    } catch (error) {
      return false;
    }
  });
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
  let name = String(value == null ? '' : value);
  if (typeof name.normalize === 'function') name = name.normalize('NFC');
  name = name
    .replace(/[\\u200B-\\u200D\\uFEFF]/g, '')
    .replace(/[\\r\\n\\t\\u3000]+/g, ' ')
    .replace(/[ ]+/g, ' ')
    .trim();
  if (/^高[一二三]行程\\s*\\|\\s*T-SCHOOL Schedule Sync$/.test(name)) {
    name = defaultCalendarNameForGrade_(gradeName);
  }
  name = name.slice(0, 100);
  return name || defaultCalendarNameForGrade_(gradeName);
}

function syncMyScheduleToCalendar() {
  return runSyncEntryPoint_({ reason: 'source' });
}

function syncMyScheduleAtNotificationTime() {
  return sendScheduledNotifications();
}

function syncMyScheduleToCalendarWithNotification() {
  return sendScheduledNotificationsWithDailySummary();
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
  if (trackProgress) {
    writeSyncProgress_(2, '正在等待同步資源（可能需等待 0–10 分鐘）', 'running');
  }
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
      resetSyncWatchdogTrigger_();
    }
    if (trackProgress) {
      writeSyncProgress_(7, '正在讀取控制臺設定（可能需等待 0–10 分鐘）', 'running');
    }
    let settings = loadSettings_();
    assertSetupImported_(settings);
    if (trackProgress) {
      writeSyncProgress_(15, '正在取得最新課表（可能需等待 0–10 分鐘）', 'running');
    }
    const source = loadSourceContext_(settings.gradeName);
    settings = applyTermTransitionIfNeeded_(settings, source, false);
    assertTermTransitionCalendarWritesAllowed_(settings);
    settings = registerNewTitles_(settings, source);
    if (trackProgress) {
      writeSyncProgress_(24, '正在確認專用日曆（可能需等待 0–10 分鐘）', 'running');
    }
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
      if (trackProgress) {
        writeSyncProgress_(32, '正在比對課表與日曆（可能需等待 0–10 分鐘）', 'running');
      }
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
    resetSyncWatchdogTrigger_();

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
          !job.setupNotificationClaimed) {
        job.setupNotificationClaimed = true;
        saveSyncJob_(job);
        if (!sendFirstSetupNotificationSafe_(buildSyncJobResult_(job, true))) {
          job.setupNotificationClaimed = false;
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
  const scheduleRows = sortCanonicalRows_((desiredEvents || []).map(item => [
    item.originalTitle,
    Boolean(item.isAllDay),
    item.dateKey,
    Number(item.periodStart) || 0,
    Number(item.periodEnd) || 0,
    item.start.toISOString(),
    item.end.toISOString(),
    item.location || ''
  ]));
  const desiredRows = sortCanonicalRows_((desiredEvents || []).map(item => [
    makeOccurrenceKey_(item),
    makeEventSignature_(item, settings),
    item.outlineHash || ''
  ]));
  const settingsRows = [
    settings.gradeName,
    settings.termKey,
    calendar.getId(),
    uniqueStrings_(settings.selectedTitles).map(normalizeTitle_).sort(),
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
    desiredScheduleFingerprint: hashText_(JSON.stringify(scheduleRows)),
    settingsFingerprint: hashText_(JSON.stringify(settingsRows)),
    outlineVersion,
    desiredFingerprint: hashText_(JSON.stringify(desiredRows))
  };
}

function makeSyncApprovalToken_(settings, source, desiredEvents, plan) {
  return hashText_(JSON.stringify([
    settings.gradeName,
    source.termKey,
    source.scheduleFingerprint,
    uniqueStrings_(settings.selectedTitles).map(normalizeTitle_).sort(),
    uniqueStrings_(settings.excludedTitles).map(normalizeTitle_).sort(),
    sortCanonicalRows_((desiredEvents || []).map(item => [
      makeOccurrenceKey_(item),
      makeEventSignature_(item, settings)
    ])),
    (plan.deletions || []).map(item => item.stateKey).sort()
  ]));
}

function syncJobInputMatches_(left, right) {
  if (!left || !right) return false;
  return [
    'gradeName',
    'termKey',
    'calendarId',
    'desiredScheduleFingerprint',
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
    notificationWindow: Boolean(options.notificationWindow),
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
    setupNotificationClaimed: false
  };
  saveSyncJob_(job);
  return job;
}

function runSyncJobBatch_(job, calendar, oldState, desiredEvents, settings, todayKey) {
  const startedAt = Date.now();
  let lastProgressReportedAt = startedAt;
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
    const progressNow = Date.now();
    if (progressNow - lastProgressReportedAt >= SYNC_PROGRESS_REPORT_INTERVAL_MS) {
      const processed = (Number(job.processedOperations) || 0) + completed.length;
      const detail = getSyncJobProgressDetail_(job, processed);
      writeSyncJobProgressSafely_(
        job,
        calculateSyncJobProgressPercent_(job, processed),
        '正在分批同步行程（已處理 ' + detail.processed + ' / ' + detail.total + ' 項）…',
        'running',
        processed
      );
      lastProgressReportedAt = progressNow;
    }
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

function runPostCommitStep_(warnings, label, userMessage, operation) {
  try {
    operation();
    return true;
  } catch (error) {
    Logger.log(label + '：' + userFacingError_(error));
    if (userMessage && warnings.indexOf(userMessage) === -1) warnings.push(userMessage);
    return false;
  }
}

function finalizeSyncJob_(job, settings, source, state, calendar) {
  job.status = 'finalizing';
  job.updatedAt = new Date().toISOString();
  saveSyncJob_(job);
  writeSyncJobProgressSafely_(job, 92, '行程已寫入，正在保存控制臺狀態…', 'running');

  settings.setupComplete = true;
  settings.scheduleFingerprint = source.scheduleFingerprint;
  settings.setupContextFingerprint = '';
  if (job.firstSetup) {
    settings.knownTitles = uniqueStrings_(
      settings.knownTitles.concat(source.catalog.all.map(item => item.title))
    );
  }
  if (job.migrationFromId) settings.calendarMigrationFromId = '';
  saveSettings_(settings);

  const result = buildSyncJobResult_(job, false);
  result.state = state;
  result.calendarId = calendar.getId();
  result.unchanged = Math.max(
    0,
    job.desiredCount - result.created - result.updated - result.outlineUpdated
  );
  const completionWarnings = [];
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
  runPostCommitStep_(
    completionWarnings,
    '同步完成後無法保存狀態',
    '行程已同步，但控制臺狀態暫時無法更新。',
    () => writeChunkedJson_(STATUS_STORE, status)
  );
  saveSourceUiCacheSafely_(source);
  runPostCommitStep_(
    completionWarnings,
    '同步完成後無法清除安裝摘要',
    '',
    () => clearChunkedStore_(SETUP_SOURCE_CONTEXT_STORE)
  );
  writeSyncJobProgressSafely_(job, 95, '正在更新自動同步與課綱排程…', 'running');
  runPostCommitStep_(
    completionWarnings,
    '同步完成後無法更新自動同步觸發器',
    '行程已同步，但自動同步觸發器暫時無法更新。',
    () => refreshAutoSyncTriggers_(settings)
  );
  runPostCommitStep_(
    completionWarnings,
    '同步完成後無法排程課綱更新',
    '行程已同步，但課綱背景更新暫時無法排程。',
    () => scheduleCourseOutlineRefreshIfNeeded_(settings, source, {
      allowWhenAutoSyncDisabled: job.reason === 'manual' || job.reason === 'settings'
    })
  );

  writeSyncJobProgressSafely_(job, 97, '正在處理同步通知…', 'running');
  if (!job.completionNotificationClaimed) {
    runPostCommitStep_(
      completionWarnings,
      '同步完成後無法保存通知進度',
      '行程已同步，但通知進度暫時無法更新。',
      () => {
        job.completionNotificationClaimed = true;
        saveSyncJob_(job);
        sendSyncNotificationsSafe_(settings, result, {
          reason: job.reason,
          notifyOnSuccess: job.notifyOnSuccess,
          notificationWindow: job.notificationWindow
        });
        deliverPromotedNewTitleNoticeAfterSync_(settings, source, state);
        if (job.firstSetup && !job.setupNotificationClaimed) {
          job.setupNotificationClaimed = true;
          saveSyncJob_(job);
          if (!sendFirstSetupNotificationSafe_(result)) {
            completionWarnings.push('行程已同步，但設定完成通知暫時無法寄送。');
          }
        }
      }
    );
  }

  writeSyncJobProgressSafely_(job, 99, '正在完成背景工作清理…', 'running');
  job.status = 'completed';
  job.runId = '';
  job.runStartedAt = '';
  job.updatedAt = new Date().toISOString();
  runPostCommitStep_(completionWarnings, '同步完成後無法關閉工作狀態', '', () =>
    saveSyncJob_(job)
  );
  runPostCommitStep_(completionWarnings, '同步完成後無法清除工作狀態', '', () =>
    clearChunkedStore_(SYNC_JOB_STORE)
  );
  runPostCommitStep_(completionWarnings, '同步完成後無法清除續跑觸發器', '', () =>
    deleteTriggersByHandlers_([SYNC_CONTINUATION_HANDLER, SYNC_WATCHDOG_HANDLER])
  );
  runPostCommitStep_(completionWarnings, '同步完成後無法延後通知寄送', '', () =>
    scheduleRequestedNotificationDeliveryRetry_()
  );
  runPostCommitStep_(completionWarnings, '同步完成後無法保存進度', '', () =>
    writeSyncJobProgressAtPercent_(job, 100, '同步完成', 'complete')
  );
  result.completionWarnings = completionWarnings;
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
      '同步已暫停',
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
  const omittedChangeCount = Number(job.omittedChangeCount) || 0;
  const rawChanges = (job.changes || []).map(hydrateSyncChange_);
  const canNormalizeDetectedChanges = !pending && omittedChangeCount === 0;
  const changes = canNormalizeDetectedChanges
    ? normalizeDetectedScheduleChanges_(rawChanges)
    : rawChanges;
  const detectedCounts = canNormalizeDetectedChanges
    ? countDetectedScheduleChanges_(changes)
    : null;
  return {
    pending: Boolean(pending),
    jobId: job.jobId,
    created: detectedCounts ? detectedCounts.created : Number(job.created) || 0,
    updated: detectedCounts ? detectedCounts.updated : Number(job.updated) || 0,
    outlineUpdated: Number(job.outlineUpdated) || 0,
    deleted: detectedCounts ? detectedCounts.deleted : Number(job.deleted) || 0,
    unchanged: 0,
    changes,
    omittedChangeCount
  };
}

function loadSyncJob_() {
  const job = readChunkedJson_(SYNC_JOB_STORE, null);
  if (!job) return null;
  if (job.schemaVersion === 1) {
    job.schemaVersion = SYNC_JOB_SCHEMA_VERSION;
    job.input = job.input || {};
    job.input.desiredScheduleFingerprint = String(job.input.scheduleFingerprint || '');
    delete job.input.scheduleFingerprint;
  }
  return job.schemaVersion === SYNC_JOB_SCHEMA_VERSION ? job : null;
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

function getSyncJobProgressDetail_(job, processedOverride) {
  const rawProcessed = processedOverride === undefined
    ? Number(job.processedOperations) || 0
    : Number(processedOverride) || 0;
  const total = Math.max(Number(job.initialOperationCount) || 0, rawProcessed);
  const processed = Math.min(total, Math.max(0, rawProcessed));
  return {
    processed,
    total,
    remaining: Math.max(0, total - processed)
  };
}

function calculateSyncJobProgressPercent_(job, processedOverride) {
  const detail = getSyncJobProgressDetail_(job, processedOverride);
  if (!detail.total) return SYNC_PROGRESS_CALENDAR_END_PERCENT;
  const calendarRange = SYNC_PROGRESS_CALENDAR_END_PERCENT -
    SYNC_PROGRESS_CALENDAR_START_PERCENT;
  return Math.min(
    SYNC_PROGRESS_CALENDAR_END_PERCENT,
    Math.round(
      SYNC_PROGRESS_CALENDAR_START_PERCENT +
      detail.processed / detail.total * calendarRange
    )
  );
}

function writeSyncJobProgressAtPercent_(job, percent, message, state, processedOverride) {
  const detail = getSyncJobProgressDetail_(job, processedOverride);
  writeSyncProgress_(percent, message, state || 'running', {
    jobId: job.jobId,
    processed: detail.processed,
    total: detail.total,
    remaining: detail.remaining,
    nextAttemptAt: job.nextAttemptAt || ''
  });
}

function writeSyncJobProgressSafely_(job, percent, message, state, processedOverride) {
  try {
    writeSyncJobProgressAtPercent_(job, percent, message, state, processedOverride);
  } catch (error) {
    Logger.log('無法更新同步進度：' + userFacingError_(error));
  }
}

function writeSyncJobProgress_(job, message, state) {
  writeSyncJobProgressAtPercent_(
    job,
    calculateSyncJobProgressPercent_(job),
    message,
    state || 'running'
  );
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
    location: item.location || '',
    outlineIdentityHash: item.outlineIdentityHash || ''
  };
}

function normalizeDetectedScheduleChanges_(changes) {
  const entries = [];
  const atomizableTypes = ['調整', '新增', '取消'];
  (changes || []).forEach((change, index) => {
    const oldAtoms = makeScheduleChangeAtoms_(change.oldItem, index, 'old');
    const newAtoms = makeScheduleChangeAtoms_(change.newItem, index, 'new');
    entries.push({
      index,
      change,
      atomizable: atomizableTypes.indexOf(change.type) !== -1 &&
        (!change.oldItem || oldAtoms.length > 0) &&
        (!change.newItem || newAtoms.length > 0),
      oldAtoms,
      newAtoms
    });
  });

  const oldAtomsByKey = Object.create(null);
  entries.filter(entry => entry.atomizable).forEach(entry => {
    entry.oldAtoms.forEach(atom => {
      const key = makeScheduleChangeAtomKey_(atom);
      if (!oldAtomsByKey[key]) oldAtomsByKey[key] = [];
      oldAtomsByKey[key].push(atom);
    });
  });

  let cancelledAtomCount = 0;
  entries.filter(entry => entry.atomizable).forEach(entry => {
    entry.newAtoms.forEach(newAtom => {
      const candidates = (oldAtomsByKey[makeScheduleChangeAtomKey_(newAtom)] || [])
        .filter(oldAtom =>
          !oldAtom.cancelled &&
          oldAtom.entryIndex !== newAtom.entryIndex &&
          haveCompatibleOutlineIdentities_(oldAtom.item, newAtom.item)
        );
      const exactIdentityCandidates = candidates.filter(oldAtom =>
        newAtom.item.outlineIdentityHash &&
        oldAtom.item.outlineIdentityHash === newAtom.item.outlineIdentityHash
      );
      const eligible = exactIdentityCandidates.length ? exactIdentityCandidates : candidates;
      if (eligible.length !== 1) return;
      eligible[0].cancelled = true;
      newAtom.cancelled = true;
      cancelledAtomCount += 1;
    });
  });

  if (!cancelledAtomCount) return changes || [];

  const normalized = [];
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const entry = entries[entryIndex];
    if (!entry.atomizable) {
      normalized.push(entry.change);
      continue;
    }
    const oldGroups = coalesceScheduleChangeAtoms_(
      entry.oldAtoms.filter(atom => !atom.cancelled)
    );
    const newGroups = coalesceScheduleChangeAtoms_(
      entry.newAtoms.filter(atom => !atom.cancelled)
    );
    if (oldGroups.length > 1 || newGroups.length > 1) {
      return changes || [];
    }
    const oldItem = oldGroups[0] || null;
    const newItem = newGroups[0] || null;
    if (!oldItem && !newItem) continue;
    normalized.push({
      type: oldItem && newItem ? '調整' : (newItem ? '新增' : '取消'),
      oldItem,
      newItem
    });
  }
  return normalized;
}

function makeScheduleChangeAtoms_(item, entryIndex, side) {
  if (!item || item.isAllDay) return [];
  const periodStart = Number(item.periodStart);
  const periodEnd = Number(item.periodEnd) || periodStart;
  if (!Number.isInteger(periodStart) || !Number.isInteger(periodEnd) ||
      periodStart < 1 || periodEnd < periodStart) {
    return [];
  }
  const atoms = [];
  for (let period = periodStart; period <= periodEnd; period += 1) {
    atoms.push({ item, entryIndex, side, period, cancelled: false });
  }
  return atoms;
}

function makeScheduleChangeAtomKey_(atom) {
  return JSON.stringify([
    normalizeTitle_(atom.item.originalTitle),
    atom.item.dateKey,
    atom.period,
    normalizeTitle_(atom.item.location)
  ]);
}

function haveCompatibleOutlineIdentities_(left, right) {
  const leftIdentity = String(left && left.outlineIdentityHash || '');
  const rightIdentity = String(right && right.outlineIdentityHash || '');
  return !leftIdentity || !rightIdentity || leftIdentity === rightIdentity;
}

function coalesceScheduleChangeAtoms_(atoms) {
  if (!atoms.length) return [];
  const sorted = atoms.slice().sort((left, right) => left.period - right.period);
  const groups = [];
  let group = [sorted[0]];
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].period === group[group.length - 1].period + 1) {
      group.push(sorted[index]);
    } else {
      groups.push(group);
      group = [sorted[index]];
    }
  }
  groups.push(group);
  return groups.map(makeScheduleChangeFragment_);
}

function makeScheduleChangeFragment_(atoms) {
  const item = Object.assign({}, atoms[0].item, {
    periodStart: atoms[0].period,
    periodEnd: atoms[atoms.length - 1].period
  });
  if (item.periodStart !== Number(atoms[0].item.periodStart) ||
      item.periodEnd !== Number(atoms[0].item.periodEnd)) {
    item.startTime = '';
    item.endTime = '';
  }
  return item;
}

function countDetectedScheduleChanges_(changes) {
  return (changes || []).reduce((counts, change) => {
    if (change.type === '新增') counts.created += 1;
    else if (change.type === '取消') counts.deleted += 1;
    else if (change.type === '調整' || change.type === '更新') counts.updated += 1;
    return counts;
  }, { created: 0, updated: 0, deleted: 0 });
}

function dedupeAndValidateDesiredEvents_(events) {
  const seen = {};
  const result = [];
  (events || []).forEach(item => {
    const key = makeOccurrenceKey_(item);
    const fingerprint = hashText_(JSON.stringify([
      normalizeTitle_(item.originalTitle),
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

function assertTermTransitionCalendarWritesAllowed_(settings) {
  const observation = loadSourceObservation_();
  if (observation.termCandidate) {
    throw new Error('[ACTION_REQUIRED] 正在確認課表是否已轉入新學期，期間不會改動日曆。');
  }
  if (settings && settings.pendingTermKey) {
    throw new Error('[ACTION_REQUIRED] 已確認進入新學期，請先重新選擇課程與活動。');
  }
}

function applyTermTransitionIfNeeded_(settings, source, quiet) {
  if (!settings.setupComplete || !settings.termKey) {
    return settings;
  }

  const observation = loadSourceObservation_();
  if (termKeysMatch_(settings.termKey, source.termKey)) {
    if (observation.termCandidate) {
      clearTermCandidate_(observation);
      try {
        refreshAutoSyncTriggers_(settings);
      } catch (triggerError) {
        Logger.log('課表回復原學期，但自動同步觸發器暫時無法回復：' +
          userFacingError_(triggerError));
      }
    }
    return settings;
  }

  if (settings.pendingTermKey && termKeysMatch_(settings.pendingTermKey, source.termKey)) {
    if (observation.termCandidate) clearTermCandidate_(observation);
    try {
      migrateLegacyQueuedTermTransitionNotice_(settings, source);
    } catch (migrationError) {
      Logger.log('舊版學期通知佇列暫時無法遷移：' + userFacingError_(migrationError));
    }
    if (!quiet) {
      throw new Error('[ACTION_REQUIRED] 偵測到新學期，請先開啟控制臺介面並重新選擇課程與活動。');
    }
    return settings;
  }

  const now = new Date();
  const sourceTermKey = normalizeTermKey_(source.termKey);
  const sourceFingerprint = String(source.scheduleFingerprint || source.catalogFingerprint || '');
  let candidate = observation.termCandidate;
  if (!candidate || !termKeysMatch_(candidate.termKey, sourceTermKey) ||
      String(candidate.sourceFingerprint || '') !== sourceFingerprint) {
    candidate = {
      termKey: sourceTermKey,
      sourceFingerprint,
      firstSeenAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      verificationDueAt: new Date(now.getTime() + TERM_TRANSITION_VERIFICATION_DELAY_MS).toISOString(),
      sourceFailureCount: 0,
      sourceFailureNotifiedAt: ''
    };
    observation.termCandidate = candidate;
    saveSourceObservation_(observation);
    try {
      cancelActiveSyncJob_('正在確認新學期課表。');
      deleteAutoSyncTriggersUnlocked_();
    } catch (triggerError) {
      Logger.log('新學期驗證狀態已儲存，但無法立即整理自動同步觸發器：' +
        userFacingError_(triggerError));
    }
    ensureOneTimeTrigger_(TERM_TRANSITION_VERIFICATION_HANDLER, TERM_TRANSITION_VERIFICATION_DELAY_MS);
  } else {
    candidate.lastSeenAt = now.toISOString();
    candidate.sourceFailureCount = 0;
    candidate.sourceFailureNotifiedAt = '';
    observation.termCandidate = candidate;
    saveSourceObservation_(observation);
  }

  const dueAt = Date.parse(candidate.verificationDueAt);
  if (Number.isFinite(dueAt) && now.getTime() >= dueAt) {
    settings = confirmTermTransition_(settings, source, observation);
    if (!quiet) {
      throw new Error('[ACTION_REQUIRED] 已確認進入新學期，請先開啟控制臺介面並重新選擇課程與活動。');
    }
  } else {
    ensureOneTimeTrigger_(
      TERM_TRANSITION_VERIFICATION_HANDLER,
      Math.max(60 * 1000, dueAt - now.getTime())
    );
    if (!quiet) {
      throw new Error('[ACTION_REQUIRED] 偵測到疑似新學期的課表，正在進行 30 分鐘穩定性確認，期間不會改動日曆。');
    }
  }

  return settings;
}

function migrateLegacyQueuedTermTransitionNotice_(settings, source) {
  if (!settings || !settings.pendingTermKey || !settings.termTransitionNoticeSentAt) return false;
  const queueState = loadNotificationQueueState_();
  const retained = queueState.pending.filter(item =>
    String(item && item.templateKind || '') !== 'term_transition'
  );
  if (retained.length === queueState.pending.length) return false;
  queueState.pending = retained;
  saveNotificationQueueState_(queueState);
  settings.termTransitionNoticeAttempts = 0;
  settings.termTransitionNoticeScheduledFor = '';
  settings.termTransitionNoticeSentAt = '';
  settings.termTransitionNoticeLastError = '';
  saveSettings_(settings);
  try {
    scheduleTermTransitionNotice_(settings, source);
  } catch (error) {
    settings.termTransitionNoticeScheduledFor = '';
    settings.termTransitionNoticeLastError = userFacingError_(error);
    saveSettings_(settings);
  }
  return true;
}

function confirmTermTransition_(settings, source, observation) {
  if (typeof settings.autoSyncEnabledBeforeTermTransition !== 'boolean') {
    settings.autoSyncEnabledBeforeTermTransition = Boolean(settings.autoSyncEnabled);
  }
  settings.selectedTitles = source.catalog.all
    .filter(item => isDefaultSelectedTitle_(item.title))
    .map(item => item.title);
  settings.pendingTitles = [];
  settings.pendingTermKey = normalizeTermKey_(source.termKey);
  settings.autoSyncEnabled = false;
  settings.pausedReason = '偵測到新學期，請重新選擇課程與活動。';
  settings.termTransitionNoticeAttempts = 0;
  settings.termTransitionNoticeScheduledFor = '';
  settings.termTransitionNoticeSentAt = '';
  settings.termTransitionNoticeLastError = '';
  saveSettings_(settings);
  const nextObservation = observation || loadSourceObservation_();
  nextObservation.termCandidate = null;
  nextObservation.newTitleCandidates = [];
  nextObservation.pendingNewTitleNotice = null;
  saveSourceObservation_(nextObservation);
  try {
    clearQueuedNewTitleNotifications_();
  } catch (queueError) {
    Logger.log('新學期已確認，但舊的新項目通知暫時無法清除：' +
      userFacingError_(queueError));
  }
  try {
    deleteTriggersByHandlers_([TERM_TRANSITION_VERIFICATION_HANDLER]);
  } catch (triggerCleanupError) {
    Logger.log('新學期已確認，但驗證觸發器暫時無法清除：' +
      userFacingError_(triggerCleanupError));
  }
  try {
    deleteTriggersByHandlers_([TERM_TRANSITION_NOTICE_HANDLER]);
    scheduleTermTransitionNotice_(settings, source);
  } catch (noticeError) {
    settings.termTransitionNoticeScheduledFor = '';
    settings.termTransitionNoticeLastError = userFacingError_(noticeError);
    saveSettings_(settings);
    Logger.log('新學期已確認，但通知排程暫時失敗：' +
      userFacingError_(noticeError));
  }
  return settings;
}

function clearQueuedNewTitleNotifications_() {
  const queueState = loadNotificationQueueState_();
  const pending = queueState.pending.filter(item =>
    String(item && item.templateKind || '') !== 'new_schedule_items'
  );
  if (pending.length === queueState.pending.length) return false;
  queueState.pending = pending;
  saveNotificationQueueState_(queueState);
  return true;
}

function verifyTermTransitionCandidate() {
  try {
    deleteTriggersByHandlers_([TERM_TRANSITION_VERIFICATION_HANDLER]);
  } catch (triggerError) {
    Logger.log('無法清理已執行的學期驗證觸發器：' + userFacingError_(triggerError));
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    ensureOneTimeTrigger_(TERM_TRANSITION_VERIFICATION_HANDLER, 5 * 60 * 1000);
    return false;
  }
  try {
    const settings = loadSettings_();
    const observation = loadSourceObservation_();
    if (!observation.termCandidate || settings.pendingTermKey) return false;
    try {
      const source = loadSourceContext_(settings.gradeName);
      applyTermTransitionIfNeeded_(settings, source, true);
      return true;
    } catch (error) {
      const latest = loadSourceObservation_();
      if (!latest.termCandidate) throw error;
      latest.termCandidate.sourceFailureCount =
        Math.max(0, Number(latest.termCandidate.sourceFailureCount) || 0) + 1;
      if (latest.termCandidate.sourceFailureCount >= 2 &&
          !latest.termCandidate.sourceFailureNotifiedAt) {
        notifySyncFailureSafe_(new Error('新學期課表驗證連續兩次無法讀取來源：' + userFacingError_(error)));
        latest.termCandidate.sourceFailureNotifiedAt = new Date().toISOString();
      }
      saveSourceObservation_(latest);
      ensureOneTimeTrigger_(TERM_TRANSITION_VERIFICATION_HANDLER, TERM_TRANSITION_VERIFICATION_DELAY_MS);
      return false;
    }
  } finally {
    lock.releaseLock();
  }
}

function buildTermTransitionNotice_(settings, source) {
  const dateRange = source && source.firstDateKey
    ? source.firstDateKey + (source.lastDateKey ? '–' + source.lastDateKey : '')
    : '新學期';
  return {
    subject: '需要重新選擇課程與活動',
    dateRange,
    body:
      '系統偵測到 ' + dateRange + ' 的新學期行程\\n\\n' +
      '已進入新學期，為避免把上學期的選擇直接套到新學期，請重新選擇課程與活動\\n' +
      '完成新學期同步前，系統不會改動現有日曆事件\\n' +
      '請在控制臺確認新學期就讀年級、重新選擇課程與活動，並在同步前檢查新增與移除預覽'
  };
}

function getNextTermTransitionNoticeAt_(settings, nowValue) {
  const now = nowValue || new Date();
  const hours = settings.instantNotificationsEnabled !== false
    ? [INSTANT_NOTIFICATION_SUMMARY_HOUR]
    : getEffectiveNotificationHours_(settings);
  const currentHour = Number(Utilities.formatDate(now, TIMEZONE, 'H'));
  const dateKey = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  const futureHour = hours.slice().sort((left, right) => left - right)
    .find(hour => Number(hour) > currentHour);
  if (typeof futureHour === 'number') {
    return new Date(dateKey + 'T' + pad2_(futureHour) + ':00:00+08:00');
  }
  const tomorrow = new Date(Date.parse(dateKey + 'T12:00:00+08:00') + 24 * 60 * 60 * 1000);
  const tomorrowKey = Utilities.formatDate(tomorrow, TIMEZONE, 'yyyy-MM-dd');
  return new Date(tomorrowKey + 'T' + pad2_(hours.slice().sort((a, b) => a - b)[0]) + ':00:00+08:00');
}

function scheduleTermTransitionNotice_(settings, source) {
  if (!settings || !settings.pendingTermKey || settings.termTransitionNoticeSentAt) return false;
  const deliveryHours = settings.instantNotificationsEnabled !== false
    ? [INSTANT_NOTIFICATION_SUMMARY_HOUR]
    : getEffectiveNotificationHours_(settings);
  const currentHour = Number(Utilities.formatDate(new Date(), TIMEZONE, 'H'));
  if (deliveryHours.indexOf(currentHour) !== -1) {
    return deliverTermTransitionNotice_(settings, source);
  }
  const scheduledFor = getNextTermTransitionNoticeAt_(settings, new Date());
  settings.termTransitionNoticeScheduledFor = scheduledFor.toISOString();
  settings.termTransitionNoticeLastError = '';
  saveSettings_(settings);
  ensureOneTimeTrigger_(
    TERM_TRANSITION_NOTICE_HANDLER,
    Math.max(60 * 1000, scheduledFor.getTime() - Date.now())
  );
  return true;
}

function deliverTermTransitionNotice_(settings, source) {
  if (!settings || !settings.pendingTermKey || settings.termTransitionNoticeSentAt) return true;
  const notice = buildTermTransitionNotice_(settings, source);
  settings.termTransitionNoticeAttempts = Math.max(
    0,
    Number(settings.termTransitionNoticeAttempts) || 0
  ) + 1;
  try {
    sendEmail_(settings, 'term_transition', notice.subject, notice.body, {
      dateRange: notice.dateRange
    });
    settings.termTransitionNoticeSentAt = new Date().toISOString();
    settings.termTransitionNoticeScheduledFor = '';
    settings.termTransitionNoticeLastError = '';
    deleteTriggersByHandlers_([TERM_TRANSITION_NOTICE_HANDLER]);
    saveSettings_(settings);
    return true;
  } catch (error) {
    scheduleTermTransitionNoticeRetry_(settings, userFacingError_(error));
    Logger.log('新學期通知寄送失敗：' + userFacingError_(error));
    return false;
  }
}

function scheduleTermTransitionNoticeRetry_(settings, errorMessage) {
  settings.termTransitionNoticeLastError = String(errorMessage || '新學期通知暫時無法寄送。');
  if (settings.termTransitionNoticeAttempts >= TERM_TRANSITION_NOTICE_MAX_ATTEMPTS) {
    settings.termTransitionNoticeScheduledFor = '';
    deleteTriggersByHandlers_([TERM_TRANSITION_NOTICE_HANDLER]);
    saveSettings_(settings);
    return false;
  }
  settings.termTransitionNoticeScheduledFor = new Date(
    Date.now() + TERM_TRANSITION_NOTICE_RETRY_DELAY_MS
  ).toISOString();
  try {
    ensureOneTimeTrigger_(TERM_TRANSITION_NOTICE_HANDLER, TERM_TRANSITION_NOTICE_RETRY_DELAY_MS);
  } catch (triggerError) {
    settings.termTransitionNoticeScheduledFor = '';
    settings.termTransitionNoticeLastError += '；且無法建立重試：' +
      userFacingError_(triggerError);
  }
  saveSettings_(settings);
  return Boolean(settings.termTransitionNoticeScheduledFor);
}

function retryTermTransitionNotice() {
  try {
    deleteTriggersByHandlers_([TERM_TRANSITION_NOTICE_HANDLER]);
  } catch (triggerError) {
    Logger.log('無法清理已執行的新學期通知觸發器：' + userFacingError_(triggerError));
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    try {
      ensureOneTimeTrigger_(TERM_TRANSITION_NOTICE_HANDLER, TERM_TRANSITION_NOTICE_RETRY_DELAY_MS);
    } catch (triggerError) {
      Logger.log('新學期通知遇到鎖定，且無法建立重試：' + userFacingError_(triggerError));
    }
    return false;
  }
  try {
    const settings = loadSettings_();
    if (!settings.pendingTermKey || settings.termTransitionNoticeSentAt ||
        Number(settings.termTransitionNoticeAttempts) >= TERM_TRANSITION_NOTICE_MAX_ATTEMPTS) {
      return false;
    }
    let source;
    try {
      source = loadSourceContext_(settings.gradeName);
    } catch (sourceError) {
      settings.termTransitionNoticeAttempts = Math.max(
        0,
        Number(settings.termTransitionNoticeAttempts) || 0
      ) + 1;
      scheduleTermTransitionNoticeRetry_(
        settings,
        '寄信前無法讀取新學期日期：' + userFacingError_(sourceError)
      );
      return false;
    }
    if (!termKeysMatch_(source.termKey, settings.pendingTermKey)) {
      settings.termTransitionNoticeAttempts = Math.max(
        0,
        Number(settings.termTransitionNoticeAttempts) || 0
      ) + 1;
      scheduleTermTransitionNoticeRetry_(
        settings,
        '寄信前讀到的學期與待確認學期不一致。'
      );
      return false;
    }
    return deliverTermTransitionNotice_(settings, source);
  } finally {
    lock.releaseLock();
  }
}

function registerNewTitles_(settings, source) {
  if (!settings.setupComplete) {
    return settings;
  }

  const observation = loadSourceObservation_();
  const termKey = normalizeTermKey_(source.termKey);
  const known = settings.knownTitles.map(normalizeTitle_);
  const excluded = settings.excludedTitles.map(normalizeTitle_);
  const pending = settings.pendingTitles.map(normalizeTitle_);
  const discovered = source.catalog.all
    .map(item => item.title)
    .filter(title => !isCourseSelectionHidden_(title))
    .filter(title => known.indexOf(normalizeTitle_(title)) === -1)
    .filter(title => excluded.indexOf(normalizeTitle_(title)) === -1)
    .filter(title => pending.indexOf(normalizeTitle_(title)) === -1);
  const now = new Date();
  const candidatesByKey = Object.create(null);
  observation.newTitleCandidates
    .filter(candidate => termKeysMatch_(candidate.termKey, termKey))
    .forEach(candidate => {
      candidatesByKey[String(candidate.titleKey || '')] = candidate;
    });
  const nextCandidates = [];
  const promoted = [];

  discovered.forEach(title => {
    const titleKey = normalizeTitle_(title);
    let candidate = candidatesByKey[titleKey];
    if (!candidate) {
      candidate = {
        termKey,
        titleKey,
        title,
        firstSeenAt: now.toISOString(),
        lastSeenAt: now.toISOString()
      };
    } else {
      candidate.title = title;
      candidate.lastSeenAt = now.toISOString();
    }
    const firstSeenAt = Date.parse(candidate.firstSeenAt);
    if (Number.isFinite(firstSeenAt) &&
        now.getTime() - firstSeenAt >= NEW_TITLE_OBSERVATION_DELAY_MS) {
      promoted.push(title);
    } else {
      nextCandidates.push(candidate);
    }
  });
  observation.newTitleCandidates = nextCandidates;

  if (promoted.length === 0) {
    saveSourceObservation_(observation);
    return settings;
  }

  promoted.forEach(title => {
    settings.knownTitles.push(title);
    if (pending.indexOf(normalizeTitle_(title)) === -1) {
      settings.pendingTitles.push(title);
    }
    if (!settings.selectedTitles.some(item => normalizeTitle_(item) === normalizeTitle_(title))) {
      settings.selectedTitles.push(title);
    }
  });

  saveSettings_(settings);
  observation.pendingNewTitleNotice = {
    termKey,
    titles: uniqueStrings_([].concat(
      observation.pendingNewTitleNotice &&
        termKeysMatch_(observation.pendingNewTitleNotice.termKey, termKey)
        ? observation.pendingNewTitleNotice.titles || []
        : [],
      promoted
    )),
    promotedAt: now.toISOString()
  };
  saveSourceObservation_(observation);
  return settings;
}

function deliverPromotedNewTitleNoticeAfterSync_(settings, source, state) {
  const observation = loadSourceObservation_();
  const pendingNotice = observation.pendingNewTitleNotice;
  if (!pendingNotice || !termKeysMatch_(pendingNotice.termKey, source.termKey)) return false;
  const todayKey = formatDateKey_(new Date());
  const includedKeys = Object.keys(state || {}).map(key => state[key])
    .filter(item => item && item.dateKey >= todayKey)
    .map(item => normalizeTitle_(item.originalTitle));
  const includedTitles = uniqueStrings_((pendingNotice.titles || []).filter(title =>
    includedKeys.indexOf(normalizeTitle_(title)) !== -1
  ));
  if (!includedTitles.length) {
    observation.pendingNewTitleNotice = null;
    saveSourceObservation_(observation);
    return false;
  }
  const result = sendActionRequiredSafe_(
    settings,
    '發現新的行程項目',
    '下列項目已經過 24 小時穩定性確認，並已同步未來行程至日曆。' +
      '請在控制臺確認是否屬於你：\\n\\n' + includedTitles.join('\\n'),
    'new-schedule-items|' + normalizeTermKey_(source.termKey) + '|' +
      includedTitles.map(normalizeTitle_).sort().join('|'),
    'new_schedule_items',
    {
      itemCount: includedTitles.length,
      items: includedTitles.map(label => ({ label }))
    }
  );
  if (result.ok) {
    observation.pendingNewTitleNotice = null;
    saveSourceObservation_(observation);
  }
  return result.ok;
}

function shouldIncludeEvent_(event, settings) {
  const normalized = normalizeTitle_(event.originalTitle);

  if (settings.selectedTitles.some(title => normalizeTitle_(title) === normalized)) {
    return true;
  }

  if (isCourseSelectionHidden_(event.originalTitle) &&
      settings.selectedTitles.some(isNaturalAdvancedVariantTitle_)) {
    return true;
  }

  if (settings.excludedTitles.some(title => normalizeTitle_(title) === normalized)) {
    return false;
  }

  if (settings.pendingTitles.some(title => normalizeTitle_(title) === normalized)) {
    return true;
  }
  return false;
}

function buildSyncPlan_(oldState, desiredEvents, todayKey) {
  const oldFuture = Object.keys(oldState)
    .map(key => Object.assign({ stateKey: key }, oldState[key]))
    .filter(item => item.dateKey >= todayKey);
  const oldPast = Object.keys(oldState)
    .filter(key => oldState[key].dateKey < todayKey)
    .reduce((result, key) => {
      result[key] = Object.assign({}, oldState[key]);
      delete result[key].type;
      return result;
    }, {});
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
  const unmatchedOldByTitle = Object.create(null);
  unmatchedOld.forEach(oldItem => {
    const titleKey = normalizeTitle_(oldItem.originalTitle);
    if (!unmatchedOldByTitle[titleKey]) unmatchedOldByTitle[titleKey] = [];
    unmatchedOldByTitle[titleKey].push(oldItem);
  });
  const moved = [];
  const usedOld = {};
  const stillNew = [];
  const moveWindowMs = 21 * 24 * 60 * 60 * 1000;

  unmatchedNew.forEach(newItem => {
    const candidates = (unmatchedOldByTitle[normalizeTitle_(newItem.originalTitle)] || [])
      .filter(oldItem =>
        !usedOld[oldItem.stateKey] &&
        haveCompatibleMoveShape_(oldItem, newItem)
      )
      .map(oldItem => ({
        oldItem,
        distance: Math.abs(
          new Date(oldItem.start).getTime() - newItem.start.getTime()
        )
      }))
      .filter(candidate => candidate.distance <= moveWindowMs);
    const newOutlineIdentityHash = String(newItem.outlineIdentityHash || '');
    let eligibleCandidates = candidates;
    if (newOutlineIdentityHash) {
      const sameOutlineCandidates = candidates.filter(candidate =>
        String(candidate.oldItem.outlineIdentityHash || '') === newOutlineIdentityHash
      );
      eligibleCandidates = sameOutlineCandidates.length
        ? sameOutlineCandidates
        : candidates.filter(candidate => !candidate.oldItem.outlineIdentityHash);
    }
    let bestOldItem = null;
    let bestDistance = Infinity;
    let bestIsTied = false;
    eligibleCandidates.forEach(candidate => {
      const oldItem = candidate.oldItem;
      const distance = candidate.distance;
      if (distance < bestDistance) {
        bestOldItem = oldItem;
        bestDistance = distance;
        bestIsTied = false;
      } else if (distance === bestDistance) {
        bestIsTied = true;
      }
    });

    if (bestOldItem && !bestIsTied) {
      usedOld[bestOldItem.stateKey] = true;
      moved.push({ oldItem: bestOldItem, newItem, newKey: makeOccurrenceKey_(newItem) });
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

function haveCompatibleMoveShape_(oldItem, newItem) {
  if (Boolean(oldItem && oldItem.isAllDay) !== Boolean(newItem && newItem.isAllDay)) {
    return false;
  }
  if (oldItem && oldItem.isAllDay) return true;
  const oldPeriodCount = getScheduledPeriodCount_(oldItem);
  const newPeriodCount = getScheduledPeriodCount_(newItem);
  return oldPeriodCount > 0 && oldPeriodCount === newPeriodCount;
}

function getScheduledPeriodCount_(item) {
  const periodStart = Number(item && item.periodStart);
  const periodEnd = Number(item && item.periodEnd) || periodStart;
  if (!Number.isInteger(periodStart) || !Number.isInteger(periodEnd) ||
      periodStart < 1 || periodEnd < periodStart) {
    return -1;
  }
  return periodEnd - periodStart + 1;
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
  const location = buildEventLocation_(item);
  return location ? item.originalTitle + ' [' + location + ']' : item.originalTitle;
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
    item.originalTitle, item.isAllDay, item.dateKey, item.periodStart, item.periodEnd,
    eventDateIso_(item.start), eventDateIso_(item.end), item.location,
    settings.descriptionPreset, settings.customDescription,
    settings.reminderMode, settings.reminderMinutes
  ]);
}

function makeLegacyClassifiedBaseEventSignaturePayload_(item, settings, type) {
  return JSON.stringify([
    item.originalTitle, type, item.isAllDay, item.dateKey, item.periodStart, item.periodEnd,
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
  if (Number(oldItem.signatureVersion) === 2 && oldItem.type === 'course') {
    return oldItem.baseSyncSignature === hashText_(
      makeLegacyClassifiedBaseEventSignaturePayload_(newItem, settings, 'course')
    );
  }
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
  if (Number(oldItem.signatureVersion) === 2 && oldItem.type === 'course') {
    const legacyPayload = makeLegacyClassifiedBaseEventSignaturePayload_(
      newItem,
      settings,
      'course'
    );
    return oldItem.syncSignature === hashText_(
      newItem.outlineHash ? legacyPayload + '|outline:' + newItem.outlineHash : legacyPayload
    );
  }
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
    signatureVersion: 3,
    metadataVersion: EVENT_METADATA_VERSION,
    originalTitle: item.originalTitle,
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
    outlineHash: item.outlineHash || '',
    outlineIdentityHash: item.outlineIdentityHash || ''
  };
}

function getConfiguredCourseOutlineSourceSets_(gradeName) {
  return getConfiguredCourseOutlineSourceSetsFromIndex_(
    gradeName,
    loadCourseOutlineSourceIndex_()
  );
}

function getConfiguredCourseOutlineSourceSetsFromIndex_(gradeName, sourceIndex) {
  const safeIndex = sourceIndex && sourceIndex.setsByGrade
    ? sourceIndex
    : { setsByGrade: {} };
  const sets = safeIndex.setsByGrade[sanitizeGrade_(gradeName)];
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
    indexFingerprint: makeCourseOutlineSourceIndexFingerprint_(setsByGrade)
  };
}

function makeCourseOutlineSourceIndexFingerprint_(setsByGrade) {
  const rows = [];
  ['高一', '高二', '高三'].forEach(gradeName => {
    const sourceSets = setsByGrade && Array.isArray(setsByGrade[gradeName])
      ? setsByGrade[gradeName]
      : [];
    sourceSets.forEach(sourceSet => {
      rows.push([
        gradeName,
        String(sourceSet && sourceSet.key || ''),
        String(sourceSet && sourceSet.label || ''),
        String(sourceSet && sourceSet.validFrom || ''),
        String(sourceSet && sourceSet.validUntil || ''),
        uniqueExactStrings_(sourceSet && sourceSet.outlineNames || [])
          .sort(compareCanonicalStrings_),
        uniqueExactStrings_(sourceSet && sourceSet.spreadsheetIds || [])
          .sort(compareCanonicalStrings_)
      ]);
    });
  });
  return hashText_(JSON.stringify([
    'course-outline-source-index',
    COURSE_OUTLINE_SOURCE_INDEX_FINGERPRINT_VERSION,
    sortCanonicalRows_(rows)
  ]));
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
  const expectedIndexFingerprint = makeCourseOutlineSourceIndexFingerprint_(
    payload.setsByGrade
  );
  if (payload.indexFingerprint &&
      String(payload.indexFingerprint) !== expectedIndexFingerprint) {
    throw new Error('課綱來源索引快取指紋不一致。');
  }
  payload.indexFingerprint = expectedIndexFingerprint;
  delete payload.fingerprint;
  return payload;
}

function quoteSheetsA1Title_(title) {
  return "'" + String(title || '').replace(/'/g, "''") + "'";
}

function assertSheetsReadonlyServiceAvailable_() {
  if (typeof Sheets === 'undefined' || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
    throw new Error(
      '控制臺母版缺少唯讀 Google Sheets API 服務，請更新 appsscript.json 後重新授權。'
    );
  }
}

function readSheetsWorkbookMetadata_(spreadsheetId) {
  assertSheetsReadonlyServiceAvailable_();
  const response = Sheets.Spreadsheets.get(spreadsheetId, {
    includeGridData: false,
    fields: 'properties(title),sheets(properties(sheetId,title),merges)'
  });
  if (!response || !response.properties || !Array.isArray(response.sheets)) {
    throw new Error('Google Sheets API 沒有回傳可讀取的試算表資料。');
  }
  return response;
}

function findSheetsResourceByTitle_(metadata, sheetTitle) {
  return (metadata && metadata.sheets || []).find(sheet =>
    sheet && sheet.properties && sheet.properties.title === sheetTitle
  ) || null;
}

function readSheetsDisplayValues_(spreadsheetId, sheetTitles) {
  assertSheetsReadonlyServiceAvailable_();
  const seenTitles = Object.create(null);
  const titles = (sheetTitles || []).map(title => String(title == null ? '' : title)).filter(title => {
    if (!title.trim() || seenTitles[title]) return false;
    seenTitles[title] = true;
    return true;
  });
  if (!titles.length) return {};
  const response = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges: titles.map(quoteSheetsA1Title_),
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING'
  });
  const valueRanges = response && Array.isArray(response.valueRanges)
    ? response.valueRanges
    : [];
  const result = Object.create(null);
  titles.forEach((title, index) => {
    const valueRange = valueRanges[index] || {};
    result[title] = Array.isArray(valueRange.values) ? valueRange.values : [];
  });
  return result;
}

function readCourseOutlineSourceIndexSpreadsheet_() {
  const metadata = readSheetsWorkbookMetadata_(COURSE_OUTLINE_INDEX_SPREADSHEET_ID);
  if (!findSheetsResourceByTitle_(metadata, COURSE_OUTLINE_INDEX_SHEET_NAME)) {
    throw new Error('課綱來源索引缺少「' + COURSE_OUTLINE_INDEX_SHEET_NAME + '」分頁。');
  }
  const values = readSheetsDisplayValues_(
    COURSE_OUTLINE_INDEX_SPREADSHEET_ID,
    [COURSE_OUTLINE_INDEX_SHEET_NAME]
  )[COURSE_OUTLINE_INDEX_SHEET_NAME] || [];
  if (!values.length) throw new Error('課綱來源索引沒有可讀取的資料。');
  return parseCourseOutlineSourceIndexValues_(values);
}

function getCourseOutlineIndexNoticeSemesterNumber_(settings) {
  const termKey = String(
    settings && (settings.pendingTermKey || settings.termKey) ||
    DEFAULT_SETTINGS.termKey ||
    ''
  );
  const canonicalMatch = normalizeTermKey_(termKey).match(/\\|\\d{4}-([12])$/);
  if (canonicalMatch) return Number(canonicalMatch[1]);
  const currentMonth = Number(Utilities.formatDate(scheduleBusinessNow_(), TIMEZONE, 'M'));
  return currentMonth >= 2 && currentMonth <= 7 ? 2 : 1;
}

function makeCourseOutlineSemesterKey_(gradeName, semesterNumber) {
  return gradeName + '|' + semesterNumber;
}

function formatCourseOutlineSemesterLabel_(gradeName, semesterNumber) {
  return gradeName + (Number(semesterNumber) === 2 ? '下' : '上');
}

function getCourseOutlineIndexNoticeSemesterContexts_(settings) {
  const gradeNames = ['高一', '高二', '高三'];
  const gradeName = settings && gradeNames.indexOf(settings.gradeName) !== -1
    ? settings.gradeName
    : '';
  if (!gradeName) return [];

  const semesterNumber = getCourseOutlineIndexNoticeSemesterNumber_(settings);
  const result = [{
    gradeName,
    semesterNumber,
    semesterKey: makeCourseOutlineSemesterKey_(gradeName, semesterNumber),
    semesterLabel: formatCourseOutlineSemesterLabel_(gradeName, semesterNumber)
  }];
  const nextGradeName = gradeNames[gradeNames.indexOf(gradeName) + 1] || '';
  const nextContext = semesterNumber === 1
    ? { gradeName, semesterNumber: 2 }
    : (nextGradeName ? { gradeName: nextGradeName, semesterNumber: 1 } : null);
  if (nextContext) {
    nextContext.semesterKey = makeCourseOutlineSemesterKey_(
      nextContext.gradeName,
      nextContext.semesterNumber
    );
    nextContext.semesterLabel = formatCourseOutlineSemesterLabel_(
      nextContext.gradeName,
      nextContext.semesterNumber
    );
    result.push(nextContext);
  }
  return result;
}

function getCourseOutlineSourceSetSemesterNumber_(sourceSet) {
  const keyMatch = String(sourceSet && sourceSet.key || '')
    .match(/^\\d{3,4}-([12])(?:-|$)/);
  if (keyMatch) return Number(keyMatch[1]);
  const validFromMatch = String(sourceSet && sourceSet.validFrom || '')
    .match(/^\\d{4}-(\\d{2})-\\d{2}$/);
  const startMonth = validFromMatch ? Number(validFromMatch[1]) : 0;
  return startMonth >= 2 && startMonth <= 7 ? 2 : 1;
}

function mapCourseOutlineSourceIndexSets_(payload, includedSemesterContexts) {
  const mapped = {};
  const contexts = Array.isArray(includedSemesterContexts)
    ? includedSemesterContexts
    : [];
  const includedSemesterKeys = {};
  contexts.forEach(context => {
    includedSemesterKeys[context.semesterKey] = true;
  });
  const gradeNames = contexts.length
    ? uniqueExactStrings_(contexts.map(context => context.gradeName))
    : ['高一', '高二', '高三'];
  gradeNames.forEach(gradeName => {
    const sets = payload && payload.setsByGrade && payload.setsByGrade[gradeName];
    (Array.isArray(sets) ? sets : []).forEach(set => {
      const semesterNumber = getCourseOutlineSourceSetSemesterNumber_(set);
      const semesterKey = makeCourseOutlineSemesterKey_(gradeName, semesterNumber);
      if (contexts.length && !includedSemesterKeys[semesterKey]) return;
      const key = gradeName + '|' + set.key;
      mapped[key] = {
        gradeName,
        semesterNumber,
        semesterKey,
        semesterLabel: formatCourseOutlineSemesterLabel_(gradeName, semesterNumber),
        sourceKey: set.key,
        comparable: JSON.stringify(set),
        outlineNames: uniqueExactStrings_(set.outlineNames || []),
        spreadsheetIds: (set.spreadsheetIds || []).slice()
      };
    });
  });
  return mapped;
}

function buildCourseOutlineReviewRow_(type, label) {
  const isAdded = type === 'added';
  return {
    type,
    sign: isAdded ? '+' : '-',
    label: label || '未命名課綱',
    backgroundColor: isAdded ? '#dcefe7' : '#fae3df',
    borderColor: isAdded ? '#00a676' : '#f05a47',
    textColor: isAdded ? '#007c59' : '#a63c2f'
  };
}

function buildCourseOutlineSourceIndexChangeData_(
  previousPayload,
  nextPayload,
  includedSemesterContexts
) {
  const contexts = Array.isArray(includedSemesterContexts)
    ? includedSemesterContexts
    : [];
  const previousSets = mapCourseOutlineSourceIndexSets_(previousPayload, contexts);
  const nextSets = mapCourseOutlineSourceIndexSets_(nextPayload, contexts);
  const reviewsBySemester = {};

  function addReviewRow(sourceSet, type, label) {
    const semesterKey = sourceSet.semesterKey;
    if (!reviewsBySemester[semesterKey]) {
      reviewsBySemester[semesterKey] = {
        semesterKey,
        semesterLabel: sourceSet.semesterLabel,
        rows: []
      };
    }
    reviewsBySemester[semesterKey].rows.push(
      buildCourseOutlineReviewRow_(type, label)
    );
  }

  Object.keys(nextSets).sort().forEach(key => {
    if (!previousSets[key]) {
      nextSets[key].outlineNames.forEach(outlineName => {
        addReviewRow(nextSets[key], 'added', outlineName);
      });
    } else if (previousSets[key].comparable !== nextSets[key].comparable) {
      const previousNames = previousSets[key].outlineNames;
      const nextNames = nextSets[key].outlineNames;
      const removedNames = previousNames.filter(name => nextNames.indexOf(name) === -1);
      const addedNames = nextNames.filter(name => previousNames.indexOf(name) === -1);
      if (!removedNames.length && !addedNames.length) {
        previousNames.forEach(outlineName => {
          addReviewRow(previousSets[key], 'removed', outlineName);
        });
        nextNames.forEach(outlineName => {
          addReviewRow(nextSets[key], 'added', outlineName);
        });
      } else {
        removedNames.forEach(outlineName => {
          addReviewRow(previousSets[key], 'removed', outlineName);
        });
        addedNames.forEach(outlineName => {
          addReviewRow(nextSets[key], 'added', outlineName);
        });
      }
    }
  });
  Object.keys(previousSets).sort().forEach(key => {
    if (!nextSets[key]) {
      previousSets[key].outlineNames.forEach(outlineName => {
        addReviewRow(previousSets[key], 'removed', outlineName);
      });
    }
  });

  const orderedSemesterKeys = contexts.length
    ? contexts.map(context => context.semesterKey)
    : Object.keys(reviewsBySemester).sort();
  const semesterReviews = orderedSemesterKeys
    .filter(semesterKey => reviewsBySemester[semesterKey])
    .map(semesterKey => reviewsBySemester[semesterKey]);
  const allRows = [];
  semesterReviews.forEach(review => {
    review.rows.forEach(row => {
      allRows.push({
        semesterKey: review.semesterKey,
        semesterLabel: review.semesterLabel,
        row
      });
    });
  });
  const visibleRows = allRows.slice(0, COURSE_OUTLINE_INDEX_NOTICE_DETAIL_LIMIT);
  const visibleReviewsBySemester = {};
  visibleRows.forEach(item => {
    if (!visibleReviewsBySemester[item.semesterKey]) {
      visibleReviewsBySemester[item.semesterKey] = {
        semesterKey: item.semesterKey,
        semesterLabel: item.semesterLabel,
        rows: []
      };
    }
    visibleReviewsBySemester[item.semesterKey].rows.push(item.row);
  });
  const visibleSemesterReviews = orderedSemesterKeys
    .filter(semesterKey => visibleReviewsBySemester[semesterKey])
    .map(semesterKey => visibleReviewsBySemester[semesterKey]);
  const omittedCount = Math.max(0, allRows.length - visibleRows.length);
  const omittedNote = omittedCount
    ? '另有 ' + omittedCount + ' 項變動未列出'
    : '';
  const summary = [
    visibleSemesterReviews.map(review => [
      review.semesterLabel,
      review.rows.map(row => row.sign + ' ' + row.label).join('\\n')
    ].join('\\n')).join('\\n\\n'),
    omittedNote,
    '',
    '舊指紋：' + previousPayload.indexFingerprint,
    '新指紋：' + nextPayload.indexFingerprint
  ].filter(Boolean).join('\\n');

  return {
    changeCount: allRows.length,
    semesterReviews: visibleSemesterReviews,
    semesterKeys: contexts.map(context => context.semesterKey),
    hasRelevantChanges: visibleRows.length > 0,
    omittedCount,
    omittedNote,
    previousFingerprint: previousPayload.indexFingerprint,
    currentFingerprint: nextPayload.indexFingerprint,
    summary
  };
}

function summarizeCourseOutlineSourceIndexChange_(previousPayload, nextPayload) {
  return buildCourseOutlineSourceIndexChangeData_(previousPayload, nextPayload).summary;
}

function prepareCourseOutlineSourceIndexChangeNotice_(previousPayload, nextPayload) {
  if (!previousPayload || !previousPayload.indexFingerprint) return null;
  const indexFingerprintMatches =
    previousPayload.indexFingerprint === nextPayload.indexFingerprint;
  if (indexFingerprintMatches) {
    const pending = previousPayload.changeNotice;
    return pending && pending.pending &&
      pending.currentFingerprint === nextPayload.indexFingerprint
      ? pending
      : null;
  }
  const settings = loadSettings_();
  const noticeSemesterContexts = getCourseOutlineIndexNoticeSemesterContexts_(settings);
  const changeData = buildCourseOutlineSourceIndexChangeData_(
    previousPayload,
    nextPayload,
    noticeSemesterContexts
  );
  if (!changeData.hasRelevantChanges) return null;
  return {
    pending: true,
    previousFingerprint: previousPayload.indexFingerprint,
    currentFingerprint: nextPayload.indexFingerprint,
    detectedAt: new Date().toISOString(),
    changeCount: changeData.changeCount,
    semesterReviews: changeData.semesterReviews,
    semesterKeys: changeData.semesterKeys,
    omittedCount: changeData.omittedCount,
    omittedNote: changeData.omittedNote,
    summary: changeData.summary
  };
}

function clearPendingCourseOutlineSourceIndexChangeNotice_(payload) {
  delete payload.changeNotice;
  if (courseOutlineSourceIndexRuntimeCache_ &&
      courseOutlineSourceIndexRuntimeCache_.indexFingerprint === payload.indexFingerprint) {
    delete courseOutlineSourceIndexRuntimeCache_.changeNotice;
  }
  try {
    writeChunkedJson_(COURSE_OUTLINE_INDEX_CACHE_STORE, payload);
  } catch (cacheError) {
    Logger.log('課綱來源索引通知狀態保存失敗，後續可能重複通知：' + cacheError.message);
  }
}

function sendPendingCourseOutlineSourceIndexChangeNotice_(payload) {
  const notice = payload && payload.changeNotice;
  if (!notice || !notice.pending) return;
  const settings = loadSettings_();
  const relevantSemesterContexts = getCourseOutlineIndexNoticeSemesterContexts_(settings);
  const relevantSemesterKeys = relevantSemesterContexts.map(context => context.semesterKey);
  const semesterReviews = (Array.isArray(notice.semesterReviews)
    ? notice.semesterReviews
    : []).filter(review => {
    return relevantSemesterKeys.indexOf(review.semesterKey) !== -1 &&
      Array.isArray(review.rows) &&
      review.rows.length;
  });
  if (!semesterReviews.length) {
    clearPendingCourseOutlineSourceIndexChangeNotice_(payload);
    return;
  }

  const visibleChangeCount = semesterReviews.reduce(
    (count, review) => count + review.rows.length,
    0
  );
  const omittedCount = Number(notice.omittedCount) || 0;
  const omittedNote = omittedCount
    ? '另有 ' + omittedCount + ' 項變動未列出'
    : '';
  const noticeSummary = [
    semesterReviews.map(review => [
      review.semesterLabel,
      review.rows.map(row => row.sign + ' ' + row.label).join('\\n')
    ].join('\\n')).join('\\n\\n'),
    omittedNote,
    '',
    '舊指紋：' + (notice.previousFingerprint || ''),
    '新指紋：' + (notice.currentFingerprint || '')
  ].filter((line, index, lines) =>
    line !== '' || (index > 0 && lines[index - 1] !== '')
  ).join('\\n');
  try {
    sendEmail_(
      settings,
      'course_outline_index_changed',
      '課綱索引已更新',
      '中央課綱來源索引已更新，內容摘要如下\\n\\n' + noticeSummary +
      '\\n\\n如果你覺得更新內容怪怪的，請聯繫齊宣處理',
      {
        changeCount: visibleChangeCount + omittedCount,
        semesterReviews,
        omittedNote,
        previousFingerprint: notice.previousFingerprint || '',
        currentFingerprint: notice.currentFingerprint || ''
      }
    );
  } catch (mailError) {
    Logger.log('課綱來源索引變動通知寄送失敗，將於下次成功讀取索引時重試：' + mailError.message);
    return;
  }

  clearPendingCourseOutlineSourceIndexChangeNotice_(payload);
}

function loadCourseOutlineSourceIndex_() {
  if (courseOutlineSourceIndexRuntimeCache_) return courseOutlineSourceIndexRuntimeCache_;

  try {
    const live = readCourseOutlineSourceIndexSpreadsheet_();
    const payload = assertCourseOutlineSourceIndexPayload_({
      setsByGrade: live.setsByGrade,
      indexFingerprint: live.indexFingerprint,
      refreshedAt: new Date().toISOString()
    });
    let previousPayload = null;
    try {
      previousPayload = readChunkedJson_(COURSE_OUTLINE_INDEX_CACHE_STORE, null);
      if (previousPayload) assertCourseOutlineSourceIndexPayload_(previousPayload);
    } catch (cacheReadError) {
      previousPayload = null;
      Logger.log('課綱來源索引舊快取無法用於變動比對：' + cacheReadError.message);
    }
    try {
      const changeNotice = prepareCourseOutlineSourceIndexChangeNotice_(
        previousPayload,
        payload
      );
      if (changeNotice) payload.changeNotice = changeNotice;
    } catch (noticeError) {
      Logger.log('課綱來源索引變動摘要建立失敗：' + noticeError.message);
    }
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
    sendPendingCourseOutlineSourceIndexChangeNotice_(payload);
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
        indexFingerprint: makeCourseOutlineSourceIndexFingerprint_(
          COURSE_OUTLINE_SOURCE_SETS_BY_GRADE
        ),
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

function loadCourseOutlineSourceIndexForUi_() {
  if (courseOutlineSourceIndexRuntimeCache_) return courseOutlineSourceIndexRuntimeCache_;
  try {
    const cached = readChunkedJson_(COURSE_OUTLINE_INDEX_CACHE_STORE, null);
    assertCourseOutlineSourceIndexPayload_(cached);
    return Object.assign({}, cached, {
      source: 'last_success',
      warning: ''
    });
  } catch (cacheError) {
    const fallback = assertCourseOutlineSourceIndexPayload_({
      setsByGrade: JSON.parse(JSON.stringify(COURSE_OUTLINE_SOURCE_SETS_BY_GRADE)),
      indexFingerprint: makeCourseOutlineSourceIndexFingerprint_(
        COURSE_OUTLINE_SOURCE_SETS_BY_GRADE
      ),
      refreshedAt: ''
    });
    return Object.assign({}, fallback, {
      source: 'embedded_fallback',
      warning: ''
    });
  }
}

function isDateInCourseOutlineSourceSet_(dateKey, sourceSet) {
  return Boolean(dateKey && sourceSet && dateKey >= sourceSet.validFrom && dateKey <= sourceSet.validUntil);
}

function getRelevantCourseOutlineSourceSets_(gradeName, events) {
  return getRelevantCourseOutlineSourceSetsFromIndex_(
    gradeName,
    events,
    loadCourseOutlineSourceIndex_()
  );
}

function getRelevantCourseOutlineSourceSetsFromIndex_(gradeName, events, sourceIndex) {
  const datedEvents = (events || []).filter(event => event && !event.isAllDay && event.dateKey);
  return getConfiguredCourseOutlineSourceSetsFromIndex_(gradeName, sourceIndex)
    .filter(sourceSet => datedEvents.some(event => isDateInCourseOutlineSourceSet_(event.dateKey, sourceSet)));
}

function makeCourseOutlineSourceSetsFingerprint_(sourceSets) {
  return hashText_(JSON.stringify([
    'course-outline-source-sets',
    1,
    sortCanonicalRows_((sourceSets || []).map(sourceSet => [
    sourceSet.key,
    sourceSet.validFrom,
    sourceSet.validUntil,
    uniqueExactStrings_(sourceSet.spreadsheetIds || []).sort(compareCanonicalStrings_)
    ]))
  ]));
}

function makeCourseOutlineContextFingerprint_(settings, source, events, sourceSets) {
  const courseNames = uniqueExactStrings_((events || [])
    .filter(event => event && !event.isAllDay)
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

function makeCourseOutlineSheetMatchKey_(value) {
  let text = String(value == null ? '' : value);
  if (typeof text.normalize === 'function') text = text.normalize('NFKC');
  const key = text.replace(/[\\s\\u200B-\\u200D\\uFEFF]+/g, '').toLowerCase();
  return NATURAL_ADVANCED_VARIANT_TITLES.map(normalizeTitle_).indexOf(key) !== -1
    ? normalizeTitle_(NATURAL_ADVANCED_BASE_TITLE)
    : key;
}

function makeCourseOutlineIdentityHash_(outline) {
  const topic = normalizeText_(outline && outline.topic);
  const content = normalizeText_(outline && outline.content);
  if (!topic && !content) return '';
  return hashText_(JSON.stringify(['course-outline-event-identity', 1, topic, content]));
}

function enrichEventsWithCourseOutlines_(events, settings, source) {
  const desiredEvents = events || [];
  const sourceSets = getRelevantCourseOutlineSourceSets_(settings.gradeName, desiredEvents);
  if (!sourceSets.length) return desiredEvents;
  const snapshot = readActiveCourseOutlineSnapshot_();
  if (!snapshot || snapshot.schemaVersion !== COURSE_OUTLINE_CACHE_SCHEMA_VERSION) return desiredEvents;
  if (snapshot.gradeName !== settings.gradeName ||
      !termKeysMatch_(snapshot.termKey, source && source.termKey || '') ||
      snapshot.sourceSetsFingerprint !== makeCourseOutlineSourceSetsFingerprint_(sourceSets)) {
    return desiredEvents;
  }
  return attachCourseOutlineLookup_(desiredEvents, snapshot.lookup || {});
}

function attachCourseOutlineLookup_(events, lookup) {
  return (events || []).map(event => {
    if (!event || event.isAllDay) return event;
    const key = makeCourseOutlineOccurrenceKey_(event.originalTitle, event.dateKey, event.periodStart, event.periodEnd);
    const outline = lookup && lookup[key];
    if (!outline || !outline.hash) return event;
    return Object.assign({}, event, {
      courseOutline: {
        classroom: outline.classroom || '',
        topic: outline.topic || '',
        content: outline.content || ''
      },
      outlineHash: outline.hash,
      outlineIdentityHash: makeCourseOutlineIdentityHash_(outline)
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
  return resolveCourseOutlineDateKeyFromUniqueCandidates_(
    value,
    uniqueExactStrings_(candidateDateKeys || [])
  );
}

function resolveCourseOutlineDateKeyFromUniqueCandidates_(value, candidates) {
  const numbers = String(value == null ? '' : value).match(/\\d+/g);
  if (!numbers || numbers.length < 2) return '';
  const hasLeadingYear = numbers.length >= 3;
  const month = Number(numbers[hasLeadingYear ? 1 : 0]);
  const day = Number(numbers[hasLeadingYear ? 2 : 1]);
  if (!Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(day) || day < 1 || day > 31) return '';
  const suffix = '-' + pad2_(month) + '-' + pad2_(day);
  const matches = candidates.filter(dateKey => String(dateKey).slice(-6) === suffix);
  return matches.length === 1 ? matches[0] : '';
}

function parseCourseOutlinePeriod_(value) {
  const text = normalizeText_(value).replace(/[第節]/g, '').trim();
  if (!text) return null;
  let numbers = text.match(/\\d+/g);
  if (!numbers || !numbers.length) return null;

  if (numbers.length === 1 && /^\\d{2,8}$/.test(numbers[0])) {
    const compactPeriods = numbers[0].split('').map(Number);
    const isSupportedCompactRange = compactPeriods.length === 2 || compactPeriods.every(
      (period, index) => index === 0 || period === compactPeriods[index - 1] + 1
    );
    if (!isSupportedCompactRange) return null;
    numbers = [compactPeriods[0], compactPeriods[compactPeriods.length - 1]];
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
    const isAppsScriptRange = typeof mergedRange.getNumRows === 'function';
    const startRow = isAppsScriptRange
      ? Number(mergedRange.getRow()) - 1
      : Number(mergedRange.startRowIndex) || 0;
    const startColumn = isAppsScriptRange
      ? Number(mergedRange.getColumn()) - 1
      : Number(mergedRange.startColumnIndex) || 0;
    const rowCount = isAppsScriptRange
      ? Number(mergedRange.getNumRows()) || 0
      : Number(mergedRange.endRowIndex) - startRow;
    const columnCount = isAppsScriptRange
      ? Number(mergedRange.getNumColumns()) || 0
      : Number(mergedRange.endColumnIndex) - startColumn;
    if (rowCount <= 1 || columnCount !== 1) return;
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
  const desiredCourseNamesByTime = {};
  (desiredEvents || []).forEach(event => {
    const timeKey = JSON.stringify([event.dateKey, Number(event.periodStart), Number(event.periodEnd)]);
    if (!desiredCourseNamesByTime[timeKey]) desiredCourseNamesByTime[timeKey] = [];
    if (desiredCourseNamesByTime[timeKey].indexOf(event.originalTitle) === -1) {
      desiredCourseNamesByTime[timeKey].push(event.originalTitle);
    }
  });
  const records = [];

  for (let rowIndex = header.headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const dateKey = resolveCourseOutlineDateKeyFromUniqueCandidates_(
      row[header.columns['日期']],
      candidates
    );
    const period = parseCourseOutlinePeriod_(row[header.columns['節次']]);
    if (!dateKey || !period || isPureAsynchronousCourseOutlineRow_(row, header.columns)) continue;
    const timeKey = JSON.stringify([dateKey, period.periodStart, period.periodEnd]);
    const desiredCourseNames = desiredCourseNamesByTime[timeKey] || [];
    if (!desiredCourseNames.length) continue;
    const classroom = normalizeText_(row[header.columns['實體課程教室']]);
    const topic = normalizeText_(row[header.columns['單元主題']]);
    const content = normalizeText_(row[header.columns['課程內容']]);
    if (!classroom && !topic && !content) continue;
    desiredCourseNames.forEach(courseName => {
      records.push({
        key: makeCourseOutlineOccurrenceKey_(courseName, dateKey, period.periodStart, period.periodEnd),
        sheetName,
        courseName,
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
      !event.isAllDay &&
      isDateInCourseOutlineSourceSet_(event.dateKey, sourceSet)
    );
    const setCourseNames = uniqueExactStrings_(setEvents.map(event => event.originalTitle));
    const courseNamesByMatchKey = Object.create(null);
    setCourseNames.forEach(courseName => {
      const matchKey = makeCourseOutlineSheetMatchKey_(courseName);
      if (!matchKey) return;
      if (!courseNamesByMatchKey[matchKey]) courseNamesByMatchKey[matchKey] = [];
      courseNamesByMatchKey[matchKey].push(courseName);
    });

    sourceSet.spreadsheetIds.forEach(spreadsheetId => {
      const spreadsheet = readSheetsWorkbookMetadata_(spreadsheetId);
      const spreadsheetName = String(spreadsheet.properties.title || '未命名課綱');
      const sourceSummary = {
        sourceSetKey: sourceSet.key,
        spreadsheetId,
        spreadsheetName,
        scannedSheets: 0,
        matchedRecords: 0
      };
      diagnostics.spreadsheetCount += 1;

      const relevantSheets = [];
      spreadsheet.sheets.forEach(sheet => {
        const sheetName = String(sheet && sheet.properties && sheet.properties.title || '');
        if (!sheetName) return;
        const matchedCourseNames = courseNamesByMatchKey[makeCourseOutlineSheetMatchKey_(sheetName)] || [];
        if (!matchedCourseNames.length) return;
        relevantSheets.push({ sheet, matchedCourseNames });
      });
      const valuesBySheet = readSheetsDisplayValues_(
        spreadsheetId,
        relevantSheets.map(item => item.sheet.properties.title)
      );

      relevantSheets.forEach(item => {
        const sheet = item.sheet;
        const sheetName = sheet.properties.title;
        const sheetValues = valuesBySheet[sheetName] || [];
        if (!sheetValues.length) throw new Error('課綱分頁「' + sheetName + '」沒有可讀取的資料。');
        const values = expandVerticalMergedCourseOutlineValues_(
          sheetValues,
          Array.isArray(sheet.merges) ? sheet.merges : []
        );
        const sheetEvents = setEvents.filter(event => item.matchedCourseNames.indexOf(event.originalTitle) !== -1);
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
    gradeName: '',
    termKey: '',
    attempt: 0,
    incidentId: '',
    runId: '',
    scheduledAt: '',
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

function buildCourseOutlineUiStatus_(settings, source, sourceIndexOverride) {
  const sourceIndex = sourceIndexOverride || loadCourseOutlineSourceIndex_();
  const configuredSets = getConfiguredCourseOutlineSourceSetsFromIndex_(
    settings.gradeName,
    sourceIndex
  );
  const relevantSets = source && Array.isArray(source.events)
    ? getRelevantCourseOutlineSourceSetsFromIndex_(
      settings.gradeName,
      source.events,
      sourceIndex
    )
    : configuredSets;
  const state = loadCourseOutlineState_();
  const snapshot = readActiveCourseOutlineSnapshot_();
  const requestedTermKey = source && source.termKey || '';
  const snapshotMatches = Boolean(
    snapshot &&
    snapshot.gradeName === settings.gradeName &&
    (!requestedTermKey || snapshot.termKey === requestedTermKey) &&
    relevantSets.length > 0 &&
    snapshot.sourceSetsFingerprint ===
      makeCourseOutlineSourceSetsFingerprint_(relevantSets)
  );
  const visibleSnapshot = snapshotMatches ? snapshot : null;
  const stateGradeName = state.gradeName || (snapshot && snapshot.gradeName) || '';
  const stateTermKey = state.termKey || (snapshot && snapshot.termKey) || '';
  const stateMatches = (!stateGradeName || stateGradeName === settings.gradeName) &&
    (!requestedTermKey || !stateTermKey || stateTermKey === requestedTermKey);
  const visibleState = stateMatches ? state : { status: 'idle' };
  return {
    enabled: relevantSets.length > 0,
    configured: configuredSets.length > 0,
    sourceSetLabels: relevantSets.map(sourceSet => sourceSet.label),
    indexSource: sourceIndex.source || '',
    indexWarning: sourceIndex.warning || '',
    state: visibleState.status || 'idle',
    lastSuccessAt: visibleState.lastSuccessAt ||
      visibleSnapshot && visibleSnapshot.refreshedAt || '',
    lastSuccessLabel: visibleSnapshot && visibleSnapshot.refreshedAtLabel ||
      (visibleState.lastSuccessAt
        ? formatDateTime_(new Date(visibleState.lastSuccessAt))
        : ''),
    lastError: visibleState.lastError || '',
    matchedRecordCount: visibleSnapshot && visibleSnapshot.diagnostics
      ? Number(visibleSnapshot.diagnostics.matchedRecordCount) || 0
      : 0,
    missingSheetNames: visibleSnapshot && visibleSnapshot.diagnostics
      ? visibleSnapshot.diagnostics.missingSheetNames || []
      : [],
    nearMatchSheetNames: visibleSnapshot && visibleSnapshot.diagnostics
      ? visibleSnapshot.diagnostics.nearMatchSheetNames || []
      : []
  };
}

function describeCourseOutlineStatusForUser_(outline) {
  const status = outline || {};
  if (!status.enabled) return '這個年級目前沒有可使用的課綱資料';
  if (status.state === 'queued') return '已排入背景工作，正在等待 Google 開始更新';
  if (status.state === 'running') return '正在讀取並整理課綱資料';
  if (status.state === 'retry_pending') {
    return '這次更新暫時沒有完成，系統稍後會自動再試一次';
  }
  if (status.state === 'failed') return '課綱更新失敗，請查看下方原因';
  if (status.lastSuccessAt) return '最近一次課綱檢查已完成';
  return '尚未完成第一次課綱更新';
}

function getDesiredCourseOutlineEvents_(settings, source, now) {
  return filterCourseOutlineLookaheadEvents_(
    source && source.events || [],
    now || scheduleBusinessNow_(),
    COURSE_OUTLINE_LOOKAHEAD_DAYS
  )
    .filter(event => shouldIncludeEvent_(event, settings))
    .filter(event => !event.isAllDay);
}

function hasFreshCourseOutlineSnapshot_(settings, source) {
  if (!settings || !source) return false;
  const desiredEvents = getDesiredCourseOutlineEvents_(settings, source, scheduleBusinessNow_());
  const sourceSets = getRelevantCourseOutlineSourceSets_(settings.gradeName, desiredEvents);
  if (!sourceSets.length) return false;
  const snapshot = readActiveCourseOutlineSnapshot_();
  const refreshedAtMs = Date.parse(snapshot && snapshot.refreshedAt || '');
  return Boolean(
    snapshot &&
    snapshot.schemaVersion === COURSE_OUTLINE_CACHE_SCHEMA_VERSION &&
    snapshot.gradeName === settings.gradeName &&
    termKeysMatch_(snapshot.termKey, source.termKey) &&
    snapshot.contextFingerprint ===
      makeCourseOutlineContextFingerprint_(settings, source, desiredEvents, sourceSets) &&
    Number.isFinite(refreshedAtMs) &&
    Date.now() - refreshedAtMs <= 15 * 60 * 1000
  );
}

function scheduleCourseOutlineRefreshIfNeeded_(settings, source, options) {
  const activeSettings = settings || loadSettings_();
  const allowWhenAutoSyncDisabled = Boolean(
    options && options.allowWhenAutoSyncDisabled
  );
  if (!activeSettings.setupComplete ||
      (!activeSettings.autoSyncEnabled && !allowWhenAutoSyncDisabled) ||
      activeSettings.pendingTermKey ||
      loadSourceObservation_().termCandidate ||
      !getConfiguredCourseOutlineSourceSets_(activeSettings.gradeName).length) {
    return false;
  }
  if (source && hasFreshCourseOutlineSnapshot_(activeSettings, source)) return false;
  const state = loadCourseOutlineState_();
  if (state.status === 'running' || state.status === 'retry_pending') return false;
  const handler = activeSettings.autoSyncEnabled
    ? COURSE_OUTLINE_ONCE_HANDLER
    : COURSE_OUTLINE_MANUAL_ONCE_HANDLER;
  deleteTriggersByHandlers_([
    handler === COURSE_OUTLINE_ONCE_HANDLER
      ? COURSE_OUTLINE_MANUAL_ONCE_HANDLER
      : COURSE_OUTLINE_ONCE_HANDLER
  ]);
  const created = ensureOneTimeTrigger_(handler, 60 * 1000);
  saveCourseOutlineState_(Object.assign({}, state, {
    status: 'queued',
    gradeName: activeSettings.gradeName,
    termKey: activeSettings.termKey || (source && source.termKey) || '',
    scheduledAt: new Date().toISOString(),
    lastError: ''
  }));
  return created;
}

function refreshCourseOutlinesDaily() {
  return runCourseOutlineRefreshAttempt_(1, 'daily');
}

function refreshCourseOutlinesOnce() {
  return runCourseOutlineRefreshAttempt_(1, 'scheduled');
}

function refreshCourseOutlinesManualOnce() {
  return runCourseOutlineRefreshAttempt_(1, 'manual');
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
    getControlPanelUi_().alert('課綱更新', message, getControlPanelUi_().ButtonSet.OK);
  } catch (error) {
    Logger.log('無法顯示課綱更新結果：' + error.message);
  }
  return result;
}

function canRunCourseOutlineRefreshWhileAutoSyncDisabled_(reason, state) {
  return reason === 'manual' ||
    (reason === 'retry' && state && state.reason === 'manual');
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
  let settings = null;
  let run = null;
  try {
    settings = loadSettings_();
    const existingState = loadCourseOutlineState_();
    const configuredSets = getConfiguredCourseOutlineSourceSets_(settings.gradeName);
    if (!configuredSets.length) {
      return { ok: true, skipped: true, message: '這個年級目前沒有可使用的課綱資料。' };
    }
    if (!settings.setupComplete) {
      return { ok: true, skipped: true, message: '完成第一次同步後，系統才會更新課綱資料。' };
    }
    if (settings.pendingTermKey || loadSourceObservation_().termCandidate) {
      return { ok: true, skipped: true, message: '偵測到新學期，請先重新選擇課程與活動再更新課綱資料。' };
    }
    if (!settings.autoSyncEnabled &&
        !canRunCourseOutlineRefreshWhileAutoSyncDisabled_(reason, existingState)) {
      return { ok: true, skipped: true, message: '自動同步已暫停，因此暫時不更新課綱資料。' };
    }

    flushPendingCourseOutlineFailureNotification_();
    run = beginCourseOutlineRefreshRun_(settings, attempt, reason);
    if (!run) {
      return { ok: true, skipped: true, message: '課綱資料正在更新，或已排定稍後再試。' };
    }
    const source = loadSourceContext_(settings.gradeName);
    if (settings.termKey && !termKeysMatch_(source.termKey, settings.termKey)) {
      finishCourseOutlineRefreshRun_(run, null);
      return { ok: true, skipped: true, message: '偵測到新學期，請先重新選擇課程與活動再更新課綱資料。' };
    }
    const desiredEvents = getDesiredCourseOutlineEvents_(
      settings,
      source,
      scheduleBusinessNow_()
    );
    const sourceSets = getRelevantCourseOutlineSourceSets_(settings.gradeName, desiredEvents);
    if (!sourceSets.length) {
      finishCourseOutlineRefreshRun_(run, null);
      return { ok: true, skipped: true, message: '近期沒有需要補上課綱資料的課程。' };
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
    else handleCourseOutlineRefreshStartupFailure_(settings, attempt, reason, error);
    return { ok: false, skipped: false, message: userFacingError_(error) };
  }
}

function handleCourseOutlineRefreshStartupFailure_(settings, attempt, reason, error) {
  try {
    const state = loadCourseOutlineState_();
    const incidentId = state.incidentId ||
      hashText_('course-outline-startup|' + Date.now() + '|' + Math.random());
    const runId = hashText_(incidentId + '|' + attempt + '|' + Date.now() + '|' + Math.random());
    const run = Object.assign({}, state, {
      status: 'running',
      gradeName: (settings && settings.gradeName) || state.gradeName || '',
      termKey: (settings && settings.termKey) || state.termKey || '',
      attempt,
      incidentId,
      runId,
      reason,
      scheduledAt: '',
      startedAt: new Date().toISOString(),
      watchdogTriggerId: '',
      lastError: ''
    });
    saveCourseOutlineState_(run);
    handleCourseOutlineRefreshFailure_(run, error);
  } catch (stateError) {
    Logger.log(
      '課綱更新無法開始，且無法保存失敗狀態：' +
      userFacingError_(error) + '；' + userFacingError_(stateError)
    );
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
      gradeName: settings.gradeName,
      termKey: settings.termKey || '',
      attempt,
      incidentId,
      runId,
      reason,
      scheduledAt: '',
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
      gradeName: state.gradeName || '',
      termKey: state.termKey || '',
      attempt: 0,
      incidentId: '',
      runId: '',
      scheduledAt: '',
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
          scheduledAt: '',
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
      scheduledAt: '',
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
      '課綱更新失敗',
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
  const cleanGrade = sanitizeGrade_(gradeName);
  if (Object.prototype.hasOwnProperty.call(scheduleSourceRuntimeCache_, cleanGrade)) {
    return scheduleSourceRuntimeCache_[cleanGrade];
  }
  const payload = fetchSchedulePayload_(cleanGrade);
  const source = parseSchedulePayload_(payload, cleanGrade, scheduleBusinessNow_());
  scheduleSourceRuntimeCache_[cleanGrade] = source;
  return source;
}

function resetScheduleSourceRuntimeCache_() {
  scheduleSourceRuntimeCache_ = Object.create(null);
}

function scheduleBusinessNow_() {
${highLoadBusinessNowCode}
  return new Date();
}

function fetchSchedulePayload_(gradeName) {
  const apiGrade = GRADE_API_NAMES[sanitizeGrade_(gradeName)];
  let lastError = null;
  for (let attempt = 1; attempt <= SOURCE_FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = UrlFetchApp.fetch(
        SOURCE_API_URL + '?grade=' + encodeURIComponent(apiGrade),
        { followRedirects: true, muteHttpExceptions: true }
      );
      const code = response.getResponseCode();
      if (code !== 200) {
        const httpError = new Error('課表來源回應失敗（HTTP ' + code + '）。');
        httpError.httpStatus = code;
        throw httpError;
      }
      let payload;
      try { payload = JSON.parse(response.getContentText('UTF-8')); }
      catch (error) { throw new Error('課表來源不是有效的 JSON。'); }
      assertSourcePayload_(payload, apiGrade);
      return payload;
    } catch (error) {
      lastError = error;
      const code = Number(error && error.httpStatus) || 0;
      const retryable = !code || code === 302 || code === 404 ||
        code === 408 || code === 425 || code === 429 || code >= 500;
      if (!retryable || attempt === SOURCE_FETCH_MAX_ATTEMPTS) throw error;
      Utilities.sleep(SOURCE_FETCH_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError || new Error('目前無法讀取課表來源。');
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
        if (!parsed.title || !dateKey) return;
        const start = makeTaipeiDate_(dateKey, '00:00');
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        events.push({
          originalTitle: parsed.title,
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
  const termKey = makeAcademicTermKey_(GRADE_API_NAMES[gradeName], firstDateKey);
  const sourceUpdatedLabel = latestUpdateLabel_(events.map(event => event.sourceUpdatedLabel));
  const sourceEventRows = sortCanonicalRows_(events.map(event => [
    event.originalTitle,
    Boolean(event.isAllDay),
    event.dateKey,
    event.periodStart,
    event.periodEnd,
    eventDateIso_(event.start),
    eventDateIso_(event.end),
    event.location || ''
  ]));
  const catalogFingerprint = makeSetupCatalogFingerprint_(termKey, lastDateKey, catalogAll);
  const scheduleFingerprint = hashText_(JSON.stringify([
    'schedule',
    SCHEDULE_FINGERPRINT_VERSION,
    termKey,
    lastDateKey,
    makeCatalogFingerprintRows_(catalogAll),
    sourceEventRows
  ]));

  return {
    gradeName,
    firstDateKey,
    lastDateKey,
    termKey,
    catalogFingerprintVersion: SETUP_CATALOG_FINGERPRINT_VERSION,
    catalogFingerprint,
    scheduleFingerprint,
    sourceUpdatedLabel,
    sourceStale: isSourceStale_(sourceUpdatedLabel, now),
    catalog: {
      all: catalogAll,
      termItems: catalogAll.filter(item => item.period === 'term'),
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
          hasVacationOccurrence: false
        };
        existing.hasVacationOccurrence =
          existing.hasVacationOccurrence ||
          Boolean(vacationWeeks[Number(row.weekNum)]);
        catalogMap[key] = existing;
      });
    });
  });
  return sortCatalogItemsByPeriod_(Object.keys(catalogMap)
    .map(key => ({
      title: catalogMap[key].title,
      period: catalogMap[key].hasVacationOccurrence ? 'vacation' : 'term'
    }))
  );
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
  const storedSchemaVersion = Number(stored && stored.schemaVersion) || 0;
  settings.schemaVersion = SETTINGS_SCHEMA_VERSION;
  settings.scheduleFingerprint = String(
    settings.scheduleFingerprint || settings.sourceFingerprint || ''
  );
  settings.setupContextFingerprint = String(settings.setupContextFingerprint || '');
  settings.termKey = normalizeTermKey_(settings.termKey);
  settings.pendingTermKey = normalizeTermKey_(settings.pendingTermKey);
  settings.termTransitionNoticeScheduledFor = String(settings.termTransitionNoticeScheduledFor || '');
  delete settings.sourceFingerprint;
  const legacyNotificationHours = stored && Array.isArray(stored.autoSyncHours)
    ? stored.autoSyncHours
    : DEFAULT_SETTINGS.notificationHours;
  const storedNotificationHours = stored && Array.isArray(stored.notificationHours)
    ? stored.notificationHours
    : legacyNotificationHours;
  settings.notificationHours = normalizeHourArray_(
    storedNotificationHours,
    normalizeHour_(settings.notifySyncHour, 5)
  );
  settings.notifySyncHour = Math.max.apply(null, settings.notificationHours);
  settings.instantNotificationsEnabled = settings.instantNotificationsEnabled !== false;
  settings.autoSyncHours = SCHEDULE_SYNC_HOURS.slice();
  const legacyCatalog = storedSchemaVersion < SETTINGS_SCHEMA_VERSION
    ? loadLegacyClassifiedCatalogItems_(settings)
    : { items: [], reliable: false };
  if (storedSchemaVersion < SETTINGS_SCHEMA_VERSION) {
    const legacyExcludedActivities = uniqueStrings_(settings.excludedActivities || []);
    const excludedActivityKeys = legacyExcludedActivities.map(normalizeTitle_);
    const requiresImplicitActivityMigration = settings.includeActivities !== false;
    const needsSelectionReview = Boolean(settings.pendingTermKey) ||
      (requiresImplicitActivityMigration && !legacyCatalog.reliable);
    const selectedTitles = needsSelectionReview
      ? []
      : uniqueStrings_(settings.selectedCourses || []);
    if (requiresImplicitActivityMigration && !needsSelectionReview) {
      legacyCatalog.items.forEach(item => {
        if (item.type === 'activity' &&
            excludedActivityKeys.indexOf(normalizeTitle_(item.title)) === -1) {
          selectedTitles.push(item.title);
        }
      });
    }
    settings.selectedTitles = uniqueStrings_(selectedTitles);
    settings.excludedTitles = uniqueStrings_([].concat(
      settings.excludedTitles || [],
      legacyExcludedActivities
    ));
    settings.knownTitles = uniqueStrings_(
      settings.knownTitles && settings.knownTitles.length
        ? settings.knownTitles
        : settings.selectedTitles
    );
    if (needsSelectionReview && settings.setupComplete && settings.termKey) {
      if (typeof settings.autoSyncEnabledBeforeTermTransition !== 'boolean') {
        settings.autoSyncEnabledBeforeTermTransition = Boolean(settings.autoSyncEnabled);
      }
      settings.pendingTermKey = settings.pendingTermKey || settings.termKey;
      settings.pendingTitles = [];
      settings.autoSyncEnabled = false;
      settings.pausedReason = '版本更新後，請重新選擇課程與活動。';
    }
  } else {
    settings.selectedTitles = uniqueStrings_(settings.selectedTitles || []);
    settings.knownTitles = uniqueStrings_(settings.knownTitles || []);
  }
  settings.pendingTitles = uniqueStrings_(settings.pendingTitles || [])
    .filter(title => !isCourseSelectionHidden_(title));
  settings.excludedTitles = uniqueStrings_(settings.excludedTitles || []);
  delete settings.selectedCourses;
  delete settings.includeActivities;
  delete settings.excludedActivities;
  if (settings.pendingTermKey &&
      typeof settings.autoSyncEnabledBeforeTermTransition !== 'boolean') {
    settings.autoSyncEnabledBeforeTermTransition = true;
  }
  settings.termTransitionNoticeAttempts =
    Math.max(0, Number(settings.termTransitionNoticeAttempts) || 0);
  settings.termTransitionNoticeScheduledFor =
    String(settings.termTransitionNoticeScheduledFor || '');
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

function loadLegacyClassifiedCatalogItems_(settings) {
  const storeKeys = [SOURCE_UI_CACHE_STORE, SETUP_SOURCE_CONTEXT_STORE];
  const acceptedTerms = uniqueStrings_([
    settings && settings.pendingTermKey,
    settings && settings.termKey
  ].map(normalizeTermKey_));
  for (let index = 0; index < storeKeys.length; index += 1) {
    const snapshot = readChunkedJson_(storeKeys[index], null);
    if (!snapshot || !snapshot.catalog ||
        String(snapshot.gradeName || '') !== String(settings && settings.gradeName || '') ||
        (acceptedTerms.length &&
          acceptedTerms.indexOf(normalizeTermKey_(snapshot.termKey)) === -1)) {
      continue;
    }
    const items = snapshot && snapshot.catalog && snapshot.catalog.all;
    if (!Array.isArray(items)) continue;
    const classified = items.filter(item =>
      item && item.title && ['course', 'activity'].indexOf(item.type) !== -1
    );
    if (classified.length === items.length && classified.length) {
      return { items: classified, reliable: true };
    }
  }
  return { items: [], reliable: false };
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
  const updates = {};
  chunks.forEach((chunk, index) => { updates[key + '_' + index] = chunk; });
  updates[key + '_COUNT'] = String(chunks.length);
  if (typeof properties.getProperties === 'function') {
    const existing = properties.getProperties();
    let estimatedBytes = 0;
    Object.keys(existing).forEach(propertyKey => {
      if (propertyKey === key + '_COUNT') return;
      if (propertyKey.indexOf(key + '_') === 0 &&
          /^\\d+$/.test(propertyKey.slice(key.length + 1))) {
        const chunkIndex = Number(propertyKey.slice(key.length + 1));
        if (chunkIndex < chunks.length) return;
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
  // Do not delete stale higher-numbered chunks here. A smaller concurrent writer
  // could otherwise delete chunks that a newer, larger writer has just committed.
  // COUNT is the commit pointer, so ignored tail chunks are harmless and bounded
  // by the largest value ever stored under this key.
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
  const existing = typeof properties.getProperties === 'function'
    ? properties.getProperties()
    : null;
  if (existing) {
    Object.keys(existing).forEach(propertyKey => {
      if (propertyKey.indexOf(key + '_') === 0 &&
          /^\\d+$/.test(propertyKey.slice(key.length + 1))) {
        properties.deleteProperty(propertyKey);
      }
    });
  } else {
    const count = Number(properties.getProperty(key + '_COUNT')) || 0;
    for (let index = 0; index < count; index += 1) properties.deleteProperty(key + '_' + index);
  }
  properties.deleteProperty(key + '_COUNT');
  if (key === SYNC_STATE_STORE) properties.deleteProperty('SYNC_STATE');
}

function setupAutoSyncTriggers() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('背景同步正在保存行程，請稍後再試。');
  let automationWarning = '';
  try {
    const settings = loadSettings_();
    assertSetupImported_(settings);
    if (settings.pendingTermKey || loadSourceObservation_().termCandidate) {
      throw new Error('已偵測到新學期，請先在控制臺重新選擇課程與活動，再啟用自動同步。');
    }
    settings.autoSyncEnabled = true;
    saveSettings_(settings);
    try {
      refreshAutoSyncTriggers_(settings);
    } catch (triggerError) {
      automationWarning = '設定已啟用，但自動同步觸發器暫時無法完全更新。';
      Logger.log('啟用自動同步後無法更新觸發器：' + userFacingError_(triggerError));
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true, warning: automationWarning };
}

function refreshAutoSyncTriggers_(settings) {
  deleteDailySyncTriggers_();
  if (!settings.autoSyncEnabled || settings.pendingTermKey ||
      loadSourceObservation_().termCandidate) {
    deleteCourseOutlineMaintenanceTriggers_();
    return;
  }
  SCHEDULE_SYNC_HOURS.forEach(hour => {
    const triggerTime = getScheduleSyncTriggerTime_(hour);
    ScriptApp.newTrigger('syncMyScheduleToCalendar')
      .timeBased()
      .atHour(triggerTime.hour)
      .nearMinute(triggerTime.minute)
      .everyDays(1)
      .inTimezone(TIMEZONE)
      .create();
  });
  const notificationHours = getEffectiveNotificationHours_(settings);
  const dailySummaryHour = getDailySummaryHour_(settings);
  notificationHours.forEach(hour => {
    const handler = hour === dailySummaryHour
      ? FINAL_NOTIFICATION_HANDLER
      : NOTIFICATION_HANDLER;
    ScriptApp.newTrigger(handler)
      .timeBased()
      .atHour(hour)
      .nearMinute(0)
      .everyDays(1)
      .inTimezone(TIMEZONE)
      .create();
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

function getScheduleSyncTriggerTime_(anchorHour) {
  const cleanAnchorHour = normalizeHour_(anchorHour, 0);
  const centerOffsetLimit = Math.max(
    0,
    SCHEDULE_SYNC_WINDOW_HALF_MINUTES - TIME_TRIGGER_NEAR_MINUTE_TOLERANCE
  );
  const offsetSlotCount = centerOffsetLimit * 2 + 1;
  const seed = ScriptApp.getScriptId() + '|schedule-sync|' + cleanAnchorHour;
  const offsetMinutes = parseInt(hashText_(seed), 36) % offsetSlotCount - centerOffsetLimit;
  const minutesInDay = 24 * 60;
  const triggerMinuteOfDay = (
    cleanAnchorHour * 60 + offsetMinutes + minutesInDay
  ) % minutesInDay;
  return {
    hour: Math.floor(triggerMinuteOfDay / 60),
    minute: triggerMinuteOfDay % 60
  };
}

function getEffectiveNotificationHours_(settings) {
  if (!settings || settings.instantNotificationsEnabled !== false) {
    return [INSTANT_NOTIFICATION_SUMMARY_HOUR];
  }
  return normalizeHourArray_(
    settings.notificationHours || settings.autoSyncHours,
    settings.notifySyncHour
  );
}

function getDailySummaryHour_(settings) {
  const hours = getEffectiveNotificationHours_(settings);
  return settings && settings.instantNotificationsEnabled === false
    ? Math.max.apply(null, hours)
    : INSTANT_NOTIFICATION_SUMMARY_HOUR;
}

function getCourseOutlineDailyRefreshHour_(settings) {
  const earliest = Math.min.apply(null, SCHEDULE_SYNC_HOURS);
  return (earliest + 22) % 24;
}

function deleteDailySyncTriggers_() {
  deleteTriggersByHandlers_([
    'syncMyScheduleToCalendar',
    'syncMyScheduleAtNotificationTime',
    'syncMyScheduleToCalendarWithNotification',
    NOTIFICATION_HANDLER,
    FINAL_NOTIFICATION_HANDLER,
    COURSE_OUTLINE_DAILY_HANDLER
  ]);
}

function deleteCourseOutlineMaintenanceTriggers_() {
  deleteTriggersByHandlers_([
    COURSE_OUTLINE_ONCE_HANDLER,
    COURSE_OUTLINE_MANUAL_ONCE_HANDLER,
    COURSE_OUTLINE_RETRY_HANDLER,
    COURSE_OUTLINE_WATCHDOG_HANDLER,
    COURSE_OUTLINE_APPLY_HANDLER
  ]);
  const state = loadCourseOutlineState_();
  if (state.status === 'queued' ||
      state.status === 'running' ||
      state.status === 'retry_pending') {
    saveCourseOutlineState_(Object.assign({}, state, {
      status: 'idle',
      attempt: 0,
      incidentId: '',
      runId: '',
      scheduledAt: '',
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

function resetSyncWatchdogTrigger_() {
  deleteTriggersByHandlers_([SYNC_WATCHDOG_HANDLER]);
  ensureOneTimeTrigger_(SYNC_WATCHDOG_HANDLER, SYNC_WATCHDOG_DELAY_MS);
}

function deleteAutoSyncTriggers() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('背景同步正在保存行程，請稍後再試。');
  try {
    assertSetupImported_(loadSettings_());
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
  let automationWarning = '';
  try {
    settings = loadSettings_();
    assertSetupImported_(settings);
    if (!settings.autoSyncEnabled &&
        (settings.pendingTermKey || loadSourceObservation_().termCandidate)) {
      throw new Error('已偵測到新學期，請先在控制臺重新選擇課程與活動，再啟用自動同步。');
    }
    settings.autoSyncEnabled = !settings.autoSyncEnabled;
    settings.pausedReason = settings.autoSyncEnabled ? '' : '由使用者關閉。';
    saveSettings_(settings);
    try {
      refreshAutoSyncTriggers_(settings);
    } catch (triggerError) {
      automationWarning = '設定已儲存，但自動同步觸發器暫時無法完全更新。';
      Logger.log('切換自動同步後無法更新觸發器：' + userFacingError_(triggerError));
    }
  } finally {
    lock.releaseLock();
  }
  getControlPanelUi_().alert(
    (settings.autoSyncEnabled ? '已啟用自動同步。' : '已關閉自動同步。') +
    (automationWarning ? '\\n\\n' + automationWarning : '')
  );
}

function showSyncStatus() {
  const settings = loadSettings_();
  assertSetupImported_(settings);
  const status = loadStatus_();
  const outline = buildCourseOutlineUiStatus_(settings);
  const outlineMessage = outline.enabled
    ? '\\n\\n課綱資料：' + describeCourseOutlineStatusForUser_(outline) +
      '\\n最近完成課綱更新：' + (outline.lastSuccessLabel || '尚未完成第一次更新') +
      (outline.missingSheetNames.length
        ? '\\n找不到可匹配名稱的課綱分頁：' + outline.missingSheetNames.join('、')
        : '') +
      (outline.nearMatchSheetNames.length
        ? '\\n可能仍有其他名稱差異：' + outline.nearMatchSheetNames
          .map(item => item.courseName + ' → ' + item.candidates.join('／')).join('、')
        : '') +
      (outline.lastError ? '\\n未完成的原因：' + outline.lastError : '')
    : '';
  getControlPanelUi_().alert(
    'T-SCHOOL 行程同步',
    (status.message || '尚未同步') + '\\n\\n上次執行：' + (status.lastSyncLabel || '尚無紀錄') + outlineMessage,
    getControlPanelUi_().ButtonSet.OK
  );
}

function previewParsedEvents() {
  const settings = loadSettings_();
  assertSetupImported_(settings);
  const source = loadSourceContext_(settings.gradeName);
  const events = source.events.filter(item => shouldIncludeEvent_(item, settings));
  Logger.log(JSON.stringify(events.slice(0, 50), null, 2));
  Logger.log('共解析 ' + events.length + ' 筆個人事件。');
}

function confirmQuickDeleteSyncedEvents() {
  const ui = getControlPanelUi_();
  const response = ui.alert('移除受管理事件', '只會刪除本工具建立且仍可辨識的事件。是否繼續？', ui.ButtonSet.YES_NO);
  if (response === ui.Button.YES) {
    const count = quickDeleteSyncedCalendarEvents();
    ui.alert('已移除 ' + count + ' 筆事件。');
  }
}

function quickDeleteSyncedCalendarEvents() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('背景同步正在保存行程，請稍後再移除事件。');
  }
  try {
    if (isActiveSyncJob_(loadSyncJob_())) {
      throw new Error('同步仍在背景執行，請等待完成後再移除事件。');
    }
    const settings = loadSettings_();
    assertSetupImported_(settings);
    return settings.calendarId
      ? removeManagedEventsFromCalendar_(settings.calendarId, true)
      : 0;
  } finally {
    lock.releaseLock();
  }
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
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('背景同步正在保存行程，請稍後再重設狀態。');
  }
  try {
    assertSetupImported_(loadSettings_());
    if (isActiveSyncJob_(loadSyncJob_())) {
      throw new Error('同步仍在背景執行，請等待完成後再重設狀態。');
    }
    clearChunkedStore_(SYNC_STATE_STORE);
    clearChunkedStore_(STATUS_STORE);
  } finally {
    lock.releaseLock();
  }
}

function sendScheduledNotifications() {
  return requestScheduledNotificationDelivery_(false);
}

function sendScheduledNotificationsWithDailySummary() {
  return requestScheduledNotificationDelivery_(true);
}

function retryScheduledNotificationDelivery() {
  deleteTriggersByHandlers_([NOTIFICATION_DELIVERY_RETRY_HANDLER]);
  return processScheduledNotificationDelivery_();
}

function requestScheduledNotificationDelivery_(includeDailySummary) {
  assertSetupImported_(loadSettings_());
  const properties = PropertiesService.getScriptProperties();
  const previous = loadScheduledNotificationDeliveryRequest_();
  properties.setProperty(NOTIFICATION_DELIVERY_REQUEST_STORE, JSON.stringify({
    requestedAt: new Date().toISOString(),
    includeDailySummary: Boolean(
      includeDailySummary || previous && previous.includeDailySummary
    )
  }));
  return processScheduledNotificationDelivery_();
}

function loadScheduledNotificationDeliveryRequest_() {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(NOTIFICATION_DELIVERY_REQUEST_STORE);
  if (!raw) return null;
  try {
    const request = JSON.parse(raw);
    return {
      requestedAt: String(request.requestedAt || ''),
      includeDailySummary: Boolean(request.includeDailySummary)
    };
  } catch (error) {
    return { requestedAt: '', includeDailySummary: false };
  }
}

function scheduleRequestedNotificationDeliveryRetry_() {
  if (!loadScheduledNotificationDeliveryRequest_()) return false;
  return ensureOneTimeTrigger_(
    NOTIFICATION_DELIVERY_RETRY_HANDLER,
    SYNC_CONTINUATION_DELAY_MS
  );
}

function processScheduledNotificationDelivery_() {
  const request = loadScheduledNotificationDeliveryRequest_();
  if (!request) return { ok: true, skipped: true };
  if (isActiveSyncJob_(loadSyncJob_())) {
    scheduleRequestedNotificationDeliveryRetry_();
    return { ok: true, deferred: true };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    scheduleRequestedNotificationDeliveryRetry_();
    return { ok: true, deferred: true };
  }

  try {
    if (isActiveSyncJob_(loadSyncJob_())) {
      scheduleRequestedNotificationDeliveryRetry_();
      return { ok: true, deferred: true };
    }
    const settings = loadSettings_();
    const changeNotificationSent = deliverScheduleChangeNotification_(
      settings,
      null
    );
    const queuedNotificationCount = flushQueuedNotificationsSafe_(settings);
    const successSummarySent = request.includeDailySummary &&
      !changeNotificationSent &&
      !hasChangeNotificationToday_()
      ? sendLatestSyncSuccessSummaryIfNeeded_(settings)
      : false;

    PropertiesService.getScriptProperties()
      .deleteProperty(NOTIFICATION_DELIVERY_REQUEST_STORE);
    deleteTriggersByHandlers_([NOTIFICATION_DELIVERY_RETRY_HANDLER]);
    return {
      ok: true,
      changeNotificationSent,
      queuedNotificationCount,
      successSummarySent
    };
  } catch (error) {
    Logger.log('排程通知寄送失敗，稍後自動重試：' + error.message);
    scheduleRequestedNotificationDeliveryRetry_();
    return { ok: false, deferred: true, message: userFacingError_(error) };
  } finally {
    lock.releaseLock();
  }
}

function sendLatestSyncSuccessSummaryIfNeeded_(settings) {
  const dateKey = formatDateKey_(new Date());
  const queueState = loadNotificationQueueState_();
  if (queueState.lastSuccessSummaryDate === dateKey) return false;
  const status = loadStatus_();
  if (!status || status.ok !== true || !status.lastSync) return false;

  sendEmail_(
    settings,
    'sync_success',
    '行程同步狀態正常',
    formatSyncResultMessage_(status),
    buildSyncEmailData_(status)
  );
  queueState.lastSuccessSummaryDate = dateKey;
  saveNotificationQueueState_(queueState);
  return true;
}

function sendSyncNotificationsSafe_(settings, result, options) {
  try {
    if (options.reason === 'source' && result.changes.length > 0) {
      queueScheduleChangeNotification_(buildChangeEmailData_(result));
      if (settings.instantNotificationsEnabled !== false) {
        try {
          deliverScheduleChangeNotification_(settings, null);
        } catch (deliveryError) {
          Logger.log('即時調課通知寄送失敗，已保留並安排重試：' + deliveryError.message);
          requestScheduledNotificationDelivery_(false);
        }
      }
    }
  } catch (error) {
    Logger.log('同步異動摘要保存失敗：' + error.message);
  }
}

function sendFirstSetupNotificationSafe_(result) {
  try {
    sendEmail_(
      loadSettings_(),
      'setup_complete',
      '行程同步設定完成',
      '第一批事件同步完成！如果行程較多，系統會在背景分批繼續同步\\n' +
        '後續則會根據你的設定自動更新事件',
      buildSyncEmailData_(result)
    );
    return true;
  } catch (error) {
    Logger.log('行程同步設定完成通知寄送失敗：' + error.message);
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
  const hours = getEffectiveNotificationHours_(settings);
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
    lastChangeDate: String(stored.lastChangeDate || ''),
    lastSuccessSummaryDate: String(stored.lastSuccessSummaryDate || '')
  };
}

function saveNotificationQueueState_(state) {
  writeChunkedJson_(NOTIFICATION_QUEUE_STORE, {
    schemaVersion: 1,
    pending: Array.isArray(state.pending) ? state.pending.slice(0, 50) : [],
    pendingChangeData: state.pendingChangeData || null,
    lastChangeDate: String(state.lastChangeDate || ''),
    lastSuccessSummaryDate: String(state.lastSuccessSummaryDate || '')
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
      '有 ' + changeData.changeCount + ' 項行程調整',
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
  lines.push('', changeData.summary, '', COURSE_OUTLINE_DISCLAIMER);
  return lines.join('\\n');
}

function sendEmail_(settings, templateKind, subject, body, templateData) {
  const recipient = getNotificationEmail_(settings);
  const formattedSubject = formatNotificationSubject_(subject);
  const baseData = buildEmailBaseData_();
  const cleanTemplateData = sanitizeNotificationTemplateData_(
    Object.assign({}, baseData, templateData || {})
  );
  cleanTemplateData.controlPanelName = baseData.controlPanelName;
  const plainBody = stripNotificationSentencePeriods_(body || '');
  const plainFooter = cleanTemplateData.controlPanelName;
  const message = {
    to: recipient,
    subject: formattedSubject,
    body: plainBody ? plainBody + '\\n\\n' + plainFooter : plainFooter,
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
    controlUrl: getControlPanelUrl_(),
    controlPanelName: getControlPanelName_(),
    calendarUrl: 'https://calendar.google.com/calendar/u/0/r'
  };
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
    values.omittedNoteDisplay = values.omittedNote ? 'block' : 'none';
    const rawSections = buildEmailRepeaterSections_(notification.repeaters, values);

    const content = renderEmailHtmlTemplate_(
      notification.content,
      values,
      rawSections
    );
    const lede = renderEmailTextTemplate_(notification.lede, values);
    const shellValues = Object.assign({}, values, {
      subject,
      preheader: renderEmailTextTemplate_(notification.preheader, values),
      statusLabel: renderEmailTextTemplate_(notification.statusLabel, values),
      headline: renderEmailTextTemplate_(notification.headline, values),
      lede,
      ledeDisplay: lede ? 'block' : 'none',
      accent: normalizeEmailTemplateColor_(notification.accent, '#00a676'),
      accentDark: normalizeEmailTemplateColor_(notification.accentDark, '#007c59'),
      accentSoft: normalizeEmailTemplateColor_(notification.accentSoft, '#dcefe7')
    });
    return sanitizeEmailHtmlLinks_(
      renderEmailHtmlTemplate_(manifest.shell, shellValues, { content })
    );
  } catch (error) {
    Logger.log('HTML 信件版型無法套用，改寄純文字：' + error.message);
    return '';
  }
}

function buildEmailRepeaterSections_(repeaters, values) {
  const rawSections = {};
  Object.keys(repeaters || {}).forEach(outputKey => {
    const repeater = repeaters[outputKey] || {};
    const items = Array.isArray(values[repeater.source])
      ? values[repeater.source].slice(0, SYNC_CHANGE_DETAIL_LIMIT)
      : [];
    rawSections[outputKey] = items
      .map(item => renderEmailHtmlTemplate_(
        repeater.template,
        item,
        buildEmailRepeaterSections_(repeater.repeaters, item)
      ))
      .join('');
  });
  return rawSections;
}

function loadEmailTemplateManifest_() {
  if (emailTemplateManifestRuntimeCache_) {
    return emailTemplateManifestRuntimeCache_;
  }
  if (emailTemplateManifestRuntimeLoadAttempted_) return null;
  emailTemplateManifestRuntimeLoadAttempted_ = true;
  let cache = null;
  try {
    cache = CacheService.getScriptCache();
    const cached = cache.get(EMAIL_TEMPLATE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      assertEmailTemplateManifest_(parsed);
      emailTemplateManifestRuntimeCache_ = parsed;
      return emailTemplateManifestRuntimeCache_;
    }
  } catch (cacheError) {
    Logger.log('HTML 信件版型快取無法讀取：' + cacheError.message);
  }

  let fetchError = null;
  for (let attempt = 1; attempt <= EMAIL_TEMPLATE_FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = UrlFetchApp.fetch(EMAIL_TEMPLATE_MANIFEST_URL, {
        followRedirects: true,
        muteHttpExceptions: true
      });
      const responseCode = response.getResponseCode();
      if (responseCode !== 200) {
        const httpError = new Error('HTTP ' + responseCode);
        httpError.httpStatus = responseCode;
        throw httpError;
      }
      const text = response.getContentText('UTF-8');
      assertEmailTemplateManifestTextSize_(text);
      const manifest = JSON.parse(text);
      assertEmailTemplateManifest_(manifest);
      if (cache) {
        try {
          cache.put(EMAIL_TEMPLATE_CACHE_KEY, text, EMAIL_TEMPLATE_CACHE_SECONDS);
        } catch (cacheWriteError) {
          Logger.log('HTML 信件版型快取無法寫入：' + cacheWriteError.message);
        }
      }
      emailTemplateManifestRuntimeCache_ = manifest;
      return emailTemplateManifestRuntimeCache_;
    } catch (error) {
      fetchError = error;
      const responseCode = Number(error && error.httpStatus) || 0;
      const retryable = !responseCode || responseCode === 302 || responseCode === 404 ||
        responseCode === 408 || responseCode === 425 || responseCode === 429 || responseCode >= 500;
      if (!retryable || attempt === EMAIL_TEMPLATE_FETCH_MAX_ATTEMPTS) break;
      Utilities.sleep(EMAIL_TEMPLATE_FETCH_RETRY_DELAY_MS * attempt);
    }
  }
  Logger.log('HTML 信件版型無法下載：' + (fetchError && fetchError.message || '未知錯誤'));
  return null;
}

function assertEmailTemplateManifestTextSize_(text) {
  if (!text || utf8ByteLength_(text) > EMAIL_TEMPLATE_MAX_BYTES) {
    throw new Error('版型檔案為空或超過大小限制');
  }
  return text;
}

function resetEmailTemplateManifestRuntimeCache_() {
  emailTemplateManifestRuntimeCache_ = null;
  emailTemplateManifestRuntimeLoadAttempted_ = false;
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
    assertEmailTemplateRepeaters_(notification.repeaters, key);
  });
}

function assertEmailTemplateRepeaters_(repeaters, path) {
  Object.keys(repeaters || {}).forEach(outputKey => {
    const repeater = repeaters[outputKey];
    if (!repeater || typeof repeater.source !== 'string' ||
        typeof repeater.template !== 'string') {
      throw new Error('HTML 信件重複區塊無效：' + path + '/' + outputKey);
    }
    assertEmailTemplateRepeaters_(
      repeater.repeaters,
      path + '/' + outputKey
    );
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

function decodeEmailHtmlAttribute_(value) {
  return String(value == null ? '' : value)
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/gi, '&')
    .replace(/&#x0*26;/gi, '&');
}

function isAllowedEmailLink_(value) {
  const href = decodeEmailHtmlAttribute_(value).trim();
  const match = href.match(
    /^https:\\/\\/([^\\/?#:]+)(?::443)?(\\/[^?#]*)?(?:[?#]|$)/i
  );
  if (!match) return false;
  const host = String(match[1]).toLowerCase();
  const path = String(match[2] || '/');
  if (EMAIL_LINK_ALLOWED_HOSTS.indexOf(host) === -1) return false;
  if (host === 'calendar.google.com') return /^\\/calendar(?:\\/|$)/.test(path);
  if (host === 'docs.google.com') return /^\\/document(?:\\/|$)/.test(path);
  return false;
}

function sanitizeEmailHtmlLinks_(html) {
  const safeAnchors = [];
  const original = String(html || '');
  let tokenPrefix = 'TSCHOOL_SAFE_EMAIL_LINK_';
  while (original.indexOf(tokenPrefix) !== -1) tokenPrefix = '_' + tokenPrefix;
  let sanitized = original.replace(
    /<a\\b([^>]*)>([\\s\\S]*?)<\\/a\\s*>/gi,
    (match, attributes, content) => {
      const hrefMatch = String(attributes || '').match(
        /(?:^|\\s)href\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))/i
      );
      const href = hrefMatch && (hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || '');
      if (!isAllowedEmailLink_(href)) {
        return String(content || '').replace(/<[^>]*>/g, '');
      }
      const styleMatch = String(attributes || '').match(
        /(?:^|\\s)style\\s*=\\s*(?:"([^"]*)"|'([^']*)')/i
      );
      const style = styleMatch && (styleMatch[1] || styleMatch[2] || '');
      const safeContent = String(content || '').replace(/<\\/?a\\b[^>]*>/gi, '');
      const anchor = '<a href="' + escapeEmailHtml_(decodeEmailHtmlAttribute_(href)) + '"' +
        (style ? ' style="' + escapeEmailHtml_(style) + '"' : '') +
        ' rel="noopener noreferrer">' + safeContent + '</a>';
      const token = tokenPrefix + safeAnchors.length + '_END';
      safeAnchors.push({ token, anchor });
      return token;
    }
  );
  sanitized = sanitized.replace(/<\\/?a\\b[^>]*>/gi, '');
  safeAnchors.forEach(item => {
    sanitized = sanitized.split(item.token).join(item.anchor);
  });
  return sanitized;
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

function isCourseSelectionHidden_(value) {
  return normalizeTitle_(value) === normalizeTitle_(NATURAL_ADVANCED_BASE_TITLE);
}

function isNaturalAdvancedVariantTitle_(value) {
  return NATURAL_ADVANCED_VARIANT_TITLES.map(normalizeTitle_).indexOf(normalizeTitle_(value)) !== -1;
}

function applyCourseSelectionRules_(selectedTitles, catalogItems) {
  const selectedKeys = uniqueStrings_(selectedTitles || []).map(normalizeTitle_);
  const baseKey = normalizeTitle_(NATURAL_ADVANCED_BASE_TITLE);
  const variantSelected = selectedKeys.some(key =>
    NATURAL_ADVANCED_VARIANT_TITLES.map(normalizeTitle_).indexOf(key) !== -1
  );
  const effectiveKeys = selectedKeys.filter(key => key !== baseKey);
  if (variantSelected) effectiveKeys.push(baseKey);
  return (catalogItems || [])
    .map(item => typeof item === 'string' ? item : item && item.title)
    .filter(title => title && effectiveKeys.indexOf(normalizeTitle_(title)) !== -1);
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
