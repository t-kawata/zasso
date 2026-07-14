---
ticket_id: 59
title: P17-1: Dirs-Tree.json Schema + inferLanguage + tarjanSCC + titleToFileName
slug: p17-1-dirs-treejson-schema-inferlanguage-tarjanscc-titletofilename
status: draft
created_at: 2026-07-07
updated_at: 2026-07-07
---
# P17-1: Dirs-Tree.json Schema + inferLanguage + tarjanSCC + titleToFileName — 4純粋関数一括

## Summary

boundify-graph-to-dirs.js の内部ヘルパーとして使用される4つの純粋関数（外部I/Oなし）を一括実装する。いずれも10〜30行の小規模な実装単位で、P18（buildDirectoryTree）からの内部呼び出しのみで使用される。個別チケットに分けるとオーバーヘッドが大きく、一括実装が適切。

- **Schema**: Dirs-Tree.json の JSON Schema 定義（DirNode型、trees構造、dependencyDirections、warnings）
- **inferLanguage**: グラフノードから言語（rust/go/typescript）を推定するヒューリスティック関数
- **tarjanSCC**: ディレクトリ間依存エッジから循環依存を検出するTarjan SCCアルゴリズム
- **titleToFileName**: ノードタイトルから言語別ファイル名を生成・重複排除する関数

## Background

boundify-graph-to-dirs.js は RFC-BOUNDIFY.md で定義された、グラフJSONを入力としてディレクトリツリーを提案・洗練・生成するスラッシュコマンドである。その内部処理は以下の段階に分かれる：

1. グラフノードの言語推定（inferLanguage）→ GRAPH-LANG.json 出力
2. part_of エッジからドメイン階層構築（P18: buildDomainHierarchy）
3. kind に基づくファイル配置とファイル名決定（titleToFileName + deduplicateFileNames）
4. エッジ投影と循環依存検出（projectEdgesToDirectories + tarjanSCC）
5. スキーマ検証（P19: validate-dirs-tree-schema.js）
6. テンプレート生成（P20: generate-dir-template.js）

本チケットは上記①④の純粋関数と、全段階で使用されるスキーマ定義を担当する。いずれもデータ変換のみの純粋関数であり、ファイルI/Oや外部サービスへの依存は一切ない。

## Scope

本チケットの実装範囲は以下の4関数と1定数である：

1. **Dirs-Tree.json JSON Schema 定義**（`SCHEMA` 定数）
   - トップレベル構造: schemaVersion, generatedAt, sourceGraph, analysis, trees, dependencyDirections, warnings
   - DirNode型: name, type(directory|file), kind, rationale, language[], languageRules, mappedNodeIds, role, declarationStub, children[]
   - DependencyDirection型: from, to, rule, edgeEvidence[]
   - $ref による再帰的 DirNode 参照対応

2. **`inferLanguage(node): string[]`**
   - ノードの title + summary を連結し小文字化したテキストに対し、Rust/Go/TypeScript 各言語の固有キーワードパターンで判定
   - Rust: `/\b(crate|mod\s|pub\s|unsafe|fn\s|impl\s|struct\s|enum\s|trait\s|cargo|#\[derive|::std::|mut\s|impl\s.+for\s|\.await)\b/`
   - Go: `/\b(package|func\s|goroutine|interface\{\}|struct\s|defer\s|go func|select\s|\*\.\w+|\.\( \w+\))\b/`
   - TypeScript: `/\b(TypeScript|barrel|index\.ts|\.ts\b|interface\s|type\s|async\s+\w+\s*=>|React|Vue|Component|useState|useEffect)\b/`
   - kind ベース補完: build_ci/test_policy/security/glossary → 全言語、requirement → 全言語、architecture → テキストに rust/crate/ffi があれば Rust 含む
   - デフォルトフォールバック: `['rust', 'go', 'typescript']`

3. **`SAFE_BOUNDARIES_EN_TEXT` 定数**
   - `.en.md` 英文の安全な境界定義テキスト（Rust/Go/TypeScript の safe boundaries 説明）
   - RFC-BOUNDIFY.md §3.2 および 図3（114行〜608行）に対応

4. **`graphToLangJson(graph, inferLanguage): GraphLangJson`**
   - 入力グラフの全ノードに inferLanguage を適用し、`<basename>-GRAPH-LANG.json` 形式の拡張グラフを生成

5. **`projectEdgesToDirectories(graphEdges, nodeToDirMap): DirEdge[]`**
   - ノード間エッジ → ディレクトリ間エッジの投影
   - 方向性エッジ種別のみ対象: depends_on, implements, references, extends, constrains
   - 未解決ノード（マッピングなし）はスキップ、同一ディレクトリ内エッジもスキップ
   - 各 DirEdge は from, to, type, evidence を持つ

6. **`tarjanSCC(dirEdges): Cycle[]`**
   - 投影された有向グラフに Tarjan の強連結成分分解（SCC）を適用
   - サイズ > 1 の SCC のみを循環として報告
   - 空配列入力 → 空配列出力

