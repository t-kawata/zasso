# RFC-001: conver.js — ACP-based Ticket Processing Pipeline

| 項目 | 内容 |
|------|------|
| RFC名 | conver.js: Agent Client Protocol によるチケット処理内部ループ自動化 |
| 状態 | 確定 |
| 作成日 | 2026-06-25 |
| 更新日 | 2026-06-25 |
| 設計範囲 | CLI設計、ACPセッション管理、ループ制御、エラーハンドリング、Slack通知、モジュール構成、DeepSeek V4統合、TypeScriptビルドパイプライン |

---

## Abstract（概要）

本RFCは、二層構造の開発パイプラインにおける内部ループ（内側ループ）を完全自動化する `conver.js` の設計を規定する。

`conver.js` は `@agentclientprotocol/claude-agent-acp` を通じて Claude Code のセッションをプログラムから制御し、Tickets.json に定義されたチケットに対して make → plan → start → review → resolve → find の一連の工程を自動実行する。各工程は独立したACPセッションで実行され、DeepSeek V4（flash / pro）のモデル選択に対応し、エラー発生時には Slack への通知とプロセス停止を行う。

---

## Motivation（動機・背景）

### 二層パイプラインにおける内部ループの自動化

開発パイプラインは外側ループ（人間またはAIによる全体設計・方針決定）と内部ループ（チケット単位の実装・レビュー・解決）の二層構造を持つ。

```
外側ループ（人間/AI）: 設計→チケット起票→巡回→次のRFC発見
                         │
                         ▼
内側ループ（自動化対象）: make→plan→start→review→resolve→find
```

従来、内部ループは手動で各スラッシュコマンド（`/make-ticket`, `/plan-ticket` 等）を順に実行する必要があった。`conver.js` はこれを完全に自動化し、以下の恩恵を提供する：

- **外側ループの循環速度向上**: 人間が介在するポイントを外側ループだけに限定する
- **ヒューマンエラーの排除**: 工程の順序誤り・飛ばしを防止する
- **実行履歴の一元管理**: すべての処理結果が Tickets.json に集約される
- **チケット処理のスケーリング**: 複数チケットを連続処理可能にする

### ACP プロトコルの採用理由

`@agentclientprotocol/sdk`（ACP）は Claude Code をプログラム可能なサブプロセスとして制御するためのプロトコルである。独自に Claude Code の標準入出力をパースする方式と比較して：

| 項目 | ACP方式 | 標準I/Oパース方式 |
|------|---------|-------------------|
| プロトコル安定性 | バージョン管理されたJSON-RPC 2.0 | 実装依存の不安定なフォーマット |
| セッション分離 | ネイティブの session/new | 手動のプロセス管理が必要 |
| 権限ハンドリング | 標準化された request_permission | 独自実装が必要 |
| ストリーム制御 | ndjson による確実な区切り | 文字列パースの課題 |

ACP を採用することで、セッション分離・権限管理・ストリーム制御のすべてを標準化されたプロトコルで実現する。

---

## Design（設計）

### 1. CLI インターフェース

#### 1.1 フラグ一覧

```
conver.js -k <api_key> -s <url> [-t <path>] [-c <number>] [-r <number>] [-p <0|1>] [-m <model>] [-v <0|1>] [--timeout <seconds>]
```

| フラグ | 短縮 | 必須 | デフォルト | 説明 |
|--------|------|------|------------|------|
| `--api-key` | `-k` | 必須 | — | DeepSeek API Key |
| `--tickets` | `-t` | 任意 | `./Tickets.json` | Tickets.json のパス |
| `--count` | `-c` | 任意 | `999999` | 最大処理チケット数 |
| `--resolve-every` | `-r` | 任意 | `3` | Nチケット完了ごとに resolve |
| `--push` | `-p` | 任意 | `1` | resolve 毎に jpush-branch 実行フラグ（0=無効, 1=有効） |
| `--model` | `-m` | 任意 | `deepseek-v4-flash` | 使用するモデル名 |
| `--slack-url` | `-s` | 必須 | — | Slack Incoming Webhook URL |
| `--verbose` | `-v` | 任意 | `0` | 詳細表示モード（0=標準, 1=ACP全メッセージ表示） |
| `--timeout` | — | 任意 | `1800` | 各コマンドのタイムアウト秒数 |
| `--help` | `-h` | — | — | usage 表示 |

`--help` / `-h` の出力例：

