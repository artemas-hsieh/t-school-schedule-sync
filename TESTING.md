# TESTING

> 本文件集中記錄 T-SCHOOL 課表同步專案的驗證方式。
> 依變更範圍執行最小但充分的測試，不必為局部修改執行所有檢查。

## 基本檢查

所有程式碼變更至少執行：

```bash
git diff --check
```

JavaScript 變更另對受影響檔案執行：

```bash
node --check <affected-file>
```

若一次修改多個主要 JavaScript 檔案，可執行：

```bash
node --check schedule-data.js
node --check setup-code.js
node --check sidebar-template.js
node --check setup-dialog-template.js
node --check code-template.js
node --check app.js
node --check scripts/generate-google-docs-control-panel.js
```

## 冒煙測試

下列變更應執行：

```bash
node tests/smoke-test.js
```

適用範圍：

- 課表解析或分類。
- 設定 schema、預設值或遷移。
- `sidebar-template.js`。
- `setup-code.js` 或 `setup-dialog-template.js`。
- `code-template.js`。
- 產生的 Apps Script。
- 安裝器與執行階段共用行為。
- 可能影響課程、活動、事件範圍或產生程式碼語法的修改。

冒煙測試會檢查介面模板基本條件、產生程式碼語法，以及在 fixture 存在時比較安裝器與執行階段的解析結果。若高一、高二或高三 fixture 缺失而被跳過，必須在完成回報中說明，不得將跳過項目視為通過。

## 設定碼與母版程式驗證

修改設定碼格式時，至少測試繁體中文、emoji、特殊字元、多課程、活動排除，以及一至四個通知時間的 round-trip；另測試空白、超過 32 KiB、錯誤 prefix、錯誤 checksum、不支援 schema、非法 Email、未知課程、同學期來源變動、跨學期與首次同步後重複匯入。`catalogFingerprint` 另必須以相同 fixture 同時在網站與產生的 Apps Script 計算並比對，覆蓋課程列順序不同、指紋篡改、舊版 `sourceFingerprint` 遷移，以及完整課表指紋從 A 改為 B 後仍可載入原設定上下文的回歸情境。單頁匯入時另確認 Google 帳號不符會留在貼上頁且不保存；帳號相符時直接保存；無法取得帳號時則保存後保留提示，使用者明確確認後才開啟控制臺。

修改 `sidebar-template.js`、`setup-dialog-template.js` 或 `code-template.js` 時，應確認：

1. 在 Node 中載入兩個 HTML template 與 `code-template.js`。
2. 使用正式課表端點及固定 commit 的 Email manifest URL 呼叫 `window.buildAppsScriptCode(settings)`；其他網域、帶 query／fragment 或重新導向後含權杖的課表網址必須拒絕。
3. 將結果傳入 `new Function()`。
4. 確認 production 輸出不含測試 Email、選課、Calendar ID、來源端點使用者注入或高負載函式。
5. 確認容器 UI 只使用 `DocumentApp`，產生碼完全不含 `SpreadsheetApp`；中央索引與課綱只透過 manifest 啟用的 Sheets v4 進階服務讀取，且沒有 `batchUpdate`、`Values.update`／`append`／`clear` 等寫入呼叫。
6. 確認 `Code.gs` 保留 `@OnlyCurrentDoc`；產生的 `appsscript.json` 與產生器實際寫出的 manifest 都精確包含 8 項已核准 scope、沒有重複或額外 Drive／Gmail／完整 Docs／Sheets 權限，且產生碼不含試算表寫入 API。`showSettingsSidebar()` 必須先呼叫 `ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL)`，再讀取設定或顯示介面，確保新副本第一次點選時先進入 Google 授權流程。

發布 artifact 時另執行：

```bash
node scripts/generate-google-docs-control-panel.js \
  --manifest-url https://raw.githubusercontent.com/OWNER/REPO/COMMIT/notification-email-templates.json
```

