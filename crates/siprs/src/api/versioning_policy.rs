//! バージョニングポリシー定数と準拠情報
//!
//! 本モジュールは crate のバージョニング契約、MSRV（Minimum Supported Rust Version）、
//! サポート対象 OS、PJSIP 依存バージョンに関する唯一の信頼できる情報源
//! （single source of truth）である。
//!
//! # 安定性
//!
//! 全関数は引数なし・副作用なし・常に同一値を返す純粋関数であり、
//! 任意のコンテクストから安全に呼び出せる。
//! 本モジュールは crate 初の安定公開 API サーフェスを構成する。

/// siprs crate の現在バージョン（Cargo.toml の package.version からコンパイル時に導出）。
const SIPRS_VERSION: &str = env!("CARGO_PKG_VERSION");

/// 本 crate がサポートする最小 Rust バージョン。
const SIPRS_MSRV: &str = "1.95";

/// 本 crate がターゲットとする固定 PJSIP バージョン。
const PJSIP_VERSION: &str = "2.17";

/// 本 crate がサポートする OS ターゲット三重項の一覧。
const SUPPORTED_OS_TARGETS: &[&str] = &[
    "x86_64-pc-windows-msvc",   // Windows x86_64
    "aarch64-apple-darwin",     // macOS arm64（Apple Silicon）
    "x86_64-unknown-linux-gnu", // Ubuntu x86_64
];

/// siprs crate のバージョン文字列（semver X.Y.Z 形式）を返す。
pub fn crate_version() -> &'static str {
    SIPRS_VERSION
}

/// 本 crate の MSRV（Minimum Supported Rust Version）を "1.95" 形式で返す。
pub fn msrv() -> &'static str {
    SIPRS_MSRV
}

/// MSRV を semver 範囲式 ">=1.95" として返す。
///
/// `>=1.95` は Rust ツールチェイン 1.95 以降をサポートすることを意味する。
/// パッチバージョン（1.95.x）は含意せず、メジャー.マイナー の境界のみを表す。
pub fn msrv_semver_range() -> &'static str {
    ">=1.95"
}

/// 本 crate が固定ターゲットとする PJSIP バージョン "2.17" を返す。
///
/// Patch バージョン（2.17.x）の更新は CI で互換性確認の上で追従可能だが、
/// Minor バージョン（2.18+）の変更は別途評価判断とする。
pub fn pjsip_version() -> &'static str {
    PJSIP_VERSION
}

/// サポート対象 OS ターゲット三重項のスライスを返す。
///
/// 現在の対象：
/// - Windows x86_64 (`x86_64-pc-windows-msvc`)
/// - macOS arm64 (`aarch64-apple-darwin`)
/// - Ubuntu x86_64 (`x86_64-unknown-linux-gnu`)
pub fn supported_os_list() -> &'static [&'static str] {
    SUPPORTED_OS_TARGETS
}

/// バージョニングポリシーの日本語説明文を返す。
///
/// 0.x フェーズでは semver に厳密には準拠せず、破壊的変更を許容する。
/// SipEventPayload のバリアント追加は `#[non_exhaustive]` により非破壊的変更となる。
pub fn versioning_policy_description() -> &'static str {
    "0.x phase: semver is not strictly followed. \
     Breaking changes are allowed and must be documented in CHANGELOG.md. \
     SipEventPayload variants can be added without a breaking version bump \
     due to #[non_exhaustive]."
}

/// 現在のフェーズで破壊的変更が許容されるかを返す。
///
/// 0.x フェーズでは `true` を返す。1.0 安定化後は `false` となる。
pub fn semver_breaking_change_allowance() -> bool {
    // 2026-07-15: 0.x フェーズのため true。
    // 1.0 リリース時に false に変更する。
    true
}

