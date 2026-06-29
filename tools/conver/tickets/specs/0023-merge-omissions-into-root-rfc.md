---
ticket_id: 23
title: merge-omissions-into-root-rfc スラッシュコマンドの実装
slug: merge-omissions-into-root-rfc
status: draft
created_at: 2026-06-29
updated_at: 2026-06-29
---

# merge-omissions-into-root-rfc スラッシュコマンドの実装

## Summary

`/merge-omissions-into-root-rfc` スラッシュコマンドを新設する。本コマンドは、`find-omissions` → `formulate-tickets-for-next` のサイクルで生成された `RFC-OMISSIONS-XXX.md` の内容を、正典である `RFC-ROOT.md` の**既存セクションにのみ**溶け込ませる（新しいセクションは絶対に追加しない）。

**実行引数**:
```
/merge-omissions-into-root-rfc </path/to/RFC-OMISSIONS-XXX.md> </path/to/RFC-ROOT.md>
```

## Background

現行の二層ループ開発パイプラインでは、以下の流れで次世代設計が行われる：

```
find-omissions → OMISSIONS-XXX.json/.md
                    ↓
     formulate-tickets-for-next → RFC-OMISSIONS-XXX.md
                    ↓
     grill-me-for-next-rfc-ja → NEXT_RFC.md（分岐）
```

この方式では、RFC-ROOT.md とは別に NEXT_RFC.md が独立した文書として生成され、**正典が分岐**する構造になっている。その結果：

1. **設計の一元管理が困難**: どのファイルが現在の正しい設計かを判断するために複数ファイルを参照する必要がある
2. **`find` の解析精度低下**: find が RFC を解析する際、正典が複数に分かれていると「どの設計が現在有効か」を正しく判断できず、誤った omission を検出するリスクがある
3. **世代管理の複雑化**: 設計の世代が進むにつれて参照すべき文書が増加し、どの omission がどの世代で解決されたかの追跡が困難になる

本コマンドの導入により、以下の理想状態を実現する：

```
find-omissions → formulate-tickets-for-next → RFC-OMISSIONS-XXX.md
                                                  ↓
                            merge-omissions-into-root-rfc
                                                  ↓
                                    RFC-ROOT.md（常に最新の正典）
```

RFC-ROOT.md が常に最新の完全体として保たれ、`find` は 1 つの RFC だけを読めば正確な omission を抽出できる。

### 「溶け込みマージ」の定義 — 絶対ルール

**絶対ルール: 新しいセクションを追加してはならない。** RFC-ROOT.md に存在するセクションだけがマージ先である。

RFC-OMISSIONS-XXX.md の `### §N` 各セクションの内容を、RFC-ROOT.md の**既存の該当セクション**に直接書き込む：

- `§N` セクションを意味的に最も近い RFC-ROOT の既存セクションにマッピング
- 該当セクションの記述を新しい設計判断で**修正（書き換え）** または**追記**
- 該当する既存セクションが RFC-ROOT.md に存在しない場合 → **エラーとして報告し停止する**

**厳守理由:**
- find が RFC を解析する際、「同じトピックに複数の記述がある」と誤検出するのを防ぐ
- 設計ベクトルの各次元に**1つの現在値**だけが存在する状態を保つ
- 世代を重ねるごとに RFC が肥大化するのを防ぐ

### マージパターン（2種類のみ）

**パターンA: 修正 — 該当セクションの内容を書き換え**
- 例: O-004（型名の修正）→ `### 4. 型定義` の該当行を直接書き換える
- 旧記述と新記述の差分が明確な場合に適用

**パターンB: 追記 — 該当セクションに新しい内容を追加**
- 例: O-001（ログ出力仕様）→ `### 1. CLI インターフェース` の末尾に出力書式の説明を追記
- 新しい設計判断が既存セクションに矛盾せず追加できる場合に適用

**パターンC（禁止）**: 新規セクション追加 — 絶対に使用してはならない。

### フロントマター変更履歴

溶け込みマージと併せて、RFC-ROOT.md の先頭に YAML frontmatter ブロックを追加（なければ新規追加、あれば追記）し、変更履歴を記録する：

```yaml
---
title: RFC-001 conver.js
generatedAt: 2026-06-25
merge-history:
  - date: 2026-06-29
    source: RFC-OMISSIONS-001.md
    resolved: [O-001, O-002, O-003, O-004, O-005]
---
```

`integration-history` ではなく `merge-history` を使用する。

## Scope

1. **`.claude/commands/merge-omissions-into-root-rfc.md`** — スラッシュコマンド定義ファイルの新規作成
   - Step 0: 引数パース（第1引数: source / 第2引数: target）
   - Step 1: バリデーション（helper script 呼び出し）
   - Step 2: セクション抽出（helper script 呼び出し）
   - Step 3: AI による溶け込みマージ（既存セクションへの修正/追記のみ、新規追加禁止）
   - Step 4: フロントマター更新（helper script 呼び出し）
   - Step 5: 検証
   - Step 6: 完了報告

