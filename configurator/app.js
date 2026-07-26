const DEFAULTS = {
  gradeName: '',
  notificationEmail: '@tschool.tp.edu.tw',
  syncHours: [6],
  notifyHour: 6,
  descriptionPreset: 'standard',
  customDescription: [
    '第 {week} 週 / 週{weekday} / 第 {period} 節',
    '',
    '**# 單元主題**',
    '{topic}',
    '',
    '**# 課程內容**',
    '{content}'
  ].join('\n'),
  reminderMode: 'none',
  reminderMinutes: 10,
  calendarNameSuffix: '行程｜T-SCHOOL Schedule Sync'
};

// Temporary feature switch: set to true to restore Lenis and animated page scrolling.
const ENABLE_SMOOTH_SCROLL = true;

// Developer-only high-load test generator.
// Set this to false before publishing if the dedicated test build should be completely unavailable.
// Even while true, regular visitors do not receive test code unless the URL contains ?highLoadTest=1.
const ENABLE_HIGH_LOAD_TEST_FEATURE = true;
const HIGH_LOAD_TEST_QUERY_PARAMETER = 'highLoadTest';

const GOOGLE_SHEETS_TEMPLATE_COPY_URL =
  'https://docs.google.com/spreadsheets/d/1MdSMBUNxl8ctdK-q7pO9Sz40Oo-qVPCUKmFssHbs0Ls/copy';
const LOCAL_SHEETS_TEMPLATE_URL = 'assets/t-school-control-panel-template.xlsx';
const COURSE_SEARCH_ICON_URL = 'assets/icon-search.svg';
const COURSE_SEARCH_CANCEL_ICON_URL = 'assets/icon-x.svg';
const MAX_NOTIFY_HOURS = 4;
const SCHOOL_EMAIL_DOMAIN = '@tschool.tp.edu.tw';
const SCHOOL_EMAIL_PATTERN =
  /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@tschool\.tp\.edu\.tw$/;
const SCHOOL_EMAIL_HINT = '請輸入有效的校內 Email，格式比如「學號/教師名/職位/組織名@tschool.tp.edu.tw」';
const TRADITIONAL_CHINESE_STROKE_COLLATOR = (() => {
  try {
    return new Intl.Collator('zh-Hant-u-co-stroke', {
      numeric: true,
      sensitivity: 'base'
    });
  } catch {
    return new Intl.Collator('zh-Hant', {
      numeric: true,
      sensitivity: 'base'
    });
  }
})();

// Journey tuning: each completed section reveals the next one in the vertical narrative.
// Scroll feel: duration controls how long each full wheel delta takes to settle;
// multipliers retain the input distance while adjusting its overall scale.
// Locked-step boundaries cap the final target without damping repeated input.
const MOTION_CONFIG = Object.freeze({
  sectionTransitionDuration: 1,
  scrollDuration: 1,
  scrollLerpTouch: 0.2,
  scrollWheelMultiplier: 1,
  scrollTouchMultiplier: 0.9,
  scrollTouchInertiaExponent: 1.35,
  boundarySettleDuration: 1,
  boundarySnapDistance: 1.5,
  focusLineRatio: 0.5,
  focusSwitchHysteresisForward: 48,
  focusSwitchHysteresisBackward: 96,
  homeEntryScrollDuration: 0.9,
  footerReturnScrollDuration: 1.8,
  heroTileTravel: 0.72,
  heroTileStagger: 0.08,
  heroDesktopPaperTravelRatio: 0.06,
  heroMobilePaperTravelRatio: 0.13,
  cursorPositionEase: 0.38,
  cursorAngleEase: 0.3
});

document.documentElement.style.setProperty(
  '--section-transition-duration',
  `${MOTION_CONFIG.sectionTransitionDuration}s`
);

const state = {
  selectedByGrade: new Map(),
  excludedActivitiesByGrade: new Map(),
  sourceByGrade: new Map(),
  sourceSummary: null,
  sourceLoading: false,
  sourceError: null,
  requestId: 0
};

const elements = {
  form: document.querySelector('#config-form'),
  highLoadTestBanner: document.querySelector('#high-load-test-banner'),
  notificationEmail: document.querySelector('#notification-email'),
  notifyHoursList: document.querySelector('#notify-hours-list'),
  courseSearch: document.querySelector('#course-search'),
  courseSearchSubmit: document.querySelector('#course-search-submit'),
  courseSearchIcon: document.querySelector('#course-search-icon'),
  courseList: document.querySelector('#course-list'),
  courseCount: document.querySelector('#course-count'),
  notificationSelectionCount: document.querySelector('#notification-selection-count'),
  generatedCode: document.querySelector('#generated-code'),
  copyCode: document.querySelector('#copy-code'),
  copyCodeInline: Array.from(document.querySelectorAll('[data-copy-code-inline]')),
  outputEmail: document.querySelector('#output-email'),
  sourceStatus: document.querySelector('#source-status'),
  sourceStatusTitle: document.querySelector('#source-status-title'),
  sourceStatusDetail: document.querySelector('#source-status-detail'),
  sourceRefresh: document.querySelector('#source-refresh'),
  settingsSummary: document.querySelector('#settings-summary'),
  stageMenu: document.querySelector('#stage-menu'),
  stageMenuTrigger: document.querySelector('#stage-menu-trigger'),
  stageMenuPanel: document.querySelector('#stage-menu-panel'),
  stageMenuItems: Array.from(document.querySelectorAll('#stage-menu-panel [data-step-target]')),
  codeWindow: document.querySelector('#code-window'),
  fullCodeToggle: document.querySelector('#full-code-toggle'),
  sheetTemplateLink: document.querySelector('#sheet-template-link'),
  sheetTemplateNote: document.querySelector('#sheet-template-note')
};

function init() {
  initViewportMetrics();
  const highLoadTestGenerationEnabled = isHighLoadTestGenerationEnabled();
  document.body.classList.toggle('is-high-load-test-build', highLoadTestGenerationEnabled);
  if (elements.highLoadTestBanner) {
    elements.highLoadTestBanner.hidden = !highLoadTestGenerationEnabled;
  }
  elements.notificationEmail.value = DEFAULTS.notificationEmail;
  renderNotifyHours(DEFAULTS.syncHours);
  updateNotifyHourState();
  configureSheetTemplateLink();
  bindEvents();
  updateCourseSearchAction();
  setupValidation();
  initVisualExperience();
  renderCourses();
  updateOutput();
  renderSettingsSummary();
}

function initViewportMetrics() {
  const update = () => {
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty(
      '--visual-viewport-height',
      `${Math.round(viewportHeight)}px`
    );
  };

  update();
  window.addEventListener('resize', update, { passive: true });
  window.visualViewport?.addEventListener('resize', update, { passive: true });
}

