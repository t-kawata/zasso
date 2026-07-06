---
ticket_id: 48
title: 検証・マーカー機構（verify.js カバレッジ検証 + embed-markers.js 冪等マーカー挿入）
slug: verifyjs-embed-markersjs
status: draft
created_at: 2026-07-06
updated_at: 2026-07-06
---
# 検証・マーカー機構（verify.js カバレッジ検証 + embed-markers.js 冪等マーカー挿入）

## Summary

`/graphify-rfc` スラッシュコマンドの Step 3（検証）および Step 4（マーカー埋め込み）を担当する2つの機械的スクリプトを実装する。
verify.js はグラフのカバレッジ（未カバー行検出）と整合性（孤立ノード検出）を検証する。
embed-markers.js は検証済みグラフの sourceRanges 情報に基づき、ソース文書に REF マーカーを冪等かつアトミックに挿入する。

## Background

graphify-rfc ワークフローは5Stepで構成される。Step 3（verify.js）と Step 4（embed-markers.js）は、人間（AI）による Step 1（ノード分割）・ Step 2（エッジ定義）の結果を機械的に検証・確定するゲートウェイである。

- **Step 3 の意義**: 人間の分割漏れ（未カバー行）や未接続ノード（孤立ノード）を検出し、Step 1/2 へのフィードバックループを形成する。この検証を通過しなければマーカー埋め込みに進めない。
- **Step 4 の意義**: ソース文書に機械可読な REF マーカーを永続的に埋め込む。これにより後続の query.js が行番号変動に耐性を持つ動的解決を実現する。

両スクリプトは crud.js が唯一書き込むグラフファイルを読み取り専用で参照する（不変条件 B2: 書き込み経路の一元化）。

## Scope

1. **verify.js** — 以下の2検証を実施するCLIスクリプト（`--graph=<path> --source=<path>`）
   - **カバレッジ検証**: ソースファイルの全行（空行除く）が各ノードの sourceRanges でカバーされているか
   - **孤立ノード検証**: 全ノードが最低1本のエッジで接続されているか
   - 出力契約: 正常時 `{"ok":true}` + 終了コード0、異常時 `{"ok":false, "uncoveredLines":[], "isolatedNodes":[]}` + 終了コード1 + stderr に3段テンプレート
2. **embed-markers.js** — マーカー埋め込みCLIスクリプト（`--graph=<path> --source=<path>`）
   - `[::REF<N>-START::]` / `[::REF<N>-END::]` 形式のマーカー挿入（3桁以上ゼロ埋め）
   - 同一 refId の重複挿入防止（冪等性保証）
   - 異種 refId の範囲重複許容
   - 一時ファイル + rename のアトミックファイル書込
3. **テスト** — `tests/rfc-graph/` に verify.test.cjs / embed-markers.test.cjs を配置
4. **Makefile** — test-conver ターゲットに新しいテストファイルを追加

## Non-scope

- crud.js への変更（書き込み経路は crud.js のみ）
- query.js の実装（P15-1 で対応）
- graphify-rfc.md スラッシュコマンドの実装（P16-1 で対応）
- formulate 連携スクリプト（P16-2 で対応）
- スキーマ定義の変更（P12-1 で確定済み）

## Investigation

### 物理的証拠

#### 1. スクリプトの未存在確認

verify.js および embed-markers.js は 2026-07-06 時点でディスク上に存在しない。

```bash
$ ls -la .claude/scripts/rfc-graph/verify* .claude/scripts/rfc-graph/embed*
# → ls: ...: No such file or directory
```

作成済みのスクリプトは以下のみ：
```
.claude/scripts/rfc-graph/
├── crud.js               (515行, 6サブコマンド)
├── update-step-status.js (462行, 5サブコマンド)
└── schema/
    ├── validate.js       (169行, Ajv Draft 2020-12)
    ├── graph.schema.json (§sourceFile/nodes/edges)
    ├── node.schema.json  (§id/kind/sourceRanges)
    └── edge.schema.json  (§from/to/type/attributes)
```

