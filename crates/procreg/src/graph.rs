//! # グラフ — DAG トポロジカルソート
//!
//! `ProcessDef` の `depends_on` 宣言から起動順序を解決する。
//! `petgraph` の `DiGraph` + `toposort` を使用する。

use std::collections::HashMap;

use petgraph::algo::toposort;
use petgraph::graph::{DiGraph, NodeIndex};

use crate::error::RegistryError;
use crate::ProcessDef;

/// `ProcessDef` のスライスから起動順序を決定する。
///
/// 返値はプロセス名の `Vec<String>`。先頭から順に起動すれば依存関係が満たされる。
///
/// # エラー
///
/// - `UnknownDependency`: 存在しないプロセス名が `depends_on` に指定された
/// - `CircularDependency`: 循環依存が存在する
///
/// # エッジ方向
///
/// `dependency → dependent`: 依存元（先に起動されるべきプロセス）から
/// 依存先（後に起動されるべきプロセス）へエッジを張る。
///
/// # 未使用警告について
///
/// この関数は M8-1（start_all）で使用される。現時点では定義のみ。
#[allow(dead_code)]
pub(crate) fn resolve_start_order(
    defs: &[ProcessDef],
) -> Result<Vec<String>, RegistryError> {
    let mut graph: DiGraph<&str, ()> = DiGraph::new();
    let mut name_to_node: HashMap<&str, NodeIndex> = HashMap::new();

    // 第1パス: 全プロセスをノードとして追加する
    for def in defs {
        let node = graph.add_node(def.name.as_str());
        name_to_node.insert(def.name.as_str(), node);
    }

    // 第2パス: 依存関係をエッジとして追加する
    // エッジ方向: dependency → dependent
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

    // トポロジカルソート
    let sorted =
        toposort(&graph, None).map_err(|_| RegistryError::CircularDependency)?;

    Ok(sorted.iter().map(|node_idx| graph[*node_idx].to_string()).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ProcessDef, ReadyCondition, RestartPolicy};

    /// テスト用の簡易 ProcessDef ビルダー。
    fn def(name: &str, deps: &[&str]) -> ProcessDef {
        ProcessDef {
            name: name.to_string(),
            program: "echo".to_string(),
            args: vec![],
            env: vec![],
            depends_on: deps.iter().map(|s| s.to_string()).collect(),
            restart: RestartPolicy::Never,
            ready: ReadyCondition::Immediate,
            shutdown_timeout: None,
        }
    }

    /// 線形依存 A→B→C を正しくソートできることを確認する。
    /// 入力順が B, C, A でも [A, B, C] が返ることを検証する。
    #[test]
    fn linear_dependency() {
        let defs = vec![
            def("B", &["A"]),
            def("C", &["B"]),
            def("A", &[]),
        ];
        let order = resolve_start_order(&defs).unwrap();
        assert_eq!(order, vec!["A", "B", "C"]);
    }

    /// ダイヤモンド依存 A→(B, C)→D を正しくソートできることを確認する。
    /// A が先頭、D が末尾であることのみを検証する（B, C の順序は不定）。
    #[test]
    fn diamond_dependency() {
        let defs = vec![
            def("B", &["A"]),
            def("C", &["A"]),
            def("D", &["B", "C"]),
            def("A", &[]),
        ];
        let order = resolve_start_order(&defs).unwrap();
        assert_eq!(order[0], "A");
        assert_eq!(order[3], "D");
        // B と C の順序は不定のため、index 1, 2 の確認は行わない
    }

    /// 循環依存 A→B→A を検出し CircularDependency を返すことを確認する。
    #[test]
    fn circular_dependency() {
        let defs = vec![
            def("A", &["B"]),
            def("B", &["A"]),
        ];
        let result = resolve_start_order(&defs);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), RegistryError::CircularDependency));
    }

    /// 存在しないプロセスを依存先に指定した場合、
    /// UnknownDependency を返すことを確認する。
    #[test]
    fn unknown_dependency() {
        let defs = vec![
            def("A", &["B"]),
        ];
        let result = resolve_start_order(&defs);
        assert!(result.is_err());
        match result.unwrap_err() {
            RegistryError::UnknownDependency { src, dep } => {
                assert_eq!(src, "A");
                assert_eq!(dep, "B");
            }
            other => panic!("Expected UnknownDependency, got {other:?}"),
        }
    }

    /// 依存なし単一プロセスがそのまま返ることを確認する。
    #[test]
    fn single_process() {
        let defs = vec![def("A", &[])];
        let order = resolve_start_order(&defs).unwrap();
        assert_eq!(order, vec!["A"]);
    }

    /// 空スライスを渡すと空の Vec が返ることを確認する。
    #[test]
    fn empty_list() {
        let defs = vec![];
        let order = resolve_start_order(&defs).unwrap();
        assert!(order.is_empty());
    }
}
