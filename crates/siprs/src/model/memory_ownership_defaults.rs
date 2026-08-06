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

use crate::model::audio_format_chunkpair::{BitDepth, ChannelLayout, SampleRate};

// ---------------------------------------------------------------------------
// §47 Memory ownership model
// ---------------------------------------------------------------------------

/// Ownership classification of memory that crosses the FFI boundary.
///
/// PJSUA's native callbacks hand out pointers into its own pool (`pj_pool_t`).
/// Those pointers are valid only for the duration of the callback. RFC §47
/// requires that (1) native callback pointers are never held beyond the
/// callback scope, (2) needed data is copied immediately into Rust-owned
/// memory, (3) `pj_pool_t` memory is never embedded in a Rust struct, and
/// (4) `pj_str_t` always keeps a Rust-side owner.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemoryOwnership {
    /// Memory is allocated by Rust (e.g. `PjOwnedStr`'s `Vec<u8>`) and stays
    /// valid as long as the Rust owner is alive.
    RustOwned,
    /// Memory is allocated by PJSUA's pool (`pj_pool_t`) and is valid only
    /// within the originating callback scope (§47).
    PjsuaPoolOwned,
}

// [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
impl MemoryOwnership {
    /// Returns `true` when the backing memory is owned by Rust.
    #[must_use]
    pub const fn is_rust_owned(&self) -> bool {
        matches!(self, Self::RustOwned)
    }

    /// Returns `true` when the backing memory is owned by a PJSUA pool.
    #[must_use]
    pub const fn is_pool_owned(&self) -> bool {
        matches!(self, Self::PjsuaPoolOwned)
    }
}

/// Where a native pointer is valid, per §47.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OwnershipScope {
    /// Valid only for the duration of the current native callback.
    CallbackOnly,
    /// Valid for as long as the Rust owner (e.g. a `PjOwnedStr`) is alive.
    RustOwned,
}

/// A native pointer tagged with its ownership classification (§47).
///
/// `RUST_OWNED` and `CALLBACK_ONLY` are the only two constructions of this
/// type. A pool-owned, callback-scope pointer can never be converted into a
/// Rust-owned one; the type makes the §47 rule explicit at every FFI boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativePtrClassification {
    /// Who owns the backing memory.
    pub ownership: MemoryOwnership,
    /// How long the pointer is valid.
    pub scope: OwnershipScope,
}

// [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
impl NativePtrClassification {
    /// The classification of a `PjOwnedStr`-backed pointer: Rust-owned and
    /// valid for as long as the owner lives.
    pub const RUST_OWNED: Self = Self {
        ownership: MemoryOwnership::RustOwned,
        scope: OwnershipScope::RustOwned,
    };

    /// The classification of a raw callback-parameter pointer: pool-owned and
    /// valid only within the callback scope (§47). Never store this value in a
    /// Rust struct field.
    pub const CALLBACK_ONLY: Self = Self {
        ownership: MemoryOwnership::PjsuaPoolOwned,
        scope: OwnershipScope::CallbackOnly,
    };

    /// Returns `true` when the backing memory is Rust-owned.
    #[must_use]
    pub const fn is_rust_owned(&self) -> bool {
        self.ownership.is_rust_owned()
    }

    /// Returns `true` when the pointer is valid only within the callback scope.
    #[must_use]
    pub const fn is_callback_only(&self) -> bool {
        matches!(self.scope, OwnershipScope::CallbackOnly)
    }
}

/// A value that can report the ownership classification of its backing memory.
///
/// `PjOwnedStr` implements this trait and always reports `RUST_OWNED`, which is
/// the concrete enforcement of the §47 invariant "pj_str_t always has a Rust
/// owner".
pub trait MemoryOwnershipTag {
    /// The ownership classification of this value's backing memory.
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn classification(&self) -> NativePtrClassification;
}

// ---------------------------------------------------------------------------
// §48 Default policies
// ---------------------------------------------------------------------------

/// Default transport protocols (§48: UDP + TCP).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportKind {
    Udp,
    Tcp,
    Tls,
}

/// Default codec preference (§48: Opus before PCMU).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodecKind {
    Opus,
    Pcmu,
}

/// Default DTMF send method (§48: RFC 4733).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DtmfSendMethod {
    Rfc2833,
    Rfc4733,
    Info,
    Inband,
}

/// Default SRTP policy (§48: disabled).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SrtpMode {
    Disabled,
    Optional,
    Mandatory,
}

/// Default audio delivery format (§48: 16 kHz / i16 / stereo L=IN R=OUT).
///
/// `ChannelLayout::StereoInOut` maps L = input (IN) and R = output (OUT), which
/// is the duplex audio-delivery arrangement RFC §48 mandates.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AudioDelivery {
    pub sample_rate: SampleRate,
    pub bit_depth: BitDepth,
    pub channel_layout: ChannelLayout,
}

// [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
impl Default for AudioDelivery {
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::StereoInOut,
        }
    }
}

