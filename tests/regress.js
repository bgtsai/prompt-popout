// Prompt Popout 回歸測試：三引擎 × 三個網站的模擬頁（不需要真實網站）
// 用法：node tests/regress.js [腳本路徑，預設 repo 根目錄的腳本] [截圖輸出目錄]
'use strict';
const fs = require('fs');
const path = require('path');
const PW = require(process.env.PW_MODULE || '/home/claude/.npm-global/lib/node_modules/playwright');

const SCRIPT = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'prompt_popout.user.js'), 'utf8');
const SHOT_DIR = process.argv[3] || '';
const ENGINES = (process.env.ENGINES || 'chromium,firefox,webkit').split(',');
const SITES = (process.env.SITES || 'claude,chatgpt,gemini').split(',');

// GM API 模擬：同步與 Promise 兩種介面都給
const SHIM = `
window.__store = window.__store || {};
window.__menu = [];
window.GM_getValue = (k, d) => (k in __store ? JSON.parse(JSON.stringify(__store[k])) : d);
window.GM_setValue = (k, v) => { __store[k] = JSON.parse(JSON.stringify(v)); };
window.GM_deleteValue = (k) => { delete __store[k]; };
window.GM_registerMenuCommand = (n, f) => { __menu.push([n, f]); };
window.GM_info = { script: { version: 'TEST' } };
window.GM = { getValue: async (k, d) => GM_getValue(k, d), setValue: async (k, v) => GM_setValue(k, v), registerMenuCommand: GM_registerMenuCommand, info: GM_info };
window.unsafeWindow = window;
`;

// 模擬 Claude 卡片：圓角小數、box-shadow 環前面有透明項、hover 時外框加深且有轉場
const PAGES = {
  claude: {
    url: 'https://claude.ai/new',
    html: `<!doctype html><html><head><style>
      body{margin:0;background:rgb(250,249,245);font:16px sans-serif}
      .wrap{padding:200px 120px}
      .card{position:relative;border-radius:15.75px;background:#fff;padding:12px 16px;
        box-shadow:0 0 0 0 transparent,0 0 0 0 transparent,0 0 0 1px rgba(31,30,29,.15),0 4px 20px rgba(0,0,0,.035);transition:box-shadow .2s}
      .card:hover{box-shadow:0 0 0 0 transparent,0 0 0 0 transparent,0 0 0 2px rgba(31,30,29,.45),0 4px 20px rgba(0,0,0,.07)}
      [data-testid=chat-input]{min-height:48px;outline:none}
      [data-testid=chat-input] p{margin:0}
    </style></head><body><div class="wrap"><div class="card"><div class="ProseMirror" contenteditable="true" data-testid="chat-input"><p><br></p></div>
      <div style="display:flex;justify-content:flex-end"><button data-testid="chat-input-send" disabled>Send</button></div></div></div>
    <script>
      window.__sent=[];const ed=document.querySelector('[data-testid=chat-input]'),b=document.querySelector('[data-testid=chat-input-send]');
      ed.addEventListener('input',()=>{b.disabled=!ed.innerText.trim();});
      b.addEventListener('click',()=>__sent.push(ed.innerText));
    </script></body></html>`,
  },
  chatgpt: {
    url: 'https://chatgpt.com/',
    html: `<!doctype html><html><head><style>body{margin:0;background:#fff;font:16px sans-serif}.wrap{padding:200px 120px}
      .card{position:relative;border-radius:28px;background:#fff;padding:12px 16px;box-shadow:0 0 0 1px rgba(0,0,0,.1)}
      #prompt-textarea{min-height:48px;outline:none}#prompt-textarea p{margin:0}</style></head>
      <body><div class="wrap"><div class="card"><div id="prompt-textarea" class="ProseMirror" contenteditable="true"><p><br></p></div>
      <button data-testid="send-button" disabled>Send</button></div></div>
      <script>window.__sent=[];const ed=document.getElementById('prompt-textarea'),b=document.querySelector('[data-testid=send-button]');
      ed.addEventListener('input',()=>{b.disabled=!ed.innerText.trim();});b.addEventListener('click',()=>__sent.push(ed.innerText));</script></body></html>`,
  },
  gemini: {
    url: 'https://gemini.google.com/app',
    // Gemini 啟用 Trusted Types：沒經 policy 的 innerHTML 會丟例外
    csp: "require-trusted-types-for 'script'; trusted-types *",
    html: `<!doctype html><html><head><style>body{margin:0;background:#fff;font:16px sans-serif}.wrap{padding:200px 120px}
      .card{position:relative;border-radius:24px;background:#f0f4f9;padding:12px 16px;border:1px solid #c4c7c5}
      .ql-editor{min-height:48px;outline:none}.ql-editor p{margin:0}</style></head>
      <body><div class="wrap"><div class="card"><rich-textarea><div class="ql-editor" contenteditable="true"><p><br></p></div></rich-textarea>
      <div class="send-button-container"><button class="send-button submit" aria-disabled="true">Send</button></div></div></div>
      <script>window.__sent=[];const ed=document.querySelector('.ql-editor'),b=document.querySelector('.send-button');
      ed.addEventListener('input',()=>{b.setAttribute('aria-disabled',ed.innerText.trim()?'false':'true');});
      b.addEventListener('click',()=>{if(b.getAttribute('aria-disabled')!=='true')__sent.push(ed.innerText);});</script></body></html>`,
  },
};

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup(browser, site, store, locale) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, locale: locale || 'zh-TW', deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const P = PAGES[site];
  await page.route('**/*', (route) => route.fulfill({
    status: 200, contentType: 'text/html; charset=utf-8',
    headers: P.csp ? { 'content-security-policy': P.csp } : {}, body: P.html,
  }));
  await page.goto(P.url);
  // 先放資料，再注入腳本（模擬 document-end）；用 eval 不經 innerHTML，避開頁面自己的 Trusted Types
  await page.evaluate(([shim, st]) => { (0, eval)(shim); window.__store = st; }, [SHIM, store || {}]);
  await page.evaluate((src) => { (0, eval)(src); }, SCRIPT);
  await sleep(1300); // 讓每秒一次的顏色重讀至少跑一輪
  return { ctx, page, errors };
}

