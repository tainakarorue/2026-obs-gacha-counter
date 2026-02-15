# ガチャカウンター Next.js版 要件定義書

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| プロジェクト名 | gacha-counter-next |
| 概要 | OBS Studio 配信用ガチャカウンターオーバーレイの Next.js 版 |
| 目的 | HTML版の機能を再現しつつ、プロダクション品質の実装を学習する |
| 参照元 | HTML版 (`/mnt/c/Users/miz32/Desktop/ガチャカウンター/`) |

### 1.1 方針

- HTML版は独立して継続運用する。Next.js版は**別プロジェクト・別リポジトリ**として作成する
- HTML版の全機能を再現した上で、技術スタックを刷新する
- OBS ブラウザソースでの動作を引き続きサポートする

---

## 2. 技術スタック

| カテゴリ | 技術 | 備考 |
|----------|------|------|
| フレームワーク | Next.js (App Router) | React Server Components 対応 |
| 言語 | TypeScript | strict モード |
| スタイリング | Tailwind CSS v4 | ユーティリティファースト |
| UIコンポーネント | shadcn/ui | Radix UI ベース。ボタン・ダイアログ・入力等に使用 |
| 状態管理 | Zustand | 軽量で localStorage 永続化プラグインあり |
| アニメーション | Framer Motion | カウントパルス・獲得エフェクト等 |
| リンター/フォーマッター | ESLint + Prettier | Next.js 推奨設定ベース |
| パッケージマネージャ | npm | |

---

## 3. 機能要件

> HTML版の機能ID (F-01〜F-17) を全て踏襲する。

### 3.1 カウント機能

| ID | 機能 | 説明 |
|----|------|------|
| F-01 | 単発ガチャ (+1) | カウントを1加算する |
| F-02 | 10連ガチャ (+10) | カウントを10加算する |
| F-03 | 10連+1ガチャ (+11) | サービス込み10連。カウントを11加算する |
| F-04 | カウント戻し (Undo) | 直前の操作を1回取り消す |
| F-05 | リセット | 全カウント・履歴を初期化する (確認ダイアログあり) |

### 3.2 表示機能

| ID | 機能 | 説明 |
|----|------|------|
| F-06 | 現在の連続回数 | 前回獲得からの回数をメインに大きく表示 |
| F-07 | 総回数表示 | 累計ガチャ回数を表示 |
| F-08 | 消費クレジット表示 | 総回数 × 1連コストを自動計算表示 (1連コスト未設定時は非表示) |
| F-09 | 天井カウンター | 天井到達までの残り回数を表示 |
| F-10 | 天井回数設定 | -10 / -1 / +1 / +10 ボタンまたは直接入力 (デフォルト: 200) |
| F-11 | 獲得履歴表示 | キャラ名付きで獲得時の回数と累計を一覧表示 |
| F-12 | 獲得サマリー | キャラ名ごとにグループ化し、獲得数と合計回数を表示 |

### 3.3 獲得記録機能

| ID | 機能 | 説明 |
|----|------|------|
| F-13 | キャラ獲得記録 | 現在のカウントで獲得を記録。キャラ名も保存 |

### 3.4 データ永続化

| ID | 機能 | 説明 |
|----|------|------|
| F-14 | 自動保存 | 操作ごとに localStorage へ自動保存 (Zustand persist) |
| F-15 | 自動復元 | ページ読み込み時に localStorage から自動復元 |

### 3.5 キーボードショートカット

| キー | 操作 |
|------|------|
| `1` | 単発ガチャ (+1) |
| `2` | 10連ガチャ (+10) |
| `3` | 10連+1ガチャ (+11) |
| `Space` | キャラ獲得記録 |
| `Z` | 戻す (Undo) |
| `R` | リセット確認表示 |

- 入力フィールドにフォーカス中はショートカットを無効化する

### 3.6 演出

| ID | 機能 | 説明 |
|----|------|------|
| F-16 | カウント変動アニメーション | 数値変更時にスケールパルスアニメーション |
| F-17 | 獲得時エフェクト | コンテナのグローエフェクト + 最新履歴の点滅 |

---

## 4. 非機能要件

| 項目 | 内容 |
|------|------|
| 背景 | 透明 (OBS クロマキー不要) |
| フォント | Noto Sans JP (Google Fonts) |
| レスポンシブ | OBS ブラウザソース幅に合わせて調整可能 |
| パフォーマンス | 配信に影響を与えない軽量設計。不要な再レンダリングを抑制 |
| アクセシビリティ | shadcn/ui 標準の aria 属性を活用 |
| 型安全性 | TypeScript strict。状態・Props すべてに型定義 |
| コード品質 | ESLint / Prettier によるフォーマット統一 |

