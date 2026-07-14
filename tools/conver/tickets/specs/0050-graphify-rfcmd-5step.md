---
ticket_id: 50
title: graphify-rfc.md スラッシュコマンド（5Step進行制御＋エラーハンドリング）
slug: graphify-rfcmd-5step
status: draft
created_at: 2026-07-06
updated_at: 2026-07-06
---
# graphify-rfc.md スラッシュコマンド（5Step進行制御＋エラーハンドリング）

## Summary

`.claude/commands/graphify-rfc.md` スラッシュコマンドを新規作成する。
コマンドは長大Markdown設計文書を入力として受け取り、5Stepの進行制御（Step 1: ノード分割 → Step 2: エッジ付与 → Step 3: 機械検証 → Step 4: マーカー埋め込み → Step 5: 自己検証）を update-step-status.js と連携して実行し、グラフ化結果を報告するスラッシュコマンドテンプレートである。

基盤スクリプト（crud.js / verify.js / embed-markers.js / query.js / update-step-status.js）は既に P12〜P15 で全て実装済みである。本チケットではこれらをスラッシュコマンド内から呼び出す制御フローを記述する。

## Background

graphify-rfc パイプラインは、RFC設計文書をI/O境界単位の細粒度ノードに分割し、属性付きエッジで結んだグラフ構造として永続化する。このグラフは formulate-tickets がチケット分解の品質と再現性を向上させるために利用する。

P12〜P15 で6つの基盤スクリプト（crud.js / verify.js / embed-markers.js / query.js / update-step-status.js / schema/validate.js）とそのテストが全て完了した。残るはこれらを統一的に呼び出すスラッシュコマンド（graphify-rfc.md）および formulate 連携スクリプト（P16-2）である。

本チケット P16-1 ではスラッシュコマンド本体のみを実装する。スラッシュコマンドは Markdown テンプレートであり、Claude Code の `/graphify-rfc <source-file-path>` として解釈・実行される。各Stepは Claude が手順に従ってスクリプトを呼び出す形となる。

### アーキテクチャ上の位置づけ

```
RFC設計文書 (Markdown)
    │ /graphify-rfc <path>
    ▼
[graphify-rfc.md スラッシュコマンド]
    │
    ├── Step 1: crud.js create-nodes       ─── ノード分割
    ├── Step 2: crud.js create-edges       ─── エッジ付与
    ├── Step 3: verify.js --graph --source ─── 機械検証（未カバー行/孤立ノード検出）
    ├── Step 4: embed-markers.js           ─── マーカー埋め込み
    └── Step 5: query.js --id= --hops=2   ─── 自己検証
        │
        ▼
    グラフファイル + マーカー付きRFC文書
        │
        ▼ (P16-2 で対応)
    formulate-tickets 連携
```

## Scope

### 対象ファイル（新規作成）
- `.claude/commands/graphify-rfc.md` — 5Step進行制御 + 導出パス + エラーハンドリングの全文

### 対象ファイル（テスト追加）
- `tests/rfc-graph/graphify-cmd.test.cjs` — 各Stepの制御フロー・導出パス検証の結合テスト

### 実装内容

1. **コマンド frontmatter**
   - `argument-hint: <source-file-path>`
   - `allowed-tools: Read, Write, Bash`
   - `description`: 長大Markdown文書をマルチホップグラフ検索可能な構造へ変換する

2. **導出パス計算**
   - `graphPath="$(dirname "$1")/$(basename "$1" .md)-GRAPH.json"`
   - `statusPath="$(dirname "$1")/$(basename "$1" .md)-GRAPHIFY-Status.json"`
   - 引数 `$1` が空の場合は使用方法を表示して終了