省略 `--manifest-url`、使用非 40 字元 commit 或可變網址時都必須失敗。預設必須同時輸出 `Code.gs` 與 `appsscript.json`，且不得包含高負載入口；只有 `--test-build` 可產生測試版。`tests/smoke-test.js` 會在暫存目錄實際執行一次 production CLI 並解析兩個輸出檔。

此檢查可捕捉來源檔語法檢查無法發現的 escaping 與產生程式碼語法問題。若 `tests/smoke-test.js` 已完整涵蓋並成功執行，不必重複建立另一套相同測試。

## 解析變更

修改資料取得、正規化、課程或活動分類時：

- 測試高一、高二、高三資料。
- 比較安裝器與產生的 Apps Script 所得到的課程目錄、活動目錄、事件數量與日期範圍。
- 確認來源未提供時間的明確活動仍為全天事件。
- 確認未知標題不會只因缺少課程名稱就被推斷為活動。
- 確認標題尾端地點解析與正規化去重仍符合預期。

若無法取得即時資料或 fixture，應說明未驗證的年級與原因。

## Calendar 與狀態變更

修改同步、刪除、Calendar 切換、狀態遷移或安全機制時，至少確認：

- 422 筆首次同步以首批 40 次、後續每批最多 80 次操作完成，第二輪為零寫入；首次建立不得因強制檢查而把新事件重複更新一次。
- 含中文與 emoji 的大型狀態會依 UTF-8 位元組分塊，單一 Property 不超過 7,500 bytes，重新組合後內容不變；支援 `getProperties()` 時，分塊寫入不得再單獨呼叫 `getProperty(<key>_COUNT)`。大值縮小後允許保留由 COUNT 忽略的尾端 chunk，讀取仍只能採用目前 count；明確清除 store 時必須連歷史尾端一併移除。
- Calendar 已建立但狀態未保存時，續跑能以同步識別碼接回事件，不會重複建立。
- Calendar 已建立但提醒尚未成功時，續跑會接回同一事件並重新套用提醒。
- 移動事件配對須作 differential test：exact 優先；全天型態與節數長度必須相同；課綱「單元主題＋課程內容」組合相同時優先，至少一欄非空即可建立身分；兩者都有身分但不同時不得配對，教室不得進入身分；缺少課綱身分才回退至同課名 21 日內唯一最近。另確認等距不配對、恰好 21 日包含、超過一毫秒排除、同一舊事件只用一次，並保留 additions／deletions 與貪婪順序。以化學跨節交換、國語文／英語文調課覆蓋不得誤判事件擴張、縮短、拆分或合併；化學範例的 Calendar 三筆邊界修改在使用者判定層必須消去未變動的同日同節原地點交集，最後只回報兩項真實調課；第二範例仍回報三項。
- 強制修復會記錄已檢查的 key，不會因簽章本來相同而無限續跑。
- 調課事件已寫入新 marker、但尚未提交狀態時仍可恢復。
- 第一次暫時失敗或硬逾時只重試；連續第二次才停止並寄信。
- Active job 期間來源、設定、Calendar 或課綱版本改變時，會由已提交狀態重新規劃。
- 不會寫入主要 Calendar。
- 控制臺手動建立與首次同步自動建立的專用 Calendar 都使用 `selected: true`，使其預設顯示在 Google Calendar 介面中。
- 一般同步不會無故覆蓋來源未變時的使用者手動修改。
- 可疑大量刪除會停止自動執行。
- 刪除工具只處理受管理事件。
- 「移除受管理事件」與「重設同步狀態」必須在同一把 Script Lock 內重新檢查 active job 並完成變更，且快速移除不得重複清除同步狀態。
- Calendar 切換遵循先建立新 Calendar 事件、再清理舊 Calendar 的順序。
- 建立新 Calendar 時仍保存舊 Calendar ID，搬移未完成時再次儲存不會清除該 ID。
- Calendar 搬移尚未完成時，不允許再次切換到第三個 Calendar。
- Calendar 搬移期間若舊 Calendar 已不存在，`migration_delete` 應視為沒有可清理項目並繼續；不得把一般 API 或權限例外一律吞掉成「已刪除」。
- 零操作的 finalizer 重試不會清除連續失敗次數。
- 設定與 `SYNC_STATE` 遷移不會遺失可復原所需資訊。
- 大量刪除預覽 token 在來源或設定改變後會失效；強制修復不得繞過大量刪除保護。
- 失敗通知不會掩蓋原始同步錯誤。
- Calendar 或設定已寫入後，即使 `getSettingsUiData()`、Calendar 清單、狀態顯示、觸發器或通知後處理失敗，也必須回傳已完成結果與獨立警告；不得進入 `notifySyncFailureUnlessActionRequired_()` 或對使用者誤報主要操作失敗。
- 指紋、簽章與 hash 輸入必須使用資料域名稱與版本；`catalogFingerprint`、`scheduleFingerprint`、`setupContextFingerprint`、`desiredScheduleFingerprint`、`indexFingerprint` 及事件簽章不得交叉比較。需跨執行環境比較的列必須使用明確字典序，不依賴預設 locale。
- `notification-email-templates.json` 可解析且涵蓋所有通知種類；產生的 `Code.gs` 不含 manifest 中的信件版型文案或版面內容（Apps Script 側欄本身仍會內嵌 HTML）。
- 產生的 `Code.gs` 從 `raw.githubusercontent.com` 的已核准 commit 讀取 manifest，不再使用會隨主分支變動的 GitHub Pages 網址；更新 pin 時同步更換 cache key。
- HTML 信件一般變數會跳脫 `<`、`>`、引號與 `&`；重複區塊只能插入由 manifest 自己渲染的內容。
- HTML 信件只保留 `calendar.google.com/calendar/` 與 `docs.google.com/document/` 的 HTTPS 連結；相似網域、其他路徑、非 HTTPS 或 `javascript:` 連結都移除但保留文字。
- 遠端 HTML manifest 下載、快取或驗證失敗時，`MailApp` 仍以純文字 `body` 寄送原通知。
- Email manifest 的 100 KiB 上限依 UTF-8 位元組而非 JavaScript 字元數計算；同一次 Apps Script 執行中，成功載入後不得再次讀取 CacheService、下載或解析相同固定版型。
- 同一次 Apps Script 執行中，同一年級的課表只能下載、解析一次；不同年級各自快取，下一次執行則必須重新取得。正式 fetch 測試另需覆蓋精確 URL／年級 query、非 200、無效 JSON 與錯誤年級。
- 完成首次同步後，控制臺遇到課表 API 失敗仍須以最後成功摘要或既有設定開啟，標示來源離線並停用所有依賴即時來源的寫入；正式同步函式仍須直接失敗，不能使用此 UI 摘要更新 Calendar 或判定新學期。
- 課綱索引與分頁只能使用 Sheets v4 的 `Spreadsheets.get` metadata 與 `Values.batchGet` 唯讀方法；每份試算表只取一次 metadata，並批次讀取實際命中的分頁。空表仍保留原錯誤，API 的零起算合併範圍仍能向下展開；每張課綱分頁的日期候選只去重一次。
- 既有 `retryScheduledNotificationDelivery` 在每日排程重整及關閉後續自動同步時都必須保留同一 Trigger ID；已保存的通知寄出後才清除 request、佇列與 retry。
- 通知版型只保留標準版本，沒有句號、單側厚色框或可自訂通知格式；標籤使用直角，底部只保留指定的自動寄送說明。
- 課表偵測與 Calendar 同步固定建立 03:00、11:00、18:00、21:00 四個 `atHour(hour).nearMinute(0)` Trigger，不得隨通知偏好改變。即時通知開啟時只另建立 06:00 每日摘要 Trigger；關閉時才依使用者選擇的每個通知時間建立獨立 Trigger。
- 即時通知開啟時，固定同步偵測到行程調整並完整套用 Calendar 後應立即嘗試寄出；失敗時必須保留異動並排程重試。關閉時，設定時間外只排入佇列；後續無新異動的同步不得清除先前待寄的行程調整。通知 Trigger 與背景同步重疊時必須延後重試；錯誤與「行程同步設定完成」通知可立即寄出。
- 即時通知開啟時，06:00 才可寄每日成功摘要；關閉時則由最後一個自訂通知時間寄出。當日已有行程調整時只寄行程調整通知。
- 即時通知成功後必須立即清除 `pendingChangeData`；排程通知與同步工作以 active job 檢查及同一 Script Lock 串行，普通重疊不得重寄。同時保留「寄信成功但狀態提交失敗」無法跨兩個 Google 服務達成嚴格 exactly-once 的既有限制，優先避免遺失通知。
- 前台儲存與背景新標題登錄都必須在同一 Script Lock 內完成；第一次同步課綱預讀取得不到 3 秒鎖時應安全降級，不得與背景工作同時發布快照。
- 新學期待重新選課時，不得建立每日同步、通知或課綱觸發器，也不得排定或手動執行課綱更新；新一批同步的 watchdog 必須取代既有同名觸發器並得到完整 5 分鐘。
- `formatDateKey_` 必須在 Asia/Taipei 的 23:59:59 與 00:00:00 正確切日，不加入把凌晨算回前一天的緩衝。

