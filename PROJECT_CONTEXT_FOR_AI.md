# PROJECT_CONTEXT_FOR_AI

> 本文件說明 T-SCHOOL 課表同步專案相對穩定的產品與架構背景，供涉及相關區域的任務按需查閱。
> 它不取代 `AGENTS.md`，也不是每項任務都必須完整載入的操作指令。
> 目前階段的 UI、互動與產品方向以 `CURRENT_DIRECTION.md` 為準；驗證方式以 `TESTING.md` 為準。
> 若本文件與程式碼、測試或使用者最新要求不一致，應指出差異，不得默認採用較舊內容。

## 專案概覽

本儲存庫包含一個靜態安裝設定器。網站產生版本化設定碼，使用者將設定碼匯入已預載通用 Apps Script 的 Google Docs 母版副本；通用程式會讀取 T-SCHOOL 課表 API、同步至專用 Google Calendar，並在綁定的 Google Docs 中提供設定側欄。

公開應用維持免建置，GitHub Pages 根網址直接載入設定器：

- 根目錄 `index.html` 定義安裝器 UI。
- 根目錄 `styles.css` 實作設計系統。
- 根目錄 `schedule-data.js` 取得並解析即時課表 API，供安裝器產生課程選項。
- 根目錄 `setup-code.js` 定義網站與 Apps Script 共用的設定碼格式。
- 根目錄 `sidebar-template.js` 與 `setup-dialog-template.js` 分別包含設定側欄與首次匯入對話框。
- 根目錄 `code-template.js` 產生 Google Docs 母版使用的通用 Apps Script 後端。
- `scripts/generate-google-docs-control-panel.js` 將後端與兩個 HTML 介面合成忽略版控的 `outputs/google-docs-control-panel/Code.gs`，並同時產生明確限制權限的 `appsscript.json`。
- 根目錄 `notification-email-templates.json` 是所有通知共用的公開 HTML Email 版型 manifest。
- 根目錄 `app.js` 協調安裝器狀態、驗證、API 載入、課程選擇與設定碼產生。

目前公開部署位置：

```text
https://artemas-hsieh.github.io/t-school-schedule-sync/
```

## 執行階段資料來源

課表的主要執行階段來源仍是正式 `https://script.google.com/macros/s/.../exec` 部署端點；通用程式產生器拒絕其他網域、查詢參數及重新導向後含權杖的 `script.googleusercontent.com` 網址。已停止使用的舊課表 Google Sheet 不得恢復為課表來源。

課程大綱是獨立的補充來源。每份產生的 Apps Script 會先讀取中央 Google Sheet「課綱來源索引｜T-SCHOOL Schedule Sync」的 `課綱來源` 分頁，再依使用者年級與來源組適用日期，使用該使用者自己的校內 Google 帳號讀取受保護的課綱 Sheets。索引依欄名讀取 `啟用`、`來源組鍵`、`課綱名稱`、`年級`、`適用起日`、`適用迄日`、`課綱試算表連結`；`備註` 是選填的人工作業欄位，程式不依賴它。目前不設 `索引資訊` 分頁。

索引讀取成功後會在各安裝者的 Script Properties 保存最後成功版本；中央索引暫時失敗時沿用該版本，從未成功讀取時才使用產生程式內建的 114-2 高二來源。第一次成功讀取只建立基準，不寄通知；之後成功讀到不同內容時，只在變動涉及安裝者當學期或下一學期時寄送通知，高三下不再外推。完全不相關的學期變動不寄信。通知依學期分組，並以橘色「-」與綠色「+」逐列呈現移除／取消啟用及新增的課綱，同時保留純文字摘要與整份索引的新舊指紋；寄送失敗則保留待寄狀態並在下次成功讀取時重試。新增學期只需在中央索引增加或啟用同一來源組的各份課綱列，不必重新產生舊的 `Code.gs`。來源組不得讓舊學期只因月日相同而配對到新學期。