3. **5Step進行制御（各Stepの詳細）**

   **Step 1: ノード分割**
   1. `update-step-status.js --graphify-status="$statusPath" start-step 1`
   2. ノードJSONを一時ファイルに書き、`crud.js create-nodes` で投入
   3. `update-step-status.js --graphify-status="$statusPath" end-step 1`
   - ノード分割ルール: 3軸（セクション階層 + kind + 外部依存有無）で意味的I/O境界を特定
   - 100行超セクションは必ず複数ノードに分割
   - graphify は formulate より常に細かい粒度（発散）

   **Step 2: エッジ付与**
   1. `update-step-status.js --graphify-status="$statusPath" start-step 2`
   2. エッジJSONを一時ファイルに書き、`crud.js create-edges` で投入
   3. `update-step-status.js --graphify-status="$statusPath" end-step 2`
   - 10種エッジタイプから適切な関係を選択
   - 全ノードが最低1本のエッジを持つことを確認

   **Step 3: 機械検証**
   1. `update-step-status.js --graphify-status="$statusPath" start-step 3`
   2. `verify.js --graph="$graphPath" --source="$1"`
   3. 結果に応じた分岐:
      - 未カバー行報告 → `reset-to-step 1` でStep 1に戻り修正
      - 孤立ノード報告 → `reset-to-step 2` でStep 2に戻り修正
      - `{"ok":true}` → `end-step 3` でStep 4へ
   4. `{"ok":true}` が返るまでループ

   **Step 4: マーカー埋め込み**
   1. `update-step-status.js --graphify-status="$statusPath" start-step 4`
   2. `embed-markers.js --graph="$graphPath" --source="$1"`
   3. エラー時は `fail-step 4` で記録して終了
   4. `update-step-status.js --graphify-status="$statusPath" end-step 4`

   **Step 5: 自己検証**
   1. `update-step-status.js --graphify-status="$statusPath" start-step 5`
   2. グラフ内の任意ノードIDを1つ選び、`query.js --graph="$graphPath" --source="$1" --id=<任意ノードID> --hops=2`
   3. 失敗時の復帰: 原因特定 → 該当Stepに `reset-to-step N` で戻る
   4. `update-step-status.js --graphify-status="$statusPath" end-step 5`

4. **エラーハンドリング**
   - 各スクリプト呼び出しのエラーに対応する3段テンプレートエラー記述:
     - `[ERROR]` 行でエラー種別
     - `原因:` 行で原因説明
     - `対応:` 行で復帰手順（reset-to-step N）
   - `fail-step N` によるステータス記録
   - エラー発生時の復帰フローを各Stepに明記

5. **完了報告**
   - 生成されたグラフファイルパス
   - ノード数・エッジ数・REF数
   - 検証結果（verify.js の出力サマリ）
   - 完了後、formulate-tickets から利用可能になることの明記

## Non-scope

- **formulate連携スクリプト（load-rfc-graph.js / dump-ticket-graph-commands.js）**: P16-2 で対応
- **既存スクリプトの改修**: 全6スクリプト（crud/verify/embed-markers/query/update-step-status/validate）はP12〜P15で完了済み。本チケットでは一切変更しない
- **conver.js ソース・dist・node_modules**: 変更しない
- **APIサーバー・Webインターフェース**: 対象外
- **グラフファイルの手動編集**: 書き込み経路は crud.js のみ
- **複数グラフの同時処理**: 本チケットでは単一RFCのみ対象
- **acceptance-criteria-test.sh**: P16-2 で対応（RFC §4.7 の結合テスト）

## Investigation

### 設計根拠（RFC-GRAPHIFY.md §4.5〜§4.6）

RFC-GRAPHIFY.md の §4.5 で update-step-status.js の実装コード例が、§4.6 でスラッシュコマンドの完全テンプレートが定義されている。

**§4.6 スラッシュコマンドテンプレート**（L628-L694）:
- frontmatter: argument-hint, allowed-tools, description
- Step 1〜5 の完全な制御フロー記述
- 導出パス（graphPath / statusPath）の計算式
- エラー時の復帰フロー（reset-to-step N）
- 完了報告テンプレート

### 既存基盤スクリプトの状態確認（全6スクリプト実装済み）

