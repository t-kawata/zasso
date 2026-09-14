// [::TICKET::] P11-5: C038-Inv regression guard — no `unsafe` outside `src/ffi/`.
//
// The FFI layer is the only module allowed to contain `unsafe` (RFC §27).
// This test greps the concrete C038 scope (`src/runtime/`, `src/client.rs`,
// `src/config/`) and fails if a non-test line uses the `unsafe` keyword.
// Test-module lines are excluded via a brace-tracking state machine.

use std::path::Path;

// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
fn strip_to_visible_code(line: &str, in_block_comment: &mut bool) -> String {
    let mut visible = String::new();
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if *in_block_comment {
            if c == '*' && chars.peek() == Some(&'/') {
                chars.next();
                *in_block_comment = false;
            }
            continue;
        }
        if c == '/' && chars.peek() == Some(&'/') {
            break; // line comment
        }
        if c == '/' && chars.peek() == Some(&'*') {
            chars.next();
            *in_block_comment = true;
            continue;
        }
        visible.push(c);
    }
    visible
}

/// Returns the 1-indexed line numbers that contain `unsafe` outside test modules.
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
fn scan_text(text: &str) -> Vec<usize> {
    let mut hits = Vec::new();
    let mut in_block_comment = false;
    let mut brace_depth: i64 = 0;
    let mut test_module_depths: Vec<i64> = Vec::new();
    let mut pending_test_open = false;

    for (idx, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if pending_test_open {
            test_module_depths.push(brace_depth);
            pending_test_open = false;
        }
        if line.starts_with("#[cfg(test)]") || line.starts_with("mod tests") {
            pending_test_open = true;
        }
        let visible = strip_to_visible_code(line, &mut in_block_comment);
        brace_depth += visible.matches('{').count() as i64 - visible.matches('}').count() as i64;
        while test_module_depths.last().is_some_and(|&d| brace_depth <= d) {
            test_module_depths.pop();
        }
        if !test_module_depths.is_empty() {
            continue; // inside a test module — excluded from the invariant
        }
        if visible.contains("unsafe") {
            hits.push(idx + 1);
        }
    }
    hits
}

// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
fn scan_rust_file(path: &Path) -> std::io::Result<Vec<usize>> {
    let text = std::fs::read_to_string(path)?;
    Ok(scan_text(&text))
}

// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
fn scan_dir_recursive(dir: &Path) -> std::io::Result<Vec<(String, Vec<usize>)>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            out.extend(scan_dir_recursive(&path)?);
        } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
            let hits = scan_rust_file(&path)?;
            if !hits.is_empty() {
                out.push((path.display().to_string(), hits));
            }
        }
    }
    Ok(out)
}

#[test]
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
fn unsafe_isolated_to_ffi() -> std::io::Result<()> {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut violations = Vec::new();

    for dir in ["runtime", "config"] {
        violations.extend(scan_dir_recursive(&src.join(dir))?);
    }

    let client_rs = src.join("client.rs");
    if client_rs.exists() {
        let hits = scan_rust_file(&client_rs)?;
        if !hits.is_empty() {
            violations.push((client_rs.display().to_string(), hits));
        }
    }

    assert!(
        violations.is_empty(),
        "C038 violated — `unsafe` found outside src/ffi/: {violations:?}"
    );
    Ok(())
}
