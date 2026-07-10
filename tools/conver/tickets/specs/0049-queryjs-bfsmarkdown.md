---
ticket_id: 49
title: query.js -- BFSマルチホップ探索＋行番号動的解決＋Markdown整形
slug: queryjs-bfsmarkdown
status: draft
created_at: 2026-07-06
updated_at: 2026-07-06
---
# query.js -- BFSマルチホップ探索＋行番号動的解決＋Markdown整形

## Summary

query.js は graphify-rfc パイプラインにおけるグラフ探索機構の中核を担う。
ノードID起点の BFS（幅優先探索）で最大 N ホップ先までグラフを探索し、
実行時に行番号を動的に再計算（マーカー方式）し、結果を Markdown 形式で整形出力する。
読み取り専用で副作用ゼロ、マーカー欠損時は部分結果と stderr 通知を行う。

## Background

graphify-rfc パイプラインの Layer 2（グラフ探索機構）を構成する。
RFC-GRAPHIFY.md で定義されたグラフ構造（ノード・エッジ）を機械的に探索するために必要。

既に実装済みの関連スクリプト：
- P13-2: crud.js（グラフの読み書き唯一経路） — 完了済み
- P14-1: verify.js / embed-markers.js（検証・マーカー埋め込み） — 完了済み

query.js はこれら既存スクリプトが生成したグラフファイルとマーカー付きソース文書を
読み取り専用で使用し、探索結果を提供する。

RFC設計上の要求：
1. **行番号参照の脆さの解決**: 文書編集により行番号が変化しても、マーカー（`::REF<N>-START::` / `::REF<N>-END::`）を起点に動的に再計算する
2. **機械的探索**: AIの推論に頼らない決定論的なグラフ探索
3. **人間可読な出力**: Markdown形式で整形し、後続の formulate 連携で再利用可能にする

## Scope

### 対象ファイル（新規作成）
- `.claude/scripts/rfc-graph/query.js` — BFSマルチホップ探索 + 行番号動的解決 + Markdown整形 の全実装

### 対象ファイル（テスト追加）
- `tests/rfc-graph/query.test.cjs` — 以下のユニットテストを実装

### 実装内容

1. **CLI引数パース**（既存スクリプトと統一形式）
   - `query.js --graph=<path> --source=<path> --id=<nodeId> --hops=<N> [--dirs-tree=<path>]`
   - `--help` / `-h` で usage 表示
   - 引数不足・不正形式は 3段テンプレートエラーで stderr 出力し exit code 1
   - `--id` 未指定・空の場合はエラー
   - `--hops` 未指定の場合はデフォルト値 1
   - `--hops=0` はエラー（最低1）

2. **グラフ・ソースファイル読み込み**
   - JSON パース失敗は 3段テンプレートエラー
   - ファイル不在は 3段テンプレートエラー

3. **BFSマルチホップ探索**（RFC-GRAPHIFY.md §4.4 の疑似コードを実装）
   - `multiHopBFS(graph, startNodeId, hops) → { nodeIds: string[], edges: Edge[] }`
   - 無向グラフとして扱う（from→to / to→from 両方向）
   - visited Map で訪問管理（<nodeId, depth>）
   - depth >= hops のノードはキューに入れない
   - 同一エッジの重複追加を防止（エッジIDによる Set 管理）
   - 戻り値には startNodeId を含む

4. **実行時行番号動的解決**（RFC-GRAPHIFY.md §4.4 の疑似コードを実装）
   - `resolveCurrentLines(sourceText, refId) → Array<{startLine, endLine}>`
   - ソーステキストを1行ずつスキャンし、`::${refId}-START::` / `::${refId}-END::` マーカーを検出
   - START/END ペアを ranges として収集
   - マーカー欠損の refId については stderr に警告（3段テンプレート）
   - 部分結果で続行（終了コード0）

