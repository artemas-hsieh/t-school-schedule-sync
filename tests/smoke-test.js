'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const scheduleData = require(path.join(root, 'schedule-data.js'));

global.window = global;
require(path.join(root, 'sidebar-template.js'));
require(path.join(root, 'code-template.js'));

const sidebarHtml = global.TSCHOOL_SIDEBAR_HTML;
const configuratorHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const configuratorAppSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const configuratorStylesSource = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const emailTemplateManifestText = fs.readFileSync(
  path.join(root, 'notification-email-templates.json'),
  'utf8'
);
const emailTemplateManifest = JSON.parse(emailTemplateManifestText);
const sidebarIds = Array.from(sidebarHtml.matchAll(/\sid="([^"]+)"/g), match => match[1]);
const sidebarIdSet = new Set(sidebarIds);
const sidebarByIdReferences = Array.from(
  new Set(
    Array.from(
      sidebarHtml.matchAll(/byId\((?:'([^']+)'|"([^"]+)")\)/g),
      match => match[1] || match[2]
    )
  )
);

assert.equal(sidebarIdSet.size, sidebarIds.length, 'Google Sheet 控制臺不應出現重複 id');
assert.deepEqual(
  sidebarByIdReferences.filter(id => !sidebarIdSet.has(id)),
  [],
  '控制臺腳本引用的固定 id 都必須存在於側欄標記中'
);
assert.equal(sidebarHtml.includes('--primary-container'), false);
assert.equal(sidebarHtml.includes('T-SCHOOL · Control'), false);
assert.equal(sidebarHtml.includes('id="notification-preview"'), false);
assert.equal(sidebarHtml.includes('id="notification-preset"'), false);
assert.equal(sidebarHtml.includes('id="custom-notification"'), false);
assert.equal(sidebarHtml.includes('id="description-preview"'), false);
assert.equal(sidebarHtml.includes('id="description-preset"'), false);
assert.equal(sidebarHtml.includes('id="custom-description"'), false);
assert.equal(sidebarHtml.includes('<span>說明格式</span>'), false);
assert.equal(sidebarHtml.includes('id="hours"'), false, '控制臺不應顯示與實際設定不一致的固定同步時段');
assert.equal(sidebarHtml.includes('id="calendar-name"'), true);
assert.equal(sidebarHtml.includes('id="sync-progress"'), true);
assert.equal(sidebarHtml.includes('function pollSyncProgress()'), true);
assert.equal(sidebarHtml.includes('id="sync-progress-warning"'), true);
assert.equal(sidebarHtml.includes('請勿現在關閉側欄！'), true);
assert.equal(sidebarHtml.includes('overscroll-behavior-y: auto'), true);
assert.equal(sidebarHtml.includes('overscroll-behavior: contain'), false);
assert.equal(sidebarHtml.includes('id="course-list-shell"'), true);
assert.equal(sidebarHtml.includes('--course-scroll-shadow-size: var(--space-7)'), true);
assert.equal(sidebarHtml.includes('data-can-scroll-up="true"]::before'), true);
assert.equal(sidebarHtml.includes('data-can-scroll-down="true"]::after'), true);
assert.equal(sidebarHtml.includes('function updateCourseScrollShadows()'), true);
assert.equal(
  sidebarHtml.includes(
    "byId('course-list').addEventListener('scroll', updateCourseScrollShadows, { passive: true })"
  ),
  true
);
assert.equal(sidebarHtml.includes('id="source-updated"'), false);
assert.equal(sidebarHtml.includes('id="app-version"'), false);
assert.equal(sidebarHtml.includes('class="sync-estimate"'), false);
const sidebarSectionRule = sidebarHtml.match(/\.section \{([\s\S]*?)\}/);
assert.equal(Boolean(sidebarSectionRule), true);
assert.equal(sidebarSectionRule[1].includes('border'), false);
assert.equal(sidebarHtml.includes('<h2>來源</h2>'), false);
assert.equal(sidebarHtml.includes('--section-gap: var(--space-7)'), true);
assert.equal(sidebarHtml.includes('--section-content-gap: var(--space-4)'), true);
assert.equal(
  sidebarHtml.includes('margin-bottom: var(--section-content-gap)'),
  true
);
assert.equal(
  sidebarHtml.includes('.section-head + .calendar-picker > .field:first-child { margin-top: 0; }'),
  true
);
assert.equal(sidebarHtml.includes('--chrome-line: #B7C6BF'), true);
assert.equal(sidebarHtml.includes('border-bottom: 1px solid var(--chrome-line)'), true);
assert.equal(sidebarHtml.includes('border-top: 1px solid var(--chrome-line)'), true);
assert.equal(sidebarHtml.includes('<h2>通知</h2>'), true);
assert.equal(sidebarHtml.includes('<h2>設定通知偏好</h2>'), false);
assert.equal(sidebarHtml.includes('可設定 1–4 個時間'), false);
assert.equal(sidebarHtml.includes('<h2>事件呈現</h2>'), false);
assert.equal(sidebarHtml.includes('可隨時調整'), false);
assert.equal(sidebarHtml.includes('<h2>通知與自動同步</h2>'), false);
assert.equal(sidebarHtml.includes('id="sync-menu-toggle"'), true);
assert.equal(sidebarHtml.includes('id="run-sync" role="menuitem"'), true);
assert.equal(sidebarHtml.includes('id="repair-sync" role="menuitem"'), true);
assert.equal(
  sidebarHtml.includes("setSyncMenuOpen(byId('sync-menu').hidden, true)"),
  true,
  '同步選單開啟後應將焦點移入第一個選單項目'
);
const syncStatusHeadingIndex = sidebarHtml.indexOf('<h2>同步狀態</h2>');
const calendarHeadingIndex = sidebarHtml.indexOf('<h2>日曆</h2>');
const autoSyncIndex = sidebarHtml.indexOf('id="auto-sync"');
const gradeHeadingIndex = sidebarHtml.indexOf('<h2>年級</h2>');
const sourceHealthIndex = sidebarHtml.indexOf('id="source-health"');
assert.equal(syncStatusHeadingIndex < autoSyncIndex, true);
assert.equal(autoSyncIndex < calendarHeadingIndex, true);
assert.equal(calendarHeadingIndex < gradeHeadingIndex, true);
assert.equal(gradeHeadingIndex < sourceHealthIndex, true);
assert.equal(
  sidebarHtml.includes('class="sync-stat-grid" aria-label="上次同步事件統計"'),
  true
);
assert.equal((sidebarHtml.match(/class="sync-stat"/g) || []).length, 4);
['sync-created', 'sync-updated', 'sync-deleted', 'sync-unchanged'].forEach(id => {
  assert.equal(sidebarHtml.includes(`id="${id}"`), true);
});
assert.equal(
  sidebarHtml.includes(
    "(Number(status && status.updated) || 0) + (Number(status && status.outlineUpdated) || 0)"
  ),
  true
);
assert.equal(sidebarHtml.includes('id="status-message" role="alert" hidden'), true);
assert.equal(sidebarHtml.includes('class="grade-options" role="radiogroup" aria-label="選年級"'), true);
assert.equal(sidebarHtml.includes('<span>同步目標日曆</span>'), true);
assert.equal(sidebarHtml.includes('<span>同步目標</span>'), false);
assert.equal(sidebarHtml.includes('<span>活動提醒</span>'), true);
assert.equal(
  sidebarHtml.indexOf('<span>活動提醒</span>') > calendarHeadingIndex &&
    sidebarHtml.indexOf('<span>活動提醒</span>') < gradeHeadingIndex,
  true
);
assert.match(
  sidebarHtml,
  /\.switch-track \{[^}]*border-radius: var\(--radius-control\);/
);
assert.match(
  sidebarHtml,
  /\.switch-track::after \{[^}]*border-radius: var\(--radius-control\);/
);
assert.equal(
  sidebarHtml.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'),
  true
);
assert.equal((sidebarHtml.match(/class="choice grade-choice"/g) || []).length, 3);
assert.equal(sidebarHtml.includes('關閉後仍可用底部按鈕手動同步'), true);
assert.equal(sidebarHtml.includes('關閉後仍可從下方選單手動同步'), false);
assert.equal(sidebarHtml.includes('content: "✓"'), false);
assert.equal(sidebarHtml.includes('id="term-transition" role="alert"'), true);
assert.equal(sidebarHtml.includes('id="term-transition-action"'), true);
assert.equal(sidebarHtml.includes('function updateActionAvailability()'), true);
assert.equal(sidebarHtml.includes('@media (max-width: 340px)'), true);
assert.equal(sidebarHtml.includes('@media (prefers-reduced-motion: reduce)'), true);
assert.equal(sidebarHtml.includes('<p class="eyebrow">T-SCHOOL Schedule Sync</p>'), true);
assert.equal(sidebarHtml.includes('<p class="eyebrow">T-SCHOOL 行程同步</p>'), false);
assert.equal(sidebarHtml.includes('grid-template-areas:'), true);
assert.equal(
  sidebarHtml.includes('data-state="attention" role="status" aria-live="polite">待首次同步</p>'),
  true
);
['待首次同步', '需檢查狀態', '待重新選課', '同步正常'].forEach(statusLabel => {
  assert.equal(sidebarHtml.includes(statusLabel), true);
});
assert.equal(sidebarHtml.includes('同步功能正常'), false);
assert.equal(sidebarHtml.includes('需要檢查同步狀態'), false);
assert.equal(sidebarHtml.includes('尚未完成第一次同步'), false);
assert.equal(sidebarHtml.includes('<h2>課程與活動</h2>'), true);
['<h2>設定日曆</h2>', '<h2>選年級</h2>', '<h2>選課程和活動</h2>'].forEach(
  obsoleteHeading => {
    assert.equal(sidebarHtml.includes(obsoleteHeading), false);
  }
);
assert.equal(sidebarHtml.includes('輸入課名、活動名、班別等'), true);
assert.equal(sidebarHtml.includes('學期間課程'), true);
assert.equal(sidebarHtml.includes('學期間活動'), true);
assert.equal(sidebarHtml.includes('寒暑假期間課程 / 活動'), true);
assert.equal(sidebarHtml.includes('<span>收通知的 Email</span>'), true);
assert.equal(
  sidebarHtml.includes('<small class="hint">為了讓程式能存取課綱，請輸入校內 Email</small>'),
  true
);
assert.equal(sidebarHtml.includes('<span>通知 Email</span>'), false);
assert.equal(sidebarHtml.includes('id="notify-hours-list"'), true);
assert.equal(sidebarHtml.includes('data-add-notify-hour'), true);
assert.equal(sidebarHtml.includes('data-remove-notify-hour'), true);
assert.equal(sidebarHtml.includes('autoSyncHours: notificationHours'), true);
assert.equal(sidebarHtml.includes('notifySyncHour: Math.max.apply(null, notificationHours)'), true);
assert.equal(
  sidebarHtml.includes("'prepareFirstSyncCourseOutlinesFromUi'"),
  true,
  '第一次同步前應以獨立 Apps Script 執行預讀 30 天課綱'
);
assert.equal(
  sidebarHtml.includes('正在準備未來 30 天的課綱資料…'),
  true
);
assert.equal(sidebarHtml.includes('<span>每日成功摘要</span>'), false);
assert.equal(sidebarHtml.includes('id="include-activities"'), false);
assert.equal(configuratorHtml.includes('id="high-load-test-banner"'), true);
assert.equal(configuratorHtml.includes('id="high-load-test-banner" role="status" hidden'), true);
assert.match(
  configuratorHtml,
  /<link id="app-stylesheet" rel="stylesheet" href="styles\.css\?v=[^"]+">/,
  '主要樣式必須在 head 中以可阻塞首次繪製的固定網址載入'
);
assert.match(
  configuratorStylesSource,
  /html \{[\s\S]*?scrollbar-width: none;/,
  '根頁面應隱藏 Firefox 捲動條，但不得停用頁面捲動'
);
assert.match(
  configuratorStylesSource,
  /html::\-webkit-scrollbar,\s*body::\-webkit-scrollbar \{\s*display: none;/,
  '根頁面應隱藏 Chromium 與 Safari 捲動條'
);
assert.doesNotMatch(
  configuratorHtml,
  /id="generated-code"[^>]*\sdata-lenis-prevent(?:\s|>)/,
  '程式碼預覽沒有內嵌捲動，不得繞過頁面的 Lenis 捲動'
);
assert.match(
  configuratorHtml,
  /<textarea id="generated-code"[^>]*\sreadonly(?:\s|>)/,
  '程式碼預覽應維持唯讀並允許使用者選取文字'
);
assert.equal(
  configuratorHtml.includes("document.getElementById('app-stylesheet').href ="),
  false,
  '不得以 JavaScript 延後指定主要樣式網址，避免未套樣式內容閃現'
);
assert.equal(
  configuratorHtml.includes('Date.now()'),
  false,
  '每次載入不得產生全新的資產版本，否則瀏覽器無法沿用快取'
);
assert.equal(configuratorAppSource.includes('const ENABLE_HIGH_LOAD_TEST_FEATURE = true;'), true);
assert.equal(emailTemplateManifest.schemaVersion, 1);
assert.deepEqual(
  Object.keys(emailTemplateManifest.notifications).sort(),
  [
    'action_required',
    'course_outline_failure',
    'new_schedule_items',
    'schedule_changes',
    'setup_complete',
    'setup_started',
    'sync_failure',
    'sync_stopped',
    'sync_success',
    'term_transition'
  ],
  '所有通知都應只有一套標準 HTML 版型'
);
assert.equal(
  emailTemplateManifest.notifications.setup_complete.statusLabel,
  '設定完成'
);
assert.equal(
  emailTemplateManifest.notifications.setup_complete.headline,
  '你的行程已開始同步'
);
assert.equal(
  emailTemplateManifest.notifications.setup_complete.lede,
  '首批事件已同步，課綱資訊稍待幾分鐘便會載入！之後系統會依設定自動更新'
);
assert.equal(/<(script|iframe)\b/i.test(emailTemplateManifestText), false);
assert.equal(emailTemplateManifestText.includes('。'), false);
assert.equal(/border-left\s*:/i.test(emailTemplateManifestText), false);
assert.equal(
  emailTemplateManifestText.includes('這封信由你的行程同步控制臺自動寄出'),
  true
);
assert.equal(emailTemplateManifestText.includes('課表異動'), false);
assert.equal(
  configuratorAppSource.includes(".get(HIGH_LOAD_TEST_QUERY_PARAMETER) === '1'"),
  true,
  '測試版程式碼必須同時受到專用 URL 參數保護'
);
assert.equal(
  configuratorAppSource.includes("'寒暑假期間課程 / 活動'"),
  true,
  '有寒暑假資料時應顯示獨立的課程／活動分類'
);
assert.equal(
  configuratorAppSource.includes(
    "elements.notificationEmail.addEventListener('blur', scheduleNotificationEmailCommit);"
  ),
  true,
  'Email 輸入應在離開欄位且原生點擊完成後才提交狀態，避免閃爍或吞掉第一次點擊'
);
assert.match(
  configuratorAppSource,
  /if \(event\.target === elements\.notificationEmail\) \{[\s\S]*?tschool:configuration-change[\s\S]*?return;\n    \}/,
  'Email 的 input 事件應在即時驗證與狀態重設後停止'
);
assert.equal(
  configuratorAppSource.includes(
    "focusEmailBeforeDomain();\n      elements.notificationEmail.reportValidity();"
  ),
  false,
  '第三步 Email 錯誤應使用卡片內提示，不得開啟會重組 backdrop-filter 的原生驗證浮窗'
);
assert.equal(
  configuratorAppSource.includes(
    "input.setAttribute('aria-errormessage', 'notification-email-hint');"
  ),
  true,
  '卡片內 Email 錯誤提示應以 aria-errormessage 連結至欄位'
);
const updateOutputSource = configuratorAppSource.slice(
  configuratorAppSource.indexOf('function updateOutput()'),
  configuratorAppSource.indexOf('function generateOutput()')
);
const generateOutputSource = configuratorAppSource.slice(
  configuratorAppSource.indexOf('function generateOutput()'),
  configuratorAppSource.indexOf('function updateGeneratedCodeAvailability(')
);
assert.equal(
  updateOutputSource.includes('buildAppsScriptCode'),
  false,
  '一般設定更新不得即時重建 Code.gs'
);
assert.equal(
  generateOutputSource.includes('window.buildAppsScriptCode(getSettings())'),
  true,
  'Code.gs 應只由明確的產生動作建立'
);
assert.match(
  configuratorAppSource,
  /if \(completedStep === 4\) \{[\s\S]*?generateOutput\(\)[\s\S]*?scheduleGeneratedCodeTransition\(\)/,
  '第四步完成按鈕應先產生 Code.gs，再排程切換至第五步'
);
assert.equal(
  configuratorAppSource.includes('generatedCodeTransitionDelay: 48'),
  true,
  '產生 Code.gs 後應保留短暫繪製間隔再啟動卡片切換'
);
assert.match(
  configuratorAppSource,
  /if \(completionStates\.get\(stepNumber\) === nextState\) return;/,
  '完成按鈕狀態未改變時不得重寫相同 DOM'
);
assert.match(
  configuratorStylesSource,
  /\.journey-step\.is-preview[\s\S]*?> \.progressive-blur[\s\S]*?> \.progressive-blur-layer \{[\s\S]*?will-change: backdrop-filter;/,
  '可見預覽的 backdrop-filter 圖層應維持合成，避免表單重繪時單幀閃爍'
);
assert.match(
  configuratorStylesSource,
  /#step-5 \{[\s\S]*?--preview-fog-start-opacity: 0\.002;[\s\S]*?--preview-fog-end-opacity: 0\.07;[\s\S]*?--preview-fog-layer-opacity: 0\.006;[\s\S]*?--section-reveal-start-opacity: 1;[\s\S]*?\}/,
  '第五張深色卡片應能獨立降低預覽霧層濃度並提高進場起始不透明度'
);
assert.equal(
  configuratorStylesSource.includes(
    'rgba(var(--connector-fog-rgb), var(--preview-fog-layer-opacity))'
  ),
  true,
  '預覽模糊層底色濃度應由 token 控制，不得改寫 blur 半徑'
);
assert.match(
  configuratorStylesSource,
  /--fog-blur-1: 2px;[\s\S]*?--fog-blur-2: 6px;[\s\S]*?--fog-blur-3: 14px;[\s\S]*?--fog-blur-4: 28px;[\s\S]*?--fog-blur-5: 48px;/,
  '第五張卡片的透明度調整不得改變共用模糊半徑'
);
assert.equal(
  configuratorAppSource.includes('const ENABLE_SMOOTH_SCROLL = true;'),
  true,
  'Lenis 總開關應保持啟用，以供程式定位與鎖定邊界使用'
);
assert.equal(
  configuratorAppSource.includes('lerp: MOTION_CONFIG.scrollLerp'),
  true,
  '手動捲動應使用逐幀 lerp，避免時間制動畫漏幀後追趕'
);
assert.equal(
  configuratorAppSource.includes('smoothWheel: true'),
  true,
  '手動滾輪與觸控板應保留 Lenis 平滑效果'
);
assert.equal(
  configuratorAppSource.includes('syncTouch: touchInput'),
  true,
  '粗指標裝置應啟用逐幀觸控平滑'
);
assert.equal(
  configuratorAppSource.includes('autoRaf: true'),
  true,
  'Lenis 應使用內建 RAF，避免自訂喚醒迴圈在臨界幀提早停止'
);
assert.equal(
  configuratorAppSource.includes("lenis.on('virtual-scroll', requestLenisFrame)"),
  false,
  '不得恢復依 virtual-scroll 事件喚醒的自訂 Lenis RAF'
);
assert.equal(
  configuratorAppSource.includes('scrollTouchLerp: 0.075'),
  true,
  '觸控慣性應使用 Lenis 官方預設 lerp，避免過快收斂放大臨界幀'
);
assert.equal(
  configuratorAppSource.includes('scrollTouchInertiaExponent: 1.7'),
  true,
  '觸控慣性曲線應維持 Lenis 官方預設'
);
assert.equal(
  configuratorAppSource.includes('duration: MOTION_CONFIG.scrollDuration'),
  false,
  'Lenis 建構設定不得恢復時間制 duration'
);
assert.equal(
  configuratorAppSource.includes('resetOpposingScrollMomentum'),
  false,
  '手動觸控的極小反向輸入不得立即截斷 Lenis 尚未完成的動量'
);
assert.equal(
  configuratorAppSource.includes('documentEndGuardDistance'),
  false,
  '所有步驟解鎖後不得在 Lenis 文件極限前另設頁尾攔截'
);
assert.equal(
  configuratorAppSource.includes('duration: MOTION_CONFIG.boundarySettleDuration'),
  false,
  '卡片與文件邊界不得恢復時間制收斂'
);
assert.equal(
  configuratorAppSource.includes('initialBoundaryMinLerp: 0.12'),
  true,
  'Hero 至第一個鎖定邊界的長距離收斂應使用較柔和的最低 lerp'
);
assert.equal(
  configuratorAppSource.includes('initialBoundaryBlendDistanceRatio: 0.55'),
  true,
  '第一個鎖定邊界應依畫面與目標的距離平滑混合收斂速度'
);
assert.equal(
  configuratorAppSource.includes('function getBoundarySettleLerp(maximumScrollY)'),
  true,
  '邊界收斂應集中由距離感知函式決定'
);
assert.equal(
  (
    configuratorAppSource.match(
      /lerp: getBoundarySettleLerp\(maximumScrollY\)/g
    ) || []
  ).length,
  2,
  '虛擬捲動與幾何校正都應使用同一套邊界收斂規則'
);
assert.equal(
  configuratorAppSource.includes(
    'scheduleFocusedControlVisibility({ afterViewportSettles: true })'
  ),
  true,
  '鍵盤尺寸連續變化後應等待 viewport 穩定再校正聚焦欄位'
);
const codeMaskStyles = configuratorStylesSource.match(
  /\.control-panel-card \.code-window::after \{([\s\S]*?)\n\}/
)?.[1] || '';
assert.equal(codeMaskStyles.includes('linear-gradient('), true);
assert.equal(
  /backdrop-filter|mask-image/.test(codeMaskStyles),
  false,
  '程式碼預覽遮罩應只使用黑色透明度漸層，不得恢復模糊或 mask 濾鏡'
);

function makeCatalogPayload(weekNumbers, entriesByWeek) {
  const rows = weekNumbers.map((weekNumber, index) => ({
    isHeader: false,
    weekNum: String(weekNumber),
    cells: [{ value: entriesByWeek[index] || '' }]
  }));

  while (rows.length < 10) {
    rows.push({
      isHeader: false,
      weekNum: String(weekNumbers[0]),
      cells: [{ value: '' }]
    });
  }

  return {
    currentGrade: '一年級',
    weekDataList: weekNumbers.map(week => ({ week, date: '1/1' })),
    tableData: rows
  };
}

const vacationCatalogPayload = makeCatalogPayload(
  [1, 2, 5],
  ['學期間課程', '全校活動', '暑假課程\n──────────\n模擬考Day1']
);
assert.equal(
  scheduleData.normalizeText('從巴士底到車諾比：歷史\u200B'),
  '從巴士底到車諾比:歷史',
  '安裝器與 Code.gs 應使用相同的 Unicode 與零寬字元正規化'
);
assert.deepEqual(
  Array.from(scheduleData.getVacationWeekNumbers(vacationCatalogPayload)),
  [5],
  '缺少兩個完整週次後重新出現的課表資料應視為寒暑假區段'
);
const vacationCatalog = scheduleData.extractCatalog(vacationCatalogPayload);
assert.deepEqual(
  vacationCatalog.vacationItems.map(item => item.title).sort(),
  ['暑假課程', '模擬考Day1'].sort(),
  '寒暑假區段的課程與活動都應進入同一分類'
);
assert.equal(
  vacationCatalog.courses.find(item => item.title === '學期間課程').period,
  'term'
);
assert.equal(
  vacationCatalog.activities.find(item => item.title === '全校活動').period,
  'term'
);

const regularCatalog = scheduleData.extractCatalog(makeCatalogPayload(
  [1, 2, 3],
  ['學期間課程', '全校活動', '另一門課']
));
assert.equal(
  regularCatalog.vacationItems.length,
  0,
  '連續週次的課表應維持原本的課程／活動兩類'
);

const generatedCode = global.buildAppsScriptCode({
  appVersion: '2.0.0-mvp',
  sourceApiUrl: scheduleData.API_URL,
  gradeName: '高一',
  calendarName: 'T-SCHOOL 課表',
  notificationEmail: 'test@example.com',
  autoSyncHours: [5, 12, 18, 22],
  notifySyncHour: 5,
  includeActivities: true,
  excludedActivities: ['高一全校活動'],
  selectedCourses: ['公民'],
  descriptionPreset: 'standard',
  customDescription: '{course}',
  reminderMode: 'none',
  reminderMinutes: 10,
  initialTermKey: '',
  initialSourceFingerprint: '',
  initialKnownTitles: []
});

assert.doesNotThrow(() => new Function(generatedCode));
[
  'getSettingsUiData',
  'getSourceCatalogForUi',
  'getSyncProgressForUi',
  'previewSettingsImpactFromUi',
  'prepareFirstSyncCourseOutlinesFromUi',
  'saveSettingsFromUi',
  'saveSettingsAndSyncFromUi',
  'runSyncFromUi',
  'forceRepairFromUi',
  'createDedicatedCalendarForUi',
  'confirmPendingTitleFromUi',
  'rejectPendingTitleFromUi'
].forEach(handler => {
  assert.equal(
    generatedCode.includes(`function ${handler}(`),
    true,
    `控制臺呼叫的 Apps Script handler ${handler} 必須存在`
  );
});
['同步狀態', '日曆', '年級', '課程與活動', '通知'].forEach(heading => {
  assert.equal(
    generatedCode.includes(`<h2>${heading}</h2>`),
    true,
    `產生的 Code.gs 應嵌入控制臺區段「${heading}」`
  );
});
assert.equal(generatedCode.includes('COURSE_DICTIONARY'), false);
assert.equal(generatedCode.includes('function previewSettingsImpactFromUi('), true);
assert.equal(generatedCode.includes('function showSettingsSidebar('), true);
assert.equal(generatedCode.includes('function getNotificationTemplate_('), true);
assert.equal(generatedCode.includes('function buildEmailHtmlSafe_('), true);
assert.equal(generatedCode.includes('function getVacationWeekNumbersFromPayload_('), true);
assert.equal(
  generatedCode.includes("vacationItems: catalogAll.filter(item => item.period === 'vacation')"),
  true
);
assert.equal(generatedCode.includes('NOTIFICATION_QUEUE_STORE'), true);
assert.equal(generatedCode.includes('notification-email-templates.json'), true);
assert.equal(
  generatedCode.includes(
    'https://raw.githubusercontent.com/artemas-hsieh/t-school-schedule-sync/' +
    '0131d6b8cf2b0f524e85bb8720d2e680458afea2/notification-email-templates.json'
  ),
  true,
  'HTML Email 版型必須固定到已核准的 commit'
);
assert.equal(
  generatedCode.includes(
    'https://artemas-hsieh.github.io/t-school-schedule-sync/notification-email-templates.json'
  ),
  false,
  '產生的 Code.gs 不得再追蹤主分支上的即時版型'
);
assert.equal(
  generatedCode.includes('這封信由你的 T-SCHOOL 行程同步控制臺自動寄出'),
  false,
  'Code.gs 不應內嵌信件 HTML'
);
assert.equal(generatedCode.includes('function getSyncProgressForUi('), true);
assert.equal(generatedCode.includes('SYNC_PROGRESS_STORE'), true);
assert.equal(
  generatedCode.includes("'\\\\n\\\\n課綱狀態：' + outline.state"),
  false,
  '使用者看到的同步狀態不得直接顯示 idle、running 等程式內部代碼'
);
assert.equal(generatedCode.includes('COURSE_OUTLINE_SOURCE_SETS_BY_GRADE'), true);
assert.equal(
  generatedCode.includes(
    "const COURSE_OUTLINE_INDEX_SPREADSHEET_ID = '1zS6TdGMTPhz2Ja8bRs2AKAg0mRsBfXET9nmXi9wSBjY';"
  ),
  true
);
assert.equal(generatedCode.includes('function parseCourseOutlineSourceIndexValues_('), true);
assert.equal(generatedCode.includes('function refreshCourseOutlinesDaily('), true);
assert.equal(generatedCode.includes('function retryCourseOutlineRefresh('), true);
assert.equal(generatedCode.includes('function watchCourseOutlineRefresh('), true);
assert.equal(generatedCode.includes('function prepareFirstSyncCourseOutlinesFromUi('), true);
assert.equal(
  generatedCode.includes('const COURSE_OUTLINE_FIRST_SETUP_MAX_MS = 60 * 1000;'),
  true,
  '課綱預讀超過 60 秒時不得併入第一次 Calendar 寫入'
);
assert.equal(generatedCode.includes('function hasFreshCourseOutlineSnapshot_('), true);
assert.equal(generatedCode.includes('function updateCalendarOutlineFields_('), true);
assert.equal(generatedCode.includes('const COURSE_OUTLINE_LOOKAHEAD_DAYS = 30;'), true);
assert.equal(generatedCode.includes("const TERM_TRANSITION_NOTICE_HANDLER = 'retryTermTransitionNotice';"), true);
assert.equal(
  generatedCode.includes('.nearMinute(0)'),
  false,
  '每日觸發器不應固定擠在整點附近'
);
assert.equal(generatedCode.includes("ui.createMenu('高負載測試')"), true);
assert.equal(generatedCode.includes('function setupHighLoadTestEnvironment('), false);

const highLoadGeneratedCode = global.buildAppsScriptCode({
  appVersion: '2.0.0-mvp',
  sourceApiUrl: scheduleData.API_URL,
  gradeName: '高二',
  notificationEmail: 'test@example.com',
  autoSyncHours: [6],
  notifySyncHour: 6,
  includeActivities: true,
  selectedCourses: ['國語文'],
  highLoadTestingEnabled: true
});
assert.doesNotThrow(() => new Function(highLoadGeneratedCode));
assert.equal(highLoadGeneratedCode.includes('const HIGH_LOAD_TESTING_ENABLED = true;'), true);
assert.equal(highLoadGeneratedCode.includes('function runHighLoadFirstSyncTest('), true);
assert.equal(
  highLoadGeneratedCode.includes(
    ".addItem('模擬控制臺首次同步', 'runHighLoadFirstSyncTest')"
  ),
  true,
  '高負載選單應以單一首次同步情境取代分段測試'
);
assert.equal(
  highLoadGeneratedCode.includes(".addItem('3a. 測試 10 筆'"),
  false,
  '高負載選單不應再要求使用者逐段執行 10 到 422 筆'
);
assert.equal(
  highLoadGeneratedCode.includes('syncResponse = saveSettingsAndSyncFromUi({'),
  true,
  '高負載情境應沿用控制臺的儲存並首次同步入口'
);
assert.equal(
  highLoadGeneratedCode.includes(
    'return parseSchedulePayload_(payload, gradeName, scheduleBusinessNow_());'
  ),
  true,
  '首次同步及背景續跑應持續使用模擬的開學日期'
);
assert.equal(
  highLoadGeneratedCode.includes(
    "const HIGH_LOAD_TEST_OUTLINE_STORE = 'TSCHOOL_HIGH_LOAD_TEST_OUTLINE';"
  ),
  true
);
assert.equal(highLoadGeneratedCode.includes('function setupHighLoadTestEnvironment('), true);
assert.equal(highLoadGeneratedCode.includes('function runHighLoadReadOnlyTest('), true);
assert.equal(highLoadGeneratedCode.includes('function runHighLoadCourseOutlineReadTest('), true);
assert.equal(highLoadGeneratedCode.includes('function runHighLoadCalendarTest422('), true);
assert.equal(highLoadGeneratedCode.includes('function cleanupHighLoadTestEnvironment('), true);
assert.equal(
  highLoadGeneratedCode.includes(
    'writeChunkedJson_(HIGH_LOAD_TEST_OUTLINE_STORE, snapshot);'
  ),
  true,
  '30 天課綱讀取結果應保存於高負載測試專用儲存區'
);
assert.equal(
  highLoadGeneratedCode.includes(
    'return attachHighLoadTestCourseOutlines_(events, source);'
  ),
  true,
  'Calendar 壓力測試應套用已保存的課綱地點與內容'
);
assert.equal(
  highLoadGeneratedCode.includes(
    'clearChunkedStore_(HIGH_LOAD_TEST_OUTLINE_STORE);'
  ),
  true,
  '清除高負載環境時應一併移除測試課綱資料'
);

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function formatDate(dateValue, pattern) {
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(dateValue)).map(part => [part.type, part.value])
  );

  if (pattern === 'yyyy') {
    return parts.year;
  }

  if (pattern === 'yyyy/MM/dd HH:mm') {
    return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
  }

  if (pattern === 'H') {
    return String(Number(parts.hour));
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

const context = vm.createContext({
  console,
  Intl,
  Utilities: {
    formatDate(dateValue, timezone, pattern) {
      assert.equal(timezone, 'Asia/Taipei');
      return formatDate(dateValue, pattern);
    }
  }
});

vm.runInContext(generatedCode, context);

assert.equal(
  context.describeCourseOutlineStatusForUser_({
    enabled: true,
    state: 'idle',
    lastSuccessAt: ''
  }),
  '尚未完成第一次課綱更新'
);
assert.equal(
  context.describeCourseOutlineStatusForUser_({
    enabled: true,
    state: 'queued',
    lastSuccessAt: ''
  }),
  '已排入背景工作，正在等待 Google 開始更新'
);
assert.equal(
  context.describeCourseOutlineStatusForUser_({
    enabled: true,
    state: 'retry_pending',
    lastSuccessAt: ''
  }),
  '這次更新暫時沒有完成，系統稍後會自動再試一次'
);

assert.equal(
  context.sanitizeCalendarName_('高二行程｜T-SCHOOL Schedule Sync', '高二'),
  '高二行程｜T-SCHOOL Schedule Sync',
  '行事曆名稱不得使用 NFKC 將全形分隔線轉成半形'
);
assert.equal(
  context.sanitizeCalendarName_('高二行程|T-SCHOOL Schedule Sync', '高二'),
  '高二行程｜T-SCHOOL Schedule Sync',
  '舊版半形預設名稱應轉回標準全形分隔線'
);
assert.equal(
  context.sanitizeCalendarName_('  我的｜專用　行事曆  ', '高二'),
  '我的｜專用 行事曆',
  '自訂名稱應清除多餘空白但保留使用者選擇的全形符號'
);

assert.deepEqual(
  Object.keys(context.getVacationWeekNumbersFromPayload_(vacationCatalogPayload)).map(Number),
  [5],
  'Code.gs 應辨識缺少兩個完整週次後的寒暑假資料'
);
const runtimeVacationCatalog = context.extractCatalogFromPayload_(vacationCatalogPayload);
assert.deepEqual(
  Array.from(runtimeVacationCatalog, item => `${item.type}:${item.period}:${item.title}`).sort(),
  [
    'activity:term:全校活動',
    'activity:vacation:模擬考Day1',
    'course:term:學期間課程',
    'course:vacation:暑假課程'
  ].sort(),
  '控制臺的 Code.gs 課程目錄應保留學期間與寒暑假分類'
);

const parsedOutlineIndex = context.parseCourseOutlineSourceIndexValues_([
  ['啟用', '來源組鍵', '課綱名稱', '年級', '適用起日', '適用迄日', '備註', '課綱試算表連結'],
  [
    'TRUE',
    '114-2-high2',
    '114-2 高二—必修',
    '高二',
    '2026-01-01',
    '2026-08-31',
    '現行來源',
    'https://docs.google.com/spreadsheets/d/index-required-sheet/edit?usp=sharing'
  ],
  [
    true,
    '114-2-high2',
    '114-2 高二—學科選修',
    '高二',
    '2026-01-01',
    '2026-08-31',
    '',
    'https://docs.google.com/spreadsheets/d/index-elective-sheet/edit'
  ],
  [
    'FALSE',
    '115-1-high2',
    '停用來源',
    '高二',
    '2026-09-01',
    '2027-01-31',
    '',
    'https://docs.google.com/spreadsheets/d/index-disabled-sheet/edit'
  ]
]);
assert.deepEqual(
  Array.from(context.getCourseOutlineIndexHeaders_()),
  ['啟用', '來源組鍵', '課綱名稱', '年級', '適用起日', '適用迄日', '課綱試算表連結'],
  'Code.gs 要求的課綱索引欄名應精確對應中央表'
);
assert.equal(parsedOutlineIndex.setsByGrade['高二'].length, 1);
assert.deepEqual(
  Array.from(parsedOutlineIndex.setsByGrade['高二'][0].outlineNames),
  ['114-2 高二—必修', '114-2 高二—學科選修']
);
assert.deepEqual(
  Array.from(parsedOutlineIndex.setsByGrade['高二'][0].spreadsheetIds),
  ['index-required-sheet', 'index-elective-sheet']
);
assert.equal(parsedOutlineIndex.setsByGrade['高一'].length, 0);
assert.throws(
  () => context.parseCourseOutlineSourceIndexValues_([
    ['啟用', '來源組鍵', '課綱名稱', '年級', '適用起日', '適用迄日', '課綱試算表連結'],
    [
      'TRUE',
      '114-2-high2',
      '必修',
      '高二',
      '2026-01-01',
      '2026-08-31',
      'https://docs.google.com/spreadsheets/d/duplicate-sheet/edit'
    ],
    [
      'TRUE',
      '114-2-high2',
      '選修',
      '高二',
      '2026-02-01',
      '2026-08-31',
      'https://docs.google.com/spreadsheets/d/second-sheet/edit'
    ]
  ]),
  /相同年級與適用日期/
);

function recordGeneratedMenus(generatedAppsScriptCode) {
  const menuNames = [];
  function createMenu(name) {
    menuNames.push(name);
    const menu = {
      addItem() {
        return menu;
      },
      addSeparator() {
        return menu;
      },
      addSubMenu() {
        return menu;
      },
      addToUi() {
        return menu;
      }
    };
    return menu;
  }
  const menuContext = vm.createContext({
    console,
    Intl,
    SpreadsheetApp: {
      getUi() {
        return { createMenu };
      }
    }
  });
  vm.runInContext(generatedAppsScriptCode, menuContext);
  menuContext.onOpen();
  return menuNames;
}

assert.deepEqual(
  recordGeneratedMenus(generatedCode),
  ['行程同步'],
  '一般 Code.gs 不應建立高負載測試選單'
);
assert.deepEqual(
  recordGeneratedMenus(highLoadGeneratedCode),
  ['行程同步', '高負載測試'],
  '測試版 Code.gs 應在既有行程同步選單加入高負載測試子選單'
);

const outlineWindowEvents = [
  { dateKey: '2026-02-22' },
  { dateKey: '2026-02-23' },
  { dateKey: '2026-03-25' },
  { dateKey: '2026-03-26' }
];
assert.deepEqual(
  Array.from(
    context.filterCourseOutlineLookaheadEvents_(
      outlineWindowEvents,
      new Date('2026-02-23T06:00:00+08:00'),
      30
    ),
    event => event.dateKey
  ),
  ['2026-02-23', '2026-03-25'],
  '課綱視窗應包含今天至第 30 天，排除過去與更遠課程'
);

if (fs.existsSync('/tmp/tschool-requirements-grade2.json')) {
  const highLoadContext = vm.createContext({
    console,
    Intl,
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty() {
            return null;
          }
        };
      }
    },
    Utilities: {
      formatDate(dateValue, timezone, pattern) {
        assert.equal(timezone, 'Asia/Taipei');
        return formatDate(dateValue, pattern);
      }
    }
  });
  vm.runInContext(highLoadGeneratedCode, highLoadContext);
  const highLoadPayload = JSON.parse(
    fs.readFileSync('/tmp/tschool-requirements-grade2.json', 'utf8')
  );
  const highLoadSource = highLoadContext.parseSchedulePayload_(
    highLoadPayload,
    '高二',
    new Date('2026-02-23T06:00:00+08:00')
  );
  const highLoadReport = highLoadContext.buildHighLoadReadOnlyReport_(
    highLoadSource,
    0
  );
  assert.equal(
    highLoadReport.ok,
    true,
    `高二固定資料應符合高負載基準：${JSON.stringify(highLoadReport)}`
  );
  assert.equal(highLoadReport.actual.totalFuture, 422);
  assert.equal(highLoadReport.actual.outlineWindow, 79);
  assert.equal(highLoadReport.actual.outlineCourseNames, 20);

  const highLoadDesired = highLoadContext.getHighLoadTestDesiredEvents_(highLoadSource);
  const estimatedHighLoadState = {};
  highLoadDesired.forEach((event, index) => {
    const key = highLoadContext.makeOccurrenceKey_(event);
    estimatedHighLoadState[key] = `test-event-${index}`;
  });
  const serializedHighLoadSource = JSON.stringify({
    catalog: highLoadSource.catalog,
    events: highLoadSource.events.map(highLoadContext.serializeHighLoadTestEvent_)
  });
  const estimatedStoredCharacters =
    serializedHighLoadSource.length + JSON.stringify(estimatedHighLoadState).length;
  assert.equal(
    estimatedStoredCharacters < 300000,
    true,
    `高負載來源與 422 筆狀態不應逼近 Script Properties 總量上限：` +
      `${estimatedStoredCharacters}（來源 ${serializedHighLoadSource.length}、狀態 ` +
      `${JSON.stringify(estimatedHighLoadState).length}）`
  );
}

const noActivityCode = global.buildAppsScriptCode({
  appVersion: '2.0.0-mvp',
  sourceApiUrl: scheduleData.API_URL,
  gradeName: '高二',
  notificationEmail: 'test@example.com',
  autoSyncHours: [6],
  notifySyncHour: 6,
  includeActivities: false,
  excludedActivities: [],
  selectedCourses: ['公民'],
  initialKnownTitles: ['公民', '高二全校活動']
});
const noActivityContext = vm.createContext({ console, Intl });
vm.runInContext(noActivityCode, noActivityContext);
const noActivitySettings = vm.runInContext('DEFAULT_SETTINGS', noActivityContext);
assert.equal(
  noActivitySettings.calendarName,
  '高二行程｜T-SCHOOL Schedule Sync',
  '新程式碼應使用隨年級變動的專用日曆名稱'
);
assert.equal(
  noActivityContext.shouldIncludeEvent_({ type: 'activity', originalTitle: '高二全校活動' }, noActivitySettings),
  false,
  '取消所有活動後不應同步已知活動'
);
assert.equal(
  noActivityContext.shouldIncludeEvent_({ type: 'activity', originalTitle: '新發現活動' }, noActivitySettings),
  false,
  '取消所有活動後不應自動同步新活動'
);
noActivitySettings.pendingTitles = ['新發現活動'];
assert.equal(
  noActivityContext.shouldIncludeEvent_({ type: 'activity', originalTitle: '新發現活動' }, noActivitySettings),
  false,
  '取消所有活動後，待確認清單也不得繞過活動總開關'
);

assert.equal(context.getConfiguredCourseOutlineSourceSets_('高一').length, 0);
assert.equal(context.getConfiguredCourseOutlineSourceSets_('高三').length, 0);
assert.equal(context.getConfiguredCourseOutlineSourceSets_('高二').length, 1);
assert.equal(context.getConfiguredCourseOutlineSourceSets_('高二')[0].key, '114-2-high2');
assert.equal(context.getConfiguredCourseOutlineSourceSets_('高二')[0].spreadsheetIds.length, 4);
assert.equal(
  context.getRelevantCourseOutlineSourceSets_('高二', [{
    type: 'course',
    isAllDay: false,
    dateKey: '2026-07-27'
  }]).length,
  1,
  '114-2 高二日期應啟用目前四份課綱'
);
assert.equal(
  context.getRelevantCourseOutlineSourceSets_('高二', [{
    type: 'course',
    isAllDay: false,
    dateKey: '2026-09-01'
  }]).length,
  0,
  '超出 114-2 適用日期後不得繼續讀取舊課綱'
);

const outlineValues = [
  ['114-2 測試課綱'],
  ['課程說明'],
  ['節次', '課程內容', '日期', '非同步', '實體', '線上', '單元主題', '實體課程教室'],
  ['56', '混合式內容', '7/27', '2', '2', '0', '混合式主題', '協作坊'],
  ['4', '純非同步內容', '7/29', '2', '0', '0', '純非同步主題', '線上'],
  ['3-4', '', '2026/7/31', '0', '2', '0', '跨節主題', '基地']
];
const outlineDesiredEvents = [
  { originalTitle: '測試課程', dateKey: '2026-07-27', periodStart: 5, periodEnd: 6 },
  { originalTitle: '測試課程', dateKey: '2026-07-29', periodStart: 4, periodEnd: 4 },
  { originalTitle: '測試課程', dateKey: '2026-07-31', periodStart: 3, periodEnd: 4 }
];
const parsedOutline = context.parseCourseOutlineSheetValues_(
  outlineValues,
  '測試課程',
  outlineDesiredEvents,
  { sourceSetKey: '114-2-high2', spreadsheetId: 'sheet-id', spreadsheetName: '課綱' }
);
assert.equal(parsedOutline.headerRow, 3);
assert.equal(parsedOutline.records.length, 2, '混合式列應保留，純非同步列應排除');
assert.equal(parsedOutline.records[0].dateKey, '2026-07-27');
assert.equal(parsedOutline.records[0].periodStart, 5);
assert.equal(parsedOutline.records[0].periodEnd, 6);
assert.equal(parsedOutline.records[1].topic, '跨節主題');

const mergedTopicValues = [
  ['日期', '節次', '實體課程教室', '單元主題', '課程內容'],
  ['7/27', '1', '協作坊', '合併單元主題', '第一節內容'],
  ['7/28', '1', '協作坊', '', '第二節內容']
];
const expandedMergedTopicValues = context.expandVerticalMergedCourseOutlineValues_(
  mergedTopicValues,
  [{
    getRow: () => 2,
    getColumn: () => 4,
    getNumRows: () => 2,
    getNumColumns: () => 1,
    getDisplayValue: () => '合併單元主題'
  }]
);
assert.equal(expandedMergedTopicValues[2][3], '合併單元主題');
const parsedMergedTopicOutline = context.parseCourseOutlineSheetValues_(
  expandedMergedTopicValues,
  '測試課程',
  [
    { originalTitle: '測試課程', dateKey: '2026-07-27', periodStart: 1, periodEnd: 1 },
    { originalTitle: '測試課程', dateKey: '2026-07-28', periodStart: 1, periodEnd: 1 }
  ],
  { sourceSetKey: '114-2-high2', spreadsheetId: 'sheet-id', spreadsheetName: '課綱' }
);
assert.equal(parsedMergedTopicOutline.records.length, 2);
assert.equal(
  parsedMergedTopicOutline.records[1].topic,
  '合併單元主題',
  '垂直合併的單元主題應向下套用到合併範圍內每一筆課程'
);

assert.throws(
  () => context.parseCourseOutlineSheetValues_(
    [['日期', '節次', '課程內容'], ['7/27', '1', '內容']],
    '缺欄位課程',
    [],
    { sourceSetKey: 'test', spreadsheetId: 'test', spreadsheetName: 'test' }
  ),
  /找不到必要欄位/
);

const outlineSettings = {
  descriptionPreset: 'standard',
  customDescription: '',
  reminderMode: 'none',
  reminderMinutes: 10
};
const outlineBaseItem = {
  originalTitle: '測試課程',
  type: 'course',
  isAllDay: false,
  dateKey: '2026-07-27',
  weekday: '一',
  weekNum: 2,
  periodStart: 5,
  periodEnd: 6,
  startTime: '13:10',
  endTime: '15:00',
  start: new Date('2026-07-27T13:10:00+08:00'),
  end: new Date('2026-07-27T15:00:00+08:00'),
  location: '吉林基地',
  sourceUpdatedLabel: '0724'
};
const oldOutlineItem = Object.assign({}, outlineBaseItem, {
  courseOutline: { classroom: '協作坊', topic: '舊主題', content: '舊內容' },
  outlineHash: 'old-hash'
});
const newOutlineItem = Object.assign({}, outlineBaseItem, {
  courseOutline: { classroom: '協作坊', topic: '新主題', content: '新內容' },
  outlineHash: 'new-hash'
});
const outlineStateKey = context.makeOccurrenceKey_(outlineBaseItem);
assert.equal(context.makeOccurrenceKey_(oldOutlineItem), context.makeOccurrenceKey_(newOutlineItem));
assert.equal(context.normalizeTitle_(' 國 語 文　'), '國語文');
assert.equal(context.normalizeTitle_('數學Ａ'), context.normalizeTitle_('數學A'));
assert.equal(
  context.makeBaseEventSignature_(oldOutlineItem, outlineSettings),
  context.makeBaseEventSignature_(newOutlineItem, outlineSettings)
);
assert.notEqual(
  context.makeEventSignature_(oldOutlineItem, outlineSettings),
  context.makeEventSignature_(newOutlineItem, outlineSettings)
);
assert.equal(
  context.buildEventTitle_(newOutlineItem),
  '測試課程 [吉林基地-協作坊]'
);
assert.equal(
  context.buildEventTitle_(
    Object.assign({}, newOutlineItem, { originalTitle: '國語文進階(二)' })
  ),
  '國語文進階(二) [吉林基地-協作坊]',
  '首次同步套用課綱後，標題應合併課表地點與實體課程教室'
);
assert.equal(
  context.buildEventLocation_(newOutlineItem),
  '吉林基地-協作坊'
);
assert.equal(
  context.buildEventLocation_(
    Object.assign({}, newOutlineItem, {
      courseOutline: Object.assign({}, newOutlineItem.courseOutline, { classroom: '吉林基地' })
    })
  ),
  '吉林基地',
  '課表地點與實體課程教室相同時不得重複'
);
assert.equal(
  context.buildManagedDescription_(newOutlineItem, outlineStateKey, outlineSettings),
  '第 2 週 / 週一 / 第 5–6 節<br><br><b># 單元主題</b><br>新主題<br><br><b># 課程內容</b><br>新內容<br><br><br>[T-SCHOOL Schedule Sync]<br>＊部分資訊來自課綱，請以教師最新說明為主'
);
assert.equal(
  context.buildManagedDescription_(
    Object.assign({}, outlineBaseItem, {
      courseOutline: { classroom: '協作坊', topic: '<第一冊>', content: '內容 & 補充' }
    }),
    outlineStateKey,
    outlineSettings
  ).includes('&lt;第一冊&gt;<br><br><b># 課程內容</b><br>內容 &amp; 補充'),
  true,
  '課綱文字必須先 HTML escape'
);
assert.doesNotMatch(
  context.buildManagedDescription_(newOutlineItem, outlineStateKey, outlineSettings),
  /T-SCHOOL-SCHEDULE-SYNC|同步識別碼/,
  '使用者可見說明不得包含技術管理標記或識別碼'
);
assert.equal(
  context.buildManagedDescription_(
    newOutlineItem,
    outlineStateKey,
    Object.assign({}, outlineSettings, {
      descriptionPreset: 'custom',
      customDescription: '**{course}**\n{displayLocation}\n{topic}'
    })
  ),
  '<b>測試課程</b><br>吉林基地-協作坊<br>新主題<br><br><br>[T-SCHOOL Schedule Sync]<br>＊部分資訊來自課綱，請以教師最新說明為主',
  '進階自訂應沿用標準格式的粗體與段落內換行規則'
);
const legacyOutlineState = {
  originalTitle: oldOutlineItem.originalTitle,
  type: oldOutlineItem.type,
  isAllDay: oldOutlineItem.isAllDay,
  dateKey: oldOutlineItem.dateKey,
  periodStart: oldOutlineItem.periodStart,
  periodEnd: oldOutlineItem.periodEnd,
  start: oldOutlineItem.start.toISOString(),
  end: oldOutlineItem.end.toISOString(),
  location: oldOutlineItem.location,
  syncSignature: context.makeBaseEventSignaturePayload_(oldOutlineItem, outlineSettings) +
    '|outline:' + oldOutlineItem.outlineHash,
  baseSyncSignature: context.makeBaseEventSignaturePayload_(oldOutlineItem, outlineSettings),
  outlineHash: oldOutlineItem.outlineHash
};
assert.equal(
  context.storedEventSignatureMatches_(legacyOutlineState, oldOutlineItem, outlineSettings),
  false,
  '舊版事件必須執行一次中繼資料遷移，將可見識別碼改為隱藏標籤'
);
assert.equal(
  context.storedEventContentSignatureMatches_(legacyOutlineState, oldOutlineItem, outlineSettings),
  true,
  '中繼資料遷移不得把內容未變的舊事件誤判為一般更新'
);
const legacyMetadataPlan = context.prepareSyncOperations_(
  {
    exact: [{
      oldItem: Object.assign({}, legacyOutlineState, {
        stateKey: outlineStateKey,
        calendarEventId: 'legacy-event-id'
      }),
      newItem: oldOutlineItem,
      newKey: outlineStateKey
    }],
    moved: [],
    additions: [],
    deletions: []
  },
  {},
  outlineSettings,
  { forceCalendarCheck: false, forceProcessedKeys: {} }
);
assert.equal(legacyMetadataPlan.operations.length, 1);
assert.equal(legacyMetadataPlan.operations[0].type, 'metadata');
const spacingVariant = Object.assign({}, outlineBaseItem, { originalTitle: ' 測試 課程　' });
assert.equal(
  context.dedupeAndValidateDesiredEvents_([outlineBaseItem, spacingVariant]).length,
  1,
  '只差空格的相同事件應合併而不是重複建立'
);
assert.throws(
  () => context.dedupeAndValidateDesiredEvents_([
    outlineBaseItem,
    Object.assign({}, spacingVariant, { end: new Date('2026-07-27T16:00:00+08:00') })
  ]),
  /相同事件/,
  '相同身分鍵卻有衝突內容時應停止而非靜默合併'
);

let outlineFieldUpdates = 0;
const calendarForOutlineUpdate = {
  getEventById() {
    const tags = {
      tschool_managed: '1',
      tschool_sync_id: context.hashText_(outlineStateKey)
    };
    let title = context.buildEventTitle_(oldOutlineItem);
    let location = context.buildEventLocation_(oldOutlineItem);
    return {
      getId() {
        return 'event-id';
      },
      getTitle() {
        return title;
      },
      setTitle(value) {
        title = value;
        outlineFieldUpdates += 1;
      },
      getLocation() {
        return location;
      },
      setLocation(value) {
        location = value;
        outlineFieldUpdates += 1;
      },
      getTag(key) {
        return tags[key] || '';
      },
      setTag(key, value) {
        tags[key] = String(value);
      },
      getDescription() {
        return context.buildManagedDescription_(oldOutlineItem, outlineStateKey, outlineSettings);
      },
      setDescription() {
        outlineFieldUpdates += 1;
      }
    };
  }
};
const outlineOnlyResult = context.applySyncPlan_(
  calendarForOutlineUpdate,
  {},
  {
    oldPast: {},
    exact: [{
      oldItem: {
        stateKey: outlineStateKey,
        calendarEventId: 'event-id',
        metadataVersion: 2,
        syncSignature: context.makeEventSignature_(oldOutlineItem, outlineSettings),
        baseSyncSignature: context.makeBaseEventSignature_(oldOutlineItem, outlineSettings),
        outlineHash: oldOutlineItem.outlineHash
      },
      newItem: newOutlineItem,
      newKey: outlineStateKey
    }],
    moved: [],
    additions: [],
    deletions: []
  },
  outlineSettings,
  { forceCalendarCheck: false, trackProgress: false }
);
assert.equal(outlineFieldUpdates, 1);
assert.equal(outlineOnlyResult.updated, 0);
assert.equal(outlineOnlyResult.outlineUpdated, 1);
assert.equal(outlineOnlyResult.changes.length, 0, '純課綱更新不應列入行程調整通知');

const scriptPropertiesData = {};
const scriptProperties = {
  getProperty(key) {
    return Object.prototype.hasOwnProperty.call(scriptPropertiesData, key)
      ? scriptPropertiesData[key]
      : null;
  },
  setProperty(key, value) {
    scriptPropertiesData[key] = String(value);
  },
  setProperties(values) {
    Object.entries(values).forEach(([key, value]) => {
      scriptPropertiesData[key] = String(value);
    });
  },
  deleteProperty(key) {
    delete scriptPropertiesData[key];
  },
  getKeys() {
    return Object.keys(scriptPropertiesData);
  },
  getProperties() {
    return Object.assign({}, scriptPropertiesData);
  }
};
let triggerCounter = 0;
let projectTriggers = [];
let sentOutlineFailureEmails = 0;
let mailFailuresRemaining = 0;
const sentEmailSubjects = [];
const sentEmailMessages = [];
let cachedEmailTemplateManifest = '';
let emailTemplateFetchShouldFail = false;
context.PropertiesService = {
  getScriptProperties() {
    return scriptProperties;
  }
};
const initialGeneratedSettings = context.loadSettings_();
assert.deepEqual(Array.from(initialGeneratedSettings.autoSyncHours), [5, 12, 18, 22]);
assert.equal(
  initialGeneratedSettings.notifySyncHour,
  22,
  '每日成功摘要應安排在最後一個通知時間，才能讓當日行程調整優先'
);
assert.equal(initialGeneratedSettings.notificationPreset, 'standard');
assert.equal(initialGeneratedSettings.customNotification, '');
const utf8ChunkPayload = { text: '課綱😀'.repeat(4000) };
context.writeChunkedJson_('UTF8_CHUNK_TEST', utf8ChunkPayload);
const utf8ChunkCount = Number(scriptPropertiesData.UTF8_CHUNK_TEST_COUNT);
assert.equal(utf8ChunkCount > 1, true, '中文字資料應依 UTF-8 位元組安全分塊');
for (let index = 0; index < utf8ChunkCount; index += 1) {
  assert.equal(
    Buffer.byteLength(scriptPropertiesData[`UTF8_CHUNK_TEST_${index}`], 'utf8') <= 7500,
    true,
    '單一 Script Property 不得超過安全位元組上限'
  );
}
assert.deepEqual(
  JSON.parse(JSON.stringify(context.readChunkedJson_('UTF8_CHUNK_TEST', null))),
  utf8ChunkPayload,
  'UTF-8 分塊重新組合後內容必須完全相同'
);
context.clearChunkedStore_('UTF8_CHUNK_TEST');
context.LockService = {
  getScriptLock() {
    return {
      tryLock() {
        return true;
      },
      releaseLock() {}
    };
  }
};
context.ScriptApp = {
  getProjectTriggers() {
    return projectTriggers.slice();
  },
  deleteTrigger(trigger) {
    projectTriggers = projectTriggers.filter(item => item !== trigger);
  },
  newTrigger(handler) {
    const builder = {
      timeBased() {
        return builder;
      },
      atHour() {
        return builder;
      },
      nearMinute() {
        return builder;
      },
      everyDays() {
        return builder;
      },
      inTimezone() {
        return builder;
      },
      after() {
        return builder;
      },
      create() {
        const id = `trigger-${++triggerCounter}`;
        const trigger = {
          getUniqueId() {
            return id;
          },
          getHandlerFunction() {
            return handler;
          }
        };
        projectTriggers.push(trigger);
        return trigger;
      }
    };
    return builder;
  }
};
context.CacheService = {
  getScriptCache() {
    return {
      get(key) {
        assert.equal(key, 'TSCHOOL_EMAIL_TEMPLATE_MANIFEST_0131D6B8');
        return cachedEmailTemplateManifest;
      },
      put(key, value, seconds) {
        assert.equal(key, 'TSCHOOL_EMAIL_TEMPLATE_MANIFEST_0131D6B8');
        assert.equal(seconds, 60 * 60);
        cachedEmailTemplateManifest = value;
      }
    };
  }
};
context.UrlFetchApp = {
  fetch(url, options) {
    assert.equal(
      url,
      'https://raw.githubusercontent.com/artemas-hsieh/t-school-schedule-sync/' +
      '0131d6b8cf2b0f524e85bb8720d2e680458afea2/notification-email-templates.json'
    );
    assert.equal(options.followRedirects, true);
    assert.equal(options.muteHttpExceptions, true);
    return {
      getResponseCode() {
        return emailTemplateFetchShouldFail ? 503 : 200;
      },
      getContentText(encoding) {
        assert.equal(encoding, 'UTF-8');
        return emailTemplateManifestText;
      }
    };
  }
};
context.MailApp = {
  sendEmail(messageOrRecipient, legacySubject, legacyBody, legacyOptions) {
    if (mailFailuresRemaining > 0) {
      mailFailuresRemaining -= 1;
      throw new Error('模擬寄信失敗');
    }
    const message = typeof messageOrRecipient === 'object'
      ? messageOrRecipient
      : Object.assign({
        to: messageOrRecipient,
        subject: legacySubject,
        body: legacyBody
      }, legacyOptions || {});
    sentOutlineFailureEmails += 1;
    sentEmailSubjects.push(message.subject);
    sentEmailMessages.push(message);
  }
};
context.Session = {
  getActiveUser() {
    return { getEmail: () => 'test@example.com' };
  },
  getEffectiveUser() {
    return { getEmail: () => 'test@example.com' };
  }
};
context.Logger = { log() {} };

assert.doesNotThrow(() =>
  context.assertEmailTemplateManifest_(JSON.parse(emailTemplateManifestText))
);
const renderedFailureEmail = context.buildEmailHtmlSafe_(
  'sync_failure',
  '[T-SCHOOL] 行程同步失敗',
  {
    sentAt: '2026/07/26 12:00',
    controlUrl: 'https://docs.google.com/spreadsheets/d/test/edit',
    calendarUrl: 'https://calendar.google.com/calendar/u/0/r',
    message: '<script>alert("x")</script> 權限不足'
  }
);
assert.match(renderedFailureEmail, /<!doctype html>/);
assert.match(renderedFailureEmail, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; 權限不足/);
assert.equal(renderedFailureEmail.includes('<script>alert("x")</script>'), false);
assert.match(renderedFailureEmail, /這次同步沒有完成/);
assert.match(
  renderedFailureEmail,
  /href="https:\/\/docs\.google\.com\/spreadsheets\/d\/test\/edit"/,
  '核准的 Google Sheets 連結應保留'
);
const sanitizedEmailLinks = context.sanitizeEmailHtmlLinks_(
  '<p>' +
  '<a href="https://calendar.google.com/calendar/u/0/r">日曆</a>' +
  '<a href="https://docs.google.com/spreadsheets/d/test/edit?usp=sharing">控制臺</a>' +
  '<a href="https://calendar.google.com.evil.example/phish"><strong>假日曆</strong></a>' +
  '<a href="https://docs.google.com/url?q=https://evil.example">假控制臺</a>' +
  '<a href="javascript:alert(1)">危險連結</a>' +
  '</p>'
);
assert.match(sanitizedEmailLinks, /href="https:\/\/calendar\.google\.com\/calendar\/u\/0\/r"/);
assert.match(
  sanitizedEmailLinks,
  /href="https:\/\/docs\.google\.com\/spreadsheets\/d\/test\/edit\?usp=sharing"/
);
assert.equal(sanitizedEmailLinks.includes('calendar.google.com.evil.example'), false);
assert.equal(sanitizedEmailLinks.includes('docs.google.com/url'), false);
assert.equal(sanitizedEmailLinks.includes('javascript:'), false);
assert.match(sanitizedEmailLinks, /假日曆/);
assert.match(sanitizedEmailLinks, /假控制臺/);
assert.match(sanitizedEmailLinks, /危險連結/);
assert.equal(/<strong>假日曆<\/strong>/.test(sanitizedEmailLinks), false);

const sampleEmailData = {
  sentAt: '2026/07/26 12:00',
  controlUrl: 'https://docs.google.com/spreadsheets/d/test/edit',
  calendarUrl: 'https://calendar.google.com/calendar/u/0/r',
  summary: '新增 1、更新 2、移除 0、未變更 8',
  message: '測試訊息',
  created: 1,
  updated: 2,
  outlineUpdated: 3,
  deleted: 0,
  unchanged: 8,
  changeCount: 1,
  omittedNote: '',
  processed: 40,
  total: 422,
  remaining: 382,
  progressPercent: 9,
  dateRange: '2026-09-01–2027-01-31',
  itemCount: 1,
  items: [{ label: '測試活動' }],
  changes: [{
    type: '時間變更',
    course: '測試課程',
    oldStandard: '2026/07/27 第 5 節 舊教室',
    newStandard: '2026/07/28 第 6 節 新教室',
    displayText: '時間變更｜測試課程'
  }]
};
Object.keys(emailTemplateManifest.notifications).forEach(templateKind => {
  const html = context.buildEmailHtmlSafe_(
    templateKind,
    '[T-SCHOOL] 測試通知',
    sampleEmailData
  );
  assert.match(html, /<!doctype html>/, `${templateKind} 應可渲染完整 HTML`);
  assert.equal(
    /\{\{\{?[A-Za-z]/.test(html),
    false,
    `${templateKind} 不應留下未解析變數`
  );
});

const emailsBeforeFirstBatchNotice = sentEmailMessages.length;
assert.equal(
  context.sendFirstBatchStartedNotificationSafe_(
    { notificationEmail: 'test@example.com' },
    {
      processedOperations: 40,
      desiredCount: 422,
      created: 40
    }
  ),
  true
);
assert.equal(sentEmailMessages.length, emailsBeforeFirstBatchNotice + 1);
assert.equal(
  sentEmailMessages.at(-1).subject,
  '首批 40 筆同步完成｜T-SCHOOL Schedule Sync'
);
assert.match(sentEmailMessages.at(-1).body, /其餘約 382 筆會在背景自動繼續/);
assert.match(sentEmailMessages.at(-1).htmlBody, /前 40 筆已安全寫入日曆/);
assert.match(sentEmailMessages.at(-1).htmlBody, /目前進度 9%/);
assert.match(sentEmailMessages.at(-1).htmlBody, /剩餘約 382 筆/);
const emailsBeforeStartedNotice = sentEmailMessages.length;
context.sendFirstSetupNotificationSafe_({
  created: 422,
  updated: 0,
  outlineUpdated: 0,
  deleted: 0,
  unchanged: 0
});
assert.equal(sentEmailMessages.length, emailsBeforeStartedNotice + 1);
assert.equal(
  sentEmailMessages.at(-1).subject,
  '行程已開始同步｜T-SCHOOL Schedule Sync'
);
assert.equal(
  sentEmailMessages.at(-1).body,
  '首批事件已同步，課綱資訊稍待幾分鐘便會載入！之後系統會依設定自動更新'
);
assert.match(sentEmailMessages.at(-1).htmlBody, /你的行程已開始同步/);
assert.match(
  sentEmailMessages.at(-1).htmlBody,
  /首批事件已同步，課綱資訊稍待幾分鐘便會載入！之後系統會依設定自動更新/
);
assert.equal(
  context.formatNotificationSubject_('[T-SCHOOL] 行程同步失敗'),
  '行程同步失敗｜T-SCHOOL Schedule Sync'
);
assert.equal(
  context.formatNotificationSubject_('行程已開始同步｜T-SCHOOL Schedule Sync'),
  '行程已開始同步｜T-SCHOOL Schedule Sync'
);

cachedEmailTemplateManifest = '';
emailTemplateFetchShouldFail = true;
assert.equal(
  context.buildEmailHtmlSafe_(
    'sync_failure',
    '[T-SCHOOL] 行程同步失敗',
    { message: '暫時無法下載版型' }
  ),
  '',
  '遠端版型失效時應退回純文字寄送'
);
emailTemplateFetchShouldFail = false;

context.clearChunkedStore_('TSCHOOL_NOTIFICATION_QUEUE');
const notificationTimingSettings = {
  notificationEmail: 'test@example.com',
  autoSyncHours: [(Number(formatDate(new Date(), 'H')) + 1) % 24],
  notifySyncHour: (Number(formatDate(new Date(), 'H')) + 1) % 24
};
const scheduledChangeResult = {
  created: 0,
  updated: 1,
  outlineUpdated: 0,
  deleted: 0,
  unchanged: 8,
  omittedChangeCount: 0,
  changes: [{
    type: '時間變更',
    oldItem: {
      originalTitle: '測試課程',
      dateKey: '2026-07-27',
      periodStart: 5,
      periodEnd: 6,
      startTime: '13:10',
      endTime: '15:00',
      location: '舊教室',
      isAllDay: false
    },
    newItem: {
      originalTitle: '測試課程',
      dateKey: '2026-07-28',
      periodStart: 3,
      periodEnd: 4,
      startTime: '10:10',
      endTime: '12:00',
      location: '新教室',
      isAllDay: false
    }
  }]
};
const emailsBeforeQueuedChange = sentEmailMessages.length;
context.sendSyncNotificationsSafe_(
  notificationTimingSettings,
  scheduledChangeResult,
  { reason: 'source', notifyOnSuccess: false, notificationWindow: false }
);
assert.equal(
  sentEmailMessages.length,
  emailsBeforeQueuedChange,
  '通知時間外偵測到的行程調整不得立即寄信'
);
assert.equal(
  context.loadNotificationQueueState_().pendingChangeData.changeCount,
  1
);
context.sendSyncNotificationsSafe_(
  notificationTimingSettings,
  {
    created: 0,
    updated: 0,
    outlineUpdated: 0,
    deleted: 0,
    unchanged: 9,
    omittedChangeCount: 0,
    changes: []
  },
  { reason: 'source', notifyOnSuccess: true, notificationWindow: true }
);
assert.equal(sentEmailMessages.length, emailsBeforeQueuedChange + 1);
assert.match(sentEmailMessages.at(-1).subject, /行程調整 1 項/);
assert.doesNotMatch(sentEmailMessages.at(-1).subject, /同步成功/);
assert.equal(
  context.loadNotificationQueueState_().pendingChangeData,
  null,
  '通知時間應寄出並清除已排程的行程調整'
);

const emailsBeforeImmediateError = sentEmailMessages.length;
context.notifySyncFailureSafe_(new Error('第一句。第二句。'));
assert.equal(sentEmailMessages.length, emailsBeforeImmediateError + 1);
assert.equal(sentEmailMessages.at(-1).body.includes('。'), false);
assert.match(sentEmailMessages.at(-1).subject, /同步失敗/);
context.clearChunkedStore_('TSCHOOL_NOTIFICATION_QUEUE');

const liveOutlineIndexValues = [
  ['啟用', '來源組鍵', '課綱名稱', '年級', '適用起日', '適用迄日', '課綱試算表連結'],
  [
    'TRUE',
    '115-1-high1',
    '115-1 高一—必修',
    '高一',
    '2026-09-01',
    '2027-01-31',
    'https://docs.google.com/spreadsheets/d/live-index-required-sheet/edit'
  ]
];
context.SpreadsheetApp = {
  openById(id) {
    assert.equal(id, '1zS6TdGMTPhz2Ja8bRs2AKAg0mRsBfXET9nmXi9wSBjY');
    return {
      getSheetByName(name) {
        assert.equal(name, '課綱來源');
        return {
          getLastRow() {
            return liveOutlineIndexValues.length;
          },
          getLastColumn() {
            return liveOutlineIndexValues[0].length;
          },
          getRange() {
            return {
              getDisplayValues() {
                return liveOutlineIndexValues;
              }
            };
          }
        };
      }
    };
  }
};
context.resetCourseOutlineSourceIndexRuntimeCache_();
const emailsBeforeInitialOutlineIndex = sentEmailMessages.length;
const liveOutlineIndex = context.loadCourseOutlineSourceIndex_();
assert.equal(liveOutlineIndex.source, 'live');
assert.equal(liveOutlineIndex.setsByGrade['高一'][0].key, '115-1-high1');
assert.equal(
  sentEmailMessages.length,
  emailsBeforeInitialOutlineIndex,
  '第一次成功讀取課綱來源索引時不應誤寄變動通知'
);

liveOutlineIndexValues.push([
  'TRUE',
  '115-1-high2',
  '115-1 高二—必修',
  '高二',
  '2026-09-01',
  '2027-01-31',
  'https://docs.google.com/spreadsheets/d/live-index-second-sheet/edit'
]);
context.resetCourseOutlineSourceIndexRuntimeCache_();
const emailsBeforeOutlineIndexChange = sentEmailMessages.length;
const changedOutlineIndex = context.loadCourseOutlineSourceIndex_();
assert.equal(changedOutlineIndex.setsByGrade['高二'][0].key, '115-1-high2');
assert.equal(sentEmailMessages.length, emailsBeforeOutlineIndexChange + 1);
assert.equal(
  sentEmailMessages.at(-1).subject,
  '課綱索引已更新｜T-SCHOOL Schedule Sync'
);
assert.match(sentEmailMessages.at(-1).body, /新增：高二｜115-1-high2/);
assert.match(sentEmailMessages.at(-1).body, /舊指紋：/);
assert.match(sentEmailMessages.at(-1).body, /新指紋：/);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    context.readChunkedJson_('TSCHOOL_COURSE_OUTLINE_INDEX_CACHE', null),
    'changeNotice'
  ),
  false,
  '變動通知成功後應清除待寄狀態'
);

liveOutlineIndexValues[1][2] = '115-1 高一—必修（更新）';
mailFailuresRemaining = 1;
context.resetCourseOutlineSourceIndexRuntimeCache_();
const emailsBeforeFailedOutlineIndexNotice = sentEmailMessages.length;
context.loadCourseOutlineSourceIndex_();
assert.equal(
  sentEmailMessages.length,
  emailsBeforeFailedOutlineIndexNotice,
  '課綱索引通知寄送失敗時不得假裝成功'
);
assert.equal(
  context.readChunkedJson_('TSCHOOL_COURSE_OUTLINE_INDEX_CACHE', null).changeNotice.pending,
  true,
  '課綱索引通知寄送失敗後應保留待寄狀態'
);
context.resetCourseOutlineSourceIndexRuntimeCache_();
context.loadCourseOutlineSourceIndex_();
assert.equal(sentEmailMessages.length, emailsBeforeFailedOutlineIndexNotice + 1);
assert.match(sentEmailMessages.at(-1).body, /更新前：高一｜115-1-high1/);
assert.match(sentEmailMessages.at(-1).body, /更新後：高一｜115-1-high1/);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    context.readChunkedJson_('TSCHOOL_COURSE_OUTLINE_INDEX_CACHE', null),
    'changeNotice'
  ),
  false,
  '下一次成功讀取相同索引時應重試並完成待寄通知'
);