/// The RFC §48 system-wide default policy record, applied when no explicit
/// override exists. This is the typed source of truth for the §48 prose.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DefaultPolicies {
    /// Default transports (§48: UDP + TCP).
    pub transports: &'static [TransportKind],
    /// Default codec preference order (§48: Opus, then PCMU).
    pub codec_order: &'static [CodecKind],
    /// Default DTMF send method (§48: RFC 4733).
    pub dtmf_send_method: DtmfSendMethod,
    /// Default audio delivery format (§48: 16 kHz / i16 / stereo L=IN R=OUT).
    pub audio_delivery: AudioDelivery,
    /// Default raw SIP event subscription (§48: enabled).
    pub raw_sip_events: bool,
    /// Default SRTP policy (§48: disabled).
    pub srtp: SrtpMode,
    /// Default ICE usage (§48: enabled).
    pub ice: bool,
}

// [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
impl DefaultPolicies {
    /// The RFC §48 default record.
    pub const RFC_DEFAULTS: Self = Self {
        transports: &[TransportKind::Udp, TransportKind::Tcp],
        codec_order: &[CodecKind::Opus, CodecKind::Pcmu],
        dtmf_send_method: DtmfSendMethod::Rfc4733,
        audio_delivery: AudioDelivery {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::StereoInOut,
        },
        raw_sip_events: true,
        srtp: SrtpMode::Disabled,
        ice: true,
    };
}

// [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
impl Default for DefaultPolicies {
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self::RFC_DEFAULTS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── C057: §47 ownership classification ──────────────────────────

    #[test]
    // @verifies C057
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn memory_ownership_discriminants_are_exclusive() {
        assert!(MemoryOwnership::RustOwned.is_rust_owned());
        assert!(!MemoryOwnership::RustOwned.is_pool_owned());
        assert!(MemoryOwnership::PjsuaPoolOwned.is_pool_owned());
        assert!(!MemoryOwnership::PjsuaPoolOwned.is_rust_owned());
    }

    #[test]
    // @verifies C057
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn native_ptr_classification_constants_encode_section_47() {
        let rust = NativePtrClassification::RUST_OWNED;
        assert!(rust.is_rust_owned());
        assert!(!rust.is_callback_only());
        assert_eq!(rust.ownership, MemoryOwnership::RustOwned);
        assert_eq!(rust.scope, OwnershipScope::RustOwned);

        let cb = NativePtrClassification::CALLBACK_ONLY;
        assert!(cb.is_callback_only());
        assert!(!cb.is_rust_owned());
        assert_eq!(cb.ownership, MemoryOwnership::PjsuaPoolOwned);
        assert_eq!(cb.scope, OwnershipScope::CallbackOnly);
    }

    // ── §48: default policies ───────────────────────────────────────

    #[test]
    // @verifies C057
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn default_policies_match_rfc_section_48() {
        let policies = DefaultPolicies::default();
        assert_eq!(policies.transports, &[TransportKind::Udp, TransportKind::Tcp]);
        assert_eq!(policies.codec_order, &[CodecKind::Opus, CodecKind::Pcmu]);
        assert_eq!(policies.dtmf_send_method, DtmfSendMethod::Rfc4733);
        assert_eq!(policies.audio_delivery, AudioDelivery::default());
        assert!(policies.raw_sip_events);
        assert_eq!(policies.srtp, SrtpMode::Disabled);
        assert!(policies.ice);
    }

    #[test]
    // @verifies C057
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn audio_delivery_default_is_16khz_i16_stereo_in_out() {
        let delivery = AudioDelivery::default();
        assert_eq!(delivery.sample_rate, SampleRate::Hz16000);
        assert_eq!(delivery.sample_rate.as_hz(), 16_000);
        assert_eq!(delivery.bit_depth, BitDepth::I16);
        assert_eq!(delivery.channel_layout, ChannelLayout::StereoInOut);
    }

    // ── C034: non-blocking / allocation-free classification ─────────

    #[test]
    // @verifies C034
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn classification_helpers_are_const_callable() {
        // Compile-time proof that the classification helpers are constant-foldable,
        // which implies they cannot allocate, lock, syscall, or await (C034).
        const RUST_OK: bool = NativePtrClassification::RUST_OWNED.is_rust_owned();
        const CB_ONLY: bool = NativePtrClassification::CALLBACK_ONLY.is_callback_only();
        const _: () = assert!(RUST_OK && CB_ONLY);
    }

    // ── C038: unsafe isolation ──────────────────────────────────────

    #[test]
    // @verifies C038
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn model_and_runtime_production_code_have_no_unsafe() -> Result<(), Box<dyn std::error::Error>> {
        // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
        fn production_has_unsafe(dir: &str) -> Result<bool, std::io::Error> {
            let files: Vec<_> = std::fs::read_dir(dir)?
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().is_some_and(|x| x == "rs"))
                .map(|e| e.path())
                .collect();
            for path in files {
                let src = std::fs::read_to_string(path)?;
                let production = src.split("#[cfg(test)]").next().unwrap_or("");
                if production.lines().any(|l| l.contains("unsafe")) {
                    return Ok(true);
                }
            }
            Ok(false)
        }
        let manifest = env!("CARGO_MANIFEST_DIR");
        assert!(!production_has_unsafe(&format!("{}/src/model", manifest))?);
        assert!(!production_has_unsafe(&format!("{}/src/runtime", manifest))?);
        Ok(())
    }
}