5. **Markdown整形出力**（RFC-GRAPHIFY.md §4.4 の出力フォーマット）
   - ノードごとに Markdown セクションを出力
   - フォーマット:
     ```
     ## N{nodeId}: {title}

     **種別**: {kind} | **参照**: {refId} (現在 L{startLine}-L{endLine})

     {summary}

     ### 関係 ({type} / {weight})
     - {direction} → N{targetId} ({title}) [{weight}]
     ```
   - エッジ情報は type ごとにグループ化（`depends_on`, `refines`, `implements` 等）
   - エッジがないノードは「### 関係 (なし)」を出力
   - nodes と edges の出力順は一貫性を持たせる（ノードはグラフ内の配列順、エッジは from→to 順）

## Non-scope

- **formulate連携スクリプト load-rfc-graph.js / dump-ticket-graph-commands.js**: P16-2 で対応
- **スラッシュコマンド graphify-rfc.md**: P16-1 で対応（query.js を子プロセス呼び出しする）
- **APIサーバー・Webインターフェース**: 本チケットではCLIのみ
- **グラフファイルの書き込み**: query.js は読み取り専用（書き込み経路は crud.js のみ）
- **複数グラフの同時探索**: 本チケットでは単一グラフファイルのみ対象
- **ファイル変更**: 既存の conver.js ソース・dist・node_modules 等は一切変更しない

## Investigation

### 設計根拠（RFC-GRAPHIFY.md §4.4）

RFC-GRAPHIFY.md の §4.4 で query.js の詳細設計が定義されている。

**BFS探索のコア疑似コード**（RFC-GRAPHIFY.md:520-544）:
```javascript
function multiHopBFS(graph, startNodeId, hops) {
  const visited = new Map([[startNodeId, 0]]);
  const queue = [startNodeId];
  const resultEdges = [];

  while (queue.length) {
    const current = queue.shift();
    const depth = visited.get(current);
    if (depth >= hops) continue;

    for (const edge of graph.edges) {
      const neighbor = edge.from === current ? edge.to
                      : edge.to === current ? edge.from
                      : null;
      if (!neighbor) continue;
      resultEdges.push(edge);
      if (!visited.has(neighbor)) {
        visited.set(neighbor, depth + 1);
        queue.push(neighbor);
      }
    }
  }
  return { nodeIds: [...visited.keys()], edges: resultEdges };
}
```

無向グラフとして扱い、from/to 両方向を探索する。

**行番号動的解決のコア疑似コード**（RFC-GRAPHIFY.md:549-563）:
```javascript
function resolveCurrentLines(sourceText, refId) {
  const lines = sourceText.split('\n');
  const ranges = [];
  let start = null;
  lines.forEach((line, i) => {
    if (line.includes(`::${refId}-START::`)) start = i + 1;
    if (line.includes(`::${refId}-END::`) && start !== null) {
      ranges.push({ startLine: start, endLine: i + 1 });
      start = null;
    }
  });
  return ranges;
}
```

### 出力フォーマット（RFC-GRAPHIFY.md:569-579）:
```markdown
## N0001: 認証API定義

**種別**: api_contract | **参照**: REF001 (現在 L42-L58)

RESTful API によるユーザー認証のエンドポイント定義。
POST /api/v1/auth/login および POST /api/v1/auth/refresh を含む。

### 関係 (depends_on / hard)
- depends_on → N0003 (トークン検証ロジック) [hard]
```

### CLI契約（RFC-GRAPHIFY.md:277-278）:
```
query.js --graph=<path> --source=<path> --id=<nodeId> --hops=<N> [--dirs-tree=<path>]
```

### エラー処理プロトコル（RFC-GRAPHIFY.md:294-317）:
全スクリプト統一:
- エラー時は終了コード1、stderrに3段テンプレート
- マーカー欠損時は部分結果+stderr通知、終了コード0
- 副作用ゼロ（読み取り専用）

### 既存スクリプトの解析（パターン確認）

**crud.js**（`/Users/kawata/shyme/zasso/tools/conver/.claude/scripts/rfc-graph/crud.js`）:
- `#!/usr/bin/env node` shebang
- CLI引数パース: `--graph=` プリフィックスによる定数管理
- `parseArguments()` はテスト用に `testArgs` パラメータを受付
- エラーは throw → main() で catch → 3段テンプレート出力
- 関数名は動詞句形式（`parseArguments`, `createEmptyGraph`）
- 定数は UPPER_SNAKE_CASE