context.SpreadsheetApp = {
  openById() {
    throw new Error('模擬中央索引暫時無法讀取');
  }
};
context.resetCourseOutlineSourceIndexRuntimeCache_();
const cachedOutlineIndex = context.loadCourseOutlineSourceIndex_();
assert.equal(cachedOutlineIndex.source, 'last_success');
assert.equal(cachedOutlineIndex.setsByGrade['高一'][0].key, '115-1-high1');
assert.match(cachedOutlineIndex.warning, /沿用最後成功版本/);
context.clearChunkedStore_('TSCHOOL_COURSE_OUTLINE_INDEX_CACHE');
context.resetCourseOutlineSourceIndexRuntimeCache_();
const embeddedOutlineIndex = context.loadCourseOutlineSourceIndex_();
assert.equal(embeddedOutlineIndex.source, 'embedded_fallback');
assert.equal(embeddedOutlineIndex.setsByGrade['高二'][0].key, '114-2-high2');
context.resetCourseOutlineSourceIndexRuntimeCache_();

function createMockCalendar() {
  let eventCounter = 0;
  const events = new Map();

  function makeEvent(title, start, end, options, allDay) {
    const id = `mock-event-${++eventCounter}`;
    const tags = {};
    const event = {
      id,
      title,
      start: new Date(start),
      end: new Date(end),
      location: options && options.location || '',
      description: options && options.description || '',
      allDay: Boolean(allDay),
      deleted: false,
      getId() { return id; },
      getTitle() { return this.title; },
      setTitle(value) { this.title = value; },
      getStartTime() { return new Date(this.start); },
      getEndTime() { return new Date(this.end); },
      setTime(nextStart, nextEnd) {
        this.start = new Date(nextStart);
        this.end = new Date(nextEnd);
      },
      isAllDayEvent() { return this.allDay; },
      getAllDayStartDate() { return new Date(this.start); },
      setAllDayDate(value) {
        this.start = new Date(value);
        this.end = new Date(this.start.getTime() + 24 * 60 * 60 * 1000);
      },
      getLocation() { return this.location; },
      setLocation(value) { this.location = value; },
      getDescription() { return this.description; },
      setDescription(value) { this.description = value; },
      getTag(key) { return tags[key] || ''; },
      setTag(key, value) {
        tags[key] = String(value);
        return this;
      },
      deleteTag(key) {
        delete tags[key];
        return this;
      },
      removeAllReminders() {},
      addPopupReminder() {},
      addEmailReminder() {},
      deleteEvent() { this.deleted = true; }
    };
    events.set(id, event);
    return event;
  }

  return {
    createEvent(title, start, end, options) {
      return makeEvent(title, start, end, options, false);
    },
    createAllDayEvent(title, start, options) {
      return makeEvent(
        title,
        start,
        new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000),
        options,
        true
      );
    },
    getEventById(id) {
      const event = events.get(id);
      return event && !event.deleted ? event : null;
    },
    getEvents(start, end) {
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      return Array.from(events.values()).filter(event =>
        !event.deleted &&
        event.start.getTime() < endMs &&
        event.end.getTime() > startMs
      );
    },
    activeEvents() {
      return Array.from(events.values()).filter(event => !event.deleted);
    }
  };
}

