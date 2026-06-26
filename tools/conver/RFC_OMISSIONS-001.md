---
parent-rfc: /Users/kawata/shyme/zasso/tools/conver/RFC_ROOT.md
parent-omissions: OMISSIONS-001.md
---

# RFC OMISSIONS-001: conver.js RFC-001 における実装乖離5件の修正設計

## Abstract

本RFCは RFC-001（conver.js — ACP-based Ticket Processing Pipeline）において発見された5件の omission（実装漏れ2件、設計不一致1件、不整合2件）を解決するための修正設計書である。各 omission は独立した修正単位であり、RFC-001 のアーキテクチャや外部インターフェースを変更することなく、ソースコードおよび文書の修正によって解決される。TypeScript（ESM）で記述された7モジュールのうち、conver.ts / cli.ts / runner.ts / tickets.ts / session.ts の5モジュールと Makefile が修正対象となる。

## Motivation

RFC-001（conver.js）は二層構造の開発パイプラインにおける内部ループを完全自動化する ACP-based チケット処理パイプラインである。開発と並行して実装が進む過程で、以下の5件の乖離が発生した：

| ID | 種別 | 重要度 | 概要 |
|----|------|--------|------|
| O-001 | 実装漏れ | medium | 起動パラメータログが6項目中2項目のみ |
| O-002 | 実装漏れ | medium | ファイルパスの絶対パス変換が未実装 |
| O-003 | 設計不一致 | low | tickets.ts 公開関数が phaseId を欠落 |
| O-004 | 不整合 | low | RFC型名と実装型名の乖離（SDK更新） |
| O-005 | 不整合 | low | Makefile エントリの RFC 未反映 |

これらは個別には軽微に見えるが、以下の理由から放置すべきではない：

1. **起動パラメータログの欠落**は、運用時に指定された設定値が正しく反映されているかの確認を困難にする。特に maxCount や timeoutMs はデフォルト値に依存した場合に予期せぬ動作を引き起こす可能性がある。
2. **相対パスの未解決**は、ACP セッション内のカレントディレクトリが期待と異なる場合にファイル参照の不具合を招く。
3. **phaseId の欠落**は、チケットがどのフェーズに所属するかの情報を API 利用者が取得できない設計上の欠陥である。
4. **型名の乖離**は、保守者が RFC と実装のどちらが正しいかを判断できず、混乱を生む。
5. **Makefile エントリの未記載**は、新しい開発者が全タスクを把握できず、ビルド・テスト手順を見落とすリスクとなる。

## Design

本RFCでは5件の omission をそれぞれ独立した修正単位として扱う。相互依存は存在しないため、任意の順序で実装可能である。

### §1 起動パラメータログの完全化（O-001）

**決定**: 全6項目を key=value 形式の個別行で表示する。JSON ブロック形式は採用しない。

**根拠**: key=value 形式は以下の利点を持つ：
- 人間が目視確認する際に各パラメータの値を瞬時に把握できる
- `grep` によるフィルタリングが容易（`grep timeoutMs` で特定パラメータのみ抽出可能）
- 1行1項目のため、ログ解析ツールでのパースも容易

**変更イメージ**（現行の出力）:
```
conver.js — チケット処理を開始します
  モデル:        deepseek-v4-flash
  Tickets.json: ./Tickets.json
```

**変更後**:
```
conver.js — チケット処理を開始します
  model=deepseek-v4-flash
  ticketsPath=./Tickets.json
  maxCount=999999
  resolveEvery=3
  pushEnabled=true
  timeoutMs=1800000
```

### §2 ファイルパスの絶対パス変換（O-002）

**決定**: `path.resolve()` による絶対パス変換は cli.ts の `parseCliOptions()` でのみ行う。runner.ts は変換済みの絶対パスを受け取ることを前提とする。

**根拠**: パス変換を cli.ts という単一の入力窓口に集中させることで責任範囲が明確になる。runner.ts で二重に変換すると、変換元が相対パスか絶対パスかで挙動が変わる可能性があり混乱を招く。全文字列型オプションの一律変換は過剰であり、URL（slackWebhookUrl 等）を誤変換するリスクがあるため、ticketsPath のみを対象とする。