---

## 5. データ構造 (TypeScript 型定義)

```typescript
// --- 獲得履歴 ---
type HistoryEntry = {
  id: number;           // 獲得番号 (1, 2, 3...)
  totalAtGet: number;   // 獲得時の累計回数
  pullsSinceLast: number; // 前回獲得からの回数
  charName: string;     // 獲得時のキャラクター名 (空文字可)
};

// --- Undo 操作 ---
type UndoAction =
  | { type: 'pull'; amount: number; totalBefore: number }
  | { type: 'get'; totalBefore: number };

// --- アプリケーション状態 ---
type GachaState = {
  totalCount: number;      // 累計ガチャ回数
  pityLimit: number;       // 天井回数 (デフォルト: 200)
  creditPerPull: number;   // 1連あたりのコスト (0で非表示)
  charName: string;        // 現在のキャラクター名
  history: HistoryEntry[]; // 獲得履歴
  undoStack: UndoAction[]; // Undo 用スタック
};

// --- Zustand Store Actions ---
type GachaActions = {
  addPull: (amount: number) => void;
  recordGet: () => void;
  undo: () => void;
  resetAll: () => void;
  setCharName: (name: string) => void;
  setPityLimit: (limit: number) => void;
  setCreditPerPull: (cost: number) => void;
};
```

### 5.1 localStorage キー

| キー | 内容 |
|------|------|
| `gacha-counter-store` | Zustand persist による状態全体の JSON |

### 5.2 派生値 (Store 内で getter として定義)

| 値 | 計算式 |
|----|--------|
| `sinceLastGet` | `totalCount - (history の最後の totalAtGet or 0)` |
| `pityRemain` | `max(0, pityLimit - sinceLastGet)` |
| `totalCredit` | `totalCount * creditPerPull` |
| `isPityNear` | `pityRemain <= pityLimit * 0.2 && pityRemain > 0` |
| `summaryGroups` | `history を charName でグループ化 → { name, count, totalPulls }[]` |

---

## 6. 画面レイアウト

> HTML版と同一のレイアウトを再現する。

```
┌──────────────────────────────────┐
│     [ キャラクター名入力欄 ]        │  ← Input (shadcn/ui)
│         ガチャカウンター            │
├──────────────────────────────────┤
│                                  │
│          現在  75  回             │  ← メインカウンター (Framer Motion)
│                                  │
│    総回数 195 回  × 1連 [160]     │  ← 総回数 + Input (number)
│         消費 31,200              │  ← 消費クレジット (条件付き表示)
│    天井まで  5回 / 200回          │  ← 天井カウンター
│                                  │
├──────────────────────────────────┤
│  ── 獲得履歴 ──                   │
│  キャラA   45回   (累計45回目)     │  ← ScrollArea (shadcn/ui)
│  キャラA   75回   (累計120回目)    │
│  武器B     30回   (累計150回目)    │
│                                  │
│  ── 獲得サマリー ──               │
│  キャラA ×2    合計120回          │
│  武器B  ×1    合計30回           │
│                                  │
├──────────────────────────────────┤
│ [+1] [+10] [+11] [獲得!] [戻す]  │  ← Button (shadcn/ui)
│           [リセット]              │
│ 天井: [-10][-1][___][+1][+10] 回 │
├──────────────────────────────────┤
│  1:+1  2:+10  3:+11             │  ← ショートカット説明
│  Space:獲得  Z:戻す  R:リセット   │
└──────────────────────────────────┘
```

---

## 7. コンポーネント設計

### 7.1 ディレクトリ構成

```
gacha-counter-next/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # RootLayout (フォント, メタデータ)
│   │   ├── page.tsx            # メインページ (use client)
│   │   └── globals.css         # Tailwind ベース + カスタムCSS変数
│   ├── components/
│   │   ├── gacha-counter.tsx   # 全体コンテナ (キーボードイベント管理)
│   │   ├── char-name-input.tsx # キャラクター名入力
│   │   ├── main-display.tsx    # メインカウンター + サブカウンター
│   │   ├── history-list.tsx    # 獲得履歴リスト
│   │   ├── history-summary.tsx # 獲得サマリー
│   │   ├── control-buttons.tsx # 操作ボタン群
│   │   ├── pity-settings.tsx   # 天井設定
│   │   ├── shortcut-guide.tsx  # ショートカット説明
│   │   └── reset-dialog.tsx    # リセット確認ダイアログ
│   ├── stores/
│   │   └── gacha-store.ts      # Zustand store (状態 + アクション + persist)
│   ├── hooks/
│   │   └── use-keyboard-shortcuts.ts  # キーボードショートカット
│   ├── lib/
│   │   └── utils.ts            # shadcn/ui 用 cn() ユーティリティ
│   └── types/
│       └── gacha.ts            # 型定義 (GachaState, HistoryEntry 等)
├── components.json             # shadcn/ui 設定
├── tailwind.config.ts
├── tsconfig.json
├── next.config.ts
└── package.json
```

