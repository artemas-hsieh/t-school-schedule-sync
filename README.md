# T-SCHOOL 行程同步

T-SCHOOL 行程同步是一個純靜態設定器，會依使用者的年級、選課與偏好產生一份 Google Apps Script `Code.gs`。程式在使用者自己的 Google 帳號中執行，從目前的課表 API 讀取資料，並同步至專用 Google 日曆。

線上設定器：

<https://artemas-hsieh.github.io/t-school-schedule-sync/>

## 功能

- 直接從課表 API 載入一、二、三年級資料，動態產生去重後的課程選單。
- 同步選定課程、年級活動與全校活動到專用 Google Calendar；活動預設全選，也可逐項排除。
- 支援的年級與學期可從校內課綱 Google Sheets 補入實體課程教室、單元主題與課程內容；來源清單由中央索引更新，目前先支援 114-2 高二。
- 課綱只讀取未來 30 天內的相關課程，整學期基本行程仍照常同步。
- 比對新增、取消、改名、日期、節次、時間與地點變更，於設定時間寄送標準「行程調整」HTML Email 與手機純文字摘要。
- 支援每日自動同步、每日狀態摘要、事件提醒，以及以標準格式為基礎的進階自訂說明。
- 安裝後可從 Google Sheet 的「行程同步」選單與側邊欄調整設定，不需再回 Apps Script 編輯器。
- 一般同步保留使用者對日曆事件的手動編輯；必要時可使用「強制修復」重新套用來源資料。
- 大量首次同步會先以 40 次 Calendar 操作建立安全檢查點，後續每批最多 80 次；每批都有安全存檔點，關閉側欄後仍可背景續跑。
- 事件標題與地點會合併課表地點及課綱中的實體課程教室；隱藏同步標籤可防止「Calendar 已建立、狀態尚未保存」造成重複事件。暫時失敗會重試一次，下一次仍失敗才寄信。
- 偵測新學期後會暫停寫入、保留已有事件，以 Email 與側欄警示要求使用者重新選課；儲存後可恢復原本的自動同步偏好。

## 安裝

### 1. 產生程式碼

1. 開啟線上設定器。
2. 選擇年級，等待課程資料載入。
3. 搜尋並選擇課程與活動，再填寫通知 Email 與一至四個通知時間。
4. 檢查設定摘要並確認後，前往程式碼輸出區複製完整 `Code.gs`。

### 2. 建立 Google Sheet 控制臺

1. 從設定器下載控制臺範本，上傳至 Google Drive 並以 Google 試算表開啟；若介面提供公開範本連結，則直接建立自己的副本。
2. 在控制臺試算表中開啟「擴充功能」→「Apps Script」。
3. 刪除編輯器中的範例內容，貼上 `Code.gs` 並儲存。
4. 回到試算表並重新整理頁面。
5. 從上方「行程同步」→「開啟設定」進入側邊欄。所有設定都在側邊欄完成，不需要編輯試算表儲存格。

### 3. 完成首次同步

1. 確認年級、課程與通知 Email。
2. 選擇已有的專用日曆，或讓程式自動建立。主要日曆不能使用。
3. 按「儲存並首次同步」，依 Google 畫面完成授權。
4. 行程很多時，前 40 筆安全保存後會寄出「首批 40 筆同步完成｜T-SCHOOL Schedule Sync」通知，此時可關閉側欄，程式會在背景分批完成；全部完成後會再寄「行程同步設定完成｜T-SCHOOL Schedule Sync」通知。
5. 到專用日曆抽查課程、日期、時間與地點。所有批次成功後，程式才會啟用自動觸發器並寄出設定完成通知。

## 使用與安全

網頁本身沒有帳號系統、後端或資料庫，不會直接修改日曆。實際讀取 API、寫入日曆、儲存同步狀態與寄信的是使用者 Google 帳號內的 Apps Script。

請務必：

- 使用只供本工具管理的專用日曆。
- 首次同步後人工對照學校資料，不要將本工具當成唯一課表來源。
- 不要公開 Apps Script 專案、通知 Email、Calendar ID 或含個人設定的程式碼。
- 在授權前確認 Google 帳號與權限範圍。

完整的安全與使用限制說明請閱讀 [SECURITY.md](SECURITY.md)。

完整同步流程、課綱、名稱防呆、續跑與故障處理請閱讀
[SYNC_MECHANISM.md](SYNC_MECHANISM.md)。

## 設定後操作

Google Sheet 的「行程同步」選單提供：

- 開啟設定
- 立即同步
- 暫停／恢復自動同步
- 查看同步狀態
- 強制修復
- 移除受管理事件

