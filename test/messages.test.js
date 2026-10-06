import test from 'node:test';
import assert from 'node:assert/strict';
import { read, load } from './load.js';

const { MESSAGES, t } = load('js/messages.js').RbfMessages;
const JAPANESE = new RegExp('[' + [[0x3000, 0x303f], [0x3040, 0x30ff], [0x3400, 0x9fff], [0xff00, 0xffef]]
  .map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']');
const placeholders = (s) => [...s.matchAll(/\{([a-zA-Z0-9]+)\}/g)].map((m) => m[1]).sort();

test('日本語と英語の辞書は同じキーを持ち、置き場所 {name} と太字の数もそろう', () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.ja).sort());
  assert.ok(Object.keys(MESSAGES.ja).length >= 110, String(Object.keys(MESSAGES.ja).length));
  for (const k of Object.keys(MESSAGES.ja)) {
    assert.deepEqual([...new Set(placeholders(MESSAGES.en[k]))], [...new Set(placeholders(MESSAGES.ja[k]))], k);
    for (const lang of ['ja', 'en']) assert.equal((MESSAGES[lang][k].match(/\*\*/g) || []).length % 2, 0, `${lang} ${k}`);
  }
});

test('英語の辞書に日本語の文字がない（言語の切り替えボタンを除く）', () => {
  for (const [k, v] of Object.entries(MESSAGES.en)) {
    if (k === 'ui.langButton' || k === 'ui.langLabel') continue;
    assert.doesNotMatch(v, JAPANESE, k);
  }
});

test('日本語の文言は、日本語と英数字のあいだに半角空白を入れない。長音をそろえ、「わかる」はひらがな', () => {
  const bad = new RegExp(`(${JAPANESE.source} [A-Za-z0-9(])|([A-Za-z0-9)] ${JAPANESE.source})`);
  for (const [k, v] of Object.entries(MESSAGES.ja)) {
    assert.doesNotMatch(v, bad, k);
    assert.doesNotMatch(v, /ブラウザ(?!ー)|フォルダ(?!ー)|リポジトリ(?!ー)|ディレクトリ(?!ー)|サーバ(?!ー)|エディタ(?!ー)|ユーザ(?!ー)|パスワ(?!ー)/, k);
    assert.doesNotMatch(v, /(?<![自0-9０-９])分か(?!れ)/, k);
    assert.doesNotMatch(v, /全て|もっとも効果|復号化/, k);
  }
});

test('画面のスクリプトが使う文言のキーは、すべて辞書にある', () => {
  const src = read('js/app.js');
  const keys = new Set([...src.matchAll(/\bt\('([a-zA-Z0-9.]+)'/g)].map((m) => m[1]));
  for (const m of src.matchAll(/'((?:cfg|atk|bf|dict|rbf)\.[a-zA-Z0-9.]+)'/g)) keys.add(m[1]);
  assert.ok(keys.size >= 40, String(keys.size));
  for (const k of keys) for (const lang of ['ja', 'en']) assert.ok(MESSAGES[lang][k] !== undefined, `${lang} ${k}`);
});

test('一次資料に合う言い方（NIST SP 800-63B-4・MITRE ATT&CK・26の8乗）で、古い言い方を使わない', () => {
  const ja = MESSAGES.ja;
  const en = MESSAGES.en;
  // 防御は漏えい・頻出パスワードのブロックリスト（複雑性要求ではない）
  assert.match(ja['help.defense.3'], /漏えい.*頻出.*ブロックリスト/);
  assert.match(ja['help.defense.3'], /NIST SP 800-63B（Rev.4）/);
  assert.match(en['help.defense.3'], /NIST SP 800-63B \(Rev\.4\)/);
  assert.match(ja['help.defense.1'], /多要素認証（MFA/);
  // パスワードスプレーの用語（MITRE ATT&CK T1110.003）とクレデンシャルスタッフィングの区別
  assert.match(ja['help.spray.3'], /T1110.003/);
  assert.match(ja['help.related.1'], /クレデンシャルスタッフィング（T1110.004）/);
  // 26の8乗・オンラインはレート制限で止まる
  assert.match(ja['help.bf.3'], /2088億.*26の8乗/);
  assert.match(ja['help.bf.3'], /オフライン.*レート制限/);
  // 複雑性要求を防御策として前面に出していない
  for (const lang of ['ja', 'en']) {
    const all = Object.values(MESSAGES[lang]).join('\n');
    assert.doesNotMatch(all, /複雑性要求を必ず|require complexity|定期的に変更する/);
  }
  // 辞書の出典・ライセンス
  assert.match(ja['help.sources.1'], /SecLists.*MITライセンス/);
  assert.match(ja['help.sources.1'], /rockyou.*NCSC/);
});

test('t は {name} を置き換え、ない鍵はキーをそのまま返す', () => {
  assert.equal(t('rbf.start', { rounds: 5, batch: 20, users: 200 }, 'ja'), '[スプレー] 開始：ラウンド=5、1ラウンドの対象=20人、ユーザー数=200');
  assert.equal(t('atk.kpiSent', {}, 'en'), 'Sent');
  assert.equal(t('no.such.key', {}, 'ja'), 'no.such.key');
});
