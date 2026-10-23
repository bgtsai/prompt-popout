// 靜態檢查：語法（acorn）、同作用域重複宣告、未解析識別字（作用域鏈逐層查找）
// 用法：node check.js <檔案.js>
'use strict';
const fs = require('fs');
const acorn = require('acorn');
const walk = require('acorn-walk');

const src = fs.readFileSync(process.argv[2], 'utf8');
let ast;
try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true }); console.log('語法：OK'); }
catch (e) { console.log('語法錯誤 第', e.loc && e.loc.line, '行：', e.message); process.exit(1); }

// 瀏覽器、GM 與 JS 內建的全域名稱
const GLOBALS = new Set(Object.getOwnPropertyNames(globalThis).concat([
  'window', 'document', 'navigator', 'location', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'MutationObserver', 'ResizeObserver', 'Event', 'KeyboardEvent',
  'MouseEvent', 'ClipboardEvent', 'DataTransfer', 'Blob', 'URL', 'FileReader', 'HTMLElement', 'Element', 'Node', 'Range', 'CSS',
  'crypto', 'trustedTypes', 'alert', 'confirm', 'prompt', 'performance', 'InputEvent', 'DOMParser', 'HTMLTextAreaElement', 'HTMLInputElement',
  'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_registerMenuCommand', 'GM_info', 'GM', 'unsafeWindow', 'matchMedia', 'self', 'globalThis',
  'arguments', 'undefined', 'Image', 'OffscreenCanvas', 'TextEncoder', 'TextDecoder', 'File', 'innerWidth', 'innerHeight', 'getSelection',
]));

class Scope { constructor(parent, fn) { this.parent = parent; this.fn = fn; this.names = new Map(); } }
const dups = [], unresolved = [];
function declare(scope, name, kind, node) {
  const prev = scope.names.get(name);
  if (prev && !(prev === 'var' && kind === 'var') && !(prev === 'param' && kind === 'var')) dups.push(`${name}（第 ${node.loc.start.line} 行）`);
  scope.names.set(name, kind);
}
function patternNames(p, out = []) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p); break;
    case 'ObjectPattern': p.properties.forEach((q) => patternNames(q.type === 'RestElement' ? q.argument : q.value, out)); break;
    case 'ArrayPattern': p.elements.forEach((q) => patternNames(q, out)); break;
    case 'RestElement': patternNames(p.argument, out); break;
    case 'AssignmentPattern': patternNames(p.left, out); break;
  }
  return out;
}
const fnScope = (s) => { while (!s.fn) s = s.parent; return s; };

// 第一輪：建立作用域並宣告（含 hoisting），把每個節點對應的作用域記下來
const scopeOf = new Map();
function build(node, scope) {
  if (!node || typeof node.type !== 'string') return;
  let inner = scope;
  const isFn = /Function/.test(node.type);
  if (isFn) {
    if (node.type === 'FunctionDeclaration' && node.id) declare(fnScope(scope) === scope ? scope : scope, node.id.name, 'fn', node);
    inner = new Scope(scope, true);
    if (node.type === 'FunctionExpression' && node.id) inner.names.set(node.id.name, 'fnexpr');
    node.params.forEach((p) => patternNames(p).forEach((id) => declare(inner, id.name, 'param', id)));
  } else if (node.type === 'BlockStatement' || node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement' || node.type === 'SwitchStatement') {
    inner = new Scope(scope, false);
  } else if (node.type === 'CatchClause') {
    inner = new Scope(scope, false);
    patternNames(node.param).forEach((id) => declare(inner, id.name, 'param', id));
  } else if (node.type === 'ClassDeclaration' && node.id) declare(scope, node.id.name, 'class', node);
  if (node.type === 'VariableDeclaration') {
    const target = node.kind === 'var' ? fnScope(scope) : scope;
    node.declarations.forEach((d) => patternNames(d.id).forEach((id) => declare(target, id.name, node.kind, id)));
  }
  scopeOf.set(node, inner);
  for (const k of Object.keys(node)) {
    if (k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && build(c, inner));
    else if (v && typeof v.type === 'string') build(v, inner);
  }
}
const top = new Scope(null, true);
build(ast, top);

// 第二輪：找出所有「讀取用」的識別字，沿作用域鏈查找
walk.fullAncestor(ast, (node, _st, ancestors) => {
  if (node.type !== 'Identifier') return;
  const parent = ancestors[ancestors.length - 2];
  if (!parent) return;
  if ((parent.type === 'MemberExpression' && parent.property === node && !parent.computed)) return;
  if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && parent.key === node && !parent.computed && !(parent.shorthand && parent.value === node)) return;
  if (/Function|Class/.test(parent.type) && parent.id === node) return;
  if (parent.type === 'VariableDeclarator' && patternNames(parent.id).includes(node)) return;
  if ((parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement')) return;
  if (/Function/.test(parent.type) && parent.params.some((p) => patternNames(p).includes(node))) return;
  if (parent.type === 'CatchClause') return;
  if (parent.type === 'MetaProperty') return;
  // 找最內層有對應作用域的祖先
  let s = null;
  for (let i = ancestors.length - 2; i >= 0 && !s; i--) s = scopeOf.get(ancestors[i]);
  let found = false;
  for (let t = s; t; t = t.parent) if (t.names.has(node.name)) { found = true; break; }
  if (!found && !GLOBALS.has(node.name)) unresolved.push(`${node.name}（第 ${node.loc.start.line} 行）`);
});

console.log('同作用域重複宣告：', dups.length ? dups.join('、') : '無');
console.log('未解析識別字（作用域鏈上看不到）：', unresolved.length ? [...new Set(unresolved)].join('、') : '無');
process.exit(dups.length || unresolved.length ? 1 : 0);
