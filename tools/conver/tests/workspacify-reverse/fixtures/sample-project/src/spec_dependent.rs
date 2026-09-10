//! Tests that assert against the design document. These are L3: they cannot run
//! once the design document is removed, so they are detection targets.

#[cfg(test)]
mod tests {
    use std::path::Path;

    #[test]
    fn purpose_scope_remains_audio_only() {
        let rfc_path = Path::new("RFC-ROOT.md");
        assert!(rfc_path.exists(), "RFC-ROOT.md must exist");
        let content = std::fs::read_to_string(rfc_path).unwrap();
        assert!(content.contains("audio only"));
    }
}
