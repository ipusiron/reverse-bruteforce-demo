// ======= 共通よくあるパスワード辞書 =======
const COMMON_PASSWORDS = [
  "123456","password","123456789","12345","qwerty","111111","12345678",
  "abc123","123123","1234567","qwerty123","1q2w3e4r","000000","iloveyou",
  "admin","welcome","monkey","dragon","letmein","football","baseball",
  "login","princess","starwars","password1","zaq12wsx","qazwsx","123qwe",
  "Passw0rd","secret","hunter2","asdfgh","qwertyuiop","pokemon","sunshine",
  "lovely","cheese","princess1","whatever","hello","freedom","ninja","master"
];

// ======= 環境（ユーザー群 + 認証/ロックアウト） =======
let ENV = null;
const nowSec = () => Math.floor(Date.now()/1000);

function makeEnvironment({
  userCount,
  weakRatio,
  lockoutThreshold,
  lockoutWindowSec,
  dictSize
}){
  const users = [];
  const weakPwCount = Math.floor(userCount * (weakRatio/100));
  const dict = COMMON_PASSWORDS.slice(0, Math.min(dictSize, COMMON_PASSWORDS.length));

  const strong = () => "S!" + Math.random().toString(36).slice(2,10) + "#";

  for (let i=0; i<userCount; i++){
    let pw;
    if (i < weakPwCount) {
      if (i === 0) {
        // ユーザーID 0には21秒程度で見つかる簡単なブルートフォース用パスワードを設定
        // 約4200試行目 (21秒 * 200req/sec) で見つかるように
        pw = generateBruteForcePassword(4200);
      } else {
        // その他の弱いパスワードユーザーは辞書攻撃用
        // 辞書の前半（3-10番目）に設定して、どの辞書サイズでもヒットするようにする
        pw = dict[(i - 1 + 2) % dict.length]; // 3番目から順番に割り当て
      }
    } else {
      pw = strong();
    }
    users.push({
      id: i,
      password: pw,
      failCount: 0,
      lockedUntil: 0,
      compromised: false
    });
  }

  const server = {
    dict,
    lockoutThreshold,
    lockoutWindowSec,
    attempts: 0,
    lockedEvents: 0,
    successes: 0,
    resetCounters(){
      this.attempts = 0;
      this.lockedEvents = 0;
      this.successes = 0;
    },
    tryLogin(userId, password){
      const u = users[userId];
      const t = nowSec();

      // ロック期間中は即拒否（失敗カウントは増やさない簡略仕様）
      if (t < u.lockedUntil){
        return { status: "locked", lockedUntil: u.lockedUntil };
      }

      this.attempts++;

      if (password === u.password){
        u.failCount = 0;
        u.compromised = true;
        this.successes++;
        return { status: "success" };
      } else {
        u.failCount++;
        if (u.failCount >= lockoutThreshold){
          u.lockedUntil = t + lockoutWindowSec;
          u.failCount = 0; // 窓開始でリセット
          this.lockedEvents++;
          return { status: "locked", lockedUntil: u.lockedUntil };
        }
        return { status: "fail", remaining: lockoutThreshold - u.failCount };
      }
    },
    get users(){ return users; }
  };

  return server;
}

// ======= DOMユーティリティ =======
const $ = sel => document.querySelector(sel);
const setText = (sel, val) => { $(sel).textContent = val; };
function appendLog(el, line){
  // ユーザーが手動でスクロールしているかチェック
  const isScrolledToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
  const container = el.parentElement;
  
  el.textContent += line + "\n";
  
  // ユーザーが最下部を見ている時のみ自動スクロール
  if (isScrolledToBottom) {
    el.scrollTop = el.scrollHeight;
    container.classList.remove("scrolling");
  } else {
    container.classList.add("scrolling");
  }
}

// ログのスクロールイベントを監視
document.addEventListener("DOMContentLoaded", () => {
  const logs = document.querySelectorAll(".log");
  logs.forEach(log => {
    log.addEventListener("scroll", () => {
      const container = log.parentElement;
      const isScrolledToBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 10;
      if (isScrolledToBottom) {
        container.classList.remove("scrolling");
      } else {
        container.classList.add("scrolling");
      }
    });
  });
});
function setProgress(el, ratio){
  const pct = Math.max(0, Math.min(100, Math.round(ratio*100)));
  el.style.width = pct + "%";
}

