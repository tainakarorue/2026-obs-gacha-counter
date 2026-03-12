# 03 - HTML版 Xポスト機能 JS実装

## 変更ファイル

`js/app.js`

---

## 追加・変更箇所の一覧

| 場所 | 内容 |
|---|---|
| `dom` オブジェクト | `btnTweet` の参照を追加 |
| `render()` 関数内 | 履歴の有無に応じてボタンの `disabled` を制御 |
| 新規関数 `getUrlParams()` | URLパラメータを取得する |
| 新規関数 `buildTweetText()` | セッション全体のサマリーからツイート文を生成する |
| 新規関数 `openTweet()` | Web Intent URLを開く |
| イベントリスナー | `btnTweet` のクリックイベントを追加 |

---

## ツイート内容の仕様

ポストするのは**セッション全体の最終結果のみ**とし、連投は行わない。

### 生成されるツイート例

```
【ブルアカ ガチャ結果】
総回数: 183回 / 天井: 200回

ホシノ ×2 1凸（合計94回）
アビドス ×1 0凸（合計47回）

#ガチャカウンター #ブルアカ #ブルーアーカイブ
```

### 凸数の計算

```
凸数 = 獲得数(count) - 1
```

| 獲得数 | 凸表示 |
|---|---|
| 1 | 0凸 |
| 2 | 1凸 |
| 3 | 2凸 |

---

## 変更後の js/app.js 全文

```javascript
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
  btnTweet:         document.getElementById('btnTweet'),   // ← 追加
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

  // Xポストボタン: 履歴が1件以上あれば有効化   ← 追加
  dom.btnTweet.disabled = state.history.length === 0;

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
  const groups = buildSummaryGroups();

  const summaryItems = Object.entries(groups).map(([name, data]) => {
    const toku = data.count - 1;
    return `
      <div class="summary-item">
        <span class="summary-item-name">${name} <span class="summary-item-count">×${data.count}</span> <span class="summary-item-toku">${toku}凸</span></span>
        <span class="summary-item-pulls">合計${data.totalPulls}回</span>
      </div>
    `;
  }).join('');

  dom.historySummary.innerHTML = `
    <div class="history-summary-title">── 獲得サマリー ──</div>
    ${summaryItems}
  `;
}

/**
 * history を キャラ名でグループ化して返す（サマリー・ツイート共用）
 * @returns {{ [name: string]: { count: number, totalPulls: number } }}
 */
function buildSummaryGroups() {
  const groups = {};
  state.history.forEach(item => {
    const name = item.charName || '(名前未設定)';
    if (!groups[name]) {
      groups[name] = { count: 0, totalPulls: 0 };
    }
    groups[name].count += 1;
    groups[name].totalPulls += item.pullsSinceLast;
  });
  return groups;
}

// =============================================
// アニメーション
// =============================================

function animateCounter() {
  dom.currentStreak.classList.remove('pulse');
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
  if (state.totalCount === 0) return;

  const lastGetTotal = state.history.length > 0
    ? state.history[state.history.length - 1].totalAtGet
    : 0;
  const pullsSinceLast = state.totalCount - lastGetTotal;

  if (pullsSinceLast <= 0) return;

  state.undoStack.push({
    type: 'get',
    totalBefore: state.totalCount,
    getCount: getCount,
  });

  state.history.push({
    id: state.history.length + 1,
    totalAtGet: state.totalCount,
    pullsSinceLast: pullsSinceLast,
    charName: state.charName || '',
  });

  for (let i = 1; i < getCount; i++) {
    state.history.push({
      id: state.history.length + 1,
      totalAtGet: state.totalCount,
      pullsSinceLast: 0,
      charName: state.charName || '',
    });
  }

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
// X (Twitter) ポスト機能
// =============================================

/**
 * URLパラメータを取得する
 * @returns {{ gameName: string, hashtags: string }}
 */
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    gameName: params.get('gameName') || '',
    hashtags: params.get('hashtags') || '',
  };
}

/**
 * セッション全体のサマリーからツイート文を生成する
 * 履歴が空の場合は null を返す
 * @returns {string|null}
 */
function buildTweetText() {
  if (state.history.length === 0) return null;

  const { gameName, hashtags } = getUrlParams();
  const groups = buildSummaryGroups();

  // ヘッダー
  let text = '';
  if (gameName) {
    text += `【${gameName} ガチャ結果】\n`;
  } else {
    text += `【ガチャ結果】\n`;
  }

  // 総回数・天井
  text += `総回数: ${state.totalCount}回 / 天井: ${state.pityLimit}回\n`;

  // キャラごとのサマリー
  text += '\n';
  Object.entries(groups).forEach(([name, data]) => {
    const toku = data.count - 1;
    text += `${name} ×${data.count} ${toku}凸（合計${data.totalPulls}回）\n`;
  });

  // ハッシュタグ
  text += '\n#ガチャカウンター';

  if (gameName) {
    text += ` #${gameName.replace(/\s+/g, '')}`;
  }

  if (hashtags) {
    hashtags.split(',').forEach(tag => {
      const trimmed = tag.trim().replace(/^#/, '');
      if (trimmed) {
        text += ` #${trimmed}`;
      }
    });
  }

  return text;
}

/**
 * Twitter Web Intent URLを生成してウィンドウを開く
 * OBSブラウザソースでは動作しない場合がある
 */
function openTweet() {
  const text = buildTweetText();
  if (!text) return;

  const encoded = encodeURIComponent(text);
  const url = `https://twitter.com/intent/tweet?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer,width=550,height=420');
}

// =============================================
// イベントリスナー
// =============================================

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
dom.btnTweet.addEventListener('click', () => openTweet());   // ← 追加

dom.charNameInput.addEventListener('input', () => {
  updateCharName(dom.charNameInput.textContent);
});

dom.charNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    dom.charNameInput.blur();
  }
});

dom.creditInput.addEventListener('change', (e) => {
  const num = parseInt(e.target.value, 10);
  state.creditPerPull = isNaN(num) || num < 0 ? 0 : num;
  render();
  save();
});

dom.pityInput.addEventListener('change', (e) => {
  updatePityLimit(e.target.value);
});

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

document.addEventListener('keydown', (e) => {
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
```

---

## 変更点まとめ

### `buildSummaryGroups()` を独立関数に切り出し

`renderSummary()` と `buildTweetText()` の両方から呼べるよう共通化した。

### `renderSummary()` に凸数表示を追加

```javascript
const toku = data.count - 1;
// 例: ×2 → 1凸、×1 → 0凸
```

### `buildTweetText()` はセッション全体を1回だけポスト

- 最新1件ではなく `buildSummaryGroups()` の全キャラを列挙
- 連投にならない設計
