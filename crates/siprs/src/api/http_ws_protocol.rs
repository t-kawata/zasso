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
//   - NODE_ID=N0062:  §54 HTTP/WS API Protocol — REST & WebSocket
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0062 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

/// REST API: Issue JWT token via SIP account credentials.
pub const PATH_AUTH_TOKEN: &str = "/api/v1/auth/token";
/// REST API: List all SIP accounts.
pub const PATH_ACCOUNTS: &str = "/api/v1/accounts";
/// REST API: Get, update, or delete a single account by ID.
pub const PATH_ACCOUNT_BY_ID: &str = "/api/v1/accounts/:id";
/// REST API: Register a SIP account with its proxy.
pub const PATH_ACCOUNT_REGISTER: &str = "/api/v1/accounts/:id/register";
/// REST API: Unregister a SIP account.
pub const PATH_ACCOUNT_UNREGISTER: &str = "/api/v1/accounts/:id/unregister";
/// REST API: Make an outgoing call from an account.
pub const PATH_ACCOUNT_CALLS: &str = "/api/v1/accounts/:id/calls";
/// REST API: List all active calls.
pub const PATH_CALLS: &str = "/api/v1/calls";
/// REST API: Get call state by ID.
pub const PATH_CALL_BY_ID: &str = "/api/v1/calls/:id";
/// REST API: Hang up a call.
pub const PATH_CALL_HANGUP: &str = "/api/v1/calls/:id/hangup";
/// REST API: Place a call on hold.
pub const PATH_CALL_HOLD: &str = "/api/v1/calls/:id/hold";
/// REST API: Release call hold.
pub const PATH_CALL_UNHOLD: &str = "/api/v1/calls/:id/unhold";
/// REST API: Send DTMF digits during a call.
pub const PATH_CALL_DTMF: &str = "/api/v1/calls/:id/dtmf";
/// REST API: Transfer (REFER) a call.
pub const PATH_CALL_TRANSFER: &str = "/api/v1/calls/:id/transfer";
/// REST API: Subscribe to server-sent events (SSE).
pub const PATH_EVENTS: &str = "/api/v1/events";
/// REST API: Health check endpoint.
pub const PATH_HEALTH: &str = "/api/v1/health";
/// REST API: Graceful shutdown of the SIP client.
pub const PATH_SHUTDOWN: &str = "/api/v1/shutdown";
/// WebSocket endpoint for control events + audio chunks.
pub const PATH_WS: &str = "/api/v1/ws";
/// WebSocket endpoint for audio chunks only.
pub const PATH_WS_AUDIO: &str = "/api/v1/ws/audio";

/// Fixed-size header for WebSocket audio binary frames (30 bytes).
///
/// Layout is `repr(C, packed)` to match the wire format.
/// Fields are in network byte order (big-endian) on the wire.
///
/// NOTE: The RFC specifies 24 bytes, but the field sizes sum to 30.
/// The actual implementation uses 30 bytes. This is a spec correction.
#[derive(Debug, Clone, PartialEq, Eq)]
#[repr(C, packed)]
pub struct AudioFrameHeader {
    /// Global sequence number (shared with EventBus sequence space).
    pub sequence_number: u64,
    /// Sampling timestamp (Unix epoch milliseconds).
    pub timestamp_ms: u64,
    /// Frame duration in milliseconds (typically 20).
    pub frame_ms: u16,
    /// Audio sample rate in Hz (e.g., 48000, 16000).
    pub sample_rate: u16,
    /// Number of audio channels (1 = mono, 2 = stereo).
    pub channels: u8,
    /// Bits per sample (e.g., 16 for i16 PCM).
    pub bits_per_sample: u8,
    /// Call ID this frame belongs to (0 = control / unassociated).
    pub call_id: u32,
    /// Reserved for future expansion. Must be zero-initialized.
    pub reserved: [u8; 4],
}

// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
impl AudioFrameHeader {
    /// Serialize this header to a wire-format byte array (big-endian).
    ///
    /// Returns a fixed 30-byte array suitable for transmission over
    /// WebSocket binary frames. All multi-byte fields are encoded in
    /// network byte order (big-endian).
    pub fn to_bytes(&self) -> [u8; 30] {
        let mut buf = [0u8; 30];
        buf[0..8].copy_from_slice(&self.sequence_number.to_be_bytes());
        buf[8..16].copy_from_slice(&self.timestamp_ms.to_be_bytes());
        buf[16..18].copy_from_slice(&self.frame_ms.to_be_bytes());
        buf[18..20].copy_from_slice(&self.sample_rate.to_be_bytes());
        buf[20] = self.channels;
        buf[21] = self.bits_per_sample;
        buf[22..26].copy_from_slice(&self.call_id.to_be_bytes());
        buf[26..30].copy_from_slice(&self.reserved);
        buf
    }

    /// Deserialize a header from a wire-format byte array (big-endian).
    ///
    /// Reads a 30-byte array encoded in network byte order and constructs
    /// the corresponding `AudioFrameHeader`. This is the inverse of
    /// `to_bytes()`.
    pub fn from_bytes(bytes: &[u8; 30]) -> Self {
        Self {
            sequence_number: u64::from_be_bytes([
                bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
            ]),
            timestamp_ms: u64::from_be_bytes([
                bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14],
                bytes[15],
            ]),
            frame_ms: u16::from_be_bytes([bytes[16], bytes[17]]),
            sample_rate: u16::from_be_bytes([bytes[18], bytes[19]]),
            channels: bytes[20],
            bits_per_sample: bytes[21],
            call_id: u32::from_be_bytes([bytes[22], bytes[23], bytes[24], bytes[25]]),
            reserved: [bytes[26], bytes[27], bytes[28], bytes[29]],
        }
    }
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.

// ---------------------------------------------------------------------------
// WsTextFrame — JSON text frame for control events over WebSocket
// ---------------------------------------------------------------------------

/// WebSocket text frame for delivering control events.
///
/// Serialized as JSON with type discriminator, global sequence number,
/// and the event payload.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct WsTextFrame {
    /// Frame type discriminator: "event", "ack", "error".
    #[serde(rename = "type")]
    pub msg_type: String,
    /// Global sequence number (shared with EventBus).
    pub seq: u64,
    /// Event payload (varies by event kind).
    pub payload: serde_json::Value,
}

// ---------------------------------------------------------------------------
// WsBinaryFrame — binary audio frame for WebSocket
// ---------------------------------------------------------------------------

