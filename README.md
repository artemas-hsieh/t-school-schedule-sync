# T-SCHOOL 課表同步

這是一個給 T-SCHOOL 學生使用的課表同步工具。它可以依照你選的年級、課程與同步時間，產生一份 Google Apps Script 程式碼，讓你的 Google 日曆自動跟著學校 Google Sheet 課表更新。

你可以把它想成「課表翻譯器」：

1. 你在網頁上填入 Google Sheet、Google Calendar 和自己的課程。
2. 網頁產生一份 `Code.gs`。
3. 你把 `Code.gs` 貼到自己的 Google Apps Script 專案。
4. Apps Script 讀取課表，幫你把課程、全校活動和調課資訊寫進指定的 Google 日曆。

線上頁面：

```text
https://artemas-hsieh.github.io/t-school-schedule-sync/
```

## 這個工具會做什麼

- 從指定的 Google Sheet 讀取 T-SCHOOL 課表。
- 依照你選的年級和課程，找出屬於你的課程。
- 可選擇是否同步全年級、全校性質活動與重要公告。
- 在你指定的 Google Calendar 裡建立或更新事件。
- 發現調課通知時，可寄 Email 通知你。
- 可設定每天固定時間自動同步。

## 這個工具不會做什麼

- 網頁本身不需要登入，也沒有自己的後端伺服器。
- 網頁不會把你輸入的 Calendar ID、通知 Email 或課程選擇傳到作者的伺服器。
- 網頁不會直接改你的 Google 日曆；真正修改日曆的是你自己 Google 帳號裡執行的 Apps Script。
- 這不是 Google 官方工具，也不是學校官方系統的一部分，除非學校另有公告。

## 適合誰使用

- 想把 T-SCHOOL 課表同步到 Google Calendar 的學生。
- 願意依照步驟建立 Google Apps Script 專案的人。
- 願意使用「專用日曆」的人。

如果你完全不確定 Google 帳號授權是什麼，請先請同學、老師或懂資訊的人陪你看一次。這不是因為你不會，而是因為日曆權限真的值得小心。

## 使用前請先準備

你需要：

- 可以讀取課表 Google Sheet 的 Google 帳號。
- 一個專用 Google Calendar。
- 你的年級與課程清單。
- 如果要收到通知，一個通知用 Email。

強烈建議先建立「專用日曆」，不要直接使用自己的主要日曆。原因很簡單：如果設定錯誤，專用日曆比較容易檢查、清除或重建，不會影響你原本的重要行程。

## 快速開始

1. 打開線上頁面。
2. 確認或貼上 Google Sheets URL。
3. 填入表格分頁名稱。
4. 填入 Calendar ID。
5. 選擇年級。
6. 選擇要同步的課程。
7. 選擇每日同步時間。
8. 如需通知，填入通知 Email。
9. 複製右側產生的 `Code.gs`。
10. 前往 `https://script.google.com/` 建立新專案。
11. 刪掉預設程式碼，貼上 `Code.gs`，儲存。
12. 執行 `syncMyScheduleToCalendar`，依照 Google 畫面授權。
13. 到你的專用 Google Calendar 檢查結果。
14. 確認沒問題後，執行 `setupAutoSyncTriggers` 建立每日自動同步。

## 如何取得 Calendar ID

1. 打開 Google Calendar。
2. 左側找到你新建的專用日曆。
3. 點日曆旁邊的選單，進入設定。
4. 找到「整合日曆」區塊。
5. 複製「日曆 ID」。

常見格式可能像：

```text
example@gmail.com
```

或：

```text
xxxxxxxxxxxxxxxxxxxx@group.calendar.google.com
```

## Apps Script 會要求哪些權限

Google 可能會要求你允許 Apps Script：

- 讀取指定的 Google Sheet。
- 讀取與修改指定的 Google Calendar。
- 建立定時觸發器，讓它每天自動同步。
- 寄送同步成功、失敗或調課通知 Email。

請只在你信任這份程式碼、也確定自己填的是專用日曆時授權。

## 產生的主要函式

在 Apps Script 裡，你會看到幾個可以手動執行的函式：

