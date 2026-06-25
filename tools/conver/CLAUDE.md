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
