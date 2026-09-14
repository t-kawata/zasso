//! IETF standards this crate implements. These references MUST survive scrubbing.

/// DTMF telephone-event payload (RTP).
pub const DTMF_EVENT_PAYLOAD_TYPE: u8 = 101;

/// RFC 4733 defines the RTP payload format for DTMF digits, telephony tones and signals.
pub const DTMF_STANDARD: &str = "RFC 4733";

/// RFC 2833 is the predecessor of RFC 4733 for the same telephone-event payload.
pub const DTMF_LEGACY_STANDARD: &str = "RFC 2833";

/// RFC 2976 defines the SIP INFO method used to carry in-band signalling.
pub const SIP_INFO_STANDARD: &str = "RFC 2976";

/// Interval between consecutive DTMF events, per RFC 4733 section 3.1.
pub const DTMF_MIN_INTERVAL_MS: u32 = 40;