各スクリプトのCLI契約（RFC-GRAPHIFY.md §3.7）:

| スクリプト | CLI形式 | 役割 |
|-----------|---------|------|
| crud.js | `crud.js create-nodes --graph=<path>` <br> `crud.js create-edges --graph=<path>` | ノード・エッジの書き込み |
| verify.js | `verify.js --graph=<path> --source=<path>` | 未カバー行・孤立ノード検証 |
| embed-markers.js | `embed-markers.js --graph=<path> --source=<path>` | 冪等マーカー埋め込み |
| query.js | `query.js --graph=<path> --source=<path> --id=<nodeId> --hops=<N>` | BFSマルチホップ探索 |
| update-step-status.js | `update-step-status.js --graphify-status=<path> <subcommand> <stepN>` | 進行管理（5サブコマンド） |
| schema/validate.js | `validate.js <graph-path> <schema-type>` | スキーマ検証 |

**エラー処理プロトコル**（RFC-GRAPHIFY.md §3.8, L294-L328）:
全スクリプト統一:
- エラー時は終了コード1、stderr に3段テンプレート出力
- `[ERROR]` / `原因:` / `対応:` の3行
- 終了コード0は成功、1はエラー
- ファイル書き込みは一時ファイル + rename の atomicWrite

### 既存スクリプトファイルの実行情報

各スクリプトは `.claude/scripts/rfc-graph/` 配下に存在し、`parseArguments(testArgs)` と `main()` 関数を持つ。

| ファイル | 行数 | テストファイル | テスト行数 |
|---------|------|---------------|-----------|
| `crud.js` | 516行 | `crud.test.cjs` | 453行 |
| `verify.js` | 399行 | `verify.test.cjs` | 432行 |
| `embed-markers.js` | 458行 | `embed-markers.test.cjs` | 348行 |
| `query.js` | 606行 | `query.test.cjs` | 706行 |
| `update-step-status.js` | 463行 | `update-step-status.test.cjs` | 491行 |
| `schema/validate.js` | 169行 | `schema/validate.test.cjs` | 473行 |

### update-step-status.js のサブコマンド確認

P13-1 で実装済みの update-step-status.js は5つのサブコマンドを持つ:

1. `start-step <N>` — Step N を開始状態に設定（1〜5の範囲検証あり）
2. `end-step <N>` — Step N を完了状態に設定
3. `fail-step <N>` — Step N を失敗状態に設定
4. `reset-to-step <N>` — Step N にリセット（N未満のStepは全て未完了）
5. `status` — 現在の進行状態を表示

これらのサブコマンドをスラッシュコマンド内で呼び出し、進行管理を行う。

### 作業対象範囲の確認

本チケットで作成・編集するファイルは全て `tools/conver/.claude/` 配下のみ:
- `.claude/commands/graphify-rfc.md` — 新規作成
- `tests/rfc-graph/graphify-cmd.test.cjs` — 新規作成
- `tools/conver/.gitignore` — 必要に応じて追記

この範囲外のファイル（既存の conver.js ソース・dist・node_modules 等）は一切変更しない。

## Test Plan

### 結合テスト計画

テストファイル: `tests/rfc-graph/graphify-cmd.test.cjs`

スラッシュコマンドは Markdown テンプレートであるため、ユニットテストでロジックを検証することは不可能。代わりに以下の検証を結合テストで実施する。

既存テストパターン（monkey-patch + 一時ディレクトリ）に準拠する。

#### テストケース一覧

**正常系—導出パス計算:**

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | 導出パス: 通常の.mdファイル | `/path/to/doc.md` → graphPath=`/path/to/doc-GRAPH.json`, statusPath=`/path/to/doc-GRAPHIFY-Status.json` |
| 2 | 導出パス: 深いパス | `/a/b/c/d/doc.md` → `/a/b/c/d/doc-GRAPH.json` |
| 3 | 導出パス: 拡張子なしのパス | `/path/to/doc` → `/path/to/doc-GRAPH.json`（dirname利用） |

