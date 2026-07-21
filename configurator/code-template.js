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

  window.buildAppsScriptCode = function buildAppsScriptCode(settings) {
    const notifyHour = normalizeHour(settings.notifySyncHour, 5);
    const initialSettings = {
      schemaVersion: 2,
      appVersion: settings.appVersion || '2.0.0-mvp',
      setupComplete: false,
      gradeName: settings.gradeName || '高一',
      calendarId: '',
      calendarName: settings.calendarName || 'T-SCHOOL 課表',
      notificationEmail: settings.notificationEmail || '',
      selectedCourses: settings.selectedCourses || [],
      includeActivities: settings.includeActivities !== false,
      autoSyncEnabled: true,
      autoSyncHours: normalizeHourArray(settings.autoSyncHours, notifyHour),
      notifySyncHour: notifyHour,
      notificationPreset: settings.notificationPreset || 'standard',
      customNotification: settings.customNotification || '',
      descriptionPreset: settings.descriptionPreset || 'standard',
      customDescription: settings.customDescription || '',
      reminderMode: settings.reminderMode || 'none',
      reminderMinutes: Number(settings.reminderMinutes) || 10,
      knownTitles: settings.initialKnownTitles || [],
      pendingTitles: [],
      excludedTitles: [],
      termKey: settings.initialTermKey || '',
      sourceFingerprint: settings.initialSourceFingerprint || '',
      pendingTermKey: '',
      pausedReason: '',
      calendarMigrationFromId: ''
    };
    const sidebarHtml = window.TSCHOOL_SIDEBAR_HTML || '';

    return `const APP_VERSION = ${formatString(settings.appVersion || '2.0.0-mvp')};
const SETTINGS_SCHEMA_VERSION = 2;
const TIMEZONE = 'Asia/Taipei';
const SOURCE_API_URL = ${formatString(settings.sourceApiUrl)};
const SETTINGS_STORE = 'TSCHOOL_SETTINGS';
const SYNC_STATE_STORE = 'TSCHOOL_SYNC_STATE';
const STATUS_STORE = 'TSCHOOL_STATUS';
const NOTICE_STORE = 'TSCHOOL_NOTICE_STATE';
const MANAGED_MARKER = '[T-SCHOOL-SCHEDULE-SYNC]';
const DESCRIPTION_MARKER = '[T-SCHOOL 行程同步]';
const LEGACY_DESCRIPTION_MARKER = '[T-SCHOOL 課表同步]';
const ALLOW_QUICK_DELETE_ALL = false;
const DEFAULT_SETTINGS = ${formatObject(initialSettings)};
const SETTINGS_SIDEBAR_HTML = ${formatLongString(sidebarHtml)};
const GRADE_API_NAMES = { '高一': '一年級', '高二': '二年級', '高三': '三年級' };
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const MANUAL_MERGE_EXCEPTIONS = {};
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
  SpreadsheetApp.getUi()
    .createMenu('行程同步')
    .addItem('開啟設定', 'showSettingsSidebar')
    .addSeparator()
    .addItem('立即同步', 'syncMyScheduleToCalendar')
    .addItem('暫停／恢復自動同步', 'toggleAutoSyncFromMenu')
    .addItem('查看同步狀態', 'showSyncStatus')
    .addItem('強制修復', 'forceFullSyncMyScheduleToCalendar')
    .addSeparator()
    .addItem('移除受管理事件', 'confirmQuickDeleteSyncedEvents')
    .addToUi();
}

function showSettingsSidebar() {
  const output = HtmlService.createHtmlOutput(SETTINGS_SIDEBAR_HTML)
    .setTitle('T-SCHOOL 行程同步');
  SpreadsheetApp.getUi().showSidebar(output);
}

function getSettingsUiData() {
  let settings = loadSettings_();
  const source = loadSourceContext_(settings.gradeName);
  settings = applyTermTransitionIfNeeded_(settings, source, true);

  return buildUiData_(settings, source);
}

function getSourceCatalogForUi(gradeName) {
  const cleanGrade = sanitizeGrade_(gradeName);
  return buildSourceUiModel_(loadSourceContext_(cleanGrade), cleanGrade);
}

function saveSettingsFromUi(input) {
  const result = saveSettingsCore_(input);
  return {
    message: '設定已儲存',
    uiData: buildUiData_(result.settings, result.source)
  };
}

function previewSettingsImpactFromUi(input) {
  const previous = loadSettings_();
  const source = loadSourceContext_(sanitizeGrade_(input && input.gradeName));
  const next = sanitizeSettingsInput_(input, previous, source);
  const todayKey = formatDateKey_(new Date());
  const oldState = loadSyncState_();
  const desiredEvents = source.events
    .filter(event => event.dateKey >= todayKey)
    .filter(event => shouldIncludeEvent_(event, next));
  const calendarChanged = Boolean(previous.calendarId && next.calendarId && previous.calendarId !== next.calendarId);

  if (calendarChanged) {
    return {
      calendarChanged: true,
      created: desiredEvents.length,
      updated: 0,
      deleted: Object.keys(oldState).filter(key => oldState[key].dateKey >= todayKey).length,
      unchanged: 0
    };
  }

  const plan = buildSyncPlan_(oldState, desiredEvents, todayKey);
  const changedExact = plan.exact.filter(pair => pair.oldItem.syncSignature !== makeEventSignature_(pair.newItem, next)).length;
  return {
    calendarChanged: false,
    created: plan.additions.length,
    updated: plan.moved.length + changedExact,
    deleted: plan.deletions.length,
    unchanged: plan.exact.length - changedExact
  };
}

function saveSettingsAndSyncFromUi(input) {
  const before = loadSettings_();
  const result = saveSettingsCore_(input);
  const firstSetup = !before.setupComplete;
  let syncResult;

  try {
    syncResult = syncSchedule_({
      reason: firstSetup ? 'setup' : 'settings',
      forceCalendarCheck: true,
      notifyOnSuccess: false
    });
  } catch (error) {
    notifySyncFailureUnlessActionRequired_(error);
    throw error;
  }

  try {
    refreshAutoSyncTriggers_(loadSettings_());
  } catch (error) {
    notifySyncFailureUnlessActionRequired_(error);
    throw error;
  }

  if (firstSetup) {
    sendFirstSetupNotificationSafe_(syncResult);
  }

  return {
    message: firstSetup ? '第一次同步完成，請檢查專用日曆' : '設定已儲存並同步',
    uiData: getSettingsUiData()
  };
}

function runSyncFromUi() {
  try {
    const result = syncSchedule_({ reason: 'manual' });
    return { message: formatSyncResultMessage_(result), uiData: getSettingsUiData() };
  } catch (error) {
    notifySyncFailureUnlessActionRequired_(error);
    throw error;
  }
}

function forceRepairFromUi() {
  try {
    const result = syncSchedule_({ reason: 'repair', forceCalendarCheck: true });
    return { message: '修復完成：' + formatSyncResultMessage_(result), uiData: getSettingsUiData() };
  } catch (error) {
    notifySyncFailureUnlessActionRequired_(error);
    throw error;
  }
}

function createDedicatedCalendarForUi() {
  const settings = loadSettings_();
  const calendar = CalendarApp.createCalendar(buildDedicatedCalendarName_(settings));
  return {
    message: '已建立專用日曆',
    calendarId: calendar.getId(),
    calendars: listOwnedCalendars_()
  };
}

function confirmPendingTitleFromUi(title) {
  const settings = loadSettings_();
  const normalized = normalizeTitle_(title);
  settings.pendingTitles = settings.pendingTitles.filter(item => normalizeTitle_(item) !== normalized);

  if (!settings.selectedCourses.some(item => normalizeTitle_(item) === normalized)) {
    settings.selectedCourses.push(String(title));
  }

  settings.excludedTitles = settings.excludedTitles.filter(item => normalizeTitle_(item) !== normalized);
  saveSettings_(settings);
  return { message: '已保留「' + title + '」', uiData: getSettingsUiData() };
}

function rejectPendingTitleFromUi(title) {
  const settings = loadSettings_();
  const normalized = normalizeTitle_(title);
  settings.pendingTitles = settings.pendingTitles.filter(item => normalizeTitle_(item) !== normalized);
  settings.selectedCourses = settings.selectedCourses.filter(item => normalizeTitle_(item) !== normalized);

  if (!settings.excludedTitles.some(item => normalizeTitle_(item) === normalized)) {
    settings.excludedTitles.push(String(title));
  }

  saveSettings_(settings);
  return { message: '已排除「' + title + '」，下次同步會移除同名活動', uiData: getSettingsUiData() };
}

function saveSettingsCore_(input) {
  const oldSettings = loadSettings_();
  const source = loadSourceContext_(sanitizeGrade_(input && input.gradeName));
  const next = sanitizeSettingsInput_(input, oldSettings, source);

  saveSettings_(next);
  if (next.setupComplete) refreshAutoSyncTriggers_(next);
  else deleteAutoSyncTriggers();
  return { settings: next, source };
}

function sanitizeSettingsInput_(input, previous, source) {
  const value = input || {};
  const gradeName = sanitizeGrade_(value.gradeName);
  const gradeChanged = previous.gradeName !== gradeName;
  const selectedCourses = uniqueStrings_(Array.isArray(value.selectedCourses) ? value.selectedCourses : []);
  const sourceTitles = source.catalog.all.map(item => item.title);
  const sourceKeys = sourceTitles.map(normalizeTitle_);
  const cleanSelected = selectedCourses.filter(title => sourceKeys.indexOf(normalizeTitle_(title)) !== -1);
  const notificationEmail = String(value.notificationEmail || '').trim();

  if (notificationEmail) {
    assertSingleEmail_(notificationEmail);
  }

  if (previous.pendingTermKey && cleanSelected.length === 0) {
    throw new Error('新學期必須重新選擇至少一門課程後才能儲存。');
  }

  const calendarId = String(value.calendarId || '').trim();

  if (calendarId) {
    assertDedicatedCalendar_(calendarId);
  }

  const notifyHour = normalizeHour_(value.notifySyncHour, 5);
  const hours = normalizeHourArray_(value.autoSyncHours, notifyHour);
  const reminderMode = ['none', 'popup', 'email'].indexOf(value.reminderMode) !== -1
    ? value.reminderMode
    : 'none';
  const descriptionPreset = ['compact', 'standard', 'detailed', 'custom'].indexOf(value.descriptionPreset) !== -1
    ? value.descriptionPreset
    : 'standard';
  const notificationPreset = ['compact', 'standard', 'detailed', 'custom'].indexOf(value.notificationPreset) !== -1
    ? value.notificationPreset
    : 'standard';

  const calendarMigrationFromId = previous.calendarId && calendarId && previous.calendarId !== calendarId
    ? previous.calendarId
    : (calendarId === previous.calendarId ? '' : previous.calendarMigrationFromId || '');

  return Object.assign({}, previous, {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    gradeName,
    selectedCourses: cleanSelected,
    includeActivities: value.includeActivities !== false,
    calendarId,
    notificationEmail,
    autoSyncEnabled: value.autoSyncEnabled !== false,
    autoSyncHours: hours,
    notifySyncHour: notifyHour,
    notificationPreset,
    customNotification: String(value.customNotification || previous.customNotification || '').slice(0, 4000),
    descriptionPreset,
    customDescription: String(value.customDescription || previous.customDescription || '').slice(0, 4000),
    reminderMode,
    reminderMinutes: sanitizeReminderMinutes_(value.reminderMinutes),
    knownTitles: sourceTitles,
    pendingTitles: gradeChanged ? [] : previous.pendingTitles.filter(title => sourceKeys.indexOf(normalizeTitle_(title)) !== -1),
    excludedTitles: gradeChanged ? [] : previous.excludedTitles,
    termKey: source.termKey,
    sourceFingerprint: source.fingerprint,
    pendingTermKey: '',
    pausedReason: '',
    calendarMigrationFromId
  });
}

function buildUiData_(settings, source) {
  return {
    appVersion: APP_VERSION,
    settings,
    source: buildSourceUiModel_(source, settings.gradeName),
    calendars: listOwnedCalendars_(),
    status: loadStatus_()
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
  return (settings.calendarName || 'T-SCHOOL 課表') + '・' + settings.gradeName;
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

function syncSchedule_(options) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(15000)) {
    throw new Error('另一個同步仍在執行，請稍後再試。');
  }

  try {
    let settings = loadSettings_();
    const source = loadSourceContext_(settings.gradeName);
    settings = applyTermTransitionIfNeeded_(settings, source, false);
    settings = registerNewTitles_(settings, source);
    const calendar = ensureDedicatedCalendar_(settings);
    const todayKey = formatDateKey_(new Date());
    const desiredEvents = source.events
      .filter(event => event.dateKey >= todayKey)
      .filter(event => shouldIncludeEvent_(event, settings));
    const oldState = loadSyncState_();
    const plan = buildSyncPlan_(oldState, desiredEvents, todayKey);

    assertSafeDeletionPlan_(plan, oldState, options && options.reason);
    const migrationFromId = settings.calendarMigrationFromId;
    const syncOptions = migrationFromId
      ? Object.assign({}, options || {}, { forceCalendarCheck: true })
      : (options || {});
    const result = applySyncPlan_(calendar, oldState, plan, settings, syncOptions);
    if (migrationFromId && migrationFromId !== calendar.getId()) {
      removeStateEventsFromCalendar_(migrationFromId, oldState);
      settings.calendarMigrationFromId = '';
    }
    writeChunkedJson_(SYNC_STATE_STORE, result.state);

    settings.setupComplete = true;
    settings.sourceFingerprint = source.fingerprint;
    settings.knownTitles = uniqueStrings_(settings.knownTitles.concat(source.catalog.all.map(item => item.title)));
    saveSettings_(settings);

    const status = {
      ok: true,
      message: formatSyncResultMessage_(result),
      lastSync: new Date().toISOString(),
      lastSyncLabel: formatDateTime_(new Date()),
      eventCount: Object.keys(result.state).length,
      created: result.created,
      updated: result.updated,
      deleted: result.deleted,
      unchanged: result.unchanged
    };
    writeChunkedJson_(STATUS_STORE, status);

    sendSyncNotificationsSafe_(settings, result, options || {});
    return Object.assign({}, result, { calendarId: calendar.getId() });
  } catch (error) {
    writeChunkedJson_(STATUS_STORE, {
      ok: false,
      message: userFacingError_(error),
      lastSync: new Date().toISOString(),
      lastSyncLabel: formatDateTime_(new Date()),
      eventCount: Object.keys(readChunkedJson_(SYNC_STATE_STORE, {})).length
    });
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function applyTermTransitionIfNeeded_(settings, source, quiet) {
  if (!settings.setupComplete || !settings.termKey || settings.termKey === source.termKey) {
    return settings;
  }

  if (settings.pendingTermKey !== source.termKey) {
    settings.selectedCourses = [];
    settings.pendingTitles = [];
    settings.pendingTermKey = source.termKey;
    settings.autoSyncEnabled = false;
    settings.pausedReason = '偵測到新學期，請重新選擇課程。';
    saveSettings_(settings);
    deleteAutoSyncTriggers();
    sendActionRequiredSafe_(settings, '新學期課表已更新', '系統已暫停自動同步並保留原有日曆事件。請開啟行程同步控制台，重新選擇本學期課程。');
  }

  if (!quiet) {
    throw new Error('[ACTION_REQUIRED] 偵測到新學期，請先開啟設定並重新選課。');
  }

  return settings;
}

function registerNewTitles_(settings, source) {
  if (!settings.setupComplete) {
    return settings;
  }

  const known = settings.knownTitles.map(normalizeTitle_);
  const excluded = settings.excludedTitles.map(normalizeTitle_);
  const pending = settings.pendingTitles.map(normalizeTitle_);
  const discovered = source.catalog.all
    .map(item => item.title)
    .filter(title => known.indexOf(normalizeTitle_(title)) === -1)
    .filter(title => excluded.indexOf(normalizeTitle_(title)) === -1);

  if (discovered.length === 0) {
    return settings;
  }

  discovered.forEach(title => {
    settings.knownTitles.push(title);
    if (pending.indexOf(normalizeTitle_(title)) === -1) {
      settings.pendingTitles.push(title);
    }
  });

  saveSettings_(settings);
  sendActionRequiredSafe_(settings, '發現新的課表項目', '下列項目已先加入日曆，請在控制台確認是否屬於你：\\n\\n' + discovered.join('\\n'));
  return settings;
}

function shouldIncludeEvent_(event, settings) {
  const normalized = normalizeTitle_(event.originalTitle);

  if (settings.excludedTitles.some(title => normalizeTitle_(title) === normalized)) {
    return false;
  }

  if (settings.pendingTitles.some(title => normalizeTitle_(title) === normalized)) {
    return true;
  }

  if (event.type === 'activity') {
    return settings.includeActivities;
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
    let best = null;
    unmatchedOld.forEach(oldItem => {
      if (usedOld[oldItem.stateKey] || normalizeTitle_(oldItem.originalTitle) !== normalizeTitle_(newItem.originalTitle)) {
        return;
      }
      const distance = Math.abs(new Date(oldItem.start).getTime() - newItem.start.getTime());
      if (distance > 21 * 24 * 60 * 60 * 1000) {
        return;
      }
      if (!best || distance < best.distance) {
        best = { oldItem, distance };
      }
    });

    if (best) {
      usedOld[best.oldItem.stateKey] = true;
      moved.push({ oldItem: best.oldItem, newItem, newKey: makeOccurrenceKey_(newItem) });
    } else {
      stillNew.push(newItem);
    }
  });

  return {
    oldPast,
    exact,
    moved,
    additions: stillNew,
    deletions: unmatchedOld.filter(item => !usedOld[item.stateKey])
  };
}

function assertSafeDeletionPlan_(plan, oldState, reason) {
  if (reason === 'settings' || reason === 'setup' || reason === 'repair') {
    return;
  }

  const oldCount = Object.keys(oldState).length;
  const deletedCount = plan.deletions.length;

  if (oldCount >= 5 && deletedCount >= 5 && deletedCount / oldCount > 0.4) {
    throw new Error('來源變動會一次移除過多事件，系統已停止同步以保護日曆。請開啟控制台檢查課表來源。');
  }
}

function applySyncPlan_(calendar, oldState, plan, settings, options) {
  const newState = Object.assign({}, plan.oldPast);
  const changes = [];
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let unchanged = 0;

  plan.exact.concat(plan.moved).forEach(pair => {
    const signature = makeEventSignature_(pair.newItem, settings);
    let calendarEventId = pair.oldItem.calendarEventId;

    if (!options.forceCalendarCheck && pair.oldItem.syncSignature === signature) {
      unchanged += 1;
    } else {
      calendarEventId = updateCalendarEvent_(calendar, calendarEventId, pair.newItem, pair.newKey, settings);
      updated += 1;
      changes.push({ type: pair.oldItem.stateKey === pair.newKey ? '更新' : '調整', oldItem: pair.oldItem, newItem: pair.newItem });
    }

    newState[pair.newKey] = serializeStateItem_(pair.newItem, calendarEventId, signature);
  });

  plan.additions.forEach(item => {
    const key = makeOccurrenceKey_(item);
    const signature = makeEventSignature_(item, settings);
    const event = createCalendarEvent_(calendar, item, key, settings);
    newState[key] = serializeStateItem_(item, event.getId(), signature);
    created += 1;
    changes.push({ type: '新增', newItem: item });
  });

  plan.deletions.forEach(item => {
    if (deleteCalendarEvent_(calendar, item.calendarEventId, item.stateKey)) {
      deleted += 1;
      changes.push({ type: '取消', oldItem: item });
    }
  });

  return { state: newState, changes, created, updated, deleted, unchanged };
}

function createCalendarEvent_(calendar, item, stateKey, settings) {
  const options = { location: item.location || '', description: buildManagedDescription_(item, stateKey, settings) };
  const event = item.isAllDay
    ? calendar.createAllDayEvent(buildEventTitle_(item, settings), item.start, options)
    : calendar.createEvent(buildEventTitle_(item, settings), item.start, item.end, options);
  applyEventReminders_(event, settings);
  return event;
}

function updateCalendarEvent_(calendar, eventId, item, stateKey, settings) {
  const event = calendar.getEventById(eventId);

  if (!event) {
    return createCalendarEvent_(calendar, item, stateKey, settings).getId();
  }

  if (event.isAllDayEvent() !== Boolean(item.isAllDay)) {
    if (isManagedEvent_(event)) event.deleteEvent();
    return createCalendarEvent_(calendar, item, stateKey, settings).getId();
  }

  const title = buildEventTitle_(item, settings);
  const description = buildManagedDescription_(item, stateKey, settings);
  if (event.getTitle() !== title) event.setTitle(title);
  if (item.isAllDay) {
    if (formatDateKey_(event.getAllDayStartDate()) !== item.dateKey) event.setAllDayDate(item.start);
  } else if (event.getStartTime().getTime() !== item.start.getTime() || event.getEndTime().getTime() !== item.end.getTime()) {
    event.setTime(item.start, item.end);
  }
  if ((event.getLocation() || '') !== (item.location || '')) event.setLocation(item.location || '');
  if ((event.getDescription() || '') !== description) event.setDescription(description);
  applyEventReminders_(event, settings);
  return event.getId();
}

function deleteCalendarEvent_(calendar, eventId, stateKey) {
  if (!eventId) return false;
  const event = calendar.getEventById(eventId);
  if (!event) return false;
  if (!isManagedEvent_(event, stateKey)) return false;
  event.deleteEvent();
  return true;
}

function isManagedEvent_(event, stateKey) {
  const description = String(event.getDescription() || '');
  const hasManagedMarker = description.indexOf(MANAGED_MARKER) !== -1;
  if (!hasManagedMarker) return false;
  if (!stateKey || description.indexOf('同步識別碼：' + hashText_(stateKey)) !== -1) return true;
  return (description.indexOf(DESCRIPTION_MARKER) !== -1 || description.indexOf(LEGACY_DESCRIPTION_MARKER) !== -1) &&
    /來源儲存格：[A-Z]+\\d+/.test(description) &&
    description.indexOf('原始內容：') !== -1;
}

function applyEventReminders_(event, settings) {
  event.removeAllReminders();
  if (settings.reminderMode === 'popup') event.addPopupReminder(settings.reminderMinutes);
  if (settings.reminderMode === 'email') event.addEmailReminder(settings.reminderMinutes);
}

function buildEventTitle_(item) {
  return item.type === 'activity' ? '活動｜' + item.originalTitle : item.originalTitle;
}

function buildManagedDescription_(item, stateKey, settings) {
  const template = getDescriptionTemplate_(settings);
  const values = {
    course: item.originalTitle,
    date: item.dateKey.replace(/-/g, '/'),
    weekday: item.weekday,
    week: String(item.weekNum),
    period: item.isAllDay ? '全天' : (item.periodStart === item.periodEnd ? String(item.periodStart) : item.periodStart + '–' + item.periodEnd),
    startTime: item.isAllDay ? '全天' : item.startTime,
    endTime: item.isAllDay ? '全天' : item.endTime,
    location: item.location || '未註明',
    sourceUpdatedAt: item.sourceUpdatedLabel || '未提供'
  };
  const body = renderTemplate_(template, values).trim();
  return [MANAGED_MARKER, body || DESCRIPTION_MARKER, '', '同步識別碼：' + hashText_(stateKey)].join('\\n');
}

function getDescriptionTemplate_(settings) {
  if (settings.descriptionPreset === 'compact') return '{week} 週｜星期{weekday}｜第 {period} 節\\n{location}';
  if (settings.descriptionPreset === 'detailed') return '{course}\\n{date}（{weekday}）\\n第 {period} 節｜{startTime}–{endTime}\\n地點：{location}\\n課表更新：{sourceUpdatedAt}';
  if (settings.descriptionPreset === 'custom') return settings.customDescription;
  return '第 {week} 週｜星期{weekday}｜第 {period} 節\\n時間：{startTime}–{endTime}\\n地點：{location}\\n課表更新：{sourceUpdatedAt}';
}

function renderTemplate_(template, values) {
  return String(template || '').replace(/\\{([A-Za-z]+)\\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );
}

function makeOccurrenceKey_(item) {
  return [normalizeTitle_(item.originalTitle), item.dateKey, item.isAllDay ? 'all-day' : item.periodStart, item.isAllDay ? 'all-day' : item.periodEnd, normalizeTitle_(item.location)].join('|');
}

function makeEventSignature_(item, settings) {
  return JSON.stringify([
    item.originalTitle, item.type, item.isAllDay, item.dateKey, item.periodStart, item.periodEnd,
    item.start.toISOString(), item.end.toISOString(), item.location,
    settings.descriptionPreset, settings.customDescription,
    settings.reminderMode, settings.reminderMinutes
  ]);
}

function serializeStateItem_(item, calendarEventId, signature) {
  return {
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
    syncSignature: signature
  };
}

function loadSourceContext_(gradeName) {
  const payload = fetchSchedulePayload_(gradeName);
  return parseSchedulePayload_(payload, gradeName, new Date());
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

  return {
    gradeName,
    firstDateKey,
    lastDateKey,
    termKey,
    fingerprint: hashText_(JSON.stringify([termKey, lastDateKey, catalogAll.map(item => item.title)])),
    sourceUpdatedLabel,
    sourceStale: isSourceStale_(sourceUpdatedLabel, now),
    catalog: {
      all: catalogAll,
      courses: catalogAll.filter(item => item.type === 'course'),
      activities: catalogAll.filter(item => item.type === 'activity')
    },
    events
  };
}

function extractCatalogFromPayload_(payload) {
  const catalogMap = {};
  (payload.tableData || []).forEach(row => {
    if (!row || row.isHeader || !Array.isArray(row.cells)) return;
    row.cells.forEach(cell => {
      splitCellEntries_(cell && cell.value).forEach(rawEntry => {
        if (isStructuralValue_(rawEntry)) return;
        const parsed = parseEntry_(rawEntry);
        const key = normalizeTitle_(parsed.title);
        if (key && !catalogMap[key]) {
          catalogMap[key] = { title: parsed.title, type: isActivityTitle_(parsed.title) ? 'activity' : 'course' };
        }
      });
    });
  });
  return Object.keys(catalogMap).map(key => catalogMap[key]).sort((a, b) => a.title.localeCompare(b.title));
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
  settings.knownTitles = uniqueStrings_(settings.knownTitles || []);
  settings.pendingTitles = uniqueStrings_(settings.pendingTitles || []);
  settings.excludedTitles = uniqueStrings_(settings.excludedTitles || []);
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

function saveSettings_(settings) {
  writeChunkedJson_(SETTINGS_STORE, settings);
}

function loadStatus_() {
  return readChunkedJson_(STATUS_STORE, { ok: null, message: '完成設定後即可開始同步。', eventCount: 0 });
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
  const chunks = [];
  for (let index = 0; index < raw.length; index += 7500) chunks.push(raw.slice(index, index + 7500));
  const oldCount = Number(properties.getProperty(key + '_COUNT')) || 0;
  const updates = {};
  chunks.forEach((chunk, index) => { updates[key + '_' + index] = chunk; });
  updates[key + '_COUNT'] = String(chunks.length);
  properties.setProperties(updates, false);
  for (let index = chunks.length; index < oldCount; index += 1) properties.deleteProperty(key + '_' + index);
}

function clearChunkedStore_(key) {
  const properties = PropertiesService.getScriptProperties();
  const count = Number(properties.getProperty(key + '_COUNT')) || 0;
  for (let index = 0; index < count; index += 1) properties.deleteProperty(key + '_' + index);
  properties.deleteProperty(key + '_COUNT');
  if (key === SYNC_STATE_STORE) properties.deleteProperty('SYNC_STATE');
}

function setupAutoSyncTriggers() {
  const settings = loadSettings_();
  settings.autoSyncEnabled = true;
  saveSettings_(settings);
  refreshAutoSyncTriggers_(settings);
}

function refreshAutoSyncTriggers_(settings) {
  deleteAutoSyncTriggers();
  if (!settings.autoSyncEnabled) return;
  settings.autoSyncHours.forEach(hour => {
    const handler = hour === settings.notifySyncHour ? 'syncMyScheduleToCalendarWithNotification' : 'syncMyScheduleToCalendar';
    ScriptApp.newTrigger(handler).timeBased().atHour(hour).nearMinute(0).everyDays(1).inTimezone(TIMEZONE).create();
  });
}

function deleteAutoSyncTriggers() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (['syncMyScheduleToCalendar', 'syncMyScheduleToCalendarWithNotification'].indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger);
  });
}

function toggleAutoSyncFromMenu() {
  const settings = loadSettings_();
  settings.autoSyncEnabled = !settings.autoSyncEnabled;
  settings.pausedReason = settings.autoSyncEnabled ? '' : '由使用者暫停。';
  saveSettings_(settings);
  refreshAutoSyncTriggers_(settings);
  SpreadsheetApp.getUi().alert(settings.autoSyncEnabled ? '已恢復自動同步。' : '已暫停自動同步。');
}

function showSyncStatus() {
  const status = loadStatus_();
  SpreadsheetApp.getUi().alert('T-SCHOOL 行程同步', (status.message || '尚未同步') + '\\n\\n上次執行：' + (status.lastSyncLabel || '尚無紀錄'), SpreadsheetApp.getUi().ButtonSet.OK);
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
  clearChunkedStore_(SYNC_STATE_STORE);
  clearChunkedStore_(STATUS_STORE);
}

function sendSyncNotificationsSafe_(settings, result, options) {
  try {
    if (options.reason === 'source' && result.changes.length > 0) {
      sendEmail_(settings, '[T-SCHOOL] 課表異動 ' + result.changes.length + ' 項', formatChangeDigest_(result, settings));
    } else if (options.notifyOnSuccess) {
      sendEmail_(settings, '[T-SCHOOL] 行程同步成功', formatSyncResultMessage_(result));
    }
  } catch (error) {
    Logger.log('同步通知寄送失敗：' + error.message);
  }
}

function sendFirstSetupNotificationSafe_(result) {
  try {
    sendEmail_(loadSettings_(), '[T-SCHOOL] 行程同步設定完成', '第一次同步已完成。\\n\\n' + formatSyncResultMessage_(result) + '\\n\\n請開啟專用 Google 日曆，確認課程、日期、節次與地點正確。');
  } catch (error) {
    Logger.log('設定完成通知寄送失敗：' + error.message);
  }
}

function notifySyncFailureSafe_(error) {
  try {
    sendEmail_(loadSettings_(), '[T-SCHOOL] 行程同步失敗', userFacingError_(error) + '\\n\\n請開啟行程同步控制台查看狀態。');
  } catch (mailError) {
    Logger.log('同步失敗通知寄送失敗：' + mailError.message);
  }
}

function notifySyncFailureUnlessActionRequired_(error) {
  if (String(error.message || error).indexOf('[ACTION_REQUIRED]') !== 0) {
    notifySyncFailureSafe_(error);
  }
}

function sendActionRequiredSafe_(settings, subject, body) {
  const noticeState = readChunkedJson_(NOTICE_STORE, {});
  const key = hashText_(subject + '|' + body);
  if (noticeState[key]) return;
  try {
    sendEmail_(settings, '[T-SCHOOL] ' + subject, body);
    noticeState[key] = true;
    writeChunkedJson_(NOTICE_STORE, noticeState);
  } catch (error) {
    Logger.log('操作提醒寄送失敗：' + error.message);
  }
}

function sendEmail_(settings, subject, body) {
  const recipient = getNotificationEmail_(settings);
  MailApp.sendEmail(recipient, subject, body || '');
}

function getNotificationEmail_(settings) {
  const configured = String(settings.notificationEmail || '').trim();
  const email = configured || Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  assertSingleEmail_(email);
  return email;
}

function assertSingleEmail_(email) {
  if (!/^[^\\s@,;<>]+@[^\\s@,;<>]+$/.test(String(email || ''))) throw new Error('找不到可用的通知 Email，請在控制台填入單一信箱。');
}

function formatChangeDigest_(result, settings) {
  const lines = result.changes.map(change =>
    renderTemplate_(getNotificationTemplate_(settings), buildChangeTemplateValues_(change)).trim()
  );
  lines.push('', formatSyncResultMessage_(result));
  return lines.join('\\n');
}

function getNotificationTemplate_(settings) {
  if (settings.notificationPreset === 'compact') return '{type}｜{course}｜{newDate} {newPeriod}';
  if (settings.notificationPreset === 'detailed') return '{type}｜{course}\\n原：{oldDate} {oldPeriod}｜{oldTime}｜{oldLocation}\\n新：{newDate} {newPeriod}｜{newTime}｜{newLocation}';
  if (settings.notificationPreset === 'custom') return settings.customNotification;
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
  return '新增 ' + result.created + '、更新 ' + result.updated + '、移除 ' + result.deleted + '、未變更 ' + result.unchanged + '。';
}

function userFacingError_(error) {
  return String(error && error.message ? error.message : error).replace(/^\\[ACTION_REQUIRED\\]\\s*/, '');
}

function normalizeText_(value) {
  return String(value == null ? '' : value).replace(/\\r/g, '\\n').replace(/（/g, '(').replace(/）/g, ')').replace(/＿/g, '_').replace(/[\\t\\u3000]+/g, ' ').replace(/[ ]+/g, ' ').replace(/\\n{2,}/g, '\\n').trim();
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
`;
  };
})();