目前端點應以程式碼中的正式設定為唯一依據。文件中的網址只能作為背景記錄，不得覆蓋較新的程式碼設定。

年級查詢值為 `一年級`、`二年級`、`三年級`。不得保存重新導向後的 `script.googleusercontent.com` 網址、`user_content_key` 或其他權杖。

## 產品流程

1. 安裝器從 API 載入所選年級，並建立去除重複項目的課程目錄。
2. 使用者搜尋並選擇課程與活動、排除個別活動，並設定通知 Email 與通知偏好。「即時通知」預設開啟，偵測到行程調整並完成 Calendar 同步後盡快寄出，每日成功摘要固定 06:00；關閉後可設定一至四個通知時間，最後一個時段兼作每日成功摘要。課表偵測與 Calendar 同步固定於每日 03:00、11:00、18:00、21:00，與通知設定彼此獨立。活動提醒等未顯示於安裝器的選項先採預設值，安裝後可由側欄調整；事件說明格式固定使用標準格式。
3. 安裝器產生 `TSCHOOL_SETUP_V1.<Base64URL JSON>.<FNV-1a checksum>` 設定碼。Payload 包含版本、產生時間、產生器版本、年級、學期與來源指紋、選課與活動設定、通知 Email、即時通知、一至四個通知時間，以及供首次控制臺顯示使用的日期與課程分類摘要；不包含完整課表事件、Calendar ID、API URL、測試開關、權杖或可執行內容。設定碼上限 32 KiB，checksum 只檢查複製完整性，並非加密或信任機制。
4. 使用者在電腦建立 Google Docs 母版副本，從 `T-SCHOOL Schedule Sync` 選單開啟控制臺；入口會先以 `ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL)` 要求 manifest 中既定的最小權限，授權完成後才讀取設定並顯示單頁匯入對話框。使用者貼上「行程同步設定碼」並直接開啟控制臺。新版設定碼先以內嵌的小型來源摘要驗證欄位，避免匯入時再次等待課表 API；舊版設定碼仍會即時讀取來源。第一次 Calendar 同步前一定重新讀取最新課表並再次套用 sanitizer；同學期來源變動時保留仍有效的選項，跨學期則在寫入前拒絕。若 Apps Script 能取得目前 Google 帳號，且與設定碼中的通知 Email 不同，匯入頁顯示帳號切換提醒並停止保存，待帳號正確後再繼續。
5. 匯入只保存設定與初次控制臺顯示所需的小型來源快照，不建立 Calendar、觸發器或同步工作；完成後開啟設定側欄，讓使用者選擇或建立專用 Calendar。來源快照避免側欄再次等待課表 API 或中央課綱索引，首次同步完成後即清除。首次同步前可重新匯入；`setupComplete=true` 後禁止覆寫設定碼。
6. `儲存並首次同步` 先以獨立 Apps Script 執行讀取未來 30 天課綱並計時；在 60 秒內完成時先發布快照，讓第一批 Calendar 事件直接帶入課綱，超時或失敗則不阻擋基本行程，改由背景工作補上。第一次同步顯示預估時間，並以後端實際階段與已處理事件數回報進度；基本行程成功寫入後啟用觸發條件並只寄送一次「行程同步設定完成」通知。

網站設定步驟可在手機完成；手機或只有粗指標的裝置以「寄送設定信」為唯一主要動作，透過原生寄信選單把純文字設定碼、Google Docs 母版連結與操作指引寄到設定的 Email，不另顯示複製備援或母版連結。信件主旨固定為「設定指引｜T-SCHOOL Schedule Sync」；若 `mailto:` 過長則改用系統分享設定檔，無法分享時下載純文字檔。建立 Google Docs 副本、匯入與控制臺操作仍只支援電腦版；日常設定變更都在 Google Docs 側欄中完成，不需要部署 Web App 或外部設定帳號。

## 資料解析與分類