**正常系—Step進行記述の完全性:**

| # | テスト名 | 内容 |
|---|---------|------|
| 4 | 全5Stepのセクション存在 | コマンドファイル内に Step 1〜Step 5 のセクション見出しが全て存在する |
| 5 | update-step-status.js 呼び出し | 各Step開始時に `start-step N`、終了時に `end-step N`（または `fail-step N`）が記述されている |
| 6 | 導出パスの一貫性 | 全スクリプト呼び出しで `--graphify-status="$statusPath"` が統一されている |

**正常系—エラーハンドリング記述の完全性:**

| # | テスト名 | 内容 |
|---|---------|------|
| 7 | エラーハンドリング記述 | 各Stepにエラー時の復帰フロー（reset-to-step N）が記述されている |
| 8 | verify.js の結果分岐 | 未カバー行→reset-to-step 1、孤立ノード→reset-to-step 2、ok→end-step 3 の3分岐が記述されている |

**正常系—完了報告:**

| # | テスト名 | 内容 |
|---|---------|------|
| 9 | 完了報告の記述 | グラフパス・ノード数・エッジ数・REF数・検証結果の報告が記述されている |

**異常系:**

| # | テスト名 | 内容 |
|---|---------|------|
| 10 | 引数不足 | 使用方法を表示する記述がある |
| 11 | スクリプトパス確認 | 各スクリプト呼び出しが `.claude/scripts/rfc-graph/` 配下の正しいパスを指定している |

#### カバレッジ目標

スラッシュコマンドは Markdown テンプレートのため、コードカバレッジの測定対象外。
代わりに以下の検証基準で品質を保証する:
- 全5Stepの進行記述が過不足なく存在すること
- 全スクリプト呼び出しが統一された導出パスを使用すること
- エラー時の復帰フローが各Stepに記述されていること
- RFC-GRAPHIFY.md §4.6 のテンプレートとの一致度

### ユニットテスト不可能な項目（例外）

| 理由 | 説明 |
|------|------|
| スラッシュコマンドは Markdown テンプレート | Claude Code が解釈・実行する説明文であり、実行可能コードではない。ユニットテストの対象外 |
| スクリプト呼び出しはClaudeの実行に依存 | 各スクリプト（crud.js 等）の呼び出しは Claude が手順に従って Bash 経由で実行する。スクリプト自体のテストは既存テストで完了済み |
| 実際のグラフ化フローの結合テスト | 実際のファイルI/Oを伴う結合テストは実行環境に依存するため、本チケットのスコープ外。P16-2 で acceptance-criteria-test.sh として対応予定 |

## Boy Scout Rule — 翻訳可能性計画

### graphify-rfc.md 内での遵守事項

スラッシュコマンドは Markdown テンプレートであり、Claude が解釈する説明文である。
以下の翻訳可能性を確保する:

1. **Step見出しは動作指示として読めること**:
   - 「Step 1: ノード分割」— 何をするStepか一目でわかる
   - 「Step 3: 機械検証」— 役割が明確

2. **手順記述は逐語実行可能であること**:
   - 各Stepの手順が番号付きリストで1動作ずつ記述されている
   - スクリプト呼び出しは完全なCLI形式で記述（変数展開含む）
   - 「更新する」「投入する」「確認する」等、動作が明確な動詞で締めくくる

3. **エラーハンドリングは「もし〜ならば〜する」の形式**:
   - 条件分岐が自然言語で理解可能
   - 復帰手順が具体的（「reset-to-step 1 でStep 1に戻る」）

4. **変数名（導出パス）は用途が一目でわかること**:
   - `graphPath` — グラフファイルのパス
   - `statusPath` — ステータスファイルのパス

### 既存スクリプトへの影響

本チケットは新規ファイル（graphify-rfc.md）のみを作成するため、既存スクリプトの翻訳可能性を直接改善する機会はない。ただし、既存スクリプトのCLI契約パターン（定数プリフィックス、3段テンプレートエラー）を統一して使用することで、結果的に全体の一貫性が向上する。

