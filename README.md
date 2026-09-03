# T-SCHOOL Schedule Sync

T-SCHOOL Schedule Sync 會把你選擇的行程同步到你擁有的 Google Calendar，並在課表調整時更新行程、寄送通知。

[開啟線上設定器](https://artemas-hsieh.github.io/t-school-schedule-sync/)

## 可以做什麼

- 依年級讀取目前行程，讓你選擇要同步的項目。
- 把日期、節次與地點加入你選擇的 Google Calendar。
- 在適用年級與學期補上未來 30 天的課綱內容與實體課程教室。
- 每天以 03:00、11:00、18:00、21:00 為中心，在各自前後一小時內分散檢查課表並更新 Calendar。
- 預設開啟即時通知；每日成功摘要固定於 06:00。
- 從 Google Docs 行程同步控制臺調整行程選擇、通知、Calendar 與自動同步設定。
- 受管理行程疑似被手動刪除時先自動補回，再透過 Email 提醒你到控制臺刪除單一事件，或確認刪除整門課程 / 活動。

## 開始前準備

網站設定可在手機完成，並把設定碼寄給自己；建立 Google Docs 控制臺副本、匯入設定碼與控制臺操作仍需使用電腦。完成後可在手機查看 Calendar 與接收 Email。

你需要可以使用 Google Docs、Google Calendar 與 Apps Script 的 Google 帳號。如果要使用課綱補充，也需要能開啟適用課綱的校內帳號。

你可以使用主要日曆、其他自己擁有的日曆，或讓控制臺建立新的專用 Calendar。程式只會管理由這份控制臺建立並帶有專屬隱藏標記的事件。

## 安裝

### 1. 產生設定碼

1. 開啟線上設定器。
2. 選擇年級，等待課表讀取完成。
3. 選擇要同步的課程與活動，填寫通知 Email 與通知偏好。清單在有寒暑假項目時分成「學期間課程與活動」與「寒暑假期間課程與活動」，並將標題相近的選項排在一起；「全校」、學習分享會、補假／補課、節假日與模考／模擬考相關選項預設勾選並排在各期間最後。搜尋只縮小清單，不改變原本順序。
4. 檢查設定後按下「產生設定碼」。
5. 桌機按下「複製設定碼」；手機按下「寄送設定信」，原生寄信選單會以「設定指引｜T-SCHOOL Schedule Sync」為主旨，預填通知 Email、操作指引、母版連結與設定碼。

設定碼包含 Email 與行程選擇，但不含密碼、Google 權杖或可執行程式。設定碼只是編碼而非加密，請勿分享。

### 2. 建立 Google Docs 控制臺

1. 點擊設定器提供的 Google Docs 母版連結並建立副本。
2. 在副本上方選擇「T-SCHOOL Schedule Sync」→「開啟控制臺介面」。
3. 依 Google 畫面檢查並授予所需權限；完成後再次選擇「開啟控制臺介面」。
4. 貼上「設定碼」並按下「開啟控制臺」。
5. 若目前 Google 帳號與設定 Email 不同，匯入頁會提醒切換帳號；帳號正確時直接重新驗證設定並開啟控制臺。

母版已預載通用 Apps Script；一般使用者不需要開啟 Apps Script 編輯器或貼上 `Code.gs`。

### 3. 完成首次同步

1. 在自動開啟的控制臺選擇主要日曆、其他自己擁有的 Calendar，或建立一個新的專用 Calendar。
2. 按下「儲存並首次同步」。
3. 保持控制臺開啟，直到畫面明確表示可以關閉。

行程很多時會先完成第一批，再於背景分批處理。可從「T-SCHOOL Schedule Sync」→「查看同步狀態」確認進度。

首次同步前可從控制臺重新匯入設定碼；首次同步完成後為保護既有 Calendar 與同步狀態，控制臺不再允許覆寫匯入。

## 日常使用

Google Docs 上方的「T-SCHOOL Schedule Sync」選單提供：

| 操作 | 用途 |
|---|---|
| 開啟控制臺介面 | 修改年級、行程選擇、Calendar、通知與自動同步設定 |
| 立即同步 | 現在檢查課表並更新 Calendar |
| 關閉 / 啟用自動同步 | 關閉或重新啟用每天的自動檢查 |
| 查看同步狀態 | 查看最近結果、背景進度與需要處理的問題 |
| 強制修復 | 重新套用今天以後的來源內容，可能覆蓋手動修改過的受管理行程 |
| 移除受管理事件 | 刪除本工具建立且仍可辨識的 Calendar 行程 |

若你直接在 Google Calendar 刪除仍在課表中的受管理行程，系統會在下次同步先補回，並寄信提醒。請用電腦開啟行程同步控制臺，在「同步狀態」區段選擇「刪除單一事件」或「刪除整門課程 / 活動」。刪除單一事件會直接執行；刪除整門課程 / 活動時會再要求確認。這些動作只處理本控制臺已記錄且管理標記相符的事件，同日曆中的私人事件不會受影響。

## 新學期與版本更新

偵測到新學期時，程式會先停止自動改動 Calendar，並要求重新確認年級與行程選擇。請依序：

1. 開啟控制臺，若已升年級，先切換至新學期實際就讀年級。
2. 勾選「我已確認這是新學期就讀年級」。
3. 重新選擇至少一項行程。
4. 選擇「完成選擇並同步」，檢查新增、調整、取消與未變更的預覽結果後再確認。

完成新學期同步前，現有 Calendar 行程不會被改動；同步後，未出現在新行程選擇中的未來行程會依預覽結果更新或移除，過去行程仍會保留。若自動同步原本關閉，這次手動同步仍會另外排定一次課綱更新；之後要再次更新，需再執行手動同步。

舊版 Google Sheet 控制臺可繼續運作，但新版網站暫不提供其更新程式碼。Google Docs 母版自動更新、舊副本遷移與重新接回既有狀態屬於後續工作。

## 開發者：產生母版 Apps Script

本機開發網站時，先安裝開發依賴，再啟動即時預覽：

```bash
npm install
npm run dev
```

預設開啟 `http://127.0.0.1:5173/`；修改 HTML、CSS 或 JavaScript 後，瀏覽器會自動更新。本機開發伺服器會加入 Vite HMR 所需的 WebSocket 權限，但不會改寫原始 `index.html` 的正式 CSP。Vite 只是本機開發依賴，正式網站仍直接使用根目錄的靜態檔案，不需要 `npm run build` 才能發布。

通用母版程式由無外部依賴的 Node 工具產生。Email manifest 必須使用已發布且固定到 40 字元 commit 的 raw GitHub URL；未提供時 production artifact 不會產生。

```bash
node scripts/generate-google-docs-control-panel.js \
  --manifest-url https://raw.githubusercontent.com/OWNER/REPO/COMMIT/notification-email-templates.json
```

預設會在忽略版控的 `outputs/google-docs-control-panel/` 同時輸出 `Code.gs` 與 `appsscript.json`。母版必須安裝兩者，才能以 `@OnlyCurrentDoc`、`documents.currentonly`、`spreadsheets.readonly` 與 manifest 啟用的 Sheets v4 進階服務限制 Google Docs 與課綱 Sheets 權限。不要把課綱讀取改回 `SpreadsheetApp.openById()`；該方法會要求完整 Sheets 權限。只有開發者明確加入 `--test-build` 時才會包含高負載測試入口。

## 使用限制

- 這不是學校官方系統，不能取代課表、課網或教師公告。
- 課表來源、Google 服務或帳號額度異常時，同步可能延遲或停止。
- 第一次同步後請人工抽查 Calendar 的年級、日期、節次與地點。
- 本地測試無法證明 Google 授權、腳本隨 Docs 副本複製、觸發器與背景續跑等雲端行為。

## 安全、隱私與詳細說明

請閱讀 [安全與隱私說明](SECURITY.md) 與 [同步機制說明](SYNC_MECHANISM.md)。

遇到問題可在 [GitHub 專案頁面](https://github.com/artemas-hsieh/t-school-schedule-sync/issues) 回報。請勿公開通知 Email、Calendar ID、授權畫面或完整設定碼。