function configureSheetTemplateLink() {
  if (!elements.sheetTemplateLink) return;

  const isGoogleCopyUrl = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/copy(?:[?#].*)?$/i
    .test(GOOGLE_SHEETS_TEMPLATE_COPY_URL);

  if (isGoogleCopyUrl) {
    elements.sheetTemplateLink.href = GOOGLE_SHEETS_TEMPLATE_COPY_URL;
    elements.sheetTemplateLink.textContent = '模板連結';
    elements.sheetTemplateLink.target = '_blank';
    elements.sheetTemplateLink.rel = 'noopener';
    elements.sheetTemplateLink.removeAttribute('download');
    elements.sheetTemplateLink.dataset.cursorLabel = '開啟模板連結';
    return;
  }

  elements.sheetTemplateLink.href = LOCAL_SHEETS_TEMPLATE_URL;
  elements.sheetTemplateLink.textContent = '模板連結';
  elements.sheetTemplateLink.download = 't-school-control-panel-template.xlsx';
  elements.sheetTemplateLink.removeAttribute('target');
  elements.sheetTemplateLink.removeAttribute('rel');
  elements.sheetTemplateLink.dataset.cursorLabel = '下載模板連結';
}

function bindEvents() {
  elements.form.addEventListener('input', event => {
    if (event.target.name === 'gradeName') {
      elements.courseSearch.value = '';
      updateCourseSearchAction();
      document.dispatchEvent(new CustomEvent('tschool:grade-selection-start'));
      renderSettingsSummary();
      loadGradeSchedule(event.target.value);
      return;
    }

    // Search text is presentation-only, while course/activity changes are
    // finalized by the course-list change handler. Avoid rebuilding the large
    // generated Apps Script once (or twice) for these unrelated input events.
    if (
      event.target === elements.courseSearch ||
      event.target.matches('[data-course], [data-activity]')
    ) {
      return;
    }

    if (event.target === elements.notificationEmail) {
      updateNotifyHourState();
    }

    if (
      event.target === elements.notificationEmail ||
      event.target.matches('[data-notify-hour]')
    ) {
      document.dispatchEvent(new CustomEvent('tschool:configuration-change', {
        detail: { step: 3 }
      }));
    }

    if (event.target.matches('[data-notify-hour]')) {
      updateNotifyHourOptions();
    }

    updateOutput();
    renderSettingsSummary();
  });

  elements.courseSearch.addEventListener('input', () => {
    updateCourseSearchAction();
    renderCourses();
  });
  elements.courseSearch.addEventListener('keydown', event => {
    if (
      event.key !== 'Escape' ||
      event.isComposing ||
      event.keyCode === 229 ||
      !elements.courseSearch.value
    ) {
      return;
    }

    event.preventDefault();
    cancelCourseSearch();
  });
  elements.courseList.addEventListener('change', handleCourseSelectionChange);
  elements.courseSearchSubmit?.addEventListener('click', () => {
    if (elements.courseSearch.value) {
      cancelCourseSearch();
      return;
    }

    elements.courseSearch.focus();
  });
  elements.notifyHoursList?.addEventListener('click', handleNotifyHourAction);

  [elements.copyCode, ...elements.copyCodeInline].forEach(button => {
    if (!button) return;
    button.dataset.cursorDefaultLabel = button.dataset.cursorLabel || '複製程式碼';
  });

  elements.copyCode.addEventListener('click', copyGeneratedCode);

  elements.copyCodeInline.forEach(button => {
    button.addEventListener('click', copyGeneratedCode);
  });

  elements.sourceRefresh.addEventListener('click', () => {
    const grade = getCurrentGrade();
    if (grade) loadGradeSchedule(grade, { force: true });
  });
}

function updateCourseSearchAction() {
  const isSearching = Boolean(elements.courseSearch.value);

  elements.courseSearchSubmit?.classList.toggle('is-cancel', isSearching);
  elements.courseSearchSubmit?.setAttribute(
    'aria-label',
    isSearching ? '取消搜尋' : '搜尋課程和活動'
  );

  if (elements.courseSearchSubmit) {
    elements.courseSearchSubmit.dataset.cursorLabel = isSearching ? '取消搜尋' : '搜尋';
  }

  if (elements.courseSearchIcon) {
    elements.courseSearchIcon.src = isSearching
      ? COURSE_SEARCH_CANCEL_ICON_URL
      : COURSE_SEARCH_ICON_URL;
  }
}

function cancelCourseSearch() {
  elements.courseSearch.value = '';
  updateCourseSearchAction();
  renderCourses();
  elements.courseSearch.focus({ preventScroll: true });
}

async function loadGradeSchedule(gradeName, options) {
  const requestId = ++state.requestId;
  const force = Boolean(options && options.force);
  const cached = state.sourceByGrade.get(gradeName);

  if (cached && !force) {
    state.sourceSummary = cached.summary;
    state.sourceError = null;
    renderSourceStatus();
    renderCourses();
    updateOutput();
    renderSettingsSummary();
    announceGradeReady(gradeName);
    return;
  }

  state.sourceLoading = true;
  state.sourceError = null;
  renderSourceStatus();
  renderCourses();
  updateOutput();

  try {
    const payload = await window.TSchoolScheduleData.fetchGradeSchedule(gradeName);
    const summary = window.TSchoolScheduleData.summarizePayload(payload, new Date());

    if (requestId !== state.requestId) {
      return;
    }

    state.sourceByGrade.set(gradeName, { payload, summary });
    state.sourceSummary = summary;
  } catch (error) {
    if (requestId !== state.requestId) {
      return;
    }

    state.sourceSummary = null;
    state.sourceError = error;
  } finally {
    if (requestId === state.requestId) {
      state.sourceLoading = false;
      renderSourceStatus();
      renderCourses();
      updateOutput();
      renderSettingsSummary();
      if (state.sourceSummary && !state.sourceError) announceGradeReady(gradeName);
    }
  }
}

function announceGradeReady(gradeName) {
  document.dispatchEvent(new CustomEvent('tschool:grade-ready', {
    detail: { gradeName }
  }));
}

function renderSourceStatus() {
  if (state.sourceLoading) {
    elements.sourceStatus.dataset.state = 'loading';
    elements.sourceStatusTitle.textContent = '正在讀取課表';
    elements.sourceStatusDetail.textContent = '若等待過久，可重新讀取';
    elements.sourceRefresh.disabled = !getCurrentGrade();
    return;
  }

  elements.sourceRefresh.disabled = false;

  if (state.sourceError) {
    elements.sourceStatus.dataset.state = 'error';
    elements.sourceStatusTitle.textContent = '目前無法讀取課表';
    elements.sourceStatusDetail.textContent = state.sourceError.message || '請稍後重新嘗試';
    return;
  }

  if (!state.sourceSummary) {
    elements.sourceStatus.dataset.state = 'idle';
    elements.sourceStatusTitle.textContent = '請先選擇年級';
    elements.sourceStatusDetail.textContent = '系統將整理出對應的課程、活動給你選擇';
    elements.sourceRefresh.disabled = true;
    return;
  }

  elements.sourceStatus.dataset.state = 'success';
  elements.sourceStatusTitle.textContent = `${getCurrentGrade()}課表可用`;
  elements.sourceStatusDetail.textContent = '系統將整理出對應的課程、活動給你選擇';
}

function initMobileOutput() {
  const button = document.getElementById('mobile-output-toggle');

  if (button) {
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', '收合程式碼');
  }
}

function bindMobileOutputToggle() {
  const button = document.getElementById('mobile-output-toggle');

  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    const pane = document.querySelector('.output-pane');
    const collapsed = pane.classList.toggle('mobile-collapsed');
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', collapsed ? '展開程式碼' : '收合程式碼');
  });
}

function setupValidation() {
  elements.notificationEmail.addEventListener('input', validateNotificationEmail);
  elements.notificationEmail.addEventListener('blur', validateNotificationEmail);
  elements.notificationEmail.addEventListener('click', positionEmailCaretBeforeDomain);
}

function validateNotificationEmail() {
  const value = elements.notificationEmail.value.trim();
  const field = document.getElementById('field-notification-email');

  if (isValidNotificationEmail(value)) {
    elements.notificationEmail.setCustomValidity('');
    setFieldState(field, 'valid', '為了讓程式能存取課綱，請輸入校內 Email');
    return true;
  }

  elements.notificationEmail.setCustomValidity(
    '請輸入有效的校內 Email'
  );
  setFieldState(field, 'invalid', SCHOOL_EMAIL_HINT);
  return false;
}

function isValidNotificationEmail(value) {
  return SCHOOL_EMAIL_PATTERN.test(String(value || '').trim());
}

function positionEmailCaretBeforeDomain() {
  if (elements.notificationEmail.value !== SCHOOL_EMAIL_DOMAIN) {
    return;
  }

  elements.notificationEmail.setSelectionRange(0, 0);
}

function focusEmailBeforeDomain() {
  const value = elements.notificationEmail.value;
  const domainStart = value.toLowerCase().lastIndexOf(SCHOOL_EMAIL_DOMAIN);
  const atSign = value.indexOf('@');
  const caretPosition = domainStart >= 0
    ? domainStart
    : atSign >= 0
      ? atSign
      : value.length;

  elements.notificationEmail.focus({ preventScroll: true });
  elements.notificationEmail.setSelectionRange(caretPosition, caretPosition);
}

