const DEFAULTS = {
  gradeName: '高一',
  notificationEmail: '',
  syncHours: [5, 12, 18, 22],
  notifyHour: 5,
  includeActivities: true,
  notificationPreset: 'standard',
  customNotification: [
    '{type}｜{course}',
    '原：{oldDate} {oldPeriod} {oldTime} {oldLocation}',
    '新：{newDate} {newPeriod} {newTime} {newLocation}'
  ].join('\n'),
  descriptionPreset: 'standard',
  customDescription: [
    '第 {week} 週｜星期{weekday}｜第 {period} 節',
    '時間：{startTime}–{endTime}',
    '地點：{location}',
    '課表更新：{sourceUpdatedAt}'
  ].join('\n'),
  reminderMode: 'none',
  reminderMinutes: 10,
  calendarName: 'T-SCHOOL 課表'
};

const SYNC_PRESETS = [
  { label: '05:00', hour: 5 },
  { label: '12:00', hour: 12 },
  { label: '18:00', hour: 18 },
  { label: '22:00', hour: 22 }
];

const state = {
  activeFilter: '全部',
  selectedCoursesExpanded: false,
  selectedByGrade: new Map(),
  sourceByGrade: new Map(),
  sourceSummary: null,
  sourceLoading: false,
  sourceError: null,
  requestId: 0
};

const elements = {
  form: document.querySelector('#config-form'),
  notificationEmail: document.querySelector('#notification-email'),
  notifyHour: document.querySelector('#notify-hour'),
  syncHours: document.querySelector('#sync-hours'),
  includeActivities: document.querySelector('#include-whole-school'),
  courseSearch: document.querySelector('#course-search'),
  courseList: document.querySelector('#course-list'),
  selectedCourses: document.querySelector('#selected-courses'),
  selectedToggle: document.querySelector('#selected-toggle'),
  courseCount: document.querySelector('#course-count'),
  generatedCode: document.querySelector('#generated-code'),
  copyCode: document.querySelector('#copy-code'),
  copyCodeInline: document.querySelector('#copy-code-inline'),
  clearCourses: document.querySelector('#clear-courses'),
  sourceStatus: document.querySelector('#source-status'),
  sourceStatusTitle: document.querySelector('#source-status-title'),
  sourceStatusDetail: document.querySelector('#source-status-detail'),
  sourceRefresh: document.querySelector('#source-refresh'),
  notificationPreset: document.querySelector('#notification-preset'),
  customNotification: document.querySelector('#custom-notification'),
  customNotificationField: document.querySelector('#custom-notification-field'),
  descriptionPreset: document.querySelector('#description-preset'),
  customDescription: document.querySelector('#custom-description'),
  customTemplateField: document.querySelector('#custom-template-field'),
  reminderMode: document.querySelector('#reminder-mode'),
  reminderMinutes: document.querySelector('#reminder-minutes'),
  reminderMinutesField: document.querySelector('#reminder-minutes-field'),
  settingsSummary: document.querySelector('#settings-summary'),
  progressNumber: document.querySelector('#progress-number'),
  progressCurrent: document.querySelector('#progress-current'),
  headerStatus: document.querySelector('#header-status'),
  codeWindow: document.querySelector('#code-window'),
  fullCodeToggle: document.querySelector('#full-code-toggle')
};

async function init() {
  elements.notificationEmail.value = DEFAULTS.notificationEmail;
  elements.includeActivities.checked = DEFAULTS.includeActivities;
  elements.notificationPreset.value = DEFAULTS.notificationPreset;
  elements.customNotification.value = DEFAULTS.customNotification;
  elements.descriptionPreset.value = DEFAULTS.descriptionPreset;
  elements.customDescription.value = DEFAULTS.customDescription;
  elements.reminderMode.value = DEFAULTS.reminderMode;
  elements.reminderMinutes.value = String(DEFAULTS.reminderMinutes);

  const defaultGradeInput = document.querySelector(
    `input[name="gradeName"][value="${DEFAULTS.gradeName}"]`
  );

  if (defaultGradeInput) {
    defaultGradeInput.checked = true;
  }

  renderNotifyHours();
  renderSyncHours();
  renderSyncPresets();
  elements.notifyHour.value = String(DEFAULTS.notifyHour);
  updateNotifyHourState();
  updateEventOptionVisibility();
  bindEvents();
  setupValidation();
  initVisualExperience();
  renderCourses();
  updateOutput();
  renderSettingsSummary();
  await loadGradeSchedule(DEFAULTS.gradeName);
}

