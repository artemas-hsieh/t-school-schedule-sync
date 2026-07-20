# T-SCHOOL 課表同步

T-SCHOOL 課表同步是一個純靜態設定器，會依使用者的年級、選課與偏好產生一份 Google Apps Script `Code.gs`。程式在使用者自己的 Google 帳號中執行，從目前的課表 API 讀取資料，並同步至專用 Google 日曆。

線上設定器：

<https://artemas-hsieh.github.io/t-school-schedule-sync/>

## 功能

- 直接從課表 API 載入一、二、三年級資料，動態產生去重後的課程選單。
- 同步選定課程、年級活動與全校活動到專用 Google Calendar。
- 比對新增、取消、改名、日期、節次、時間與地點變更，視設定寄送 Email 摘要。
- 支援每日自動同步、每日狀態摘要、事件提醒、說明格式與進階自訂變數。
- 安裝後可從 Google Sheet 的「課表同步」選單與側邊欄調整設定，不需再回 Apps Script 編輯器。
- 一般同步保留使用者對日曆事件的手動編輯；必要時可使用「強制修復」重新套用來源資料。
- 偵測新學期後會暫停寫入、保留已有事件，並要求使用者重新選課。

## 安裝

### 1. 產生程式碼

1. 開啟線上設定器。
2. 選擇年級，等待課程資料載入。
3. 選擇課程、活動、同步時間、通知與日曆說明格式。
4. 複製右側產生的完整 `Code.gs`。

### 2. 建立 Google Sheet 控制台

1. 建立一份空白 Google Sheet。
2. 在試算表中開啟「擴充功能」→「Apps Script」。
3. 刪除編輯器中的範例內容，貼上 `Code.gs` 並儲存。
4. 回到試算表並重新整理頁面。
5. 從上方「課表同步」→「開啟設定」進入側邊欄。

### 3. 完成首次同步

1. 確認年級、課程與通知 Email。
2. 選擇已有的專用日曆，或讓程式自動建立。主要日曆不能使用。
3. 按「儲存並首次同步」，依 Google 畫面完成授權。
4. 到專用日曆抽查課程、日期、時間與地點。首次同步成功後，程式才會啟用自動觸發器並寄出設定完成通知。

## 使用與安全

網頁本身沒有帳號系統、後端或資料庫，不會直接修改日曆。實際讀取 API、寫入日曆、儲存同步狀態與寄信的是使用者 Google 帳號內的 Apps Script。

請務必：

- 使用只供本工具管理的專用日曆。
- 首次同步後人工對照學校資料，不要將本工具當成唯一課表來源。
- 不要公開 Apps Script 專案、通知 Email、Calendar ID 或含個人設定的程式碼。
- 在授權前確認 Google 帳號與權限範圍。

完整說明請閱讀 [SECURITY.md](SECURITY.md) 與 [TERMS_OF_USE.md](TERMS_OF_USE.md)。

## 設定後操作

Google Sheet 的「課表同步」選單提供：

- 開啟設定
- 立即同步
- 暫停／恢復自動同步
- 查看同步狀態
- 強制修復
- 移除受管理事件

產生程式仍保留 `syncMyScheduleToCalendar()`、`forceFullSyncMyScheduleToCalendar()`、`setupAutoSyncTriggers()` 與 `deleteAutoSyncTriggers()` 等公開函式，供進階操作或除錯使用。

## 資料來源與限制

- 執行階段使用固定的 Google Apps Script API 部署網址；不使用已停止更新的舊 Google Sheet。
- 課程選單由 API 即時解析、清理與去重，不依賴大型課程別名字典。
- 課表格式、API 部署、Google 服務或帳號額度變更都可能使同步失敗。
- 來源故障、資料格式異常、學期不明或可疑的大量刪除會中止自動寫入，以保留日曆現狀。

## 專案結構

```text
.
├── index.html
├── README.md
├── SECURITY.md
├── TERMS_OF_USE.md
├── UI_EXPLORATION_BRIEF.md
├── MVP_IMPLEMENTATION_PLAN.md
├── PROJECT_CONTEXT_FOR_AI.md
├── archive/
│   └── visual-design-material3/
├── configurator/
│   ├── index.html
│   ├── styles.css
│   ├── schedule-data.js
│   ├── sidebar-template.js
│   ├── code-template.js
│   └── app.js
└── tests/
    └── smoke-test.js
```

`1Campus/` 只是本地資料比對與逆向分析素材，不是執行階段資料來源，也不納入版本控制。

`UI_EXPLORATION_BRIEF.md` 是下一輪設定器 UI 概念的生效指引。`archive/visual-design-material3/` 保留舊版嚴格 Material 3 規範，供方向確認後逐項校正，目前不是視覺指令來源。

## 本地開發

專案無 npm、無打包工具、無後端。由於設定器需讀取線上 API，建議用本地靜態伺服器開啟：

```bash
python3 -m http.server 8765
```

然後前往 <http://127.0.0.1:8765/configurator/>。

執行完整煙霧測試：

```bash
node tests/smoke-test.js
git diff --check
```

測試會檢查前端 JavaScript 語法、三個年級的 API 資料解析、設定器與 Apps Script 的解析結果一致性，以及最終產生的 `Code.gs` 語法。實際 Google Calendar 寫入、寄信、授權與觸發器仍需在 Google 帳號中進行整合測試。

## 問題回報

請在 GitHub repository 建立 issue，附上年級、課程或週次、執行動作與完整錯誤訊息。請勿公開 Calendar ID、私人 Email、授權畫面或其他可識別個人的資料。
