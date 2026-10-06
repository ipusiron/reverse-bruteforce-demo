import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { read, load, core } from './load.js';

const html = read('index.html');
const C = core();
const { MESSAGES, HELP, t } = load('js/messages.js').RbfMessages;
const { parseVars } = load('js/i18n.js').RbfI18n;
const SCRIPTS = ['js/theme-init.js', 'js/rbf-core.js', 'js/messages.js', 'js/i18n.js', 'js/theme.js', 'js/app.js'];
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const TABS = ['bf', 'dict', 'rbf'];

test('CSP はスクリプト・スタイルを同じ場所のファイルだけに限り、unsafe-inline と外部の通信を許さない', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.equal(csp, "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    + "connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
  assert.doesNotMatch(html, /X-Content-Type-Options|X-Frame-Options|frame-ancestors|unsafe-inline/i);
  assert.match(html, /<meta name="referrer" content="no-referrer" \/>/);
  assert.match(html, /<link rel="icon" href="data:," \/>/);
  assert.match(html, /<noscript>/);
});

test('外部のスクリプトを読まない。style 属性・インラインのスクリプト・イベントハンドラーがない。旧 script.js は残さない', () => {
  assert.doesNotMatch(html, /\sstyle=/);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, SCRIPTS);
  assert.equal((html.match(/<script/g) || []).length, scripts.length);
  assert.doesNotMatch(html, /cdn\.|jsdelivr|unpkg|http:\/\/|https:\/\/[^"]*\.js/i);
  for (const a of html.match(/<a [^>]*>/g) || []) assert.match(a, /target="_blank" rel="noopener noreferrer"/, a);
  const js = fs.readdirSync(new URL('../js', import.meta.url)).map((f) => `js/${f}`).sort();
  assert.deepEqual(js, [...SCRIPTS].sort());
  assert.equal(fs.existsSync(new URL('../script.js', import.meta.url)), false);
});

test('タブは WAI-ARIA の形（id・aria-controls・aria-selected・tabindex、tabpanel の aria-labelledby と hidden）', () => {
  const list = html.match(/<div class="tabs" role="tablist"[\s\S]*?<\/div>/)[0];
  assert.equal((list.match(/<button/g) || []).length, TABS.length);
  const tabs = [...list.matchAll(/role="tab" id="tab-([a-z]+)" aria-controls="panel-([a-z]+)" aria-selected="(true|false)" tabindex="(0|-1)"/g)];
  assert.deepEqual(tabs.map((m) => [m[1], m[2], m[3], m[4]]), TABS.map((k, i) => [k, k, i ? 'false' : 'true', i ? '-1' : '0']));
  for (const k of TABS) {
    const tag = html.match(new RegExp(`<div [^>]*id="panel-${k}"[^>]*>`))[0];
    assert.match(tag, new RegExp(`role="tabpanel" aria-labelledby="tab-${k}"`), k);
    assert.equal(/\shidden/.test(tag), k !== 'bf', k);
  }
});

test('ヘルプのモーダルは role="dialog"・aria-modal・aria-labelledby を持ち、閉じるボタンに名前がある', () => {
  const modal = html.match(/<div id="helpModal"[^>]*>/)[0];
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby="helpTitle"/);
  assert.match(modal, /\shidden/);
  assert.ok(ids.has('helpTitle'));
  assert.match(html, /id="closeModal"[^>]*data-i18n-attr="aria-label:help.close"/);
});

test('ボタンは type="button"。入力欄には label、ラジオは fieldset/legend の中。知らせの欄に aria-live', () => {
  for (const b of html.match(/<button[^>]*>/g)) assert.match(b, /type="button"/, b);
  for (const m of html.matchAll(/<input [^>]*id="([^"]+)"/g)) {
    if (/type="radio"/.test(m[0])) continue;
    assert.match(html, new RegExp(`<label [^>]*for="${m[1]}"`), m[1]);
  }
  // ラジオは toggle-group（fieldset.toggle-field の中）
  const fs = html.match(/<fieldset class="field toggle-field">[\s\S]*?<\/fieldset>/)[0];
  assert.match(fs, /<legend/);
  assert.equal((fs.match(/type="radio"/g) || []).length, 2);
  for (const id of ['seedStatus']) assert.match(html, new RegExp(`id="${id}"[^>]*aria-live="polite"`), id);
  assert.match(html, /id="seedStatus" class="status" role="status"/);
  // 入力欄には inputmode="numeric"（数字キーボード）
  assert.equal((html.match(/<input [^>]*type="number"/g) || []).length, (html.match(/inputmode="numeric"/g) || []).length);
});