function bindEvents() {
  elements.form.addEventListener('input', event => {
    if (event.target.name === 'gradeName') {
      state.activeFilter = '全部';
      resetFilterTabs();
      elements.courseSearch.value = '';
      renderSettingsSummary();
      loadGradeSchedule(event.target.value);
      return;
    }

    if (event.target === elements.notificationEmail) {
      updateNotifyHourState();
    }

    if (event.target === elements.includeActivities) {
      renderCourses();
    }

    if (event.target === elements.notificationPreset || event.target === elements.descriptionPreset || event.target === elements.reminderMode) {
      updateEventOptionVisibility();
    }

    updateOutput();
    renderSettingsSummary();
  });

  elements.courseSearch.addEventListener('input', renderCourses);
  elements.courseList.addEventListener('change', handleCourseSelectionChange);

  elements.clearCourses.addEventListener('click', () => {
    getSelectedCourses().clear();
    renderCourses();
    updateOutput();
    renderSettingsSummary();
  });

  elements.copyCode.addEventListener('click', copyGeneratedCode);

  if (elements.copyCodeInline) {
    elements.copyCodeInline.addEventListener('click', copyGeneratedCode);
  }

  elements.selectedToggle.addEventListener('click', () => {
    state.selectedCoursesExpanded = !state.selectedCoursesExpanded;
    renderSelectedCourses();
  });

  elements.sourceRefresh.addEventListener('click', () => {
    loadGradeSchedule(getCurrentGrade(), { force: true });
  });

  bindFilterTabs();
  bindExpandTimeBtn();
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
    }
  }
}

function renderSourceStatus() {
  if (state.sourceLoading) {
    elements.sourceStatus.dataset.state = 'loading';
    elements.sourceStatusTitle.textContent = '正在讀取課表';
    elements.sourceStatusDetail.textContent = '確認目前年級與課程資料';
    elements.sourceRefresh.disabled = true;
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
    elements.sourceStatusTitle.textContent = '尚未讀取課表';
    elements.sourceStatusDetail.textContent = '選擇年級後會自動確認資料';
    return;
  }

  const summary = state.sourceSummary;
  elements.sourceStatus.dataset.state = 'success';
  elements.sourceStatusTitle.textContent = `${getCurrentGrade()}課表可用`;
  elements.sourceStatusDetail.textContent = [
    `${formatDateLabel(summary.firstDate)}–${formatDateLabel(summary.lastDate)}`,
    `${summary.catalog.courses.length} 門課`,
    `${summary.catalog.activities.length} 項活動`
  ].join(' · ');
}

function bindFilterTabs() {
  const container = document.getElementById('filter-tabs');

  if (!container) {
    return;
  }

  container.addEventListener('click', event => {
    const tab = event.target.closest('.filter-tab');

    if (tab) {
      selectFilterTab(tab);
    }
  });

  container.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }

    const tabs = Array.from(container.querySelectorAll('.filter-tab'));
    const currentIndex = tabs.indexOf(document.activeElement);

    if (currentIndex < 0) {
      return;
    }

    event.preventDefault();
    let nextIndex = currentIndex;

    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;

    tabs[nextIndex].focus();
    selectFilterTab(tabs[nextIndex]);
  });
}

function selectFilterTab(tab) {
  document.querySelectorAll('.filter-tab').forEach(item => {
    const selected = item === tab;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
  });

  state.activeFilter = tab.dataset.filter;
  renderCourses();
}

