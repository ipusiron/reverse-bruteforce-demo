// Reverse Brute-force Demo の画面（DOM の処理だけ。計算は rbf-core.js、文言は messages.js）
(() => {
  'use strict';

  const C = globalThis.RbfCore;
  const I = globalThis.RbfI18n;
  const Theme = globalThis.RbfTheme;
  const M = globalThis.RbfMessages;
  const t = (key, vars) => M.t(key, vars);
  const $ = (id) => document.getElementById(id);
  const setText = (id, v) => {
    const el = $(id);
    if (el) el.textContent = v;
  };

  let env = null;
  let lastConfig = null; // 環境を作ったときの設定（KPI の説明に使う）
  const running = { bf: false, dict: false, rbf: false };

  // 秒（ログイン判定の now に使う。シミュレーションの中の時間）
  const nowSec = () => Math.floor(performance.now() / 1000);
  const intVal = (id) => Math.trunc(Number($(id).value));

  function appendLog(id, line) {
    const el = $(id);
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
    el.textContent += line + '\n';
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  function setProgress(id, ratio) {
    $(id).style.width = `${Math.max(0, Math.min(100, Math.round(ratio * 100)))}%`;
  }

  // ---- タブ（WAI-ARIA APG） ----
  const TABS = ['bf', 'dict', 'rbf'];

  function selectTab(name, focus) {
    for (const n of TABS) {
      const on = n === name;
      const tab = $(`tab-${n}`);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      tab.classList.toggle('active', on);
      $(`panel-${n}`).hidden = !on;
    }
    if (focus) $(`tab-${name}`).focus();
  }

  function initTabs() {
    for (const n of TABS) {
      const tab = $(`tab-${n}`);
      tab.addEventListener('click', () => selectTab(n, false));
      tab.addEventListener('keydown', (e) => {
        const i = TABS.indexOf(n);
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        selectTab(TABS[(next + TABS.length) % TABS.length], true);
      });
    }
  }

  // ---- ヘルプのモーダル（フォーカスの移動・トラップ・戻す） ----
  let lastFocused = null;

  function renderHelp() {
    const body = $('helpBody');
    body.replaceChildren();
    for (const item of M.HELP) {
      if (item.type === 'h') {
        const h = document.createElement('h3');
        h.textContent = t(item.key);
        body.append(h);
      } else if (item.type === 'h4') {
        const h = document.createElement('h4');
        h.textContent = t(item.key);
        body.append(h);
      } else if (item.type === 'p') {
        const p = document.createElement('p');
        p.textContent = t(item.key);
        body.append(p);
      } else {
        const list = document.createElement(item.type === 'ol' ? 'ol' : 'ul');
        if (item.type === 'ul') list.className = 'bullets';
        for (const k of item.keys) {
          const li = document.createElement('li');
          li.textContent = t(k);
          list.append(li);
        }
        body.append(list);
      }
    }
  }

  function openHelp() {
    lastFocused = document.activeElement;
    $('helpModal').hidden = false;
    $('helpModal').classList.add('show');
    $('closeModal').focus();
  }

  function closeHelp() {
    $('helpModal').classList.remove('show');
    $('helpModal').hidden = true;
    if (lastFocused) lastFocused.focus();
  }

  function initHelp() {
    renderHelp();
    $('btn-help').addEventListener('click', openHelp);
    $('closeModal').addEventListener('click', closeHelp);
    $('helpModal').addEventListener('click', (e) => {
      if (e.target === $('helpModal')) closeHelp();
    });
    document.addEventListener('keydown', (e) => {
      if ($('helpModal').hidden) return;
      if (e.key === 'Escape') closeHelp();
      else if (e.key === 'Tab') {
        // フォーカスをモーダルの中に閉じ込める
        const focusable = $('helpModal').querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  // ---- ロックアウト設定の表示 ----
  function toggleLockoutFields() {
    const on = $('lockoutOn').checked;
    $('lockoutThresholdField').hidden = !on;
    $('lockoutWindowField').hidden = !on;
  }

  // ---- 環境の生成 ----
  function readConfig() {
    const lockoutEnabled = $('lockoutOn').checked;
    return {
      userCount: intVal('userCount'),
      weakRatio: intVal('weakRatio'),
      lockoutEnabled,
      lockoutThreshold: lockoutEnabled ? intVal('lockoutThreshold') : 1,
      lockoutWindowSec: lockoutEnabled ? intVal('lockoutWindowSec') : 1
    };
  }

  function renderEnvStats() {
    const box = $('envStats');
    if (!lastConfig) {
      box.hidden = true;
      return;
    }
    const c = lastConfig;
    box.hidden = false;
    box.replaceChildren();
    const weak = Math.floor(c.userCount * (c.weakRatio / 100));
    const l1 = document.createElement('div');
    l1.textContent = t('cfg.statsUsers', { users: c.userCount, weak, ratio: c.weakRatio });
    const l2 = document.createElement('div');
    l2.textContent = c.lockoutEnabled ? t('cfg.statsLockoutOn', { threshold: c.lockoutThreshold, window: c.lockoutWindowSec }) : t('cfg.statsLockoutOff');
    box.append(l1, l2);
  }

  function badValue(key) {
    const names = { userCount: 'cfg.userCount', weakRatio: 'cfg.weakRatio', lockoutThreshold: 'cfg.threshold',
      lockoutWindowSec: 'cfg.window', rate: 'cfg.rate', bfMaxTries: 'bf.maxTries', dictSize: 'dict.size', rbfRounds: 'rbf.rounds', rbfBatch: 'rbf.batch' };
    const [lo, hi] = C.LIMITS[key];
    alert(t('atk.badValue', { field: t(names[key]), lo, hi }));
  }

  function seedEnvironment() {
    const c = readConfig();
    const v = C.validate({ userCount: c.userCount, weakRatio: c.weakRatio,
      ...(c.lockoutEnabled ? { lockoutThreshold: c.lockoutThreshold, lockoutWindowSec: c.lockoutWindowSec } : {}) });
    if (!v.ok) {
      badValue(v.key);
      return;
    }
    env = C.makeEnvironment(c);
    lastConfig = c;
    setText('seedStatus', t('cfg.seeded'));
    renderEnvStats();
    for (const n of TABS) resetKpi(n);
  }

  // ---- 攻撃の共通 ----
  const KPI = {
    bf: ['bfGenerated', 'bfAttempts', 'bfLocked', 'bfSuccess', 'bfTime'],
    dict: ['dictAttempts', 'dictLocked', 'dictSuccess', 'dictTime'],
    rbf: ['rbfAttempts', 'rbfLocked', 'rbfCompromised', 'rbfTime']
  };

  function resetKpi(name) {
    for (const id of KPI[name]) setText(id, id.endsWith('Time') ? '0.0s' : '0');
    setProgress(`${name}Progress`, 0);
    $(`${name}Log`).textContent = '';
  }

  // ボタンの文字を実行中に替える。rate から1ティック（0.1秒）あたりの件数を出す
  function perTick(rate) {
    return Math.max(1, Math.floor(rate / 10));
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function checkReady(name) {
    if (!env) {
      alert(t('cfg.needSeed'));
      return false;
    }
    const rate = intVal('rate');
    if (!C.validate({ rate }).ok) {
      badValue('rate');
      return false;
    }
    return true;
  }

  // ---- ブルートフォース ----
  async function runBF() {
    if (running.bf || !checkReady('bf')) return;
    const target = intVal('bfTarget');
    const maxTries = intVal('bfMaxTries');
    if (target < 0 || target >= env.users.length) {
      alert(t('atk.badTarget', { max: env.users.length - 1 }));
      return;
    }
    if (!C.validate({ bfMaxTries: maxTries }).ok) {
      badValue('bfMaxTries');
      return;
    }
    running.bf = true;
    $('btnRunBF').disabled = true;
    env.resetState();
    resetKpi('bf');
    const rate = intVal('rate');
    const start = performance.now();
    appendLog('bfLog', t('bf.start', { target, max: maxTries }));
    appendLog('bfLog', t('bf.note'));
    let sent = 0;
    let locked = 0;
    let success = 0;
    let generated = 0;
    let i = 0;
    const plan = C.bruteForcePlan(target, maxTries);
    for (const step of plan) {
      if (!running.bf) break;
      generated = step.index + 1;
      const res = env.tryLogin(step.userId, step.password, nowSec());
      if (res.sent) sent++;
      if (step.index < 8 || step.index % 500 === 0) appendLog('bfLog', t('bf.try', { n: generated, pw: step.password }));
      if (res.status === 'success') {
        success++;
        appendLog('bfLog', t('bf.success', { pw: step.password, n: sent }));
        break;
      }
      if (res.status === 'locked' && res.justLocked) {
        locked++;
        appendLog('bfLog', t('bf.lockedAt', { threshold: env.lockoutThreshold }));
        break;
      }
      i = step.index;
      if (i % perTick(rate) === perTick(rate) - 1) {
        setText('bfGenerated', String(generated));
        setText('bfAttempts', String(sent));
        setText('bfLocked', String(locked));
        setText('bfSuccess', String(success));
        setProgress('bfProgress', generated / maxTries);
        setText('bfTime', `${((performance.now() - start) / 1000).toFixed(1)}s`);
        await sleep(100);
      }
    }
    setText('bfGenerated', String(generated));
    setText('bfAttempts', String(sent));
    setText('bfLocked', String(locked));
    setText('bfSuccess', String(success));
    setProgress('bfProgress', success || locked ? 1 : Math.min(1, generated / maxTries));
    setText('bfTime', `${((performance.now() - start) / 1000).toFixed(1)}s`);
    if (!success) {
      appendLog('bfLog', t('bf.failEnd', { generated, sent }));
      appendLog('bfLog', locked ? t('bf.lockedHelped', { locked }) : t('bf.noLockFail'));
    }
    appendLog('bfLog', t('bf.end', { generated, sent, locked, success }));
    running.bf = false;
    $('btnRunBF').disabled = false;
  }

  // ---- 辞書攻撃 ----
  async function runDict() {
    if (running.dict || !checkReady('dict')) return;
    const target = intVal('dictTarget');
    const dictSize = intVal('dictSize');
    if (target < 0 || target >= env.users.length) {
      alert(t('atk.badTarget', { max: env.users.length - 1 }));
      return;
    }
    if (!C.validate({ dictSize }).ok) {
      badValue('dictSize');
      return;
    }
    running.dict = true;
    $('btnRunDict').disabled = true;
    env.resetState();
    resetKpi('dict');
    const rate = intVal('rate');
    const start = performance.now();
    const total = C.dictionaryTotal(env.dict, dictSize);
    appendLog('dictLog', t('dict.start', { target, size: dictSize }));
    appendLog('dictLog', t('dict.using', { sample: env.dict.slice(0, 5).join(', ') }));
    let sent = 0;
    let locked = 0;
    let success = 0;
    for (const step of C.dictionaryPlan(target, env.dict, dictSize)) {
      if (!running.dict) break;
      appendLog('dictLog', t('dict.try', { n: step.index + 1, total, pw: step.password }));
      const res = env.tryLogin(step.userId, step.password, nowSec());
      if (res.sent) sent++;
      if (res.status === 'success') {
        success++;
        appendLog('dictLog', t('dict.success', { pw: step.password, n: step.index + 1 }));
      } else if (res.status === 'locked' && res.justLocked) {
        locked++;
        appendLog('dictLog', t('dict.locked', { threshold: env.lockoutThreshold }));
      }
      setText('dictAttempts', String(sent));
      setText('dictLocked', String(locked));
      setText('dictSuccess', String(success));
      setProgress('dictProgress', (step.index + 1) / total);
      setText('dictTime', `${((performance.now() - start) / 1000).toFixed(1)}s`);
      if (success || locked) break; // 成功、またはロックされたら辞書攻撃は止まる（以後は送信できない）
      await sleep(Math.max(50, Math.floor(1000 / rate)));
    }
    if (!success) {
      appendLog('dictLog', t('dict.failEnd'));
      if (locked) appendLog('dictLog', t('dict.lockedHelped', { locked }));
    }
    appendLog('dictLog', t('dict.end', { sent, locked, success }));
    running.dict = false;
    $('btnRunDict').disabled = false;
  }

  // ---- パスワードスプレー ----
  async function runRBF() {
    if (running.rbf || !checkReady('rbf')) return;
    const rounds = intVal('rbfRounds');
    const batch = intVal('rbfBatch');
    if (!C.validate({ rbfRounds: rounds }).ok) {
      badValue('rbfRounds');
      return;
    }
    if (!C.validate({ rbfBatch: batch }).ok) {
      badValue('rbfBatch');
      return;
    }
    running.rbf = true;
    $('btnRunRBF').disabled = true;
    env.resetState();
    resetKpi('rbf');
    const rate = intVal('rate');
    const n = env.users.length;
    const span = Math.min(batch, n);
    const total = C.reverseBruteTotal(n, env.dict, rounds, batch);
    const start = performance.now();
    appendLog('rbfLog', t('rbf.start', { rounds, batch, users: n }));
    let sent = 0;
    let locked = 0;
    const compromised = new Set();
    let done = 0;
    let tick = 0;
    for (const step of C.reverseBrutePlan(n, env.dict, rounds, batch)) {
      if (!running.rbf) break;
      if (step.first) appendLog('rbfLog', t('rbf.round', { n: step.round + 1, pw: step.password, count: span }));
      const res = env.tryLogin(step.userId, step.password, nowSec());
      if (res.sent) sent++;
      if (res.status === 'locked' && res.justLocked) locked++;
      if (res.status === 'success') {
        compromised.add(res.userId);
        appendLog('rbfLog', t('rbf.success', { userId: res.userId, pw: step.password }));
      }
      done++;
      if (tick++ % perTick(rate) === perTick(rate) - 1) {
        setText('rbfAttempts', String(sent));
        setText('rbfLocked', String(locked));
        setText('rbfCompromised', String(compromised.size));
        setProgress('rbfProgress', done / total);
        setText('rbfTime', `${((performance.now() - start) / 1000).toFixed(1)}s`);
        await sleep(100);
      }
    }
    setText('rbfAttempts', String(sent));
    setText('rbfLocked', String(locked));
    setText('rbfCompromised', String(compromised.size));
    setProgress('rbfProgress', 1);
    setText('rbfTime', `${((performance.now() - start) / 1000).toFixed(1)}s`);
    if (compromised.size === 0) appendLog('rbfLog', t('rbf.failEnd'));
    if (locked === 0 && lastConfig.lockoutEnabled) appendLog('rbfLog', t('rbf.lockoutNote'));
    appendLog('rbfLog', t('rbf.end', { sent, locked, compromised: compromised.size }));
    running.rbf = false;
    $('btnRunRBF').disabled = false;
  }

  function initAttacks() {
    $('btnRunBF').addEventListener('click', runBF);
    $('btnRunDict').addEventListener('click', runDict);
    $('btnRunRBF').addEventListener('click', runRBF);
    $('btnStopBF').addEventListener('click', () => {
      running.bf = false;
    });
    $('btnStopDict').addEventListener('click', () => {
      running.dict = false;
    });
    $('btnStopRBF').addEventListener('click', () => {
      running.rbf = false;
    });
    $('btnClearBFLog').addEventListener('click', () => {
      $('bfLog').textContent = '';
    });
    $('btnClearDictLog').addEventListener('click', () => {
      $('dictLog').textContent = '';
    });
    $('btnClearRBFLog').addEventListener('click', () => {
      $('rbfLog').textContent = '';
    });
  }

  // ---- 言語とテーマ ----
  function applyLanguage() {
    I.applyStaticText();
    Theme.refresh($('btn-theme'));
    setText('seedStatus', lastConfig ? t('cfg.seeded') : t('cfg.notSeeded'));
    renderEnvStats();
    renderHelp();
    // ログは実行時の言語で残るので、どれも実行していないときは消す（英語表示に日本語を残さない）
    if (!running.bf && !running.dict && !running.rbf) for (const n of TABS) resetKpi(n);
  }

  function init() {
    I.init();
    initTabs();
    initHelp();
    initAttacks();
    for (const r of ['lockoutOff', 'lockoutOn']) $(r).addEventListener('change', toggleLockoutFields);
    toggleLockoutFields();
    $('btnSeed').addEventListener('click', seedEnvironment);
    $('btn-theme').addEventListener('click', () => Theme.toggle($('btn-theme')));
    $('btn-lang').addEventListener('click', () => {
      I.set(I.lang === 'ja' ? 'en' : 'ja');
      applyLanguage();
    });
    applyLanguage();
    selectTab('bf', false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