// ======= タブ操作 =======
const tabs = document.querySelectorAll(".tab");
const tabPanels = {
  bf: $("#tab-bf"),
  dict: $("#tab-dict"),
  rbf: $("#tab-rbf")
};
tabs.forEach(b=>{
  b.addEventListener("click", ()=>{
    tabs.forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    Object.values(tabPanels).forEach(p=>p.classList.remove("active"));
    const id = b.dataset.tab;
    if (id==="bf") tabPanels.bf.classList.add("active");
    if (id==="dict") tabPanels.dict.classList.add("active");
    if (id==="rbf") tabPanels.rbf.classList.add("active");
  });
});

// ======= ヘルプモーダル =======
const helpBtn = $("#helpBtn");
const helpModal = $("#helpModal");
const closeModal = $("#closeModal");

helpBtn.addEventListener("click", ()=>{
  helpModal.classList.add("show");
  helpModal.setAttribute("aria-hidden", "false");
});

closeModal.addEventListener("click", ()=>{
  helpModal.classList.remove("show");
  helpModal.setAttribute("aria-hidden", "true");
});

// モーダル外クリックで閉じる
helpModal.addEventListener("click", (e)=>{
  if (e.target === helpModal){
    helpModal.classList.remove("show");
    helpModal.setAttribute("aria-hidden", "true");
  }
});

// ESCキーで閉じる
document.addEventListener("keydown", (e)=>{
  if (e.key === "Escape" && helpModal.classList.contains("show")){
    helpModal.classList.remove("show");
    helpModal.setAttribute("aria-hidden", "true");
  }
});

// ======= ロックアウト設定の表示/非表示制御 =======
document.addEventListener("DOMContentLoaded", () => {
  const lockoutOff = $("#lockoutOff");
  const lockoutOn = $("#lockoutOn");
  const lockoutSettings = $("#lockoutSettings");
  const lockoutTimeSettings = $("#lockoutTimeSettings");

  function toggleLockoutSettings() {
    if (lockoutOn.checked) {
      lockoutSettings.style.display = "flex";
      lockoutTimeSettings.style.display = "flex";
    } else {
      lockoutSettings.style.display = "none";
      lockoutTimeSettings.style.display = "none";
    }
  }

  lockoutOff.addEventListener("change", toggleLockoutSettings);
  lockoutOn.addEventListener("change", toggleLockoutSettings);
  
  // 初期状態設定
  toggleLockoutSettings();
});

// ======= 環境生成 =======
const seedBtn = $("#btnSeed");
const seedStatus = $("#seedStatus");
const envStats = $("#envStats");

seedBtn.addEventListener("click", ()=>{
  const userCount = +$("#userCount").value;
  const weakRatio = +$("#weakRatio").value;
  const lockoutEnabled = $("#lockoutOn").checked;
  const lockoutThreshold = lockoutEnabled ? +$("#lockoutThreshold").value : 999999; // ロック無効時は大きな値
  const lockoutWindowSec = lockoutEnabled ? +$("#lockoutWindowSec").value : 0;
  const dictSize = 50; // 固定で大きな辞書を用意

  if (userCount<10 || userCount>10000){ alert("ユーザー総数は10〜10000にしてください。"); return; }
  if (weakRatio<0 || weakRatio>100){ alert("弱いパスワード比率は0〜100にしてください。"); return; }
  if (lockoutEnabled && (lockoutThreshold<1 || lockoutThreshold>20)){ alert("ロックアウト閾値は1〜20にしてください。"); return; }
  if (lockoutEnabled && (lockoutWindowSec<1 || lockoutWindowSec>3600)){ alert("ロックアウト時間は1〜3600にしてください。"); return; }

  ENV = makeEnvironment({
    userCount, weakRatio, lockoutThreshold, lockoutWindowSec, dictSize
  });

  seedStatus.textContent = "生成済み";
  envStats.classList.remove("hide");

  const weak = Math.floor(userCount*(weakRatio/100));
  const lockoutInfo = lockoutEnabled 
    ? `ロックアウト: ${lockoutThreshold}回失敗で ${lockoutWindowSec}s ロック`
    : "ロックアウト: 無効";
    
  envStats.innerHTML = `
    <strong>環境統計</strong><br/>
    ユーザー数: ${userCount} ／ 弱PW推定: ${weak}（${weakRatio}%）<br/>
    ${lockoutInfo}
  `;

  resetBFKpi(); resetDictKpi(); resetRBFKpi();
});