function makeBatchFixtureEvent(index) {
  const start = new Date('2026-08-01T08:10:00+08:00');
  start.setDate(start.getDate() + index);
  const end = new Date(start.getTime() + 50 * 60 * 1000);
  return {
    originalTitle: `分批測試課程 ${index + 1}`,
    type: 'course',
    isAllDay: false,
    dateKey: formatDate(start, 'yyyy-MM-dd'),
    weekday: '一',
    weekNum: Math.floor(index / 7) + 1,
    periodStart: 1,
    periodEnd: 1,
    startTime: '08:10',
    endTime: '09:00',
    start,
    end,
    location: '測試教室',
    sourceUpdatedLabel: '0725'
  };
}

function makeSyncJobForTest(desiredCount, forceCalendarCheck) {
  return {
    schemaVersion: 1,
    jobId: `batch-job-${desiredCount}-${forceCalendarCheck ? 'force' : 'normal'}`,
    status: 'running',
    phase: 'calendar',
    reason: forceCalendarCheck ? 'repair' : 'setup',
    firstSetup: !forceCalendarCheck,
    forceCalendarCheck: Boolean(forceCalendarCheck),
    notifyOnSuccess: false,
    input: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0,
    desiredCount,
    initialOperationCount: desiredCount,
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
    migrationFromId: '',
    migrationEntries: [],
    migrationCursor: 0
  };
}

