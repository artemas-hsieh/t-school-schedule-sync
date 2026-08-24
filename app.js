const DEFAULTS = {
  gradeName: '',
  notificationEmail: '@tschool.tp.edu.tw',
  syncHours: [6],
  notifyHour: 6,
  instantNotificationsEnabled: true,
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

const KNOWN_ACADEMIC_TERM_STARTS = Object.freeze([
  { term: '114-2', year: 2026, monthIndex: 1, day: 23 },
  { term: '115-1', year: 2026, monthIndex: 7, day: 31 },
  { term: '115-2', year: 2027, monthIndex: 1, day: 11 }
]);

const GOOGLE_DOCS_TEMPLATE_COPY_URL =
  'https://docs.google.com/document/d/1l4SCo0Z8cDgy1F0wvc74exuBIES4MHRO8F08GiqqZgA/copy';
const COURSE_SEARCH_ICON_URL = 'assets/icon-search.svg';
const COURSE_SEARCH_CANCEL_ICON_URL = 'assets/icon-x.svg';
const MAX_NOTIFY_HOURS = 4;
const MAX_MAILTO_URL_LENGTH = 12000;
const SETUP_CODE_EMAIL_SUBJECT = '設定指引｜T-SCHOOL Schedule Sync';
const SETUP_CODE_FILE_NAME = 'T-SCHOOL-Schedule-Sync-設定碼.txt';
const SCHOOL_EMAIL_DOMAIN = '@tschool.tp.edu.tw';
const SCHOOL_EMAIL_PATTERN =
  /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@tschool\.tp\.edu\.tw$/;
// Journey tuning: each completed section reveals the next one in the vertical narrative.
// Manual input uses frame-based Lenis interpolation so a missed frame extends
// the settle time instead of jumping forward to catch a fixed duration.
// Locked-step boundaries cap the final target without damping repeated input.
const MOTION_CONFIG = Object.freeze({
  sectionTransitionDuration: 1,
  scrollLerp: 0.14,
  scrollWheelMultiplier: 1,
  scrollTouchLerp: 0.075,
  scrollTouchMultiplier: 1,
  scrollTouchInertiaExponent: 1.7,
  boundarySettleLerp: 0.18,
  boundarySnapDistance: 1.5,
  initialBoundaryMinLerp: 0.12,
  initialBoundaryBlendDistanceRatio: 0.55,
  inputViewportSettleDelay: 120,
  focusLineRatio  : 0.5,
  focusSwitchHysteresisForward: 48,
  focusSwitchHysteresisBackward: 96,
  generatedCodeTransitionDelay: 48,
  homeEntryScrollDuration: 1.6,
  homeEntryHeroTimeRatio: 2 / 3,
  footerReturnScrollDuration: 3.25,
  heroTileTravel: 0.72,
  heroTileStagger: 0.08,
  heroScrambleInterval: 72,
  heroTileArrivalScrambleDuration: 400,
  heroDesktopPaperTravelRatio: 0.06,
  heroMobilePaperTravelRatio: 0.13,
  heroDesktopTileArc: -30,
  heroMobileTileArc: -12,
  heroRenderRootMargin: '640px 0px',
  heroTiltMaxX: 4,
  heroTiltMaxY: 8,
  heroTiltEase: 0.1,
  heroTiltShadowTravel: 3,
  cursorPositionEase: 0.38,
  cursorAngleEase: 0.3,
  // Native macOS pointer tilt; sway values below control movement feedback.
  cursorBaseAngle: -24,
  cursorSwayMaxAngle: 64,
  cursorSwayVelocityScale: 0.8,
  cursorSwayReturn: 0.9
});

/*
 * Hero paper and connector tuning:
 * - anchor ratios run from 0 (top edge) to 1 (bottom edge).
 * - separation values are the horizontal pixels moved by EACH paper.
 * - rotation deltas are added to the two base paper rotations.
 * - start/end progress use the normalized Hero paper animation timeline.
 */
const HERO_PAPER_MOTION_CONFIG = Object.freeze({
  scheduleBaseRotation: -1.7,
  calendarBaseRotation: 1.2,
  scheduleConnectorAnchor: 0.58,
  calendarConnectorAnchor: 0.42,
  connectorOverlap: 2,
  separationStartProgress: 0.08,
  separationEndProgress: 0.82,
  desktopSeparationPerPaper: 8,
  mobileSeparationPerPaper: 10,
  scheduleRotationDelta: -0.45,
  calendarRotationDelta: 0.55
});

document.documentElement.style.setProperty(
  '--section-transition-duration',
  `${MOTION_CONFIG.sectionTransitionDuration}s`
);

const state = {
  selectedTitlesByGrade: new Map(),
  defaultSelectionSeededByGrade: new Set(),
  sourceByGrade: new Map(),
  sourceSummary: null,
  sourceLoading: false,
  sourceError: null,
  requestId: 0,
  generatedCodeReady: false,
  emailSetupTransferEnabled: false,
  customNotificationHours: DEFAULTS.syncHours.slice()
};

let notificationEmailCommitTimer = 0;

const elements = {
  form: document.querySelector('#config-form'),
  notificationEmail: document.querySelector('#notification-email'),
  instantNotifications: document.querySelector('#instant-notifications'),
  notifyHoursList: document.querySelector('#notify-hours-list'),
  courseSearch: document.querySelector('#course-search'),
  courseSearchSubmit: document.querySelector('#course-search-submit'),
  courseSearchIcon: document.querySelector('#course-search-icon'),
  courseList: document.querySelector('#course-list'),
  courseCount: document.querySelector('#course-count'),
  notificationSelectionCount: document.querySelector('#notification-selection-count'),
  generatedCode: document.querySelector('#setup-code'),
  copyCode: document.querySelector('#copy-setup-code'),
  copyCodeStep: document.querySelector('#copy-setup-code-step'),
  outputStep: document.querySelector('#step-5'),
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
  docsTemplateLink: document.querySelector('#docs-template-link')
};

function init() {
  initViewportMetrics();
  elements.notificationEmail.value = DEFAULTS.notificationEmail;
  renderNotifyHours(DEFAULTS.syncHours);
  updateInstantNotificationState();
  updateNotifyHourState();
  configureDocsTemplateLink();
  configureSetupCodeTransfer();
  bindEvents();
  updateCourseSearchAction();
  setupValidation();
  initVisualExperience();
  renderCourses();
  updateOutput();
  renderSettingsSummary();
}

function initViewportMetrics() {
  let frameId = 0;
  let previousRoundedMetrics = null;
  const heroStage = document.getElementById('hero-stage');
  const toast = document.getElementById('toast');

  const update = () => {
    frameId = 0;
    const metrics = readVisualViewportMetrics();
    const roundedMetrics = {
      height: Math.round(metrics.height),
      keyboardHeight: Math.round(metrics.keyboardHeight),
      width: Math.round(metrics.width)
    };
    const heightChanged =
      !previousRoundedMetrics ||
      previousRoundedMetrics.height !== roundedMetrics.height;
    const keyboardHeightChanged =
      !previousRoundedMetrics ||
      previousRoundedMetrics.keyboardHeight !== roundedMetrics.keyboardHeight;
    const metricsChanged =
      heightChanged ||
      keyboardHeightChanged ||
      !previousRoundedMetrics ||
      previousRoundedMetrics.width !== roundedMetrics.width;

    if (!metricsChanged) {
      return;
    }

    // This value is consumed only by the Hero. Keep the inherited invalidation
    // inside that subtree instead of restyling the whole page for every mobile
    // keyboard / browser-toolbar viewport update.
    if (heightChanged) {
      (heroStage || document.documentElement).style.setProperty(
        '--visual-viewport-height',
        `${roundedMetrics.height}px`
      );
    }

    if (keyboardHeightChanged) {
      // Only the toast consumes this value. Keeping it off :root prevents an
      // inherited custom-property invalidation across the entire document when
      // the iOS candidate bar changes the visual viewport height.
      (toast || document.documentElement).style.setProperty(
        '--keyboard-inset',
        `${roundedMetrics.keyboardHeight}px`
      );
    }

    previousRoundedMetrics = roundedMetrics;
    document.dispatchEvent(new CustomEvent('tschool:visual-viewport-change', {
      detail: metrics
    }));
  };

  const requestUpdate = () => {
    if (!frameId) {
      frameId = requestAnimationFrame(update);
    }
  };

  update();
  window.addEventListener('resize', requestUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', requestUpdate, { passive: true });
}

function readVisualViewportMetrics() {
  const viewport = window.visualViewport;
  const height = viewport?.height || window.innerHeight;
  const offsetTop = viewport?.offsetTop || 0;
  // offsetTop changes when WebKit pans the visual viewport to follow the caret.
  // It is not part of the keyboard height and must not drive keyboard-open state.
  const keyboardHeight = Math.max(0, window.innerHeight - height);

  return {
    height,
    keyboardHeight,
    offsetTop,
    width: viewport?.width || window.innerWidth
  };
}

function configureDocsTemplateLink() {
  if (!elements.docsTemplateLink) return;

  const isGoogleCopyUrl = /^https:\/\/docs\.google\.com\/document\/d\/[^/]+\/copy(?:[?#].*)?$/i
    .test(GOOGLE_DOCS_TEMPLATE_COPY_URL);

  if (!isGoogleCopyUrl) {
    elements.docsTemplateLink.href = '#';
    elements.docsTemplateLink.textContent = 'Google Docs 母版準備中';
    elements.docsTemplateLink.classList.add('is-disabled');
    elements.docsTemplateLink.setAttribute('aria-disabled', 'true');
    elements.docsTemplateLink.dataset.cursorLabel = 'Google Docs 母版準備中';
    elements.docsTemplateLink.addEventListener('click', event => event.preventDefault());
    return;
  }

  elements.docsTemplateLink.href = GOOGLE_DOCS_TEMPLATE_COPY_URL;
  elements.docsTemplateLink.textContent = '行程同步控制臺母版';
  elements.docsTemplateLink.target = '_blank';
  elements.docsTemplateLink.rel = 'noopener';
  elements.docsTemplateLink.classList.remove('is-disabled');
  elements.docsTemplateLink.removeAttribute('aria-disabled');
  elements.docsTemplateLink.dataset.cursorLabel = '開啟控制臺母版';
}

function shouldOfferEmailSetupTransfer() {
  const userAgentDataMobile = navigator.userAgentData?.mobile === true;
  const mobileUserAgent = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const coarseOnlyPointer = window.matchMedia('(pointer: coarse)').matches &&
    !window.matchMedia('(any-pointer: fine)').matches;
  return userAgentDataMobile || mobileUserAgent || coarseOnlyPointer;
}

function configureSetupCodeTransfer() {
  state.emailSetupTransferEnabled = shouldOfferEmailSetupTransfer();
  if (elements.outputStep) {
    elements.outputStep.dataset.transferMode = state.emailSetupTransferEnabled
      ? 'email'
      : 'copy';
  }
  resetSetupTransferControls();
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

    // Search text is presentation-only, while schedule-item changes are
    // finalized by the item-list change handler. Avoid rebuilding the large
    // generated Apps Script once (or twice) for these unrelated input events.
    if (
      event.target === elements.courseSearch ||
      event.target.matches('[data-schedule-item]')
    ) {
      return;
    }

    if (event.target === elements.notificationEmail) {
      updateNotifyHourState();
      document.dispatchEvent(new CustomEvent('tschool:configuration-change', {
        detail: { step: 3 }
      }));
      // Keep the lightweight inline validation immediate. The setup code and
      // summary card are committed separately so typing does not rebuild either.
      return;
    }

    if (event.target === elements.instantNotifications) {
      updateInstantNotificationState();
      document.dispatchEvent(new CustomEvent('tschool:configuration-change', {
        detail: { step: 3 }
      }));
    }

    if (event.target.matches('[data-notify-hour]')) {
      state.customNotificationHours = getSelectedNotifyHours();
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

  elements.copyCode.dataset.cursorDefaultLabel =
    elements.copyCode.dataset.cursorLabel || '複製設定碼';

  elements.copyCode.addEventListener('click', handlePrimarySetupCodeAction);
  elements.copyCodeStep?.addEventListener('click', copyGeneratedCode);

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
    isSearching ? '取消搜尋' : '搜尋課程與活動'
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
    seedDefaultSelections(gradeName, cached.summary);
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
    seedDefaultSelections(gradeName, summary);
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
    elements.sourceStatusDetail.textContent = '系統將整理出對應的課程與活動給你選擇';
    elements.sourceRefresh.disabled = true;
    return;
  }

  elements.sourceStatus.dataset.state = 'success';
  elements.sourceStatusTitle.textContent = `${getCurrentGrade()}課表可用`;
  elements.sourceStatusDetail.textContent = '系統將整理出對應的課程與活動給你選擇';
}

function initMobileOutput() {
  const button = document.getElementById('mobile-output-toggle');

  if (button) {
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', '收合設定碼');
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
    button.setAttribute('aria-label', collapsed ? '展開設定碼' : '收合設定碼');
  });
}

function setupValidation() {
  elements.notificationEmail.addEventListener('input', validateNotificationEmail);
  elements.notificationEmail.addEventListener('blur', scheduleNotificationEmailCommit);
  elements.notificationEmail.addEventListener('click', positionEmailCaretBeforeDomain);
}

function scheduleNotificationEmailCommit() {
  window.clearTimeout(notificationEmailCommitTimer);
  notificationEmailCommitTimer = window.setTimeout(() => {
    notificationEmailCommitTimer = 0;
    commitNotificationEmailChange();
  }, 0);
}

function commitNotificationEmailChange() {
  window.clearTimeout(notificationEmailCommitTimer);
  notificationEmailCommitTimer = 0;
  validateNotificationEmail();
  updateOutput();
  renderSettingsSummary();
}

function validateNotificationEmail() {
  const value = elements.notificationEmail.value.trim();
  const field = document.getElementById('field-notification-email');
  const valid = isValidNotificationEmail(value);
  const nextState = valid ? 'valid' : 'invalid';

  // A keypress that keeps the same validity must not rewrite ARIA attributes or
  // validation layers. Besides doing unnecessary work, those mutations can
  // invalidate the large backdrop-filter surface beside this card.
  if (field?.dataset.fieldState !== nextState) {
    elements.notificationEmail.setCustomValidity(
      valid ? '' : '請輸入有效的校內 Email'
    );
    setFieldState(field, nextState);
  }

  return valid;
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

  // This focus is triggered by the user's completion-button click. Allow the
  // browser to perform its normal focus scroll so the field is already visible
  // when the on-screen keyboard opens. Using preventScroll here left the field
  // under the keyboard until the first caret movement.
  elements.notificationEmail.focus();
  elements.notificationEmail.setSelectionRange(caretPosition, caretPosition);
}

function setFieldState(field, stateValue) {
  if (!field) {
    return;
  }

  const previousState = field.dataset.fieldState || '';
  const nextState = stateValue || '';

  if (previousState === nextState) {
    return;
  }

  const input = field.querySelector('input');

  if (stateValue && field.dataset.fieldState !== stateValue) {
    field.dataset.fieldState = stateValue;
  } else if (!stateValue && field.dataset.fieldState) {
    delete field.dataset.fieldState;
  }

  if (input) {
    if (stateValue === 'invalid') {
      if (input.getAttribute('aria-invalid') !== 'true') {
        input.setAttribute('aria-invalid', 'true');
      }
      if (input.getAttribute('aria-errormessage') !== 'notification-email-hint') {
        input.setAttribute('aria-errormessage', 'notification-email-hint');
      }
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-errormessage');
    }
  }

  const defaultHint = field.querySelector('.validation-hint-default');
  const errorHint = field.querySelector('.validation-hint-error');
  defaultHint?.setAttribute('aria-hidden', String(stateValue === 'invalid'));
  errorHint?.setAttribute('aria-hidden', String(stateValue !== 'invalid'));
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
  const instantEnabled = elements.instantNotifications?.checked !== false;
  getNotifyHourSelects().forEach(select => {
    select.title = instantEnabled
      ? '即時通知開啟時，每日摘要固定於 06:00 寄出'
      : (hasValidEmail ? '' : '請先填寫有效的校內 Email');
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
    state.customNotificationHours = getSelectedNotifyHours();
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
  state.customNotificationHours = getSelectedNotifyHours();
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
  const instantEnabled = elements.instantNotifications?.checked !== false;

  selects.forEach((select, selectIndex) => {
    select.disabled = instantEnabled;
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
    addButton.disabled = instantEnabled || maximumReached;
    addButton.title = maximumReached ? `最多可設定 ${MAX_NOTIFY_HOURS} 個通知時間` : '';
  }

  updateNotifyHourState();
}

function updateInstantNotificationState() {
  const instantEnabled = elements.instantNotifications?.checked !== false;
  const timeField = elements.notifyHoursList?.closest('.notification-time-field');
  timeField?.classList.toggle('is-instant', instantEnabled);

  if (instantEnabled) {
    const selectedHours = getSelectedNotifyHours();
    if (selectedHours.length) state.customNotificationHours = selectedHours;
    renderNotifyHours([DEFAULTS.notifyHour]);
  } else {
    renderNotifyHours(state.customNotificationHours || DEFAULTS.syncHours);
  }
}

function notifyStepConfigurationChanged() {
  document.dispatchEvent(new CustomEvent('tschool:configuration-change', {
    detail: { step: 3 }
  }));
  updateOutput();
  renderSettingsSummary();
}

function getSelectedTitles(gradeName) {
  const grade = gradeName || getCurrentGrade();

  if (!state.selectedTitlesByGrade.has(grade)) {
    state.selectedTitlesByGrade.set(grade, new Set());
  }

  return state.selectedTitlesByGrade.get(grade);
}

function seedDefaultSelections(gradeName, summary) {
  if (!gradeName || !summary || state.defaultSelectionSeededByGrade.has(gradeName)) {
    return;
  }

  const isDefaultSelectedTitle = window.TSchoolScheduleData?.isDefaultSelectedTitle;
  const defaults = typeof isDefaultSelectedTitle === 'function'
    ? (summary.catalog.all || [])
      .filter(item => isDefaultSelectedTitle(item.title))
      .map(item => item.title)
    : [];

  state.selectedTitlesByGrade.set(gradeName, new Set(defaults));
  state.defaultSelectionSeededByGrade.add(gradeName);
}

function handleCourseSelectionChange(event) {
  const input = event.target.closest('input[data-schedule-item]');

  if (!input) {
    return;
  }

  const selected = getSelectedTitles();

  if (input.checked) {
    selected.add(input.value);
  } else {
    selected.delete(input.value);
  }

  document.dispatchEvent(new CustomEvent('tschool:configuration-change', {
    detail: { step: 2 }
  }));
  const card = input.closest('.course-card');
  if (card) {
    card.dataset.cursorLabel = input.checked ? '取消選取此項' : '選取此項';
  }
  // The checkbox already reflects the new selection. Replacing the whole
  // item grid here destroys and rebuilds every card, which is especially
  // expensive on lower-end phones and also discards the current focus node.
  renderSelectionCounts();
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
    elements.courseList.innerHTML = '<p class="empty-course-list">選擇年級後會顯示目前的課程與活動</p>';
    renderSelectionCounts();
    return;
  }

  const query = normalizeSearchText(elements.courseSearch.value);
  const catalog = state.sourceSummary.catalog;
  const isCourseSelectionHidden = window.TSchoolScheduleData?.isCourseSelectionHidden;
  const isVisibleItem = item => !(typeof isCourseSelectionHidden === 'function' &&
    isCourseSelectionHidden(item.title));
  const sections = [];
  const termItems = (catalog.termItems || [])
    .filter(isVisibleItem)
    .filter(item => normalizeSearchText(item.title).includes(query));
  const vacationItems = (catalog.vacationItems || [])
    .filter(isVisibleItem)
    .filter(item => normalizeSearchText(item.title).includes(query));
  const hasVacationItems = (catalog.vacationItems || []).some(isVisibleItem);

  if (termItems.length > 0) {
    sections.push(renderCourseSection(
      hasVacationItems ? '學期間課程與活動' : '',
      termItems.map(renderScheduleItemCard).join('')
    ));
  }

  if (vacationItems.length > 0) {
    sections.push(renderCourseSection(
      '寒暑假期間課程與活動',
      vacationItems.map(renderScheduleItemCard).join('')
    ));
  }

  elements.courseList.innerHTML = sections.length > 0
    ? sections.join('')
    : '<p class="empty-course-list">找不到符合條件的項目，請調整搜尋文字</p>';

  renderSelectionCounts();
}

function renderCourseSection(title, content, note) {
  return [
    '<section class="course-group">',
    title ? '<div class="course-group-heading">' : '',
    title ? `<h3>${escapeHtml(title)}</h3>` : '',
    title && note ? `<span>${escapeHtml(note)}</span>` : '',
    title ? '</div>' : '',
    `<div class="course-grid">${content}</div>`,
    '</section>'
  ].join('');
}

function renderScheduleItemCard(item) {
  const selected = getSelectedTitles().has(item.title);
  return `<label class="course-card" data-cursor-label="${selected ? '取消選取此項' : '選取此項'}"><input type="checkbox" data-schedule-item value="${escapeHtml(item.title)}" ${selected ? 'checked' : ''}><span>${escapeHtml(item.title)}</span></label>`;
}

function renderSelectionCounts() {
  const isCourseSelectionHidden = window.TSchoolScheduleData?.isCourseSelectionHidden;
  const catalogItems = state.sourceSummary ? (state.sourceSummary.catalog.all || [])
    .filter(item => !(typeof isCourseSelectionHidden === 'function' &&
      isCourseSelectionHidden(item.title))) : [];
  const selected = getSelectedTitles();
  const selectedCount = catalogItems.filter(item => selected.has(item.title)).length;
  const label = `已選 ${selectedCount} 項`;
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

function getSettings() {
  const instantNotificationsEnabled = elements.instantNotifications?.checked !== false;
  const notificationHours = instantNotificationsEnabled
    ? state.customNotificationHours.slice()
    : getSelectedNotifyHours();
  const notifyHour = notificationHours.length
    ? notificationHours[notificationHours.length - 1]
    : DEFAULTS.notifyHour;

  const summary = state.sourceSummary;
  const selected = getSelectedTitles();
  const applyCourseSelectionRules = window.TSchoolScheduleData?.applyCourseSelectionRules;
  const selectedTitles = summary && typeof applyCourseSelectionRules === 'function'
    ? applyCourseSelectionRules(Array.from(selected), summary.catalog.all || [])
    : (summary ? (summary.catalog.all || [])
      .filter(item => selected.has(item.title))
      .map(item => item.title) : []);

  return {
    appVersion: '2.0.0-rc.2',
    sourceApiUrl: window.TSchoolScheduleData.API_URL,
    gradeName: getCurrentGrade(),
    calendarName: getDefaultCalendarName(getCurrentGrade()),
    notificationEmail: elements.notificationEmail.value.trim(),
    instantNotificationsEnabled,
    notificationHours,
    notifySyncHour: notifyHour,
    selectedTitles,
    descriptionPreset: DEFAULTS.descriptionPreset,
    customDescription: DEFAULTS.customDescription,
    reminderMode: DEFAULTS.reminderMode,
    reminderMinutes: DEFAULTS.reminderMinutes,
    initialTermKey: summary ? summary.termKey : '',
    initialCatalogFingerprint: summary ? summary.catalogFingerprint : '',
    initialCatalogFingerprintVersion: summary ? summary.catalogFingerprintVersion : 0,
    initialKnownTitles: summary ? summary.catalog.all.map(item => item.title) : [],
    setupSourceSnapshot: summary ? {
      firstDateKey: summary.firstDateKey,
      lastDateKey: summary.lastDateKey,
      sourceUpdatedLabel: summary.updateValues[summary.updateValues.length - 1] || '',
      items: summary.catalog.all
    } : null
  };
}

function updateOutput() {
  const ready = Boolean(state.sourceSummary && !state.sourceLoading && !state.sourceError);
  const hasSelectedScheduleItem = ready && (state.sourceSummary.catalog.all || [])
    .some(item => getSelectedTitles().has(item.title));
  state.generatedCodeReady = false;
  updateGeneratedCodeAvailability(ready);
  if (elements.outputEmail) {
    elements.outputEmail.textContent = elements.notificationEmail.value.trim() || '---@---.---';
  }
  const gradeStepComplete = document.querySelector('[data-complete-step="1"]');
  const courseStepComplete = document.querySelector('[data-complete-step="2"]');

  if (gradeStepComplete) {
    gradeStepComplete.disabled = !getCurrentGrade() || !ready;
  }

  if (courseStepComplete) {
    courseStepComplete.disabled = !hasSelectedScheduleItem;
  }
}

async function generateOutput() {
  const ready = Boolean(state.sourceSummary && !state.sourceLoading && !state.sourceError);
  if (!ready) {
    updateGeneratedCodeAvailability(false);
    return false;
  }

  if (!window.TSchoolSetupCode || typeof window.TSchoolSetupCode.encode !== 'function') {
    updateGeneratedCodeAvailability(false);
    return false;
  }

  setGeneratedCode(window.TSchoolSetupCode.encode(getSettings()));
  state.generatedCodeReady = true;
  updateGeneratedCodeAvailability(true);
  return true;
}

function updateGeneratedCodeAvailability(sourceReady) {
  const enabled = Boolean(sourceReady && state.generatedCodeReady);
  elements.copyCode.disabled = !enabled;
  if (elements.copyCodeStep) {
    elements.copyCodeStep.disabled = !enabled;
  }
}

function resetSetupTransferControls() {
  if (!elements.copyCode) return;

  const primaryLabel = state.emailSetupTransferEnabled
    ? '寄送設定信 ↵'
    : '複製設定碼 ↵';
  const primaryAccessibleLabel = state.emailSetupTransferEnabled
    ? '寄送設定信'
    : '複製設定碼';

  elements.copyCode.classList.remove('is-copied');
  elements.copyCode.textContent = primaryLabel;
  elements.copyCode.setAttribute('aria-label', primaryAccessibleLabel);
  elements.copyCode.dataset.cursorLabel = primaryAccessibleLabel;
  elements.copyCode.dataset.cursorDefaultLabel = primaryAccessibleLabel;
  delete elements.copyCode.dataset.cursorTone;

  if (elements.copyCodeStep) {
    elements.copyCodeStep.textContent = '複製設定碼';
    elements.copyCodeStep.setAttribute('aria-label', '複製設定碼');
    elements.copyCodeStep.dataset.cursorLabel = '複製設定碼';
    elements.copyCodeStep.dataset.cursorDefaultLabel = '複製設定碼';
    delete elements.copyCodeStep.dataset.cursorTone;
  }
}

function setGeneratedCode(nextCode) {
  if (elements.generatedCode.value === nextCode) {
    return;
  }

  resetSetupTransferControls();
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

function copyGeneratedCodeWithLegacyFallback() {
  const codeField = elements.generatedCode;
  const previousActiveElement = document.activeElement;
  const previousScrollTop = codeField.scrollTop;
  const previousScrollLeft = codeField.scrollLeft;
  let copied = false;

  try {
    codeField.focus({ preventScroll: true });
    codeField.select();
    copied = document.execCommand('copy');
  } finally {
    codeField.setSelectionRange(0, 0);
    codeField.scrollTop = previousScrollTop;
    codeField.scrollLeft = previousScrollLeft;

    if (previousActiveElement && previousActiveElement !== codeField &&
        typeof previousActiveElement.focus === 'function') {
      previousActiveElement.focus({ preventScroll: true });
    } else {
      codeField.blur();
    }
  }

  if (!copied) {
    throw new Error('瀏覽器無法複製設定碼。');
  }
}

async function copyGeneratedCode(event) {
  if (!setupCodeTransferIsReady()) return;

  const trigger = event?.currentTarget || elements.copyCode;

  try {
    await navigator.clipboard.writeText(elements.generatedCode.value);
  } catch (error) {
    copyGeneratedCodeWithLegacyFallback();
  }

  if (trigger === elements.copyCode && !state.emailSetupTransferEnabled) {
    elements.copyCode.classList.add('is-copied');
    elements.copyCode.textContent = '再次複製 ↵';
    elements.copyCode.setAttribute('aria-label', '設定碼已複製，再次複製');
  }
  updateCopyCursorSuccess(trigger);
}

function setupCodeTransferIsReady() {
  if (!state.generatedCodeReady || !state.sourceSummary || !validateNotificationEmail()) {
    elements.notificationEmail.reportValidity();
    return false;
  }
  return true;
}

function buildSetupCodeTransferText() {
  const recipient = elements.notificationEmail.value.trim();
  return [
    '請在「電腦」上完成以下步驟：',
    '',
    '1. 完整複製設定碼：',
    elements.generatedCode.value,
    '',
    `2. 用 ${recipient} 開啟行程同步控制臺母版，並建立副本：`,
    GOOGLE_DOCS_TEMPLATE_COPY_URL,
    '',
    '3. 依畫面指引完成設定！',
    '',
    '',
    '＊設定碼包含你在網站填寫的資訊，請勿隨意分享給他人！'
  ].join('\r\n');
}

function buildSetupCodeMailtoUrl() {
  const recipient = elements.notificationEmail.value.trim();
  return `mailto:${encodeURIComponent(recipient)}` +
    `?subject=${encodeURIComponent(SETUP_CODE_EMAIL_SUBJECT)}` +
    `&body=${encodeURIComponent(buildSetupCodeTransferText())}`;
}

function downloadSetupCodeTransferFile(content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = SETUP_CODE_FILE_NAME;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast('設定碼較長，已下載設定檔');
}

async function shareLongSetupCode(content) {
  if (typeof File === 'function') {
    const file = new File([content], SETUP_CODE_FILE_NAME, {
      type: 'text/plain;charset=utf-8'
    });
    const shareData = {
      files: [file],
      title: SETUP_CODE_EMAIL_SUBJECT,
      text: '請把這份設定碼寄給自己，再到電腦完成安裝'
    };

    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
  }

  downloadSetupCodeTransferFile(content);
}

async function sendGeneratedCodeByEmail() {
  if (!setupCodeTransferIsReady()) return;

  const mailtoUrl = buildSetupCodeMailtoUrl();
  if (mailtoUrl.length > MAX_MAILTO_URL_LENGTH) {
    await shareLongSetupCode(buildSetupCodeTransferText());
    return;
  }

  window.location.href = mailtoUrl;
}

function handlePrimarySetupCodeAction(event) {
  if (state.emailSetupTransferEnabled) {
    sendGeneratedCodeByEmail();
    return;
  }
  copyGeneratedCode(event);
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
  initHeroMetadata();
  initHeroScroll();
  initHeroDepthInteraction();
  initProgressiveBlurLayers();
  initStepJourney();
  initCodeDisclosure();
  initKineticCursor();
}

function getHeroAcademicWeekNumber(termStartDate, currentDate) {
  const termStart = new Date(termStartDate);
  const current = new Date(currentDate);

  termStart.setHours(0, 0, 0, 0);
  current.setHours(0, 0, 0, 0);

  const termStartDay = Date.UTC(
    termStart.getFullYear(),
    termStart.getMonth(),
    termStart.getDate()
  );
  const currentDay = Date.UTC(
    current.getFullYear(),
    current.getMonth(),
    current.getDate()
  );
  const elapsedDays = Math.floor((currentDay - termStartDay) / 86400000);

  if (!Number.isFinite(elapsedDays) || elapsedDays < 0) {
    return null;
  }

  return Math.floor(elapsedDays / 7) + 1;
}

function getKnownAcademicTermStart(currentDate) {
  const current = new Date(currentDate);
  current.setHours(0, 0, 0, 0);

  for (let index = KNOWN_ACADEMIC_TERM_STARTS.length - 1; index >= 0; index -= 1) {
    const item = KNOWN_ACADEMIC_TERM_STARTS[index];
    const startDate = new Date(item.year, item.monthIndex, item.day);

    if (current >= startDate) {
      return startDate;
    }
  }

  return null;
}

function initHeroMetadata() {
  const scheduleWeek = document.querySelector('[data-hero-schedule-week]');
  const calendarMonth = document.querySelector('[data-hero-calendar-month]');
  const calendarDay = document.querySelector('[data-hero-calendar-day]');
  const now = new Date();
  const weekdayLabels = window.TSchoolScheduleData?.WEEKDAY_LABELS ||
    ['一', '二', '三', '四', '五', '六', '日'];
  const weekdayIndex = (now.getDay() + 6) % 7;

  if (calendarMonth) {
    calendarMonth.textContent = `${now.getMonth() + 1} 月`;
  }

  if (calendarDay) {
    calendarDay.textContent = `週${weekdayLabels[weekdayIndex]} ${now.getDate()}`;
  }

  const renderWeekNumber = termStartDate => {
    const weekNumber = termStartDate
      ? getHeroAcademicWeekNumber(termStartDate, new Date())
      : null;

    if (scheduleWeek && Number.isFinite(weekNumber)) {
      scheduleWeek.textContent = `第 ${weekNumber} 週`;
    }
  };

  renderWeekNumber(getKnownAcademicTermStart(now));

  document.addEventListener('tschool:grade-ready', () => {
    renderWeekNumber(state.sourceSummary?.firstDate);
  });

  if (!scheduleWeek || !window.TSchoolScheduleData?.fetchGradeSchedule) {
    return;
  }

  window.TSchoolScheduleData
    .fetchGradeSchedule('高一')
    .then(payload => window.TSchoolScheduleData.summarizePayload(payload, new Date()))
    .then(summary => renderWeekNumber(summary.firstDate))
    .catch(() => {});
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
    // Do not set a global duration here. Lenis gives duration precedence over
    // lerp, which made the next frame catch up after a rendering stall.
    lerp: MOTION_CONFIG.scrollLerp,
    smoothWheel: true,
    wheelMultiplier: MOTION_CONFIG.scrollWheelMultiplier,
    touchMultiplier: MOTION_CONFIG.scrollTouchMultiplier,
    syncTouch: touchInput,
    syncTouchLerp: MOTION_CONFIG.scrollTouchLerp,
    touchInertiaExponent: MOTION_CONFIG.scrollTouchInertiaExponent,
    overscroll: false,
    anchors: true,
    autoRaf: true,
    virtualScroll: payload => {
      window.tschoolCancelHomeEntryScroll?.({ resetMomentum: true });
      const boundaryHandler = window.tschoolBoundaryVirtualScroll;
      return typeof boundaryHandler === 'function' ? boundaryHandler(payload) : true;
    }
  });

  window.tschoolLenis = lenis;
}

function initHeroScroll() {
  const stage = document.getElementById('hero-stage');
  const tiles = Array.from(document.querySelectorAll('.transfer-tile'));
  const paperTrack = stage?.querySelector('.hero-paper-track');
  const visual = stage?.querySelector('.hero-visual');
  const scheduleBoard = stage?.querySelector('.schedule-board');
  const calendarBoard = stage?.querySelector('.calendar-board');
  const transferPath = stage?.querySelector('.transfer-path');
  const mobileTileHorizontalAnchors = [0.12, 0.18, 0.1];
  const desktopTileEndTopRatios = [0.22, 0.47, 0.72];
  const scrambleCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  if (!stage || !visual || !paperTrack || tiles.length === 0) {
    return;
  }

  scheduleBoard?.style.setProperty(
    '--hero-paper-base-rotation',
    `${HERO_PAPER_MOTION_CONFIG.scheduleBaseRotation}deg`
  );
  calendarBoard?.style.setProperty(
    '--hero-paper-base-rotation',
    `${HERO_PAPER_MOTION_CONFIG.calendarBaseRotation}deg`
  );

  const tileLabels = tiles.map(tile => ({
    initial: tile.dataset.initialLabel || tile.textContent || '',
    final: tile.dataset.finalLabel || tile.textContent || ''
  }));
  const narrowQuery = window.matchMedia('(max-width: 760px)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frameId = 0;
  let scrambleTimerId = 0;
  let renderingActive = true;
  let layoutDirty = true;
  let layout = null;
  let previousProgress = Number.NaN;
  const tileTextStates = tiles.map(() => 'initial');
  const tileLocalProgress = tiles.map(() => Number.NaN);
  const tileArrivalTimers = tiles.map(() => 0);
  const tileArrivalTargets = tiles.map(() => null);

  function scrambleLabel(label) {
    return Array.from(label, character => {
      if (character === ' ' || character === '[' || character === ']' || character === '-') {
        return character;
      }

      return scrambleCharacters[
        Math.floor(Math.random() * scrambleCharacters.length)
      ];
    }).join('');
  }

  function renderScrambledLabels() {
    tiles.forEach((tile, index) => {
      if (tileTextStates[index] === 'scrambling') {
        tile.textContent = scrambleLabel(tileLabels[index].final);
      }
    });
  }

  function stopScrambling() {
    if (!scrambleTimerId) {
      return;
    }

    clearInterval(scrambleTimerId);
    scrambleTimerId = 0;
  }

  function refreshScrambleTimer() {
    const shouldScramble =
      renderingActive &&
      !document.hidden &&
      !reducedMotionQuery.matches &&
      tileTextStates.includes('scrambling');

    if (!shouldScramble) {
      stopScrambling();
      return;
    }

    if (!scrambleTimerId) {
      renderScrambledLabels();
      scrambleTimerId = window.setInterval(
        renderScrambledLabels,
        MOTION_CONFIG.heroScrambleInterval
      );
    }
  }

  function setTileTextState(tile, index, nextState) {
    if (tileTextStates[index] === nextState) {
      return;
    }

    tileTextStates[index] = nextState;
    tile.classList.toggle('is-scrambling', nextState === 'scrambling');

    if (nextState === 'initial') {
      tile.textContent = tileLabels[index].initial;
    } else if (nextState === 'final') {
      tile.textContent = tileLabels[index].final;
    } else {
      tile.textContent = scrambleLabel(tileLabels[index].final);
    }
  }

  function cancelTileArrival(index) {
    if (tileArrivalTimers[index]) {
      clearTimeout(tileArrivalTimers[index]);
      tileArrivalTimers[index] = 0;
    }

    tileArrivalTargets[index] = null;
  }

  function settleTileAfterArrival(tile, index, targetState) {
    if (
      tileTextStates[index] === targetState &&
      !tileArrivalTimers[index]
    ) {
      return;
    }

    if (
      tileArrivalTimers[index] &&
      tileArrivalTargets[index] === targetState
    ) {
      return;
    }

    cancelTileArrival(index);
    tileArrivalTargets[index] = targetState;
    setTileTextState(tile, index, 'scrambling');
    tileArrivalTimers[index] = window.setTimeout(() => {
      tileArrivalTimers[index] = 0;
      tileArrivalTargets[index] = null;
      setTileTextState(tile, index, targetState);
      refreshScrambleTimer();
    }, MOTION_CONFIG.heroTileArrivalScrambleDuration);
  }

  function getRowCenteredTileTop(boardMetrics, tileHeight, rowIndex) {
    const gridHeight = Math.max(0, boardMetrics.height - boardMetrics.labelHeight);
    const rowHeight = gridHeight / 3;
    const rowInset = Math.max(0, (rowHeight - tileHeight) / 2);

    return boardMetrics.top + boardMetrics.labelHeight + rowHeight * rowIndex + rowInset;
  }

  function getPaperEdgePoint(metrics, side, anchorRatio, translateX, rotationDegrees) {
    const centerX = metrics.left + metrics.width / 2;
    const centerY = metrics.top + metrics.height / 2;
    const localX = (side === 'right' ? 1 : -1) * metrics.width / 2;
    const localY = (anchorRatio - 0.5) * metrics.height;
    const angle = rotationDegrees * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);

    return {
      x: centerX + translateX + localX * cosine - localY * sine,
      y: centerY + localX * sine + localY * cosine
    };
  }

  function positionTransferPath(scheduleMetrics, calendarMetrics, paperMotion) {
    if (!transferPath || !scheduleMetrics || !calendarMetrics) {
      return;
    }

    const schedulePoint = getPaperEdgePoint(
      scheduleMetrics,
      'right',
      HERO_PAPER_MOTION_CONFIG.scheduleConnectorAnchor,
      paperMotion.scheduleX,
      paperMotion.scheduleRotation
    );
    const calendarPoint = getPaperEdgePoint(
      calendarMetrics,
      'left',
      HERO_PAPER_MOTION_CONFIG.calendarConnectorAnchor,
      paperMotion.calendarX,
      paperMotion.calendarRotation
    );
    const baseDistanceX = calendarPoint.x - schedulePoint.x;
    const baseDistanceY = calendarPoint.y - schedulePoint.y;
    const baseDistance = Math.hypot(baseDistanceX, baseDistanceY);

    if (baseDistanceX <= 0 || baseDistance <= 0) {
      transferPath.style.removeProperty('left');
      transferPath.style.removeProperty('top');
      transferPath.style.removeProperty('right');
      transferPath.style.removeProperty('width');
      transferPath.style.removeProperty('transform');
      return;
    }

    const directionX = baseDistanceX / baseDistance;
    const directionY = baseDistanceY / baseDistance;
    const overlap = HERO_PAPER_MOTION_CONFIG.connectorOverlap;
    const startX = schedulePoint.x - directionX * overlap;
    const startY = schedulePoint.y - directionY * overlap;
    const endX = calendarPoint.x + directionX * overlap;
    const endY = calendarPoint.y + directionY * overlap;
    const distanceX = endX - startX;
    const distanceY = endY - startY;

    transferPath.style.left = `${startX}px`;
    transferPath.style.top = `${startY}px`;
    transferPath.style.right = 'auto';
    transferPath.style.width = `${Math.hypot(distanceX, distanceY)}px`;
    transferPath.style.transform =
      `translateZ(var(--hero-path-depth)) rotate(${Math.atan2(distanceY, distanceX)}rad)`;
  }

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
          height: scheduleBoard.offsetHeight,
          labelHeight: scheduleBoard.querySelector('.board-label')?.offsetHeight || 0
        }
      : null;
    const calendarMetrics = calendarBoard
      ? {
          left: calendarBoard.offsetLeft,
          top: calendarBoard.offsetTop,
          width: calendarBoard.offsetWidth,
          height: calendarBoard.offsetHeight,
          labelHeight: calendarBoard.querySelector('.board-label')?.offsetHeight || 0
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
      const mobileAnchorX = mobileTileHorizontalAnchors[index];
      const tileSize = tileSizes[index];

      if (isNarrow && scheduleMetrics && calendarMetrics && Number.isFinite(mobileAnchorX)) {
        const startInsetX = Math.min(
          scheduleMetrics.width * mobileAnchorX,
          Math.max(4, scheduleMetrics.width - tileSize.width - 4)
        );
        const startLeft = scheduleMetrics.left + startInsetX;
        const endInset = Math.min(
          calendarMetrics.width * mobileAnchorX,
          Math.max(4, calendarMetrics.width - tileSize.width - 4)
        );
        const startTop = getRowCenteredTileTop(scheduleMetrics, tileSize.height, index);
        const endTop = getRowCenteredTileTop(calendarMetrics, tileSize.height, index);

        tile.style.left = `${startLeft}px`;
        tile.style.top = `${startTop}px`;

        return {
          x: calendarMetrics.left + endInset - startLeft,
          y: endTop - startTop
        };
      }

      tile.style.removeProperty('left');
      tile.style.removeProperty('top');
      const originalEndTop =
        paperTrack.clientHeight * desktopTileEndTopRatios[index] +
        (index + 1) * 5;

      return {
        x: desktopDistanceX,
        y: originalEndTop - tile.offsetTop
      };
    });
    const tileStarts = tiles.map(tile => ({
      left: tile.offsetLeft,
      top: tile.offsetTop
    }));

    layout = {
      animationEnd,
      calendarMetrics,
      isNarrow,
      maximumPaperSeparation: isNarrow
        ? HERO_PAPER_MOTION_CONFIG.mobileSeparationPerPaper
        : HERO_PAPER_MOTION_CONFIG.desktopSeparationPerPaper,
      paperTravelRatio: isNarrow
        ? MOTION_CONFIG.heroMobilePaperTravelRatio
        : MOTION_CONFIG.heroDesktopPaperTravelRatio,
      reducedMotion,
      scheduleMetrics,
      tileDistances,
      tileSizes,
      tileStarts,
      viewportHeight: window.visualViewport?.height || window.innerHeight,
      width
    };
    layoutDirty = false;
  }

  function getPaperMotion(progress) {
    const progressRange = Math.max(
      0.001,
      HERO_PAPER_MOTION_CONFIG.separationEndProgress -
        HERO_PAPER_MOTION_CONFIG.separationStartProgress
    );
    const localProgress = clamp(
      (progress - HERO_PAPER_MOTION_CONFIG.separationStartProgress) / progressRange,
      0,
      1
    );
    const eased = localProgress * localProgress * localProgress *
      (localProgress * (localProgress * 6 - 15) + 10);
    const separation = layout.maximumPaperSeparation * eased;

    return {
      calendarRotation:
        HERO_PAPER_MOTION_CONFIG.calendarBaseRotation +
        HERO_PAPER_MOTION_CONFIG.calendarRotationDelta * eased,
      calendarX: separation,
      scheduleRotation:
        HERO_PAPER_MOTION_CONFIG.scheduleBaseRotation +
        HERO_PAPER_MOTION_CONFIG.scheduleRotationDelta * eased,
      scheduleX: -separation
    };
  }

  function applyPaperMotion(paperMotion) {
    scheduleBoard?.style.setProperty('--hero-paper-motion-x', `${paperMotion.scheduleX}px`);
    scheduleBoard?.style.setProperty(
      '--hero-paper-motion-rotate',
      `${paperMotion.scheduleRotation - HERO_PAPER_MOTION_CONFIG.scheduleBaseRotation}deg`
    );
    calendarBoard?.style.setProperty('--hero-paper-motion-x', `${paperMotion.calendarX}px`);
    calendarBoard?.style.setProperty(
      '--hero-paper-motion-rotate',
      `${paperMotion.calendarRotation - HERO_PAPER_MOTION_CONFIG.calendarBaseRotation}deg`
    );
    positionTransferPath(layout.scheduleMetrics, layout.calendarMetrics, paperMotion);
  }

  function tileIsFullyInsideBoard(index, eased, arc, boardMetrics) {
    if (!boardMetrics) {
      return false;
    }

    const start = layout.tileStarts[index];
    const distance = layout.tileDistances[index];
    const size = layout.tileSizes[index];
    const left = start.left + distance.x * eased;
    const top = start.top + distance.y * eased + arc;
    const tolerance = 0.5;

    return (
      left >= boardMetrics.left - tolerance &&
      left + size.width <= boardMetrics.left + boardMetrics.width + tolerance &&
      top >= boardMetrics.top - tolerance &&
      top + size.height <= boardMetrics.top + boardMetrics.height + tolerance
    );
  }

  function update() {
    frameId = 0;

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
    const paperMotion = getPaperMotion(paperProgress);
    paperTrack.style.transform = `translate3d(${-paperTravel}px, 0, 0)`;
    applyPaperMotion(paperMotion);

    tiles.forEach((tile, index) => {
      const localProgress = layout.reducedMotion
        ? 0
        : clamp((progress - index * MOTION_CONFIG.heroTileStagger) / MOTION_CONFIG.heroTileTravel, 0, 1);
      const eased = localProgress * localProgress * localProgress * (localProgress * (localProgress * 6 - 15) + 10);
      const arcHeight = layout.isNarrow
        ? MOTION_CONFIG.heroMobileTileArc
        : MOTION_CONFIG.heroDesktopTileArc;
      const arc = Math.sin(Math.PI * eased) * arcHeight;
      const tileDistance = layout.tileDistances[index];
      tile.style.transform = `translate3d(${tileDistance.x * eased}px, ${arc + tileDistance.y * eased}px, var(--hero-tile-depth))`;
      const previousLocalProgress = tileLocalProgress[index];
      const progressDelta = Number.isNaN(previousLocalProgress)
        ? 0
        : localProgress - previousLocalProgress;
      const direction = Math.abs(progressDelta) < 0.0001
        ? 0
        : Math.sign(progressDelta);
      const isInsideStart =
        localProgress <= 0.001 ||
        tileIsFullyInsideBoard(index, eased, arc, layout.scheduleMetrics);
      const isInsideEnd =
        localProgress >= 0.999 ||
        tileIsFullyInsideBoard(index, eased, arc, layout.calendarMetrics);

      if (layout.reducedMotion) {
        cancelTileArrival(index);
        setTileTextState(tile, index, 'initial');
      } else if (Number.isNaN(previousLocalProgress)) {
        setTileTextState(
          tile,
          index,
          isInsideEnd ? 'final' : isInsideStart ? 'initial' : 'scrambling'
        );
      } else if (direction > 0) {
        if (isInsideEnd) {
          settleTileAfterArrival(tile, index, 'final');
        } else {
          cancelTileArrival(index);
          setTileTextState(tile, index, 'scrambling');
        }
      } else if (direction < 0) {
        if (isInsideStart) {
          settleTileAfterArrival(tile, index, 'initial');
        } else {
          cancelTileArrival(index);
          setTileTextState(tile, index, 'scrambling');
        }
      }

      tileLocalProgress[index] = localProgress;
    });
    refreshScrambleTimer();

    stage.classList.toggle(
      'is-complete',
      !layout.reducedMotion && progress >= layout.animationEnd
    );
  }

  function requestUpdate() {
    if (renderingActive && frameId === 0) {
      frameId = requestAnimationFrame(update);
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
      } else if (frameId !== 0) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }

      if (!renderingActive) {
        stopScrambling();
      }
    }, {
      // Resume shortly before the Hero returns; stop all animation work beyond it.
      rootMargin: MOTION_CONFIG.heroRenderRootMargin
    });
    intersectionObserver.observe(stage);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopScrambling();
      return;
    }

    requestUpdate();
    refreshScrambleTimer();
  });

  update();
}

