const DEFAULTS = {
  sheetUrl: 'https://docs.google.com/spreadsheets/d/1eigKfzCgULW1homT1l0Xxr9KLh4R2I_fOAqNuKEKhTk/edit?gid=1162754205#gid=1162754205',
  sheetName: '114-2課程規劃',
  calendarId: '',
  gradeName: '高一',
  notificationEmail: '',
  syncHours: [5, 12, 18, 22],
  notifyHour: 5,
  includeWholeSchool: true
};

const SYNC_PRESETS = [
  { label: '05:00', hour: 5 },
  { label: '12:00', hour: 12 },
  { label: '18:00', hour: 18 },
  { label: '22:00', hour: 22 },
];

const COURSE_CATALOG = {
  '高一': {
    defaults: [
      '數位公民(海風班)',
      '數位公民(山嵐班)',
      '學習策略(海風班)',
      '學習策略(山嵐班)',
      'SDGs議題探索(海風班)',
      'SDGs議題探索(山嵐班)',
      'SDGs議題探索(海山合班)',
      '客語',
      '原住民語(雅美語)',
      '手語',
      '閩南語',
      '生涯探索(一)',
      '身體素養(二)'
    ],
    groups: [
      {
        name: '必修',
        courses: [
          '數位公民(海風班)',
          '數位公民(山嵐班)',
          'SDGs議題探索(海風班)',
          'SDGs議題探索(山嵐班)',
          'SDGs議題探索(海山合班)',
          '學習策略(海風班)',
          '學習策略(山嵐班)',
          '客語',
          '客語 （8人）',
          '原住民語(雅美語)',
          '手語',
          '閩南語',
          '生涯探索(一)',
          '身體素養(二)'
        ]
      },
      {
        name: '學科選修',
        courses: [
          '國語文(二)',
          '英語文(二)海風班',
          '英語文(二)山嵐班',
          '數學(二)海風班',
          '數學(二)山嵐班',
          '歷史(二)',
          '地理(二)',
          '公民與社會(二)',
          '科學探究(二)',
          '美術(二)',
          '音樂(二)',
          '生活科技(二)'
        ]
      },
      {
        name: '校內多元選修',
        courses: [
          '認識哲學何不從教育哲學開始',
          '從巴士底到車諾比：歷史的遊戲設計',
          '「話」圖書寫',
          '進階程式設計',
          '資安競賽培訓',
          'Gran Fondo Taiwan',
          '藝術行政與展演',
          '文法充電站',
          '數學補強'
        ]
      },
      {
        name: '跨校多元選修',
        courses: [
          '用Python學運算思維',
          '心理學概論',
          '人工智慧醫療應用',
          '數位星空的魔法碰觸',
          '科技倫理',
          '一起做網美!介面設計實務',
          '系統分析專題',
          '不只英文課:說出、寫出、認出我(們)',
          '基本半導體概論',
          '不一樣又怎樣－城市共生的多元面貌'
        ]
      }
    ]
  },
  '高二': {
    defaults: [
      '身體素養(四)',
      '生涯探索(二)',
      '公民行動',
      '公民行動(二)',
      'SDGs議題探究(二)'
    ],
    groups: [
      {
        name: '必修',
        courses: [
          '身體素養(四)',
          '生涯探索(二)',
          '公民行動',
          '公民行動(二)',
          'SDGs議題探究(二)'
        ]
      },
      {
        name: '學科選修',
        courses: [
          '國語文(四)海風班',
          '國語文(四)山嵐班',
          '國語文進階(二)',
          '英語文(四)海風班',
          '英語文(四)山嵐班',
          '數學(四)數A',
          '數學(四)數B',
          '社會進階(一)',
          '自然進階(一)',
          '藝術生活(二)',
          '藝術生活進階(二)',
          '科技進階(二)'
        ]
      },
      {
        name: '校內多元選修',
        courses: [
          '趣玩地科',
          '做自己的生命設計師',
          '微積分先修',
          '英文語言與文體探究與實作'
        ]
      },
      {
        name: '跨校多元選修',
        courses: [
          'Java語言基本概念與程式設計實作',
          '文法的跳躍音符與樂章',
          '新聞讀、採、寫',
          'App Inventor 2 手機應用程式開發',
          'Python程式設計入門',
          '商業模式',
          '學好日語遊日本!',
          '嘻哈音樂與文化',
          '全雲端3D Onshape繪圖設計及應用',
          '解題萬花筒—國際數學解題',
          '前瞻實驗室:Gen AI與量子電腦的XR創作設計',
          '跨越時空的星鮮人',
          '聰明看棒球',
          '表演創作',
          '傳記閱讀與採訪寫作課程',
          '英語詞根解密2',
          'Python AI實作： 從生活議題到實戰應用'
        ]
      }
    ]
  },
  '高三': {
    defaults: [
      '身體素養(六)',
      '畢業專題',
      '畢業專題（二）'
    ],
    groups: [
      {
        name: '必修',
        courses: [
          '身體素養(六)',
          '畢業專題',
          '畢業專題（二）'
        ]
      },
      {
        name: '學科選修',
        courses: [
          '國語文進階(四)',
          '英語文進階(二)海風班',
          '英語文進階(二)山嵐班',
          '數學進階(二)數甲',
          '數學進階(二)數乙',
          '社會進階(三)',
          '自然進階(三)',
          '藝術生活進階(五)',
          '藝術生活進階(六)',
          '科技進階(四)'
        ]
      },
      {
        name: '校內多元選修',
        courses: [
          '玩遊戲學經濟：行為與決策'
        ]
      },
      {
        name: '跨校多元選修',
        courses: [
          '用Python學運算思維',
          '心理學概論',
          '人工智慧醫療應用',
          '數位星空的魔法碰觸',
          '科技倫理',
          '一起做網美!介面設計實務',
          '系統分析專題',
          '不只英文課:說出、寫出、認出我(們)',
          '基本半導體概論',
          'BLENDER-3D建模的藝想世界',
          'Java語言基本概念與程式設計實作',
          '文法的跳躍音符與樂章',
          '新聞讀、採、寫',
          'App Inventor 2 手機應用程式開發',
          'Python程式設計入門',
          '商業模式',
          '學好日語遊日本!',
          '嘻哈音樂與文化',
          '全雲端3D Onshape繪圖設計及應用',
          '解題萬花筒—國際數學解題',
          '前瞻實驗室:Gen AI與量子電腦的XR創作設計',
          '跨越時空的星鮮人',
          '聰明看棒球',
          '表演創作',
          '傳記閱讀與採訪寫作課程',
          '英語詞根解密2',
          'Python AI實作： 從生活議題到實戰應用'
        ]
      }
    ]
  }
};

