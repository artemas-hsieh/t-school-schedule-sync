(function () {
  'use strict';

  window.TSCHOOL_SETUP_DIALOG_HTML = String.raw`<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base target="_top">
  <style>
    :root { color-scheme:light; --ink:#14211d; --muted:#4f5d57; --line:#bac6be; --line-dark:#75847c; --paper:#f4f7f2; --paper-bright:#fff; --sync:#00a676; --sync-dark:#007c59; --warning:#f05a47; --warning-surface:#fae3df; --error:#a62d23; --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:20px; --space-6:24px; --radius-control:3px; --body:"Noto Sans TC Variable","Noto Sans TC","Microsoft JhengHei",sans-serif; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--paper); color:var(--ink); font:13px/20px var(--body); text-rendering:optimizeLegibility; }
    main { min-height:100vh; padding:var(--space-6) 32px; }
    h1 { margin:0; font-size:22px; line-height:1.4; font-weight:700; }
textarea { width:100%; min-height:300px; margin-top:var(--space-4); padding:var(--space-3) var(--space-4); resize:none; border:1px solid var(--line-dark); border-radius:var(--radius-control); background:var(--paper-bright); color:var(--ink); font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere; }
    textarea::placeholder { color:#7a8882; }
    textarea:focus { outline:2px solid var(--sync); outline-offset:2px; border-color:var(--sync-dark); }
    .message,.warning { margin-top:var(--space-3); padding:var(--space-3); border:1px solid var(--warning); border-left-width:4px; background:var(--warning-surface); color:var(--error); }
    .actions { display:flex; align-items:center; gap:var(--space-4); margin-top:var(--space-5); }
    .actions p { margin:0; color:var(--muted); }
    .source-wait-note { margin:12px 0 0; color:var(--muted); font-size:12px; line-height:1.6; }
    button { min-height:44px; padding:10px var(--space-4); flex:0 0 auto; border:1px solid var(--sync-dark); border-radius:var(--radius-control); background:var(--sync); color:#fff; font:inherit; font-weight:700; cursor:pointer; transition:box-shadow 150ms ease,transform 150ms ease; }
    button:hover { box-shadow:3px 3px 0 rgba(20,33,29,.22); transform:translate(-1px,-1px); }
    button:active { box-shadow:none; transform:translate(1px,1px); }
    button:focus-visible { outline:2px solid var(--sync); outline-offset:2px; }
    button:disabled { opacity:.55; cursor:wait; }
    [hidden] { display:none !important; }
    @media (max-width:520px) { main{padding:20px 16px}.actions{align-items:stretch;flex-direction:column}.actions button{width:100%}textarea{min-height:240px} }
    @media (prefers-reduced-motion:reduce) { *,*::before,*::after{scroll-behavior:auto!important;transition:none!important} }
  </style>
</head>
<body>
  <main>
    <h1><label for="setup-code">貼上「行程同步設定碼」</label></h1>
    <textarea id="setup-code" maxlength="32768" spellcheck="false" autocomplete="off" placeholder="貼在這邊" autofocus></textarea>
    <div class="warning" id="account-warning" role="alert" tabindex="-1" hidden></div>
    <div class="message" id="paste-error" role="alert" aria-live="assertive" tabindex="-1" hidden></div>
    <div class="actions">
      <button id="open-control-panel" type="button">開啟控制臺</button>
      <p>請隨後在控制臺檢查設定，並完成首次同步</p>
    </div>
    <p class="source-wait-note">有時課表來源載入較慢，請耐心等待 1 分鐘</p>
  </main>
  <script>
    (function () {
      var codeInput = document.getElementById('setup-code');
      var openButton = document.getElementById('open-control-panel');
      var accountWarning = document.getElementById('account-warning');
      var pasteError = document.getElementById('paste-error');
      var unverifiedAccountConfirmed = false;

      function setBusy(busy) {
        openButton.disabled = busy;
        openButton.setAttribute('aria-busy', String(busy));
        openButton.textContent = busy ? '正在匯入設定…' : '開啟控制臺';
      }

      function showError(error) {
        pasteError.textContent = error && error.message ? error.message : String(error || '無法完成');
        pasteError.hidden = false;
        pasteError.focus();
      }

      function showAccountWarning(email) {
        accountWarning.textContent = '用錯 Google 帳號了喔，請改成設定時填寫的 ' + email;
        accountWarning.hidden = false;
        accountWarning.focus();
      }

      function showAccountVerificationUnavailable(email) {
        accountWarning.textContent = '受組織隱私設定限制，無法確認目前 Google 帳號。請自行確認這是設定時使用的 ' + email;
        accountWarning.hidden = false;
        accountWarning.focus();
        openButton.textContent = '我已確認，開啟控制臺';
      }

      function openSidebarAfterImport() {
        // Give Apps Script a short handoff window so the sidebar's first read
        // does not race the lock released by importSetupCodeFromUi().
        setTimeout(function () {
          google.script.run
            .withSuccessHandler(function () { google.script.host.close(); })
            .withFailureHandler(function (error) { setBusy(false); showError(error); })
            .showSettingsSidebar();
        }, 800);
      }

      codeInput.addEventListener('input', function () {
        unverifiedAccountConfirmed = false;
        accountWarning.hidden = true;
        pasteError.hidden = true;
        openButton.textContent = '開啟控制臺';
      });

      openButton.addEventListener('click', function () {
        accountWarning.hidden = true;
        pasteError.hidden = true;
        setBusy(true);
        google.script.run
          .withSuccessHandler(function (result) {
            if (result && result.accountMismatch) {
              setBusy(false);
              showAccountWarning(result.notificationEmail || '');
              return;
            }
            if (result && result.requiresAccountConfirmation) {
              unverifiedAccountConfirmed = true;
              setBusy(false);
              showAccountVerificationUnavailable(result.notificationEmail || '設定 Email');
              return;
            }
            openSidebarAfterImport();
          })
          .withFailureHandler(function (error) { setBusy(false); showError(error); })
          .importSetupCodeFromUi(codeInput.value, unverifiedAccountConfirmed);
      });
    })();
  </script>
</body>
</html>`;
})();
