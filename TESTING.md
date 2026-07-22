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
node --check configurator/schedule-data.js
node --check configurator/sidebar-template.js
node --check configurator/code-template.js
node --check configurator/app.js
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
- `code-template.js`。
- 產生的 Apps Script。
- 安裝器與執行階段共用行為。
- 可能影響課程、活動、事件範圍或產生程式碼語法的修改。

冒煙測試會檢查介面模板基本條件、產生程式碼語法，以及在 fixture 存在時比較安裝器與執行階段的解析結果。若高一、高二或高三 fixture 缺失而被跳過，必須在完成回報中說明，不得將跳過項目視為通過。

## 產生程式碼驗證

修改 `sidebar-template.js`、`code-template.js` 或設定序列化時，應確認：

1. 在 Node 中載入 `sidebar-template.js` 與 `code-template.js`。
2. 使用代表性 settings 呼叫 `window.buildAppsScriptCode(settings)`。
3. 將結果傳入 `new Function()`。

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

- 不會寫入主要 Calendar。
- 一般同步不會無故覆蓋來源未變時的使用者手動修改。
- 可疑大量刪除會停止自動執行。
- 刪除工具只處理受管理事件。
- Calendar 切換遵循先建立新 Calendar 事件、再清理舊 Calendar 的順序。
- 設定與 `SYNC_STATE` 遷移不會遺失可復原所需資訊。
- 失敗通知不會掩蓋原始同步錯誤。

若本機無法實際呼叫 Google Calendar，應以可執行的單元／整合測試或程式路徑檢查代替，並明確列出尚未實際驗證的外部行為。

## UI 行為與無障礙

修改 UI 互動、版面或動態時，依受影響範圍檢查：

- 受影響的主要互動流程。
- 鍵盤操作與合理的焦點順序。
- focus 狀態是否可見。
- 表單驗證、錯誤訊息與狀態轉換。
- reduced-motion fallback。
- 觸控使用情境。
- 水平溢出、裁切、遮擋、缺少元素、瀏覽器錯誤與明顯響應式破損。

需要時使用真實課程名稱，並從桌面、平板、手機與 320 px 寬度中選擇與變更相關的 viewport。除非使用者明確要求，不進行耗時的逐像素比對或大量重複截圖。

主觀項目交由使用者最終目視確認，包括：

- 視覺層級。
- 間距與對齊。
- 對比與品牌一致性。
- 動態節奏。
- 響應式構圖。

完成回報應列出仍需使用者確認的主觀項目。

## 結果回報

完成時簡要列出：

- 已執行的指令或檢查。
- 通過、失敗或跳過的結果。
- 失敗是否由本次修改造成。
- 因環境、fixture 或外部服務限制而未完成的驗證。

不得在測試未執行、被跳過或結果不完整時宣稱「所有測試通過」。