**影響範囲**:
- `cli.ts`: `parseCliOptions()` の戻り値構築時に `ticketsPath` を `path.resolve()` で変換
- `runner.ts`: `runLoop()` 内部の `cwd` 変数も同様に `path.resolve()` で絶対パス化

**備考**: `runner.ts` の `cwd` は `process.cwd()` の戻り値であり、通常は絶対パスが返る。しかし環境によってはシンボリックリンクを含むパスが返ることがあるため、明示的に `path.resolve()` を適用して正規化する。

### §3 phaseId 情報の一貫性確保（O-003）

**決定**: `tickets.ts` の公開関数 `loadPendingTickets()` で phaseId をチケットに付与し、戻り値の型 `Ticket` に `phaseId` フィールドを常に含める。`runner.ts` の非公開版 `loadPendingTickets()` は削除し、`tickets.ts` の公開関数に統一する。

**根拠**: 同一モジュール間で公開関数が phaseId を返さず、非公開関数だけが phaseId を付与する現状は API 設計として誤っている。公開関数が phaseId を返すことで、全ての呼び出し元で一貫した情報が得られる。`runner.ts` の非公開関数は `tickets.ts` の公開関数とほぼ同一のロジックであり、重複を排除することで保守性が向上する。

**影響範囲**:
- `tickets.ts`: `loadPendingTickets()` に phaseId 付与ロジックを追加
- `runner.ts`: 独自の `loadPendingTickets()` と `checkAllReviewed()` を削除し、`tickets.ts` の公開関数を import して使用

### §4 ACP SDK 型定義の整合性（O-004）

**決定**: RFC の型定義を実装（SDK 実態）に合わせて更新する。`session.ts` の型は変更しない。

**根拠**: SDK のバージョン更新に伴い型名が `acp.NdJsonStream` → `acp.Stream`、`acp.MonadClient` → `acp.ClientApp` に変更された。プロジェクト側で SDK の型名を上書きするのは不毛であり、RFC が実装に追従するのが現実的である。`session.ts` には SDK バージョンによる型名の差異を示すコメントを追記し、将来の SDK 更新時の参考情報とする。

**影響範囲**: RFC-001（RFC_ROOT.md）の型定義セクションのみ。ソースコードの変更は不要（すでに正しい型名で実装済み）。

**将来の注意**: 次回 SDK メジャーアップデート時に型名が再度変更される可能性がある。その場合は本件と同様に RFC を実装に追従させる方針を継続する。

### §5 Makefile エントリの完全記述（O-005）

**決定**: RFC §7（Makefile エントリ）に `test-conver` のエントリを追記する。`list-tickets` はユーザーの私用ヘルパーコマンドであるため、RFC には含めない。

**根拠**: 新しい開発者が `make test-conver` でテスト実行できることを RFC から把握できるようにするため。`list-tickets` はワークフローに必須ではない私的ユーティリティであるため、RFC に記載すると逆にノイズとなる。

**追加**: 併せて Makefile 自体にも各エントリに簡潔な説明コメントを追加し、ファイルを読んだだけで各ターゲットの目的が理解できるようにする。

## Implementation

### §1 実装: `src/conver.ts` — 起動パラメータログの完全化

現状の `main()` 関数では model と ticketsPath の2項目のみ表示している。全6項目を key=value 形式で表示するよう修正する。

```typescript
// src/conver.ts — 修正後
import { parseCliOptions } from "./cli.js";
import { runLoop } from "./runner.js";

export async function main(): Promise<void> {
  const options = parseCliOptions(process.argv);

  console.log("conver.js — チケット処理を開始します");
  console.log(`  model=${options.model}`);
  console.log(`  ticketsPath=${options.ticketsPath}`);
  console.log(`  maxCount=${options.maxCount}`);
  console.log(`  resolveEvery=${options.resolveEvery}`);
  console.log(`  pushEnabled=${options.pushEnabled}`);
  console.log(`  timeoutMs=${options.timeoutMs}`);

  await runLoop(options);
}

main().catch((err: Error) => {
  console.error("致命的エラー:", err.message);
  process.exit(1);
});
```