function setFieldState(field, stateValue, hint) {
  if (!field) {
    return;
  }

  const input = field.querySelector('input');

  if (stateValue) {
    field.dataset.fieldState = stateValue;
  } else {
    delete field.dataset.fieldState;
  }

  if (input) {
    if (stateValue === 'invalid') {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  }

  const hintElement = field.querySelector('.field-hint');

  if (hintElement && hint !== undefined) {
    hintElement.textContent = hint;
  }
}

function renderNotifyHours(hours) {
  const normalizedHours = Array.from(new Set(hours))
    .filter(hour => Number.isInteger(hour) && hour >= 0 && hour <= 23)
    .slice(0, MAX_NOTIFY_HOURS);
  const initialHours = normalizedHours.length ? normalizedHours : [DEFAULTS.notifyHour];

  elements.notifyHoursList.innerHTML = '';
  initialHours.forEach(hour => appendNotifyHourRow(hour));
  updateNotifyHourOptions();
}

function updateNotifyHourState() {
  const hasValidEmail = isValidNotificationEmail(elements.notificationEmail.value);
  getNotifyHourSelects().forEach(select => {
    select.title = hasValidEmail ? '' : '請先填寫有效的校內 Email';
  });
}

function appendNotifyHourRow(hour) {
  const index = getNotifyHourSelects().length;
  const row = document.createElement('div');
  row.className = 'notification-time-row';

  const label = document.createElement('label');
  label.className = 'notification-time-select';

  const accessibleLabel = document.createElement('span');
  accessibleLabel.className = 'visually-hidden';
  accessibleLabel.textContent = `通知時間 ${index + 1}`;

  const select = document.createElement('select');
  select.name = 'notifyHours[]';
  select.dataset.notifyHour = '';
  select.dataset.cursorLabel = '選擇時段';
  select.innerHTML = Array.from({ length: 24 }, (_, optionHour) =>
    `<option value="${optionHour}">${pad2(optionHour)}:00</option>`
  ).join('');
  select.value = String(hour);

  const action = document.createElement('button');
  action.type = 'button';
  action.className = `icon-button notification-time-action ${index === 0 ? 'is-add' : 'is-remove'}`;
  action.dataset.cursorLabel = index === 0 ? '新增通知時間' : '移除通知時間';
  action.setAttribute('aria-label', index === 0 ? '新增通知時間' : `移除通知時間 ${index + 1}`);
  action.dataset[index === 0 ? 'addNotifyHour' : 'removeNotifyHour'] = '';
  action.textContent = index === 0 ? '+' : '−';

  label.append(accessibleLabel, select);
  row.append(label, action);
  elements.notifyHoursList.append(row);
}

function handleNotifyHourAction(event) {
  const addButton = event.target.closest('[data-add-notify-hour]');
  const removeButton = event.target.closest('[data-remove-notify-hour]');

  if (addButton) {
    if (getNotifyHourSelects().length >= MAX_NOTIFY_HOURS) return;
    appendNotifyHourRow(getNextNotifyHour());
    updateNotifyHourOptions();
    notifyStepConfigurationChanged();
    getNotifyHourSelects().at(-1)?.focus({ preventScroll: true });
    return;
  }

  if (!removeButton) return;

  const row = removeButton.closest('.notification-time-row');
  const nextFocus = row?.previousElementSibling?.querySelector('select') ||
    row?.nextElementSibling?.querySelector('select') ||
    getNotifyHourSelects()[0];
  row?.remove();
  updateNotifyHourOptions();
  notifyStepConfigurationChanged();
  nextFocus?.focus({ preventScroll: true });
}

function getNotifyHourSelects() {
  return Array.from(elements.notifyHoursList?.querySelectorAll('[data-notify-hour]') || []);
}

function getSelectedNotifyHours() {
  return getNotifyHourSelects()
    .map(select => Number(select.value))
    .filter((hour, index, hours) =>
      Number.isInteger(hour) &&
      hour >= 0 &&
      hour <= 23 &&
      hours.indexOf(hour) === index
    );
}

function getNextNotifyHour() {
  const selected = getSelectedNotifyHours();
  const preferred = ((selected.at(-1) ?? DEFAULTS.notifyHour) + 6) % 24;

  for (let offset = 0; offset < 24; offset += 1) {
    const candidate = (preferred + offset) % 24;
    if (!selected.includes(candidate)) return candidate;
  }

  return DEFAULTS.notifyHour;
}

function updateNotifyHourOptions() {
  const selects = getNotifyHourSelects();
  const selectedHours = selects.map(select => Number(select.value));

  selects.forEach((select, selectIndex) => {
    Array.from(select.options).forEach(option => {
      const optionHour = Number(option.value);
      option.disabled = selectedHours.some((selectedHour, selectedIndex) =>
        selectedIndex !== selectIndex && selectedHour === optionHour
      );
    });
  });

  const addButton = elements.notifyHoursList?.querySelector('[data-add-notify-hour]');
  if (addButton) {
    const maximumReached = selects.length >= MAX_NOTIFY_HOURS;
    addButton.disabled = maximumReached;
    addButton.title = maximumReached ? `最多可設定 ${MAX_NOTIFY_HOURS} 個通知時間` : '';
  }

  updateNotifyHourState();
}

function notifyStepConfigurationChanged() {
  document.dispatchEvent(new CustomEvent('tschool:configuration-change', {
    detail: { step: 3 }
  }));
  updateOutput();
  renderSettingsSummary();
}

function getSelectedCourses(gradeName) {
  const grade = gradeName || getCurrentGrade();

  if (!state.selectedByGrade.has(grade)) {
    state.selectedByGrade.set(grade, new Set());
  }

  return state.selectedByGrade.get(grade);
}

function getExcludedActivities(gradeName) {
  const grade = gradeName || getCurrentGrade();

  if (!state.excludedActivitiesByGrade.has(grade)) {
    state.excludedActivitiesByGrade.set(grade, new Set());
  }

  return state.excludedActivitiesByGrade.get(grade);
}

function handleCourseSelectionChange(event) {
  const input = event.target.closest('input[data-course], input[data-activity]');

  if (!input) {
    return;
  }

  if (input.hasAttribute('data-activity')) {
    const excluded = getExcludedActivities();

    if (input.checked) {
      excluded.delete(input.value);
    } else {
      excluded.add(input.value);
    }

    document.dispatchEvent(new CustomEvent('tschool:configuration-change', {
      detail: { step: 2 }
    }));
    renderCourses();
    updateOutput();
    renderSettingsSummary();
    return;
  }

  const selected = getSelectedCourses();

  if (input.checked) {
    selected.add(input.value);
  } else {
    selected.delete(input.value);
  }

  document.dispatchEvent(new CustomEvent('tschool:configuration-change', {
    detail: { step: 2 }
  }));
  renderCourses();
  updateOutput();
  renderSettingsSummary();
}

function renderCourses() {
  if (state.sourceLoading) {
    elements.courseList.innerHTML = '<div class="course-loading" aria-live="polite"><span class="loading-track" aria-hidden="true"></span><p>正在整理課程與活動…</p></div>';
    renderSelectionCounts();
    return;
  }

  if (state.sourceError) {
    elements.courseList.innerHTML = '<p class="empty-course-list">課表尚未載入，請先重新讀取來源</p>';
    renderSelectionCounts();
    return;
  }

  if (!state.sourceSummary) {
    elements.courseList.innerHTML = '<p class="empty-course-list">選擇年級後會顯示目前課程</p>';
    renderSelectionCounts();
    return;
  }

  const query = normalizeSearchText(elements.courseSearch.value);
  const catalog = state.sourceSummary.catalog;
  const sections = [];

  const courses = catalog.courses
    .filter(item => normalizeSearchText(item.title).includes(query))
    .sort((a, b) => compareByTraditionalStroke(a.title, b.title));

  if (courses.length > 0) {
    sections.push(renderCourseSection('課程', courses.map(renderCourseCard).join('')));
  }

  const activities = catalog.activities
    .filter(item => normalizeSearchText(item.title).includes(query))
    .sort((a, b) => compareByTraditionalStroke(a.title, b.title));

  if (activities.length > 0) {
    sections.push(renderCourseSection('活動', activities.map(renderActivityCard).join('')));
  }

  elements.courseList.innerHTML = sections.length > 0
    ? sections.join('')
    : '<p class="empty-course-list">找不到符合條件的項目，請調整搜尋文字</p>';

  renderSelectionCounts();
}

function renderCourseSection(title, content, note) {
  return [
    '<section class="course-group">',
    '<div class="course-group-heading">',
    `<h3>${escapeHtml(title)}</h3>`,
    note ? `<span>${escapeHtml(note)}</span>` : '',
    '</div>',
    `<div class="course-grid">${content}</div>`,
    '</section>'
  ].join('');
}

function renderCourseCard(item) {
  const checked = getSelectedCourses().has(item.title) ? 'checked' : '';
  return `<label class="course-card" data-cursor-label="選取課程"><input type="checkbox" data-course value="${escapeHtml(item.title)}" ${checked}><span>${escapeHtml(item.title)}</span></label>`;
}

function renderActivityCard(item) {
  const selected = isActivitySelected(item.title);
  return `<label class="course-card activity-card" data-cursor-label="${selected ? '取消活動' : '選取活動'}"><input type="checkbox" data-activity value="${escapeHtml(item.title)}" ${selected ? 'checked' : ''}><span>${escapeHtml(item.title)}</span></label>`;
}

function isActivitySelected(title) {
  return !getExcludedActivities().has(title);
}

function renderSelectionCounts() {
  const selected = Array.from(getSelectedCourses()).sort((a, b) =>
    a.localeCompare(b, 'zh-Hant')
  );

  const activities = state.sourceSummary ? state.sourceSummary.catalog.activities : [];
  const selectedActivities = activities.filter(item => isActivitySelected(item.title));
  const label = `已選 ${selected.length} 門課 ・ ${selectedActivities.length} 項活動`;
  elements.courseCount.textContent = label;
  if (elements.notificationSelectionCount) {
    elements.notificationSelectionCount.textContent = '包含行程調整、同步狀態通知';
  }
}

function getCurrentGrade() {
  const checked = document.querySelector('input[name="gradeName"]:checked');
  return checked ? checked.value : '';
}

function getDefaultCalendarName(gradeName) {
  return `${gradeName || '高一'}${DEFAULTS.calendarNameSuffix}`;
}

function isHighLoadTestGenerationEnabled() {
  if (!ENABLE_HIGH_LOAD_TEST_FEATURE) return false;

  try {
    return new URLSearchParams(window.location.search)
      .get(HIGH_LOAD_TEST_QUERY_PARAMETER) === '1';
  } catch (error) {
    return false;
  }
}

function getSettings() {
  const autoSyncHours = getSelectedNotifyHours();
  const notifyHour = autoSyncHours.length
    ? autoSyncHours[autoSyncHours.length - 1]
    : DEFAULTS.notifyHour;

  const summary = state.sourceSummary;
  const activityTitles = summary ? summary.catalog.activities.map(item => item.title) : [];
  const excludedActivities = getExcludedActivities();
  const includeActivities = activityTitles.some(title => !excludedActivities.has(title));

  return {
    appVersion: '2.0.0-mvp',
    sourceApiUrl: window.TSchoolScheduleData.API_URL,
    gradeName: getCurrentGrade(),
    calendarName: getDefaultCalendarName(getCurrentGrade()),
    notificationEmail: elements.notificationEmail.value.trim(),
    autoSyncHours,
    notifySyncHour: notifyHour,
    includeActivities,
    excludedActivities: Array.from(excludedActivities).sort((a, b) =>
      a.localeCompare(b, 'zh-Hant')
    ),
    selectedCourses: Array.from(getSelectedCourses()).sort((a, b) =>
      a.localeCompare(b, 'zh-Hant')
    ),
    descriptionPreset: DEFAULTS.descriptionPreset,
    customDescription: DEFAULTS.customDescription,
    reminderMode: DEFAULTS.reminderMode,
    reminderMinutes: DEFAULTS.reminderMinutes,
    highLoadTestingEnabled: isHighLoadTestGenerationEnabled(),
    initialTermKey: summary ? summary.termKey : '',
    initialSourceFingerprint: summary ? summary.fingerprint : '',
    initialKnownTitles: summary ? summary.catalog.all.map(item => item.title) : []
  };
}

function updateOutput() {
  const ready = Boolean(state.sourceSummary && !state.sourceLoading && !state.sourceError);
  elements.copyCode.disabled = !ready;
  if (elements.outputEmail) {
    elements.outputEmail.textContent = elements.notificationEmail.value.trim() || '---@---.---';
  }
  const gradeStepComplete = document.querySelector('[data-complete-step="1"]');
  const courseStepComplete = document.querySelector('[data-complete-step="2"]');

  if (gradeStepComplete) {
    gradeStepComplete.disabled = !getCurrentGrade() || !ready;
  }

  if (courseStepComplete) {
    courseStepComplete.disabled = !ready;
  }

  elements.copyCodeInline.forEach(button => {
    button.disabled = !ready;
  });

  if (!ready || typeof window.buildAppsScriptCode !== 'function') {
    setGeneratedCode(state.sourceError
      ? '// 課表來源目前無法讀取，請重新嘗試後再複製。'
      : '// 正在準備控制臺程式碼…');
    return;
  }

  setGeneratedCode(window.buildAppsScriptCode(getSettings()));
}

function setGeneratedCode(nextCode) {
  if (elements.generatedCode.value === nextCode) {
    return;
  }

  elements.copyCode.classList.remove('is-copied');
  elements.copyCode.textContent = '複製程式碼 ↵';
  elements.copyCode.setAttribute('aria-label', '複製程式碼');
  [elements.copyCode, ...elements.copyCodeInline].forEach(button => {
    if (!button) return;
    button.dataset.cursorLabel = button.dataset.cursorDefaultLabel || '複製程式碼';
    delete button.dataset.cursorTone;
  });
  elements.generatedCode.value = nextCode;
}

function updateCopyCursorSuccess(trigger) {
  if (!trigger) return;
  trigger.dataset.cursorLabel = '複製完成！';
  trigger.dataset.cursorTone = 'success';
  document.dispatchEvent(new CustomEvent('tschool:cursor-context-change', {
    detail: { target: trigger }
  }));
}

function playCopyKeyboardPressFeedback() {
  const button = elements.copyCode;

  if (!button) return;

  button.classList.remove('is-keyboard-pressing');
  void button.offsetWidth;
  button.classList.add('is-keyboard-pressing');
  button.addEventListener('animationend', event => {
    if (event.animationName === 'copy-button-keyboard-press') {
      button.classList.remove('is-keyboard-pressing');
    }
  }, { once: true });
}

async function copyGeneratedCode(event) {
  if (!state.sourceSummary || !validateNotificationEmail()) {
    elements.notificationEmail.reportValidity();
    return;
  }

  const trigger = event?.currentTarget || elements.copyCode;

  try {
    await navigator.clipboard.writeText(elements.generatedCode.value);
  } catch (error) {
    elements.generatedCode.focus();
    elements.generatedCode.select();
    document.execCommand('copy');
  }

  elements.copyCode.classList.add('is-copied');
  elements.copyCode.textContent = '再次複製 ↵';
  elements.copyCode.setAttribute('aria-label', '程式碼已複製，再次複製');
  updateCopyCursorSuccess(trigger);
}

function showToast(message) {
  const toast = document.getElementById('toast');

  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

function initVisualExperience() {
  initSmoothScroll();
  initFooterReturn();
  initHeroScroll();
  initProgressiveBlurLayers();
  initStepJourney();
  initCodeDisclosure();
  initKineticCursor();
}

function initFooterReturn() {
  const returnButton = document.querySelector('.site-footer-top');

  if (!returnButton) {
    return;
  }

  returnButton.addEventListener('click', event => {
    event.preventDefault();

    if (window.tschoolLenis && smoothScrollEnabled()) {
      window.tschoolLenis.scrollTo(0, {
        duration: MOTION_CONFIG.footerReturnScrollDuration
      });
      return;
    }

    window.scrollTo({
      top: 0,
      behavior: smoothScrollEnabled() ? 'smooth' : 'auto'
    });
  });
}

function initProgressiveBlurLayers() {
  const steps = Array.from(document.querySelectorAll('.journey-step'));

  steps.forEach(step => {
    const createFog = (className, layerClassName) => {
      if (step.querySelector(`:scope > .${className}`)) return;

      const fog = document.createElement('span');
      fog.className = className;
      fog.setAttribute('aria-hidden', 'true');

      for (let index = 0; index < 5; index += 1) {
        const layer = document.createElement('span');
        layer.className = `${layerClassName} ${layerClassName}-${index + 1}`;
        fog.append(layer);
      }

      step.append(fog);
    };

    createFog('progressive-blur', 'progressive-blur-layer');
    createFog('past-progressive-blur', 'past-progressive-blur-layer');
  });

  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('has-blur-visibility-observer');
    steps.forEach(step => step.classList.add('is-blur-rendering-active'));

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('is-blur-rendering-active', entry.isIntersecting);
      });
    }, {
      // Keep the effect ready before it can enter the visible viewport.
      rootMargin: '100% 0px'
    });

    steps.forEach(step => observer.observe(step));
  }
}

