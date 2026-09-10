//! Production code next to a test that embeds a document the tree no longer has.
//! The embedding breaks the build, so it is an L3 trace, not a comment layer.

/// Production helper that must survive every scrub.
pub fn helper() -> u8 {
    1
}

#[cfg(test)]
mod tests {
    #[test]
    fn design_document_is_embedded() {
        let text = include_str!("../ABSENT-DESIGN-DOC.md");
        assert!(!text.is_empty());
    }
}