function resetFilterTabs() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    const selected = tab.dataset.filter === '全部';
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
}

function renderSyncPresets() {
  const container = document.getElementById('sync-presets');

  if (!container) {
    return;
  }

  container.innerHTML = SYNC_PRESETS.map(({ label, hour }) => {
    const checkbox = document.querySelector(`input[name="syncHour"][value="${hour}"]`);
    const checked = checkbox ? checkbox.checked : DEFAULTS.syncHours.includes(hour);
    return `<button type="button" class="preset-chip${checked ? ' active' : ''}" data-hour="${hour}" data-cursor-label="切換 ${escapeHtml(label)}" aria-pressed="${checked}">${escapeHtml(label)}</button>`;
  }).join('');

  container.querySelectorAll('.preset-chip').forEach(button => {
    button.addEventListener('click', () => {
      const checkbox = document.querySelector(
        `input[name="syncHour"][value="${Number(button.dataset.hour)}"]`
      );

      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        renderSyncPresets();
        updateOutput();
        renderSettingsSummary();
      }
    });
  });
}

function bindExpandTimeBtn() {
  const button = document.getElementById('expand-time-btn');
  const wrap = document.getElementById('time-grid-wrap');

  if (!button || !wrap) {
    return;
  }

  button.addEventListener('click', () => {
    const expanding = wrap.hasAttribute('hidden');
    wrap.toggleAttribute('hidden', !expanding);
    button.setAttribute('aria-expanded', String(expanding));
    button.textContent = expanding ? '收合' : '自訂時段';
  });

  elements.syncHours.addEventListener('change', renderSyncPresets);
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
}

function validateNotificationEmail() {
  const value = elements.notificationEmail.value.trim();
  const field = document.getElementById('field-notification-email');

  if (!value) {
    elements.notificationEmail.setCustomValidity('');
    setFieldState(field, null, '未填寫時會使用目前 Google 帳號的 Email');
    return true;
  }

  if (/^[^\s@,;<>]+@[^\s@,;<>]+$/.test(value)) {
    elements.notificationEmail.setCustomValidity('');
    setFieldState(field, 'valid', '');
    return true;
  }

  elements.notificationEmail.setCustomValidity('請填入單一通知 Email');
  setFieldState(field, 'invalid', '請填入單一 Email，不要使用逗號、分號或顯示名稱');
  return false;
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
    input.toggleAttribute('aria-invalid', stateValue === 'invalid');
  }

  const hintElement = field.querySelector('.field-hint');

  if (hintElement && hint !== undefined) {
    hintElement.textContent = hint;
  }
}

function renderSyncHours() {
  elements.syncHours.innerHTML = Array.from({ length: 24 }, (_, hour) => {
    const checked = DEFAULTS.syncHours.includes(hour) ? 'checked' : '';
    return `<label><input type="checkbox" name="syncHour" value="${hour}" ${checked}><span>${pad2(hour)}:00</span></label>`;
  }).join('');
}

function renderNotifyHours() {
  elements.notifyHour.innerHTML = Array.from({ length: 24 }, (_, hour) =>
    `<option value="${hour}">${pad2(hour)}:00</option>`
  ).join('');
}

function updateNotifyHourState() {
  const hasEmail = Boolean(elements.notificationEmail.value.trim());
  elements.notifyHour.title = hasEmail ? '' : '未填寫時會使用目前 Google 帳號的 Email';
}

function updateEventOptionVisibility() {
  elements.customNotificationField.hidden = elements.notificationPreset.value !== 'custom';
  elements.customTemplateField.hidden = elements.descriptionPreset.value !== 'custom';
  elements.reminderMinutesField.hidden = elements.reminderMode.value === 'none';
}

function getSelectedCourses(gradeName) {
  const grade = gradeName || getCurrentGrade();

  if (!state.selectedByGrade.has(grade)) {
    state.selectedByGrade.set(grade, new Set());
  }

  return state.selectedByGrade.get(grade);
}

