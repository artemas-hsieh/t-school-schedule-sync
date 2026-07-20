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
  reminderMinutesField: document.querySelector('#reminder-minutes-field')
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
  initMobileOutput();
  setupValidation();
  renderCourses();
  updateOutput();
  await loadGradeSchedule(DEFAULTS.gradeName);
}

function bindEvents() {
  elements.form.addEventListener('input', event => {
    if (event.target.name === 'gradeName') {
      state.activeFilter = '全部';
      resetFilterTabs();
      elements.courseSearch.value = '';
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
  });

  elements.courseSearch.addEventListener('input', renderCourses);
  elements.courseList.addEventListener('change', handleCourseSelectionChange);

  elements.clearCourses.addEventListener('click', () => {
    getSelectedCourses().clear();
    renderCourses();
    updateOutput();
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
  bindMobileOutputToggle();
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
    return `<button type="button" class="preset-chip${checked ? ' active' : ''}" data-hour="${hour}" aria-pressed="${checked}">${escapeHtml(label)}</button>`;
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
}

function renderCourses() {
  if (state.sourceLoading) {
    elements.courseList.innerHTML = '<div class="course-loading" aria-live="polite"><span class="loading-track" aria-hidden="true"></span><p>正在整理課程與活動…</p></div>';
    renderSelectedCourses();
    return;
  }

  if (state.sourceError) {
    elements.courseList.innerHTML = '<p class="empty-course-list">課表尚未載入，請先重新讀取來源。</p>';
    renderSelectedCourses();
    return;
  }

  if (!state.sourceSummary) {
    elements.courseList.innerHTML = '<p class="empty-course-list">選擇年級後會顯示目前課程。</p>';
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
    : '<p class="empty-course-list">找不到符合條件的項目，請調整搜尋文字或篩選方式。</p>';

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
  return `<label class="course-card"><input type="checkbox" data-course value="${escapeHtml(item.title)}" ${checked}><span>${escapeHtml(item.title)}</span></label>`;
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