若本機無法實際呼叫 Google Calendar，應以可執行的單元／整合測試或程式路徑檢查代替，並明確列出尚未實際驗證的外部行為。

## 課綱補充資料

修改課綱來源、解析、快照、觸發器或說明欄整合時，至少確認：

- 中央索引依欄名讀取，允許額外的 `備註` 欄；停用列略過，同一來源組的多份 Sheets 正確合併。
- 同一來源組出現不同年級／適用日期、重複 Sheets 連結、無效啟用值或非一般 Google Sheets 連結時停止使用該次索引。
- 中央索引暫時失敗時沿用最後成功版本；從未成功讀取時才使用內建來源。
- 第一次成功讀取中央索引只建立基準；後續內容改變時寄送一次含差異摘要與新舊指紋的通知，寄送失敗時保留待寄狀態並於下次成功讀取重試。只調整來源組、課綱名稱或 Spreadsheet ID 的列順序時，正規化後的 `indexFingerprint` 必須不變，也不得寄出變更通知。
- 只有已設定來源組的年級會建立課綱觸發器；日期超出來源組適用範圍時不得開啟舊課綱。
- 課程只以課表原始名稱一字不差對應工作表分頁，不使用分頁內中文名稱或模糊比對。
- 欄位換序、增欄，以及標頭位於不同列時，仍能依欄名定位。
- 單節、連續節次與 `56` 形式都能解析。
- 純非同步列排除，實體／線上與非同步並存的混合列保留。
- 快照寫入失敗不會切換 active version；Calendar 同步在課綱失敗時仍能使用最後成功快照。
- 第一次失敗只建立一次重試且不寄信；第二次失敗只寄一次；硬逾時可由 watchdog 轉入相同流程。
- 課綱變更不改 occurrence key；純課綱更新會更新標題、Calendar 地點與說明，但不列入行程調整通知。
- 標題與地點會將課表地點及 `實體課程教室` 去重後以 `-` 組合，缺值時不產生多餘方括號或連字號。
- 標準說明以 HTML `<br>` 及粗體段落產生，省略空白課綱段落，且不顯示技術管理標記或同步識別碼。
- 舊的簡潔／詳細說明設定會遷移為標準；進階自訂預先帶入標準模板。
- 每次課綱刷新只處理今天至第 30 天（含頭尾）的課程；第 31 天以後不讀取課綱，但基本課表行程仍應存在。
- 第一次同步的課綱預讀必須使用獨立 Apps Script 執行；只有 60 秒內完成的快照可供第一批 Calendar 事件使用，超時或失敗不得阻止基本行程同步。
- 新學期轉換會清空選課、暫停自動同步，並在完成新學期同步前不改動既有事件；側欄警示在重新選課前持續存在。使用者必須明確確認新學期實際就讀年級並選擇至少一門課，缺少任一條件時前後端都不可儲存或同步；切換年級後須同時刷新課表、課綱狀態與學期日期。
- 新學期 Email 以學期識別去重；第一次失敗只建立一個重試，第二次成功後移除重試觸發器。重新選課儲存後清除待確認狀態，並依側欄預設恢復轉換前的自動同步偏好。
- 控制臺初次顯示時，課綱狀態只能使用已傳入的最後成功索引或內建 fallback，不得在狀態建構函式內再次開啟中央索引；使用者主動切換年級時則須重新讀取最新索引，並一併刷新課表、課綱狀態與學期日期。
- 自動同步關閉時，一般儲存不得自行更新課綱；使用者按下手動同步或「完成選課並同步」後，必須以獨立的一次性 `manual` 課綱觸發器補入課綱，且不得重建每日同步觸發器。