const COURSE_VARIANT_OPTIONS = {
  '自然進階(一)': [
    { label: '物理', value: '自然進階(一)_物理' },
    { label: '化學', value: '自然進階(一)_化學' },
    { label: '生物', value: '自然進階(一)_生物' }
  ],
  '自然進階(三)': [
    { label: '物理', value: '自然進階(三)_物理' },
    { label: '化學', value: '自然進階(三)_化學' },
    { label: '生物', value: '自然進階(三)_生物' }
  ]
};

const state = {
  selectedCourses: new Set(),
  activeFilter: '全部',
  selectedCoursesExpanded: false
};

const elements = {
  form: document.querySelector('#config-form'),
  sheetUrl: document.querySelector('#sheet-url'),
  sheetName: document.querySelector('#sheet-name'),
  calendarId: document.querySelector('#calendar-id'),
  notificationEmail: document.querySelector('#notification-email'),
  notifyHour: document.querySelector('#notify-hour'),
  syncHours: document.querySelector('#sync-hours'),
  includeWholeSchool: document.querySelector('#include-whole-school'),
  courseSearch: document.querySelector('#course-search'),
  courseList: document.querySelector('#course-list'),
  selectedCourses: document.querySelector('#selected-courses'),
  selectedToggle: document.querySelector('#selected-toggle'),
  courseCount: document.querySelector('#course-count'),
  generatedCode: document.querySelector('#generated-code'),
  copyCode: document.querySelector('#copy-code'),
  clearCourses: document.querySelector('#clear-courses')
};