- 課程選項直接由 API 儲存格內容推導，不得恢復舊有大型別名或課程字典。
- 平行課程內容依來源資料的分隔線切分。
- 將標題尾端括號中的地點移除並保存為事件地點。
- 正規化空白與標點，再依完全相同的正規化標題去除重複。
- `MANUAL_MERGE_EXCEPTIONS` 應維持極小範圍，目前為空。
- 年級或全校活動採兩層規則識別：符合明確活動關鍵字，或在整份課表中合計少於 5 個同步節數。跨節儲存格依 `rowSpan` 計算；剛好 5 節仍保留為課程。不得只因未知標題不在課程字典中就推斷為活動。
- 週次備註列中符合上述活動規則的項目建立為全天 Calendar 事件；來源未提供時間時不得自行創造時間。
- 新發現的來源標題會先納入一次並標記為待檢查。使用者拒絕某標題後，下次同步會排除該標題，並移除所有相同正規化標題的受管理未來事件。
- 設定 schema 7 以 `excludedActivities` 儲存明確的初始活動排除項目，並以 `setupImportedAt`、`setupCodeVersion` 記錄設定碼匯入；`setupComplete` 仍只表示首次 Calendar 同步是否完成。活動預設採 opt-out：新發現的活動會被納入，除非使用者排除該正規化標題；若安裝器中所有活動都取消選取，另以 `includeActivities: false` 保存「完全不含活動」的明確意圖，新發現活動也不得自動加入。

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

綁定的 Google Docs 另公開 `onOpen()`、`showSettingsSidebar()`、`showSetupImportDialog()`、`importSetupCodeFromUi(code)`，並保留相容用的 `previewSetupCodeForUi(code)`、`applySetupCodeFromUi(code, confirmationToken)`、狀態與選單操作，以及側欄使用的 `google.script.run` handlers。容器 UI 與 URL 一律經 `getControlPanelUi_()`／`getControlPanelUrl_()` 使用 `DocumentApp`；控制臺初次呈現只讀既有課綱索引快照或內建 fallback，不同步開啟中央索引試算表。正式課綱更新使用 manifest 啟用的 Sheets v4 進階服務與 `spreadsheets.readonly` scope；不得改用只接受完整 Sheets scope 的 `SpreadsheetApp.openById()`。

## Calendar 同步模型

