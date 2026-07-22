const DEFAULTS = {
  gradeName: '',
  notificationEmail: '',
  syncHours: [6],
  notifyHour: 6,
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

// Journey tuning: each completed section reveals the next one in the vertical narrative.
const MOTION_CONFIG = Object.freeze({
  sectionTransitionDuration: 0.72,
  boundaryReleaseDelay: 120,
  boundaryReboundDuration: 0.52,
  boundaryElasticDesktop: 72,
  boundaryElasticMobile: 44,
  activationLineRatio: 0.34,
  activationLineMax: 240,
  homeEntryScrollDuration: 0.9,
  heroTileTravel: 0.72,
  heroTileStagger: 0.08
});

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
  notificationEmail: document.querySelector('#notification-email'),
  notifyHour: document.querySelector('#notify-hour'),
  courseSearch: document.querySelector('#course-search'),
  courseSearchSubmit: document.querySelector('#course-search-submit'),
  courseList: document.querySelector('#course-list'),
  courseCount: document.querySelector('#course-count'),
  notificationSelectionCount: document.querySelector('#notification-selection-count'),
  generatedCode: document.querySelector('#generated-code'),
  copyCode: document.querySelector('#copy-code'),
  copyCodeInline: document.querySelector('#copy-code-inline'),
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
  fullCodeToggle: document.querySelector('#full-code-toggle')
};

function init() {
  elements.notificationEmail.value = DEFAULTS.notificationEmail;
  renderNotifyHours();
  elements.notifyHour.value = String(DEFAULTS.notifyHour);
  updateNotifyHourState();
  bindEvents();
  setupValidation();
  initVisualExperience();
  renderCourses();
  updateOutput();
  renderSettingsSummary();
}

function bindEvents() {
  elements.form.addEventListener('input', event => {
    if (event.target.name === 'gradeName') {
      elements.courseSearch.value = '';
      document.dispatchEvent(new CustomEvent('tschool:grade-selection-start'));
      renderSettingsSummary();
      loadGradeSchedule(event.target.value);
      return;
    }

    if (event.target === elements.notificationEmail) {
      updateNotifyHourState();
    }

    updateOutput();
    renderSettingsSummary();
  });

  elements.courseSearch.addEventListener('input', renderCourses);
  elements.courseList.addEventListener('change', handleCourseSelectionChange);
  elements.courseSearchSubmit?.addEventListener('click', () => elements.courseSearch.focus());

  elements.copyCode.addEventListener('click', copyGeneratedCode);

  if (elements.copyCodeInline) {
    elements.copyCodeInline.addEventListener('click', copyGeneratedCode);
  }

  elements.sourceRefresh.addEventListener('click', () => {
    const grade = getCurrentGrade();
    if (grade) loadGradeSchedule(grade, { force: true });
  });
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
}

