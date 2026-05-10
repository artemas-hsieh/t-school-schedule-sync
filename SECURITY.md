# 安全性說明

這份文件用比較白話的方式說明：這個專案會碰到哪些資料、哪些權限、可能有什麼風險，以及使用者和維護者應該怎麼降低風險。

如果你是高中生，可以先看「給使用者的重點版」。如果你是開發者，再往下看「安全模型」與「維護者檢查清單」。

## 給使用者的重點版

請記住五件事：

1. 這個網頁本身不會登入你的 Google 帳號。
2. 真正會讀課表、改日曆、寄信的是你貼到 Google Apps Script 裡的 `Code.gs`。
3. Apps Script 會用你的 Google 帳號權限執行，所以你要確認自己信任它。
4. 請使用專用 Google Calendar，不要直接同步到主要日曆。
5. 不要把填好私人資料的 `Code.gs` 公開貼出去。

如果你只想安全地使用，最重要的是：建立一個新的專用日曆，只讓這個工具管理那個日曆。

## 這個工具處理哪些資料

網頁設定器可能會讓你輸入或選擇：

- Google Sheets URL。
- 表格分頁名稱。
- Google Calendar ID。
- 年級。
- 課程。
- 通知 Email。
- 每日同步時間。
- 是否包含全校活動。

這些資料會被放進產生的 `Code.gs`。網頁本身沒有自己的後端伺服器，也沒有自己的資料庫。

產生的 Apps Script 會處理：

- Google Sheet 裡的課表內容。
- 解析出的課程名稱、日期、節次、地點、來源儲存格。
- Google Calendar 事件 ID。
- 同步狀態 `SYNC_STATE`。
- 調課通知狀態。
- 通知收件 Email。

## 資料流說明

資料流可以想成這樣：

```text
你的瀏覽器
  → 載入靜態網頁
  → 你填設定
  → 網頁產生 Code.gs
  → 你複製到自己的 Apps Script
  → Apps Script 用你的 Google 權限讀 Sheet、寫 Calendar、寄 Email
```

專案作者的伺服器不會接收你的設定資料，因為這個專案目前沒有後端伺服器。

## Apps Script 權限風險

Google 可能會要求你授權 Apps Script 使用下列能力：

- 讀取 Google Sheets。
- 讀取與修改 Google Calendar。
- 建立或刪除 Apps Script 觸發器。
- 使用 MailApp 寄送通知 Email。
- 讀取目前使用者 Email 作為預設通知收件者。
- 使用 Apps Script Properties 儲存同步狀態。

這些權限是功能需要，但也代表它們不能亂給。請先確認網址、程式碼和設定內容。

## 建議的安全使用方式

- 建立一個新的專用 Google Calendar。
- Calendar ID 只填專用日曆。
- 第一次同步後，先人工對照 Google Sheet 與 Google Calendar。
- 確認正確後才執行 `setupAutoSyncTriggers()`。
- 不要把 Apps Script 專案分享給不需要的人。
- 不要公開貼出含私人資料的 `Code.gs`。
- 如果你不再使用，執行 `deleteAutoSyncTriggers()`，再視需要刪除 Apps Script 專案。

## 危險操作提醒

產生的 `Code.gs` 裡有幾個比較敏感的函式：

- `quickDeleteSyncedCalendarEvents()`：刪除本工具同步過的未來事件。
- `quickDeleteAllCalendarEvents()`：刪除指定日曆中大範圍事件。
- `resetSyncState()`：清除同步狀態。

其中 `quickDeleteAllCalendarEvents()` 預設不能直接使用，因為 `allowQuickDeleteAllCalendarEvents` 是 `false`。如果你手動把它改成 `true`，請先確認：

- 你填的是專用日曆。
- 該日曆裡沒有你要保留的重要事件。
- 你真的想刪掉那個範圍內的事件。

一般情況下，請優先使用 `quickDeleteSyncedCalendarEvents()`，不要使用 `quickDeleteAllCalendarEvents()`。

## 本專案目前已有的安全設計

