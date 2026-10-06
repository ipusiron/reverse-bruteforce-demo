import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './load.js';

const css = read('style.css');
function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, selector);
  return css.slice(start, css.indexOf('}', start));
}
const tokens = (selector) => Object.fromEntries([...block(selector).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const TEXT = [
  ['text', 'bg'], ['text', 'panel'], ['text', 'card'], ['text', 'hover-bg'], ['muted', 'bg'], ['muted', 'panel'], ['muted', 'card'],
  ['accent-text', 'bg'], ['accent-text', 'panel'], ['accent-text', 'card'], ['on-accent', 'accent'], ['code-text', 'code-bg'],
  ['ok-text', 'ok-bg'], ['ok', 'panel'], ['ok', 'card'], ['warn-text', 'warn-bg'], ['info-text', 'info-bg'], ['bad-text', 'bad-bg'],
  ['header-text', 'header1'], ['header-text', 'header2']
];
const GRAPHICS = [
  ['field-border', 'panel'], ['field-border', 'card'], ['field-border', 'bg'], ['accent', 'panel'], ['accent', 'card'], ['accent', 'bg']
];

test('ライトとダークの配色は、文字と背景が4.5:1以上、枠と選択の色が3:1以上', () => {
  for (const [name, set] of [['light', tokens(':root')], ['dark', tokens(':root[data-theme="dark"]')]]) {
    for (const [fg, bg] of TEXT) assert.ok(ratio(set[fg], set[bg]) >= 4.5, `${name} ${fg} on ${bg}: ${ratio(set[fg], set[bg]).toFixed(2)}`);
    for (const [fg, bg] of GRAPHICS) assert.ok(ratio(set[fg], set[bg]) >= 3, `${name} ${fg} on ${bg}: ${ratio(set[fg], set[bg]).toFixed(2)}`);
  }
});

test('OS の設定によるダークと、手動のダークは同じ値。ライトとダークは同じトークンを持つ', () => {
  const read2 = (sel) => Object.fromEntries([...block(sel).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const os = read2(':root:not([data-theme="light"])');
  assert.equal(Object.keys(os).length, 26);
  assert.deepEqual(os, read2(':root[data-theme="dark"]'));
  assert.deepEqual(Object.keys(read2(':root')).sort(), Object.keys(os).sort());
});

test('style.css が使う色のトークンは、すべて定義されている。白の直書きをしない', () => {
  const defined = new Set(Object.keys(tokens(':root')).concat(['shadow']));
  for (const k of new Set([...css.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]))) assert.ok(defined.has(k), k);
  assert.doesNotMatch(css, /color:\s*(white|#fff\b|#ffffff)/);
});

test('入力欄・ボタン・トグルは16px と高さ44px 以上（iPhone の自動拡大とタップ領域）', () => {
  assert.match(block('input[type="number"]'), /font-size: 16px/);
  for (const sel of ['button', '.header-btn', '.toggle-label', '.clear-log-btn', '.tab', '.close-button']) {
    assert.match(block(sel), /min-(?:height|width): 44px/, sel);
  }
});
