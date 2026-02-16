/* ============================================
   ガチャカウンター - アプリケーションロジック
   ============================================ */

// --- 定数 ---
const STORAGE_KEY = 'gacha-counter-data';

// --- DOM要素 ---
const dom = {
  totalCount:       document.getElementById('totalCount'),
  pityRemain:       document.getElementById('pityRemain'),
  pityLimitDisplay: document.getElementById('pityLimitDisplay'),
  currentStreak:    document.getElementById('currentStreak'),
  creditInput:      document.getElementById('creditInput'),
  totalCredit:      document.getElementById('totalCredit'),
  creditRow:        document.getElementById('creditRow'),
  historyList:      document.getElementById('historyList'),
  historySummary:   document.getElementById('historySummary'),
  pityInput:        document.getElementById('pityInput'),
  btnPull1:         document.getElementById('btnPull1'),
  btnPull10:        document.getElementById('btnPull10'),
  btnPull11:        document.getElementById('btnPull11'),
  btnGet:           document.getElementById('btnGet'),
  btnUndo:          document.getElementById('btnUndo'),
  btnReset:         document.getElementById('btnReset'),
  getCountDisplay:  document.getElementById('getCountDisplay'),
  getCountPlus:     document.getElementById('getCountPlus'),
  getCountMinus:    document.getElementById('getCountMinus'),
  charNameInput:    document.getElementById('charNameInput'),
  confirmOverlay:   document.getElementById('confirmOverlay'),
  confirmYes:       document.getElementById('confirmYes'),
  confirmNo:        document.getElementById('confirmNo'),
  container:        document.querySelector('.container'),
  pityCounter:      document.querySelector('.pity-counter'),
};

// --- フラグ ---
let flashLatest = false;

// --- 状態 ---
let getCount = 1; // 獲得数 (UIのみ、保存しない)

let state = {
  totalCount: 0,
  pityLimit: 200,
  creditPerPull: 0,
  charName: '',
  history: [],
  undoStack: [],
};

// =============================================
// データ永続化
// =============================================

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // localStorage が使えない環境でもエラーを握りつぶす
  }
}

function load() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      state.totalCount = parsed.totalCount ?? 0;
      state.pityLimit  = parsed.pityLimit ?? 200;
      state.creditPerPull = parsed.creditPerPull ?? 0;
      state.charName   = parsed.charName ?? '';
      state.history    = parsed.history ?? [];
      state.undoStack  = parsed.undoStack ?? [];
    }
  } catch (e) {
    // パース失敗時はデフォルト状態のまま
  }
}

// =============================================
// 描画
// =============================================

function render() {
  // キャラクター名 (フォーカス中は上書きしない)
  if (document.activeElement !== dom.charNameInput) {
    dom.charNameInput.textContent = state.charName;
  }

  // 総回数
  dom.totalCount.textContent = state.totalCount;

  // 天井カウンター
  const lastGetTotal = state.history.length > 0
    ? state.history[state.history.length - 1].totalAtGet
    : 0;
  const sinceLastGet = state.totalCount - lastGetTotal;
  const pityRemain = Math.max(0, state.pityLimit - sinceLastGet);

  dom.pityRemain.textContent = pityRemain;
  dom.pityLimitDisplay.textContent = state.pityLimit;
  dom.currentStreak.textContent = sinceLastGet;
  dom.pityInput.value = state.pityLimit;

  // 消費クレジット
  dom.creditInput.value = state.creditPerPull;
  if (state.creditPerPull > 0) {
    const totalCredit = state.totalCount * state.creditPerPull;
    dom.totalCredit.textContent = totalCredit.toLocaleString();
    dom.creditRow.classList.add('show');
  } else {
    dom.creditRow.classList.remove('show');
  }

  // 天井が近い場合の警告 (残り20%以下)
  if (pityRemain <= state.pityLimit * 0.2 && pityRemain > 0) {
    dom.pityCounter.classList.add('pity-near');
  } else {
    dom.pityCounter.classList.remove('pity-near');
  }

  // 獲得履歴
  renderHistory();
}

