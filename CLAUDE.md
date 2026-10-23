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

## 目前狀態（交接，2026-10-23）

- 最新版本 **v1.3.1**（commit 2215180 之後只動過 README／說明檔）。功能：把手＋彈出清單、填空（新增預設勾選）、自動送出、標籤（編輯頁可直接新增標籤）、匯入匯出、編輯頁「詳細說明」（填空、自動送出）、第一次安裝放入中英文範例、介面依瀏覽器語言中／英。
- 已發表到 Greasy Fork：https://greasyfork.org/en/scripts/601742-prompt-popout ，「管理」頁設定為**自動同步**——腳本與 `docs/greasyfork/additional-info.en.md`／`.zh-TW.md` 都從本 repo 的 raw 網址同步，推送 main 即可，不用回 Greasy Fork 貼。標頭的 `@name:zh-TW`／`@description:zh-TW` 必須保留（有中文說明就必須有中文名稱）。在 Greasy Fork 上操作要用 Chrome（Firefox 上部分按鈕沒反應）。
- 改 README 截圖或說明檔截圖：`node tests/shot.js` 重拍；Greasy Fork 說明檔的圖用 `<img width="原圖寬一半">`。
- 尚未實機確認：ChatGPT、Gemini 的真實選擇器；Claude 實機上的 Enter 圖示。使用者回報異常時先請他截圖或用 $0 抓元素。
- 沒有排定的下一步，等使用者提新需求。