function initSmoothScroll() {
  const canSmooth = smoothScrollEnabled();

  if (!canSmooth || typeof window.Lenis !== 'function') {
    return;
  }

  const touchInput = window.matchMedia('(pointer: coarse)').matches;

  const lenis = new window.Lenis({
    duration: MOTION_CONFIG.scrollDuration,
    smoothWheel: true,
    wheelMultiplier: MOTION_CONFIG.scrollWheelMultiplier,
    touchMultiplier: MOTION_CONFIG.scrollTouchMultiplier,
    syncTouch: touchInput,
    syncTouchLerp: MOTION_CONFIG.scrollLerpTouch,
    touchInertiaExponent: MOTION_CONFIG.scrollTouchInertiaExponent,
    overscroll: false,
    anchors: true,
    virtualScroll: payload => {
      const boundaryHandler = window.tschoolBoundaryVirtualScroll;
      return typeof boundaryHandler === 'function' ? boundaryHandler(payload) : true;
    }
  });

  window.tschoolLenis = lenis;

  let frameId = 0;
  let frameLoopActive = false;

  function requestLenisFrame() {
    if (frameId || document.hidden) {
      return;
    }

    if (!frameLoopActive) {
      // Lenis derives its delta from the previous timestamp. Reset the clock
      // when waking from idle so the first frame cannot jump by the idle time.
      lenis.time = performance.now();
      frameLoopActive = true;
    }

    frameId = requestAnimationFrame(raf);
  }

  function raf(time) {
    frameId = 0;
    lenis.raf(time);

    if (lenis.isScrolling === 'smooth') {
      frameId = requestAnimationFrame(raf);
      return;
    }

    frameLoopActive = false;
  }

  // A wheel/touch gesture reaches this event before Lenis creates its smooth
  // animation, so one requested frame is enough to start the event-driven loop.
  lenis.on('virtual-scroll', requestLenisFrame);

  // Programmatic navigation does not emit virtual-scroll. Keep the public
  // instance API intact while ensuring those animations also wake the loop.
  const scrollTo = lenis.scrollTo.bind(lenis);
  lenis.scrollTo = (...args) => {
    const result = scrollTo(...args);
    requestLenisFrame();
    return result;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      frameLoopActive = false;
      return;
    }

    if (lenis.isScrolling === 'smooth') {
      requestLenisFrame();
    }
  });
}