/// SipEventPayload が `#[non_exhaustive]` で宣言されるかを返す。
///
/// `true` の場合、新しいバリアントの追加は破壊的変更と見なされない。
pub fn non_exhaustive_sip_event_payload() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    /// [Normal] crate_version() が Cargo.toml の package.version と一致する。
    #[test]
    fn crate_version_matches_cargo_toml() {
        let version = crate_version();
        assert!(!version.is_empty(), "crate version must not be empty");
        // semver X.Y.Z 形式の検証
        let parts: Vec<&str> = version.split('.').collect();
        assert_eq!(parts.len(), 3, "version must be X.Y.Z format");
        for part in &parts {
            assert!(part.parse::<u32>().is_ok(), "each segment must be numeric");
        }
    }

    /// [Normal] msrv() が期待値 1.95 を返す。
    #[test]
    fn msrv_returns_expected_value() {
        assert_eq!(msrv(), "1.95");
    }

    /// [Normal] versioning_policy_description() が空文字列ではなく、0.x フェーズの説明を含む。
    #[test]
    fn versioning_policy_description_is_meaningful() {
        let desc = versioning_policy_description();
        assert!(!desc.is_empty(), "description must not be empty");
        assert!(desc.contains("0.x"), "description must reference 0.x phase");
    }

    /// [Normal] semver_breaking_change_allowance() が 0.x フェーズでは true を返す。
    #[test]
    fn breaking_changes_allowed_in_0x_phase() {
        assert!(semver_breaking_change_allowance());
    }

    /// [Normal] supported_os_list() が主要 3 プラットフォームを含む。
    #[test]
    fn supported_os_list_contains_required_targets() {
        let list = supported_os_list();
        assert!(list.contains(&"x86_64-pc-windows-msvc"));
        assert!(list.contains(&"aarch64-apple-darwin"));
        assert!(list.contains(&"x86_64-unknown-linux-gnu"));
    }

    /// [Normal] pjsip_version() が固定バージョン "2.17" を返す。
    #[test]
    fn pjsip_version_is_fixed() {
        assert_eq!(pjsip_version(), "2.17");
    }

    /// [Normal] non_exhaustive_sip_event_payload() が true を返す。
    #[test]
    fn non_exhaustive_allows_variant_additions() {
        assert!(non_exhaustive_sip_event_payload());
    }

    /// [Boundary] msrv_semver_range() がパース可能な semver 範囲式を返す。
    #[test]
    fn msrv_semver_range_is_valid() {
        let range = msrv_semver_range();
        assert!(!range.is_empty(), "range must not be empty");
        assert!(
            range.starts_with(">="),
            "range must start with >= for minimum version constraint"
        );
        let version_part = range.trim_start_matches(">=");
        let parts: Vec<&str> = version_part.split('.').collect();
        assert_eq!(parts.len(), 2, "MSRV should be major.minor format");
        assert!(
            parts[0].parse::<u32>().is_ok(),
            "major version must be numeric"
        );
        assert!(
            parts[1].parse::<u32>().is_ok(),
            "minor version must be numeric"
        );
    }

    /// [Invariant] 全公開関数が純粋（引数なし、副作用なし、常に同一の戻り値を返す）であることを確認する。
    #[test]
    fn all_pure_functions_are_deterministic() {
        // 2回呼び出して結果が一貫することを確認
        assert_eq!(crate_version(), crate_version());
        assert_eq!(msrv(), msrv());
        assert_eq!(pjsip_version(), pjsip_version());
        assert_eq!(msrv_semver_range(), msrv_semver_range());
        assert_eq!(
            versioning_policy_description(),
            versioning_policy_description()
        );
        assert_eq!(
            semver_breaking_change_allowance(),
            semver_breaking_change_allowance()
        );
        assert_eq!(
            non_exhaustive_sip_event_payload(),
            non_exhaustive_sip_event_payload()
        );
        assert_eq!(supported_os_list(), supported_os_list());
    }

    /// [Invariant] 全公開定数が &'static str であり、コンパイル時に静的なライフタイムを持つ。
    #[test]
    fn all_constants_are_static_strs() {
        // コンパイル時に &'static str であることを利用し、実行時に内容を検証
        let _: &'static str = crate_version();
        let _: &'static str = msrv();
        let _: &'static str = pjsip_version();
        let _: &'static str = msrv_semver_range();
    }
}