## Acceptance Criteria

### スラッシュコマンド構造
- [ ] frontmatter に argument-hint / allowed-tools / description が正しく設定されている
- [ ] 導出パス（graphPath / statusPath）の計算式が正しい
- [ ] 5Step（ノード分割 → エッジ付与 → 機械検証 → マーカー埋め込み → 自己検証）が完全に記述されている
- [ ] 各Stepに `start-step N` / `end-step N`（または `fail-step N`）が記述されている
- [ ] 導出パス `$graphPath` / `$statusPath` が全スクリプト呼び出しで統一されている

### エラーハンドリング
- [ ] 各Stepにエラー時の復帰フロー（reset-to-step N）が記述されている
- [ ] verify.js の結果に応じた3分岐（未カバー行→Step 1 / 孤立ノード→Step 2 / ok→Step 4）が記述されている
- [ ] Step 4（embed-markers.js）のエラー時に fail-step 4 で記録して終了するフローが記述されている
- [ ] 引数不足時の使用方法表示が記述されている

### 完了報告
- [ ] 生成ファイルパス（グラフJSON・ステータスJSON）の報告が記述されている
- [ ] ノード数・エッジ数・REF数の報告が記述されている
- [ ] 検証結果（verify.js 出力）の報告が記述されている

### 品質
- [ ] 既存テストがすべて通過している
- [ ] `[::STUB::]` マーカーの未付与スタブがない
- [ ] 翻訳可能性の検証が通っている

## Notes

### 依存関係

- **先行実装必須**（全完了済み）:
  - P12-1: graph.schema.json / node.schema.json / edge.schema.json + validate.js
  - P13-1: update-step-status.js（進行管理基盤）
  - P13-2: crud.js（全CRUD操作）
  - P14-1: verify.js（カバレッジ検証）+ embed-markers.js（冪等マーカー挿入）
  - P15-1: query.js（BFSマルチホップ探索）
- **本チケット**: P16-1 graphify-rfc.md スラッシュコマンド
- **後続**: P16-2 formulate連携スクリプト群 + 既存コマンド改修 + Acceptance Criteriaテスト

### 設計上の重要注意点

1. **graphify は formulate より常に細かい粒度で分割する（発散）**: formulate-tickets が入力文書をチケットに分解する際に、graphify のグラフから必要な粒度の情報を取り出せるよう、グラフ化フェーズでは formulate より細かい粒度を徹底する。

2. **各スクリプト呼び出しは `--graph` と `--source` の引数名を統一**: crud.js（create-nodes / create-edges）は `--graph=<path>`、verify.js / embed-markers.js / query.js は `--graph=<path> --source=<path>` で引数を受け付ける。

3. **update-step-status.js の呼び出しは `--graphify-status=` プリフィックス必須**: ステータスファイルのパスは `--graphify-status=<path>` 形式で渡す（RFC §4.5 の設計による）。

4. **embed-markers.js は冪等**: 再実行時に既存マーカーを上書き・重複しない。エラー時は fail-step で記録し、手動修正を前提とする。

### 関連ファイル

| 役割 | ファイルパス |
|------|-------------|
| スラッシュコマンド（新規） | `.claude/commands/graphify-rfc.md` |
| テスト（新規） | `tests/rfc-graph/graphify-cmd.test.cjs` |
| 設計文書 | `RFC-GRAPHIFY.md`（§4.6 スラッシュコマンドテンプレート, §4.5 update-step-status.js, §3.7 CLI契約, §3.8 エラー処理プロトコル） |
| 基盤スクリプト(全) | `.claude/scripts/rfc-graph/`（crud/verify/embed-markers/query/update-step-status/validate） |
| 既存テスト(全) | `tests/rfc-graph/*.test.cjs` |
| Tickets.json | `Tickets.json`（P16 phase） |
| CLAUDE.md | `CLAUDE.md`（プロジェクト全体ルール） |

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
