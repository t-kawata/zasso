外側ループは人間またはそれに専門家させたAIが行い、内側ループだけをACPを使用して自動化する conver.js の実装を計画します。使用するnpmライブラリは以下の通りです。

[https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp](https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp)
[https://github.com/agentclientprotocol/claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp)

まずは、このライブラリを使用して開発することによって、
```
node conver.js -t Tickets.json -c 12 -r 3
```
のように実行することによって reviewed のステータスになっていない一番上の未完了チケットから順にスラッシュコマンドを「-c フラグ」で指定したチケット数だけ自動で内部ループし、「-r フラグ」で指定したチケット数が完了するたびに resolve を実行するという実装が可能かを調査してください。この時、以下の要件も必要です。

1. make/plan/start はセッションIDが同じセッションで連続実行
2. reviewは上記1とは別のセッションIDのセッションで独立実行
3. resolve は -r フラグに依存して自動で動作しなければならないが、上記1,2とは別のセッションIDを持つ独立したセッションで実行
4. find は、Tickets.json の全てのチケットが reviewed になったことを検知するたびに自動で実行。上記1,2,3とは別のセッションIDを持つ独立したセッションで実行。

---

これで全ての必要情報が揃いました。調査結果をまとめます。

## 結論：実装は完全に可能です

`@agentclientprotocol/claude-agent-acp` を使って `conver.js` の要件をすべて実装できることが確認できました。以下に詳細な実装計画を示します。

***

## ACP プロトコルの基礎（確認済み）

`@agentclientprotocol/sdk` を使い、`claude-agent-acp` バイナリをサブプロセスとして spawn し、**ndjson（改行区切りJSON-RPC 2.0）** で通信します 。通信フローは3フェーズです ： [blog.smartbank.co](https://blog.smartbank.co.jp/entry/2026/01/22/110000)

1. `initialize` — プロトコルハンドシェイク
2. `session/new` — セッション作成（`cwd` 指定）
3. `session/prompt` — プロンプト送信（スラッシュコマンド含む）

スラッシュコマンドは **通常の `session/prompt` の `text` に `/make-ticket P0-1` のように書いて送信するだけ** です。`session/new` のレスポンスに `available_commands_update` として利用可能なカスタムコマンド一覧が返ってきます 。 [blog.smartbank.co](https://blog.smartbank.co.jp/entry/2026/01/22/110000)

***

## 4要件の実現方法（確認済み）

### 要件1: make/plan/start は同じセッションIDで連続実行

```js
// SessionBuilder.start() で1つのActiveSessionを保持し続ける
const session = await ctx.buildSession(cwd).start();
// 同じ session.sessionId で複数回 prompt()
await session.prompt("/make-ticket P0-1");
await session.prompt("/plan-ticket P0-1");
await session.prompt("/start-ticket P0-1");
```

`ActiveSession` は `session.sessionId` を保持し続けるので、同一セッションで連続実行できます 。 [zenn](https://zenn.dev/suwash/articles/agent-client-protocol_20260221)

### 要件2: review は別セッションIDで独立実行

`session/new` を別途呼んで新しい `ActiveSession` を作れば、異なる `sessionId` になります ： [blog.smartbank.co](https://blog.smartbank.co.jp/entry/2026/01/22/110000)

```js
// review用に別セッションを新規作成
const reviewSession = await ctx.buildSession(cwd).start();
await reviewSession.prompt("/review-ticket P0-1");
reviewSession.dispose();
```

### 要件3: resolve は -r フラグで N チケット完了ごとに自動実行

`conver.js` 側でカウンターを持ち、`reviewed` になったチケット数が `-r` フラグの倍数に達したとき、make/plan/start と同じセッションで `/resolve-ticket` を呼びます。

### 要件4: find は全チケット reviewed 検知で自動実行

`Tickets.json` を読んで全チケットの `status === "reviewed"` を確認後に `/find-omissions-for-next-rfc` を別プロセスのセッションで呼びます。

***

## 権限ハンドリング（重要）

`session/request_permission` が届いたとき、`bypassPermissions` モード設定か、クライアント側で最初の `allow_always` オプションを自動選択するハンドラが必要です ： [zenn](https://zenn.dev/suwash/articles/agent-client-protocol_20260221)

```js
// PermissionOptionKind: "allow_once" | "allow_always" | "reject_once" | "reject_always"
.onRequest(acp.methods.client.session.requestPermission, ({ params }) => {
  const allowOption = params.options.find(
    o => o.kind === "allow_always" || o.kind === "allow_once"
  );
  return { outcome: { outcome: "selected", optionId: allowOption.optionId } };
})
```

または `session/set_mode` で `bypassPermissions` に設定する方法もあります 。 [blog.smartbank.co](https://blog.smartbank.co.jp/entry/2026/01/22/110000)

***

## `conver.js` 全体アーキテクチャ

```
node conver.js -t Tickets.json -c 12 -r 3
```

```
conver.js
│
├── parseArgs() → { ticketsPath, count(-c), resolveEvery(-r) }
├── loadTickets(ticketsPath) → pending = 未 reviewed チケット一覧
│
├── [外側制御ループ: for i=0..count]
│   │
│   ├── 1. Inner Session (make/plan/start) ─ 1セッション維持
│   │   ├── spawn claude-agent-acp
│   │   ├── initialize + session/new  ← SessionA
│   │   ├── /make-ticket   {ticket.id}   ← readText() で完了待ち
│   │   ├── /plan-ticket   {ticket.id}
│   │   ├── /start-ticket  {ticket.id}   → status=done
│   │   └── SessionA 保持（resolve時に再利用 or dispose）
│   │
│   ├── 2. Review Session ─ 別セッション
│   │   ├── session/new  ← SessionB (新規 sessionId)
│   │   ├── /review-ticket {ticket.id}   → status=reviewed
│   │   └── SessionB.dispose()
│   │
│   ├── 3. resolveEvery チェック
│   │   └── reviewedCount % resolveEvery === 0
│   │       └── SessionA (または新セッション) で /resolve-ticket
│   │
│   └── 4. 全チケット reviewed チェック
│       └── allReviewed → /find-omissions-for-next-rfc
│
└── SessionA.dispose() + プロセス終了
```

***

## 実装コードスケルトン

```js
// conver.js  (ESM)
import { spawn } from "node:child_process";
import { Writable, Readable } from "node:stream";
import { readFileSync, writeFileSync } from "node:fs";
import * as acp from "@agentclientprotocol/sdk";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    t: { type: "string" },   // Tickets.json path
    c: { type: "string" },   // max tickets
    r: { type: "string" },   // resolve interval
  }
});

const CWD = process.cwd();
const TICKETS_PATH = args.t;
const MAX_COUNT = parseInt(args.c ?? "999");
const RESOLVE_EVERY = parseInt(args.r ?? "999");

// ── ACP セッション起動ユーティリティ ─────────────────────────────────
function spawnAgent() {
  const proc = spawn("claude-agent-acp", [], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, ACP_PERMISSION_MODE: "bypassPermissions" },
  });
  const stream = acp.ndJsonStream(
    Writable.toWeb(proc.stdin),
    Readable.toWeb(proc.stdout)
  );
  return { proc, stream };
}

// ── ClientApp 共通設定（permission 自動承認）──────────────────────────
function buildClientApp() {
  return acp
    .client({ name: "conver" })
    .onRequest(acp.methods.client.session.requestPermission, ({ params }) => {
      const opt = params.options.find(
        o => o.kind === "allow_always" || o.kind === "allow_once"
      );
      return { outcome: { outcome: "selected", optionId: opt.optionId } };
    })
    .onNotification(acp.methods.client.session.update, () => {});
}

// ── 1コマンド実行（既存の ActiveSession に送る）───────────────────────
async function runCommand(session, command) {
  session.prompt(command);
  for (;;) {
    const msg = await session.nextUpdate();
    if (msg.kind === "stop") return msg.response;
    // tool_call_update / agent_message_chunk などをログ出力
    if (msg.update.sessionUpdate === "agent_message_chunk") {
      process.stdout.write(msg.update.content.text ?? "");
    }
  }
}

// ── メインループ ──────────────────────────────────────────────────────
async function main() {
  const tickets = JSON.parse(readFileSync(TICKETS_PATH, "utf8"));
  const pending = tickets.phases
    .flatMap(p => p.tickets)
    .filter(t => t.status !== "reviewed");

  let reviewedCount = 0;

  // Inner Session (make/plan/start/resolve 共用)
  const { proc: innerProc, stream: innerStream } = spawnAgent();
  
  await buildClientApp().connectWith(innerStream, async (ctx) => {
    await ctx.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });
    
    // bypassPermissions モードに設定
    const innerSession = await ctx.buildSession(CWD).start();
    await ctx.request(acp.methods.agent.session.setMode, {
      sessionId: innerSession.sessionId,
      modeId: "bypassPermissions",
    });

    for (let i = 0; i < Math.min(pending.length, MAX_COUNT); i++) {
      const ticket = pending[i];
      const id = `P${ticket.phaseId}-${ticket.id}`;

      console.log(`\n▶ [${id}] make/plan/start`);
      await runCommand(innerSession, `/make-ticket ${id}`);
      await runCommand(innerSession, `/plan-ticket ${id}`);
      await runCommand(innerSession, `/start-ticket ${id}`);

      // Review は別セッション
      console.log(`\n▶ [${id}] review (独立セッション)`);
      const { proc: rvProc, stream: rvStream } = spawnAgent();
      await buildClientApp().connectWith(rvStream, async (rvCtx) => {
        await rvCtx.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {},
        });
        await rvCtx.buildSession(CWD).withSession(async (rvSess) => {
          await runCommand(rvSess, `/review-ticket ${id}`);
        });
      });
      rvProc.kill();

      reviewedCount++;

      // Resolve トリガー
      if (reviewedCount % RESOLVE_EVERY === 0) {
        console.log(`\n▶ resolve (${reviewedCount}件完了)`);
        await runCommand(innerSession, `/resolve-ticket ${CWD}`);
      }
    }

    // 全チケット reviewed チェック → find 自動実行
    const updated = JSON.parse(readFileSync(TICKETS_PATH, "utf8"));
    const allReviewed = updated.phases
      .flatMap(p => p.tickets)
      .every(t => t.status === "reviewed");

    if (allReviewed) {
      console.log(`\n🎯 全チケット reviewed → find-omissions 実行`);
      // find は別セッションで独立実行
      const { proc: findProc, stream: findStream } = spawnAgent();
      await buildClientApp().connectWith(findStream, async (fCtx) => {
        await fCtx.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {},
        });
        await fCtx.buildSession(CWD).withSession(async (fSess) => {
          const rfcPath = updated.metadata?.source ?? "./rfc.md";
          await runCommand(fSess, `/find-omissions-for-next-rfc ${rfcPath}`);
        });
      });
      findProc.kill();
    }

    innerSession.dispose();
  });

  innerProc.kill();
}

main().catch(console.error);
```

***

## 注意事項・落とし穴

| 項目 | 詳細 |
|---|---|
| **`session/set_mode`** | `bypassPermissions` は `claude-agent-acp` の `session/new` 後に設定。または env `ACP_PERMISSION_MODE=bypassPermissions` で起動時に指定が可能  [goose-docs](https://goose-docs.ai/docs/guides/acp-providers/) |
| **スラッシュコマンドのテキスト形式** | `session/prompt` の `text` に `/make-ticket P0-1` を平文で送るだけでOK。`available_commands_update` で確認済みのコマンドのみ使用  [blog.smartbank.co](https://blog.smartbank.co.jp/entry/2026/01/22/110000) |
| **`readText()` vs `nextUpdate()`** | `readText()` はテキストチャンクのみ集約。ツール呼び出しを観察するなら `nextUpdate()` ループを使う  [zenn](https://zenn.dev/suwash/articles/agent-client-protocol_20260221) |
| **`connectWith` のスコープ** | `connectWith` はコールバック終了時に自動でコネクションを閉じる。Inner Session は `start()` + 手動 `dispose()` で長命にする |
| **`session/new` と `cwd`** | ACP はすべてのパスを **絶対パス** で渡すことが要求される  [zenn](https://zenn.dev/suwash/articles/agent-client-protocol_20260221) |
| **Claude Code の認証** | `claude-agent-acp` は Claude Code CLI の認証情報（`~/.claude/`）を引き継ぐため、事前に `claude login` が必要  [goose-docs](https://goose-docs.ai/docs/guides/acp-providers/) |

実装は技術的に完全に可能です。`@agentclientprotocol/sdk` の `ClientApp` + `ActiveSession` API が、セッション分離・連続実行・ストリーム受信のすべてをネイティブにサポートしています 。 [zenn](https://zenn.dev/suwash/articles/agent-client-protocol_20260221)
