import test from 'node:test';
import assert from 'node:assert/strict';
import { core } from './load.js';

const C = core();
// ログインを最後まで回して、成功したユーザー・送信回数・ロック回数を数える
function run(env, plan, { stopOnSuccess = false } = {}) {
  let sent = 0;
  let locked = 0;
  const compromised = new Set();
  const now = 0;
  for (const step of plan) {
    const res = env.tryLogin(step.userId, step.password, now);
    if (res.sent) sent++;
    if (res.status === 'locked' && res.justLocked) locked++;
    if (res.status === 'success') {
      compromised.add(res.userId);
      if (stopOnSuccess) break; // 単一ユーザーへの攻撃（総当たり・辞書）は成功で止まる
    }
  }
  return { sent, locked, compromised };
}

test('辞書は50件、重複なし。すべて小文字と数字で、強いパスワードの形（S!…#）と重ならない', () => {
  assert.equal(C.COMMON_PASSWORDS.length, 50);
  assert.equal(C.DICT_MAX, 50);
  assert.equal(new Set(C.COMMON_PASSWORDS).size, 50);
  for (const p of C.COMMON_PASSWORDS) assert.doesNotMatch(p, /^S!/, p);
  // 広く知られた上位がいくつか含まれる（出典の整合）
  for (const p of ['123456', 'password', 'qwerty', 'iloveyou']) assert.ok(C.COMMON_PASSWORDS.includes(p), p);
});

test('ブルートフォースの8文字は26進で、0番は aaaaaaaa、4200番は aaaaagfo', () => {
  assert.equal(C.bruteForcePassword(0), 'aaaaaaaa');
  assert.equal(C.bruteForcePassword(1), 'aaaaaaab');
  assert.equal(C.bruteForcePassword(26), 'aaaaaaba');
  assert.equal(C.bruteForcePassword(C.BF_TARGET_INDEX), 'aaaaagfo');
  assert.equal(C.BF_TARGET_INDEX, 4200);
});