function initHeroDepthInteraction() {
  const stage = document.getElementById('hero-stage');
  const sticky = stage?.querySelector('.hero-sticky');
  const scene = stage?.querySelector('.hero-depth-scene');

  if (!stage || !sticky || !scene) {
    return;
  }

  const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let frameId = 0;
  let renderingActive = true;

  function interactionEnabled() {
    return renderingActive && finePointerQuery.matches && !reducedMotionQuery.matches;
  }

  function writeTilt() {
    scene.style.setProperty(
      '--hero-pointer-rotate-x',
      `${-currentY * MOTION_CONFIG.heroTiltMaxX}deg`
    );
    scene.style.setProperty(
      '--hero-pointer-rotate-y',
      `${-currentX * MOTION_CONFIG.heroTiltMaxY}deg`
    );
    scene.style.setProperty(
      '--hero-shadow-x',
      `${-currentX * MOTION_CONFIG.heroTiltShadowTravel}px`
    );
    scene.style.setProperty(
      '--hero-shadow-y',
      `${-currentY * MOTION_CONFIG.heroTiltShadowTravel}px`
    );
  }

  function render() {
    frameId = 0;

    if (!renderingActive) {
      return;
    }

    currentX += (targetX - currentX) * MOTION_CONFIG.heroTiltEase;
    currentY += (targetY - currentY) * MOTION_CONFIG.heroTiltEase;
    writeTilt();

    const stillMoving =
      Math.abs(targetX - currentX) > 0.001 ||
      Math.abs(targetY - currentY) > 0.001;

    if (stillMoving) {
      requestFrame();
    }
  }

  function requestFrame() {
    if (renderingActive && frameId === 0) {
      frameId = requestAnimationFrame(render);
    }
  }

  function resetTilt(immediate = false) {
    targetX = 0;
    targetY = 0;

    if (immediate === true) {
      currentX = 0;
      currentY = 0;

      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }

      writeTilt();
      return;
    }

    requestFrame();
  }

  function handlePointerMove(event) {
    if (!interactionEnabled()) {
      return;
    }

    const rect = sticky.getBoundingClientRect();
    targetX = clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -1, 1);
    targetY = clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1, -1, 1);
    requestFrame();
  }

  function handlePreferenceChange() {
    const pointerInteractionEnabled =
      finePointerQuery.matches && !reducedMotionQuery.matches;
    stage.classList.toggle('has-hero-depth-interaction', pointerInteractionEnabled);
    resetTilt(!pointerInteractionEnabled);
  }

  sticky.addEventListener('pointermove', handlePointerMove, { passive: true });
  sticky.addEventListener('pointerleave', resetTilt, { passive: true });
  window.addEventListener('blur', resetTilt);
  finePointerQuery.addEventListener?.('change', handlePreferenceChange);
  reducedMotionQuery.addEventListener?.('change', handlePreferenceChange);

  if ('IntersectionObserver' in window) {
    const intersectionObserver = new IntersectionObserver(entries => {
      renderingActive = entries[0]?.isIntersecting ?? true;

      if (!renderingActive) {
        resetTilt(true);
      }
    }, {
      rootMargin: MOTION_CONFIG.heroRenderRootMargin
    });
    intersectionObserver.observe(stage);
  }

  handlePreferenceChange();
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
  let editingControl = null;
  let editingBoundaryY = Number.NaN;
  let editingViewportMetrics = null;
  let editingReleaseTimer = 0;
  let ensureControlFrame = 0;
  let ensureControlTimer = 0;
  let generatedCodeTransitionId = 0;
  let homeEntryScrollFrameId = 0;
  let homeEntryScrollActive = false;
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
      initial: '產生安裝設定碼 ↵',
      confirmed: '產生安裝設定碼 ↵'
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
    if (completionStates.get(stepNumber) === nextState) return;

    completionStates.set(stepNumber, nextState);
    button.textContent = labels[nextState];
    button.classList.toggle('is-review', nextState === 'review');
    button.classList.toggle('is-correction', nextState === 'correction');
    button.classList.toggle('is-confirmed', nextState === 'confirmed');
    button.setAttribute('aria-pressed', String(nextState === 'confirmed'));
    button.dataset.cursorLabel = nextState === 'review'
      ? '再次確認行程'
      : nextState === 'correction'
        ? '修正 Email'
        : stepNumber === 2
          ? '確認行程'
          : stepNumber === 3
            ? '確認通知設定'
            : '產生安裝設定碼';
  }

  async function activateCompletionButton(button) {
    if (!button || button.disabled) return;

    const completedStep = Number(button.dataset.completeStep);

    if (
      completedStep === 2 &&
      (!state.sourceSummary || state.sourceLoading || state.sourceError)
    ) {
      showToast(state.sourceError ? '請先重新讀取課表' : '課表仍在讀取中');
      return;
    }

    if (completedStep === 2 && !getSelectedTitles().size) {
      showToast('請至少選擇一項課程或活動');
      return;
    }

    if (completedStep === 3 && !validateNotificationEmail()) {
      setCompletionState(3, 'correction');
      focusEmailBeforeDomain();
      return;
    }

    if (completedStep === 3) {
      commitNotificationEmailChange();
    }

    if (completedStep === 2 && completionStates.get(2) === 'initial') {
      setCompletionState(2, 'review');
      return;
    }

    if (completedStep === 4) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      let generated = false;

      try {
        generated = await generateOutput();
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }

      if (!generated) {
        showToast(state.sourceError ? '請先重新讀取課表' : '安裝設定碼尚未準備完成');
        return;
      }

      setCompletionState(4, 'confirmed');
      scheduleGeneratedCodeTransition();
      return;
    }

    setCompletionState(completedStep, 'confirmed');
    unlockAndScrollToStep(completedStep + 1);
  }

  function scheduleGeneratedCodeTransition() {
    const transitionId = ++generatedCodeTransitionId;
    const delay = prefersReducedMotion()
      ? 0
      : MOTION_CONFIG.generatedCodeTransitionDelay;

    requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (transitionId !== generatedCodeTransitionId) return;
        unlockAndScrollToStep(5);
      }, delay);
    });
  }

  function resetCompletionAfterChange(changedStep) {
    generatedCodeTransitionId += 1;

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
    const actionLabel = open ? '關閉步驟選單' : '開啟步驟選單';
    elements.stageMenuTrigger.setAttribute('aria-label', actionLabel);
    elements.stageMenuTrigger.dataset.cursorLabel = actionLabel;
    elements.stageMenuPanel.hidden = !open;
    elements.stageMenu?.classList.toggle('is-open', open);
    document.dispatchEvent(new CustomEvent('tschool:cursor-context-change'));

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
      const currentScroll = window.tschoolLenis.animatedScroll;
      const heroStage = document.getElementById('hero-stage');
      const heroTiles = heroStage?.querySelectorAll('.transfer-tile').length || 0;
      const heroAnimationEndProgress = Math.min(
        1,
        MOTION_CONFIG.heroTileTravel +
          MOTION_CONFIG.heroTileStagger * Math.max(0, heroTiles - 1)
      );
      const heroViewportHeight = window.visualViewport?.height || window.innerHeight;
      const heroAnimationEndTarget = heroStage
        ? getDocumentLayoutTop(heroStage) +
          Math.max(0, heroStage.offsetHeight - heroViewportHeight) * heroAnimationEndProgress
        : currentScroll;

      runHomeEntryVirtualScroll({
        currentScroll,
        heroAnimationEndTarget,
        scrollTarget
      });
    } else {
      window.scrollTo({ top: scrollTarget, behavior: smoothScrollEnabled() ? 'smooth' : 'auto' });
    }
  }

  function cancelHomeEntryVirtualScroll(options = {}) {
    if (!homeEntryScrollActive && !homeEntryScrollFrameId) return false;

    homeEntryScrollActive = false;
    if (homeEntryScrollFrameId) {
      window.cancelAnimationFrame(homeEntryScrollFrameId);
      homeEntryScrollFrameId = 0;
    }
    if (options.resetMomentum === true) {
      resetScrollMomentum();
    }
    return true;
  }

  function runHomeEntryVirtualScroll({ currentScroll, heroAnimationEndTarget, scrollTarget }) {
    const lenis = window.tschoolLenis;
    if (!lenis || scrollTarget <= currentScroll + 1) return;

    cancelHomeEntryVirtualScroll();

    const totalDurationMs = Math.max(1, MOTION_CONFIG.homeEntryScrollDuration * 1000);
    const heroTimeRatio = clamp(MOTION_CONFIG.homeEntryHeroTimeRatio, 0.05, 0.95);
    const heroDurationMs = totalDurationMs * heroTimeRatio;
    const heroTarget = clamp(heroAnimationEndTarget, currentScroll, scrollTarget);
    const homeEntryLerp = window.matchMedia('(pointer: coarse)').matches
      ? MOTION_CONFIG.scrollTouchLerp
      : MOTION_CONFIG.scrollLerp;
    let startedAt = Number.NaN;

    homeEntryScrollActive = true;

    const advanceVirtualScroll = timestamp => {
      if (!homeEntryScrollActive) return;
      if (!Number.isFinite(startedAt)) startedAt = timestamp;

      const elapsedMs = Math.min(Math.max(0, timestamp - startedAt), totalDurationMs);
      let nextTarget;

      if (elapsedMs <= heroDurationMs) {
        const heroProgress = elapsedMs / heroDurationMs;
        nextTarget = currentScroll + (heroTarget - currentScroll) * heroProgress;
      } else {
        const cardProgress = (elapsedMs - heroDurationMs) /
          (totalDurationMs - heroDurationMs);
        nextTarget = heroTarget + (scrollTarget - heroTarget) * cardProgress;
      }

      const inputComplete = elapsedMs >= totalDurationMs;
      lenis.scrollTo(nextTarget, {
        // Match Lenis' own wheel path: the target advances linearly while its
        // lerp remains solely responsible for visible smoothing and settling.
        programmatic: false,
        lerp: homeEntryLerp,
        onComplete: inputComplete
          ? () => {
              homeEntryScrollActive = false;
            }
          : undefined
      });

      if (inputComplete) {
        homeEntryScrollFrameId = 0;
        return;
      }

      homeEntryScrollFrameId = window.requestAnimationFrame(advanceVirtualScroll);
    };

    homeEntryScrollFrameId = window.requestAnimationFrame(advanceVirtualScroll);
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

    if (editingControl) {
      extendEditingBoundaryToCurrentScroll(geometry);
      setActiveStep(activeStep);
      return;
    }

    const maximumScrollY = getMaximumScrollY(geometry);

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

  function getMaximumScrollY(geometry = getJourneyGeometry()) {
    const normalMaximum = geometry.maximumScrollY;

    if (!editingControl || !Number.isFinite(editingBoundaryY)) {
      return normalMaximum;
    }

    const documentMaximum = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );

    return Math.min(
      documentMaximum,
      Math.max(normalMaximum, editingBoundaryY)
    );
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

  function getEditableJourneyControl(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    const control = target.closest('input, textarea, select');

    if (
      !control ||
      !control.closest('.journey-step') ||
      control.disabled ||
      control.readOnly
    ) {
      return null;
    }

    if (
      control instanceof HTMLInputElement &&
      ['button', 'checkbox', 'color', 'file', 'hidden', 'radio', 'range', 'reset', 'submit']
        .includes(control.type)
    ) {
      return null;
    }

    return control;
  }

  function getFocusedVisibilityTarget(control) {
    if (control === elements.notificationEmail) {
      return document.getElementById('field-notification-email') || control;
    }

    return control.closest('.notification-time-row, .search-control') || control;
  }

  function keyboardIsOpen(metrics = readVisualViewportMetrics()) {
    const threshold = Math.max(120, window.innerHeight * 0.15);
    return Boolean(editingControl) && metrics.keyboardHeight >= threshold;
  }

  function nativeViewportManagesEditingScroll(metrics = readVisualViewportMetrics()) {
    return Boolean(
      window.visualViewport &&
      editingControl &&
      keyboardIsOpen(metrics) &&
      window.matchMedia('(pointer: coarse), (max-width: 760px)').matches
    );
  }

  function extendEditingBoundaryToCurrentScroll(geometry = getJourneyGeometry()) {
    const lenis = window.tschoolLenis;
    const scrollPositions = [window.scrollY];

    if (Number.isFinite(lenis?.animatedScroll)) {
      scrollPositions.push(lenis.animatedScroll);
    }
    if (Number.isFinite(lenis?.targetScroll)) {
      scrollPositions.push(lenis.targetScroll);
    }

    editingBoundaryY = Math.max(
      geometry.maximumScrollY,
      Number.isFinite(editingBoundaryY) ? editingBoundaryY : 0,
      ...scrollPositions
    );
  }

  function updateEditingViewportState(metrics = readVisualViewportMetrics()) {
    document.documentElement.toggleAttribute('data-input-active', Boolean(editingControl));
    document.documentElement.toggleAttribute('data-keyboard-open', keyboardIsOpen(metrics));
  }

  function scrollImmediatelyTo(targetY) {
    const lenis = window.tschoolLenis;

    if (lenis && smoothScrollEnabled()) {
      lenis.scrollTo(targetY, {
        immediate: true,
        force: true
      });
      return;
    }

    window.scrollTo({ top: targetY, behavior: 'auto' });
  }

  function ensureFocusedControlVisible() {
    ensureControlFrame = 0;

    if (!editingControl?.isConnected) {
      return;
    }

    const controlStep = editingControl.closest('.journey-step');
    const controlStepNumber = Number(controlStep?.dataset.step);

    if (!controlStep || controlStepNumber > maxUnlockedStep) {
      return;
    }

    const metrics = readVisualViewportMetrics();
    updateEditingViewportState(metrics);

    // Mobile browsers already pan the visual viewport after every caret move.
    // A second layout-viewport scroll from here makes WebKit and Lenis pull the
    // page in opposite directions. Keep the step boundary open, then let the
    // browser own caret visibility until the keyboard closes.
    if (nativeViewportManagesEditingScroll(metrics)) {
      extendEditingBoundaryToCurrentScroll();
      requestUpdate({ preserveActiveStep: true });
      return;
    }

    invalidateJourneyGeometry();

    const headerHeight = document.querySelector('.site-header')?.getBoundingClientRect().height || 0;
    const visibilityMargin = 16;
    const visibleTop = metrics.offsetTop + headerHeight + visibilityMargin;
    const visibleBottom = metrics.offsetTop + metrics.height - visibilityMargin;

    if (visibleBottom <= visibleTop) {
      return;
    }

    let target = getFocusedVisibilityTarget(editingControl);
    let targetRect = target.getBoundingClientRect();

    if (targetRect.height > visibleBottom - visibleTop) {
      target = editingControl;
      targetRect = target.getBoundingClientRect();
    }

    let scrollDelta = 0;

    if (targetRect.bottom > visibleBottom) {
      scrollDelta = targetRect.bottom - visibleBottom;
    } else if (targetRect.top < visibleTop) {
      scrollDelta = targetRect.top - visibleTop;
    }

    if (Math.abs(scrollDelta) < 1) {
      return;
    }

    const geometry = getJourneyGeometry();
    const documentMaximum = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const targetY = clamp(window.scrollY + scrollDelta, 0, documentMaximum);

    editingBoundaryY = Math.max(
      geometry.maximumScrollY,
      Number.isFinite(editingBoundaryY) ? editingBoundaryY : 0,
      targetY
    );
    preserveActiveStepAfterLayout = true;
    scrollImmediatelyTo(targetY);
    requestUpdate({ preserveActiveStep: true });
  }

  function runFocusedControlVisibilityCheck() {
    if (ensureControlFrame) {
      cancelAnimationFrame(ensureControlFrame);
    }

    ensureControlFrame = requestAnimationFrame(() => {
      ensureControlFrame = requestAnimationFrame(ensureFocusedControlVisible);
    });
  }

  function scheduleFocusedControlVisibility(options = {}) {
    if (ensureControlTimer) {
      clearTimeout(ensureControlTimer);
      ensureControlTimer = 0;
    }

    if (options.afterViewportSettles === true) {
      ensureControlTimer = window.setTimeout(() => {
        ensureControlTimer = 0;
        runFocusedControlVisibilityCheck();
      }, MOTION_CONFIG.inputViewportSettleDelay);
      return;
    }

    runFocusedControlVisibilityCheck();
  }

  function beginEditingControl(control) {
    if (!control) {
      return;
    }

    if (editingReleaseTimer) {
      clearTimeout(editingReleaseTimer);
      editingReleaseTimer = 0;
    }

    editingControl = control;
    editingBoundaryY = getJourneyGeometry().maximumScrollY;
    editingViewportMetrics = readVisualViewportMetrics();
    focusInputDirection = 0;
    preserveActiveStepAfterLayout = true;
    resetScrollMomentum();
    updateEditingViewportState();
    scheduleFocusedControlVisibility();
  }

  function finishEditingControl() {
    if (ensureControlTimer) {
      clearTimeout(ensureControlTimer);
      ensureControlTimer = 0;
    }
    if (ensureControlFrame) {
      cancelAnimationFrame(ensureControlFrame);
      ensureControlFrame = 0;
    }

    editingControl = null;
    editingBoundaryY = Number.NaN;
    editingViewportMetrics = null;
    document.documentElement.removeAttribute('data-input-active');
    document.documentElement.removeAttribute('data-keyboard-open');
    invalidateJourneyGeometry();
    window.tschoolLenis?.resize?.();
    clampToCurrentBoundary({ immediate: true });
    requestUpdate({ preserveActiveStep: true });
  }

  function scheduleEditingRelease() {
    if (editingReleaseTimer) {
      clearTimeout(editingReleaseTimer);
    }

    editingReleaseTimer = window.setTimeout(() => {
      editingReleaseTimer = 0;
      const nextControl = getEditableJourneyControl(document.activeElement);

      if (nextControl) {
        beginEditingControl(nextControl);
        return;
      }

      finishEditingControl();
    }, 120);
  }

  function resetScrollMomentum() {
    const lenis = window.tschoolLenis;
    if (!lenis || !Number.isFinite(lenis.animatedScroll)) return;
    lenis.scrollTo(lenis.animatedScroll, { immediate: true, force: true });
  }

  function getBoundarySettleLerp(maximumScrollY) {
    const lenis = window.tschoolLenis;

    if (
      maxUnlockedStep !== 1 ||
      !lenis ||
      !Number.isFinite(lenis.animatedScroll)
    ) {
      return MOTION_CONFIG.boundarySettleLerp;
    }

    // A trackpad fling from Hero can put Lenis' target near the first locked
    // boundary while the rendered page is still much farther behind. Blend to
    // a gentler lerp for that long final approach, then retain the established
    // boundary response for slow approaches and every later step.
    const visualDistance = Math.max(0, maximumScrollY - lenis.animatedScroll);
    const blendDistance = Math.max(
      1,
      window.innerHeight * MOTION_CONFIG.initialBoundaryBlendDistanceRatio
    );
    const longApproachWeight = clamp(visualDistance / blendDistance, 0, 1);

    return MOTION_CONFIG.boundarySettleLerp +
      (MOTION_CONFIG.initialBoundaryMinLerp - MOTION_CONFIG.boundarySettleLerp) *
        longApproachWeight;
  }

  function clampToCurrentBoundary(options = {}, maximumScrollY = getMaximumScrollY()) {
    const lenis = window.tschoolLenis;

    if (lenis) {
      const isPastBoundary = lenis.targetScroll > maximumScrollY + MOTION_CONFIG.boundarySnapDistance ||
        lenis.animatedScroll > maximumScrollY + MOTION_CONFIG.boundarySnapDistance;

      if (!isPastBoundary) return false;

      lenis.scrollTo(maximumScrollY, {
        immediate: options.immediate === true,
        lerp: getBoundarySettleLerp(maximumScrollY),
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

    if (editingControl) {
      extendEditingBoundaryToCurrentScroll();
      return true;
    }

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

    // Once every step is unlocked, Lenis handles forward and reverse momentum
    // continuously at its own document boundary. Do not immediately rewrite
    // its target: touchend can contain tiny opposing deltas that would feel
    // like a catch or rebound if interpreted as an intentional reversal.
    if (deltaY < 0 || maxUnlockedStep >= steps.length) {
      return true;
    }

    const currentTarget = Number.isFinite(lenis?.targetScroll) ? lenis.targetScroll : window.scrollY;
    const remaining = maximumScrollY - currentTarget;

    function settleAtBoundary() {
      if (event?.cancelable) event.preventDefault();
      lenis.scrollTo(maximumScrollY, {
        lerp: getBoundarySettleLerp(maximumScrollY),
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

  document.addEventListener('focusin', event => {
    const control = getEditableJourneyControl(event.target);

    if (control) {
      beginEditingControl(control);
    }
  });

  document.addEventListener('focusout', event => {
    if (getEditableJourneyControl(event.target)) {
      scheduleEditingRelease();
    }
  });

  document.addEventListener('tschool:visual-viewport-change', event => {
    if (!editingControl) {
      return;
    }

    const keyboardWasOpen = document.documentElement.hasAttribute('data-keyboard-open');
    const previousMetrics = editingViewportMetrics;
    const nextMetrics = event.detail;
    editingViewportMetrics = nextMetrics;
    updateEditingViewportState(event.detail);
    const keyboardIsNowOpen =
      document.documentElement.hasAttribute('data-keyboard-open');
    const heightChanged =
      !previousMetrics ||
      Math.abs(previousMetrics.height - nextMetrics.height) >= 2;
    const widthChanged =
      !previousMetrics ||
      Math.abs(previousMetrics.width - nextMetrics.width) >= 2;
    const keyboardStateChanged = keyboardWasOpen !== keyboardIsNowOpen;

    if (keyboardWasOpen && !keyboardIsNowOpen) {
      invalidateJourneyGeometry();
      editingBoundaryY = getJourneyGeometry().maximumScrollY;
      clampToCurrentBoundary({ immediate: true });
      requestUpdate({ preserveActiveStep: true });
      return;
    }

    if (keyboardIsNowOpen && nativeViewportManagesEditingScroll(nextMetrics)) {
      extendEditingBoundaryToCurrentScroll();

      // A width change means rotation or split view rather than caret panning.
      // Re-measure for that case, but still avoid imperative vertical scrolling
      // while WebKit owns the on-screen keyboard viewport.
      if (widthChanged) {
        invalidateJourneyGeometry();
      }

      requestUpdate({ preserveActiveStep: true });
      return;
    }

    // Offset-only events are the browser following the caret. When there is no
    // mobile keyboard, genuine size/state changes can still need one correction.
    if (heightChanged || widthChanged || keyboardStateChanged) {
      invalidateJourneyGeometry();
      scheduleFocusedControlVisibility({ afterViewportSettles: true });
    }
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
    generatedCodeTransitionId += 1;
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
      cancelHomeEntryVirtualScroll({ resetMomentum: true });
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
  window.tschoolCancelHomeEntryScroll = cancelHomeEntryVirtualScroll;
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', () => {
    if (editingControl && window.visualViewport) {
      // initViewportMetrics dispatches the coalesced visual-viewport event.
      // Scheduling another correction here lets a keyboard resize bypass its
      // offset/size guards and was the remaining second scroll controller.
      requestUpdate({ preserveActiveStep: true });
      return;
    }

    invalidateJourneyGeometry();
    window.tschoolLenis?.resize?.();
    clampToCurrentBoundary({ immediate: true });
    requestUpdate({ preserveActiveStep: true });
  });
  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => {
      invalidateJourneyGeometry();

      if (editingControl) {
        scheduleFocusedControlVisibility({ afterViewportSettles: true });
      } else {
        window.tschoolLenis?.resize?.();
        clampToCurrentBoundary({ immediate: true });
      }

      requestUpdate({ preserveActiveStep: true });
    }, 120);
  });

  if ('ResizeObserver' in window) {
    let previousBodyBlockSize = 0;
    const resizeObserver = new ResizeObserver(entries => {
      const boxSize = entries[0]?.borderBoxSize;
      const nextBodyBlockSize = Array.isArray(boxSize)
        ? boxSize[0]?.blockSize
        : boxSize?.blockSize;

      if (
        Number.isFinite(nextBodyBlockSize) &&
        Math.abs(nextBodyBlockSize - previousBodyBlockSize) < 0.5
      ) {
        return;
      }

      if (Number.isFinite(nextBodyBlockSize)) {
        previousBodyBlockSize = nextBodyBlockSize;
      }

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
    const label = expanded ? '收合完整設定碼' : '查看完整設定碼';
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

  const selectedTitles = getSelectedTitles();
  const isCourseSelectionHidden = window.TSchoolScheduleData?.isCourseSelectionHidden;
  const catalogItems = (state.sourceSummary?.catalog?.all || [])
    .filter(item => !(typeof isCourseSelectionHidden === 'function' &&
      isCourseSelectionHidden(item.title)));
  const selectedItems = catalogItems
    .filter(item => selectedTitles.has(item.title))
    .map(item => item.title);
  const unselectedItems = catalogItems
    .filter(item => !selectedTitles.has(item.title))
    .map(item => item.title);
  const email = elements.notificationEmail.value.trim();
  const hasValidEmail = isValidNotificationEmail(email);
  const instantNotificationsEnabled = elements.instantNotifications?.checked !== false;
  const notificationSummary = instantNotificationsEnabled
    ? ['行程有調整就盡快通知']
    : getSelectedNotifyHours().map(hour => `${pad2(hour)}:00`);
  const grade = getCurrentGrade();

  elements.settingsSummary.innerHTML = [
    renderSummaryRow([
      ['你選的年級是：', grade ? [grade] : ['尚未選擇'], grade ? '' : 'is-error']
    ], 1, '修改年級'),
    renderSummaryRow([
      ['你選的行程有：', selectedItems],
      ['你「沒」選的行程有：', unselectedItems]
    ], 2, '修改行程'),
    renderSummaryRow([
      ['你想用來收通知的 Email 是：', [email || '未填寫'], hasValidEmail ? '' : 'is-error'],
      ['你想收到通知的時間是：', notificationSummary]
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
  const captionViewportMargin = 8;
  const captionOffsetX = 18;
  const captionOffsetY = 22;

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
    requestCursorFrame();
  }

  function updateTarget(event) {
    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;
    targetX = event.clientX;
    targetY = event.clientY;

    if (Math.hypot(dx, dy) > 1.5) {
      targetAngle = clamp(
        dx * MOTION_CONFIG.cursorSwayVelocityScale,
        -MOTION_CONFIG.cursorSwayMaxAngle,
        MOTION_CONFIG.cursorSwayMaxAngle
      );
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

  function positionCursorCaption() {
    if (!cursor.classList.contains('has-label')) {
      return;
    }

    const captionBounds = caption.getBoundingClientRect();
    const captionWidth = captionBounds.width;
    const captionHeight = captionBounds.height;
    const maximumLeft = Math.max(
      captionViewportMargin,
      window.innerWidth - captionWidth - captionViewportMargin
    );
    const preferredLeft = currentX + captionOffsetX;
    const captionLeft = clamp(preferredLeft, captionViewportMargin, maximumLeft);
    const preferredTop = currentY + captionOffsetY;
    const flippedTop = currentY - captionHeight - captionOffsetY;
    const captionTop = clamp(
      preferredTop + captionHeight > window.innerHeight - captionViewportMargin
        ? flippedTop
        : preferredTop,
      captionViewportMargin,
      Math.max(
        captionViewportMargin,
        window.innerHeight - captionHeight - captionViewportMargin
      )
    );

    cursor.style.setProperty('--cursor-caption-x', `${captionLeft - currentX}px`);
    cursor.style.setProperty('--cursor-caption-y', `${captionTop - currentY}px`);
  }

  function animate() {
    frameId = 0;
    currentX += (targetX - currentX) * MOTION_CONFIG.cursorPositionEase;
    currentY += (targetY - currentY) * MOTION_CONFIG.cursorPositionEase;
    let angleDelta = ((targetAngle - currentAngle + 540) % 360) - 180;
    currentAngle += angleDelta * MOTION_CONFIG.cursorAngleEase;
    cursorVelocity += (targetCursorVelocity - cursorVelocity) * 0.24;
    targetCursorVelocity *= 0.82;
    targetAngle *= MOTION_CONFIG.cursorSwayReturn;
    cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    const textCursor = cursor.classList.contains('is-text');
    cursor.style.setProperty('--cursor-angle', textCursor ? '0deg' : `${currentAngle}deg`);
    cursor.style.setProperty(
      '--cursor-pointer-angle',
      textCursor ? '0deg' : `${MOTION_CONFIG.cursorBaseAngle + currentAngle}deg`
    );
    cursor.style.setProperty('--cursor-lens-stretch', (1 + cursorVelocity * 0.22).toFixed(3));
    cursor.style.setProperty('--cursor-lens-squash', (1 - cursorVelocity * 0.08).toFixed(3));
    positionCursorCaption();

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
  window.addEventListener('resize', requestCursorFrame, { passive: true });
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
