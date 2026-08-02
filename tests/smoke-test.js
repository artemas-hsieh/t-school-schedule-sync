'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const scheduleData = require(path.join(root, 'schedule-data.js'));
const setupCode = require(path.join(root, 'setup-code.js'));
const controlPanelGenerator = require(path.join(
  root,
  'scripts',
  'generate-google-docs-control-panel.js'
));
const immutableManifestUrl =
  'https://raw.githubusercontent.com/artemas-hsieh/t-school-schedule-sync/' +
  '0131d6b8cf2b0f524e85bb8720d2e680458afea2/notification-email-templates.json';
const expectedAppsScriptOAuthScopes = [
  'https://www.googleapis.com/auth/documents.currentonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/script.send_mail',
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/script.container.ui',
  'https://www.googleapis.com/auth/userinfo.email'
];
const googleDocsTemplateCopyUrl =
  'https://docs.google.com/document/d/1l4SCo0Z8cDgy1F0wvc74exuBIES4MHRO8F08GiqqZgA/copy';

global.window = global;
require(path.join(root, 'sidebar-template.js'));
require(path.join(root, 'setup-dialog-template.js'));
require(path.join(root, 'code-template.js'));

const sidebarHtml = global.TSCHOOL_SIDEBAR_HTML;
const setupDialogHtml = global.TSCHOOL_SETUP_DIALOG_HTML;
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

