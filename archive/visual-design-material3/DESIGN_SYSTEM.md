# T-SCHOOL Schedule Sync Design System (Archived)

> 封存日期：2026-07-20。此文件在視覺探索階段不具約束力；若要恢復嚴格 Material Design 3 校正，再將它移回專案根目錄並重新設為 UI/UX source of truth。

本文件是 `configurator/` 的 UI/UX 單一真實來源。所有介面修改都必須先遵守本文件；`1Campus/` 僅是封裝產物，禁止作為視覺、元件或互動參考。

## 1. Design foundation

### Product intent

- 使用者：需要把 T-SCHOOL 課程同步到 Google Calendar 的高中生與教職員。
- 單一任務：完成設定、複製程式碼，並依步驟建立自動同步。
- 體驗原則：清楚、可靠、可回復；讓不熟悉 Apps Script 的使用者也知道下一步。

### Reference system

- 採用 Material Design 3 的 color role、type role、shape、elevation、state layer 與元件行為。
- 使用原生 HTML/CSS/JavaScript 實作，不引入 Material Web、MUI 或其他執行期依賴。
- 介面最低符合 WCAG 2.2 AA；主要操作目標以 44 × 44 CSS px 為設計基準。
- Material 3 是骨架，不是品牌。不得把畫面做成通用 Google 後台模板。

## 2. Brand direction

T-SCHOOL 的視覺語彙來自「課表格線、時間軌道、行程同步」，而不是一般校務系統。

- Primary / Tide teal: `#006A62`
- Primary container / Mint signal: `#8CF8E9`
- Surface / Mist: `#F5FBF9`
- On surface / Ink: `#17201E`
- Secondary / Slate green: `#4A635F`
- Error / Signal red: `#BA1A1A`

青綠色只用於主要操作、已選狀態、焦點及同步進度。深色輸出區是「產出軌道」，用來與設定區建立清楚的工作階段區隔。

## 3. Tokens

所有視覺值應從 `configurator/styles.css` 的 `:root` token 取得。

### Token layers

1. `--md-sys-color-*`：Material 3 語意色彩角色。
2. `--md-sys-typescale-*`：介面文字角色。
3. `--md-sys-shape-*`：元件圓角。
4. `--md-sys-elevation-*`：層級陰影。
5. `--space-*`：4px 基準的間距系統。

不得在新元件中直接加入未命名色彩、陰影或任意圓角。若現有 token 無法表達需求，先擴充 token，再使用它。

## 4. Typography

- Display / headings：`"PingFang TC", "Noto Sans TC", system-ui, sans-serif`，使用較緊字距與 700–800 字重。
- Body / controls：相同的繁體中文無襯線系統字，以 400、600、700 建立層次。
- Code / technical identifiers：`"SFMono-Regular", Consolas, monospace`。
- 介面文字採 sentence case；按鈕使用明確動詞，例如「複製」、「清除」、「展開」。

## 5. Components

### Buttons

- Primary：僅用於畫面當下最重要的動作，目前是「複製」。
- Tonal：次要但明確的動作，例如「清除」。
- Text：展開、收合、自訂時段等低強度操作。
- Icon button：可見圖示可小於 24px，但可操作區不得小於 40px，目標為 44px。

### Fields

- 採 M3 outlined field：56px 高、12px 圓角、外部永久標籤。
- placeholder 只能提供格式範例，不能取代 label。
- 錯誤狀態必須同時顯示色彩、符號與可理解文字。
- disabled 與 readonly 必須視覺上可辨認。

### Selection controls

- 年級使用 single-select segmented button。
- 同步時段、課程細項使用 filter chip／selectable card。
- 全校活動使用 switch。
- 所有選取元件都必須具有 checked、hover、focus-visible 與 disabled 狀態。

### Surfaces

- Section 使用低層 surface container，不用厚重邊框或浮誇陰影。
- 課程卡用 outline 表示邊界，選取後才使用 primary container。
- Toast 用 inverse surface，訊息必須描述已完成的動作。

## 6. Interaction and motion

- 狀態轉換使用 120–240ms；只使用 ease 或 emphasized easing。
- hover 只能補強可操作性，不能承載必要資訊。
- focus-visible 使用至少 3px 的高對比外框。
- 遵守 `prefers-reduced-motion: reduce`，移除非必要動畫與位移。
- 不因 focus 自動提交、切頁或改變大量內容。

## 7. Responsive behavior

- `> 980px`：設定與程式碼雙欄，各自捲動。
- `641–980px`：單欄文件流，程式碼接續在設定後方。
- `<= 640px`：單欄欄位與課程卡；年級 segmented button 仍維持三欄。
- 320px 寬不得產生水平頁面捲動；可水平捲動的 filter chip 列除外。

## 8. Accessibility acceptance checklist

- [ ] Tab 可走訪所有控制項，焦點順序符合視覺順序。
- [ ] 所有控制項皆有可存取名稱、角色與狀態。
- [ ] 文字與互動元件對比符合 WCAG 2.2 AA。
- [ ] 不以顏色作為唯一狀態訊號。
- [ ] 指標操作目標至少符合 24 × 24px，主要控制項達 44 × 44px。
- [ ] 200% 縮放與 320px viewport 仍可操作。
- [ ] 錯誤、空白、成功與 disabled 狀態皆有明確說明。
- [ ] `prefers-reduced-motion` 下沒有非必要動畫。

## 9. Change rules

新增或修改 UI 時：

1. 先確認是否已有可重用的 component 或 token。
2. 說明變更對使用者任務的幫助。
3. 同時完成 desktop、tablet、mobile 與 keyboard 狀態。
4. 以真實課程名稱和真實說明驗證，不用 lorem ipsum。
5. 完成語法檢查、可存取性檢查與實際畫面截圖檢查。