2. **`.claude/scripts/tickets/merge-omissions-into-root-rfc.js`** — 補助スクリプトの新規作成
   - **このスクリプトは機械的判断のみを行う。マージの意味的判断（どの §N をどの既存セクションにマージするか）は一切行わない。**
   - `validateArgs(sourcePath, targetPath)`: 両ファイルの存在確認、parent-rfc 整合性チェック
   - `readFrontmatter(filePath)`: YAML frontmatter の読み取り
   - `addMergeHistory(targetPath, sourcePath, resolvedIds, date)`: merge-history エントリの追記（重複防止）
   - `extractSections(filePath)`: RFC-OMISSIONS から `### §N` セクションを抽出

3. **README.md の更新** — 二層ループ図への新コマンド追加

## Non-scope

- `formulate-tickets-for-next` の修正（既存コマンドは変更しない）
- `grill-me-for-next-rfc-ja` の修正（既存コマンドは変更しない）
- ECMAScript Module（ESM）化 — 既存 CommonJS 準拠を維持
- Tickets.json の操作（本コマンドはチケット管理とは無関係）
- 新しいセクションの追加（絶対禁止）

## Investigation

### 既存ファイル構造の確認

```
conver/
├── .claude/
│   ├── commands/
│   │   ├── find-omissions-for-next-rfc.md    # 参考: 引数パース・出力先決定パターン
│   │   ├── formulate-tickets-for-next.md     # 参考: 2引数パースパターン
│   │   ├── check-final.md                    # 参考: 最終ゲートパターン
│   │   └── ... (既存13コマンド)
│   └── scripts/
│       └── tickets/
│           ├── create-omissions.js           # 参考: ファイル操作パターン
│           └── ... (既存スクリプト群)
├── RFC_ROOT.md              # 正典（マージ先）
├── RFC_OMISSIONS-001.md     # マージ元（サンプル）
├── OMISSIONS-001.json       # omission データ
├── OMISSIONS-001.md         # omission レポート
└── tickets/specs/
    └── 0023-integrate-omissions-into-root-rfc.md  # ← 本ファイル
```

### RFC_ROOT.md の構造（マージ先）

```
# RFC-001: conver.js — ACP-based Ticket Processing Pipeline
| 項目 | 内容 | ...
---
## Abstract（概要）
## Motivation（動機・背景）
## Design（設計）
### 1. CLI インターフェース
#### 1.1 フラグ一覧
#### 1.2 戻り値とエラーコード
### 2. アーキテクチャ
...
```

- 先頭に YAML frontmatter なし（インラインテーブル形式のメタデータのみ）
- Markdown セクション（`#`, `##`, `###`, `####`）
- `---` 水平線でセクション区切り

### RFC_OMISSIONS-001.md の構造（マージ元）

```
---
parent-rfc: /Users/kawata/shyme/zasso/tools/conver/RFC_ROOT.md
parent-omissions: OMISSIONS-001.md
---

# RFC OMISSIONS-001: ...
## Abstract
## Motivation
## Design
### §1 起動パラメータログの完全化（O-001）
### §2 ファイルパスの絶対パス変換（O-002）
### §3 phaseId 情報の一貫性確保（O-003）
### §4 ACP SDK 型定義の整合性（O-004）
### §5 Makefile エントリの完全記述（O-005）
```

- YAML frontmatter あり（parent-rfc, parent-omissions）
- `§N` 形式のセクションが Design 下に配置
- 各セクションが1つの omission に対応

### セクションマッピングの例（AI 判断）

マッピングは AI が意味的に判断する。RFC_OMISSIONS-001.md の場合は以下のようになる：

| OMISSIONS § | 内容 | マージ先 (RFC_ROOT.md) | パターン |
|------------|------|----------------------|---------|
| §1 (O-001) | 起動パラメータログ完全化 | `### 1. CLI インターフェース` | B（追記） |
| §2 (O-002) | ファイルパス絶対パス変換 | `### 2. アーキテクチャ` | B（追記） |
| §3 (O-003) | phaseId 一貫性確保 | `### 3. モジュール構成` | A（修正） |
| §4 (O-004) | SDK型定義の整合性 | `### 4. 型定義` | A（修正） |
| §5 (O-005) | Makefileエントリ完全記述 | `### 7. Makefileエントリ` | B（追記） |

**このマッピングはスクリプトが行うのではなく、.md の指示に従って AI が行う。**

### 機械的処理と AI 処理の明確な境界

