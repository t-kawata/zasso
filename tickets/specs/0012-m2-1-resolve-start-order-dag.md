---
ticket_id: 12
title: M2-1: resolve_start_order の実装（DAG トポロジカルソート）
slug: m2-1-resolve-start-order-dag
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0012-m2-1-resolve-start-order-dag/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0012-m2-1-resolve-start-order-dag/review.md
---
# M2-1: resolve_start_order の実装（DAG トポロジカルソート）

## Summary

`ProcessDef` のスライスから `depends_on` 宣言を解決し、起動順序を決定する `resolve_start_order` 関数を実装する。`petgraph` の `DiGraph` + `toposort` を使用し、循環依存と不明な依存先を検出する。純粋関数であり非同期ランタイム不要。これで Phase 0（純粋ロジックの完全隔離検証）が完結する。

## Background

複数のサイドカープロセスは相互に依存関係を持つ（例: DB が起動してからアプリサーバーを起動する）。`ProcessDef.depends_on` に指定された依存関係を DAG（有向非循環グラフ）としてモデル化し、トポロジカルソートで起動順序を決定する。循環依存が存在する場合はエラーとして報告し、起動を中止する。

**参照設計書:** docs/RFC-001-process-registry.md (§6)

## Scope

- `cargo add petgraph` で依存関係追加
- `crates/procreg/src/graph.rs` の新規作成:
  - `pub(crate) fn resolve_start_order(defs: &[ProcessDef]) -> Result<Vec<String>, RegistryError>`
  - `petgraph::graph::DiGraph` で DAG 構築
  - `petgraph::algo::toposort` でトポロジカルソート
  - 不明依存 → `RegistryError::UnknownDependency`
  - 循環依存 → `RegistryError::CircularDependency`
- `crates/procreg/src/lib.rs` の修正:
  - `pub mod graph;` 宣言の追加
  - 必要なら `pub(crate) use` の追加
- ユニットテスト（`graph.rs` 内 `#[cfg(test)] mod tests`）

## Non-scope

- `start_all()` での起動順序実行（M8-1 のスコープ）
- `shutdown_all()` での逆順停止（M9-1 のスコープ）
- `petgraph` 以外のグラフアルゴリズム（最短経路、連結性等）

## Investigation

### コードベース調査結果

```
crates/procreg/
  ├── Cargo.toml          # thiserror, anyhow, serde, tokio, tokio-util 済み
  └── src/
      ├── lib.rs          # M0-1 の型 + M1-1 のメソッド
      ├── error.rs        # RegistryError（5バリアント）
      ├── state.rs        # ProcessState
      └── registry.rs     # RegistryEntry, ProcessRegistry
```

- **発見1**: `petgraph` は未追加。`cargo add petgraph` で追加する（軽量クレート、トポロジカルソートのみに使用）。
- **発見2**: `RegistryError::UnknownDependency { src, dep }` と `RegistryError::CircularDependency` は M0-2 で既に定義済み。
- **発見3**: `ProcessDef` の `depends_on: Vec<String>` が依存関係の入力。空リストの場合は依存なし。
- **発見4**: 新規ファイル `graph.rs` としてモジュール分割。`lib.rs` に `pub mod graph;` + `pub(crate) use` を追加。
- **発見5**: テスト用ヘルパー関数 `def(name, deps)` でテストデータを簡潔に構築できる（RFC §6 のテストパターンを採用）。

### RFC §6 の実装

