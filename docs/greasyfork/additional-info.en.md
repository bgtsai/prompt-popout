Keep the prompts you use all the time one hover away. Prompt Popout puts a slim handle next to the chat box on **Claude**, **ChatGPT** and **Gemini**. Hover over it to bring up your saved prompts, then click one to drop it into the chat box.

![Prompt Popout menu](https://raw.githubusercontent.com/bgtsai/prompt-popout/main/docs/img/menu.en.png)

## Features

- **Fill-in blanks** — put `[blank]` in a prompt and you'll be asked what to put there before it's inserted.
- **Auto-send** — optionally hit send for you once the text is in.
- **Tags** — sort prompts with coloured tags and filter the list with a click.
- **Import / export** as a JSON file.
- **Samples to start with** — six sample prompts and three tags on first install.
- Interface in English or Traditional Chinese, following your browser's language.

## Fill-in blanks in one example

```
Translate the text below into [language::English], in a [tone](e.g. formal, casual) tone.
```

Click it and you're asked for *language* (already filled with English) and *tone*:

![Fill-in window](https://raw.githubusercontent.com/bgtsai/prompt-popout/main/docs/img/fill.en.png)

The chat box gets the finished sentence:

![Chat box after filling in](https://raw.githubusercontent.com/bgtsai/prompt-popout/main/docs/img/filled.en.png)

| Write | What you get |
|---|---|
| `[name]` | a blank called *name* |
| `[name::Bob]` | starts out filled with *Bob* |
| `[name](who to greet)` | shows the hint *who to greet* |

## Privacy

Your prompts stay in Tampermonkey in your own browser and are never sent anywhere.

Full documentation and source: [github.com/bgtsai/prompt-popout](https://github.com/bgtsai/prompt-popout)
