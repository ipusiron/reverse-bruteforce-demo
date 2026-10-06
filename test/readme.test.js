import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, core } from './load.js';

const C = core();
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const DOCS = {
  ja: {
    file: 'README.md', switcher: '[English](README.en.md) · 日本語', day: '**Day060 - 生成AIで作るセキュリティツール100**',
    h1: '# Reverse Brute-force Demo - リバースブルートフォース攻撃デモツール', shots: /^assets\/screenshot\d*\.png$/,
    h2: ['🌐 デモページ', '📸 スクリーンショット', '✨ 機能', '📖 使い方', '🔐 3つの攻撃と、防御の効き方', '🛡 防御の要点', '🎯 ユースケース',
      '🔬 技術的な説明', '🔒 セキュリティ', '⚠️ 注意と限界', '🧪 テスト', '🔗 参考文献', '📁 ディレクトリー構造', '💻 動作環境', '📄 ライセンス',
      '🛠 このツールについて'],
    facts: ['約2088億通り（26の8乗）', '約4200回', '送信は600回', '20人にすると60回', '50件', 'SecLists', 'NIST SP 800-63B（Rev.4）', 'T1110.003',
      'クレデンシャルスタッフィング', '10〜10000'],
    project: 'https://akademeia.info/?page_id=42163',
    forbidden: new RegExp(['ブラウザ(?!ー)', 'フォルダ(?!ー)', 'ディレクトリ(?!ー)', 'リポジトリ(?!ー)', 'サーバ(?!ー)', 'ユーザ(?!ー)', 'パスワ(?!ー)',
      '(?<![自0-9０-９])分か(?!れ)', '全て', 'もっとも効果', '複雑性要求を必ず', '定期的に変更する', '攻撃ぽさを演出'].join('|'))
  },
  en: {
    file: 'README.en.md', switcher: 'English · [日本語](README.md)', day: '**Day060 - 100 Security Tools with Generative AI**',
    h1: '# Reverse Brute-force Demo - Password Spraying Attack Visualization Tool', shots: /^assets\/en\/screenshot\d*\.png$/,
    h2: ['🌐 Demo', '📸 Screenshots', '✨ Features', '📖 How to use', '🔐 The three attacks and how defenses fare', '🛡 Key defenses', '🎯 Use cases',
      '🔬 Technical notes', '🔒 Security', '⚠️ Notes and limitations', '🧪 Tests', '🔗 References', '📁 Directory structure', '💻 Requirements',
      '📄 License', '🛠 About this tool'],
    facts: ['208.8 billion combinations', 'about 4,200 tries', 'send 600 attempts', '20 target users send 60', '50 common passwords', 'SecLists',
      'NIST SP 800-63B (Rev.4)', 'T1110.003', 'credential stuffing', '10-10000'],
    project: 'https://akademeia.info/?page_id=42163',
    forbidden: /ideal for embedded|require complexity|change passwords periodically|script\.js/i
  }
};
for (const d of Object.values(DOCS)) d.text = read(d.file);