```
conver.js — ACP-based ticket processing pipeline (DeepSeek V4)

Usage:
  node dist/conver.js -k <api_key> -s <webhook_url> [options]

Options:
  -k, --api-key <key>        DeepSeek API Key (required)
  -t, --tickets <path>       Tickets.json path (default: ./Tickets.json)
  -c, --count <number>       Max tickets to process (default: 999999)
  -r, --resolve-every <num>  Resolve interval (default: 3)
  -p, --push <0|1>           Auto jpush-branch after resolve (default: 1)
  -m, --model <name>         AI model (default: deepseek-v4-flash)
  -s, --slack-url <url>      Slack Incoming Webhook URL (required)
  -v, --verbose <0|1>        Verbose output (default: 0)
  --timeout <seconds>        Command timeout in seconds (default: 1800)
  -h, --help                 Show this message
```

#### 1.2 引数パース実装（cli.ts）

```typescript
// cli.ts — 引数パース、副作用ゼロ
import { parseArgs } from 'node:util';

export interface CliOptions {
  apiKey: string;
  model: string;
  ticketsPath: string;
  maxCount: number;
  resolveEvery: number;
  pushEnabled: boolean;
  slackWebhookUrl: string;
  verbose: boolean;
  timeoutMs: number;
}

function showUsage(): void {
  console.log(`conver.js — ACP-based ticket processing pipeline (DeepSeek V4)

Usage:
  node dist/conver.js -k <api_key> -s <webhook_url> [options]

Options:
  -k, --api-key <key>        DeepSeek API Key (required)
  -t, --tickets <path>       Tickets.json path (default: ./Tickets.json)
  -c, --count <number>       Max tickets to process (default: 999999)
  -r, --resolve-every <num>  Resolve interval (default: 3)
  -p, --push <0|1>           Auto jpush-branch after resolve (default: 1)
  -m, --model <name>         AI model (default: deepseek-v4-flash)
  -s, --slack-url <url>      Slack Incoming Webhook URL (required)
  -v, --verbose <0|1>        Verbose output (default: 0)
  --timeout <seconds>        Command timeout in seconds (default: 1800)
  -h, --help                 Show this message`);
}

export function parseCliOptions(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv.slice(2),
    options: {
      'api-key':   { type: 'string', short: 'k' },
      model:       { type: 'string', short: 'm', default: 'deepseek-v4-flash' },
      tickets:     { type: 'string', short: 't', default: './Tickets.json' },
      count:       { type: 'string', short: 'c', default: '999999' },
      'resolve-every': { type: 'string', short: 'r', default: '3' },
      push:        { type: 'string', short: 'p', default: '1' },
      'slack-url': { type: 'string', short: 's' },
      verbose:     { type: 'string', short: 'v', default: '0' },
      timeout:     { type: 'string', default: '1800' },
      help:        { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    showUsage();
    process.exit(0);
  }

  if (!values['api-key']) {
    console.error('エラー: -k / --api-key は必須です。');
    showUsage();
    process.exit(1);
  }
  if (!values['slack-url']) {
    console.error('エラー: -s / --slack-url は必須です。');
    showUsage();
    process.exit(1);
  }

  return {
    apiKey: values['api-key'],
    model: values.model,
    ticketsPath: values.tickets,
    maxCount: parseInt(values.count, 10),
    resolveEvery: parseInt(values['resolve-every'], 10),
    pushEnabled: values.push === '1',
    slackWebhookUrl: values['slack-url'],
    verbose: values.verbose === '1',
    timeoutMs: parseInt(values.timeout, 10) * 1000,
  };
}
```

#### 1.3 フラグ間の依存関係

```
-k (必須): 欠如時に usage 表示 → exit 1
-s (必須): 欠如時に usage 表示 → exit 1
-t (省略可): 未指定時 ./Tickets.json をデフォルトとして使用
-m (省略可): 未指定時 deepseek-v4-flash を使用
-p 0: resolve 完了後に jpush-branch をスキップ
-p 1: resolve 完了後に jpush-branch を実行（デフォルト）
-v 1: ACP セッションからの agent_message_chunk を全表示
--timeout: すべてのコマンドの最大待機時間を設定（全セッション共通）
```

### 2. ACP セッション管理

#### 2.1 4セッション完全分離アーキテクチャ

各チケットの処理は4つの独立したACPセッションで実行される。すべてのセッションは異なる `sessionId` を持ち、並行稼働はしない（直列実行）。

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

各セッションは `spawnAgent()` で新しい `claude-agent-acp` プロセスを起動し、`session/new` で新しいセッションIDを発行する。これにより、前のチケットのコンテキストが次のチケットに影響を与えることが完全に防止される。