#### 2. 既存スクリプトのコードパターン（crud.js: `/Users/kawata/shyme/zasso/tools/conver/.claude/scripts/rfc-graph/crud.js`）

- **言語**: CommonJS（require/module.exports）、ESM不使用
- **冒頭**: `#!/usr/bin/env node` + JSDoc モジュールコメント
- **定数**: 全マジックナンバーを ALL_CAPS の名前付き定数としてファイル上部に集約（7行目〜58行目）
- **引数パース**: `--graph=<path>` 形式のプレフィックス定数を用いた `parseArguments()`（72行目〜）
- **エラー**: throw new Error() + 改行で Usage 表示。エラーメッセージは日本語
- **出力**: `console.log(JSON.stringify(...))` で JSON 出力
- **アトミック書込**: `atomicWrite(targetPath, data)` — tmpPath + fs.renameSync + ファイルロック不要（単一プロセス前提）
- **CLI駆動**: `if (require.main === module)` で CLI 実行、module.exports でテストからの require に対応

#### 3. テストパターン（`tests/rfc-graph/crud.test.cjs`）

- **フレームワーク**: Node.js 標準の `node:test` + `node:assert/strict`
- **構造**: `describe` / `it` / `before` / `after`
- **I/O**: `os.tmpdir()` + `fs.mkdtempSync()` で一時ディレクトリ、テスト終了時に `fs.rmSync(tmpDir, { recursive: true })` で削除
- **モジュール読み込み**: 相対パス `../../.claude/scripts/rfc-graph/crud.js` で require
- **テストユーティリティ**: `createTestNode()` / `createTestEdge()` / `writeTestGraphFile()` をテストファイル内に定義
- **実行方法**: 現在は `test-conver` ターゲットのみ。新しいテストファイルを対象リストに追加する必要がある

#### 4. RFC-GRAPHIFY.md の該当仕様（`/Users/kawata/shyme/zasso/tools/conver/RFC-GRAPHIFY.md`）

- **§3.7 CLI契約**（260-292行目）: verify.js のインターフェースは `verify.js --graph=<path> --source=<path>`、embed-markers.js は `embed-markers.js --graph=<path> --source=<path>`
- **§3.8 エラー処理プロトコル**（294-328行目）: 3段テンプレート `[ERROR] <何が起きたか>\n原因: <なぜ起きたか>\n対応: <次に取るべきアクション>`、アトミック書込パターン
- **§4.2 verify.js**（467-490行目）: `checkCoverage()` と `checkIsolated()` の擬似コード。出力契約 `{"ok":true}` or `{"ok":false,...}`
- **§4.3 embed-markers.js**（492-516行目）: `embedAll()` の擬似コード。REF<N> 3桁以上ゼロ埋め、同一refId重複防止、異種refId重複許容
- **§4.7 Acceptance Criteria**（695-719行目）: AC1（verify.js カバレッジ検証）、AC2（embed-markers.js 冪等性）

#### 5. 既存テスト構造（`tests/rfc-graph/`）

```
tests/rfc-graph/
├── crud.test.cjs              (crud.js テスト)
├── update-step-status.test.cjs (update-step-status.js テスト)
└── schema/
    └── validate.test.cjs      (validate.js テスト)
```

#### 6. スキーマ定義から導出される制約

node.schema.json より、sourceRanges の各エントリは以下の構造を持つ：
```json
{ "refId": "REF001", "startLine": 1, "endLine": 5 }
```
- refId: `^REF[0-9]{3,}$`（REF 接頭辞＋3桁以上の数字）
- startLine/endLine: 1以上の整数、1-indexed

edge.schema.json より、エッジの from/to は `^N[0-9]{4}$` 形式のノードID。

#### 7. チケット依存関係の不整合

チケット P14-1 の `relatedTicketIds` に「P13-3 (crud.jsのグラフを読み取る)」とあるが、P13 フェーズの実在チケットは P13-1（update-step-status.js）と P13-2（crud.js）のみ。P13-3 は存在しない。正しくは crud.js を実装した P13-2 が入力元。これは spec の Notes に修正を記録する。

## Test Plan

### ユニットテスト計画

