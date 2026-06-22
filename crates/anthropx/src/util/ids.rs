//! # リクエスト ID 生成
//!
//! `generate_request_id()` はトレーサビリティ用の一意識別子を生成する。
//! server feature が有効な場合は UUID v4 を使用し、無効な場合は
//! 簡易実装にフォールバックする。

#[cfg(not(feature = "server"))]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(not(feature = "server"))]
use std::time::{SystemTime, UNIX_EPOCH};

/// リクエスト追跡用の一意識別子を生成する。
///
/// server feature 有効時は UUID v4 を返す。無効時は
/// タイムスタンプベースの簡易 ID を返す。
#[cfg(feature = "server")]
pub fn generate_request_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// server feature 無効時のフォールバック実装。
///
/// タイムスタンプ（Unix エポックからのナノ秒）＋アトミックカウンタの
/// 16進数文字列を返す。アトミックカウンタにより同一ナノ秒内の呼び出しでも
/// 一意性を保証する。
#[cfg(not(feature = "server"))]
pub fn generate_request_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("req_{nanos:x}_{count:x}")
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// generate_request_id() が空文字列でないこと。
    #[test]
    fn request_id_not_empty() {
        let id = generate_request_id();
        assert!(!id.is_empty(), "request id should not be empty");
    }

    /// 2 回の呼び出しで異なる値が返ること。
    #[test]
    fn request_id_unique() {
        let id1 = generate_request_id();
        let id2 = generate_request_id();
        assert_ne!(id1, id2, "consecutive calls should produce different ids");
    }

    /// server feature 有効時、UUID v4 形式（36 文字、ハイフン区切り 5 ブロック）に
    /// 準拠していること。
    #[cfg(feature = "server")]
    #[test]
    fn request_id_uuid_v4_format() {
        let id = generate_request_id();
        assert_eq!(id.len(), 36, "UUID v4 should be 36 characters");
        let parts: Vec<&str> = id.split('-').collect();
        assert_eq!(
            parts.len(),
            5,
            "UUID v4 should have 5 hyphen-separated parts"
        );
        assert_eq!(parts[0].len(), 8);
        assert_eq!(parts[1].len(), 4);
        assert_eq!(parts[2].len(), 4);
        assert_eq!(parts[3].len(), 4);
        assert_eq!(parts[4].len(), 12);
        // UUID v4 のバージョンナブル: 13 文字目が '4'
        assert_eq!(&id[14..15], "4", "UUID v4 version nibble should be 4");
    }

    /// server feature 無効時もパニックなく ID を生成できること。
    #[cfg(not(feature = "server"))]
    #[test]
    fn request_id_fallback_non_empty() {
        let id = generate_request_id();
        assert!(!id.is_empty(), "fallback id should not be empty");
    }
}