const batchSettings = {
  descriptionPreset: 'standard',
  customDescription: '',
  reminderMode: 'none',
  reminderMinutes: 10
};
const batchDesired = Array.from({ length: 422 }, (_, index) => makeBatchFixtureEvent(index));
const batchCalendar = createMockCalendar();
let batchState = {};
let batchJob = makeSyncJobForTest(batchDesired.length, false);
let batchCount = 0;
let batchPending = true;
while (batchPending) {
  const batchResult = context.runSyncJobBatch_(
    batchJob,
    batchCalendar,
    batchState,
    batchDesired,
    batchSettings,
    '2026-08-01'
  );
  batchState = batchResult.state;
  batchJob = context.applySyncBatchResultToJob_(batchJob, batchResult);
  batchPending = batchResult.pending;
  batchCount += 1;
  assert.equal(batchCount <= 7, true, '422 筆正常同步不應出現無限續跑');
}
assert.equal(batchCount, 6, '首次 40 筆後應改以每批最多 80 筆完成');
assert.equal(batchJob.created, 422);
assert.equal(Object.keys(batchState).length, 422);
assert.equal(batchCalendar.activeEvents().length, 422);
assert.equal(
  Object.values(batchState).every(item => item.signatureVersion === 2),
  true,
  '新狀態應只保存短雜湊簽章版本'
);
assert.equal(
  Object.values(batchState).every(item => item.metadataVersion === 2),
  true,
  '新狀態應標記為新版隱藏事件標籤與顯示格式'
);
assert.equal(
  batchCalendar.activeEvents().every(event =>
    event.getTag('tschool_managed') === '1' &&
    event.getTag('tschool_meta_version') === '2' &&
    event.getDescription().indexOf('同步識別碼：') === -1 &&
    event.getDescription().indexOf('[T-SCHOOL-SCHEDULE-SYNC]') === -1 &&
    event.getDescription().indexOf('[T-SCHOOL Schedule Sync]') !== -1
  ),
  true,
  '新建立事件應以隱藏標籤管理，說明欄只顯示可讀頁尾'
);