### 7.2 コンポーネント責務

| コンポーネント | 責務 | 使用する shadcn/ui |
|---------------|------|-------------------|
| `gacha-counter` | 全体レイアウト、キーボードイベント管理 | - |
| `char-name-input` | キャラ名の表示・編集 | `Input` |
| `main-display` | 現在回数、総回数、消費クレジット、天井残り | - |
| `history-list` | 獲得履歴の一覧表示、自動スクロール | `ScrollArea` |
| `history-summary` | キャラ別サマリー表示 | - |
| `control-buttons` | +1/+10/+11/獲得/戻す ボタン | `Button` |
| `pity-settings` | 天井回数の調整UI | `Button`, `Input` |
| `shortcut-guide` | ショートカットキーの説明表示 | - |
| `reset-dialog` | リセット確認モーダル | `AlertDialog` |

### 7.3 コンポーネント間データフロー

```
Zustand Store (gacha-store)
    ├── gacha-counter (読み取り: 全状態 / キーボード → アクション呼び出し)
    │     ├── char-name-input (読み書き: charName)
    │     ├── main-display (読み取り: totalCount, sinceLastGet, pityRemain, credit)
    │     ├── history-list (読み取り: history)
    │     ├── history-summary (読み取り: history → summaryGroups)
    │     ├── control-buttons (呼び出し: addPull, recordGet, undo, showReset)
    │     ├── pity-settings (読み書き: pityLimit)
    │     ├── shortcut-guide (表示のみ)
    │     └── reset-dialog (呼び出し: resetAll)
```

---

## 8. 処理フロー

> HTML版と同一のフローを Zustand アクション内で実装する。

### 8.1 ガチャカウント追加 (`addPull`)

```
1. undoStack に { type: 'pull', amount, totalBefore: totalCount } を push
2. totalCount += amount
3. (Zustand persist が自動で localStorage に保存)
4. UI側: Framer Motion でカウンターパルスアニメーション
```

### 8.2 キャラ獲得記録 (`recordGet`)

```
1. ガード: totalCount === 0 → return
2. ガード: sinceLastGet <= 0 → return
3. undoStack に { type: 'get', totalBefore: totalCount } を push
4. history に { id, totalAtGet, pullsSinceLast, charName } を push
5. (自動保存)
6. UI側: 獲得エフェクト + 最新履歴の点滅アニメーション
```

### 8.3 Undo (`undo`)

```
1. ガード: undoStack が空 → return
2. undoStack から pop
3. type === 'pull' → totalCount を totalBefore に復元
4. type === 'get'  → history から最後の要素を pop、id を振り直す
5. (自動保存)
```

### 8.4 リセット (`resetAll`)

```
1. AlertDialog で確認
2. 確認後: totalCount=0, charName='', history=[], undoStack=[] に初期化
3. (自動保存)
```

---

## 9. ビジュアルデザイン仕様

> HTML版のデザインを忠実に再現する。Tailwind のカスタムカラーで定義。

### 9.1 カラーパレット

| 用途 | 色 | CSS値 |
|------|------|-------|
| 背景 | ダークネイビー (半透明) | `rgba(15, 15, 25, 0.85)` |
| ボーダー | 青紫 (薄) | `rgba(100, 120, 255, 0.3)` |
| テキスト (メイン) | 白 | `#f0f0f0` |
| テキスト (サブ) | グレーブルー | `#b0b8d0` |
| テキスト (補助) | ダークグレー | `#98a0b8` |
| メインカウンター | 白 + 青グロー | `#ffffff` / shadow: `rgba(100,140,255,0.6)` |
| 総回数 | スカイブルー | `#70cfff` |
| 消費クレジット | ピンク | `#ff90d0` |
| 天井カウンター | オレンジ | `#ffb060` |
| 天井警告 (残り20%以下) | 赤 + 赤グロー | `#ff6060` |
| 獲得履歴キャラ名 | ライトブルー | `#a0b0ff` |
| ボタン (ガチャ) | ダークブルー | `#3050a0` |
| ボタン (獲得) | ゴールド | `#d4a020` |
| ボタン (戻す) | グレー | `#404858` |
| ボタン (リセット) | ダークレッド | `#802030` |