function handleCourseSelectionChange(event) {
  const input = event.target.closest('input[data-course]');

  if (!input) {
    return;
  }

  const selected = getSelectedCourses();

  if (input.checked) {
    selected.add(input.value);
  } else {
    selected.delete(input.value);
  }

  renderCourses();
  updateOutput();
  renderSettingsSummary();
}

function renderCourses() {
  if (state.sourceLoading) {
    elements.courseList.innerHTML = '<div class="course-loading" aria-live="polite"><span class="loading-track" aria-hidden="true"></span><p>正在整理課程與活動…</p></div>';
    renderSelectedCourses();
    return;
  }

  if (state.sourceError) {
    elements.courseList.innerHTML = '<p class="empty-course-list">課表尚未載入，請先重新讀取來源</p>';
    renderSelectedCourses();
    return;
  }

  if (!state.sourceSummary) {
    elements.courseList.innerHTML = '<p class="empty-course-list">選擇年級後會顯示目前課程</p>';
    renderSelectedCourses();
    return;
  }

  const query = normalizeSearchText(elements.courseSearch.value);
  const selected = getSelectedCourses();
  const catalog = state.sourceSummary.catalog;
  const sections = [];

  if (state.activeFilter === '全部' || state.activeFilter === '課程' || state.activeFilter === '已選') {
    const courses = catalog.courses.filter(item => {
      if (state.activeFilter === '已選' && !selected.has(item.title)) {
        return false;
      }

      return normalizeSearchText(item.title).includes(query);
    });

    if (courses.length > 0) {
      sections.push(renderCourseSection('課程', courses.map(renderCourseCard).join('')));
    }
  }

  if (state.activeFilter === '全部' || state.activeFilter === '活動') {
    const activities = catalog.activities.filter(item =>
      normalizeSearchText(item.title).includes(query)
    );

    if (activities.length > 0) {
      sections.push(renderCourseSection(
        '全年級／全校活動',
        activities.map(renderActivityCard).join(''),
        elements.includeActivities.checked ? '依上方開關自動同步' : '目前已關閉'
      ));
    }
  }

  elements.courseList.innerHTML = sections.length > 0
    ? sections.join('')
    : '<p class="empty-course-list">找不到符合條件的項目，請調整搜尋文字或篩選方式</p>';

  renderSelectedCourses();
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
  const enabled = elements.includeActivities.checked;
  return [
    `<div class="course-card activity-card${enabled ? ' is-selected' : ''}" aria-disabled="${!enabled}">`,
    '<span class="activity-marker" aria-hidden="true"></span>',
    `<span>${escapeHtml(item.title)}</span>`,
    `<small>${enabled ? '自動同步' : '未同步'}</small>`,
    '</div>'
  ].join('');
}

function renderSelectedCourses() {
  const selected = Array.from(getSelectedCourses()).sort((a, b) =>
    a.localeCompare(b, 'zh-Hant')
  );

  elements.courseCount.textContent = `已選 ${selected.length} 門課`;
  elements.selectedToggle.textContent = state.selectedCoursesExpanded ? '收合' : '展開';
  elements.selectedToggle.dataset.cursorLabel = state.selectedCoursesExpanded ? '收合' : '展開';
  elements.selectedToggle.setAttribute('aria-expanded', String(state.selectedCoursesExpanded));
  elements.selectedCourses.hidden = !state.selectedCoursesExpanded;

  elements.selectedCourses.innerHTML = selected.length === 0
    ? '<span class="empty-selected">尚未選擇課程</span>'
    : selected.map(course => `<span class="pill">${escapeHtml(course)}</span>`).join('');
}

function getCurrentGrade() {
  const checked = document.querySelector('input[name="gradeName"]:checked');
  return checked ? checked.value : DEFAULTS.gradeName;
}

