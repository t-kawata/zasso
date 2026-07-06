# conver.js — ACP-based Ticket Processing Pipeline 設計全体マップ

> このファイルは `/formulate-tickets` によって自動生成されました。
> **生成元:** tools/conver/RFC_ROOT.md
> **生成日:** 2026-06-25

## 目的とスコープ

conver.js は二層構造の開発パイプラインにおける内部ループ（内側ループ）を完全自動化する。
`@agentclientprotocol/claude-agent-acp` を通じて Claude Code のセッションをプログラムから制御し、
Tickets.json に定義されたチケットに対して make → plan → start → review → resolve → find の
一連の工程を自動実行する。各工程は独立したACPセッションで実行され、
DeepSeek V4（flash / pro）のモデル選択に対応し、エラー発生時には Slack への通知とプロセス停止を行う。

## アーキテクチャ概要

```
conver/
├── tsconfig.json           # TypeScript コンパイル設定
├── package.json            # ビルドスクリプト定義
├── src/
│   ├── conver.ts           # エントリポイント
│   ├── cli.ts              # CLI引数パース（副作用ゼロ）
│   ├── session.ts          # ACP セッション管理（spawn/run/dispose）
│   ├── runner.ts           # ループ制御・Slack通知統合
│   ├── tickets.ts          # Tickets.json 読み込み・状態確認
│   ├── notifier.ts         # Slack通知送信
│   └── error.ts            # エラー型定義
└── dist/
    └── conver.js           # ビルド成果物（tsc 出力）
```

### 4セッション完全分離アーキテクチャ

```
チケット P0-1 の処理フロー:

   [Session A]  make-ticket → plan-ticket → start-ticket
        │
        ▼ dispose
   [Session B]  review-ticket
        │
        ▼ dispose
   [Session C]  resolve-ticket
        │
        ▼ dispose
   (必要に応じて Session D: find-omissions-for-next-rfc)
        │
        ▼ dispose
   次のチケット P0-2 へ（再び Session A から）
```

## 主要な型とデータ構造

| モジュール | 型/構造体 | 責務 |
|---|---|---|
| `error.ts` | `CommandTimeoutError` | タイムアウトエラー型 |
| `cli.ts` | `CliOptions` | CLI引数の型定義 |
| `session.ts` | `AcpSession` | ACPセッション（proc/stream/sessionId/ctx/session） |
| `runner.ts` | `LoopOptions` | ループ制御の全オプション |
| `runner.ts` | `Ticket` | チケット情報（id/phaseId/status/title） |
| `runner.ts` | `TicketsJson` | Tickets.json 全体構造 |
| `notifier.ts` | `ErrorContext` | エラー通知コンテキスト |

## モジュール間の関係

```
error.ts ── (依存なし)
    ↑
session.ts ── 依存: error.ts, @agentclientprotocol/sdk, node:child_process
    ↑
cli.ts ── 依存: node:util
    ↑
tickets.ts ── 依存: node:fs
    ↑
notifier.ts ── 依存: node:https, node:child_process
    ↑
runner.ts ── 依存: session.ts, notifier.ts, tickets.ts
    ↑
conver.ts ── 依存: cli.ts, runner.ts
```

## スタブ一覧と解決計画

conver.js の実装において、スタブは発生しない。
すべての関数は TypeScript の完全な型定義を持ち、外部依存モジュール（ACP SDK の型等）は
npm パッケージとしてインストールされる。

---

## 拡張: RFC OMISSIONS-001 — 実装乖離5件の修正設計

> このセクションは `/formulate-tickets-for-next` によって自動生成されました。
> **生成元:** tools/conver/RFC_OMISSIONS-001.md
> **生成日:** 2026-06-26

### 目的

RFC-001（conver.js）の実装過程で発見された5件の実装乖離（omission）を修正する。各 omission は独立した修正単位であり、RFC-001 のアーキテクチャや外部インターフェースを変更することなく解決される。

### 修正対象一覧

| ID | 種別 | 重要度 | 概要 | 修正モジュール |
|----|------|--------|------|--------------|
| O-001 | 実装漏れ | medium | 起動パラメータログが6項目中2項目のみ | conver.ts |
| O-002 | 実装漏れ | medium | ファイルパスの絶対パス変換が未実装 | cli.ts, runner.ts |
| O-003 | 設計不一致 | low | tickets.ts 公開関数が phaseId を欠落 | tickets.ts, runner.ts |
| O-004 | 不整合 | low | RFC型名と実装型名の乖離（SDK更新） | session.ts, RFC_ROOT.md |
| O-005 | 不整合 | low | Makefile エントリの RFC 未反映 | Makefile, RFC_ROOT.md |