**テスト対象**: verify.js, embed-markers.js の全公開関数

**テストフレームワーク**: Node.js 標準の `node:test` + `node:assert/strict`
（既存テストと同じパターン。一時ディレクトリを使用したファイル I/O テストを含む）

#### verify.test.cjs — verify.js のテスト

| # | ケース | 分類 | 内容 |
|---|--------|------|------|
| 1 | `checkCoverage` — 全行カバー | 正常系 | ソース5行＋全行をカバーする sourceRanges → 未カバー行0件 |
| 2 | `checkCoverage` — 空行除外 | 正常系 | 空行のみカバー漏れ → 未カバー行0件（空行は対象外） |
| 3 | `checkCoverage` — 未カバー行検出 | 異常系 | 3行目が sourceRanges に含まれない → 未カバー行リストに3行目 |
| 4 | `checkCoverage` — 複数ノード＋範囲重複 | 正常系 | 2ノードが異なる範囲をカバー → 全体カバーで0件 |
| 5 | `checkCoverage` — 空ソース | 境界値 | 空のソースファイル → 未カバー行0件 |
| 6 | `checkIsolated` — 全ノード接続 | 正常系 | 3ノードがエッジで接続 → 孤立ノード0件 |
| 7 | `checkIsolated` — 孤立ノード検出 | 異常系 | 1ノードがエッジ未接続 → 孤立ノードリストに該当ID |
| 8 | `checkIsolated` — エッジ0本 | 境界値 | 空エッジ配列 → 全ノードが孤立 |
| 9 | `checkIsolated` — ノード0件 | 境界値 | 空ノード配列 → 孤立ノード0件 |
| 10 | CLI — 正常終了（全部OK） | 統合 | verify.js --graph=... --source=... → ok:true、終了コード0 |
| 11 | CLI — 異常終了（未カバー行あり） | 統合 | → ok:false、終了コード1、stderr に3段テンプレート |
| 12 | CLI — 不正な --graph パス | 異常系 | 存在しないグラフファイル → エラー終了コード1 |
| 13 | CLI — 引数不足 | 異常系 | 引数なし → エラー終了コード1 |
| 14 | `parseArguments` — 正常系 | 単体 | `--graph=p --source=q` → `{graphPath, sourcePath}` |
| 15 | `parseArguments` — --help | 単体 | help表示＋exit(0) |

#### embed-markers.test.cjs — embed-markers.js のテスト

| # | ケース | 分類 | 内容 |
|---|--------|------|------|
| 1 | `embedAll` — 初回挿入 | 正常系 | 2ノード＋各1 sourceRange → START/END マーカー2組挿入 |
| 2 | `embedAll` — 冪等性（2回目で差分ゼロ） | 正常系 | 1回目実行後、同じグラフで2回目 → ソース不変 |
| 3 | `embedAll` — 同一refIdの重複防止 | 正常系 | 同一 refId が2つの sourceRanges に出現 → マーカー1回のみ |
| 4 | `embedAll` — 異種refIdの範囲重複許容 | 正常系 | refId=A と refId=B が同一行範囲を指す → 両方のマーカーが挿入される |
| 5 | `embedAll` — 3桁ゼロ埋め形式 | 正常系 | refId=REF001 → `[::REF001-START::]` |
| 6 | `embedAll` — 複数桁対応 | 正常系 | refId=REF99999 → `[::REF99999-START::]` |
| 7 | CLI — 正常終了（冪等確認） | 統合 | 2回連続実行、2回目は何も変更しない |
| 8 | CLI — 不正な sourceRanges（行番号超過） | 異常系 | endLine > ソース行数 → エラー終了、ファイル変更なし |
| 9 | CLI — ソースファイル存在しない | 異常系 | → エラー終了コード1 |
| 10 | CLI — グラフファイルのJSON不正 | 異常系 | → エラー終了コード1 |
| 11 | `atomicWrite` — アトミック書込 | 単体 | 一時ファイル→rename のパターン確認 |
| 12 | `parseArguments` — 正常系 | 単体 | `--graph=p --source=q` → `{graphPath, sourcePath}` |

