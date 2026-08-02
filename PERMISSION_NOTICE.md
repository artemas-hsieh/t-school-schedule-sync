# 權限說明｜為什麼需要這些權限？

T-SCHOOL Schedule Sync 會讀取課表與課綱、更新專用 Google Calendar、寄送通知，並在你關閉控制臺後繼續自動同步，因此 Google 會要求相關權限。

程式在你的 Google Docs 控制臺副本與 Google 帳號中執行；專案作者不會因你授權而取得你的帳號、文件、日曆或信箱存取權。目前程式只會：

1. 使用這份 Google Docs 顯示選單與控制臺，不存取其他 Google Docs。
2. 讀取指定的課表與適用課綱；Google Sheets 權限是唯讀，不能修改試算表。
3. 建立或管理你選擇的非主要專用 Calendar，並更新本工具管理的行程。
4. 用你的帳號寄送通知，但不能讀取 Gmail；程式也會確認目前帳號的 Email、連線至指定來源，並建立自動同步排程。

Google Sheets 唯讀權限不能再限定為幾份指定的既有檔案，因此授權畫面可能顯示可檢視你能開啟的所有試算表；本程式只會開啟指定的課綱來源，且改用唯讀 Sheets API，不使用會要求完整權限的 `SpreadsheetApp.openById()`。

## 你可以自行檢查

- 到「擴充功能」→「Apps Script」→「總覽」查看 [OAuth 權限](https://developers.google.com/apps-script/concepts/scopes)；Google Sheets 應為唯讀，不應出現 Google Drive、讀取 Gmail、修改 Google Sheets 或存取所有 Google Docs。
- 查看完整程式碼，確認 `Code.gs` 開頭有 `@OnlyCurrentDoc`；也可請信任且具資訊能力的人或 AI 協助檢查。
- 不要分享控制臺的編輯權限；編輯者可以修改程式行為。

如果授權畫面與以上說明不符，或你無法確認母版來源，請先不要授權。

停止使用時，請先關閉自動同步；若不想保留行程，再移除受管理事件。之後可前往 [Google 帳戶的第三方連結](https://myaccount.google.com/connections)，選擇本工具、查看詳細資料並「移除存取權」。[Google 官方撤銷授權教學](https://support.google.com/accounts/answer/13533235?hl=zh-Hant)

撤銷授權不會自動刪除已同步到 Calendar 的行程。