// ブルートフォース用文字生成関数
function generateBruteForcePassword(index) {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  let num = index;
  
  // 8文字の組み合わせを生成 (aaaaaaaa, aaaaaaab, aaaaaaac, ...)
  for (let i = 0; i < 8; i++) {
    result = chars[num % 26] + result;
    num = Math.floor(num / 26);
  }
  
  return result;
}

// ======= ブルートフォース（単一アカウント集中） =======
let bfRunning = false;
const bfLog = $("#bfLog");

function resetBFKpi(){
  setText("#bfGenerated", "0");
  setText("#bfAttempts", "0");
  setText("#bfLocked", "0");
  setText("#bfSuccess", "0");
  setText("#bfTime", "0.0s");
  setProgress($("#bfProgress"), 0);
  bfLog.textContent = "";
}

$("#btnStopBF").addEventListener("click", ()=> bfRunning=false);
$("#btnClearBFLog").addEventListener("click", ()=> {
  bfLog.textContent = "";
});

$("#btnRunBF").addEventListener("click", async ()=>{
  if (!ENV){ alert("まず『環境を生成』してください。"); return; }
  const target = +$("#bfTarget").value;
  const maxTries = +$("#bfMaxTries").value;
  const rate = +$("#rate").value;

  if (target<0 || target>=ENV.users.length){ alert("ユーザーIDが不正です"); return; }
  if (maxTries<1 || maxTries>100000){ alert("最大試行回数は1〜100000にしてください。"); return; }
  if (rate<1 || rate>5000){ alert("試行レートは1〜5000にしてください。"); return; }

  resetBFKpi(); bfRunning = true;
  ENV.resetCounters();

  const start = performance.now();
  const perTick = Math.max(1, Math.floor(rate/10)); // 0.1秒刻み
  let tries = 0;

  appendLog(bfLog, `[BF] 総当たり開始: 対象ユーザー=${target}, 最大試行=${maxTries}`);
  appendLog(bfLog, `  パスワード生成パターン: aaaaaaaa, aaaaaaab, aaaaaaac, ...`);
  
  let generatedCount = 0; // 生成したパスワード総数
  
  for (let i=0; i<maxTries && bfRunning; ){
    const burst = Math.min(perTick, maxTries - i);
    for (let j=0; j<burst; j++){
      const pw = generateBruteForcePassword(i+j);
      generatedCount = i+j+1; // 生成したパスワード数をカウント
      
      const res = ENV.tryLogin(target, pw);
      
      // 試行したパスワードを表示（最初の10個と、その後は20個ごと、または重要なイベント時）
      const currentIndex = i+j;
      if (currentIndex < 10 || currentIndex % 20 === 0 || res.status !== "fail") {
        if (currentIndex < 10) {
          if (res.status === "locked") {
            appendLog(bfLog, `  生成 ${currentIndex+1}: "${pw}" → ロック中のため送信できず`);
          } else {
            appendLog(bfLog, `  試行 ${currentIndex+1}: "${pw}"`);
          }
        } else if (currentIndex % 20 === 0) {
          if (res.status === "locked") {
            appendLog(bfLog, `  生成 ${currentIndex+1}/${maxTries}: "${pw}" → ロック中`);
          } else {
            appendLog(bfLog, `  試行 ${currentIndex+1}/${maxTries}: "${pw}"`);
          }
        }
      }
      
      if (res.status==="success"){
        appendLog(bfLog, `  ✔ 成功！ パスワード="${pw}" (${currentIndex+1}回目の生成)`);
        bfRunning = false;
        break;
      } else if (res.status==="locked"){
        if (currentIndex < 10 || currentIndex % 20 !== 0) {
          appendLog(bfLog, `  ⛔ "${pw}" 生成時、アカウントロック中 (${currentIndex+1}回目)`);
        }
        if (currentIndex === ENV.lockoutThreshold - 1) { // 初回ロック時のみ詳細表示
          appendLog(bfLog, `     → ${ENV.lockoutThreshold}回失敗でアカウントロック発生`);
          appendLog(bfLog, `     → 攻撃者はロック中も継続してパスワードを生成`);
        }
      } else if (res.status==="fail" && currentIndex < 10) {
        // 最初の10個は失敗も表示
        appendLog(bfLog, `     ✖ 失敗 (残り試行可能: ${res.remaining}回)`);
      }
    }
    i += burst;
    tries = i;
    setText("#bfGenerated", String(generatedCount));
    setText("#bfAttempts", String(ENV.attempts));
    setText("#bfLocked", String(ENV.lockedEvents));
    setText("#bfSuccess", String(ENV.successes));
    setProgress($("#bfProgress"), tries/maxTries);
    setText("#bfTime", ((performance.now()-start)/1000).toFixed(1) + "s");
    await new Promise(r=>setTimeout(r,100));
  }

  if (ENV.successes===0){
    appendLog(bfLog, `  ✖ 攻撃失敗：${generatedCount}個のパスワードを生成、${ENV.attempts}回送信`);
    if (ENV.lockedEvents > 0) {
      appendLog(bfLog, `     → ロックアウトが${ENV.lockedEvents}回発生し、攻撃が効果的に阻止されました`);
    } else {
      appendLog(bfLog, `     → ロックアウトなしでも正解パスワードが見つかりませんでした`);
    }
  }
  appendLog(bfLog, `[BF] 終了: 生成=${generatedCount}個, 送信=${ENV.attempts}回, ロック=${ENV.lockedEvents}回, 成功=${ENV.successes}`);
});