**差分**: 4行の `console.log` 追加。現行のインデント付き表記（`"  モデル:       " + options.model`）から key=value 形式に統一。

### §2 実装: `src/cli.ts` および `src/runner.ts` — 絶対パス変換

`cli.ts` の `parseCliOptions()` で `ticketsPath` を `path.resolve()` で絶対パスに変換する。`path` モジュールの `resolve` を import に追加する。

```typescript
// src/cli.ts — 修正箇所（冒頭の import と戻り値構築部分）
import { parseArgs } from "node:util";
import { resolve } from "node:path";

// ...（中略）...

export function parseCliOptions(argv: string[]): CliOptions {
  const parsed = parseArgs({ /* 変更なし */ });

  // ...（必須フラグ検証、変更なし）...

  return {
    apiKey: parsed.values["api-key"],
    model: parsed.values.model,
    ticketsPath: resolve(parsed.values.tickets),       // ← 絶対パス変換
    maxCount: parseInt(parsed.values.count, 10),
    resolveEvery: parseInt(parsed.values["resolve-every"], 10),
    pushEnabled: parsed.values.push === "1",
    slackWebhookUrl: parsed.values["slack-url"],
    verbose: parsed.values.verbose === "1",
    timeoutMs: parseInt(parsed.values.timeout, 10) * 1000,
  };
}
```

`runner.ts` では `runLoop()` 冒頭の `cwd` を絶対パスに正規化する。

```typescript
// src/runner.ts — 修正箇所（runLoop 関数内）
import { resolve } from "node:path";

// ...（中略）...

export async function runLoop(options: LoopOptions): Promise<void> {
  const cwd = resolve(process.cwd());                  // ← 絶対パス変換
  const pending = loadPendingTickets(options.ticketsPath);
  // ...
}
```

### §3 実装: `src/tickets.ts` および `src/runner.ts` — phaseId 統合

`tickets.ts` の `loadPendingTickets()` に phaseId 付与ロジックを追加する。

```typescript
// src/tickets.ts — loadPendingTickets 修正後
export function loadPendingTickets(ticketsPath: string): Ticket[] {
  const raw = readFileSync(ticketsPath, "utf-8");
  const data: TicketsJson = JSON.parse(raw);
  const pending: Ticket[] = [];

  for (const phase of data.phases) {
    for (const ticket of phase.tickets) {
      if (ticket.status !== "reviewed") {
        pending.push({ ...ticket, phaseId: phase.id }); // ← phaseId を付与
      }
    }
  }

  return pending;
}
```

`runner.ts` から非公開の `loadPendingTickets()` と `checkAllReviewed()` を削除し、`tickets.ts` の公開関数を import して使用する。

```typescript
// src/runner.ts — 修正後（冒頭の import に追加）
import { getSourceFromTickets, loadPendingTickets, checkAllReviewed } from "./tickets.js";
import type { Ticket } from "./tickets.js";

// ...（内部関数 loadPendingTickets と checkAllReviewed を削除）...

export async function runLoop(options: LoopOptions): Promise<void> {
  const cwd = resolve(process.cwd());
  const pending = loadPendingTickets(options.ticketsPath); // ← tickets.ts の公開関数
  // ...
  if (checkAllReviewed(options.ticketsPath)) {              // ← tickets.ts の公開関数
    // ...
  }
}
```

### §4 実装: 型定義の更新（RFC 文書のみ）

ソースコードの変更は不要。RFC-001（RFC_ROOT.md）の型定義セクションにおいて以下の型名を更新する：

| 旧（RFC 記載） | 新（実装に合わせる） |
|----------------|---------------------|
| `acp.NdJsonStream` | `acp.Stream` |
| `acp.MonadClient` | `acp.ClientApp` |

併せて `session.ts` の冒頭に以下のコメントを追記し、SDK バージョンによる型名の差異を明記する：