const noChangeJob = makeSyncJobForTest(batchDesired.length, false);
const noChangeResult = context.runSyncJobBatch_(
  noChangeJob,
  batchCalendar,
  batchState,
  batchDesired,
  batchSettings,
  '2026-08-01'
);
assert.equal(noChangeResult.pending, false);
assert.equal(noChangeResult.completedOperations, 0);
assert.equal(batchCalendar.activeEvents().length, 422);

let forceJob = makeSyncJobForTest(batchDesired.length, true);
let forceState = batchState;
let forceBatchCount = 0;
let forcePending = true;
while (forcePending) {
  const forceResult = context.runSyncJobBatch_(
    forceJob,
    batchCalendar,
    forceState,
    batchDesired,
    batchSettings,
    '2026-08-01'
  );
  forceState = forceResult.state;
  forceJob = context.applySyncBatchResultToJob_(forceJob, forceResult);
  forcePending = forceResult.pending;
  forceBatchCount += 1;
  assert.equal(forceBatchCount <= 7, true, '強制修復不得重複處理同一批而無限續跑');
}
assert.equal(forceBatchCount, 6);
assert.equal(forceJob.updated, 422);
assert.equal(Object.keys(forceJob.forceProcessedKeys).length, 422);
assert.equal(batchCalendar.activeEvents().length, 422);