assert.equal(configuratorHtml.includes('id="instant-notifications"'), true);
assert.equal(
  configuratorHtml.includes('id="instant-notifications" name="instantNotificationsEnabled" type="checkbox" role="switch" checked'),
  true,
  '網站即時通知應預設開啟'
);
assert.equal(configuratorHtml.includes('偵測到行程調整就盡快通知'), true);
assert.equal(configuratorHtml.includes('Email 和通知偏好都沒錯 ↵'), true);
assert.equal(configuratorAppSource.includes('你的即時通知：'), false);
assert.equal(configuratorAppSource.includes("appVersion: '2.0.0-rc.2'"), true);
assert.equal(configuratorAppSource.includes('每日摘要時間：'), false);
assert.match(
  configuratorAppSource,
  /const notificationSummary = instantNotificationsEnabled[\s\S]*?\? \['行程有調整就盡快通知'\][\s\S]*?: getSelectedNotifyHours\(\)\.map/,
  '第四步應依即時通知狀態顯示「盡快通知」或使用者選取的時段'
);
assert.match(
  configuratorAppSource,
  /\['你想收到通知的時間是：', notificationSummary\]/,
  '第四步的通知摘要應只保留一個共用標題'
);
assert.equal(configuratorHtml.includes('class="field-state-border field-state-border-invalid"'), true);
assert.equal(configuratorHtml.includes('class="field-state-border field-state-border-valid"'), true);
assert.equal(configuratorHtml.includes('class="validation-hint-error"'), true);
assert.equal(configuratorHtml.includes('id="copy-setup-code-fallback"'), false);
assert.equal(configuratorHtml.includes('變出控制臺！'), false);
assert.equal(configuratorHtml.includes('>變出控制臺<'), true);
assert.equal(configuratorHtml.includes('設定碼包含你剛剛填寫的資訊，請勿隨意分享給他人！'), true);
assert.equal(configuratorHtml.includes('class="desktop-next-steps"'), true);
assert.equal(configuratorHtml.includes('class="mobile-next-steps"'), true);
assert.match(
  configuratorHtml,
  /<ol class="desktop-next-steps">\s*<li><button[^>]*id="copy-setup-code-step"[^>]*>複製設定碼<\/button><\/li>\s*<li>登入/,
  '電腦版後續指引應以可點擊的「複製設定碼」作為第一步，原三步依序後移'
);
assert.equal(configuratorHtml.includes('在電腦上收信，依照信中指引完成後續操作'), true);
assert.equal(
  configuratorAppSource.includes("elements.copyCodeStep?.addEventListener('click', copyGeneratedCode)"),
  true,
  '第一步複製按鈕應直接沿用現有的設定碼複製流程'
);
assert.equal(
  configuratorAppSource.includes("elements.copyCodeStep.textContent = '再次複製設定碼'"),
  false,
  '步驟一完成複製後仍應保持「複製設定碼」，不得改寫步驟文字'
);
assert.match(
  configuratorStylesSource,
  /\.control-panel-card \.desktop-step-copy-button,[\s\S]*?border: 0;[\s\S]*?text-decoration: underline;[\s\S]*?text-underline-offset: 0\.12em;/,
  '第五步 inline action 應使用文字底線，不得以 border-bottom 假裝底線'
);
assert.match(
  configuratorAppSource,
  /function updateGeneratedCodeAvailability\(sourceReady\)[\s\S]*?elements\.copyCodeStep\.disabled = !enabled;/,
  '後續指引的複製按鈕應與主要複製按鈕共用可用狀態'
);
assert.equal(setupDialogHtml.includes('貼上「行程同步設定碼」'), true);
assert.equal(setupDialogHtml.includes('placeholder="貼在這邊"'), true);
assert.equal(setupDialogHtml.includes('id="open-control-panel"'), true);
assert.match(
  setupDialogHtml,
  /textarea\s*\{[^}]*\bresize:none;/,
  '設定碼輸入框不得顯示可拖曳調整尺寸的把手'
);
assert.equal(setupDialogHtml.includes('請隨後在控制臺檢查設定，並完成首次同步'), true);
assert.equal(
  setupDialogHtml.includes('有時課表來源載入較慢，請耐心等待 1 分鐘'),
  true
);
assert.equal(setupDialogHtml.includes("busy ? '正在匯入設定…' : '開啟控制臺'"), true);
assert.equal(setupDialogHtml.includes('id="account-warning" role="alert" tabindex="-1" hidden'), true);
assert.equal(setupDialogHtml.includes('確認匯入內容'), false);
assert.equal(setupDialogHtml.includes('課表內容曾經變動'), false);
assert.equal(setupDialogHtml.includes('id="preview-step"'), false);
assert.match(
  setupDialogHtml,
  /importSetupCodeFromUi[\s\S]*?setTimeout\(function \(\) \{[\s\S]*?showSettingsSidebar\(\)[\s\S]*?\}, 800\)/,
  '匯入設定後應延後開啟側欄，避免立即撞上尚未釋放的 Script Lock'
);
assert.equal(
  setupDialogHtml.includes("'用錯 Google 帳號了喔，請改成設定時填寫的 ' + email"),
  true,
  'Google 帳號不符警告應使用指定文案與設定碼中的 Email'
);
assert.equal(configuratorStylesSource.includes('.notification-grid #field-notification-email'), true);
assert.equal(configuratorStylesSource.includes('grid-column: 1 / -1'), true);
assert.equal(configuratorHtml.includes('class="instant-notification-track"'), true);
assert.equal(configuratorHtml.includes('class="instant-notification-copy"'), true);
assert.equal(configuratorStylesSource.includes('width: 44px;'), true);
assert.equal(
  configuratorAppSource.includes(`'${googleDocsTemplateCopyUrl}'`),
  true,
  '網站應使用正式 Google Docs 母版 /copy URL'
);
assert.match(
  configuratorAppSource,
  /function shouldOfferEmailSetupTransfer\(\)[\s\S]*?userAgentData\?\.mobile[\s\S]*?pointer: coarse/,
  '手機與只有粗指標的裝置應改以寄送設定信為主要動作'
);
assert.equal(configuratorAppSource.includes("? '寄送設定信 ↵'"), true);
assert.equal(
  configuratorAppSource.includes("const SETUP_CODE_EMAIL_SUBJECT = '設定指引｜T-SCHOOL Schedule Sync';"),
  true
);
assert.match(
  configuratorAppSource,
  /function buildSetupCodeMailtoUrl\(\)[\s\S]*?mailto:[\s\S]*?SETUP_CODE_EMAIL_SUBJECT[\s\S]*?buildSetupCodeTransferText/,
  '寄送設定信應預填收件者、主旨、操作指引、母版連結與設定碼'
);
assert.match(
  configuratorAppSource,
  /if \(mailtoUrl\.length > MAX_MAILTO_URL_LENGTH\) \{[\s\S]*?shareLongSetupCode/,
  '設定碼過長時不得強行塞入 mailto URL'
);
assert.equal(
  configuratorAppSource.includes('請在「電腦」上完成以下步驟：'),
  true
);
assert.equal(configuratorAppSource.includes('1. 完整複製設定碼：'), true);
assert.equal(
  configuratorAppSource.includes('2. 用 ${recipient} 開啟行程同步控制臺母版，並建立副本：'),
  true
);
assert.equal(configuratorAppSource.includes('3. 依畫面指引完成設定！'), true);
assert.equal(
  configuratorAppSource.includes('＊設定碼包含你在網站填寫的資訊，請勿隨意分享給他人！'),
  true
);
assert.equal(
  configuratorAppSource.includes("elements.outputStep.dataset.transferMode = state.emailSetupTransferEnabled"),
  true,
  '手機與桌機第五步應由同一裝置判定切換寄信或複製版面'
);
const kineticCursorSource = configuratorAppSource.slice(
  configuratorAppSource.indexOf('function initKineticCursor()'),
  configuratorAppSource.indexOf('function prefersReducedMotion()')
);
assert.equal(kineticCursorSource.includes('Math.atan2'), false);
assert.equal(kineticCursorSource.includes('cursorSwayMaxAngle'), true);
assert.equal(kineticCursorSource.includes('targetAngle *= MOTION_CONFIG.cursorSwayReturn'), true);
assert.equal(kineticCursorSource.includes('cursorBaseAngle + currentAngle'), true);

assert.equal(sidebarIdSet.size, sidebarIds.length, 'Google Docs 控制臺不應出現重複 id');
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
assert.equal(sidebarHtml.includes('請勿現在關閉控制臺！'), true);
assert.equal(sidebarHtml.includes('側欄'), false, '控制臺內的使用者提示不應再稱為側欄');
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
assert.equal(
  sidebarHtml.includes('--body: "Noto Sans TC Variable", "Noto Sans TC", sans-serif;'),
  true,
  '控制臺應與網站共用 Noto Sans TC 字體設定'
);
assert.equal(sidebarHtml.includes('font-family: ui-monospace'), false);
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
assert.equal(sidebarHtml.includes('var lastSyncProgressPercent = 0;'), true);
assert.equal(
  sidebarHtml.includes('var value = Math.max(lastSyncProgressPercent, reportedValue);'),
  true,
  '同一同步工作顯示過的百分比不得因後端輪詢尚未建立進度而倒退'
);
assert.equal(sidebarHtml.includes('@media (max-width: 340px)'), true);
assert.equal(sidebarHtml.includes('@media (prefers-reduced-motion: reduce)'), true);
assert.equal(
  sidebarHtml.includes('<p class="eyebrow">T-SCHOOL Schedule Sync</p>'),
  true
);
assert.equal(sidebarHtml.includes("byId('app-version')"), false);
assert.equal(sidebarHtml.includes('<p class="eyebrow">T-SCHOOL 行程同步</p>'), false);
assert.equal(sidebarHtml.includes('grid-template-areas:'), true);
assert.equal(
  sidebarHtml.includes('data-state="attention" role="status" aria-live="polite">待首次同步</p>'),
  true
);
['待首次同步', '需檢查狀態', '待重新選課', '狀態正常'].forEach(statusLabel => {
  assert.equal(sidebarHtml.includes(statusLabel), true);
});
assert.equal(sidebarHtml.includes('同步功能正常'), false);
assert.equal(sidebarHtml.includes("? '同步正常'"), false);
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
assert.equal(
  sidebarHtml.includes('.field > span { color: var(--ink);'),
  true,
  '控制臺同層級欄位標題應使用近 #14211d 的系統深色'
);
assert.equal(sidebarHtml.includes('id="notify-hours-list"'), true);
assert.equal(sidebarHtml.includes('id="instant-notifications"'), true);
assert.equal(sidebarHtml.includes('偵測到行程調整就盡快通知'), true);
assert.equal(sidebarHtml.includes('data-add-notify-hour'), true);
assert.equal(sidebarHtml.includes('data-remove-notify-hour'), true);
assert.equal(sidebarHtml.includes('notificationHours: notificationHours'), true);
assert.equal(sidebarHtml.includes('notifySyncHour: Math.max.apply(null, notificationHours)'), true);
assert.equal(
  sidebarHtml.indexOf('id="instant-notifications"') <
    sidebarHtml.indexOf('id="notify-hours-list"') &&
    sidebarHtml.indexOf('id="notify-hours-list"') < sidebarHtml.indexOf('id="email"'),
  true,
  '控制臺通知區段應依序顯示即時通知、通知時間與 Email'
);
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
assert.equal(configuratorHtml.includes('id="high-load-test-banner"'), false);
[
  ['1', '選年級'],
  ['2', '選課程和活動'],
  ['3', '設定通知偏好'],
  ['4', '檢查設定'],
  ['5', '變出控制臺']
].forEach(([step, title]) => {
  assert.match(
    configuratorHtml,
    new RegExp('data-step-target="' + step + '"><span>0' + step + '</span>' + title),
    '步驟選單名稱必須與第 ' + step + ' 張卡片標題相同'
  );
});
assert.equal(
  configuratorHtml.includes('cloudflareinsights.com'),
  false,
  '暫停瀏覽統計時不得放行或載入 Cloudflare Analytics'
);
assert.equal(
  configuratorHtml.includes('privacy.html'),
  false,
  '暫停瀏覽統計時首頁不得保留相關連結'
);
assert.equal(
  fs.existsSync(path.join(root, 'analytics.js')) || fs.existsSync(path.join(root, 'privacy.html')),
  false,
  '暫停瀏覽統計時不得保留未使用的統計程式與公開頁面'
);
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
  /id="setup-code"[^>]*\sdata-lenis-prevent(?:\s|>)/,
  '設定碼預覽沒有內嵌捲動，不得繞過頁面的 Lenis 捲動'
);
assert.match(
  configuratorAppSource,
  /function copyGeneratedCodeWithLegacyFallback\(\)[\s\S]*?codeField\.select\(\)[\s\S]*?document\.execCommand\('copy'\)[\s\S]*?finally \{[\s\S]*?codeField\.setSelectionRange\(0, 0\)[\s\S]*?previousActiveElement\.focus\(\{ preventScroll: true \}\)/,
  '舊式複製備援應在同一輪操作內清除全選狀態並恢復焦點'
);
assert.match(
  configuratorAppSource,
  /catch \(error\) \{\s*copyGeneratedCodeWithLegacyFallback\(\);\s*\}/,
  'Clipboard API 失敗時才使用不留下選取狀態的舊式複製備援'
);
assert.match(
  configuratorHtml,
  /<textarea id="setup-code"[^>]*\sreadonly(?:\s|>)/,
  '設定碼預覽應維持唯讀並允許使用者選取文字'
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
assert.equal(configuratorAppSource.includes('ENABLE_HIGH_LOAD_TEST_FEATURE'), false);
assert.equal(emailTemplateManifest.schemaVersion, 1);
assert.deepEqual(
  Object.keys(emailTemplateManifest.notifications).sort(),
  [
    'action_required',
    'course_outline_failure',
    'course_outline_index_changed',
    'new_schedule_items',
    'schedule_changes',
    'setup_complete',
    'sync_failure',
    'sync_stopped',
    'sync_success',
    'term_transition'
  ],
  '所有通知都應只有一套標準 HTML 版型'
);
assert.equal(
  emailTemplateManifest.notifications.setup_complete.statusLabel,
  '狀態正常'
);
assert.equal(
  emailTemplateManifest.notifications.setup_complete.headline,
  '行程同步設定完成'
);
assert.equal(
  emailTemplateManifest.notifications.setup_complete.lede,
  '第一批事件同步完成！如果行程較多，系統會在背景分批繼續同步\n' +
    '後續則會根據你的設定自動更新事件'
);
assert.equal(emailTemplateManifest.notifications.setup_started, undefined);
assert.equal(
  emailTemplateManifest.notifications.schedule_changes.headline,
  '有 {{changeCount}} 項行程調整'
);
assert.equal(
  emailTemplateManifest.notifications.schedule_changes.statusLabel,
  '需要注意'
);
assert.equal(emailTemplateManifest.notifications.schedule_changes.lede, '');
assert.equal(
  emailTemplateManifest.notifications.sync_success.statusLabel,
  '狀態正常'
);
assert.equal(
  emailTemplateManifest.notifications.sync_success.headline,
  '行程同步狀態正常'
);
assert.equal(emailTemplateManifest.notifications.sync_success.lede, '');
assert.equal(
  emailTemplateManifest.notifications.sync_failure.headline,
  '行程同步失敗'
);
assert.equal(
  emailTemplateManifest.notifications.course_outline_failure.headline,
  '課綱更新失敗'
);
[
  'course_outline_failure',
  'term_transition',
  'new_schedule_items',
  'sync_stopped',
  'action_required'
].forEach(templateKind => {
  assert.equal(
    emailTemplateManifest.notifications[templateKind].statusLabel,
    '需要處理',
    `${templateKind} 應使用需要處理標籤`
  );
});
[
  'sync_failure',
  'course_outline_index_changed'
].forEach(templateKind => {
  assert.equal(
    emailTemplateManifest.notifications[templateKind].statusLabel,
    '需要注意',
    `${templateKind} 應使用需要注意標籤`
  );
});
assert.equal(
  emailTemplateManifest.notifications.term_transition.headline,
  '需要重新選課'
);
assert.equal(
  emailTemplateManifest.notifications.term_transition.lede,
  '已進入新學期，為避免把上學期的選課直接套到新學期，請重新選課'
);
assert.equal(
  emailTemplateManifest.notifications.sync_stopped.headline,
  '同步已暫停'
);
assert.equal(emailTemplateManifest.notifications.action_required.lede, '');
assert.equal(
  (emailTemplateManifestText.match(/>開啟行程同步控制臺<\/a>/g) || []).length,
  5
);
assert.equal(emailTemplateManifestText.includes('>開啟控制臺試算表</a>'), false);
assert.equal(emailTemplateManifestText.includes('>前往重新選課</a>'), false);
assert.equal(emailTemplateManifestText.includes('>檢查課程與活動</a>'), false);
assert.equal(/<(script|iframe)\b/i.test(emailTemplateManifestText), false);
assert.equal(emailTemplateManifestText.includes('。'), false);
assert.equal(/border-left\s*:/i.test(emailTemplateManifestText), false);
assert.equal(
  emailTemplateManifestText.includes('這封信由你的行程同步控制臺自動寄出'),
  true
);
assert.equal(emailTemplateManifestText.includes('課表異動'), false);
assert.equal(configuratorAppSource.includes('HIGH_LOAD_TEST_QUERY_PARAMETER'), false);
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
const focusEmailBeforeDomainSource = configuratorAppSource.slice(
  configuratorAppSource.indexOf('function focusEmailBeforeDomain()'),
  configuratorAppSource.indexOf('function setFieldState(')
);
assert.equal(
  focusEmailBeforeDomainSource.includes('focus({ preventScroll: true })'),
  false,
  '由下一步按鈕聚焦 Email 時應允許瀏覽器在鍵盤開啟前自動顯示欄位'
);
assert.equal(
  focusEmailBeforeDomainSource.includes('elements.notificationEmail.focus();'),
  true,
  '由下一步按鈕聚焦 Email 時應使用原生 focus 捲動'
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
  '一般設定更新不得即時重建輸出'
);
assert.equal(
  generateOutputSource.includes('window.TSchoolSetupCode.encode(getSettings())'),
  true,
  '設定碼應只由明確的產生動作建立'
);
assert.match(
  configuratorAppSource,
  /if \(completedStep === 4\) \{[\s\S]*?generateOutput\(\)[\s\S]*?scheduleGeneratedCodeTransition\(\)/,
  '第四步完成按鈕應先產生設定碼，再排程切換至第五步'
);
assert.equal(
  configuratorAppSource.includes('generatedCodeTransitionDelay: 48'),
  true,
  '產生設定碼後應保留短暫繪製間隔再啟動卡片切換'
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
  /\.summary-line \{[\s\S]*?gap: var\(--space-3\);[\s\S]*?\}/,
  '設定摘要的小標題與內容應沿用表單標題與互動元素的 12px 間距'
);
assert.match(
  configuratorStylesSource,
  /\.progressive-blur \{[\s\S]*?right: calc\(-1 \* var\(--fog-layer-bleed\)\);[\s\S]*?left: calc\(-1 \* var\(--fog-layer-bleed\)\);[\s\S]*?\}/,
  '預覽霧層容器應橫向超出區段邊界，避免卡片側邊出現斷層'
);
assert.match(
  configuratorStylesSource,
  /\.progressive-blur-layer \{[\s\S]*?inset: calc\(-1 \* var\(--fog-layer-bleed\)\);[\s\S]*?\}/,
  '每層 backdrop-filter 取樣面應向四側延伸，不得在左右邊緣被裁斷'
);
assert.match(
  configuratorStylesSource,
  /\.journey-step \{[\s\S]*?isolation: isolate;/,
  '每張流程卡應使用獨立 Backdrop Root，避免 Email 驗證重繪使相鄰預覽濾鏡失效'
);
assert.match(
  configuratorStylesSource,
  /\.field-state-border \{[\s\S]*?transform: translateZ\(0\);[\s\S]*?will-change: opacity;/,
  'Email 驗證外框應預先保留在固定合成層，只切換透明度'
);
assert.equal(
  configuratorStylesSource.includes('.validated-field[data-field-state="valid"] input'),
  false,
  'Email 有效狀態不得重新繪製 input border'
);
assert.equal(
  configuratorAppSource.includes('hintElement.textContent = hint'),
  false,
  'Email 驗證狀態不得替換可見提示文字'
);
assert.match(
  configuratorStylesSource,
  /#step-5 \{[\s\S]*?--preview-fog-start-opacity: 0\.002;[\s\S]*?--preview-fog-end-opacity: 0\.07;[\s\S]*?--preview-fog-layer-opacity: 0\.006;[\s\S]*?--section-reveal-start-opacity: 1;[\s\S]*?\}/,
  '第五張深色卡片應能獨立降低預覽霧層濃度並提高進場起始不透明度'
);
assert.match(
  configuratorStylesSource,
  /\.control-panel-card \.code-window::before \{[\s\S]*?backdrop-filter: blur\(6px\);[\s\S]*?-webkit-backdrop-filter: blur\(6px\);/,
  '設定碼表面應使用真正的 backdrop blur 遮罩，不得只降低文字透明度'
);
assert.match(
  configuratorStylesSource,
  /#step-5\[data-transfer-mode="email"\] \.desktop-next-steps \{[\s\S]*?display: none;[\s\S]*?#step-5\[data-transfer-mode="email"\] \.mobile-next-steps \{[\s\S]*?display: block;/,
  '寄信模式只應顯示手機後續指引，不得顯示桌機母版連結'
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
  configuratorAppSource.includes('homeEntryHeroTimeRatio: 2 / 3'),
  true,
  '首頁開始設定捲動應讓 Hero 動畫約占總時間三分之二'
);
assert.match(
  configuratorAppSource,
  /function runHomeEntryVirtualScroll\([\s\S]*?heroProgress = elapsedMs \/ heroDurationMs[\s\S]*?cardProgress = \(elapsedMs - heroDurationMs\)[\s\S]*?programmatic: false,[\s\S]*?lerp: homeEntryLerp/,
  '首頁開始設定應以兩段線性虛擬目標推動 Lenis，可視平滑僅由 lerp 處理'
);
assert.equal(
  configuratorAppSource.includes('createHomeEntryScrollEasing'),
  false,
  '首頁按鈕不得再以位置 easing 主動減速'
);
assert.match(
  configuratorAppSource,
  /function enterFirstStepWithPageScroll\(\)[\s\S]*?heroAnimationEndTarget[\s\S]*?runHomeEntryVirtualScroll\(\{[\s\S]*?heroAnimationEndTarget,[\s\S]*?scrollTarget/,
  '首頁開始設定應以 Hero 動畫完成位置作為兩段勻速目標的距離分界'
);
assert.match(
  configuratorAppSource,
  /virtualScroll: payload => \{[\s\S]*?tschoolCancelHomeEntryScroll\?\.\(\{ resetMomentum: true \}\)/,
  '使用者主動捲動時應取消首頁按鈕的虛擬捲動並交還控制權'
);
assert.match(
  configuratorHtml,
  /class="hero-paper-track">[\s\S]*?class="hero-depth-scene">[\s\S]*?class="hero-progressive-fog"/,
  'Hero 紙張與行程卡應位於 3D 場景，模糊層則維持為場景外的上層兄弟節點'
);
assert.match(
  configuratorStylesSource,
  /--hero-fog-vertical-mask:\s*linear-gradient\([\s\S]*?#000 calc\(100% - var\(--hero-fog-vertical-bleed\) - 48px\),[\s\S]*?transparent calc\(100% - var\(--hero-fog-vertical-bleed\) \+ 16px\),[\s\S]*?transparent 100%/,
  'Hero 模糊層底部應在視覺區邊緣淡出，不得跨越 Hero 與設定區的背景交界'
);
assert.match(
  configuratorHtml,
  /data-initial-label="實體課 \[吉林基地\]" data-final-label="實體課 \[吉林基地-協作坊\]"[\s\S]*?data-initial-label="線上課 \[線上教室\]" data-final-label="線上課 \[線上教室\]"[\s\S]*?data-initial-label="活動 \[弘道基地\]" data-final-label="活動 \[弘道基地-未來教室\]"/,
  'Hero 三張行程卡應分別保留課表起點與日曆終點文案'
);
assert.match(
  configuratorHtml,
  /<span>課程規劃表<\/span>[\s\S]*?data-hero-schedule-week[\s\S]*?data-hero-calendar-month[\s\S]*?data-hero-calendar-day/,
  'Hero 兩張紙張應保留可依瀏覽日期更新的學期週次、月份與星期日期'
);
assert.equal(
  configuratorHtml.includes('path-tick'),
  false,
  'Hero 紙張連接線不得保留刻度'
);
assert.match(
  configuratorAppSource,
  /KNOWN_ACADEMIC_TERM_STARTS[\s\S]*?'114-2'[\s\S]*?2026[\s\S]*?23[\s\S]*?'115-1'[\s\S]*?2026[\s\S]*?31[\s\S]*?'115-2'[\s\S]*?2027[\s\S]*?11/,
  'Hero 應保留 114-2、115-1、115-2 的已知開學日作為立即顯示的週次 fallback'
);
assert.match(
  configuratorAppSource,
  /function initHeroMetadata\(\)[\s\S]*?renderWeekNumber\(getKnownAcademicTermStart\(now\)\)[\s\S]*?fetchGradeSchedule\('高一'\)[\s\S]*?renderWeekNumber\(summary\.firstDate\)/,
  'Hero 應先用已知開學日計算週次，再由正式課表起日更新'
);
assert.equal(
  /data-hero-schedule-week>第\s*[…⋯–-]/.test(configuratorHtml),
  false,
  'Hero 課表週次不得在正式來源完成前顯示省略號或破折號'
);
assert.match(
  configuratorAppSource,
  /function getPaperEdgePoint\(metrics, side, anchorRatio, translateX, rotationDegrees\)[\s\S]*?function positionTransferPath\(scheduleMetrics, calendarMetrics, paperMotion\)[\s\S]*?scheduleConnectorAnchor[\s\S]*?calendarConnectorAnchor[\s\S]*?Math\.atan2\(distanceY, distanceX\)/,
  'Hero 連接線應固定於兩張紙的指定邊線點，並隨紙張位移及旋轉重算'
);
assert.match(
  configuratorStylesSource,
  /--hero-paper-plane-depth:\s*0px;[\s\S]*?--hero-schedule-depth:\s*var\(--hero-paper-plane-depth\);[\s\S]*?--hero-calendar-depth:\s*var\(--hero-paper-plane-depth\);[\s\S]*?--hero-path-depth:\s*var\(--hero-paper-plane-depth\);/,
  'Hero 紙張與連接線應位於同一 3D 平面'
);
assert.match(
  configuratorStylesSource,
  /\.hero-paper-track \.visual-board \{\s*z-index:\s*2;[\s\S]*?\.hero-paper-track \.transfer-path \{\s*z-index:\s*1;/,
  'Hero 紙張應以堆疊順序覆蓋連接線端部'
);
assert.match(
  configuratorAppSource,
  /const HERO_PAPER_MOTION_CONFIG = Object\.freeze\(\{[\s\S]*?desktopSeparationPerPaper:[\s\S]*?scheduleRotationDelta:[\s\S]*?calendarRotationDelta:/,
  'Hero 紙張分離、旋轉與連接點應集中提供調整參數'
);
assert.match(
  configuratorAppSource,
  /function getPaperMotion\(progress\)[\s\S]*?localProgress \* localProgress \* localProgress[\s\S]*?function applyPaperMotion\(paperMotion\)[\s\S]*?positionTransferPath\(layout\.scheduleMetrics, layout\.calendarMetrics, paperMotion\)/,
  'Hero 紙張分離應使用平滑起訖曲線，且連接線逐幀跟隨紙張'
);
assert.equal(
  configuratorAppSource.includes('heroScrambleInterval: 72'),
  true,
  'Hero 行程卡移動期間應以受控頻率更新動態亂碼'
);
assert.match(
  configuratorHtml,
  /id="stage-menu-trigger" aria-label="開啟步驟選單"[\s\S]*?data-cursor-label="開啟步驟選單"/,
  '步驟選單按鈕初始的輔助標籤與游標標籤應使用一致文案'
);
assert.match(
  configuratorAppSource,
  /const actionLabel = open \? '關閉步驟選單' : '開啟步驟選單';[\s\S]*?tschool:cursor-context-change/,
  '步驟選單切換時應同步更新游標標籤'
);
assert.equal(
  configuratorStylesSource.includes('.stage-menu-trigger:hover,'),
  false,
  '步驟選單按鈕 hover 不得顯示綠色外框或底色'
);
assert.match(
  configuratorAppSource,
  /function positionCursorCaption\(\)[\s\S]*?window\.innerWidth - captionWidth - captionViewportMargin[\s\S]*?window\.innerHeight - captionHeight - captionViewportMargin/,
  '動態游標標籤應限制在目前 viewport 範圍內'
);
assert.equal(
  configuratorAppSource.includes('heroTileArrivalScrambleDuration: 400'),
  true,
  'Hero 行程卡完整抵達紙張後應再維持 400ms 動態亂碼'
);
assert.equal(
  configuratorAppSource.includes('function tileIsFullyInsideBoard('),
  true,
  'Hero 行程卡應以完整進入起點或終點紙張作為抵達判定'
);
assert.match(
  configuratorAppSource,
  /settleTileAfterArrival\(tile, index, 'final'\)[\s\S]*?settleTileAfterArrival\(tile, index, 'initial'\)/,
  'Hero 去程與回程應共用一致的抵達延遲'
);
assert.match(
  configuratorStylesSource,
  /--hero-scroll-length-desktop:\s*400svh;[\s\S]*?--hero-scroll-length-mobile:\s*205dvh;/,
  'Hero 桌機與手機捲動行程應由集中參數控制'
);
assert.equal(
  configuratorAppSource.includes('function initHeroDepthInteraction()'),
  true,
  'Hero 應提供獨立的精細游標 3D 跟手互動'
);
assert.match(
  configuratorAppSource,
  /const desktopTileEndTopRatios = \[0\.22, 0\.47, 0\.72\];[\s\S]*?y: originalEndTop - tile\.offsetTop/,
  'Hero 行程卡上調起點時應補償桌機 Y 軸行程，維持原本終點高度'
);
assert.match(
  configuratorAppSource,
  /function getRowCenteredTileTop\([\s\S]*?const startTop = getRowCenteredTileTop\(scheduleMetrics[\s\S]*?const endTop = getRowCenteredTileTop\(calendarMetrics[\s\S]*?y: endTop - startTop/,
  '手機 Hero 行程卡的起點與終點應依兩張紙張的實際列中央計算'
);
assert.equal(
  configuratorAppSource.includes('heroMobileTileArc: -12'),
  true,
  '手機 Hero 行程卡應保留小幅曲線，不得恢復完全水平軌跡'
);
assert.equal(
  (
    configuratorAppSource.match(
      /rootMargin: MOTION_CONFIG\.heroRenderRootMargin/g
    ) || []
  ).length,
  2,
  'Hero 捲動與 3D 跟手都應在同一離屏距離停止運算'
);
assert.equal(
  (
    configuratorAppSource.match(/cancelAnimationFrame\(frameId\)/g) || []
  ).length >= 2,
  true,
  'Hero 離屏時應取消尚未執行的動畫幀'
);
assert.match(
  configuratorStylesSource,
  /\.hero-depth-scene \{[\s\S]*?perspective\(var\(--hero-depth-perspective\)\)[\s\S]*?transform-style: preserve-3d;/,
  'Hero 3D 場景應保留可調整的透視與子圖層深度'
);
assert.match(
  configuratorStylesSource,
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.hero-depth-scene \{[\s\S]*?--hero-pointer-rotate-x: 0deg !important;/,
  'reduced-motion 應停用 Hero 游標轉動'
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
assert.equal(
  configuratorAppSource.includes('window.innerHeight - height - offsetTop'),
  false,
  '鍵盤高度不得扣除會隨 caret 移動的 visualViewport.offsetTop'
);
assert.match(
  configuratorAppSource,
  /const keyboardHeight = Math\.max\(0, window\.innerHeight - height\);/,
  '鍵盤狀態應只由 layout viewport 與 visual viewport 的高度差判斷'
);
assert.equal(
  configuratorAppSource.includes("window.visualViewport?.addEventListener('scroll', requestUpdate"),
  false,
  'caret 造成的 visualViewport scroll 不得啟動第二套頁面捲動控制'
);
assert.match(
  configuratorAppSource,
  /function nativeViewportManagesEditingScroll[\s\S]*?if \(nativeViewportManagesEditingScroll\(metrics\)\) \{[\s\S]*?extendEditingBoundaryToCurrentScroll\(\);[\s\S]*?return;/,
  '手機鍵盤開啟時應只放寬目前步驟邊界，並交由瀏覽器維持 caret 可見'
);
assert.match(
  configuratorAppSource,
  /if \(editingControl && window\.visualViewport\) \{[\s\S]*?requestUpdate\(\{ preserveActiveStep: true \}\);[\s\S]*?return;/,
  '輸入期間的 window.resize 不得繞過 visual viewport 的合併處理再校正一次'
);
assert.match(
  configuratorAppSource,
  /if \(heightChanged \|\| widthChanged \|\| keyboardStateChanged\) \{[\s\S]*?scheduleFocusedControlVisibility\(\{ afterViewportSettles: true \}\);/,
  'Safari offset-only visual viewport 位移不得反覆觸發頁面捲動校正'
);
assert.match(
  configuratorStylesSource,
  /html\[data-input-active\] \{[\s\S]*?overflow-anchor: none;/,
  '輸入期間應停用 scroll anchoring，避免搜尋結果重建讓頁面跳動'
);
assert.match(
  configuratorStylesSource,
  /html\[data-input-active\] \{[\s\S]*?scroll-padding-bottom: var\(--space-4\);/,
  '輸入期間的 root scroll padding 不得重複加入鍵盤高度'
);
assert.match(
  configuratorStylesSource,
  /\.hero-stage\.is-rendering-paused \.hero-visual \{\s*visibility: hidden;/,
  'Hero 離屏時應停止整個視覺場景的繪製'
);
assert.match(
  configuratorAppSource,
  /const toast = document\.getElementById\('toast'\);[\s\S]*?\(toast \|\| document\.documentElement\)\.style\.setProperty\(\s*'--keyboard-inset'/,
  '鍵盤 inset 應只更新實際使用它的 toast，不得讓整份文件重新計算繼承樣式'
);
assert.match(
  configuratorAppSource,
  /function setFieldState\(field, stateValue\)[\s\S]*?if \(previousState === nextState\) \{\s*return;/,
  'Email 有效性未跨狀態時不得重寫 DOM 與 ARIA 屬性'
);
const courseSelectionChangeSource = configuratorAppSource.slice(
  configuratorAppSource.indexOf('function handleCourseSelectionChange(event)'),
  configuratorAppSource.indexOf('function renderCourses()')
);
assert.equal(
  courseSelectionChangeSource.includes('renderCourses()'),
  false,
  '勾選單一課程或活動時不得重建整份課程清單'
);
assert.equal(
  courseSelectionChangeSource.includes('renderSelectionCounts()'),
  true,
  '清單不重建時仍應原地更新選取統計'
);
assert.equal(configuratorHtml.includes('TSCHOOL_GENERATION_ASSETS_READY'), false);
assert.equal(configuratorHtml.includes("'setup-code.js'"), true);
assert.equal(configuratorHtml.includes("'sidebar-template.js'"), false);
assert.equal(configuratorHtml.includes("'code-template.js'"), false);
assert.equal(
  configuratorHtml.includes('assets.reduce(function'),
  false,
  '啟動資產不得逐一串行下載'
);
assert.match(configuratorAppSource, /async function generateOutput\(\)[\s\S]*?TSchoolSetupCode\.encode/);
const codeMaskStyles = configuratorStylesSource.match(
  /\.control-panel-card \.code-window::after \{([\s\S]*?)\n\}/
)?.[1] || '';
assert.equal(codeMaskStyles.includes('linear-gradient('), true);
assert.equal(
  /backdrop-filter|mask-image/.test(codeMaskStyles),
  false,
  '程式碼預覽遮罩應只使用黑色透明度漸層，不得恢復模糊或 mask 濾鏡'
);

function makeCatalogPayload(weekNumbers, entriesByWeek, rowSpan = 6) {
  const rows = weekNumbers.map((weekNumber, index) => ({
    isHeader: false,
    weekNum: String(weekNumber),
    cells: [{
      value: entriesByWeek[index] || '',
      day: 1,
      period: 1,
      rowSpan
    }]
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
assert.equal(
  scheduleData.MIN_COURSE_SCHEDULED_PERIODS,
  5,
  '無活動關鍵字項目的節數邊界應設定為 5 節'
);
const lowPeriodCatalog = scheduleData.extractCatalog(makeCatalogPayload(
  [1],
  ['沒有活動關鍵字的單次講座'],
  4
));
assert.deepEqual(
  lowPeriodCatalog.activities.map(item => item.title),
  ['沒有活動關鍵字的單次講座'],
  '沒有活動關鍵字但全期少於 5 節的項目仍應判定為活動'
);
const boundaryPeriodCatalog = scheduleData.extractCatalog(makeCatalogPayload(
  [1],
  ['五節正式課程'],
  5
));
assert.deepEqual(
  boundaryPeriodCatalog.courses.map(item => item.title),
  ['五節正式課程'],
  '剛好 5 節的正式課程不得被節數邊界誤判為活動'
);

const roundTripSetupCode = setupCode.encode({
  appVersion: '2.0.0-rc.1',
  gradeName: '高二',
  termKey: '二年級|2026-02-23',
  sourceFingerprint: '來源-😀-指紋',
  setupSourceSnapshot: {
    firstDateKey: '2026-02-23',
    lastDateKey: '2026-08-30',
    sourceUpdatedLabel: '更新時間\n08011200',
    items: [
      { title: '公民／社會探究', type: 'course', period: 'term' },
      { title: '全校活動（上午）', type: 'activity', period: 'term' }
    ]
  },
  selectedCourses: ['從巴士底到車諾比：歷史', '公民／社會探究', '程式設計 & AI'],
  includeActivities: true,
  excludedActivities: ['全校活動（上午）'],
  notificationEmail: 'student+sync@example.com',
  instantNotificationsEnabled: false,
  notificationHours: [22, 6, 12, 18]
}, { createdAt: '2026-08-01T00:00:00.000Z' });
const decodedSetupCode = setupCode.decode(roundTripSetupCode);
assert.equal(roundTripSetupCode.startsWith('TSCHOOL_SETUP_V1.'), true);
assert.deepEqual(decodedSetupCode, {
  schemaVersion: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  generatorVersion: '2.0.0-rc.1',
  gradeName: '高二',
  termKey: '二年級|2026-02-23',
  sourceFingerprint: '來源-😀-指紋',
  selectedCourses: ['從巴士底到車諾比：歷史', '公民／社會探究', '程式設計 & AI'],
  includeActivities: true,
  excludedActivities: ['全校活動（上午）'],
  notificationEmail: 'student+sync@example.com',
  instantNotificationsEnabled: false,
  notificationHours: [6, 12, 18, 22],
  sourceSnapshot: {
    firstDateKey: '2026-02-23',
    lastDateKey: '2026-08-30',
    sourceUpdatedLabel: '更新時間\n08011200',
    items: [
      { title: '公民／社會探究', type: 'course', period: 'term' },
      { title: '全校活動（上午）', type: 'activity', period: 'term' }
    ]
  }
});
assert.throws(() => setupCode.decode(''), /請貼上設定碼/);
assert.throws(() => setupCode.decode('WRONG.abc.123'), /不是可用/);
assert.throws(() => setupCode.decode(roundTripSetupCode.slice(0, -1) + 'x'), /不完整/);
assert.throws(() => setupCode.decode('x'.repeat(setupCode.MAX_CODE_LENGTH + 1)), /過長/);

const generatedCode = global.buildAppsScriptCode({
  appVersion: '2.0.0-rc.1',
  sourceApiUrl: scheduleData.API_URL,
  emailTemplateManifestUrl: immutableManifestUrl,
  gradeName: '高一',
  calendarName: 'T-SCHOOL 課表',
  notificationEmail: 'test@example.com',
  instantNotificationsEnabled: true,
  notificationHours: [5, 12, 18, 22],
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

assert.throws(
  () => global.buildAppsScriptCode({
    sourceApiUrl: 'https://script.googleusercontent.com/macros/echo?user_content_key=secret',
    emailTemplateManifestUrl: immutableManifestUrl
  }),
  /published Apps Script \/exec sourceApiUrl/,
  '通用程式不得保存重新導向後的 tokenized 課表網址'
);
assert.doesNotThrow(() => new Function(generatedCode));
assert.match(
  generatedCode,
  /^\/\*\*[\s\S]*?@OnlyCurrentDoc[\s\S]*?\*\//,
  '產生的 Code.gs 應將 Google Docs 權限限制在目前控制臺文件'
);
const appsScriptManifest = controlPanelGenerator.buildAppsScriptManifest();
assert.equal(controlPanelGenerator.parseArguments([]).appVersion, '2.0.0-rc.2');
assert.deepEqual(
  appsScriptManifest.oauthScopes.slice().sort(),
  expectedAppsScriptOAuthScopes.slice().sort(),
  'Apps Script manifest 必須精確維持目前功能所需的 8 項最小權限'
);
assert.equal(
  new Set(appsScriptManifest.oauthScopes).size,
  appsScriptManifest.oauthScopes.length,
  'Apps Script manifest 不得重複要求同一項權限'
);
const generatorTempDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'tschool-control-panel-generator-')
);
try {
  const generatedArtifactPath = path.join(generatorTempDirectory, 'Code.gs');
  const generatedManifestPath = path.join(generatorTempDirectory, 'appsscript.json');
  const generatorResult = childProcess.spawnSync(
    process.execPath,
    [
      path.join(root, 'scripts', 'generate-google-docs-control-panel.js'),
      '--manifest-url',
      immutableManifestUrl,
      '--output',
      generatedArtifactPath
    ],
    { cwd: root, encoding: 'utf8' }
  );
  assert.equal(
    generatorResult.status,
    0,
    '正式產生器應成功輸出 Code.gs 與 appsscript.json：' + generatorResult.stderr
  );
  assert.equal(fs.existsSync(generatedArtifactPath), true);
  assert.equal(fs.existsSync(generatedManifestPath), true);
  const generatedArtifact = fs.readFileSync(generatedArtifactPath, 'utf8');
  const generatedManifest = JSON.parse(fs.readFileSync(generatedManifestPath, 'utf8'));
  assert.doesNotThrow(() => new Function(generatedArtifact));
  assert.match(generatedArtifact, /^\/\*\*[\s\S]*?@OnlyCurrentDoc[\s\S]*?\*\//);
  assert.equal(generatedArtifact.includes('const HIGH_LOAD_TEST_CONFIG_STORE'), false);
  assert.deepEqual(
    generatedManifest.oauthScopes.slice().sort(),
    expectedAppsScriptOAuthScopes.slice().sort(),
    '實際寫出的 appsscript.json 也必須維持精確權限集合'
  );
  assert.deepEqual(
    generatedManifest.dependencies,
    appsScriptManifest.dependencies,
    '實際寫出的 appsscript.json 必須啟用 Sheets v4 唯讀資料服務'
  );

  const missingManifestUrlResult = childProcess.spawnSync(
    process.execPath,
    [
      path.join(root, 'scripts', 'generate-google-docs-control-panel.js'),
      '--output',
      path.join(generatorTempDirectory, 'missing-url.gs')
    ],
    { cwd: root, encoding: 'utf8' }
  );
  assert.notEqual(missingManifestUrlResult.status, 0);
  assert.match(missingManifestUrlResult.stderr, /requires --manifest-url/);

  const mutableManifestUrlResult = childProcess.spawnSync(
    process.execPath,
    [
      path.join(root, 'scripts', 'generate-google-docs-control-panel.js'),
      '--manifest-url',
      'https://raw.githubusercontent.com/artemas-hsieh/t-school-schedule-sync/main/notification-email-templates.json',
      '--output',
      path.join(generatorTempDirectory, 'mutable-url.gs')
    ],
    { cwd: root, encoding: 'utf8' }
  );
  assert.notEqual(mutableManifestUrlResult.status, 0);
  assert.match(mutableManifestUrlResult.stderr, /immutable emailTemplateManifestUrl/);
} finally {
  fs.rmSync(generatorTempDirectory, { recursive: true, force: true });
}
assert.equal(
  generatedCode.includes('const APP_VERSION = "2.0.0-rc.1";'),
  true,
  '產生的 Code.gs 應標示目前的 2.0.0 release candidate 版本'
);
[
  'getSettingsUiData',
  'importSetupCodeFromUi',
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
assert.match(
  generatedCode,
  /function createDedicatedCalendarForUi\(input\)[\s\S]*?CalendarApp\.createCalendar\(calendarName, \{ selected: true \}\)/,
  '控制臺手動建立的專用 Calendar 應預設顯示'
);
assert.match(
  generatedCode,
  /function ensureDedicatedCalendar_\(settings\)[\s\S]*?CalendarApp\.createCalendar\(buildDedicatedCalendarName_\(settings\), \{\s*selected: true\s*\}\)/,
  '首次同步自動建立的專用 Calendar 應預設顯示'
);
assert.equal(generatedCode.includes('function previewSettingsImpactFromUi('), true);
assert.equal(generatedCode.includes('function showSettingsSidebar('), true);
assert.equal(generatedCode.includes('function showSetupImportDialog('), true);
assert.equal(generatedCode.includes('function previewSetupCodeForUi('), true);
assert.equal(generatedCode.includes('function activeGoogleAccountDoesNotMatch_('), true);
assert.equal(generatedCode.includes('function importSetupCodeFromUi('), true);
assert.equal(generatedCode.includes('function applySetupCodeFromUi('), true);
assert.match(
  generatedCode,
  /function showSettingsSidebar\(\) \{\s*ScriptApp\.requireAllScopes\(ScriptApp\.AuthMode\.FULL\);\s*const settings = loadSettings_\(\);/,
  '第一次開啟控制臺時必須先要求完整的既定 OAuth 權限，再讀取設定或顯示介面'
);
assert.equal(generatedCode.includes('lock.tryLock(3000)'), true);
const quickDeleteFunctionSource = generatedCode.slice(
  generatedCode.indexOf('function quickDeleteSyncedCalendarEvents()'),
  generatedCode.indexOf('function removeManagedEventsFromCalendar_(')
);
assert.match(quickDeleteFunctionSource, /LockService\.getScriptLock\(\)/);
assert.match(quickDeleteFunctionSource, /tryLock\(15000\)/);
assert.match(
  quickDeleteFunctionSource,
  /try \{[\s\S]*?isActiveSyncJob_\(loadSyncJob_\(\)\)[\s\S]*?removeManagedEventsFromCalendar_[\s\S]*?finally \{\s*lock\.releaseLock\(\)/,
  '移除事件的背景工作檢查與刪除必須位於同一把 Script Lock 內'
);
assert.equal(
  (quickDeleteFunctionSource.match(/clearChunkedStore_\(/g) || []).length,
  0,
  '快速移除不得在 removeManagedEventsFromCalendar_ 已清除狀態後重複清除'
);
const resetSyncStateFunctionSource = generatedCode.slice(
  generatedCode.indexOf('function resetSyncState()'),
  generatedCode.indexOf('function sendScheduledNotifications()')
);
assert.match(resetSyncStateFunctionSource, /LockService\.getScriptLock\(\)/);
assert.match(
  resetSyncStateFunctionSource,
  /try \{[\s\S]*?isActiveSyncJob_\(loadSyncJob_\(\)\)[\s\S]*?clearChunkedStore_\(SYNC_STATE_STORE\)[\s\S]*?finally \{\s*lock\.releaseLock\(\)/,
  '重設狀態的背景工作檢查與清除必須位於同一把 Script Lock 內'
);
assert.equal(generatedCode.includes(".setTitle('行程同步控制臺')"), true);
assert.equal(generatedCode.includes("showModalDialog(output, '匯入設定')"), true);
assert.match(
  generatedCode,
  /function showSettingsSidebar\(\)[\s\S]*?!settings\.setupComplete && !hasSetupSourceContext_\(settings\)/,
  '舊測試母版缺少初次載入快照時應回到匯入頁，不得再次卡在控制臺讀取'
);
assert.equal(generatedCode.includes('function loadCourseOutlineSourceIndexForUi_('), true);
assert.match(
  generatedCode,
  /function buildUiData_\([\s\S]*?loadCourseOutlineSourceIndexForUi_\(\)/,
  '控制臺初次顯示不得同步開啟中央課綱索引試算表'
);
assert.equal(generatedCode.includes('function isTransientInitialLoadError(error)'), true);
assert.match(
  generatedCode,
  /function loadInitialUi\(\)[\s\S]*?isTransientInitialLoadError\(error\)[\s\S]*?setTimeout\(loadInitialUi, INITIAL_LOAD_RETRY_DELAY_MS\)/,
  '控制臺初次讀取碰到暫時鎖定時應自動重試，不得停在空白畫面'
);
assert.equal(generatedCode.includes('function getControlPanelUi_('), true);
assert.equal(generatedCode.includes('function getControlPanelUrl_('), true);
assert.equal(generatedCode.includes('SpreadsheetApp.getUi('), false);
assert.equal(generatedCode.includes('SpreadsheetApp.getActiveSpreadsheet('), false);
assert.equal(generatedCode.includes('DocumentApp.getUi('), true);
assert.equal(generatedCode.includes('DocumentApp.getActiveDocument('), true);
assert.equal(generatedCode.includes('SpreadsheetApp.openById('), false);
assert.equal(generatedCode.includes('Sheets.Spreadsheets.get('), true);
assert.equal(generatedCode.includes('Sheets.Spreadsheets.Values.batchGet('), true);
[
  'DriveApp.',
  'GmailApp.',
  'Sheets.Spreadsheets.batchUpdate(',
  'Sheets.Spreadsheets.Values.append(',
  'Sheets.Spreadsheets.Values.batchUpdate(',
  'Sheets.Spreadsheets.Values.clear(',
  'Sheets.Spreadsheets.Values.update(',
  '.appendRow(',
  '.clearContent(',
  '.clearContents(',
  '.deleteSheet(',
  '.insertSheet(',
  '.setFormula(',
  '.setFormulas(',
  '.setValue(',
  '.setValues('
].forEach(forbiddenToken => {
  assert.equal(
    generatedCode.includes(forbiddenToken),
    false,
    '唯讀課綱程式不得出現未核准服務或試算表寫入 API：' + forbiddenToken
  );
});
assert.deepEqual(
  controlPanelGenerator.buildAppsScriptManifest().dependencies,
  {
    enabledAdvancedServices: [{
      userSymbol: 'Sheets',
      version: 'v4',
      serviceId: 'sheets'
    }]
  },
  '母版 manifest 應只啟用 Sheets v4 進階服務，以唯讀 API 取代 SpreadsheetApp.openById'
);
assert.equal(generatedCode.includes('test@example.com'), false);
assert.equal(generatedCode.includes('const HIGH_LOAD_TEST_CONFIG_STORE'), false);
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
  generatedCode.includes('const SCHEDULE_SYNC_HOURS = [3, 11, 18, 21];'),
  true,
  '產生的 Code.gs 應固定保存四個課表偵測與 Calendar 同步時段'
);
assert.equal(
  generatedCode.includes("function sendScheduledNotifications()"),
  true,
  '通知時間應有不執行課表同步的獨立入口'
);
assert.equal(
  generatedCode.includes("function sendScheduledNotificationsWithDailySummary()"),
  true,
  '最後一個通知時間應有獨立的每日成功摘要入口'
);
assert.equal(
  generatedCode.includes("function retryScheduledNotificationDelivery()"),
  true,
  '通知時間與背景同步重疊時應能延後重試，不得遺失待寄異動'
);
assert.equal(generatedCode.includes("ui.createMenu('高負載測試')"), false);
assert.equal(generatedCode.includes('function setupHighLoadTestEnvironment('), false);

const highLoadGeneratedCode = global.buildAppsScriptCode({
  appVersion: '2.0.0-rc.1',
  sourceApiUrl: scheduleData.API_URL,
  emailTemplateManifestUrl: immutableManifestUrl,
  gradeName: '高二',
  notificationEmail: 'test@example.com',
  notificationHours: [6],
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
assert.match(
  highLoadGeneratedCode,
  /const source = parseSchedulePayload_\(payload, cleanGrade, scheduleBusinessNow_\(\)\);/,
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
    },
    sleep() {},
    base64DecodeWebSafe(value) {
      return Array.from(Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
    },
    newBlob(bytes) {
      return {
        getDataAsString(encoding) {
          assert.equal(encoding, 'UTF-8');
          return Buffer.from(bytes).toString('utf8');
        }
      };
    }
  }
});

vm.runInContext(generatedCode, context);

function makeOwnedCalendarForListTest(id, name) {
  const calls = { getId: 0, getName: 0 };
  return {
    calls,
    getId() {
      calls.getId += 1;
      return id;
    },
    getName() {
      calls.getName += 1;
      return name;
    }
  };
}
const defaultCalendarForListTest = makeOwnedCalendarForListTest('default', '主要日曆');
const calendarBForListTest = makeOwnedCalendarForListTest('calendar-b', 'B 日曆');
const calendarAForListTest = makeOwnedCalendarForListTest('calendar-a', 'A 日曆');
context.CalendarApp = {
  getDefaultCalendar() {
    return defaultCalendarForListTest;
  },
  getAllOwnedCalendars() {
    return [
      defaultCalendarForListTest,
      calendarBForListTest,
      calendarAForListTest
    ];
  }
};
assert.deepEqual(
  JSON.parse(JSON.stringify(context.listOwnedCalendars_())),
  [
    { id: 'calendar-a', name: 'A 日曆' },
    { id: 'calendar-b', name: 'B 日曆' }
  ]
);
assert.equal(calendarAForListTest.calls.getId, 1);
assert.equal(calendarBForListTest.calls.getId, 1);
assert.equal(defaultCalendarForListTest.calls.getName, 0);
delete context.CalendarApp;
assert.throws(
  () => context.assertSheetsReadonlyServiceAvailable_(),
  /更新 appsscript\.json/,
  '母版漏裝 Sheets v4 進階服務時應顯示可操作的修正方式'
);

let scheduleFetchStatus = 200;
let scheduleFetchBody = JSON.stringify(vacationCatalogPayload);
let scheduleFetchCallCount = 0;
context.UrlFetchApp = {
  fetch(url, options) {
    scheduleFetchCallCount += 1;
    assert.equal(
      url,
      scheduleData.API_URL + '?grade=' + encodeURIComponent('一年級'),
      'Apps Script 應只向正式課表端點要求指定年級'
    );
    assert.equal(options.followRedirects, true);
    assert.equal(options.muteHttpExceptions, true);
    const responseStatus = Array.isArray(scheduleFetchStatus)
      ? scheduleFetchStatus.shift()
      : scheduleFetchStatus;
    return {
      getResponseCode() {
        return responseStatus;
      },
      getContentText(encoding) {
        assert.equal(encoding, 'UTF-8');
        return scheduleFetchBody;
      }
    };
  }
};
assert.equal(context.fetchSchedulePayload_('高一').currentGrade, '一年級');
assert.equal(scheduleFetchCallCount, 1);
scheduleFetchStatus = [302, 404, 200];
assert.equal(
  context.fetchSchedulePayload_('高一').currentGrade,
  '一年級',
  '正式 /exec 短暫回傳 302 或 404 時應重新要求同一正式網址'
);
assert.equal(scheduleFetchCallCount, 4);
scheduleFetchStatus = 503;
assert.throws(() => context.fetchSchedulePayload_('高一'), /HTTP 503/);
assert.equal(scheduleFetchCallCount, 7, '暫時性 5xx 應有界重試三次');
scheduleFetchStatus = 200;
scheduleFetchBody = '{not-json';
assert.throws(() => context.fetchSchedulePayload_('高一'), /不是有效的 JSON/);
scheduleFetchBody = JSON.stringify(Object.assign({}, vacationCatalogPayload, {
  currentGrade: '二年級'
}));
assert.throws(() => context.fetchSchedulePayload_('高一'), /錯誤的年級/);

const originalFetchSchedulePayload = context.fetchSchedulePayload_;
const originalParseSchedulePayload = context.parseSchedulePayload_;
let executionLocalSourceFetches = 0;
let executionLocalSourceParses = 0;
context.fetchSchedulePayload_ = gradeName => {
  executionLocalSourceFetches += 1;
  return { gradeName };
};
context.parseSchedulePayload_ = (payload, gradeName) => {
  executionLocalSourceParses += 1;
  return { gradeName, payload, marker: executionLocalSourceParses };
};
context.resetScheduleSourceRuntimeCache_();
const firstExecutionSource = context.loadSourceContext_('高一');
const repeatedExecutionSource = context.loadSourceContext_('高一');
assert.equal(repeatedExecutionSource, firstExecutionSource);
assert.equal(executionLocalSourceFetches, 1, '同一次執行、同一年級只應下載一次課表');
assert.equal(executionLocalSourceParses, 1, '同一次執行、同一年級只應解析一次課表');
context.loadSourceContext_('高二');
assert.equal(executionLocalSourceFetches, 2, '不同年級必須使用各自的課表快取項目');
context.resetScheduleSourceRuntimeCache_();
context.loadSourceContext_('高一');
assert.equal(executionLocalSourceFetches, 3, '下一次執行的等價重設必須重新取得課表');
context.fetchSchedulePayload_ = originalFetchSchedulePayload;
context.parseSchedulePayload_ = originalParseSchedulePayload;
context.resetScheduleSourceRuntimeCache_();

const currentSetupSource = {
  termKey: '二年級|2026-02-23',
  fingerprint: 'current-source-fingerprint',
  catalog: {
    courses: [{ title: '公民／社會探究' }],
    activities: [{ title: '全校活動（上午）' }],
    all: [{ title: '公民／社會探究' }, { title: '全校活動（上午）' }]
  }
};
let setupPreviewLiveFetchCount = 0;
context.loadSourceContext_ = () => {
  setupPreviewLiveFetchCount += 1;
  return currentSetupSource;
};
const setupPreview = context.buildSetupImportPreview_(roundTripSetupCode, {});
assert.equal(
  setupPreviewLiveFetchCount,
  0,
  '新版設定碼應直接使用內嵌的唯讀課表摘要，匯入時不得等待課表端點'
);
assert.deepEqual(Array.from(setupPreview.selectedCourses), ['公民／社會探究']);
assert.deepEqual(
  Array.from(setupPreview.missingItems),
  ['從巴士底到車諾比：歷史', '程式設計 & AI']
);
assert.equal(setupPreview.sourceChanged, true);
const legacySetupCode = setupCode.encode({
  appVersion: '2.0.0-rc.1',
  gradeName: '高二',
  termKey: currentSetupSource.termKey,
  sourceFingerprint: currentSetupSource.fingerprint,
  selectedCourses: ['公民／社會探究'],
  includeActivities: true,
  excludedActivities: ['全校活動（上午）'],
  notificationEmail: 'student+sync@example.com',
  instantNotificationsEnabled: false,
  notificationHours: [6, 12, 18, 22]
});
const firstConfirmationToken = context.buildSetupImportPreview_(legacySetupCode, {}).confirmationToken;
context.loadSourceContext_ = () => Object.assign({}, currentSetupSource, {
  fingerprint: 'newer-source-fingerprint'
});
assert.notEqual(
  context.buildSetupImportPreview_(legacySetupCode, {}).confirmationToken,
  firstConfirmationToken,
  '來源再次變動後，既有 confirmationToken 必須失效'
);
context.loadSourceContext_ = () => currentSetupSource;
const crossTermCode = setupCode.encode({
  gradeName: '高二',
  termKey: '二年級|2025-09-01',
  sourceFingerprint: 'old',
  selectedCourses: ['公民／社會探究'],
  includeActivities: true,
  excludedActivities: [],
  notificationEmail: 'student@example.com',
  instantNotificationsEnabled: true,
  notificationHours: [6]
});
assert.throws(
  () => context.buildSetupImportPreview_(crossTermCode, {}),
  /不同學期/,
  '跨學期設定碼必須拒絕匯入'
);
const invalidEmailCode = setupCode.encode({
  gradeName: '高二',
  termKey: currentSetupSource.termKey,
  sourceFingerprint: currentSetupSource.fingerprint,
  selectedCourses: ['公民／社會探究'],
  includeActivities: true,
  excludedActivities: [],
  notificationEmail: 'not-an-email',
  instantNotificationsEnabled: true,
  notificationHours: [6]
});
assert.throws(() => context.buildSetupImportPreview_(invalidEmailCode, {}), /Email/);
const unsupportedPayload = Object.assign({}, decodedSetupCode, { schemaVersion: 99 });
const unsupportedEncoded = Buffer.from(JSON.stringify(unsupportedPayload), 'utf8')
  .toString('base64url');
const unsupportedCode = [
  setupCode.PREFIX,
  unsupportedEncoded,
  setupCode.hashText(unsupportedEncoded)
].join('.');
assert.throws(() => context.decodeSetupCode_(unsupportedCode), /版本不受支援/);

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
assert.deepEqual(
  Array.from(context.extractCatalogFromPayload_(makeCatalogPayload(
    [1],
    ['沒有活動關鍵字的單次講座'],
    4
  )), item => `${item.type}:${item.title}`),
  ['activity:沒有活動關鍵字的單次講座'],
  'Code.gs 也應將少於 5 節、無活動關鍵字的項目判定為活動'
);
assert.deepEqual(
  Array.from(context.extractCatalogFromPayload_(makeCatalogPayload(
    [1],
    ['五節正式課程'],
    5
  )), item => `${item.type}:${item.title}`),
  ['course:五節正式課程'],
  'Code.gs 應保留剛好 5 節的正式課程'
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
    DocumentApp: {
      getUi() {
        return { createMenu };
      }
    }
  });
  vm.runInContext(generatedAppsScriptCode, menuContext);
  menuContext.loadSettings_ = () => ({ setupImportedAt: '2026-08-01T00:00:00.000Z', setupCodeVersion: 1 });
  menuContext.onOpen();
  return menuNames;
}

assert.deepEqual(
  recordGeneratedMenus(generatedCode),
  ['T-SCHOOL Schedule Sync'],
  '一般 Code.gs 不應建立高負載測試選單'
);
assert.deepEqual(
  recordGeneratedMenus(highLoadGeneratedCode),
  ['T-SCHOOL Schedule Sync', '高負載測試'],
  '測試版 Code.gs 應在既有行程同步選單加入高負載測試子選單'
);
assert.match(generatedCode, /\.addItem\('開啟控制臺介面', 'showSettingsSidebar'\)/);
assert.match(generatedCode, /\.addItem\('關閉 \/ 啟用自動同步', 'toggleAutoSyncFromMenu'\)/);

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
  appVersion: '2.0.0-rc.1',
  sourceApiUrl: scheduleData.API_URL,
  emailTemplateManifestUrl: immutableManifestUrl,
  gradeName: '高二',
  notificationEmail: 'test@example.com',
  notificationHours: [6],
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
  '',
  '通用程式在匯入前不得預設個人日曆名稱'
);
assert.equal(noActivitySettings.gradeName, '');
assert.equal(noActivitySettings.notificationEmail, '');
assert.deepEqual(Array.from(noActivitySettings.selectedCourses), []);
assert.equal(noActivityCode.includes('test@example.com'), false);
assert.equal(noActivityCode.includes('高二全校活動'), false);

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
assert.equal(
  context.resolveCourseOutlineDateKey_(
    '7/27',
    ['2026-07-27', '2026-07-27']
  ),
  '2026-07-27',
  '直接解析重複日期候選時仍須先去重，不能改變原本的唯一命中規則'
);
const originalUniqueExactStrings = context.uniqueExactStrings_;
let outlineCandidateDedupeCalls = 0;
context.uniqueExactStrings_ = values => {
  outlineCandidateDedupeCalls += 1;
  return originalUniqueExactStrings(values);
};
context.parseCourseOutlineSheetValues_(
  outlineValues,
  '測試課程',
  outlineDesiredEvents,
  { sourceSetKey: '114-2-high2', spreadsheetId: 'sheet-id', spreadsheetName: '課綱' }
);
context.uniqueExactStrings_ = originalUniqueExactStrings;
assert.equal(
  outlineCandidateDedupeCalls,
  1,
  '同一課綱分頁的日期候選只應去重一次，不得每列重做'
);

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
const expandedSheetsApiMergedValues = context.expandVerticalMergedCourseOutlineValues_(
  mergedTopicValues,
  [{
    startRowIndex: 1,
    endRowIndex: 3,
    startColumnIndex: 3,
    endColumnIndex: 4
  }]
);
assert.equal(
  expandedSheetsApiMergedValues[2][3],
  '合併單元主題',
  'Sheets API 的零起算 merge GridRange 必須與既有 SpreadsheetApp 合併範圍等價'
);
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

function buildSyncPlanReference(oldState, desiredEvents, todayKey) {
  const oldFuture = Object.keys(oldState)
    .map(key => Object.assign({ stateKey: key }, oldState[key]))
    .filter(item => item.dateKey >= todayKey);
  const oldPast = Object.keys(oldState)
    .filter(key => oldState[key].dateKey < todayKey)
    .reduce((result, key) => {
      result[key] = oldState[key];
      return result;
    }, {});
  const oldByKey = {};
  oldFuture.forEach(item => {
    oldByKey[item.stateKey] = item;
  });

  const exact = [];
  const unmatchedNew = [];
  const matchedOld = {};
  desiredEvents.forEach(event => {
    const key = context.makeOccurrenceKey_(event);
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
        context.normalizeTitle_(oldItem.originalTitle) ===
          context.normalizeTitle_(newItem.originalTitle)
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
      moved.push({
        oldItem: best.oldItem,
        newItem,
        newKey: context.makeOccurrenceKey_(newItem)
      });
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

function summarizeSyncPlan(plan) {
  return JSON.parse(JSON.stringify({
    oldPast: plan.oldPast,
    oldFutureCount: plan.oldFutureCount,
    exact: plan.exact.map(pair => [
      pair.oldItem.stateKey,
      pair.newItem.testId,
      pair.newKey
    ]),
    moved: plan.moved.map(pair => [
      pair.oldItem.stateKey,
      pair.newItem.testId,
      pair.newKey
    ]),
    additions: plan.additions.map(item => item.testId),
    deletions: plan.deletions.map(item => item.stateKey)
  }));
}

function makePlanTestItem(title, date, location, period, testId) {
  return {
    testId,
    originalTitle: title,
    dateKey: date.toISOString().slice(0, 10),
    isAllDay: false,
    periodStart: period,
    periodEnd: period,
    location,
    start: new Date(date.getTime()),
    end: new Date(date.getTime() + 50 * 60 * 1000)
  };
}

const planTieCenter = new Date('2026-08-15T09:00:00.000Z');
const planTieOldBefore = makePlanTestItem(
  '同名課程',
  new Date(planTieCenter.getTime() - 24 * 60 * 60 * 1000),
  'A',
  1,
  'old-before'
);
const planTieOldAfter = makePlanTestItem(
  '同名課程',
  new Date(planTieCenter.getTime() + 24 * 60 * 60 * 1000),
  'B',
  1,
  'old-after'
);
const planTieState = {
  [context.makeOccurrenceKey_(planTieOldBefore)]: Object.assign({}, planTieOldBefore, {
    start: planTieOldBefore.start.toISOString()
  }),
  [context.makeOccurrenceKey_(planTieOldAfter)]: Object.assign({}, planTieOldAfter, {
    start: planTieOldAfter.start.toISOString()
  })
};
const tiedMovePlan = context.buildSyncPlan_(
  planTieState,
  [makePlanTestItem('同名課程', planTieCenter, 'C', 1, 'new-tied')],
  '2026-08-01'
);
assert.equal(tiedMovePlan.moved.length, 0);
assert.equal(tiedMovePlan.additions.length, 1);
assert.equal(tiedMovePlan.deletions.length, 2);

const moveBoundaryOld = makePlanTestItem(
  '__proto__',
  new Date('2026-08-02T09:00:00.000Z'),
  '舊地點',
  1,
  'boundary-old'
);
const moveBoundaryState = {
  [context.makeOccurrenceKey_(moveBoundaryOld)]: Object.assign({}, moveBoundaryOld, {
    start: moveBoundaryOld.start.toISOString()
  })
};
assert.equal(
  context.buildSyncPlan_(
    moveBoundaryState,
    [makePlanTestItem(
      '__proto__',
      new Date(moveBoundaryOld.start.getTime() + 21 * 24 * 60 * 60 * 1000),
      '新地點',
      2,
      'boundary-new'
    )],
    '2026-08-01'
  ).moved.length,
  1,
  '移動配對必須包含恰好 21 日的邊界，且特殊標題不得碰撞物件原型'
);
assert.equal(
  context.buildSyncPlan_(
    moveBoundaryState,
    [makePlanTestItem(
      '__proto__',
      new Date(moveBoundaryOld.start.getTime() + 21 * 24 * 60 * 60 * 1000 + 1),
      '新地點',
      2,
      'outside-boundary-new'
    )],
    '2026-08-01'
  ).moved.length,
  0,
  '超過 21 日一毫秒不得誤判為移動'
);

let planRandomState = 0x6d2b79f5;
function nextPlanRandom() {
  planRandomState = (Math.imul(planRandomState, 1664525) + 1013904223) >>> 0;
  return planRandomState / 0x100000000;
}
function nextPlanInteger(limit) {
  return Math.floor(nextPlanRandom() * limit);
}
const planTitles = ['Alpha', ' ALPHA ', 'Ｂeta', 'Beta', '__proto__', '課 程'];
const planBaseMs = Date.parse('2026-08-01T09:00:00.000Z');
for (let caseIndex = 0; caseIndex < 1500; caseIndex += 1) {
  const oldState = {};
  const oldItems = [];
  const oldCount = nextPlanInteger(13);
  for (let oldIndex = 0; oldIndex < oldCount; oldIndex += 1) {
    const dayOffset = nextPlanInteger(46) - 5;
    const date = new Date(
      planBaseMs + dayOffset * 24 * 60 * 60 * 1000 +
      nextPlanInteger(4) * 30 * 60 * 1000
    );
    const item = makePlanTestItem(
      planTitles[nextPlanInteger(planTitles.length)],
      date,
      'old-' + caseIndex + '-' + oldIndex,
      oldIndex % 8 + 1,
      'old-' + oldIndex
    );
    const stateKey = context.makeOccurrenceKey_(item);
    oldState[stateKey] = Object.assign({}, item, { start: item.start.toISOString() });
    oldItems.push(item);
  }

  const desiredEvents = [];
  const desiredCount = nextPlanInteger(13);
  for (let newIndex = 0; newIndex < desiredCount; newIndex += 1) {
    if (oldItems.length && nextPlanRandom() < 0.3) {
      const source = oldItems[nextPlanInteger(oldItems.length)];
      desiredEvents.push(Object.assign({}, source, {
        testId: 'new-' + newIndex,
        start: new Date(source.start.getTime()),
        end: new Date(source.end.getTime())
      }));
      continue;
    }
    const dayOffset = nextPlanInteger(46);
    const date = new Date(
      planBaseMs + dayOffset * 24 * 60 * 60 * 1000 +
      nextPlanInteger(4) * 30 * 60 * 1000
    );
    desiredEvents.push(makePlanTestItem(
      planTitles[nextPlanInteger(planTitles.length)],
      date,
      'new-' + caseIndex + '-' + newIndex,
      newIndex % 8 + 1,
      'new-' + newIndex
    ));
  }

  assert.deepEqual(
    summarizeSyncPlan(context.buildSyncPlan_(oldState, desiredEvents, '2026-08-01')),
    summarizeSyncPlan(buildSyncPlanReference(oldState, desiredEvents, '2026-08-01')),
    '標題分桶最佳化必須與原配對演算法逐項等價，隨機案例 ' + caseIndex
  );
}

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
const scriptPropertyGetCounts = {};
const scriptProperties = {
  getProperty(key) {
    scriptPropertyGetCounts[key] = (scriptPropertyGetCounts[key] || 0) + 1;
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
let emailTemplateFetchBody = emailTemplateManifestText;
let emailTemplateCacheReadCount = 0;
let emailTemplateFetchCount = 0;
context.PropertiesService = {
  getScriptProperties() {
    return scriptProperties;
  }
};
const propertyCountReadsBeforeWrite = scriptPropertyGetCounts.PROPERTY_RPC_TEST_COUNT || 0;
context.writeChunkedJson_('PROPERTY_RPC_TEST', { ok: true });
assert.equal(
  scriptPropertyGetCounts.PROPERTY_RPC_TEST_COUNT || 0,
  propertyCountReadsBeforeWrite,
  '已有 getProperties() 快照時，分塊寫入不應再單獨讀取舊 COUNT'
);
context.clearChunkedStore_('PROPERTY_RPC_TEST');
const initialGeneratedSettings = context.loadSettings_();
assert.deepEqual(
  Array.from(initialGeneratedSettings.autoSyncHours),
  [3, 11, 18, 21],
  '課表偵測與 Calendar 同步時段應固定，不得沿用通知時間'
);
assert.deepEqual(
  Array.from(initialGeneratedSettings.notificationHours),
  [6],
  '通用程式在匯入前只保留無個人資料的通知預設'
);
assert.equal(
  initialGeneratedSettings.notifySyncHour,
  6,
  '通用程式在匯入前不得注入網站使用者的通知時段'
);
assert.equal(initialGeneratedSettings.instantNotificationsEnabled, true);
assert.deepEqual(
  Array.from(context.getEffectiveNotificationHours_(initialGeneratedSettings)),
  [6],
  '即時通知開啟時，每日摘要觸發時間應固定為 06:00'
);
context.writeChunkedJson_('TSCHOOL_SETTINGS', {
  schemaVersion: 4,
  autoSyncHours: [7, 19],
  notifySyncHour: 19
});
const migratedNotificationSettings = context.loadSettings_();
assert.deepEqual(
  Array.from(migratedNotificationSettings.notificationHours),
  [7, 19],
  '舊版 autoSyncHours 應遷移為通知時間'
);
assert.deepEqual(
  Array.from(migratedNotificationSettings.autoSyncHours),
  [3, 11, 18, 21],
  '遷移舊設定後仍應使用固定同步時段'
);
context.clearChunkedStore_('TSCHOOL_SETTINGS');
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
let scriptLockHeld = false;
let scriptLockAttempts = 0;
let scriptLockReleases = 0;
context.LockService = {
  getScriptLock() {
    return {
      tryLock() {
        scriptLockAttempts += 1;
        assert.equal(scriptLockHeld, false, '測試中不得重複取得同一把 Script Lock');
        scriptLockHeld = true;
        return true;
      },
      releaseLock() {
        assert.equal(scriptLockHeld, true, '釋放前必須持有 Script Lock');
        scriptLockHeld = false;
        scriptLockReleases += 1;
      }
    };
  }
};
context.writeChunkedJson_('TSCHOOL_SETTINGS', {
  setupComplete: true,
  setupImportedAt: '2026-08-01T00:00:00.000Z',
  setupCodeVersion: 1
});
const lockAttemptsBeforeDelete = scriptLockAttempts;
const lockReleasesBeforeDelete = scriptLockReleases;
assert.equal(context.quickDeleteSyncedCalendarEvents(), 0);
assert.equal(scriptLockAttempts, lockAttemptsBeforeDelete + 1);
assert.equal(scriptLockReleases, lockReleasesBeforeDelete + 1);
assert.equal(scriptLockHeld, false);
context.writeChunkedJson_('TSCHOOL_SYNC_STATE', { stale: { calendarEventId: 'old' } });
context.writeChunkedJson_('TSCHOOL_STATUS', { message: 'stale' });
const lockAttemptsBeforeReset = scriptLockAttempts;
const lockReleasesBeforeReset = scriptLockReleases;
context.resetSyncState();
assert.equal(scriptLockAttempts, lockAttemptsBeforeReset + 1);
assert.equal(scriptLockReleases, lockReleasesBeforeReset + 1);
assert.equal(scriptLockHeld, false);
assert.equal(context.readChunkedJson_('TSCHOOL_SYNC_STATE', null), null);
assert.equal(context.readChunkedJson_('TSCHOOL_STATUS', null), null);
assert.throws(
  () => context.previewSetupCodeForUi(roundTripSetupCode),
  /不能再匯入/,
  '首次同步完成後不得用設定碼覆寫既有狀態'
);
context.clearChunkedStore_('TSCHOOL_SETTINGS');
context.ScriptApp = {
  getProjectTriggers() {
    return projectTriggers.slice();
  },
  deleteTrigger(trigger) {
    projectTriggers = projectTriggers.filter(item => item !== trigger);
  },
  newTrigger(handler) {
    const schedule = {};
    const builder = {
      timeBased() {
        return builder;
      },
      atHour(hour) {
        schedule.hour = hour;
        return builder;
      },
      nearMinute(minute) {
        schedule.nearMinute = minute;
        return builder;
      },
      everyDays(days) {
        schedule.everyDays = days;
        return builder;
      },
      inTimezone(timezone) {
        schedule.timezone = timezone;
        return builder;
      },
      after(delay) {
        schedule.after = delay;
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
          },
          schedule: Object.assign({}, schedule)
        };
        projectTriggers.push(trigger);
        return trigger;
      }
    };
    return builder;
  }
};
let activeSetupAccountEmail = 'student+sync@example.com';
context.Session = {
  getActiveUser() {
    return { getEmail: () => activeSetupAccountEmail };
  },
  getEffectiveUser() {
    return { getEmail: () => activeSetupAccountEmail };
  }
};
const validImportPreview = context.previewSetupCodeForUi(roundTripSetupCode);
assert.equal(validImportPreview.accountMismatch, false);
activeSetupAccountEmail = 'other@example.com';
assert.equal(
  context.previewSetupCodeForUi(roundTripSetupCode).accountMismatch,
  true,
  'Google Docs 執行帳號與設定 Email 不同時應回傳警告狀態'
);
const mismatchedImportResult = context.importSetupCodeFromUi(roundTripSetupCode);
assert.equal(mismatchedImportResult.applied, false);
assert.equal(mismatchedImportResult.accountMismatch, true);
assert.equal(mismatchedImportResult.notificationEmail, 'student+sync@example.com');
assert.equal(
  context.hasImportedSetup_(context.loadSettings_()),
  false,
  'Google 帳號不同時應停留在貼上設定碼頁，不得先保存設定'
);
activeSetupAccountEmail = 'student+sync@example.com';
const importResult = context.importSetupCodeFromUi(roundTripSetupCode);
assert.equal(importResult.applied, true);
assert.equal(importResult.accountMismatch, false);
assert.equal(importResult.message, '網站設定已匯入');
const importedSettings = context.loadSettings_();
assert.equal(importedSettings.setupComplete, false);
assert.equal(importedSettings.setupCodeVersion, 1);
assert.notEqual(importedSettings.setupImportedAt, '');
assert.equal(importedSettings.calendarId, '');
assert.deepEqual(Array.from(importedSettings.selectedCourses), ['公民／社會探究']);
assert.deepEqual(Array.from(importedSettings.notificationHours), [6, 12, 18, 22]);
const importedSourceContext = context.readChunkedJson_('TSCHOOL_SETUP_SOURCE_CONTEXT', null);
assert.equal(importedSourceContext.gradeName, '高二');
assert.equal(importedSourceContext.initialSetupSnapshot, true);
assert.equal(importedSourceContext.events.length, 0);
assert.equal(context.hasSetupSourceContext_(importedSettings), true);
assert.equal(projectTriggers.length, 0, '匯入設定碼時不得建立觸發器');
context.clearChunkedStore_('TSCHOOL_SETTINGS');
context.CacheService = {
  getScriptCache() {
    return {
      get(key) {
        emailTemplateCacheReadCount += 1;
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
    emailTemplateFetchCount += 1;
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
        return emailTemplateFetchBody;
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
assert.doesNotThrow(() =>
  context.assertEmailTemplateManifestTextSize_('a'.repeat(100 * 1024))
);
assert.throws(
  () => context.assertEmailTemplateManifestTextSize_('中'.repeat(35 * 1024)),
  /超過大小限制/,
  'Email 版型上限必須按 UTF-8 位元組計算，不能把中文字誤算成單一 byte'
);
const renderedFailureEmail = context.buildEmailHtmlSafe_(
  'sync_failure',
  '[T-SCHOOL] 行程同步失敗',
  {
    sentAt: '2026/07/26 12:00',
    controlUrl: 'https://docs.google.com/document/d/test/edit',
    calendarUrl: 'https://calendar.google.com/calendar/u/0/r',
    message: '<script>alert("x")</script> 權限不足'
  }
);
assert.match(renderedFailureEmail, /<!doctype html>/);
assert.match(renderedFailureEmail, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; 權限不足/);
assert.equal(renderedFailureEmail.includes('<script>alert("x")</script>'), false);
assert.match(renderedFailureEmail, /行程同步失敗/);
assert.match(
  renderedFailureEmail,
  /href="https:\/\/docs\.google\.com\/document\/d\/test\/edit"/,
  '核准的 Google Docs 連結應保留'
);
const emailTemplateCacheReadsAfterFirstRender = emailTemplateCacheReadCount;
const emailTemplateFetchesAfterFirstRender = emailTemplateFetchCount;
assert.match(
  context.buildEmailHtmlSafe_(
    'sync_failure',
    '第二封測試通知',
    {
      sentAt: '2026/07/26 12:01',
      controlUrl: 'https://docs.google.com/document/d/test/edit',
      calendarUrl: 'https://calendar.google.com/calendar/u/0/r',
      message: '相同執行中的第二封通知'
    }
  ),
  /第二封測試通知/
);
assert.equal(
  emailTemplateCacheReadCount,
  emailTemplateCacheReadsAfterFirstRender,
  '同一次執行成功載入 Email 版型後，不應再次讀取 CacheService'
);
assert.equal(
  emailTemplateFetchCount,
  emailTemplateFetchesAfterFirstRender,
  '同一次執行成功載入 Email 版型後，不應再次下載固定 manifest'
);
const sanitizedEmailLinks = context.sanitizeEmailHtmlLinks_(
  '<p>' +
  '<a href="https://calendar.google.com/calendar/u/0/r">日曆</a>' +
  '<a href="https://docs.google.com/document/d/test/edit?usp=sharing">控制臺</a>' +
  '<a href="https://calendar.google.com.evil.example/phish"><strong>假日曆</strong></a>' +
  '<a href="https://docs.google.com/url?q=https://evil.example">假控制臺</a>' +
  '<a href="javascript:alert(1)">危險連結</a>' +
  '</p>'
);
assert.match(sanitizedEmailLinks, /href="https:\/\/calendar\.google\.com\/calendar\/u\/0\/r"/);
assert.match(
  sanitizedEmailLinks,
  /href="https:\/\/docs\.google\.com\/document\/d\/test\/edit\?usp=sharing"/
);
assert.equal(sanitizedEmailLinks.includes('calendar.google.com.evil.example'), false);
assert.equal(sanitizedEmailLinks.includes('docs.google.com/url'), false);
assert.equal(sanitizedEmailLinks.includes('javascript:'), false);
assert.match(sanitizedEmailLinks, /假日曆/);
assert.match(sanitizedEmailLinks, /假控制臺/);
assert.match(sanitizedEmailLinks, /危險連結/);
assert.equal(/<strong>假日曆<\/strong>/.test(sanitizedEmailLinks), false);
const collidingEmailLinkToken = 'TSCHOOL_SAFE_EMAIL_LINK_0_END';
const sanitizedCollidingEmailLink = context.sanitizeEmailHtmlLinks_(
  '<p>' + collidingEmailLinkToken +
  '<a href="https://calendar.google.com/calendar/u/0/r">日曆</a></p>'
);
assert.equal(
  (sanitizedCollidingEmailLink.match(/<a\b/g) || []).length,
  1,
  '原始文字與舊佔位格式相同時，不得被誤替換成第二個連結'
);
assert.match(sanitizedCollidingEmailLink, new RegExp(collidingEmailLinkToken));

const sampleEmailData = {
  sentAt: '2026/07/26 12:00',
  controlUrl: 'https://docs.google.com/document/d/test/edit',
  calendarUrl: 'https://calendar.google.com/calendar/u/0/r',
  summary: '新增 1、更新 2、移除 0、未變更 8',
  message: '測試訊息',
  created: 1,
  updated: 2,
  outlineUpdated: 3,
  deleted: 0,
  unchanged: 8,
  changeCount: 1,
  countsLabel: '目前來源組：高一 1 組、高二 1 組、高三 0 組',
  previousFingerprint: 'old-fingerprint',
  currentFingerprint: 'new-fingerprint',
  omittedNote: '',
  processed: 40,
  total: 422,
  remaining: 382,
  progressPercent: 9,
  dateRange: '2026-09-01–2027-01-31',
  itemCount: 1,
  items: [{ label: '測試活動' }],
  semesterReviews: [{
    semesterKey: '高一|2',
    semesterLabel: '高一下',
    rows: [
      {
        sign: '−',
        label: '114-1 高一—必修',
        backgroundColor: '#fae3df',
        borderColor: '#f05a47',
        textColor: '#a63c2f'
      },
      {
        sign: '+',
        label: '114-2 高一—必修',
        backgroundColor: '#dcefe7',
        borderColor: '#00a676',
        textColor: '#007c59'
      }
    ]
  }],
  changes: [{
    type: '時間變更',
    course: '測試課程',
    sourceName: '高二｜115-1-high2',
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
const renderedIndexReview = context.buildEmailHtmlSafe_(
  'course_outline_index_changed',
  '課綱索引已更新',
  {
    sentAt: '2026/07/31 16:20',
    previousFingerprint: 'old-fingerprint',
    currentFingerprint: 'new-fingerprint',
    changeCount: 2,
    semesterReviews: [{
      semesterKey: '高一|2',
      semesterLabel: '高一下',
      rows: [
        {
          sign: '-',
          label: '<img src=x onerror=alert(1)> 舊課綱',
          backgroundColor: '#fae3df',
          borderColor: '#f05a47',
          textColor: '#a63c2f'
        },
        {
          sign: '+',
          label: '新課綱',
          backgroundColor: '#dcefe7',
          borderColor: '#00a676',
          textColor: '#007c59'
        }
      ]
    }]
  }
);
assert.match(renderedIndexReview, /高一下/);
assert.match(renderedIndexReview, />-<\/td>/);
assert.match(renderedIndexReview, />\+<\/td>/);
assert.match(renderedIndexReview, /background:#fae3df/);
assert.match(renderedIndexReview, /background:#dcefe7/);
assert.match(renderedIndexReview, /&lt;img src=x onerror=alert\(1\)&gt; 舊課綱/);
assert.equal(renderedIndexReview.includes('<img src=x onerror=alert(1)>'), false);

const emailsBeforeStartedNotice = sentEmailMessages.length;
assert.equal(context.sendFirstSetupNotificationSafe_({
  created: 40,
  updated: 0,
  outlineUpdated: 0,
  deleted: 0,
  unchanged: 0
}), true);
assert.equal(sentEmailMessages.length, emailsBeforeStartedNotice + 1);
assert.equal(
  sentEmailMessages.at(-1).subject,
  '行程同步設定完成｜T-SCHOOL Schedule Sync'
);
assert.equal(
  sentEmailMessages.at(-1).body,
  '第一批事件同步完成！如果行程較多，系統會在背景分批繼續同步\n' +
    '後續則會根據你的設定自動更新事件'
);
assert.match(sentEmailMessages.at(-1).htmlBody, /行程同步設定完成/);
assert.match(
  sentEmailMessages.at(-1).htmlBody,
  /第一批事件同步完成！如果行程較多，系統會在背景分批繼續同步\n後續則會根據你的設定自動更新事件/
);
assert.equal(
  generatedCode.includes('sendFirstBatchStartedNotificationSafe_'),
  false
);
assert.equal(generatedCode.includes("'setup_started'"), false);
assert.match(
  generatedCode,
  /job\.firstSetup &&[\s\S]*?!job\.setupNotificationClaimed[\s\S]*?sendFirstSetupNotificationSafe_/
);
assert.equal(
  context.formatNotificationSubject_('[T-SCHOOL] 行程同步失敗'),
  '行程同步失敗｜T-SCHOOL Schedule Sync'
);
assert.equal(
  context.formatNotificationSubject_('行程同步設定完成｜T-SCHOOL Schedule Sync'),
  '行程同步設定完成｜T-SCHOOL Schedule Sync'
);
assert.match(
  generatedCode,
  /pendingDiscovered\.length\) \{\s*sendActionRequiredSafe_\(\s*settings,\s*'同步已暫停',[\s\S]*?'new_schedule_items'/,
  '新行程項目通知的主旨前段應為同步已暫停'
);

cachedEmailTemplateManifest = '';
emailTemplateFetchBody = '中'.repeat(35 * 1024);
context.resetEmailTemplateManifestRuntimeCache_();
assert.equal(
  context.buildEmailHtmlSafe_(
    'sync_failure',
    '[T-SCHOOL] 行程同步失敗',
    { message: '版型超過大小上限' }
  ),
  '',
  '遠端版型超過 UTF-8 100 KiB 時應退回純文字寄送'
);
emailTemplateFetchBody = emailTemplateManifestText;
cachedEmailTemplateManifest = '';
emailTemplateFetchShouldFail = true;
context.resetEmailTemplateManifestRuntimeCache_();
assert.equal(
  context.buildEmailHtmlSafe_(
    'sync_failure',
    '[T-SCHOOL] 行程同步失敗',
    { message: '暫時無法下載版型' }
  ),
  '',
  '遠端版型失效時應退回純文字寄送'
);
const failedTemplateFetchCount = emailTemplateFetchCount;
assert.equal(
  context.buildEmailHtmlSafe_('sync_failure', '第二封失敗備援', { message: '同一次執行' }),
  '',
  '同一次執行下載失敗後仍應使用純文字備援'
);
assert.equal(
  emailTemplateFetchCount,
  failedTemplateFetchCount,
  '同一次執行已確認版型下載失敗後不得反覆等待網路重試'
);
emailTemplateFetchShouldFail = false;
context.resetEmailTemplateManifestRuntimeCache_();

context.clearChunkedStore_('TSCHOOL_NOTIFICATION_QUEUE');
const notificationTimingSettings = {
  notificationEmail: 'test@example.com',
  instantNotificationsEnabled: false,
  notificationHours: [(Number(formatDate(new Date(), 'H')) + 1) % 24],
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
context.clearChunkedStore_('TSCHOOL_NOTIFICATION_QUEUE');
const emailsBeforeInstantChange = sentEmailMessages.length;
context.sendSyncNotificationsSafe_(
  Object.assign({}, notificationTimingSettings, { instantNotificationsEnabled: true }),
  scheduledChangeResult,
  { reason: 'source' }
);
assert.equal(
  sentEmailMessages.length,
  emailsBeforeInstantChange + 1,
  '即時通知開啟時，行程調整應在同步完成後盡快寄出'
);
assert.equal(context.loadNotificationQueueState_().pendingChangeData, null);
context.clearChunkedStore_('TSCHOOL_NOTIFICATION_QUEUE');
context.sendSyncNotificationsSafe_(
  notificationTimingSettings,
  scheduledChangeResult,
  { reason: 'source' }
);
const emailsBeforeQueuedDelivery = sentEmailMessages.length;
const laterScheduledChangeResult = JSON.parse(JSON.stringify(scheduledChangeResult));
laterScheduledChangeResult.changes[0].oldItem.originalTitle = '第二門測試課程';
laterScheduledChangeResult.changes[0].newItem.originalTitle = '第二門測試課程';
laterScheduledChangeResult.changes[0].oldItem.dateKey = '2026-07-29';
laterScheduledChangeResult.changes[0].newItem.dateKey = '2026-07-30';
context.sendSyncNotificationsSafe_(
  notificationTimingSettings,
  laterScheduledChangeResult,
  { reason: 'source' }
);
assert.equal(
  context.loadNotificationQueueState_().pendingChangeData.changeCount,
  2,
  '不同固定同步時段偵測到的兩筆異動應合併保留'
);
for (let index = 0; index < 3; index += 1) {
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
    { reason: 'source' }
  );
}
assert.equal(
  context.loadNotificationQueueState_().pendingChangeData.changeCount,
  2,
  '後續三次沒有新異動的同步不得清除先前待寄的行程調整'
);
assert.equal(
  sentEmailMessages.length,
  emailsBeforeQueuedDelivery,
  '無新異動的固定同步不得提前寄出待寄通知'
);
context.writeChunkedJson_('TSCHOOL_SYNC_JOB', {
  schemaVersion: 1,
  status: 'running'
});
assert.throws(
  () => context.requestScheduledNotificationDelivery_(true),
  /貼上網站產生的設定碼/,
  '尚未匯入設定碼時不得啟動通知工作'
);
context.writeChunkedJson_('TSCHOOL_SETTINGS', {
  setupImportedAt: '2026-08-01T00:00:00.000Z',
  setupCodeVersion: 1,
  notificationEmail: 'test@example.com'
});
context.requestScheduledNotificationDelivery_(true);
assert.equal(
  sentEmailMessages.length,
  emailsBeforeQueuedDelivery,
  '通知 Trigger 與背景同步重疊時應先等待同步完成'
);
assert.equal(
  projectTriggers.some(trigger =>
    trigger.getHandlerFunction() === 'retryScheduledNotificationDelivery'
  ),
  true,
  '通知 Trigger 與背景同步重疊時應建立待寄重試'
);
const pendingNotificationRetryId = projectTriggers.find(trigger =>
  trigger.getHandlerFunction() === 'retryScheduledNotificationDelivery'
).getUniqueId();
context.refreshAutoSyncTriggers_({
  gradeName: '高一',
  autoSyncEnabled: true,
  instantNotificationsEnabled: true,
  notificationHours: [6],
  notifySyncHour: 6
});
assert.deepEqual(
  projectTriggers
    .filter(trigger =>
      trigger.getHandlerFunction() === 'retryScheduledNotificationDelivery'
    )
    .map(trigger => trigger.getUniqueId()),
  [pendingNotificationRetryId],
  '重新整理已啟用的每日排程時，不得刪除或重建既有通知重試'
);
context.refreshAutoSyncTriggers_({
  gradeName: '高一',
  autoSyncEnabled: false,
  instantNotificationsEnabled: true,
  notificationHours: [6],
  notifySyncHour: 6
});
assert.deepEqual(
  projectTriggers
    .filter(trigger =>
      trigger.getHandlerFunction() === 'retryScheduledNotificationDelivery'
    )
    .map(trigger => trigger.getUniqueId()),
  [pendingNotificationRetryId],
  '關閉自動同步時仍須讓已保存的待寄通知完成，不能永久失去執行入口'
);
context.clearChunkedStore_('TSCHOOL_SYNC_JOB');
context.retryScheduledNotificationDelivery();
assert.equal(sentEmailMessages.length, emailsBeforeQueuedDelivery + 1);
assert.match(sentEmailMessages.at(-1).subject, /有 2 項行程調整/);
assert.match(sentEmailMessages.at(-1).body, /測試課程/);
assert.match(sentEmailMessages.at(-1).body, /第二門測試課程/);
assert.doesNotMatch(sentEmailMessages.at(-1).subject, /同步成功/);
assert.equal(
  context.loadNotificationQueueState_().pendingChangeData,
  null,
  '通知時間應寄出並清除已排程的行程調整'
);
assert.equal(
  projectTriggers.some(trigger =>
    trigger.getHandlerFunction() === 'retryScheduledNotificationDelivery'
  ),
  false,
  '通知成功後應清除一次性重試 Trigger'
);
context.clearChunkedStore_('TSCHOOL_NOTIFICATION_QUEUE');
context.writeChunkedJson_('TSCHOOL_STATUS', {
  ok: true,
  lastSync: new Date().toISOString(),
  created: 0,
  updated: 0,
  outlineUpdated: 0,
  deleted: 0,
  unchanged: 9
});
const emailsBeforeDailySummary = sentEmailMessages.length;
context.requestScheduledNotificationDelivery_(true);
assert.equal(sentEmailMessages.length, emailsBeforeDailySummary + 1);
assert.match(sentEmailMessages.at(-1).subject, /行程同步狀態正常/);
context.requestScheduledNotificationDelivery_(true);
assert.equal(
  sentEmailMessages.length,
  emailsBeforeDailySummary + 1,
  '最後通知時間的每日成功摘要同一天不得重複寄送'
);

const emailsBeforeImmediateError = sentEmailMessages.length;
context.notifySyncFailureSafe_(new Error('第一句。第二句。'));
assert.equal(sentEmailMessages.length, emailsBeforeImmediateError + 1);
assert.equal(sentEmailMessages.at(-1).body.includes('。'), false);
assert.match(sentEmailMessages.at(-1).subject, /同步失敗/);
context.clearChunkedStore_('TSCHOOL_NOTIFICATION_QUEUE');
context.clearChunkedStore_('TSCHOOL_STATUS');
context.writeChunkedJson_('TSCHOOL_SETTINGS', {
  gradeName: '高一',
  termKey: '一年級|2026-09-01'
});
assert.deepEqual(
  Array.from(context.getCourseOutlineIndexNoticeSemesterContexts_({
    gradeName: '高一',
    termKey: '一年級|2026-09-01'
  }), item => item.semesterLabel),
  ['高一上', '高一下'],
  '上學期應追蹤當學期與下一學期'
);
assert.deepEqual(
  Array.from(context.getCourseOutlineIndexNoticeSemesterContexts_({
    gradeName: '高一',
    termKey: '一年級|2027-02-01'
  }), item => item.semesterLabel),
  ['高一下', '高二上'],
  '下學期的下一學期應是下一年級上學期'
);
assert.deepEqual(
  Array.from(context.getCourseOutlineIndexNoticeSemesterContexts_({
    gradeName: '高三',
    termKey: '三年級|2027-02-01'
  }), item => item.semesterLabel),
  ['高三下'],
  '高三下學期沒有下一學期可通知，不得外推'
);

const simulatedOutlineIndexHeader = [
  '啟用',
  '來源組鍵',
  '課綱名稱',
  '年級',
  '適用起日',
  '適用迄日',
  '課綱試算表連結'
];
const simulatedHigh1FirstSemesterRows = [
  '必修',
  '多元選修',
  '跨班選修',
  '彈性學習'
].map((outlineName, index) => [
  'TRUE',
  '114-1-high1',
  '114-1 高一—' + outlineName,
  '高一',
  '2025-08-25',
  '2026-01-31',
  'https://docs.google.com/spreadsheets/d/simulated-high1-first-' + index + '/edit'
]);
const simulatedHigh1SecondSemesterRows = [
  '必修',
  '多元選修',
  '跨班選修',
  '彈性學習'
].map((outlineName, index) => [
  'TRUE',
  '114-2-high1',
  '114-2 高一—' + outlineName,
  '高一',
  '2026-02-23',
  '2026-07-31',
  'https://docs.google.com/spreadsheets/d/simulated-high1-second-' + index + '/edit'
]);
const simulatedHigh1FirstSemesterIndex = context.parseCourseOutlineSourceIndexValues_([
  simulatedOutlineIndexHeader,
  ...simulatedHigh1FirstSemesterRows
]);
const simulatedHigh1SecondSemesterIndex = context.parseCourseOutlineSourceIndexValues_([
  simulatedOutlineIndexHeader,
  ...simulatedHigh1FirstSemesterRows,
  ...simulatedHigh1SecondSemesterRows
]);
const simulatedHigh1Notice = context.buildCourseOutlineSourceIndexChangeData_(
  simulatedHigh1FirstSemesterIndex,
  simulatedHigh1SecondSemesterIndex,
  context.getCourseOutlineIndexNoticeSemesterContexts_({
    gradeName: '高一',
    termKey: '一年級|2025-09-01'
  })
);
assert.equal(simulatedHigh1Notice.changeCount, 4);
assert.equal(simulatedHigh1Notice.semesterReviews.length, 1);
assert.equal(simulatedHigh1Notice.semesterReviews[0].semesterLabel, '高一下');
assert.deepEqual(
  Array.from(simulatedHigh1Notice.semesterReviews[0].rows, row => row.sign),
  ['+', '+', '+', '+']
);
assert.match(simulatedHigh1Notice.semesterReviews[0].rows[0].label, /114-2 高一—必修/);
assert.match(simulatedHigh1Notice.semesterReviews[0].rows[3].label, /114-2 高一—彈性學習/);
assert.equal(
  simulatedHigh1Notice.semesterReviews.some(review =>
    review.rows.some(row => row.sign === '-')
  ),
  false,
  '正確新增下學期來源時，上學期仍保持啟用，不應顯示移除列'
);

const simulatedHigh1DisabledNotice = context.buildCourseOutlineSourceIndexChangeData_(
  simulatedHigh1SecondSemesterIndex,
  context.parseCourseOutlineSourceIndexValues_([
    simulatedOutlineIndexHeader,
    ...simulatedHigh1SecondSemesterRows
  ]),
  context.getCourseOutlineIndexNoticeSemesterContexts_({
    gradeName: '高一',
    termKey: '一年級|2025-09-01'
  })
);
assert.equal(simulatedHigh1DisabledNotice.changeCount, 4);
assert.equal(simulatedHigh1DisabledNotice.semesterReviews[0].semesterLabel, '高一上');
assert.deepEqual(
  Array.from(simulatedHigh1DisabledNotice.semesterReviews[0].rows, row => row.sign),
  ['-', '-', '-', '-'],
  '取消啟用來源組時，每份課綱都應顯示橘色移除列'
);

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
let liveOutlineIndexEmpty = false;
let liveOutlineIndexMetadataCalls = 0;
let liveOutlineIndexValuesCalls = 0;
context.Sheets = {
  Spreadsheets: {
    get(id, options) {
      liveOutlineIndexMetadataCalls += 1;
      assert.equal(id, '1zS6TdGMTPhz2Ja8bRs2AKAg0mRsBfXET9nmXi9wSBjY');
      assert.equal(options.includeGridData, false);
      assert.match(options.fields, /sheets/);
      return {
        properties: { title: '課綱來源索引' },
        sheets: [{ properties: { sheetId: 1, title: '課綱來源' }, merges: [] }]
      };
    },
    Values: {
      batchGet(id, options) {
        liveOutlineIndexValuesCalls += 1;
        assert.equal(id, '1zS6TdGMTPhz2Ja8bRs2AKAg0mRsBfXET9nmXi9wSBjY');
        assert.deepEqual(Array.from(options.ranges), ["'課綱來源'"]);
        assert.equal(options.valueRenderOption, 'FORMATTED_VALUE');
        return {
          valueRanges: [{ values: liveOutlineIndexEmpty ? [] : liveOutlineIndexValues }]
        };
      }
    }
  }
};
liveOutlineIndexEmpty = true;
assert.throws(
  () => context.readCourseOutlineSourceIndexSpreadsheet_(),
  /課綱來源索引沒有可讀取的資料/,
  '改用 Sheets API 批次讀取後，空白索引仍須保留原本的明確錯誤'
);
assert.equal(liveOutlineIndexValuesCalls, 1, '空白索引只應發出一次唯讀 values 請求');
liveOutlineIndexEmpty = false;
context.resetCourseOutlineSourceIndexRuntimeCache_();
const emailsBeforeInitialOutlineIndex = sentEmailMessages.length;
const liveOutlineIndex = context.loadCourseOutlineSourceIndex_();
assert.equal(liveOutlineIndexMetadataCalls, 2);
assert.equal(liveOutlineIndexValuesCalls, 2);
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
const emailsBeforeIrrelevantOutlineIndexChange = sentEmailMessages.length;
const unrelatedOutlineIndex = context.loadCourseOutlineSourceIndex_();
assert.equal(unrelatedOutlineIndex.setsByGrade['高二'][0].key, '115-1-high2');
assert.equal(
  sentEmailMessages.length,
  emailsBeforeIrrelevantOutlineIndexChange,
  '上學期只應通知當學期與下一學期，不得寄送其他年級的索引變動'
);

liveOutlineIndexValues.push([
  'TRUE',
  '115-2-high1',
  '115-2 高一—必修',
  '高一',
  '2027-02-01',
  '2027-07-31',
  'https://docs.google.com/spreadsheets/d/live-index-high1-second-term/edit'
]);
context.resetCourseOutlineSourceIndexRuntimeCache_();
const emailsBeforeOutlineIndexChange = sentEmailMessages.length;
const changedOutlineIndex = context.loadCourseOutlineSourceIndex_();
assert.equal(changedOutlineIndex.setsByGrade['高一'][1].key, '115-2-high1');
assert.equal(sentEmailMessages.length, emailsBeforeOutlineIndexChange + 1);
assert.equal(
  sentEmailMessages.at(-1).subject,
  '課綱索引已更新｜T-SCHOOL Schedule Sync'
);
assert.match(sentEmailMessages.at(-1).body, /高一下/);
assert.match(sentEmailMessages.at(-1).body, /\+ 115-2 高一—必修/);
assert.match(sentEmailMessages.at(-1).body, /舊指紋：/);
assert.match(sentEmailMessages.at(-1).body, /新指紋：/);
assert.match(sentEmailMessages.at(-1).htmlBody, /需要注意/);
assert.match(
  sentEmailMessages.at(-1).htmlBody,
  /中央課綱來源索引已更新，內容摘要如下/
);
assert.match(sentEmailMessages.at(-1).htmlBody, /高一下/);
assert.match(sentEmailMessages.at(-1).htmlBody, />\+<\/td>/);
assert.match(sentEmailMessages.at(-1).htmlBody, /background:#dcefe7/);
assert.match(sentEmailMessages.at(-1).htmlBody, /115-2 高一—必修/);
assert.doesNotMatch(sentEmailMessages.at(-1).htmlBody, /115-1 高二—必修/);
assert.doesNotMatch(sentEmailMessages.at(-1).htmlBody, /第 \d+ 行/);
assert.match(
  sentEmailMessages.at(-1).htmlBody,
  /如果你覺得更新內容怪怪的，請聯繫齊宣處理/
);
assert.equal(
  sentEmailMessages.at(-1).body.includes('若這不是預期變更'),
  false
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    context.readChunkedJson_('TSCHOOL_COURSE_OUTLINE_INDEX_CACHE', null),
    'changeNotice'
  ),
  false,
  '變動通知成功後應清除待寄狀態'
);

context.writeChunkedJson_('TSCHOOL_SETTINGS', {
  gradeName: '高一',
  termKey: '一年級|2027-02-01'
});
liveOutlineIndexValues[2][2] = '115-1 高二—必修（預先更新）';
context.resetCourseOutlineSourceIndexRuntimeCache_();
const emailsBeforeNextGradeOutlineIndexChange = sentEmailMessages.length;
context.loadCourseOutlineSourceIndex_();
assert.equal(
  sentEmailMessages.length,
  emailsBeforeNextGradeOutlineIndexChange + 1,
  '下學期應一併通知下一個年級的課綱索引變動'
);
assert.match(sentEmailMessages.at(-1).body, /高二上/);
assert.match(sentEmailMessages.at(-1).body, /- 115-1 高二—必修/);
assert.match(sentEmailMessages.at(-1).body, /\+ 115-1 高二—必修（預先更新）/);
assert.match(sentEmailMessages.at(-1).htmlBody, /background:#fae3df/);
assert.match(sentEmailMessages.at(-1).htmlBody, /background:#dcefe7/);

liveOutlineIndexValues[3][2] = '115-2 高一—必修（更新）';
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
assert.equal(
  context.readChunkedJson_('TSCHOOL_COURSE_OUTLINE_INDEX_CACHE', null)
    .changeNotice.semesterReviews[0].rows[0].sign,
  '-',
  '課綱索引通知寄送失敗後應保留 Review 差異資料'
);
context.resetCourseOutlineSourceIndexRuntimeCache_();
context.loadCourseOutlineSourceIndex_();
assert.equal(sentEmailMessages.length, emailsBeforeFailedOutlineIndexNotice + 1);
assert.match(sentEmailMessages.at(-1).body, /- 115-2 高一—必修/);
assert.match(sentEmailMessages.at(-1).body, /\+ 115-2 高一—必修（更新）/);
assert.match(sentEmailMessages.at(-1).htmlBody, />-<\/td>/);
assert.match(sentEmailMessages.at(-1).htmlBody, />\+<\/td>/);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    context.readChunkedJson_('TSCHOOL_COURSE_OUTLINE_INDEX_CACHE', null),
    'changeNotice'
  ),
  false,
  '下一次成功讀取相同索引時應重試並完成待寄通知'
);
context.clearChunkedStore_('TSCHOOL_SETTINGS');

context.Sheets = {
  Spreadsheets: {
    get() {
      throw new Error('模擬中央索引暫時無法讀取');
    },
    Values: {
      batchGet() {
        throw new Error('模擬中央索引暫時無法讀取');
      }
    }
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
  instantNotificationsEnabled: false,
  notificationHours: [(Number(formatDate(new Date(), 'H')) + 1) % 24],
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
assert.match(sentEmailSubjects.at(-1), /需要重新選課/);
assert.match(
  sentEmailMessages.at(-1).body,
  /已進入新學期，為避免把上學期的選課直接套到新學期，請重新選課/
);
assert.match(
  sentEmailMessages.at(-1).htmlBody,
  /在行程同步控制臺選擇「T-SCHOOL Schedule Sync」→「開啟控制臺介面」/
);
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
  notificationHours: [Number(formatDate(new Date(), 'H'))],
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

let outlineSheetValuesCalls = 0;
let nextOutlineSheetId = 10;
function makeOutlineSheet(name, values, mergedRanges) {
  return {
    properties: { sheetId: nextOutlineSheetId++, title: name },
    merges: mergedRanges || [],
    testValues: values
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
context.Sheets = {
  Spreadsheets: {
    get(id, options) {
      openedOutlineWorkbookIds.push(id);
      assert.equal(options.includeGridData, false);
      return {
        properties: { title: `課綱-${id.slice(0, 4)}` },
        sheets: outlineWorkbookSheets[id] || []
      };
    },
    Values: {
      batchGet(id, options) {
        outlineSheetValuesCalls += 1;
        const sheets = outlineWorkbookSheets[id] || [];
        return {
          valueRanges: Array.from(options.ranges, quotedTitle => {
            const title = String(quotedTitle).slice(1, -1).replace(/''/g, "'");
            const sheet = sheets.find(item => item.properties.title === title);
            return { values: sheet ? sheet.testValues : [] };
          })
        };
      },
    }
  }
};
const collectedOutlineSnapshot = context.collectCourseOutlineSnapshot_(
  { gradeName: '高二' },
  { termKey: '二年級|2026-02-23' },
  [Object.assign({}, outlineBaseItem)],
  [configuredHigh2OutlineSet]
);
assert.equal(outlineSheetValuesCalls, 1);
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
  instantNotificationsEnabled: false,
  notificationHours: [5, 22],
  notifySyncHour: 22
});
const fixedScheduleTriggers = projectTriggers
  .filter(trigger => trigger.getHandlerFunction() === 'syncMyScheduleToCalendar');
assert.equal(fixedScheduleTriggers.length, 4);
assert.deepEqual(
  fixedScheduleTriggers.map(trigger => trigger.schedule.hour).sort((a, b) => a - b),
  [3, 11, 18, 21],
  '通知設定不得改變固定的四個課表偵測與 Calendar 同步時段'
);
assert.deepEqual(
  fixedScheduleTriggers.map(trigger => trigger.schedule.nearMinute),
  [0, 0, 0, 0],
  '固定同步時段應使用整點前後約 15 分鐘的 time-driven trigger'
);
assert.deepEqual(
  projectTriggers
    .filter(trigger => trigger.getHandlerFunction() === 'sendScheduledNotifications')
    .map(trigger => trigger.schedule.hour),
  [5],
  '非最後通知時間只能建立通知寄送 Trigger'
);
assert.deepEqual(
  projectTriggers
    .filter(trigger =>
      trigger.getHandlerFunction() === 'sendScheduledNotificationsWithDailySummary'
    )
    .map(trigger => trigger.schedule.hour),
  [22],
  '最後一個通知時間應寄送待寄異動，無異動時才寄每日成功摘要'
);
context.refreshAutoSyncTriggers_({
  gradeName: '高一',
  autoSyncEnabled: true,
  instantNotificationsEnabled: true,
  notificationHours: [5, 22],
  notifySyncHour: 22
});
assert.deepEqual(
  projectTriggers
    .filter(trigger =>
      trigger.getHandlerFunction() === 'sendScheduledNotificationsWithDailySummary'
    )
    .map(trigger => trigger.schedule.hour),
  [6],
  '即時通知開啟時應只在 06:00 建立每日摘要 Trigger'
);
assert.equal(
  projectTriggers.some(trigger =>
    trigger.getHandlerFunction() === 'sendScheduledNotifications'
  ),
  false,
  '即時通知開啟時不應建立自訂時間的佇列寄送 Trigger'
);
assert.equal(
  projectTriggers.some(trigger => trigger.getHandlerFunction() === 'refreshCourseOutlinesDaily'),
  false,
  '高一不得建立目前四份高二課綱的讀取觸發器'
);
context.refreshAutoSyncTriggers_({
  gradeName: '高二',
  autoSyncEnabled: true,
  instantNotificationsEnabled: false,
  notificationHours: [5],
  notifySyncHour: 5
});
assert.equal(
  projectTriggers.filter(trigger => trigger.getHandlerFunction() === 'refreshCourseOutlinesDaily').length,
  1,
  '高二應建立一個獨立的每日課綱更新觸發器'
);
assert.equal(
  projectTriggers.find(
    trigger => trigger.getHandlerFunction() === 'refreshCourseOutlinesDaily'
  ).schedule.hour,
  1,
  '課綱更新應安排在最早固定同步時段 03:00 的約兩小時前'
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
assert.match(sentEmailMessages.at(-1).subject, /課綱更新失敗/);
assert.match(sentEmailMessages.at(-1).htmlBody, /課綱更新失敗/);
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
  const runtimePeriodCounts = context.countScheduledPeriodsByTitle_(payload);
  assert.equal(
    runtimeSummary.catalog.activities.every(item =>
      context.classifyScheduleTitle_(item.title, runtimePeriodCounts) === 'activity'
    ),
    true
  );

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