**verify.js**（`/Users/kawata/shyme/zasso/tools/conver/.claude/scripts/rfc-graph/verify.js`）:
- `parseArguments(testArgs)` — testArgs 省略時は process.argv
- main() は `try { ... } catch (e) { printError(e); process.exit(EXIT_FAILURE); }` 構造
- printUsage() 関数でヘルプ表示
- ファイル読み込み: `fs.readFileSync(path, 'utf8')`

### グラフファイルのスキーマ（P12-1 で定義済み）

グラフJSONは以下の構造を持つ（RFC-GRAPHIFY.md §3.2）:
```json
{
  "sourceFile": "RFC-GRAPHIFY.md",
  "nodes": [
    { "id": "N0001", "title": "...", "kind": "...", "summary": "...",
      "sourceRanges": [{ "refId": "REF001", "startLine": 42, "endLine": 58 }] }
  ],
  "edges": [
    { "from": "N0001", "to": "N0003", "type": "depends_on",
      "attributes": { "strength": "hard", "bidirectional": false } }
  ]
}
```

## Test Plan

### ユニットテスト計画

テストファイル: `tests/rfc-graph/query.test.cjs`
既存テスト（crud.test.cjs:15165B, embed-markers.test.cjs:11112B, verify.test.cjs:13663B）と同等の規模・スタイルで実装する。

monkey-patch によるモック手法（既存テストと同一パターン）:
- `fs.readFileSync` / `fs.writeFileSync` を Monkey-patch してファイル I/O をエミュレート
- `process.exit` を Monkey-patch して exit code をキャプチャ
- `console.log` / `console.error` を Monkey-patch して出力を検証

#### テストケース一覧

**正常系—BFS探索:**

| # | テスト名 | 内容 | 備考 |
|---|---------|------|------|
| 1 | `multiHopBFS 1ホップ` | startNode の直接接続エッジのみ返す | visited に startNodeId を含む |
| 2 | `multiHopBFS 2ホップ` | 2ホップ先まで探索可能 | 間接接続ノードまで到達 |
| 3 | `multiHopBFS 最大ホップ制限` | hops=3 で正しく制限される | depth >= hops でキューに入れない |
| 4 | `multiHopBFS 孤立ノード` | エッジがないノードは自身のみ返す | startNodeId のみの visited |
| 5 | `multiHopBFS 循環グラフ` | 循環参照で無限ループしない | visited Map でガード |
| 6 | `multiHopBFS 重複エッジ` | 同一エッジが結果に重複しない | エッジIDによるSet管理 |

**正常系—行番号動的解決:**

| # | テスト名 | 内容 |
|---|---------|------|
| 7 | `resolveCurrentLines 正常` | START/ENDマーカーが存在する範囲を正しく解決 |
| 8 | `resolveCurrentLines 複数範囲` | 同一 refId が複数範囲を持つ場合 |
| 9 | `resolveCurrentLines マーカー変更後` | 行挿入後の行番号変化に対応 |

**正常系—Markdown整形:**

| # | テスト名 | 内容 |
|---|---------|------|
| 10 | `formatNodeMarkdown 基本` | ノード情報を正しいMarkdownに整形 |
| 11 | `formatNodeMarkdown エッジあり` | エッジ情報を type ごとにグループ化 |
| 12 | `formatNodeMarkdown エッジなし` | エッジがない場合は「(なし)」表示 |
| 13 | `formatNodeMarkdown 双方向エッジ` | from/to の方向性を正しく表示 |

**正常系—統合:**

| # | テスト名 | 内容 |
|---|---------|------|
| 14 | `main 正常探索` | --graph --source --id --hops で正しいMarkdown出力 |
| 15 | `main --help` | ヘルプメッセージを表示して exit code 0 |
| 16 | `main --ids 複数指定` | カンマ区切り複数ノードIDに対応 |
| 17 | `main --hops 省略時デフォルト` | hops 未指定で1ホップ探索 |

**異常系:**