function initHeroScroll() {
  const stage = document.getElementById('hero-stage');
  const tiles = Array.from(document.querySelectorAll('.transfer-tile'));
  const paperTrack = stage?.querySelector('.hero-paper-track');
  const visual = stage?.querySelector('.hero-visual');
  const scheduleBoard = stage?.querySelector('.schedule-board');
  const calendarBoard = stage?.querySelector('.calendar-board');
  const mobileTileAnchors = [
    { x: 0.12, y: 0.3 },
    { x: 0.18, y: 0.56 },
    { x: 0.1, y: 0.82 }
  ];

  if (!stage || !visual || !paperTrack || tiles.length === 0) {
    return;
  }

  const narrowQuery = window.matchMedia('(max-width: 760px)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frameRequested = false;
  let renderingActive = true;
  let layoutDirty = true;
  let layout = null;
  let previousProgress = Number.NaN;

  function measureLayout() {
    const width = visual.clientWidth || window.innerWidth;
    const isNarrow = narrowQuery.matches;
    const reducedMotion = reducedMotionQuery.matches;
    const animationEnd = Math.min(
      1,
      MOTION_CONFIG.heroTileTravel + MOTION_CONFIG.heroTileStagger * (tiles.length - 1)
    );
    const scheduleMetrics = scheduleBoard
      ? {
          left: scheduleBoard.offsetLeft,
          top: scheduleBoard.offsetTop,
          width: scheduleBoard.offsetWidth,
          height: scheduleBoard.offsetHeight
        }
      : null;
    const calendarMetrics = calendarBoard
      ? {
          left: calendarBoard.offsetLeft,
          width: calendarBoard.offsetWidth
        }
      : null;
    const tileSizes = tiles.map(tile => ({
      width: tile.offsetWidth,
      height: tile.offsetHeight
    }));
    const measuredDistance = scheduleMetrics && calendarMetrics
      ? calendarMetrics.left - scheduleMetrics.left
      : 0;
    const desktopDistanceX = measuredDistance > 0 ? measuredDistance : width * 0.55;
    const tileDistances = tiles.map((tile, index) => {
      const mobileAnchor = mobileTileAnchors[index];
      const tileSize = tileSizes[index];

      if (isNarrow && scheduleMetrics && calendarMetrics && mobileAnchor) {
        const startInsetX = Math.min(
          scheduleMetrics.width * mobileAnchor.x,
          Math.max(4, scheduleMetrics.width - tileSize.width - 4)
        );
        const startInsetY = Math.min(
          scheduleMetrics.height * mobileAnchor.y,
          Math.max(4, scheduleMetrics.height - tileSize.height - 4)
        );
        const startLeft = scheduleMetrics.left + startInsetX;
        const endInset = Math.min(
          calendarMetrics.width * mobileAnchor.x,
          Math.max(4, calendarMetrics.width - tileSize.width - 4)
        );

        tile.style.left = `${startLeft}px`;
        tile.style.top = `${scheduleMetrics.top + startInsetY}px`;

        return {
          x: calendarMetrics.left + endInset - startLeft,
          y: 0
        };
      }

      tile.style.removeProperty('left');
      tile.style.removeProperty('top');
      return {
        x: desktopDistanceX,
        y: (index + 1) * 5
      };
    });

    layout = {
      animationEnd,
      isNarrow,
      paperTravelRatio: isNarrow
        ? MOTION_CONFIG.heroMobilePaperTravelRatio
        : MOTION_CONFIG.heroDesktopPaperTravelRatio,
      reducedMotion,
      tileDistances,
      viewportHeight: window.visualViewport?.height || window.innerHeight,
      width
    };
    layoutDirty = false;
  }

  function update() {
    frameRequested = false;

    if (!renderingActive) {
      return;
    }

    const rect = stage.getBoundingClientRect();
    const needsLayout = layoutDirty || !layout;

    if (needsLayout) {
      measureLayout();
    }

    const distance = Math.max(1, rect.height - layout.viewportHeight);
    const progress = clamp(-rect.top / distance, 0, 1);

    if (!needsLayout && Math.abs(progress - previousProgress) < 0.0001) {
      return;
    }

    previousProgress = progress;
    const paperProgress = layout.reducedMotion
      ? 0
      : clamp(progress / layout.animationEnd, 0, 1);
    const paperTravel = layout.width * layout.paperTravelRatio * paperProgress;
    paperTrack.style.transform = `translate3d(${-paperTravel}px, 0, 0)`;

    tiles.forEach((tile, index) => {
      const localProgress = layout.reducedMotion
        ? 0
        : clamp((progress - index * MOTION_CONFIG.heroTileStagger) / MOTION_CONFIG.heroTileTravel, 0, 1);
      const eased = localProgress * localProgress * localProgress * (localProgress * (localProgress * 6 - 15) + 10);
      const arc = Math.sin(Math.PI * eased) * (layout.isNarrow ? 0 : -30);
      const tileDistance = layout.tileDistances[index];
      tile.style.transform = `translate3d(${tileDistance.x * eased}px, ${arc + tileDistance.y * eased}px, 0)`;
    });

    stage.classList.toggle(
      'is-complete',
      !layout.reducedMotion && progress >= layout.animationEnd
    );
  }

  function requestUpdate() {
    if (renderingActive && !frameRequested) {
      frameRequested = true;
      requestAnimationFrame(update);
    }
  }

  function invalidateLayout() {
    layoutDirty = true;
    requestUpdate();
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', invalidateLayout, { passive: true });
  window.visualViewport?.addEventListener('resize', invalidateLayout, { passive: true });
  narrowQuery.addEventListener?.('change', invalidateLayout);
  reducedMotionQuery.addEventListener?.('change', invalidateLayout);

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(invalidateLayout);
    resizeObserver.observe(stage);
    resizeObserver.observe(visual);
  }

  if ('IntersectionObserver' in window) {
    const intersectionObserver = new IntersectionObserver(entries => {
      renderingActive = entries[0]?.isIntersecting ?? true;
      stage.classList.toggle('is-rendering-paused', !renderingActive);

      if (renderingActive) {
        layoutDirty = true;
        requestUpdate();
      }
    }, {
      // Start rendering one viewport before the Hero can become visible.
      rootMargin: '100% 0px'
    });
    intersectionObserver.observe(stage);
  }

  update();
}

function initStepJourney() {
  const steps = Array.from(document.querySelectorAll('.journey-step'));
  const startButton = document.getElementById('start-config');
  const wizard = document.getElementById('wizard');

  if (steps.length === 0) {
    return;
  }

  let activeStep = 1;
  let maxUnlockedStep = 1;
  let renderedUnlockedStep = 0;
  let frameRequested = false;
  let automatedTargetStep = 0;
  let navigationTargetStep = 0;
  let navigationFocusReleaseTimer = 0;
  // Lenis can briefly rebound while settling. Keep focus moving with the
  // user's latest scroll intent so adjacent steps do not trade focus.
  let focusInputDirection = 0;
  let compositionActive = false;
  let journeyGeometryDirty = true;
  let journeyGeometry = null;
  let activeSectionTransition = null;
  let preserveActiveStepAfterLayout = false;
  const completionStates = new Map([
    [2, 'initial'],
    [3, 'initial'],
    [4, 'initial']
  ]);
  const completionCopy = {
    2: {
      initial: '選好了 ↵',
      review: '再檢查一遍確認沒問題 ↵',
      confirmed: '再檢查一遍確認沒問題 ↵'
    },
    3: {
      initial: 'Email 和通知時間都沒錯 ↵',
      correction: '修正 Email ↵',
      confirmed: 'Email 和通知時間都沒錯 ↵'
    },
    4: {
      initial: '產生安裝程式碼 ↵',
      confirmed: '產生安裝程式碼 ↵'
    }
  };

  function clearActiveSectionTransition(options = {}) {
    const transition = activeSectionTransition;

    if (!transition) {
      return;
    }

    if (transition.timerId) {
      clearTimeout(transition.timerId);
    }

    transition.previous?.classList.remove('is-transitioning-to-past');
    transition.target?.classList.remove('is-entering');

    if (automatedTargetStep === transition.targetStep) {
      automatedTargetStep = 0;
    }

    activeSectionTransition = null;

    if (options.requestUpdate !== false) {
      requestUpdate();
    }
  }

  function getCompletionButton(stepNumber) {
    return document.querySelector(`[data-complete-step="${stepNumber}"]`);
  }

  function setCompletionState(stepNumber, nextState) {
    const button = getCompletionButton(stepNumber);
    const labels = completionCopy[stepNumber];

    if (!button || !labels || !labels[nextState]) return;

    completionStates.set(stepNumber, nextState);
    button.textContent = labels[nextState];
    button.classList.toggle('is-review', nextState === 'review');
    button.classList.toggle('is-correction', nextState === 'correction');
    button.classList.toggle('is-confirmed', nextState === 'confirmed');
    button.setAttribute('aria-pressed', String(nextState === 'confirmed'));
    button.dataset.cursorLabel = nextState === 'review'
      ? '再次確認選課'
      : nextState === 'correction'
        ? '修正 Email'
        : stepNumber === 2
          ? '確認選課'
          : stepNumber === 3
            ? '確認通知設定'
            : '產生安裝程式碼';
  }

  function activateCompletionButton(button) {
    if (!button || button.disabled) return;

    const completedStep = Number(button.dataset.completeStep);

    if (
      completedStep === 2 &&
      (!state.sourceSummary || state.sourceLoading || state.sourceError)
    ) {
      showToast(state.sourceError ? '請先重新讀取課表' : '課表仍在讀取中');
      return;
    }

    if (completedStep === 3 && !validateNotificationEmail()) {
      setCompletionState(3, 'correction');
      focusEmailBeforeDomain();
      elements.notificationEmail.reportValidity();
      return;
    }

    if (completedStep === 2 && completionStates.get(2) === 'initial') {
      setCompletionState(2, 'review');
      return;
    }

    setCompletionState(completedStep, 'confirmed');
    unlockAndScrollToStep(completedStep + 1);
  }

  function resetCompletionAfterChange(changedStep) {
    if (changedStep === 2) {
      setCompletionState(2, 'initial');
      setCompletionState(4, 'initial');
    } else if (changedStep === 3) {
      if (completionStates.get(3) !== 'correction') {
        setCompletionState(3, 'initial');
      }
      setCompletionState(4, 'initial');
    } else {
      return;
    }

    if (maxUnlockedStep <= changedStep) return;

    clearActiveSectionTransition({ requestUpdate: false });
    resetScrollMomentum();
    automatedTargetStep = 0;
    maxUnlockedStep = changedStep;
    setActiveStep(Math.min(activeStep, changedStep));
    window.tschoolLenis?.resize?.();
    clampToCurrentBoundary();
    requestUpdate();
  }

  function setStageMenuOpen(open, returnFocus) {
    if (!elements.stageMenuTrigger || !elements.stageMenuPanel) {
      return;
    }

    elements.stageMenuTrigger.setAttribute('aria-expanded', String(open));
    elements.stageMenuTrigger.dataset.cursorLabel = open ? '關閉階段選單' : '開啟階段選單';
    elements.stageMenuPanel.hidden = !open;
    elements.stageMenu?.classList.toggle('is-open', open);

    if (open) {
      const currentItem = elements.stageMenuItems.find(item => item.getAttribute('aria-current') === 'step');
      (currentItem || elements.stageMenuItems[0])?.focus();
    } else if (returnFocus) {
      elements.stageMenuTrigger.focus();
    }
  }

  function getStepScrollTarget(target, stepNumber) {
    const offset = window.matchMedia('(max-width: 600px)').matches ? 72 : 96;
    const stepTop = getJourneyGeometry().stepTops[stepNumber - 1];
    const naturalTarget = Number.isFinite(stepTop)
      ? stepTop - offset
      : target.getBoundingClientRect().top + window.scrollY - offset;
    const maximumScrollY = getMaximumScrollY();

    return stepNumber === maxUnlockedStep && Number.isFinite(maximumScrollY)
      ? Math.min(naturalTarget, maximumScrollY)
      : naturalTarget;
  }

  function focusStepHeading(step, duration) {
    const heading = step.querySelector('h2');

    if (!heading) {
      return;
    }

    heading.setAttribute('tabindex', '-1');
    window.setTimeout(() => heading.focus({ preventScroll: true }), duration);
  }

  function clearNavigationFocusLock(options = {}) {
    const targetStep = navigationTargetStep;

    if (navigationFocusReleaseTimer) {
      clearTimeout(navigationFocusReleaseTimer);
      navigationFocusReleaseTimer = 0;
    }

    navigationTargetStep = 0;

    if (options.preserveTarget === true && targetStep) {
      setActiveStep(Math.min(targetStep, maxUnlockedStep));
      requestUpdate({ preserveActiveStep: true });
    }
  }

  function scrollToStep(stepNumber, options) {
    if (stepNumber < 1 || stepNumber > maxUnlockedStep) {
      return;
    }

    const target = steps[stepNumber - 1];
    const duration = options && Number.isFinite(options.duration)
      ? options.duration
      : MOTION_CONFIG.sectionTransitionDuration;

    if (!target) {
      return;
    }

    if (options?.preserveTransition !== true) {
      clearActiveSectionTransition({ requestUpdate: false });
    }

    clearNavigationFocusLock();
    const shouldLockFocus = options?.lockFocusDuringScroll === true;

    if (shouldLockFocus) {
      navigationTargetStep = stepNumber;
    }

    if (options?.preserveTransition !== true) {
      focusInputDirection = 0;
    }
    resetScrollMomentum();
    setActiveStep(stepNumber);
    invalidateJourneyGeometry();
    const scrollTarget = getStepScrollTarget(target, stepNumber);
    const focusDelay = smoothScrollEnabled() ? duration * 1000 : 0;

    if (window.tschoolLenis && smoothScrollEnabled()) {
      window.tschoolLenis.scrollTo(scrollTarget, { duration });
    } else {
      window.scrollTo({
        top: scrollTarget,
        behavior: smoothScrollEnabled() ? 'smooth' : 'auto'
      });
    }

    focusStepHeading(target, focusDelay);

    if (shouldLockFocus) {
      navigationFocusReleaseTimer = window.setTimeout(() => {
        if (navigationTargetStep === stepNumber) {
          clearNavigationFocusLock({ preserveTarget: true });
        }
      }, focusDelay + 80);
    }
  }

  function enterFirstStepWithPageScroll() {
    const target = steps[0];

    if (!target) {
      return;
    }

    resetScrollMomentum();
    const scrollTarget = getStepScrollTarget(target, 1);

    if (window.tschoolLenis && smoothScrollEnabled()) {
      window.tschoolLenis.scrollTo(scrollTarget, {
        duration: MOTION_CONFIG.homeEntryScrollDuration
      });
    } else {
      window.scrollTo({ top: scrollTarget, behavior: smoothScrollEnabled() ? 'smooth' : 'auto' });
    }
  }

  function setActiveStep(stepNumber) {
    const nextActiveStep = clamp(stepNumber, 1, maxUnlockedStep);
    const unlockedLayoutChanged = renderedUnlockedStep !== maxUnlockedStep;

    if (
      nextActiveStep === activeStep &&
      renderedUnlockedStep === maxUnlockedStep &&
      steps.some(step => step.classList.contains('is-current'))
    ) {
      return;
    }

    activeStep = nextActiveStep;
    renderedUnlockedStep = maxUnlockedStep;
    steps.forEach(step => {
      const number = Number(step.dataset.step);
      const distance = Math.abs(activeStep - number);
      step.classList.toggle('is-current', number === activeStep);
      step.classList.toggle('is-past', number < activeStep);
      step.classList.toggle('is-future', number > activeStep);
      step.classList.toggle('is-locked', number > maxUnlockedStep);
      step.classList.toggle('is-preview', number === maxUnlockedStep + 1);
      step.classList.toggle('is-concealed', number > maxUnlockedStep + 1);
      step.style.setProperty('--section-blur', `${distance === 0 ? 0 : Math.min(12, 2 + distance * 3)}px`);
      step.style.setProperty('--section-opacity', distance === 0 ? '1' : String(Math.max(0.28, 0.76 - distance * 0.14)));
      step.toggleAttribute('inert', number !== activeStep);
    });

    elements.stageMenuItems.forEach(item => {
      const targetStep = Number(item.dataset.stepTarget);
      const isCurrent = targetStep === activeStep;
      item.toggleAttribute('aria-current', isCurrent);
      if (isCurrent) item.setAttribute('aria-current', 'step');
      item.disabled = targetStep > maxUnlockedStep;
    });

    if (unlockedLayoutChanged) {
      invalidateJourneyGeometry();
    }
  }

  function unlockAndScrollToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > steps.length) {
      return;
    }

    clearActiveSectionTransition({ requestUpdate: false });
    resetScrollMomentum();
    maxUnlockedStep = Math.max(maxUnlockedStep, stepNumber);
    const target = steps[stepNumber - 1];
    const previous = steps[activeStep - 1];
    const shouldAnimatePastFog = Boolean(previous) && !prefersReducedMotion();
    focusInputDirection = Math.sign(stepNumber - activeStep);
    automatedTargetStep = stepNumber;

    if (shouldAnimatePastFog) {
      previous.classList.add('is-transitioning-to-past');
    }

    target.classList.add('is-entering');
    setActiveStep(stepNumber);
    const transition = {
      previous,
      target,
      targetStep: stepNumber,
      timerId: 0
    };
    activeSectionTransition = transition;
    void target.offsetWidth;

    requestAnimationFrame(() => {
      if (activeSectionTransition !== transition) {
        return;
      }

      window.tschoolLenis?.resize?.();
      requestAnimationFrame(() => {
        if (activeSectionTransition === transition) {
          scrollToStep(stepNumber, { preserveTransition: true });
        }
      });
    });

    const cleanupDelay = shouldAnimatePastFog
      ? MOTION_CONFIG.sectionTransitionDuration * 1000 + 40
      : 80;
    transition.timerId = window.setTimeout(() => {
      if (activeSectionTransition === transition) {
        clearActiveSectionTransition();
      }
    }, cleanupDelay);
  }

  function updateFromScroll() {
    frameRequested = false;
    const geometry = getJourneyGeometry();
    const maximumScrollY = geometry.maximumScrollY;

    if (clampToCurrentBoundary({}, maximumScrollY)) return;

    if (automatedTargetStep) {
      setActiveStep(automatedTargetStep);
      return;
    }

    if (navigationTargetStep) {
      setActiveStep(navigationTargetStep);
      return;
    }

    if (preserveActiveStepAfterLayout) {
      setActiveStep(Math.min(activeStep, maxUnlockedStep));
      return;
    }

    if (
      focusInputDirection >= 0 &&
      Number.isFinite(maximumScrollY) &&
      window.scrollY >= maximumScrollY - 1
    ) {
      setActiveStep(maxUnlockedStep);
      return;
    }

    if (
      wizard &&
      geometry.wizardTop - window.scrollY > window.innerHeight * 0.68
    ) {
      setActiveStep(1);
      return;
    }

    const focusLineY = window.scrollY + window.innerHeight * MOTION_CONFIG.focusLineRatio;
    let closestStep = activeStep;
    let closestDistance = Number.POSITIVE_INFINITY;

    geometry.stepFocusRanges.forEach((range, index) => {
      const number = index + 1;

      if (number > maxUnlockedStep) {
        return;
      }

      const distance = getDistanceToVerticalRange(focusLineY, range);
      if (distance < closestDistance) {
        closestStep = number;
        closestDistance = distance;
      }
    });

    if (closestStep === activeStep) {
      setActiveStep(activeStep);
      return;
    }

    const activeRange = geometry.stepFocusRanges[activeStep - 1];
    const activeDistance = getDistanceToVerticalRange(focusLineY, activeRange);
    const maximumHysteresis = closestStep < activeStep
      ? MOTION_CONFIG.focusSwitchHysteresisBackward
      : MOTION_CONFIG.focusSwitchHysteresisForward;
    const hysteresis = Math.min(maximumHysteresis, window.innerHeight * 0.09);
    const conflictsWithInputDirection =
      (focusInputDirection > 0 && closestStep < activeStep) ||
      (focusInputDirection < 0 && closestStep > activeStep);

    if (conflictsWithInputDirection) {
      setActiveStep(activeStep);
      return;
    }

    setActiveStep(
      closestDistance + hysteresis < activeDistance
        ? closestStep
        : activeStep
    );
  }

  function getJourneyGeometry() {
    if (!journeyGeometryDirty && journeyGeometry) {
      return journeyGeometry;
    }

    const documentMaximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const stepTops = steps.map(getDocumentLayoutTop);
    const stepFocusRanges = steps.map(step => {
      const card = step.querySelector(':scope > .step-card') || step;
      const top = getDocumentLayoutTop(card);
      return {
        top,
        bottom: top + card.offsetHeight
      };
    });
    const wizardTop = wizard ? getDocumentLayoutTop(wizard) : Number.POSITIVE_INFINITY;
    let maximumScrollY = documentMaximum;

    if (maxUnlockedStep < steps.length) {
      const boundaryStep = steps[maxUnlockedStep - 1];
      const boundaryCard = boundaryStep?.querySelector('.step-card');
      const boundaryElement = boundaryStep?.querySelector('.step-completion') || boundaryCard;
      const previewCard = steps[maxUnlockedStep]?.querySelector('.step-card');

      if (!boundaryElement) {
        maximumScrollY = Number.POSITIVE_INFINITY;
      } else {
        const isNarrow = window.matchMedia('(max-width: 600px)').matches;
        const previewPeek = isNarrow ? 72 : 112;
        const fallbackPadding = isNarrow ? 32 : 56;
        const boundaryBottom = getDocumentLayoutTop(boundaryElement) + boundaryElement.offsetHeight;
        const fallbackTarget = boundaryBottom - window.innerHeight + fallbackPadding;
        const cardCenterTarget = boundaryCard
          ? getDocumentLayoutTop(boundaryCard) + boundaryCard.offsetHeight / 2 - window.innerHeight / 2
          : fallbackTarget;
        const previewTarget = previewCard
          ? getDocumentLayoutTop(previewCard) - (window.innerHeight - previewPeek)
          : fallbackTarget;

        maximumScrollY = Math.min(
          documentMaximum,
          Math.max(0, fallbackTarget, cardCenterTarget, previewTarget)
        );
      }
    }

    journeyGeometry = {
      maximumScrollY,
      stepFocusRanges,
      stepTops,
      wizardTop
    };
    journeyGeometryDirty = false;
    return journeyGeometry;
  }

  function getMaximumScrollY() {
    return getJourneyGeometry().maximumScrollY;
  }

  function invalidateJourneyGeometry() {
    journeyGeometryDirty = true;
  }

  function getDocumentLayoutTop(element) {
    let top = 0;
    let current = element;

    while (current) {
      top += current.offsetTop;
      current = current.offsetParent;
    }

    return top;
  }

  function getDistanceToVerticalRange(position, range) {
    if (!range) {
      return Number.POSITIVE_INFINITY;
    }

    if (position < range.top) {
      return range.top - position;
    }

    if (position > range.bottom) {
      return position - range.bottom;
    }

    return 0;
  }

  function resetScrollMomentum() {
    const lenis = window.tschoolLenis;
    if (!lenis || !Number.isFinite(lenis.animatedScroll)) return;
    lenis.scrollTo(lenis.animatedScroll, { immediate: true, force: true });
  }

  function resetOpposingScrollMomentum(lenis, deltaY) {
    if (
      !lenis ||
      !Number.isFinite(lenis.targetScroll) ||
      !Number.isFinite(lenis.animatedScroll)
    ) {
      return;
    }

    const pendingDistance = lenis.targetScroll - lenis.animatedScroll;
    const hasOpposingMomentum =
      Math.abs(pendingDistance) > MOTION_CONFIG.boundarySnapDistance &&
      Math.sign(pendingDistance) !== Math.sign(deltaY);

    if (hasOpposingMomentum) {
      lenis.scrollTo(lenis.animatedScroll, {
        immediate: true,
        force: true
      });
    }
  }

  function clampToCurrentBoundary(options = {}, maximumScrollY = getMaximumScrollY()) {
    const lenis = window.tschoolLenis;

    if (lenis) {
      const isPastBoundary = lenis.targetScroll > maximumScrollY + MOTION_CONFIG.boundarySnapDistance ||
        lenis.animatedScroll > maximumScrollY + MOTION_CONFIG.boundarySnapDistance;

      if (!isPastBoundary) return false;

      lenis.scrollTo(maximumScrollY, {
        immediate: options.immediate === true,
        duration: MOTION_CONFIG.boundarySettleDuration,
        programmatic: false,
        force: true
      });
      return true;
    }

    if (window.scrollY <= maximumScrollY + 1) return false;
    window.scrollTo({ top: maximumScrollY, behavior: 'auto' });
    return true;
  }

  function handleBoundaryVirtualScroll(payload) {
    const event = payload?.event;
    const deltaY = Number(payload?.deltaY) || 0;

    if (deltaY !== 0) {
      focusInputDirection = Math.sign(deltaY);
      preserveActiveStepAfterLayout = false;
    }

    if (automatedTargetStep) {
      if (event?.cancelable) event.preventDefault();
      return false;
    }

    if (deltaY === 0) {
      return true;
    }

    const maximumScrollY = getMaximumScrollY();
    const lenis = window.tschoolLenis;

    if (!lenis || !Number.isFinite(maximumScrollY)) {
      return true;
    }

    resetOpposingScrollMomentum(lenis, deltaY);

    // Once every step is unlocked there is no card-specific boundary. Lenis'
    // native document limit is the only bottom boundary and already prevents
    // overscroll without introducing a second settling animation.
    if (deltaY < 0 || maxUnlockedStep >= steps.length) {
      return true;
    }

    const currentTarget = Number.isFinite(lenis?.targetScroll) ? lenis.targetScroll : window.scrollY;
    const remaining = maximumScrollY - currentTarget;

    function settleAtBoundary() {
      if (event?.cancelable) event.preventDefault();
      lenis.scrollTo(maximumScrollY, {
        duration: MOTION_CONFIG.boundarySettleDuration,
        programmatic: false,
        force: true
      });
      return false;
    }

    if (remaining <= MOTION_CONFIG.boundarySnapDistance) {
      return settleAtBoundary();
    }

    if (deltaY >= remaining - MOTION_CONFIG.boundarySnapDistance) {
      return settleAtBoundary();
    }

    // Leave payload.deltaY untouched: Lenis retains the full final distance and
    // its duration/easing only stretches the time needed to reach that target.
    return true;
  }

  function requestUpdate(options = {}) {
    if (options.preserveActiveStep === true) {
      preserveActiveStepAfterLayout = true;
    }

    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(updateFromScroll);
    }
  }

  document.addEventListener('click', event => {
    const navigationButton = event.target.closest('[data-step-target]');
    const editButton = event.target.closest('[data-edit-step]');
    const completionButton = event.target.closest('[data-complete-step]');

    if (navigationButton && !navigationButton.disabled) {
      scrollToStep(Number(navigationButton.dataset.stepTarget), {
        lockFocusDuringScroll: true
      });
      if (elements.stageMenu?.contains(navigationButton)) setStageMenuOpen(false, false);
    }
    if (editButton) {
      scrollToStep(Number(editButton.dataset.editStep), {
        lockFocusDuringScroll: true
      });
    }

    if (completionButton) {
      activateCompletionButton(completionButton);
    }

    if (
      elements.stageMenu &&
      !elements.stageMenu.contains(event.target) &&
      elements.stageMenuTrigger?.getAttribute('aria-expanded') === 'true'
    ) {
      setStageMenuOpen(false, false);
    }
  });

  elements.stageMenuTrigger?.addEventListener('click', () => {
    const open = elements.stageMenuTrigger.getAttribute('aria-expanded') !== 'true';
    setStageMenuOpen(open, false);
  });

  document.addEventListener('compositionstart', () => {
    compositionActive = true;
  });

  document.addEventListener('compositionend', () => {
    compositionActive = false;
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && elements.stageMenuTrigger?.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      setStageMenuOpen(false, true);
      return;
    }

    if (
      event.key !== 'Enter' ||
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      compositionActive ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const interactiveTarget = target?.closest([
      'input',
      'textarea',
      'select',
      'button',
      'a',
      'label',
      'summary',
      '[contenteditable]:not([contenteditable="false"])',
      '[role="button"]',
      '[role="link"]',
      '[role="textbox"]',
      '[role="combobox"]'
    ].join(','));

    if (interactiveTarget) return;

    if (activeStep === 5 && elements.copyCode && !elements.copyCode.disabled) {
      event.preventDefault();
      playCopyKeyboardPressFeedback();
      elements.copyCode.click();
      return;
    }

    const completionButton = steps[activeStep - 1]?.querySelector('[data-complete-step]');
    if (!completionButton || completionButton.disabled) {
      return;
    }

    event.preventDefault();
    completionButton.click();
  });

  document.addEventListener('tschool:configuration-change', event => {
    resetCompletionAfterChange(Number(event.detail?.step));
  });

  document.addEventListener('tschool:grade-selection-start', () => {
    clearActiveSectionTransition({ requestUpdate: false });
    clearNavigationFocusLock();
    focusInputDirection = 0;
    resetScrollMomentum();
    automatedTargetStep = 0;
    maxUnlockedStep = 1;
    setCompletionState(2, 'initial');
    setCompletionState(4, 'initial');
    setActiveStep(1);
    clampToCurrentBoundary();
  });

  document.addEventListener('tschool:grade-ready', event => {
    if (
      event.detail?.gradeName !== getCurrentGrade() ||
      !state.sourceSummary ||
      state.sourceLoading ||
      state.sourceError
    ) {
      return;
    }

    unlockAndScrollToStep(2);
  });

  if (startButton) {
    startButton.addEventListener('click', enterFirstStepWithPageScroll);
  }

  window.tschoolBoundaryVirtualScroll = handleBoundaryVirtualScroll;

  const releaseLayoutFocusOnScrollInput = event => {
    clearNavigationFocusLock();
    const deltaY = Number(event.deltaY);
    if (Number.isFinite(deltaY) && deltaY !== 0) {
      focusInputDirection = Math.sign(deltaY);
    }
    preserveActiveStepAfterLayout = false;
  };
  const releaseLayoutFocusOnScrollKey = event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      clearNavigationFocusLock();
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) {
        focusInputDirection = -1;
      } else {
        focusInputDirection = 1;
      }
      preserveActiveStepAfterLayout = false;
    }
  };

  window.addEventListener('wheel', releaseLayoutFocusOnScrollInput, { passive: true });
  window.addEventListener('touchmove', releaseLayoutFocusOnScrollInput, { passive: true });
  window.addEventListener('keydown', releaseLayoutFocusOnScrollKey, { passive: true });
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', () => {
    window.tschoolLenis?.resize?.();
    invalidateJourneyGeometry();
    clampToCurrentBoundary({ immediate: true });
    requestUpdate({ preserveActiveStep: true });
  });

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(() => {
      invalidateJourneyGeometry();
      requestUpdate({ preserveActiveStep: true });
    });
    resizeObserver.observe(document.body);
  }

  setActiveStep(1);
  updateFromScroll();
}