```typescript
// session.ts — ACP セッション管理
import { spawn, type ChildProcess } from 'node:child_process';
import { Writable, Readable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { CommandTimeoutError } from './error';

const ACP_BINARY = 'claude-agent-acp';

export interface AcpSession {
  proc: ChildProcess;
  stream: acp.NdJsonStream;
  sessionId: string;
  ctx: acp.ClientContext;
  session: acp.ActiveSession;
}

export function spawnAgent(
  apiKey: string,
  model: string,
): { proc: ChildProcess; stream: acp.NdJsonStream } {
  const proc = spawn(ACP_BINARY, [], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: {
      ...process.env,
      ACP_PERMISSION_MODE: 'bypassPermissions',
      // DeepSeek V4 — Anthropic 互換エンドポイント
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_MODEL: model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro',
      ANTHROPIC_DEFAULT_SONNET_MODEL: model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
      CLAUDE_CODE_SUBAGENT_MODEL: model,
      CLAUDE_CODE_EFFORT_LEVEL: 'xhigh',
    },
  });

  const stream = acp.ndJsonStream(
    Writable.toWeb(proc.stdin),
    Readable.toWeb(proc.stdout),
  );

  return { proc, stream };
}

export function buildClientApp() {
  return acp
    .client({ name: 'conver' })
    .onRequest(acp.methods.client.session.requestPermission, ({ params }) => {
      const opt = params.options.find(
        (o) => o.kind === 'allow_always' || o.kind === 'allow_once',
      );
      return {
        outcome: {
          outcome: 'selected',
          optionId: opt.optionId,
        },
      };
    })
    .onNotification(acp.methods.client.session.update, () => {});
}

export async function createSession(
  cwd: string,
  apiKey: string,
  model: string,
): Promise<AcpSession> {
  const { proc, stream } = spawnAgent(apiKey, model);
  const app = buildClientApp();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('ACPセッション初期化タイムアウト'));
    }, 30000);

    app.connectWith(stream, async (ctx) => {
      try {
        await ctx.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {},
        });

        const session = await ctx.buildSession(cwd).start();
        clearTimeout(timeout);

        resolve({
          proc,
          stream,
          sessionId: session.sessionId,
          ctx,
          session,
        });
      } catch (err) {
        clearTimeout(timeout);
        proc.kill();
        reject(err);
      }
    });
  });
}

export async function withSession<T>(
  cwd: string,
  apiKey: string,
  model: string,
  fn: (session: AcpSession) => Promise<T>,
): Promise<T> {
  const session = await createSession(cwd, apiKey, model);
  try {
    return await fn(session);
  } finally {
    disposeSession(session);
  }
}

export async function runCommand(
  acpSession: AcpSession,
  command: string,
  options: { timeoutMs: number; verbose: boolean },
): Promise<string> {
  acpSession.session.prompt(command);

  const startTime = Date.now();
  let fullResponse = '';

  for (;;) {
    if (Date.now() - startTime > options.timeoutMs) {
      throw new CommandTimeoutError(
        `コマンドがタイムアウトしました: ${command} (${options.timeoutMs}ms)`,
      );
    }

    const msg = await acpSession.session.nextUpdate();
    if (!msg) continue;

    if (msg.kind === 'stop') {
      fullResponse = msg.response ?? '';
      break;
    }

    if (options.verbose && msg.update?.sessionUpdate === 'agent_message_chunk') {
      process.stdout.write(msg.update.content.text ?? '');
    }
  }

  return fullResponse;
}

export function disposeSession(acpSession: AcpSession): void {
  try {
    acpSession.session.dispose();
  } catch {
    // dispose エラーは無視する
  }
  acpSession.proc.kill();
}
```

#### 2.2 セッションライフサイクル管理

各セッションのライフサイクルは `try / finally` で管理する。`withSession()` は `session.ts` に実装され、`createSession` / `disposeSession` を内包する。

#### 2.3 権限ハンドリング

すべてのセッションは `ACP_PERMISSION_MODE=bypassPermissions` 環境変数で起動する。これにより、Claude Code が権限確認を要求した場合に自動で bypass される。

加えて `.onRequest` ハンドラを `allow_always` モードで設定し、環境変数が効かないケースにも対応する：

```typescript
// 2重の安全策: 環境変数 + .onRequest ハンドラ
.onRequest(acp.methods.client.session.requestPermission, ({ params }) => {
  const opt = params.options.find(
    (o) => o.kind === 'allow_always' || o.kind === 'allow_once',
  );
  return { outcome: { outcome: 'selected', optionId: opt.optionId } };
})
```

#### 2.4 DeepSeek V4 環境変数注入

