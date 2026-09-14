
//! Static link-set derivation strategy (§62.34 / N0103).
//!
//! The link set is derived from the resolved `lib/` directory contents — never
//! a hardcoded module list (C141 invariant). `libpjproject.a` (or
//! `pjproject.lib` on Windows) wins as a single integrated archive
//! (`static=pjproject`); otherwise every `lib*.a` stem is emitted sorted.
//! ELF linkers (Linux/Android) wrap the set in `--start-group`/`--end-group`
//! to resolve pjmedia ↔ pjmedia-codec ↔ pjlib-util cycles.
//!
//! The canonical derivation lives in [`crate::build::build_script_bindgen`]
//! (`derive_link_set` / `link_group_wrapper`); this module re-exports them as
//! the design record.

/// Derive the static link set from a resolved `lib/` directory (§62.34 / N0103).
pub use crate::build::build_script_bindgen::{derive_link_set, link_group_wrapper};

/// Integrated-archive file name on Unix (`libpjproject.a`).
pub const INTEGRATED_ARCHIVE_UNIX: &str = "libpjproject.a";
/// Integrated-archive file name on Windows (`pjproject.lib`).
pub const INTEGRATED_ARCHIVE_WINDOWS: &str = "pjproject.lib";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integrated_archive_wins_over_per_stem_enumeration() {
        let root = std::env::temp_dir().join(format!("p18-1-link-record-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("libpjproject.a"), b"").unwrap();
        std::fs::write(root.join("libpjsip.a"), b"").unwrap();
        assert_eq!(derive_link_set(&root), vec!["pjproject".to_string()]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn individual_stems_are_derived_not_hardcoded() {
        // never a hardcoded module array.
        let root =
            std::env::temp_dir().join(format!("p18-1-link-stem-record-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("libpjmedia.a"), b"").unwrap();
        std::fs::write(root.join("libpjsip.a"), b"").unwrap();
        let stems = derive_link_set(&root);
        assert_eq!(stems, vec!["pjmedia".to_string(), "pjsip".to_string()]);
        let _ = std::fs::remove_dir_all(&root);
    }
}
