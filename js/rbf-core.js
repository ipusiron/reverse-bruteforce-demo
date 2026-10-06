// Reverse Brute-force Demo の計算部（DOM を使わない）。globalThis.RbfCore に置く
// - 仮想のユーザー群（弱い/強いパスワード）とログインの判定（アカウントロックアウトつき）
// - 3つの攻撃のプラン: ブルートフォース（1ユーザーに順次）、辞書攻撃（よくあるパスワードを1ユーザーに）、
//   リバースブルートフォース＝パスワードスプレー（1つのパスワードを多数のユーザーに、ラウンドごとに）
// すべてブラウザーの中だけで動く防御教育用の模擬で、実在のシステムには接続しない
(() => {
  'use strict';

  // よくあるパスワードの辞書（50件）。出典: SecLists（danielmiessler、MITライセンス）に同梱の
  // rockyou.txt と NCSC「Top 100,000 passwords」の上位に実在する語。順位は出典・年で異なるため、
  // 「上位によく出る」程度の並び。実際の流出データの平文をそのまま多数は同梱せず、広く知られた上位だけを使う
  const COMMON_PASSWORDS = [
    '123456', 'password', '123456789', '12345', '12345678', 'qwerty', '1234567', '111111', '1234567890', '123123',
    'abc123', '1234', 'password1', 'iloveyou', '1q2w3e4r', '000000', 'qwerty123', 'zaq12wsx', 'dragon', 'sunshine',
    '654321', 'monkey', 'letmein', '1qaz2wsx', '123321', 'qwertyuiop', 'superman', 'football', '7777777', '121212',
    '555555', '666666', '112233', 'princess', 'admin', 'welcome', 'login', 'master', 'hello', 'freedom',
    'whatever', 'qazwsx', 'trustno1', 'batman', 'zxcvbnm', 'asdfgh', 'baseball', 'shadow', 'michael', 'jennifer'
  ];
  const DICT_MAX = COMMON_PASSWORDS.length;

  // 設定の範囲（画面の入力の min/max と、テストで使う）
  const LIMITS = {
    userCount: [10, 10000], weakRatio: [0, 100], lockoutThreshold: [1, 20], lockoutWindowSec: [1, 3600],
    rate: [1, 5000], bfMaxTries: [1, 100000], dictSize: [1, DICT_MAX], rbfRounds: [1, 100], rbfBatch: [1, 100000]
  };

  // 種つきの乱数（mulberry32）。同じ種なら同じ環境を作れる（テストと再現のため）
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ブルートフォースで順に作る8文字（aaaaaaaa, aaaaaaab, … 26進）。index 番目
  function bruteForcePassword(index) {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let out = '';
    let n = index;
    for (let i = 0; i < 8; i++) {
      out = chars[n % 26] + out;
      n = Math.floor(n / 26);
    }
    return out;
  }
  // ユーザー0に割り当てる、約 tries 回のブルートフォースで見つかるパスワード
  const BF_TARGET_INDEX = 4200;

  // 仮想環境を作る。weakRatio% のユーザーが弱いパスワード（0番は総当たり用、ほかは辞書の上位から）、残りは強いパスワード
  // rand は 0〜1 の乱数を返す関数（省略時は種つき）。強いパスワードは辞書に出てこない文字列
  function makeEnvironment({ userCount, weakRatio, lockoutThreshold, lockoutWindowSec, lockoutEnabled = true, dict = COMMON_PASSWORDS, rand }) {
    const r = rand || mulberry32(userCount * 1000 + weakRatio);
    const strongPassword = () => 'S!' + Math.floor(r() * 1e9).toString(36) + Math.floor(r() * 1e9).toString(36) + '#';
    const weakCount = Math.floor(userCount * (weakRatio / 100));
    const users = [];
    for (let i = 0; i < userCount; i++) {
      let password;
      if (i < weakCount) {
        // 0番は総当たりで見つかる8文字、ほかは辞書の上位から順に（最もよくあるパスワードから割り当てる）
        password = i === 0 ? bruteForcePassword(BF_TARGET_INDEX) : dict[(i - 1) % dict.length];
      } else {
        password = strongPassword();
      }
      users.push({ id: i, password, failCount: 0, lockedUntil: 0, compromised: false });
    }
    return {
      users,
      dict,
      lockoutEnabled,
      lockoutThreshold,
      lockoutWindowSec,
      weakCount,
      resetState() {
        for (const u of this.users) {
          u.failCount = 0;
          u.lockedUntil = 0;
          u.compromised = false;
        }
      },
      // ログインを1回試す。now は現在の秒。戻り値の status は success・fail・locked
      tryLogin(userId, password, now) {
        const u = this.users[userId];
        if (this.lockoutEnabled && now < u.lockedUntil) return { status: 'locked', userId, lockedUntil: u.lockedUntil, sent: false };
        if (password === u.password) {
          u.failCount = 0;
          u.compromised = true;
          return { status: 'success', userId, sent: true };
        }
        u.failCount++;
        if (this.lockoutEnabled && u.failCount >= this.lockoutThreshold) {
          u.lockedUntil = now + this.lockoutWindowSec;
          u.failCount = 0;
          return { status: 'locked', userId, lockedUntil: u.lockedUntil, justLocked: true, sent: true };
        }
        return { status: 'fail', userId, remaining: this.lockoutEnabled ? this.lockoutThreshold - u.failCount : null, sent: true };
      }
    };
  }

  // ブルートフォースのプラン: index 0..maxTries-1 の8文字を1つずつ（target に集中）
  function* bruteForcePlan(target, maxTries) {
    for (let i = 0; i < maxTries; i++) yield { index: i, userId: target, password: bruteForcePassword(i) };
  }

  // 辞書攻撃のプラン: 辞書の上位 dictSize 個を target に1つずつ
  function* dictionaryPlan(target, dict, dictSize) {
    const n = Math.min(dictSize, dict.length);
    for (let i = 0; i < n; i++) yield { index: i, userId: target, password: dict[i] };
  }

  // リバースブルートフォース（パスワードスプレー）のプラン
  // 各ラウンドで1つのパスワードを batch 人に1回ずつ送る。ラウンドごとに対象を batch 人ずつずらす（シャーディング）
  // batch を小さくすると、1ラウンドの対象が減り、各ユーザーへの試行が時間的に分散する（ロックアウトを避ける）
  function* reverseBrutePlan(userCount, dict, rounds, batch) {
    const n = Math.min(rounds, dict.length);
    const span = Math.min(batch, userCount);
    for (let r = 0; r < n; r++) {
      const password = dict[r];
      const start = (r * span) % userCount;
      for (let k = 0; k < span; k++) {
        const userId = (start + k) % userCount;
        yield { round: r, password, userId, first: k === 0 };
      }
    }
  }

  // プランの総数（進捗バー用）
  const bruteForceTotal = (maxTries) => maxTries;
  const dictionaryTotal = (dict, dictSize) => Math.min(dictSize, dict.length);
  const reverseBruteTotal = (userCount, dict, rounds, batch) => Math.min(rounds, dict.length) * Math.min(batch, userCount);

  // 設定を範囲で確かめる。戻り値は { ok, key } 。key は範囲外だった項目
  function validate(values) {
    for (const [key, [lo, hi]] of Object.entries(LIMITS)) {
      if (key in values) {
        const v = values[key];
        if (!Number.isFinite(v) || v < lo || v > hi) return { ok: false, key, lo, hi };
      }
    }
    return { ok: true };
  }

  globalThis.RbfCore = {
    COMMON_PASSWORDS, DICT_MAX, LIMITS, mulberry32, bruteForcePassword, BF_TARGET_INDEX, makeEnvironment,
    bruteForcePlan, dictionaryPlan, reverseBrutePlan, bruteForceTotal, dictionaryTotal, reverseBruteTotal, validate
  };
})();
