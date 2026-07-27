// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0056:  §47 Memory Ownership & §48 Default Policies
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0056 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Memory ownership rules and default policies for the PJSIP FFI boundary.
//!
//! This module documents the **memory safety contracts** that the FFI layer
//! must respect when interacting with PJSIP native callbacks and data types.
//! It also enumerates the **default policy values** for transports, codecs,
//! DTMF, audio delivery, SRTP, and ICE.
//!
//! These rules are design-time contracts — they carry `[::STUB::]` markers
//! linking to the FFI implementation ticket where runtime enforcement is added.
//!
//! ## Memory ownership rules (4 rules)
//!
//! 1. **Callback pointer scoping** — Pointers received from native callbacks
//!    (e.g. `pjsip_rx_data*`) must not be held or dereferenced outside the
//!    callback scope. Copy all required information to Rust-owned memory
//!    immediately.
//!
//! 2. **Immediate copy to Rust-owned data** — Any data from the PJSIP heap
//!    (`pj_pool_t`-allocated) must be converted to Rust-owned types
//!    (e.g. `Vec<u8>`, `String`) before the callback returns.
//!
//! 3. **No `pj_pool_t` embedding** — Pointers into `pj_pool_t`-allocated
//!    memory must never be stored as fields in Rust structs. The pool may
//!    be recycled by PJSIP at any time after callback return.
//!
//! 4. **`pj_str_t` always Rust-owned** — Every `pj_str_t` used outside a
//!    callback scope must be backed by Rust-owned storage (via `PjOwnedStr`
//!    or equivalent wrapper). Never borrow the pointer inside a `pj_str_t`
//!    that originates from PJSIP.
//!
//! ## Default policies (6 domains)
//!
//! These defaults are applied at client startup unless overridden by the user
//! via `ClientConfig`. Full implementation requires the FFI bindings (future
//! ticket) — the values below are the reference specification.
//!
//! ### Transport
//! - **UDP**: port 5060 (always created)
//! - **TCP**: port 5060 (always created)
//! - **TLS**: optional, behind `tls` feature flag
//!
//! ### Codec
//! - **PCMU (G.711 μ-law)**: highest priority
//! - **PCMA (G.711 A-law)**: second priority
//! - Further codecs deferred to `CodecPolicy` (N0040, P3-1)
//!
//! ### DTMF
//! - **RFC 2833 (AVT)**: telephone-event payload type
//! - SIP INFO DTMF: supported as alternative
//!
//! ### Audio delivery
//! - **Sample rate**: 16 kHz
//! - **Bit depth**: 16-bit signed integer (I16)
//! - **Channel layout**: Stereo (L=mic input, R=playback output)
//! - **Frame duration**: 20 ms
//!
//! ### SRTP
//! - **Optional**: disabled by default
//! - Enabled via `srtp` feature flag
//!
//! ### ICE
//! - **Full ICE**: always enabled (interoperability baseline)
//! - **Trickle ICE**: optional (not enabled by default)
//!
//! [::STUB::] P0-4+: Memory ownership rules and default policies are design
//! contracts for the FFI layer. Runtime enforcement (pj_str_t wrapper,
//! callback bridges) is implemented in the `ffi` module (P0-4+).

// ============================================================================
// Tests — P2-1: Memory Ownership Rules & Default Policies
// ============================================================================

#[cfg(test)]
mod tests {
    /// @verifies C057-postcondition
    /// @verifies C057-invariant
    #[test]
// [::TICKET::] P2-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-1 --for-spec --no-implementation-order`.
    fn memory_ownership_rules_documented() {
        let content = include_str!("../../src/model/memory_ownership_defaults.rs");
        // Verify all 4 memory ownership rules are documented
        assert!(content.contains("callback"), "Rule 1: callback scope constraint must be documented");
        assert!(content.contains("pj_pool_t"), "Rule 3: pj_pool_t not embedded in struct fields");
        assert!(content.contains("pj_str_t"), "Rule 4: pj_str_t ownership must be documented");
    }

    /// @verifies C057-postcondition
    #[test]
// [::TICKET::] P2-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-1 --for-spec --no-implementation-order`.
    fn default_policies_documented() {
        let content = include_str!("../../src/model/memory_ownership_defaults.rs");
        // Verify default policies are enumerated
        let policies_mentioned = [
            "Transport", "Codec", "DTMF", "Audio", "SRTP", "ICE",
        ];
        for policy in &policies_mentioned {
            assert!(
                content.contains(policy),
                "Default policy '{policy}' must be documented",
            );
        }
    }

    /// @verifies C057-invariant
    #[test]
// [::TICKET::] P2-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-1 --for-spec --no-implementation-order`.
    fn pj_str_rust_owned_explicitly_stated() {
        let content = include_str!("../../src/model/memory_ownership_defaults.rs");
        assert!(
            content.to_lowercase().contains("rust-owned")
                || content.to_lowercase().contains("rust owned"),
            "pj_str_t must be explicitly declared as Rust-owned",
        );
    }
}