const cardBox = (page) => page.evaluate(() => {
  const c = document.querySelector('.card'); const r = c.getBoundingClientRect();
  const a = getComputedStyle(c, '::after'), b = getComputedStyle(c, '::before');
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cls: c.className,
    afterW: a.width, afterL: a.left, afterT: a.top, afterBg: a.backgroundColor, afterRadius: a.borderRadius,
    beforeW: b.width, beforeBg: b.backgroundColor, beforeBorder: b.borderRightColor + ' ' + b.borderRightWidth };
});
const menuState = (page) => page.evaluate(() => {
  const all = [...document.querySelectorAll('[id^=pp-],[class*=pp-]')].filter((e) => getComputedStyle(e).position === 'fixed' && e.offsetParent !== null || (getComputedStyle(e).position === 'fixed' && getComputedStyle(e).display !== 'none'));
  const m = all.find((e) => /prompt|管理|Manage|還沒有|No prompts/i.test(e.innerText) && e.getBoundingClientRect().width >= 300 && e.getBoundingClientRect().width <= 340);
  if (!m) return null;
  const r = m.getBoundingClientRect();
  return { left: r.left, top: r.top, bottom: r.bottom, width: r.width, text: m.innerText };
});

const SAMPLE = {
  'pp.tags': [{ id: 't1', name: 'work', bg: '#ff0000', fg: '#ffffff' }, { id: 't2', name: 'code', bg: '#0000ff', fg: '#ffffff' }],
  'pp.prompts': [
    { id: 'a', title: 'Plain', text: 'line one\n\nline three', fill: false, autoSend: false, tagIds: ['t1'] },
    { id: 'b', title: 'Fill me', text: 'Hi [name::Bob](who) and [name], topic [topic]', fill: true, autoSend: true, tagIds: ['t1', 't2'] },
    { id: 'c', title: 'Raw brackets', text: 'keep [this]', fill: false, autoSend: false, tagIds: [] },
  ],
};