const firstSetupForceCalendar = createMockCalendar();
let firstSetupForceState = {};
let firstSetupForceJob = makeSyncJobForTest(batchDesired.length, true);
firstSetupForceJob.reason = 'setup';
firstSetupForceJob.firstSetup = true;
let firstSetupForceBatches = 0;
let firstSetupForcePending = true;
while (firstSetupForcePending) {
  const firstSetupForceResult = context.runSyncJobBatch_(
    firstSetupForceJob,
    firstSetupForceCalendar,
    firstSetupForceState,
    batchDesired,
    batchSettings,
    '2026-08-01'
  );
  firstSetupForceState = firstSetupForceResult.state;
  firstSetupForceJob = context.applySyncBatchResultToJob_(
    firstSetupForceJob,
    firstSetupForceResult
  );
  firstSetupForcePending = firstSetupForceResult.pending;
  firstSetupForceBatches += 1;
  assert.equal(
    firstSetupForceBatches <= 7,
    true,
    '首次同步的強制檢查不得讓新建事件在後續批次被重複處理'
  );
}
assert.equal(firstSetupForceBatches, 6);
assert.equal(firstSetupForceJob.created, 422);
assert.equal(firstSetupForceJob.updated, 0);
assert.equal(firstSetupForceJob.processedOperations, 422);
assert.equal(Object.keys(firstSetupForceState).length, 422);
assert.equal(firstSetupForceCalendar.activeEvents().length, 422);

const recoveryCalendar = createMockCalendar();
const recoveryItem = makeBatchFixtureEvent(0);
const recoveryKey = context.makeOccurrenceKey_(recoveryItem);
const recoveredExistingEvent = recoveryCalendar.createEvent(
  context.buildEventTitle_(recoveryItem),
  recoveryItem.start,
  recoveryItem.end,
  {
    location: context.buildEventLocation_(recoveryItem),
    description: context.buildManagedDescription_(recoveryItem, recoveryKey, batchSettings)
  }
);
let recoveredReminderRepairs = 0;
recoveredExistingEvent.removeAllReminders = () => { recoveredReminderRepairs += 1; };
const recoveryJob = makeSyncJobForTest(1, false);
recoveryJob.inFlight = [{
  type: 'create',
  newKey: recoveryKey,
  newItem: JSON.parse(JSON.stringify(recoveryItem)),
  signature: context.makeEventSignature_(recoveryItem, batchSettings)
}];
const recoveryResult = context.runSyncJobBatch_(
  recoveryJob,
  recoveryCalendar,
  {},
  [recoveryItem],
  batchSettings,
  '2026-08-01'
);
assert.equal(recoveryResult.pending, false);
assert.equal(recoveryCalendar.activeEvents().length, 1, 'Calendar 已寫入但狀態未存時不得重複建立');
assert.equal(Object.keys(recoveryResult.state).length, 1);
assert.equal(
  recoveredReminderRepairs,
  1,
  '接回已建立事件時仍須重新套用提醒，修復建立後中斷的情況'
);

const legacyMarkerCalendar = createMockCalendar();
const legacyMarkerDescription = [
  '[T-SCHOOL-SCHEDULE-SYNC]',
  '舊版學生可見內容',
  '',
  '同步識別碼：' + context.hashText_(recoveryKey)
].join('\n');
const legacyMarkerEvent = legacyMarkerCalendar.createEvent(
  '舊版標題',
  recoveryItem.start,
  recoveryItem.end,
  {
    location: '舊版地點',
    description: legacyMarkerDescription
  }
);
context.migrateCalendarEventMetadata_(
  legacyMarkerCalendar,
  legacyMarkerEvent.getId(),
  recoveryItem,
  recoveryKey,
  batchSettings,
  recoveryKey
);
assert.equal(legacyMarkerEvent.getTitle(), '分批測試課程 1 [測試教室]');
assert.equal(legacyMarkerEvent.getLocation(), '測試教室');
assert.equal(
  legacyMarkerEvent.getDescription(),
  '第 1 週 / 週一 / 第 1 節<br><br><br>[T-SCHOOL Schedule Sync]'
);
assert.equal(legacyMarkerEvent.getTag('tschool_managed'), '1');
assert.equal(legacyMarkerEvent.getTag('tschool_sync_id'), context.hashText_(recoveryKey));
assert.equal(legacyMarkerEvent.getTag('tschool_meta_version'), '2');

