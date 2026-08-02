# T-SCHOOL Schedule Sync

T-SCHOOL Schedule Sync 會把你選擇的課程與活動同步到專用 Google Calendar，並在課表調整時更新行程、寄送通知。

[開啟線上設定器](https://artemas-hsieh.github.io/t-school-schedule-sync/)

## 可以做什麼

- 依年級讀取目前課程與活動，讓你選擇要同步的項目。
- 把日期、節次與地點加入專用 Google Calendar。
- 在適用年級與學期補上未來 30 天的課綱內容與實體課程教室。
- 每天約於 03:00、11:00、18:00、21:00 檢查課表並更新 Calendar。
- 預設開啟即時通知；每日成功摘要固定於 06:00。
- 從 Google Docs 行程同步控制臺調整選課、通知、Calendar 與自動同步設定。

## 開始前準備

網站設定可在手機完成，並把設定碼寄給自己；建立 Google Docs 控制臺副本、匯入設定碼與控制臺操作仍需使用電腦。完成後可在手機查看 Calendar 與接收 Email。

你需要可以使用 Google Docs、Google Calendar 與 Apps Script 的 Google 帳號。如果要使用課綱補充，也需要能開啟適用課綱的校內帳號。

請使用只交給 T-SCHOOL Schedule Sync 管理的專用 Calendar，不要使用主要日曆。

## 安裝

### 1. 產生設定碼

1. 開啟線上設定器。
2. 選擇年級，等待課表讀取完成。
3. 選擇課程與活動，填寫通知 Email 與通知偏好。
4. 檢查設定後按下「產生安裝設定碼」。
5. 桌機按下「複製設定碼」；手機按下「寄送設定信」，原生寄信選單會以「設定指引｜T-SCHOOL Schedule Sync」為主旨，預填通知 Email、操作指引、母版連結與設定碼。

設定碼包含 Email 與選課，但不含密碼、Google 權杖或可執行程式。設定碼只是編碼而非加密，請勿分享。

### 2. 建立 Google Docs 控制臺

1. 點擊設定器提供的 Google Docs 母版連結並建立副本。
2. 在副本上方選擇「T-SCHOOL Schedule Sync」→「開啟控制臺介面」。
3. 依 Google 畫面檢查並授予所需權限；完成後再次選擇「開啟控制臺介面」。
4. 貼上「行程同步設定碼」並按下「開啟控制臺」。
5. 若目前 Google 帳號與設定 Email 不同，匯入頁會提醒切換帳號；帳號正確時直接重新驗證設定並開啟控制臺。

母版已預載通用 Apps Script；一般使用者不需要開啟 Apps Script 編輯器或貼上 `Code.gs`。

### 3. 完成首次同步

1. 在自動開啟的控制臺選擇已有的專用 Calendar，或建立一個新的專用 Calendar。
2. 按下「儲存並首次同步」。
3. 保持控制臺開啟，直到畫面明確表示可以關閉。

行程很多時會先完成第一批，再於背景分批處理。可從「T-SCHOOL Schedule Sync」→「查看同步狀態」確認進度。

首次同步前可從控制臺重新匯入網站設定碼；首次同步完成後為保護既有 Calendar 與同步狀態，控制臺不再允許覆寫匯入。

## 日常使用

Google Docs 上方的「T-SCHOOL Schedule Sync」選單提供：

| 操作 | 用途 |
|---|---|
| 開啟控制臺介面 | 修改年級、選課、Calendar、通知與自動同步設定 |
| 立即同步 | 現在檢查課表並更新 Calendar |
| 關閉 / 啟用自動同步 | 關閉或重新啟用每天的自動檢查 |
| 查看同步狀態 | 查看最近結果、背景進度與需要處理的問題 |
| 強制修復 | 重新套用今天以後的來源內容，可能覆蓋手動修改過的受管理行程 |
| 移除受管理事件 | 刪除本工具建立且仍可辨識的 Calendar 行程 |

## 新學期與版本更新

偵測到新學期時，程式會先停止自動改動 Calendar、保留原有行程，並要求重新選課。

舊版 Google Sheet 控制臺可繼續運作，但新版網站暫不提供其更新程式碼。Google Docs 母版自動更新、舊副本遷移與重新接回既有狀態屬於後續工作。

## 開發者：產生母版 Apps Script

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
