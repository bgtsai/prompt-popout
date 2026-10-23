[切換中文](README.zh-TW.md)

# Prompt Popout

A Tampermonkey userscript that adds a slim handle to the left of the chat input on **Claude**, **ChatGPT** and **Gemini**. Hover the handle and your saved prompts pop out; click one to insert it.

![Prompt Popout menu](docs/img/menu.en.png)

## Features

- **Handle on the input card** — the card grows a small block on its left with a pill-shaped handle. It takes the site's accent colour (orange on Claude, black on ChatGPT, blue on Gemini) while you hover or while the list is open.
- **Pop-out list** — opens next to the handle at the height of your mouse pointer. Hover to open, or click (for touch devices).
- **Fill-in fields** — write `[field]` in a prompt and you are asked for the value before it is inserted. On by default for new prompts.
- **Auto-send** — optionally press send for you once the text is in.
- **Tags** — colour-coded tags; click tags in the list to filter (a prompt must have every selected tag).
- **Import / export** — back up or move your prompts as a JSON file.
- **Built-in help** — short *Details* links in the editor explain fill-in fields and auto-send with examples.
- Interface in English or Traditional Chinese, chosen automatically from your browser language.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open this link and confirm the install: [prompt_popout.user.js](https://raw.githubusercontent.com/bgtsai/prompt-popout/main/prompt_popout.user.js)

Updates are picked up automatically by Tampermonkey.

## Usage

- Hover the handle on the left of the chat input to open the list; click a prompt to insert it.
- **Manage…** at the bottom of the list (or the Tampermonkey menu → *Manage prompts*) opens the manager: add, edit, delete, reorder, tags, import and export.
- In the editor, **New tag…** creates a tag without leaving the prompt you are editing.

![Prompt editor](docs/img/editor.en.png)

### Fill-in syntax

Fields are only asked for when **Use fill-in fields** is ticked for that prompt.

| Write | Meaning |
|---|---|
| `[name]` | a field called *name* |
| `[name::Bob]` | field with a default value |
| `[name](who to greet)` | field with a hint shown next to it |
| `[name::Bob](who to greet)` | both |

A field name used more than once is asked only once and fills every occurrence.

Example: `Translate into [language::English], [tone] tone.` → you are asked for *language* (pre-filled with English) and *tone*.

If a prompt contains square brackets that are not fields (for example a Markdown link `[text](url)`), untick **Use fill-in fields** for that prompt.

## Moving prompts from another tool

`tools/convert.html` converts a JSON export in the older `{title, text, usePlaceholders, autoExecute, tags}` array format into a file Prompt Popout can import:

1. Download [convert.html](tools/convert.html) and open it in your browser (it runs entirely offline, in English or Chinese depending on your browser).
2. Pick your export file and click **Convert & download**.
3. In Prompt Popout open **Manage…** → **Import** and pick the downloaded file. Imported prompts are added after your existing ones; tags are matched by name.

## Notes

- Tested on simulated pages in Chromium, Firefox and WebKit. The sites change their markup from time to time; if the handle disappears, please open an issue.
- Data is stored only in Tampermonkey's local storage for this script.

## License

[MIT](LICENSE)