function init() {
  elements.sheetUrl.value = DEFAULTS.sheetUrl;
  elements.sheetName.value = DEFAULTS.sheetName;
  elements.calendarId.value = DEFAULTS.calendarId;
  elements.notificationEmail.value = DEFAULTS.notificationEmail;
  elements.includeWholeSchool.checked = DEFAULTS.includeWholeSchool;
  const defaultGradeInput = document.querySelector(`input[name="gradeName"][value="${DEFAULTS.gradeName}"]`);
  if (defaultGradeInput) {
    defaultGradeInput.checked = true;
  }

  renderNotifyHours();
  renderSyncHours();
  renderSyncPresets();
  elements.notifyHour.value = String(DEFAULTS.notifyHour);
  loadGradeDefaults(DEFAULTS.gradeName);
  bindEvents();
  renderCourses();
  updateOutput();
  initMobileOutput();
  setupValidation();
}

function bindEvents() {
  elements.form.addEventListener('input', event => {
    if (event.target.name === 'gradeName') {
      state.activeFilter = '全部';
      resetFilterTabs();
      loadGradeDefaults(event.target.value);
      renderCourses();
    }

    if (event.target === elements.notificationEmail) {
      updateNotifyHourState();
    }

    updateOutput();
  });

  elements.courseSearch.addEventListener('input', renderCourses);

  elements.clearCourses.addEventListener('click', () => {
    state.selectedCourses.clear();
    renderCourses();
    updateOutput();
  });

  elements.copyCode.addEventListener('click', copyGeneratedCode);
  elements.selectedToggle.addEventListener('click', () => {
    state.selectedCoursesExpanded = !state.selectedCoursesExpanded;
    renderSelectedCourses();
  });

  bindFilterTabs();
  bindExpandTimeBtn();
  bindMobileOutputToggle();
}

/* ─── Filter tabs ─── */

function bindFilterTabs() {
  const container = document.getElementById('filter-tabs');
  if (!container) return;

  container.addEventListener('click', event => {
    const tab = event.target.closest('.filter-tab');
    if (!tab) return;

    document.querySelectorAll('.filter-tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');

    state.activeFilter = tab.dataset.filter;
    renderCourses();
  });
}

function resetFilterTabs() {
  document.querySelectorAll('.filter-tab').forEach(t => {
    const isAll = t.dataset.filter === '全部';
    t.classList.toggle('active', isAll);
    t.setAttribute('aria-selected', String(isAll));
  });
}

/* ─── Sync presets ─── */

function renderSyncPresets() {
  const container = document.getElementById('sync-presets');
  if (!container) return;

  container.innerHTML = SYNC_PRESETS.map(({ label, hour }) => {
    const checkbox = document.querySelector(`input[name="syncHour"][value="${hour}"]`);
    const isChecked = checkbox
      ? checkbox.checked
      : DEFAULTS.syncHours.includes(hour);
    return `<button type="button" class="preset-chip${isChecked ? ' active' : ''}" data-hour="${hour}">${escapeHtml(label)}</button>`;
  }).join('');

  container.querySelectorAll('.preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const hour = Number(btn.dataset.hour);
      const checkbox = document.querySelector(`input[name="syncHour"][value="${hour}"]`);
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        renderSyncPresets();
        updateOutput();
      }
    });
  });
}

/* ─── Expand/collapse full time grid ─── */