7. **`titleToFileName(title, language): string`**
   - §プレフィックス除去: `s/^§\S+\s*//`
   - 英数字/ハイフン/アンダースコア以外を `_` に置換
   - 連続アンダースコアを1つに集約
   - 先頭・末尾の `_` 除去
   - 48文字に切り詰め
   - 言語別拡張子付与: .rs / .go / .ts
   - barrel 名衝突回避: mod → _mod.rs, index → _index.ts

8. **`deduplicateFileNames(files, language): FileNode[]`**
   - 同一ディレクトリ内で重複するベース名に `_1`, `_2` サフィックスを付与

## Non-scope

本チケットでは以下は実装しない。これらは P18〜P21 で個別に実装される：

- buildDomainHierarchy（P18-1）— part_of エッジからのドメイン階層構築
- buildDirectoryTree（P18-1）— 完全なディレクトリツリー生成
- generateDeclarationStub（P18-1）— barrel宣言生成
- generateReport（P18-1）— レポート出力
- validate-dirs-tree-schema.js 全体（P19-1）— スキーマ検証スクリプト
- generate-dir-template.js 全体（P20-1）— テンプレートファイル生成
- boundify-graph-to-dirs.js メインスクリプト（P21-1）— 統合
- update-step-status.js --status= フラグ（P21-2）

## Investigation

RFC-BOUNDIFY.md の以下のセクションが本チケットの実装仕様の完全な一次ソースである：

### §3.3 Dirs-Tree.json スキーマ（RFC-BOUNDIFY.md:125-234）
- トップレベル構造は「schemaVersion」「generatedAt」「sourceGraph」「analysis」「trees」「dependencyDirections」「warnings」の7必須フィールド
- DirNode は「name」「type」が必須、「children」で再帰的自己参照
- DependencyDirection は「from」「to」「rule」が必須
- 言語別の trees と dependencyDirections は rust/go/typescript の三者すべて必須
- Appendix A（RFC-BOUNDIFY.md:1791-1881）に完全JSON Schema が記載

### §3.4 言語推定ヒューリスティック（RFC-BOUNDIFY.md:236-287）
- Ruby固有キーワードパターンは3系統（Rust/Go/TypeScript）
- kind ベース補完ロジック：全言語共通、テキスト調査、デフォルト
- Appendix B（RFC-BOUNDIFY.md:1883-1898）に言語パターンリファレンス

### §3.6 エッジ解析と循環依存検出（RFC-BOUNDIFY.md:431-534）
- projectEdgesToDirectories: 5種の方向性エッジのみ対象、未解決・同一ディレクトリはスキップ
- tarjanSCC: 標準Tarjan実装、サイズ1のSCCは循環とみなさない
- 循環検出結果は warnings フィールドに出力（循環の自動解消は行わない）

### §4.6 ファイル命名規則（RFC-BOUNDIFY.md:1654-1666）
- Rust/Go: スネークケース + .rs/.go、ディレクトリ名もスネークケース
- TypeScript: ケバブケース + .ts、ディレクトリ名もケバブケース
- barrel: Rust→mod.rs、TypeScript→index.ts、Go→該当なし

## Test Plan

### ユニットテスト計画

すべての関数は純粋関数（外部I/Oなし）のため、完全にユニットテスト可能。

#### Dirs-Tree.json Schema 定数
- **正常系**: 定義済み SCHEMA が有効な JSON Schema オブジェクトであること
- **要求されたキー**: required フィールドが仕様と一致すること（DirsTree: schemaVersion/generatedAt/sourceGraph/analysis/trees/dependencyDirections/warnings）
- **DirNode**: name/type が必須、type の enum 値が ["directory", "file"] であること
- **DependencyDirection**: from/to/rule が必須であること

#### inferLanguage(node)
- **正常系-Rust**: title="crate root", summary="pub struct SipClient" → ['rust', 'go', 'typescript'] を含む
- **正常系-Go**: title="package main", summary="func main()" → 'go' を含む
- **正常系-TypeScript**: title="React Component", summary="interface Props" → 'typescript' を含む
- **kind補完**: kind="build_ci" かつ title/content が空 → ['rust', 'go', 'typescript']
- **異常系-空title**: title="" かつ summary="" → フォールバックで空配列にならない
- **境界値**: title/summary 未定義（undefined）→ TypeError にならない

#### graphToLangJson(graph)
- **正常系**: 3ノード（Rust/Go/TS各1）→ 各ノードに language 配列が付与される
- **エッジ**: ノード間エッジ情報が保持される
- **空グラフ**: nodes=[] → 空の languageMap を返す

