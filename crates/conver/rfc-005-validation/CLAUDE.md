# RFC_005: プロジェクション・検証 — 設計全体マップ

> このファイルは `/formulate-tickets` によって自動生成されました。
> **生成元:** crates/conver/rfc-005-validation/RFC_005.md
> **生成日:** 2026-06-23

## 目的とスコープ

conver オーケストレータにおいて、canonical JSON（Status.json / DesignTree.json / RFC_TREE.json / Tickets.json / OMISSIONS-*.json / round_log.jsonl）から人間可読な Markdown / 端末表示を生成する投影層（conver-projection）と、全状態変更操作後に自動実行される4種の検証ゲート（conver-validation）を提供する。

2つのcrateは互いに独立しており、conver-core が両方を利用する。

## アーキテクチャ概要

| crate | 責務 | 外部依存 |
|-------|------|----------|
| **conver-projection** | ChecklistGenerator / OmissionsReport / ConvergenceReporter / MarkdownTemplate | serde, serde_json |
| **conver-validation** | SchemaValidator / QuestionFormatValidator / QualityGate / DagValidator / Validator trait / ValidationErrors | serde, serde_json, thiserror, petgraph |

両crateとも **純粋関数のみ** で構成。I/O・非同期実行・乱数生成を含まない。全テストがメモリ内完結・決定論的。

### 検証ゲート実行順序（Appendix A）

```
全操作 → [Gate1] 改竄検出 → [Gate2] スキーマ検証 → [Gate3] DAG検証 → [Gate4] 品質ゲート → 操作確定
```

## 主要な型とデータ構造

### conver-projection

| 型 | ファイル | 備考 |
|----|---------|------|
| `DesignTreeNode` | `checklist.rs` | 軽量ツリーノード。id, title, children, status |
| `ChecklistError` | `checklist.rs` | MissingHeader, NoSections |
| `OmissionsData` | `omissions_md.rs` | round, detected_at, omissions: Vec<OmissionEntry> |
| `OmissionEntry` | `omissions_md.rs` | kind, rfc_node_id, ticket_id, description, code_location, severity |
| `DeviationComponentsData` | `report.rs` | m, c, u, x (乖離成分カウント) |
| `ConvergenceReporter` | `report.rs` | round, max_rounds, delta, components, per_node, state, visualization_bars |

### conver-validation

| 型 | ファイル | 備考 |
|----|---------|------|
| `Validator<T>` trait | `lib.rs` | `fn validate(&self, target: &T) -> Result<(), ValidationErrors>` |
| `ValidationErrors` | `lib.rs` | errors: Vec<String>, new/ add/ is_empty/ merge/ From<Vec<E>> |
| `DagValidationReport` | `dag.rs` | valid: bool, errors: Vec<String> |

## モジュール／コンポーネント間の関係

```
[conver-projection]
  template.rs (MarkdownTemplate) ← checklist.rs, omissions_md.rs, report.rs が利用
  checklist.rs (ChecklistGenerator) → DesignTreeNode, ChecklistError
  omissions_md.rs (OmissionsReport) → OmissionsData, OmissionEntry
  report.rs (ConvergenceReporter) → DeviationComponentsData

[conver-validation]
  lib.rs (Validator trait + ValidationErrors) ← 全バリデータが実装
  schema.rs (SchemaValidator, DesignTreeValidator, ChecklistValidator) → Validator<str>
  question_fmt.rs (QuestionFormatValidator) → Validator<str>
  quality.rs (QualityGate) → Validator の実装
  dag.rs (DagValidator + DagValidationReport) → Validator + petgraph
```

**クロスcrate依存なし**。両crateは完全独立。

## スタブ一覧と解決計画

本RFCの設計書は全APIの完全な実装コードを含んでいる。そのため、**スタブは発生しない**。全てのチケットが直接実装を完了できる。

- 未解決STUB: 0件（想定）
- 全実装がリファレンス（設計書内のコードブロック）から直接移植可能

## 受入基準（Appendix D）

1. ChecklistGenerator がDesignTreeから正しいMarkdownを生成
2. OmissionsReport が空omissionsで「乖離なし」表示
3. ConvergenceReporter がΔ・ノード別充足度・ステータスを正しく表示
4. QuestionFormatValidator が全5ルールを検証
5. DesignTreeValidator がversion/ID重複/不正statusを検出
6. QualityGate が6条件すべてを検証
7. DagValidator がRFC/チケットDAGの循環・矛盾を検出
8. ValidationErrors が複数エラー保持・マージ・表示
9. Validator trait がカスタム実装可能
10. `cargo test -p conver-projection` 全パス
11. `cargo test -p conver-validation` 全パス