test('環境: 弱いユーザーは0番が総当たり用、1番以降は辞書の上位から。残りは辞書にない強いパスワード', () => {
  const env = C.makeEnvironment({ userCount: 20, weakRatio: 50, lockoutThreshold: 3, lockoutWindowSec: 60 });
  assert.equal(env.weakCount, 10);
  assert.equal(env.users[0].password, C.bruteForcePassword(C.BF_TARGET_INDEX));
  assert.equal(env.users[1].password, C.COMMON_PASSWORDS[0]); // 123456
  assert.equal(env.users[2].password, C.COMMON_PASSWORDS[1]); // password
  for (let i = 10; i < 20; i++) {
    assert.match(env.users[i].password, /^S!.*#$/, `user ${i}`);
    assert.ok(!C.COMMON_PASSWORDS.includes(env.users[i].password), `user ${i}`);
  }
  // 種が同じなら同じ強いパスワード（再現できる）
  const env2 = C.makeEnvironment({ userCount: 20, weakRatio: 50, lockoutThreshold: 3, lockoutWindowSec: 60 });
  assert.equal(env2.users[15].password, env.users[15].password);
});

test('ログインの判定: 正しいパスワードで成功、閾値の失敗でロック、ロック中は送信されない', () => {
  const env = C.makeEnvironment({ userCount: 10, weakRatio: 100, lockoutThreshold: 3, lockoutWindowSec: 60 });
  assert.equal(env.tryLogin(1, 'wrong', 0).status, 'fail');
  assert.equal(env.tryLogin(1, 'wrong', 0).status, 'fail');
  const third = env.tryLogin(1, 'wrong', 0);
  assert.equal(third.status, 'locked');
  assert.equal(third.justLocked, true);
  // ロック中（60秒以内）は送信されない
  const during = env.tryLogin(1, C.COMMON_PASSWORDS[0], 30);
  assert.deepEqual([during.status, during.sent], ['locked', false]);
  // ロックが明けたら、正しいパスワードで成功
  assert.equal(env.tryLogin(1, C.COMMON_PASSWORDS[0], 61).status, 'success');
});

test('ロックアウト無効のときは、何回失敗してもロックしない', () => {
  const env = C.makeEnvironment({ userCount: 10, weakRatio: 100, lockoutThreshold: 3, lockoutWindowSec: 60, lockoutEnabled: false });
  for (let i = 0; i < 10; i++) assert.equal(env.tryLogin(1, 'wrong', 0).status, 'fail');
  assert.equal(env.tryLogin(1, C.COMMON_PASSWORDS[0], 0).status, 'success');
});

test('ブルートフォース: ロック無効なら約4200試行でユーザー0が陥落、ロック有効なら閾値で止まる', () => {
  const env = C.makeEnvironment({ userCount: 10, weakRatio: 100, lockoutThreshold: 3, lockoutWindowSec: 60, lockoutEnabled: false });
  const r = run(env, C.bruteForcePlan(0, 6000), { stopOnSuccess: true });
  assert.deepEqual([...r.compromised], [0]);
  assert.equal(r.sent, C.BF_TARGET_INDEX + 1); // 4201回目で成功
  // ロック有効（now=0 のまま＝ロックが明けない）なら、閾値で1回ロックして以後は送信されない
  const env2 = C.makeEnvironment({ userCount: 10, weakRatio: 100, lockoutThreshold: 5, lockoutWindowSec: 60 });
  const r2 = run(env2, C.bruteForcePlan(0, 6000));
  assert.equal(r2.compromised.size, 0);
  assert.equal(r2.locked, 1);
  assert.equal(r2.sent, 5); // 5回失敗で送信は5回、以後はロック中で送信されない
});

test('辞書攻撃: 辞書の上位にあるパスワードのユーザーは、その順位の試行で陥落', () => {
  const env = C.makeEnvironment({ userCount: 10, weakRatio: 100, lockoutThreshold: 3, lockoutWindowSec: 60, lockoutEnabled: false });
  // user1 のパスワードは dict[0]（1個目の候補）
  const r = run(env, C.dictionaryPlan(1, env.dict, 20), { stopOnSuccess: true });
  assert.deepEqual([...r.compromised], [1]);
  assert.equal(r.sent, 1);
  // user3 のパスワードは dict[2]（3個目の候補）
  const env2 = C.makeEnvironment({ userCount: 10, weakRatio: 100, lockoutThreshold: 3, lockoutWindowSec: 60, lockoutEnabled: false });
  assert.equal(run(env2, C.dictionaryPlan(3, env2.dict, 20), { stopOnSuccess: true }).sent, 3);
});

test('リバースブルートフォース: batch を小さくすると1ラウンドの対象が減り、送信回数が減る（シャーディング）', () => {
  const N = 200;
  const dict = C.COMMON_PASSWORDS;
  assert.equal(C.reverseBruteTotal(N, dict, 1, N), N);
  assert.equal(C.reverseBruteTotal(N, dict, 1, 20), 20);
  assert.equal(C.reverseBruteTotal(N, dict, 1, 1), 1);
  assert.equal(C.reverseBruteTotal(N, dict, 5, 20), 100);
  assert.equal(C.reverseBruteTotal(N, dict, 5, N), 1000);
  // プランの長さが total と一致し、ラウンドごとに対象がずれる
  const steps = [...C.reverseBrutePlan(N, dict, 3, 20)];
  assert.equal(steps.length, 60);
  assert.deepEqual(steps.filter((s) => s.round === 0).map((s) => s.userId).slice(0, 3), [0, 1, 2]);
  assert.deepEqual(steps.filter((s) => s.round === 1).map((s) => s.userId).slice(0, 3), [20, 21, 22]);
  assert.equal(new Set(steps.filter((s) => s.round === 0).map((s) => s.userId)).size, 20);
});

test('リバースブルートフォース: 1ラウンド目の 123456 で、それを使うユーザーが陥落する', () => {
  const env = C.makeEnvironment({ userCount: 20, weakRatio: 50, lockoutThreshold: 3, lockoutWindowSec: 60, lockoutEnabled: false });
  // batch=20（全員）で1ラウンド → user1（dict[0]=123456）が陥落
  const r = run(env, C.reverseBrutePlan(20, env.dict, 1, 20));
  assert.ok(r.compromised.has(1));
  assert.equal(r.locked, 0); // 各ユーザーは1回ずつなのでロックしない
});

test('リバースブルートフォースはロックアウトをすり抜ける: 各ユーザーへの試行が1ラウンド1回なので閾値に届かない', () => {
  // ロック有効（閾値3）でも、1ラウンドで各ユーザーに1回ずつなら、3ラウンドまではロックしない
  const env = C.makeEnvironment({ userCount: 20, weakRatio: 50, lockoutThreshold: 3, lockoutWindowSec: 3600 });
  const r = run(env, C.reverseBrutePlan(20, env.dict, 2, 20));
  assert.equal(r.locked, 0);
  assert.ok(r.compromised.has(1)); // それでも123456のユーザーは陥落する
});

test('設定の範囲の確認（validate）', () => {
  assert.equal(C.validate({ userCount: 200, rate: 200 }).ok, true);
  assert.deepEqual(C.validate({ userCount: 5 }), { ok: false, key: 'userCount', lo: 10, hi: 10000 });
  assert.equal(C.validate({ dictSize: 51 }).key, 'dictSize');
  assert.equal(C.validate({ weakRatio: 0 }).ok, true);
  assert.equal(C.validate({ rbfBatch: 0 }).key, 'rbfBatch');
  assert.deepEqual(C.LIMITS.dictSize, [1, 50]);
});
