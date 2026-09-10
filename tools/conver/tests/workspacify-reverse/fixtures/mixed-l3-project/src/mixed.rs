// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.

/// Production entry point. Its presence makes this file ineligible for
/// whole-file removal, so the L3 test below has to stay put.
pub fn start() -> bool {
    true
}

#[cfg(test)]
mod tests {
    #[test]
    fn spec_is_present() {
        // @verifies C012
        let text = std::fs::read_to_string("RFC-ROOT.md").unwrap();
        assert!(text.contains("audio only"));
    }
}
