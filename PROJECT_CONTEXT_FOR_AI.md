# PROJECT_CONTEXT_FOR_AI

> 本文件說明 T-SCHOOL 課表同步專案相對穩定的產品與架構背景，供涉及相關區域的任務按需查閱。
> 它不取代 `AGENTS.md`，也不是每項任務都必須完整載入的操作指令。
> 目前階段的 UI、互動與產品方向以 `CURRENT_DIRECTION.md` 為準；驗證方式以 `TESTING.md` 為準。
> 若本文件與程式碼、測試或使用者最新要求不一致，應指出差異，不得默認採用較舊內容。

## 專案概覽

本儲存庫包含一個靜態設定產生器，用來產生由使用者自行擁有與部署的 Google Apps Script `Code.gs`。產生的程式會從目前的 T-SCHOOL 課表 API 讀取資料，將選定事件同步至專用 Google Calendar，並在綁定的 Google Sheet 中加入圖形化設定側欄。

公開應用維持免建置：

- 根目錄 `index.html` 重新導向至 `configurator/`。
- `configurator/index.html` 定義安裝器 UI。
- `configurator/styles.css` 實作設計系統。
- `configurator/schedule-data.js` 取得並解析即時課表 API，供安裝器產生課程選項。
- `configurator/sidebar-template.js` 包含嵌入產生程式碼的 HTML Service 設定側欄。
- `configurator/code-template.js` 產生完整 Apps Script 後端。
- `configurator/app.js` 協調安裝器狀態、驗證、API 載入、課程選擇與程式碼產生。

目前公開部署位置：

```text
https://artemas-hsieh.github.io/t-school-schedule-sync/
```

## 執行階段資料來源

已停止使用的 Google Sheet 不是執行階段資料來源。安裝器與產生的 Apps Script 都使用正式 Apps Script `/exec` 部署端點。

目前端點應以程式碼中的正式設定為唯一依據。文件中的網址只能作為背景記錄，不得覆蓋較新的程式碼設定。

年級查詢值為 `一年級`、`二年級`、`三年級`。不得保存重新導向後的 `script.googleusercontent.com` 網址、`user_content_key` 或其他權杖。

## 產品流程

1. 安裝器從 API 載入所選年級，並建立去除重複項目的課程目錄。
2. 使用者選擇課程、是否包含活動或排除個別活動、通知時間、說明格式與提醒設定。
3. 安裝器產生一份 `Code.gs`。
4. 使用者從安裝步驟建立或下載預設控制臺試算表範本，開啟其綁定的 Apps Script 專案，貼上程式碼、儲存並重新載入試算表；所有設定都在安裝後的側欄完成，不要求在儲存格中輸入設定。
5. `行程同步` 自訂選單開啟設定側欄。
6. `儲存並首次同步` 建立或選擇專用的非主要 Calendar，完成第一次同步，僅在成功後啟用觸發條件，並寄送一次設定完成通知。

日常設定變更都在 Google Sheet 側欄中完成，不需要部署 Web App，也不需要外部設定帳號。

## 資料解析與分類

- 課程選項直接由 API 儲存格內容推導，不得恢復舊有大型別名或課程字典。
- 平行課程內容依來源資料的分隔線切分。
- 將標題尾端括號中的地點移除並保存為事件地點。
- 正規化空白與標點，再依完全相同的正規化標題去除重複。
- `MANUAL_MERGE_EXCEPTIONS` 應維持極小範圍，目前為空。
- 年級或全校活動只能依明確活動規則識別；不得因未知標題不在課程字典中就推斷為活動。
- 週次備註列中的明確活動建立為全天 Calendar 事件；來源未提供時間時不得自行創造時間。
- 新發現的來源標題會先納入一次並標記為待檢查。使用者拒絕某標題後，下次同步會排除該標題，並移除所有相同正規化標題的受管理未來事件。
- 設定 schema 3 以 `excludedActivities` 儲存明確的初始活動排除項目。活動預設採 opt-out：新發現的活動會被納入，除非使用者排除該正規化標題。