function validateNotificationEmail() {
  const value = elements.notificationEmail.value.trim();
  const field = document.getElementById('field-notification-email');

  if (!value) {
    elements.notificationEmail.setCustomValidity('');
    setFieldState(field, null, '通知的原理：透過程式自動「用自己的信箱寄信給自己」');
    return true;
  }

  if (/^[^\s@,;<>]+@[^\s@,;<>]+$/.test(value)) {
    elements.notificationEmail.setCustomValidity('');
    setFieldState(field, 'valid', '通知的原理：透過程式自動「用自己的信箱寄信給自己」');
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

function renderNotifyHours() {
  elements.notifyHour.innerHTML = Array.from({ length: 24 }, (_, hour) =>
    `<option value="${hour}">${pad2(hour)}:00</option>`
  ).join('');
}

function updateNotifyHourState() {
  const hasEmail = Boolean(elements.notificationEmail.value.trim());
  elements.notifyHour.title = hasEmail ? '' : '未填寫時會使用目前 Google 帳號的 Email';
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

  const courses = catalog.courses.filter(item =>
    normalizeSearchText(item.title).includes(query)
  );

  if (courses.length > 0) {
    sections.push(renderCourseSection('課程', courses.map(renderCourseCard).join('')));
  }

  const activities = catalog.activities.filter(item =>
    normalizeSearchText(item.title).includes(query)
  );

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
  if (elements.notificationSelectionCount) elements.notificationSelectionCount.textContent = label;
}

function getCurrentGrade() {
  const checked = document.querySelector('input[name="gradeName"]:checked');
  return checked ? checked.value : '';
}

function getSettings() {
  const notifyHour = Number(elements.notifyHour.value);
  const autoSyncHours = [notifyHour];

  const summary = state.sourceSummary;

  return {
    appVersion: '2.0.0-mvp',
    sourceApiUrl: window.TSchoolScheduleData.API_URL,
    gradeName: getCurrentGrade(),
    calendarName: DEFAULTS.calendarName,
    notificationEmail: elements.notificationEmail.value.trim(),
    autoSyncHours,
    notifySyncHour: notifyHour,
    includeActivities: DEFAULTS.includeActivities,
    excludedActivities: Array.from(getExcludedActivities()).sort((a, b) =>
      a.localeCompare(b, 'zh-Hant')
    ),
    selectedCourses: Array.from(getSelectedCourses()).sort((a, b) =>
      a.localeCompare(b, 'zh-Hant')
    ),
    notificationPreset: DEFAULTS.notificationPreset,
    customNotification: DEFAULTS.customNotification,
    descriptionPreset: DEFAULTS.descriptionPreset,
    customDescription: DEFAULTS.customDescription,
    reminderMode: DEFAULTS.reminderMode,
    reminderMinutes: DEFAULTS.reminderMinutes,
    initialTermKey: summary ? summary.termKey : '',
    initialSourceFingerprint: summary ? summary.fingerprint : '',
    initialKnownTitles: summary ? summary.catalog.all.map(item => item.title) : []
  };
}

function updateOutput() {
  const ready = Boolean(state.sourceSummary && !state.sourceLoading && !state.sourceError);
  elements.copyCode.disabled = !ready;
  const gradeStepComplete = document.querySelector('[data-complete-step="1"]');
  const courseStepComplete = document.querySelector('[data-complete-step="2"]');

  if (gradeStepComplete) {
    gradeStepComplete.disabled = !getCurrentGrade() || !ready;
  }

  if (courseStepComplete) {
    courseStepComplete.disabled = !ready;
  }

  if (elements.copyCodeInline) {
    elements.copyCodeInline.disabled = !ready;
  }

  if (!ready || typeof window.buildAppsScriptCode !== 'function') {
    elements.generatedCode.value = state.sourceError
      ? '// 課表來源目前無法讀取，請重新嘗試後再複製。'
      : '// 正在準備控制臺程式碼…';
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

  showToast('已複製控制臺程式碼');
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
    anchors: true,
    virtualScroll: payload => {
      const boundaryHandler = window.tschoolBoundaryVirtualScroll;
      return typeof boundaryHandler === 'function' ? boundaryHandler(payload) : true;
    }
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
    const scheduleBoard = stage.querySelector('.schedule-board');
    const calendarBoard = stage.querySelector('.calendar-board');
    const width = visual ? visual.clientWidth : window.innerWidth;
    const isNarrow = window.matchMedia('(max-width: 600px)').matches;
    const measuredDistance = scheduleBoard && calendarBoard
      ? calendarBoard.offsetLeft - scheduleBoard.offsetLeft
      : 0;
    const distanceX = measuredDistance > 0
      ? measuredDistance * (isNarrow ? 0.92 : 1)
      : width * (isNarrow ? 0.48 : 0.55);

    tiles.forEach((tile, index) => {
      const localProgress = clamp((progress - index * MOTION_CONFIG.heroTileStagger) / MOTION_CONFIG.heroTileTravel, 0, 1);
      const eased = localProgress * localProgress * localProgress * (localProgress * (localProgress * 6 - 15) + 10);
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
  let maxUnlockedStep = 1;
  let renderedUnlockedStep = 0;
  let frameRequested = false;
  let automatedTargetStep = 0;
  let boundaryElasticActive = false;
  let boundaryReboundActive = false;
  let boundaryRawOverscroll = 0;
  let boundaryReleaseTimer = 0;
  let boundaryFinishTimer = 0;
  let boundaryMotionId = 0;

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
    const naturalTarget = target.getBoundingClientRect().top + window.scrollY - offset;
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

    resetBoundaryMotion();
    setActiveStep(stepNumber);
    const scrollTarget = getStepScrollTarget(target, stepNumber);

    if (window.tschoolLenis && !prefersReducedMotion()) {
      window.tschoolLenis.scrollTo(scrollTarget, { duration });
    } else {
      window.scrollTo({
        top: scrollTarget,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      });
    }

    focusStepHeading(target, prefersReducedMotion() ? 0 : duration * 1000);
  }

  function enterFirstStepWithPageScroll() {
    const target = steps[0];

    if (!target) {
      return;
    }

    resetBoundaryMotion();
    const scrollTarget = getStepScrollTarget(target, 1);

    if (window.tschoolLenis && !prefersReducedMotion()) {
      window.tschoolLenis.scrollTo(scrollTarget, {
        duration: MOTION_CONFIG.homeEntryScrollDuration
      });
    } else {
      window.scrollTo({ top: scrollTarget, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }

  function setActiveStep(stepNumber) {
    const nextActiveStep = clamp(stepNumber, 1, maxUnlockedStep);

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
      step.style.setProperty('--section-scale', distance === 0 ? '1' : String(Math.max(0.97, 1 - distance * 0.008)));
      step.toggleAttribute('inert', number !== activeStep);
    });

    elements.stageMenuItems.forEach(item => {
      const targetStep = Number(item.dataset.stepTarget);
      const isCurrent = targetStep === activeStep;
      item.toggleAttribute('aria-current', isCurrent);
      if (isCurrent) item.setAttribute('aria-current', 'step');
      item.disabled = targetStep > maxUnlockedStep;
    });
  }

  function unlockAndScrollToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > steps.length) {
      return;
    }

    resetBoundaryMotion();
    maxUnlockedStep = Math.max(maxUnlockedStep, stepNumber);
    const target = steps[stepNumber - 1];
    automatedTargetStep = stepNumber;
    target.classList.add('is-entering');
    setActiveStep(stepNumber);
    void target.offsetWidth;
    requestAnimationFrame(() => {
      window.tschoolLenis?.resize?.();
      requestAnimationFrame(() => scrollToStep(stepNumber));
    });
    window.setTimeout(() => {
      automatedTargetStep = 0;
      target.classList.remove('is-entering');
      requestUpdate();
    }, MOTION_CONFIG.sectionTransitionDuration * 1000 + 160);
  }

  function updateFromScroll() {
    frameRequested = false;

    if (enforceScrollBoundary()) return;

    if (automatedTargetStep) {
      setActiveStep(automatedTargetStep);
      return;
    }

    const maximumScrollY = getMaximumScrollY();
    if (Number.isFinite(maximumScrollY) && window.scrollY >= maximumScrollY - 1) {
      setActiveStep(maxUnlockedStep);
      return;
    }

    if (wizard && wizard.getBoundingClientRect().top > window.innerHeight * 0.68) {
      setActiveStep(1);
      return;
    }

    const targetY = Math.min(
      MOTION_CONFIG.activationLineMax,
      window.innerHeight * MOTION_CONFIG.activationLineRatio
    );
    let closestStep = 1;

    steps.forEach(step => {
      const number = Number(step.dataset.step);

      if (number > maxUnlockedStep) {
        return;
      }

      const rect = step.getBoundingClientRect();
      if (rect.top <= targetY) {
        closestStep = Math.max(closestStep, number);
      }
    });

    setActiveStep(closestStep);
  }

  function getMaximumScrollY() {
    const boundaryStep = steps[maxUnlockedStep - 1];
    const boundaryCard = boundaryStep?.querySelector('.step-card');
    const boundaryElement = boundaryStep?.querySelector('.step-completion') || boundaryCard;
    const previewCard = steps[maxUnlockedStep]?.querySelector('.step-card');

    if (!boundaryElement) {
      return Number.POSITIVE_INFINITY;
    }

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

    return Math.max(0, fallbackTarget, cardCenterTarget, previewTarget);
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

  function getBoundaryElasticLimit() {
    return window.matchMedia('(max-width: 600px)').matches
      ? MOTION_CONFIG.boundaryElasticMobile
      : MOTION_CONFIG.boundaryElasticDesktop;
  }

  function getBoundaryResistedOffset(rawOverscroll, elasticLimit) {
    return elasticLimit * (1 - Math.exp(-rawOverscroll / (elasticLimit * 1.4)));
  }

  function getBoundaryRawOverscroll(offset, elasticLimit) {
    const ratio = clamp(offset / elasticLimit, 0, 0.985);
    return -elasticLimit * 1.4 * Math.log(1 - ratio);
  }

  function setBoundaryScrollPosition(target) {
    if (window.tschoolLenis) {
      window.tschoolLenis.scrollTo(target, { immediate: true, force: true });
    } else {
      window.scrollTo({ top: target, behavior: 'auto' });
    }
  }

  function resetBoundaryMotion() {
    boundaryMotionId += 1;
    window.clearTimeout(boundaryReleaseTimer);
    window.clearTimeout(boundaryFinishTimer);
    boundaryReleaseTimer = 0;
    boundaryFinishTimer = 0;
    boundaryElasticActive = false;
    boundaryReboundActive = false;
    boundaryRawOverscroll = 0;
  }

  function scheduleBoundaryRebound(motionId) {
    window.clearTimeout(boundaryReleaseTimer);
    boundaryReleaseTimer = window.setTimeout(() => {
      if (motionId !== boundaryMotionId) return;

      const maximumScrollY = getMaximumScrollY();
      let completed = false;
      boundaryReboundActive = true;
      boundaryRawOverscroll = 0;

      const finish = () => {
        if (completed || motionId !== boundaryMotionId) return;
        completed = true;
        boundaryElasticActive = false;
        boundaryReboundActive = false;
        boundaryFinishTimer = 0;
        requestUpdate();
      };

      if (window.tschoolLenis && !prefersReducedMotion()) {
        window.tschoolLenis.scrollTo(maximumScrollY, {
          duration: MOTION_CONFIG.boundaryReboundDuration,
          force: true,
          onComplete: finish
        });
        boundaryFinishTimer = window.setTimeout(
          finish,
          MOTION_CONFIG.boundaryReboundDuration * 1000 + 120
        );
      } else {
        window.scrollTo({
          top: maximumScrollY,
          behavior: prefersReducedMotion() ? 'auto' : 'smooth'
        });
        boundaryFinishTimer = window.setTimeout(
          finish,
          prefersReducedMotion() ? 0 : MOTION_CONFIG.boundaryReboundDuration * 1000 + 120
        );
      }
    }, MOTION_CONFIG.boundaryReleaseDelay);
  }

  function applyBoundaryDelta(deltaY) {
    const maximumScrollY = getMaximumScrollY();

    if (!Number.isFinite(maximumScrollY)) return false;

    const elasticLimit = getBoundaryElasticLimit();
    const currentOffset = Math.max(0, window.scrollY - maximumScrollY);
    const observedRawOverscroll = getBoundaryRawOverscroll(currentOffset, elasticLimit);
    boundaryRawOverscroll = Math.max(boundaryRawOverscroll, observedRawOverscroll);
    boundaryRawOverscroll = clamp(
      boundaryRawOverscroll + deltaY,
      0,
      elasticLimit * 12
    );
    boundaryMotionId += 1;
    const motionId = boundaryMotionId;
    window.clearTimeout(boundaryReleaseTimer);
    window.clearTimeout(boundaryFinishTimer);
    boundaryReboundActive = false;

    if (boundaryRawOverscroll <= 0.5) {
      boundaryElasticActive = false;
      boundaryRawOverscroll = 0;
      setBoundaryScrollPosition(maximumScrollY);
      return true;
    }

    boundaryElasticActive = true;
    const resistedOffset = getBoundaryResistedOffset(boundaryRawOverscroll, elasticLimit);
    setBoundaryScrollPosition(maximumScrollY + resistedOffset);
    scheduleBoundaryRebound(motionId);
    return true;
  }

  function handleBoundaryVirtualScroll(payload) {
    const event = payload?.event;
    const deltaY = Number(payload?.deltaY) || 0;

    if (automatedTargetStep || !event?.type.includes('wheel') || deltaY === 0) {
      return true;
    }

    const maximumScrollY = getMaximumScrollY();
    const boundaryEngaged = Number.isFinite(maximumScrollY) && (
      window.scrollY >= maximumScrollY - 1 ||
      boundaryElasticActive ||
      boundaryReboundActive
    );

    if (!boundaryEngaged || (deltaY < 0 && !boundaryElasticActive && !boundaryReboundActive)) {
      return true;
    }

    if (event.cancelable) event.preventDefault();
    applyBoundaryDelta(deltaY > 0 ? deltaY : deltaY * 1.35);
    return false;
  }

  function enforceScrollBoundary() {
    if (boundaryElasticActive || boundaryReboundActive || automatedTargetStep) {
      return false;
    }

    const maximumScrollY = getMaximumScrollY();

    if (window.scrollY <= maximumScrollY + 1) {
      return false;
    }

    applyBoundaryDelta(0);
    return true;
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
    const completionButton = event.target.closest('[data-complete-step]');

    if (navigationButton && !navigationButton.disabled) {
      scrollToStep(Number(navigationButton.dataset.stepTarget));
      if (elements.stageMenu?.contains(navigationButton)) setStageMenuOpen(false, false);
    }
    if (editButton) {
      scrollToStep(Number(editButton.dataset.editStep));
    }

    if (completionButton) {
      const completedStep = Number(completionButton.dataset.completeStep);

      if (
        (completedStep === 1 || completedStep === 2) &&
        (!state.sourceSummary || state.sourceLoading || state.sourceError)
      ) {
        showToast(state.sourceError ? '請先重新讀取課表' : '課表仍在讀取中');
        return;
      }

      if (completedStep === 1 && !getCurrentGrade()) {
        showToast('請先選擇年級');
        return;
      }

      if (completedStep === 3 && !validateNotificationEmail()) {
        elements.notificationEmail.reportValidity();
        elements.notificationEmail.focus();
        return;
      }

      unlockAndScrollToStep(completedStep + 1);
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

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && elements.stageMenuTrigger?.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      setStageMenuOpen(false, true);
    }
  });

  document.addEventListener('tschool:grade-selection-start', () => {
    const firstStep = steps[0];
    resetBoundaryMotion();
    automatedTargetStep = 0;
    maxUnlockedStep = 1;
    setActiveStep(1);
    firstStep.classList.add('is-advancing');
    window.setTimeout(() => firstStep.classList.remove('is-advancing'), 760);
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

  window.addEventListener('wheel', event => {
    if (window.tschoolLenis) return;
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    handleBoundaryVirtualScroll({ deltaY: event.deltaY * multiplier, event });
  }, { passive: false });

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', () => {
    enforceScrollBoundary();
    requestUpdate();
  });
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

  const selected = Array.from(getSelectedCourses()).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const catalog = state.sourceSummary?.catalog || { courses: [], activities: [] };
  const selectedActivities = catalog.activities
    .filter(item => isActivitySelected(item.title))
    .map(item => item.title);
  const unselectedCourses = catalog.courses
    .filter(item => !getSelectedCourses().has(item.title))
    .map(item => item.title);
  const unselectedActivities = catalog.activities
    .filter(item => !isActivitySelected(item.title))
    .map(item => item.title);
  const selectedItems = selected.concat(selectedActivities);
  const unselectedItems = unselectedCourses.concat(unselectedActivities);
  const email = elements.notificationEmail.value.trim();
  const notificationTime = `${pad2(Number(elements.notifyHour.value || DEFAULTS.notifyHour))}:00`;

  elements.settingsSummary.innerHTML = [
    renderSummaryRow([
      ['你選的年級是：', getCurrentGrade() || '尚未選擇']
    ], 1, '修改年級'),
    renderSummaryRow([
      ['你選的課程與活動有：', selectedItems.length ? selectedItems.join('、') : '尚未選擇'],
      ['你「沒」選的課程與活動有：', unselectedItems.length ? unselectedItems.join('、') : '沒有']
    ], 2, '修改課程與活動'),
    renderSummaryRow([
      ['你想用來收通知的 Email 是：', email || '未填寫', email ? '' : 'is-error'],
      ['你想收到通知的時間是：', notificationTime]
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
      `<span class="summary-value${tone ? ` ${tone}` : ''}">${escapeHtml(value)}</span>`,
      '</div>'
    ].join('')).join(''),
    '</div>',
    `<button type="button" class="icon-button summary-edit" data-edit-step="${editStep}" data-cursor-label="修改" aria-label="${escapeHtml(editLabel)}"><img src="assets/icon-arrow-up-right.svg" alt=""></button>`,
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