`spawnAgent()` は `claude-agent-acp` 子プロセスの環境変数として DeepSeek の Anthropic 互換エンドポイント設定を注入する。これにより、親プロセスのシェル環境を汚染することなく、子プロセス（`claude-agent-acp` → Claude Code）が DeepSeek V4 経由で動作する。

注入される環境変数：

| 環境変数 | 値 | 役割 |
|---|---|---|
| `ANTHROPIC_BASE_URL` | `https://api.deepseek.com/anthropic` | APIエンドポイントの差し替え |
| `ANTHROPIC_AUTH_TOKEN` | `-k` フラグの値 | DeepSeek API キー |
| `ANTHROPIC_MODEL` | `-m` フラグの値（デフォルト: deepseek-v4-flash） | 使用するモデル |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `deepseek-v4-pro` | Opus相当モデル（固定） |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `-m` フラグの値 | Sonnet相当モデル |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `-m` フラグの値 | Haiku相当モデル |
| `CLAUDE_CODE_SUBAGENT_MODEL` | `-m` フラグの値 | サブエージェントモデル |
| `CLAUDE_CODE_EFFORT_LEVEL` | `xhigh` | 推論努力レベル |

モデル選択の指針：

| モデル | 使用シーン | 指定方法 |
|---|---|---|
| deepseek-v4-flash | 標準的なチケット処理（デフォルト） | `-m deepseek-v4-flash` または省略 |
| deepseek-v4-pro | 複雑な設計判断が必要なチケット | `-m deepseek-v4-pro` |

### 3. 内部ループ制御

#### 3.1 メインループの状態遷移

```
ループ開始
  │
  ├─ Tickets.json 読み込み
  ├─ 未処理チケットが存在するか確認
  │    └─ 存在しない → ループ終了（正常）
  │
  ├─ Session A: /make-ticket → /plan-ticket → /start-ticket
  │    └─ エラー → Slack通知 → ループ停止
  │
  ├─ Session B: /review-ticket
  │    └─ エラー → Slack通知 → ループ停止
  │
  ├─ reviewedCount++ / resolveEvery チェック
  │    └─ 条件満たす → Session C: /resolve-ticket
  │         └─ エラー → Slack通知 → ループ停止
  │         └─ -p 1 → /jpush-branch
  │              └─ エラー → Slack通知 → ループ停止
  │
  ├─ Tickets.json 再読み込み
  ├─ 全チケット reviewed チェック
  │    └─ 全件完了 → Session D: /find-omissions-for-next-rfc
  │         └─ エラー → Slack通知 → ループ停止
  │
  └─ 次の未処理チケットへ（ループ継続）
```

#### 3.2 ループ制御コード構造（runner.ts）

