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
  historyList:      document.getElementById('historyList'),
  pityInput:        document.getElementById('pityInput'),
  btnPull1:         document.getElementById('btnPull1'),
  btnPull10:        document.getElementById('btnPull10'),
  btnPull11:        document.getElementById('btnPull11'),
  btnGet:           document.getElementById('btnGet'),
  btnUndo:          document.getElementById('btnUndo'),
  btnReset:         document.getElementById('btnReset'),
  charNameInput:    document.getElementById('charNameInput'),
  confirmOverlay:   document.getElementById('confirmOverlay'),
  confirmYes:       document.getElementById('confirmYes'),
  confirmNo:        document.getElementById('confirmNo'),
  container:        document.querySelector('.container'),
  pityCounter:      document.querySelector('.pity-counter'),
};

// --- 状態 ---
let state = {
  totalCount: 0,
  pityLimit: 200,
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
    return;
  }

  dom.historyList.innerHTML = state.history.map((item, index) => {
    const isLast = index === state.history.length - 1;
    return `
      <div class="history-item${isLast ? ' flash' : ''}" data-index="${index}">
        <span class="history-item-id">${item.id}体目</span>
        <span class="history-item-total">${item.pullsSinceLast}回</span>
        <span class="history-item-diff">(累計${item.totalAtGet}回目)</span>
      </div>
    `;
  }).join('');

  // 最新の履歴が見えるようにスクロール
  dom.historyList.scrollTop = dom.historyList.scrollHeight;
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

  // Undo用に保存
  state.undoStack.push({
    type: 'get',
    totalBefore: state.totalCount,
  });

  state.history.push({
    id: state.history.length + 1,
    totalAtGet: state.totalCount,
    pullsSinceLast: pullsSinceLast,
  });

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
    state.history.pop();
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

// 天井設定
dom.pityInput.addEventListener('change', (e) => {
  updatePityLimit(e.target.value);
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