- `syncMyScheduleToCalendar()`：同步課表到日曆，通常第一次執行它。
- `syncMyScheduleToCalendarWithNotification()`：同步後寄成功通知。
- `forceFullSyncMyScheduleToCalendar()`：強制檢查日曆事件，適合你手動刪過或改過事件後修復。
- `setupAutoSyncTriggers()`：建立每天自動同步。
- `deleteAutoSyncTriggers()`：刪除每天自動同步。
- `quickDeleteSyncedCalendarEvents()`：刪除本工具同步出來的未來事件。
- `quickDeleteAllCalendarEvents()`：刪除指定日曆中大範圍事件，預設不能使用，除非你手動開啟危險開關。
- `resetSyncState()`：清除同步狀態記錄。
- `previewParsedEvents()`：在 Apps Script 日誌中預覽解析結果，較適合除錯。

## 很重要的安全提醒

請把這三句話記起來：

1. 請使用專用日曆。
2. 不要把自己的 Apps Script 專案分享給不需要的人。
3. 不要把含有私人 Calendar ID 或 Email 的 `Code.gs` 貼到公開地方。

更多安全說明請看 [SECURITY.md](SECURITY.md)。

## 使用協議

使用本工具前，請閱讀 [TERMS_OF_USE.md](TERMS_OF_USE.md)。

簡短版是：

- 你必須自己確認有權讀取課表資料。
- 你必須自己確認 Google Calendar 設定正確。
- 這個工具盡力避免誤刪，但不保證完全不出錯。
- 請用專用日曆來降低風險。

## 專案結構

```text
.
├── index.html
├── README.md
├── SECURITY.md
├── TERMS_OF_USE.md
└── configurator/
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── code-template.js
    └── gemini-code-1778375297203.js
```

各檔案用途：

- `index.html`：把使用者導向 `configurator/`。
- `configurator/index.html`：設定器的網頁結構。
- `configurator/styles.css`：畫面樣式。
- `configurator/app.js`：表單、課程選擇、欄位驗證與產生程式碼。
- `configurator/code-template.js`：產生最終 Apps Script `Code.gs`。
- `configurator/gemini-code-1778375297203.js`：課程名稱與全校活動對照表。

## 開發者資訊

這個專案是純靜態網頁，沒有 npm、打包工具或後端服務。修改後可直接用瀏覽器開啟 `index.html` 或用任意靜態伺服器預覽。

常用檢查：

```bash
node --check configurator/code-template.js
node --check configurator/app.js
git diff --check
```

若修改 `code-template.js`，建議再產生一次 `Code.gs`，確認產生的 Apps Script 語法仍然有效。

## 資料與隱私摘要

網頁端：

- 使用者輸入留在瀏覽器裡。
- 網頁沒有自己的資料庫。
- 網頁沒有登入系統。
- 網頁會載入同一個網站下的 HTML、CSS、JS。

Apps Script 端：

- 在使用者自己的 Google 帳號中執行。
- 會讀取指定的 Google Sheet。
- 會建立、更新或刪除指定 Google Calendar 裡的同步事件。
- 會在 Apps Script Properties 儲存同步狀態，例如事件 ID 與課程同步資訊。
- 如設定通知，會透過 Google MailApp 寄信。

## 已知限制

- 如果課表格式大幅改變，解析可能失敗或漏掉事件。
- 如果你直接在 Google Calendar 手動修改同步事件，一般同步不一定會修復；可執行 `forceFullSyncMyScheduleToCalendar()`。
- Google Calendar 有使用量限制，短時間大量同步可能被暫時限制。
- 預設 Google Sheets URL 是否能讀取，取決於該 Sheet 的分享權限。

## 問題回報

如果遇到一般錯誤，可以在 GitHub repository 開 issue，請描述：

- 你選的年級。
- 大概是哪一門課或哪一週出問題。
- 你執行的是哪個 Apps Script 函式。
- Apps Script 顯示的錯誤訊息。

請不要公開貼出你的完整 Calendar ID、私人 Email、Google Sheet 權限截圖，或任何可以辨識個人的資訊。