| # | テスト名 | 内容 | 期待 |
|---|---------|------|------|
| 18 | 引数不足（--graph のみ） | エラーメッセージ + exit code 1 | throw または printError + exit(1) |
| 19 | 引数不足（引数なし） | エラーメッセージ + exit code 1 | 同上 |
| 20 | 存在しないグラフファイル | ファイル不在の3段テンプレート | printError + exit(1) |
| 21 | 存在しないソースファイル | ファイル不在の3段テンプレート | printError + exit(1) |
| 22 | 存在しないノードID | 該当なしのエラー | printError + exit(1) |
| 23 | hops=0 指定 | hops は最低1のエラー | printError + exit(1) |
| 24 | 不正グラフJSON | パース失敗の3段テンプレート | printError + exit(1) |
| 25 | --id 未指定 | id 必須のエラー | printError + exit(1) |
| 26 | --id が空文字 | id 必須のエラー | printError + exit(1) |

**異常系—マーカー欠損（部分結果で続行）:**

| # | テスト名 | 内容 | 期待 |
|---|---------|------|------|
| 27 | マーカー欠損ノード | マーカーが見つからない refId がある | stderrに警告 + Markdown出力(行番号: "N/A") + exit code 0 |
| 28 | 全ノードマーカー欠損 | 全ノードのマーカーが見つからない | 全ノードの行番号 "N/A" + exit code 0 |

#### カバレッジ目標

- 全関数ラインカバレッジ: 95%以上
- BFS/multiHopBFS: 100%（純粋関数、6テストで完全網羅）
- 行番号解決/resolveCurrentLines: 100%（純粋関数、3テストで完全網羅）
- Markdown整形/formatNodeMarkdown: 100%（純粋関数、4テストで完全網羅）
- メイン/main 統合: 85%以上（exit path のバリエーションは選択的カバレッジ）

### ユニットテスト不可能な項目（例外）

該当なし。query.js は全関数が以下の条件を満たすため、ユニットテストで完全検証可能:
- 全ての外部依存（ファイル読み込み）は `fs.readFileSync` の Monkey-patch でモック可能
- 純粋関数（BFS、行番号解決、Markdown整形）は入出力の検証のみで完結
- エラー出力（stderr）は `console.error` の Monkey-patch で検証可能

## Boy Scout Rule — 翻訳可能性計画

query.js は新規作成のため、既存コードの翻訳可能性修正は本チケットで触る範囲に限定する。

### query.js 内での遵守事項

1. **関数名は動詞句**:
   - `multiHopBFS()` — BFSマルチホップ探索を実行
   - `resolveCurrentLines()` — 行番号を動的に解決
   - `formatNodeMarkdown()` — ノード情報をMarkdownに整形
   - `parseArguments()` — CLI引数をパース
   - `printUsage()` — 使用方法を表示
   - `printError()` — 3段テンプレートエラーを出力

2. **変数名はドメイン概念を表現**:
   - `visited`（訪問済みノードMap）、`queue`（探索キュー）
   - `resultEdges`（結果エッジ配列）、`sourceText`（ソース全文）
   - `refId`（参照ID）、`ranges`（行範囲配列）

3. **一関数一責務**:
   - `multiHopBFS` は探索のみ、整形は `formatNodeMarkdown`
   - `resolveCurrentLines` は行番号解決のみ、出力は呼び出し元
   - `main` は全体の流れを制御し、細分化された関数を呼び出す

4. **ハードコード値は名前付き定数**:
   - `GRAPH_PATH_ARG_PREFIX = '--graph='`
   - `SOURCE_PATH_ARG_PREFIX = '--source='`
   - `NODE_ID_ARG_PREFIX = '--id='`
   - `HOPS_ARG_PREFIX = '--hops='`
   - `EXIT_SUCCESS = 0`, `EXIT_FAILURE = 1`

5. **エラー握りつぶし禁止**:
   - 全ての `fs.readFileSync` は try-catch で囲む
   - JSONパースは try-catch でエラーメッセージを明示
   - throw しないアプローチ（verify.js と統一） → catch 内で printError + process.exit(1)