// ======= 辞書攻撃 =======
let dictRunning = false;
const dictLog = $("#dictLog");

function resetDictKpi(){
  setText("#dictAttempts", "0");
  setText("#dictLocked", "0");
  setText("#dictSuccess", "0");
  setText("#dictTime", "0.0s");
  setProgress($("#dictProgress"), 0);
  dictLog.textContent = "";
}

$("#btnStopDict").addEventListener("click", ()=> dictRunning=false);
$("#btnClearDictLog").addEventListener("click", ()=> {
  dictLog.textContent = "";
});

$("#btnRunDict").addEventListener("click", async ()=>{
  if (!ENV){ alert("まず『環境を生成』してください。"); return; }
  const target = +$("#dictTarget").value;
  const dictSize = +$("#dictSize2").value;
  const rate = +$("#rate").value;

  if (target<0 || target>=ENV.users.length){ alert("ユーザーIDが不正です"); return; }
  if (dictSize<1 || dictSize>50){ alert("辞書サイズは1～50にしてください。"); return; }
  if (rate<1 || rate>5000){ alert("試行レートは1～5000にしてください。"); return; }

  resetDictKpi(); dictRunning = true;
  ENV.resetCounters();

  const start = performance.now();
  const dict = ENV.dict.slice(0, dictSize);

  appendLog(dictLog, `[辞書攻撃] 開始: 対象ユーザー=${target}, 辞書サイズ=${dictSize}`);
  appendLog(dictLog, `  使用する辞書: ${dict.slice(0,5).join(", ")}${dict.length>5?"...":""}`);
  
  for (let i=0; i<dict.length && dictRunning; i++){
    const pw = dict[i];
    appendLog(dictLog, `  試行 ${i+1}/${dict.length}: "${pw}"`);
    
    const res = ENV.tryLogin(target, pw);
    
    if (res.status==="success"){
      appendLog(dictLog, `  ✔ 成功！ パスワード="${pw}" (${i+1}個目の候補)`);
      dictRunning = false;
    } else if (res.status==="locked"){
      appendLog(dictLog, `  ⛔ アカウントロック発生！ 解除時刻=${res.lockedUntil}`);
      appendLog(dictLog, `     → ${ENV.lockoutThreshold}回の失敗でロックアウト`);
    } else {
      appendLog(dictLog, `     ✖ 失敗 (残り試行可能: ${res.remaining}回)`);
    }
    
    setText("#dictAttempts", String(ENV.attempts));
    setText("#dictLocked", String(ENV.lockedEvents));
    setText("#dictSuccess", String(ENV.successes));
    setProgress($("#dictProgress"), (i+1)/dict.length);
    setText("#dictTime", ((performance.now()-start)/1000).toFixed(1) + "s");
    
    await new Promise(r=>setTimeout(r, Math.max(50, 1000/rate)));
  }

  if (ENV.successes===0){
    appendLog(dictLog, `  ✖ 攻撃失敗：辞書内のパスワードではヒットせず`);
    if (ENV.lockedEvents > 0) {
      appendLog(dictLog, `     → ロックアウトが${ENV.lockedEvents}回発生し、攻撃が阻止されました`);
    } else {
      appendLog(dictLog, `     → ロックアウトなしでも辞書攻撃は失敗しました`);
    }
  }
  appendLog(dictLog, `[辞書攻撃] 終了: 試行=${ENV.attempts}回, ロック=${ENV.lockedEvents}回, 成功=${ENV.successes}`);
});

