//! 置換辞書インターセプター — 全バックエンド共通のテキスト置換
//!
//! 移植元: ~/shyme/mycute/src/stt/recognizer.rs の apply_replaces_from_map()

use parking_lot::RwLock;

use indexmap::IndexMap;

/// 置換辞書をテキストに適用する。
///
/// IndexMap<String, Vec<String>> は { "置換後" => ["置換前1", "置換前2", ...] } の形式。
/// 最長一致優先でソートしてから順次置換する。
pub fn apply_replaces(replaces_map: &RwLock<IndexMap<String, Vec<String>>>, text: &str) -> String {
    let map = replaces_map.read();
    if map.is_empty() {
        return text.to_string();
    }

    // IndexMap を (before, after) ペアにフラット化
    let mut flat: Vec<(&str, &str)> = Vec::new();
    for (after, befores) in map.iter() {
        for before in befores {
            if !before.is_empty() {
                flat.push((before.as_str(), after.as_str()));
            }
        }
    }

    // 最長一致優先: 置換前文字列が長いものを先に適用する
    flat.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

    // 順次置換を適用
    let mut result = text.to_string();
    for (from, to) in &flat {
        result = result.replace(from, to);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_map() -> RwLock<IndexMap<String, Vec<String>>> {
        RwLock::new(IndexMap::new())
    }

    fn map_with(entries: Vec<(&str, Vec<&str>)>) -> RwLock<IndexMap<String, Vec<String>>> {
        let mut m = IndexMap::new();
        for (after, befores) in entries {
            m.insert(
                after.to_string(),
                befores.into_iter().map(|s| s.to_string()).collect(),
            );
        }
        RwLock::new(m)
    }

    #[test]
    fn test_empty_map_passthrough() {
        assert_eq!(apply_replaces(&empty_map(), "hello"), "hello");
    }

    #[test]
    fn test_single_replacement() {
        let map = map_with(vec![("world", vec!["hello"])]);
        assert_eq!(apply_replaces(&map, "hello"), "world");
    }

    #[test]
    fn test_multiple_replacements() {
        let map = map_with(vec![
            ("MYCUTE", vec!["mycute", "MyCute"]),
            ("WORLD", vec!["world"]),
        ]);
        assert_eq!(
            apply_replaces(&map, "mycute is MyCute world"),
            "MYCUTE is MYCUTE WORLD"
        );
    }

    #[test]
    fn test_longest_match_priority() {
        let map = map_with(vec![("α", vec!["a"]), ("αβ", vec!["ab"])]);
        assert_eq!(apply_replaces(&map, "ab"), "αβ");
    }

    #[test]
    fn test_empty_before_is_skipped() {
        let map = map_with(vec![("after", vec![""])]);
        assert_eq!(apply_replaces(&map, "text"), "text");
    }

    #[test]
    fn test_deterministic() {
        let map = map_with(vec![("X", vec!["a", "b"]), ("Y", vec!["c"])]);
        let r1 = apply_replaces(&map, "a b c");
        let r2 = apply_replaces(&map, "a b c");
        assert_eq!(r1, r2);
    }
}