function initCodeDisclosure() {
  if (!elements.fullCodeToggle || !elements.codeWindow) {
    return;
  }

  elements.fullCodeToggle.addEventListener('click', () => {
    const expanded = elements.codeWindow.classList.toggle('is-expanded');
    const label = expanded ? '收合完整程式碼' : '查看完整程式碼';
    elements.fullCodeToggle.textContent = label;
    elements.fullCodeToggle.dataset.cursorLabel = label;
    elements.fullCodeToggle.setAttribute('aria-expanded', String(expanded));

    if (!expanded) {
      elements.generatedCode.scrollTop = 0;
    }
  });
}

function renderSettingsSummary() {
  if (!elements.settingsSummary) {
    return;
  }

  const selected = Array.from(getSelectedCourses()).sort(compareByTraditionalStroke);
  const catalog = state.sourceSummary?.catalog || { courses: [], activities: [] };
  const selectedActivities = catalog.activities
    .filter(item => isActivitySelected(item.title))
    .map(item => item.title)
    .sort(compareByTraditionalStroke);
  const unselectedCourses = catalog.courses
    .filter(item => !getSelectedCourses().has(item.title))
    .map(item => item.title)
    .sort(compareByTraditionalStroke);
  const unselectedActivities = catalog.activities
    .filter(item => !isActivitySelected(item.title))
    .map(item => item.title)
    .sort(compareByTraditionalStroke);
  const selectedItems = selected.concat(selectedActivities).sort(compareByTraditionalStroke);
  const unselectedItems = unselectedCourses.concat(unselectedActivities).sort(compareByTraditionalStroke);
  const email = elements.notificationEmail.value.trim();
  const hasValidEmail = isValidNotificationEmail(email);
  const notificationTimes = getSelectedNotifyHours()
    .map(hour => `${pad2(hour)}:00`);
  const grade = getCurrentGrade();

  elements.settingsSummary.innerHTML = [
    renderSummaryRow([
      ['你選的年級是：', grade ? [grade] : ['尚未選擇'], grade ? '' : 'is-error']
    ], 1, '修改年級'),
    renderSummaryRow([
      ['你選的課程與活動有：', selectedItems.length ? selectedItems : '尚未選擇'],
      ['你「沒」選的課程與活動有：', unselectedItems]
    ], 2, '修改課程與活動'),
    renderSummaryRow([
      ['你想用來收通知的 Email 是：', [email || '未填寫'], hasValidEmail ? '' : 'is-error'],
      ['你想收到通知的時間是：', notificationTimes]
    ], 3, '修改通知偏好')
  ].join('');
}