```typescript
// runner.ts — チケット実行ループ制御
import { readFileSync } from 'node:fs';
import { withSession, runCommand } from './session';
import { sendSlackError } from './notifier';
import { getSourceFromTickets } from './tickets';

export interface LoopOptions {
  apiKey: string;
  model: string;
  ticketsPath: string;
  maxCount: number;
  resolveEvery: number;
  pushEnabled: boolean;
  slackWebhookUrl: string;
  verbose: boolean;
  timeoutMs: number;
}

export interface Ticket {
  id: number;
  phaseId: number;
  status: string;
  title: string;
}

export interface TicketsJson {
  phases: Array<{
    id: number;
    name: string;
    tickets: Ticket[];
  }>;
  metadata?: {
    source?: string;
  };
}

function loadPendingTickets(ticketsPath: string): Ticket[] {
  const raw = readFileSync(ticketsPath, 'utf8');
  const data: TicketsJson = JSON.parse(raw);
  return data.phases
    .flatMap((p) => p.tickets.map((t) => ({ ...t, phaseId: p.id })))
    .filter((t) => t.status !== 'reviewed')
    .sort((a, b) => a.id - b.id);
}

function checkAllReviewed(ticketsPath: string): boolean {
  const raw = readFileSync(ticketsPath, 'utf8');
  const data: TicketsJson = JSON.parse(raw);
  return data.phases
    .flatMap((p) => p.tickets)
    .every((t) => t.status === 'reviewed');
}

function getCurrentPhase(error: unknown): string {
  const msg = (error instanceof Error ? error.message : '').toLowerCase();
  if (msg.includes('make-ticket')) return 'make-ticket';
  if (msg.includes('plan-ticket')) return 'plan-ticket';
  if (msg.includes('start-ticket')) return 'start-ticket';
  if (msg.includes('review-ticket')) return 'review-ticket';
  if (msg.includes('resolve-ticket')) return 'resolve-ticket';
  if (msg.includes('find-omissions')) return 'find-omissions';
  if (msg.includes('jpush-branch')) return 'jpush-branch';
  return 'unknown';
}

export async function runLoop(options: LoopOptions): Promise<void> {
  const cwd = process.cwd();
  const pending = loadPendingTickets(options.ticketsPath);
  const target = pending.slice(0, options.maxCount);

  let reviewedCount = 0;

  for (const ticket of target) {
    const ticketId = `P${ticket.phaseId}-${ticket.id}`;
    console.log(`\n▶ [${ticketId}] ${ticket.title}`);

    try {
      // Step 1: Session A — make / plan / start
      console.log(`  make/plan/start...`);
      await withSession(cwd, options.apiKey, options.model, async (session) => {
        await runCommand(session, `/make-ticket ${ticketId}`, options);
        await runCommand(session, `/plan-ticket ${ticketId}`, options);
        await runCommand(session, `/start-ticket ${ticketId}`, options);
      });
      console.log(`  ✅ make/plan/start 完了`);

      // Step 2: Session B — review
      console.log(`  review...`);
      await withSession(cwd, options.apiKey, options.model, async (session) => {
        await runCommand(session, `/review-ticket ${ticketId}`, options);
      });
      console.log(`  ✅ review 完了`);
      reviewedCount++;

      // Step 3: Session C — resolve (interval based)
      if (reviewedCount % options.resolveEvery === 0) {
        console.log(`  resolve (${reviewedCount}件完了)...`);
        await withSession(cwd, options.apiKey, options.model, async (session) => {
          await runCommand(session, `/resolve-ticket ${cwd}`, options);
        });
        console.log(`  ✅ resolve 完了`);

        // Step 3b: jpush-branch
        if (options.pushEnabled) {
          try {
            console.log(`  jpush-branch...`);
            await withSession(cwd, options.apiKey, options.model, async (session) => {
              await runCommand(session, `/jpush-branch`, options);
            });
            console.log(`  ✅ jpush-branch 完了`);
          } catch (pushError) {
            await sendSlackError(options.slackWebhookUrl, {
              ticketId,
              phase: 'jpush-branch',
              error: pushError as Error,
              ticketsPath: options.ticketsPath,
            });
            throw pushError;
          }
        }

        // Step 4: 全チケット reviewed チェック → Session D: find
        if (checkAllReviewed(options.ticketsPath)) {
          console.log(`  🎯 全チケット reviewed → find-omissions...`);
          const source = getSourceFromTickets(options.ticketsPath);
          await withSession(cwd, options.apiKey, options.model, async (session) => {
            await runCommand(session, `/find-omissions-for-next-rfc ${source}`, options);
          });
          console.log(`  ✅ find-omissions 完了`);
        }
      }
    } catch (error) {
      const err = error as Error;
      await sendSlackError(options.slackWebhookUrl, {
        ticketId,
        phase: getCurrentPhase(err),
        error: err,
        ticketsPath: options.ticketsPath,
      });
      console.error(`\n❌ エラー発生: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`\n✅ 全${target.length}チケットの処理が完了しました。`);
}
```

### 4. Tickets.json 管理

#### 4.1 読み込みタイミング

Tickets.json は以下の2箇所で `readFileSync` により同期的に読み込む：

| タイミング | 目的 |
|---|---|
| ① ループ各イテレーションの開始時 | 次に処理する未処理チケットを特定する |
| ② resolve 完了直後 | 全チケットが reviewed になったかを確認する（find トリガー） |

```typescript
// tickets.ts — Tickets.json 読み込み・状態確認
import { readFileSync } from 'node:fs';

interface TicketsJson {
  phases: Array<{
    id: number;
    name: string;
    tickets: Array<{ id: number; phaseId: number; status: string; title: string }>;
  }>;
  metadata?: { source?: string };
}

// ① 各チケット処理前: 未処理チケットの特定
export function loadPendingTickets(ticketsPath: string): Array<{ id: number; phaseId: number; status: string; title: string }> {
  const raw = readFileSync(ticketsPath, 'utf8');
  const data: TicketsJson = JSON.parse(raw);
  return data.phases
    .flatMap((p) => p.tickets.map((t) => ({ ...t, phaseId: p.id })))
    .filter((t) => t.status !== 'reviewed')
    .sort((a, b) => a.id - b.id);
}

