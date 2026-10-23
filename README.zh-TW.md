[Switch to English](README.md)

# Prompt Popout

一支 Tampermonkey 使用者腳本：在 **Claude**、**ChatGPT**、**Gemini** 的輸入框左側加一個細長把手，滑鼠移上去就彈出你存好的提示詞，點一下就填入。

![Prompt Popout 清單](docs/img/menu.zh-TW.png)

## 功能

- **輸入卡片上的把手**：卡片左側長出一小塊區域，中間是膠囊形把手；滑過或清單開著時變成橘色。
- **彈出清單**：開在把手右側、對齊滑鼠當下的高度。滑過即開，也可以點擊（觸控裝置）。
- **填空欄位**：提示詞裡寫 `[欄位]`，填入前會先問你要填什麼。
- **自動送出**：可設定填入後自動按下送出。
- **標籤**：有顏色的標籤；在清單點標籤可篩選（必須同時擁有所有選取的標籤）。
- **匯入／匯出**：用 JSON 檔備份或搬移提示詞。
- 介面依瀏覽器語言顯示繁體中文或英文。

## 安裝

1. 安裝 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打開這個連結並確認安裝：[prompt_popout.user.js](https://raw.githubusercontent.com/bgtsai/prompt-popout/main/prompt_popout.user.js)

之後 Tampermonkey 會自動更新。

## 使用方式

- 滑鼠移到輸入框左側的把手開啟清單，點提示詞即填入。
- 清單底部的「管理…」（或 Tampermonkey 選單 →「管理提示詞」）開啟管理視窗：新增、編輯、刪除、排序、標籤、匯入、匯出。

### 填空語法

只有勾選「使用填空」的提示詞才會詢問欄位。

| 寫法 | 意思 |
|---|---|
| `[名字]` | 一個叫「名字」的欄位 |
| `[名字::小明]` | 有預設值的欄位 |
| `[名字](要稱呼誰)` | 旁邊顯示說明文字的欄位 |
| `[名字::小明](要稱呼誰)` | 兩者併用 |

同名欄位只問一次，所有出現的地方都會換成同一個值。

## 從其他工具搬移提示詞

`tools/convert.html` 可以把舊格式（`{title, text, usePlaceholders, autoExecute, tags}` 陣列）的 JSON 匯出檔，轉成 Prompt Popout 能匯入的檔案。下載這個檔案、用瀏覽器打開、選擇你的匯出檔，再到管理視窗匯入轉好的檔案。全程離線。

## 說明

- 已在 Chromium、Firefox、WebKit 的模擬頁面測試。網站會不定期改版，若把手不見了，請開 issue 回報。
- 資料只存在 Tampermonkey 這支腳本自己的本機儲存空間。

## 授權

[MIT](LICENSE)
