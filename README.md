[切換中文](README.zh-TW.md)

# Prompt Popout

A Tampermonkey userscript that adds a slim handle to the left of the chat input on **Claude**, **ChatGPT** and **Gemini**. Hover the handle and your saved prompts pop out; click one to insert it.

![Prompt Popout menu](docs/img/menu.en.png)

## Features

- **Handle on the input card** — the card grows a small block on its left with a pill-shaped handle. It takes the site's accent colour (orange on Claude, black on ChatGPT, blue on Gemini) while you hover or while the list is open.
- **Pop-out list** — opens next to the handle at the height of your mouse pointer. Hover to open, or click (for touch devices).
- **Fill-in fields** — write `[field]` in a prompt and you are asked for the value before it is inserted.
- **Auto-send** — optionally press send for you once the text is in.
- **Tags** — colour-coded tags; click tags in the list to filter (a prompt must have every selected tag).
- **Import / export** — back up or move your prompts as a JSON file.
- Interface in English or Traditional Chinese, following your browser language.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open this link and confirm the install: [prompt_popout.user.js](https://raw.githubusercontent.com/bgtsai/prompt-popout/main/prompt_popout.user.js)

Updates are picked up automatically by Tampermonkey.

## Usage

- Hover the handle on the left of the chat input to open the list; click a prompt to insert it.
- **Manage…** at the bottom of the list (or the Tampermonkey menu → *Manage prompts*) opens the manager: add, edit, delete, reorder, tags, import and export.

### Fill-in syntax

Fields are only asked for when **Use fill-in fields** is ticked for that prompt.

| Write | Meaning |
|---|---|
| `[name]` | a field called *name* |
| `[name::Bob]` | field with a default value |
| `[name](who to greet)` | field with a hint shown next to it |
| `[name::Bob](who to greet)` | both |

A field name used more than once is asked only once and fills every occurrence.

## Moving prompts from another tool

`tools/convert.html` converts a JSON export in the older `{title, text, usePlaceholders, autoExecute, tags}` array format into a file Prompt Popout can import. Download the file, open it in your browser, pick your export, and import the result in the manager. It runs entirely offline.

## Notes

- Tested on simulated pages in Chromium, Firefox and WebKit. The sites change their markup from time to time; if the handle disappears, please open an issue.
- Data is stored only in Tampermonkey's local storage for this script.

## License

[MIT](LICENSE)