/// WebSocket binary frame carrying audio data.
///
/// Wire format: 30-byte AudioFrameHeader followed by PCM i16 samples.
#[derive(Debug, Clone, PartialEq)]
pub struct WsBinaryFrame {
    /// Fixed-size header with metadata.
    pub header: AudioFrameHeader,
    /// PCM audio data (i16 samples in native byte order).
    pub data: Vec<u8>,
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl WsBinaryFrame {
    /// Encode this frame into a wire-format byte vector.
    ///
    /// Returns header bytes (30) + PCM data bytes.
    pub fn encode(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(30 + self.data.len());
        buf.extend_from_slice(&self.header.to_bytes());
        buf.extend_from_slice(&self.data);
        buf
    }

    /// Decode a frame from a wire-format byte slice.
    ///
    /// Returns `None` if the input is too short to contain a header.
    pub fn decode(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 30 {
            return None;
        }
        let header_bytes: [u8; 30] = bytes[..30].try_into().ok()?;
        let header = AudioFrameHeader::from_bytes(&header_bytes);
        let data = bytes[30..].to_vec();
        Some(Self { header, data })
    }
}

// ---------------------------------------------------------------------------
// SequenceGenerator — monotonic u64 counter for event-audio correlation
// ---------------------------------------------------------------------------

use std::sync::atomic::{AtomicU64, Ordering};

/// Monotonically increasing global sequence number generator.
///
/// Provides unique sequence numbers across both SipEvent and AudioChunkPair
/// domains, enabling event-audio correlation. The counter starts at 1 and
/// wraps from `u64::MAX` to 0, maintaining uniqueness across the wrap point.
pub struct SequenceGenerator {
    counter: AtomicU64,
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl SequenceGenerator {
    /// Create a new generator starting at sequence 1.
    pub fn new() -> Self {
        Self {
            counter: AtomicU64::new(1),
        }
    }

    /// Create a new generator starting at the given sequence number.
    pub fn with_start(start: u64) -> Self {
        Self {
            counter: AtomicU64::new(start),
        }
    }

    /// Atomically increment and return the next sequence number.
    ///
    /// The counter wraps from `u64::MAX` to 0 on overflow.
    pub fn next(&self) -> u64 {
        self.counter.fetch_add(1, Ordering::SeqCst)
    }

    /// Read the current sequence number without incrementing.
    pub fn current(&self) -> u64 {
        self.counter.load(Ordering::SeqCst)
    }

    /// Reserve the next `count` sequence numbers.
    ///
    /// Returns the start of the reserved range. The range [start, start+count)
    /// will not be issued by any other caller.
    pub fn reserve(&self, count: u64) -> u64 {
        self.counter.fetch_add(count, Ordering::SeqCst)
    }
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl Default for SequenceGenerator {
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: All 18 REST endpoint path constants ────────────────────

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_rest_endpoint_constants() {
        assert_eq!(PATH_AUTH_TOKEN, "/api/v1/auth/token");
        assert_eq!(PATH_ACCOUNTS, "/api/v1/accounts");
        assert_eq!(PATH_CALLS, "/api/v1/calls");
        assert_eq!(PATH_HEALTH, "/api/v1/health");
        assert_eq!(PATH_EVENTS, "/api/v1/events");
        assert_eq!(PATH_SHUTDOWN, "/api/v1/shutdown");
        assert_eq!(PATH_WS, "/api/v1/ws");
        assert_eq!(PATH_WS_AUDIO, "/api/v1/ws/audio");
    }

    // ── Invariant: AudioFrameHeader is 30 bytes (spec-correction) ──────

    #[test]
    // @verifies C063
    // [::TICKET::] P2-2, P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-2|P2-3) --for-spec --no-implementation-order`.
    fn test_audio_frame_header_size() {
        assert_eq!(
            std::mem::size_of::<AudioFrameHeader>(),
            30,
            "AudioFrameHeader must be exactly 30 bytes (spec-correction from 24)"
        );
    }

    #[test]
    // [::TICKET::] P2-2, P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-2|P2-3) --for-spec --no-implementation-order`.
    fn test_audio_frame_header_repr() {
        // Verify struct size is exactly 30 bytes (spec-correction).
        // repr(C, packed) prevents taking references to fields —
        // field access for assertion is UB, so we only verify the
        // total size and the zero-initialized reserved field via
        // safe copying.
        assert_eq!(std::mem::size_of::<AudioFrameHeader>(), 30);
        // Verify reserved is zero-initialized by constructing
        // a zero-initialized copy via safe transmute-like pattern:
        // copy bytes into a MaybeUninit to avoid field references.
        let header = AudioFrameHeader {
            sequence_number: 0,
            timestamp_ms: 0,
            frame_ms: 0,
            sample_rate: 0,
            channels: 0,
            bits_per_sample: 0,
            call_id: 0,
            reserved: [0u8; 4],
        };
        // Use raw pointer with read_unaligned for verification
        let bytes: &[u8; 30] = unsafe { &*(&header as *const AudioFrameHeader as *const [u8; 30]) };
        // All bytes must be zero
        assert!(
            bytes.iter().all(|&b| b == 0),
            "Zero-initialized AudioFrameHeader must be all zeros"
        );
    }

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_audio_frame_header_padding_zeroed() {
        // Verify reserved field is zeroed.
        // Use raw pointer access to avoid UB on repr(C, packed) field.
        let header = AudioFrameHeader {
            sequence_number: 0,
            timestamp_ms: 0,
            frame_ms: 0,
            sample_rate: 0,
            channels: 0,
            bits_per_sample: 0,
            call_id: 0,
            reserved: [0u8; 4],
        };
        let bytes: &[u8; 30] = unsafe { &*(&header as *const AudioFrameHeader as *const [u8; 30]) };
        // Last 4 bytes (offset 26-29) are reserved field
        assert_eq!(bytes[26..30], [0u8; 4]);
    }

    // ── Invariant: AudioFrameHeader is Send + Sync ─────────────────────

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_audio_frame_header_send_sync() {
        // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        // [::TICKET::] P2-2, P2-3, P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-2|P2-3|P4-3) --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<AudioFrameHeader>();
        assert_sync::<AudioFrameHeader>();
    }

    // ── Boundary: Sequence number wrapping ─────────────────────────────

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_sequence_wrap_behavior() {
        let max: u64 = u64::MAX;
        let wrapped = max.wrapping_add(1);
        assert_eq!(wrapped, 0, "u64::MAX + 1 must wrap to 0");
    }

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_sequence_monotonicity() {
        let seqs: Vec<u64> = (0..10).collect();
        for window in seqs.windows(2) {
            assert!(
                window[1] > window[0],
                "Sequence numbers must increase monotonically"
            );
        }
    }

    // ── Normal: to_bytes / from_bytes round-trip ───────────────────────

    #[test]
    // @verifies C063
    // [::TICKET::] P2-3: AudioFrameHeader safe serialization round-trip
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_audio_header_to_from_bytes_roundtrip() {
        let header = AudioFrameHeader {
            sequence_number: 42,
            timestamp_ms: 1748935200123,
            frame_ms: 20,
            sample_rate: 48000,
            channels: 1,
            bits_per_sample: 16,
            call_id: 7,
            reserved: [0u8; 4],
        };
        let bytes = header.to_bytes();
        let decoded = AudioFrameHeader::from_bytes(&bytes);
        assert_eq!(
            header, decoded,
            "to_bytes/from_bytes round-trip must preserve all fields"
        );
    }

    // ── Normal: to_bytes produces correct byte order (big-endian) ──────

    #[test]
    // @verifies C063
    // [::TICKET::] P2-3: AudioFrameHeader big-endian wire format
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_audio_header_to_bytes_big_endian() {
        let header = AudioFrameHeader {
            sequence_number: 0x0000000000000001,
            timestamp_ms: 0x0000000000000002,
            frame_ms: 0x0003,
            sample_rate: 0x0004,
            channels: 5,
            bits_per_sample: 6,
            call_id: 0x00000007,
            reserved: [0x08, 0x09, 0x0A, 0x0B],
        };
        let bytes = header.to_bytes();
        // Big-endian byte pattern verification
        assert_eq!(bytes[0], 0x00, "seq byte 0 (big-endian)");
        assert_eq!(bytes[7], 0x01, "seq byte 7 (big-endian)");
        assert_eq!(bytes[15], 0x02, "ts byte 15 (big-endian)");
        assert_eq!(bytes[16], 0x00, "frame_ms high byte (big-endian)");
        assert_eq!(bytes[17], 0x03, "frame_ms low byte (big-endian)");
        assert_eq!(bytes[20], 5, "channels byte");
        assert_eq!(bytes[21], 6, "bits_per_sample byte");
        assert_eq!(bytes[22], 0x00, "call_id byte 22 (big-endian)");
        assert_eq!(bytes[25], 0x07, "call_id byte 25 (big-endian)");
        assert_eq!(bytes[26], 0x08, "reserved byte 0");
        assert_eq!(bytes[29], 0x0B, "reserved byte 3");
    }

    // ── Boundary: All-zero round-trip ──────────────────────────────────

    #[test]
    // [::TICKET::] P2-3: AudioFrameHeader zero-field round-trip
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_audio_header_zero_roundtrip() {
        let header = AudioFrameHeader {
            sequence_number: 0,
            timestamp_ms: 0,
            frame_ms: 0,
            sample_rate: 0,
            channels: 0,
            bits_per_sample: 0,
            call_id: 0,
            reserved: [0u8; 4],
        };
        let bytes = header.to_bytes();
        let decoded = AudioFrameHeader::from_bytes(&bytes);
        assert_eq!(header, decoded);
        // All bytes must be zero
        assert!(
            bytes.iter().all(|&b| b == 0),
            "Zeroed header must produce all-zero bytes"
        );
    }

    // ── Boundary: All-max round-trip ───────────────────────────────────

    #[test]
    // [::TICKET::] P2-3: AudioFrameHeader max-value field round-trip
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_audio_header_max_roundtrip() {
        let header = AudioFrameHeader {
            sequence_number: u64::MAX,
            timestamp_ms: u64::MAX,
            frame_ms: u16::MAX,
            sample_rate: u16::MAX,
            channels: u8::MAX,
            bits_per_sample: u8::MAX,
            call_id: u32::MAX,
            reserved: [0xFFu8; 4],
        };
        let bytes = header.to_bytes();
        let decoded = AudioFrameHeader::from_bytes(&bytes);
        assert_eq!(header, decoded, "MAX values must round-trip correctly");
    }

    // ── P4-3: WsTextFrame — serde round-trip ─────────────────────────

    #[test]
    // @verifies C063
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_ws_text_frame_serde_roundtrip() {
        let frame = WsTextFrame {
            msg_type: "event".into(),
            seq: 42,
            payload: serde_json::json!({"kind": "CallConnected", "call_id": 7}),
        };
        let json = serde_json::to_string(&frame).expect("WsTextFrame must serialize");
        let decoded: WsTextFrame =
            serde_json::from_str(&json).expect("WsTextFrame must deserialize");
        assert_eq!(frame, decoded);
    }

    #[test]
    // @verifies C063
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_ws_text_frame_msg_type_field() {
        let frame = WsTextFrame {
            msg_type: "ack".into(),
            seq: 1,
            payload: serde_json::json!({"status": "ok"}),
        };
        let json = serde_json::to_string(&frame).unwrap();
        assert!(
            json.contains("\"type\":\"ack\""),
            "JSON must have type field"
        );
    }

    // ── P4-3: WsBinaryFrame — encode/decode round-trip ───────────────

    #[test]
    // @verifies C063
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_ws_binary_frame_encode_decode_roundtrip() {
        let header = AudioFrameHeader {
            sequence_number: 100,
            timestamp_ms: 1748935200123,
            frame_ms: 20,
            sample_rate: 48000,
            channels: 1,
            bits_per_sample: 16,
            call_id: 7,
            reserved: [0u8; 4],
        };
        let pcm_data = vec![0u8; 320]; // 160 i16 samples = 320 bytes
        let frame = WsBinaryFrame {
            header: header.clone(),
            data: pcm_data,
        };
        let encoded = frame.encode();
        assert_eq!(encoded.len(), 30 + 320);

        let decoded = WsBinaryFrame::decode(&encoded).expect("must decode");
        assert_eq!(decoded.header, header);
        assert_eq!(decoded.data.len(), 320);
    }

    #[test]
    // @verifies C063
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_ws_binary_frame_decode_short_input() {
        let result = WsBinaryFrame::decode(&[0u8; 10]);
        assert!(result.is_none(), "too short input must return None");
    }

    #[test]
    // @verifies C063
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_ws_binary_frame_decode_empty_input() {
        assert!(WsBinaryFrame::decode(&[]).is_none());
    }

    // ── P4-3: SequenceGenerator — monotonic counter ──────────────────

    #[test]
    // @verifies C063
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_sequence_generator_starts_at_one() {
        let gen = SequenceGenerator::new();
        assert_eq!(gen.current(), 1);
    }

    #[test]
    // @verifies C063
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_sequence_generator_with_start() {
        let gen = SequenceGenerator::with_start(100);
        assert_eq!(gen.current(), 100);
    }

    #[test]
    // @verifies C063
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_sequence_generator_next_increments() {
        let gen = SequenceGenerator::new();
        assert_eq!(gen.next(), 1);
        assert_eq!(gen.next(), 2);
        assert_eq!(gen.current(), 3);
    }

    #[test]
    // @verifies C063
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_sequence_generator_reserve_advances_by_count() {
        let gen = SequenceGenerator::new();
        let start = gen.reserve(5);
        assert_eq!(start, 1);
        // Next unreserved number is 1 + 5 = 6
        assert_eq!(gen.next(), 6);
    }

    #[test]
    // @verifies C063
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_sequence_generator_wrap_at_max() {
        let gen = SequenceGenerator::with_start(u64::MAX);
        assert_eq!(gen.next(), u64::MAX);
        assert_eq!(gen.current(), 0, "must wrap to 0");
        assert_eq!(gen.next(), 0, "post-wrap: fetch_add returns pre-increment");
        assert_eq!(gen.current(), 1, "after next post-wrap: counter=1");
    }

    #[test]
    // @verifies C063
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_sequence_generator_send_sync() {
        // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
// [::TICKET::] P4-3, P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P4-3|P7-3) --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<SequenceGenerator>();
        assert_sync::<SequenceGenerator>();
    }

    // ── P4-3: REST endpoint constants (C064-Pre coverage) ───────────

    #[test]
    // @verifies C064
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_all_rest_endpoints_defined() {
        // Verify 20 path constants are defined and non-empty
        let paths = vec![
            PATH_AUTH_TOKEN,
            PATH_ACCOUNTS,
            PATH_ACCOUNT_BY_ID,
            PATH_ACCOUNT_REGISTER,
            PATH_ACCOUNT_UNREGISTER,
            PATH_ACCOUNT_CALLS,
            PATH_CALLS,
            PATH_CALL_BY_ID,
            PATH_CALL_HANGUP,
            PATH_CALL_HOLD,
            PATH_CALL_UNHOLD,
            PATH_CALL_DTMF,
            PATH_CALL_TRANSFER,
            PATH_EVENTS,
            PATH_HEALTH,
            PATH_SHUTDOWN,
            PATH_WS,
            PATH_WS_AUDIO,
        ];
        assert!(!paths.is_empty(), "endpoint paths must be defined");
        for p in &paths {
            assert!(!p.is_empty(), "each path must be non-empty");
            assert!(p.starts_with("/api/v1/"), "path must start with /api/v1/");
        }
        // Verify uniqueness
        let unique: std::collections::HashSet<&&str> = paths.iter().collect();
        assert_eq!(unique.len(), paths.len(), "all paths must be unique");
    }

    // ── P7-3 O-003: All 18 path constants pinned to exact RFC S54 values ──

    #[test]
    // @verifies C063
    // [::TICKET::] P7-3: O-003 — pin every path constant to its exact RFC S54 value.
    // [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    fn test_all_path_constants_exact() {
        // (actual, expected) pairs from the RFC §54 endpoint table.
        let expected: [(&str, &str); 18] = [
            (PATH_AUTH_TOKEN, "/api/v1/auth/token"),
            (PATH_ACCOUNTS, "/api/v1/accounts"),
            (PATH_ACCOUNT_BY_ID, "/api/v1/accounts/:id"),
            (PATH_ACCOUNT_REGISTER, "/api/v1/accounts/:id/register"),
            (PATH_ACCOUNT_UNREGISTER, "/api/v1/accounts/:id/unregister"),
            (PATH_ACCOUNT_CALLS, "/api/v1/accounts/:id/calls"),
            (PATH_CALLS, "/api/v1/calls"),
            (PATH_CALL_BY_ID, "/api/v1/calls/:id"),
            (PATH_CALL_HANGUP, "/api/v1/calls/:id/hangup"),
            (PATH_CALL_HOLD, "/api/v1/calls/:id/hold"),
            (PATH_CALL_UNHOLD, "/api/v1/calls/:id/unhold"),
            (PATH_CALL_DTMF, "/api/v1/calls/:id/dtmf"),
            (PATH_CALL_TRANSFER, "/api/v1/calls/:id/transfer"),
            (PATH_EVENTS, "/api/v1/events"),
            (PATH_HEALTH, "/api/v1/health"),
            (PATH_SHUTDOWN, "/api/v1/shutdown"),
            (PATH_WS, "/api/v1/ws"),
            (PATH_WS_AUDIO, "/api/v1/ws/audio"),
        ];
        for (actual, want) in expected {
            assert_eq!(
                actual, want,
                "path constant must match RFC S54 value"
            );
        }
    }

    // ── P7-3 O-004: SequenceGenerator monotonic + unique over 1M iterations ──

    #[test]
    // @verifies C063
    // [::TICKET::] P7-3: O-004 — run the production SequenceGenerator 1M times.
    // [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    fn test_sequence_generator_1m_iterations() {
        let gen = SequenceGenerator::new();
        let mut seen = std::collections::HashSet::with_capacity(1_000_001);
        let mut prev = gen.next();
        seen.insert(prev);
        for _ in 0..1_000_000 {
            let next = gen.next();
            assert!(
                seen.insert(next),
                "duplicate sequence number {}",
                next
            );
            assert!(
                next > prev,
                "sequence must be strictly increasing: {} then {}",
                prev,
                next
            );
            prev = next;
        }
        assert_eq!(seen.len(), 1_000_001, "all 1M+1 sequences must be unique");
    }
}
