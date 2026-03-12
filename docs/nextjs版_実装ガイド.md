# ガチャカウンター Next.js版 実装ガイド

> 勉強用の実装手順書。コードは省略なし。要件定義書 (`nextjs版_要件定義書.md`) と合わせて参照すること。

---

## 目次

1. [プロジェクトセットアップ](#1-プロジェクトセットアップ)
2. [型定義](#2-型定義)
3. [Zustand Store](#3-zustand-store)
4. [グローバルCSS・レイアウト](#4-グローバルcssレイアウト)
5. [コンポーネント実装](#5-コンポーネント実装)
   - [gacha-counter.tsx](#51-gacha-countertsx--全体コンテナ)
   - [char-name-input.tsx](#52-char-name-inputtsx--キャラ名入力)
   - [main-display.tsx](#53-main-displaytsx--メインカウンター表示)
   - [history-list.tsx](#54-history-listtsx--獲得履歴リスト)
   - [history-summary.tsx](#55-history-summarytsx--獲得サマリー)
   - [control-buttons.tsx](#56-control-buttonstsx--操作ボタン群)
   - [pity-settings.tsx](#57-pity-settingstsx--天井設定)
   - [shortcut-guide.tsx](#58-shortcut-guidetsx--ショートカット説明)
   - [reset-dialog.tsx](#59-reset-dialogtsx--リセット確認ダイアログ)
6. [カスタムフック](#6-カスタムフック)
7. [next.config.ts](#7-nextconfigts)
8. [実装上の注意点](#8-実装上の注意点)

---

## 1. プロジェクトセットアップ

### 1.1 プロジェクト作成

```bash
npx create-next-app@latest gacha-counter-next \
  --typescript --tailwind --eslint --app --src-dir \
  --no-turbopack --import-alias "@/*"

cd gacha-counter-next
```

`create-next-app` の選択肢が対話形式で出る場合は、以下を選ぶ。

| 質問 | 選択 |
|------|------|
| TypeScript | Yes |
| ESLint | Yes |
| Tailwind CSS | Yes |
| `src/` directory | Yes |
| App Router | Yes |
| Turbopack | No |
| import alias | `@/*` |

### 1.2 shadcn/ui 初期化

```bash
npx shadcn@latest init
```

対話形式で聞かれる。基本は全てデフォルト(Enter)でOK。

```bash
# 必要なコンポーネントを追加
npx shadcn@latest add button input alert-dialog scroll-area
```

### 1.3 追加パッケージのインストール

```bash
npm install zustand framer-motion
```

### 1.4 最終的なディレクトリ構成

```
gacha-counter-next/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                    ← shadcn/ui が自動生成
│   │   ├── gacha-counter.tsx
│   │   ├── char-name-input.tsx
│   │   ├── main-display.tsx
│   │   ├── history-list.tsx
│   │   ├── history-summary.tsx
│   │   ├── control-buttons.tsx
│   │   ├── pity-settings.tsx
│   │   ├── shortcut-guide.tsx
│   │   └── reset-dialog.tsx
│   ├── stores/
│   │   └── gacha-store.ts
│   ├── hooks/
│   │   └── use-keyboard-shortcuts.ts
│   ├── lib/
│   │   └── utils.ts               ← shadcn/ui が自動生成
│   └── types/
│       └── gacha.ts
├── components.json                ← shadcn/ui 設定
├── tailwind.config.ts             ← Tailwind v3 の場合のみ存在
├── tsconfig.json
├── next.config.ts
└── package.json
```

> **Tailwind v4 について**
> `create-next-app` が Tailwind v4 を選択した場合、`tailwind.config.ts` は生成されない。
> CSS の書き方が `@import "tailwindcss"` に変わる (後述)。

---

## 2. 型定義

**ファイル: `src/types/gacha.ts`**

```typescript
// --- 獲得履歴 1件 ---
export type HistoryEntry = {
  id: number;             // 獲得番号 (1体目から通し番号)
  totalAtGet: number;     // 獲得時の累計ガチャ回数
  pullsSinceLast: number; // 前回獲得からの回数 (複数同時獲得の2体目以降は 0)
  charName: string;       // キャラクター名 (空文字可)
};

// --- Undo スタックに積む操作の型 ---
// discriminated union でどちらの操作かを判別する
export type UndoAction =
  | { type: 'pull'; amount: number; totalBefore: number }
  | { type: 'get'; totalBefore: number; getCount: number };

// --- アプリケーション全体の状態 ---
export type GachaState = {
  totalCount: number;      // 累計ガチャ回数
  pityLimit: number;       // 天井回数 (デフォルト: 200)
  creditPerPull: number;   // 1連あたりのコスト (0 で非表示)
  charName: string;        // 現在のキャラクター名 (入力欄の値)
  history: HistoryEntry[]; // 獲得履歴
  undoStack: UndoAction[]; // Undo 用スタック
};

// --- Zustand Store のアクション ---
export type GachaActions = {
  addPull: (amount: number) => void;
  recordGet: (count?: number) => void;
  undo: () => void;
  resetAll: () => void;
  setCharName: (name: string) => void;
  setPityLimit: (limit: number) => void;
  setCreditPerPull: (cost: number) => void;
};

// Store 全体の型 (状態 + アクション)
export type GachaStore = GachaState & GachaActions;
```

---

## 3. Zustand Store

**ファイル: `src/stores/gacha-store.ts`**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GachaStore, HistoryEntry } from '@/types/gacha';

// =============================================
// Store 本体
// =============================================

export const useGachaStore = create<GachaStore>()(
  // persist ミドルウェアで localStorage に自動保存
  persist(
    (set, get) => ({
      // --- 初期状態 ---
      totalCount: 0,
      pityLimit: 200,
      creditPerPull: 0,
      charName: '',
      history: [],
      undoStack: [],

      // --- アクション ---

      // ガチャを amount 回引く
      addPull: (amount) => {
        set((state) => ({
          undoStack: [
            ...state.undoStack,
            { type: 'pull', amount, totalBefore: state.totalCount },
          ],
          totalCount: state.totalCount + amount,
        }));
      },

      // キャラを count 体獲得記録する (デフォルト 1体)
      recordGet: (count = 1) => {
        const state = get();

        // 総回数が0のときは記録しない
        if (state.totalCount === 0) return;

        // 前回獲得からの回数を計算
        const lastGetTotal =
          state.history.length > 0
            ? state.history[state.history.length - 1].totalAtGet
            : 0;
        const pullsSinceLast = state.totalCount - lastGetTotal;

        // 前回獲得からカウントが進んでいない場合は記録しない
        if (pullsSinceLast <= 0) return;

        // 追加する履歴エントリを組み立てる
        const newEntries: HistoryEntry[] = [];
        const baseId = state.history.length + 1;

        // 1体目: 前回からの回数を記録
        newEntries.push({
          id: baseId,
          totalAtGet: state.totalCount,
          pullsSinceLast,
          charName: state.charName,
        });

        // 2体目以降: 同じ totalAtGet で pullsSinceLast は 0
        for (let i = 1; i < count; i++) {
          newEntries.push({
            id: baseId + i,
            totalAtGet: state.totalCount,
            pullsSinceLast: 0,
            charName: state.charName,
          });
        }

        set((state) => ({
          undoStack: [
            ...state.undoStack,
            { type: 'get', totalBefore: state.totalCount, getCount: count },
          ],
          history: [...state.history, ...newEntries],
        }));
      },

      // 直前の操作を1回取り消す
      undo: () => {
        const state = get();
        if (state.undoStack.length === 0) return;

        const lastAction = state.undoStack[state.undoStack.length - 1];
        const newUndoStack = state.undoStack.slice(0, -1);

        if (lastAction.type === 'pull') {
          set({
            undoStack: newUndoStack,
            totalCount: lastAction.totalBefore,
          });
        } else if (lastAction.type === 'get') {
          const count = lastAction.getCount || 1;
          // 末尾から count 件削除し、id を振り直す
          const newHistory = state.history
            .slice(0, -count)
            .map((item, index) => ({ ...item, id: index + 1 }));
          set({
            undoStack: newUndoStack,
            history: newHistory,
          });
        }
      },

      // 全データを初期化
      resetAll: () => {
        set({
          totalCount: 0,
          charName: '',
          history: [],
          undoStack: [],
          // pityLimit と creditPerPull はリセット対象外
        });
      },

      setCharName: (name) => set({ charName: name }),

      setPityLimit: (limit) => {
        if (isNaN(limit) || limit < 1) return;
        set({ pityLimit: limit });
      },

      setCreditPerPull: (cost) => {
        set({ creditPerPull: isNaN(cost) || cost < 0 ? 0 : cost });
      },
    }),
    {
      name: 'gacha-counter-store', // localStorage のキー名
    }
  )
);

// =============================================
// 派生値を計算するセレクター関数
// (Store の外に置くことでコンポーネントから呼びやすくする)
// =============================================

/** 前回獲得からの連続回数 */
export function getSinceLastGet(
  history: GachaStore['history'],
  totalCount: number
): number {
  const lastGetTotal =
    history.length > 0 ? history[history.length - 1].totalAtGet : 0;
  return totalCount - lastGetTotal;
}

/** 天井までの残り回数 */
export function getPityRemain(sinceLastGet: number, pityLimit: number): number {
  return Math.max(0, pityLimit - sinceLastGet);
}

/** 消費クレジット合計 */
export function getTotalCredit(totalCount: number, creditPerPull: number): number {
  return totalCount * creditPerPull;
}

/** 天井が近い (残り20%以下) かどうか */
export function getIsPityNear(pityRemain: number, pityLimit: number): boolean {
  return pityRemain <= pityLimit * 0.2 && pityRemain > 0;
}

/** 獲得サマリー (キャラ名ごとにグループ化) */
export function getSummaryGroups(history: GachaStore['history']) {
  const groups: Record<string, { count: number; totalPulls: number }> = {};

  history.forEach((item) => {
    const name = item.charName || '(名前未設定)';
    if (!groups[name]) {
      groups[name] = { count: 0, totalPulls: 0 };
    }
    groups[name].count += 1;
    groups[name].totalPulls += item.pullsSinceLast;
  });

  return Object.entries(groups).map(([name, data]) => ({
    name,
    count: data.count,
    totalPulls: data.totalPulls,
  }));
}
```

---

## 4. グローバルCSS・レイアウト

### 4.1 globals.css

**ファイル: `src/app/globals.css`**

> Tailwind v3 と v4 でインポート方法が違うので注意。

**Tailwind v3 の場合:**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* OBS 透明背景 */
body {
  background: transparent;
}

/* カウントパルスアニメーション */
@keyframes counterPulse {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.15); color: #70cfff; }
  100% { transform: scale(1); }
}
```

**Tailwind v4 の場合:**

```css
@import "tailwindcss";

/* OBS 透明背景 */
@layer base {
  body {
    background: transparent;
  }
}
```

> アニメーションは後述の Framer Motion で実装するため、`@keyframes` の CSS 定義は不要。

### 4.2 layout.tsx

**ファイル: `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Noto_Sans_JP } from 'next/font/google';
import './globals.css';

// Noto Sans JP を Google Fonts から読み込む
const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ガチャカウンター',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={notoSansJP.className}>{children}</body>
    </html>
  );
}
```

### 4.3 page.tsx

**ファイル: `src/app/page.tsx`**

```tsx
'use client';

import GachaCounter from '@/components/gacha-counter';

export default function Home() {
  return (
    <main className="flex min-h-screen justify-center items-start p-3">
      <GachaCounter />
    </main>
  );
}
```

---

## 5. コンポーネント実装

### 5.1 `gacha-counter.tsx` — 全体コンテナ

**ファイル: `src/components/gacha-counter.tsx`**

責務:
- 全コンポーネントをレイアウトに並べる
- カウントパルスのトリガーキー (`pulseKey`) を管理
- 獲得エフェクトのフラグ (`flashLatest`, `glowEffect`) を管理
- キーボードショートカットフックを呼び出す
- リセットダイアログの開閉状態を管理

```tsx
'use client';

import { useState, useCallback } from 'react';
import { useGachaStore } from '@/stores/gacha-store';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import CharNameInput from './char-name-input';
import MainDisplay from './main-display';
import HistoryList from './history-list';
import HistorySummary from './history-summary';
import ControlButtons from './control-buttons';
import PitySettings from './pity-settings';
import ShortcutGuide from './shortcut-guide';
import ResetDialog from './reset-dialog';

export default function GachaCounter() {
  const { addPull, recordGet, undo } = useGachaStore();

  // リセットダイアログの開閉
  const [showReset, setShowReset] = useState(false);

  // カウントパルスアニメーションのトリガー
  // キーを変えるたびに Framer Motion がアニメーションを再実行する
  const [pulseKey, setPulseKey] = useState(0);

  // 獲得エフェクト (最新履歴の点滅 + コンテナのグロー)
  const [flashLatest, setFlashLatest] = useState(false);
  const [glowEffect, setGlowEffect] = useState(false);

  // ガチャを引く (パルスアニメーションも発火)
  const handleAddPull = useCallback(
    (amount: number) => {
      addPull(amount);
      setPulseKey((k) => k + 1);
    },
    [addPull]
  );

  // 獲得記録 (エフェクトも発火)
  const handleRecordGet = useCallback(
    (count?: number) => {
      recordGet(count);
      setFlashLatest(true);
      setGlowEffect(true);
      setTimeout(() => setFlashLatest(false), 700);
      setTimeout(() => setGlowEffect(false), 700);
    },
    [recordGet]
  );

  // キーボードショートカット登録
  useKeyboardShortcuts({
    onPull1: () => handleAddPull(1),
    onPull10: () => handleAddPull(10),
    onPull11: () => handleAddPull(11),
    onGet: () => handleRecordGet(),
    onUndo: () => undo(),
    onReset: () => setShowReset(true),
  });

  return (
    <div
      className="relative w-[380px] rounded-[12px] p-[20px_24px]"
      style={{
        background: 'rgba(15, 15, 25, 0.95)',
        border: '1px solid rgba(100, 120, 255, 0.3)',
        // グロー状態で box-shadow を切り替える
        boxShadow: glowEffect
          ? '0 0 40px rgba(255, 200, 60, 0.5), 0 0 80px rgba(255, 180, 40, 0.2)'
          : '0 0 20px rgba(80, 100, 255, 0.15)',
        transition: 'box-shadow 0.6s ease',
      }}
    >
      {/* タイトルエリア */}
      <div className="text-center mb-4 border-b border-[rgba(100,120,255,0.25)] pb-2.5">
        <CharNameInput />
        <p className="text-[12px] text-[#8890aa] tracking-[0.15em]">ガチャカウンター</p>
      </div>

      {/* メイン表示 */}
      <MainDisplay pulseKey={pulseKey} />

      {/* 獲得履歴 */}
      <div className="mb-4 border-t border-[rgba(100,120,255,0.15)] pt-3">
        <p className="text-[14px] font-semibold text-[#b0b8d0] mb-2 text-center tracking-[0.1em]">
          ── 獲得履歴 ──
        </p>
        <HistoryList flashLatest={flashLatest} />
        <HistorySummary />
      </div>

      {/* 操作ボタン */}
      <ControlButtons
        onPull={handleAddPull}
        onGet={handleRecordGet}
        onUndo={() => undo()}
        onShowReset={() => setShowReset(true)}
      />

      {/* 天井設定 */}
      <PitySettings />

      {/* ショートカット説明 */}
      <ShortcutGuide />

      {/* リセット確認ダイアログ */}
      <ResetDialog open={showReset} onClose={() => setShowReset(false)} />
    </div>
  );
}
```

---

### 5.2 `char-name-input.tsx` — キャラ名入力

**ファイル: `src/components/char-name-input.tsx`**

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { useGachaStore } from '@/stores/gacha-store';

export default function CharNameInput() {
  const { charName, setCharName } = useGachaStore();

  return (
    <Input
      value={charName}
      onChange={(e) => setCharName(e.target.value)}
      placeholder="キャラクター名を入力"
      className="
        w-full bg-transparent
        border-[rgba(100,120,255,0.2)]
        text-white text-[18px] font-bold text-center
        placeholder:text-[#667088] placeholder:font-normal
        tracking-[0.08em] mb-1
        focus-visible:ring-0 focus-visible:border-[rgba(100,140,255,0.5)]
        rounded-md px-2.5 py-1.5
      "
    />
  );
}
```

---

### 5.3 `main-display.tsx` — メインカウンター表示

**ファイル: `src/components/main-display.tsx`**

```tsx
'use client';

import { motion } from 'framer-motion';
import {
  useGachaStore,
  getSinceLastGet,
  getPityRemain,
  getTotalCredit,
  getIsPityNear,
} from '@/stores/gacha-store';

type Props = {
  pulseKey: number; // 親から渡されるパルスのトリガー
};

export default function MainDisplay({ pulseKey }: Props) {
  const { totalCount, pityLimit, creditPerPull, history, setCreditPerPull } =
    useGachaStore();

  // 派生値を計算
  const sinceLastGet = getSinceLastGet(history, totalCount);
  const pityRemain = getPityRemain(sinceLastGet, pityLimit);
  const totalCredit = getTotalCredit(totalCount, creditPerPull);
  const isPityNear = getIsPityNear(pityRemain, pityLimit);

  return (
    <div className="text-center mb-4">
      {/* メインカウンター: 前回獲得からの連続回数 */}
      <div className="flex items-baseline justify-center gap-2 mb-3">
        <span className="text-[16px] text-[#b0b8d0]">現在</span>

        {/*
          pulseKey が変わるたびにアニメーションが再実行される。
          key を変えると React がコンポーネントを再マウントするため、
          animate の初期値から再アニメーションが始まる。
        */}
        <motion.span
          key={pulseKey}
          className="text-[56px] font-extrabold text-white leading-none"
          style={{ textShadow: '0 0 12px rgba(100, 140, 255, 0.6)' }}
          initial={{ scale: 1 }}
          animate={pulseKey > 0 ? { scale: [1, 1.15, 1] } : {}}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          {sinceLastGet}
        </motion.span>

        <span className="text-[18px] text-[#b0b8d0]">回</span>
      </div>

      {/* サブカウンター */}
      <div className="flex flex-col gap-1">
        {/* 総回数 + 1連コスト入力 */}
        <div className="flex items-baseline justify-center gap-1 text-[14px]">
          <span className="text-[#b0b8d0]">総回数</span>
          <span className="text-[20px] font-bold text-[#70cfff]">{totalCount}</span>
          <span className="text-[13px] text-[#98a0b8]">回</span>
          <span className="text-[#b0b8d0] ml-1">× 1連</span>
          <input
            type="number"
            value={creditPerPull || ''}
            onChange={(e) =>
              setCreditPerPull(parseInt(e.target.value, 10) || 0)
            }
            placeholder="0"
            className="
              w-14 px-1 py-0.5 text-center text-[13px]
              bg-[rgba(255,255,255,0.08)]
              border border-[rgba(100,120,255,0.25)] rounded
              text-[#e0e0e0]
              focus:outline-none focus:border-[rgba(100,140,255,0.5)]
              [appearance:textfield]
              [&::-webkit-outer-spin-button]:appearance-none
              [&::-webkit-inner-spin-button]:appearance-none
            "
          />
        </div>

        {/* 消費クレジット (creditPerPull > 0 の場合のみ表示) */}
        {creditPerPull > 0 && (
          <div className="flex items-baseline justify-center gap-1 text-[14px]">
            <span className="text-[#b0b8d0]">消費</span>
            <span className="text-[20px] font-bold text-[#ff90d0]">
              {totalCredit.toLocaleString()}
            </span>
          </div>
        )}

        {/* 天井カウンター */}
        <div className="flex items-baseline justify-center gap-1 text-[14px]">
          <span className="text-[#b0b8d0]">天井まで</span>
          <span
            className={`text-[20px] font-bold ${
              isPityNear ? 'text-[#ff6060]' : 'text-[#ffb060]'
            }`}
            style={
              isPityNear ? { textShadow: '0 0 8px rgba(255, 80, 80, 0.5)' } : {}
            }
          >
            {pityRemain}
          </span>
          <span className="text-[13px] text-[#98a0b8]">回 / {pityLimit}回</span>
        </div>
      </div>
    </div>
  );
}
```

---

### 5.4 `history-list.tsx` — 獲得履歴リスト

**ファイル: `src/components/history-list.tsx`**

```tsx
'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGachaStore } from '@/stores/gacha-store';

type Props = {
  flashLatest: boolean; // 最新履歴を点滅させるフラグ
};

export default function HistoryList({ flashLatest }: Props) {
  const { history } = useGachaStore();
  const listRef = useRef<HTMLDivElement>(null);

  // 履歴が増えるたびに最下部にスクロール
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [history.length]);

  if (history.length === 0) {
    return (
      <p className="text-center text-[#555] text-[13px] py-2">
        まだ獲得記録がありません
      </p>
    );
  }

  return (
    /*
      ScrollArea (shadcn/ui) を使う場合は ref の渡し方が異なる。
      シンプルに div + overflow-y-auto で実装する。
    */
    <div
      ref={listRef}
      className="max-h-[120px] overflow-y-auto flex flex-col gap-1
        [&::-webkit-scrollbar]:w-1
        [&::-webkit-scrollbar-track]:bg-[rgba(255,255,255,0.05)] [&::-webkit-scrollbar-track]:rounded
        [&::-webkit-scrollbar-thumb]:bg-[rgba(100,120,255,0.3)] [&::-webkit-scrollbar-thumb]:rounded
      "
    >
      {history.map((item, index) => {
        const isLatest = index === history.length - 1;
        const label = item.charName ? item.charName : `${item.id}体目`;

        return (
          <motion.div
            key={item.id}
            className="flex justify-between items-center px-2.5 py-1 rounded-md text-[13px]"
            style={{ background: 'rgba(255, 255, 255, 0.04)' }}
            /*
              flashLatest かつ最新エントリのときだけアニメーション。
              animate プロパティは毎レンダーで評価されるため、
              flashLatest が false になればアニメーションは実行されない。
            */
            animate={
              flashLatest && isLatest
                ? {
                    backgroundColor: [
                      'rgba(255, 200, 60, 0.5)',
                      'rgba(255, 255, 255, 0.04)',
                    ],
                    scale: [1.03, 1],
                  }
                : {}
            }
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <span className="text-[#a0b0ff] font-bold min-w-[48px]">{label}</span>
            <span className="text-[#e0e0e0] font-semibold">{item.pullsSinceLast}回</span>
            <span className="text-[#98a0b8] text-[12px]">(累計{item.totalAtGet}回目)</span>
          </motion.div>
        );
      })}
    </div>
  );
}
```

---

### 5.5 `history-summary.tsx` — 獲得サマリー

**ファイル: `src/components/history-summary.tsx`**

```tsx
'use client';

import { useGachaStore, getSummaryGroups } from '@/stores/gacha-store';

export default function HistorySummary() {
  const { history } = useGachaStore();
  const groups = getSummaryGroups(history);

  // 履歴がなければ何も表示しない
  if (groups.length === 0) return null;

  return (
    <div
      className="mt-2.5 px-3 py-2 rounded-md"
      style={{
        background: 'rgba(100, 120, 255, 0.08)',
        border: '1px solid rgba(100, 120, 255, 0.15)',
      }}
    >
      <p className="text-[12px] text-[#8890aa] text-center mb-1.5 tracking-[0.1em]">
        ── 獲得サマリー ──
      </p>
      {groups.map((group) => (
        <div
          key={group.name}
          className="flex justify-between items-center px-1 py-0.5 text-[13px]"
        >
          <span className="text-[#a0b0ff] font-semibold">
            {group.name}{' '}
            <span className="text-[#70cfff] font-bold">×{group.count}</span>
          </span>
          <span className="text-[#98a0b8] text-[12px]">合計{group.totalPulls}回</span>
        </div>
      ))}
    </div>
  );
}
```

---

### 5.6 `control-buttons.tsx` — 操作ボタン群

**ファイル: `src/components/control-buttons.tsx`**

```tsx
'use client';

import { useState } from 'react';

type Props = {
  onPull: (amount: number) => void;
  onGet: (count?: number) => void;
  onUndo: () => void;
  onShowReset: () => void;
};

export default function ControlButtons({
  onPull,
  onGet,
  onUndo,
  onShowReset,
}: Props) {
  // 獲得数 (UIのみ管理。Store には保存しない)
  const [getCount, setGetCount] = useState(1);

  const handleGet = () => {
    onGet(getCount);
    setGetCount(1); // 獲得後は1体にリセット
  };

  return (
    <div className="border-t border-[rgba(100,120,255,0.15)] pt-3 mb-2.5">
      {/* ガチャボタン行 */}
      <div className="flex justify-center gap-1.5 mb-3.5">
        {[
          { label: '+1', amount: 1 },
          { label: '+10', amount: 10 },
          { label: '+11', amount: 11 },
        ].map(({ label, amount }) => (
          <button
            key={amount}
            onClick={() => onPull(amount)}
            className="
              flex-1 py-2 px-3.5 rounded-lg text-[14px] font-bold
              cursor-pointer transition-all duration-100
              hover:brightness-125 hover:-translate-y-px
              active:translate-y-px active:scale-[0.97]
            "
            style={{ background: '#3050a0', color: '#e0e8ff' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 獲得ボタン + 獲得数調整 (- / 獲得！ / +) */}
      <div className="flex justify-center gap-1.5 mb-3.5">
        <button
          onClick={() => setGetCount((c) => Math.max(1, c - 1))}
          className="
            py-2 px-2.5 rounded-md text-[16px] font-bold
            cursor-pointer transition-all duration-150
            hover:brightness-110 active:scale-95
          "
          style={{
            background: 'rgba(212, 160, 32, 0.2)',
            color: '#d4a020',
            minWidth: '32px',
          }}
        >
          −
        </button>

        <button
          onClick={handleGet}
          className="
            flex-1 py-2 px-3.5 rounded-lg text-[14px] font-bold
            cursor-pointer transition-all duration-100
            hover:brightness-125 hover:-translate-y-px
            active:translate-y-px active:scale-[0.97]
          "
          style={{ background: '#d4a020', color: '#1a1a10' }}
        >
          {getCount === 1 ? '獲得！' : `${getCount}体獲得！`}
        </button>

        <button
          onClick={() => setGetCount((c) => c + 1)}
          className="
            py-2 px-2.5 rounded-md text-[16px] font-bold
            cursor-pointer transition-all duration-150
            hover:brightness-110 active:scale-95
          "
          style={{
            background: 'rgba(212, 160, 32, 0.2)',
            color: '#d4a020',
            minWidth: '32px',
          }}
        >
          ＋
        </button>
      </div>

      {/* 戻す / リセットボタン */}
      <div className="flex justify-center gap-1.5">
        <button
          onClick={onUndo}
          className="
            flex-1 py-1.5 px-5 rounded-lg text-[14px] font-bold
            cursor-pointer transition-all duration-100
            hover:brightness-125 hover:-translate-y-px
            active:translate-y-px active:scale-[0.97]
          "
          style={{ background: '#404858', color: '#b0b8cc' }}
        >
          戻す
        </button>

        <button
          onClick={onShowReset}
          className="
            flex-1 py-1.5 px-5 rounded-lg text-[12px] font-bold
            cursor-pointer transition-all duration-100
            hover:brightness-125 hover:-translate-y-px
            active:translate-y-px active:scale-[0.97]
          "
          style={{ background: '#802030', color: '#ffc0c0' }}
        >
          リセット
        </button>
      </div>
    </div>
  );
}
```

---

### 5.7 `pity-settings.tsx` — 天井設定

**ファイル: `src/components/pity-settings.tsx`**

```tsx
'use client';

import { useGachaStore } from '@/stores/gacha-store';

export default function PitySettings() {
  const { pityLimit, setPityLimit } = useGachaStore();

  // 共通ボタンスタイル
  const adjustButtonStyle = {
    background: 'rgba(100, 120, 255, 0.15)',
    color: '#b0b8d0',
    minWidth: '36px',
  } as const;

  return (
    <div className="flex items-center justify-center gap-1.5 mt-1">
      <span className="text-[13px] text-[#b0b8d0]">天井:</span>

      {/* -10 / -1 ボタン */}
      {[-10, -1].map((delta) => (
        <button
          key={delta}
          onClick={() => setPityLimit(pityLimit + delta)}
          className="
            py-1.5 px-2.5 rounded-md text-[13px] font-bold
            cursor-pointer transition-all duration-150
            hover:brightness-110 active:scale-95
          "
          style={adjustButtonStyle}
        >
          {delta}
        </button>
      ))}

      {/* 直接入力 */}
      <input
        type="number"
        value={pityLimit}
        onChange={(e) => setPityLimit(parseInt(e.target.value, 10))}
        className="
          w-[70px] py-1 px-2 text-center text-[14px]
          bg-[rgba(255,255,255,0.08)]
          border border-[rgba(100,120,255,0.3)] rounded-md
          text-[#e0e0e0]
          focus:outline-none focus:border-[rgba(100,140,255,0.6)]
          [appearance:textfield]
          [&::-webkit-outer-spin-button]:appearance-none
          [&::-webkit-inner-spin-button]:appearance-none
        "
      />

      {/* +1 / +10 ボタン */}
      {[1, 10].map((delta) => (
        <button
          key={delta}
          onClick={() => setPityLimit(pityLimit + delta)}
          className="
            py-1.5 px-2.5 rounded-md text-[13px] font-bold
            cursor-pointer transition-all duration-150
            hover:brightness-110 active:scale-95
          "
          style={adjustButtonStyle}
        >
          +{delta}
        </button>
      ))}

      <span className="text-[13px] text-[#98a0b8]">回</span>
    </div>
  );
}
```

---

### 5.8 `shortcut-guide.tsx` — ショートカット説明

**ファイル: `src/components/shortcut-guide.tsx`**

```tsx
export default function ShortcutGuide() {
  const shortcuts = [
    '1:+1',
    '2:+10',
    '3:+11',
    'Space:獲得',
    'Z:戻す',
    'R:リセット',
  ];

  return (
    <div className="flex flex-wrap justify-center gap-[6px_12px] pt-2 border-t border-[rgba(100,120,255,0.1)] mt-2">
      {shortcuts.map((sc) => (
        <span key={sc} className="text-[11px] text-[#8890a8] tracking-[0.03em]">
          {sc}
        </span>
      ))}
    </div>
  );
}
```

---

### 5.9 `reset-dialog.tsx` — リセット確認ダイアログ

**ファイル: `src/components/reset-dialog.tsx`**

```tsx
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useGachaStore } from '@/stores/gacha-store';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ResetDialog({ open, onClose }: Props) {
  const { resetAll } = useGachaStore();

  const handleConfirm = () => {
    resetAll();
    onClose();
  };

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <AlertDialogContent
        className="border-[rgba(255,80,80,0.4)] text-[#e0e0e0]"
        style={{ background: 'rgba(30, 30, 50, 0.95)' }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[#e0e0e0]">
            リセットしますか？
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[#98a0b8]">
            全カウント・履歴が削除されます。この操作は元に戻せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onClose}
            className="bg-[#404858] text-[#b0b8cc] border-transparent hover:bg-[#505868]"
          >
            キャンセル
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-[#802030] text-[#ffc0c0] hover:bg-[#a03040]"
          >
            リセット
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

---

## 6. カスタムフック

**ファイル: `src/hooks/use-keyboard-shortcuts.ts`**

```typescript
import { useEffect, useRef } from 'react';

type KeyboardShortcutHandlers = {
  onPull1: () => void;
  onPull10: () => void;
  onPull11: () => void;
  onGet: () => void;
  onUndo: () => void;
  onReset: () => void;
};

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  /*
    handlers オブジェクトは毎レンダーで新しく作られる。
    useEffect の依存配列に handlers を入れると毎回 cleanup → re-register が走る。
    useRef でラップして「最新の handlers を参照するが、依存配列は空」にする。
  */
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // 入力フィールドにフォーカスがある場合はショートカットを無効化
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case '1':
          e.preventDefault();
          handlersRef.current.onPull1();
          break;
        case '2':
          e.preventDefault();
          handlersRef.current.onPull10();
          break;
        case '3':
          e.preventDefault();
          handlersRef.current.onPull11();
          break;
        case ' ':
          e.preventDefault();
          handlersRef.current.onGet();
          break;
        case 'z':
        case 'Z':
          e.preventDefault();
          handlersRef.current.onUndo();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handlersRef.current.onReset();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // クリーンアップ: コンポーネントがアンマウントされたらリスナーを削除
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []); // 空配列: マウント時1回だけ登録
}
```

---

## 7. next.config.ts

**ファイル: `next.config.ts`** (プロジェクトルート)

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /*
    output: 'export' で npm run build 時に静的HTML (out/ フォルダ) を生成する。
    OBS のブラウザソース「ローカルファイル」に out/index.html を指定して使う。
  */
  output: 'export',
};

export default nextConfig;
```

---

## 8. 実装上の注意点

### 8.1 Framer Motion の `key` によるアニメーション再実行

`pulseKey` を使ったカウントパルスのポイント:

```tsx
// key が変わると React がコンポーネントを再マウントする
// → Framer Motion の initial → animate が最初から実行される
<motion.span
  key={pulseKey}          // ← ここが重要
  initial={{ scale: 1 }}
  animate={{ scale: [1, 1.15, 1] }}
  transition={{ duration: 0.3 }}
>
  {sinceLastGet}
</motion.span>
```

ガチャを引くたびに `setPulseKey((k) => k + 1)` で key を変えることで、同じ数字でも毎回アニメーションを再実行できる。

---

### 8.2 `useKeyboardShortcuts` の `useRef` パターン

handlers を毎回 useEffect の依存配列に入れると、レンダーのたびにリスナーの付け外しが起きる:

```typescript
// NG: handlers が毎レンダーで新オブジェクトなので無限ループに近い挙動になる
useEffect(() => {
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [handlers]); // ← handlers が変わるたびに実行される

// OK: useRef で包んで最新値を参照する
const handlersRef = useRef(handlers);
handlersRef.current = handlers; // 毎レンダーで最新値を代入

useEffect(() => {
  const fn = (e: KeyboardEvent) => handlersRef.current.onPull1(); // refを通して参照
  document.addEventListener('keydown', fn);
  return () => document.removeEventListener('keydown', fn);
}, []); // 空配列で1回だけ登録
```

---

### 8.3 `output: 'export'` の制限

`next.config.ts` で `output: 'export'` を設定すると、一部の Next.js 機能が使えなくなる:

| 使えなくなるもの | 理由 |
|-----------------|------|
| API Routes | サーバーサイドが不要 |
| Server Components での動的データ取得 | 静的HTML生成のため |
| `next/image` の最適化 | ビルド後に画像変換サーバーがない |

このプロジェクトは全て Client Components + localStorage で完結するため問題なし。

---

### 8.4 OBS での動作確認手順

```bash
# ビルド (out/ フォルダが生成される)
npm run build

# OBS の設定
# 1. ソース追加 → ブラウザ
# 2. 「ローカルファイル」にチェック
# 3. out/index.html を指定
# 4. 幅: 400 / 高さ: 600 を推奨
```

> **注:** OBS の localStorage と通常ブラウザの localStorage は共有されない。
> OBS で操作するか、開発サーバー (`npm run dev`) で操作するかどちらかに統一すること。

---

### 8.5 shadcn/ui コンポーネントのスタイル上書き

shadcn/ui のコンポーネントはデフォルトでライトテーマ想定のスタイルが当たっている。
ダークテーマに合わせるには `className` で直接上書きするか、`components.json` のテーマ設定を変更する。

```tsx
// className で上書きする例 (AlertDialog のボタン)
<AlertDialogCancel
  className="bg-[#404858] text-[#b0b8cc] border-transparent hover:bg-[#505868]"
>
  キャンセル
</AlertDialogCancel>
```

---

### 8.6 Zustand `persist` の初回読み込みとハイドレーション

`persist` ミドルウェアは localStorage からの復元をクライアントサイドで行う。
SSR (サーバーサイドレンダリング) と組み合わせると、サーバーの初期値とクライアントの復元値が一致せず **ハイドレーションエラー** が発生する場合がある。

このプロジェクトでは `page.tsx` に `'use client'` を付けているため SSR は行われず、問題は起きない。
もし SSR を使いたい場合は `useStore` パターンで初回レンダーを制御すること。

---

*以上で全コンポーネントの実装が揃う。実装優先順位は要件定義書 §14 を参照。*
