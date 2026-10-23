// README 用截圖：ChatGPT 模擬頁（Claude 的 Enter 圖示要靠 Claude 自己的圖示字型，模擬頁沒有）
// 每種語言四張：開啟的清單 menu.*.png、編輯提示詞對話框 editor.*.png、填空視窗 fill.*.png、填好後的輸入框 filled.*.png
// （對話框只截對話框本身，圓角外透明）
const PW=require('/home/claude/.npm-global/lib/node_modules/playwright');const fs=require('fs');
const path=require('path');const SRC=fs.readFileSync(path.join(__dirname,'..','prompt_popout.user.js'),'utf8');const OUT=path.join(__dirname,'..','docs','img');
const html=`<!doctype html><style>body{margin:0;background:rgb(250,249,245);font:16px sans-serif}.w{padding:330px 40px 40px 60px}.card{position:relative;border-radius:15.75px;background:#fff;padding:14px 16px;box-sizing:border-box;box-shadow:0 0 0 1px rgba(31,30,29,.15),0 4px 20px rgba(0,0,0,.035)}#prompt-textarea{min-height:56px;outline:none;color:#999}</style>
<div class=w><div class=card><div id=prompt-textarea class=ProseMirror contenteditable=true>How can I help you today?</div></div></div>`;
// 示範資料跟介面同語言：中文截圖用中文提示詞與標籤，英文截圖用英文的
const DATA={
'zh-TW':{'pp.tags':[{id:'1',name:'寫作',bg:'#d97757',fg:'#ffffff'},{id:'2',name:'程式',bg:'#5b7cfa',fg:'#ffffff'}],
'pp.prompts':[{id:'a',title:'校對錯字',text:'幫我找出下面這段的錯字：',fill:false,autoSend:true,tagIds:['1']},{id:'b',title:'翻成[語言]',text:'把下面這段翻成[語言::英文]，語氣要[語氣](例如：正式、輕鬆)。',fill:true,autoSend:true,tagIds:['1']},
{id:'c',title:'解釋這段程式碼',text:'逐行解釋下面的程式碼：',fill:false,autoSend:false,tagIds:['2']},{id:'d',title:'寫單元測試',text:'幫下面的函式寫單元測試：',fill:false,autoSend:true,tagIds:['2']}]},
'en-US':{'pp.tags':[{id:'1',name:'Writing',bg:'#d97757',fg:'#ffffff'},{id:'2',name:'Code',bg:'#5b7cfa',fg:'#ffffff'}],
'pp.prompts':[{id:'a',title:'Proofread',text:'Find the typos in the text below:',fill:false,autoSend:true,tagIds:['1']},{id:'b',title:'Translate to [language]',text:'Translate the text below into [language::English], in a [tone](e.g. formal, casual) tone.',fill:true,autoSend:true,tagIds:['1']},
{id:'c',title:'Explain this code',text:'Explain the code below line by line:',fill:false,autoSend:false,tagIds:['2']},{id:'d',title:'Write unit tests',text:'Write unit tests for the function below:',fill:false,autoSend:true,tagIds:['2']}]},
};
(async()=>{const b=await PW.chromium.launch();
for(const loc of ['zh-TW','en-US']){const p=await (await b.newContext({viewport:{width:520,height:470},deviceScaleFactor:2,locale:loc})).newPage();
await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));await p.goto('https://chatgpt.com/');
await p.evaluate(d=>{window.__store=d;window.GM_getValue=(k,v)=>k in __store?__store[k]:v;window.GM_setValue=(k,v)=>__store[k]=v;window.__menu=[];window.GM_registerMenuCommand=(n,f)=>__menu.push(f);window.GM_info={script:{version:'1'}};},DATA[loc]);
await p.evaluate(s=>(0,eval)(s),SRC);await p.waitForTimeout(1200);
const r=await p.evaluate(()=>document.querySelector('.card').getBoundingClientRect().toJSON());
await p.mouse.move(r.left+16,r.top+40);await p.waitForTimeout(600);
const sfx=loc==='zh-TW'?'zh-TW':'en';
await p.screenshot({path:`${OUT}/menu.${sfx}.png`,clip:{x:0,y:90,width:520,height:380}});
// 編輯頁：開管理視窗 → 編輯「Translate to [language]」；只留最上層對話框，背景全透明
await p.mouse.move(5,5);await p.setViewportSize({width:760,height:820});
await p.evaluate(()=>__menu[0]());await p.waitForTimeout(150);
await p.evaluate(()=>[...document.querySelectorAll('#pp-root .pp-mrow')][1].querySelectorAll('button')[2].click());await p.waitForTimeout(150);
await p.evaluate(()=>{const o=[...document.querySelectorAll('#pp-root .pp-overlay')];o.slice(0,-1).forEach(x=>x.style.display='none');o[o.length-1].style.background='transparent';document.documentElement.style.background=document.body.style.background='transparent';document.querySelector('.w').style.display='none';document.activeElement&&document.activeElement.blur();});
await p.locator('#pp-root .pp-dialog').last().screenshot({path:`${OUT}/editor.${sfx}.png`,omitBackground:true});
// 填空：換一頁乾淨的，存一筆中英各自的範例，點它 → 填空視窗 → 填入 → 輸入框結果
const zh=sfx==='zh-TW';
const fillText=zh?'把下面這段翻成[語言::英文]，語氣要[語氣](例如：正式、輕鬆)。':'Translate the text below into [language::English], in a [tone](e.g. formal, casual) tone.';
const fillTitle=zh?'翻譯':'Translate';
const q=await (await b.newContext({viewport:{width:760,height:700},deviceScaleFactor:2,locale:loc})).newPage();
await q.route('**/*',r=>r.fulfill({contentType:'text/html',body:html.replace('>How can I help you today?<','><').replace('color:#999','color:#1f1f1f').replace('padding:330px 40px 40px 60px','padding:40px 40px 40px 60px')}));await q.goto('https://chatgpt.com/');
await q.evaluate(([t,x])=>{window.__store={'pp.tags':[],'pp.prompts':[{id:'f',title:t,text:x,fill:true,autoSend:false,tagIds:[]}]};window.GM_getValue=(k,v)=>k in __store?__store[k]:v;window.GM_setValue=(k,v)=>__store[k]=v;window.GM_registerMenuCommand=()=>{};window.GM_info={script:{version:'1'}};},[fillTitle,fillText]);
await q.evaluate(s=>(0,eval)(s),SRC);await q.waitForTimeout(1200);
const cr=await q.evaluate(()=>document.querySelector('.card').getBoundingClientRect().toJSON());
await q.mouse.move(cr.left+16,cr.top+30);await q.waitForTimeout(600);
await q.evaluate(()=>document.querySelector('#pp-root .pp-row').click());await q.waitForTimeout(200);
await q.evaluate(v=>{const ta=[...document.querySelectorAll('#pp-root textarea')];ta[1].value=v;},zh?'輕鬆':'casual');
await q.evaluate(()=>{const o=document.querySelector('#pp-root .pp-overlay');o.style.background='transparent';document.documentElement.style.background=document.body.style.background='transparent';document.querySelector('.w').style.visibility='hidden';document.activeElement&&document.activeElement.blur();});
await q.locator('#pp-root .pp-dialog').screenshot({path:`${OUT}/fill.${sfx}.png`,omitBackground:true});
await q.evaluate(()=>{document.documentElement.style.background=document.body.style.background='';document.querySelector('.w').style.visibility='';const b=[...document.querySelectorAll('#pp-root .pp-dialog button')].pop();b.click();});
await q.waitForTimeout(300);await q.mouse.move(700,650);await q.waitForTimeout(300);
const c2=await q.evaluate(()=>document.querySelector('.card').getBoundingClientRect().toJSON());
await q.screenshot({path:`${OUT}/filled.${sfx}.png`,clip:{x:c2.left-12,y:c2.top-12,width:c2.width+24,height:c2.height+24}});}
await b.close();})();
