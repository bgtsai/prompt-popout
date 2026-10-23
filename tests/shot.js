// README 用截圖：ChatGPT 模擬頁（Claude 的 Enter 圖示要靠 Claude 自己的圖示字型，模擬頁沒有），開啟清單，zh-TW 與 en 各一張
const PW=require('/home/claude/.npm-global/lib/node_modules/playwright');const fs=require('fs');
const path=require('path');const SRC=fs.readFileSync(path.join(__dirname,'..','prompt_popout.user.js'),'utf8');const OUT=path.join(__dirname,'..','docs','img');
const html=`<!doctype html><style>body{margin:0;background:rgb(250,249,245);font:16px sans-serif}.w{padding:330px 40px 40px 60px}.card{position:relative;border-radius:15.75px;background:#fff;padding:14px 16px;box-sizing:border-box;box-shadow:0 0 0 1px rgba(31,30,29,.15),0 4px 20px rgba(0,0,0,.035)}#prompt-textarea{min-height:56px;outline:none;color:#999}</style>
<div class=w><div class=card><div id=prompt-textarea class=ProseMirror contenteditable=true>How can I help you today?</div></div></div>`;
const data={'pp.tags':[{id:'1',name:'Writing',bg:'#d97757',fg:'#ffffff'},{id:'2',name:'Code',bg:'#5b7cfa',fg:'#ffffff'}],
'pp.prompts':[{id:'a',title:'Proofread',text:'Proofread:',fill:false,autoSend:true,tagIds:['1']},{id:'b',title:'Translate to [language]',text:'Translate into [language::English]',fill:true,autoSend:true,tagIds:['1']},
{id:'c',title:'Explain this code',text:'Explain',fill:false,autoSend:false,tagIds:['2']},{id:'d',title:'Write unit tests',text:'t',fill:false,autoSend:true,tagIds:['2']}]};
(async()=>{const b=await PW.chromium.launch();
for(const loc of ['zh-TW','en-US']){const p=await (await b.newContext({viewport:{width:520,height:470},deviceScaleFactor:2,locale:loc})).newPage();
await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));await p.goto('https://chatgpt.com/');
await p.evaluate(d=>{window.__store=d;window.GM_getValue=(k,v)=>k in __store?__store[k]:v;window.GM_setValue=(k,v)=>__store[k]=v;window.GM_registerMenuCommand=()=>{};window.GM_info={script:{version:'1'}};},data);
await p.evaluate(s=>(0,eval)(s),SRC);await p.waitForTimeout(1200);
const r=await p.evaluate(()=>document.querySelector('.card').getBoundingClientRect().toJSON());
await p.mouse.move(r.left+16,r.top+40);await p.waitForTimeout(600);
await p.screenshot({path:`${OUT}/menu.${loc==='zh-TW'?'zh-TW':'en'}.png`,clip:{x:0,y:90,width:520,height:380}});}
await b.close();})();
