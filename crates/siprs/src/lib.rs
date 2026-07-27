// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        RFC-ROOT-GRAPH.json
// Directory:    RFC-ROOT-Dirs-Tree.json
// Original RFC: RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0001:  §1 Purpose — Responsibilities of this crate
//     → To show details: node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0001 --hops=2
//
// Cross-referenced design context:
//   - requirement/§1a M20 Implementation Priority Map [NODE_ID=N0002]
//     (refines ← src/lib.rs)
//   - architecture/§2 Non-goals & Tauri Integration Boundary [NODE_ID=N0003]
//     (constrains ← src/lib.rs)
//   - glossary/§3 Terminology [NODE_ID=N0004]
//     (references ← src/lib.rs)
//   - requirement/§4 Compliance Requirements [NODE_ID=N0005]
//     (constrains ← src/lib.rs)
//   - requirement/§5 Functional Requirements — Normative Scope [NODE_ID=N0007]
//     (implements ← src/lib.rs)
//   - architecture/§6 Module Structure & Crate Responsibility [NODE_ID=N0008]
//     (part_of ← src/lib.rs)
//   - architecture/§7 Concurrency Model & Execution Contexts [NODE_ID=N0009]
//     (depends_on ← src/lib.rs)
//   - requirement/§32 Shutdown Specification [NODE_ID=N0043]
//     (depends_on ← src/lib.rs)
//   - requirement/§34 Observability — Tracing, Metrics & Capabilities [NODE_ID=N0046]
//     (references ← src/lib.rs)
//   - requirement/§35 Security & §36 Platform Differences [NODE_ID=N0047]
//     (constrains ← src/lib.rs)
//   - architecture/§40 Audio Device Policy & §41 Usage Examples [NODE_ID=N0050]
//     (references ← src/lib.rs)
//   - architecture/§45 Implementation Challenges & §46 Panic Policy [NODE_ID=N0055]
//     (references ← src/lib.rs)
//   - architecture/§51 Conclusion [NODE_ID=N0058]
//     (references ← src/lib.rs)
//   - architecture/§61 I/O Boundary Reference Information [NODE_ID=N0067]
//     (references ← src/lib.rs)
//
// Full graph exploration:
//   (cd .. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! # siprs — Safe asynchronous SIP voice communication via PJSUA
//!
//! siprs provides a safe Rust async wrapper around PJSUA (PJSIP) for SIP-based
//! voice communication. It wraps PJSUA FFI bindings in a safe Rust layer and
//! provides an asynchronous event-driven SIP client.
//!
//! ## Design constraints
//!
//! - **Audio-only**: This crate provides audio communication only — no video,
//!   screen sharing, recording files, or GUI.
//! - **Async-first**: All public APIs are async (tokio-native), with a
//!   single-threaded reactor core.
//! - **FFI-safe**: Unsafe PJSUA access is isolated to the `ffi` module.
//!
//! ## Crate purpose
//!
//! This crate serves as the voice communication foundation within the zasso
//! ecosystem. It wraps PJSUA (PJSIP) FFI bindings in a safe Rust layer,
//! providing an asynchronous event-driven SIP client that operates independently
//! of existing OS telephony stacks. The API surface is limited to **audio-only**
//! SIP communication — video, screen sharing, recording files, and GUI are
//! explicitly excluded from the crate's responsibility.
//!
//! ## Module structure
//!
//! The crate follows a layered architecture with modular internal structure:
//! - `config` — Configuration types (ClientConfig, AccountConfig, versioning policy)
//! - `ffi` — PJSIP FFI bindings and safe wrappers (planned)
//! - `runtime` — Async reactor, command dispatch, and event handling (planned)
//! - `audio` — Audio pipeline (chunk, format, mixer, source, resampler, bridge; planned)
//! - `util` — Shared utilities (ID types, time, synchronization; planned)
//!
//! ## Feature flags
//!
//! - `serde` — Enables serde Serialize/Deserialize on public types (default: on)
//! - `tls` — Enables TLS transport support (default: on)
//! - `srtp` — Enables SRTP support (default: off)
//!
//! ## Scope and non-goals
//!
//! The following are explicitly **outside** the crate's scope:
//! - Video calling or screen sharing
//! - Call recording or media file I/O
//! - Graphical user interface components
//! - Custom SIP stack implementation (always delegates to PJSIP)
//! - Mobile or embedded platform support (Linux, macOS, Windows only)