| 処理内容 | 実行主体 | 理由 |
|---------|---------|------|
| ファイル存在確認 | helper script (`validateArgs`) | 機械的判断可能 |
| parent-rfc 整合性チェック | helper script (`validateArgs`) | 文字列比較で判断可能 |
| frontmatter の読み取り | helper script (`readFrontmatter`) | YAML パースは機械的 |
| frontmatter への merge-history 追記 | helper script (`addMergeHistory`) | 決まった構造の追記 |
| §N セクションの抽出 | helper script (`extractSections`) | 正規表現で抽出可能 |
| **§N のマッピング先特定** | **AI（.md の指示）** | 意味的理解が必要 |
| **既存セクションの書き換え** | **AI（.md の指示）** | 文脈を理解した編集が必要 |

**補助スクリプトは機械的判断のみを行う。マージの判断（どの §N をどのセクションにマージするか）は一切行わないことを設計上の絶対条件とする。**

## Test Plan

### ユニットテスト計画

helper script `merge-omissions-into-root-rfc.js` に対して以下のユニットテストを実装する：

| テストケース | 内容 |
|------------|------|
| 正常系: frontmatter 新規追加 | YAML frontmatter がない RFC に新規追加される |
| 正常系: frontmatter 追記 | 既存 frontmatter に merge-history エントリが正しく追記される |
| 正常系: merge-history 重複防止 | 同名ソースのエントリが既に存在する場合、重複追加しない |
| 正常系: §N セクション抽出 | `extractSections` で `### §N` セクションが正しく抽出される |
| 異常系: ファイル不在 | `validateArgs` → エラー終了 |
| 異常系: 引数不足 | `validateArgs` → エラー終了 |
| 異常系: parent-rfc 不整合 | `validateArgs` → エラー終了 + メッセージ |

### ユニットテスト不可能な項目（例外）

- **溶け込みマージの意味的正確性**: AI（Claude Code）が RFC の意味を理解して適切なセクションにマッピングする部分は、ユニットテストでは検証不可能。E2E テスト（実際の RFC_ROOT.md と RFC_OMISSIONS-XXX.md でコマンドを実行し結果を確認）で検証する。
- **スラッシュコマンド連携**: 実際に Claude Code で実行して確認する。

### E2E 検証手順

```bash
# 1. 既存の RFC_ROOT.md と RFC_OMISSIONS-001.md でコマンドを実行
/merge-omissions-into-root-rfc /path/to/RFC_OMISSIONS-001.md /path/to/RFC_ROOT.md

# 2. 結果確認: 各 omission が正しい既存セクションに溶け込んでいるか
# 3. 新しいセクションが追加されていないことの確認
# 4. フロントマターに merge-history が追記されているか
# 5. check-final を実行しても正しく omission 0 が検出されるか
```

## Boy Scout Rule — 翻訳可能性計画

新規作成するファイル：

1. **`merge-omissions-into-root-rfc.md`**（スラッシュコマンド）
   - ワークフローは Step 0–5 の段階的構成
   - 各ステップは 1 つの責務のみ
   - コードブロック内の変数名は説明的に（例: `SOURCE_RFC`, `TARGET_RFC`）
   - マジックナンバーやハードコードパスは禁止
   - エラーハンドリングは全て明示的

2. **`merge-omissions-into-root-rfc.js`**（補助スクリプト）
   - 関数名は動詞句で責務を明示（例: `validateArgs()`, `readFrontmatter()`, `addMergeHistory()`）
   - 一関数一責務を厳守
   - **マージの意味的判断をこのスクリプトに書かないことを design contract としてコメントに明記する**

## Acceptance Criteria

- [ ] `/merge-omissions-into-root-rfc` コマンドが実装され、2つの引数（source, target）で動作する
- [ ] RFC-OMISSIONS-XXX.md の各 `§N` セクションが RFC-ROOT.md の**既存セクションのみに**溶け込みマージされる
- [ ] 新しいセクションが絶対に追加されない（追加しようとするとエラーで停止する）
- [ ] RFC-ROOT.md に frontmatter の `merge-history` が追記される
- [ ] parent-rfc が target と一致しない場合はエラーで停止する
- [ ] 該当する既存セクションが RFC-ROOT.md に存在しない場合、エラーで停止する
- [ ] helper script は機械的判断のみを行い、マージの判断は一切行わない
- [ ] 既存のテスト全件が PASS する
- [ ] 犯罪（`[::STUB::]` 未付与）がゼロである
- [ ] README.md の二層ループ図に本コマンドが反映されている

## Notes

- コマンド名は `/merge-omissions-into-root-rfc`、スクリプトは `merge-omissions-into-root-rfc.js`、frontmatter フィールドは `merge-history` で統一する。`integrate` という単語は一切使用しない。
- 本コマンドの目的は「正典の一元管理」であり、「新しい設計文書の作成」ではない。新しい設計が必要な場合は、`grill-me-for-next-rfc-ja` → `formulate-tickets-for-next` のサイクルで RFC-OMISSIONS が生成され、それをマージする。
- 溶け込みマージの品質は、`check-final` が正しく PASS するかで間接的に検証される。
- 関連チケット: PX-3（完了通知の改善）、P4-1（メインループ制御）