```typescript
// session.ts — 追記する注釈
//
// 注: 以下の型名は @agentclientprotocol/sdk ^1.0.0 の実態に基づく。
// SDK の旧バージョンでは acp.NdJsonStream / acp.MonadClient という
// 型名が使用されていたが、SDK 更新に伴い現在の型名に変更された。
// RFC-001（RFC_ROOT.md）の型定義も本実装に追従している。
```

### §5 実装: Makefile および RFC 文書の更新

Makefile に各エントリの説明コメントを追加する：

```makefile
# list-tickets: チケット一覧を表示する（私用ヘルパー）
list-tickets:
		node .claude/scripts/tickets/list-phases-and-tickets.js Tickets.json

# build-conver: TypeScript ソースを dist/ にコンパイルする
build-conver:
		npm run build

# run-conver: conver.js を実行する。ARGS で引数を渡す
run-conver:
		node dist/conver.js $(ARGS)

# test-conver: 全ユニットテストを実行する
test-conver:
		npm run build && node --experimental-test-module-mocks --test dist/error.test.js dist/cli.test.js dist/tickets.test.js dist/notifier.test.js dist/session.test.js dist/runner.test.js dist/conver.test.js
```

RFC-001（RFC_ROOT.md）の §7 に以下のエントリを追記する：

```markdown
| ターゲット | 説明 | 使用例 |
|-----------|------|--------|
| build-conver | TypeScript ソースを dist/ にコンパイル | `make build-conver` |
| run-conver | conver.js を実行（ARGS で引数指定） | `make run-conver ARGS="-k KEY -s URL"` |
| test-conver | 全ユニットテストを実行 | `make test-conver` |
```

## Appendix

### A. 修正影響マトリクス

| Omission | 修正ファイル | 変更行数 | 既存動作への影響 | テスト影響 |
|----------|-------------|----------|-----------------|-----------|
| O-001 | conver.ts | +4行 | ログ出力形式変更のみ、ロジック不変 | 出力文字列アサーション修正が必要 |
| O-002 | cli.ts, runner.ts | +3行 | ticketsPath が常に絶対パスに | 相対パス指定のテストケース追加推奨 |
| O-003 | tickets.ts, runner.ts | ~10行変更、~30行削除 | loadPendingTickets の戻り値に phaseId 追加 | runner.ts のテストを tickets.ts に統合 |
| O-004 | RFC_ROOT.md（文書のみ） | ~2行 | なし（文書修正のみ） | なし |
| O-005 | RFC_ROOT.md, Makefile | ~5行 | なし（コメント追加のみ） | なし |

### B. テスト観点

各修正に対応するテストケースの観点：

1. **O-001**: `conver.test.ts` で `main()` の出力が6行の key=value 形式であることを検証。現行の「モデル:」形式のアサーションを更新。
2. **O-002**: `cli.test.ts` で相対パス指定時に絶対パスが返ることを確認。`runner.test.ts` で `cwd` が絶対パスであることを確認。
3. **O-003**: `tickets.test.ts` で `loadPendingTickets()` の戻り値全件に `phaseId` が含まれることを確認。`runner.test.ts` で独自の `loadPendingTickets` 依存テストを `tickets.test.ts` に移行。
4. **O-004**: 型チェック（`npm run build`）でエラーが出ないことを確認。
5. **O-005**: `make test-conver` が正常実行されることを確認。

### C. 実装順序

依存関係のない独立した修正であるため任意の順序で実装可能だが、以下の順序を推奨する：

1. `tickets.ts` + `runner.ts`（O-003: 重複排除は他の修正のベースとなる）
2. `cli.ts` + `runner.ts`（O-002: パス変換）
3. `conver.ts`（O-001: ログ出力）
4. `session.ts` コメント追記（O-004: SDK 型名注釈）
5. `Makefile` + `RFC_ROOT.md`（O-005: 文書更新）

### D. 検証手順

```bash
# 1. 型チェック
npm run build

# 2. 全テスト実行
make test-conver

# 3. ログ出力確認（O-001）
node dist/conver.js -k test-key -s http://example.com/webhook 2>&1 | head -8
# 期待: model=... ticketsPath=... maxCount=... resolveEvery=... の6行が表示される
```
