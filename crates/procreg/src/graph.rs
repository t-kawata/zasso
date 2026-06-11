//! # グラフ — DAG トポロジカルソート
//!
//! `ProcessDef` の `depends_on` 宣言から起動順序を解決する。
//! `petgraph` の `DiGraph` + `toposort` を使用する。

use std::collections::HashMap;

use petgraph::algo::toposort;
use petgraph::graph::{DiGraph, NodeIndex};

use crate::error::RegistryError;
use crate::ProcessDef;

/// `ProcessDef` のスライスから依存関係の深さでグループ化された起動順序を決定する。
///
/// 返値は `Vec<Vec<String>>`。外側の Vec はレベル順（0, 1, 2...）、
/// 内側の Vec は同一レベル内のプロセス名（並列起動可能）。
///
/// # 例
///
/// A が依存なし、B が A に依存、C が B に依存する場合：
/// `[["A"], ["B"], ["C"]]`
///
/// A, B が依存なし、C が A, B に依存する場合：
/// `[["A", "B"], ["C"]]`
///
/// # エラー
///
/// - `UnknownDependency`: 存在しないプロセス名が `depends_on` に指定された
/// - `CircularDependency`: 循環依存が存在する
#[allow(dead_code)]
pub(crate) fn resolve_start_levels(defs: &[ProcessDef]) -> Result<Vec<Vec<String>>, RegistryError> {
    if defs.is_empty() {
        return Ok(vec![]);
    }

    // 依存関係マップを構築する: プロセス名 → 依存先プロセス名のリスト
    let mut dependencies: HashMap<&str, Vec<&str>> = HashMap::new();
    for def in defs {
        let deps: Vec<&str> = def.depends_on.iter().map(|s| s.as_str()).collect();
        dependencies.insert(def.name.as_str(), deps);
    }

    // 各プロセスの深さを計算する（タブロー法）
    let mut depths: HashMap<&str, usize> = HashMap::new();

    fn compute_depth<'a>(
        name: &'a str,
        dependencies: &HashMap<&'a str, Vec<&'a str>>,
        depths: &mut HashMap<&'a str, usize>,
        visiting: &mut Vec<&'a str>,
    ) -> Result<usize, RegistryError> {
        if let Some(&depth) = depths.get(name) {
            return Ok(depth);
        }

        // 循環依存の検出（このコードパスは resolve_start_order のバックアップチェック）
        if visiting.contains(&name) {
            return Err(RegistryError::CircularDependency);
        }

        let deps = dependencies.get(name).map(|v| v.as_slice()).unwrap_or(&[]);
        if deps.is_empty() {
            depths.insert(name, 0);
            return Ok(0);
        }

        visiting.push(name);
        let max_dep_depth = deps
            .iter()
            .map(|dep| {
                if !dependencies.contains_key(dep) {
                    return Err(RegistryError::UnknownDependency {
                        src: name.to_string(),
                        dep: dep.to_string(),
                    });
                }
                compute_depth(dep, dependencies, depths, visiting)
            })
            .collect::<Result<Vec<usize>, _>>()?
            .into_iter()
            .max()
            .unwrap_or(0);
        visiting.pop();

        let depth = max_dep_depth + 1;
        depths.insert(name, depth);
        Ok(depth)
    }

    for def in defs {
        let mut visiting = Vec::new();
        compute_depth(def.name.as_str(), &dependencies, &mut depths, &mut visiting)?;
    }

    // 最大深さからレベルのグループを作成する
    let max_depth = depths.values().cloned().max().unwrap_or(0);
    let mut levels: Vec<Vec<String>> = vec![Vec::new(); max_depth + 1];

    // トポロジカルソートの順序を尊重するため、resolve_start_order の結果順に配置する
    let order = resolve_start_order(defs)?;
    for name in &order {
        if let Some(&depth) = depths.get(name.as_str()) {
            levels[depth].push(name.clone());
        }
    }

    Ok(levels)
}

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
pub(crate) fn resolve_start_order(defs: &[ProcessDef]) -> Result<Vec<String>, RegistryError> {
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
    let sorted = toposort(&graph, None).map_err(|_| RegistryError::CircularDependency)?;

    Ok(sorted
        .iter()
        .map(|node_idx| graph[*node_idx].to_string())
        .collect())
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
        let defs = vec![def("B", &["A"]), def("C", &["B"]), def("A", &[])];
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
        let defs = vec![def("A", &["B"]), def("B", &["A"])];
        let result = resolve_start_order(&defs);
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            RegistryError::CircularDependency
        ));
    }

    /// 存在しないプロセスを依存先に指定した場合、
    /// UnknownDependency を返すことを確認する。
    #[test]
    fn unknown_dependency() {
        let defs = vec![def("A", &["B"])];
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

    // ================================================================
    // resolve_start_levels のテスト
    // ================================================================

    /// 線形依存 A→B→C がレベル分割できることを確認する。
    #[test]
    fn levels_linear_dependency() {
        let defs = vec![def("B", &["A"]), def("C", &["B"]), def("A", &[])];
        let levels = resolve_start_levels(&defs).unwrap();
        assert_eq!(levels, vec![vec!["A"], vec!["B"], vec!["C"]]);
    }

    /// ダイヤモンド依存 A→(B, C)→D がレベル分割できることを確認する。
    /// レベル0 = [A], レベル1 = [B, C]（順序不定）, レベル2 = [D]
    #[test]
    fn levels_diamond_dependency() {
        let defs = vec![
            def("B", &["A"]),
            def("C", &["A"]),
            def("D", &["B", "C"]),
            def("A", &[]),
        ];
        let levels = resolve_start_levels(&defs).unwrap();
        assert_eq!(levels.len(), 3);
        assert_eq!(levels[0], vec!["A"]);
        let mut level1 = levels[1].clone();
        level1.sort();
        assert_eq!(level1, vec!["B", "C"]);
        assert_eq!(levels[2], vec!["D"]);
    }

    /// 依存なし独立プロセスが同じレベルに集約されることを確認する。
    #[test]
    fn levels_independent_processes() {
        let defs = vec![def("A", &[]), def("B", &[]), def("C", &[])];
        let levels = resolve_start_levels(&defs).unwrap();
        assert_eq!(levels.len(), 1);
        let mut flattened = levels[0].clone();
        flattened.sort();
        assert_eq!(flattened, vec!["A", "B", "C"]);
    }

    /// 混合依存 (A, B, D が依存なし、C は B, D に依存) を確認する。
    #[test]
    fn levels_mixed_deps() {
        let defs = vec![
            def("A", &[]),
            def("B", &[]),
            def("C", &["B", "D"]),
            def("D", &[]),
        ];
        let levels = resolve_start_levels(&defs).unwrap();
        assert_eq!(levels.len(), 2);
        let mut level0 = levels[0].clone();
        level0.sort();
        assert_eq!(level0, vec!["A", "B", "D"]);
        assert_eq!(levels[1], vec!["C"]);
    }

    /// 単一プロセスのレベル分割を確認する。
    #[test]
    fn levels_single_process() {
        let defs = vec![def("A", &[])];
        let levels = resolve_start_levels(&defs).unwrap();
        assert_eq!(levels, vec![vec!["A"]]);
    }

    /// 空リストのレベル分割が空を返すことを確認する。
    #[test]
    fn levels_empty() {
        let defs = vec![];
        let levels = resolve_start_levels(&defs).unwrap();
        let empty: Vec<Vec<String>> = vec![];
        assert_eq!(levels, empty);
    }

    /// 循環依存をエラーとして検出することを確認する。
    #[test]
    fn levels_circular() {
        let defs = vec![def("A", &["B"]), def("B", &["A"])];
        let result = resolve_start_levels(&defs);
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            RegistryError::CircularDependency
        ));
    }

    /// 存在しないプロセスへの依存をエラーとして検出することを確認する。
    #[test]
    fn levels_unknown_dep() {
        let defs = vec![def("A", &["B"])];
        let result = resolve_start_levels(&defs);
        assert!(result.is_err());
        match result.unwrap_err() {
            RegistryError::UnknownDependency { src, dep } => {
                assert_eq!(src, "A");
                assert_eq!(dep, "B");
            }
            other => panic!("Expected UnknownDependency, got {other:?}"),
        }
    }
}