// ======= リバースブルートフォース（多数アカウントへ同一PW1回ずつ） =======
let rbfRunning = false;
const rbfLog = $("#rbfLog");

function resetRBFKpi(){
  setText("#rbfAttempts","0");
  setText("#rbfLocked","0");
  setText("#rbfCompromised","0");
  setText("#rbfTime","0.0s");
  setProgress($("#rbfProgress"), 0);
  rbfLog.textContent = "";
}

$("#btnStopRBF").addEventListener("click", ()=> rbfRunning=false);
$("#btnClearRBFLog").addEventListener("click", ()=> {
  rbfLog.textContent = "";
});

$("#btnRunRBF").addEventListener("click", async ()=>{
  if (!ENV){ alert("まず『環境を生成』してください。"); return; }
  const rounds = +$("#rbfRounds").value;
  const batch = +$("#rbfBatch").value;
  const rate = +$("#rate").value;

  if (rounds<1 || rounds>100){ alert("ラウンド数は1〜100にしてください。"); return; }
  if (batch<1 || batch>100000){ alert("対象ユーザー数は1〜100000にしてください。"); return; }
  if (rate<1 || rate>5000){ alert("試行レートは1〜5000にしてください。"); return; }

  resetRBFKpi(); rbfRunning = true;
  ENV.resetCounters();

  const start = performance.now();
  const users = ENV.users;
  const dict = ENV.dict;
  const perTick = Math.max(1, Math.floor(rate/10)); // 0.1秒刻み
  const totalPlan = Math.min(rounds, dict.length) * users.length;
  let sent = 0;

  appendLog(rbfLog, `[RBF] Start: rounds=${rounds}, batch=${batch}, users=${users.length}`);

  for (let r=0; r<rounds && r<dict.length && rbfRunning; r++){
    const pw = dict[r];
    appendLog(rbfLog, `  Round ${r+1}: try password="${pw}" to ALL users (1 try each)`);

    for (let offset=0; offset<users.length && rbfRunning; ){
      const chunk = users.slice(offset, offset+batch);
      for (let k=0; k<chunk.length && rbfRunning; ){
        const burst = Math.min(perTick, chunk.length - k);
        for (let b=0; b<burst; b++){
          const userId = chunk[k+b].id;
          const res = ENV.tryLogin(userId, pw);
          sent++;

          setText("#rbfAttempts", String(ENV.attempts));
          setText("#rbfLocked", String(ENV.lockedEvents));
          setText("#rbfCompromised", String(ENV.successes));
          setProgress($("#rbfProgress"), sent/totalPlan);
          setText("#rbfTime", ((performance.now()-start)/1000).toFixed(1) + "s");

          if (res.status==="success"){
            appendLog(rbfLog, `    ✔ compromised user=${userId} by "${pw}"`);
          }
        }
        k += burst;
        await new Promise(r=>setTimeout(r,100));
      }
      offset += chunk.length;
    }
  }

  if (ENV.successes===0){
    appendLog(rbfLog, `  （今回はヒットなし）弱PW比率が低い/辞書が合わない場合は当然成功しないこともあります。`);
  }
  appendLog(rbfLog, `[RBF] End: attempts=${ENV.attempts}, locked=${ENV.lockedEvents}, compromised=${ENV.successes}`);
});