本機測試只能驗證產生程式碼、解析函式與 mock 狀態機。正式上線前仍應以全新 Google Docs 副本及校內帳號確認授權畫面只顯示目前文件與 Sheets 唯讀權限、`appsscript.json` 已啟用 Sheets v4 進階服務，並建立 time-driven trigger，對所有當期 Spreadsheet IDs 做一次整合讀取測試。

## 開發者高負載測試

正式網站與 production `Code.gs` 固定不含高負載測試。只有開發者使用產生器的 `--test-build` 選項時，測試 artifact 才包含高負載函式與選單。

不懂程式的測試者只需：

1. 先建立隔離的 Google Docs 測試副本，避免覆蓋正式控制臺。
2. 將 `--test-build` 產生的 `Code.gs` 安裝到該測試母版並重新整理文件。
3. 點「T-SCHOOL Schedule Sync」→「高負載測試」→「模擬控制臺首次同步」。
4. 程式會模擬使用者在控制臺按下「儲存並首次同步」：以 `2026/02/23` 為當下日期讀取高二課表與 30 天課綱、自動建立名稱以 `[TEST]` 開頭的專用 Calendar，並沿用正式的首批 40 次、後續每批最多 80 次操作、存檔點、背景續跑與 watchdog 機制同步全部 422 筆行程。
5. 不需再執行 10、25、50、100、200 或第二次同步等分段項目。使用「查看首次同步進度」確認背景作業完成，再開啟測試日曆。
6. 30 天內成功配對的課程應在標題與地點顯示課表地點及 `實體課程教室`，例如 `國語文進階(二) [吉林基地-協作坊]`。
7. 若顯示資料基準不符、課綱分頁缺漏、Apps Script 逾時兩次或 Google 服務錯誤，保存畫面與「查看首次同步進度」結果。
8. 完成後執行「清除測試環境」。程式會永久刪除該 `[TEST]` Calendar、測試控制臺的同步狀態、觸發器與課綱快照。

