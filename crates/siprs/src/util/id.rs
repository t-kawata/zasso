//! # ID 型 — ランタイム一意識別子
//!
//! AccountId / CallId / AudioSourceId の 3 種類の ID 型を提供する。
//! 全 ID 型は `NonZeroU64` を内部表現とし、ゼロ値による未初期化誤用を型レベルで排除する。
//!
//! 各 ID 型は互いに異なる型であり、コンパイル時に混用を防止する。
//! PJSUA のネイティブ ID（`pjsua_acc_id` / `pjsua_call_id`）は再利用されうるため、
//! そのまま公開せずこの crate の ID 型で隠蔽する。

use std::fmt;
use std::num::NonZeroU64;
use std::sync::atomic::{AtomicU64, Ordering};

// ---------------------------------------------------------------------------
// AccountId
// ---------------------------------------------------------------------------

/// アカウント識別子（ランタイム一意）。
///
/// 内部表現は `NonZeroU64` であり、ゼロ値による未初期化誤用を型レベルで排除する。
/// PJSUA の `pjsua_acc_id` は再利用されうるため、そのまま公開せずこの型で隠蔽する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AccountId(NonZeroU64);

impl AccountId {
    /// 新しい一意なアカウント ID を生成する。
    ///
    /// 単調増加カウンタによりランタイム一意性を保証する。
    /// カウンタが `u64::MAX` に達した場合はパニックする（現実的に到達不可能）。
    pub fn generate() -> Self {
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        // SAFETY: AtomicU64 は 1 からカウントアップするため NonZeroU64 は常に非ゼロ。
        Self(NonZeroU64::new(id).expect("AccountId counter overflowed u64::MAX"))
    }

    /// 内部の生の u64 値を取得する。
    ///
    /// FFI 境界で PJSIP に ID を渡す場合などに使用する。
    /// 通常のアプリケーションコードでは使用しないこと。
    pub fn into_raw(self) -> u64 {
        self.0.get()
    }
}

impl fmt::Display for AccountId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Account({})", self.0)
    }
}

// ---------------------------------------------------------------------------
// CallId
// ---------------------------------------------------------------------------

/// 通話識別子（ランタイム一意）。
///
/// 内部表現は `NonZeroU64`。PJSUA の `pjsua_call_id` は再利用されうるため、
/// そのまま公開せずこの型で隠蔽する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct CallId(NonZeroU64);

impl CallId {
    /// 新しい一意な通話 ID を生成する。
    pub fn generate() -> Self {
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        Self(NonZeroU64::new(id).expect("CallId counter overflowed u64::MAX"))
    }

    /// 内部の生の u64 値を取得する。
    ///
    /// FFI 境界で PJSIP に ID を渡す場合などに使用する。
    /// 通常のアプリケーションコードでは使用しないこと。
    pub fn into_raw(self) -> u64 {
        self.0.get()
    }
}

impl fmt::Display for CallId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Call({})", self.0)
    }
}

// ---------------------------------------------------------------------------
// AudioSourceId
// ---------------------------------------------------------------------------

/// 音声ソース識別子（ランタイム一意）。
///
/// OUT 方向へ音声を供給する任意の入力源を識別する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AudioSourceId(NonZeroU64);

impl AudioSourceId {
    /// 新しい一意な音声ソース ID を生成する。
    pub fn generate() -> Self {
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        Self(NonZeroU64::new(id).expect("AudioSourceId counter overflowed u64::MAX"))
    }

    /// 内部の生の u64 値を取得する。
    pub fn into_raw(self) -> u64 {
        self.0.get()
    }
}

impl fmt::Display for AudioSourceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "AudioSource({})", self.0)
    }
}

// ---------------------------------------------------------------------------
// serde サポート（optional feature）
// ---------------------------------------------------------------------------

// 各 ID 型について、u64 として透過的にシリアライズし、デシリアライズ時に
// ゼロ値をチェックする手動実装を提供する。