const movedRecoveryCalendar = createMockCalendar();
const movedOldItem = makeBatchFixtureEvent(0);
const movedOldKey = context.makeOccurrenceKey_(movedOldItem);
const movedExisting = context.createCalendarEvent_(
  movedRecoveryCalendar,
  movedOldItem,
  movedOldKey,
  batchSettings
);
const movedNewItem = Object.assign({}, movedOldItem, {
  dateKey: '2026-08-03',
  start: new Date('2026-08-03T08:10:00+08:00'),
  end: new Date('2026-08-03T09:00:00+08:00')
});
const movedNewKey = context.makeOccurrenceKey_(movedNewItem);
context.updateCalendarEvent_(
  movedRecoveryCalendar,
  movedExisting.getId(),
  movedNewItem,
  movedNewKey,
  batchSettings,
  movedOldKey
);
assert.doesNotThrow(
  () => context.updateCalendarEvent_(
    movedRecoveryCalendar,
    movedExisting.getId(),
    movedNewItem,
    movedNewKey,
    batchSettings,
    movedOldKey
  ),
  '移動事件已改成新隱藏標籤、但尚未 checkpoint 時仍應能安全續跑'
);
assert.equal(movedRecoveryCalendar.activeEvents().length, 1);

const duplicateCalendar = createMockCalendar();
context.createCalendarEvent_(duplicateCalendar, recoveryItem, recoveryKey, batchSettings);
context.createCalendarEvent_(duplicateCalendar, recoveryItem, recoveryKey, batchSettings);
assert.throws(
  () => context.createCalendarEventIdempotent_(
    duplicateCalendar,
    recoveryItem,
    recoveryKey,
    batchSettings
  ),
  /多筆相同同步識別碼/,
  '發現兩筆相同管理識別碼時不得建立第三筆'
);

const unmanagedCalendar = createMockCalendar();
const unmanagedEvent = unmanagedCalendar.createEvent(
  recoveryItem.originalTitle,
  recoveryItem.start,
  recoveryItem.end,
  { description: '使用者自己的事件' }
);
assert.throws(
  () => context.updateCalendarEvent_(
    unmanagedCalendar,
    unmanagedEvent.getId(),
    recoveryItem,
    recoveryKey,
    batchSettings,
    recoveryKey
  ),
  /管理標記/,
  '既有事件失去管理標記後不得被更新'
);

const migrationSanitized = context.sanitizeSettingsInput_(
  {
    gradeName: '高二',
    selectedCourses: ['測試課程'],
    includeActivities: true,
    excludedActivities: [],
    calendarId: '',
    calendarName: '新專用日曆',
    notificationEmail: '',
    autoSyncEnabled: true,
    autoSyncHours: [5],
    notifySyncHour: 5,
    notificationPreset: 'standard',
    customNotification: '',
    descriptionPreset: 'standard',
    customDescription: '',
    reminderMode: 'none',
    reminderMinutes: 10
  },
  {
    schemaVersion: 3,
    gradeName: '高二',
    setupComplete: true,
    selectedCourses: ['測試課程'],
    excludedActivities: [],
    knownTitles: ['測試課程'],
    pendingTitles: [],
    excludedTitles: [],
    calendarId: 'old-calendar-id',
    calendarName: '舊專用日曆',
    calendarMigrationFromId: '',
    notificationEmail: '',
    autoSyncHours: [5],
    notifySyncHour: 5,
    notificationPreset: 'standard',
    customNotification: '',
    descriptionPreset: 'standard',
    customDescription: '',
    reminderMode: 'none',
    reminderMinutes: 10,
    termKey: '二年級|2026-02-23',
    pendingTermKey: ''
  },
  {
    termKey: '二年級|2026-02-23',
    fingerprint: 'source',
    catalog: {
      all: [{ title: '測試課程', type: 'course' }],
      activities: []
    }
  }
);
assert.equal(
  migrationSanitized.calendarMigrationFromId,
  'old-calendar-id',
  '選擇建立新日曆時仍須保存舊日曆 ID 供分批搬移'
);
assert.equal(migrationSanitized.descriptionPreset, 'standard');
assert.equal(migrationSanitized.notificationPreset, 'standard');
assert.equal(migrationSanitized.customNotification, '');
assert.match(
  migrationSanitized.customDescription,
  /第 \{week\} 週 \/ 週\{weekday\} \/ 第 \{period\} 節/
);
const legacyDescriptionPresetSanitized = context.sanitizeSettingsInput_(
  Object.assign({}, migrationSanitized, {
    calendarId: '',
    descriptionPreset: 'detailed',
    customDescription: ''
  }),
  Object.assign({}, migrationSanitized, {
    calendarId: '',
    calendarMigrationFromId: ''
  }),
  {
    termKey: '二年級|2026-02-23',
    fingerprint: 'source',
    catalog: {
      all: [{ title: '測試課程', type: 'course' }],
      activities: []
    }
  }
);
assert.equal(
  legacyDescriptionPresetSanitized.descriptionPreset,
  'standard',
  '舊的簡潔或詳細說明格式必須遷移為標準'
);
const settingsWithoutDescriptionControls = Object.assign({}, migrationSanitized, {
  calendarId: ''
});
delete settingsWithoutDescriptionControls.descriptionPreset;
delete settingsWithoutDescriptionControls.customDescription;
const preservedCustomDescription = context.sanitizeSettingsInput_(
  settingsWithoutDescriptionControls,
  Object.assign({}, migrationSanitized, {
    calendarId: '',
    calendarMigrationFromId: '',
    descriptionPreset: 'custom',
    customDescription: '**既有自訂說明**'
  }),
  {
    termKey: '二年級|2026-02-23',
    fingerprint: 'source',
    catalog: {
      all: [{ title: '測試課程', type: 'course' }],
      activities: []
    }
  }
);
assert.equal(
  preservedCustomDescription.descriptionPreset,
  'custom',
  '側欄未送出說明格式欄位時應保留既有進階自訂設定'
);
assert.equal(
  preservedCustomDescription.customDescription,
  '**既有自訂說明**',
  '側欄儲存其他設定時不得改寫既有自訂說明模板'
);

const newTermSource = {
  termKey: '二年級|2026-09-01',
  firstDateKey: '2026-09-01',
  lastDateKey: '2027-01-31',
  fingerprint: 'new-term-source',
  events: [],
  catalog: {
    all: [{ title: '新學期課程', type: 'course' }],
    activities: []
  }
};
const settingsBeforeTermTransition = Object.assign({}, migrationSanitized, {
  setupComplete: true,
  termKey: '二年級|2026-02-23',
  pendingTermKey: '',
  selectedCourses: ['測試課程'],
  excludedActivities: ['測試活動'],
  pendingTitles: ['待確認課程'],
  autoSyncHours: [(Number(formatDate(new Date(), 'H')) + 1) % 24],
  notifySyncHour: (Number(formatDate(new Date(), 'H')) + 1) % 24,
  autoSyncEnabled: true,
  autoSyncEnabledBeforeTermTransition: null,
  termTransitionNoticeAttempts: 0,
  termTransitionNoticeSentAt: '',
  termTransitionNoticeLastError: ''
});
const emailsBeforeTermTransition = sentOutlineFailureEmails;
const transitionedSettings = context.applyTermTransitionIfNeeded_(
  settingsBeforeTermTransition,
  newTermSource,
  true
);
assert.equal(transitionedSettings.pendingTermKey, newTermSource.termKey);
assert.deepEqual(Array.from(transitionedSettings.selectedCourses), []);
assert.equal(transitionedSettings.autoSyncEnabled, false);
assert.equal(transitionedSettings.autoSyncEnabledBeforeTermTransition, true);
assert.equal(transitionedSettings.termTransitionNoticeAttempts, 1);
assert.notEqual(transitionedSettings.termTransitionNoticeSentAt, '');
assert.equal(sentOutlineFailureEmails, emailsBeforeTermTransition);
assert.equal(context.loadNotificationQueueState_().pending.length, 1);
context.flushQueuedNotificationsSafe_(transitionedSettings);
assert.equal(sentOutlineFailureEmails, emailsBeforeTermTransition + 1);
assert.match(sentEmailSubjects.at(-1), /新學期行程已更新/);
assert.match(sentEmailMessages.at(-1).body, /自動同步已暫停/);
assert.match(sentEmailMessages.at(-1).htmlBody, /需要重新選課/);
assert.match(sentEmailMessages.at(-1).htmlBody, /2026-09-01–2027-01-31/);
context.deliverTermTransitionNotice_(transitionedSettings, newTermSource);
assert.equal(
  sentOutlineFailureEmails,
  emailsBeforeTermTransition + 1,
  '同一學期已成功寄送的提醒不得重複寄出'
);

const laterTermSource = Object.assign({}, newTermSource, {
  termKey: '二年級|2027-02-22',
  firstDateKey: '2027-02-22',
  lastDateKey: '2027-06-30'
});
const failedNoticeSettings = Object.assign({}, settingsBeforeTermTransition, {
  termKey: newTermSource.termKey,
  pendingTermKey: '',
  selectedCourses: ['新學期課程'],
  autoSyncEnabled: true,
  autoSyncHours: [Number(formatDate(new Date(), 'H'))],
  notifySyncHour: Number(formatDate(new Date(), 'H'))
});
mailFailuresRemaining = 1;
const failedTransition = context.applyTermTransitionIfNeeded_(
  failedNoticeSettings,
  laterTermSource,
  true
);
assert.equal(failedTransition.termTransitionNoticeAttempts, 1);
assert.equal(failedTransition.termTransitionNoticeSentAt, '');
assert.match(failedTransition.termTransitionNoticeLastError, /模擬寄信失敗/);
assert.equal(
  projectTriggers.filter(trigger =>
    trigger.getHandlerFunction() === 'retryTermTransitionNotice'
  ).length,
  1,
  '第一次寄信失敗應建立一次重試'
);
assert.equal(context.deliverTermTransitionNotice_(failedTransition, laterTermSource), true);
assert.equal(failedTransition.termTransitionNoticeAttempts, 2);
assert.notEqual(failedTransition.termTransitionNoticeSentAt, '');
assert.equal(
  projectTriggers.some(trigger =>
    trigger.getHandlerFunction() === 'retryTermTransitionNotice'
  ),
  false,
  '重試成功後應移除未執行的提醒觸發器'
);

const restoredAfterSelection = context.sanitizeSettingsInput_(
  Object.assign({}, migrationSanitized, {
    gradeName: '高二',
    selectedCourses: ['新學期課程'],
    calendarId: '',
    calendarName: '新專用日曆',
    calendarMigrationFromId: '',
    autoSyncEnabled: true
  }),
  Object.assign({}, failedTransition, {
    calendarId: '',
    calendarMigrationFromId: ''
  }),
  newTermSource
);
assert.equal(restoredAfterSelection.pendingTermKey, '');
assert.equal(restoredAfterSelection.autoSyncEnabled, true);
assert.equal(restoredAfterSelection.autoSyncEnabledBeforeTermTransition, null);
context.clearChunkedStore_('TSCHOOL_SETTINGS');
context.clearChunkedStore_('TSCHOOL_NOTICE_STATE');
projectTriggers = projectTriggers.filter(trigger =>
  trigger.getHandlerFunction() !== 'retryTermTransitionNotice'
);
mailFailuresRemaining = 0;

assert.throws(
  () => context.sanitizeSettingsInput_(
    Object.assign({}, migrationSanitized, { calendarId: 'third-calendar-id' }),
    Object.assign({}, migrationSanitized, {
      calendarId: 'second-calendar-id',
      calendarMigrationFromId: 'old-calendar-id'
    }),
    {
      termKey: '二年級|2026-02-23',
      fingerprint: 'source',
      catalog: {
        all: [{ title: '測試課程', type: 'course' }],
        activities: []
      }
    }
  ),
  /搬移尚未清理完成/,
  '前一次 Calendar 搬移完成前不得再次更換目標'
);
const deletionSafetyPlan = {
  oldFutureCount: 10,
  deletions: Array.from({ length: 5 }, (_, index) => ({
    stateKey: `delete-${index}`
  }))
};
assert.throws(
  () => context.assertSafeDeletionPlan_(deletionSafetyPlan, {}, 'repair', false),
  /移除過多事件/,
  '強制修復不得繞過大量刪除保護'
);
assert.throws(
  () => context.assertSafeDeletionPlan_(deletionSafetyPlan, {}, 'settings', false),
  /移除過多事件/,
  '沒有有效預覽 token 的設定變更不得大量刪除'
);
assert.doesNotThrow(
  () => context.assertSafeDeletionPlan_(deletionSafetyPlan, {}, 'settings', true),
  '有效預覽 token 才能套用使用者剛確認的大量設定變更'
);
const finalizerRetryJob = makeSyncJobForTest(0, false);
finalizerRetryJob.retryCount = 1;
context.applySyncBatchResultToJob_(finalizerRetryJob, {
  stats: { created: 0, updated: 0, outlineUpdated: 0, deleted: 0, migrationDeleted: 0 },
  completedOperations: 0,
  changes: []
});
assert.equal(
  finalizerRetryJob.retryCount,
  1,
  '零操作的 finalizer 重試不得清除連續失敗次數'
);

const emailsBeforeWatchdog = sentOutlineFailureEmails;
const timedOutJob = makeSyncJobForTest(1, false);
timedOutJob.status = 'running';
timedOutJob.runStartedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
timedOutJob.retryCount = 0;
context.saveSyncJob_(timedOutJob);
const firstWatchdogResult = context.watchScheduleSync();
assert.equal(firstWatchdogResult.retrying, true);
assert.equal(context.loadSyncJob_().status, 'retry_pending');
assert.equal(sentOutlineFailureEmails, emailsBeforeWatchdog);
const secondTimedOutJob = context.loadSyncJob_();
secondTimedOutJob.status = 'running';
secondTimedOutJob.runStartedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
secondTimedOutJob.retryCount = 1;
context.saveSyncJob_(secondTimedOutJob);
const secondWatchdogResult = context.watchScheduleSync();
assert.equal(secondWatchdogResult.retrying, false);
assert.equal(context.loadSyncJob_().status, 'failed');
assert.equal(
  sentOutlineFailureEmails,
  emailsBeforeWatchdog + 1,
  '連續第二次硬逾時應停止並寄信一次'
);
context.clearChunkedStore_('TSCHOOL_SYNC_JOB');
projectTriggers = projectTriggers.filter(trigger =>
  ['continueScheduleSync', 'watchScheduleSync'].indexOf(trigger.getHandlerFunction()) === -1
);
sentOutlineFailureEmails = 0;