```rust
use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::algo::toposort;
use std::collections::HashMap;

pub(crate) fn resolve_start_order(
    defs: &[ProcessDef],
) -> Result<Vec<String>, RegistryError> {
    let mut graph: DiGraph<&str, ()> = DiGraph::new();
    let mut name_to_node: HashMap<&str, NodeIndex> = HashMap::new();

    // 全ノードを追加
    for def in defs {
        let node = graph.add_node(def.name.as_str());
        name_to_node.insert(def.name.as_str(), node);
    }

    // エッジ: dependency → dependent（dependency が先に起動）
    for def in defs {
        let to = name_to_node[def.name.as_str()];
        for dep in &def.depends_on {
            let from = *name_to_node.get(dep.as_str()).ok_or_else(|| {
                RegistryError::UnknownDependency {
                    src: def.name.clone(),
                    dep: dep.clone(),
                }
            })?;
            graph.add_edge(from, to, ());
        }
    }

    let sorted = toposort(&graph, None)
        .map_err(|_| RegistryError::CircularDependency)?;

    Ok(sorted.iter().map(|n| graph[*n].to_string()).collect())
}
```

### 設計上の制約

- 関数は `pub(crate)`（クレート内からのみ呼び出し可能）
- DAG のエッジ方向: `dependency → dependent`（依存元が先に起動されるべき）
- `toposort` の結果が空でない場合でも、返り値の最初の要素が最初に起動される
- 空リストの場合は空の `Vec` を返す

## Test Plan

### ユニットテスト計画

| # | テストケース | 種別 | 検証内容 |
|---|-------------|------|---------|
| 1 | `linear_dependency` | 正常系 | A→B→C の線形依存。入力順が B, C, A でも [A, B, C] が返ること |
| 2 | `diamond_dependency` | 正常系 | A→B, A→C, B→D, C→D。A が先頭、D が末尾であること |
| 3 | `circular_dependency` | 異常系 | A→B→A の循環依存 → `RegistryError::CircularDependency` |
| 4 | `unknown_dependency` | 異常系 | A が存在しない B に依存 → `RegistryError::UnknownDependency` |
| 5 | `single_process` | 境界系 | 依存なし単ープロセス → そのまま `[name]` が返ること |
| 6 | `empty_list` | 境界系 | 空スライス → 空の `Vec` が返ること |

**カバレッジ目標:** 全分岐網羅。正常系3 + 異常系2 + 境界系2 で全6テスト。

### ユニットテスト不可能な項目（例外）

なし。`petgraph` は純粋なライブラリで外部依存なし。

## Boy Scout Rule — 翻訳可能性計画

1. **関数名は動詞句**: `resolve_start_order` — 「起動順序を解決する」
2. **変数名はドメイン概念**: `graph`（DAG）、`name_to_node`（名前→ノード対応表）、`from`（依存元）、`to`（依存先）
3. **エッジ方向のコメント**: 「dependency → dependent（dependency が先に起動されるべき）」で方向性を明示
4. **`lib.rs` の変更は最小差分**: `pub mod graph;` + `pub(crate) use` のみ

## Acceptance Criteria

- [ ] `cargo add petgraph` が成功する
- [ ] `resolve_start_order()` が線形依存を正しくソートする
- [ ] `resolve_start_order()` が循環依存を検出し `CircularDependency` を返す
- [ ] `resolve_start_order()` が不明依存を検出し `UnknownDependency` を返す
- [ ] 依存なし単一プロセスがそのまま返る
- [ ] 空リストが空 `Vec` を返す
- [ ] 全6テストケースが通過する
- [ ] `cargo check` が警告なく通過する
- [ ] 既存の 41 テストが引き続き通過する

## Notes

### 依存関係

```
M0-1 (ProcessDef) ──┐
                     ├── M2-1 (本チケット) ── M8-1 (start_all: 起動順序実行)
M0-2 (RegistryError) ┘
```

- M2-1 は Phase 0 の最後のチケット。これで全 Phase 0（純粋ロジックの完全隔離検証）が完結する。
- `resolve_start_order` は `start_all()` から呼び出される（M8-1）。

### 成果物

- 計画: context/0012-m2-1-resolve-start-order-dag/plan.md（未作成）
- 実装サマリ: context/0012-m2-1-resolve-start-order-dag/implementation.md（未作成）
- レビュー報告書: context/0012-m2-1-resolve-start-order-dag/review.md（未作成）