const noCode = (md) => md.replace(/```[\s\S]*?```/g, '');
const headings = (md) => noCode(md).split('\n').filter((l) => /^#{1,4} /.test(l));
const h2 = (md) => headings(md).filter((l) => l.startsWith('## ')).map((l) => l.slice(3));

function section(text, heading) {
  const i = text.indexOf(`\n## ${heading}\n`);
  assert.ok(i >= 0, heading);
  const rest = text.slice(i + 1);
  const end = rest.indexOf('\n## ', 3);
  return end < 0 ? rest : rest.slice(0, end);
}

test('YAML メタデータの構造（キーの順、ブロック形式のリスト、固定の値）。YAML は README.md だけに置く', () => {
  const m = DOCS.ja.text.match(/^<!--\n---\n([\s\S]*?)\n---\n-->\n/);
  assert.ok(m, 'YAML block');
  const keys = [...m[1].matchAll(/^([a-z_]+):/gm)].map((x) => x[1]);
  assert.deepEqual(keys, ['id', 'slug', 'title', 'subtitle_ja', 'subtitle_en', 'description_ja', 'description_en', 'category_ja', 'category_en',
    'difficulty', 'tags', 'repo_url', 'demo_url', 'hub']);
  for (const k of ['category_ja', 'category_en', 'tags']) assert.match(m[1], new RegExp(`^${k}:\\n  - `, 'm'), k);
  assert.match(m[1], /^id: day060$/m);
  assert.match(m[1], /^slug: reverse-bruteforce-demo$/m);
  assert.match(m[1], /^repo_url: "https:\/\/github.com\/ipusiron\/reverse-bruteforce-demo"$/m);
  assert.match(m[1], /^hub: true$/m);
  assert.doesNotMatch(DOCS.en.text, /^<!--\n---/);
});

test('冒頭の形（言語の切り替え・H1・バッジ5種・Dayの行）と、H2の並び。日英で見出しの数と階層がそろう', () => {
  for (const d of Object.values(DOCS)) {
    assert.ok(d.text.includes(`\n${d.switcher}\n`) || d.text.startsWith(`${d.switcher}\n`), d.file);
    assert.ok(d.text.includes(`\n${d.h1}\n`), d.file);
    assert.ok(d.text.includes(`\n${d.day}\n`), d.file);
    for (const b of ['stars', 'forks', 'last-commit', 'license', 'GitHub%20Pages']) assert.ok(d.text.includes(b), `${d.file} ${b}`);
    assert.deepEqual(h2(d.text), d.h2, d.file);
    assert.ok(d.text.includes(`🔗 [${d.project}](${d.project})`), d.file);
  }
  const level = (md) => headings(md).map((l) => l.match(/^#+/)[0].length);
  assert.deepEqual(level(DOCS.en.text), level(DOCS.ja.text));
  assert.ok(headings(DOCS.ja.text).length >= 25, String(headings(DOCS.ja.text).length));
});

test('画像: README から参照する画像はすべて実在し300KB以下。assets の PNG は README から参照されているものだけ', () => {
  for (const d of Object.values(DOCS)) {
    const refs = [...d.text.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)].map((m) => m[1]);
    assert.equal(refs.length, 5, d.file);
    for (const r of refs) {
      assert.match(r, d.shots, r);
      assert.ok(fs.statSync(path.join(ROOT, r)).size <= 300 * 1024, r);
    }
    const dir = d.file === 'README.md' ? 'assets' : 'assets/en';
    const pngs = fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.png')).map((f) => `${dir}/${f}`).sort();
    assert.deepEqual(pngs, [...refs].sort(), dir);
  }
});

test('README に書いた数は、計算部と合う（辞書50件・26の8乗・4200・RBFの送信回数・設定の範囲）', () => {
  for (const d of Object.values(DOCS)) for (const f of d.facts) assert.ok(d.text.includes(f), `${d.file}: ${f}`);
  assert.equal(C.COMMON_PASSWORDS.length, 50);
  assert.equal(26 ** 8, 208827064576);
  assert.equal(C.BF_TARGET_INDEX, 4200);
  assert.equal(C.reverseBruteTotal(200, C.COMMON_PASSWORDS, 3, 200), 600);
  assert.equal(C.reverseBruteTotal(200, C.COMMON_PASSWORDS, 3, 20), 60);
  assert.deepEqual(C.LIMITS.userCount, [10, 10000]);
  // 辞書の先頭5件が、ログの「使う辞書」の並びと同じ（出典の整合）
  for (const p of C.COMMON_PASSWORDS.slice(0, 3)) assert.ok(['123456', 'password', '123456789'].includes(p));
});

function files(dir = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (['.git', '.claude', 'node_modules'].includes(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(`${rel}/`, ...files(rel));
    else out.push(rel);
  }
  return out;
}

test('ディレクトリー構造: すべてのファイルとディレクトリーが載り、全行に説明があり、# の桁がそろう', () => {
  const all = files();
  for (const d of Object.values(DOCS)) {
    const tree = d.text.match(/```text\nreverse-bruteforce-demo\/\n([\s\S]*?)```/)[1].split('\n').filter(Boolean);
    const cols = new Set();
    const listed = [];
    const stack = [];
    for (const line of tree) {
      const m = line.match(/^((?:│ {3}| {4})*)[├└]── (\S+)\s+# \S/);
      assert.ok(m, `${d.file}: ${line}`);
      cols.add([...line].indexOf('#'));
      const depth = [...m[1]].length / 4;
      stack.length = depth;
      stack.push(m[2]);
      listed.push(stack.join(''));
    }
    assert.equal(cols.size, 1, d.file);
    assert.deepEqual([...listed].sort(), [...all].sort(), d.file);
  }
});

test('表記: 禁止語がない。強調は1節に2カ所まで、箇条書きの先頭を太字にしない。日本語と英数字のあいだに半角空白を入れない', () => {
  for (const d of Object.values(DOCS)) {
    const body = noCode(d.text);
    assert.doesNotMatch(body, d.forbidden, d.file);
    for (const h of d.h2) {
      const n = (section(body, h).match(/\*\*/g) || []).length / 2;
      assert.ok(n <= 2, `${d.file} ${h}: ${n}`);
    }
    assert.doesNotMatch(body, /^\s*- \*\*/m, d.file);
  }
  const J = '[\\u3040-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef]';
  const bad = new RegExp(`${J} [A-Za-z0-9(\`]|[A-Za-z0-9)\`] ${J}`);
  for (const line of noCode(DOCS.ja.text).split('\n')) {
    if (line.startsWith('MIT License')) continue;
    assert.doesNotMatch(line, bad, line);
  }
});
