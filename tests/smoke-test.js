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
  '5f31cd2fb263b9b5e579eab0d25c1b4f278f854f/notification-email-templates.json';
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
const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const viteConfigSource = fs.readFileSync(path.join(root, 'vite.config.mjs'), 'utf8');
const scheduleDataSource = fs.readFileSync(path.join(root, 'schedule-data.js'), 'utf8');
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

assert.equal(packageManifest.scripts.dev, 'vite --host 127.0.0.1');
assert.match(packageManifest.devDependencies.vite, /^\^6\./);
assert.equal(packageLock.packages[''].devDependencies.vite, packageManifest.devDependencies.vite);
assert.match(viteConfigSource, /command === 'serve'/);
assert.match(viteConfigSource, /connect-src 'self' ws:/);
assert.match(viteConfigSource, /server\.ws\.send\(\{ type: 'full-reload', path: '\*' \}\)/);
assert.equal(
  configuratorHtml.includes("connect-src 'self' ws:"),
  false,
  '正式靜態首頁不應保留只供 Vite HMR 使用的 WebSocket CSP'
);

assert.equal(configuratorHtml.includes('id="instant-notifications"'), true);
assert.equal(
  configuratorHtml.includes('id="instant-notifications" name="instantNotificationsEnabled" type="checkbox" role="switch" checked'),
  true,
  '網站即時通知應預設開啟'
);
assert.equal(configuratorHtml.includes('偵測到行程調整就盡快通知'), true);
assert.equal(configuratorHtml.includes('Email 和通知偏好都沒錯 ↵'), true);
assert.equal(
  configuratorAppSource.includes("initial: 'Email 和通知偏好都沒錯 ↵'"),
  true,
  '通知設定進入修正狀態後，按鈕文案仍應恢復既定的「通知偏好」用語'
);
assert.equal(configuratorAppSource.includes('initMobileOutput'), false);
assert.equal(configuratorAppSource.includes('bindMobileOutputToggle'), false);
assert.equal(configuratorAppSource.includes('initCodeDisclosure'), false);
assert.equal(configuratorAppSource.includes('fullCodeToggle'), false);
[
  'wizard-progress',
  'filter-tabs',
  'advanced-settings',
  'code-window-bar',
  'output-actions'
].forEach(obsoleteClassName => {
  assert.equal(
    configuratorStylesSource.includes(`.${obsoleteClassName}`),
    false,
    `已移除的舊版樣式不得重新出現：${obsoleteClassName}`
  );
});
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
  /<ol class="desktop-next-steps">\s*<li><a[^>]*class="desktop-step-link is-disabled"[^>]*id="copy-setup-code-step"[^>]*>複製設定碼<\/a><\/li>\s*<li>登入/,
  '電腦版後續指引應以一般文字連結「複製設定碼」作為第一步，原三步依序後移'
);
assert.equal(configuratorHtml.includes('在電腦上收信，依照信中指引完成後續操作'), true);
assert.match(
  configuratorAppSource,
  /elements\.copyCodeStep\?\.addEventListener\('click', event => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?copyGeneratedCode\(event\);/,
  '第一步文字連結應阻止錨點跳動並沿用現有的設定碼複製流程'
);
assert.equal(
  configuratorAppSource.includes("elements.copyCodeStep.textContent = '再次複製設定碼'"),
  false,
  '步驟一完成複製後仍應保持「複製設定碼」，不得改寫步驟文字'
);
assert.match(
  configuratorStylesSource,
  /\.control-panel-card \.desktop-step-link \{[\s\S]*?display: inline;[\s\S]*?min-height: 0;[\s\S]*?padding: 0;[\s\S]*?text-decoration: underline;[\s\S]*?text-underline-offset: 0\.12em;/,
  '第五步 inline action 應使用正常行內文字與原生底線，不得擴大行盒或以 border-bottom 假裝底線'
);
assert.match(
  configuratorAppSource,
  /function updateGeneratedCodeAvailability\(sourceReady\)[\s\S]*?elements\.copyCodeStep\.classList\.toggle\('is-disabled', !enabled\);/,
  '後續指引的複製文字連結應與主要複製按鈕共用可用狀態'
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
assert.equal(
  setupDialogHtml.includes('受組織隱私設定限制，無法確認目前 Google 帳號'),
  true,
  '無法讀取 Google 帳號時，匯入頁必須要求使用者自行確認'
);
assert.equal(
  setupDialogHtml.includes("openButton.textContent = '我已確認，開啟控制臺'"),
  true,
  '帳號無法驗證時不得立刻關閉提示，應要求一次明確確認'
);
assert.match(
  setupDialogHtml,
  /importSetupCodeFromUi\(codeInput\.value, unverifiedAccountConfirmed\)/,
  '帳號無法驗證時，第二次確認必須送回後端後才可真正匯入'
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
const setupTransferCapabilityStart = configuratorAppSource.indexOf(
  'function shouldOfferEmailSetupTransferForCapabilities(capabilities = {})'
);
const setupTransferCapabilityEnd = configuratorAppSource.indexOf(
  '\nfunction shouldOfferEmailSetupTransfer()',
  setupTransferCapabilityStart
);
assert.notEqual(setupTransferCapabilityStart, -1);
assert.notEqual(setupTransferCapabilityEnd, -1);
const setupTransferCapabilitySandbox = {};
vm.runInNewContext(
  `${configuratorAppSource.slice(setupTransferCapabilityStart, setupTransferCapabilityEnd)}\n` +
    'this.detectSetupTransfer = shouldOfferEmailSetupTransferForCapabilities;',
  setupTransferCapabilitySandbox
);
const detectSetupTransfer = setupTransferCapabilitySandbox.detectSetupTransfer;
assert.equal(
  detectSetupTransfer({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
    primaryPointerCoarse: true,
    anyPointerFine: true
  }),
  true,
  'iPadOS 桌面級 Safari 即使同時有精細指標，也應提供寄送設定信'
);
assert.equal(
  detectSetupTransfer({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    anyPointerFine: true
  }),
  false,
  '沒有觸控能力的 Mac 不應誤判為 iPad'
);
assert.equal(
  detectSetupTransfer({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    platform: 'Win32',
    maxTouchPoints: 10,
    primaryPointerCoarse: true,
    anyPointerFine: true
  }),
  false,
  '同時有觸控與滑鼠的 Windows 裝置不應只因觸控能力被誤判'
);
assert.equal(
  detectSetupTransfer({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }),
  true,
  'iPhone 行動 user-agent 應提供寄送設定信'
);
assert.match(
  configuratorAppSource,
  /function shouldOfferEmailSetupTransfer\(\)[\s\S]*?navigator\.maxTouchPoints[\s\S]*?pointer: coarse/,
  '裝置判定應把 iPad 多點觸控能力與既有粗指標 fallback 傳入純函式'
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
assert.equal(
  fs.readFileSync(path.join(root, 'vendor', 'lenis-1.3.25.min.js'), 'utf8')
    .includes('sourceMappingURL=lenis.min.js.map'),
  false,
  '未提供 source map 時不得保留失效引用，避免開發伺服器持續輸出警告'
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
assert.equal(sidebarHtml.includes('function pollSyncProgress(generation)'), true);
assert.equal(sidebarHtml.includes('id="sync-progress-warning"'), true);
assert.equal(sidebarHtml.includes('請勿現在關閉控制臺！'), true);
assert.equal(sidebarHtml.includes('id="stop-sync" role="menuitem">停止同步</button>'), true);
assert.equal(
  sidebarHtml.includes('id="remove-managed-events" role="menuitem">移除受管理事件</button>'),
  true
);
assert.equal(sidebarHtml.includes("runAction('stopAutoSyncFromUi'"), true);
assert.equal(sidebarHtml.includes("runAction('removeManagedEventsFromUi'"), true);
assert.equal(
  sidebarHtml.includes('已開始的背景同步仍會完成。既有事件會保留。是否繼續？'),
  true
);
assert.equal(
  sidebarHtml.includes('若自動同步仍開啟，後續可能重新建立這些事件。是否繼續？'),
  true
);
assert.equal(sidebarHtml.includes('現在可以關閉控制臺'), true);
assert.match(
  sidebarHtml,
  /if \(result\.pending\)[\s\S]*?setBusy\(true, '同步已在背景分批執行；現在可以關閉控制臺', true, false\);/,
  '只有後端回報 pending 後才能把當前同步標示為可關閉'
);
assert.match(
  sidebarHtml,
  /\['running', 'queued', 'retry_pending'\][\s\S]*?setBusy\(true, '背景同步仍在執行；現在可以關閉控制臺', true, false\);/,
  '重新開啟控制臺時，已持久化的背景工作應標示為可關閉'
);
assert.match(
  sidebarHtml,
  /\.sync-progress-warning\[data-safe-to-close="true"\] \{ color: var\(--sync-dark\); \}/,
  '可安全關閉時應使用既有深綠色票'
);
assert.equal(sidebarHtml.includes('id="toast-close" aria-label="關閉通知"'), true);
assert.equal(sidebarHtml.includes('class="toast" id="toast" hidden'), true);
assert.equal(sidebarHtml.includes('showToast.timer'), false, '彈出式通知不得自動消失');
assert.equal(
  sidebarHtml.includes("byId('toast-close').addEventListener('click', dismissToast)"),
  true,
  '彈出式通知必須由使用者手動關閉'
);
assert.match(
  sidebarHtml,
  /byId\('toast-close'\)\.addEventListener\('keydown',[\s\S]*?event\.key !== 'Enter'[\s\S]*?event\.key !== ' '/,
  '彈出式通知必須可用 Enter 或空白鍵關閉'
);
assert.equal(
  sidebarHtml.includes("document.querySelectorAll('button:not(#toast-close)')"),
  true,
  '同步期間仍必須可關閉彈出式通知'
);
assert.equal(sidebarHtml.includes('側欄'), false, '控制臺內的使用者提示不應再稱為側欄');
assert.equal(
  sidebarHtml.includes("itemCount + ' 項行程'"),
  false,
  '控制臺課表來源摘要不應顯示行程數量'
);
['--field-label-gap', '--field-hint-gap', '--field-gap', '--field-group-gap'].forEach(token => {
  assert.equal(sidebarHtml.includes(token), true, `控制臺應定義用途型間距 token ${token}`);
});
assert.match(
  sidebarHtml,
  /id="calendar-create"[\s\S]*?id="calendar-create-hint"[\s\S]*?<\/div>[\s\S]*?<\/div>/,
  '日曆建立提示應收在建立日曆群組內'
);
[
  ['calendar-name', 'calendar-create-hint'],
  ['email', 'email-hint']
].forEach(([controlId, hintId]) => {
  assert.match(
    sidebarHtml,
    new RegExp(`id="${controlId}"[^>]*aria-describedby="${hintId}"`),
    `控制項 ${controlId} 應與提示 ${hintId} 建立無障礙關聯`
  );
});
assert.equal(
  sidebarHtml.includes('data-notify-hour aria-describedby="notification-time-hint"'),
  true,
  '通知時間選單應與技術限制提示建立無障礙關聯'
);
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
  false
);
assert.equal(sidebarHtml.includes("'sync-updated': Number(status && status.updated) || 0"), true);
assert.match(sidebarHtml, /<span>調整<\/span><strong id="sync-updated">/);
assert.match(sidebarHtml, /<span>取消<\/span><strong id="sync-deleted">/);
assert.equal(
  sidebarHtml.includes(
    "'、調整 ' + preview.updated + '、取消 ' + preview.deleted + '、未變更 ' + preview.unchanged"
  ),
  true,
  '同步前確認應使用與狀態面板相同的異動類型'
);
assert.equal(
  sidebarHtml.includes("'、更新 ' + preview.updated + '、移除 ' + preview.deleted"),
  false
);
assert.equal(sidebarHtml.includes('id="status-message" role="alert" hidden'), true);
assert.equal(sidebarHtml.includes('class="grade-options" role="radiogroup" aria-label="選年級"'), true);
assert.equal(sidebarHtml.includes('<span>同步目標日曆</span>'), true);
assert.equal(sidebarHtml.includes('<span>同步目標</span>'), false);
assert.equal(sidebarHtml.includes('<span>行程提醒</span>'), true);
assert.equal(
  sidebarHtml.indexOf('<span>行程提醒</span>') > calendarHeadingIndex &&
    sidebarHtml.indexOf('<span>行程提醒</span>') < gradeHeadingIndex,
  true
);
assert.equal((sidebarHtml.match(/data-reminder-minute value=/g) || []).length, 4);
assert.equal(sidebarHtml.includes('id="reminder-minutes"'), false);
assert.equal(sidebarHtml.includes('可複選；每個時間都會建立一次提醒。'), true);
assert.equal(sidebarHtml.includes('reminderMinutesList: reminderMinutesList'), true);
assert.equal(sidebarHtml.includes('請至少保留一個提前時間'), true);
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
assert.equal(sidebarHtml.includes('id="term-grade-confirmed"'), true);
assert.equal(sidebarHtml.includes('系統會觀察 30 分鐘'), true);
assert.equal(sidebarHtml.includes('var verifyingTerm = Boolean('), true);
assert.match(
  sidebarHtml,
  /\['save', 'save-sync'\][\s\S]*?sourceUnavailable \|\| verifyingTerm[\s\S]*?\['run-sync', 'repair-sync'\][\s\S]*?requiresSelection \|\| verifyingTerm/,
  '學期驗證中必須停用儲存、同步與修復'
);
assert.match(
  sidebarHtml,
  /data\.termTransition\.required \|\| data\.termTransition\.verifying[\s\S]*?byId\('term-transition'\)\.focus/,
  '學期驗證警示也必須取得焦點並被輔助技術宣告'
);
assert.equal(sidebarHtml.includes("server('getGradeContextForUi', event.target.value)"), true);
assert.equal(sidebarHtml.includes('var missingGradeConfirmation ='), true);
assert.equal(sidebarHtml.includes('function updateActionAvailability()'), true);
assert.equal(sidebarHtml.includes('var lastSyncProgressPercent = 0;'), true);
assert.equal(sidebarHtml.includes('var syncProgressPollGeneration = 0;'), true);
assert.equal(sidebarHtml.includes("var lastSyncProgressJobId = '';"), true);
assert.equal(
  sidebarHtml.includes('var value = Math.max(lastSyncProgressPercent, reportedValue);'),
  true,
  '同一同步工作顯示過的百分比不得因後端輪詢尚未建立進度而倒退'
);
assert.equal(
  sidebarHtml.includes("byId('loading-label').hidden = Boolean(showProgress);"),
  true,
  '顯示同步進度時不得在上方重複顯示「正在同步行程」'
);
assert.match(
  sidebarHtml,
  /function startSyncProgress\(label\)[\s\S]*?renderSyncProgress\(\{ percent: 0,/,
  '真正開始同步前，進度必須從 0% 顯示'
);
assert.equal(
  sidebarHtml.includes("message: '正在儲存設定並準備同步（可能需等待 0–10 分鐘）'"),
  true,
  '儲存設定的同步前階段應顯示固定等待時間提示'
);
assert.match(
  sidebarHtml,
  /if \(progressJobId && progressJobId !== lastSyncProgressJobId\) \{\s*lastSyncProgressJobId = progressJobId;\s*lastSyncProgressPercent = 0;/,
  '進度單調保護只能適用於同一 jobId，新工作必須重設百分比'
);
const sidebarPollStart = sidebarHtml.indexOf('function pollSyncProgress(generation)');
const sidebarPollEnd = sidebarHtml.indexOf('function startSyncProgress(label)', sidebarPollStart);
const sidebarPollSource = sidebarHtml.slice(sidebarPollStart, sidebarPollEnd);
assert.equal(sidebarPollStart >= 0 && sidebarPollEnd > sidebarPollStart, true);
assert.equal(
  sidebarPollSource.indexOf("if (terminal && (!activeSyncJobId || progress.jobId !== activeSyncJobId))") <
    sidebarPollSource.indexOf('renderSyncProgress(progress);'),
  true,
  '新同步建立前讀到的舊 complete/error 進度必須先丟棄，不得先渲染為 100%'
);
assert.match(
  sidebarPollSource,
  /if \(pollGeneration !== syncProgressPollGeneration\) return;/,
  '上一輪尚在途中的輪詢回應不得覆蓋新同步工作'
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
['待首次同步', '需檢查狀態', '待重新選擇課程與活動', '狀態正常'].forEach(statusLabel => {
  assert.equal(sidebarHtml.includes(statusLabel), true);
});
assert.equal(sidebarHtml.includes('同步功能正常'), false);
assert.equal(sidebarHtml.includes("? '同步正常'"), false);
assert.equal(sidebarHtml.includes('需要檢查同步狀態'), false);
assert.equal(sidebarHtml.includes('尚未完成第一次同步'), false);
assert.equal(sidebarHtml.includes('<h2>課程與活動</h2>'), true);
['<h2>設定日曆</h2>', '<h2>選年級</h2>', '<h2>選課程和活動</h2>', '<h2>行程</h2>'].forEach(
  obsoleteHeading => {
    assert.equal(sidebarHtml.includes(obsoleteHeading), false);
  }
);
assert.equal(sidebarHtml.includes('輸入課程、活動名稱或班別等'), true);
assert.equal(sidebarHtml.includes('學期間課程與活動'), true);
assert.equal(sidebarHtml.includes('寒暑假期間課程與活動'), true);
assert.equal(sidebarHtml.includes("renderCourseGroup('學期間課程'"), false);
assert.equal(sidebarHtml.includes("renderCourseGroup('學期間活動'"), false);
assert.equal(sidebarHtml.includes('<span>收通知的 Email</span>'), true);
assert.equal(
  sidebarHtml.includes('<small class="hint field-hint" id="email-hint">為了讓程式能存取課綱，請輸入校內 Email</small>'),
  true
);
assert.equal(sidebarHtml.includes('<span>通知 Email</span>'), false);
assert.equal(
  sidebarHtml.includes('.field > span { margin-bottom: var(--field-label-gap); color: var(--ink);'),
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
assert.match(
  sidebarHtml,
  /function updateActionAvailability\(\)[\s\S]*?sourceUnavailable[\s\S]*?byId\('create-calendar'\)\.disabled = sourceUnavailable[\s\S]*?input\[name="grade"\]/,
  '課表來源離線時除同步與儲存外，也不得建立額外 Calendar 或切換年級'
);
assert.equal(
  sidebarHtml.includes('正在準備未來 30 天的課綱資料（可能需等待 0–10 分鐘）'),
  true
);
assert.equal(sidebarHtml.includes('<span>每日成功摘要</span>'), false);
assert.equal(sidebarHtml.includes('id="include-activities"'), false);
assert.equal(configuratorHtml.includes('id="high-load-test-banner"'), false);
[
  ['1', '選年級'],
  ['2', '選課程與活動'],
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
assert.match(emailTemplateManifest.notifications.sync_success.content, />調整<\/span>/);
assert.match(emailTemplateManifest.notifications.sync_success.content, />取消<\/span>/);
assert.doesNotMatch(emailTemplateManifest.notifications.sync_success.content, />更新<\/span>/);
assert.doesNotMatch(emailTemplateManifest.notifications.sync_success.content, />移除<\/span>/);
assert.match(
  emailTemplateManifest.notifications.term_transition.content,
  /新增、調整、取消與未變更的預覽結果/
);
assert.equal(
  emailTemplateManifest.notifications.term_transition.content.includes('新增與移除預覽'),
  false
);
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
  '需要重新選擇課程與活動'
);
assert.equal(
  emailTemplateManifest.notifications.term_transition.lede,
  '已進入新學期，為避免把上學期的選擇直接套到新學期，請重新選擇課程與活動'
);
assert.equal(
  emailTemplateManifest.notifications.term_transition.content.includes('完整保留'),
  false,
  '新學期通知不得宣稱所有舊學期未來事件都會永久保留'
);
assert.equal(
  emailTemplateManifest.notifications.term_transition.content.includes('確認新學期就讀年級'),
  true,
  '新學期通知必須提醒使用者明確確認升年級後的年級'
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
  false
);
assert.equal(
  emailTemplateManifest.shell.includes('>{{controlPanelName}}</p>'),
  true
);
assert.equal(emailTemplateManifest.shell.includes('這封信由'), false);
assert.equal(
  emailTemplateManifest.notifications.schedule_changes.content.includes(
    'margin:24px 0 0;font-size:12px;line-height:1.7;color:#4f5d57;'
  ),
  true,
  '行程調整說明應沿用信件 spacing 與次要文字規格'
);
assert.equal(
  emailTemplateManifest.notifications.schedule_changes.content.includes(
    '＊部分資訊來自課綱，請以教師最新說明為主'
  ),
  true
);
assert.equal(
  emailTemplateManifest.notifications.schedule_changes.repeaters.changesHtml.template.includes(
    '{{type}}'
  ),
  false,
  '行程調整卡片標題列不應顯示異動類型標籤'
);
assert.equal(
  emailTemplateManifest.notifications.schedule_changes.repeaters.changesHtml.template.includes(
    'float:right'
  ),
  false
);
assert.equal(emailTemplateManifestText.includes('課表異動'), false);
assert.equal(configuratorAppSource.includes('HIGH_LOAD_TEST_QUERY_PARAMETER'), false);
assert.equal(
  configuratorAppSource.includes("'寒暑假期間課程與活動'"),
  true,
  '有寒暑假資料時應顯示獨立的行程區段'
);
assert.equal(
  configuratorAppSource.includes("hasVacationItems ? '學期間課程與活動' : ''"),
  true,
  '只有單一期間清單時，網站不應額外顯示泛稱「行程」h3'
);
assert.equal(
  sidebarHtml.includes("hasVacationItems ? '學期間課程與活動' : ''"),
  true,
  '只有單一期間清單時，控制臺不應額外顯示泛稱「行程」h3'
);
assert.equal(configuratorHtml.includes('<p id="course-count">已選 0 項</p>'), true);
assert.equal(configuratorHtml.includes('已選 0 項行程'), false);
assert.equal(configuratorAppSource.includes('function seedDefaultSelections('), true);
assert.equal(
  configuratorAppSource.includes('.filter(item => isDefaultSelectedTitle(item.title))'),
  true,
  '設定網站應只在來源首次載入時加入明確的預設勾選項目'
);
assert.equal(sidebarHtml.includes('function seedDefaultSelections(source)'), true);
assert.equal(sidebarHtml.includes("byId('course-count').textContent = '已選 ' + selectedCount + ' 項';"), true);
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
['--heading-copy-gap', '--instruction-heading-gap', '--instruction-item-gap'].forEach(token => {
  assert.equal(
    configuratorStylesSource.includes(token),
    true,
    `第五步應使用用途型間距 token ${token}`
  );
});
assert.match(
  configuratorStylesSource,
  /\.control-panel-card \.output-heading > div \{[\s\S]*?display: grid;[\s\S]*?gap: var\(--heading-copy-gap\);/,
  '第五步標題與說明應由同一容器的 gap 統一排列'
);
assert.equal(
  configuratorStylesSource.includes('margin-bottom: 33px;'),
  false,
  '第五步標題不得保留脫離共用間距網格的 33px 例外'
);
assert.match(
  configuratorStylesSource,
  /\.control-panel-card \.next-steps \{[\s\S]*?display: grid;[\s\S]*?gap: var\(--instruction-heading-gap\);/,
  '操作指引小標與內容應由群組 gap 統一控制'
);
assert.match(
  configuratorStylesSource,
  /\.control-panel-card \.desktop-next-steps \{[\s\S]*?display: grid;[\s\S]*?gap: var\(--instruction-item-gap\);[\s\S]*?margin: 0;/,
  '桌機操作指引內文間距應由單一 grid gap 控制'
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
  /data-initial-label="實體課 \[吉林基地\]" data-final-label="實體課 \[吉林基地-協作坊\]"[\s\S]*?data-initial-label="線上課 \[線上教室\]" data-final-label="線上課 \[線上教室\]"[\s\S]*?data-initial-label="學習分享會 \[弘道基地\]" data-final-label="學習分享會 \[弘道基地-未來教室\]"/,
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
assert.equal(configuratorAppSource.includes('selectedTitlesByGrade: new Map()'), true);
assert.equal(configuratorAppSource.includes('selectedCoursesByGrade'), false);
assert.equal(configuratorAppSource.includes('includeActivities'), false);
assert.equal(configuratorAppSource.includes('excludedActivities'), false);
assert.equal(sidebarHtml.includes('var selectedTitles = new Set();'), true);
assert.equal(sidebarHtml.includes('selectedTitles: Array.from(selectedTitles)'), true);
assert.equal(sidebarHtml.includes('selectedCourses'), false);
assert.equal(sidebarHtml.includes('includeActivities'), false);
assert.equal(sidebarHtml.includes('excludedActivities'), false);
assert.equal(
  sidebarHtml.includes("var NATURAL_ADVANCED_BASE_TITLE = '自然進階(二)';"),
  true,
  '控制臺前端必須識別並排除自然進階共同事件的隱藏選擇'
);
assert.equal(
  sidebarHtml.includes('return !isCourseSelectionHidden(title);'),
  true,
  '控制臺前端不得把自然進階共同事件當成獨立勾選或待確認狀態保存'
);
assert.equal(
  configuratorAppSource.includes('isCourseSelectionHidden(item.title)'),
  true,
  '網站課程選擇介面必須隱藏自然進階共同事件'
);
assert.equal(
  configuratorAppSource.includes('applyCourseSelectionRules(Array.from(selected)'),
  true,
  '網站產生設定時必須套用自然進階衍生選擇規則'
);
const configuratorRenderCoursesSource = configuratorAppSource.slice(
  configuratorAppSource.indexOf('function renderCourses()'),
  configuratorAppSource.indexOf('function renderCourseSection(')
);
const sidebarRenderCoursesSource = sidebarHtml.slice(
  sidebarHtml.indexOf('function renderCourses()'),
  sidebarHtml.indexOf('function updateCourseScrollShadows()')
);
assert.equal(
  configuratorRenderCoursesSource.includes('.sort('),
  false,
  '網站搜尋只能過濾 schedule-data 已排定的順序'
);
assert.equal(
  sidebarRenderCoursesSource.includes('.sort('),
  false,
  '控制臺搜尋只能過濾已排定的目錄順序'
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
    cells: [
      { value: '來源左欄鐘點' },
      { value: '1' },
      {
        value: entriesByWeek[index] || '',
        day: 1,
        period: 1,
        rowSpan
      }
    ]
  }));

  while (rows.length < 10) {
    rows.push({
      isHeader: false,
      weekNum: String(weekNumbers[0]),
      cells: [{ value: '' }, { value: '' }, { value: '' }]
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
  Object.keys(vacationCatalog).sort(),
  ['all', 'termItems', 'vacationItems'],
  '行程目錄只保留完整清單與學期／寒暑假區段'
);
assert.equal(
  vacationCatalog.all.every(item =>
    Object.keys(item).sort().join(',') === 'period,title' &&
    !Object.prototype.hasOwnProperty.call(item, 'type')
  ),
  true,
  '正常行程目錄項目只能有 title 與 period'
);
assert.deepEqual(
  vacationCatalog.vacationItems.map(item => item.title).sort(),
  ['暑假課程', '模擬考Day1'].sort(),
  '寒暑假區段的行程應進入同一區段'
);
assert.equal(
  vacationCatalog.termItems.find(item => item.title === '學期間課程').period,
  'term'
);
assert.equal(
  vacationCatalog.termItems.find(item => item.title === '全校活動').period,
  'term'
);

const regularCatalog = scheduleData.extractCatalog(makeCatalogPayload(
  [1, 2, 3],
  ['學期間課程', '全校活動', '另一門課']
));
assert.equal(
  regularCatalog.vacationItems.length,
  0,
  '連續週次的課表應只有學期間行程'
);
assert.equal(
  scheduleDataSource.includes('MIN_COURSE_SCHEDULED_PERIODS'),
  false,
  '中性行程模型不應保留節數分類邊界'
);
const lowPeriodCatalog = scheduleData.extractCatalog(makeCatalogPayload(
  [1],
  ['沒有活動關鍵字的單次講座'],
  4
));
assert.deepEqual(
  lowPeriodCatalog.all,
  [{ title: '沒有活動關鍵字的單次講座', period: 'term' }],
  '項目不得再依排定節數判定類別'
);
const boundaryPeriodCatalog = scheduleData.extractCatalog(makeCatalogPayload(
  [1],
  ['五節正式課程'],
  5
));
assert.deepEqual(
  boundaryPeriodCatalog.all,
  [{ title: '五節正式課程', period: 'term' }],
  '五節項目與單次項目應使用同一中性資料結構'
);
assert.equal(scheduleDataSource.includes('function classifyScheduleTitle'), false);
assert.equal(scheduleDataSource.includes('ACTIVITY_TITLE_PATTERNS'), false);

const similarityCatalogItems = [
  { title: '數學（二）星河班', period: 'term' },
  { title: '國與文進階（一）', period: 'term' },
  { title: '國語文（三）山嵐班', period: 'term' },
  { title: '國語文（三）海風班', period: 'term' },
  { title: '自然探索', period: 'term' }
];
const similarityOrder = scheduleData.sortCatalogItemsBySimilarity(similarityCatalogItems)
  .map(item => item.title);
const reversedSimilarityOrder = scheduleData.sortCatalogItemsBySimilarity(
  similarityCatalogItems.slice().reverse()
).map(item => item.title);
assert.deepEqual(
  reversedSimilarityOrder,
  similarityOrder,
  '相似度排序不得因課表輸入順序改變'
);
const seaClassIndex = similarityOrder.indexOf('國語文（三）海風班');
const mountainClassIndex = similarityOrder.indexOf('國語文（三）山嵐班');
const advancedChineseIndex = similarityOrder.indexOf('國與文進階（一）');
assert.equal(
  Math.abs(seaClassIndex - mountainClassIndex),
  1,
  '同課名的不同班別必須相鄰'
);
assert.equal(
  advancedChineseIndex > Math.min(seaClassIndex, mountainClassIndex) &&
    advancedChineseIndex < Math.max(seaClassIndex, mountainClassIndex),
  false,
  '「國與文進階（一）」不得插入兩個國語文班別之間'
);

[
  '全校活動',
  '學習分享會',
  '中秋節放假',
  '週六補課',
  '國定假日',
  '第一次模考',
  '第二次模擬考',
  '開學日',
  '開學典禮',
  '始業式',
  '結業式',
  '休業式'
].forEach(title => {
  assert.equal(
    scheduleData.isDefaultSelectedTitle(title),
    true,
    `「${title}」應套用預設勾選規則`
  );
});
['國語文（三）海風班', '自然探索', '期末考'].forEach(title => {
  assert.equal(
    scheduleData.isDefaultSelectedTitle(title),
    false,
    `「${title}」不應被預設勾選規則誤選`
  );
});
const selectionOrderItems = similarityCatalogItems.concat([
  { title: '全校活動', period: 'term' },
  { title: '學習分享會', period: 'term' },
  { title: '第二次模擬考', period: 'term' },
  { title: '中秋節放假', period: 'term' },
  { title: '開學典禮', period: 'term' },
  { title: '結業式', period: 'term' },
  { title: '休業式', period: 'term' }
]);
const selectionOrder = scheduleData.sortCatalogItemsForSelection(selectionOrderItems)
  .map(item => item.title);
const reversedSelectionOrder = scheduleData.sortCatalogItemsForSelection(
  selectionOrderItems.slice().reverse()
).map(item => item.title);
assert.deepEqual(
  reversedSelectionOrder,
  selectionOrder,
  '預設選項置底後仍不得因來源列順序改變'
);
const firstDefaultSelectionIndex = selectionOrder.findIndex(title =>
  scheduleData.isDefaultSelectedTitle(title)
);
assert.equal(firstDefaultSelectionIndex > 0, true);
assert.equal(
  selectionOrder.slice(firstDefaultSelectionIndex).every(title =>
    scheduleData.isDefaultSelectedTitle(title)
  ),
  true,
  '預設勾選項目必須排在同期間的一般選項之後'
);
assert.equal(
  Math.abs(
    selectionOrder.indexOf('國語文（三）海風班') -
    selectionOrder.indexOf('國語文（三）山嵐班')
  ),
  1,
  '置底規則不得拆開一般選項中的同課不同班別'
);

const naturalAdvancedCatalog = [
  { title: '自然進階(二)', period: 'term' },
  { title: '自然進階(二)_化學', period: 'term' },
  { title: '自然進階(二)_生物', period: 'term' },
  { title: '自然進階(二)_物理', period: 'term' },
  { title: '其他課程', period: 'term' },
  { title: '備註｜開放吉林六樓階梯教室自習。', period: 'term' }
];
assert.equal(scheduleData.isCourseSelectionHidden('自然進階(二)'), true);
assert.equal(scheduleData.isCourseSelectionHidden('自然進階(二)_化學'), false);
assert.equal(scheduleData.isCourseSelectionHidden('備註｜開放吉林六樓階梯教室自習。'), true);
assert.equal(
  scheduleData.makeScheduleNoteTitle('備註|開放吉林六樓階梯教室自習。'),
  '備註｜開放吉林六樓階梯教室自習。',
  '備註標題前綴必須正規化且不重複累加'
);
assert.deepEqual(
  scheduleData.applyCourseSelectionRules(
    ['自然進階(二)_化學', '自然進階(二)_生物'],
    naturalAdvancedCatalog
  ),
  ['自然進階(二)', '自然進階(二)_化學', '自然進階(二)_生物', '備註｜開放吉林六樓階梯教室自習。'],
  '選擇任一自然進階分科時必須自動包含共同事件，並固定納入備註'
);
assert.deepEqual(
  scheduleData.applyCourseSelectionRules(['自然進階(二)'], naturalAdvancedCatalog),
  ['備註｜開放吉林六樓階梯教室自習。'],
  '自然進階共同事件不得成為可單獨保存的選項，備註則必須固定納入'
);

const roundTripSetupCatalog = [
  { title: '公民／社會探究', period: 'term' },
  { title: '全校活動（上午）', period: 'term' }
];
const roundTripCatalogFingerprint = scheduleData.makeCatalogFingerprint(
  '二年級|2025-2',
  '2026-08-30',
  roundTripSetupCatalog
);
const roundTripSetupCode = setupCode.encode({
  appVersion: '2.0.0-rc.1',
  gradeName: '高二',
  termKey: '二年級|2025-2',
  initialCatalogFingerprintVersion: scheduleData.CATALOG_FINGERPRINT_VERSION,
  initialCatalogFingerprint: roundTripCatalogFingerprint,
  setupSourceSnapshot: {
    firstDateKey: '2026-02-23',
    lastDateKey: '2026-08-30',
    sourceUpdatedLabel: '更新時間\n08011200',
    items: roundTripSetupCatalog
  },
  selectedTitles: ['從巴士底到車諾比：歷史', '公民／社會探究', '程式設計 & AI'],
  notificationEmail: 'student+sync@example.com',
  instantNotificationsEnabled: false,
  notificationHours: [22, 6, 12, 18]
}, { createdAt: '2026-08-01T00:00:00.000Z' });
const decodedSetupCode = setupCode.decode(roundTripSetupCode);
assert.equal(roundTripSetupCode.startsWith('TSCHOOL_SETUP_V1.'), true);
assert.deepEqual(decodedSetupCode, {
  schemaVersion: 2,
  createdAt: '2026-08-01T00:00:00.000Z',
  generatorVersion: '2.0.0-rc.1',
  gradeName: '高二',
  termKey: '二年級|2025-2',
  catalogFingerprintVersion: 3,
  catalogFingerprint: roundTripCatalogFingerprint,
  selectedTitles: ['從巴士底到車諾比：歷史', '公民／社會探究', '程式設計 & AI'],
  notificationEmail: 'student+sync@example.com',
  instantNotificationsEnabled: false,
  notificationHours: [6, 12, 18, 22],
  sourceSnapshot: {
    firstDateKey: '2026-02-23',
    lastDateKey: '2026-08-30',
    sourceUpdatedLabel: '更新時間\n08011200',
    items: roundTripSetupCatalog
  }
});
assert.equal(setupCode.SCHEMA_VERSION, 2);
assert.equal(scheduleData.CATALOG_FINGERPRINT_VERSION, 3);
assert.equal(scheduleData.makeAcademicTermKey('二年級', '2026-08-24'), '二年級|2026-1');
assert.equal(scheduleData.makeAcademicTermKey('二年級', '2027-01-15'), '二年級|2026-1');
assert.equal(scheduleData.makeAcademicTermKey('二年級', '2027-02-01'), '二年級|2026-2');
assert.deepEqual(
  scheduleData.makeCatalogFingerprintRows(roundTripSetupCatalog),
  [
    ['全校活動（上午）', 'term'],
    ['公民／社會探究', 'term']
  ],
  '第 3 版目錄指紋只能使用 title 與 period'
);
['selectedCourses', 'includeActivities', 'excludedActivities', 'sourceFingerprint'].forEach(field => {
  assert.equal(Object.prototype.hasOwnProperty.call(decodedSetupCode, field), false);
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
  selectedTitles: ['公民'],
  descriptionPreset: 'standard',
  customDescription: '{course}',
  reminderMode: 'none',
  reminderMinutes: 10,
  initialTermKey: '',
  initialCatalogFingerprintVersion: 0,
  initialCatalogFingerprint: '',
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
assert.equal(
  generatedCode.includes('新增、調整、取消與未變更的預覽結果'),
  true,
  '新學期純文字通知應使用完整且一致的異動類型'
);
assert.equal(generatedCode.includes('新增與移除預覽'), false);
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
  'getGradeContextForUi',
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
assert.equal(generatedCode.includes('const SETTINGS_SCHEMA_VERSION = 9;'), true);
assert.equal(generatedCode.includes('const SETUP_CODE_SCHEMA_VERSION = 2;'), true);
assert.equal(generatedCode.includes('const SETUP_CATALOG_FINGERPRINT_VERSION = 3;'), true);
assert.equal(generatedCode.includes('const SETUP_CONTEXT_FINGERPRINT_VERSION = 3;'), true);
assert.equal(generatedCode.includes('const SCHEDULE_FINGERPRINT_VERSION = 4;'), true);
assert.equal(
  generatedCode.includes('source.fingerprint === settings.sourceFingerprint'),
  false,
  '產生的 Code.gs 不得再比較不同語意的通用指紋'
);
assert.match(
  generatedCode,
  /function saveSettingsAndSyncFromUi\(input\)[\s\S]*?catch \(error\) \{[\s\S]*?notifySyncFailureUnlessActionRequired_[\s\S]*?\}\s*return buildSyncUiResponse_\(/,
  '同步失敗通知的 catch 邊界必須排除同步完成後的 UI 重載'
);
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
  /function ensureDedicatedCalendar_\(settings\)[\s\S]*?const calendarName = buildDedicatedCalendarName_\(settings\);[\s\S]*?CalendarApp\.createCalendar\(calendarName, \{\s*selected: true\s*\}\)/,
  '首次同步自動建立的專用 Calendar 應預設顯示'
);
assert.match(
  generatedCode,
  /function ensureDedicatedCalendar_\(settings\)[\s\S]*?findRecoverableDedicatedCalendars_\(calendarName\)[\s\S]*?settings\.calendarId = recoverableCalendars\[0\]\.getId\(\)[\s\S]*?return recoverableCalendars\[0\]/,
  '日曆已建立但 Calendar ID 尚未保存時，下次必須接回同一個受管理日曆'
);
assert.equal(
  generatedCode.includes("const MANAGED_CALENDAR_COLOR = '#05a576';"),
  true
);
assert.match(
  generatedCode,
  /function applyNewManagedCalendarPresentation_\(calendar\)[\s\S]*?calendar\.setColor\(MANAGED_CALENDAR_COLOR\)/,
  '新建立的受管理行事曆應套用指定主題色'
);
assert.match(
  generatedCode,
  /function createDedicatedCalendarForUi\(input\)[\s\S]*?CalendarApp\.createCalendar[\s\S]*?applyNewManagedCalendarPresentation_\(calendar\)/,
  '控制臺建立的新行事曆應套用受管理行事曆外觀'
);
assert.doesNotMatch(
  generatedCode.slice(
    generatedCode.indexOf('function listOwnedCalendars_('),
    generatedCode.indexOf('function buildDedicatedCalendarName_(')
  ),
  /setColor\(/,
  '列出或選取使用者既有行事曆時不得改色'
);
assert.equal(generatedCode.includes('function previewSettingsImpactFromUi('), true);
assert.equal(generatedCode.includes('function showSettingsSidebar('), true);
assert.equal(generatedCode.includes('function showSetupImportDialog('), true);
assert.equal(generatedCode.includes('function previewSetupCodeForUi('), true);
assert.equal(generatedCode.includes('function activeGoogleAccountDoesNotMatch_('), true);
assert.equal(generatedCode.includes('function getActiveGoogleAccountCheck_('), true);
assert.equal(generatedCode.includes('function importSetupCodeFromUi('), true);
assert.equal(generatedCode.includes('function applySetupCodeFromUi('), true);
assert.match(
  generatedCode,
  /function showSettingsSidebar\(\) \{\s*ScriptApp\.requireAllScopes\(ScriptApp\.AuthMode\.FULL\);\s*const settings = loadSettings_\(\);/,
  '第一次開啟控制臺時必須先要求完整的既定 OAuth 權限，再讀取設定或顯示介面'
);
assert.equal(generatedCode.includes('lock.tryLock(3000)'), true);
assert.match(
  generatedCode,
  /function getSettingsUiData\(\)[\s\S]*?loadSourceContextForUi_\(observedSettings\)[\s\S]*?!source\.sourceUnavailable/,
  '控制臺讀取即時課表失敗時應改用唯讀摘要，且不得用摘要觸發學期轉銜'
);
assert.match(
  generatedCode,
  /function prepareFirstSyncCourseOutlinesFromUi\(input\)[\s\S]*?LockService\.getScriptLock\(\)[\s\S]*?tryLock\(3000\)[\s\S]*?finally \{\s*lock\.releaseLock\(\)/,
  '第一次同步前的課綱預載必須在同一把 Script Lock 內完成'
);
const syncScheduleFunctionSource = generatedCode.slice(
  generatedCode.indexOf('function syncSchedule_('),
  generatedCode.indexOf('function buildSyncJobInput_(')
);
assert.match(
  syncScheduleFunctionSource,
  /LockService\.getScriptLock\(\)[\s\S]*?tryLock\(15000\)[\s\S]*?registerNewTitles_\(settings, source\)/,
  '背景同步發現新標題與 SETTINGS_STORE 寫回必須位於 Script Lock 內'
);
const saveSettingsCoreFunctionSource = generatedCode.slice(
  generatedCode.indexOf('function saveSettingsCore_('),
  generatedCode.indexOf('function sanitizeSettingsInput_(')
);
assert.match(
  saveSettingsCoreFunctionSource,
  /LockService\.getScriptLock\(\)[\s\S]*?tryLock\(15000\)/,
  '前台儲存設定必須和背景同步使用同一種 Script Lock'
);
assert.match(
  saveSettingsCoreFunctionSource,
  /applyTermTransitionIfNeeded_\(oldSettings, source, true\)[\s\S]*?loadSourceObservation_\(\)\.termCandidate[\s\S]*?期間不能儲存、同步或修復/,
  '新學期驗證期間後端也必須拒絕儲存'
);
assert.match(
  syncScheduleFunctionSource,
  /resetSyncWatchdogTrigger_\(\)/,
  '每批同步開始前必須重設 watchdog，不得沿用殘留觸發器時間'
);
assert.doesNotMatch(
  generatedCode.slice(
    generatedCode.indexOf('function writeChunkedJson_('),
    generatedCode.indexOf('function splitUtf8Chunks_(')
  ),
  /deleteProperty\(/,
  '分塊寫入不得清除尾端 chunk，以免較舊的小寫入刪除較新的大寫入'
);
const quickDeleteFunctionSource = generatedCode.slice(
  generatedCode.indexOf('function quickDeleteSyncedCalendarEvents()'),
  generatedCode.indexOf('function removeManagedEventsFromCalendar_(')
);
assert.match(
  generatedCode,
  /function stopAutoSyncFromUi\(\)[\s\S]*?LockService\.getScriptLock\(\)[\s\S]*?settings\.autoSyncEnabled = false[\s\S]*?refreshAutoSyncTriggers_\(settings\)/,
  '控制臺停止同步必須在鎖內保存停用狀態並移除後續排程'
);
assert.match(
  generatedCode,
  /function removeManagedEventsFromUi\(\)[\s\S]*?quickDeleteSyncedCalendarEvents\(\)[\s\S]*?eventCount: 0/,
  '控制臺移除功能必須沿用受管理事件安全刪除並更新摘要'
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
assert.equal(
  generatedCode.includes('function getConfiguredCourseOutlineSourceSetsFromIndex_('),
  true,
  '控制臺課綱狀態必須能只使用已傳入的索引快取'
);
assert.match(
  generatedCode,
  /function getGradeContextForUi\(gradeName\)[\s\S]*?loadSourceContext_\(cleanGrade\)[\s\S]*?loadCourseOutlineSourceIndex_\(\)[\s\S]*?buildCourseOutlineUiStatus_/,
  '使用者主動切換年級時必須同時重讀最新課表與課綱索引狀態'
);
assert.equal(generatedCode.includes('function isTransientInitialLoadError(error)'), true);
assert.match(
  generatedCode,
  /function loadInitialUi\(\)[\s\S]*?isTransientInitialLoadError\(error\)[\s\S]*?setTimeout\(loadInitialUi, INITIAL_LOAD_RETRY_DELAY_MS\)/,
  '控制臺初次讀取碰到暫時鎖定時應自動重試，不得停在空白畫面'
);
assert.equal(generatedCode.includes('function getControlPanelUi_('), true);
assert.equal(generatedCode.includes('function getControlPanelUrl_('), true);
assert.equal(generatedCode.includes('function getControlPanelName_('), true);
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
assert.equal(generatedCode.includes('function classifyScheduleTitle_('), false);
assert.equal(generatedCode.includes('function countScheduledPeriodsByTitle_('), false);
assert.equal(generatedCode.includes('MIN_COURSE_SCHEDULED_PERIODS'), false);
assert.equal(generatedCode.includes('ACTIVITY_TITLE_PATTERNS'), false);
assert.equal(generatedCode.includes('活動｜'), false, '事件標題不得再加上活動分類前綴');
const runtimeCatalogParserSource = generatedCode.slice(
  generatedCode.indexOf('function extractCatalogFromPayload_('),
  generatedCode.indexOf('function inferHeaderDates_(')
);
assert.equal(runtimeCatalogParserSource.includes('.type'), false);
assert.equal(runtimeCatalogParserSource.includes('type:'), false);
const runtimeScheduleParserSource = generatedCode.slice(
  generatedCode.indexOf('function parseSchedulePayload_('),
  generatedCode.indexOf('function getVacationWeekNumbersFromPayload_(')
);
assert.equal(runtimeScheduleParserSource.includes('type:'), false);
const runtimeStateSerializerSource = generatedCode.slice(
  generatedCode.indexOf('function serializeStateItem_('),
  generatedCode.indexOf('function getConfiguredCourseOutlineSourceSets_(')
);
assert.equal(runtimeStateSerializerSource.includes('type:'), false);
assert.equal(generatedCode.includes('NOTIFICATION_QUEUE_STORE'), true);
assert.equal(generatedCode.includes('notification-email-templates.json'), true);
assert.equal(
  generatedCode.includes(
    'https://raw.githubusercontent.com/artemas-hsieh/t-school-schedule-sync/' +
    '5f31cd2fb263b9b5e579eab0d25c1b4f278f854f/notification-email-templates.json'
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
  generatedCode.includes('const SYNC_PROGRESS_CALENDAR_START_PERCENT = 35;') &&
    generatedCode.includes('const SYNC_PROGRESS_CALENDAR_END_PERCENT = 90;') &&
    generatedCode.includes('const SYNC_PROGRESS_REPORT_INTERVAL_MS = 10 * 1000;'),
  true,
  '同步進度應分開準備、Calendar 操作與收尾區間，並限制進度寫入頻率'
);
assert.equal(
  generatedCode.includes('本次同步已達安全執行時長上限，後續將自動從批次存檔點繼續'),
  true
);
assert.equal(generatedCode.includes('本批已達安全時間上限'), false);
const finalizeSyncJobSource = generatedCode.slice(
  generatedCode.indexOf('function finalizeSyncJob_('),
  generatedCode.indexOf('function handleSyncJobFailure_(')
);
assert.equal(
  finalizeSyncJobSource.indexOf("writeSyncJobProgressAtPercent_(job, 100, '同步完成', 'complete')") >
    finalizeSyncJobSource.indexOf('scheduleRequestedNotificationDeliveryRetry_()'),
  true,
  '100% 必須在工作狀態、續跑觸發器與通知清理完成後才回報'
);
assert.match(
  finalizeSyncJobSource,
  /allowWhenAutoSyncDisabled:\s*job\.reason === 'manual' \|\| job\.reason === 'settings'/,
  '手動同步完成後必須允許在自動同步關閉時排定一次課綱更新'
);
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
  generatedCode.includes('const SCHEDULE_SYNC_WINDOW_HALF_MINUTES = 60;'),
  true
);
assert.equal(
  generatedCode.includes('const TIME_TRIGGER_NEAR_MINUTE_TOLERANCE = 15;'),
  true
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
  selectedTitles: ['國語文'],
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

assert.deepEqual(
  Array.from(context.sortCatalogItemsByPeriod_(selectionOrderItems), item => item.title),
  selectionOrder,
  '設定網站與產生的 Code.gs 必須使用同一套預設置底與相似度排序'
);
['全校集會', '學習分享會', '補課日', '模擬考', '開學', '始業式', '結業式', '休業式'].forEach(title => {
  assert.equal(context.isDefaultSelectedTitle_(title), true);
});
assert.equal(context.isDefaultSelectedTitle_('國語文（三）'), false);
assert.deepEqual(
  Array.from(context.applyCourseSelectionRules_(
    ['自然進階(二)_物理'],
    naturalAdvancedCatalog
  )),
  ['自然進階(二)', '自然進階(二)_物理', '備註｜開放吉林六樓階梯教室自習。'],
  '控制臺後端必須再次補上自然進階共同事件與所有備註'
);
const naturalAdvancedUiModel = context.buildSourceUiModel_({
  firstDateKey: '2026-08-31',
  lastDateKey: '2027-01-31',
  sourceUpdatedLabel: '測試',
  sourceStale: false,
  sourceUnavailable: false,
  catalog: { all: naturalAdvancedCatalog },
  termKey: '三年級|2026-1',
  catalogFingerprintVersion: 3,
  catalogFingerprint: 'catalog',
  scheduleFingerprint: 'schedule'
}, '高三');
assert.equal(naturalAdvancedUiModel.itemCount, 4);
assert.equal(
  Array.from(naturalAdvancedUiModel.catalog.all, item => item.title).includes('自然進階(二)'),
  false,
  '控制臺課程選擇介面不得顯示自然進階共同事件'
);
assert.equal(
  Array.from(naturalAdvancedUiModel.catalog.all, item => item.title).some(title => title.indexOf('備註｜') === 0),
  false,
  '控制臺課程選擇介面不得顯示備註行程'
);

const progressTestJob = { initialOperationCount: 100, processedOperations: 0 };
assert.equal(context.calculateSyncJobProgressPercent_(progressTestJob), 35);
assert.equal(context.calculateSyncJobProgressPercent_(progressTestJob, 50), 63);
assert.equal(context.calculateSyncJobProgressPercent_(progressTestJob, 100), 90);
assert.equal(
  context.calculateSyncJobProgressPercent_({ initialOperationCount: 0, processedOperations: 0 }),
  90,
  '沒有 Calendar 操作時應直接進入收尾，不應卡在規劃區間'
);

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
  gradeName: '高二',
  firstDateKey: '2026-02-23',
  lastDateKey: '2026-08-30',
  termKey: '二年級|2025-2',
  catalogFingerprintVersion: 3,
  catalogFingerprint: roundTripCatalogFingerprint,
  scheduleFingerprint: 'current-schedule-fingerprint',
  catalog: {
    all: roundTripSetupCatalog,
    termItems: roundTripSetupCatalog,
    vacationItems: []
  }
};
const legacyV2TermKey = '二年級|2026-02-23';
const legacyV2Source = Object.assign({}, currentSetupSource, {
  termKey: legacyV2TermKey,
  catalogFingerprintVersion: 2,
  catalogFingerprint: context.makeLegacyV2SetupCatalogFingerprint_(
    legacyV2TermKey,
    currentSetupSource.lastDateKey,
    roundTripSetupCatalog
  )
});
legacyV2Source.setupContextFingerprint =
  context.makeSetupContextFingerprintVersion_(legacyV2Source, 2);
const normalizedLegacyV2Source = context.normalizeSetupSourceContext_(legacyV2Source, '高二');
assert.equal(normalizedLegacyV2Source.termKey, '二年級|2025-2');
assert.equal(normalizedLegacyV2Source.catalogFingerprintVersion, 3);
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
assert.deepEqual(Array.from(setupPreview.selectedTitles), ['公民／社會探究']);
assert.deepEqual(
  Array.from(setupPreview.missingItems),
  ['從巴士底到車諾比：歷史', '程式設計 & AI']
);
assert.equal(setupPreview.sourceChanged, true);
const mismatchedCatalogFingerprintCode = setupCode.encode({
  appVersion: '2.0.0-rc.1',
  gradeName: '高二',
  termKey: '二年級|2026-02-23',
  initialCatalogFingerprintVersion: 2,
  initialCatalogFingerprint: 'tampered-catalog-fingerprint',
  setupSourceSnapshot: {
    firstDateKey: '2026-02-23',
    lastDateKey: '2026-08-30',
    sourceUpdatedLabel: '0801',
    items: roundTripSetupCatalog
  },
  selectedTitles: ['公民／社會探究'],
  notificationEmail: 'student+sync@example.com',
  instantNotificationsEnabled: true,
  notificationHours: [6]
});
assert.throws(
  () => context.buildSetupImportPreview_(mismatchedCatalogFingerprintCode, {}),
  /課表摘要指紋不一致/,
  '設定碼 checksum 正確但內嵌目錄與明確指紋不一致時仍必須拒絕'
);
const liveSetupCode = setupCode.encode({
  appVersion: '2.0.0-rc.1',
  gradeName: '高二',
  termKey: currentSetupSource.termKey,
  initialCatalogFingerprintVersion: currentSetupSource.catalogFingerprintVersion,
  initialCatalogFingerprint: currentSetupSource.catalogFingerprint,
  selectedTitles: ['公民／社會探究'],
  notificationEmail: 'student+sync@example.com',
  instantNotificationsEnabled: false,
  notificationHours: [6, 12, 18, 22]
});
const firstConfirmationToken = context.buildSetupImportPreview_(liveSetupCode, {}).confirmationToken;
context.loadSourceContext_ = () => Object.assign({}, currentSetupSource, {
  scheduleFingerprint: 'newer-schedule-fingerprint'
});
assert.equal(
  context.buildSetupImportPreview_(liveSetupCode, {}).confirmationToken,
  firstConfirmationToken,
  '行程細節改變不得冒充設定目錄改變，也不得讓設定碼確認失效'
);
const changedSetupCatalog = roundTripSetupCatalog.concat([
  { title: '新增選修', period: 'term' }
]);
context.loadSourceContext_ = () => Object.assign({}, currentSetupSource, {
  catalogFingerprint: scheduleData.makeCatalogFingerprint(
    currentSetupSource.termKey,
    currentSetupSource.lastDateKey,
    changedSetupCatalog
  ),
  catalog: {
    all: changedSetupCatalog,
    termItems: changedSetupCatalog,
    vacationItems: []
  }
});
assert.notEqual(
  context.buildSetupImportPreview_(liveSetupCode, {}).confirmationToken,
  firstConfirmationToken,
  '設定目錄再次變動後，既有 confirmationToken 必須失效'
);
context.loadSourceContext_ = () => currentSetupSource;
function encodeRawSetupPayload(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return [setupCode.PREFIX, encodedPayload, setupCode.hashText(encodedPayload)].join('.');
}
const legacySetupCatalog = [
  { title: '公民／社會探究', type: 'course', period: 'term' },
  { title: '全校活動（上午）', type: 'activity', period: 'term' }
];
const legacySetupFingerprint = context.makeLegacyClassifiedSetupCatalogFingerprint_(
  currentSetupSource.termKey,
  currentSetupSource.lastDateKey,
  legacySetupCatalog
);
const legacySetupCode = encodeRawSetupPayload({
  schemaVersion: 1,
  createdAt: '2026-07-31T00:00:00.000Z',
  generatorVersion: '1.9.0',
  gradeName: '高二',
  termKey: currentSetupSource.termKey,
  catalogFingerprintVersion: 1,
  catalogFingerprint: legacySetupFingerprint,
  sourceFingerprint: legacySetupFingerprint,
  selectedCourses: ['公民／社會探究'],
  includeActivities: true,
  excludedActivities: ['全校活動（上午）'],
  notificationEmail: 'legacy@example.com',
  instantNotificationsEnabled: false,
  notificationHours: [6],
  sourceSnapshot: {
    firstDateKey: currentSetupSource.firstDateKey,
    lastDateKey: currentSetupSource.lastDateKey,
    sourceUpdatedLabel: '0731',
    items: legacySetupCatalog
  }
});
const legacySetupPreview = context.buildSetupImportPreview_(legacySetupCode, {});
assert.equal(legacySetupPreview.schemaVersion, 1);
assert.deepEqual(
  Array.from(legacySetupPreview.selectedTitles),
  ['公民／社會探究'],
  '舊版 schema 1 設定碼必須依原本課程／活動設定遷移為 selectedTitles'
);
const legacySetupWithoutSnapshotCode = encodeRawSetupPayload({
  schemaVersion: 1,
  createdAt: '2026-07-31T00:00:00.000Z',
  generatorVersion: '1.8.0',
  gradeName: '高二',
  termKey: currentSetupSource.termKey,
  catalogFingerprintVersion: currentSetupSource.catalogFingerprintVersion,
  catalogFingerprint: currentSetupSource.catalogFingerprint,
  sourceFingerprint: currentSetupSource.catalogFingerprint,
  selectedCourses: ['公民／社會探究'],
  includeActivities: true,
  excludedActivities: [],
  notificationEmail: 'legacy-no-snapshot@example.com',
  instantNotificationsEnabled: true,
  notificationHours: [6]
});
const legacySetupWithoutSnapshotPreview = context.buildSetupImportPreview_(
  legacySetupWithoutSnapshotCode,
  {}
);
assert.deepEqual(
  Array.from(legacySetupWithoutSnapshotPreview.selectedTitles),
  ['公民／社會探究', '全校活動（上午）'],
  '沒有 optional sourceSnapshot 的 schema 1 設定碼應以即時目錄與目前預設規則安全遷移'
);
const crossTermCode = setupCode.encode({
  gradeName: '高二',
  termKey: '二年級|2025-09-01',
  sourceFingerprint: 'old',
  selectedTitles: ['公民／社會探究'],
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
  initialCatalogFingerprintVersion: currentSetupSource.catalogFingerprintVersion,
  initialCatalogFingerprint: currentSetupSource.catalogFingerprint,
  selectedTitles: ['公民／社會探究'],
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
  Array.from(runtimeVacationCatalog, item => `${item.period}:${item.title}`).sort(),
  [
    'term:全校活動',
    'vacation:模擬考Day1',
    'term:學期間課程',
    'vacation:暑假課程'
  ].sort(),
  '控制臺的 Code.gs 行程目錄應只保留學期間與寒暑假區段'
);
assert.equal(
  Array.from(runtimeVacationCatalog).every(item =>
    Object.keys(item).sort().join(',') === 'period,title'
  ),
  true,
  'Code.gs 正常目錄項目不得產生 type'
);
assert.equal(
  context.makeSetupCatalogFingerprint_(
    '一年級|2026-01-01',
    '2026-08-31',
    runtimeVacationCatalog
  ),
  scheduleData.makeCatalogFingerprint(
    '一年級|2026-01-01',
    '2026-08-31',
    vacationCatalog.all
  ),
  '網站與 Code.gs 必須對同一行程目錄產生完全相同的第 3 版指紋'
);
assert.deepEqual(
  Array.from(context.extractCatalogFromPayload_(makeCatalogPayload(
    [1],
    ['沒有活動關鍵字的單次講座'],
    4
  )), item => `${item.period}:${item.title}`),
  ['term:沒有活動關鍵字的單次講座'],
  'Code.gs 不得依節數判定類別'
);
assert.deepEqual(
  Array.from(context.extractCatalogFromPayload_(makeCatalogPayload(
    [1],
    ['五節正式課程'],
    5
  )), item => `${item.period}:${item.title}`),
  ['term:五節正式課程'],
  'Code.gs 應以同一中性結構保留剛好 5 節的項目'
);
assert.equal(typeof context.classifyScheduleTitle_, 'undefined');
assert.equal(typeof context.countScheduledPeriodsByTitle_, 'undefined');

const neutralRuntimeTimes = [
  '來源時間一',
  '',
  '不是時間',
  '11:10~12:00',
  '任意內容',
  '14:10~15:00',
  '第七節',
  '16:10~17:00'
];
const neutralRuntimePayload = {
  currentGrade: '一年級',
  weekDataList: [{ week: 1, date: '8/3' }],
  tableData: [{
    isHeader: true,
    weekNum: '1',
    cells: [
      { value: '第 1 週' },
      { value: '節次' },
      { value: '8/3' },
      { value: '8/4' },
      { value: '8/5' },
      { value: '8/6' },
      { value: '8/7' },
      { value: '8/8' },
      { value: '8/9' }
    ]
  }].concat(neutralRuntimeTimes.map((time, index) => ({
    isHeader: false,
    weekNum: '1',
    cells: [
      { value: time },
      { value: String(index + 1) },
      { value: index === 0 ? '國語文（三）海風班 [吉林基地]' : '', rowSpan: 1 },
      { value: '' },
      { value: '' },
      { value: '' },
      { value: '' },
      { value: '' },
      { value: '' }
    ]
  })), [{
    isHeader: false,
    weekNum: '1',
    cells: [
      { value: '更新時間\n08010000' },
      { value: '備註' },
      { value: '學習分享會 [弘道基地]' },
      { value: '' },
      { value: '' },
      { value: '' },
      { value: '' },
      { value: '' },
      { value: '' }
    ]
  }])
};
const neutralInstallerSummary = scheduleData.summarizePayload(
  neutralRuntimePayload,
  new Date('2026-08-01T12:00:00+08:00')
);
const neutralRuntimeSummary = context.parseSchedulePayload_(
  neutralRuntimePayload,
  '高一',
  new Date('2026-08-01T12:00:00+08:00')
);
assert.equal(neutralInstallerSummary.termKey, '一年級|2026-1');
assert.equal(neutralRuntimeSummary.termKey, neutralInstallerSummary.termKey);
assert.equal(context.termKeysMatch_('一年級|2026-08-03', '一年級|2026-1'), true);
assert.equal(context.termKeysMatch_('一年級|2027-01-08', '一年級|2026-1'), true);
assert.equal(context.termKeysMatch_('一年級|2027-02-01', '一年級|2026-2'), true);
assert.deepEqual(
  Object.keys(neutralRuntimeSummary.catalog).sort(),
  ['all', 'termItems', 'vacationItems']
);
assert.deepEqual(
  Array.from(neutralRuntimeSummary.catalog.all, item => `${item.period}:${item.title}`),
  neutralInstallerSummary.catalog.all.map(item => `${item.period}:${item.title}`)
);
assert.equal(
  neutralRuntimeSummary.catalogFingerprint,
  neutralInstallerSummary.catalogFingerprint
);
assert.equal(neutralRuntimeSummary.events.length, 2);
const neutralTimedEvent = neutralRuntimeSummary.events.find(event => !event.isAllDay);
assert.equal(neutralTimedEvent.startTime, '08:25');
assert.equal(neutralTimedEvent.endTime, '09:15');
assert.equal(neutralTimedEvent.start.toISOString(), '2026-08-03T00:25:00.000Z');
assert.equal(neutralTimedEvent.end.toISOString(), '2026-08-03T01:15:00.000Z');
assert.equal(neutralTimedEvent.location, '吉林基地');
const allFixedPeriodsPayload = JSON.parse(JSON.stringify(neutralRuntimePayload));
allFixedPeriodsPayload.tableData.slice(1, 9).forEach((row, index) => {
  row.cells[2].value = '固定鐘點測試 ' + (index + 1) + ' [吉林基地]';
  row.cells[2].rowSpan = 1;
});
const allFixedPeriodsSummary = context.parseSchedulePayload_(
  allFixedPeriodsPayload,
  '高一',
  new Date('2026-08-01T12:00:00+08:00')
);
assert.deepEqual(
  Array.from(allFixedPeriodsSummary.events)
    .filter(event => !event.isAllDay)
    .sort((left, right) => left.periodStart - right.periodStart)
    .map(event => [event.periodStart, event.startTime, event.endTime]),
  [
    [1, '08:25', '09:15'],
    [2, '09:15', '10:05'],
    [3, '10:15', '11:05'],
    [4, '11:05', '11:55'],
    [5, '13:25', '14:15'],
    [6, '14:15', '15:05'],
    [7, '15:15', '16:05'],
    [8, '16:05', '16:55']
  ],
  '第 1–8 節都必須精確使用固定鐘點'
);
const changedSourceTimesPayload = JSON.parse(JSON.stringify(neutralRuntimePayload));
changedSourceTimesPayload.tableData.slice(1, 9).forEach((row, index) => {
  row.cells[0].value = '修改後左欄 ' + index;
});
const changedSourceTimesSummary = context.parseSchedulePayload_(
  changedSourceTimesPayload,
  '高一',
  new Date('2026-08-01T12:00:00+08:00')
);
assert.equal(
  changedSourceTimesSummary.scheduleFingerprint,
  neutralRuntimeSummary.scheduleFingerprint,
  '來源左欄鐘點不得影響節次時間或課表指紋'
);
const fullDayRangePayload = JSON.parse(JSON.stringify(neutralRuntimePayload));
fullDayRangePayload.tableData[1].cells[2].rowSpan = 8;
const fullDayRangeSummary = context.parseSchedulePayload_(
  fullDayRangePayload,
  '高一',
  new Date('2026-08-01T12:00:00+08:00')
);
const fullDayRangeEvent = fullDayRangeSummary.events.find(event => !event.isAllDay);
assert.equal(fullDayRangeSummary.events.filter(event => !event.isAllDay).length, 1);
assert.equal(fullDayRangeEvent.periodStart, 1);
assert.equal(fullDayRangeEvent.periodEnd, 8);
assert.equal(fullDayRangeEvent.startTime, '08:25');
assert.equal(fullDayRangeEvent.endTime, '16:55');
assert.equal(
  fullDayRangeEvent.end.getTime() - fullDayRangeEvent.start.getTime(),
  8 * 60 * 60 * 1000 + 30 * 60 * 1000,
  '第 1–8 節必須建立為包含下課與午休的單一連續時段'
);

function makeAdjacentMergeFixture(periodStart, periodEnd, location) {
  return {
    originalTitle: '跨節測試課程',
    isAllDay: false,
    weekNum: 1,
    weekday: '一',
    dateKey: '2026-08-03',
    periodStart,
    periodEnd,
    startTime: '',
    endTime: '',
    start: new Date('2026-08-03T00:00:00+08:00'),
    end: new Date('2026-08-03T00:00:00+08:00'),
    location,
    sourceUpdatedLabel: '08010000'
  };
}

const adjacentMergedEvents = context.mergeAdjacentScheduleEvents_([
  makeAdjacentMergeFixture(1, 4, '吉林基地'),
  makeAdjacentMergeFixture(5, 8, '吉林基地'),
  makeAdjacentMergeFixture(1, 1, '弘道基地')
]);
assert.equal(adjacentMergedEvents.length, 2);
const adjacentMergedJilin = adjacentMergedEvents.find(event => event.location === '吉林基地');
assert.equal(adjacentMergedJilin.periodStart, 1);
assert.equal(adjacentMergedJilin.periodEnd, 8);
assert.equal(adjacentMergedJilin.startTime, '08:25');
assert.equal(adjacentMergedJilin.endTime, '16:55');
assert.equal(
  adjacentMergedEvents.find(event => event.location === '弘道基地').periodEnd,
  1,
  '同標題但不同基地的相鄰節次不得合併'
);
const lunchSpanningEvent = context.mergeAdjacentScheduleEvents_([
  makeAdjacentMergeFixture(4, 4, '線上教室'),
  makeAdjacentMergeFixture(5, 5, '線上教室')
])[0];
assert.equal(lunchSpanningEvent.periodStart, 4);
assert.equal(lunchSpanningEvent.periodEnd, 5);
assert.equal(lunchSpanningEvent.startTime, '11:05');
assert.equal(lunchSpanningEvent.endTime, '14:15');
const ordinarySpanningEvent = context.mergeAdjacentScheduleEvents_([
  makeAdjacentMergeFixture(3, 6, '吉林基地')
])[0];
assert.equal(ordinarySpanningEvent.startTime, '10:15');
assert.equal(ordinarySpanningEvent.endTime, '15:05');
assert.equal(
  Array.from(neutralRuntimeSummary.catalog.all).every(item =>
    Object.keys(item).sort().join(',') === 'period,title'
  ),
  true
);
assert.equal(
  neutralRuntimeSummary.events.every(event => !Object.prototype.hasOwnProperty.call(event, 'type')),
  true,
  '節次行程與全天備註行程都不得有 type'
);
const neutralAllDayEvent = neutralRuntimeSummary.events.find(event => event.isAllDay);
assert.equal(neutralAllDayEvent.originalTitle, '備註｜學習分享會');
assert.equal(neutralAllDayEvent.location, '弘道基地');
assert.equal(
  neutralInstallerSummary.catalog.all.some(item => item.title === '備註｜學習分享會'),
  true,
  '設定網站目錄必須以專用前綴辨識備註行程'
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
const reorderedOutlineIndexSets = JSON.parse(JSON.stringify(parsedOutlineIndex.setsByGrade));
reorderedOutlineIndexSets['高二'][0].outlineNames.reverse();
reorderedOutlineIndexSets['高二'][0].spreadsheetIds.reverse();
assert.equal(
  context.makeCourseOutlineSourceIndexFingerprint_(reorderedOutlineIndexSets),
  parsedOutlineIndex.indexFingerprint,
  '中央課綱索引只調整資料列順序時，不得被誤判為內容變更'
);
assert.throws(
  () => context.assertCourseOutlineSourceIndexPayload_({
    setsByGrade: JSON.parse(JSON.stringify(parsedOutlineIndex.setsByGrade)),
    indexFingerprint: 'tampered-index-fingerprint'
  }),
  /指紋不一致/,
  '中央課綱索引快取內容與明確指紋不一致時必須停止使用'
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
assert.equal(
  context.formatDateKey_(new Date('2026-08-10T23:59:59+08:00')),
  '2026-08-10'
);
assert.equal(
  context.formatDateKey_(new Date('2026-08-11T00:00:00+08:00')),
  '2026-08-11',
  '跨夜日期應直接依 Asia/Taipei 日界線切換，不得把凌晨五分鐘誤算為前一天'
);

const noActivityCode = global.buildAppsScriptCode({
  appVersion: '2.0.0-rc.1',
  sourceApiUrl: scheduleData.API_URL,
  emailTemplateManifestUrl: immutableManifestUrl,
  gradeName: '高二',
  notificationEmail: 'test@example.com',
  notificationHours: [6],
  notifySyncHour: 6,
  selectedTitles: ['公民'],
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
assert.deepEqual(Array.from(noActivitySettings.selectedTitles), []);
assert.equal(Object.prototype.hasOwnProperty.call(noActivitySettings, 'selectedCourses'), false);
assert.equal(Object.prototype.hasOwnProperty.call(noActivitySettings, 'includeActivities'), false);
assert.equal(Object.prototype.hasOwnProperty.call(noActivitySettings, 'excludedActivities'), false);
assert.equal(noActivityCode.includes('test@example.com'), false);
assert.equal(noActivityCode.includes('高二全校活動'), false);

assert.equal(context.getConfiguredCourseOutlineSourceSets_('高一').length, 0);
assert.equal(context.getConfiguredCourseOutlineSourceSets_('高三').length, 0);
assert.equal(context.getConfiguredCourseOutlineSourceSets_('高二').length, 1);
assert.equal(context.getConfiguredCourseOutlineSourceSets_('高二')[0].key, '114-2-high2');
assert.equal(context.getConfiguredCourseOutlineSourceSets_('高二')[0].spreadsheetIds.length, 4);
assert.equal(
  context.getRelevantCourseOutlineSourceSets_('高二', [{
    isAllDay: false,
    dateKey: '2026-07-27'
  }]).length,
  1,
  '114-2 高二日期應啟用目前四份課綱'
);
assert.equal(
  context.getRelevantCourseOutlineSourceSets_('高二', [{
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
  context.makeCourseOutlineSheetMatchKey_(' 測試 Course Ａ　'),
  context.makeCourseOutlineSheetMatchKey_('測 試ｃｏｕｒｓｅa'),
  '課綱分頁匹配應忽略全半形、所有空白與大小寫'
);
assert.notEqual(
  context.makeCourseOutlineSheetMatchKey_('測試課程-A'),
  context.makeCourseOutlineSheetMatchKey_('測試課程A'),
  '全半形、空白與大小寫以外的字元差異仍不得模糊配對'
);
const parsedNormalizedNameOutline = context.parseCourseOutlineSheetValues_(
  outlineValues,
  ' 測 試 課 程 ',
  outlineDesiredEvents,
  { sourceSetKey: '114-2-high2', spreadsheetId: 'sheet-id', spreadsheetName: '課綱' }
);
assert.equal(
  parsedNormalizedNameOutline.records[0].key,
  context.makeCourseOutlineOccurrenceKey_('測試課程', '2026-07-27', 5, 6),
  '課綱快照索引必須保留課表原始名稱，不能改用正規化前的分頁名稱'
);
assert.equal(
  context.resolveCourseOutlineDateKey_(
    '7/27',
    ['2026-07-27', '2026-07-27']
  ),
  '2026-07-27',
  '直接解析重複日期候選時仍須先去重，不能改變原本的唯一命中規則'
);
assert.equal(
  context.resolveCourseOutlineDateKey_('2026/1/5', ['2027-01-05']),
  '2027-01-05',
  '課綱日期必須忽略西元年，只依唯一月日候選配對'
);
assert.equal(
  context.resolveCourseOutlineDateKey_('26/1/5', ['2027-01-05']),
  '2027-01-05',
  '兩位數年份也不得被誤認為月份'
);
assert.equal(
  context.resolveCourseOutlineDateKey_('115/1/5', ['2027-01-05']),
  '2027-01-05',
  '課綱日期必須忽略民國年，只依唯一月日候選配對'
);
assert.equal(
  context.resolveCourseOutlineDateKey_('1/5', ['2026-01-05', '2027-01-05']),
  '',
  '候選範圍內同一月日不唯一時必須拒絕任選'
);
[
  ['234', 2, 4],
  ['5678', 5, 8],
  ['234567', 2, 7],
  ['12345678', 1, 8]
].forEach(([label, periodStart, periodEnd]) => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.parseCourseOutlinePeriod_(label))),
    { periodStart, periodEnd },
    `課綱連寫節次 ${label} 應解析為連續範圍`
  );
});
assert.equal(
  context.parseCourseOutlinePeriod_('235'),
  null,
  '三碼以上但不連續的節次不得被誤解為完整範圍'
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

const parsedPartialOutline = context.parseCourseOutlineSheetValues_(
  [['日期', '節次', '課程內容'], ['7/27', '1', '只有內容']],
  '部分欄位課程',
  [{ originalTitle: '部分欄位課程', dateKey: '2026-07-27', periodStart: 1, periodEnd: 1 }],
  { sourceSetKey: 'test', spreadsheetId: 'test', spreadsheetName: 'test' }
);
assert.equal(parsedPartialOutline.records.length, 1);
assert.equal(parsedPartialOutline.records[0].classroom, '');
assert.equal(parsedPartialOutline.records[0].topic, '');
assert.equal(parsedPartialOutline.records[0].content, '只有內容');
assert.equal(parsedPartialOutline.issue, '');

const unmappableOutline = context.parseCourseOutlineSheetValues_(
  [['課程內容'], ['無日期與節次']],
  '無法定位課程',
  [{ originalTitle: '無法定位課程', dateKey: '2026-07-27', periodStart: 1, periodEnd: 1 }],
  { sourceSetKey: 'test', spreadsheetId: 'test', spreadsheetName: 'test' }
);
assert.equal(unmappableOutline.records.length, 0);
assert.match(unmappableOutline.issue, /日期或節次/);

const readMetadataBeforeIsolationTest = context.readSheetsWorkbookMetadata_;
const readValuesBeforeIsolationTest = context.readSheetsDisplayValues_;
context.readSheetsWorkbookMetadata_ = function () {
  return {
    properties: { title: '容錯課綱' },
    sheets: [
      { properties: { title: '可讀課程' }, merges: [] },
      { properties: { title: '缺欄課程' }, merges: [] }
    ]
  };
};
context.readSheetsDisplayValues_ = function () {
  return {
    '可讀課程': [
      ['日期', '節次', '單元主題'],
      ['7/27', '1', '正常主題']
    ],
    '缺欄課程': [
      ['課程內容'],
      ['無法定位']
    ]
  };
};
const isolatedOutlineSnapshot = context.collectCourseOutlineSnapshot_(
  { gradeName: '高二' },
  { termKey: '二年級|2026-2' },
  [
    { originalTitle: '可讀課程', dateKey: '2026-07-27', periodStart: 1, periodEnd: 1, isAllDay: false },
    { originalTitle: '缺欄課程', dateKey: '2026-07-27', periodStart: 2, periodEnd: 2, isAllDay: false }
  ],
  [{
    key: 'test-set',
    label: '測試來源',
    validFrom: '2026-07-01',
    validUntil: '2026-07-31',
    spreadsheetIds: ['test-sheet']
  }]
);
assert.equal(Object.keys(isolatedOutlineSnapshot.lookup).length, 1);
assert.equal(isolatedOutlineSnapshot.diagnostics.matchedRecordCount, 1);
assert.equal(isolatedOutlineSnapshot.diagnostics.unavailableItemCount, 1);
assert.deepEqual(
  Array.from(isolatedOutlineSnapshot.diagnostics.unavailableItemNames),
  ['缺欄課程'],
  '單一分頁無法定位時，其他課程的正確課綱仍應發布'
);
context.readSheetsWorkbookMetadata_ = readMetadataBeforeIsolationTest;
context.readSheetsDisplayValues_ = readValuesBeforeIsolationTest;

const outlineSettings = {
  descriptionPreset: 'standard',
  customDescription: '',
  reminderMode: 'none',
  reminderMinutes: 10
};
const outlineBaseItem = {
  originalTitle: '測試課程',
  isAllDay: false,
  dateKey: '2026-07-27',
  weekday: '一',
  weekNum: 2,
  periodStart: 5,
  periodEnd: 6,
  startTime: '13:25',
  endTime: '15:05',
  start: new Date('2026-07-27T13:25:00+08:00'),
  end: new Date('2026-07-27T15:05:00+08:00'),
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
const outlineIdentityHash = context.makeCourseOutlineIdentityHash_({
  classroom: '原教室',
  topic: '第一冊',
  content: '107年歷屆國寫練習-知性題(紙本練習)'
});
assert.ok(outlineIdentityHash);
assert.equal(
  outlineIdentityHash,
  context.makeCourseOutlineIdentityHash_({
    classroom: '新教室',
    topic: '第一冊',
    content: '107年歷屆國寫練習-知性題(紙本練習)'
  }),
  '課綱事件身分只由單元主題與課程內容決定，教室變更不得改變身分'
);
assert.notEqual(
  outlineIdentityHash,
  context.makeCourseOutlineIdentityHash_({
    classroom: '原教室',
    topic: '第一冊',
    content: '另一份練習'
  })
);
assert.ok(
  context.makeCourseOutlineIdentityHash_({ topic: '只有主題', content: '' }),
  '課綱只有單元主題時，仍應使用實際存在的資訊輔助判定'
);
assert.ok(
  context.makeCourseOutlineIdentityHash_({ topic: '', content: '只有課程內容' }),
  '課綱只有課程內容時，仍應使用實際存在的資訊輔助判定'
);
assert.equal(
  context.makeCourseOutlineIdentityHash_({ topic: '', content: '' }),
  '',
  '單元主題與課程內容都缺少時不得創造課綱身分'
);
const neutralSerializedStateItem = context.serializeStateItem_(
  Object.assign({}, outlineBaseItem, { outlineIdentityHash }),
  'outline-identity-calendar-event',
  'outline-identity-signature',
  outlineSettings
);
assert.equal(neutralSerializedStateItem.signatureVersion, 4);
assert.equal(
  neutralSerializedStateItem.outlineIdentityHash,
  outlineIdentityHash,
  '課綱事件身分必須保存到同步狀態，下次讀取才能跨時間比對'
);
assert.equal(
  Object.prototype.hasOwnProperty.call(neutralSerializedStateItem, 'type'),
  false,
  '新寫入的同步狀態不得保留課程／活動 type'
);
const normalizedLegacyTimeState = context.normalizeStoredState_({
  legacyFixedPeriod: {
    signatureVersion: 3,
    metadataVersion: 2,
    originalTitle: '舊狀態時間測試',
    dateKey: '2026-08-03',
    periodStart: 4,
    periodEnd: 5,
    isAllDay: false,
    startTime: '11:10',
    endTime: '14:00',
    start: '2026-08-03T03:10:00.000Z',
    end: '2026-08-03T06:00:00.000Z',
    location: '吉林基地',
    calendarEventId: 'legacy-fixed-period-event'
  }
});
const normalizedLegacyTimeItem = Object.values(normalizedLegacyTimeState)[0];
assert.equal(normalizedLegacyTimeItem.signatureVersion, 3);
assert.equal(normalizedLegacyTimeItem.startTime, '11:05');
assert.equal(normalizedLegacyTimeItem.endTime, '14:15');
assert.equal(normalizedLegacyTimeItem.start, '2026-08-03T03:05:00.000Z');
assert.equal(normalizedLegacyTimeItem.end, '2026-08-03T06:15:00.000Z');
const legacyPastStatePlan = context.buildSyncPlan_(
  {
    legacyPast: {
      originalTitle: '舊活動',
      type: 'activity',
      dateKey: '2025-01-01',
      start: '2025-01-01T00:00:00.000Z',
      end: '2025-01-02T00:00:00.000Z'
    }
  },
  [],
  '2026-08-01'
);
assert.equal(
  Object.prototype.hasOwnProperty.call(legacyPastStatePlan.oldPast.legacyPast, 'type'),
  false,
  '下一次同步保存過去索引時也必須移除舊 type 欄位'
);

function haveCompatibleMoveShapeReference(oldItem, newItem) {
  if (Boolean(oldItem && oldItem.isAllDay) !== Boolean(newItem && newItem.isAllDay)) {
    return false;
  }
  if (oldItem && oldItem.isAllDay) return true;
  const oldStart = Number(oldItem && oldItem.periodStart);
  const oldEnd = Number(oldItem && oldItem.periodEnd) || oldStart;
  const newStart = Number(newItem && newItem.periodStart);
  const newEnd = Number(newItem && newItem.periodEnd) || newStart;
  if (![oldStart, oldEnd, newStart, newEnd].every(Number.isInteger)) return false;
  if (oldStart < 1 || newStart < 1 || oldEnd < oldStart || newEnd < newStart) return false;
  return oldEnd - oldStart === newEnd - newStart;
}

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
    let candidates = unmatchedOld
      .filter(oldItem =>
        !usedOld[oldItem.stateKey] &&
        context.normalizeTitle_(oldItem.originalTitle) ===
          context.normalizeTitle_(newItem.originalTitle) &&
        context.normalizeTitle_(oldItem.location) ===
          context.normalizeTitle_(newItem.location) &&
        haveCompatibleMoveShapeReference(oldItem, newItem)
      )
      .map(oldItem => ({
        oldItem,
        distance: Math.abs(new Date(oldItem.start).getTime() - newItem.start.getTime())
      }))
      .filter(candidate => candidate.distance <= 21 * 24 * 60 * 60 * 1000);
    const newOutlineIdentityHash = String(newItem.outlineIdentityHash || '');
    if (newOutlineIdentityHash) {
      const sameOutlineCandidates = candidates.filter(candidate =>
        String(candidate.oldItem.outlineIdentityHash || '') === newOutlineIdentityHash
      );
      candidates = sameOutlineCandidates.length
        ? sameOutlineCandidates
        : candidates.filter(candidate => !candidate.oldItem.outlineIdentityHash);
    }
    candidates.sort((left, right) => left.distance - right.distance);
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

function makePlanRangeTestItem(
  title,
  date,
  location,
  periodStart,
  periodEnd,
  testId,
  outlineIdentityHashValue
) {
  const item = makePlanTestItem(title, date, location, periodStart, testId);
  item.periodEnd = periodEnd;
  item.end = new Date(date.getTime() + (periodEnd - periodStart + 1) * 50 * 60 * 1000);
  if (outlineIdentityHashValue) item.outlineIdentityHash = outlineIdentityHashValue;
  return item;
}

function makePlanState(items) {
  return items.reduce((state, item) => {
    const stateKey = context.makeOccurrenceKey_(item);
    state[stateKey] = Object.assign({}, item, {
      stateKey,
      start: item.start.toISOString(),
      end: item.end.toISOString()
    });
    return state;
  }, {});
}

const planTieCenter = new Date('2026-08-15T09:00:00.000Z');
const planTieOldBefore = makePlanTestItem(
  '同名課程',
  new Date(planTieCenter.getTime() - 24 * 60 * 60 * 1000),
  '吉林基地',
  1,
  'old-before'
);
const planTieOldAfter = makePlanTestItem(
  '同名課程',
  new Date(planTieCenter.getTime() + 24 * 60 * 60 * 1000),
  '吉林基地',
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
  [makePlanTestItem('同名課程', planTieCenter, '吉林基地', 1, 'new-tied')],
  '2026-08-01'
);
assert.equal(tiedMovePlan.moved.length, 0);
assert.equal(tiedMovePlan.additions.length, 1);
assert.equal(tiedMovePlan.deletions.length, 2);

const moveBoundaryOld = makePlanTestItem(
  '__proto__',
  new Date('2026-08-02T09:00:00.000Z'),
  '吉林基地',
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
      '吉林基地',
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
      '吉林基地',
      2,
      'outside-boundary-new'
    )],
    '2026-08-01'
  ).moved.length,
  0,
  '超過 21 日一毫秒不得誤判為移動'
);

const changedPeriodCountOld = makePlanRangeTestItem(
  '節數測試課程',
  new Date('2026-08-05T09:00:00.000Z'),
  '吉林基地',
  1,
  1,
  'shape-old'
);
const changedPeriodCountNew = makePlanRangeTestItem(
  '節數測試課程',
  new Date('2026-08-06T09:00:00.000Z'),
  '吉林基地',
  1,
  2,
  'shape-new'
);
const changedPeriodCountPlan = context.buildSyncPlan_(
  makePlanState([changedPeriodCountOld]),
  [changedPeriodCountNew],
  '2026-08-01'
);
assert.equal(changedPeriodCountPlan.moved.length, 0);
assert.equal(changedPeriodCountPlan.additions.length, 1);
assert.equal(changedPeriodCountPlan.deletions.length, 1);

const allDayShapeOld = makePlanRangeTestItem(
  '全天與節次測試',
  new Date('2026-08-05T00:00:00.000Z'),
  '吉林基地',
  1,
  1,
  'all-day-shape-old'
);
allDayShapeOld.isAllDay = true;
const timedShapeNew = makePlanRangeTestItem(
  '全天與節次測試',
  new Date('2026-08-06T09:00:00.000Z'),
  '吉林基地',
  1,
  1,
  'timed-shape-new'
);
const allDayShapePlan = context.buildSyncPlan_(
  makePlanState([allDayShapeOld]),
  [timedShapeNew],
  '2026-08-01'
);
assert.equal(allDayShapePlan.moved.length, 0);
assert.equal(allDayShapePlan.additions.length, 1);
assert.equal(allDayShapePlan.deletions.length, 1);

const differentOutlineIdentityHash = context.makeCourseOutlineIdentityHash_({
  topic: '第二冊',
  content: '不同課程內容'
});
const outlineNearOld = makePlanRangeTestItem(
  '課綱身分課程',
  new Date('2026-08-14T09:00:00.000Z'),
  '吉林基地',
  1,
  1,
  'outline-near-old',
  differentOutlineIdentityHash
);
const outlineFarOld = makePlanRangeTestItem(
  '課綱身分課程',
  new Date('2026-08-10T09:00:00.000Z'),
  '吉林基地',
  1,
  1,
  'outline-far-old',
  outlineIdentityHash
);
const outlineIdentityNew = makePlanRangeTestItem(
  '課綱身分課程',
  new Date('2026-08-15T09:00:00.000Z'),
  '吉林基地',
  5,
  5,
  'outline-new',
  outlineIdentityHash
);
const outlineIdentityPlan = context.buildSyncPlan_(
  makePlanState([outlineNearOld, outlineFarOld]),
  [outlineIdentityNew],
  '2026-08-01'
);
assert.equal(outlineIdentityPlan.moved.length, 1);
assert.equal(
  outlineIdentityPlan.moved[0].oldItem.testId,
  'outline-far-old',
  '單元主題與課程內容相同時，應優先於較近但課綱身分不同的候選'
);
const outlineMismatchPlan = context.buildSyncPlan_(
  makePlanState([outlineNearOld]),
  [outlineIdentityNew],
  '2026-08-01'
);
assert.equal(outlineMismatchPlan.moved.length, 0);
assert.equal(outlineMismatchPlan.additions.length, 1);
assert.equal(outlineMismatchPlan.deletions.length, 1);
const outlineMissingFallbackOld = Object.assign({}, outlineNearOld);
delete outlineMissingFallbackOld.outlineIdentityHash;
const outlineMissingFallbackPlan = context.buildSyncPlan_(
  makePlanState([outlineMissingFallbackOld]),
  [outlineIdentityNew],
  '2026-08-01'
);
assert.equal(
  outlineMissingFallbackPlan.moved.length,
  1,
  '舊狀態尚未保存課綱身分時，應安全退回同節數的最近時間規則'
);

const firstAdjustmentOldItems = [
  makePlanRangeTestItem('化學', new Date('2026-08-05T14:15:00.000Z'), '吉林基地', 6, 6, 'chem-old-single'),
  makePlanRangeTestItem('化學', new Date('2026-08-13T13:25:00.000Z'), '吉林基地', 5, 6, 'chem-old-double')
];
const firstAdjustmentNewItems = [
  makePlanRangeTestItem('化學', new Date('2026-08-05T14:15:00.000Z'), '吉林基地', 6, 7, 'chem-new-double'),
  makePlanRangeTestItem('化學', new Date('2026-08-13T14:15:00.000Z'), '吉林基地', 6, 6, 'chem-new-single')
];
const firstAdjustmentPlan = context.buildSyncPlan_(
  makePlanState(firstAdjustmentOldItems),
  firstAdjustmentNewItems,
  '2026-08-01'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(
    firstAdjustmentPlan.moved.map(pair => [pair.oldItem.testId, pair.newItem.testId])
  )),
  [
    ['chem-old-double', 'chem-new-double'],
    ['chem-old-single', 'chem-new-single']
  ],
  '化學調課應保持單節／雙節事件形狀，不得判成擴張、縮短或拆併'
);
const firstDetectedChanges = firstAdjustmentPlan.moved.map(pair => ({
  type: '調整',
  oldItem: pair.oldItem,
  newItem: pair.newItem
}));
assert.deepEqual(
  JSON.parse(JSON.stringify(firstDetectedChanges.map(change => [
    change.type,
    change.oldItem && change.oldItem.dateKey,
    change.oldItem && change.oldItem.periodStart,
    change.oldItem && change.oldItem.periodEnd,
    change.newItem && change.newItem.dateKey,
    change.newItem && change.newItem.periodStart,
    change.newItem && change.newItem.periodEnd,
    change.newItem && change.newItem.location
  ]))),
  [
    ['調整', '2026-08-13', 5, 6, '2026-08-05', 6, 7, '吉林基地'],
    ['調整', '2026-08-05', 6, 6, '2026-08-13', 6, 6, '吉林基地']
  ],
  '成功配對的單節與雙節行程必須保持完整，不得拆成單節後跨配對抵銷'
);
const firstDetectedJobResult = context.buildSyncJobResult_({
  jobId: 'first-detected-result',
  created: 0,
  updated: 3,
  adjusted: 2,
  outlineUpdated: 0,
  deleted: 0,
  omittedChangeCount: 0,
  changes: firstAdjustmentPlan.moved.map(pair => context.serializeSyncChange_({
    type: '調整',
    oldItem: pair.oldItem,
    newItem: pair.newItem
  }))
}, false);
assert.equal(firstDetectedJobResult.updated, 2);
assert.equal(firstDetectedJobResult.changes.length, 2);
const omittedAdjustmentResult = context.buildSyncJobResult_({
  jobId: 'omitted-adjustment-result',
  created: 0,
  updated: 5,
  adjusted: 2,
  outlineUpdated: 0,
  deleted: 0,
  omittedChangeCount: 1,
  changes: [context.serializeSyncChange_(firstDetectedChanges[0])]
}, false);
assert.equal(
  omittedAdjustmentResult.updated,
  2,
  '異動明細超過上限時，updated 仍只能計算完整行程的調整，不得混入內容更新'
);
const legacyExactUpdateResult = context.buildSyncJobResult_({
  jobId: 'legacy-exact-update-result',
  created: 0,
  updated: 1,
  outlineUpdated: 0,
  deleted: 0,
  omittedChangeCount: 0,
  changes: [{
    type: '更新',
    oldItem: firstAdjustmentOldItems[0],
    newItem: firstAdjustmentOldItems[0]
  }]
}, false);
assert.equal(legacyExactUpdateResult.updated, 0);
assert.equal(legacyExactUpdateResult.changes.length, 0);

const secondAdjustmentOldItems = [
  makePlanRangeTestItem('國語文', new Date('2026-08-07T08:25:00.000Z'), '吉林基地', 1, 1, 'chinese-old-single'),
  makePlanRangeTestItem('國語文', new Date('2026-08-10T13:25:00.000Z'), '吉林基地', 5, 6, 'chinese-old-double'),
  makePlanRangeTestItem('英語文', new Date('2026-08-07T09:15:00.000Z'), '線上教室', 2, 2, 'english-old-single')
];
const secondAdjustmentNewItems = [
  makePlanRangeTestItem('國語文', new Date('2026-08-07T08:25:00.000Z'), '吉林基地', 1, 2, 'chinese-new-double'),
  makePlanRangeTestItem('國語文', new Date('2026-08-10T13:25:00.000Z'), '吉林基地', 5, 5, 'chinese-new-single'),
  makePlanRangeTestItem('英語文', new Date('2026-08-10T14:15:00.000Z'), '線上教室', 6, 6, 'english-new-single')
];
const secondAdjustmentPlan = context.buildSyncPlan_(
  makePlanState(secondAdjustmentOldItems),
  secondAdjustmentNewItems,
  '2026-08-01'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(
    secondAdjustmentPlan.moved.map(pair => [pair.oldItem.testId, pair.newItem.testId])
  )),
  [
    ['chinese-old-double', 'chinese-new-double'],
    ['chinese-old-single', 'chinese-new-single'],
    ['english-old-single', 'english-new-single']
  ],
  '國語文與英語文調課應依節數形狀辨識真正的跨日期移動'
);
const secondDetectedChanges = secondAdjustmentPlan.moved.map(pair => ({
  type: '調整',
  oldItem: pair.oldItem,
  newItem: pair.newItem
}));
assert.deepEqual(
  JSON.parse(JSON.stringify(secondDetectedChanges.map(change => [
    change.oldItem.testId,
    change.oldItem.periodStart,
    change.oldItem.periodEnd,
    change.newItem.testId,
    change.newItem.periodStart,
    change.newItem.periodEnd
  ]))),
  [
    ['chinese-old-double', 5, 6, 'chinese-new-double', 1, 2],
    ['chinese-old-single', 1, 1, 'chinese-new-single', 5, 5],
    ['english-old-single', 2, 2, 'english-new-single', 6, 6]
  ],
  '國語文與英語文的每筆完整行程都必須保留原配對範圍'
);

const crossLocationSwapOldItems = [
  makePlanRangeTestItem('化學', new Date('2026-08-29T14:15:00.000Z'), '吉林基地', 6, 6, 'swap-old-jilin'),
  makePlanRangeTestItem('化學', new Date('2026-09-02T10:15:00.000Z'), '弘道基地', 3, 3, 'swap-old-hongdao')
];
const crossLocationSwapNewItems = [
  makePlanRangeTestItem('化學', new Date('2026-08-29T14:15:00.000Z'), '弘道基地', 6, 6, 'swap-new-hongdao'),
  makePlanRangeTestItem('化學', new Date('2026-09-02T10:15:00.000Z'), '吉林基地', 3, 3, 'swap-new-jilin')
];
const crossLocationSwapPlan = context.buildSyncPlan_(
  makePlanState(crossLocationSwapOldItems),
  crossLocationSwapNewItems,
  '2026-08-01'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(crossLocationSwapPlan.moved.map(pair => [
    pair.oldItem.testId,
    pair.newItem.testId,
    pair.oldItem.location,
    pair.newItem.location
  ]))),
  [
    ['swap-old-hongdao', 'swap-new-hongdao', '弘道基地', '弘道基地'],
    ['swap-old-jilin', 'swap-new-jilin', '吉林基地', '吉林基地']
  ],
  '同標題跨基地交換時必須各自尋找同基地舊事件'
);

const fartherSameLocationOld = makePlanRangeTestItem(
  '同基地優先課程',
  new Date('2026-08-01T08:25:00.000Z'),
  '吉林基地',
  1,
  1,
  'farther-same-location'
);
const nearerOtherLocationOld = makePlanRangeTestItem(
  '同基地優先課程',
  new Date('2026-08-09T08:25:00.000Z'),
  '弘道基地',
  1,
  1,
  'nearer-other-location'
);
const sameLocationCandidateNew = makePlanRangeTestItem(
  '同基地優先課程',
  new Date('2026-08-10T09:15:00.000Z'),
  '吉林基地',
  2,
  2,
  'same-location-new'
);
const sameLocationPriorityPlan = context.buildSyncPlan_(
  makePlanState([fartherSameLocationOld, nearerOtherLocationOld]),
  [sameLocationCandidateNew],
  '2026-08-01'
);
assert.equal(sameLocationPriorityPlan.moved.length, 1);
assert.equal(
  sameLocationPriorityPlan.moved[0].oldItem.testId,
  'farther-same-location',
  '較近的跨基地候選不得勝過 21 日內的同基地候選'
);

const noSameLocationPlan = context.buildSyncPlan_(
  makePlanState([fartherSameLocationOld]),
  [Object.assign({}, sameLocationCandidateNew, { location: '弘道基地' })],
  '2026-08-01'
);
assert.equal(noSameLocationPlan.moved.length, 0);
assert.equal(noSameLocationPlan.additions.length, 1);
assert.equal(noSameLocationPlan.deletions.length, 1);

const identityConflictChanges = [
  {
    type: '調整',
    oldItem: makePlanRangeTestItem(
      '課綱衝突測試',
      new Date('2026-08-05T09:00:00.000Z'),
      '同地點',
      1,
      1,
      'identity-conflict-a-old',
      outlineIdentityHash
    ),
    newItem: makePlanRangeTestItem(
      '課綱衝突測試',
      new Date('2026-08-06T10:00:00.000Z'),
      '同地點',
      2,
      2,
      'identity-conflict-a-new',
      outlineIdentityHash
    )
  },
  {
    type: '調整',
    oldItem: makePlanRangeTestItem(
      '課綱衝突測試',
      new Date('2026-08-06T10:00:00.000Z'),
      '同地點',
      2,
      2,
      'identity-conflict-b-old',
      differentOutlineIdentityHash
    ),
    newItem: makePlanRangeTestItem(
      '課綱衝突測試',
      new Date('2026-08-05T09:00:00.000Z'),
      '同地點',
      1,
      1,
      'identity-conflict-b-new',
      differentOutlineIdentityHash
    )
  }
];
const identityConflictResult = context.buildSyncJobResult_({
  jobId: 'identity-conflict-result',
  created: 0,
  updated: 2,
  adjusted: 2,
  outlineUpdated: 0,
  deleted: 0,
  omittedChangeCount: 0,
  changes: identityConflictChanges.map(context.serializeSyncChange_)
}, false);
assert.equal(
  identityConflictResult.changes.length,
  2,
  '完成配對後不得再依日期、節次或課綱身分跨配對消去完整行程'
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
    '標題分桶最佳化必須與節數／課綱身分配對規則逐項等價，隨機案例 ' + caseIndex
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
context.writeChunkedJson_('CHUNK_TAIL_TEST', { text: '甲'.repeat(6000) });
const chunkTailPeakCount = Number(scriptPropertiesData.CHUNK_TAIL_TEST_COUNT);
assert.equal(chunkTailPeakCount > 1, true);
context.writeChunkedJson_('CHUNK_TAIL_TEST', { text: '短資料' });
assert.equal(
  Object.prototype.hasOwnProperty.call(scriptPropertiesData, 'CHUNK_TAIL_TEST_1'),
  true,
  '縮小寫入應保留由 COUNT 忽略的尾端 chunk，避免並發刪除競態'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.readChunkedJson_('CHUNK_TAIL_TEST', null))),
  { text: '短資料' }
);
context.clearChunkedStore_('CHUNK_TAIL_TEST');
assert.equal(
  Object.keys(scriptPropertiesData).some(key => /^CHUNK_TAIL_TEST_\d+$/.test(key)),
  false,
  '明確清除 store 時仍須移除歷史尾端 chunk'
);
context.Logger = { log() {} };
context.clearChunkedStore_('TSCHOOL_SOURCE_UI_CACHE');
context.loadSourceContext_ = () => currentSetupSource;
const liveUiSource = context.loadSourceContextForUi_({
  gradeName: '高二',
  termKey: currentSetupSource.termKey,
  pendingTermKey: ''
});
assert.equal(Boolean(liveUiSource.sourceUnavailable), false);
assert.equal(
  context.readChunkedJson_('TSCHOOL_SOURCE_UI_CACHE', null).gradeName,
  '高二',
  '即時課表成功時應更新控制臺唯讀備援摘要'
);
context.loadSourceContext_ = () => { throw new Error('模擬課表 API 維護'); };
const cachedUiSource = context.loadSourceContextForUi_({
  gradeName: '高二',
  termKey: currentSetupSource.termKey,
  pendingTermKey: '',
  knownTitles: []
});
assert.equal(cachedUiSource.sourceUnavailable, true);
assert.deepEqual(
  Array.from(cachedUiSource.catalog.all, item => item.title),
  Array.from(currentSetupSource.catalog.all, item => item.title),
  '課表 API 失敗時控制臺應使用最後成功摘要，而不是整個崩潰'
);
context.clearChunkedStore_('TSCHOOL_SOURCE_UI_CACHE');
context.clearChunkedStore_('TSCHOOL_SETUP_SOURCE_CONTEXT');
const settingsOnlyUiSource = context.loadSourceContextForUi_({
  gradeName: '高二',
  termKey: currentSetupSource.termKey,
  pendingTermKey: '',
  scheduleFingerprint: 'stored-schedule',
  knownTitles: ['既有課程'],
  selectedTitles: ['既有課程'],
  pendingTitles: [],
  excludedTitles: []
});
assert.equal(settingsOnlyUiSource.sourceUnavailable, true);
assert.deepEqual(
  Array.from(settingsOnlyUiSource.catalog.termItems, item => item.title),
  ['既有課程'],
  '沒有持久摘要的舊安裝也應至少用既有設定開啟唯讀控制臺'
);
context.loadSourceContext_ = () => currentSetupSource;
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
  Array.from(initialGeneratedSettings.reminderMinutesList),
  [10],
  '通用程式應預設在行程前 10 分鐘提醒'
);
assert.deepEqual(
  Array.from(context.normalizeReminderMinutesList_([1440, 10, 10, 999], 30)),
  [10, 1440],
  '提前時間應去除重複與不支援的值'
);
assert.deepEqual(
  Array.from(context.normalizeReminderMinutesList_(null, 30)),
  [30],
  '舊版單一提前時間應可繼續使用'
);
assert.deepEqual(
  Array.from(context.getEffectiveNotificationHours_(initialGeneratedSettings)),
  [6],
  '即時通知開啟時，每日摘要觸發時間應固定為 06:00'
);
context.writeChunkedJson_('TSCHOOL_SOURCE_UI_CACHE', {
  gradeName: '高二',
  termKey: '二年級|2026-02-23',
  catalog: {
    all: [
      { title: '公民', type: 'course', period: 'term' },
      { title: '校慶', type: 'activity', period: 'term' },
      { title: '不參加的講座', type: 'activity', period: 'term' }
    ]
  }
});
context.writeChunkedJson_('TSCHOOL_SETTINGS', {
  schemaVersion: 4,
  gradeName: '高二',
  termKey: '二年級|2026-02-23',
  setupComplete: true,
  autoSyncHours: [7, 19],
  notifySyncHour: 19,
  sourceFingerprint: 'legacy-schedule-fingerprint',
  selectedCourses: ['公民'],
  includeActivities: true,
  excludedActivities: ['不參加的講座']
});
const migratedNotificationSettings = context.loadSettings_();
assert.deepEqual(
  Array.from(migratedNotificationSettings.notificationHours),
  [7, 19],
  '舊版 autoSyncHours 應遷移為通知時間'
);
assert.equal(
  migratedNotificationSettings.scheduleFingerprint,
  'legacy-schedule-fingerprint',
  '舊版通用指紋應單向遷移為明確的課表指紋'
);
assert.equal(
  Object.prototype.hasOwnProperty.call(migratedNotificationSettings, 'sourceFingerprint'),
  false,
  '遷移後的記憶體設定不得繼續暴露語意不明的 sourceFingerprint'
);
assert.deepEqual(
  Array.from(migratedNotificationSettings.autoSyncHours),
  [3, 11, 18, 21],
  '遷移舊設定後仍應使用固定同步時段'
);
assert.deepEqual(
  Array.from(migratedNotificationSettings.selectedTitles),
  ['公民', '校慶'],
  '舊版 settings 應將所選課程與未排除活動遷移為單一 selectedTitles'
);
assert.deepEqual(
  Array.from(migratedNotificationSettings.excludedTitles),
  ['不參加的講座']
);
['selectedCourses', 'includeActivities', 'excludedActivities'].forEach(field => {
  assert.equal(Object.prototype.hasOwnProperty.call(migratedNotificationSettings, field), false);
});
context.clearChunkedStore_('TSCHOOL_SETTINGS');
context.clearChunkedStore_('TSCHOOL_SOURCE_UI_CACHE');

context.writeChunkedJson_('TSCHOOL_SOURCE_UI_CACHE', {
  gradeName: '高二',
  termKey: '二年級|2026-09-01',
  catalog: {
    all: [
      { title: '公民', type: 'course', period: 'term' },
      { title: '第一次模擬考', type: 'activity', period: 'term' }
    ]
  }
});
context.writeChunkedJson_('TSCHOOL_SETTINGS', {
  schemaVersion: 8,
  gradeName: '高二',
  termKey: '二年級|2026-02-23',
  pendingTermKey: '二年級|2026-09-01',
  setupComplete: true,
  autoSyncEnabled: true,
  selectedCourses: ['公民'],
  includeActivities: true,
  excludedActivities: []
});
const migratedPendingTermSettings = context.loadSettings_();
assert.deepEqual(
  Array.from(migratedPendingTermSettings.selectedTitles),
  [],
  '舊版已進入新學期待選狀態時，不得把舊分類活動直接變成已確認選擇'
);
assert.equal(migratedPendingTermSettings.pendingTermKey, '二年級|2026-1');
assert.equal(migratedPendingTermSettings.autoSyncEnabled, false);
context.clearChunkedStore_('TSCHOOL_SETTINGS');
context.clearChunkedStore_('TSCHOOL_SOURCE_UI_CACHE');

context.writeChunkedJson_('TSCHOOL_SOURCE_UI_CACHE', {
  gradeName: '高一',
  termKey: '二年級|2026-02-23',
  catalog: {
    all: [{ title: '錯年級活動', type: 'activity', period: 'term' }]
  }
});
context.writeChunkedJson_('TSCHOOL_SETTINGS', {
  schemaVersion: 8,
  gradeName: '高二',
  termKey: '二年級|2026-02-23',
  pendingTermKey: '',
  setupComplete: true,
  autoSyncEnabled: true,
  selectedCourses: ['公民'],
  includeActivities: true,
  excludedActivities: []
});
const migratedWithoutReliableCatalog = context.loadSettings_();
assert.deepEqual(
  Array.from(migratedWithoutReliableCatalog.selectedTitles),
  [],
  '缺少同年級同學期的舊分類摘要時，不得只遷移部分選擇並靜默漏掉活動'
);
assert.equal(
  migratedWithoutReliableCatalog.pendingTermKey,
  '二年級|2025-2',
  '無法可靠重建舊預設時應沿用既有新學期流程要求重新選擇'
);
assert.equal(migratedWithoutReliableCatalog.autoSyncEnabled, false);
assert.match(migratedWithoutReliableCatalog.pausedReason, /重新選擇課程與活動/);
context.clearChunkedStore_('TSCHOOL_SETTINGS');
context.clearChunkedStore_('TSCHOOL_SOURCE_UI_CACHE');
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
const normalLockService = context.LockService;
let rejectedPreparationReleased = false;
context.LockService = {
  getScriptLock() {
    return {
      tryLock(waitMs) {
        assert.equal(waitMs, 3000);
        return false;
      },
      releaseLock() {
        rejectedPreparationReleased = true;
      }
    };
  }
};
const busyOutlinePreparation = context.prepareFirstSyncCourseOutlinesFromUi({ gradeName: '高二' });
assert.equal(busyOutlinePreparation.busy, true);
assert.equal(rejectedPreparationReleased, false, '未取得課綱預載鎖時不得錯誤釋放');
context.LockService = normalLockService;
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
const lockAttemptsBeforeOutlinePreparation = scriptLockAttempts;
const lockReleasesBeforeOutlinePreparation = scriptLockReleases;
const completedOutlinePreparation = context.prepareFirstSyncCourseOutlinesFromUi({ gradeName: '高二' });
assert.equal(completedOutlinePreparation.skipped, true);
assert.equal(scriptLockAttempts, lockAttemptsBeforeOutlinePreparation + 1);
assert.equal(scriptLockReleases, lockReleasesBeforeOutlinePreparation + 1);
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
  getScriptId() {
    return 'test-script-id';
  },
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
context.ensureOneTimeTrigger_('watchScheduleSync', 60 * 1000);
const staleWatchdogId = projectTriggers.find(trigger =>
  trigger.getHandlerFunction() === 'watchScheduleSync'
).getUniqueId();
context.resetSyncWatchdogTrigger_();
const resetWatchdogs = projectTriggers.filter(trigger =>
  trigger.getHandlerFunction() === 'watchScheduleSync'
);
assert.equal(resetWatchdogs.length, 1);
assert.notEqual(
  resetWatchdogs[0].getUniqueId(),
  staleWatchdogId,
  '新批次同步必須刪除舊 watchdog 並重新計算完整等待時間'
);
assert.equal(resetWatchdogs[0].schedule.after, 5 * 60 * 1000);
projectTriggers = projectTriggers.filter(trigger =>
  trigger.getHandlerFunction() !== 'watchScheduleSync'
);

context.CalendarApp = {
  getCalendarById() {
    return null;
  }
};
assert.doesNotThrow(() => context.applySyncOperation_(
  {
    type: 'migration_delete',
    calendarEventId: 'deleted-calendar-event',
    oldKey: 'old-key'
  },
  {},
  null,
  {},
  false,
  { migrationDeleted: 0 },
  [],
  { migrationFromId: 'manually-deleted-calendar' }
), '舊日曆已被手動刪除時，migration_delete 應直接視為無項目可清理');
delete context.CalendarApp;
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
activeSetupAccountEmail = '';
const unverifiedAccountPreview = context.previewSetupCodeForUi(roundTripSetupCode);
assert.equal(unverifiedAccountPreview.accountMismatch, false);
assert.equal(
  unverifiedAccountPreview.accountVerificationUnavailable,
  true,
  'Workspace 隱私設定隱藏目前 Email 時，後端應回傳無法驗證狀態而非假裝相符'
);
const unconfirmedAccountImport = context.importSetupCodeFromUi(roundTripSetupCode);
assert.equal(unconfirmedAccountImport.applied, false);
assert.equal(unconfirmedAccountImport.requiresAccountConfirmation, true);
assert.equal(
  context.hasImportedSetup_(context.loadSettings_()),
  false,
  '使用者尚未明確確認無法驗證的帳號時，關閉視窗後不得留下可繞過提示的設定'
);
const confirmedUnverifiedImport = context.importSetupCodeFromUi(roundTripSetupCode, true);
assert.equal(confirmedUnverifiedImport.applied, true);
assert.equal(confirmedUnverifiedImport.accountVerificationUnavailable, true);
assert.equal(confirmedUnverifiedImport.requiresAccountConfirmation, false);
context.clearChunkedStore_('TSCHOOL_SETTINGS');
context.clearChunkedStore_('TSCHOOL_SETUP_SOURCE_CONTEXT');
context.writeChunkedJson_('TSCHOOL_SETUP_SOURCE_CONTEXT', legacyV2Source);
assert.doesNotThrow(() => context.loadSetupSourceContext_({
  gradeName: '高二',
  termKey: '二年級|2025-2',
  setupCodeVersion: 2,
  setupContextFingerprint: legacyV2Source.setupContextFingerprint
}));
context.clearChunkedStore_('TSCHOOL_SETUP_SOURCE_CONTEXT');
activeSetupAccountEmail = 'student+sync@example.com';
const importResult = context.importSetupCodeFromUi(roundTripSetupCode);
assert.equal(importResult.applied, true);
assert.equal(importResult.accountMismatch, false);
assert.equal(importResult.accountVerificationUnavailable, false);
assert.equal(importResult.message, '網站設定已匯入');
const importedSettings = context.loadSettings_();
assert.equal(importedSettings.setupComplete, false);
assert.equal(importedSettings.setupCodeVersion, 2);
assert.notEqual(importedSettings.setupImportedAt, '');
assert.equal(importedSettings.calendarId, '');
assert.deepEqual(Array.from(importedSettings.selectedTitles), ['公民／社會探究']);
assert.deepEqual(Array.from(importedSettings.notificationHours), [6, 12, 18, 22]);
const importedSourceContext = context.readChunkedJson_('TSCHOOL_SETUP_SOURCE_CONTEXT', null);
assert.equal(importedSourceContext.gradeName, '高二');
assert.equal(importedSourceContext.initialSetupSnapshot, true);
assert.equal(importedSourceContext.events.length, 0);
assert.equal(importedSourceContext.catalogFingerprintVersion, 3);
assert.equal(importedSourceContext.catalogFingerprint, roundTripCatalogFingerprint);
assert.equal(
  importedSettings.setupContextFingerprint,
  importedSourceContext.setupContextFingerprint
);
assert.equal(context.hasSetupSourceContext_(importedSettings), true);
const settingsAfterLiveScheduleChange = Object.assign({}, importedSettings, {
  scheduleFingerprint: 'live-api-schedule-fingerprint-b'
});
context.saveSettings_(settingsAfterLiveScheduleChange);
assert.doesNotThrow(
  () => context.loadSetupSourceContext_(context.loadSettings_()),
  '實際課表指紋由 A 變 B 時，不得再讓已儲存的設定上下文誤判為失效'
);
context.saveSettings_(Object.assign({}, settingsAfterLiveScheduleChange, {
  setupContextFingerprint: 'tampered-setup-context'
}));
assert.throws(
  () => context.loadSetupSourceContext_(context.loadSettings_()),
  /課表摘要已改變/,
  '真正的設定上下文篡改仍必須被阻擋'
);
context.saveSettings_(settingsAfterLiveScheduleChange);
assert.equal(projectTriggers.length, 0, '匯入設定碼時不得建立觸發器');
context.clearChunkedStore_('TSCHOOL_SETTINGS');
assert.equal(
  context.getControlPanelName_(),
  '行程同步控制臺｜T-SCHOOL Schedule Sync',
  '即使當次執行無法取得綁定文件，也不得因 footer 檔名中斷寄信'
);
let activeControlPanelName = '行程同步控制臺｜T-SCHOOL Schedule Sync';
context.DocumentApp = {
  getActiveDocument() {
    return {
      getName() {
        return activeControlPanelName;
      },
      getUrl() {
        return 'https://docs.google.com/document/d/control-panel/edit';
      }
    };
  }
};
assert.equal(context.getControlPanelName_(), activeControlPanelName);
context.CacheService = {
  getScriptCache() {
    return {
      get(key) {
        emailTemplateCacheReadCount += 1;
        assert.equal(key, 'TSCHOOL_EMAIL_TEMPLATE_MANIFEST_3FAE71BE');
        return cachedEmailTemplateManifest;
      },
      put(key, value, seconds) {
        assert.equal(key, 'TSCHOOL_EMAIL_TEMPLATE_MANIFEST_3FAE71BE');
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
      '5f31cd2fb263b9b5e579eab0d25c1b4f278f854f/notification-email-templates.json'
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

const originalSaveSettingsCoreForUiBoundary = context.saveSettingsCore_;
const originalSyncScheduleForUiBoundary = context.syncSchedule_;
const originalGetSettingsUiDataForUiBoundary = context.getSettingsUiData;
const originalNotifySyncFailureForUiBoundary = context.notifySyncFailureUnlessActionRequired_;
let falseSyncFailureNotifications = 0;
context.saveSettingsCore_ = () => ({ previousSetupComplete: false });
context.syncSchedule_ = () => ({ pending: true, jobId: 'job-after-calendar-write' });
context.getSettingsUiData = () => {
  throw new Error('模擬同步完成後 UI 重載失敗');
};
context.notifySyncFailureUnlessActionRequired_ = () => {
  falseSyncFailureNotifications += 1;
};
const committedSyncWithUiFailure = context.saveSettingsAndSyncFromUi({});
assert.equal(committedSyncWithUiFailure.pending, true);
assert.equal(committedSyncWithUiFailure.jobId, 'job-after-calendar-write');
assert.equal(committedSyncWithUiFailure.uiData, null);
assert.match(committedSyncWithUiFailure.uiRefreshWarning, /操作已完成/);
assert.equal(
  falseSyncFailureNotifications,
  0,
  'Calendar 寫入已成功後的 UI 重載失敗不得寄出「同步失敗」通知'
);
context.saveSettingsCore_ = originalSaveSettingsCoreForUiBoundary;
context.syncSchedule_ = originalSyncScheduleForUiBoundary;
context.getSettingsUiData = originalGetSettingsUiDataForUiBoundary;
context.notifySyncFailureUnlessActionRequired_ = originalNotifySyncFailureForUiBoundary;

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
  controlPanelName: activeControlPanelName,
  calendarUrl: 'https://calendar.google.com/calendar/u/0/r',
  summary: '新增 1、調整 2、取消 0、未變更 8',
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
    type: '調整',
    course: '測試課程',
    sourceName: '高二｜115-1-high2',
    oldStandard: '2026/07/27 第 5 節 吉林基地',
    newStandard: '2026/07/28 第 6 節 吉林基地',
    displayText: '調整｜測試課程'
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
const renderedScheduleChanges = context.buildEmailHtmlSafe_(
  'schedule_changes',
  '有 1 項行程調整',
  sampleEmailData
);
assert.match(
  renderedScheduleChanges,
  /＊部分資訊來自課綱，請以教師最新說明為主[\s\S]*>行程同步控制臺｜T-SCHOOL Schedule Sync<\/p>/,
  '課綱說明應位於行程調整卡片後、動態控制臺檔名 footer 前'
);
assert.doesNotMatch(
  renderedScheduleChanges,
  />調整<\/span>/,
  '行程調整 HTML 不應渲染右側類型標籤'
);
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
    '後續則會根據你的設定自動更新事件\n\n' +
    '行程同步控制臺｜T-SCHOOL Schedule Sync'
);
assert.match(sentEmailMessages.at(-1).htmlBody, /行程同步設定完成/);
assert.match(
  sentEmailMessages.at(-1).htmlBody,
  />行程同步控制臺｜T-SCHOOL Schedule Sync<\/p>/
);
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
  /function deliverPromotedNewTitleNoticeAfterSync_\([\s\S]*?'發現新的行程項目'[\s\S]*?已經過 24 小時穩定性確認[\s\S]*?'new_schedule_items'/,
  '新行程項目只能在 24 小時穩定性確認與 Calendar 同步後寄送'
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
context.saveNotificationQueueState_({
  pending: [],
  pendingChangeData: {
    created: 0,
    updated: 1,
    outlineUpdated: 0,
    deleted: 0,
    unchanged: 0,
    omittedCount: 0,
    changes: [{
      type: '更新',
      course: '舊版格式測試課程',
      oldStandard: '舊內容',
      newStandard: '新內容',
      displayText: '舊版更新'
    }]
  },
  lastChangeDate: '',
  lastSuccessSummaryDate: ''
});
const emailsBeforeLegacyQueueCleanup = sentEmailMessages.length;
assert.equal(
  context.deliverScheduleChangeNotification_(notificationTimingSettings, null),
  false,
  '舊版「更新」型別不得被寄成行程調整'
);
assert.equal(sentEmailMessages.length, emailsBeforeLegacyQueueCleanup);
assert.equal(
  context.loadNotificationQueueState_().pendingChangeData,
  null,
  '只含舊版「更新」型別的待寄資料應在升級後清除'
);
const scheduledChangeResult = {
  created: 0,
  updated: 1,
  outlineUpdated: 0,
  deleted: 0,
  unchanged: 8,
  omittedChangeCount: 0,
  changes: [{
    type: '調整',
    oldItem: {
      originalTitle: '測試課程',
      dateKey: '2026-07-27',
      periodStart: 5,
      periodEnd: 6,
      startTime: '13:25',
      endTime: '15:05',
      location: '吉林基地',
      isAllDay: false
    },
    newItem: {
      originalTitle: '測試課程',
      dateKey: '2026-07-28',
      periodStart: 3,
      periodEnd: 4,
      startTime: '10:15',
      endTime: '11:55',
      location: '吉林基地',
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
activeControlPanelName = '我的高二行程控制臺';
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
assert.match(
  sentEmailMessages.at(-1).body,
  /＊部分資訊來自課綱，請以教師最新說明為主/
);
assert.match(
  sentEmailMessages.at(-1).body,
  /\n\n我的高二行程控制臺$/
);
assert.match(
  sentEmailMessages.at(-1).htmlBody,
  /＊部分資訊來自課綱，請以教師最新說明為主[\s\S]*>我的高二行程控制臺<\/p>/
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
const loadCourseOutlineSourceIndexBeforeCachedUiTest = context.loadCourseOutlineSourceIndex_;
context.loadCourseOutlineSourceIndex_ = function () {
  throw new Error('控制臺初始顯示不應開啟中央課綱索引');
};
try {
  const cachedOnlyUiStatus = context.buildCourseOutlineUiStatus_(
    { gradeName: '高一' },
    {
      events: [{
        isAllDay: false,
        dateKey: '2026-09-15'
      }]
    },
    Object.assign({}, liveOutlineIndex, {
      source: 'last_success',
      warning: '模擬快取提示'
    })
  );
  assert.equal(cachedOnlyUiStatus.enabled, true);
  assert.equal(cachedOnlyUiStatus.configured, true);
  assert.equal(cachedOnlyUiStatus.indexSource, 'last_success');
  assert.equal(cachedOnlyUiStatus.indexWarning, '模擬快取提示');
} finally {
  context.loadCourseOutlineSourceIndex_ = loadCourseOutlineSourceIndexBeforeCachedUiTest;
}

const loadSettingsBeforeGradeContextTest = context.loadSettings_;
const loadSourceContextBeforeGradeContextTest = context.loadSourceContext_;
const loadIndexBeforeGradeContextTest = context.loadCourseOutlineSourceIndex_;
context.loadSettings_ = function () {
  return {
    setupImportedAt: '2026-01-01T00:00:00.000Z',
    setupCodeVersion: 1,
    gradeName: '高一',
    pendingTermKey: '一年級|2026-09-01',
    autoSyncEnabled: false,
    autoSyncEnabledBeforeTermTransition: true,
    termTransitionNoticeAttempts: 0,
    termTransitionNoticeSentAt: '',
    termTransitionNoticeLastError: ''
  };
};
context.loadSourceContext_ = function (gradeName) {
  assert.equal(gradeName, '高二');
  return {
    termKey: '二年級|2026-09-01',
    firstDateKey: '2026-09-01',
    lastDateKey: '2027-01-31',
    sourceUpdatedLabel: '08102026',
    events: [{ isAllDay: false, dateKey: '2026-09-15' }],
    catalog: {
      all: [{ title: '高二新課程', period: 'term' }],
      termItems: [{ title: '高二新課程', period: 'term' }],
      vacationItems: []
    }
  };
};
context.loadCourseOutlineSourceIndex_ = function () {
  return context.parseCourseOutlineSourceIndexValues_([
    simulatedOutlineIndexHeader,
    [
      'TRUE',
      '115-1-high2-grade-context',
      '115-1 高二—必修',
      '高二',
      '2026-09-01',
      '2027-01-31',
      'https://docs.google.com/spreadsheets/d/grade-context-sheet/edit'
    ]
  ]);
};
try {
  const switchedGradeContext = context.getGradeContextForUi('高二');
  assert.equal(switchedGradeContext.source.gradeName, '高二');
  assert.equal(switchedGradeContext.source.itemCount, 1);
  assert.equal(switchedGradeContext.courseOutlineStatus.enabled, true);
  assert.deepEqual(
    Array.from(switchedGradeContext.courseOutlineStatus.sourceSetLabels),
    ['115-1 高二—必修']
  );
  assert.equal(switchedGradeContext.termTransition.required, true);
  assert.equal(switchedGradeContext.termTransition.firstDate, '2026-09-01');
  assert.equal(switchedGradeContext.termTransition.lastDate, '2027-01-31');
} finally {
  context.loadSettings_ = loadSettingsBeforeGradeContextTest;
  context.loadSourceContext_ = loadSourceContextBeforeGradeContextTest;
  context.loadCourseOutlineSourceIndex_ = loadIndexBeforeGradeContextTest;
}

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
      getTransparency() { return this.transparency; },
      setTransparency(value) { this.transparency = value; },
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
  const start = new Date('2026-08-01T08:25:00+08:00');
  start.setDate(start.getDate() + index);
  const end = new Date(start.getTime() + 50 * 60 * 1000);
  return {
    originalTitle: `分批測試課程 ${index + 1}`,
    isAllDay: false,
    dateKey: formatDate(start, 'yyyy-MM-dd'),
    weekday: '一',
    weekNum: Math.floor(index / 7) + 1,
    periodStart: 1,
    periodEnd: 1,
    startTime: '08:25',
    endTime: '09:15',
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
    adjusted: 0,
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
context.CalendarApp = {
  EventTransparency: {
    OPAQUE: 'OPAQUE',
    TRANSPARENT: 'TRANSPARENT'
  }
};
const fixedTimeMigrationCalendar = createMockCalendar();
const fixedTimeMigrationDesired = Object.assign({}, makeBatchFixtureEvent(0), {
  originalTitle: '固定鐘點升級測試',
  location: '吉林基地'
});
const fixedTimeMigrationKey = context.makeOccurrenceKey_(fixedTimeMigrationDesired);
const legacyTimeStart = new Date('2026-08-01T08:10:00+08:00');
const legacyTimeEnd = new Date('2026-08-01T09:00:00+08:00');
const fixedTimeMigrationEvent = fixedTimeMigrationCalendar.createEvent(
  '固定鐘點升級測試 [吉林基地]',
  legacyTimeStart,
  legacyTimeEnd,
  { location: '吉林基地', description: '' }
);
context.setManagedEventTags_(fixedTimeMigrationEvent, fixedTimeMigrationKey);
const fixedTimeMigrationState = context.normalizeStoredState_({
  legacyFixedTime: {
    signatureVersion: 3,
    metadataVersion: 2,
    originalTitle: fixedTimeMigrationDesired.originalTitle,
    isAllDay: false,
    dateKey: fixedTimeMigrationDesired.dateKey,
    weekday: fixedTimeMigrationDesired.weekday,
    weekNum: fixedTimeMigrationDesired.weekNum,
    periodStart: 1,
    periodEnd: 1,
    startTime: '08:10',
    endTime: '09:00',
    start: legacyTimeStart.toISOString(),
    end: legacyTimeEnd.toISOString(),
    location: fixedTimeMigrationDesired.location,
    calendarEventId: fixedTimeMigrationEvent.getId(),
    syncSignature: 'legacy-time-signature',
    baseSyncSignature: 'legacy-time-base-signature'
  }
});
const fixedTimeMigrationPlan = context.buildSyncPlan_(
  fixedTimeMigrationState,
  [fixedTimeMigrationDesired],
  '2026-08-01'
);
const fixedTimeMigrationResult = context.applySyncPlan_(
  fixedTimeMigrationCalendar,
  fixedTimeMigrationState,
  fixedTimeMigrationPlan,
  batchSettings,
  { forceCalendarCheck: false, trackProgress: false }
);
assert.equal(fixedTimeMigrationResult.updated, 1);
assert.equal(
  fixedTimeMigrationResult.changes.length,
  0,
  '舊狀態第一次套用固定鐘點時可校正 Calendar，但不得產生假異動'
);
assert.equal(
  fixedTimeMigrationCalendar.getEventById(fixedTimeMigrationEvent.getId())
    .getStartTime().toISOString(),
  fixedTimeMigrationDesired.start.toISOString()
);
assert.equal(
  fixedTimeMigrationCalendar.getEventById(fixedTimeMigrationEvent.getId())
    .getEndTime().toISOString(),
  fixedTimeMigrationDesired.end.toISOString()
);
const popupReminderCalls = [];
const emailReminderCalls = [];
let reminderClearCalls = 0;
context.applyEventReminders_({
  removeAllReminders() { reminderClearCalls += 1; },
  addPopupReminder(minutes) { popupReminderCalls.push(minutes); },
  addEmailReminder(minutes) { emailReminderCalls.push(minutes); }
}, {
  reminderMode: 'popup',
  reminderMinutesList: [10, 60, 1440],
  reminderMinutes: 10
});
assert.equal(reminderClearCalls, 1);
assert.deepEqual(popupReminderCalls, [10, 60, 1440]);
assert.deepEqual(emailReminderCalls, [], '複選時間不得改變單選的提醒方式');
context.applyEventReminders_({
  removeAllReminders() { reminderClearCalls += 1; },
  addPopupReminder(minutes) { popupReminderCalls.push(minutes); },
  addEmailReminder(minutes) { emailReminderCalls.push(minutes); }
}, {
  reminderMode: 'email',
  reminderMinutesList: [30, 1440],
  reminderMinutes: 30
});
assert.equal(reminderClearCalls, 2);
assert.deepEqual(popupReminderCalls, [10, 60, 1440]);
assert.deepEqual(emailReminderCalls, [30, 1440]);
const neutralTitleCalendar = createMockCalendar();
const neutralTitleItem = Object.assign({}, makeBatchFixtureEvent(0), {
  originalTitle: '模擬考'
});
const neutralTitleEvent = context.createCalendarEvent_(
  neutralTitleCalendar,
  neutralTitleItem,
  context.makeOccurrenceKey_(neutralTitleItem),
  batchSettings
);
assert.equal(neutralTitleEvent.getTitle(), '模擬考 [測試教室]');
assert.equal(
  neutralTitleEvent.getTransparency(),
  'OPAQUE',
  '一般行程應明確維持 Busy'
);
assert.equal(
  neutralTitleEvent.getTitle().includes('活動｜'),
  false,
  '類似活動的行程也不得在 Calendar 標題加上分類前綴'
);
const scheduleNoteItem = Object.assign({}, makeBatchFixtureEvent(0), {
  originalTitle: '備註｜開放吉林六樓階梯教室自習。',
  isAllDay: true
});
const scheduleNoteEvent = context.createCalendarEvent_(
  neutralTitleCalendar,
  scheduleNoteItem,
  context.makeOccurrenceKey_(scheduleNoteItem),
  batchSettings
);
assert.equal(scheduleNoteEvent.isAllDayEvent(), true);
assert.equal(scheduleNoteEvent.getTitle(), '備註｜開放吉林六樓階梯教室自習。');
assert.equal(
  scheduleNoteEvent.getTransparency(),
  'TRANSPARENT',
  '備註行程應設為 Available'
);
const holidayItem = Object.assign({}, makeBatchFixtureEvent(1), {
  originalTitle: '中秋節放假',
  isAllDay: true
});
const holidayEvent = context.createCalendarEvent_(
  neutralTitleCalendar,
  holidayItem,
  context.makeOccurrenceKey_(holidayItem),
  batchSettings
);
assert.equal(
  holidayEvent.getTransparency(),
  'TRANSPARENT',
  '放假行程應設為 Available'
);
assert.equal(context.isNonBlockingScheduleTitle_('國定假日'), true);
assert.equal(context.isNonBlockingScheduleTitle_('補假'), true);
assert.equal(context.isNonBlockingScheduleTitle_('開學典禮'), false);
assert.equal(
  context.shouldIncludeEvent_(scheduleNoteItem, {
    selectedTitles: [],
    excludedTitles: ['備註｜開放吉林六樓階梯教室自習。'],
    pendingTitles: []
  }),
  true,
  '備註行程不可被舊設定或隱藏的排除狀態漏掉'
);
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
  Object.values(batchState).every(item =>
    item.signatureVersion === 4 && !Object.prototype.hasOwnProperty.call(item, 'type')
  ),
  true,
  '新狀態應使用中性短雜湊簽章版本，且不得保存 type'
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
    selectedTitles: ['測試課程'],
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
    schemaVersion: 9,
    gradeName: '高二',
    setupComplete: true,
    selectedTitles: ['測試課程'],
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
      all: [{ title: '測試課程', period: 'term' }]
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
const explicitSelectionOverridesExclusion = context.sanitizeSettingsInput_(
  Object.assign({}, migrationSanitized, {
    selectedTitles: ['第一次模擬考']
  }),
  Object.assign({}, migrationSanitized, {
    selectedTitles: ['測試課程'],
    excludedTitles: ['第一次模擬考']
  }),
  {
    termKey: '二年級|2026-02-23',
    scheduleFingerprint: 'source',
    catalog: {
      all: [{ title: '第一次模擬考', period: 'term' }]
    }
  }
);
assert.deepEqual(
  Array.from(explicitSelectionOverridesExclusion.selectedTitles),
  ['第一次模擬考']
);
assert.deepEqual(
  Array.from(explicitSelectionOverridesExclusion.excludedTitles),
  [],
  '使用者明確重新勾選時必須同步移除舊 excludedTitles 衝突'
);
assert.equal(
  context.shouldIncludeEvent_(
    { originalTitle: '第一次模擬考' },
    {
      selectedTitles: ['第一次模擬考'],
      excludedTitles: ['第一次模擬考'],
      pendingTitles: []
    }
  ),
  true,
  '即使讀到舊衝突狀態，明確 selectedTitles 仍必須優先'
);
const naturalAdvancedSanitized = context.sanitizeSettingsInput_(
  Object.assign({}, migrationSanitized, {
    calendarId: '',
    calendarMigrationFromId: '',
    selectedTitles: ['自然進階(二)_化學']
  }),
  Object.assign({}, migrationSanitized, {
    calendarId: '',
    calendarMigrationFromId: '',
    selectedTitles: ['測試課程'],
    excludedTitles: []
  }),
  {
    termKey: '二年級|2026-02-23',
    scheduleFingerprint: 'source',
    catalog: { all: naturalAdvancedCatalog }
  }
);
assert.deepEqual(
  Array.from(naturalAdvancedSanitized.selectedTitles),
  ['自然進階(二)', '自然進階(二)_化學', '備註｜開放吉林六樓階梯教室自習。'],
  '控制臺儲存時必須補上自然進階共同事件與所有備註'
);
assert.equal(
  context.shouldIncludeEvent_(
    { originalTitle: '自然進階(二)' },
    {
      selectedTitles: ['自然進階(二)_生物'],
      excludedTitles: [],
      pendingTitles: []
    }
  ),
  true,
  '只要選擇任一自然進階分科，共同事件就必須進入同步範圍'
);
assert.equal(
  context.shouldIncludeEvent_(
    { originalTitle: '自然進階(二)' },
    { selectedTitles: [], excludedTitles: [], pendingTitles: [] }
  ),
  false,
  '沒有選擇自然進階分科時不得自動同步共同事件'
);
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
      all: [{ title: '測試課程', period: 'term' }]
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
      all: [{ title: '測試課程', period: 'term' }]
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
  termKey: '二年級|2026-1',
  firstDateKey: '2026-09-01',
  lastDateKey: '2027-01-31',
  scheduleFingerprint: 'new-term-source',
  events: [],
  catalog: {
    all: [
      { title: '新學期課程', period: 'term' },
      { title: '全校開學活動', period: 'term' },
      { title: '第一次模擬考', period: 'term' }
    ]
  }
};
const settingsBeforeTermTransition = Object.assign({}, migrationSanitized, {
  setupComplete: true,
  termKey: '二年級|2025-2',
  pendingTermKey: '',
  selectedTitles: ['測試課程'],
  excludedTitles: ['測試活動'],
  pendingTitles: ['待確認課程'],
  instantNotificationsEnabled: false,
  notificationHours: [(Number(formatDate(new Date(), 'H')) + 1) % 24],
  notifySyncHour: (Number(formatDate(new Date(), 'H')) + 1) % 24,
  autoSyncEnabled: true,
  autoSyncEnabledBeforeTermTransition: null,
  termTransitionNoticeAttempts: 0,
  termTransitionNoticeScheduledFor: '',
  termTransitionNoticeSentAt: '',
  termTransitionNoticeLastError: ''
});
context.clearChunkedStore_('TSCHOOL_SOURCE_OBSERVATION');
const emailsBeforeTermTransition = sentOutlineFailureEmails;
const verifyingSettings = context.applyTermTransitionIfNeeded_(
  settingsBeforeTermTransition,
  newTermSource,
  true
);
assert.equal(verifyingSettings.pendingTermKey, '');
assert.deepEqual(Array.from(verifyingSettings.selectedTitles), ['測試課程']);
assert.equal(verifyingSettings.autoSyncEnabled, true);
let termObservation = context.loadSourceObservation_();
assert.equal(termObservation.termCandidate.termKey, newTermSource.termKey);
assert.equal(
  projectTriggers.some(trigger =>
    trigger.getHandlerFunction() === 'verifyTermTransitionCandidate'
  ),
  true,
  '第一次看到不同學期只安排 30 分鐘驗證'
);
termObservation.termCandidate.verificationDueAt = new Date(Date.now() - 1000).toISOString();
context.saveSourceObservation_(termObservation);
assert.throws(
  () => context.applyTermTransitionIfNeeded_(
    settingsBeforeTermTransition,
    newTermSource,
    false
  ),
  /已確認進入新學期/,
  '一般同步剛好完成新學期確認時，也必須中止當次 Calendar 同步'
);
const transitionedSettings = settingsBeforeTermTransition;
assert.equal(transitionedSettings.pendingTermKey, newTermSource.termKey);
assert.deepEqual(
  Array.from(transitionedSettings.selectedTitles),
  ['全校開學活動', '第一次模擬考']
);
assert.equal(transitionedSettings.autoSyncEnabled, false);
assert.equal(transitionedSettings.autoSyncEnabledBeforeTermTransition, true);
assert.equal(transitionedSettings.termTransitionNoticeAttempts, 0);
assert.equal(transitionedSettings.termTransitionNoticeSentAt, '');
assert.notEqual(transitionedSettings.termTransitionNoticeScheduledFor, '');
assert.equal(sentOutlineFailureEmails, emailsBeforeTermTransition);
assert.equal(context.loadSourceObservation_().termCandidate, null);
assert.throws(
  () => context.assertTermTransitionCalendarWritesAllowed_(transitionedSettings),
  /先重新選擇課程與活動/,
  '新學期已確認但尚未重新選課時，Calendar 寫入守門不得放行'
);
context.deliverTermTransitionNotice_(transitionedSettings, newTermSource);
assert.equal(sentOutlineFailureEmails, emailsBeforeTermTransition + 1);
assert.match(sentEmailSubjects.at(-1), /需要重新選擇課程與活動/);
assert.match(
  sentEmailMessages.at(-1).body,
  /已進入新學期，為避免把上學期的選擇直接套到新學期，請重新選擇課程與活動/
);
assert.match(
  sentEmailMessages.at(-1).htmlBody,
  /在行程同步控制臺確認新學期就讀年級、重新選擇課程與活動/
);
assert.match(sentEmailMessages.at(-1).body, /完成新學期同步前/);
assert.match(sentEmailMessages.at(-1).body, /確認新學期就讀年級/);
assert.match(sentEmailMessages.at(-1).htmlBody, /2026-09-01–2027-01-31/);
context.deliverTermTransitionNotice_(transitionedSettings, newTermSource);
assert.equal(
  sentOutlineFailureEmails,
  emailsBeforeTermTransition + 1,
  '同一學期已成功寄送的提醒不得重複寄出'
);
context.clearChunkedStore_('TSCHOOL_NOTIFICATION_QUEUE');
context.queueNotification_({
  key: 'legacy-term-transition',
  templateKind: 'term_transition',
  subject: '需要重新選擇課程與活動',
  body: '舊版排程通知',
  templateData: {}
});
const legacyQueuedTermSettings = Object.assign({}, transitionedSettings, {
  termTransitionNoticeAttempts: 0,
  termTransitionNoticeScheduledFor: '',
  termTransitionNoticeSentAt: '2026-08-24T00:00:00.000Z',
  notificationHours: [(Number(formatDate(new Date(), 'H')) + 1) % 24]
});
context.applyTermTransitionIfNeeded_(legacyQueuedTermSettings, newTermSource, true);
assert.equal(legacyQueuedTermSettings.termTransitionNoticeSentAt, '');
assert.notEqual(legacyQueuedTermSettings.termTransitionNoticeScheduledFor, '');
assert.equal(
  context.loadNotificationQueueState_().pending.some(item =>
    item.templateKind === 'term_transition'
  ),
  false,
  '舊版被誤標為已寄送的學期通知必須改用專用觸發器'
);
context.deleteTriggersByHandlers_(['retryTermTransitionNotice']);

context.ensureOneTimeTrigger_('retryTermTransitionNotice', 60 * 1000);
const termNoticeTriggerBeforeBusyLock = projectTriggers.find(trigger =>
  trigger.getHandlerFunction() === 'retryTermTransitionNotice'
).getUniqueId();
context.LockService = {
  getScriptLock() {
    return {
      tryLock(waitMs) {
        assert.equal(waitMs, 15000);
        return false;
      },
      releaseLock() {
        assert.fail('未取得新學期通知鎖時不得釋放');
      }
    };
  }
};
assert.equal(context.retryTermTransitionNotice(), false);
const termNoticeTriggersAfterBusyLock = projectTriggers.filter(trigger =>
  trigger.getHandlerFunction() === 'retryTermTransitionNotice'
);
assert.equal(termNoticeTriggersAfterBusyLock.length, 1);
assert.notEqual(
  termNoticeTriggersAfterBusyLock[0].getUniqueId(),
  termNoticeTriggerBeforeBusyLock,
  '新學期通知遇到鎖競爭時，必須移除已消耗的觸發器並建立重試'
);
context.LockService = normalLockService;
context.deleteTriggersByHandlers_(['retryTermTransitionNotice']);

const laterTermSource = Object.assign({}, newTermSource, {
  termKey: '二年級|2026-2',
  firstDateKey: '2027-02-22',
  lastDateKey: '2027-06-30',
  scheduleFingerprint: 'later-term-source'
});
const failedNoticeSettings = Object.assign({}, settingsBeforeTermTransition, {
  termKey: newTermSource.termKey,
  pendingTermKey: '',
  selectedTitles: ['新學期課程'],
  autoSyncEnabled: true,
  notificationHours: [Number(formatDate(new Date(), 'H'))],
  notifySyncHour: Number(formatDate(new Date(), 'H'))
});
mailFailuresRemaining = 1;
context.clearChunkedStore_('TSCHOOL_SOURCE_OBSERVATION');
context.applyTermTransitionIfNeeded_(
  failedNoticeSettings,
  laterTermSource,
  true
);
termObservation = context.loadSourceObservation_();
termObservation.termCandidate.verificationDueAt = new Date(Date.now() - 1000).toISOString();
context.saveSourceObservation_(termObservation);
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
const loadSourceContextBeforeMailRetryTest = context.loadSourceContext_;
context.loadSourceContext_ = () => laterTermSource;
assert.equal(context.retryTermTransitionNotice(), true);
context.loadSourceContext_ = loadSourceContextBeforeMailRetryTest;
const deliveredTransition = context.loadSettings_();
assert.equal(deliveredTransition.termTransitionNoticeAttempts, 2);
assert.notEqual(deliveredTransition.termTransitionNoticeSentAt, '');
assert.equal(
  projectTriggers.some(trigger =>
    trigger.getHandlerFunction() === 'retryTermTransitionNotice'
  ),
  false,
  '重試成功後應移除未執行的提醒觸發器'
);

const loadSourceContextBeforeTermNoticeRetryTest = context.loadSourceContext_;
context.saveSettings_(Object.assign({}, failedTransition, {
  pendingTermKey: laterTermSource.termKey,
  termTransitionNoticeAttempts: 0,
  termTransitionNoticeScheduledFor: new Date(Date.now() + 60 * 1000).toISOString(),
  termTransitionNoticeSentAt: '',
  termTransitionNoticeLastError: ''
}));
context.loadSourceContext_ = () => { throw new Error('模擬新學期來源讀取失敗'); };
context.ensureOneTimeTrigger_('retryTermTransitionNotice', 60 * 1000);
assert.equal(context.retryTermTransitionNotice(), false);
let sourceRetrySettings = context.loadSettings_();
assert.equal(sourceRetrySettings.termTransitionNoticeAttempts, 1);
assert.match(sourceRetrySettings.termTransitionNoticeLastError, /來源讀取失敗/);
assert.equal(
  projectTriggers.filter(trigger =>
    trigger.getHandlerFunction() === 'retryTermTransitionNotice'
  ).length,
  1,
  '新學期信件寄送前讀取來源失敗時，必須保留一次重試'
);
assert.equal(context.retryTermTransitionNotice(), false);
sourceRetrySettings = context.loadSettings_();
assert.equal(sourceRetrySettings.termTransitionNoticeAttempts, 2);
assert.equal(sourceRetrySettings.termTransitionNoticeScheduledFor, '');
assert.equal(
  context.buildTermTransitionUiModel_(sourceRetrySettings, laterTermSource).noticeState,
  'failed',
  '新學期信件重試耗盡後，控制臺必須顯示失敗而不是已排程'
);
assert.equal(
  projectTriggers.some(trigger =>
    trigger.getHandlerFunction() === 'retryTermTransitionNotice'
  ),
  false,
  '新學期信件來源連續失敗達上限後，必須停止假裝仍在排程'
);
context.loadSourceContext_ = loadSourceContextBeforeTermNoticeRetryTest;

context.clearChunkedStore_('TSCHOOL_SOURCE_OBSERVATION');
context.clearChunkedStore_('TSCHOOL_NOTICE_STATE');
context.clearChunkedStore_('TSCHOOL_NOTIFICATION_QUEUE');
const stableTitleSettings = Object.assign({}, settingsBeforeTermTransition, {
  termKey: '二年級|2025-2',
  knownTitles: ['測試課程'],
  pendingTitles: [],
  excludedTitles: [],
  selectedTitles: ['測試課程'],
  instantNotificationsEnabled: false,
  notificationHours: [Number(formatDate(new Date(), 'H'))]
});
const stableTitleSource = {
  termKey: '二年級|2025-2',
  catalog: {
    all: [
      { title: '測試課程', period: 'term' },
      { title: '新的穩定行程', period: 'term' }
    ]
  }
};
const emailsBeforeStableTitle = sentOutlineFailureEmails;
context.registerNewTitles_(stableTitleSettings, stableTitleSource);
assert.deepEqual(Array.from(stableTitleSettings.pendingTitles), []);
assert.deepEqual(Array.from(stableTitleSettings.selectedTitles), ['測試課程']);
assert.equal(sentOutlineFailureEmails, emailsBeforeStableTitle);
let titleObservation = context.loadSourceObservation_();
assert.equal(titleObservation.newTitleCandidates.length, 1);
titleObservation.newTitleCandidates[0].firstSeenAt =
  new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
context.saveSourceObservation_(titleObservation);
context.registerNewTitles_(stableTitleSettings, stableTitleSource);
assert.deepEqual(Array.from(stableTitleSettings.pendingTitles), ['新的穩定行程']);
assert.equal(stableTitleSettings.selectedTitles.includes('新的穩定行程'), true);
assert.equal(sentOutlineFailureEmails, emailsBeforeStableTitle);
assert.equal(
  context.deliverPromotedNewTitleNoticeAfterSync_(
    stableTitleSettings,
    stableTitleSource,
    { future: { dateKey: '9999-12-31', originalTitle: '新的穩定行程' } }
  ),
  true
);
assert.equal(sentOutlineFailureEmails, emailsBeforeStableTitle + 1);
assert.match(sentEmailSubjects.at(-1), /發現新的行程項目/);
assert.equal(context.loadSourceObservation_().pendingNewTitleNotice, null);

const restoredAfterSelection = context.sanitizeSettingsInput_(
  Object.assign({}, migrationSanitized, {
    gradeName: '高二',
    selectedTitles: ['新學期課程'],
    calendarId: '',
    calendarName: '新專用日曆',
    calendarMigrationFromId: '',
    autoSyncEnabled: true,
    termGradeConfirmed: true
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
assert.throws(
  () => context.sanitizeSettingsInput_(
    Object.assign({}, migrationSanitized, {
      gradeName: '高二',
      selectedTitles: ['新學期課程'],
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
  ),
  /確認新學期就讀年級/,
  '新學期不得只沿用舊年級；使用者必須明確確認目前年級'
);
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
        all: [{ title: '測試課程', period: 'term' }]
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
  stats: {
    created: 0,
    updated: 0,
    adjusted: 0,
    outlineUpdated: 0,
    deleted: 0,
    migrationDeleted: 0
  },
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
  '命中分頁時不應列為缺少課綱'
);
outlineWorkbookSheets = {
  [configuredHigh2OutlineSet.spreadsheetIds[0]]: [
    makeOutlineSheet(' 測 試　ｃｏｕｒｓｅA ', outlineValues)
  ],
  [configuredHigh2OutlineSet.spreadsheetIds[1]]: [],
  [configuredHigh2OutlineSet.spreadsheetIds[2]]: [],
  [configuredHigh2OutlineSet.spreadsheetIds[3]]: []
};
const normalizedMatchEvent = Object.assign({}, outlineBaseItem, {
  originalTitle: '測試 Course Ａ'
});
const normalizedMatchSnapshot = context.collectCourseOutlineSnapshot_(
  { gradeName: '高二' },
  { termKey: '二年級|2026-02-23' },
  [
    normalizedMatchEvent,
    Object.assign({}, outlineBaseItem, {
      originalTitle: '週五跨校選修',
      dateKey: '2026-07-28',
      start: new Date('2026-07-28T13:10:00+08:00'),
      end: new Date('2026-07-28T15:00:00+08:00')
    })
  ],
  [configuredHigh2OutlineSet]
);
assert.equal(normalizedMatchSnapshot.diagnostics.matchedRecordCount, 1);
const normalizedMatchLookupKey = context.makeCourseOutlineOccurrenceKey_(
  normalizedMatchEvent.originalTitle,
  normalizedMatchEvent.dateKey,
  normalizedMatchEvent.periodStart,
  normalizedMatchEvent.periodEnd
);
assert.equal(
  normalizedMatchSnapshot.lookup[normalizedMatchLookupKey].topic,
  '混合式主題',
  '名稱只有全半形、空白與大小寫差異時，課綱應附加到原始課表名稱'
);
assert.deepEqual(
  Array.from(normalizedMatchSnapshot.diagnostics.missingSheetNames),
  [],
  '正規化命中分頁名稱的行程不應被當成缺頁錯誤'
);
assert.deepEqual(
  Array.from(normalizedMatchSnapshot.diagnostics.ignoredCrossSchoolSheetNames),
  [],
  '未命中的行程不需再依名稱類型分流'
);
assert.deepEqual(
  Array.from(normalizedMatchSnapshot.diagnostics.nearMatchSheetNames),
  [],
  '可忽略的名稱差異已直接配對，不應列為 near-match 錯誤'
);
assert.equal(
  context.makeCourseOutlineSheetMatchKey_('自然進階(二)_化學'),
  context.makeCourseOutlineSheetMatchKey_('自然進階(二)'),
  '自然進階分科必須共用自然進階共同課綱分頁'
);
outlineWorkbookSheets = {
  [configuredHigh2OutlineSet.spreadsheetIds[0]]: [
    makeOutlineSheet('自然進階(二)', outlineValues)
  ],
  [configuredHigh2OutlineSet.spreadsheetIds[1]]: [],
  [configuredHigh2OutlineSet.spreadsheetIds[2]]: [],
  [configuredHigh2OutlineSet.spreadsheetIds[3]]: []
};
const naturalAdvancedOutlineEvent = Object.assign({}, outlineBaseItem, {
  originalTitle: '自然進階(二)_化學'
});
const naturalAdvancedOutlineSnapshot = context.collectCourseOutlineSnapshot_(
  { gradeName: '高二' },
  { termKey: '二年級|2026-02-23' },
  [naturalAdvancedOutlineEvent],
  [configuredHigh2OutlineSet]
);
const naturalAdvancedOutlineKey = context.makeCourseOutlineOccurrenceKey_(
  naturalAdvancedOutlineEvent.originalTitle,
  naturalAdvancedOutlineEvent.dateKey,
  naturalAdvancedOutlineEvent.periodStart,
  naturalAdvancedOutlineEvent.periodEnd
);
assert.equal(
  naturalAdvancedOutlineSnapshot.lookup[naturalAdvancedOutlineKey].topic,
  '混合式主題',
  '自然進階分科事件必須取得共同分頁課綱，且快照保留分科事件原名'
);
const conflictingOutlineValues = outlineValues.map(row => row.slice());
conflictingOutlineValues[3][6] = '互相衝突的主題';
outlineWorkbookSheets = Object.assign({}, outlineWorkbookSheets, {
  [configuredHigh2OutlineSet.spreadsheetIds[0]]: [makeOutlineSheet('測試課程', outlineValues)],
  [configuredHigh2OutlineSet.spreadsheetIds[1]]: [makeOutlineSheet('測 試 課 程', conflictingOutlineValues)]
});
const conflictingOutlineSnapshot = context.collectCourseOutlineSnapshot_(
  { gradeName: '高二' },
  { termKey: '二年級|2026-02-23' },
  [Object.assign({}, outlineBaseItem)],
  [configuredHigh2OutlineSet]
);
assert.equal(
  Object.keys(conflictingOutlineSnapshot.lookup).length,
  0,
  '正規化後相同的分頁、日期與節次出現衝突時，該筆不得任選'
);
assert.equal(
  conflictingOutlineSnapshot.diagnostics.unavailableItemCount,
  1,
  '重複衝突只應隔離受影響課程，不得讓整批課綱失敗'
);

const high2OutlineSets = context.getRelevantCourseOutlineSourceSets_('高二', [{
  isAllDay: false,
  dateKey: '2026-07-27'
}]);
const snapshotLookupKey = context.makeCourseOutlineOccurrenceKey_('測試課程', '2026-07-27', 5, 6);
const publishedSnapshot = context.publishCourseOutlineSnapshot_({
  schemaVersion: 2,
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
const currentGradeOutlineStatus = context.buildCourseOutlineUiStatus_(
  { gradeName: '高二' },
  { termKey: '二年級|2026-02-23', events: [outlineBaseItem] },
  {
    source: 'live',
    warning: '',
    setsByGrade: { '高一': [], '高二': high2OutlineSets, '高三': [] }
  }
);
assert.equal(
  currentGradeOutlineStatus.matchedRecordCount,
  1,
  '目前年級與學期相符時仍應顯示課綱快照結果'
);
assert.equal(currentGradeOutlineStatus.lastSuccessLabel, '2026/07/24 20:00');
const switchedGradeOutlineStatus = context.buildCourseOutlineUiStatus_(
  { gradeName: '高一' },
  {
    termKey: '一年級|2026-09-01',
    events: [{ isAllDay: false, dateKey: '2026-09-15' }]
  },
  changedOutlineIndex
);
assert.equal(
  switchedGradeOutlineStatus.matchedRecordCount,
  0,
  '切換年級後不得顯示前一個年級課綱快照的命中筆數'
);
assert.equal(
  switchedGradeOutlineStatus.lastSuccessAt,
  '',
  '切換年級後不得沿用前一個年級的課綱成功時間'
);
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
const expectedScheduleTriggerTimes = [3, 11, 18, 21].map(hour => {
  const triggerTime = context.getScheduleSyncTriggerTime_(hour);
  return [Number(triggerTime.hour), Number(triggerTime.minute)];
});
assert.deepEqual(
  fixedScheduleTriggers.map(trigger => [trigger.schedule.hour, trigger.schedule.nearMinute]),
  expectedScheduleTriggerTimes,
  '通知設定不得改變固定四個窗口內分配到的課表偵測時間'
);
[3, 11, 18, 21].forEach((anchorHour, index) => {
  const scheduledMinute = expectedScheduleTriggerTimes[index][0] * 60 +
    expectedScheduleTriggerTimes[index][1];
  const anchorMinute = anchorHour * 60;
  const centeredOffset = (scheduledMinute - anchorMinute + 12 * 60) % (24 * 60) - 12 * 60;
  assert.equal(
    Math.abs(centeredOffset) <= 45,
    true,
    '同步 Trigger 的中心時間必須保留 Google ±15 分鐘誤差，確保實際執行不超過 ±1 小時窗口'
  );
});
assert.deepEqual(
  projectTriggers
    .filter(trigger => trigger.getHandlerFunction() === 'sendScheduledNotifications')
    .map(trigger => trigger.schedule.hour),
  [5],
  '非最後通知時間只能建立通知寄送 Trigger'
);
assert.deepEqual(
  projectTriggers
    .filter(trigger => trigger.getHandlerFunction() === 'sendScheduledNotifications')
    .map(trigger => trigger.schedule.nearMinute),
  [0],
  '通知 Trigger 應維持整點前後約 15 分鐘的既有精度'
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
assert.deepEqual(
  projectTriggers
    .filter(trigger =>
      trigger.getHandlerFunction() === 'sendScheduledNotificationsWithDailySummary'
    )
    .map(trigger => trigger.schedule.nearMinute),
  [0],
  '每日摘要 Trigger 應維持整點前後約 15 分鐘的既有精度'
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
    .filter(trigger => trigger.getHandlerFunction() === 'syncMyScheduleToCalendar')
    .map(trigger => [trigger.schedule.hour, trigger.schedule.nearMinute]),
  expectedScheduleTriggerTimes,
  '同一份控制臺重新建立 Trigger 時必須維持相同分配，避免同一窗口內重複同步'
);
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
context.refreshAutoSyncTriggers_({
  gradeName: '高二',
  autoSyncEnabled: true,
  pendingTermKey: '二年級|2026-09-01',
  instantNotificationsEnabled: false,
  notificationHours: [5],
  notifySyncHour: 5
});
assert.equal(
  projectTriggers.some(trigger => [
    'syncMyScheduleToCalendar',
    'sendScheduledNotifications',
    'sendScheduledNotificationsWithDailySummary',
    'refreshCourseOutlinesDaily'
  ].includes(trigger.getHandlerFunction())),
  false,
  '新學期待重新選課時，即使舊背景流程帶著 autoSyncEnabled=true 也不得重建每日觸發器'
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
assert.equal(context.scheduleCourseOutlineRefreshIfNeeded_({
  gradeName: '高二',
  setupComplete: true,
  autoSyncEnabled: true,
  pendingTermKey: '二年級|2026-09-01'
}), false);
assert.equal(
  projectTriggers.some(trigger =>
    trigger.getHandlerFunction() === 'refreshCourseOutlinesOnce'
  ),
  false,
  '新學期待重新選課時不得排定一次性課綱更新'
);
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

assert.equal(context.scheduleCourseOutlineRefreshIfNeeded_({
  gradeName: '高二',
  setupComplete: true,
  autoSyncEnabled: false,
  pendingTermKey: ''
}), false);
assert.equal(
  projectTriggers.some(trigger =>
    trigger.getHandlerFunction() === 'refreshCourseOutlinesManualOnce'
  ),
  false,
  '關閉自動同步且沒有手動要求時，不應自行建立課綱工作'
);
assert.equal(context.scheduleCourseOutlineRefreshIfNeeded_({
  gradeName: '高二',
  setupComplete: true,
  autoSyncEnabled: false,
  pendingTermKey: ''
}, null, { allowWhenAutoSyncDisabled: true }), true);
assert.equal(
  projectTriggers.filter(trigger =>
    trigger.getHandlerFunction() === 'refreshCourseOutlinesManualOnce'
  ).length,
  1,
  '使用者手動同步時，即使自動同步關閉也應排定一次手動課綱更新'
);
assert.equal(
  projectTriggers.some(trigger => [
    'syncMyScheduleToCalendar',
    'refreshCourseOutlinesDaily'
  ].includes(trigger.getHandlerFunction())),
  false,
  '一次性手動課綱更新不得偷偷恢復每日課表或課綱觸發器'
);
assert.equal(
  context.canRunCourseOutlineRefreshWhileAutoSyncDisabled_('manual', {}),
  true
);
assert.equal(
  context.canRunCourseOutlineRefreshWhileAutoSyncDisabled_(
    'retry',
    { reason: 'manual' }
  ),
  true,
  '手動課綱更新第一次失敗後，即使自動同步關閉也必須允許第二次重試'
);
assert.equal(
  context.canRunCourseOutlineRefreshWhileAutoSyncDisabled_(
    'retry',
    { reason: 'scheduled' }
  ),
  false
);
projectTriggers = projectTriggers.filter(trigger =>
  !['refreshCourseOutlinesOnce', 'refreshCourseOutlinesManualOnce']
    .includes(trigger.getHandlerFunction())
);

const settingsBeforePendingTermOutline = context.loadSettings_();
context.saveSettings_(Object.assign({}, settingsBeforePendingTermOutline, {
  gradeName: '高二',
  setupComplete: true,
  autoSyncEnabled: true,
  pendingTermKey: '二年級|2026-09-01'
}));
const pendingTermOutlineResult = context.runCourseOutlineRefreshAttempt_(1, 'manual');
assert.equal(pendingTermOutlineResult.skipped, true);
assert.match(pendingTermOutlineResult.message, /先重新選擇課程與活動/);
context.saveSettings_(settingsBeforePendingTermOutline);

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
function makeOutlineFailureError(message, unavailableItemCount) {
  const error = new Error(message);
  error.courseOutlineUnavailableItemCount = unavailableItemCount;
  return error;
}
context.saveCourseOutlineState_(firstFailureRun);
context.handleCourseOutlineRefreshFailure_(
  firstFailureRun,
  makeOutlineFailureError('第一次失敗', 4)
);
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
context.handleCourseOutlineRefreshFailure_(
  secondFailureRun,
  makeOutlineFailureError('第二次失敗', 4)
);
outlineFailureState = context.loadCourseOutlineState_();
assert.equal(outlineFailureState.status, 'failed');
assert.equal(sentOutlineFailureEmails, 1, '超過三項的課綱在第二次失敗後應寄信一次');
assert.match(sentEmailMessages.at(-1).body, /有 4 項課程或活動/);
assert.match(sentEmailMessages.at(-1).subject, /部分課綱無法更新/);
assert.match(sentEmailMessages.at(-1).htmlBody, /課綱更新失敗/);
assert.notEqual(outlineFailureState.failureNotifiedAt, '');

const repeatedFailureRun = Object.assign({}, outlineFailureState, {
  status: 'running',
  attempt: 2,
  runId: 'outline-run-3',
  startedAt: new Date().toISOString()
});
context.saveCourseOutlineState_(repeatedFailureRun);
context.handleCourseOutlineRefreshFailure_(
  repeatedFailureRun,
  makeOutlineFailureError('相同事故再次失敗', 4)
);
assert.equal(sentOutlineFailureEmails, 1, '相同課綱事故不得重複寄信');

projectTriggers = projectTriggers.filter(trigger =>
  trigger.getHandlerFunction() !== 'retryCourseOutlineRefresh'
);
const smallFailureRun = Object.assign({}, firstFailureRun, {
  incidentId: 'small-outline-incident',
  runId: 'small-outline-run-1'
});
context.saveCourseOutlineState_(smallFailureRun);
context.handleCourseOutlineRefreshFailure_(
  smallFailureRun,
  makeOutlineFailureError('少量課綱第一次失敗', 3)
);
const smallRetryState = context.loadCourseOutlineState_();
const smallSecondFailureRun = Object.assign({}, smallRetryState, {
  status: 'running',
  attempt: 2,
  runId: 'small-outline-run-2',
  startedAt: new Date().toISOString(),
  retryTriggerId: ''
});
context.saveCourseOutlineState_(smallSecondFailureRun);
context.handleCourseOutlineRefreshFailure_(
  smallSecondFailureRun,
  makeOutlineFailureError('少量課綱第二次失敗', 3)
);
assert.equal(
  sentOutlineFailureEmails,
  1,
  '無法讀取的課程或活動不超過三項時不得寄送課綱錯誤提醒'
);
assert.equal(context.loadCourseOutlineState_().notificationPending, false);

assert.equal(
  sentEmailSubjects.every(subject =>
    String(subject).endsWith('｜T-SCHOOL Schedule Sync')
  ),
  true,
  '所有實際寄出的通知主旨都應使用統一品牌後綴'
);

console.log(JSON.stringify({
  generatedCharacters: generatedCode.length,
  generatedLines: generatedCode.split('\n').length
}, null, 2));