// ② resolve 完了後: 全チケット reviewed 検出
export function checkAllReviewed(ticketsPath: string): boolean {
  const raw = readFileSync(ticketsPath, 'utf8');
  const data: TicketsJson = JSON.parse(raw);
  return data.phases
    .flatMap((p) => p.tickets)
    .every((t) => t.status === 'reviewed');
}

// ③ find-omissions 実行時のソースパス取得
export function getSourceFromTickets(ticketsPath: string): string {
  const raw = readFileSync(ticketsPath, 'utf8');
  const data: TicketsJson = JSON.parse(raw);
  return data.metadata?.source ?? ticketsPath;
}
```

#### 4.2 書き込み方針

conver.js は Tickets.json に直接書き込みを行わない。Tickets.json のステータス更新はすべて Claude Code セッション内のスラッシュコマンド（`/make-ticket`, `/start-ticket`, `/review-ticket`, `/resolve-ticket`）が行う。conver.js は読み取り専用でアクセスする。

### 5. Slack 通知

#### 5.1 通知フォーマット

エラー発生時は以下の Markdown フォーマットで Slack に通知する：

```
■ conver エラー報告
• Tickets.json: /full/path/to/Tickets.json
• ユーザー: username
• チケット: P0-1 (チケットタイトル)
• 工程: make-ticket
• エラー種別: CommandTimeout
• 説明:
  > Claude Code のエラー説明（stopイベントのresponseテキスト）