- 使用純靜態網頁，降低後端資料外洩風險。
- 有 Content Security Policy，限制外部資源與嵌入。
- 使用者輸入被放入產生程式碼時，透過 JSON 字串序列化，避免把輸入直接當程式碼執行。
- 課程名稱顯示到網頁時會進行 HTML escape，降低 XSS 風險。
- 通知 Email 限制為單一地址，避免使用逗號、分號、換行或顯示名稱。
- 新建立的日曆事件會寫入同步標記，刪除時會檢查是否為本工具管理的事件。
- 全量刪除函式預設關閉，需要手動開啟危險開關。
- 原始 Excel 課表檔放在 `.gitignore` 排除的目錄，不應被提交到 Git。

## 仍然存在的風險

### Google Sheet URL 暴露

網頁預設值可能包含一個 Google Sheet URL。即使 Sheet 本身需要校內帳號權限，公開的 URL 仍然會暴露試算表 ID。

降低方式：

- 確認 Google Sheet 分享權限正確。
- 不要把敏感資料放在任何可被連結存取的人都能讀的 Sheet。
- 若未來課表資料變敏感，應改成讓使用者自行填入 Sheet URL。

### Apps Script 專案被分享

如果你把 Apps Script 專案分享給別人，對方可能看到你的設定、Calendar ID、通知 Email 與同步狀態。

降低方式：

- 不要分享 Apps Script 專案。
- 如果真的要共同維護，先移除私人設定，或建立共用但低風險的測試日曆。

### 日曆誤刪

程式有刪除同步事件的能力。雖然有標記檢查，但設定錯誤或手動修改程式仍可能造成資料遺失。

降低方式：

- 使用專用日曆。
- 不要開啟 `allowQuickDeleteAllCalendarEvents`，除非你非常確定。
- 不要把主要日曆 ID 填進工具。

### Google 帳號授權畫面被忽略

很多人看到授權畫面會直接按同意，但這其實是在允許程式讀寫你的 Google 資源。

降低方式：

- 看清楚授權帳號是不是你要用的帳號。
- 看清楚權限是否符合本工具功能。
- 如果授權畫面顯示奇怪的權限或你不確定，先停止。

## 安全回報方式

如果你發現安全問題，例如：

- 可能造成別人的資料外洩。
- 可能刪除非本工具建立的日曆事件。
- 可以把使用者輸入變成惡意程式碼。
- 可以讓網頁載入不該載入的外部程式。

請不要直接公開貼出完整攻擊步驟或私人資料。

建議做法：

1. 到 GitHub repository 開一個簡短 issue，標題可寫「需要回報安全問題」。
2. issue 內容先不要貼完整細節，只說明影響範圍。
3. 等維護者提供合適的私人聯絡方式後，再提供重現步驟。

如果問題已經被公開利用，請在 issue 中明確寫出「可能正在被利用」，但仍避免貼出可直接攻擊他人的細節。

## 給維護者的安全檢查清單

修改程式碼前後，請檢查：

- 是否仍然是純靜態網頁，沒有新增會收集使用者資料的後端。
- 是否新增外部 JS、CSS 或圖片。如果有，是否真的必要。
- CSP 是否只針對必要資源放行，不要直接大範圍放寬。
- 使用者輸入是否只作為資料，不作為程式碼。
- `Code.gs` 的字串輸出是否仍透過 `JSON.stringify` 類型的序列化。
- 日曆刪除是否仍檢查 managed marker 或同步狀態。
- `quickDeleteAllCalendarEvents()` 是否仍預設關閉。
- 通知 Email 是否仍限制為單一地址。
- 是否不小心提交了 Excel 原始檔、私人 Email、Calendar ID 或測試資料。

建議檢查指令：

```bash
node --check configurator/code-template.js
node --check configurator/app.js
git diff --check
```

如果改到產生的 Apps Script，請再產生一份 `Code.gs`，並確認語法可以被 JavaScript parser 接受。

## 支援版本

目前只支援線上 GitHub Pages 與 repository 最新版本。舊版產生的 Apps Script 可能仍可運作，但不一定包含最新安全修正。

若你已經建立過 Apps Script 專案，想使用新版邏輯，請重新打開線上產生器，複製新的 `Code.gs`，覆蓋原本 Apps Script 專案中的程式碼，再儲存。