## 產生的 Apps Script 公開介面

除非已規劃明確遷移，以下公開函式應保持穩定：

- `syncMyScheduleToCalendar()`
- `syncMyScheduleToCalendarWithNotification()`
- `forceFullSyncMyScheduleToCalendar()`
- `setupAutoSyncTriggers()`
- `deleteAutoSyncTriggers()`
- `quickDeleteAllCalendarEvents()`
- `quickDeleteSyncedCalendarEvents()`
- `resetSyncState()`
- `previewParsedEvents()`

綁定的 Google Sheet 另公開 `onOpen()`、`showSettingsSidebar()`、狀態與選單操作，以及側欄使用的私有 `google.script.run` handlers。

## Calendar 同步模型

- 只主動協調今天與未來事件；過去狀態予以保留。
- 來源完全未變更的事件會跳過 Calendar API 讀寫。
- 一般同步在來源 signature 未變更時保留使用者直接對 Calendar 做的修改；強制修復才重新套用來源欄位。
- 來源更新標籤不納入同步 signature，避免無實質內容變化的更新時間造成大量 Calendar 寫入。
- 明確的同標題日期或時間變更，會在 21 天範圍內配對為更新；不明確情況維持分開的新增與取消。
- 偵測到可疑的大量刪除時，自動或來源同步會停止。由使用者確認的設定、初始設定與修復操作可套用已預覽的計畫。
- 切換 Calendar 時，先在新的專用 Calendar 重建事件，再移除舊 Calendar 中的受管理事件。
- 舊版 `SYNC_STATE` 會遷移至分塊儲存。舊版受管理事件 fallback 必須同時具備管理標記、A1 格式來源儲存格與原始內容文字。

## 通知與學期轉換

- 來源變更會寄送一份摘要，包含新增、取消、日期、節次、時間、地點與標題變更，並支援精簡、標準、詳細及自訂變數格式。
- 失敗應立即通知。
- 無變更執行預設不通知，但設定的每日成功摘要時段除外。
- 事件提醒預設關閉，可由使用者設定。
- 推定新學期時，系統暫停觸發條件、保留 Calendar 事件、清除已選課程、寄送一次待處理通知，並要求重新選課後才恢復寫入。

## 狀態與安全模型

- 設定、狀態、通知狀態與受管理事件狀態儲存在 Script Properties；大型 JSON 值會分塊以低於單一屬性限制。
- 一份產生的程式支援一個年級、一個通知信箱與一個專用 Calendar；拒絕使用主要 Calendar。
- 刪除工具只處理已儲存的事件 ID，並驗證管理標記。
- `quickDeleteAllCalendarEvents()` 保持由 `ALLOW_QUICK_DELETE_ALL = false` 停用。
- 使用者輸入透過 `JSON.stringify` 與 U+2028／U+2029 escaping 安全序列化，不得將使用者字串直接串接進可執行程式碼。
- 通知收件者是一個純電子郵件地址；寄信失敗不得掩蓋原始同步失敗。
- 安裝器 CSP 應維持最小權限，只在必要時增加明確來源。

## 部署與快取

`configurator/index.html` 會在每次載入時設定新的 `TSCHOOL_ASSET_VERSION`，並將該查詢值加到下列檔案：

- `styles.css`
- `schedule-data.js`
- `sidebar-template.js`
- `code-template.js`
- `app.js`

目前策略優先確保部署正確，而非瀏覽器快取效率。

## 長期限制

- 公開設定產生器維持靜態、免建置且無外部執行階段依賴。
- Calendar 配額安全與可復原性優先於最大寫入速度。
- 不得還原與任務無關的未提交使用者修改。
- 允許使用者手動更新產生的程式碼；在可行時，已儲存設定與受管理事件狀態應進行遷移。
