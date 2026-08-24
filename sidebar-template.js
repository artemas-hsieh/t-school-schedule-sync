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
      --sync-dark: #007c59;
      --shift: #f05a47;
      --ink: #14211d;
      --ink-soft: #4f5d57;
      --paper: #f4f7f2;
      --paper-bright: #ffffff;
      --surface-green: #dff2eb;
      --line: #bac6be;
      --line-dark: #75847c;
      --warning: #f05a47;
      --warning-surface: #fae3df;
      --error: #a62d23;
      --error-surface: #ffe5e0;
      --display: "Noto Sans TC Variable", "Noto Sans TC", sans-serif;
      --body: "Noto Sans TC Variable", "Noto Sans TC", sans-serif;
      --technical: "Noto Sans TC Variable", "Noto Sans TC", sans-serif;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
      --space-7: 32px;
      --section-gap: var(--space-7);
      --section-content-gap: var(--space-4);
      --chrome-line: #B7C6BF;
      --course-scroll-shadow-size: var(--space-7);
      --course-scroll-shadow-color: rgba(20, 33, 29, .26);
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
      font-family: var(--body);
      font-size: 13px;
      line-height: 20px;
      text-rendering: optimizeLegibility;
    }
    button, input, select { font: inherit; }
    button:focus-visible, input:focus-visible, select:focus-visible {
      outline: 2px solid var(--sync);
      outline-offset: 2px;
    }
    [hidden] { display: none !important; }
    .visually-hidden {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }

    .app { min-height: 100vh; padding-bottom: 88px; }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: grid;
      grid-template-columns: minmax(0, 1fr) max-content;
      grid-template-areas:
        "eyebrow eyebrow"
        "title status";
      column-gap: var(--space-3);
      row-gap: var(--space-2);
      padding: var(--space-4);
      border-bottom: 1px solid var(--chrome-line);
      background: rgba(244, 247, 242, .96);
      backdrop-filter: blur(12px);
    }
    .eyebrow {
      grid-area: eyebrow;
      margin: 0;
      color: var(--ink);
      font-family: var(--technical);
      font-size: 10px;
      font-weight: 640;
      line-height: 16px;
    }
    h1 { grid-area: title; margin: 0; font-size: 21px; font-weight: 640; line-height: 28px; }
    .top-status {
      grid-area: status;
      align-self: center;
      margin: 0;
      padding: 6px var(--space-2);
      border: 1px solid var(--shift);
      background: var(--error-surface);
      color: var(--shift);
      font-size: 11px;
      font-weight: 640;
      line-height: 16px;
      white-space: nowrap;
    }
    .top-status[data-state="success"] {
      border-color: var(--sync-dark);
      background: var(--surface-green);
      color: var(--sync-dark);
    }

    .term-transition {
      display: grid;
      grid-template-columns: var(--space-1) minmax(0, 1fr);
      gap: var(--space-3);
      margin: var(--space-3) var(--space-3) 0;
      padding: var(--space-3);
      border-top: 1px solid var(--line);
      border-right: 0;
      border-bottom: 1px solid var(--line);
      border-left: 0;
      background: var(--warning-surface);
    }
    .term-transition::before { content: ""; background: var(--warning); }
    .term-transition:focus-visible { outline: 2px solid var(--warning); outline-offset: -4px; }
    .term-transition h2 { margin: 0; font-size: 16px; line-height: 22px; }
    .term-transition p { margin: var(--space-2) 0 0; color: var(--ink-soft); font-size: 11px; line-height: 17px; }
    .term-transition button {
      min-height: 36px;
      margin-top: var(--space-3);
      padding: 0 var(--space-3);
      border: 1px solid var(--line-dark);
      border-radius: var(--radius-control);
      background: var(--paper-bright);
      color: var(--ink);
      cursor: pointer;
      font-size: 11px;
      font-weight: 640;
    }

    .content { display: grid; padding: 0 var(--space-3) var(--space-6); }
    .section {
      padding: var(--section-gap) var(--space-1) 0;
      background: transparent;
    }
    .section:last-child { padding-bottom: var(--space-6); }
    .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--section-content-gap); }
    .section-head h2 { margin: 0; font-size: 15px; font-weight: 640; line-height: 20px; }
    .section-head span { color: var(--ink-soft); font-family: var(--technical); font-size: 10px; line-height: 16px; text-align: right; }

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

    .grade-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
    .grade-choice > span { justify-content: center; }
    .grade-source-health { margin-top: var(--space-4); }
    .choice input, .hour input, .switch input { position: absolute; opacity: 0; pointer-events: none; }

    .field { display: grid; gap: var(--space-2); margin-top: var(--space-3); }
    .section-head + .field,
    .section-head + .calendar-picker > .field:first-child { margin-top: 0; }
    .field > span { color: var(--ink); font-size: 11px; font-weight: 640; line-height: 16px; }
    input[type="text"], input[type="email"], input[type="search"], select {
      width: 100%;
      min-height: 44px;
      padding: 10px var(--space-3);
      border: 1px solid var(--line-dark);
      border-radius: var(--radius-control);
      background: var(--paper-bright);
      color: var(--ink);
    }
    input:focus, select:focus { border-color: var(--sync); box-shadow: inset 3px 0 0 var(--sync); outline: 0; }
    .hint { margin: 0; color: var(--ink-soft); font-size: 10px; font-weight: 400; line-height: 16px; }

    .switch { position: relative; display: grid; grid-template-columns: 44px 1fr; gap: var(--space-3); align-items: center; margin-top: var(--space-4); cursor: pointer; }
    .switch-track { position: relative; width: 44px; height: 24px; border: 1px solid var(--line-dark); border-radius: var(--radius-control); background: var(--paper-bright); }
    .switch-track::after { content: ""; position: absolute; top: 4px; left: 4px; width: 14px; height: 14px; border-radius: var(--radius-control); background: var(--line-dark); transition: transform 180ms var(--ease-out), background 180ms var(--ease-out); }
    .switch input:checked + .switch-track { border-color: var(--sync-dark); background: var(--sync); }
    .switch input:checked + .switch-track::after { background: var(--paper-bright); transform: translateX(20px); }
    .switch-copy strong, .switch-copy span { display: block; }
    .switch-copy strong { color: var(--ink); font-size: 11px; font-weight: 640; line-height: 16px; }
    .switch-copy span { color: var(--ink-soft); font-size: 10px; line-height: 16px; }

    .course-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) 44px; gap: var(--space-2); }
    .small-button, .icon-button {
      min-height: 44px;
      border: 1px solid var(--ink);
      border-radius: var(--radius-control);
      background: var(--paper-bright);
      color: var(--ink);
      cursor: pointer;
      font-size: 11px;
      font-weight: 640;
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
    .course-list-shell {
      position: relative;
      margin-top: var(--space-3);
      border-radius: var(--radius-control);
    }
    .course-list-shell::before,
    .course-list-shell::after {
      content: "";
      position: absolute;
      right: 0;
      left: 0;
      z-index: 2;
      height: var(--course-scroll-shadow-size);
      border-radius: var(--radius-control);
      opacity: 0;
      pointer-events: none;
      transition: opacity 180ms var(--ease-out);
    }
    .course-list-shell::before {
      top: 0;
      background: linear-gradient(to bottom, var(--course-scroll-shadow-color), transparent);
      border-radius: var(--radius-control) var(--radius-control) 0 0;
    }
    .course-list-shell::after {
      bottom: 0;
      background: linear-gradient(to top, var(--course-scroll-shadow-color), transparent);
      border-radius: 0 0 var(--radius-control) var(--radius-control);
    }
    .course-list-shell[data-can-scroll-up="true"]::before,
    .course-list-shell[data-can-scroll-down="true"]::after { opacity: 1; }
    .course-list { display: grid; gap: var(--space-4); max-height: 360px; padding-right: var(--space-1); overflow-y: auto; overscroll-behavior-y: auto; }
    .course-group { display: grid; gap: var(--space-2); }
    .course-group h3 {
      margin: 0;
      color: var(--ink);
      font-size: 11px;
      font-weight: 640;
      line-height: 16px;
    }
    .course-group-list { display: grid; gap: var(--space-2); }
    .choice { position: relative; display: block; }
    .choice > span {
      display: flex;
      min-height: 48px;
      padding: var(--space-2) var(--space-3);
      align-items: center;
      border: 1px solid var(--line);
      border-radius: var(--radius-control);
      background: var(--paper-bright);
      cursor: pointer;
      transition: border-color 150ms var(--ease-out), background 150ms var(--ease-out), box-shadow 150ms var(--ease-out), transform 150ms var(--ease-out);
    }
    .choice > span:hover { border-color: var(--ink); transform: translateY(-1px); }
    .choice input:checked + span { border-color: var(--ink); background: var(--surface-green); box-shadow: 3px 3px 0 var(--ink); transform: translate(-1px, -1px); }
    .choice input:focus-visible + span { outline: 2px solid var(--sync); outline-offset: 2px; }
    .choice-copy { display: grid; }
    .choice-copy strong { font-size: 12px; line-height: 16px; }
    .choice-copy small { margin-top: var(--space-1); color: var(--ink-soft); font-size: 10px; line-height: 16px; }
    .term-grade-confirmation { margin-top: var(--space-3); }
    .choice input:disabled + span { opacity: .45; cursor: not-allowed; transform: none; box-shadow: none; }
    .empty { margin: var(--space-3) 0 0; padding: var(--space-4); border: 1px dashed var(--line-dark); border-radius: var(--radius-control); color: var(--ink-soft); font-size: 11px; text-align: center; }

    .pending { display: grid; gap: var(--space-2); }
    .pending-item { padding: var(--space-3); border: 1px solid var(--shift); border-left-width: 4px; border-radius: var(--radius-panel); background: #fff4f1; }
    .pending-item strong { display: block; font-size: 12px; }
    .pending-actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-top: var(--space-3); }
    .pending-actions button { min-height: 36px; padding: 0 var(--space-2); border: 1px solid var(--ink); border-radius: var(--radius-control); cursor: pointer; font-size: 10px; font-weight: 640; }
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
    .metric strong { margin-top: var(--space-1); font-family: var(--technical); font-size: 12px; line-height: 16px; overflow-wrap: anywhere; }
    .sync-stat-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-top: var(--space-3);
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: var(--radius-control);
      background: var(--paper-bright);
    }
    .sync-stat {
      display: grid;
      min-width: 0;
      padding: var(--space-3) var(--space-1);
      place-content: center;
      text-align: center;
    }
    .sync-stat + .sync-stat { border-left: 1px solid var(--line); }
    .sync-stat span, .sync-stat strong { display: block; }
    .sync-stat span { color: var(--ink-soft); font-size: 10px; line-height: 16px; }
    .sync-stat strong {
      margin-top: var(--space-1);
      font-family: var(--technical);
      font-size: 20px;
      font-weight: 640;
      line-height: 24px;
      overflow-wrap: anywhere;
    }
    .message { margin: var(--space-3) 0 0; padding: var(--space-3); border-left: 3px solid var(--sync); background: var(--surface-green); color: var(--ink-soft); font-size: 11px; line-height: 16px; }
    .message.error { border-color: var(--error); background: var(--error-surface); color: var(--error); }

    .notification-time-list { display: grid; gap: var(--space-2); }
    .notification-time-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px;
      gap: var(--space-2);
    }
    .notification-time-row select { min-height: 44px; }
    .notification-time-action.is-remove {
      border-color: var(--line-dark);
      color: var(--ink-soft);
    }
    .instant-notification-switch { margin-top: 0; }
    .reimport-setup {
      width: 100%;
      min-height: 42px;
      margin-top: var(--space-3);
      border: 1px solid var(--line-dark);
      border-radius: var(--radius-control);
      background: var(--paper-bright);
      color: var(--ink);
      cursor: pointer;
      font: inherit;
      font-weight: 640;
    }
    .notification-time-field.is-instant .notification-time-row { grid-template-columns: minmax(0, 1fr); }
    .notification-time-field.is-instant .notification-time-action { display: none; }
    .notification-time-field.is-instant select:disabled {
      border-color: var(--line);
      background: var(--surface-soft);
      color: var(--ink-soft);
      opacity: .62;
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
      border-top: 1px solid var(--chrome-line);
      background: rgba(244, 247, 242, .97);
      backdrop-filter: blur(12px);
    }
    .footer > button, .sync-primary, .sync-menu-toggle { min-height: 48px; border: 1px solid var(--ink); border-radius: var(--radius-control); cursor: pointer; font-size: 12px; font-weight: 640; transition: transform 150ms var(--ease-out), box-shadow 150ms var(--ease-out); }
    .footer > button:hover, .sync-primary:hover, .sync-menu-toggle:hover { box-shadow: 3px 3px 0 rgba(20, 33, 29, .22); transform: translate(-1px, -1px); }
    .footer > button:active, .sync-primary:active, .sync-menu-toggle:active { box-shadow: none; transform: translate(1px, 1px); }
    .save { padding: 0 var(--space-4); background: var(--paper-bright); color: var(--ink); }
    .sync-actions { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 48px; }
    .sync-primary, .sync-menu-toggle { border-radius: 0; background: var(--sync); color: var(--paper-bright); }
    .sync-primary { padding: 0 var(--space-3); border-radius: var(--radius-control) 0 0 var(--radius-control); }
    .sync-menu-toggle {
      display: grid;
      width: 48px;
      padding: 0;
      place-items: center;
      border-left: 0;
      border-radius: 0 var(--radius-control) var(--radius-control) 0;
    }
    .sync-menu-toggle::before {
      content: "";
      width: 8px;
      height: 8px;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: translateY(-2px) rotate(45deg);
      transition: transform 150ms var(--ease-out);
    }
    .sync-menu-toggle[aria-expanded="true"]::before { transform: translateY(2px) rotate(225deg); }
    .sync-menu {
      position: absolute;
      right: 0;
      bottom: calc(100% + var(--space-2));
      z-index: 30;
      display: grid;
      width: min(220px, calc(100vw - 24px));
      padding: var(--space-1);
      border: 1px solid var(--ink);
      border-radius: var(--radius-panel);
      background: var(--paper-bright);
      box-shadow: 4px 4px 0 rgba(20, 33, 29, .18);
    }
    .sync-menu button {
      min-height: 44px;
      padding: 0 var(--space-3);
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--ink);
      cursor: pointer;
      font-size: 11px;
      font-weight: 640;
      text-align: left;
    }
    .sync-menu button:hover, .sync-menu button:focus-visible { background: var(--surface-green); }
    .sync-menu button + button { border-top: 1px solid var(--line); border-radius: 0 0 var(--radius-control) var(--radius-control); }
    button:disabled { opacity: .48; cursor: wait; }
    button[data-validation-disabled="true"]:disabled { cursor: not-allowed; }

    .loading { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(244, 247, 242, .96); }
    .loader { display: grid; width: min(224px, calc(100vw - 48px)); gap: var(--space-3); justify-items: center; color: var(--ink-soft); font-family: var(--technical); font-size: 11px; text-align: center; }
    .loader-track { position: relative; width: 152px; height: var(--space-1); overflow: hidden; background: var(--line); }
    .loader-track::after { content: ""; position: absolute; inset: 0; width: 44%; background: var(--sync); animation: scan 1s var(--ease-out) infinite; }
    .sync-progress { display: grid; width: 100%; gap: var(--space-2); }
    .sync-progress-head { display: flex; justify-content: space-between; gap: var(--space-3); color: var(--ink); font-family: var(--body); font-size: 11px; font-weight: 640; text-align: left; }
    .sync-progress-track { height: var(--space-2); overflow: hidden; border: 1px solid var(--line-dark); background: var(--paper-bright); }
    .sync-progress-track span { display: block; width: 0; height: 100%; background: var(--sync); transition: width 280ms var(--ease-out); }
    .sync-progress-detail { color: var(--ink-soft); font-family: var(--body); font-size: 10px; line-height: 16px; text-align: left; }
    .sync-progress-warning { margin: 0; color: var(--warning); font-family: var(--body); font-size: 11px; font-weight: 640; line-height: 16px; text-align: left; }
    .toast { position: fixed; right: var(--space-3); bottom: 76px; left: var(--space-3); z-index: 60; padding: var(--space-3); border: 1px solid var(--paper-bright); border-radius: var(--radius-control); background: var(--ink); color: var(--paper-bright); font-size: 11px; line-height: 16px; opacity: 0; pointer-events: none; transform: translateY(var(--space-2)); transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out); }
    .toast.show { opacity: 1; transform: translateY(0); }
    .app.is-ready .section { animation: section-in 360ms var(--ease-out) both; }
    .app.is-ready .section:nth-child(2) { animation-delay: 35ms; }
    .app.is-ready .section:nth-child(3) { animation-delay: 70ms; }
    .app.is-ready .section:nth-child(4) { animation-delay: 105ms; }
    .app.is-ready .section:nth-child(5) { animation-delay: 140ms; }
    .app.is-ready .section:nth-child(6) { animation-delay: 175ms; }
    @keyframes scan { from { transform: translateX(-105%); } to { transform: translateX(230%); } }
    @keyframes section-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    @media (max-width: 340px) {
      .topbar { padding: var(--space-3); }
      .content { padding-inline: var(--space-2); }
      .calendar-create, .status-grid { grid-template-columns: 1fr; }
      .pending-actions { grid-template-columns: 1fr; }
      .footer { grid-template-columns: auto minmax(0, 1fr); padding: var(--space-2); }
      .sync-primary { padding-inline: var(--space-2); }
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
        <p class="sync-progress-warning" id="sync-progress-warning" role="status" hidden>請勿現在關閉控制臺！</p>
      </div>
    </div>
  </div>
  <div class="app" id="app" hidden>
    <header class="topbar">
      <p class="eyebrow">T-SCHOOL Schedule Sync</p>
      <h1>行程同步控制臺</h1>
      <p class="top-status" id="top-status" data-state="attention" role="status" aria-live="polite">待首次同步</p>
    </header>

    <section class="term-transition" id="term-transition" role="alert" aria-live="assertive" tabindex="-1" hidden>
      <div>
        <h2>請完成新學期設定</h2>
        <p id="term-transition-message">確認新學期年級 → 選擇課程與活動 → 完成選擇並同步</p>
        <p id="term-transition-outline-message" hidden></p>
        <button type="button" id="term-transition-action">前往確認年級</button>
      </div>
    </section>

    <main class="content">
      <section class="section">
        <div class="section-head"><h2>同步狀態</h2></div>
        <div class="status-grid"><div class="metric"><span>上次同步</span><strong id="last-sync">尚未同步</strong></div><div class="metric"><span>受管理事件</span><strong id="event-count">0</strong></div></div>
        <div class="sync-stat-grid" aria-label="上次同步事件統計">
          <div class="sync-stat"><span>新增</span><strong id="sync-created">0</strong></div>
          <div class="sync-stat"><span>更新</span><strong id="sync-updated">0</strong></div>
          <div class="sync-stat"><span>移除</span><strong id="sync-deleted">0</strong></div>
          <div class="sync-stat"><span>未變更</span><strong id="sync-unchanged">0</strong></div>
        </div>
        <p class="message error" id="status-message" role="alert" hidden></p>
        <label class="switch">
          <input type="checkbox" id="auto-sync">
          <span class="switch-track" aria-hidden="true"></span>
          <span class="switch-copy"><strong>啟用自動同步</strong><span>關閉後仍可用底部按鈕手動同步</span></span>
        </label>
      </section>

      <section class="section">
        <div class="section-head"><h2>日曆</h2><span>不允許主要日曆</span></div>
        <div class="calendar-picker">
          <label class="field"><span>同步目標日曆</span><select id="calendar"></select></label>
          <div class="calendar-create" id="calendar-create">
            <label class="field"><span>新日曆名稱</span><input type="text" id="calendar-name" maxlength="100" autocomplete="off"></label>
            <button type="button" class="small-button" id="create-calendar">建立日曆</button>
          </div>
        </div>
        <p class="hint">若不先建立，首次同步會使用上方名稱自動建立專用日曆。</p>
        <label class="field"><span>行程提醒</span><select id="reminder-mode"><option value="none">不提醒</option><option value="popup">日曆彈出通知</option><option value="email">Email 提醒</option></select></label>
        <label class="field" id="reminder-wrap" hidden><span>提前時間</span><select id="reminder-minutes"><option value="10">10 分鐘</option><option value="30">30 分鐘</option><option value="60">1 小時</option><option value="1440">1 天</option></select></label>
      </section>

      <section class="section">
        <div class="section-head"><h2>年級</h2></div>
        <div class="grade-options" role="radiogroup" aria-label="選年級">
          <label class="choice grade-choice"><input type="radio" name="grade" value="高一"><span><span class="choice-copy"><strong>高一</strong></span></span></label>
          <label class="choice grade-choice"><input type="radio" name="grade" value="高二"><span><span class="choice-copy"><strong>高二</strong></span></span></label>
          <label class="choice grade-choice"><input type="radio" name="grade" value="高三"><span><span class="choice-copy"><strong>高三</strong></span></span></label>
        </div>
        <label class="choice term-grade-confirmation" id="term-grade-confirmation" hidden>
          <input type="checkbox" id="term-grade-confirmed">
          <span><span class="choice-copy"><strong>我已確認這是新學期就讀年級</strong><small>若已升年級，請先切換上方年級再勾選。</small></span></span>
        </label>
        <div class="source-health grade-source-health" id="source-health"><div><strong id="source-title">讀取中</strong><span id="source-detail"></span></div></div>
      </section>

      <section class="section" id="pending-section" hidden>
        <div class="section-head"><h2>待確認項目</h2><span>已先加入日曆</span></div>
        <div class="pending" id="pending-list"></div>
      </section>

      <section class="section" id="course-section">
        <div class="section-head"><h2>課程與活動</h2><span id="course-count">已選 0 項</span></div>
        <div class="course-toolbar">
          <input type="search" id="course-search" placeholder="輸入課程或活動名稱、班別等" aria-label="搜尋課程與活動">
          <button type="button" class="icon-button" id="course-search-action" aria-label="搜尋課程與活動">⌕</button>
        </div>
        <div class="course-list-shell" id="course-list-shell" data-can-scroll-up="false" data-can-scroll-down="false">
          <div class="course-list" id="course-list"></div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>通知</h2></div>
        <label class="switch instant-notification-switch">
          <input type="checkbox" id="instant-notifications" role="switch">
          <span class="switch-track" aria-hidden="true"></span>
          <span class="switch-copy"><strong>即時通知</strong><span>偵測到行程調整就盡快通知</span></span>
        </label>
        <div class="field notification-time-field" id="notification-time-field">
          <span>通知時間</span>
          <div class="notification-time-list" id="notify-hours-list" aria-label="通知時間"></div>
          <p class="hint">因為技術限制，通知時間可能在 ± 15 分鐘內波動～</p>
        </div>
        <label class="field"><span>收通知的 Email</span><input type="email" id="email" autocomplete="email"><small class="hint">為了讓程式能存取課綱，請輸入校內 Email</small></label>
        <button type="button" class="reimport-setup" id="reimport-setup">重新匯入網站設定碼</button>
      </section>

    </main>

    <footer class="footer">
      <button type="button" class="save" id="save">儲存</button>
      <div class="sync-actions">
        <button type="button" class="sync-primary" id="save-sync">儲存並首次同步</button>
        <button type="button" class="sync-menu-toggle" id="sync-menu-toggle" aria-label="開啟同步選單" aria-haspopup="menu" aria-expanded="false" aria-controls="sync-menu"></button>
        <div class="sync-menu" id="sync-menu" role="menu" hidden>
          <button type="button" id="run-sync" role="menuitem">立即同步</button>
          <button type="button" id="repair-sync" role="menuitem">強制修復</button>
        </div>
      </div>
    </footer>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <script>
    (function () {
      var model = null;
      var selectedTitles = new Set();
      var busy = false;
      var syncProgressTimer = null;
      var syncProgressPollGeneration = 0;
      var activeSyncJobId = '';
      var lastSyncProgressJobId = '';
      var lastSyncProgressPercent = 0;
      var termTransitionAnnounced = false;
      var MAX_NOTIFY_HOURS = 4;
      var customNotificationHours = [6];
      var initialLoadRetryTimer = null;
      var INITIAL_LOAD_RETRY_DELAY_MS = 1500;

      function byId(id) { return document.getElementById(id); }
      function escapeHtml(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
      function normalize(value) { return String(value || '').replace(/\s+/g, '').toLowerCase(); }
      function defaultCalendarName(gradeName) { return (gradeName || '高一') + '行程｜T-SCHOOL Schedule Sync'; }
      function isDefaultSelectedTitle(value) {
        return /全校|學習分享會|補假|補課|放假|節假日|國定假日|模擬考|模考|春節|元旦|端午節|中秋節|清明節|兒童節|國慶日|和平紀念日|開國紀念日|勞動節|光復節|教師節|行憲紀念日/.test(normalize(value));
      }
      function seedDefaultSelections(source) {
        var catalog = source && source.catalog || {};
        (catalog.all || []).forEach(function (item) {
          if (isDefaultSelectedTitle(item.title)) selectedTitles.add(item.title);
        });
      }
      function setSyncMenuOpen(open, focusFirstItem) {
        var menu = byId('sync-menu');
        var toggle = byId('sync-menu-toggle');
        if (!menu || !toggle) return;
        var shouldOpen = Boolean(open) && !busy && !toggle.disabled;
        menu.hidden = !shouldOpen;
        toggle.setAttribute('aria-expanded', String(shouldOpen));
        toggle.setAttribute('aria-label', shouldOpen ? '關閉同步選單' : '開啟同步選單');
        if (shouldOpen && focusFirstItem) {
          var firstItem = menu.querySelector('[role="menuitem"]:not(:disabled)');
          if (firstItem) firstItem.focus();
        }
      }
      function setBusy(value, label, showProgress, requiresSidebarOpen) {
        busy = value;
        if (value) setSyncMenuOpen(false);
        byId('loading').hidden = !value;
        byId('loading-label').textContent = label || '處理中…';
        byId('loading-label').hidden = Boolean(showProgress);
        byId('loader-track').hidden = Boolean(showProgress);
        byId('sync-progress').hidden = !showProgress;
        byId('sync-progress-warning').hidden = !(value && showProgress && requiresSidebarOpen);
        Array.prototype.forEach.call(document.querySelectorAll('button'), function (button) { button.disabled = value; });
        if (!value) {
          updateActionAvailability();
          if (byId('notify-hours-list')) updateNotifyHourOptions();
        }
      }
      function showToast(message) { var toast = byId('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(function () { toast.classList.remove('show'); }, 8000); }
      function showResultMessage(result) {
        var messages = [
          result && result.message,
          result && result.operationWarning,
          result && result.uiRefreshWarning,
          result && result.calendarListWarning
        ].filter(Boolean);
        if (messages.length) showToast(messages.join('\n'));
      }
      function renderUiResult(result) {
        if (result && result.uiData) render(result.uiData);
        showResultMessage(result);
      }
      function server(method, value) { return new Promise(function (resolve, reject) { var runner = google.script.run.withSuccessHandler(resolve).withFailureHandler(function (error) { reject(new Error(error && error.message ? error.message : String(error))); }); runner[method](value); }); }
      function isTransientInitialLoadError(error) {
        return String(error && error.message ? error.message : error)
          .indexOf('背景同步正在保存行程') !== -1;
      }
      function getCheckedGrade() { var input = document.querySelector('input[name="grade"]:checked'); return input ? input.value : '高一'; }
      function renderSyncProgress(progress) {
        var progressJobId = String(progress && progress.jobId || '');
        if (progressJobId && progressJobId !== lastSyncProgressJobId) {
          lastSyncProgressJobId = progressJobId;
          lastSyncProgressPercent = 0;
        }
        var reportedValue = Math.max(0, Math.min(100, Number(progress && progress.percent) || 0));
        var value = Math.max(lastSyncProgressPercent, reportedValue);
        lastSyncProgressPercent = value;
        byId('sync-progress').setAttribute('aria-valuenow', String(value));
        byId('sync-progress-value').textContent = value + '%';
        byId('sync-progress-bar').style.width = value + '%';
        byId('sync-progress-detail').textContent = progress && progress.message ? progress.message : '正在同步…';
      }
      function stopSyncProgressPolling() {
        if (syncProgressTimer) clearTimeout(syncProgressTimer);
        syncProgressTimer = null;
      }
      function scheduleSyncProgressPoll(delay, generation) {
        syncProgressTimer = setTimeout(function () { pollSyncProgress(generation); }, delay);
      }
      function pollSyncProgress(generation) {
        var pollGeneration = generation === undefined ? syncProgressPollGeneration : generation;
        stopSyncProgressPolling();
        server('getSyncProgressForUi', activeSyncJobId || null).then(function (progress) {
          if (pollGeneration !== syncProgressPollGeneration) return;
          if (!busy || !progress) return;
          var terminal = progress.state === 'complete' || progress.state === 'error';
          var progressJobId = String(progress.jobId || '');
          if (terminal && (!activeSyncJobId || progress.jobId !== activeSyncJobId)) {
            scheduleSyncProgressPoll(2500, pollGeneration);
            return;
          }
          if (progressJobId && !terminal) activeSyncJobId = progressJobId;
          renderSyncProgress(progress);
          if (terminal) {
            activeSyncJobId = '';
            server('getSettingsUiData', null).then(render).catch(function () {});
            showToast(progress.state === 'complete' ? '同步完成' : progress.message);
            setBusy(false);
            return;
          }
          var waiting = progress.state === 'queued' || progress.state === 'retry_pending';
          scheduleSyncProgressPoll(waiting ? 8000 : 2500, pollGeneration);
        }).catch(function () {
          if (pollGeneration === syncProgressPollGeneration && busy) {
            scheduleSyncProgressPoll(8000, pollGeneration);
          }
        });
      }
      function startSyncProgress(label) {
        syncProgressPollGeneration += 1;
        var pollGeneration = syncProgressPollGeneration;
        activeSyncJobId = '';
        lastSyncProgressPercent = 0;
        renderSyncProgress({ percent: 0, message: label || '正在準備同步（可能需等待 0–10 分鐘）' });
        setBusy(true, '正在同步行程', true, true);
        stopSyncProgressPolling();
        scheduleSyncProgressPoll(1000, pollGeneration);
      }

      function render(data) {
        model = data;
        var settings = data.settings;
        selectedTitles = new Set(settings.selectedTitles || []);
        if (data.termTransition && data.termTransition.required && selectedTitles.size === 0) {
          seedDefaultSelections(data.source);
        }
        document.querySelector('input[name="grade"][value="' + settings.gradeName + '"]').checked = true;
        byId('email').value = settings.notificationEmail || '';
        byId('auto-sync').checked = data.termTransition && data.termTransition.required
          ? data.termTransition.resumeAutoSync
          : settings.autoSyncEnabled;
        byId('reminder-mode').value = settings.reminderMode;
        byId('reminder-minutes').value = String(settings.reminderMinutes || 10);
        customNotificationHours = normalizeNotifyHours(
          settings.notificationHours || settings.autoSyncHours || [settings.notifySyncHour]
        );
        byId('instant-notifications').checked = settings.instantNotificationsEnabled !== false;
        renderNotificationPreferences();
        renderCalendars(data.calendars, settings.calendarId, settings.calendarName);
        renderSource(data.source);
        renderCourses();
        renderPending(settings.pendingTitles || []);
        renderStatus(data.status);
        renderTermTransition(data.termTransition, data.courseOutlineStatus, data.source);
        updateConditionalFields();
        var needsTermSelection = Boolean(data.termTransition && data.termTransition.required);
        var sourceUnavailable = Boolean(data.source && data.source.unavailable);
        byId('top-status').dataset.state = !needsTermSelection && !sourceUnavailable && data.status && data.status.ok
          ? 'success'
          : 'attention';
        byId('top-status').textContent = needsTermSelection
          ? '待重新選擇課程與活動'
          : (sourceUnavailable
            ? '課表來源暫時離線'
          : (data.status && data.status.ok
            ? '狀態正常'
            : (settings.setupComplete ? '需檢查狀態' : '待首次同步')));
        byId('save').textContent = needsTermSelection ? '儲存新學期設定' : '儲存';
        byId('save-sync').textContent = needsTermSelection
          ? '完成選擇並同步'
          : (settings.setupComplete ? '儲存並同步' : '儲存並首次同步');
        byId('reimport-setup').hidden = Boolean(settings.setupComplete);
        updateActionAvailability();
      }

      function renderTermTransition(transition, outlineStatus, source) {
        var panel = byId('term-transition');
        var required = Boolean(transition && transition.required);
        panel.hidden = !required;
        byId('term-grade-confirmation').hidden = !required;
        if (!required) {
          byId('term-grade-confirmed').checked = false;
          termTransitionAnnounced = false;
          return;
        }
        byId('term-transition-message').textContent =
          '確認新學期年級 → 選擇課程與活動 → 完成選擇並同步';
        var outlineMessage = byId('term-transition-outline-message');
        var indexWarning = outlineStatus && outlineStatus.indexWarning || '';
        var missingCurrentOutline = outlineStatus && !outlineStatus.enabled;
        outlineMessage.hidden = !indexWarning && !missingCurrentOutline && !transition.noticeFailed;
        outlineMessage.textContent = transition.noticeFailed
          ? '提醒信暫時無法寄出，但這裡會持續保留重新選擇課程與活動的提示。'
          : (indexWarning
            ? indexWarning
            : (missingCurrentOutline
              ? '這學期的課綱尚未加入中央索引；可先同步基本行程。上架後，自動同步或下一次手動同步會補入課綱。'
              : ''));
      }

      function updateActionAvailability() {
        if (!model || busy) return;
        var requiresSelection = Boolean(model.termTransition && model.termTransition.required);
        var sourceUnavailable = Boolean(model.source && model.source.unavailable);
        var catalog = model.source && model.source.catalog || {};
        var missingSelection = !(catalog.all || []).some(function (item) {
          return selectedTitles.has(item.title);
        });
        var missingGradeConfirmation = requiresSelection && !byId('term-grade-confirmed').checked;
        ['save', 'save-sync'].forEach(function (id) {
          var button = byId(id);
          button.disabled = missingSelection || missingGradeConfirmation || sourceUnavailable;
          button.dataset.validationDisabled = String(
            missingSelection || missingGradeConfirmation || sourceUnavailable
          );
        });
        ['run-sync', 'repair-sync'].forEach(function (id) {
          var button = byId(id);
          button.disabled = requiresSelection || sourceUnavailable;
          button.dataset.validationDisabled = String(requiresSelection || sourceUnavailable);
        });
        byId('sync-menu-toggle').disabled = requiresSelection || sourceUnavailable;
        byId('sync-menu-toggle').dataset.validationDisabled = String(requiresSelection || sourceUnavailable);
        byId('create-calendar').disabled = sourceUnavailable;
        byId('create-calendar').dataset.validationDisabled = String(sourceUnavailable);
        Array.prototype.forEach.call(
          document.querySelectorAll('input[name="grade"]'),
          function (input) { input.disabled = sourceUnavailable; }
        );
        Array.prototype.forEach.call(
          document.querySelectorAll('[data-keep],[data-remove]'),
          function (button) { button.disabled = sourceUnavailable; }
        );
        if (requiresSelection || sourceUnavailable) setSyncMenuOpen(false);
      }

      function renderSource(source) {
        var health = byId('source-health');
        health.dataset.state = source.unavailable ? 'error' : (source.warning ? 'warning' : 'success');
        byId('source-title').textContent = source.unavailable
          ? source.gradeName + '課表來源暫時無法連線'
          : source.gradeName + '課表可用';
        var dateRange = source.firstDate
          ? source.firstDate + (source.lastDate ? '–' + source.lastDate : '') + ' · '
          : '';
        var catalog = source.catalog || {};
        var itemCount = (catalog.termItems || []).length + (catalog.vacationItems || []).length;
        var summary = dateRange + itemCount + ' 項行程';
        byId('source-detail').textContent = source.unavailable
          ? (source.unavailableMessage || '目前顯示上次可用摘要，恢復連線後才能儲存或同步。') +
            (summary ? ' ' + summary : '')
          : summary;
      }

      function normalizeNotifyHours(hours) {
        var normalizedHours = Array.from(new Set((hours || [])
          .map(Number)
          .filter(function (hour) {
            return Number.isInteger(hour) && hour >= 0 && hour <= 23;
          })))
          .sort(function (left, right) { return left - right; })
          .slice(0, MAX_NOTIFY_HOURS);
        return normalizedHours.length ? normalizedHours : [6];
      }

      function renderNotifyHours(hours) {
        var initialHours = normalizeNotifyHours(hours);
        byId('notify-hours-list').innerHTML = '';
        initialHours.forEach(appendNotifyHourRow);
        updateNotifyHourOptions();
      }

      function renderNotificationPreferences() {
        var instantEnabled = byId('instant-notifications').checked;
        byId('notification-time-field').classList.toggle('is-instant', instantEnabled);
        renderNotifyHours(instantEnabled ? [6] : customNotificationHours);
      }

      function appendNotifyHourRow(hour) {
        var index = getNotifyHourSelects().length;
        var options = Array.from({ length: 24 }, function (_, optionHour) {
          return '<option value="' + optionHour + '">' + String(optionHour).padStart(2, '0') + ':00</option>';
        }).join('');
        byId('notify-hours-list').insertAdjacentHTML('beforeend',
          '<div class="notification-time-row">' +
            '<label><span class="visually-hidden">通知時間 ' + (index + 1) + '</span>' +
              '<select data-notify-hour>' + options + '</select></label>' +
            '<button type="button" class="icon-button notification-time-action ' +
              (index === 0 ? 'is-add' : 'is-remove') + '" ' +
              (index === 0 ? 'data-add-notify-hour' : 'data-remove-notify-hour') +
              ' aria-label="' + (index === 0 ? '新增通知時間' : '移除通知時間 ' + (index + 1)) + '">' +
              (index === 0 ? '+' : '−') +
            '</button>' +
          '</div>'
        );
        getNotifyHourSelects()[index].value = String(hour);
      }

      function getNotifyHourSelects() {
        return Array.prototype.slice.call(document.querySelectorAll('[data-notify-hour]'));
      }

      function getSelectedNotifyHours() {
        return getNotifyHourSelects()
          .map(function (select) { return Number(select.value); })
          .filter(function (hour, index, values) {
            return Number.isInteger(hour) &&
              hour >= 0 &&
              hour <= 23 &&
              values.indexOf(hour) === index;
          })
          .sort(function (left, right) { return left - right; });
      }

      function getNextNotifyHour() {
        var selected = getSelectedNotifyHours();
        var preferred = ((selected[selected.length - 1] == null ? 6 : selected[selected.length - 1]) + 6) % 24;
        for (var offset = 0; offset < 24; offset += 1) {
          var candidate = (preferred + offset) % 24;
          if (selected.indexOf(candidate) === -1) return candidate;
        }
        return 6;
      }

      function updateNotifyHourOptions() {
        var selects = getNotifyHourSelects();
        var selectedHours = selects.map(function (select) { return Number(select.value); });
        var instantEnabled = byId('instant-notifications').checked;
        selects.forEach(function (select, selectIndex) {
          select.disabled = instantEnabled;
          select.title = instantEnabled
            ? '即時通知開啟時，每日摘要固定於 06:00 寄出'
            : '';
          Array.prototype.forEach.call(select.options, function (option) {
            var optionHour = Number(option.value);
            option.disabled = selectedHours.some(function (selectedHour, selectedIndex) {
              return selectedIndex !== selectIndex && selectedHour === optionHour;
            });
          });
        });
        var addButton = byId('notify-hours-list').querySelector('[data-add-notify-hour]');
        if (addButton) {
          var maximumReached = selects.length >= MAX_NOTIFY_HOURS;
          addButton.disabled = instantEnabled || maximumReached;
          addButton.title = maximumReached ? '最多可設定 4 個通知時間' : '';
        }
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
        var catalog = model.source.catalog || {};
        var hasVacationItems = (catalog.vacationItems || []).length > 0;
        var termItems = (catalog.termItems || [])
          .filter(function (item) { return normalize(item.title).indexOf(query) !== -1; });
        var vacationItems = (catalog.vacationItems || [])
          .filter(function (item) { return normalize(item.title).indexOf(query) !== -1; });
        var sections = [];
        if (termItems.length) {
          sections.push(renderCourseGroup(hasVacationItems ? '學期間課程與活動' : '', termItems));
        }
        if (vacationItems.length) {
          sections.push(renderCourseGroup('寒暑假期間課程與活動', vacationItems));
        }
        byId('course-list').innerHTML = sections.join('') || '<p class="empty">找不到符合條件的項目，請調整搜尋文字</p>';
        var selectedCount = (catalog.all || []).filter(function (item) {
          return selectedTitles.has(item.title);
        }).length;
        byId('course-count').textContent = '已選 ' + selectedCount + ' 項';
        updateCourseSearchAction();
        updateActionAvailability();
        requestAnimationFrame(updateCourseScrollShadows);
      }

      function updateCourseScrollShadows() {
        var list = byId('course-list');
        var shell = byId('course-list-shell');
        if (!list || !shell) return;
        var maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
        shell.dataset.canScrollUp = String(maxScrollTop > 1 && list.scrollTop > 1);
        shell.dataset.canScrollDown = String(
          maxScrollTop > 1 && list.scrollTop < maxScrollTop - 1
        );
      }

      function renderCourseGroup(title, items) {
        return '<section class="course-group">' +
          (title ? '<h3>' + escapeHtml(title) + '</h3>' : '') +
          '<div class="course-group-list">' +
          items.map(renderCourseChoice).join('') +
          '</div></section>';
      }

      function renderCourseChoice(item) {
        var checked = selectedTitles.has(item.title);
        return '<label class="choice"><input type="checkbox" data-kind="schedule-item" value="' + escapeHtml(item.title) + '" ' +
          (checked ? 'checked' : '') + '><span><span class="choice-copy"><strong>' +
          escapeHtml(item.title) + '</strong></span></span></label>';
      }

      function updateCourseSearchAction() {
        var isSearching = Boolean(byId('course-search').value);
        var action = byId('course-search-action');
        action.textContent = isSearching ? '×' : '⌕';
        action.setAttribute('aria-label', isSearching ? '取消搜尋' : '搜尋課程與活動');
      }

      function renderPending(items) {
        byId('pending-section').hidden = !items.length;
        byId('pending-list').innerHTML = items.map(function (title) { return '<div class="pending-item"><strong>' + escapeHtml(title) + '</strong><div class="pending-actions"><button type="button" class="keep" data-keep="' + escapeHtml(title) + '">屬於我，保留</button><button type="button" class="remove" data-remove="' + escapeHtml(title) + '">不屬於我，下次移除</button></div></div>'; }).join('');
      }

      function renderStatus(status) {
        byId('last-sync').textContent = status && status.lastSyncLabel ? status.lastSyncLabel : '尚未同步';
        byId('event-count').textContent = status && status.eventCount != null ? String(status.eventCount) : '0';
        var syncCounts = {
          'sync-created': Number(status && status.created) || 0,
          'sync-updated': (Number(status && status.updated) || 0) + (Number(status && status.outlineUpdated) || 0),
          'sync-deleted': Number(status && status.deleted) || 0,
          'sync-unchanged': Number(status && status.unchanged) || 0
        };
        Object.keys(syncCounts).forEach(function (id) {
          byId(id).textContent = String(Math.max(0, syncCounts[id]));
        });
        var message = byId('status-message');
        var hasError = Boolean(status && status.ok === false);
        message.hidden = !hasError;
        message.textContent = hasError
          ? (status.message || '同步發生錯誤，請稍後再試。')
          : '';
      }

      function updateConditionalFields() {
        byId('reminder-wrap').hidden = byId('reminder-mode').value === 'none';
      }

      function collectSettings() {
        var instantNotificationsEnabled = byId('instant-notifications').checked;
        var notificationHours = instantNotificationsEnabled
          ? customNotificationHours.slice()
          : getSelectedNotifyHours();
        return {
          gradeName: getCheckedGrade(),
          selectedTitles: Array.from(selectedTitles),
          calendarId: byId('calendar').value,
          calendarName: byId('calendar-name').value.trim() || defaultCalendarName(getCheckedGrade()),
          notificationEmail: byId('email').value.trim(),
          autoSyncEnabled: byId('auto-sync').checked,
          instantNotificationsEnabled: instantNotificationsEnabled,
          notificationHours: notificationHours,
          notifySyncHour: Math.max.apply(null, notificationHours),
          reminderMode: byId('reminder-mode').value,
          reminderMinutes: Number(byId('reminder-minutes').value),
          termGradeConfirmed: byId('term-grade-confirmed').checked
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
            startSyncProgress(
              model && model.settings && !model.settings.setupComplete
                ? '正在準備未來 30 天的課綱資料（可能需等待 0–10 分鐘）'
                : '正在儲存設定並準備同步（可能需等待 0–10 分鐘）'
            );
            if (model && model.settings && !model.settings.setupComplete) {
              var outlinePreparation = await server(
                'prepareFirstSyncCourseOutlinesFromUi',
                settings
              );
              if (outlinePreparation && outlinePreparation.message) {
                showToast(outlinePreparation.message);
              }
            }
            settings.syncApprovalToken = preview.approvalToken || '';
            renderSyncProgress({
              percent: 0,
              message: '正在儲存設定並準備同步（可能需等待 0–10 分鐘）'
            });
          }
          var result = await server(runSync ? 'saveSettingsAndSyncFromUi' : 'saveSettingsFromUi', settings);
          renderUiResult(result);
          if (result.pending) {
            keepPolling = true;
            activeSyncJobId = result.jobId || '';
            setBusy(true, '同步已在背景分批執行；現在可以關閉控制臺', true, false);
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
          renderUiResult(result);
          if (result.pending) {
            keepPolling = true;
            activeSyncJobId = result.jobId || '';
            setBusy(true, '同步已在背景分批執行；現在可以關閉控制臺', true, false);
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
        if (event.target.matches('#course-list input[data-kind="schedule-item"]')) {
          event.target.checked
            ? selectedTitles.add(event.target.value)
            : selectedTitles.delete(event.target.value);
          renderCourses();
        }
        if (event.target.matches('[data-notify-hour]')) {
          customNotificationHours = getSelectedNotifyHours();
          updateNotifyHourOptions();
        }
        if (event.target.id === 'instant-notifications') {
          if (event.target.checked) customNotificationHours = getSelectedNotifyHours();
          renderNotificationPreferences();
        }
        if (event.target.id === 'calendar') updateCalendarFields();
        if (event.target.id === 'term-grade-confirmed') updateActionAvailability();
        if (event.target.name === 'grade') {
          if (byId('calendar-name').dataset.autoName === 'true') byId('calendar-name').value = defaultCalendarName(event.target.value);
          byId('term-grade-confirmed').checked = false;
          setBusy(true, '正在讀取年級課表…');
          server('getGradeContextForUi', event.target.value).then(function (gradeContext) {
            var data = gradeContext.source;
            model.source = data;
            model.courseOutlineStatus = gradeContext.courseOutlineStatus;
            model.termTransition = gradeContext.termTransition;
            selectedTitles = new Set();
            seedDefaultSelections(data);
            renderSource(data);
            renderTermTransition(
              gradeContext.termTransition,
              gradeContext.courseOutlineStatus,
              data
            );
            renderCourses();
          }).catch(function (error) {
            showToast(error.message);
          }).finally(function () {
            setBusy(false);
          });
        }
        if (event.target.id === 'reminder-mode') updateConditionalFields();
      });
      byId('course-search').addEventListener('input', renderCourses);
      byId('course-list').addEventListener('scroll', updateCourseScrollShadows, { passive: true });
      window.addEventListener('resize', updateCourseScrollShadows, { passive: true });
      byId('course-search').addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && event.target.value) {
          event.preventDefault();
          event.target.value = '';
          renderCourses();
        }
      });
      byId('calendar-name').addEventListener('input', function () { byId('calendar-name').dataset.autoName = 'false'; });
      byId('course-search-action').addEventListener('click', function () {
        if (byId('course-search').value) {
          byId('course-search').value = '';
          renderCourses();
        }
        byId('course-search').focus();
      });
      byId('notify-hours-list').addEventListener('click', function (event) {
        var addButton = event.target.closest('[data-add-notify-hour]');
        var removeButton = event.target.closest('[data-remove-notify-hour]');
        if (addButton) {
          if (getNotifyHourSelects().length >= MAX_NOTIFY_HOURS) return;
          appendNotifyHourRow(getNextNotifyHour());
          updateNotifyHourOptions();
          customNotificationHours = getSelectedNotifyHours();
          getNotifyHourSelects()[getNotifyHourSelects().length - 1].focus();
          return;
        }
        if (!removeButton) return;
        var row = removeButton.closest('.notification-time-row');
        var nextFocus = row.previousElementSibling
          ? row.previousElementSibling.querySelector('select')
          : (row.nextElementSibling ? row.nextElementSibling.querySelector('select') : getNotifyHourSelects()[0]);
        row.remove();
        updateNotifyHourOptions();
        customNotificationHours = getSelectedNotifyHours();
        if (nextFocus) nextFocus.focus();
      });
      byId('term-transition-action').addEventListener('click', function () {
        var selectedGrade = document.querySelector('input[name="grade"]:checked');
        if (selectedGrade) selectedGrade.focus();
      });
      byId('save').addEventListener('click', function () { save(false); });
      byId('save-sync').addEventListener('click', function () { save(true); });
      byId('reimport-setup').addEventListener('click', function () {
        if (busy) return;
        server('showSetupImportDialog', null).then(function () {
          google.script.host.close();
        }).catch(function (error) {
          showToast(error.message);
        });
      });
      byId('sync-menu-toggle').addEventListener('click', function () {
        setSyncMenuOpen(byId('sync-menu').hidden, true);
      });
      byId('sync-menu-toggle').addEventListener('keydown', function (event) {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          setSyncMenuOpen(true, true);
        }
      });
      byId('sync-menu').addEventListener('keydown', function (event) {
        var items = Array.prototype.slice.call(byId('sync-menu').querySelectorAll('[role="menuitem"]:not(:disabled)'));
        var currentIndex = items.indexOf(document.activeElement);
        if (event.key === 'Escape') {
          event.preventDefault();
          setSyncMenuOpen(false);
          byId('sync-menu-toggle').focus();
          return;
        }
        if (!items.length || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        var direction = event.key === 'ArrowDown' ? 1 : -1;
        items[(currentIndex + direction + items.length) % items.length].focus();
      });
      document.addEventListener('click', function (event) {
        if (!event.target.closest('.sync-actions')) setSyncMenuOpen(false);
      });
      byId('run-sync').addEventListener('click', function () {
        runAction(
          'runSyncFromUi',
          '正在讀取課表並準備同步（可能需等待 0–10 分鐘）',
          true
        );
      });
      byId('repair-sync').addEventListener('click', function () {
        runAction(
          'forceRepairFromUi',
          '正在讀取課表並準備修復（可能需等待 0–10 分鐘）',
          true
        );
      });
      byId('create-calendar').addEventListener('click', async function () {
        var calendarName = byId('calendar-name').value.trim() || defaultCalendarName(getCheckedGrade());
        setBusy(true, '正在建立專用日曆…');
        try {
          var result = await server('createDedicatedCalendarForUi', { calendarName: calendarName, gradeName: getCheckedGrade() });
          renderCalendars(result.calendars, result.calendarId, result.calendarName);
          showResultMessage(result);
        } catch (error) {
          showToast(error.message);
        } finally {
          setBusy(false);
        }
      });
      byId('pending-list').addEventListener('click', async function (event) { var title = event.target.dataset.keep || event.target.dataset.remove; if (!title) return; setBusy(true, '正在更新項目…'); try { var method = event.target.dataset.keep ? 'confirmPendingTitleFromUi' : 'rejectPendingTitleFromUi'; var result = await server(method, title); renderUiResult(result); } catch (error) { showToast(error.message); } finally { setBusy(false); } });

      function loadInitialUi() {
        clearTimeout(initialLoadRetryTimer);
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
            setBusy(true, '背景同步仍在執行；現在可以關閉控制臺', true, false);
            pollSyncProgress();
            return;
          }
          setBusy(false);
        }).catch(function (error) {
          if (isTransientInitialLoadError(error)) {
            setBusy(true, '正在等待控制臺完成資料保存…');
            initialLoadRetryTimer = setTimeout(loadInitialUi, INITIAL_LOAD_RETRY_DELAY_MS);
            return;
          }
          showToast(error.message);
          setBusy(false);
        });
      }

      loadInitialUi();
    })();
  </script>
</body>
</html>`;
})();