### 修正後の依存関係

O-003 により runner.ts の `loadPendingTickets()` / `checkAllReviewed()` が削除され、tickets.ts の公開関数に統合される。これにより runner.ts → tickets.ts の依存が強化される。

```
tickets.ts ── loadPendingTickets() に phaseId 付与ロジック追加
    ↑ (統合)
runner.ts ── 独自 loadPendingTickets 削除、tickets.ts の公開関数を import して使用

cli.ts ── parseCliOptions() で ticketsPath を path.resolve() で絶対パス変換
    ↑
runner.ts ── cwd を path.resolve() で正規化

conver.ts ── 起動パラメータログを6行 key=value 形式に拡張
```

---

## 拡張: RFC ADDITION-002 — find の収束問題と Goal Gate の導入

> このセクションは `/formulate-tickets-for-next` によって自動生成されました。
> **生成元:** tools/conver/RFC_ADDITION-002.md
> **生成日:** 2026-07-01

### 目的

find のループを重ねると omission が減らず発散する問題を解決する。目的（purpose）・目標（goals）・成功条件（successCriteria）にもとづく Goal Gate フィルタと、機械的な収束検知・重複排除スクリプトを導入する。

### 追加スクリプト一覧

| スクリプト | 種類 | 決定論度 | 配置先 |
|-----------|------|---------|-------|
| `dedup-omissions-by-history.js` | 新規 | 100%（決定論） | `.claude/scripts/tickets/` |
| `materiality-filter.js` | 新規 | 80%（決定論）+ 20%（AI への情報提供） | `.claude/scripts/tickets/` |
| `diminishing-returns.js` | 新規 | 100%（決定論） | `.claude/scripts/tickets/` |

### find-omissions ワークフロー変更

既存の Step 3 と Step 4 の間に **Step 3.5（機械的フィルタリング）** を新設する：

```
Step 3.5: 機械的フィルタリング（新設）
  ├── dedup-omissions-by-history.js → 過去との重複排除
  ├── materiality-filter.js → Goal 阻害度による severity 確定
  └── diminishing-returns.js → 発散/収束の最終判定
```

### 決定論 vs 非決定論の設計原則

```
決定論で確定できること → スクリプトが確定判断（AI は受け入れるのみ）
非決定論が不可欠なこと → AI が判断（ただし決定論の結果を制約として与える）
```

### 発散防止の3層防御

| Layer | タイミング | 内容 |
|-------|-----------|------|
| Layer 1 | Step 3 各子ステップ終了時 | 即時 Goal Gate — materiality 評価・低スコアは cosmetic に格下げ |
| Layer 2 | Step 3.5 | 機械的フィルタリング — 重複排除 + severity 確定 + 発散傾向検知 |
| Layer 3 | check-final | 独立した二重計測 — cosmetic のみなら PASS |

---

## 拡張: RFC GRAPHIFY-001 — `/graphify-rfc` スラッシュコマンド

> このセクションは `/formulate-tickets-for-next` によって自動追記されました。
> **生成元:** tools/conver/RFC-GRAPHIFY.md
> **生成日:** 2026-07-06

### 目的

長大なMarkdown設計文書をI/O境界単位の細粒度ノードに分割し、属性付きエッジで結んだグラフ構造として永続化する `/graphify-rfc` スラッシュコマンドを定義する。graphify（発散）→ formulate（収束）のパイプラインにより、チケット分解の品質と再現性を向上させる。

### 主要な型とデータ構造

| スキーマ | 内容 |
|----------|------|
| `node.schema.json` | ノード: id(N0001〜), title, kind(12種), summary, sourceRanges(refId+行番号) |
| `edge.schema.json` | エッジ: from, to, type(12種), attributes(strength/bidirectional) |
| `graph.schema.json` | グラフ全体: sourceFile, nodes[], edges[] |

### モジュール／コンポーネント間の関係

```
.claude/scripts/rfc-graph/
  crud.js               ← グラフの唯一の書き込み経路（全スクリプトの前提）
  verify.js             → crud.js で作成されたグラフを検証
  embed-markers.js      → 検証済みグラフのマーカーを元文書に埋め込み
  query.js              → 完成グラフのマルチホップ探索
  update-step-status.js → 全スクリプトから子プロセス呼び出しでStep進行管理
```

### フェーズ・チケット一覧

全7チケットが5フェーズ（P12〜P16）に分割され、Tickets.json に追加済み。
既存フェーズ（P0〜P11）は一切変更していない。