6. **翻訳可能性の検証**:
   `main()` 関数は以下の逐語訳が可能であること:
   ```
   引数をパースする →
   グラフファイルを読み込む →
   ソースファイルを読み込む →
   ノードを解決する →
   行番号を動的に解決する →
   結果をMarkdown形式で整形する →
   標準出力に出力する
   ```

### 既存スクリプトへの影響

本チケットは新規ファイル（query.js）のみを作成するため、既存スクリプトの翻訳可能性を
直接改善する機会はない。ただし以下の準拠パターンを query.js で採用することで、
結果的に全体の一貫性が向上する:

- エラー処理プロトコル（3段テンプレート）の統一（verify.js と同一パターン）
- CLI引数パースの定数プリフィックス方式（crud.js と同一パターン）
- `parseArguments(testArgs)` のテスト引数受付（verify.js と同一パターン）

## Acceptance Criteria

### 探索機能
- [ ] `--id=N0001 --hops=1` で起点ノード + 直接接続ノードを返す
- [ ] `--id=N0001 --hops=2` で2ホップ先まで探索可能
- [ ] 無向グラフとして from/to 両方向を探索する
- [ ] 循環グラフで無限ループしない
- [ ] 孤立ノードは自身のみを結果に含む
- [ ] 同一エッジの重複出力がない

### 行番号動的解決
- [ ] マーカー `::REF<N>-START::` / `::REF<N>-END::` を正しく検出する
- [ ] マーカー欠損時は stderr に警告 + 行番号 "N/A" で部分結果を出力する
- [ ] 複数の sourceRanges を正しく解決する
- [ ] ソース文書に行が挿入されても正しい新行番号を返す

### Markdown整形
- [ ] ノードごとに Markdown セクションが出力される
- [ ] エッジ情報は type ごとにグループ化される
- [ ] エッジがないノードは「### 関係 (なし)」と表示される
- [ ] from/to の方向性が正しく表示される（→ / ←）

### エラー処理
- [ ] 引数不足時は 3段テンプレートエラー + exit code 1
- [ ] ファイル不在時は 3段テンプレートエラー + exit code 1
- [ ] 存在しないノードIDはエラー + exit code 1
- [ ] hops=0 はエラー + exit code 1
- [ ] 不正なJSONはパースエラー + exit code 1
- [ ] --help で usage を表示し exit code 0

### 品質
- [ ] ユニットテストカバレッジ95%以上
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テスト（crud/verify/embed-markers/update-step-status）がすべて通過している
- [ ] `[::STUB::]` マーカーの未付与スタブがない
- [ ] `console.log` が本番コードに残っていない

## Notes

### 依存関係
- **先行実装必須**: P12-1（JSON Schema定義）→ P13-2（crud.js）→ P14-1（verify.js/embed-markers.js）→ **本チケット P15-1** → P16-1（スラッシュコマンド）
- 既存スクリプト（crud.js, verify.js, embed-markers.js）が生成するグラフファイルを入力として使用する
- 既存テスト（crud.test.cjs, verify.test.cjs, embed-markers.test.cjs）は本チケットのテスト実行前にすべて通過している必要がある

### 設計上の注意点
- query.js はグラフファイルを読み取り専用で使用する（書き込み経路は crud.js のみ）
- `multiHopBFS` 関数は無向グラフ（from→to / to→from 両方向）として実装する
- 行番号解決は embed-markers.js が挿入したマーカーに依存する
- 出力フォーマットは RFC-GRAPHIFY.md §4.4 の Markdown テンプレートに厳密に従う

### 関連ファイル

| 役割 | ファイルパス |
|------|-------------|
| 実装スクリプト | `.claude/scripts/rfc-graph/query.js` |
| テスト | `tests/rfc-graph/query.test.cjs` |
| 設計文書 | `RFC-GRAPHIFY.md` (§3.7 CLI契約、§4.4 query.js詳細設計) |
| グラフスキーマ | `.claude/scripts/rfc-graph/schema/` (P12-1) |
| 既存テスト(参照) | `tests/rfc-graph/*.test.cjs` |

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