- 使用者從控制臺建立專用 Calendar，或首次同步自動建立 Calendar 時，一律以 `selected: true` 建立，使新 Calendar 預設顯示在 Google Calendar 介面中。
- 只主動協調今天與未來事件；過去的 Calendar 行程不改不刪，內部索引則只保留最近 120 天，以免長期占滿 Script Properties。
- 正式同步採可續傳工作單：首次設定的第一批最多 40 次 Calendar 操作，確認可安全寫入後，後續每批最多 80 次；所有批次皆設 150 秒軟上限，批次前保存 `inFlight`，批次後提交事件狀態，未完成時只保留一個 continuation trigger。第一次同步的課綱預讀使用另一個 Apps Script 執行，不占用這 150 秒 Calendar 批次預算；60 秒內完成時第一批直接帶入課綱，否則改由背景工作補上。首次設定通知只寄一次：行程較多時在至少 40 次 Calendar 操作安全保存後寄送「行程同步設定完成｜T-SCHOOL Schedule Sync」，行程較少而直接完成時則在全部基本行程寫入後寄送；背景批次全部完成後不再重複寄信。
- Calendar 建立前以日期範圍與說明中的同步識別碼查找既有受管理事件。找到一筆就接回 ID，找到多筆則停止；此機制處理 Calendar 已寫入但狀態尚未提交的硬逾時窗口。
- 日期改動配對會先依正規化課名分桶，再只在同課名的未配對舊事件中尋找 21 日內唯一最近項目；等距時仍不得任選。這保留原本貪婪順序與刪除順序，同時避免每筆新事件掃描、排序所有其他課名的舊事件。
- 設定儲存與同步共用 Script Lock；未完成的 Calendar 搬移結束前禁止再次更換目標，避免雙分頁或連續搬移破壞狀態。
- 每次續傳均比對完整課表、設定、目標 Calendar、課綱版本與應有事件指紋。輸入漂移時由已提交狀態重新規劃，不沿用過時操作清單。
- 主同步第一次暫時失敗保存進度並重試一次，下一次仍失敗才寄信；watchdog 亦採相同的連續兩次失敗規則。
- 課表偵測與 Calendar 同步固定建立 03:00、11:00、18:00、21:00 四個 `atHour(hour).nearMinute(0)` Trigger，由 Apps Script 在各整點前後約 15 分鐘啟動，完全不受通知偏好影響。即時通知開啟時，異動在當次同步完成後直接嘗試寄送，並另建立 06:00 每日摘要 Trigger；關閉時才依使用者選擇的一至四個時間建立獨立通知 Trigger。通知 Trigger 只寄送佇列內容，不重新讀取課表或更新 Calendar。課綱每日更新仍只指定小時、不固定分鐘，以分散共用 Sheets 的讀取尖峰。
- 中央課綱索引依標頭定位欄位並驗證啟用值、來源組、年級、起訖日期與一般 Google Sheets `/edit` 連結；同一來源組的列必須使用相同年級與日期，試算表不得重複。
- 課綱只以課表的原始課程名稱一字不差對應工作表分頁名稱，再以日期與節次起訖配對；不得使用分頁內「中文名稱」、標題正規化或模糊比對作 fallback。
- 課綱找不到精確分頁時可回報只差空白／全形字元的近似名稱，但不得自動套用；跨校課程不列入缺頁錯誤。
- Calendar 寫入批次本身不直接開啟課綱 Sheets，只讀取最後成功快照；第一次同步前的課綱預讀也在獨立 Apps Script 執行完成。課綱每天會自動重新讀取，時間安排在最早固定同步時段 03:00 的約 2 小時前；第一次失敗於約 30 分鐘後重試，第二次仍失敗才寄信，硬逾時由預先建立的 watchdog 接手。
- 課綱快照只保存已選且落在今天至第 30 天（含頭尾）的同步課程。純非同步列略過；同時具有實體或線上同步時數的混合列保留。整學期基本行程仍照常同步，不受 30 天課綱視窗影響。
- 課綱中的 `實體課程教室` 會與課表地點去重後以 `-` 組合，寫入事件標題右側的方括號及 Calendar 地點；`單元主題`、`課程內容` 寫入說明。垂直合併的資料儲存格會把左上值套用到合併範圍內各列。純課綱變更會更新這三個呈現欄位，但不列入行程調整通知。
- 側欄不再提供說明格式選項；新安裝固定使用標準格式。既有安裝若已保存進階自訂模板，儲存其他側欄設定時仍保留原值，以避免無預警改寫既有事件內容。
- 來源完全未變更的事件會跳過 Calendar API 讀寫。
- 一般同步在來源 signature 未變更時保留使用者直接對 Calendar 做的修改；強制修復才重新套用來源欄位。
- 來源更新標籤不納入同步 signature，避免無實質內容變化的更新時間造成大量 Calendar 寫入。
- 明確的同標題日期或時間變更，會在 21 天範圍內配對為更新；不明確情況維持分開的新增與取消。
- 偵測到可疑的大量刪除時，自動同步與強制修復會停止。設定變更只有在實際寫入前仍符合剛才預覽所產生的確認 token 時才能套用大量刪除；來源或設定改變後 token 即失效。
- 切換 Calendar 時，先在新的專用 Calendar 重建事件，再移除舊 Calendar 中的受管理事件。
- 舊版 `SYNC_STATE` 會遷移至分塊儲存。舊版受管理事件 fallback 必須同時具備管理標記、A1 格式來源儲存格與原始內容文字；今天與未來事件會逐批改用隱藏標籤並套用新版顯示格式。

