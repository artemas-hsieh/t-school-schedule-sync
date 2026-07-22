# Design QA

## 範圍

- 參考：使用者提供的步驟卡片截圖、課表來源狀態截圖與本輪六項互動修正。
- 實作：`configurator/` 靜態設定流程。
- 桌面驗證 viewport：1440 × 900。

## 視覺證據

- 步驟 1–4 對照：`design-qa/comparison-all-steps.png`
- 課表讀取成功對照：`design-qa/comparison-source-status.png`
- 第一步成功狀態：`design-qa/implementation-step1-success.png`
- 參考圖與當前按鈕對照：`design-qa/comparison-connectors-v2.png`
- 當前／已使用按鈕的模糊層級：`design-qa/implementation-connectors-current-vs-past.png`
- 捲動邊界：`design-qa/scroll-boundary-step1.png`
- 按鈕文字置中：`design-qa/button-alignment.png`

## 檢查結果

- 第一步不預選年級且不再顯示完成按鈕；選擇年級後會等待課表成功載入，再自動前往第二步。
- 課表來源狀態在未選年級時為透明白底、讀取中使用 `--surface-loading` 淺橘色、成功後使用原有 `--surface-green` 綠色。
- 第二步前往第三步的捲動目標改用不受 reveal transform 影響的文件座標；1440 × 900 實測最終位置單向收斂至 y=3614，未再出現滑過頭後反向校正。
- 桌面捲動邊界以獨立的原始 overscroll 狀態計算非線性位移，停止輸入後再交由單一 Lenis 動畫回彈；實測單次、連續三次與回彈中反向捲動皆為 0 次方向反轉，並穩定回到 y=2898。
- 卡片間連接線直接接觸相鄰卡片，完成按鈕量測中心與兩卡間距中心均為 y=709；當前卡片下方的按鈕保持清楚，當前卡片上方已使用過的按鈕則連同上段線條納入 progressive blur，下段線條在接近當前卡片時逐漸變清楚。
- 未填 Email 時，第四步摘要顯示錯誤色的「未填寫」，不再宣稱可讀取目前 Google 帳號。
- 課程與活動選項沿用同一共用按鈕結構，文字置中，hover、active、focus 與 reduced-motion 狀態一致。
- 第一步自動前進與第二至第四步按鈕前進均保留標題焦點；reduced-motion 模式改為立即定位與立即回彈。
- 未發現水平溢出、裁切、元素遮擋或瀏覽器錯誤。

## 修正紀錄

- P1：步驟 2 → 3 動畫使用受 transform 影響的量測，造成先超過目標再回正；已改用穩定文件座標。
- P1：舊捲動阻力會在 Lenis 更新期間反覆把已受阻的位置重新套入公式，且回彈開始後仍可能接收新的慣性目標，造成上下抽動；已改為攔截 Lenis virtual scroll、累積單一 overscroll 狀態並以 motion id 取消過期回彈。
- P2：連接線原本未完整接觸上下卡片且圖層與模糊遮罩混在一起；已拆分線段與按鈕層級並補足連接長度。
- P2：成功狀態曾依前一版需求改為橘色；依使用者最新指示恢復原有綠色，橘色只保留給讀取中。

## 目視邊界

- 字體精確字級、像素級間距與整體美感仍由使用者依實機畫面做最終判斷；本輪不做逐像素複製。

final result: passed