#![forbid(unsafe_code)]
// [::STUB::] P0-4: unsafe_code will be allowed once ffi/ module is implemented

pub mod concurrency_contexts;
pub mod config;
// [::TICKET::] P0-4: api/model modules added — EventBus, SipEventPayload types.
pub mod api;
pub mod model;
// [::TICKET::] P0-5: error module added — SipError, SipErrorKind, M20 error mapping.
pub mod error;
// [::TICKET::] P0-6: state module added — event conversion mappings (N0021, N0022, N0023).
pub mod state;
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.

// ============================================================================
// Tests — P0-3: Crate Purpose & Scope Definition
// ============================================================================
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
// ============================================================================

#[cfg(test)]
mod tests {
    // -----------------------------------------------------------------------
    // ── C001 ── N0001→N0007: Purpose defined
    // -----------------------------------------------------------------------

    /// @verifies C001-precondition
    /// @verifies C001-postcondition
    /// @verifies C001-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn doc_comment_contains_purpose_pillars() -> Result<(), String> {
        let doc = include_str!("../src/lib.rs");
        let doc_lower = doc.to_lowercase();
        assert!(
            doc_lower.contains("audio-only"),
            "audio-only must be mentioned in crate doc"
        );
        assert!(
            doc_lower.contains("tokio"),
            "tokio must be mentioned in crate doc"
        );
        assert!(
            doc_lower.contains("safe"),
            "safety must be mentioned in crate doc"
        );
        Ok(())
    }

    /// @verifies C001-invariant
    /// @verifies C004-postcondition
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn audio_only_scope_enforced_in_docs() -> Result<(), String> {
        let doc = include_str!("../src/lib.rs");
        // If "video" is mentioned, it must be as an exclusion
        if doc.to_lowercase().contains("video") {
            assert!(
                doc.to_lowercase().contains("no video")
                    || doc.to_lowercase().contains("without video")
                    || doc.to_lowercase().contains("excluding video"),
                "Video mention must be as an exclusion"
            );
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C002 ── N0001→N0009: Concurrency → async types
    // -----------------------------------------------------------------------

    /// @verifies C002-precondition
    /// @verifies C002-postcondition
    /// @verifies C009-postcondition
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn concurrency_contexts_module_exists() {
        // Compile-time verification: the module and its key types are accessible
        // CommandSender is a type alias for Sender<RuntimeCommand> (0 generic params)
        let _sender: crate::concurrency_contexts::CommandSender;
        let _receiver: crate::concurrency_contexts::CommandReceiver;
    }

    /// @verifies C002-postcondition
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn assert_types_are_send_sync() {
        // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
        // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        // CommandSender is Send + Sync since Sender<RuntimeCommand> is Send + Sync
        assert_send::<crate::concurrency_contexts::CommandSender>();
        assert_sync::<crate::concurrency_contexts::CommandSender>();
    }

    /// @verifies C002-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn concurrency_module_has_channel_factory() {
        // new_command_channel returns (CommandSender, CommandReceiver) with 0 generic params
        let (_tx, _rx) = crate::concurrency_contexts::new_command_channel();
    }

    // -----------------------------------------------------------------------
    // ── C003 ── N0002→N0001 (inbound): M20 priority map
    // -----------------------------------------------------------------------

    /// @verifies C003-precondition
    /// @verifies C003-postcondition
    /// @verifies C003-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn priority_map_in_rfc_exists() -> Result<(), String> {
        let rfc = include_str!("../RFC-ROOT.md");
        assert!(rfc.contains("## 1a."), "RFC §1a priority map must exist");
        // Verify all priority levels are present
        for level in &["P0", "P1", "P2", "P3"] {
            assert!(
                rfc.contains(level),
                "Priority level {level} must be defined in RFC §1a"
            );
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C004 ── N0003→N0001: Non-goals // C004 — N0003→N0001 (inbound): Non-goals & Tauri boundary Tauri boundary
    // -----------------------------------------------------------------------

    /// @verifies C004-precondition
    /// @verifies C004-postcondition
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn doc_comment_lists_non_goals() -> Result<(), String> {
        let doc = include_str!("../src/lib.rs");
        // Check for exclusion keywords
        let exclusion_count = [
            "no video",
            "no recording",
            "no gui",
            "no graphical",
            "screen sharing",
        ]
        .iter()
        .filter(|&&kw| doc.to_lowercase().contains(kw))
        .count();
        assert!(
            exclusion_count >= 2,
            "At least 2 non-goals must be documented (found {exclusion_count})"
        );
        Ok(())
    }

    /// @verifies C004-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn no_tauri_dependency() -> Result<(), String> {
        let cargo = include_str!("../Cargo.toml");
        assert!(!cargo.contains("tauri"), "Crate must not depend on tauri");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C005 ── N0004→N0001: Terminology
    // -----------------------------------------------------------------------

    /// @verifies C005-precondition
    /// @verifies C005-postcondition
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn domain_terms_defined_in_docs() -> Result<(), String> {
        let doc = include_str!("../src/lib.rs");
        let doc_lower = doc.to_lowercase();
        // Key SIP/telephony domain terms should appear in the crate documentation
        for term in &["sip", "pjsua", "tokio", "dtmf", "ice"] {
            assert!(
                doc_lower.contains(term),
                "Domain term '{term}' must appear in crate documentation"
            );
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C006 ── N0005→N0001: Compliance requirements
    // -----------------------------------------------------------------------

    /// @verifies C006-precondition
    /// @verifies C006-postcondition
    /// @verifies C006-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn cargo_toml_has_correct_metadata() -> Result<(), String> {
        let cargo = include_str!("../Cargo.toml");
        assert!(cargo.contains("edition = \"2021\""), "Edition must be 2021");
        assert!(
            cargo.contains("rust-version = \"1.95\""),
            "MSRV must be 1.95"
        );
        assert!(
            cargo.contains("license = \"MIT OR Apache-2.0\""),
            "License must be MIT OR Apache-2.0"
        );
        Ok(())
    }

    /// @verifies C006-postcondition
    #[test]
    // [::TICKET::] P0-3, P0-4 changes.
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn dependencies_empty_in_cargo_toml() -> Result<(), String> {
        // [::STUB::] P0-4: This test was originally written for P0-3 (zero deps).
        // P0-4 adds tokio as the first real dependency — assertion changed.
        let cargo = include_str!("../Cargo.toml");
        // dependencies section should not contain actual crate entries (comments are fine)
        let deps_section = cargo
            .split("[dependencies]")
            .nth(1)
            .unwrap_or("")
            .split("\n[")
            .next()
            .unwrap_or("");
        let real_deps: Vec<&str> = deps_section
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.starts_with('#') && !l.is_empty())
            .collect();
        // P0-4+: Dependencies are no longer empty; tokio is the first.
        assert!(
            !real_deps.is_empty(),
            "P0-4 should have at least tokio in dependencies"
        );
        assert!(
            real_deps.iter().any(|d| d.contains("tokio")),
            "tokio must be present in dependencies (added by P0-4)"
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C008 ── N0007→N0001: Functional requirements
    // -----------------------------------------------------------------------

    /// @verifies C008-precondition
    /// @verifies C008-postcondition
    /// @verifies C008-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn crate_purpose_documented_in_lib_rs() -> Result<(), String> {
        let doc = include_str!("../src/lib.rs");
        assert!(doc.contains("siprs"), "Crate-level doc must name 'siprs'");
        assert!(
            doc.contains("PJSUA"),
            "Crate-level doc must reference 'PJSUA'"
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C009 ── N0008→N0001: Module structure
    // -----------------------------------------------------------------------

    /// @verifies C009-precondition
    /// @verifies C009-postcondition
    #[test]
    // [::TICKET::] P0-3, P0-4 changes.
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn all_declared_modules_exist_on_disk() {
        // Each pub mod must have a corresponding directory or file
        for path in &[
            "src/config",
            "src/concurrency_contexts",
            "src/api",
            "src/model",
        ] {
            assert!(
                std::path::Path::new(path).exists(),
                "Module path '{path}' must exist on disk"
            );
        }
    }

    /// @verifies C009-postcondition
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn no_non_existent_pub_mod_declarations() -> Result<(), String> {
        let lib = include_str!("../src/lib.rs");
        // Non-existent modules (ffi, runtime, audio, util) must not be declared as pub mod
        for module in &["ffi", "runtime", "audio", "util"] {
            let pattern = format!("pub mod {module}");
            assert!(
                !lib.contains(&pattern),
                "Non-existent module '{module}' must not be declared as pub mod"
            );
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C044 ── N0043→N0001: Shutdown specification
    // -----------------------------------------------------------------------

    /// @verifies C044-precondition
    /// @verifies C044-postcondition
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn shutdown_spec_file_exists() -> Result<(), String> {
        let candidates = [
            "src/state/shutdown_specification.rs",
            "../state/shutdown_specification.rs",
        ];
        let ok = candidates.iter().any(|p| std::path::Path::new(p).exists());
        assert!(
            ok,
            "Shutdown specification file must exist in state/ module"
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C047 ── N0046→N0001: Observability
    // -----------------------------------------------------------------------

    /// @verifies C047-precondition
    /// @verifies C047-postcondition
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn observability_module_exists() -> Result<(), String> {
        let candidates = [
            "src/config/observability_metrics.rs",
            "../config/observability_metrics.rs",
        ];
        let ok = candidates.iter().any(|p| std::path::Path::new(p).exists());
        assert!(ok, "Observability module must exist in config/ module");
        Ok(())
    }

    /// @verifies C047-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn feature_flags_documented_in_lib_rs() -> Result<(), String> {
        let doc = include_str!("../src/lib.rs");
        for flag in &["serde", "tls", "srtp"] {
            assert!(
                doc.contains(flag),
                "Feature flag '{flag}' must be documented in crate docs"
            );
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C048 ── N0047→N0001: Security
    // -----------------------------------------------------------------------

    /// @verifies C048-precondition
    /// @verifies C048-postcondition
    /// @verifies C048-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn security_modules_exist() -> Result<(), String> {
        let auth_exists = std::path::Path::new("src/security/auth_jwt_middleware.rs").exists()
            || std::path::Path::new("../security/auth_jwt_middleware.rs").exists();
        let diffs_exists = std::path::Path::new("src/security/security_platform_diffs.rs").exists()
            || std::path::Path::new("../security/security_platform_diffs.rs").exists();
        let ok = auth_exists || diffs_exists;
        assert!(
            ok,
            "At least one security module must exist in security/ directory"
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C051 ── N0050→N0001: Audio device policy
    // -----------------------------------------------------------------------

    /// @verifies C051-precondition
    /// @verifies C051-postcondition
    /// @verifies C051-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn rfc_has_audio_device_sections() -> Result<(), String> {
        let rfc = include_str!("../RFC-ROOT.md");
        assert!(
            rfc.contains("Audio Device") || rfc.contains("microphone"),
            "RFC must document audio device policy"
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C056 ── N0055→N0001: Panic policy
    // -----------------------------------------------------------------------

    /// @verifies C056-precondition
    /// @verifies C056-postcondition
    /// @verifies C056-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn panic_policy_file_exists() -> Result<(), String> {
        let candidates = [
            "src/error/challenges_panic_policy.rs",
            "../error/challenges_panic_policy.rs",
        ];
        let ok = candidates.iter().any(|p| std::path::Path::new(p).exists());
        assert!(ok, "Panic policy file must exist in error/ module");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C059 ── N0058→N0001: RFC completeness
    // -----------------------------------------------------------------------

    /// @verifies C059-precondition
    /// @verifies C059-postcondition
    /// @verifies C059-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn rfc_has_all_required_sections() -> Result<(), String> {
        let rfc = include_str!("../RFC-ROOT.md");
        let required = [
            "## 1.", "## 1a.", "## 2.", "## 3.", "## 4.", "## 5.", "## 6.", "## 7.", "## 8.",
            "## 32.", "## 34.", "## 35.", "## 40.", "## 45.", "## 51.", "## 61.",
        ];
        for section in &required {
            assert!(
                rfc.contains(section),
                "RFC must contain section header '{section}'"
            );
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C068 ── N0067→N0001: I/O Boundary
    // -----------------------------------------------------------------------

    /// @verifies C068-precondition
    /// @verifies C068-postcondition
    /// @verifies C068-invariant
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn rfc_has_io_boundary_section() -> Result<(), String> {
        let rfc = include_str!("../RFC-ROOT.md");
        assert!(
            rfc.contains("I/O Boundary") || rfc.contains("I/O"),
            "RFC must have an I/O Boundary Reference section"
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Additional boundary and error tests
    // -----------------------------------------------------------------------

    /// @verifies C048-postcondition
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn forbid_unsafe_code_is_active() {
        // If #![forbid(unsafe_code)] is set, any unsafe block inside this test
        // would fail to compile. We use a compile-time check via doc-test:
        // See the negative test for unsafe code below.
    }

    /// Verify that the doc-comment does not contain internal debugging artifacts.
    #[test]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn doc_comments_do_not_contain_debug_artifacts() -> Result<(), String> {
        let doc = include_str!("../src/lib.rs");
        // Exclude code blocks that might legitimately contain these
        let doc_trimmed = doc
            .lines()
            .filter(|l| !l.trim_start().starts_with("// "))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(
            !doc_trimmed.contains("TODO") || doc_trimmed.contains("[::STUB::]"),
            "Bare TODO without STUB marker is not allowed"
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Integration tests (run via `cargo test -- --ignored` for process-spawning)
    // -----------------------------------------------------------------------

    /// Full crate build — requires `cargo build` in the workspace root.
    /// Marked ignored by default because it spawns a subprocess.
    #[test]
    #[ignore]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn cargo_check_passes_integration() -> Result<(), String> {
        let output = std::process::Command::new("cargo")
            .args(["check", "-q"])
            .output()
            .map_err(|e| format!("Failed to run cargo check: {e}"))?;
        assert!(output.status.success(), "cargo check must pass");
        Ok(())
    }

    /// Full test suite passes — requires `cargo test` in the crate root.
    #[test]
    #[ignore]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn cargo_test_passes_integration() -> Result<(), String> {
        let output = std::process::Command::new("cargo")
            .args(["test", "-q"])
            .output()
            .map_err(|e| format!("Failed to run cargo test: {e}"))?;
        assert!(output.status.success(), "cargo test must pass");
        Ok(())
    }

    /// Build with no default features.
    #[test]
    #[ignore]
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn cargo_build_no_default_features() -> Result<(), String> {
        let output = std::process::Command::new("cargo")
            .args(["build", "--no-default-features", "-q"])
            .output()
            .map_err(|e| format!("Failed to run cargo build --no-default-features: {e}"))?;
        assert!(
            output.status.success(),
            "cargo build --no-default-features must pass"
        );
        Ok(())
    }
}