function renderSummaryRow(lines, editStep, editLabel) {
  return [
    '<section class="summary-row-component">',
    '<div class="summary-row-copy">',
    lines.map(([label, value, tone]) => [
      '<div class="summary-line">',
      `<strong>${escapeHtml(label)}</strong>`,
      renderSummaryValue(value, tone),
      '</div>'
    ].join('')).join(''),
    '</div>',
    `<button type="button" class="icon-button summary-edit" data-edit-step="${editStep}" data-cursor-label="修改" aria-label="${escapeHtml(editLabel)}"><img src="assets/icon-arrow-up-right.svg" alt=""></button>`,
    '</section>'
  ].join('');
}

function renderSummaryValue(value, tone) {
  const items = Array.isArray(value) ? value : [value];
  return [
    `<span class="summary-value summary-tag-list${tone ? ` ${tone}` : ''}">`,
    items.map(item => `<span class="summary-item-tag">${escapeHtml(item)}</span>`).join(''),
    '</span>'
  ].join('');
}

function initKineticCursor() {
  const cursor = document.getElementById('kinetic-cursor');
  const pointer = cursor ? cursor.querySelector('.cursor-pointer') : null;
  const caption = cursor ? cursor.querySelector('.cursor-caption') : null;
  const enabled = window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches;

  if (!cursor || !pointer || !caption || !enabled) {
    return;
  }

  document.documentElement.classList.add('has-kinetic-cursor');

  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let currentX = targetX;
  let currentY = targetY;
  let previousX = targetX;
  let previousY = targetY;
  let targetAngle = 0;
  let currentAngle = 0;
  let cursorVelocity = 0;
  let targetCursorVelocity = 0;
  let visible = false;
  let frameId = 0;
  let contextTarget = null;

  function cursorSurfaceIsDark(target) {
    let element = target instanceof Element ? target : target?.parentElement;

    while (element) {
      const color = window.getComputedStyle(element).backgroundColor;
      const channels = color.match(/[\d.]+/g)?.map(Number) || [];
      const alpha = channels.length > 3 ? channels[3] : 1;

      if (channels.length >= 3 && alpha > 0.08) {
        const [red, green, blue] = channels.slice(0, 3).map(value => {
          const normalized = value / 255;
          return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
        });
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        return luminance < 0.34;
      }

      element = element.parentElement;
    }

    return false;
  }

  function updateCursorContext(target, force = false) {
    if (!force && target === contextTarget) {
      return;
    }

    contextTarget = target;
    const labelled = target && target.closest ? target.closest('[data-cursor-label]') : null;
    const textTarget = target && target.closest
      ? target.closest('input:not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"], [data-cursor-mode="text"]')
      : null;

    cursor.classList.toggle('has-label', Boolean(labelled) && !textTarget);
    cursor.classList.toggle('is-text', Boolean(textTarget));
    cursor.classList.toggle('is-on-dark', cursorSurfaceIsDark(target));
    cursor.classList.toggle(
      'has-success-label',
      Boolean(labelled) && !textTarget && labelled.dataset.cursorTone === 'success'
    );
    caption.textContent = labelled && !textTarget ? labelled.dataset.cursorLabel : '';
  }

  function updateTarget(event) {
    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;
    targetX = event.clientX;
    targetY = event.clientY;

    if (Math.hypot(dx, dy) > 1.5) {
      targetAngle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    }

    targetCursorVelocity = clamp(Math.hypot(dx, dy) / 34, 0, 1);

    previousX = event.clientX;
    previousY = event.clientY;
    updateCursorContext(event.target);

    if (!visible) {
      visible = true;
      cursor.style.opacity = '1';
      currentX = targetX;
      currentY = targetY;
    }

    requestCursorFrame();
  }

  function requestCursorFrame() {
    if (!frameId && visible && !document.hidden) {
      frameId = requestAnimationFrame(animate);
    }
  }

  function animate() {
    frameId = 0;
    currentX += (targetX - currentX) * MOTION_CONFIG.cursorPositionEase;
    currentY += (targetY - currentY) * MOTION_CONFIG.cursorPositionEase;
    let angleDelta = ((targetAngle - currentAngle + 540) % 360) - 180;
    currentAngle += angleDelta * MOTION_CONFIG.cursorAngleEase;
    cursorVelocity += (targetCursorVelocity - cursorVelocity) * 0.24;
    targetCursorVelocity *= 0.82;
    cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    cursor.style.setProperty('--cursor-angle', cursor.classList.contains('is-text') ? '0deg' : `${currentAngle}deg`);
    cursor.style.setProperty('--cursor-lens-stretch', (1 + cursorVelocity * 0.22).toFixed(3));
    cursor.style.setProperty('--cursor-lens-squash', (1 - cursorVelocity * 0.08).toFixed(3));

    angleDelta = ((targetAngle - currentAngle + 540) % 360) - 180;
    const motionPending =
      Math.hypot(targetX - currentX, targetY - currentY) > 0.08 ||
      Math.abs(angleDelta) > 0.08 ||
      Math.abs(cursorVelocity) > 0.004 ||
      Math.abs(targetCursorVelocity) > 0.004;

    if (motionPending) {
      requestCursorFrame();
    }
  }

  window.addEventListener('mousemove', updateTarget, { passive: true });
  window.addEventListener('scroll', () => {
    updateCursorContext(document.elementFromPoint(targetX, targetY));
  }, { passive: true });
  document.addEventListener('tschool:cursor-context-change', event => {
    updateCursorContext(
      event.detail?.target || document.elementFromPoint(targetX, targetY),
      true
    );
  });
  document.addEventListener('mouseleave', () => {
    visible = false;
    cursor.style.opacity = '0';
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  });
  document.addEventListener('mouseenter', () => {
    if (visible) cursor.style.opacity = '1';
  });
  document.addEventListener('mousedown', () => cursor.style.setProperty('--cursor-scale', '0.76'));
  document.addEventListener('mouseup', () => cursor.style.setProperty('--cursor-scale', '1'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      return;
    }

    requestCursorFrame();
  });
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function smoothScrollEnabled() {
  return ENABLE_SMOOTH_SCROLL && !prefersReducedMotion();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSearchText(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .toLowerCase();
}

function compareByTraditionalStroke(first, second) {
  return TRADITIONAL_CHINESE_STROKE_COLLATOR.compare(
    String(first || ''),
    String(second || '')
  );
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

init();
