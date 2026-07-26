(function () {
  window.TSCHOOL_SIDEBAR_HTML = String.raw`<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base target="_top">
  <style>
    :root {
      --sync: #00a676;
      --sync-dark: #007f5b;
      --shift: #f05a47;
      --ink: #14211d;
      --ink-soft: #52625c;
      --paper: #f4f7f2;
      --paper-bright: #ffffff;
      --surface-green: #dff2eb;
      --line: #b8c7c1;
      --line-dark: #71817b;
      --warning: #9a5b00;
      --warning-surface: #fff0d5;
      --error: #a62d23;
      --error-surface: #ffe5e0;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
      --radius-control: 3px;
      --radius-panel: 4px;
      --ease-out: cubic-bezier(.16, 1, .3, 1);
    }

    * { box-sizing: border-box; }
    html { color-scheme: light; }
    body {
      min-width: 280px;
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: "PingFang TC", "Noto Sans TC", system-ui, sans-serif;
      font-size: 13px;
      line-height: 20px;
    }
    button, input, select, textarea { font: inherit; }
    button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
      outline: 2px solid var(--sync);
      outline-offset: 2px;
    }
    [hidden] { display: none !important; }

    .app { min-height: 100vh; padding-bottom: 88px; }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      padding: var(--space-4);
      border-bottom: 1px solid var(--ink);
      background: rgba(244, 247, 242, .96);
      backdrop-filter: blur(12px);
    }
    .eyebrow {
      margin: 0 0 var(--space-1);
      color: var(--sync-dark);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      font-weight: 850;
      line-height: 16px;
    }
    h1 { margin: 0; font-size: 21px; font-weight: 850; line-height: 28px; }
    .top-status {
      margin: var(--space-2) 0 0;
      padding-top: var(--space-2);
      border-top: 1px solid var(--line);
      color: var(--ink-soft);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      line-height: 16px;
    }
    .top-status[data-state="warning"] { color: var(--warning); font-weight: 850; }

    .term-transition {
      display: grid;
      grid-template-columns: var(--space-1) minmax(0, 1fr);
      gap: var(--space-3);
      padding: var(--space-4);
      border-bottom: 1px solid var(--warning);
      background: var(--warning-surface);
    }
    .term-transition::before { content: ""; background: var(--warning); }
    .term-transition:focus-visible { outline: 2px solid var(--warning); outline-offset: -4px; }
    .term-transition-kicker {
      margin: 0;
      color: var(--warning);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      font-weight: 850;
      line-height: 16px;
    }
    .term-transition h2 { margin: var(--space-1) 0 0; font-size: 16px; line-height: 22px; }
    .term-transition p { margin: var(--space-2) 0 0; color: var(--ink-soft); font-size: 11px; line-height: 17px; }
    .term-transition button {
      min-height: 40px;
      margin-top: var(--space-3);
      padding: 0 var(--space-3);
      border: 1px solid var(--ink);
      border-radius: var(--radius-control);
      background: var(--ink);
      color: var(--paper-bright);
      cursor: pointer;
      font-size: 11px;
      font-weight: 850;
    }

    .content { display: grid; padding: 0 var(--space-3) var(--space-6); }
    .section {
      padding: var(--space-5) var(--space-1);
      border-bottom: 1px solid var(--line);
      background: transparent;
    }
    .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-4); }
    .section-head h2 { margin: 0; font-size: 15px; font-weight: 850; line-height: 20px; }
    .section-head span { color: var(--ink-soft); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; line-height: 16px; text-align: right; }

    .source-health {
      display: grid;
      grid-template-columns: var(--space-1) 1fr;
      gap: var(--space-3);
      padding: var(--space-3);
      border: 1px solid var(--line);
      border-radius: var(--radius-panel);
      background: var(--paper-bright);
    }
    .source-health::before { content: ""; background: var(--sync); }
    .source-health[data-state="warning"]::before { background: var(--warning); }
    .source-health[data-state="error"]::before { background: var(--error); }
    .source-health strong, .source-health span { display: block; }
    .source-health strong { font-size: 13px; }
    .source-health span { margin-top: var(--space-1); color: var(--ink-soft); font-size: 11px; line-height: 16px; }

    .segmented { display: grid; grid-template-columns: repeat(3, 1fr); }
    .segmented label { position: relative; }
    .segmented input, .choice input, .hour input, .switch input { position: absolute; opacity: 0; pointer-events: none; }
    .segmented span {
      display: grid;
      min-height: 44px;
      place-items: center;
      border: 1px solid var(--line-dark);
      border-left: 0;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      transition: background 150ms var(--ease-out), color 150ms var(--ease-out);
    }
    .segmented label:first-child span { border-left: 1px solid var(--line-dark); border-radius: var(--radius-control) 0 0 var(--radius-control); }
    .segmented label:last-child span { border-radius: 0 var(--radius-control) var(--radius-control) 0; }
    .segmented input:checked + span { background: var(--ink); color: var(--paper-bright); }

    .field { display: grid; gap: var(--space-2); margin-top: var(--space-3); }
    .field > span { color: var(--ink-soft); font-size: 11px; font-weight: 800; line-height: 16px; }
    input[type="text"], input[type="email"], input[type="search"], select, textarea {
      width: 100%;
      min-height: 44px;
      padding: 10px var(--space-3);
      border: 1px solid var(--line-dark);
      border-radius: var(--radius-control);
      background: var(--paper-bright);
      color: var(--ink);
    }
    textarea { min-height: 112px; resize: vertical; }
    input:focus, select:focus, textarea:focus { border-color: var(--sync); box-shadow: inset 3px 0 0 var(--sync); outline: 0; }
    .hint { margin: 0; color: var(--ink-soft); font-size: 10px; line-height: 16px; }
    .format-preview { display: block; min-height: 56px; padding: var(--space-3); border-left: 3px solid var(--sync); background: var(--surface-green); color: var(--ink-soft); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; line-height: 16px; white-space: pre-line; }

    .switch { position: relative; display: grid; grid-template-columns: 44px 1fr; gap: var(--space-3); align-items: center; margin-top: var(--space-4); cursor: pointer; }
    .switch-track { position: relative; width: 44px; height: 24px; border: 1px solid var(--line-dark); border-radius: 99px; background: var(--paper-bright); }
    .switch-track::after { content: ""; position: absolute; top: 4px; left: 4px; width: 14px; height: 14px; border-radius: 50%; background: var(--line-dark); transition: transform 180ms var(--ease-out), background 180ms var(--ease-out); }
    .switch input:checked + .switch-track { border-color: var(--sync-dark); background: var(--sync); }
    .switch input:checked + .switch-track::after { background: var(--paper-bright); transform: translateX(20px); }
    .switch-copy strong, .switch-copy span { display: block; }
    .switch-copy strong { font-size: 12px; }
    .switch-copy span { color: var(--ink-soft); font-size: 10px; line-height: 16px; }

    .course-toolbar { display: grid; grid-template-columns: 1fr auto; gap: var(--space-2); }
    .small-button, .icon-button {
      min-height: 44px;
      border: 1px solid var(--ink);
      border-radius: var(--radius-control);
      background: var(--paper-bright);
      color: var(--ink);
      cursor: pointer;
      font-size: 11px;
      font-weight: 800;
      transition: background 150ms var(--ease-out), color 150ms var(--ease-out), transform 150ms var(--ease-out);
    }
    .small-button:hover, .icon-button:hover {
      border-color: var(--sync-dark);
      background: var(--surface-green);
      box-shadow: 3px 3px 0 rgba(0, 127, 91, .28);
      transform: translate(-1px, -1px);
    }
    .small-button:active, .icon-button:active {
      box-shadow: none;
      transform: translate(1px, 1px);
    }
    .small-button { padding: 0 var(--space-3); }
    .icon-button { width: 44px; padding: 0; font-size: 18px; }
    .course-list { display: grid; gap: var(--space-2); max-height: 320px; margin-top: var(--space-3); padding-right: var(--space-1); overflow-y: auto; overscroll-behavior: contain; }
    .choice { position: relative; display: block; }
    .choice > span {
      display: flex;
      min-height: 48px;
      padding: var(--space-2) 36px var(--space-2) var(--space-3);
      align-items: center;
      border: 1px solid var(--line);
      border-radius: var(--radius-control);
      background: var(--paper-bright);
      cursor: pointer;
      transition: border-color 150ms var(--ease-out), background 150ms var(--ease-out), box-shadow 150ms var(--ease-out), transform 150ms var(--ease-out);
    }
    .choice > span:hover { border-color: var(--ink); transform: translateY(-1px); }
    .choice input:checked + span { border-color: var(--ink); background: var(--surface-green); box-shadow: 3px 3px 0 var(--ink); transform: translate(-1px, -1px); }
    .choice input:checked + span::after { content: "✓"; position: absolute; top: 50%; right: var(--space-3); color: var(--sync-dark); font-size: 13px; font-weight: 900; transform: translateY(-50%); }
    .choice-copy { display: grid; gap: 2px; }
    .choice-copy small { color: var(--sync-dark); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; font-weight: 850; line-height: 12px; }
    .choice-copy strong { font-size: 12px; line-height: 16px; }
    .choice input:disabled + span { opacity: .45; cursor: not-allowed; transform: none; box-shadow: none; }
    .empty { margin: var(--space-3) 0 0; padding: var(--space-4); border: 1px dashed var(--line-dark); border-radius: var(--radius-control); color: var(--ink-soft); font-size: 11px; text-align: center; }

    .pending { display: grid; gap: var(--space-2); }
    .pending-item { padding: var(--space-3); border: 1px solid var(--shift); border-left-width: 4px; border-radius: var(--radius-panel); background: #fff4f1; }
    .pending-item strong { display: block; font-size: 12px; }
    .pending-actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-top: var(--space-3); }
    .pending-actions button { min-height: 36px; padding: 0 var(--space-2); border: 1px solid var(--ink); border-radius: var(--radius-control); cursor: pointer; font-size: 10px; font-weight: 800; }
    .pending-actions .keep { background: var(--ink); color: var(--paper-bright); }
    .pending-actions .remove { border-color: var(--shift); background: var(--paper-bright); color: var(--error); }

    .calendar-picker { display: grid; gap: var(--space-3); }
    .calendar-create {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-2);
      align-items: end;
      padding: var(--space-3);
      border: 1px solid var(--line);
      border-left: 3px solid var(--sync);
      border-radius: var(--radius-panel);
      background: var(--surface-green);
    }
    .calendar-create .field { margin-top: 0; }
    .calendar-create .small-button { min-width: 76px; padding-inline: var(--space-3); }

    .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
    .metric { padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--paper-bright); }
    .metric span, .metric strong { display: block; }
    .metric span { color: var(--ink-soft); font-size: 10px; line-height: 16px; }
    .metric strong { margin-top: var(--space-1); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 16px; overflow-wrap: anywhere; }
    .message { margin: var(--space-3) 0 0; padding: var(--space-3); border-left: 3px solid var(--sync); background: var(--surface-green); color: var(--ink-soft); font-size: 11px; line-height: 16px; }
    .message.error { border-color: var(--error); background: var(--error-surface); color: var(--error); }

    .secondary-actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-top: var(--space-3); }
    .secondary-actions button { min-height: 40px; padding: 0 var(--space-2); border: 1px solid var(--ink); border-radius: var(--radius-control); background: var(--paper-bright); color: var(--ink); cursor: pointer; font-size: 11px; font-weight: 800; }
    .secondary-actions button {
      transition: background 150ms var(--ease-out), box-shadow 150ms var(--ease-out), transform 150ms var(--ease-out);
    }
    .secondary-actions button:hover {
      border-color: var(--sync-dark);
      background: var(--surface-green);
      box-shadow: 3px 3px 0 rgba(0, 127, 91, .28);
      transform: translate(-1px, -1px);
    }
    .secondary-actions button:active {
      box-shadow: none;
      transform: translate(1px, 1px);
    }
    .sync-estimate {
      margin: var(--space-3) 0 0;
      color: var(--ink-soft);
      font-size: 10px;
      line-height: 16px;
    }

    .footer {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 12;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-2);
      padding: var(--space-3);
      border-top: 1px solid var(--ink);
      background: rgba(244, 247, 242, .97);
      backdrop-filter: blur(12px);
    }
    .footer button { min-height: 48px; border: 1px solid var(--ink); border-radius: var(--radius-control); cursor: pointer; font-size: 12px; font-weight: 850; transition: transform 150ms var(--ease-out), box-shadow 150ms var(--ease-out); }
    .footer button:hover { box-shadow: 3px 3px 0 rgba(20, 33, 29, .22); transform: translate(-1px, -1px); }
    .footer button:active { box-shadow: none; transform: translate(1px, 1px); }
    .save { padding: 0 var(--space-4); background: var(--paper-bright); color: var(--ink); }
    .sync { padding: 0 var(--space-4); background: var(--sync); color: var(--paper-bright); }
    button:disabled { opacity: .48; cursor: wait; }
    button[data-validation-disabled="true"]:disabled { cursor: not-allowed; }

    .loading { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(244, 247, 242, .96); }
    .loader { display: grid; width: min(224px, calc(100vw - 48px)); gap: var(--space-3); justify-items: center; color: var(--ink-soft); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; text-align: center; }
    .loader-track { position: relative; width: 152px; height: var(--space-1); overflow: hidden; background: var(--line); }
    .loader-track::after { content: ""; position: absolute; inset: 0; width: 44%; background: var(--sync); animation: scan 1s var(--ease-out) infinite; }
    .sync-progress { display: grid; width: 100%; gap: var(--space-2); }
    .sync-progress-head { display: flex; justify-content: space-between; gap: var(--space-3); color: var(--ink); font-family: "PingFang TC", "Noto Sans TC", system-ui, sans-serif; font-size: 11px; font-weight: 800; text-align: left; }
    .sync-progress-track { height: var(--space-2); overflow: hidden; border: 1px solid var(--line-dark); background: var(--paper-bright); }
    .sync-progress-track span { display: block; width: 0; height: 100%; background: var(--sync); transition: width 280ms var(--ease-out); }
    .sync-progress-detail { color: var(--ink-soft); font-family: "PingFang TC", "Noto Sans TC", system-ui, sans-serif; font-size: 10px; line-height: 16px; text-align: left; }
    .toast { position: fixed; right: var(--space-3); bottom: 76px; left: var(--space-3); z-index: 60; padding: var(--space-3); border: 1px solid var(--paper-bright); border-radius: var(--radius-control); background: var(--ink); color: var(--paper-bright); font-size: 11px; line-height: 16px; opacity: 0; pointer-events: none; transform: translateY(var(--space-2)); transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out); }
    .toast.show { opacity: 1; transform: translateY(0); }
    .app.is-ready .section { animation: section-in 360ms var(--ease-out) both; }
    .app.is-ready .section:nth-child(2) { animation-delay: 35ms; }
    .app.is-ready .section:nth-child(3) { animation-delay: 70ms; }
    .app.is-ready .section:nth-child(4) { animation-delay: 105ms; }
    .app.is-ready .section:nth-child(5) { animation-delay: 140ms; }
    .app.is-ready .section:nth-child(6) { animation-delay: 175ms; }
    .app.is-ready .section:nth-child(7) { animation-delay: 210ms; }
    @keyframes scan { from { transform: translateX(-105%); } to { transform: translateX(230%); } }
    @keyframes section-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    @media (max-width: 340px) {
      .topbar { padding: var(--space-3); }
      .content { padding-inline: var(--space-2); }
      .section { padding-block: var(--space-4); }
      .course-toolbar, .calendar-create, .status-grid, .secondary-actions { grid-template-columns: 1fr; }
      .icon-button { width: 100%; }
      .pending-actions { grid-template-columns: 1fr; }
      .footer { grid-template-columns: 1fr 1.35fr; padding: var(--space-2); }
      .footer button { padding-inline: var(--space-2); }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <div class="loading" id="loading">
    <div class="loader">
      <span class="loader-track" id="loader-track"></span>
      <span id="loading-label">正在讀取控制臺…</span>
      <div class="sync-progress" id="sync-progress" role="progressbar" aria-label="同步進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden>
        <div class="sync-progress-head"><span>同步進度</span><strong id="sync-progress-value">0%</strong></div>
        <div class="sync-progress-track" aria-hidden="true"><span id="sync-progress-bar"></span></div>
        <span class="sync-progress-detail" id="sync-progress-detail">正在準備同步…</span>
      </div>
    </div>
  </div>
  <div class="app" id="app" hidden>
    <header class="topbar">
      <p class="eyebrow">T-SCHOOL 行程同步</p>
      <h1>行程同步控制臺</h1>
      <p class="top-status" id="top-status">尚未完成設定</p>
    </header>

    <section class="term-transition" id="term-transition" role="alert" aria-live="assertive" tabindex="-1" hidden>
      <div>
        <p class="term-transition-kicker">NEW TERM / 重新確認</p>
        <h2>新學期需要重新選課</h2>
        <p id="term-transition-message">舊學期行程已保留。請重新選擇本學期課程，儲存後才會恢復同步。</p>
        <p id="term-transition-outline-message" hidden></p>
        <button type="button" id="term-transition-action">前往重新選課</button>
      </div>
    </section>

    <main class="content">
      <section class="section">
        <div class="section-head"><h2>來源與年級</h2><span id="source-updated"></span></div>
        <div class="source-health" id="source-health"><div><strong id="source-title">讀取中</strong><span id="source-detail"></span></div></div>
        <div class="field">
          <span>年級</span>
          <div class="segmented" role="radiogroup" aria-label="年級">
            <label><input type="radio" name="grade" value="高一"><span>高一</span></label>
            <label><input type="radio" name="grade" value="高二"><span>高二</span></label>
            <label><input type="radio" name="grade" value="高三"><span>高三</span></label>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>同步狀態</h2><span id="app-version"></span></div>
        <div class="status-grid"><div class="metric"><span>上次同步</span><strong id="last-sync">尚未同步</strong></div><div class="metric"><span>受管理事件</span><strong id="event-count">0</strong></div></div>
        <p class="message" id="status-message">完成設定後即可開始同步</p>
        <div class="secondary-actions">
          <button type="button" id="run-sync">立即同步</button>
          <button type="button" id="repair-sync">強制修復</button>
        </div>
        <p class="sync-estimate">第一次同步會分批在背景完成；行程很多時可能需 10–20 分鐘，可安全關閉側欄。後續只處理異動，通常較快。</p>
      </section>

      <section class="section" id="pending-section" hidden>
        <div class="section-head"><h2>待確認項目</h2><span>已先加入日曆</span></div>
        <div class="pending" id="pending-list"></div>
      </section>

      <section class="section" id="course-section">
        <div class="section-head"><h2>課程與活動</h2><span id="course-count">0 門課 · 0 項活動</span></div>
        <div class="course-toolbar">
          <input type="search" id="course-search" placeholder="搜尋課程或活動" aria-label="搜尋課程或活動">
          <button type="button" class="small-button" id="clear-courses">清除課程</button>
        </div>
        <div class="course-list" id="course-list"></div>
        <label class="switch">
          <input type="checkbox" id="include-activities">
          <span class="switch-track" aria-hidden="true"></span>
          <span class="switch-copy"><strong>同步全年級／全校活動</strong><span>只包含系統明確辨識的活動</span></span>
        </label>
      </section>

      <section class="section">
        <div class="section-head"><h2>專用日曆</h2><span>不允許主要日曆</span></div>
        <div class="calendar-picker">
          <label class="field"><span>同步目標</span><select id="calendar"></select></label>
          <div class="calendar-create" id="calendar-create">
            <label class="field"><span>新日曆名稱</span><input type="text" id="calendar-name" maxlength="100" autocomplete="off"></label>
            <button type="button" class="small-button" id="create-calendar">建立日曆</button>
          </div>
        </div>
        <p class="hint">若不先建立，首次同步會使用上方名稱自動建立專用日曆。</p>
      </section>

      <section class="section">
        <div class="section-head"><h2>同步與通知</h2><span>時間可能前後約 15 分鐘</span></div>
        <label class="field"><span>通知 Email</span><input type="email" id="email" autocomplete="email"></label>
        <label class="field"><span>每日成功摘要</span><select id="notify-hour"></select></label>
        <label class="switch">
          <input type="checkbox" id="auto-sync">
          <span class="switch-track" aria-hidden="true"></span>
          <span class="switch-copy"><strong>啟用自動同步</strong><span>關閉後仍可手動立即同步</span></span>
        </label>
      </section>

      <section class="section">
        <div class="section-head"><h2>事件呈現</h2><span>可隨時調整</span></div>
        <label class="field"><span>說明格式</span><select id="description-preset"><option value="standard">標準</option><option value="custom">進階自訂</option></select></label>
        <span class="format-preview" id="description-preview" aria-live="polite"></span>
        <label class="field" id="custom-wrap" hidden><span>自訂模板</span><textarea id="custom-description"></textarea><p class="hint">以標準格式為基礎；可使用 **粗體** 與 {course}、{date}、{weekday}、{week}、{period}、{startTime}、{endTime}、{location}、{classroom}、{displayLocation}、{topic}、{content}、{sourceUpdatedAt}</p></label>
        <label class="field"><span>活動提醒</span><select id="reminder-mode"><option value="none">不提醒</option><option value="popup">日曆彈出通知</option><option value="email">Email 提醒</option></select></label>
        <label class="field" id="reminder-wrap" hidden><span>提前時間</span><select id="reminder-minutes"><option value="10">10 分鐘</option><option value="30">30 分鐘</option><option value="60">1 小時</option><option value="1440">1 天</option></select></label>
      </section>

    </main>

    <footer class="footer"><button type="button" class="save" id="save">儲存</button><button type="button" class="sync" id="save-sync">儲存並首次同步</button></footer>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <script>
    (function () {
      var model = null;
      var selectedCourses = new Set();
      var excludedActivities = new Set();
      var busy = false;
      var syncProgressTimer = null;
      var activeSyncJobId = '';
      var termTransitionAnnounced = false;
      var standardDescriptionTemplate = [
        '第 {week} 週 / 週{weekday} / 第 {period} 節',
        '',
        '**# 單元主題**',
        '{topic}',
        '',
        '**# 課程內容**',
        '{content}'
      ].join('\n');

      function byId(id) { return document.getElementById(id); }
      function escapeHtml(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
      function normalize(value) { return String(value || '').replace(/\s+/g, '').toLowerCase(); }
      function defaultCalendarName(gradeName) { return (gradeName || '高一') + '行程｜T-SCHOOL Schedule Sync'; }
      function setBusy(value, label, showProgress) {
        busy = value;
        byId('loading').hidden = !value;
        byId('loading-label').textContent = label || '處理中…';
        byId('loader-track').hidden = Boolean(showProgress);
        byId('sync-progress').hidden = !showProgress;
        Array.prototype.forEach.call(document.querySelectorAll('button'), function (button) { button.disabled = value; });
        if (!value) updateActionAvailability();
      }
      function showToast(message) { var toast = byId('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(function () { toast.classList.remove('show'); }, 2600); }
      function server(method, value) { return new Promise(function (resolve, reject) { var runner = google.script.run.withSuccessHandler(resolve).withFailureHandler(function (error) { reject(new Error(error && error.message ? error.message : String(error))); }); runner[method](value); }); }
      function getCheckedGrade() { var input = document.querySelector('input[name="grade"]:checked'); return input ? input.value : '高一'; }
      function renderSyncProgress(progress) {
        var value = Math.max(0, Math.min(100, Number(progress && progress.percent) || 0));
        byId('sync-progress').setAttribute('aria-valuenow', String(value));
        byId('sync-progress-value').textContent = value + '%';
        byId('sync-progress-bar').style.width = value + '%';
        byId('sync-progress-detail').textContent = progress && progress.message ? progress.message : '正在同步…';
      }
      function stopSyncProgressPolling() {
        if (syncProgressTimer) clearTimeout(syncProgressTimer);
        syncProgressTimer = null;
      }
      function pollSyncProgress() {
        stopSyncProgressPolling();
        server('getSyncProgressForUi', activeSyncJobId || null).then(function (progress) {
          renderSyncProgress(progress);
          if (!busy || !progress) return;
          var terminal = progress.state === 'complete' || progress.state === 'error';
          if (progress.jobId && !terminal) activeSyncJobId = progress.jobId;
          if (terminal && (!activeSyncJobId || progress.jobId !== activeSyncJobId)) {
            syncProgressTimer = setTimeout(pollSyncProgress, 2500);
            return;
          }
          if (terminal) {
            activeSyncJobId = '';
            server('getSettingsUiData', null).then(render).catch(function () {});
            showToast(progress.state === 'complete' ? '同步完成' : progress.message);
            setBusy(false);
            return;
          }
          var waiting = progress.state === 'queued' || progress.state === 'retry_pending';
          syncProgressTimer = setTimeout(pollSyncProgress, waiting ? 8000 : 2500);
        }).catch(function () {
          if (busy) syncProgressTimer = setTimeout(pollSyncProgress, 8000);
        });
      }
      function startSyncProgress(label) {
        activeSyncJobId = '';
        renderSyncProgress({ percent: 1, message: label || '正在準備同步…' });
        setBusy(true, '正在同步行程；第一批保存後即可關閉側欄', true);
        stopSyncProgressPolling();
        syncProgressTimer = setTimeout(pollSyncProgress, 1000);
      }

      function updateFormatPreviews() {
        var descriptionExamples = {
          standard: '第 23 週 / 週五 / 第 1 節\n\n# 單元主題\n第一冊\n\n# 課程內容\n【核心選文講解】：桃花源記、項脊軒志\n\n\n[T-SCHOOL Schedule Sync]\n＊部分資訊來自課綱，請以教師最新說明為主'
        };
        var descriptionPreset = byId('description-preset').value;
        byId('description-preview').textContent = descriptionPreset === 'custom'
          ? (byId('custom-description').value.trim() || standardDescriptionTemplate)
          : descriptionExamples[descriptionPreset];
      }

      function render(data) {
        model = data;
        var settings = data.settings;
        selectedCourses = new Set(settings.selectedCourses || []);
        excludedActivities = new Set(settings.excludedActivities || []);
        document.querySelector('input[name="grade"][value="' + settings.gradeName + '"]').checked = true;
        byId('include-activities').checked = settings.includeActivities;
        byId('email').value = settings.notificationEmail || '';
        byId('auto-sync').checked = data.termTransition && data.termTransition.required
          ? data.termTransition.resumeAutoSync
          : settings.autoSyncEnabled;
        var customDescriptionSelected = settings.descriptionPreset === 'custom';
        byId('description-preset').value = customDescriptionSelected ? 'custom' : 'standard';
        byId('custom-description').value = customDescriptionSelected
          ? (settings.customDescription || standardDescriptionTemplate)
          : standardDescriptionTemplate;
        byId('reminder-mode').value = settings.reminderMode;
        byId('reminder-minutes').value = String(settings.reminderMinutes || 10);
        renderNotifyHour(settings.notifySyncHour);
        renderCalendars(data.calendars, settings.calendarId, settings.calendarName);
        renderSource(data.source);
        renderCourses();
        renderPending(settings.pendingTitles || []);
        renderStatus(data.status);
        renderTermTransition(data.termTransition, data.courseOutlineStatus, data.source);
        updateConditionalFields();
        byId('app-version').textContent = data.appVersion;
        var needsTermSelection = Boolean(data.termTransition && data.termTransition.required);
        byId('top-status').dataset.state = needsTermSelection ? 'warning' : '';
        byId('top-status').textContent = needsTermSelection
          ? '新學期需要重新選課'
          : (data.status && data.status.ok
            ? '同步功能正常'
            : (settings.setupComplete ? '需要檢查同步狀態' : '尚未完成第一次同步'));
        byId('save').textContent = needsTermSelection ? '儲存新學期設定' : '儲存';
        byId('save-sync').textContent = needsTermSelection
          ? '完成選課並同步'
          : (settings.setupComplete ? '儲存並同步' : '儲存並首次同步');
        updateActionAvailability();
      }

      function renderTermTransition(transition, outlineStatus, source) {
        var panel = byId('term-transition');
        var required = Boolean(transition && transition.required);
        panel.hidden = !required;
        if (!required) {
          termTransitionAnnounced = false;
          return;
        }
        var dateRange = transition.firstDate
          ? transition.firstDate + (transition.lastDate ? '–' + transition.lastDate : '')
          : (source && source.firstDate ? source.firstDate : '新學期');
        byId('term-transition-message').textContent =
          '已偵測到 ' + dateRange + ' 的新學期行程。舊學期行程會保留；請重新選擇至少一門課程，儲存後才恢復同步。';
        var outlineMessage = byId('term-transition-outline-message');
        var indexWarning = outlineStatus && outlineStatus.indexWarning || '';
        var missingCurrentOutline = outlineStatus && !outlineStatus.enabled;
        outlineMessage.hidden = !indexWarning && !missingCurrentOutline && !transition.noticeFailed;
        outlineMessage.textContent = transition.noticeFailed
          ? '提醒信暫時無法寄出，但這裡會持續保留重新選課提示。'
          : (indexWarning
            ? indexWarning
            : (missingCurrentOutline
              ? '這學期的課綱尚未加入中央索引；可先同步基本行程，課綱上架後會再補入。'
              : ''));
      }

      function updateActionAvailability() {
        if (!model || busy) return;
        var requiresSelection = Boolean(model.termTransition && model.termTransition.required);
        var missingSelection = requiresSelection && selectedCourses.size === 0;
        ['save', 'save-sync'].forEach(function (id) {
          var button = byId(id);
          button.disabled = missingSelection;
          button.dataset.validationDisabled = String(missingSelection);
        });
        ['run-sync', 'repair-sync'].forEach(function (id) {
          var button = byId(id);
          button.disabled = requiresSelection;
          button.dataset.validationDisabled = String(requiresSelection);
        });
      }

      function renderSource(source) {
        var health = byId('source-health');
        health.dataset.state = source.warning ? 'warning' : 'success';
        byId('source-title').textContent = source.gradeName + '課表可用';
        byId('source-detail').textContent = source.firstDate + '–' + source.lastDate + ' · ' + source.courseCount + ' 門課 · ' + source.activityCount + ' 項活動';
        byId('source-updated').textContent = source.updateLabel || '';
      }

      function renderNotifyHour(notifyHour) {
        byId('notify-hour').innerHTML = Array.from({ length: 24 }, function (_, hour) { return '<option value="' + hour + '" ' + (hour === notifyHour ? 'selected' : '') + '>' + String(hour).padStart(2, '0') + ':00</option>'; }).join('');
      }

      function renderCalendars(calendars, selectedId, calendarName) {
        var items = [{ id: '', name: '建立新的專用日曆' }].concat(calendars || []);
        byId('calendar').innerHTML = items.map(function (item) { return '<option value="' + escapeHtml(item.id) + '" ' + (item.id === selectedId ? 'selected' : '') + '>' + escapeHtml(item.name) + '</option>'; }).join('');
        var nextName = calendarName || defaultCalendarName(getCheckedGrade());
        byId('calendar-name').value = nextName;
        byId('calendar-name').dataset.autoName = String(/^高[一二三]行程｜T-SCHOOL Schedule Sync$/.test(nextName));
        updateCalendarFields();
      }

      function updateCalendarFields() {
        var creating = !byId('calendar').value;
        byId('calendar-create').hidden = !creating;
        byId('calendar-name').disabled = !creating;
      }

      function renderCourses() {
        if (!model) return;
        var query = normalize(byId('course-search').value);
        var courses = (model.source.catalog.courses || []).filter(function (item) { return normalize(item.title).indexOf(query) !== -1; });
        var activities = (model.source.catalog.activities || []).filter(function (item) { return normalize(item.title).indexOf(query) !== -1; });
        var includeActivities = byId('include-activities').checked;
        var courseHtml = courses.map(function (item) { return '<label class="choice"><input type="checkbox" data-kind="course" value="' + escapeHtml(item.title) + '" ' + (selectedCourses.has(item.title) ? 'checked' : '') + '><span><span class="choice-copy"><small>課程</small><strong>' + escapeHtml(item.title) + '</strong></span></span></label>'; }).join('');
        var activityHtml = activities.map(function (item) { var checked = includeActivities && !excludedActivities.has(item.title); return '<label class="choice"><input type="checkbox" data-kind="activity" value="' + escapeHtml(item.title) + '" ' + (checked ? 'checked' : '') + ' ' + (includeActivities ? '' : 'disabled') + '><span><span class="choice-copy"><small>活動</small><strong>' + escapeHtml(item.title) + '</strong></span></span></label>'; }).join('');
        byId('course-list').innerHTML = courseHtml + activityHtml || '<p class="empty">找不到符合的課程或活動</p>';
        var selectedActivityCount = (model.source.catalog.activities || []).filter(function (item) { return includeActivities && !excludedActivities.has(item.title); }).length;
        byId('course-count').textContent = selectedCourses.size + ' 門課 · ' + selectedActivityCount + ' 項活動';
        updateActionAvailability();
      }

      function renderPending(items) {
        byId('pending-section').hidden = !items.length;
        byId('pending-list').innerHTML = items.map(function (title) { return '<div class="pending-item"><strong>' + escapeHtml(title) + '</strong><div class="pending-actions"><button type="button" class="keep" data-keep="' + escapeHtml(title) + '">屬於我，保留</button><button type="button" class="remove" data-remove="' + escapeHtml(title) + '">不屬於我，下次移除</button></div></div>'; }).join('');
      }

      function renderStatus(status) {
        byId('last-sync').textContent = status && status.lastSyncLabel ? status.lastSyncLabel : '尚未同步';
        byId('event-count').textContent = status && status.eventCount != null ? String(status.eventCount) : '0';
        var message = byId('status-message');
        message.textContent = status && status.message ? status.message : '完成設定後即可開始同步';
        message.classList.toggle('error', Boolean(status && status.ok === false));
      }

      function updateConditionalFields() {
        byId('custom-wrap').hidden = byId('description-preset').value !== 'custom';
        byId('reminder-wrap').hidden = byId('reminder-mode').value === 'none';
        updateFormatPreviews();
      }

      function collectSettings() {
        return {
          gradeName: getCheckedGrade(),
          selectedCourses: Array.from(selectedCourses),
          includeActivities: byId('include-activities').checked,
          excludedActivities: Array.from(excludedActivities),
          calendarId: byId('calendar').value,
          calendarName: byId('calendar-name').value.trim() || defaultCalendarName(getCheckedGrade()),
          notificationEmail: byId('email').value.trim(),
          autoSyncEnabled: byId('auto-sync').checked,
          autoSyncHours: model && model.settings && model.settings.autoSyncHours
            ? model.settings.autoSyncHours.slice()
            : [Number(byId('notify-hour').value)],
          notifySyncHour: Number(byId('notify-hour').value),
          descriptionPreset: byId('description-preset').value,
          customDescription: byId('custom-description').value,
          reminderMode: byId('reminder-mode').value,
          reminderMinutes: Number(byId('reminder-minutes').value)
        };
      }

      async function save(runSync) {
        if (busy) return;
        var keepPolling = false;
        var settings = collectSettings();
        var oldCalendarId = model && model.settings ? model.settings.calendarId : '';
        if (oldCalendarId && oldCalendarId !== settings.calendarId && !window.confirm('更換專用日曆後，系統會先在新日曆完成重建，再移除舊日曆中的受管理未來事件。過去事件與私人事件不會受影響。是否繼續？')) return;
        setBusy(true, runSync ? '正在計算變更…' : '正在儲存設定…');
        try {
          if (runSync) {
            var preview = await server('previewSettingsImpactFromUi', settings);
            var previewMessage = (preview.calendarChanged ? '將搬移至新的專用日曆。\n\n' : '') + '預計新增 ' + preview.created + '、更新 ' + preview.updated + '、移除 ' + preview.deleted + '、不變 ' + preview.unchanged + ' 筆受管理事件。\n私人事件不會受影響';
            if ((preview.created || preview.updated || preview.deleted || preview.calendarChanged) && !window.confirm(previewMessage + '\n\n是否套用？')) return;
            settings.syncApprovalToken = preview.approvalToken || '';
            startSyncProgress('正在儲存設定並準備同步…');
          }
          var result = await server(runSync ? 'saveSettingsAndSyncFromUi' : 'saveSettingsFromUi', settings);
          render(result.uiData);
          showToast(result.message);
          if (result.pending) {
            keepPolling = true;
            activeSyncJobId = result.jobId || '';
            byId('loading-label').textContent = '同步已在背景分批執行；現在可以關閉側欄';
            pollSyncProgress();
          }
        } catch (error) {
          showToast(error.message);
        } finally {
          if (!keepPolling) {
            stopSyncProgressPolling();
            setBusy(false);
          }
        }
      }

      async function runAction(method, label, trackProgress) {
        if (busy) return;
        var keepPolling = false;
        if (trackProgress) startSyncProgress(label);
        else setBusy(true, label);
        try {
          var result = await server(method, null);
          render(result.uiData);
          showToast(result.message);
          if (result.pending) {
            keepPolling = true;
            activeSyncJobId = result.jobId || '';
            byId('loading-label').textContent = '同步已在背景分批執行；現在可以關閉側欄';
            pollSyncProgress();
          }
        } catch (error) {
          showToast(error.message);
        } finally {
          if (!keepPolling) {
            stopSyncProgressPolling();
            setBusy(false);
          }
        }
      }

      document.addEventListener('change', function (event) {
        if (event.target.matches('#course-list input[data-kind="course"]')) { event.target.checked ? selectedCourses.add(event.target.value) : selectedCourses.delete(event.target.value); renderCourses(); }
        if (event.target.matches('#course-list input[data-kind="activity"]')) {
          event.target.checked ? excludedActivities.delete(event.target.value) : excludedActivities.add(event.target.value);
          var activities = model && model.source && model.source.catalog ? model.source.catalog.activities || [] : [];
          if (activities.length && activities.every(function (item) { return excludedActivities.has(item.title); })) byId('include-activities').checked = false;
          renderCourses();
        }
        if (event.target.id === 'include-activities') renderCourses();
        if (event.target.id === 'calendar') updateCalendarFields();
        if (event.target.name === 'grade') {
          if (byId('calendar-name').dataset.autoName === 'true') byId('calendar-name').value = defaultCalendarName(event.target.value);
          setBusy(true, '正在讀取年級課表…');
          server('getSourceCatalogForUi', event.target.value).then(function (data) {
            model.source = data;
            selectedCourses = new Set();
            excludedActivities = new Set();
            renderSource(data);
            renderTermTransition(model.termTransition, model.courseOutlineStatus, data);
            renderCourses();
          }).catch(function (error) {
            showToast(error.message);
          }).finally(function () {
            setBusy(false);
          });
        }
        if (event.target.id === 'description-preset' || event.target.id === 'reminder-mode') updateConditionalFields();
      });
      byId('course-search').addEventListener('input', renderCourses);
      byId('custom-description').addEventListener('input', updateFormatPreviews);
      byId('calendar-name').addEventListener('input', function () { byId('calendar-name').dataset.autoName = 'false'; });
      byId('clear-courses').addEventListener('click', function () { selectedCourses.clear(); renderCourses(); });
      byId('term-transition-action').addEventListener('click', function () {
        byId('course-search').focus();
      });
      byId('save').addEventListener('click', function () { save(false); });
      byId('save-sync').addEventListener('click', function () { save(true); });
      byId('run-sync').addEventListener('click', function () { runAction('runSyncFromUi', '正在同步行程…', true); });
      byId('repair-sync').addEventListener('click', function () { runAction('forceRepairFromUi', '正在檢查並修復事件…', true); });
      byId('create-calendar').addEventListener('click', async function () {
        var calendarName = byId('calendar-name').value.trim() || defaultCalendarName(getCheckedGrade());
        setBusy(true, '正在建立專用日曆…');
        try {
          var result = await server('createDedicatedCalendarForUi', { calendarName: calendarName, gradeName: getCheckedGrade() });
          renderCalendars(result.calendars, result.calendarId, result.calendarName);
          showToast(result.message);
        } catch (error) {
          showToast(error.message);
        } finally {
          setBusy(false);
        }
      });
      byId('pending-list').addEventListener('click', async function (event) { var title = event.target.dataset.keep || event.target.dataset.remove; if (!title) return; setBusy(true, '正在更新項目…'); try { var method = event.target.dataset.keep ? 'confirmPendingTitleFromUi' : 'rejectPendingTitleFromUi'; var result = await server(method, title); render(result.uiData); showToast(result.message); } catch (error) { showToast(error.message); } finally { setBusy(false); } });

      setBusy(true, '正在讀取控制臺…');
      server('getSettingsUiData', null).then(function (data) {
        render(data);
        byId('app').hidden = false;
        requestAnimationFrame(function () {
          byId('app').classList.add('is-ready');
          if (data.termTransition && data.termTransition.required && !termTransitionAnnounced) {
            termTransitionAnnounced = true;
            byId('term-transition').focus({ preventScroll: true });
          }
        });
        return server('getSyncProgressForUi', null);
      }).then(function (progress) {
        if (progress && ['running', 'queued', 'retry_pending'].indexOf(progress.state) !== -1) {
          activeSyncJobId = progress.jobId || '';
          renderSyncProgress(progress);
          setBusy(true, '背景同步仍在執行；現在可以關閉側欄', true);
          pollSyncProgress();
          return;
        }
        setBusy(false);
      }).catch(function (error) {
        showToast(error.message);
        setBusy(false);
      });
    })();
  </script>
</body>
</html>`;
})();