function bindExpandTimeBtn() {
  const btn = document.getElementById('expand-time-btn');
  const wrap = document.getElementById('time-grid-wrap');
  if (!btn || !wrap) return;

  btn.addEventListener('click', () => {
    const isHidden = wrap.hasAttribute('hidden');
    if (isHidden) {
      wrap.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
    } else {
      wrap.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  elements.syncHours.addEventListener('change', () => {
    renderSyncPresets();
  });
}

/* ─── Mobile output toggle ─── */

function initMobileOutput() {
  if (window.innerWidth <= 640) {
    document.querySelector('.output-pane').classList.add('mobile-collapsed');
    const btn = document.getElementById('mobile-output-toggle');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

function bindMobileOutputToggle() {
  const btn = document.getElementById('mobile-output-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const pane = document.querySelector('.output-pane');
    const isNowCollapsed = pane.classList.toggle('mobile-collapsed');
    btn.setAttribute('aria-expanded', String(!isNowCollapsed));
    btn.setAttribute('aria-label', isNowCollapsed ? '展開程式碼' : '收合程式碼');
  });
}

/* ─── Field validation ─── */

function setupValidation() {
  const sheetUrlInput = document.getElementById('sheet-url');
  const calendarIdInput = document.getElementById('calendar-id');

  sheetUrlInput.addEventListener('blur', () => {
    const val = sheetUrlInput.value.trim();
    const fieldEl = document.getElementById('field-sheet-url');
    if (!val) {
      setFieldState(fieldEl, null, '');
    } else if (val.includes('docs.google.com/spreadsheets/')) {
      setFieldState(fieldEl, 'valid', '');
    } else {
      setFieldState(fieldEl, 'invalid', '請貼上有效的 Google Sheets 連結');
    }
  });

  calendarIdInput.addEventListener('blur', () => {
    const val = calendarIdInput.value.trim();
    const fieldEl = document.getElementById('field-calendar-id');
    if (!val) {
      setFieldState(fieldEl, null, '');
    } else if (val.includes('@')) {
      setFieldState(fieldEl, 'valid', '');
    } else {
      setFieldState(fieldEl, 'invalid', '通常格式為 Gmail 或 ...@group.calendar.google.com');
    }
  });
}

function setFieldState(fieldEl, stateValue, hint) {
  if (!fieldEl) return;
  if (stateValue) {
    fieldEl.dataset.fieldState = stateValue;
  } else {
    delete fieldEl.dataset.fieldState;
  }
  const hintEl = fieldEl.querySelector('.field-hint');
  if (hintEl && hint !== undefined) {
    hintEl.textContent = hint;
  }
}

/* ─── Toast ─── */

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

/* ─── Render functions ─── */

function renderSyncHours() {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  elements.syncHours.innerHTML = hours.map(hour => {
    const checked = DEFAULTS.syncHours.includes(hour) ? 'checked' : '';
    const label = `${pad2(hour)}:00`;
    return `<label><input type="checkbox" name="syncHour" value="${hour}" ${checked}><span>${label}</span></label>`;
  }).join('');
}

function renderNotifyHours() {
  elements.notifyHour.innerHTML = Array.from({ length: 24 }, (_, hour) => {
    return `<option value="${hour}">${pad2(hour)}:00</option>`;
  }).join('');
  updateNotifyHourState();
}

function updateNotifyHourState() {
  const hasEmail = Boolean(elements.notificationEmail.value.trim());
  elements.notifyHour.disabled = !hasEmail;
  elements.notifyHour.title = hasEmail ? '' : '請先填寫通知 Email';
}

function loadGradeDefaults(gradeName) {
  state.selectedCourses = new Set(COURSE_CATALOG[gradeName].defaults);
  elements.courseSearch.value = '';
}

function getCurrentGrade() {
  const checked = document.querySelector('input[name="gradeName"]:checked');
  return checked ? checked.value : DEFAULTS.gradeName;
}

function renderCourses() {
  const gradeName = getCurrentGrade();
  const query = normalizeSearchText(elements.courseSearch.value);
  const catalog = COURSE_CATALOG[gradeName];

  let sourceGroups = catalog.groups;

  if (state.activeFilter && state.activeFilter !== '全部') {
    sourceGroups = sourceGroups.filter(g => g.name === state.activeFilter);
  }

  const groups = sourceGroups
    .map(group => ({
      name: group.name,
      courses: getDisplayCoursesForGroup(group.courses).filter(course =>
        courseMatchesQuery(course, query)
      )
    }))
    .filter(group => group.courses.length > 0);

  elements.courseList.innerHTML = groups.map(group => {
    const cards = group.courses.map(course => {
      return renderCourseCard(course);
    }).join('');

    return `<section class="course-group"><h3>${escapeHtml(group.name)}</h3><div class="course-grid">${cards}</div></section>`;
  }).join('');

  elements.courseList.querySelectorAll('input[data-course-simple]').forEach(input => {
    input.addEventListener('change', event => {
      const course = event.target.value;

      if (event.target.checked) {
        state.selectedCourses.add(course);
      } else {
        state.selectedCourses.delete(course);
      }

      renderSelectedCourses();
      updateOutput();
    });
  });

  elements.courseList.querySelectorAll('input[data-course-parent]').forEach(input => {
    input.addEventListener('change', event => {
      const course = event.target.value;
      const options = COURSE_VARIANT_OPTIONS[course] || [];

      options.forEach(option => {
        if (event.target.checked) {
          state.selectedCourses.add(option.value);
        } else {
          state.selectedCourses.delete(option.value);
        }
      });

      renderCourses();
      updateOutput();
    });
  });

  elements.courseList.querySelectorAll('input[data-course-variant]').forEach(input => {
    input.addEventListener('change', event => {
      const course = event.target.value;

      if (event.target.checked) {
        state.selectedCourses.add(course);
      } else {
        state.selectedCourses.delete(course);
      }

      renderCourses();
      updateOutput();
    });
  });

  renderSelectedCourses();
}

function renderCourseCard(course) {
  const options = COURSE_VARIANT_OPTIONS[course];

  if (!options) {
    const checked = state.selectedCourses.has(course) ? 'checked' : '';
    return `<label class="course-card"><input type="checkbox" data-course-simple value="${escapeHtml(course)}" ${checked}><span>${escapeHtml(course)}</span></label>`;
  }

  const selectedCount = options.filter(option => state.selectedCourses.has(option.value)).length;
  const checked = selectedCount > 0 ? 'checked' : '';
  const optionControls = options.map(option => {
    const optionChecked = state.selectedCourses.has(option.value) ? 'checked' : '';
    return [
      `<label class="course-suboption">`,
      `<input type="checkbox" data-course-variant value="${escapeHtml(option.value)}" ${optionChecked}>`,
      `<span>${escapeHtml(option.label)}</span>`,
      `</label>`
    ].join('');
  }).join('');

  return [
    `<div class="course-card course-card-with-options${selectedCount > 0 ? ' is-selected' : ''}">`,
    `<label class="course-main-toggle">`,
    `<input type="checkbox" data-course-parent value="${escapeHtml(course)}" ${checked}>`,
    `<span>${escapeHtml(course)}</span>`,
    `</label>`,
    `<div class="course-suboptions" aria-label="${escapeHtml(course)}細項">`,
    optionControls,
    `</div>`,
    `</div>`
  ].join('');
}

function courseMatchesQuery(course, query) {
  if (!query) {
    return true;
  }

  if (normalizeSearchText(course).includes(query)) {
    return true;
  }

  return (COURSE_VARIANT_OPTIONS[course] || []).some(option => {
    return normalizeSearchText(option.label).includes(query) ||
      normalizeSearchText(option.value).includes(query);
  });
}

function getDisplayCoursesForGroup(courses) {
  const seen = new Set();

  return courses.filter(course => {
    const key = getCourseDisplayKey(course);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getCourseDisplayKey(course) {
  return normalizeSearchText(course)
    .replace(/\([0-9０-９]+\s*人\)$/i, '');
}

function renderSelectedCourses() {
  const selected = Array.from(state.selectedCourses).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  elements.courseCount.textContent = `已選 ${selected.length} 門課`;
  elements.selectedToggle.textContent = state.selectedCoursesExpanded ? '收合' : '展開';
  elements.selectedToggle.setAttribute('aria-expanded', String(state.selectedCoursesExpanded));
  elements.selectedCourses.hidden = !state.selectedCoursesExpanded;

  if (selected.length === 0) {
    elements.selectedCourses.innerHTML = '<span class="empty-selected">尚未選擇課程</span>';
    return;
  }

  elements.selectedCourses.innerHTML = selected
    .map(course => `<span class="pill">${escapeHtml(course)}</span>`)
    .join('');
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

  return {
    sheetUrl: elements.sheetUrl.value.trim(),
    sheetName: elements.sheetName.value.trim() || DEFAULTS.sheetName,
    calendarId: elements.calendarId.value.trim(),
    gradeName: getCurrentGrade(),
    notificationEmail: elements.notificationEmail.value.trim(),
    autoSyncHours,
    notifySyncHour: notifyHour,
    notifyHour,
    includeWholeSchool: elements.includeWholeSchool.checked,
    selectedCourses: Array.from(state.selectedCourses).sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  };
}

function updateOutput() {
  elements.generatedCode.value = window.buildAppsScriptCode(getSettings());
}

async function copyGeneratedCode() {
  try {
    await navigator.clipboard.writeText(elements.generatedCode.value);
  } catch {
    elements.generatedCode.focus();
    elements.generatedCode.select();
    document.execCommand('copy');
  }
  showToast('✓ 已複製到剪貼簿');
}

/* ─── Utilities ─── */

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
