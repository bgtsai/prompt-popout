// 轉檔工具 → 腳本匯入 → 匯出 的端對端測試
// 用法：node tests/convert_import.js
'use strict';
const PW = require(process.env.PW_MODULE || '/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
const SRC = fs.readFileSync(path.join(ROOT, 'prompt_popout.user.js'), 'utf8');
let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '  ' + JSON.stringify(d) : ''}`); };

// 舊格式範例：大小寫重複的標籤、空白標題、缺 text 的項目
const OLD = [
  { title: 'A', text: 'x [f::d](h)', usePlaceholders: true, autoExecute: false, tags: ['Work', 'work', 'Code'], usageCount: 3 },
  { title: '  ', text: 'y', usePlaceholders: false, autoExecute: true, tags: [] },
  { title: 'bad' },
];

(async () => {
  const b = await PW.chromium.launch();
  // 1. 轉檔
  fs.writeFileSync(path.join(TMP, 'old.json'), JSON.stringify(OLD));
  // 轉檔工具依瀏覽器語言顯示：英文環境先檢查一次介面，再用中文環境做轉檔
  const pe = await (await b.newContext({ locale: 'en-US' })).newPage();
  await pe.goto('file://' + path.join(ROOT, 'tools/convert.html'));
  const enText = await pe.innerText('body');
  check('轉檔工具：英文環境只顯示英文', /Convert & download/.test(enText) && !/轉換/.test(enText), enText.slice(0, 80));
  let p = await (await b.newContext({ acceptDownloads: true, locale: 'zh-TW' })).newPage();
  check('轉檔工具：中文環境只顯示中文', await p.goto('file://' + path.join(ROOT, 'tools/convert.html')).then(() => p.innerText('body')).then((t) => /轉換並下載/.test(t) && !/Convert/.test(t)));
  await p.goto('file://' + path.join(ROOT, 'tools/convert.html'));
  const auto = p.waitForEvent('download', { timeout: 3000 }).catch(() => null);
  await p.setInputFiles('input[type=file]', path.join(TMP, 'old.json'));
  await p.waitForTimeout(300);
  let d = await auto;
  if (!d) { const w = p.waitForEvent('download'); await (await p.$('button:not([disabled])')).click(); d = await w; }
  const conv = JSON.parse(fs.readFileSync(await d.path(), 'utf8'));
  fs.writeFileSync(path.join(TMP, 'new.json'), JSON.stringify(conv));
  check('轉檔：檔名', d.suggestedFilename() === 'prompt-popout_import.json', d.suggestedFilename());
  check('轉檔：格式欄位', conv.format === 'prompt-popout' && conv.version === 1);
  check('轉檔：2 筆（略過缺 text）', conv.prompts.length === 2);
  check('轉檔：標籤不分大小寫去重 → 2 個', conv.tags.length === 2, conv.tags.map((t) => t.name));
  check('轉檔：空白標題 → (無標題)', conv.prompts[1].title === '(無標題)');
  check('轉檔：欄位對應', conv.prompts[0].fill === true && conv.prompts[1].autoSend === true && conv.prompts[0].text === 'x [f::d](h)');

  // 2. 匯入到已有資料的腳本
  const ctx = await b.newContext({ acceptDownloads: true, locale: 'zh-TW' });
  p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.route('**/*', (r) => r.fulfill({ contentType: 'text/html', body: '<div style="border-radius:16px;position:relative"><div data-testid="chat-input" contenteditable="true"></div></div>' }));
  await p.goto('https://claude.ai/');
  await p.evaluate(() => {
    window.__store = { 'pp.tags': [{ id: 'e', name: 'work', bg: '#000000', fg: '#ffffff' }], 'pp.prompts': [{ id: 'z', title: 'Existing', text: 'q', fill: false, autoSend: false, tagIds: ['e'] }] };
    window.__menu = [];
    window.GM_getValue = (k, v) => (k in __store ? JSON.parse(JSON.stringify(__store[k])) : v);
    window.GM_setValue = (k, v) => { __store[k] = JSON.parse(JSON.stringify(v)); };
    window.GM_registerMenuCommand = (n, f) => __menu.push([n, f]);
    window.GM_info = { script: { version: 'T' } };
  });
  await p.evaluate((s) => (0, eval)(s), SRC);
  await p.waitForTimeout(300);
  await p.evaluate(() => __menu[0][1]());
  await p.waitForTimeout(200);
  const btn = (t) => p.evaluate((t) => [...document.querySelectorAll('button')].filter((x) => x.offsetParent).find((x) => x.innerText.trim() === t)?.click(), t);
  let fc = p.waitForEvent('filechooser'); await btn('匯入'); await (await fc).setFiles(path.join(TMP, 'new.json')); await p.waitForTimeout(400);
  check('匯入：訊息', /已匯入 2 筆提示詞/.test(await p.innerText('body')));
  const st = await p.evaluate(() => __store);
  check('匯入：附加在尾端', st['pp.prompts'].map((x) => x.title).join(',') === 'Existing,A,(無標題)');
  check('匯入：Work 對應既有 work、不新建，Code 新建', st['pp.tags'].map((t) => t.name).join(',') === 'work,Code', st['pp.tags']);
  await btn('確定');
  // 3. 匯出
  const w = p.waitForEvent('download'); await btn('匯出'); const ex = await w;
  const out = JSON.parse(fs.readFileSync(await ex.path(), 'utf8'));
  check('匯出：檔名', /^prompt-popout_\d{8}\.json$/.test(ex.suggestedFilename()), ex.suggestedFilename());
  check('匯出：內容', out.format === 'prompt-popout' && out.prompts.length === 3 && out.tags.length === 2);
  // 4. 不認得的格式（舊格式直接匯入）要拒絕
  fc = p.waitForEvent('filechooser'); await btn('匯入'); await (await fc).setFiles(path.join(TMP, 'old.json')); await p.waitForTimeout(400);
  check('匯入：拒絕非本腳本格式', /匯入失敗/.test(await p.innerText('body')));
  check('無頁面錯誤', errs.length === 0, errs);
  await b.close();
  console.log(fail ? `${fail} 項失敗` : '全部通過');
  process.exit(fail ? 1 : 0);
})();