測試必須安裝於全新的控制臺副本。它會直接使用正式控制臺的設定、`SYNC_STATE`、課綱快照、分批續跑、觸發器與通知路徑，以驗證真正的首次同步；Calendar 名稱固定以 `[TEST]` 開頭，通知寄到執行測試的 Google 帳號。清除功能只接受這個隔離測試情境。

測試版不得發布為一般使用者母版；production 產生器不接受從網站設定啟用測試的參數。

## UI 行為與無障礙

修改 UI 互動、版面或動態時，依受影響範圍檢查：

- 受影響的主要互動流程。
- 第四步以前修改年級、課程、Email、即時通知或通知時間時，設定碼不得即時產生或更新；只有按下第四步「產生安裝設定碼」後才更新，且複製控制在產生前保持停用。
- 鍵盤操作與合理的焦點順序。
- focus 狀態是否可見。
- 表單驗證、錯誤訊息與狀態轉換。
- 在第三步 Email 無效時按 Enter 或點擊下一步按鈕，確認欄位自動聚焦且在鍵盤彈起後立即位於可視範圍；卡片內提示可被輔助技術辨識，且不出現瀏覽器原生驗證浮窗。輸入至有效格式時，第四張預覽卡片不得出現單幀白色閃爍。
- reduced-motion fallback。
- 觸控使用情境。
- 保持 Lenis 開啟，從第四步首次產生設定碼進入第五步，再分別透過手動捲動與階段選單往返第四、五步；確認 active step、`inert` 與 reduced-motion 狀態正確。設定碼預覽不得切換成內嵌捲動；全區域模糊遮罩不得攔截主要動作，複製按鈕、舊式 clipboard fallback、錯誤提示與焦點恢復都必須可用。
- 桌機第五步維持「複製設定碼」，並顯示可再次點擊複製的第一步、Email、母版連結與共四步指引；第一步複製成功後需提供可見及輔助技術可讀的狀態回饋。手機、行動 user-agent 與只有粗指標的裝置只顯示「寄送設定信」與收信提示，不得顯示純複製按鈕或母版連結。寄信選單需預填通知 Email、主旨「設定指引｜T-SCHOOL Schedule Sync」、`設定信.md` 格式的純文字操作指引、正式 Google Docs 母版連結與完整設定碼；超過 mailto 安全長度時測試檔案分享與下載 fallback。
- 在粗指標裝置以短距離、不同速度連續滑動，確認瀏覽器原生慣性可依手勢速度延伸捲動距離，卡片邊界仍不會解鎖下一步。
- 行動裝置虛擬鍵盤開啟時，聚焦欄位、標籤與提示仍位於實際可視範圍，捲動不會被目前卡片邊界拉回；鍵盤收起、旋轉與分割畫面改變後維持目前步驟並恢復一般邊界。
- 開啟 Email 鍵盤並輸入數個字元，確認候選字列出現或消失時，欄位與錯誤提示不會隨連續的 viewport 事件上下反覆抽動。
- 水平溢出、裁切、遮擋、缺少元素、瀏覽器錯誤與明顯響應式破損。

