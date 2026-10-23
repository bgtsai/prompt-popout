// ==UserScript==
// @name               Prompt Popout
// @name:zh-TW         Prompt Popout 提示詞快選
// @namespace          https://github.com/bgtsai
// @version            1.4.0
// @author             bgtsai
// @description        Adds a handle to the left of AI chat inputs; hover it to pop out your saved prompts and click one to insert it.
// @description:zh-TW  在 AI 聊天輸入框左側加一個把手，滑過即彈出已存的提示詞清單，點選即填入。
// @license            MIT
// @homepageURL        https://github.com/bgtsai/prompt-popout
// @supportURL         https://github.com/bgtsai/prompt-popout/issues
// @updateURL          https://raw.githubusercontent.com/bgtsai/prompt-popout/main/prompt_popout.user.js
// @downloadURL        https://raw.githubusercontent.com/bgtsai/prompt-popout/main/prompt_popout.user.js
// @match              *://claude.ai/*
// @match              *://chatgpt.com/*
// @match              *://gemini.google.com/*
// @grant              GM_getValue
// @grant              GM_setValue
// @grant              GM_registerMenuCommand
// @run-at             document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ───────────────────────── 常數 ─────────────────────────

  const LOG_PREFIX = '[PromptPopout]';
  const SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '?';

  // 只用這兩個儲存鍵（規格第 10 節），不得新增其他鍵
  const STORE_PROMPTS = 'pp.prompts';
  const STORE_TAGS = 'pp.tags';

  const EXPORT_FORMAT = 'prompt-popout';
  const EXPORT_VERSION = 1;

  const DEFAULT_TAG_BG = '#7071fc';
  const DEFAULT_TAG_FG = '#ffffff';
  const ACCENT_COLOR = '#d97757';            // 主按鈕色
  // 把手 hover／清單開啟時的顏色，跟各站主色走（使用者指定）：
  // Claude 陶土橘；ChatGPT 主色是黑（深色主題反過來用白，否則黑底看不到）；Gemini 沒有明顯主色，用 Google 藍（深色主題用淺藍）
  const SITE_ACTIVE_COLOR = {
    claude: { light: '#d97757', dark: '#d97757' },
    chatgpt: { light: '#000000', dark: '#ffffff' },
    gemini: { light: '#0b57d0', dark: '#a8c7fa' },
  };

  const CARD_SEARCH_MAX_DEPTH = 12;          // 從輸入框往上找卡片的最大層數
  const CARD_MIN_CORNER_RADIUS_PX = 8;       // 卡片右下角圓角門檻
  const FALLBACK_RADIUS_PX = 14;             // 讀不到圓角時的預設值
  const PILL_WIDTH_PX = 6;                   // 燈條寬（必須偶數才能在偶數寬區塊中正中）
  const PILL_HALF_PX = PILL_WIDTH_PX / 2;
  const TRIGGER_OUTER_SLACK_PX = 4;          // 觸發區往卡片外多放寬的距離
  const POPUP_GAP_PX = 4;                    // 清單與把手的間距
  const POPUP_MOUSE_FROM_BOTTOM_PX = 24;     // 開啟時滑鼠高度落在清單下緣往上多少
  const VIEWPORT_MARGIN_PX = 8;              // 清單與視窗邊緣最小距離
  const RECOMPUTE_EVERY_FRAMES = 60;         // 約每秒重算一次顏色與圓角

  const OPEN_DELAY_MS = 250;                 // 進入觸發區後延遲開啟（ms）
  const CLOSE_DELAY_MS = 350;                // 離開後延遲關閉（ms）
  const SEND_POLL_INTERVAL_MS = 100;         // 輪詢送出鈕間隔（ms）
  const SEND_POLL_TIMEOUT_MS = 4000;         // 等送出鈕的上限（ms）
  const TOOLTIP_MAX_CHARS = 300;

  const CLAUDE_ENTER_GLYPH = '';       // Claude 圖示字型中的 Enter；首頁送出鈕的 U+E013 是另一個，不可混用

  // 依賴網站 DOM 的選擇器集中於此；每項都是依序嘗試的陣列
  const SITE_SELECTORS = {
    claude: {
      input: ['div[data-testid="chat-input"]', 'div.ProseMirror[contenteditable="true"]'],
      send: ['button[data-testid="chat-input-send"]', 'button[aria-label="Send message"]', 'button[aria-label="傳送訊息"]'],
    },
    chatgpt: {
      input: ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', 'textarea[name="prompt-textarea"]'],
      send: ['[data-testid="send-button"]', '#composer-submit-button'],
    },
    gemini: {
      input: ['rich-textarea div.ql-editor[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]'],
      send: ['button.send-button.submit', 'button:has(mat-icon[data-mat-icon-name="send"])', '.send-button-container button'],
    },
  };

  // ───────────────────────── 介面字串 ─────────────────────────

  const I18N = {
    'zh-TW': {
      loaded: (v) => `v${v} 已載入`,
      manage: '管理提示詞',
      manageBtn: '管理…',
      noPrompts: '還沒有提示詞',
      noMatch: '沒有同時符合這些標籤的提示詞',
      fillBadge: '填空',
      autoSendTitle: '填入後自動送出',
      inputNotFound: '找不到聊天輸入框，請重新整理頁面再試一次',
      fillTitle: '填空',
      cancel: '取消',
      fill: '填入',
      ok: '確定',
      close: '關閉',
      importBtn: '匯入',
      exportBtn: '匯出',
      tagsBtn: '標籤…',
      addBtn: '新增',
      up: '上移',
      down: '下移',
      edit: '編輯',
      del: '刪除',
      save: '儲存',
      confirmDeletePrompt: (t) => `確定刪除「${t}」？`,
      newPrompt: '新增提示詞',
      editPrompt: '編輯提示詞',
      fieldTitle: '標題',
      fieldText: '內容',
      fillHelp: '例如：翻成[語言::英文]',
      fillNote: '預設開啟。如果提示詞本身就有不是空格的中括號（像 Markdown 連結 [文字](網址)），請取消勾選。',
      helpLink: '詳細說明',
      tagsIntro: '用標籤幫提示詞分類，之後在清單上方點標籤，就只顯示那一類。',
      needTagFirst: '還沒有標籤，先按「新增標籤…」建一個。',
      newTagBtn: '新增標籤…',
      help: {
        fill: {
          title: '填空',
          intro: '勾了「使用填空」，內容裡每個 [空格] 都會在填入前先問你要填什麼。',
          syntax: [['[語言]', '一格空格'], ['[語言::英文]', '先填好「英文」，可以改（兩個冒號）'], ['[語言](要翻成哪種)', '旁邊多一行提示']],
          example: { label: '範例', before: '把下面翻成[語言::英文]，語氣[語氣]。\n最後用[語言]寫一句摘要。', middle: '填入：語言＝日文、語氣＝正式', after: '把下面翻成日文，語氣正式。\n最後用日文寫一句摘要。' },
          notes: ['同一個名字出現好幾次，只問一次。', '沒勾「使用填空」，中括號會原封不動送出。'],
        },
        autoSend: {
          title: '填入後自動送出',
          intro: '填好之後直接幫你按送出。清單裡有 ↵ 的，就是會自動送出的。',
          example: { label: '範例', pairs: [['總結這段對話', '勾：點了直接送出'], ['檢查錯字：', '不勾：填入後還要接著貼上文字']] },
          notes: ['如果送出鈕 4 秒內都按不下去（例如檔案還在上傳），就不送出，文字會留在輸入框。'],
        },
      },
      useFill: '使用填空',
      autoSend: '填入後自動送出',
      tagsLabel: '標籤',
      emptyText: '內容還沒填',
      untitled: '(無標題)',
      tagsTitle: '標籤管理',
      bgColor: '底色',
      fgColor: '字色',
      newTagPlaceholder: '新標籤名稱',
      confirmDeleteTag: (n) => `確定刪除標籤「${n}」？用到它的提示詞不會被刪，只是少了這個標籤。`,
      noTags: '還沒有標籤',
      emptyList: '還沒有提示詞，按「新增」建第一個。',
      imported: (n) => `已匯入 ${n} 筆提示詞`,
      importFailed: (r) => `匯入失敗：${r}`,
      errNotJson: '檔案讀不懂（不是 JSON 格式）',
      errFormat: '這不是 Prompt Popout 匯出的檔案',
      errStructure: '檔案內容不完整',
      title: '提示詞',
    },
    en: {
      loaded: (v) => `v${v} loaded`,
      manage: 'Manage prompts',
      manageBtn: 'Manage…',
      noPrompts: 'No prompts yet',
      noMatch: 'No prompts have all of these tags',
      fillBadge: 'Fill',
      autoSendTitle: 'Auto-send after insert',
      inputNotFound: "Couldn't find the chat box. Try reloading the page.",
      fillTitle: 'Fill in the blanks',
      cancel: 'Cancel',
      fill: 'Fill',
      ok: 'OK',
      close: 'Close',
      importBtn: 'Import',
      exportBtn: 'Export',
      tagsBtn: 'Tags…',
      addBtn: 'Add',
      up: 'Up',
      down: 'Down',
      edit: 'Edit',
      del: 'Delete',
      save: 'Save',
      confirmDeletePrompt: (t) => `Delete "${t}"?`,
      newPrompt: 'New prompt',
      editPrompt: 'Edit prompt',
      fieldTitle: 'Title',
      fieldText: 'Content',
      fillHelp: 'e.g. Translate into [language::English]',
      fillNote: "On by default. Untick it if the prompt has square brackets that aren't blanks, such as a Markdown link [text](url).",
      helpLink: 'Details',
      tagsIntro: 'Use tags to sort your prompts. Click a tag at the top of the list to show just those.',
      needTagFirst: 'No tags yet. Click "New tag…" to create one.',
      newTagBtn: 'New tag…',
      help: {
        fill: {
          title: 'Fill-in blanks',
          intro: 'With "Use fill-in blanks" ticked, you\'re asked what to put in each [blank] before the prompt goes in.',
          syntax: [['[language]', 'a blank'], ['[language::English]', 'starts out filled with English; you can change it (two colons)'], ['[language](which one)', 'shows a hint beside it']],
          example: { label: 'Example', before: 'Translate this into [language::English], [tone] tone.\nEnd with a one-line summary in [language].', middle: 'Fill in: language = Japanese, tone = formal', after: 'Translate this into Japanese, formal tone.\nEnd with a one-line summary in Japanese.' },
          notes: ['If the same name appears more than once, you\'re only asked once.', 'Without "Use fill-in blanks", square brackets are sent exactly as written.'],
        },
        autoSend: {
          title: 'Auto-send after insert',
          intro: 'Hits send for you as soon as the text is in. Prompts marked ↵ in the list do this.',
          example: { label: 'Example', pairs: [['Summarise this conversation', 'Ticked: sent straight away'], ['Fix the typos in:', 'Not ticked: you still paste the text after it']] },
          notes: ["If the send button can't be pressed within 4 seconds (say, a file is still uploading), nothing is sent and the text stays in the box."],
        },
      },
      useFill: 'Use fill-in blanks',
      autoSend: 'Auto-send after insert',
      tagsLabel: 'Tags',
      emptyText: 'The content is empty',
      untitled: '(Untitled)',
      tagsTitle: 'Tags',
      bgColor: 'Background',
      fgColor: 'Text',
      newTagPlaceholder: 'New tag name',
      confirmDeleteTag: (n) => `Delete the tag "${n}"? Prompts that use it are kept; they just lose this tag.`,
      noTags: 'No tags yet',
      emptyList: 'No prompts yet. Click "Add" to create your first one.',
      imported: (n) => `Imported ${n} prompt(s)`,
      importFailed: (r) => `Import failed: ${r}`,
      errNotJson: "Can't read the file (it isn't JSON)",
      errFormat: "This isn't a Prompt Popout export",
      errStructure: 'The file is incomplete',
      title: 'Prompts',
    },
  };
  const T = /^zh/i.test(navigator.language || '') ? I18N['zh-TW'] : I18N.en;

  // ───────────────────────── 工具 ─────────────────────────

  const log = (...a) => console.log(LOG_PREFIX, ...a);
  const warn = (...a) => console.warn(LOG_PREFIX, ...a);

  function detectSite() {
    const h = location.hostname;
    if (h === 'claude.ai' || h.endsWith('.claude.ai')) return 'claude';
    if (h === 'chatgpt.com' || h.endsWith('.chatgpt.com')) return 'chatgpt';
    if (h === 'gemini.google.com') return 'gemini';
    return null;
  }
  const SITE = detectSite();
  if (!SITE) return;
  const SEL = SITE_SELECTORS[SITE];

  // 依序嘗試選擇器；含 :has 的在舊瀏覽器會丟例外，所以每個個別 try/catch
  const badSelectorsLogged = new Set();
  function queryFirst(list) {
    for (const s of list) {
      try {
        const el = document.querySelector(s);
        if (el) return el;
      } catch (e) {
        if (!badSelectorsLogged.has(s)) {
          badSelectorsLogged.add(s);
          warn('選擇器無法使用，略過：', s, e && e.message);
        }
      }
    }
    return null;
  }

  function newId() {
    try {
      if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (e) {
      warn('randomUUID 不可用，改用備援 id', e);
    }
    const buf = new Uint8Array(16);
    try { crypto.getRandomValues(buf); } catch (e) {
      warn('getRandomValues 不可用，改用 Math.random', e);
      for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function isHexColor(s) { return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s); }

  // 建元素小工具：全程用 DOM API，避開 Trusted Types 對 innerHTML 的限制，也免去手動跳脫
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 只有 Claude 插入段落時需要 HTML 字串（給 execCommand('insertHTML')）；頁面若強制 Trusted Types，必須經過自建 policy
  let ttPolicy = null;
  let ttTried = false;
  function toTrustedHtml(html) {
    if (!ttTried) {
      ttTried = true;
      try {
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
          ttPolicy = window.trustedTypes.createPolicy('pp-html', { createHTML: (s) => s });
        }
      } catch (e) {
        warn('建立 trustedTypes policy 失敗，退回直接使用字串', e);
      }
    }
    return ttPolicy ? ttPolicy.createHTML(html) : html;
  }

  // ───────────────────────── 儲存 ─────────────────────────

  function loadArray(key) {
    try {
      const v = GM_getValue(key, []);
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') { const p = JSON.parse(v); if (Array.isArray(p)) return p; }
    } catch (e) {
      warn('讀取儲存失敗：', key, e);
    }
    return [];
  }
  const getPrompts = () => loadArray(STORE_PROMPTS);
  const getTags = () => loadArray(STORE_TAGS);
  const setPrompts = (a) => GM_setValue(STORE_PROMPTS, a);
  const setTags = (a) => GM_setValue(STORE_TAGS, a);

  // ───────────────────────── 顏色換算 ─────────────────────────

  // 顏色格式五花八門（color(srgb …)、半透明…），換算交給瀏覽器的 canvas，不自己解析
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });

  function readPixel() {
    const d = colorCtx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }
  function colorAlpha(color) {
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = 'rgba(0,0,0,0)';
    colorCtx.fillStyle = color;
    colorCtx.fillRect(0, 0, 1, 1);
    return readPixel()[3];
  }
  // 把 color 疊到不透明底色 base 上，回傳不透明 rgb()
  function compositeOver(color, base) {
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = '#fff';
    colorCtx.fillStyle = base;
    colorCtx.fillRect(0, 0, 1, 1);
    colorCtx.fillStyle = 'rgba(0,0,0,0)';
    colorCtx.fillStyle = color;
    colorCtx.fillRect(0, 0, 1, 1);
    const [r, g, b] = readPixel();
    return `rgb(${r}, ${g}, ${b})`;
  }
  function luminance(rgb) {
    const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(rgb);
    if (!m) return 1;
    return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
  }

  function readPageBg(card) {
    let el = card.parentElement;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && colorAlpha(bg) > 0) return compositeOver(bg, '#fff');
      el = el.parentElement;
    }
    return 'rgb(255, 255, 255)';
  }

  // 將 box-shadow 以「不在括號內的逗號」切開
  function splitShadows(s) {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) { out.push(s.slice(start, i).trim()); start = i + 1; }
    }
    out.push(s.slice(start).trim());
    return out.filter(Boolean);
  }

  // 找「非 inset、x/y/blur 皆 0、spread > 0、顏色非透明」的那一項——網站用它當外框線
  function parseShadowBorder(shadow) {
    if (!shadow || shadow === 'none') return null;
    for (const item of splitShadows(shadow)) {
      if (/\binset\b/.test(item)) continue;
      const colorMatch = /[a-z-]+\([^()]*(?:\([^()]*\)[^()]*)*\)|#[0-9a-f]{3,8}\b/i.exec(item);
      let color = colorMatch ? colorMatch[0] : null;
      let rest = colorMatch ? item.replace(colorMatch[0], ' ') : item;
      const nums = (rest.match(/-?\d*\.?\d+(?:px)?/g) || []).map(parseFloat);
      if (!color) {
        const named = rest.replace(/-?\d*\.?\d+(?:px)?/g, ' ').trim();
        color = named || 'currentcolor';
      }
      if (nums.length < 4) continue;
      const [x, y, blur, spread] = nums;
      if (x !== 0 || y !== 0 || blur !== 0 || !(spread > 0)) continue;
      if (colorAlpha(color) === 0) continue;
      return { color, width: spread };
    }
    return null;
  }

  // ───────────────────────── 樣式 ─────────────────────────

  const CSS = `
.pp-card {
  /* v1.4.0 起卡片不撐大：外框維持網站原本的大小與位置，把手佔卡片內最左邊 W 寬，
     原本的內容靠加大左內距往右讓位。（v1.3.x 是 margin-left:-W＋width:100%+W 往外長出一塊）
     不設 box-sizing：沿用網站自己的盒模型，寬度是 auto 時加內距不會撐大外框。 */
  padding-left: calc(var(--pp-w) + var(--pp-pl)) !important;
}
.pp-card.pp-card-static { position: relative !important; }
.pp-card::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: calc(var(--pp-w) + var(--pp-sep-w));
  box-sizing: border-box;
  border-top-left-radius: inherit;
  border-bottom-left-radius: inherit;
  background: var(--pp-page-bg);
  border-right: var(--pp-sep-w) solid var(--pp-sep-color);
  cursor: pointer;
  z-index: 1;
}
.pp-card::after {
  content: "";
  position: absolute;
  width: ${PILL_WIDTH_PX}px;
  left: var(--pp-pill-off);
  top: var(--pp-pill-off);
  bottom: var(--pp-pill-off);
  border-radius: 999px;
  background-color: var(--pp-pill);
  pointer-events: none;
  transition: background-color 120ms ease;
  z-index: 2;
}
.pp-card.pp-active::after { background-color: var(--pp-active, ${ACCENT_COLOR}); }

#pp-root {
  --pp-bg: #ffffff; --pp-fg: #1f1f1f; --pp-muted: #6b6b6b; --pp-border: rgba(0,0,0,0.12);
  --pp-hover: #f0f0f0; --pp-input-bg: #ffffff; --pp-btn-bg: #f3f3f3; --pp-danger: #d0302f;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--pp-fg);
}
@media (prefers-color-scheme: dark) {
  #pp-root {
    --pp-bg: #2b2b2b; --pp-fg: #ececec; --pp-muted: #a0a0a0; --pp-border: rgba(255,255,255,0.14);
    --pp-hover: #3a3a3a; --pp-input-bg: #1f1f1f; --pp-btn-bg: #3a3a3a; --pp-danger: #ff6b6b;
  }
}
#pp-root * { box-sizing: border-box; }
#pp-root .pp-popup {
  position: fixed; z-index: 2147483000; width: 320px; max-height: 60vh; overflow-y: auto;
  background: var(--pp-bg); color: var(--pp-fg); border: 1px solid var(--pp-border);
  border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,0.22); font-size: 16px; padding: 6px;
}
#pp-root .pp-tagbar { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 4px 6px; }
#pp-root .pp-tag {
  display: inline-block; border: none; border-radius: 999px; padding: 4px 12px; font-size: 16px;
  line-height: 1.25; cursor: pointer; white-space: nowrap; font-family: inherit;
}
#pp-root .pp-tag.pp-off { opacity: 0.55; }
#pp-root .pp-tag.pp-static { cursor: default; }
#pp-root .pp-row {
  display: flex; align-items: center; gap: 6px; padding: 7px 8px; border-radius: 6px; cursor: pointer;
}
#pp-root .pp-row:hover { background: var(--pp-hover); }
#pp-root .pp-row-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#pp-root .pp-badge { font-size: 16px; line-height: 1.25; color: var(--pp-muted); border: 1px solid var(--pp-border); border-radius: 6px; padding: 1px 6px; flex: none; }
#pp-root .pp-enter { width: 16px; height: 16px; flex: none; color: #8a8a8a; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1; }
#pp-root .pp-empty { padding: 10px 8px; color: var(--pp-muted); }
#pp-root .pp-popup-foot { display: flex; justify-content: flex-end; padding: 6px 4px 2px; border-top: 1px solid var(--pp-border); margin-top: 4px; }
/* 所有按鈕同一套尺寸（30 第⑲條）：高 36、字 16（03 第⑪條下限）、圓角 10（約邊長 28%，不生硬）。
   主要／一般／危險只靠顏色區分，不靠大小。 */
#pp-root .pp-btn {
  display: inline-flex; align-items: center; justify-content: center; height: 36px; box-sizing: border-box;
  font: inherit; font-size: 16px; line-height: 1; padding: 0 14px; border-radius: 10px; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--pp-border); background: var(--pp-btn-bg); color: var(--pp-fg);
}
#pp-root .pp-btn:disabled { opacity: 0.4; cursor: default; }
#pp-root .pp-btn-primary { background: ${ACCENT_COLOR}; border-color: ${ACCENT_COLOR}; color: #fff; }
#pp-root .pp-btn-danger { color: var(--pp-danger); }
#pp-root .pp-overlay {
  position: fixed; inset: 0; z-index: 2147483100; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
#pp-root .pp-dialog {
  width: min(680px, 100%); max-height: 90vh; display: flex; flex-direction: column;
  background: var(--pp-bg); color: var(--pp-fg); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.35);
  font-size: 16px;
}
/* 面板本身取得焦點只是為了接鍵盤事件，不需要焦點框（瀏覽器預設會畫一圈粗黑框） */
#pp-root .pp-dialog:focus { outline: none; }
#pp-root .pp-dialog-head { font-size: 22px; font-weight: 700; padding: 14px 18px; border-bottom: 1px solid var(--pp-border); }
#pp-root .pp-dialog-body { padding: 14px 18px; overflow-y: auto; flex: 1; min-height: 0; }
#pp-root .pp-dialog-foot { display: flex; gap: 8px; align-items: center; padding: 12px 18px; border-top: 1px solid var(--pp-border); flex-wrap: wrap; }
#pp-root .pp-spacer { flex: 1; }
#pp-root .pp-field { margin-bottom: 12px; }
#pp-root .pp-label { font-size: 18px; font-weight: 600; }
#pp-root .pp-label-row { display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px; }
#pp-root .pp-hint { font-size: 16px; color: var(--pp-muted); font-weight: normal; margin-left: 6px; }
#pp-root .pp-help { font-size: 16px; color: var(--pp-muted); margin: 4px 0 10px; }
/* 「詳細說明」連結：連結藍、底線（03 第⑬節），淺／深色各一 */
#pp-root .pp-link { font: inherit; font-size: 16px; font-weight: normal; color: #065fd4; text-decoration: underline; background: none; border: none; padding: 0; cursor: pointer; }
@media (prefers-color-scheme: dark) { #pp-root .pp-link { color: #3ea6ff; } }
#pp-root .pp-check-row { display: flex; align-items: center; gap: 12px; }
/* 說明視窗：中性色，範例用等寬字＋淡底跟敘述分開 */
#pp-root .pp-help-intro { margin: 0 0 14px; }
#pp-root .pp-help-h { font-size: 18px; font-weight: 600; margin: 16px 0 6px; }
#pp-root .pp-code { font-family: ui-monospace, Consolas, "Courier New", monospace; font-size: 16px; background: var(--pp-hover); border-radius: 6px; padding: 8px 10px; white-space: pre-wrap; word-break: break-word; }
#pp-root .pp-arrow { color: var(--pp-muted); margin: 4px 0 4px 10px; }
#pp-root .pp-syntax { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; align-items: center; }
#pp-root .pp-syntax .pp-code { padding: 2px 8px; }
#pp-root .pp-help ul, #pp-root .pp-help-list { margin: 12px 0 0; padding-left: 20px; }
#pp-root .pp-help-list li { margin: 4px 0; }
#pp-root input[type="text"], #pp-root textarea {
  width: 100%; font: inherit; font-size: 16px; padding: 6px 8px; border-radius: 6px;
  border: 1px solid var(--pp-border); background: var(--pp-input-bg); color: var(--pp-fg);
}
#pp-root textarea.pp-mono { font-family: ui-monospace, Consolas, "Courier New", monospace; height: 180px; resize: vertical; }
#pp-root textarea.pp-fill-input { height: 60px; resize: vertical; }
#pp-root .pp-check { display: flex; align-items: center; gap: 6px; margin: 6px 0; cursor: pointer; }
#pp-root .pp-taglist { display: flex; flex-wrap: wrap; gap: 4px 14px; }
#pp-root .pp-mrow { display: flex; align-items: center; gap: 6px; padding: 8px 0; border-bottom: 1px solid var(--pp-border); flex-wrap: wrap; }
#pp-root .pp-mrow-title { flex: 1 1 160px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#pp-root .pp-mrow-tags { display: flex; gap: 4px; flex-wrap: wrap; }
#pp-root input[type="color"] { width: 40px; height: 36px; padding: 0; border: 1px solid var(--pp-border); border-radius: 4px; background: none; cursor: pointer; }
#pp-root .pp-msg { white-space: pre-wrap; }
`;

  function injectStyle() {
    const st = document.createElement('style');
    st.id = 'pp-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // ───────────────────────── 根容器 ─────────────────────────

  let root = null;
  function getRoot() {
    if (!root || !root.isConnected) {
      root = document.getElementById('pp-root') || h('div', { id: 'pp-root' });
      if (!root.isConnected) document.body.appendChild(root);
    }
    return root;
  }

  // ───────────────────────── 把手狀態 ─────────────────────────

  const state = {
    card: null,
    radius: FALLBACK_RADIUS_PX,
    blockW: FALLBACK_RADIUS_PX * 2,
    borderW: 0,            // 卡片外框線寬（觸發區用）
    sepW: 0,               // 分隔線粗細（border 情況下為 0）
    sepColor: 'rgba(0,0,0,0.1)',
    sepLocked: false,
    pageBg: null,
    frame: 0,
    mouseX: -1,
    mouseY: -1,
    inZone: false,
    overPopup: false,
    popupOpen: false,
    openTimer: 0,
    closeTimer: 0,
    popupEl: null,
    lastLoopError: '',
  };
  const selectedTagIds = new Set(); // 篩選狀態只存在記憶體

  function readRadius(cs) {
    const r = Math.round(parseFloat(cs.borderTopLeftRadius));
    return Number.isFinite(r) && r > 0 ? r : FALLBACK_RADIUS_PX;
  }

  function findInput() { return queryFirst(SEL.input); }

  function findCard(input) {
    const inputW = input.getBoundingClientRect().width;
    let el = input;
    for (let i = 0; i < CARD_SEARCH_MAX_DEPTH; i++) {
      el = el.parentElement;
      if (!el || el === document.body) break;
      // 已被我們改過外觀的卡片，量測值不可靠，直接沿用
      if (el.classList.contains('pp-card')) return el;
      const cs = getComputedStyle(el);
      const br = parseFloat(cs.borderBottomRightRadius) || 0;
      if (br >= CARD_MIN_CORNER_RADIUS_PX && el.getBoundingClientRect().width >= inputW) return el;
    }
    return input;
  }

  function setVar(el, name, value) { el.style.setProperty(name, value); }

  function applyGeometryVars(card) {
    setVar(card, '--pp-r', state.radius + 'px');
    setVar(card, '--pp-w', state.blockW + 'px');
    setVar(card, '--pp-pill-off', (state.radius - PILL_HALF_PX) + 'px');
  }

  function attachCard(card) {
    // 原左內距與圓角必須在加 class 之前讀，加了之後讀到的是我們改過的值
    const cs = getComputedStyle(card);
    state.radius = readRadius(cs);
    state.blockW = state.radius * 2;
    card._ppPaddingLeft = cs.paddingLeft || '0px';
    const isStatic = cs.position === 'static';
    state.card = card;
    state.sepLocked = false;
    state.pageBg = null;
    state.frame = 0;
    applyGeometryVars(card);
    setVar(card, '--pp-pl', card._ppPaddingLeft);
    setVar(card, '--pp-sep-w', '0px');
    setVar(card, '--pp-sep-color', 'transparent');
    setVar(card, '--pp-page-bg', 'transparent');
    setVar(card, '--pp-pill', 'transparent');
    // ::before/::after 需要定位祖先；卡片若是 static 才補 relative，避免動到網站原有定位
    card._ppStatic = isStatic;
    if (isStatic) card.classList.add('pp-card-static');
    card.classList.add('pp-card');
    recomputeColors(true);
  }

  function detachCard(card) {
    if (!card) return;
    card.classList.remove('pp-card', 'pp-active', 'pp-card-static');
    for (const v of ['--pp-r', '--pp-w', '--pp-pill-off', '--pp-pl', '--pp-sep-w', '--pp-sep-color', '--pp-page-bg', '--pp-pill']) {
      card.style.removeProperty(v);
    }
  }

  function cardAtRest(card) {
    try {
      if (card.matches(':hover') || card.matches(':focus-within')) return false;
      if (typeof card.getAnimations === 'function' && card.getAnimations().length > 0) return false;
      return true;
    } catch (e) {
      warn('判斷卡片靜止狀態失敗', e);
      return false;
    }
  }

  function readSeparator(card) {
    const cs = getComputedStyle(card);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    if (bl > 0) {
      // border 本來就畫在框內，分隔線再畫一條就會重複，所以粗細 0
      return { color: compositeOver(cs.borderLeftColor, state.pageBg), sepW: 0, borderW: bl };
    }
    const sh = parseShadowBorder(cs.boxShadow);
    if (sh) return { color: compositeOver(sh.color, state.pageBg), sepW: sh.width, borderW: sh.width };
    return { color: compositeOver('rgba(0,0,0,0.1)', state.pageBg), sepW: 0, borderW: 0 };
  }

  function recomputeColors(force) {
    const card = state.card;
    if (!card) return;
    const newR = readRadius(getComputedStyle(card));
    if (newR !== state.radius) {
      state.radius = newR;
      state.blockW = newR * 2;
      applyGeometryVars(card);
    }
    const bg = readPageBg(card);
    if (bg !== state.pageBg || force) {
      // 頁面底色變了＝換主題，分隔線色也要重讀
      if (bg !== state.pageBg) state.sepLocked = false;
      state.pageBg = bg;
      setVar(card, '--pp-page-bg', bg);
      const dark = luminance(bg) < 0.5;
      setVar(card, '--pp-pill', compositeOver(dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)', bg));
      setVar(card, '--pp-active', SITE_ACTIVE_COLOR[SITE][dark ? 'dark' : 'light']);
    }
  }

  function ensureCardDecorations(card) {
    // React 重繪可能覆寫 className／style，class 或變數不見就補回
    if (!card.classList.contains('pp-card')) {
      if (card._ppStatic) card.classList.add('pp-card-static');
      card.classList.add('pp-card');
    }
    if (!card.style.getPropertyValue('--pp-w')) {
      applyGeometryVars(card);
      setVar(card, '--pp-pl', card._ppPaddingLeft || '0px');
      setVar(card, '--pp-sep-w', state.sepW + 'px');
      setVar(card, '--pp-sep-color', state.sepColor);
      if (state.pageBg) setVar(card, '--pp-page-bg', state.pageBg);
      recomputeColors(true);
    }
  }

  function frameTick() {
    const input = findInput();
    if (!input) {
      if (state.card) {
        detachCard(state.card);
        state.card = null;
        closePopup();
      }
      return;
    }
    const card = findCard(input);
    if (card !== state.card) {
      if (state.card) detachCard(state.card);
      attachCard(card);
    }
    ensureCardDecorations(card);

    state.frame++;
    if (state.frame % RECOMPUTE_EVERY_FRAMES === 0) recomputeColors(false);

    // 分隔線只在靜止時讀一次並鎖定，避免 hover/focus 轉場時忽深忽淺
    if (!state.sepLocked && state.pageBg && cardAtRest(card)) {
      const s = readSeparator(card);
      state.sepColor = s.color;
      state.sepW = s.sepW;
      state.borderW = s.borderW;
      state.sepLocked = true;
      setVar(card, '--pp-sep-w', s.sepW + 'px');
      setVar(card, '--pp-sep-color', s.color);
    }

    card.classList.toggle('pp-active', state.inZone || state.popupOpen);
  }

  function loop() {
    // 單次失敗不可讓迴圈停掉
    try {
      frameTick();
    } catch (e) {
      const msg = String(e && e.message);
      if (msg !== state.lastLoopError) {
        state.lastLoopError = msg;
        warn('影格處理失敗', e);
      }
    }
    requestAnimationFrame(loop);
  }

  // ───────────────────────── 觸發區與開關 ─────────────────────────

  // 我們自己的介面（對話框、清單）蓋在把手位置上時，把手不算數：
  // 對話框置中於視窗，輸入卡片偏右（例如側欄展開）時對話框左半部會疊在把手上，
  // 不排除的話對話框裡的點擊會被攔下改成開關清單（v1.2.0 以前：勾選框點不動、清單在背後被打開）。
  function ourUiBlocks(target) {
    if (root && root.querySelector('.pp-overlay')) return true;
    return !!(root && target instanceof Node && root.contains(target));
  }

  function pointInZone(x, y) {
    const card = state.card;
    if (!card || !card.isConnected) return false;
    const r = card.getBoundingClientRect();
    const bw = state.borderW;
    return x >= r.left - bw - TRIGGER_OUTER_SLACK_PX && x <= r.left + state.blockW &&
      y >= r.top - bw && y <= r.bottom + bw;
  }

  function clearOpenTimer() { if (state.openTimer) { clearTimeout(state.openTimer); state.openTimer = 0; } }
  function clearCloseTimer() { if (state.closeTimer) { clearTimeout(state.closeTimer); state.closeTimer = 0; } }

  function scheduleClose() {
    // 競態：同一次移動先觸發清單 mouseenter 再觸發 document mousemove，所以排程前先看旗標
    if (state.overPopup || state.inZone || !state.popupOpen) return;
    clearCloseTimer();
    state.closeTimer = setTimeout(() => {
      state.closeTimer = 0;
      if (!state.overPopup && !state.inZone) closePopup();
    }, CLOSE_DELAY_MS);
  }

  function onMouseMove(e) {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
    const now = !ourUiBlocks(e.target) && pointInZone(e.clientX, e.clientY);
    if (now === state.inZone) return;
    state.inZone = now;
    if (now) {
      clearCloseTimer();
      if (!state.popupOpen && !state.openTimer) {
        state.openTimer = setTimeout(() => {
          state.openTimer = 0;
          if (state.inZone) openPopup(state.mouseY);
        }, OPEN_DELAY_MS);
      }
    } else {
      clearOpenTimer();
      scheduleClose();
    }
  }

  function isInPopup(target) { return !!(state.popupEl && target instanceof Node && state.popupEl.contains(target)); }

  function onPointerDownCapture(e) {
    if (ourUiBlocks(e.target)) return;
    if (pointInZone(e.clientX, e.clientY)) {
      // 不讓網站收到（例如把焦點移進輸入框）
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (state.popupOpen && !isInPopup(e.target)) closePopup();
  }

  function onClickCapture(e) {
    if (ourUiBlocks(e.target) || !pointInZone(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    clearOpenTimer();
    if (state.popupOpen) closePopup();
    else openPopup(e.clientY);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && state.popupOpen) closePopup();
  }

  // ───────────────────────── 彈出清單 ─────────────────────────

  function makeEnterIcon() {
    if (SITE === 'claude') {
      // Claude 的圖示字型會套用到任何 data-cds="Icon" 的 span
      const s = h('span', { class: 'pp-enter', 'data-cds': 'Icon', 'aria-hidden': 'true' });
      s.textContent = CLAUDE_ENTER_GLYPH;
      return s;
    }
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'pp-enter');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M13 3v5a2 2 0 0 1-2 2H4M6.5 7.5 4 10l2.5 2.5');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.6');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    return svg;
  }

  function tagPill(tag, extraClass) {
    return h('span', { class: 'pp-tag pp-static' + (extraClass ? ' ' + extraClass : ''), style: `background:${tag.bg};color:${tag.fg}`, text: tag.name });
  }

  function renderPopupContent(popup) {
    popup.textContent = '';
    const tags = getTags();
    const prompts = getPrompts();
    const tagIds = new Set(tags.map((t) => t.id));
    for (const id of [...selectedTagIds]) if (!tagIds.has(id)) selectedTagIds.delete(id);

    if (tags.length) {
      const bar = h('div', { class: 'pp-tagbar' });
      for (const t of tags) {
        const on = selectedTagIds.has(t.id);
        bar.appendChild(h('button', {
          type: 'button',
          class: 'pp-tag' + (on ? '' : ' pp-off'),
          style: `background:${t.bg};color:${t.fg}`,
          text: t.name,
          onclick: (e) => {
            e.stopPropagation();
            if (selectedTagIds.has(t.id)) selectedTagIds.delete(t.id); else selectedTagIds.add(t.id);
            renderPopupContent(popup);
          },
        }));
      }
      popup.appendChild(bar);
    }

    const sel = [...selectedTagIds];
    const shown = prompts.filter((p) => sel.every((id) => (p.tagIds || []).includes(id)));
    if (!prompts.length) popup.appendChild(h('div', { class: 'pp-empty', text: T.noPrompts }));
    else if (!shown.length) popup.appendChild(h('div', { class: 'pp-empty', text: T.noMatch }));
    for (const p of shown) {
      const row = h('div', {
        class: 'pp-row',
        title: String(p.text || '').slice(0, TOOLTIP_MAX_CHARS),
        onclick: () => { closePopup(); usePrompt(p); },
      },
      h('span', { class: 'pp-row-title', text: p.title || T.untitled }));
      if (p.fill) row.appendChild(h('span', { class: 'pp-badge', text: T.fillBadge }));
      if (p.autoSend) {
        const icon = makeEnterIcon();
        const wrap = h('span', { title: T.autoSendTitle, style: 'display:inline-flex;flex:none' }, icon);
        row.appendChild(wrap);
      }
      popup.appendChild(row);
    }

    popup.appendChild(h('div', { class: 'pp-popup-foot' },
      h('button', { type: 'button', class: 'pp-btn', text: T.manageBtn, onclick: () => { closePopup(); showManager(); } })));
  }

  function positionPopup(popup, mouseY) {
    const r = state.card.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = popup.offsetWidth, ph = popup.offsetHeight;
    let left = r.left + state.blockW + POPUP_GAP_PX;
    let top = mouseY + POPUP_MOUSE_FROM_BOTTOM_PX - ph;
    left = Math.max(VIEWPORT_MARGIN_PX, Math.min(left, vw - pw - VIEWPORT_MARGIN_PX));
    top = Math.max(VIEWPORT_MARGIN_PX, Math.min(top, vh - ph - VIEWPORT_MARGIN_PX));
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  }

  function openPopup(mouseY) {
    if (!state.card) return;
    clearOpenTimer();
    clearCloseTimer();
    if (!state.popupEl) {
      const popup = h('div', { class: 'pp-popup', role: 'menu' });
      popup.addEventListener('mouseenter', () => { state.overPopup = true; clearCloseTimer(); });
      popup.addEventListener('mouseleave', () => { state.overPopup = false; scheduleClose(); });
      state.popupEl = popup;
    }
    const popup = state.popupEl;
    popup.style.visibility = 'hidden';
    popup.style.display = 'block';
    getRoot().appendChild(popup);
    renderPopupContent(popup);
    state.popupOpen = true;
    // 依開啟當下滑鼠高度定位並鎖定，避免高把手時滑鼠還沒到清單就被關閉
    positionPopup(popup, mouseY);
    popup.style.visibility = '';
  }

  function closePopup() {
    clearOpenTimer();
    clearCloseTimer();
    state.popupOpen = false;
    // 程式隱藏清單時收不到 mouseleave，必須自己歸零
    state.overPopup = false;
    if (state.popupEl) state.popupEl.style.display = 'none';
  }

  // ───────────────────────── 插入文字 ─────────────────────────

  function moveCaretToEnd(el) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function dispatchPaste(el, text, html) {
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      if (html) dt.setData('text/html', html);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return true;
    } catch (e) {
      warn('派送 paste 事件失敗', e);
      return false;
    }
  }

  function insertText(el, text) {
    if (el instanceof HTMLTextAreaElement) {
      // 用原生 setter，框架（React）才會認得這次變更
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, el.value + text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      return;
    }
    // 直接改 DOM 會被編輯器還原，必須走 execCommand 讓編輯器自己的輸入管線處理
    el.focus();
    moveCaretToEnd(el);
    let ok = false;
    let html = null;
    if (SITE === 'claude') {
      // Claude 的 insertText 會把換行併成一段，所以改插入 HTML 段落；空行保留為空段落
      html = text.split(/\r?\n/).map((l) => (l ? `<p>${escapeHtml(l)}</p>` : '<p><br></p>')).join('');
      try { ok = document.execCommand('insertHTML', false, toTrustedHtml(html)); } catch (e) {
        warn('insertHTML 失敗，改用備援', e);
      }
    } else {
      try { ok = document.execCommand('insertText', false, text); } catch (e) {
        warn('insertText 失敗，改用備援', e);
      }
    }
    if (!ok) {
      log('execCommand 未成功，改派送 paste 事件');
      dispatchPaste(el, text, html);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function autoSend() {
    const start = Date.now();
    const timer = setInterval(() => {
      try {
        const btn = queryFirst(SEL.send);
        if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
          clearInterval(timer);
          btn.click();
          return;
        }
      } catch (e) {
        warn('輪詢送出鈕失敗', e);
      }
      if (Date.now() - start >= SEND_POLL_TIMEOUT_MS) {
        clearInterval(timer);
        log(`等待送出鈕逾時（${SEND_POLL_TIMEOUT_MS} ms），放棄自動送出`);
      }
    }, SEND_POLL_INTERVAL_MS);
  }

  // ───────────────────────── 填空 ─────────────────────────

  // [名稱]、[名稱::預設]、[名稱](說明)、[名稱::預設](說明)；中括號內不可含換行 [ ] = $
  const FIELD_RE = /\[([^\[\]\r\n=$]*)\](?:\(([^()\r\n]*)\))?/g;

  function parseFieldInner(inner) {
    const idx = inner.indexOf('::');
    const name = (idx >= 0 ? inner.slice(0, idx) : inner).trim();
    const def = idx >= 0 ? inner.slice(idx + 2).trim() : '';
    return name ? { name, def } : null;
  }

  function parseFields(text) {
    const fields = [];
    const seen = new Map();
    FIELD_RE.lastIndex = 0;
    let m;
    while ((m = FIELD_RE.exec(text))) {
      const f = parseFieldInner(m[1]);
      if (!f) continue;
      if (seen.has(f.name)) {
        const prev = seen.get(f.name);
        if (!prev.def && f.def) prev.def = f.def;
        if (!prev.desc && m[2]) prev.desc = m[2].trim();
        continue;
      }
      const field = { name: f.name, def: f.def, desc: m[2] ? m[2].trim() : '' };
      seen.set(f.name, field);
      fields.push(field);
    }
    return fields;
  }

  function applyFields(text, values) {
    return text.replace(FIELD_RE, (whole, inner) => {
      const f = parseFieldInner(inner);
      if (!f || !Object.prototype.hasOwnProperty.call(values, f.name)) return whole;
      return values[f.name];
    });
  }

  function showFillDialog(fields) {
    return new Promise((resolve) => {
      const inputs = [];
      const body = h('div', null, fields.map((f) => {
        const ta = h('textarea', { class: 'pp-fill-input' });
        ta.value = f.def;
        inputs.push(ta);
        return h('div', { class: 'pp-field' },
          h('label', { class: 'pp-label' }, f.name, f.desc ? h('span', { class: 'pp-hint', text: f.desc }) : null),
          ta);
      }));
      const submit = () => {
        const values = {};
        fields.forEach((f, i) => { values[f.name] = inputs[i].value; });
        dlg.close();
        resolve(values);
      };
      const cancel = () => { dlg.close(); resolve(null); };
      const dlg = openDialog({
        title: T.fillTitle,
        body,
        onCancel: cancel,
        buttons: [
          { text: T.cancel, onClick: cancel },
          { text: T.fill, primary: true, onClick: submit },
        ],
        onKeyDown: (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
        },
      });
      if (inputs[0]) inputs[0].focus();
    });
  }

  async function usePrompt(p) {
    try {
      let text = String(p.text || '');
      if (p.fill) {
        const fields = parseFields(text);
        if (fields.length) {
          const values = await showFillDialog(fields);
          if (!values) return;
          text = applyFields(text, values);
        }
      }
      const input = findInput();
      if (!input) { await showMessage(T.inputNotFound); return; }
      insertText(input, text);
      if (p.autoSend) autoSend();
    } catch (e) {
      warn('使用提示詞失敗', e);
    }
  }

  // ───────────────────────── 對話框 ─────────────────────────

  function openDialog({ title, body, buttons, onCancel, onKeyDown, footer }) {
    const panel = h('div', { class: 'pp-dialog', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'pp-dialog-head', text: title }));
    const bodyWrap = h('div', { class: 'pp-dialog-body' });
    if (body) bodyWrap.appendChild(body);
    panel.appendChild(bodyWrap);
    const foot = h('div', { class: 'pp-dialog-foot' });
    if (footer) foot.appendChild(footer);
    else {
      foot.appendChild(h('span', { class: 'pp-spacer' }));
      for (const b of buttons || []) {
        foot.appendChild(h('button', {
          type: 'button',
          class: 'pp-btn' + (b.primary ? ' pp-btn-primary' : '') + (b.danger ? ' pp-btn-danger' : ''),
          text: b.text,
          onclick: b.onClick,
        }));
      }
    }
    panel.appendChild(foot);
    const overlay = h('div', { class: 'pp-overlay' }, panel);
    // 鍵盤事件不可冒泡到網站，否則網站快捷鍵會搶走輸入
    const stop = (e) => e.stopPropagation();
    overlay.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); if (onCancel) onCancel(); else close(); return; }
      if (onKeyDown) onKeyDown(e);
    });
    overlay.addEventListener('keyup', stop);
    overlay.addEventListener('keypress', stop);
    overlay.addEventListener('mousedown', (e) => { overlay._ppDownOnSelf = e.target === overlay; });
    overlay.addEventListener('click', (e) => {
      // 只有按下與放開都在遮罩空白處才關閉，避免在輸入框選字拖出去時誤關
      if (e.target === overlay && overlay._ppDownOnSelf) { if (onCancel) onCancel(); else close(); }
    });
    function close() { overlay.remove(); }
    getRoot().appendChild(overlay);
    panel.tabIndex = -1;
    panel.focus();
    return { close, body: bodyWrap, overlay };
  }

  function showMessage(msg) {
    return new Promise((resolve) => {
      const done = () => { d.close(); resolve(); };
      const d = openDialog({ title: T.title, body: h('div', { class: 'pp-msg', text: msg }), onCancel: done, buttons: [{ text: T.ok, primary: true, onClick: done }] });
    });
  }

  function showConfirm(msg) {
    return new Promise((resolve) => {
      const no = () => { d.close(); resolve(false); };
      const yes = () => { d.close(); resolve(true); };
      const d = openDialog({ title: T.title, body: h('div', { class: 'pp-msg', text: msg }), onCancel: no, buttons: [{ text: T.cancel, onClick: no }, { text: T.ok, danger: true, onClick: yes }] });
    });
  }


  // 「詳細說明」：連結樣式的按鈕，點了開獨立說明視窗（說明佔篇幅，平常收起來）
  function helpLink(topic) {
    return h('button', { type: 'button', class: 'pp-link', text: T.helpLink, onclick: (e) => { e.preventDefault(); showHelp(topic); } });
  }

  function showHelp(topic) {
    const d = T.help[topic];
    const body = h('div', null, h('p', { class: 'pp-help-intro', text: d.intro }));
    if (d.syntax) {
      body.appendChild(h('div', { class: 'pp-syntax' }, d.syntax.map(([code, desc]) => [h('span', { class: 'pp-code', text: code }), h('span', { text: desc })]).flat()));
    }
    const ex = d.example;
    body.appendChild(h('div', { class: 'pp-help-h', text: ex.label }));
    if (ex.pairs) {
      // 並列對照（左：內容，右：說明），不用箭頭——箭頭會被讀成「上面變成下面」
      body.appendChild(h('div', { class: 'pp-syntax' }, ex.pairs.map(([code, desc]) => [h('span', { class: 'pp-code', text: code }), h('span', { text: desc })]).flat()));
    } else {
      body.appendChild(h('div', { class: 'pp-code', text: ex.before }));
      body.appendChild(h('div', { class: 'pp-arrow', text: '↓ ' + ex.middle }));
      body.appendChild(h('div', { class: 'pp-code', text: ex.after }));
    }
    if (d.notes && d.notes.length) body.appendChild(h('ul', { class: 'pp-help-list' }, d.notes.map((n) => h('li', { text: n }))));
    const dlg = openDialog({ title: d.title, body, onCancel: () => dlg.close(), buttons: [{ text: T.close, primary: true, onClick: () => dlg.close() }] });
  }

  // ───────────────────────── 管理視窗 ─────────────────────────

  let managerRefresh = null;

  function showManager() {
    if (managerRefresh) { managerRefresh(); return; }
    const list = h('div');
    const refresh = () => {
      list.textContent = '';
      const prompts = getPrompts();
      const tagMap = new Map(getTags().map((t) => [t.id, t]));
      if (!prompts.length) list.appendChild(h('div', { class: 'pp-help', text: T.emptyList }));
      prompts.forEach((p, i) => {
        const move = (delta) => {
          const arr = getPrompts();
          const j = i + delta;
          if (j < 0 || j >= arr.length) return;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          setPrompts(arr);
          refresh();
        };
        list.appendChild(h('div', { class: 'pp-mrow' },
          h('span', { class: 'pp-mrow-title', text: p.title || T.untitled, title: String(p.text || '').slice(0, TOOLTIP_MAX_CHARS) }),
          h('span', { class: 'pp-mrow-tags' }, (p.tagIds || []).map((id) => tagMap.get(id)).filter(Boolean).map((t) => tagPill(t))),
          h('button', { type: 'button', class: 'pp-btn', text: T.up, disabled: i === 0, onclick: () => move(-1) }),
          h('button', { type: 'button', class: 'pp-btn', text: T.down, disabled: i === prompts.length - 1, onclick: () => move(1) }),
          h('button', { type: 'button', class: 'pp-btn', text: T.edit, onclick: () => showEditor(p.id) }),
          h('button', {
            type: 'button', class: 'pp-btn pp-btn-danger', text: T.del,
            onclick: async () => {
              if (!(await showConfirm(T.confirmDeletePrompt(p.title || T.untitled)))) return;
              setPrompts(getPrompts().filter((x) => x.id !== p.id));
              refresh();
            },
          })));
      });
    };
    const close = () => { managerRefresh = null; dlg.close(); };
    const footer = h('div', { style: 'display:contents' },
      h('button', { type: 'button', class: 'pp-btn', text: T.importBtn, onclick: doImport }),
      h('button', { type: 'button', class: 'pp-btn', text: T.exportBtn, onclick: doExport }),
      h('button', { type: 'button', class: 'pp-btn', text: T.tagsBtn, onclick: () => showTagManager() }),
      h('span', { class: 'pp-spacer' }),
      h('button', { type: 'button', class: 'pp-btn pp-btn-primary', text: T.addBtn, onclick: () => showEditor(null) }),
      h('button', { type: 'button', class: 'pp-btn', text: T.close, onclick: () => close() }));
    const dlg = openDialog({ title: T.manage, body: list, footer, onCancel: () => close() });
    managerRefresh = refresh;
    refresh();
  }

  function showEditor(id) {
    const existing = id ? getPrompts().find((p) => p.id === id) : null;
    const titleIn = h('input', { type: 'text' });
    titleIn.value = existing ? existing.title : '';
    const textIn = h('textarea', { class: 'pp-mono' });
    textIn.value = existing ? existing.text : '';
    const fillCb = h('input', { type: 'checkbox' });
    // 新增時預設勾選（使用者要求）：寫了 [欄位] 卻忘了勾，會整段原樣送出、填空形同沒作用。既有提示詞維持原設定。
    fillCb.checked = existing ? !!existing.fill : true;
    const sendCb = h('input', { type: 'checkbox' });
    sendCb.checked = !!(existing && existing.autoSend);
    // 標籤勾選區做成可重繪：在編輯頁按「新增標籤…」建完回來，新標籤要直接出現，已勾的狀態要保留
    const checkedTagIds = new Set(existing ? (existing.tagIds || []) : []);
    let tagCbs = [];
    const tagArea = h('div');
    const renderTagArea = () => {
      tagArea.textContent = '';
      const tags = getTags();
      tagCbs = tags.map((t) => {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = checkedTagIds.has(t.id);
        cb.addEventListener('change', () => { if (cb.checked) checkedTagIds.add(t.id); else checkedTagIds.delete(t.id); });
        return { t, cb };
      });
      if (!tags.length) tagArea.appendChild(h('div', { class: 'pp-help', style: 'margin:0', text: T.needTagFirst }));
      else tagArea.appendChild(h('div', { class: 'pp-taglist' }, tagCbs.map(({ t, cb }) => h('label', { class: 'pp-check' }, cb, tagPill(t)))));
    };
    renderTagArea();
    const body = h('div', null,
      h('div', { class: 'pp-field' }, h('div', { class: 'pp-label-row' }, h('label', { class: 'pp-label', text: T.fieldTitle })), titleIn),
      h('div', { class: 'pp-field' }, h('div', { class: 'pp-label-row' }, h('label', { class: 'pp-label', text: T.fieldText })), textIn),
      // 勾選框與「詳細說明」並列：連結不可放進 <label> 裡，否則點連結會順便切換勾選
      h('div', { class: 'pp-check-row' }, h('label', { class: 'pp-check' }, fillCb, T.useFill), h('span', { class: 'pp-hint', style: 'margin-left:0', text: T.fillHelp }), helpLink('fill')),
      h('div', { class: 'pp-help', style: 'margin:0 0 6px 26px', text: T.fillNote }),
      h('div', { class: 'pp-check-row' }, h('label', { class: 'pp-check' }, sendCb, T.autoSend), helpLink('autoSend')),
      h('div', { class: 'pp-field', style: 'margin-top:10px' },
        h('div', { class: 'pp-label-row' }, h('span', { class: 'pp-label', text: T.tagsLabel }),
          h('button', { type: 'button', class: 'pp-btn', text: T.newTagBtn, onclick: () => showTagManager(renderTagArea) })),
        tagArea));
    const save = async () => {
      const text = textIn.value;
      if (!text.trim()) { await showMessage(T.emptyText); textIn.focus(); return; }
      const rec = {
        id: existing ? existing.id : newId(),
        title: titleIn.value.trim() || T.untitled,
        text,
        fill: fillCb.checked,
        autoSend: sendCb.checked,
        tagIds: tagCbs.filter((x) => x.cb.checked).map((x) => x.t.id),  // 只存仍存在的標籤
      };
      const arr = getPrompts();
      const idx = arr.findIndex((p) => p.id === rec.id);
      if (idx >= 0) arr[idx] = rec; else arr.push(rec);
      setPrompts(arr);
      dlg.close();
      if (managerRefresh) managerRefresh();
    };
    const dlg = openDialog({
      title: existing ? T.editPrompt : T.newPrompt,
      body,
      onCancel: () => dlg.close(),
      buttons: [{ text: T.cancel, onClick: () => dlg.close() }, { text: T.save, primary: true, onClick: save }],
    });
    titleIn.focus();
  }

  // onClosed：從編輯頁開啟時，關閉後讓編輯頁重繪標籤勾選區
  function showTagManager(onClosed) {
    const list = h('div');
    const nameIn = h('input', { type: 'text', placeholder: T.newTagPlaceholder, style: 'flex:1' });
    const updateTag = (id, patch) => {
      setTags(getTags().map((t) => (t.id === id ? Object.assign({}, t, patch) : t)));
    };
    const refresh = () => {
      list.textContent = '';
      const tags = getTags();
      if (!tags.length) list.appendChild(h('div', { class: 'pp-help', text: T.noTags }));
      for (const t of tags) {
        const pill = tagPill(t);
        const bgIn = h('input', { type: 'color', title: T.bgColor });
        bgIn.value = isHexColor(t.bg) ? t.bg : DEFAULT_TAG_BG;
        const fgIn = h('input', { type: 'color', title: T.fgColor });
        fgIn.value = isHexColor(t.fg) ? t.fg : DEFAULT_TAG_FG;
        bgIn.addEventListener('input', () => { pill.style.background = bgIn.value; });
        fgIn.addEventListener('input', () => { pill.style.color = fgIn.value; });
        bgIn.addEventListener('change', () => { updateTag(t.id, { bg: bgIn.value }); if (managerRefresh) managerRefresh(); });
        fgIn.addEventListener('change', () => { updateTag(t.id, { fg: fgIn.value }); if (managerRefresh) managerRefresh(); });
        list.appendChild(h('div', { class: 'pp-mrow' },
          h('span', { style: 'flex:1;min-width:0' }, pill),
          h('span', { class: 'pp-hint', text: T.bgColor }), bgIn,
          h('span', { class: 'pp-hint', text: T.fgColor }), fgIn,
          h('button', {
            type: 'button', class: 'pp-btn pp-btn-danger', text: T.del,
            onclick: async () => {
              if (!(await showConfirm(T.confirmDeleteTag(t.name)))) return;
              setTags(getTags().filter((x) => x.id !== t.id));
              setPrompts(getPrompts().map((p) => Object.assign({}, p, { tagIds: (p.tagIds || []).filter((x) => x !== t.id) })));
              selectedTagIds.delete(t.id);
              refresh();
              if (managerRefresh) managerRefresh();
            },
          })));
      }
    };
    const add = () => {
      const name = nameIn.value.trim();
      if (!name) return;
      const tags = getTags();
      if (tags.some((t) => String(t.name).toLowerCase() === name.toLowerCase())) { nameIn.select(); return; }
      tags.push({ id: newId(), name, bg: DEFAULT_TAG_BG, fg: DEFAULT_TAG_FG });
      setTags(tags);
      nameIn.value = '';
      refresh();
    };
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } });
    const body = h('div', null,
      h('div', { class: 'pp-help', style: 'margin:0 0 8px' }, T.tagsIntro),
      list,
      h('div', { style: 'display:flex;gap:8px;margin-top:12px' }, nameIn,
        h('button', { type: 'button', class: 'pp-btn', text: T.addBtn, onclick: add })));
    const done = () => { dlg.close(); if (managerRefresh) managerRefresh(); if (typeof onClosed === 'function') onClosed(); };
    const dlg = openDialog({ title: T.tagsTitle, body, onCancel: done, buttons: [{ text: T.close, onClick: done }] });
    refresh();
  }

  // ───────────────────────── 匯入／匯出 ─────────────────────────

  function doExport() {
    const data = { format: EXPORT_FORMAT, version: EXPORT_VERSION, tags: getTags(), prompts: getPrompts() };
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `prompt-popout_${ymd}.json`, style: 'display:none' });
    getRoot().appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function importData(data) {
    if (!data || typeof data !== 'object') throw new Error(T.errFormat);
    if (data.format !== EXPORT_FORMAT) throw new Error(T.errFormat);
    if (!Array.isArray(data.tags) || !Array.isArray(data.prompts)) throw new Error(T.errStructure);
    const tags = getTags();
    const idMap = new Map();
    for (const ft of data.tags) {
      if (!ft || typeof ft.name !== 'string' || !ft.name.trim()) continue;
      const name = ft.name.trim();
      let t = tags.find((x) => String(x.name).toLowerCase() === name.toLowerCase());
      if (!t) {
        t = { id: newId(), name, bg: isHexColor(ft.bg) ? ft.bg.toLowerCase() : DEFAULT_TAG_BG, fg: isHexColor(ft.fg) ? ft.fg.toLowerCase() : DEFAULT_TAG_FG };
        tags.push(t);
      }
      if (ft.id != null) idMap.set(String(ft.id), t.id);
    }
    const prompts = getPrompts();
    let n = 0;
    for (const fp of data.prompts) {
      if (!fp || typeof fp.text !== 'string') continue;
      const tagIds = [...new Set((Array.isArray(fp.tagIds) ? fp.tagIds : []).map((x) => idMap.get(String(x))).filter(Boolean))];
      prompts.push({
        id: newId(),
        title: typeof fp.title === 'string' && fp.title.trim() ? fp.title : T.untitled,
        text: fp.text,
        fill: !!fp.fill,
        autoSend: !!fp.autoSend,
        tagIds,
      });
      n++;
    }
    setTags(tags);
    setPrompts(prompts);
    return n;
  }

  function doImport() {
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    fileIn.addEventListener('change', async () => {
      const file = fileIn.files && fileIn.files[0];
      fileIn.remove();
      if (!file) return;
      try {
        const txt = await file.text();
        let data;
        try { data = JSON.parse(txt); } catch (e) { throw new Error(T.errNotJson); }
        const n = importData(data);
        if (managerRefresh) managerRefresh();
        await showMessage(T.imported(n));
      } catch (e) {
        warn('匯入失敗', e);
        await showMessage(T.importFailed(e && e.message ? e.message : String(e)));
      }
    });
    getRoot().appendChild(fileIn);
    fileIn.click();
  }

  // ───────────────────────── 啟動 ─────────────────────────


  // ───────────────────────── 第一次安裝的範例 ─────────────────────────
  // 讓新使用者一打開就看得到填空、自動送出、標籤實際長什麼樣（使用者要求）。
  // 標籤刻意設計成：有的提示詞一個標籤、有的兩個、有的沒有，篩選才看得出效果。
  // 文字中的 {tag:鍵} 只是本段內部用來對應標籤的代號，寫入時換成真正的 id。
  const SEED = {
    'zh-TW': {
      tags: [['tr', '翻譯', '#5b7cfa'], ['wr', '寫作', '#d97757'], ['code', '程式', '#2f9e6e']],
      prompts: [
        ['翻成[語言]', '把下面這段翻成[語言::英文]，語氣要[語氣](例如：正式、輕鬆)：', true, false, ['tr']],
        ['改用[語言]回答', '接下來請一律用[語言::英文]回答我。', true, true, ['tr']],
        ['潤飾後翻成英文', '先幫我潤飾下面這段中文，再翻成英文，兩個版本都列出來：', false, false, ['tr', 'wr']],
        ['校對錯字', '幫我找出下面這段的錯字和語病，列出原句和建議改法：', false, false, ['wr']],
        ['解釋程式碼', '用[程度::初學者]看得懂的方式，逐行解釋下面的[程式語言::JavaScript]程式碼：', true, false, ['code']],
        ['總結這段對話', '用三點整理我們到目前為止的對話重點。', false, true, []],
      ],
    },
    en: {
      tags: [['tr', 'Translate', '#5b7cfa'], ['wr', 'Writing', '#d97757'], ['code', 'Code', '#2f9e6e']],
      prompts: [
        ['Translate to [language]', 'Translate the text below into [language::English], in a [tone](e.g. formal, casual) tone:', true, false, ['tr']],
        ['Reply in [language]', 'From now on, please reply to me in [language::English].', true, true, ['tr']],
        ['Polish, then translate', 'First polish the text below, then translate it into Spanish. Show both versions:', false, false, ['tr', 'wr']],
        ['Proofread', 'Find the typos and awkward phrasing in the text below. List each original sentence with a suggested fix:', false, false, ['wr']],
        ['Explain code', 'Explain the [language::JavaScript] code below line by line, for a [level::beginner]:', true, false, ['code']],
        ['Summarise the chat', 'Summarise our conversation so far in three bullet points.', false, true, []],
      ],
    },
  };

  // 只在兩個儲存鍵都「從來沒寫過」時放入：使用者把範例全刪掉後是空陣列，不會被補回來；已有資料的人不受影響
  function seedIfFirstRun() {
    try {
      if (GM_getValue(STORE_PROMPTS, null) !== null || GM_getValue(STORE_TAGS, null) !== null) return;
      const seed = /^zh/i.test(navigator.language || '') ? SEED['zh-TW'] : SEED.en;
      const ids = {};
      const tags = seed.tags.map(([key, name, bg]) => { ids[key] = newId(); return { id: ids[key], name, bg, fg: '#ffffff' }; });
      const prompts = seed.prompts.map(([title, text, fill, autoSend, keys]) => ({ id: newId(), title, text, fill, autoSend, tagIds: keys.map((k) => ids[k]) }));
      setTags(tags);
      setPrompts(prompts);
      log('第一次使用，已放入範例提示詞');
    } catch (e) {
      warn('放入範例失敗', e);
    }
  }

  function init() {
    seedIfFirstRun();
    injectStyle();
    getRoot();
    document.addEventListener('mousemove', onMouseMove, { passive: true, capture: true });
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    document.addEventListener('mousedown', onPointerDownCapture, true);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('keydown', onKeyDown, true);
    try {
      GM_registerMenuCommand(T.manage, showManager);
    } catch (e) {
      warn('註冊選單指令失敗', e);
    }
    requestAnimationFrame(loop);
    log(T.loaded(SCRIPT_VERSION));
  }

  init();
})();