// 文言の太字（**）と改行（\n）は HTML の strong と br に当たる。HTML 側のタグを外して比べる
const plain = (s) => s.replace(/\n\s*/g, '').replace(/<br \/>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim();
const fromDict = (s) => s.replace(/\*\*/g, '');

test('data-i18n のキーは辞書にあり、HTML に書いた日本語は辞書の日本語と同じ（属性も）', () => {
  let n = 0;
  for (const m of html.matchAll(/<([a-z0-9]+)([^>]*?)data-i18n="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const key = m[3];
    assert.ok(MESSAGES.ja[key] !== undefined, key);
    assert.equal(plain(m[5]), fromDict(t(key, parseVars(((m[2] + m[4]).match(/data-i18n-vars="([^"]*)"/) || [])[1]), 'ja')), key);
    n++;
  }
  assert.ok(n >= 40, String(n));
  for (const m of html.matchAll(/<[^>]*data-i18n-attr="([^"]+)"[^>]*>/g)) {
    for (const pair of m[1].split(';')) {
      const [attr, key] = pair.split(':');
      assert.ok(MESSAGES.ja[key] !== undefined, pair);
      const v = m[0].match(new RegExp(`\\s${attr}="([^"]*)"`));
      assert.ok(v && plain(v[1]) === MESSAGES.ja[key], pair);
    }
  }
});

test('画面のスクリプトが参照する id は、すべて HTML にある', () => {
  const src = read('js/app.js');
  const used = new Set([...src.matchAll(/(?:\$|setText)\('([a-zA-Z0-9-]+)'\)?/g)].map((m) => m[1]));
  for (const n of TABS) used.add(`tab-${n}`).add(`panel-${n}`);
  assert.ok(used.size >= 30, String(used.size));
  for (const id of used) assert.ok(ids.has(id), id);
});

test('ヘルプの中身の組み立てが使うキーは、すべて辞書にある', () => {
  for (const item of HELP) {
    for (const k of item.keys || [item.key]) {
      for (const lang of ['ja', 'en']) assert.ok(MESSAGES[lang][k] !== undefined, `${lang} ${k}`);
    }
  }
});

test('JS は innerHTML・eval・fetch を使わず、style を書き換えない（width の進捗バーだけ例外）。乱数は使わない', () => {
  for (const f of SCRIPTS) {
    const src = read(f);
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|DOMParser|\beval\(|new Function|document\.write/, f);
    assert.doesNotMatch(src, /console\.(log|debug|info|error|warn)/, f);
    assert.doesNotMatch(src, /sessionStorage|fetch\(|XMLHttpRequest|WebSocket|sendBeacon/, f);
  }
  // 画面の乱数（強いパスワード）は計算部の種つき乱数で、Math.random は計算部にだけ（画面の app.js にはない）
  assert.doesNotMatch(read('js/app.js'), /Math\.random/);
  // style の書き換えは進捗バーの width だけ
  const styleUses = [...read('js/app.js').matchAll(/\.style\.([a-zA-Z]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(styleUses)], ['width']);
});

test('localStorage は try で囲んで読み書きする（使えない環境でも画面が止まらない）', () => {
  let total = 0;
  for (const f of SCRIPTS) {
    const src = read(f);
    const uses = (src.match(/localStorage\./g) || []).length;
    const guarded = [...src.matchAll(/try \{\s*(?:const [a-z]+ = |return )?localStorage\./g)].length;
    assert.equal(guarded, uses, f);
    total += uses;
  }
  assert.equal(total, 4);
});