function getSettings() {
  const selectedHours = Array.from(document.querySelectorAll('input[name="syncHour"]:checked'))
    .map(input => Number(input.value))
    .sort((a, b) => a - b);
  const notifyHour = Number(elements.notifyHour.value);
  const autoSyncHours = selectedHours.length > 0 ? selectedHours : [notifyHour];

  if (!autoSyncHours.includes(notifyHour)) {
    autoSyncHours.push(notifyHour);
    autoSyncHours.sort((a, b) => a - b);
  }

  const summary = state.sourceSummary;

  return {
    appVersion: '2.0.0-mvp',
    sourceApiUrl: window.TSchoolScheduleData.API_URL,
    gradeName: getCurrentGrade(),
    calendarName: DEFAULTS.calendarName,
    notificationEmail: elements.notificationEmail.value.trim(),
    autoSyncHours,
    notifySyncHour: notifyHour,
    includeActivities: elements.includeActivities.checked,
    selectedCourses: Array.from(getSelectedCourses()).sort((a, b) =>
      a.localeCompare(b, 'zh-Hant')
    ),
    notificationPreset: elements.notificationPreset.value,
    customNotification: elements.customNotification.value.trim() || DEFAULTS.customNotification,
    descriptionPreset: elements.descriptionPreset.value,
    customDescription: elements.customDescription.value.trim() || DEFAULTS.customDescription,
    reminderMode: elements.reminderMode.value,
    reminderMinutes: Number(elements.reminderMinutes.value),
    initialTermKey: summary ? summary.termKey : '',
    initialSourceFingerprint: summary ? summary.fingerprint : '',
    initialKnownTitles: summary ? summary.catalog.all.map(item => item.title) : []
  };
}

function updateOutput() {
  const ready = Boolean(state.sourceSummary && !state.sourceLoading && !state.sourceError);
  elements.copyCode.disabled = !ready;

  if (elements.copyCodeInline) {
    elements.copyCodeInline.disabled = !ready;
  }

  if (!ready || typeof window.buildAppsScriptCode !== 'function') {
    elements.generatedCode.value = state.sourceError
      ? '// 課表來源目前無法讀取，請重新嘗試後再複製。'
      : '// 正在準備控制台程式碼…';
    return;
  }

  elements.generatedCode.value = window.buildAppsScriptCode(getSettings());
}

async function copyGeneratedCode() {
  if (!state.sourceSummary || !validateNotificationEmail()) {
    elements.notificationEmail.reportValidity();
    return;
  }

  try {
    await navigator.clipboard.writeText(elements.generatedCode.value);
  } catch (error) {
    elements.generatedCode.focus();
    elements.generatedCode.select();
    document.execCommand('copy');
  }

  showToast('已複製控制台程式碼');
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
  initHeroScroll();
  initStepJourney();
  initCodeDisclosure();
  initKineticCursor();
}

function initSmoothScroll() {
  const canSmooth = window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches;

  if (!canSmooth || typeof window.Lenis !== 'function') {
    return;
  }

  const lenis = new window.Lenis({
    lerp: 0.14,
    smoothWheel: true,
    wheelMultiplier: 1,
    syncTouch: false,
    allowNestedScroll: true,
    anchors: true
  });

  window.tschoolLenis = lenis;

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }

  requestAnimationFrame(raf);
}