function makeOutlineSheet(name, values) {
  return {
    getName() {
      return name;
    },
    getLastRow() {
      return values.length;
    },
    getLastColumn() {
      return Math.max(...values.map(row => row.length));
    },
    getRange() {
      return {
        getDisplayValues() {
          return values;
        }
      };
    }
  };
}

const configuredHigh2OutlineSet = context.getConfiguredCourseOutlineSourceSets_('高二')[0];
let outlineWorkbookSheets = {
  [configuredHigh2OutlineSet.spreadsheetIds[0]]: [makeOutlineSheet('測試課程', outlineValues)],
  [configuredHigh2OutlineSet.spreadsheetIds[1]]: [makeOutlineSheet('另一課程', outlineValues)],
  [configuredHigh2OutlineSet.spreadsheetIds[2]]: [],
  [configuredHigh2OutlineSet.spreadsheetIds[3]]: []
};
const openedOutlineWorkbookIds = [];
context.SpreadsheetApp = {
  openById(id) {
    openedOutlineWorkbookIds.push(id);
    return {
      getName() {
        return `課綱-${id.slice(0, 4)}`;
      },
      getSheets() {
        return outlineWorkbookSheets[id] || [];
      }
    };
  }
};
const collectedOutlineSnapshot = context.collectCourseOutlineSnapshot_(
  { gradeName: '高二' },
  { termKey: '二年級|2026-02-23' },
  [Object.assign({}, outlineBaseItem)],
  [configuredHigh2OutlineSet]
);
assert.equal(openedOutlineWorkbookIds.length, 4, '相關高二來源組應批次檢查四份課綱');
assert.equal(collectedOutlineSnapshot.diagnostics.matchedRecordCount, 1);
assert.deepEqual(
  Array.from(collectedOutlineSnapshot.diagnostics.missingSheetNames),
  [],
  '一字不差命中分頁時不應列為缺少課綱'
);
outlineWorkbookSheets = {
  [configuredHigh2OutlineSet.spreadsheetIds[0]]: [
    makeOutlineSheet('測試課程 ', outlineValues)
  ],
  [configuredHigh2OutlineSet.spreadsheetIds[1]]: [],
  [configuredHigh2OutlineSet.spreadsheetIds[2]]: [],
  [configuredHigh2OutlineSet.spreadsheetIds[3]]: []
};
const nearMatchSnapshot = context.collectCourseOutlineSnapshot_(
  { gradeName: '高二' },
  { termKey: '二年級|2026-02-23' },
  [
    Object.assign({}, outlineBaseItem),
    Object.assign({}, outlineBaseItem, {
      originalTitle: '週五跨校選修',
      dateKey: '2026-07-28',
      start: new Date('2026-07-28T13:10:00+08:00'),
      end: new Date('2026-07-28T15:00:00+08:00')
    })
  ],
  [configuredHigh2OutlineSet]
);
assert.deepEqual(Array.from(nearMatchSnapshot.diagnostics.missingSheetNames), ['測試課程']);
assert.deepEqual(
  Array.from(nearMatchSnapshot.diagnostics.ignoredCrossSchoolSheetNames),
  ['週五跨校選修'],
  '跨校課程不應列入課綱缺頁錯誤'
);
assert.equal(nearMatchSnapshot.diagnostics.nearMatchSheetNames.length, 1);
assert.equal(
  nearMatchSnapshot.diagnostics.nearMatchSheetNames[0].candidates[0],
  '測試課程 ',
  '只差空格的課綱分頁只能提示，不得自動配對'
);
outlineWorkbookSheets = Object.assign({}, outlineWorkbookSheets, {
  [configuredHigh2OutlineSet.spreadsheetIds[0]]: [makeOutlineSheet('測試課程', outlineValues)],
  [configuredHigh2OutlineSet.spreadsheetIds[1]]: [makeOutlineSheet('測試課程', outlineValues)]
});
assert.throws(
  () => context.collectCourseOutlineSnapshot_(
    { gradeName: '高二' },
    { termKey: '二年級|2026-02-23' },
    [Object.assign({}, outlineBaseItem)],
    [configuredHigh2OutlineSet]
  ),
  /課綱資料重複/,
  '同一分頁、日期與節次在兩個來源同時命中時不得任選'
);

const high2OutlineSets = context.getRelevantCourseOutlineSourceSets_('高二', [{
  type: 'course',
  isAllDay: false,
  dateKey: '2026-07-27'
}]);
const snapshotLookupKey = context.makeCourseOutlineOccurrenceKey_('測試課程', '2026-07-27', 5, 6);
const publishedSnapshot = context.publishCourseOutlineSnapshot_({
  schemaVersion: 1,
  gradeName: '高二',
  termKey: '二年級|2026-02-23',
  sourceSetKeys: ['114-2-high2'],
  sourceSetsFingerprint: context.makeCourseOutlineSourceSetsFingerprint_(high2OutlineSets),
  contextFingerprint: 'test-context',
  refreshedAt: new Date().toISOString(),
  refreshedAtLabel: '2026/07/24 20:00',
  lookup: {
    [snapshotLookupKey]: {
      classroom: '協作坊',
      topic: '快照主題',
      content: '快照內容',
      hash: 'snapshot-hash'
    }
  },
  diagnostics: { matchedRecordCount: 1 }
});
assert.notEqual(publishedSnapshot.version, '');
const enrichedFromSnapshot = context.enrichEventsWithCourseOutlines_(
  [outlineBaseItem],
  { gradeName: '高二' },
  { termKey: '二年級|2026-02-23' }
);
assert.equal(enrichedFromSnapshot[0].courseOutline.topic, '快照主題');
assert.equal(enrichedFromSnapshot[0].outlineHash, 'snapshot-hash');
assert.equal(
  context.enrichEventsWithCourseOutlines_(
    [outlineBaseItem],
    { gradeName: '高一' },
    { termKey: '一年級|2026-02-23' }
  )[0].outlineHash,
  undefined,
  '其他年級不得套用高二課綱快照'
);

context.refreshAutoSyncTriggers_({
  gradeName: '高一',
  autoSyncEnabled: true,
  autoSyncHours: [5],
  notifySyncHour: 5
});
assert.equal(
  projectTriggers.some(trigger => trigger.getHandlerFunction() === 'refreshCourseOutlinesDaily'),
  false,
  '高一不得建立目前四份高二課綱的讀取觸發器'
);
context.refreshAutoSyncTriggers_({
  gradeName: '高二',
  autoSyncEnabled: true,
  autoSyncHours: [5],
  notifySyncHour: 5
});
assert.equal(
  projectTriggers.filter(trigger => trigger.getHandlerFunction() === 'refreshCourseOutlinesDaily').length,
  1,
  '高二應建立一個獨立的每日課綱更新觸發器'
);

projectTriggers = projectTriggers.filter(trigger =>
  trigger.getHandlerFunction() !== 'refreshCourseOutlinesOnce'
);
context.saveCourseOutlineState_({
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
  lastSuccessAt: ''
});
context.scheduleCourseOutlineRefreshIfNeeded_({
  gradeName: '高二',
  setupComplete: true,
  autoSyncEnabled: true
});
assert.equal(context.loadCourseOutlineState_().status, 'queued');
assert.equal(
  projectTriggers.filter(trigger =>
    trigger.getHandlerFunction() === 'refreshCourseOutlinesOnce'
  ).length,
  1,
  '課綱背景工作排定後應保存等待中的狀態並只建立一個觸發器'
);
projectTriggers = projectTriggers.filter(trigger =>
  trigger.getHandlerFunction() !== 'refreshCourseOutlinesOnce'
);

const settingsBeforeOutlineStartupFailure = context.loadSettings_();
context.saveSettings_(Object.assign({}, settingsBeforeOutlineStartupFailure, {
  gradeName: '高二',
  setupComplete: true,
  autoSyncEnabled: true
}));
const getConfiguredCourseOutlineSourceSetsBeforeFailure =
  context.getConfiguredCourseOutlineSourceSets_;
context.getConfiguredCourseOutlineSourceSets_ = function () {
  throw new Error('模擬課綱索引在啟動前失敗');
};
const outlineStartupFailureResult = context.runCourseOutlineRefreshAttempt_(1, 'scheduled');
assert.equal(outlineStartupFailureResult.ok, false);
assert.equal(
  context.loadCourseOutlineState_().status,
  'retry_pending',
  '課綱工作在正式開始前失敗時也應保存狀態並安排重試'
);
assert.equal(
  projectTriggers.some(trigger =>
    trigger.getHandlerFunction() === 'retryCourseOutlineRefresh'
  ),
  true,
  '啟動前失敗不得停在 idle 且沒有後續處理'
);
context.getConfiguredCourseOutlineSourceSets_ =
  getConfiguredCourseOutlineSourceSetsBeforeFailure;
context.saveSettings_(settingsBeforeOutlineStartupFailure);
projectTriggers = projectTriggers.filter(trigger =>
  trigger.getHandlerFunction() !== 'retryCourseOutlineRefresh'
);

const firstFailureRun = {
  status: 'running',
  attempt: 1,
  incidentId: 'outline-incident',
  runId: 'outline-run-1',
  startedAt: new Date().toISOString(),
  watchdogTriggerId: '',
  retryTriggerId: '',
  failureNotifiedAt: '',
  notificationPending: false,
  lastError: '',
  lastSuccessAt: ''
};
context.saveCourseOutlineState_(firstFailureRun);
context.handleCourseOutlineRefreshFailure_(firstFailureRun, new Error('第一次失敗'));
let outlineFailureState = context.loadCourseOutlineState_();
assert.equal(outlineFailureState.status, 'retry_pending');
assert.equal(sentOutlineFailureEmails, 0, '第一次課綱失敗不得寄信');
assert.equal(
  projectTriggers.filter(trigger => trigger.getHandlerFunction() === 'retryCourseOutlineRefresh').length,
  1,
  '第一次失敗應只建立一次重試'
);

const secondFailureRun = Object.assign({}, outlineFailureState, {
  status: 'running',
  attempt: 2,
  runId: 'outline-run-2',
  startedAt: new Date().toISOString(),
  retryTriggerId: ''
});
context.saveCourseOutlineState_(secondFailureRun);
context.handleCourseOutlineRefreshFailure_(secondFailureRun, new Error('第二次失敗'));
outlineFailureState = context.loadCourseOutlineState_();
assert.equal(outlineFailureState.status, 'failed');
assert.equal(sentOutlineFailureEmails, 1, '第二次課綱失敗應寄信一次');
assert.match(sentEmailMessages.at(-1).body, /課綱已嘗試兩次仍無法更新/);
assert.match(sentEmailMessages.at(-1).htmlBody, /課綱資料暫時無法更新/);
assert.notEqual(outlineFailureState.failureNotifiedAt, '');

const repeatedFailureRun = Object.assign({}, outlineFailureState, {
  status: 'running',
  attempt: 2,
  runId: 'outline-run-3',
  startedAt: new Date().toISOString()
});
context.saveCourseOutlineState_(repeatedFailureRun);
context.handleCourseOutlineRefreshFailure_(repeatedFailureRun, new Error('相同事故再次失敗'));
assert.equal(sentOutlineFailureEmails, 1, '相同課綱事故不得重複寄信');

const fixtures = [
  { grade: '高一', file: '/tmp/tschool-requirements-grade1.json' },
  { grade: '高二', file: '/tmp/tschool-requirements-grade2.json' },
  { grade: '高三', file: '/tmp/tschool-requirements-grade3.json' }
];

const results = fixtures.map(fixture => {
  if (!fs.existsSync(fixture.file)) {
    return { grade: fixture.grade, skipped: true, reason: `找不到 ${fixture.file}` };
  }

  const payload = JSON.parse(fs.readFileSync(fixture.file, 'utf8'));
  const installerSummary = scheduleData.summarizePayload(payload, new Date('2026-07-20T12:00:00+08:00'));
  const runtimeSummary = context.parseSchedulePayload_(payload, fixture.grade, new Date('2026-07-20T12:00:00+08:00'));

  assert.deepEqual(
    Array.from(runtimeSummary.catalog.courses, item => item.title).sort(),
    Array.from(installerSummary.catalog.courses, item => item.title).sort(),
    `${fixture.grade} 的課程目錄不一致`
  );
  assert.deepEqual(
    Array.from(runtimeSummary.catalog.activities, item => item.title).sort(),
    Array.from(installerSummary.catalog.activities, item => item.title).sort(),
    `${fixture.grade} 的活動目錄不一致`
  );
  assert.deepEqual(
    Array.from(runtimeSummary.catalog.all, item => `${item.type}:${item.period}:${item.title}`).sort(),
    Array.from(installerSummary.catalog.all, item => `${item.type}:${item.period}:${item.title}`).sort(),
    `${fixture.grade} 的學期間／寒暑假分類不一致`
  );
  assert.equal(runtimeSummary.firstDateKey, installerSummary.firstDateKey);
  assert.equal(runtimeSummary.lastDateKey, installerSummary.lastDateKey);
  assert.equal(runtimeSummary.events.some(event => /\[[^\]]+\]\s*$/.test(event.originalTitle)), false);
  assert.equal(runtimeSummary.catalog.activities.every(item => context.isActivityTitle_(item.title)), true);

  return {
    grade: fixture.grade,
    courses: runtimeSummary.catalog.courses.length,
    activities: runtimeSummary.catalog.activities.length,
    events: runtimeSummary.events.length,
    range: `${runtimeSummary.firstDateKey}..${runtimeSummary.lastDateKey}`
  };
});

assert.equal(
  sentEmailSubjects.every(subject =>
    String(subject).endsWith('｜T-SCHOOL Schedule Sync')
  ),
  true,
  '所有實際寄出的通知主旨都應使用統一品牌後綴'
);

console.log(JSON.stringify({
  generatedCharacters: generatedCode.length,
  generatedLines: generatedCode.split('\n').length,
  results
}, null, 2));
