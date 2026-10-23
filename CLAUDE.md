# Prompt Popout — 工作守則

- 主檔：`prompt_popout.user.js`（自寫腳本，版號 major.minor.patch，任何改動都要 bump `@version`）。
- 轉檔工具：`tools/convert.html`（舊格式 JSON → 本腳本匯入格式），介面語言跟腳本一樣依瀏覽器自動選。
- 規格：`docs/SPEC.zh-TW.md`。v1.0.0 是只依這份規格、由沒看過任何既有程式碼的一方實作的；之後改功能時同步更新規格。把手外觀（第 5 節）是使用者逐項定案的，不要任意更動。
- 儲存鍵只有 `pp.prompts`、`pp.tags`；DOM／CSS 一律 `pp-` 前綴。

## 測試（改完必跑）

```
npm i acorn acorn-walk                      # 只有 check.js 需要
node tests/check.js prompt_popout.user.js   # 語法、同作用域重複宣告、作用域鏈上看不到的識別字
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/regress.js [腳本] [截圖目錄]   # 三引擎 × 三網站模擬頁
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/convert_import.js             # 轉檔 → 匯入 → 匯出
node tests/shot.js                          # 重產 README 截圖 docs/img/（清單、編輯頁、填空視窗、填好的輸入框，中英各一）
```

模擬頁不含 Claude 的圖示字型，Claude 上的 Enter 圖示在測試截圖裡會顯示成缺字，實機正常。真實網站的選擇器要實機確認。