#### projectEdgesToDirectories(graphEdges, nodeToDirMap)
- **正常系**: A->B depends_on, A/C が異なるディレクトリ → 1件の DirEdge
- **同一ディレクトリ**: A,B が同一ディレクトリ → スキップ
- **未解決**: マッピングなしのノードを含むエッジ → スキップ
- **非方向性エッジ**: part_of エッジ → スキップ
- **空配列**: エッジなし → []
- **重複**: 同一 from->to エッジが複数 → 重複して報告される

#### tarjanSCC(dirEdges)
- **正常系-循環なし**: A→B→C（非巡回）→ []
- **正常系-循環検出**: A→B→C→A → 循環1件検出（cycle: ['A','B','C']）
- **自己ループ**: A→A → size 1 の SCC → 循環としては検出しない
- **複数循環**: A→B→A、C→D→C → 2件検出
- **空配列**: [] → []
- **分岐と合流**: A→B→D、A→C→D → 循環なし（SCC はサイズ1のみ）

#### titleToFileName(title, language)
- **正常系-Rust**: "§15 Event Model" + "rust" → "event_model.rs"
- **正常系-Go**: "§15 Event Model" + "go" → "event_model.go"
- **正常系-TypeScript**: "§15 Event Model" + "typescript" → "event-model.ts"
- **barrel-Rust**: "mod" + "rust" → "_mod.rs"
- **barrel-TypeScript**: "index" + "typescript" → "_index.ts"
- **特殊文字除去**: "A/B:C" → A/B:C が _ に置換
- **48文字切り詰め**: 50文字のタイトル → 48文字で切れる
- **空title**: "" → 空文字＋拡張子（`.rs`）

#### deduplicateFileNames(files, language)
- **重複なし**: ["a.rs", "b.rs"] → 変更なし
- **重複2つ**: ["a.rs", "a_1.rs", "a.rs"] → 3つ目が "a_2.rs"（※実際のロジック確認要）
- **言語別拡張子**: ["a"]→ dedup後も拡張子は統一
- **重複0**: [] → []

### ユニットテスト不可能な項目（例外）

本チケットの全関数は純粋関数であり、外部I/Oに依存しない。したがってユニットテスト不可能な項目は存在しない。

## Boy Scout Rule — 翻訳可能性計画

本チケットで新規実装するコードに対して、以下の翻訳可能性基準を適用する：

- **関数名は動詞句**: `buildDomainHierarchy`（ドメイン階層を構築する）、`inferLanguage`（言語を推定する）、`findCycles`（循環を検出する）— 関数呼び出しの並びが処理の流れを物語る
- **変数名はドメイン概念**: `nodeToDirMap`（ノード→ディレクトリの対応表）、`dirEdges`（ディレクトリ間エッジ）、`lowlink`（Tarjanのlowlink値）— 汎用変数名 `x`, `data`, `arr` は禁止
- **一関数一責務**: inferLanguage は言語判定のみ、projectEdgesToDirectories はエッジ投影のみ — 一関数内でANDで繋がる複数責務を禁止
- **ハードコード値は名前付き定数**: 言語パターン正規表現、拡張子マッピング、最大文字数（48）は定数として抽出
- **エラー握りつぶし禁止**: 存在しない言語指定や null/undefined 入力に対する明示的なフォールバック処理
- **コメントは「なぜ」を説明**: アルゴリズムの選択理由（「なぜTarjan SCCか」「なぜケバブケースか」）はコメントで日本語補完、処理内容は関数名で表現

## Acceptance Criteria

- [ ] 4純粋関数（inferLanguage, tarjanSCC, titleToFileName, deduplicateFileNames）+ 2中間関数（graphToLangJson, projectEdgesToDirectories）+ 1定数（SCHEMA）+ 1定数（SAFE_BOUNDARIES_EN_TEXT）が実装されている
- [ ] 各関数に単体テストが記述され、カバレッジ80%以上を達成している
- [ ] 全ユニットテストが通過（`npm test`）
- [ ] 型チェックが通過（`npx tsc --noEmit`）
- [ ] 既存テストに後方互換性がある（既存テストが通過）
- [ ] すべての関数が純粋関数（外部I/Oなし）である
- [ ] 翻訳可能性計画の基準を満たしている
- [ ] `[::STUB::]` マーカーの未付与がない

## Notes

### 依存関係
- **依存**: なし（本チケットが Boundify の最基盤 Layer 0/1）
- **被依存**（本チケット完了後に実装可能になるもの）:
  - P18-1: buildDomainHierarchy + buildDirectoryTree — inferLanguage と titleToFileName を使用
  - P19-1: validate-dirs-tree-schema.js — SCHEMA 定数を使用
  - P20-1: generate-dir-template.js — titleToFileName を使用
  - P21-1: boundify-graph-to-dirs.js メインスクリプト — 全関数を使用

### 作業対象範囲
- 作業対象: `tools/conver/.claude/` 内の新規ファイル
- 既存ファイルへの変更は一切禁止（ただし `update-step-status.js の --status= フラグ追加は P21-2 で実施）

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