### ユニットテスト不可能な項目（例外）

該当なし。verify.js と embed-markers.js は純粋なファイル I/O + 文字列処理であり、全ロジックを一時ファイルを用いたユニットテストで検証可能。

## Boy Scout Rule — 翻訳可能性計画

このチケットで新規作成する2スクリプトについては、以下の翻訳可能性ポリシーを初めから適用する：

1. **関数名は動詞句**: `checkCoverage`, `checkIsolated`, `embedAll`, `extractExistingRefIds`, `parseArguments` — 関数呼び出しの並びが処理の流れを物語る
2. **変数名はドメイン概念**: `sourceLines`, `covered`, `uncoveredLines`, `isolatedNodes`, `existingRefs` — `data` `tmp` `x` 不使用
3. **一関数一責務**: カバレッジ検証と孤立ノード検証は別関数（verify.js）。引数パースは別関数
4. **ハードコード値は名前付き定数**: マーカーの接頭辞 `REF_PREFIX = 'REF'`、マーカー書式テンプレート `MARKER_FORMAT_START` / `MARKER_FORMAT_END`、最小桁数など
5. **エラー握りつぶし禁止**: ファイル読み込み失敗 → throw、JSONパース失敗 → 3段テンプレートエラー、検証失敗 → 構造化エラー出力
6. **既存コード（crud.js の parseArguments）との一貫性**: 同一の `--graph=` 引数パースパターン、同一の3段テンプレートエラー形式を継承

既存コードへの影響範囲はない（両スクリプトとも新規作成であり、既存コードを編集しない）。

## Acceptance Criteria

- [ ] verify.js が全行カバー＋全ノード接続で `{"ok":true}` ＋終了コード0を出力する
- [ ] verify.js が未カバー行を検出しリスト出力＋`{"ok":false}` ＋終了コード1＋stderr 3段テンプレート
- [ ] verify.js が孤立ノードを検出しリスト出力＋`{"ok":false}` ＋終了コード1
- [ ] verify.js が空行のみの未カバーを無視する
- [ ] embed-markers.js が初回実行で全 REF マーカーを挿入する
- [ ] embed-markers.js の2回目実行でソースファイルに差分が生じない（冪等性）
- [ ] embed-markers.js が同一 refId の重複挿入を防止する
- [ ] embed-markers.js が異種 refId の範囲重複を許容する
- [ ] embed-markers.js が不正な sourceRanges でエラー終了し、ファイルを変更しない
- [ ] 両スクリプトとも3段テンプレート形式のエラーを stderr に出力する
- [ ] 既存テスト（crud.test.cjs, update-step-status.test.cjs, validate.test.cjs）が通過している
- [ ] `node --test tests/rfc-graph/verify.test.cjs tests/rfc-graph/embed-markers.test.cjs` が全テスト通過
- [ ] 翻訳可能性ポリシーに沿った命名・構造になっている

## Notes

### 依存関係

- **入力元**: P13-2 (crud.js) — crud.js が生成したグラフファイルを読み取る（※既存チケットデータの relatedTicketIds に「P13-3」とあるが、P13 の実在チケットは P13-1/P13-2 のみ。P13-2 が正しい）
- **出力先**: P15-1 (query.js) — embed-markers.js が書き込んだ REF マーカーを行番号解決に使用する
- **並行不可**: P15-1（query.js）はマーカーが存在することを前提とするため、P14-1 完了後に着手する

### 関連チケット

- P13-2 (crud.js): グラフCRUD操作
- P15-1 (query.js): BFSマルチホップ探索
- P16-1 (graphify-rfc.md): スラッシュコマンド統合

### 作業対象範囲

このチケットで作成・編集するファイル：
- `.claude/scripts/rfc-graph/verify.js` — 新規作成
- `.claude/scripts/rfc-graph/embed-markers.js` — 新規作成
- `tests/rfc-graph/verify.test.cjs` — 新規作成
- `tests/rfc-graph/embed-markers.test.cjs` — 新規作成
- `Makefile` — test-conver ターゲットに新規テストファイル追加

この範囲外のファイルは一切変更しない。
