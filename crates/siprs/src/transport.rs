// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.

// [::TICKET::] P3-1: TransportConfig re-export.
// Re-exports the canonical transport types defined in
// `config::transport_ice_spec` (RFC N0015 §12-13) at the `transport` module
// root so consumers have a single transport surface.

pub use crate::config::transport_ice_spec::{
    IceConfig, StunServerConfig, TransportConfig, TurnServerConfig, TurnTransport,
    UdpTransportConfig,
};

#[cfg(test)]
mod tests {
    // @verifies C016
    // [::TICKET::] P10-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-5 --for-spec --no-implementation-order`.
    #[test]
    // [::TICKET::] P10-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-5 --for-spec --no-implementation-order`.
    fn transport_type_removed_from_source_tree() -> std::io::Result<()> {
        // The needle is built dynamically so this test module itself does not
        // contain the identifier it is scanning (avoiding a self-match).
        let needle = "Transport".to_string() + "Type";
        let violations = find_identifier_outside_comments(&needle)?;
        assert!(
            violations.is_empty(),
            "`{needle}` must not appear outside comments in src/, found: {violations:?}"
        );
        Ok(())
    }

    /// Walk `src/` recursively and gather every line where `needle` appears
    /// outside of `//`-prefixed comments.
    // [::TICKET::] P10-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-5 --for-spec --no-implementation-order`.
    fn find_identifier_outside_comments(needle: &str) -> std::io::Result<Vec<String>> {
        let src_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut files = Vec::new();
        collect_rs_files(&src_dir, &mut files)?;

        let mut violations = Vec::new();
        for path in files {
            let text = std::fs::read_to_string(&path)?;
            for (idx, line) in text.lines().enumerate() {
                let trimmed = line.trim_start();
                if trimmed.starts_with("//") {
                    continue;
                }
                if trimmed.contains(needle) {
                    violations.push(format!("{}:{}: {}", path.display(), idx + 1, trimmed));
                }
            }
        }
        Ok(violations)
    }

    /// Recursively collect all `.rs` file paths under `dir`.
    // [::TICKET::] P10-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-5 --for-spec --no-implementation-order`.
    fn collect_rs_files(
        dir: &std::path::Path,
        out: &mut Vec<std::path::PathBuf>,
    ) -> std::io::Result<()> {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                collect_rs_files(&path, out)?;
            } else if path.extension().map_or(false, |e| e == "rs") {
                out.push(path);
            }
        }
        Ok(())
    }
}
