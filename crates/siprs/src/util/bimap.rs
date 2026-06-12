//! # 双方向マッピング
//!
//! `BiMap<L, R>` は `L → R` および `R → L` の両方向のマッピングを
//! O(1) で提供する汎用データ構造。
//! PJSUA のネイティブ ID（再利用可能）とランタイム ID（一意）の変換に使用する。

use std::collections::HashMap;
use std::fmt;
use std::hash::Hash;

/// 双方向マッピング。
///
/// `L → R` および `R → L` の両方向のマッピングを O(1) で提供する。
/// 内部に 2 つの `HashMap` を持ち、常に両者の整合性を保つ。
#[derive(Clone)]
pub struct BiMap<L, R> {
    /// Left → Right の順方向マッピング。
    left_to_right: HashMap<L, R>,
    /// Right → Left の逆方向マッピング。
    right_to_left: HashMap<R, L>,
}

impl<L, R> fmt::Debug for BiMap<L, R>
where
    L: fmt::Debug,
    R: fmt::Debug,
{
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("BiMap")
            .field("left_to_right", &self.left_to_right)
            .field("right_to_left", &self.right_to_left)
            .finish()
    }
}

impl<L, R> BiMap<L, R>
where
    L: Hash + Eq + Clone,
    R: Hash + Eq + Clone,
{
    /// 空の `BiMap` を生成する。
    pub fn new() -> Self {
        Self {
            left_to_right: HashMap::new(),
            right_to_left: HashMap::new(),
        }
    }

    /// `left` と `right` のペアを挿入する。
    ///
    /// 既存の `left` または `right` が衝突した場合、旧ペアを `Some((L, R))` で返し、
    /// 新しいペアで置き換える。新規挿入の場合は `None` を返す。
    #[must_use]
    pub fn insert(&mut self, left: L, right: R) -> Option<(L, R)> {
        // 既存のマッピングと衝突するエントリを除去する。
        // left → old_right を削除。
        let displaced_right = self.left_to_right.remove(&left);
        if let Some(ref old_r) = displaced_right {
            self.right_to_left.remove(old_r);
        }
        // old_left → right を削除。
        let displaced_left = self.right_to_left.remove(&right);
        if let Some(ref old_l) = displaced_left {
            self.left_to_right.remove(old_l);
        }

        // 新しいペアを挿入する（clone で元の値を保持し戻り値に使用）。
        self.left_to_right.insert(left.clone(), right.clone());
        self.right_to_left.insert(right.clone(), left.clone());

        // 置換された旧ペアを返す。left/right は clone のみ渡したためまだ有効。
        match (displaced_left, displaced_right) {
            (Some(l), Some(r)) => Some((l, r)),
            (Some(l), None) => Some((l, right)),
            (None, Some(r)) => Some((left, r)),
            (None, None) => None,
        }
    }

    /// `left` に対応する `right` を取得する。
    pub fn get_right(&self, left: &L) -> Option<&R> {
        self.left_to_right.get(left)
    }

    /// `right` に対応する `left` を取得する。
    pub fn get_left(&self, right: &R) -> Option<&L> {
        self.right_to_left.get(right)
    }

    /// `left` が存在するかを確認する。
    pub fn contains_left(&self, left: &L) -> bool {
        self.left_to_right.contains_key(left)
    }

    /// `right` が存在するかを確認する。
    pub fn contains_right(&self, right: &R) -> bool {
        self.right_to_left.contains_key(right)
    }

    /// `left` に対応するペアを削除し、削除されたペアを返す。
    ///
    /// 存在しない `left` の場合は `None` を返す。
    /// 削除は両方向のマッピングを同時に行う。
    pub fn remove_by_left(&mut self, left: &L) -> Option<(L, R)> {
        let right = self.left_to_right.remove(left)?;
        // 逆方向のマッピングも整合性を保って削除されていることを確認する。
        debug_assert!(self.right_to_left.remove(&right).as_ref() == Some(left));
        Some((left.clone(), right))
    }

    /// `right` に対応するペアを削除し、削除されたペアを返す。
    ///
    /// 存在しない `right` の場合は `None` を返す。
    /// 削除は両方向のマッピングを同時に行う。
    pub fn remove_by_right(&mut self, right: &R) -> Option<(L, R)> {
        let left = self.right_to_left.remove(right)?;
        // 順方向のマッピングも整合性を保って削除されていることを確認する。
        debug_assert!(self.left_to_right.remove(&left).as_ref() == Some(right));
        Some((left, right.clone()))
    }

    /// エントリ総数を返す。
    pub fn len(&self) -> usize {
        self.left_to_right.len()
    }

    /// 空かどうかを返す。
    pub fn is_empty(&self) -> bool {
        self.left_to_right.is_empty()
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
#[allow(unused_must_use)]
mod tests {
    use super::*;

    /// 空の BiMap に対する全操作が正しいことを確認する。
    #[test]
    fn test_empty_bimap() {
        let map: BiMap<u32, u64> = BiMap::new();
        assert!(map.is_empty());
        assert_eq!(map.len(), 0);
        assert!(!map.contains_left(&1));
        assert!(!map.contains_right(&10));
        assert_eq!(map.get_right(&1), None);
        assert_eq!(map.get_left(&10), None);
    }

    /// insert 後に get_right / get_left が正しい値を返すことを確認する。
    #[test]
    fn test_insert_and_get() {
        let mut map = BiMap::new();
        assert!(map.insert(1, 10).is_none());
        assert_eq!(map.get_right(&1), Some(&10));
        assert_eq!(map.get_left(&10), Some(&1));
    }

    /// 同じ left で再 insert した場合、旧ペアが返され置換されることを確認する。
    #[test]
    fn test_insert_replace_left() {
        let mut map = BiMap::new();
        map.insert(1, 10);
        let old = map.insert(1, 20);
        assert_eq!(old, Some((1, 10)));
        assert_eq!(map.get_right(&1), Some(&20));
        assert_eq!(map.get_left(&20), Some(&1));
        // 旧 right の逆マッピングは削除されている。
        assert!(!map.contains_right(&10));
    }

    /// 同じ right で再 insert した場合、旧ペアが返され置換されることを確認する。
    #[test]
    fn test_insert_replace_right() {
        let mut map = BiMap::new();
        map.insert(1, 10);
        let old = map.insert(2, 10);
        assert_eq!(old, Some((1, 10)));
        assert_eq!(map.get_right(&2), Some(&10));
        assert_eq!(map.get_left(&10), Some(&2));
        // 旧 left の順方向マッピングは削除されている。
        assert!(!map.contains_left(&1));
    }

    /// remove_by_left で両方向のマッピングが削除されることを確認する。
    #[test]
    fn test_remove_by_left() {
        let mut map = BiMap::new();
        map.insert(1, 10);
        let removed = map.remove_by_left(&1);
        assert_eq!(removed, Some((1, 10)));
        assert!(!map.contains_left(&1));
        assert!(!map.contains_right(&10));
        assert!(map.is_empty());
    }

    /// remove_by_right で両方向のマッピングが削除されることを確認する。
    #[test]
    fn test_remove_by_right() {
        let mut map = BiMap::new();
        map.insert(1, 10);
        let removed = map.remove_by_right(&10);
        assert_eq!(removed, Some((1, 10)));
        assert!(!map.contains_left(&1));
        assert!(!map.contains_right(&10));
        assert!(map.is_empty());
    }

    /// 存在しないキーの削除が None を返すことを確認する。
    #[test]
    fn test_remove_nonexistent() {
        let mut map: BiMap<u32, u64> = BiMap::new();
        assert_eq!(map.remove_by_left(&1), None);
        assert_eq!(map.remove_by_right(&10), None);
    }

    /// 存在しないキーの get が None を返すことを確認する。
    #[test]
    fn test_get_nonexistent() {
        let map: BiMap<u32, u64> = BiMap::new();
        assert_eq!(map.get_right(&1), None);
        assert_eq!(map.get_left(&10), None);
    }

    /// len と is_empty が insert/remove に応じて正しく変動することを確認する。
    #[test]
    fn test_len_and_is_empty() {
        let mut map = BiMap::new();
        assert!(map.is_empty());
        assert_eq!(map.len(), 0);

        map.insert(1, 10);
        assert!(!map.is_empty());
        assert_eq!(map.len(), 1);

        map.insert(2, 20);
        assert_eq!(map.len(), 2);

        map.remove_by_left(&1);
        assert_eq!(map.len(), 1);

        map.remove_by_right(&20);
        assert!(map.is_empty());
        assert_eq!(map.len(), 0);
    }

    /// BiMap<u32, u64> が Send + Sync を満たすことをコンパイル時に確認する。
    #[test]
    fn test_bimap_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<BiMap<u32, u64>>();
        assert_sync::<BiMap<u32, u64>>();
    }

    /// クローンが元のマッピングから独立していることを確認する。
    #[test]
    fn test_bimap_clone() {
        let mut map = BiMap::new();
        map.insert(1, 10);

        let cloned = map.clone();
        assert_eq!(cloned.get_right(&1), Some(&10));

        // 元のマップを変更してもクローンに影響しない。
        map.insert(1, 20);
        assert_eq!(cloned.get_right(&1), Some(&10));
        assert_eq!(map.get_right(&1), Some(&20));
    }

    /// Debug 出力が情報を含むことを確認する。
    #[test]
    fn test_bimap_debug() {
        let mut map = BiMap::new();
        map.insert(1, 10);
        let debug_str = format!("{:?}", map);
        assert!(debug_str.contains("BiMap"));
        assert!(debug_str.contains("left_to_right"));
        assert!(debug_str.contains("right_to_left"));
    }

    /// 1000 件の連続 insert / remove / lookup で不変条件が維持されることを確認する。
    #[test]
    fn test_bulk_insert_remove() {
        let mut map = BiMap::new();

        // 1000 件挿入
        for i in 0..1000 {
            assert!(map.insert(i, (i + 1000) as u64).is_none());
        }
        assert_eq!(map.len(), 1000);

        // 全件のルックアップ
        for i in 0..1000 {
            assert_eq!(map.get_right(&i), Some(&((i + 1000) as u64)));
            assert_eq!(map.get_left(&((i + 1000) as u64)), Some(&i));
        }

        // 500 件削除（偶数）
        for i in (0..1000).step_by(2) {
            let removed = map.remove_by_left(&i);
            assert_eq!(removed, Some((i, (i + 1000) as u64)));
        }
        assert_eq!(map.len(), 500);

        // 削除後のルックアップ
        for i in 0..1000 {
            if i % 2 == 0 {
                assert!(!map.contains_left(&i));
            } else {
                assert!(map.contains_left(&i));
            }
        }
    }

    /// insert の戻り値が正確な旧ペアを返すことを確認する。
    #[test]
    fn test_bimap_insert_returns_old_pair_exact() {
        let mut map = BiMap::new();

        // 新規挿入 → None
        assert!(map.insert(1, 10).is_none());

        // left 衝突 → Some((1, 10))
        assert_eq!(map.insert(1, 20), Some((1, 10)));

        // right 衝突 → Some((1, 20))
        assert_eq!(map.insert(2, 20), Some((1, 20)));

        // 完全新規 → None
        assert!(map.insert(3, 30).is_none());

        // 現在の状態: 2→20, 3→30
        assert_eq!(map.get_right(&2), Some(&20));
        assert_eq!(map.get_left(&20), Some(&2));
        assert_eq!(map.get_right(&3), Some(&30));
        assert_eq!(map.get_left(&30), Some(&3));
    }
}