需要時使用真實課程名稱，並從桌面、平板、手機與 320 px 寬度中選擇與變更相關的 viewport。除非使用者明確要求，不進行耗時的逐像素比對或大量重複截圖。

主觀項目交由使用者最終目視確認，包括：

- 視覺層級。
- 間距與對齊。
- 對比與品牌一致性。
- 動態節奏。
- 響應式構圖。

完成回報應列出仍需使用者確認的主觀項目。

## Google 雲端發布驗收

本機測試不得宣稱 Google 雲端行為已通過。正式母版發布時，必須以全新 Google Docs 副本另行驗證：綁定腳本隨副本複製、`onOpen` 選單、授權、設定碼匯入、Google 帳號一致／不一致／無法取得三種狀態、Calendar 建立、首次同步、Email 控制臺連結、觸發器及背景續跑。匯入設定成功後須確認控制臺能自動開啟；若第一次讀取暫時碰到 Script Lock，應顯示等待狀態並自動恢復，不得停留在空白側欄或要求使用者反覆重開。控制臺操作使用電腦；手機另驗證設定信寄送、Calendar 結果及 Email 收取。

## 結果回報

完成時簡要列出：

- 已執行的指令或檢查。
- 通過、失敗或跳過的結果。
- 失敗是否由本次修改造成。
- 因環境、fixture 或外部服務限制而未完成的驗證。

不得在測試未執行、被跳過或結果不完整時宣稱「所有測試通過」。
