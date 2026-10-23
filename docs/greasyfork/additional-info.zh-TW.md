常用的提示詞存起來，要用的時候不必再複製貼上。安裝後，**Claude**、**ChatGPT**、**Gemini** 的輸入框左邊會多一條把手，滑鼠移過去就跳出你的提示詞清單，點一下就填進輸入框。

<img src="https://raw.githubusercontent.com/bgtsai/prompt-popout/main/docs/img/menu.zh-TW.png" alt="Prompt Popout 清單" width="520">

## 功能

- **填空**：提示詞裡寫 `[空格]`，填入前會先跳出視窗讓你填。
- **自動送出**：填好後可以直接幫你按送出。
- **標籤**：用不同顏色的標籤分類，點一下就能篩選清單。
- **匯入／匯出**：用 JSON 檔備份或搬移。
- **一開始就有範例**：第一次安裝會放入六筆範例提示詞和三個標籤。
- 介面語言跟著瀏覽器：中文顯示繁體中文，其他都是英文。

## 用一個例子看懂填空

```
把下面這段翻成[語言::英文]，語氣要[語氣](例如：正式、輕鬆)。
```

點下去會先問「語言」（已先填好英文）和「語氣」：

<img src="https://raw.githubusercontent.com/bgtsai/prompt-popout/main/docs/img/fill.zh-TW.png" alt="填空視窗" width="600">

輸入框拿到的是已經換好的句子：

<img src="https://raw.githubusercontent.com/bgtsai/prompt-popout/main/docs/img/filled.zh-TW.png" alt="填好後的輸入框" width="600">

| 寫法 | 效果 |
|---|---|
| `[名字]` | 一格叫「名字」的空格 |
| `[名字::小明]` | 預先填好「小明」 |
| `[名字](要稱呼誰)` | 旁邊多一行提示「要稱呼誰」 |

## 隱私

提示詞只存在你自己瀏覽器的 Tampermonkey 裡，不會傳到任何地方。

完整說明與原始碼：[github.com/bgtsai/prompt-popout](https://github.com/bgtsai/prompt-popout)
