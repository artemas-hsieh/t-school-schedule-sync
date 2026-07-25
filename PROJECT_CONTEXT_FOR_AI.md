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

課表的主要執行階段來源仍是正式 Apps Script `/exec` 部署端點；已停止使用的舊課表 Google Sheet 不得恢復為課表來源。

課程大綱是獨立的補充來源。產生的 Apps Script 會依使用者年級與課綱來源組的適用日期，使用該使用者自己的校內 Google 帳號讀取受保護的課綱 Sheets。課綱來源依年級分組；目前只有「114-2 高二」設定四份來源，高一與高三來源陣列為空，因此不會建立課綱觸發器或開啟課綱連結。未來課綱應新增為帶有 `key`、適用日期與 Spreadsheet IDs 的來源組，不得讓舊學期只因月日相同而配對到新學期。

目前端點應以程式碼中的正式設定為唯一依據。文件中的網址只能作為背景記錄，不得覆蓋較新的程式碼設定。

年級查詢值為 `一年級`、`二年級`、`三年級`。不得保存重新導向後的 `script.googleusercontent.com` 網址、`user_content_key` 或其他權杖。

## 產品流程

1. 安裝器從 API 載入所選年級，並建立去除重複項目的課程目錄。
2. 使用者搜尋並選擇課程與活動、排除個別活動，並設定通知 Email 與一至四個通知時間；第一個時段同時作為每日成功摘要時間。說明格式、提醒等未顯示於安裝器的選項先採預設值，安裝後可由側欄調整。
3. 安裝器產生一份 `Code.gs`。
4. 使用者從安裝步驟建立或下載預設控制臺試算表範本，開啟其綁定的 Apps Script 專案，貼上程式碼、儲存並重新載入試算表；所有設定都在安裝後的側欄完成，不要求在儲存格中輸入設定。
5. `行程同步` 自訂選單開啟設定側欄。
6. `儲存並首次同步` 建立或選擇專用的非主要 Calendar；新日曆可自行命名，預設為「{年級}行程｜T-SCHOOL Schedule Sync」。第一次同步顯示預估時間，並以後端實際階段與已處理事件數回報進度；僅在成功後啟用觸發條件並寄送一次設定完成通知。

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
- 設定 schema 3 以 `excludedActivities` 儲存明確的初始活動排除項目。活動預設採 opt-out：新發現的活動會被納入，除非使用者排除該正規化標題；若安裝器中所有活動都取消選取，另以 `includeActivities: false` 保存「完全不含活動」的明確意圖，新發現活動也不得自動加入。

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

- 只主動協調今天與未來事件；過去的 Calendar 行程不改不刪，內部索引則只保留最近 120 天，以免長期占滿 Script Properties。
- 正式同步採可續傳工作單：每批最多 40 次 Calendar 操作並設 150 秒軟上限，批次前保存 `inFlight`，批次後提交事件狀態；未完成時只保留一個 continuation trigger。
- Calendar 建立前以日期範圍與說明中的同步識別碼查找既有受管理事件。找到一筆就接回 ID，找到多筆則停止；此機制處理 Calendar 已寫入但狀態尚未提交的硬逾時窗口。
- 設定儲存與同步共用 Script Lock；未完成的 Calendar 搬移結束前禁止再次更換目標，避免雙分頁或連續搬移破壞狀態。
- 每次續傳均比對完整課表、設定、目標 Calendar、課綱版本與應有事件指紋。輸入漂移時由已提交狀態重新規劃，不沿用過時操作清單。
- 主同步第一次暫時失敗保存進度並重試一次，下一次仍失敗才寄信；watchdog 亦採相同的連續兩次失敗規則。
- 每日觸發器只指定小時、不固定分鐘，讓 Apps Script 在該小時內為各安裝者選擇分散且每日一致的時間，降低多人整點尖峰。
- 課綱只以課表的原始課程名稱一字不差對應工作表分頁名稱，再以日期與節次起訖配對；不得使用分頁內「中文名稱」、標題正規化或模糊比對作 fallback。
- 課綱找不到精確分頁時可回報只差空白／全形字元的近似名稱，但不得自動套用；跨校課程不列入缺頁錯誤。
- 行事曆同步本身不直接開啟課綱 Sheets，只讀取最後成功快照。課綱每日獨立刷新，第一次失敗於約 30 分鐘後重試，第二次仍失敗才寄信；硬逾時由預先建立的 watchdog 接手。
- 課綱快照只保存已選且落在今天至第 30 天（含頭尾）的同步課程。純非同步列略過；同時具有實體或線上同步時數的混合列保留。整學期基本行程仍照常同步，不受 30 天課綱視窗影響。
- 課綱只補入事件說明中的 `實體課程教室`、`單元主題`、`課程內容`，不覆蓋 Calendar 地點。只有課綱變更時只更新 description，不列入課表異動通知。
- 來源完全未變更的事件會跳過 Calendar API 讀寫。
- 一般同步在來源 signature 未變更時保留使用者直接對 Calendar 做的修改；強制修復才重新套用來源欄位。
- 來源更新標籤不納入同步 signature，避免無實質內容變化的更新時間造成大量 Calendar 寫入。
- 明確的同標題日期或時間變更，會在 21 天範圍內配對為更新；不明確情況維持分開的新增與取消。
- 偵測到可疑的大量刪除時，自動同步與強制修復會停止。設定變更只有在實際寫入前仍符合剛才預覽所產生的確認 token 時才能套用大量刪除；來源或設定改變後 token 即失效。
- 切換 Calendar 時，先在新的專用 Calendar 重建事件，再移除舊 Calendar 中的受管理事件。
- 舊版 `SYNC_STATE` 會遷移至分塊儲存。舊版受管理事件 fallback 必須同時具備管理標記、A1 格式來源儲存格與原始內容文字。

## 通知與學期轉換

- 來源變更會寄送一份摘要，包含新增、取消、日期、節次、時間、地點與標題變更，並支援精簡、標準、詳細及自訂變數格式。
- 權限、資料結構、名稱碰撞、大量刪除等需處理的錯誤應立即通知；暫時性的 Google 服務錯誤或逾時先延後重試一次，下一次仍失敗才通知。
- 無變更執行預設不通知，但設定的每日成功摘要時段除外。
- 事件提醒預設關閉，可由使用者設定。
- 推定新學期時，系統暫停觸發條件、保留 Calendar 事件、清除已選課程、寄送一次待處理通知，並要求重新選課後才恢復寫入。

## 狀態與安全模型

- 設定、狀態、通知狀態、受管理事件狀態與課綱最後成功快照儲存在 Script Properties；大型 JSON 會依 UTF-8 位元組切成每塊至多 7,500 bytes。事件簽章只保存短雜湊、異動明細設上限、超過 120 天的歷史索引會移除，預估總量超過 430 KiB 時停止寫入。課綱快照以版本化 staging 寫入，完整驗證後才切換 active pointer，失敗不得覆蓋上一版。
- 一份產生的程式支援一個年級、一個通知信箱與一個專用 Calendar；拒絕使用主要 Calendar。
- 高負載測試採雙重開關：網站原始碼的 `ENABLE_HIGH_LOAD_TEST_FEATURE` 必須開啟，且產生器 URL 必須帶有 `?highLoadTest=1`，才會把測試函式寫入 `Code.gs`。一般產生器輸出不含測試函式，試算表選單也不顯示測試入口。
- 控制臺不顯示硬編碼的同步時段選項；`autoSyncHours` 沿用安裝器產生值，避免側欄顯示狀態與實際觸發條件不一致。
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