## 通知與學期轉換

- 來源變更會寄送一份標準「行程調整」摘要，包含新增、取消、日期、節次、時間、地點與標題變更；不再提供其他通知格式或自訂模板。
- 即時通知開啟時，固定同步偵測到的行程調整會先合併並持久保存，Calendar 同步完成後立即嘗試寄出；寄送失敗時保留佇列並排程重試。關閉時，異動持續保存到下一個使用者通知時間成功寄出，後續無異動同步不得清除。通知 Trigger 若與仍在執行的同步重疊，會延後重試；既有的一次性通知重試不得因每日排程重整或關閉後續自動同步而被刪除，必須先完成已保存的待寄請求。同步錯誤、課綱錯誤與「行程同步設定完成」通知可立即寄發。
- 即時通知開啟時的每日成功摘要固定 06:00；關閉時安排在最後一個自訂通知時間。當日已偵測、排程或寄出行程調整時，不再寄成功摘要。
- 所有通知同時提供 HTML 與純文字內容；純文字內容是手機推播摘要與不支援 HTML 的備援。產生的 `Code.gs` 只保存指向已核准 commit 的不可變 HTTPS manifest URL 與安全渲染器，不內嵌信件 HTML，也不追蹤主分支即時內容；同一固定版本以一小時 Script Cache 快取，並在同一次 Apps Script 執行中只讀取、解析一次成功版型。版型大小上限依 UTF-8 位元組計算；下載、大小或驗證失敗時仍須寄出純文字。
- 所有通知主旨統一為「通知事件｜T-SCHOOL Schedule Sync」；首次設定只寄一次「行程同步設定完成」，行程調整使用「有 n 項行程調整」，每日成功摘要使用「行程同步狀態正常」。
- HTML manifest 中的一般 `{{value}}` 一律經過跳脫；只有程式從同一份 manifest 重複渲染出的區塊可透過 `{{{value}}}` 插入，使用者或課表來源文字不得直接成為 HTML。
- 完整 HTML 渲染後只允許 `calendar.google.com/calendar/` 與 `docs.google.com/document/` 的 HTTPS 連結；不符合白名單的 `<a>` 會移除，只保留其中的文字。
- 權限、資料結構、名稱碰撞、大量刪除等需處理的錯誤應立即通知；暫時性的 Google 服務錯誤或逾時先延後重試一次，下一次仍失敗才通知。
- 無變更執行預設不通知，但設定的每日成功摘要時段除外。
- 事件提醒預設關閉，可由使用者設定。
- 推定新學期時，系統暫停觸發條件、保留 Calendar 事件、清除已選課程，並在側欄持續顯示重新選課警示。Email 以學期識別去重；第一次寄送失敗會在約 30 分鐘後重試一次。使用者至少選擇一門課並儲存後才恢復寫入，側欄預設恢復轉換前的自動同步偏好。

## 狀態與安全模型