function initHeroScroll() {
  const stage = document.getElementById('hero-stage');
  const tiles = Array.from(document.querySelectorAll('.transfer-tile'));

  if (!stage || tiles.length === 0) {
    return;
  }

  let frameRequested = false;

  function update() {
    frameRequested = false;
    const rect = stage.getBoundingClientRect();
    const distance = Math.max(1, rect.height - window.innerHeight);
    const progress = clamp(-rect.top / distance, 0, 1);
    const visual = stage.querySelector('.hero-visual');
    const width = visual ? visual.clientWidth : window.innerWidth;
    const isNarrow = window.matchMedia('(max-width: 600px)').matches;
    const distanceX = width * (isNarrow ? 0.48 : 0.55);

    tiles.forEach((tile, index) => {
      const localProgress = clamp((progress - index * 0.09) / 0.58, 0, 1);
      const eased = 1 - Math.pow(1 - localProgress, 3);
      const arc = Math.sin(Math.PI * eased) * (isNarrow ? -15 : -30);
      const settleY = (index + 1) * (isNarrow ? 2 : 5);
      tile.style.transform = `translate3d(${distanceX * eased}px, ${arc + settleY * eased}px, 0)`;
    });

    stage.classList.toggle('is-complete', progress > 0.82);
  }

  function requestUpdate() {
    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
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
  let frameRequested = false;
  let progressTimer = 0;

  steps.forEach((step, index) => {
    step.style.setProperty('--step-index', String(index + 1));
  });

  function scrollToStep(stepNumber) {
    const target = document.getElementById(`step-${stepNumber}`);

    if (target) {
      if (window.tschoolLenis && !prefersReducedMotion()) {
        window.tschoolLenis.scrollTo(target, { offset: 0, duration: 0.82 });
      } else {
        target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      }
    }
  }

  function setActiveStep(stepNumber) {
    if (stepNumber === activeStep && steps.some(step => step.classList.contains('is-current'))) {
      return;
    }

    activeStep = stepNumber;
    steps.forEach(step => {
      const number = Number(step.dataset.step);
      const distance = activeStep - number;
      step.classList.toggle('is-current', number === activeStep);
      step.classList.toggle('is-past', number < activeStep);
      step.classList.toggle('is-past-one', distance === 1);
      step.classList.toggle('is-past-two', distance === 2);
      step.classList.toggle('is-buried', distance > 2);
      step.classList.toggle('is-future', number > activeStep);
      step.toggleAttribute('inert', number !== activeStep);
    });

    if (elements.progressCurrent && elements.progressNumber) {
      const previous = elements.progressCurrent.textContent;
      elements.progressNumber.dataset.previous = previous;
      elements.progressNumber.dataset.direction = Number(previous) < activeStep ? 'next' : 'previous';
      elements.progressCurrent.textContent = String(activeStep);
      elements.progressNumber.classList.remove('is-changing');
      void elements.progressNumber.offsetWidth;
      elements.progressNumber.classList.add('is-changing');
      clearTimeout(progressTimer);
      progressTimer = window.setTimeout(() => elements.progressNumber.classList.remove('is-changing'), 360);
    }

    if (elements.headerStatus) {
      const labels = ['選擇年級', '選擇課程', '同步與通知', '檢查設定', '安裝控制台'];
      elements.headerStatus.textContent = labels[activeStep - 1];
    }
  }

  function updateFromScroll() {
    frameRequested = false;

    if (wizard && wizard.getBoundingClientRect().top > window.innerHeight * 0.68) {
      return;
    }

    const targetY = Math.min(190, window.innerHeight * 0.32);
    let closestStep = 1;

    steps.forEach(step => {
      const rect = step.getBoundingClientRect();
      if (rect.top <= targetY) {
        closestStep = Math.max(closestStep, Number(step.dataset.step));
      }
    });

    setActiveStep(closestStep);
    updateExitProgress(targetY);
  }

  function updateExitProgress(targetY) {
    const compact = window.matchMedia('(max-width: 600px)').matches;
    const exitY = compact ? -9 : -12;
    const exitScale = compact ? 0.986 : 0.982;
    const exitRotate = compact ? -0.24 : -0.35;

    steps.forEach((step, index) => {
      const number = Number(step.dataset.step);
      const nextStep = steps[index + 1];
      let progress = 0;

      if (nextStep && number === activeStep) {
        const nextTop = nextStep.getBoundingClientRect().top;
        progress = clamp((window.innerHeight - nextTop) / Math.max(1, window.innerHeight - targetY), 0, 1);
      }

      step.classList.toggle('is-exiting', progress > 0.001);
      step.style.setProperty('--exit-y', `${(exitY * progress).toFixed(2)}px`);
      step.style.setProperty('--exit-scale', (1 - (1 - exitScale) * progress).toFixed(4));
      step.style.setProperty('--exit-rotate', `${(exitRotate * progress).toFixed(3)}deg`);
      step.style.setProperty('--exit-opacity', (1 - 0.08 * progress).toFixed(3));
    });
  }

  function requestUpdate() {
    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(updateFromScroll);
    }
  }

  document.addEventListener('click', event => {
    const navigationButton = event.target.closest('[data-step-target]');
    const editButton = event.target.closest('[data-edit-step]');

    if (navigationButton) scrollToStep(Number(navigationButton.dataset.stepTarget));
    if (editButton) scrollToStep(Number(editButton.dataset.editStep));
  });

  if (startButton) {
    startButton.addEventListener('click', () => scrollToStep(1));
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
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

  const selected = Array.from(getSelectedCourses());
  const checkedHours = Array.from(document.querySelectorAll('input[name="syncHour"]:checked'))
    .map(input => `${pad2(Number(input.value))}:00`)
    .sort();
  const email = elements.notificationEmail.value.trim() || '目前 Google 帳號';
  const courses = selected.length > 0
    ? `${selected.length} 門｜${selected.slice(0, 4).join('、')}${selected.length > 4 ? '…' : ''}`
    : '尚未選擇課程';
  const hours = checkedHours.length > 0 ? checkedHours.join('、') : `${pad2(Number(elements.notifyHour.value || 5))}:00`;
  const activityLabel = elements.includeActivities.checked ? '包含年級與全校活動' : '不同步年級與全校活動';

  elements.settingsSummary.innerHTML = [
    renderSummaryItem('年級', getCurrentGrade(), 1),
    renderSummaryItem('課程', courses, 2),
    renderSummaryItem('每日同步', hours, 3),
    renderSummaryItem('通知與活動', `${email}｜${activityLabel}`, 3)
  ].join('');
}

function renderSummaryItem(label, value, editStep) {
  return [
    '<section class="summary-item">',
    `<span>${escapeHtml(label)}</span>`,
    `<strong>${escapeHtml(value)}</strong>`,
    `<button type="button" class="summary-edit" data-edit-step="${editStep}" data-cursor-label="修改" aria-label="修改${escapeHtml(label)}">↗</button>`,
    '</section>'
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
  let visible = false;

  function updateCursorContext(target) {
    const labelled = target && target.closest ? target.closest('[data-cursor-label]') : null;
    const textTarget = target && target.closest
      ? target.closest('input:not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"], [data-cursor-mode="text"]')
      : null;

    cursor.classList.toggle('has-label', Boolean(labelled) && !textTarget);
    cursor.classList.toggle('is-text', Boolean(textTarget));
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

    previousX = event.clientX;
    previousY = event.clientY;
    updateCursorContext(event.target);

    if (!visible) {
      visible = true;
      cursor.style.opacity = '1';
      currentX = targetX;
      currentY = targetY;
    }
  }

  function animate() {
    currentX += (targetX - currentX) * 0.24;
    currentY += (targetY - currentY) * 0.24;
    let angleDelta = ((targetAngle - currentAngle + 540) % 360) - 180;
    currentAngle += angleDelta * 0.18;
    cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    cursor.style.setProperty('--cursor-angle', cursor.classList.contains('is-text') ? '0deg' : `${currentAngle}deg`);
    requestAnimationFrame(animate);
  }

  window.addEventListener('mousemove', updateTarget, { passive: true });
  window.addEventListener('scroll', () => {
    updateCursorContext(document.elementFromPoint(targetX, targetY));
  }, { passive: true });
  document.addEventListener('mouseleave', () => {
    visible = false;
    cursor.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    if (visible) cursor.style.opacity = '1';
  });
  document.addEventListener('mousedown', () => cursor.style.setProperty('--cursor-scale', '0.76'));
  document.addEventListener('mouseup', () => cursor.style.setProperty('--cursor-scale', '1'));
  animate();
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

function formatDateLabel(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
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