```

#### 5.2 通知送信実装（notifier.ts）

```typescript
// notifier.ts — Slack通知
import https from 'node:https';
import { execSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

export interface ErrorContext {
  ticketId: string;
  phase: string;
  error: Error;
  ticketsPath: string;
}

function getUsername(): string {
  try {
    return execSync('whoami', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getAbsolutePath(relativePath: string): string {
  try {
    return realpathSync(relativePath);
  } catch {
    return relativePath;
  }
}

function classifyError(error: Error): string {
  if (error.name === 'CommandTimeoutError') return 'CommandTimeout';
  if (error.message?.includes('permission')) return 'PermissionDenied';
  if (error.message?.includes('ENOENT')) return 'FileNotFound';
  return 'Unknown';
}

function buildSlackMessage(context: ErrorContext): object {
  const absolutePath = getAbsolutePath(context.ticketsPath);
  const username = getUsername();
  const errorType = classifyError(context.error);

  const text = [
    `■ conver エラー報告`,
    `• Tickets.json: \`${absolutePath}\``,
    `• ユーザー: \`${username}\``,
    `• チケット: ${context.ticketId}`,
    `• 工程: ${context.phase}`,
    `• エラー種別: ${errorType}`,
    `• 説明:`,
    `  > ${context.error.message || '詳細情報なし'}`,
  ].join('\n');

  return {
    username: 'conver',
    icon_emoji: ':x:',
    text,
  };
}

async function sendSlackOnce(
  webhookUrl: string,
  payload: object,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const body = new URLSearchParams();
    body.append('payload', JSON.stringify(payload));

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Slack API returned ${res.statusCode}`));
        }
      },
    );

    req.on('error', (err) => reject(err));
    req.write(body.toString());
    req.end();
  });
}

async function sendSlackWithRetry(
  webhookUrl: string,
  payload: object,
  maxRetries: number = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sendSlackOnce(webhookUrl, payload);
      return;
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = 1000 * attempt; // 1s, 2s, 3s
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error(
          `[conver] Slack通知送信に失敗しました（${maxRetries}回試行）: ${err.message}`,
        );
      }
    }
  }
}

export async function sendSlackError(
  webhookUrl: string,
  context: ErrorContext,
): Promise<void> {
  const payload = buildSlackMessage(context);
  await sendSlackWithRetry(webhookUrl, payload);
}
```

#### 5.3 リトライ動作

Slack 通知の送信に失敗した場合、最大3回のリトライを行う（リトライ間隔は 1秒 → 2秒 → 3秒と exponential）。3回すべて失敗した場合は標準エラー出力にエラー内容を出力し、Slack通知は諦める。このリトライ失敗が原因でconver.js のメインループがさらにエラー状態になることはない。

### 6. エラーハンドリング

#### 6.1 エラー種別と対応

| エラー種別 | 発生条件 | 検出方法 | 対応 |
|---|---|---|---|
| CommandTimeout | コマンドが `--timeout` 秒以内に完了しない | `Date.now()` と経過時間の比較 | Slack通知 → ループ停止（exit 1） |
| SessionError | ACP セッションの初期化・通信に失敗 | `createSession` / `runCommand` の reject | Slack通知 → ループ停止（exit 1） |
| PermissionDenied | Claude Code が権限確認で応答不能 | `commandTimeout` またはエラーメッセージ解析 | Slack通知 → ループ停止（exit 1） |
| FileNotFound | Tickets.json が存在しない | `readFileSync` の ENOENT 例外 | Slack通知 → ループ停止（exit 1） |
| PushFailed | `/jpush-branch` がエラーを返す | `runCommand` の reject | Slack通知 → ループ停止（exit 1） |

#### 6.2 タイムアウト実装

```typescript
// error.ts — エラー型定義
export class CommandTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandTimeoutError';
  }
}

// runCommand 内のタイムアウト検出
// 各 nextUpdate() のループで経過時間をチェックする
const startTime = Date.now();
for (;;) {
  if (Date.now() - startTime > options.timeoutMs) {
    throw new CommandTimeoutError(
      `Command timed out: ${command} (${options.timeoutMs}ms)`,
    );
  }
  const msg = await session.nextUpdate();
  // ...
}
```

#### 6.3 エラーハンドリングの集中管理

すべてのエラー処理は `runner.ts` のループ制御内に一元化される：

```typescript
try {
  // 各工程の実行
} catch (error) {
  // 1. Slack 通知（3回リトライ）
  await sendSlackError(options.slackWebhookUrl, {
    ticketId,
    phase: currentPhase,
    error,
    ticketsPath: options.ticketsPath,
  });
  // 2. コンソールにエラー出力
  console.error(`\n❌ エラー発生: ${error.message}`);
  // 3. プロセス終了
  process.exit(1);
}
```

この一元化により、エラー通知が2箇所以上で呼ばれることはなく、通知フォーマットの一貫性が保証される。

### 7. モジュール分割構成

```
conver/
├── tsconfig.json           # TypeScript コンパイル設定
├── package.json            # ビルドスクリプト定義
├── src/
│   ├── conver.ts           # エントリポイント
│   ├── cli.ts              # CLI引数パース（副作用ゼロ）
│   ├── session.ts          # ACP セッション管理（spawn/run/dispose + DeepSeek V4環境変数注入）
│   ├── runner.ts           # ループ制御・Slack通知
│   ├── tickets.ts          # Tickets.json 読み込み・状態確認
│   ├── notifier.ts         # Slack通知送信
│   └── error.ts            # エラー型定義（CommandTimeoutError）
└── dist/
    └── conver.js           # ビルド成果物（tsc 出力）
```

各モジュールの責務：

| モジュール | 責務 | 公開関数 | 依存関係 |
|---|---|---|---|
| `cli.ts` | 引数パース、usage表示 | `parseCliOptions()` | `node:util` |
| `session.ts` | ACPセッション生成、コマンド実行、破棄、DeepSeek環境変数注入、withSession | `spawnAgent(apiKey, model)`, `buildClientApp()`, `createSession()`, `withSession()`, `runCommand()`, `disposeSession()` | `@agentclientprotocol/sdk`, `node:child_process`, `error.ts` |
| `runner.ts` | ループ制御、エラーハンドリング | `runLoop()` | `session.ts`, `notifier.ts`, `tickets.ts` |
| `tickets.ts` | Tickets.json読み込み、状態確認、ソースパス取得 | `loadPendingTickets()`, `checkAllReviewed()`, `getSourceFromTickets()` | `node:fs` |
| `notifier.ts` | Slack通知送信、リトライ | `sendSlackError()` | `node:https`, `node:child_process` |
| `error.ts` | エラー型定義 | `CommandTimeoutError` | なし |
| `conver.ts` | エントリポイント、モジュール統合 | `main()` | 上記全モジュール |

#### エントリポイント（src/conver.ts）

```typescript
// src/conver.ts — エントリポイント
import { parseCliOptions } from './cli.js';
import { runLoop } from './runner.js';

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv);

  console.log(`conver.js — チケット処理を開始します`);
  console.log(`  モデル:        ${options.model}`);
  console.log(`  Tickets.json: ${options.ticketsPath}`);
  console.log(`  最大処理数:   ${options.maxCount}`);
  console.log(`  Resolve間隔:  ${options.resolveEvery}`);
  console.log(`  Push:          ${options.pushEnabled ? '有効' : '無効'}`);
  console.log(`  タイムアウト:  ${options.timeoutMs / 1000}秒`);

  await runLoop(options);
}

main().catch((err: Error) => {
  console.error('致命的エラー:', err.message);
  process.exit(1);
});
```

---

## Implementation（実装詳細）

### 実装順序

以下の順序で実装することで、各モジュールのテストを逐次実行しながら進められる：

1. **`src/error.ts`** — 依存関係ゼロのため最初に実装
2. **`src/tickets.ts`** — `node:fs` のみに依存するため次に実装
3. **`src/cli.ts`** — `node:util` のみで完結するため次に実装
4. **`src/notifier.ts`** — `node:https` のみに依存するため独立してテスト可能
5. **`src/session.ts`** — ACP SDK + error.ts に依存、`createSession` / `withSession` / `runCommand` / `disposeSession` の単位でテスト可能
6. **`src/runner.ts`** — 上記5モジュールを統合するため最後に実装
7. **`src/conver.ts`** — エントリポイント、全体結合
8. **ビルド確認** — `npm run build` で `dist/conver.js` が生成されること

### 依存関係のインストール

```bash
# 依存関係のインストール（tools/conver 内で実行）
cd tools/conver && npm install
```

TypeScript は devDependency としてインストールされる。ランタイムの依存関係は `@agentclientprotocol/sdk` のみ。

### TypeScript ビルドパイプライン

ソースコードは TypeScript（`src/*.ts`）で記述し、`tsc` で `dist/` にコンパイルする。

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src/**/*.ts"]
}
```

#### package.json（ビルドスクリプト）

```json
{
  "name": "conver",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@agentclientprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

#### Makefile エントリ

```makefile
build-conver:
	cd tools/conver && npm run build

run-conver:
	cd tools/conver && node dist/conver.js $(ARGS)
```

#### ビルド・実行手順

```bash
# 1. 依存関係インストール
cd tools/conver && npm install

# 2. TypeScript コンパイル
cd tools/conver && npm run build
# → dist/conver.js が生成される

# 3. 実行
cd tools/conver && node dist/conver.js -k <key> -s <url>

# または Makefile 経由
make build-conver
make ARGS="-k <key> -s <url>" run-conver
```

### ACP バイナリ要件

`claude-agent-acp` バイナリが PATH に存在し、実行可能であること：

```bash
# 確認方法
which claude-agent-acp
claude-agent-acp --version

# 認証状態の確認
claude login --status
```

### ファイルパス要件

ACP プロトコルの仕様により、すべてのパスは絶対パスで渡す必要がある。Tickets.json のパスは入力を `path.resolve()` で絶対パスに変換してから渡す：

```typescript
import { resolve } from 'node:path';
const absolutePath = resolve(ticketsPath);
```

---

## Appendix（付録・参考）

### A. 実行例

```bash
# ビルド
cd tools/conver && npm run build

# 最小構成（-k と -s は必須）
cd tools/conver && node dist/conver.js -k sk-xxxx -s https://hooks.slack.com/services/T0.../B0.../key

# Pro モデル指定
cd tools/conver && node dist/conver.js -k sk-xxxx -s <webhook_url> -m deepseek-v4-pro

# 全フラグ指定
cd tools/conver && node dist/conver.js \
  -k sk-xxxx \
  -t ./my-project/Tickets.json \
  -c 5 \
  -r 1 \
  -p 1 \
  -m deepseek-v4-flash \
  -s https://hooks.slack.com/services/T0.../B0.../key \
  -v 1 \
  --timeout 3600

# help 表示
cd tools/conver && node dist/conver.js --help
```

### B. エラー通知の Slack 受信イメージ

```
■ conver エラー報告
• Tickets.json: `/Users/alice/project/Tickets.json`
• ユーザー: `alice`
• チケット: P0-1
• 工程: make-ticket
• エラー種別: CommandTimeout
• 説明:
  > Command timed out: /make-ticket P0-1 (1800000ms)
```

### C. 既存コードとの互換性

conver プロジェクト内の既存スクリプト（`install.js` 等）は CommonJS (`require`) で記述されているが、`conver.js` とその関連モジュールは ESM (`import`) で統一する。両者は Node.js の interop により共存可能であり、conver.js から既存スクリプトを直接 `import` することはないため、問題は発生しない。

### D. 動作環境

| 項目 | 要件 |
|---|---|
| Node.js | 18.0.0 以上 |
| TypeScript | 5.4.0 以上（devDependency） |
| DeepSeek API Key | 有効な API Key（-k フラグで指定） |
| claude-agent-acp | PATH にインストール済み |
| Claude Code 認証 | `claude login` 実行済み |
| npm パッケージ | `@agentclientprotocol/sdk`（dependency）、`typescript`（devDependency） |
| Slack Incoming Webhook | 有効な Webhook URL（-s フラグで指定） |
| 対応OS | macOS / Linux（Windows は未検証だが `node:child_process` の範囲では動作可能） |