async function runSite(engineName, browser, site) {
  const tag = `[${engineName}/${site}]`;
  // ── 1. 空資料：把手外觀與清單空狀態
  let { ctx, page, errors } = await setup(browser, site, { 'pp.prompts': [], 'pp.tags': [] });
  const before = { right: 1100 - 120 };
  const cb = await cardBox(page);
  const radius = site === 'claude' ? 16 : site === 'chatgpt' ? 28 : 24;
  const W = radius * 2;
  check(`${tag} 卡片加上 pp- class`, /\bpp-/.test(cb.cls), cb.cls);
  check(`${tag} 卡片右緣不動`, Math.abs(cb.right - before.right) < 1.5, { now: cb.right, before: before.right });
  check(`${tag} 卡片左緣不動（不往外撐大）`, Math.abs(cb.left - 120) < 1.5, { now: cb.left, before: 120 });
  check(`${tag} 卡片寬度不變`, Math.abs((cb.right - cb.left) - (1100 - 240)) < 1.5, { width: cb.right - cb.left, expected: 1100 - 240 });
  const { inputLeft, bl } = await page.evaluate(() => ({
    inputLeft: document.querySelector('[contenteditable="true"]').getBoundingClientRect().left,
    bl: parseFloat(getComputedStyle(document.querySelector('.card')).borderLeftWidth) || 0 }));
  check(`${tag} 輸入內容往右讓出 2R=${W}px`, Math.abs(inputLeft - (120 + bl + 16 + W)) < 1.5, { inputLeft, expected: 120 + bl + 16 + W });
  check(`${tag} 燈條寬 6px`, cb.afterW === '6px', cb.afterW);
  check(`${tag} 燈條 left=R-3`, Math.abs(parseFloat(cb.afterL) - (radius - 3)) < 0.6, cb.afterL);
  check(`${tag} 燈條 top=R-3`, Math.abs(parseFloat(cb.afterT) - (radius - 3)) < 0.6, cb.afterT);
  check(`${tag} 區塊寬=2R+分隔線`, Math.abs(parseFloat(cb.beforeW) - W) <= 2.01, cb.beforeW);
  if (site === 'claude') {
    check(`${tag} 區塊底色=頁面底色`, cb.beforeBg === 'rgb(250, 249, 245)', cb.beforeBg);
    // 分隔線鎖定：hover 卡片後外框變深，分隔線不能跟著變
    const sep0 = cb.beforeBorder;
    await page.mouse.move(600, cb.top + 20); await sleep(1500);
    const sep1 = (await cardBox(page)).beforeBorder;
    check(`${tag} 分隔線在卡片 hover 時不變`, sep0 === sep1, { sep0, sep1 });
    await page.mouse.move(5, 5); await sleep(400);
  }
  // 滑入把手 → 250ms 後開清單（先確認 150ms 時還沒開）
  const bx = cb.left + radius, by = (cb.top + cb.bottom) / 2;
  await page.mouse.move(bx, by); await sleep(120);
  const early = await menuState(page);
  check(`${tag} 250ms 內尚未開清單`, !early);
  await sleep(350);
  let m = await menuState(page);
  check(`${tag} 滑過把手開清單`, !!m);
  if (m) {
    check(`${tag} 清單寬 320`, Math.abs(m.width - 320) < 1, m.width);
    check(`${tag} 清單在把手右側 (卡片左+W+4)`, Math.abs(m.left - (cb.left + W + 4)) < 1.5, { left: m.left, expected: cb.left + W + 4 });
    check(`${tag} 空狀態文字`, /還沒有提示詞/.test(m.text), m.text);
    const ACTIVE = { claude: 'rgb(217, 119, 87)', chatgpt: 'rgb(0, 0, 0)', gemini: 'rgb(11, 87, 208)' }[site];
    check(`${tag} 燈條變該站主色`, (await cardBox(page)).afterBg === ACTIVE, (await cardBox(page)).afterBg);
    if (SHOT_DIR && site === 'claude') await page.screenshot({ path: path.join(SHOT_DIR, `${engineName}_${site}_open_empty.png`), clip: { x: cb.left - 10, y: cb.top - 20, width: 420, height: 200 } });
  }
  // Esc 關閉
  await page.keyboard.press('Escape'); await sleep(100);
  check(`${tag} Esc 關閉`, !(await menuState(page)));
  // 編輯頁：沒有標籤時提示先建立；「新增標籤…」建完回來，新標籤出現、已輸入內容不遺失
  const tagFlow = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const btn = (re) => [...document.querySelectorAll('#pp-root button')].filter((x) => x.offsetParent).reverse().find((x) => re.test(x.innerText.trim()));
    __menu.find(([n]) => /管理|Manage/.test(n))[1](); await wait(80);
    btn(/^(新增|Add)$/).click(); await wait(80);
    const ed = [...document.querySelectorAll('#pp-root .pp-dialog')].pop();
    const hint = /還沒有標籤/.test(ed.innerText);
    ed.querySelector('input[type=text]').value = 'keep me';
    btn(/^新增標籤…$/).click(); await wait(80);
    const tm = [...document.querySelectorAll('#pp-root .pp-dialog')].pop();
    const noHelpInTagPage = !tm.querySelector('.pp-link');
    const inp = [...tm.querySelectorAll('input[type=text]')].pop(); inp.value = 'NewTag';
    [...tm.querySelectorAll('button')].find((b) => /^(新增|Add)$/.test(b.innerText.trim())).click(); await wait(50);
    [...tm.querySelectorAll('button')].find((b) => /^(關閉|Close)$/.test(b.innerText.trim())).click(); await wait(80);
    const after = ed.innerText;
    const res = { hint, noHelpInTagPage, tagShown: /NewTag/.test(after) && !!ed.querySelector('.pp-taglist input[type=checkbox]'), kept: ed.querySelector('input[type=text]').value, editorHelp: ed.querySelectorAll('.pp-link').length };
    // 用介面上的按鈕依序關掉（直接移除 DOM 會讓腳本以為管理視窗還開著）
    for (let i = 0; i < 4 && document.querySelector('#pp-root .pp-overlay'); i++) {
      const top = [...document.querySelectorAll('#pp-root .pp-dialog')].pop();
      [...top.querySelectorAll('.pp-dialog-foot button')].find((b) => /^(取消|關閉|Cancel|Close)$/.test(b.innerText.trim())).click();
      await wait(50);
    }
    return res;
  });
  check(`${tag} 編輯頁無標籤時提示先建立`, tagFlow.hint);
  check(`${tag} 標籤管理頁沒有詳細說明`, tagFlow.noHelpInTagPage);
  check(`${tag} 編輯頁新增標籤後直接出現且內容保留`, tagFlow.tagShown && tagFlow.kept === 'keep me', tagFlow);
  check(`${tag} 編輯頁有 2 個詳細說明（標籤沒有）`, tagFlow.editorHelp === 2, tagFlow.editorHelp);
  // 對話框蓋在把手上時，對話框裡的點擊不能被把手攔走（v1.2.1 修正）
  const sw = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    __menu.find(([n]) => /管理|Manage/.test(n))[1](); await wait(80);
    [...document.querySelectorAll('#pp-root button')].filter((x) => x.offsetParent).reverse().find((x) => /^(新增|Add)$/.test(x.innerText.trim())).click(); await wait(80);
    const lab = [...document.querySelectorAll('#pp-root label.pp-check')].filter((x) => x.offsetParent)[0];
    const r = lab.getBoundingClientRect();
    // 把卡片移到讓把手正好落在這個勾選框上
    const card = document.querySelector('.card');
    const c = card.getBoundingClientRect();
    card.style.transform = `translate(${r.left + 4 - c.left - (parseFloat(getComputedStyle(card).getPropertyValue('--pp-w')) || 0) / 2}px, ${r.top + r.height / 2 - (c.top + c.height / 2)}px)`;
    await wait(80);
    return { x: r.left + 6, y: r.top + r.height / 2, cb: lab.querySelector('input').checked };
  });
  const zoneHit = await page.evaluate(([x, y]) => { const c = document.querySelector('.card').getBoundingClientRect(); return x >= c.left - 5 && x <= c.left + 40 && y >= c.top && y <= c.bottom; }, [sw.x, sw.y]);
  await page.mouse.click(sw.x, sw.y); await sleep(400);
  const sw2 = await page.evaluate(() => ({ cb: [...document.querySelectorAll('#pp-root label.pp-check input')].filter((x) => x.offsetParent)[0].checked, popup: !!document.querySelector('#pp-root .pp-popup') && getComputedStyle(document.querySelector('#pp-root .pp-popup')).display !== 'none' }));
  check(`${tag} （前提）把手確實在勾選框位置`, zoneHit);
  check(`${tag} 對話框蓋住把手時勾選框照常切換、清單不開`, sw2.cb !== sw.cb && !sw2.popup, { before: sw.cb, after: sw2 });
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // 用介面上的按鈕依序關掉（直接移除 DOM 會讓腳本以為管理視窗還開著）
    for (let i = 0; i < 4 && document.querySelector('#pp-root .pp-overlay'); i++) {
      const top = [...document.querySelectorAll('#pp-root .pp-dialog')].pop();
      [...top.querySelectorAll('.pp-dialog-foot button')].find((b) => /^(取消|關閉|Cancel|Close)$/.test(b.innerText.trim())).click();
      await wait(50);
    }
    document.querySelector('.card').style.transform = '';
  });
  await sleep(100);
  check(`${tag} 無頁面錯誤（空資料）`, errors.length === 0, errors.slice(0, 3));
  await ctx.close();

  // ── 2. 有資料
  ({ ctx, page, errors } = await setup(browser, site, JSON.parse(JSON.stringify(SAMPLE))));
  const c2 = await cardBox(page);
  const hx = c2.left + radius, hy = (c2.top + c2.bottom) / 2;
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `${engineName}_${site}_idle.png`), clip: { x: c2.left - 10, y: c2.top - 10, width: 200, height: c2.bottom - c2.top + 20 } });
  await page.mouse.move(hx, hy); await sleep(450);
  m = await menuState(page);
  check(`${tag} 清單列出 3 筆`, m && /Plain/.test(m.text) && /Fill me/.test(m.text) && /Raw brackets/.test(m.text), m && m.text);
  check(`${tag} 填空標記`, m && /填空/.test(m.text));
  // 競態：一步從把手跨進清單
  if (m) {
    await page.mouse.move(m.left + 100, Math.min(m.bottom - 30, hy)); await sleep(700);
    check(`${tag} 一步跨進清單不被關閉`, !!(await menuState(page)));
    if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `${engineName}_${site}_menu.png`), clip: { x: c2.left - 10, y: Math.max(0, m.top - 10), width: 420, height: m.bottom - m.top + 20 } });
  }
  // 標籤篩選 AND：點 work 與 code → 只剩 Fill me
  const chipClick = async (name) => page.evaluate((n) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === n && x.closest('[class*=pp-],[id^=pp-]')); if (b) { b.click(); return true; } return false;
  }, name);
  const okW = await chipClick('work'); await sleep(150);
  m = await menuState(page);
  check(`${tag} 篩選 work → 2 筆`, okW && m && /Plain/.test(m.text) && /Fill me/.test(m.text) && !/Raw brackets/.test(m.text), m && m.text);
  await chipClick('code'); await sleep(150);
  m = await menuState(page);
  check(`${tag} 篩選 work+code (AND) → 1 筆`, m && !/Plain/.test(m.text) && /Fill me/.test(m.text), m && m.text);
  await chipClick('code'); await chipClick('work'); await sleep(150);
  // 點 Plain → 插入多行
  await page.evaluate(() => { const it = [...document.querySelectorAll('[class*=pp-] *')].find((e) => e.children.length <= 3 && /^Plain/.test(e.innerText.trim()) && e.getBoundingClientRect().height > 20); it && it.click(); });
  await sleep(300);
  const ins = await page.evaluate(() => { const ed = document.querySelector('[contenteditable=true]'); return { text: ed.innerText, ps: ed.querySelectorAll('p').length }; });
  check(`${tag} 插入文字`, /line one/.test(ins.text) && /line three/.test(ins.text), ins);
  if (site === 'claude') check(`${tag} Claude 多行成獨立段落（≥3 段）`, ins.ps >= 3, ins);
  // 填空 + 自動送出
  await page.mouse.move(5, 5); await sleep(500);
  await page.mouse.move(hx, hy); await sleep(450);
  await page.evaluate(() => { const it = [...document.querySelectorAll('[class*=pp-] *')].find((e) => e.children.length <= 3 && /^Fill me/.test(e.innerText.trim()) && e.getBoundingClientRect().height > 20); it && it.click(); });
  await sleep(300);
  const dlg = await page.evaluate(() => { const ta = [...document.querySelectorAll('textarea')]; return { n: ta.length, vals: ta.map((t) => t.value), text: document.body.innerText.includes('填空') }; });
  check(`${tag} 填空對話框：同名只問一次 → 2 欄`, dlg.n === 2 && dlg.text, dlg);
  check(`${tag} 預設值預填`, dlg.vals[0] === 'Bob', dlg.vals);
  await page.evaluate(() => { const ta = [...document.querySelectorAll('textarea')]; ta[1].value = 'AI'; ta[1].dispatchEvent(new Event('input', { bubbles: true })); });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await sleep(800);
  const sent = await page.evaluate(() => window.__sent);
  check(`${tag} 自動送出且欄位已替換`, sent.length === 1 && /Hi Bob and Bob, topic AI/.test(sent[0]) && !/\(who\)/.test(sent[0]), sent);
  // 管理：用選單指令開啟、新增一筆
  await page.evaluate(() => { const c = __menu.find(([n]) => /管理|Manage/.test(n)); c && c[1](); });
  await sleep(200);
  check(`${tag} 管理視窗開啟`, await page.evaluate(() => /管理提示詞|Manage/.test(document.body.innerText)));
  if (SHOT_DIR && site === 'claude') await page.screenshot({ path: path.join(SHOT_DIR, `${engineName}_${site}_manager.png`) });
  // 03 第⑪條：所有可見文字 ≥ 16px；30 第⑲條：所有按鈕同一高度
  const sizes = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#pp-root *')].filter((e) => e.offsetParent && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    const small = els.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.className + ':' + getComputedStyle(e).fontSize);
    const hs = [...new Set([...document.querySelectorAll('#pp-root .pp-btn')].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height)))];
    return { small, hs };
  });
  check(`${tag} 管理視窗文字皆 ≥16px`, sizes.small.length === 0, sizes.small.slice(0, 5));
  check(`${tag} 管理視窗按鈕同高`, sizes.hs.length === 1 && sizes.hs[0] === 36, sizes.hs);
  const before3 = await page.evaluate(() => __store['pp.prompts'].length);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(新增|New|Add)$/.test(x.innerText.trim())); b.click(); });
  await sleep(200);
  if (SHOT_DIR && site === 'claude') await page.screenshot({ path: path.join(SHOT_DIR, `${engineName}_${site}_edit.png`) });
  // 編輯頁三個「詳細說明」連結都能開說明視窗，且不會切換勾選框
  const helpRes = await page.evaluate(async () => {
    const out = [];
    const links = [...document.querySelectorAll('#pp-root .pp-link')].filter((x) => x.offsetParent);
    const cbs0 = [...document.querySelectorAll('#pp-root input[type=checkbox]')].map((c) => c.checked).join();
    for (const l of links) {
      l.click(); await new Promise((r) => setTimeout(r, 80));
      const dlgs = [...document.querySelectorAll('#pp-root .pp-dialog')];
      const top = dlgs[dlgs.length - 1];
      out.push({ title: top.querySelector('.pp-dialog-head').innerText, hasCode: !!top.querySelector('.pp-code') });
      [...top.querySelectorAll('button')].find((b) => /關閉|Close/.test(b.innerText)).click();
      await new Promise((r) => setTimeout(r, 50));
    }
    const cbs1 = [...document.querySelectorAll('#pp-root input[type=checkbox]')].map((c) => c.checked).join();
    return { out, same: cbs0 === cbs1 };
  });
  check(`${tag} 編輯頁 2 個詳細說明（填空、自動送出）都能開、含範例`, helpRes.out.length === 2 && helpRes.out.every((x) => x.hasCode), helpRes.out);
  check(`${tag} 點詳細說明不切換勾選`, helpRes.same);
  await page.evaluate(() => {
    const ins = [...document.querySelectorAll('input[type=text]')].filter((x) => x.offsetParent); const tas = [...document.querySelectorAll('textarea')].filter((x) => x.offsetParent);
    ins[ins.length - 1].value = 'New one'; tas[tas.length - 1].value = 'body';
    const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent).find((x) => /^(儲存|Save)$/.test(x.innerText.trim())); b.click();
  });
  await sleep(300);
  const after = await page.evaluate(() => __store['pp.prompts']);
  check(`${tag} 新增後存進 pp.prompts`, after.length === before3 + 1 && after[after.length - 1].title === 'New one' && typeof after[after.length - 1].id === 'string', after[after.length - 1]);
  check(`${tag} 新增提示詞預設勾選使用填空`, after[after.length - 1].fill === true, after[after.length - 1].fill);
  const keys = await page.evaluate(() => Object.keys(__store).sort());
  check(`${tag} 只用 pp.prompts／pp.tags 兩個鍵`, JSON.stringify(keys) === '["pp.prompts","pp.tags"]', keys);
  // 鍵盤事件不冒泡到網站
  const leaked = await page.evaluate(() => { let n = 0; const h = () => n++; document.addEventListener('keydown', h); const ta = [...document.querySelectorAll('input,textarea')].filter((x) => x.offsetParent).pop(); ta && ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })); document.removeEventListener('keydown', h); return n; });
  check(`${tag} 對話框鍵盤事件不冒泡`, leaked === 0, leaked);
  check(`${tag} 無頁面錯誤（有資料）`, errors.length === 0, errors.slice(0, 3));
  await ctx.close();

  // ── 3. 英文介面
  ({ ctx, page, errors } = await setup(browser, site, {}, 'en-US'));
  const c3 = await cardBox(page);
  await page.mouse.move(c3.left + radius, (c3.top + c3.bottom) / 2); await sleep(450);
  m = await menuState(page);
  check(`${tag} 英文介面`, m && !/還沒有/.test(m.text) && /[A-Za-z]/.test(m.text), m && m.text);
  // 第一次安裝（儲存完全沒寫過）放入範例：英文環境英文範例；標籤有的一個、有的兩個、有的沒有
  const seedEn = await page.evaluate(() => ({ p: __store['pp.prompts'], t: __store['pp.tags'] }));
  const tagCounts = seedEn.p.map((x) => x.tagIds.length);
  check(`${tag} 第一次安裝放入英文範例`, seedEn.p.length === 6 && seedEn.t.length === 3 && /Translate/.test(seedEn.p[0].title), seedEn.p.map((x) => x.title));
  check(`${tag} 範例標籤有 0、1、2 個的提示詞`, tagCounts.includes(0) && tagCounts.includes(1) && tagCounts.includes(2), tagCounts);
  check(`${tag} 範例同時示範填空與自動送出`, seedEn.p.some((x) => x.fill) && seedEn.p.some((x) => x.autoSend) && seedEn.p.some((x) => x.fill && x.autoSend));
  check(`${tag} 範例標籤 id 都對得上`, seedEn.p.every((x) => x.tagIds.every((id) => seedEn.t.some((t) => t.id === id))));
  await ctx.close();

  // 中文環境放中文範例；已有空陣列（使用者刪光過）時不再補回
  ({ ctx, page, errors } = await setup(browser, site, {}));
  const seedZh = await page.evaluate(() => __store['pp.prompts'].map((x) => x.title));
  check(`${tag} 第一次安裝放入中文範例`, seedZh.length === 6 && /翻成/.test(seedZh[0]), seedZh);
  await ctx.close();
  ({ ctx, page, errors } = await setup(browser, site, { 'pp.prompts': [], 'pp.tags': [] }));
  check(`${tag} 刪光後不會再放範例`, await page.evaluate(() => __store['pp.prompts'].length === 0 && __store['pp.tags'].length === 0));
  await ctx.close();
}

(async () => {
  if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });
  for (const e of ENGINES) {
    const browser = await PW[e].launch();
    for (const s of SITES) {
      try { await runSite(e, browser, s); } catch (err) { check(`[${e}/${s}] 測試流程例外`, false, String(err).slice(0, 300)); }
    }
    await browser.close();
  }
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} 通過`);
  process.exit(fail.length ? 1 : 0);
})();