產生程式仍保留 `syncMyScheduleToCalendar()`、`forceFullSyncMyScheduleToCalendar()`、`setupAutoSyncTriggers()` 與 `deleteAutoSyncTriggers()` 等公開函式，供進階操作或除錯使用。

## 修改 HTML Email 版型

所有信件外框、文案、inline style 與通知種類設定集中在
[`notification-email-templates.json`](notification-email-templates.json)：

- `shell` 是所有通知共用的信件外框。
- `notifications` 內含一套標準行程調整格式，以及設定完成、每日成功摘要、同步失敗、課綱失敗、新學期、新項目與同步停止等版型。
- 一般 `{{value}}` 會先做 HTML 跳脫；`{{{content}}}`、`{{{changesHtml}}}` 與 `{{{itemsHtml}}}` 只用於插入由 manifest 本身產生的 HTML 區塊。
- 修改後需把檔案發布到目前的 GitHub Pages 網址。既有 `Code.gs` 不必重貼，最長約一小時後會自動取得新版；遠端檔案無法讀取時仍會寄純文字。

調整時應保留 `schemaVersion: 1`、既有通知 key 與所使用的變數名稱，並執行 `node tests/smoke-test.js`。

## 資料來源與限制

- 課表執行階段使用固定的 Google Apps Script API 部署網址；不使用已停止更新的舊課表 Google Sheet。
- HTML Email 版型由公開的 `notification-email-templates.json` 提供，產生的 `Code.gs` 不內嵌 HTML。版型更新後，已安裝程式會在快取到期（最長約一小時）後自動套用；下載失敗時改寄純文字。
- 課綱是獨立的補充來源。產生的 Apps Script 會讀取中央「課綱來源」索引，所以日後只要在索引新增或啟用新學期來源，不必重新產生既有 `Code.gs`。索引暫時失敗時沿用最後成功版本。
- 只有年級與日期符合已啟用來源組時，使用者自己的 Apps Script 才會讀取受校內帳號保護的課綱 Sheets；目前高一與高三不會觸發課綱讀取。
- 課綱依工作表分頁名稱、日期與節次精確配對。純非同步課程、過去課程與沒有課表事件的未開課課程不會加入行事曆說明。
- 課綱由獨立觸發器更新成最後成功快照，因此 Sheets 暫時失敗時仍可完成基本課表同步；第一次失敗會自動重試，重試仍失敗才寄信。
- 課程選單由 API 即時解析、清理與去重，不依賴大型課程別名字典。
- 課表格式、API 部署、Google 服務或帳號額度變更都可能使同步失敗。
- 來源故障、資料格式異常、學期不明或可疑的大量刪除會中止自動寫入，以保留日曆現狀。

## 專案結構

```text
.
├── index.html
├── styles.css
├── schedule-data.js
├── sidebar-template.js
├── code-template.js
├── notification-email-templates.json
├── app.js
├── assets/
│   └── t-school-control-panel-template.xlsx
├── vendor/
│   ├── lenis-1.3.25.min.js
│   └── LENIS-LICENSE.txt
├── README.md
├── SECURITY.md
├── AGENTS.md
├── CURRENT_DIRECTION.md
├── PROJECT_CONTEXT_FOR_AI.md
├── SYNC_MECHANISM.md
├── TESTING.md
├── design-qa.md
├── archive/
│   ├── UI_EXPLORATION_BRIEF.md
│   ├── MVP_IMPLEMENTATION_PLAN.md
│   ├── 部署後設定介面方案構想.md
│   └── visual-design-material3/
└── tests/
    └── smoke-test.js
```

`1Campus/` 只是本地資料比對與逆向分析素材，不是執行階段資料來源，也不納入版本控制。

`archive/` 保存過往規劃與視覺探索文件，目前不是執行階段的一部分。

## 本地開發

專案無 npm、無打包工具、無後端。由於設定器需讀取線上 API，建議用本地靜態伺服器開啟：

```bash
python3 -m http.server 8765
```

然後前往 <http://127.0.0.1:8765/>。

執行完整煙霧測試：

```bash
node tests/smoke-test.js
git diff --check
```

測試會檢查前端 JavaScript 語法、三個年級的 API 資料解析、設定器與 Apps Script 的解析結果一致性，以及最終產生的 `Code.gs` 語法。實際 Google Calendar 寫入、寄信、授權與觸發器仍需在 Google 帳號中進行整合測試。

## 問題回報

請在 GitHub repository 建立 issue，附上年級、課程或週次、執行動作與完整錯誤訊息。請勿公開 Calendar ID、私人 Email、授權畫面或其他可識別個人的資料。