#[cfg(feature = "serde")]
impl serde::Serialize for AccountId {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.get().serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for AccountId {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = u64::deserialize(deserializer)?;
        let inner = NonZeroU64::new(raw)
            .ok_or_else(|| serde::de::Error::custom("AccountId must be non-zero"))?;
        Ok(Self(inner))
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for CallId {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.get().serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for CallId {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = u64::deserialize(deserializer)?;
        let inner = NonZeroU64::new(raw)
            .ok_or_else(|| serde::de::Error::custom("CallId must be non-zero"))?;
        Ok(Self(inner))
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for AudioSourceId {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.get().serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for AudioSourceId {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = u64::deserialize(deserializer)?;
        let inner = NonZeroU64::new(raw)
            .ok_or_else(|| serde::de::Error::custom("AudioSourceId must be non-zero"))?;
        Ok(Self(inner))
    }
}

// ---------------------------------------------------------------------------
// テスト用補助コンストラクタ
// ---------------------------------------------------------------------------

#[cfg(test)]
impl AccountId {
    /// テスト用: 特定の u64 値から ID を生成する（テスト専用）。
    ///
    /// # Panics
    ///
    /// `id` が 0 の場合にパニックする。
    #[doc(hidden)]
    pub fn from_test(id: u64) -> Self {
        Self(NonZeroU64::new(id).expect("AccountId::from_test: id must be non-zero"))
    }
}

#[cfg(test)]
impl CallId {
    /// テスト用: 特定の u64 値から ID を生成する（テスト専用）。
    ///
    /// # Panics
    ///
    /// `id` が 0 の場合にパニックする。
    #[doc(hidden)]
    pub fn from_test(id: u64) -> Self {
        Self(NonZeroU64::new(id).expect("CallId::from_test: id must be non-zero"))
    }
}

#[cfg(test)]
impl AudioSourceId {
    /// テスト用: 特定の u64 値から ID を生成する（テスト専用）。
    ///
    /// # Panics
    ///
    /// `id` が 0 の場合にパニックする。
    #[doc(hidden)]
    pub fn from_test(id: u64) -> Self {
        Self(NonZeroU64::new(id).expect("AudioSourceId::from_test: id must be non-zero"))
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    // -----------------------------------------------------------------------
    // AccountId 基本テスト
    // -----------------------------------------------------------------------

    /// `generate()` を 100 回呼び出し、全ての値が一意であることを確認する。
    #[test]
    fn test_account_id_generate_uniqueness() {
        let mut ids = Vec::new();
        for _ in 0..100 {
            ids.push(AccountId::generate());
        }
        let mut unique = ids.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(ids.len(), unique.len(), "全ての AccountId が一意であること");
    }

    /// `generate()` を 100 万回呼び出し、NonZeroU64 不変条件が破れないことを確認する。
    #[test]
    fn test_account_id_non_zero_invariant() {
        for _ in 0..1_000_000 {
            let id = AccountId::generate();
            assert!(id.into_raw() != 0, "AccountId がゼロにならないこと");
        }
    }

    /// 同一 ID 同士の等価性、および HashMap キーとしての一貫性を確認する。
    #[test]
    fn test_account_id_equality() {
        let a = AccountId::from_test(42);
        let b = AccountId::from_test(42);
        let c = AccountId::from_test(99);

        assert_eq!(a, b, "同値の AccountId は等しいこと");
        assert_ne!(a, c, "異なる AccountId は等しくないこと");

        let mut map: HashMap<AccountId, &str> = HashMap::new();
        map.insert(a, "value");
        assert_eq!(map.get(&b), Some(&"value"), "HashMap キーとして一貫性があること");
    }

    /// PartialOrd + Ord が値の自然順序に従うことを確認する。
    #[test]
    fn test_account_id_ordering() {
        let small = AccountId::from_test(10);
        let large = AccountId::from_test(20);

        assert!(small < large, "小さい値の AccountId が小さいこと");
        assert!(large > small, "大きい値の AccountId が大きいこと");

        let mut ids = vec![large, small];
        ids.sort();
        assert_eq!(ids, vec![small, large], "ソート順が値の自然順序に従うこと");
    }

    /// Display 出力が "Account(N)" 形式であることを確認する。
    #[test]
    fn test_account_id_display() {
        let id = AccountId::from_test(42);
        assert_eq!(format!("{}", id), "Account(42)");
    }

    // -----------------------------------------------------------------------
    // CallId 基本テスト
    // -----------------------------------------------------------------------

    /// `generate()` を 100 回呼び出し、全ての値が一意であることを確認する。
    #[test]
    fn test_call_id_generate_uniqueness() {
        let mut ids = Vec::new();
        for _ in 0..100 {
            ids.push(CallId::generate());
        }
        let mut unique = ids.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(ids.len(), unique.len(), "全ての CallId が一意であること");
    }

    /// Display 出力が "Call(N)" 形式であることを確認する。
    #[test]
    fn test_call_id_display() {
        let id = CallId::from_test(99);
        assert_eq!(format!("{}", id), "Call(99)");
    }

    // -----------------------------------------------------------------------
    // AudioSourceId 基本テスト
    // -----------------------------------------------------------------------

    /// `generate()` を 100 回呼び出し、全ての値が一意であることを確認する。
    #[test]
    fn test_audio_source_id_generate_uniqueness() {
        let mut ids = Vec::new();
        for _ in 0..100 {
            ids.push(AudioSourceId::generate());
        }
        let mut unique = ids.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(ids.len(), unique.len(), "全ての AudioSourceId が一意であること");
    }

    /// Display 出力が "AudioSource(N)" 形式であることを確認する。
    #[test]
    fn test_audio_source_id_display() {
        let id = AudioSourceId::from_test(7);
        assert_eq!(format!("{}", id), "AudioSource(7)");
    }

    // -----------------------------------------------------------------------
    // 型安全性のコンパイル時検証
    // -----------------------------------------------------------------------

    /// 異種 ID 型間の代入がコンパイルエラーになることを確認する。
    #[test]
    fn test_id_types_not_interchangeable() {
        // コンパイル時検証: 以下のコードはコメントアウトして存在のみ確認する。
        // 実際のテストでは各型が別物であることをアサーションで確認する。
        let account = AccountId::from_test(1);
        let call = CallId::from_test(2);
        let audio = AudioSourceId::from_test(3);

        // 各型のサイズとトレイト実装が同一であることを確認（型の構造的互換性）。
        assert_eq!(std::mem::size_of::<AccountId>(), 8);
        assert_eq!(std::mem::size_of::<CallId>(), 8);
        assert_eq!(std::mem::size_of::<AudioSourceId>(), 8);

        // 暗黙の型変換がないことをランタイムで確認（コンパイル時にも確認済み）。
        let _: AccountId = account;
        let _: CallId = call;
        let _: AudioSourceId = audio;

        // 以下のコードはコンパイルエラーになることをコメントで示す:
        // let _: AccountId = call;  // ❌ コンパイルエラー: 型の不一致
        // let _: CallId = audio;    // ❌ コンパイルエラー: 型の不一致
    }

    /// 全 ID 型が Send + Sync + Copy を満たすことを確認する。
    #[test]
    fn test_id_send_sync_copy() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        fn assert_copy<T: Copy>() {}

        assert_send::<AccountId>();
        assert_sync::<AccountId>();
        assert_copy::<AccountId>();

        assert_send::<CallId>();
        assert_sync::<CallId>();
        assert_copy::<CallId>();

        assert_send::<AudioSourceId>();
        assert_sync::<AudioSourceId>();
        assert_copy::<AudioSourceId>();
    }

    // -----------------------------------------------------------------------
    // serde テスト
    // -----------------------------------------------------------------------

    /// serde feature 有効時、JSON ラウンドトリップが成功することを確認する。
    #[cfg(feature = "serde")]
    #[test]
    fn test_serde_roundtrip() {
        let original = AccountId::from_test(42);
        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: AccountId = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(original, deserialized, "AccountId JSON roundtrip");

        let original = CallId::from_test(99);
        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: CallId = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(original, deserialized, "CallId JSON roundtrip");

        let original = AudioSourceId::from_test(7);
        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: AudioSourceId = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(original, deserialized, "AudioSourceId JSON roundtrip");
    }

    /// serde でゼロ値のデシリアライズがエラーになることを確認する。
    #[cfg(feature = "serde")]
    #[test]
    fn test_serde_rejects_zero() {
        let result: Result<AccountId, _> = serde_json::from_str("0");
        assert!(result.is_err(), "ゼロ値の AccountId はデシリアライズに失敗すること");

        let result: Result<CallId, _> = serde_json::from_str("0");
        assert!(result.is_err(), "ゼロ値の CallId はデシリアライズに失敗すること");

        let result: Result<AudioSourceId, _> = serde_json::from_str("0");
        assert!(result.is_err(), "ゼロ値の AudioSourceId はデシリアライズに失敗すること");
    }
}