### 9.2 アニメーション

| アニメーション | トリガー | 内容 |
|---------------|---------|------|
| `counterPulse` | カウント変動時 | scale 1→1.15→1 + 色変化 (0.3s) |
| `getFlash` | 獲得記録時 (最新履歴) | 背景ゴールド→透明 + scale 1.03→1 (0.6s) |
| `getGlow` | 獲得記録時 (コンテナ) | box-shadow ゴールドグロー (0.6s) |

### 9.3 コンテナサイズ

- 幅: `380px` (固定)
- パディング: `20px 24px`
- 角丸: `12px`

---

## 10. OBS での使用方法

1. `npm run build` で静的ビルドを生成 (`next.config.ts` で `output: 'export'` を設定)
2. OBS Studio → ソース追加 → ブラウザ
3. 「ローカルファイル」にチェック → `out/index.html` を指定
4. 幅: `400` / 高さ: `600` (推奨)
5. 操作は別途ブラウザで `localhost:3000` を開いて行う

> **注:** `output: 'export'` により静的HTMLとして出力するため、OBSブラウザソースで直接読み込み可能。

---

## 11. OBS ブラウザソースの制約事項

| 制約 | 対応方針 |
|------|---------|
| `confirm()` / `alert()` が動作しない | shadcn/ui の AlertDialog で代替 |
| IME (日本語入力) が不安定 | Input コンポーネントで対応。必要に応じて URLパラメータでの事前設定も検討 |
| localStorage が OBS と通常ブラウザで共有されない | 運用注意事項として記載 |
| 背景を透明にする必要がある | `body { background: transparent }` を維持 |

---

## 12. 開発手順 (セットアップガイド)

```bash
# 1. プロジェクト作成
npx create-next-app@latest gacha-counter-next \
  --typescript --tailwind --eslint --app --src-dir \
  --no-turbopack --import-alias "@/*"

cd gacha-counter-next

# 2. shadcn/ui 初期化
npx shadcn@latest init

# 3. 必要な shadcn/ui コンポーネントを追加
npx shadcn@latest add button input alert-dialog scroll-area

# 4. 追加パッケージ
npm install zustand framer-motion

# 5. 開発サーバー起動
npm run dev
```

---

## 13. next.config.ts 設定ポイント

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',  // 静的HTMLエクスポート (OBS対応)
};

export default nextConfig;
```

---

## 14. 実装優先順位

| 順序 | タスク | 備考 |
|------|--------|------|
| 1 | プロジェクトセットアップ | Next.js + Tailwind + shadcn/ui + Zustand |
| 2 | 型定義 (`types/gacha.ts`) | GachaState, HistoryEntry, UndoAction |
| 3 | Zustand Store (`stores/gacha-store.ts`) | 状態 + アクション + persist |
| 4 | メイン画面レイアウト | gacha-counter + main-display |
| 5 | 操作ボタン + 天井設定 | control-buttons + pity-settings |
| 6 | 獲得履歴 + サマリー | history-list + history-summary |
| 7 | キャラ名入力 + リセットダイアログ | char-name-input + reset-dialog |
| 8 | キーボードショートカット | use-keyboard-shortcuts |
| 9 | アニメーション | Framer Motion でカウンターパルス・獲得エフェクト |
| 10 | ビジュアル調整 | HTML版との見た目一致確認 |
| 11 | 静的エクスポート確認 | `output: 'export'` でビルド → OBSで動作確認 |

---

## 付録A: HTML版との機能対応表

| HTML版 | Next.js版 |
|--------|-----------|
| グローバル変数 `state` | Zustand store |
| `dom` オブジェクト (getElementById) | React refs / JSX 直接バインド |
| `innerHTML` による描画 | React コンポーネント + JSX |
| `localStorage` 直接操作 | Zustand persist ミドルウェア |
| CSS クラスの add/remove | 条件付き className (cn ユーティリティ) |
| `contenteditable` div | shadcn/ui Input |
| CSS `@keyframes` | Framer Motion animate |
| `confirm()` 代替の自前ダイアログ | shadcn/ui AlertDialog |
| イベントリスナー直接登録 | React onClick / useEffect 内 addEventListener |