- 設定、狀態、通知狀態、受管理事件狀態與課綱最後成功快照儲存在 Script Properties；大型 JSON 會依 UTF-8 位元組切成每塊至多 7,500 bytes。分塊寫入以同一份 Properties 快照同時計算舊分塊數與容量，不再為舊計數增加一次服務呼叫。事件簽章只保存短雜湊、異動明細設上限、超過 120 天的歷史索引會移除，預估總量超過 430 KiB 時停止寫入。課綱快照以版本化 staging 寫入，完整驗證後才切換 active pointer，失敗不得覆蓋上一版。
- 每份 Google Docs 控制臺副本支援一個年級、一個通知信箱與一個專用 Calendar；拒絕使用主要 Calendar。通用程式的 `DEFAULT_SETTINGS` 不得內含測試使用者 Email、選課、Calendar ID 或預設年級；匯入前也不得讀課表、建立 Calendar、建立觸發器、同步、修復或刪除。
- Production 通用程式固定不含高負載測試函式與選單。開發者只有在執行 `scripts/generate-google-docs-control-panel.js --test-build` 時才會建立測試 artifact；測試版仍以單一「模擬控制臺首次同步」情境沿用正式分批、背景續跑與 watchdog 路徑。
- 控制臺不提供同步時段選項；`autoSyncHours` 固定保存 `[3, 11, 18, 21]`，`instantNotificationsEnabled` 保存即時通知開關，`notificationHours` 保留使用者關閉即時通知後使用的自訂時間。讀取舊版設定時，會先把既有 `autoSyncHours` 遷移為 `notificationHours`，再套用固定同步時段；沒有新欄位的安裝預設開啟即時通知。
- 刪除工具只處理已儲存的事件 ID，並驗證管理標記；「移除受管理事件」與「重設同步狀態」會持有同一把 Script Lock 完成背景工作檢查與變更，避免檢查後才開始同步的競態。
- `quickDeleteAllCalendarEvents()` 保持由 `ALLOW_QUICK_DELETE_ALL = false` 停用。
- 使用者輸入透過 `JSON.stringify` 與 U+2028／U+2029 escaping 安全序列化，不得將使用者字串直接串接進可執行程式碼。
- 通知收件者是一個純電子郵件地址；寄信失敗不得掩蓋原始同步失敗。
- 產生的 `Code.gs` 必須保留 `@OnlyCurrentDoc`；`appsscript.json` 的 OAuth scope 必須精確維持目前功能所需的 8 項：`documents.currentonly`、`spreadsheets.readonly`、Calendar 管理、寄信、外部讀取、Trigger、容器 UI 與目前帳號 Email，並只啟用 Sheets v4 進階服務。不得加入完整 Docs／Sheets、Drive、Gmail 或其他未審核權限。
- 課表來源只在單次 Apps Script 執行內依年級快取成功的解析結果；同一個「儲存並同步」流程重複取用相同快照，下一次手動或背景執行仍必須重新下載，不能以跨執行快取犧牲資料新鮮度。
- Calendar 選單每個項目只讀取一次 ID；課綱索引與課綱分頁透過 Sheets API 批次讀取實際使用範圍，保留原空表檢查，並在每張分頁只整理一次日期候選，減少 Google 服務呼叫及重複列運算而不改變資料範圍。
- 安裝器 CSP 應維持最小權限，只在必要時增加明確來源。

## 部署與快取

根目錄 `index.html` 以主要樣式表網址中的固定發布版本建立 `TSCHOOL_ASSET_VERSION`，並將同一查詢值加到下列檔案：

- `styles.css`
- `schedule-data.js`
- `setup-code.js`
- `app.js`

上述公開資產共用同一固定快取版本。網站不載入 `sidebar-template.js`、`setup-dialog-template.js` 或 `code-template.js`；這些只供開發者產生 Google Docs 母版程式。`app.js` 等核心依賴完成後即可啟動，最後一步只需使用 `setup-code.js` 產生設定碼。

`styles.css` 必須在 `<head>` 直接提供 `href`，讓瀏覽器在首次繪製前完成主要樣式載入，避免顯示裸露 HTML。不得使用 `Date.now()` 為每次瀏覽產生新版本；發布前若上述資產有變更，應更新 `styles.css?v=...` 的固定版本值，讓瀏覽器能沿用同一版快取，又能在新版部署後正確失效。

## 長期限制

- 公開設定產生器維持靜態、免建置且無外部執行階段依賴。
- Calendar 配額安全與可復原性優先於最大寫入速度。
- 不得還原與任務無關的未提交使用者修改。
- 既有 Google Sheet 控制臺可繼續運作，但新版網站不提供更新程式碼。Google Docs 母版自動更新、舊副本遷移與重新接回既有狀態列為後續工作，不得假設目前已有相容更新路徑。