function renderHistory() {
  if (state.history.length === 0) {
    dom.historyList.innerHTML = '<p class="history-empty">まだ獲得記録がありません</p>';
    dom.historySummary.innerHTML = '';
    return;
  }

  dom.historyList.innerHTML = state.history.map((item, index) => {
    const shouldFlash = flashLatest && index === state.history.length - 1;
    const label = item.charName ? item.charName : `${item.id}体目`;
    return `
      <div class="history-item${shouldFlash ? ' flash' : ''}" data-index="${index}">
        <span class="history-item-id">${label}</span>
        <span class="history-item-total">${item.pullsSinceLast}回</span>
        <span class="history-item-diff">(累計${item.totalAtGet}回目)</span>
      </div>
    `;
  }).join('');

  // 最新の履歴が見えるようにスクロール
  dom.historyList.scrollTop = dom.historyList.scrollHeight;
  flashLatest = false;

  // 獲得サマリー
  renderSummary();
}

function renderSummary() {
  if (state.history.length === 0) {
    dom.historySummary.innerHTML = '';
    return;
  }

  // キャラ名ごとにグループ化
  const groups = {};
  state.history.forEach(item => {
    const name = item.charName || '(名前未設定)';
    if (!groups[name]) {
      groups[name] = { count: 0, totalPulls: 0 };
    }
    groups[name].count += 1;
    groups[name].totalPulls += item.pullsSinceLast;
  });

  const summaryItems = Object.entries(groups).map(([name, data]) => {
    return `
      <div class="summary-item">
        <span class="summary-item-name">${name} <span class="summary-item-count">×${data.count}</span></span>
        <span class="summary-item-pulls">合計${data.totalPulls}回</span>
      </div>
    `;
  }).join('');

  dom.historySummary.innerHTML = `
    <div class="history-summary-title">── 獲得サマリー ──</div>
    ${summaryItems}
  `;
}

// =============================================
// アニメーション
// =============================================

function animateCounter() {
  dom.currentStreak.classList.remove('pulse');
  // リフロー強制でアニメーションをリセット
  void dom.currentStreak.offsetWidth;
  dom.currentStreak.classList.add('pulse');
}

function animateGetEffect() {
  dom.container.classList.remove('get-effect');
  void dom.container.offsetWidth;
  dom.container.classList.add('get-effect');
}

// =============================================
// カウント操作
// =============================================

function addPull(amount) {
  // Undo用に現在の状態を保存
  state.undoStack.push({
    type: 'pull',
    amount: amount,
    totalBefore: state.totalCount,
  });

  state.totalCount += amount;

  render();
  save();
  animateCounter();
}

function recordGet() {
  // カウントが0の状態では獲得記録しない
  if (state.totalCount === 0) return;

  // 前回獲得からの回数を計算
  const lastGetTotal = state.history.length > 0
    ? state.history[state.history.length - 1].totalAtGet
    : 0;
  const pullsSinceLast = state.totalCount - lastGetTotal;

  // 前回獲得から回数が進んでいない場合は記録しない
  if (pullsSinceLast <= 0) return;

  // Undo用に保存 (獲得数も記録)
  state.undoStack.push({
    type: 'get',
    totalBefore: state.totalCount,
    getCount: getCount,
  });

  // 1体目: pullsSinceLast を記録
  state.history.push({
    id: state.history.length + 1,
    totalAtGet: state.totalCount,
    pullsSinceLast: pullsSinceLast,
    charName: state.charName || '',
  });

  // 2体目以降: 同じ totalAtGet で pullsSinceLast = 0
  for (let i = 1; i < getCount; i++) {
    state.history.push({
      id: state.history.length + 1,
      totalAtGet: state.totalCount,
      pullsSinceLast: 0,
      charName: state.charName || '',
    });
  }

  // 獲得数を1にリセット
  getCount = 1;
  dom.getCountDisplay.textContent = getCount;

  flashLatest = true;
  render();
  save();
  animateGetEffect();
}

