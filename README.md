# T-SCHOOL 課表同步

把學校 Google Sheets 課表同步到自己的 Google 日曆。

這個工具是給 T-SCHOOL 高一到高三學生使用的。你不用會寫程式，只要照著設定頁面選年級、課程和通知時間，就可以產生一段可以貼到 Google Apps Script 的程式碼，之後它會幫你把課表放進 Google 日曆。

## 這個工具可以做什麼

- 把你選的課程同步到 Google 日曆。
- 支援高一、高二、高三課表。
- 支援合併儲存格、跨節課、地點資訊。
- 可以同步全校活動與重要公告。
- 可以每天自動同步，不用自己一直重跑。
- 可以寄 Email 通知同步成功、同步失敗或新調課。
- 偵測到新的調課公告時，只通知新的調課。

## 使用前要準備

你需要準備這些東西：

1. 學校課表的 Google Sheets 連結。
2. 你的 Google 帳號。
3. 一個專門放課表的 Google 日曆。
4. 這個專案資料夾裡的設定產生器。

建議你另外建立一個新的 Google 日曆，例如叫做「T-SCHOOL 課表」。不要直接同步到你平常主要使用的日曆，這樣之後要刪除或重設會比較安全。

## 第一步：打開設定產生器

打開這個檔案：

```text
configurator/index.html
```

你可以直接用瀏覽器打開它。這個頁面不會登入你的 Google 帳號，也不會把你的資料傳出去；它只是在你的電腦上幫你產生程式碼。

## 第二步：填寫設定

在設定產生器裡依序填：

- `Google Sheets 課表連結`：貼上學校課表連結。
- `Google Calendar ID`：填入你要同步到的日曆 ID。
- `年級`：選高一、高二或高三。
- `通知 Email`：想收到通知才需要填。
- `每日同步時段`：選你希望每天自動同步的時間。
- `成功通知時段`：如果有填通知 Email，可以選哪個時段寄成功通知。
- `課程`：勾選你要同步的課。
- `同步全校性活動與重要公告`：想把全校活動也放進日曆就打開。

右側會自動產生完整的 `Code.gs` 程式碼。

## 如何取得 Google Calendar ID

1. 打開 Google 日曆。
2. 左側找到你要放課表的日曆。
3. 點日曆旁邊的三個點，進入「設定和共用」。
4. 往下找到「整合日曆」。
5. 複製「日曆 ID」。

如果你使用的是自己的主要日曆，日曆 ID 可能會像 Email；如果是另外建立的日曆，通常會是一長串文字。

## 第三步：建立 Apps Script 專案

1. 打開 Google Apps Script。
2. 建立一個新的專案。
3. 把預設的程式碼全部刪掉。
4. 從設定產生器複製右側產生的完整程式碼。
5. 貼到 Apps Script 的 `Code.gs`。
6. 儲存專案。

專案名稱可以取成「T-SCHOOL 課表同步」或你自己看得懂的名字。

## 第四步：先預覽解析結果

在 Apps Script 上方的函式選單中，選：

```text
previewParsedEvents
```

然後按「執行」。

第一次執行時，Google 會要求授權。這是因為程式需要讀取 Google Sheets、寫入你的 Google 日曆，以及寄通知 Email。

授權後，打開 Apps Script 的執行紀錄，檢查解析出的課程是否看起來正確。建議先確認：

- 課程名稱對不對。
- 日期對不對。
- 節次對不對。
- 地點有沒有被正確放進去。
- 沒有出現一堆你不想同步的課。

## 第五步：第一次同步

確認預覽結果沒問題後，選：

```text
syncMyScheduleToCalendar
```

然後按「執行」。

執行成功後，打開你的 Google 日曆確認課程有沒有出現。

## 第六步：設定每日自動同步

確認第一次同步沒問題後，選：

```text
setupAutoSyncTriggers
```

然後按「執行」。

之後程式會依照你在設定產生器中勾選的時間自動同步。

## 常用函式

你在 Apps Script 裡常會用到這幾個函式：

| 函式名稱 | 用途 |
| --- | --- |
| `previewParsedEvents` | 預覽會同步哪些課程，不會真的寫入日曆 |
| `syncMyScheduleToCalendar` | 立刻同步課表到 Google 日曆 |
| `syncMyScheduleToCalendarWithNotification` | 立刻同步，並寄成功通知 |
| `setupAutoSyncTriggers` | 建立每日自動同步 |
| `deleteAutoSyncTriggers` | 刪除每日自動同步 |
| `quickDeleteSyncedCalendarEvents` | 刪除今天以後由本工具同步出的行程 |
| `quickDeleteAllCalendarEvents` | 刪除目標日曆中設定年份範圍內的所有行程 |
| `resetSyncState` | 清除同步紀錄，通常在重設時使用 |

## 調課通知

如果學校課表上方公告區出現類似這種文字：

```text
課程名稱：5/8第34節調整為5/11第78節
```

程式會嘗試偵測並寄出通知，例如：

```text
「自然進階(一)_生物」2026/5/8 3-4 節 → 2026/5/11 7-8 節
```

目前主要支援「時間調整」類型的調課。單純改地點、停課、自由文字公告不一定會被偵測到。

老師如果多打空格或換行，程式也會盡量判斷，例如：

```text
課程名稱：
5 / 8 第 34 節
調整 為 5 / 11 第 78 節
```

## 如果課表怪怪的怎麼辦

可以先照這個順序檢查：

1. 回設定產生器確認年級和課程有沒有選錯。
2. 確認 Google Sheets 課表連結是否正確。
3. 重新複製產生器右側的程式碼，貼到 Apps Script。
4. 先執行 `previewParsedEvents`，不要急著同步。
5. 如果已經同步出錯，可以先用 `quickDeleteSyncedCalendarEvents` 刪除今天以後由本工具建立的行程。

## 注意事項

- 建議使用專門的 Google 日曆放課表。
- 不要把不確定用途的刪除函式亂按，尤其是 `quickDeleteAllCalendarEvents`。
- 如果學校課表格式大幅改版，解析結果可能會不正確。
- 如果你修改了設定產生器裡的設定，記得重新複製新的程式碼到 Apps Script。
- 這個工具只會同步你設定要同步的課程與活動，不會自動知道你真正選課結果。

## 專案檔案簡介

| 檔案或資料夾 | 說明 |
| --- | --- |
| `configurator/index.html` | 設定產生器頁面 |
| `configurator/app.js` | 設定產生器的互動邏輯和課程清單 |
| `configurator/code-template.js` | 產生 Apps Script 程式碼的範本 |
| `configurator/styles.css` | 設定產生器的樣式 |
| `configurator/gemini-code-1778375297203.js` | 課程與活動判斷用的資料 |
| `PROJECT_CONTEXT_FOR_AI.md` | 給 AI 協作時看的專案脈絡 |

## 隱私說明

設定產生器本身是靜態網頁，不會登入 Google、不會呼叫 Google API，也不會儲存你的資料。

真正讀取課表、寫入日曆、寄 Email 的動作，是在你自己的 Google Apps Script 專案中執行。授權時請確認你使用的是自己的 Google 帳號，以及目標日曆是你想同步課表的日曆。