function undo() {
  if (state.undoStack.length === 0) return;

  const lastAction = state.undoStack.pop();

  if (lastAction.type === 'pull') {
    state.totalCount = lastAction.totalBefore;
  } else if (lastAction.type === 'get') {
    const count = lastAction.getCount || 1;
    for (let i = 0; i < count; i++) {
      state.history.pop();
    }
    // id を振り直す
    state.history.forEach((item, index) => {
      item.id = index + 1;
    });
  }

  render();
  save();
}

function showResetConfirm() {
  dom.confirmOverlay.classList.add('show');
}

function hideResetConfirm() {
  dom.confirmOverlay.classList.remove('show');
}

function resetAll() {
  hideResetConfirm();

  state.totalCount = 0;
  state.charName = '';
  state.history = [];
  state.undoStack = [];

  render();
  save();
}

function updateCharName(value) {
  state.charName = value;
  save();
}

function updatePityLimit(value) {
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 1) return;
  state.pityLimit = num;
  render();
  save();
}

// =============================================
// イベントリスナー
// =============================================

// ボタン
dom.btnPull1.addEventListener('click', () => addPull(1));
dom.btnPull10.addEventListener('click', () => addPull(10));
dom.btnPull11.addEventListener('click', () => addPull(11));
dom.btnGet.addEventListener('click', () => recordGet());
dom.getCountPlus.addEventListener('click', () => {
  getCount++;
  dom.getCountDisplay.textContent = getCount;
});
dom.getCountMinus.addEventListener('click', () => {
  if (getCount > 1) {
    getCount--;
    dom.getCountDisplay.textContent = getCount;
  }
});
dom.btnUndo.addEventListener('click', () => undo());
dom.btnReset.addEventListener('click', () => showResetConfirm());
dom.confirmYes.addEventListener('click', () => resetAll());
dom.confirmNo.addEventListener('click', () => hideResetConfirm());

// キャラクター名 (contenteditable)
dom.charNameInput.addEventListener('input', () => {
  updateCharName(dom.charNameInput.textContent);
});

// Enter で改行させず確定のみ
dom.charNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    dom.charNameInput.blur();
  }
});

// 1連コスト設定
dom.creditInput.addEventListener('change', (e) => {
  const num = parseInt(e.target.value, 10);
  state.creditPerPull = isNaN(num) || num < 0 ? 0 : num;
  render();
  save();
});

// 天井設定
dom.pityInput.addEventListener('change', (e) => {
  updatePityLimit(e.target.value);
});

// 天井 +/- ボタン
document.getElementById('pityPlus1').addEventListener('click', () => {
  updatePityLimit(state.pityLimit + 1);
});
document.getElementById('pityPlus10').addEventListener('click', () => {
  updatePityLimit(state.pityLimit + 10);
});
document.getElementById('pityMinus1').addEventListener('click', () => {
  updatePityLimit(state.pityLimit - 1);
});
document.getElementById('pityMinus10').addEventListener('click', () => {
  updatePityLimit(state.pityLimit - 10);
});

// キーボードショートカット
document.addEventListener('keydown', (e) => {
  // 入力フィールドにフォーカスがある場合はショートカットを無効化
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  switch (e.key) {
    case '1':
      e.preventDefault();
      addPull(1);
      break;
    case '2':
      e.preventDefault();
      addPull(10);
      break;
    case '3':
      e.preventDefault();
      addPull(11);
      break;
    case ' ':
      e.preventDefault();
      recordGet();
      break;
    case 'z':
    case 'Z':
      e.preventDefault();
      undo();
      break;
    case 'r':
    case 'R':
      e.preventDefault();
      showResetConfirm();
      break;
  }
});

// =============================================
// 初期化
// =============================================

function init() {
  load();
  render();
}

init();
