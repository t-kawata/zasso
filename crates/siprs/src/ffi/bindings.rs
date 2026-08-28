// [::TICKET::] P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-5 --for-spec --no-implementation-order`.
// [::TICKET::] P3-2: PJSUA FFI binding type aliases.
//
// When `pjsua-native` feature is enabled, this module is replaced by
// the bindgen-generated code from build.rs (see build.rs for configuration).
// When the feature is not enabled, these stub type aliases allow the crate
// to compile without a system PJSIP installation.
//
// Exactly one body is active per the feature flag (C058): `include!` pulls the
// bindgen output when the feature is on, the `stub_aliases` submodule when it
// is off — both are never compiled together.
// [::TICKET::] P3-2, P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5) --for-spec --no-implementation-order`.

// Allow the PJSIP C API naming conventions in both bodies:
// - `non_camel_case_types` — C typedefs/structs (`pj_str_t`, `pjsua_call_id`)
// - `non_upper_case_globals` — bindgen emits C enum values namespaced by the
//   enum type (e.g. `pjsua_call_media_status_PJSUA_CALL_MEDIA_ACTIVE`)
// - `non_snake_case` — bindgen's generated layout-test fn names
//   (`bindgen_test_layout_pjsua_call_info__bindgen_ty_1`)
// These names are dictated by the vendored headers, not by this crate.
#![allow(non_camel_case_types, non_upper_case_globals, non_snake_case)]

use crate::runtime::command::ReactorError;

#[cfg(feature = "pjsua-native")]
include!(concat!(env!("OUT_DIR"), "/bindings.rs"));

#[cfg(not(feature = "pjsua-native"))]
mod stub_aliases {
    // ---------------------------------------------------------------------------
    // Type aliases matching PJSIP ABI
    // ---------------------------------------------------------------------------

    /// Opaque account identifier — maps to `pjsua_acc_id` (int).
    pub type pjsua_acc_id = i32;

    /// Opaque call identifier — maps to `pjsua_call_id` (int).
    pub type pjsua_call_id = i32;

    /// Conference port identifier — maps to `pjsua_conf_port_id` (int).
    pub type pjsua_conf_port_id = i32;

    /// Transport identifier — maps to `pjsua_transport_id` (int).
    pub type pjsua_transport_id = i32;

    /// PJSUA success result code (maps to `PJ_SUCCESS` = 0).
    pub const PJ_SUCCESS: i32 = 0;

    /// Generic PJSUA error indicator (`PJ_ERRNO_START_STATUS + 1` = 70001).
    pub const PJ_EUNKNOWN: i32 = 70001;

    /// Maximum SIP packet length (`PJSIP_MAX_PKT_LEN`, sip_config.h:372).
    ///
    /// [::TICKET::] P17-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-2 --for-spec --no-implementation-order`.
    // [::TICKET::] P17-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-2 --for-spec --no-implementation-order`.
    pub const PJSIP_MAX_PKT_LEN: usize = 4000;

    /// Application-layer module priority (sip_module.h:210) — the raw SIP
    /// module registers one below so it observes before UA modules.
    pub const PJSIP_MOD_PRIORITY_APPLICATION: i32 = 64;

    /// PJSIP boolean true (`PJ_TRUE`).
    pub const PJ_TRUE: i32 = 1;

    /// PJSIP boolean false (`PJ_FALSE`) — returned by observation-only handlers.
    pub const PJ_FALSE: i32 = 0;

    /// Not enough memory (`PJ_ERRNO_START_STATUS + 7` = 70007).
    ///
    /// [::TICKET::] P11-9: the stub mirrors the pjsua.h values (vendored
    /// `pj/errno.h`) so the error/state mapping compiles identically under both
    /// constant sources.
    pub const PJ_ENOMEM: i32 = 70007;
    /// Invalid operation (`PJ_ERRNO_START_STATUS + 13` = 70013).
    pub const PJ_EINVALIDOP: i32 = 70013;
    /// Object is busy (`PJ_ERRNO_START_STATUS + 11` = 70011).
    pub const PJ_EBUSY: i32 = 70011;

    // ---------------------------------------------------------------------------
    // pjsip_transport_type_e — SIP transport protocol constants (P16-2).
    // The enum value order matches `enum pjsip_transport_type_e` in
    // `pjsip/sip_transport.h`; the stub mirrors the bindgen consts-style so the
    // `TransportKind → c_int` mapping compiles identically under both sources.
    // ---------------------------------------------------------------------------

    /// UDP transport (`PJSIP_TRANSPORT_UDP` = 1).
    ///
    /// Values match `enum pjsip_transport_type_e` in `pjsip/sip_transport.h`
    /// (`PJSIP_TRANSPORT_UNSPECIFIED` = 0 is the first enumerator). Typed `u32`
    /// to match bindgen's `c_uint`; the wiring casts to `i32` explicitly.
    pub const PJSIP_TRANSPORT_UDP: u32 = 1;
    // [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    /// TCP transport (`PJSIP_TRANSPORT_TCP` = 2).
    pub const PJSIP_TRANSPORT_TCP: u32 = 2;
    /// TLS transport (`PJSIP_TRANSPORT_TLS` = 3).
    pub const PJSIP_TRANSPORT_TLS: u32 = 3;

    // ---------------------------------------------------------------------------
    // pjsip_inv_state — invite-session state constants (bindgen consts-style:
    // the PJSIP_INV_STATE_ prefix is stripped, so `CONFIRMED` == PJSIP_INV_STATE_CONFIRMED).
    // ---------------------------------------------------------------------------

    /// Initial state.
    ///
    /// Values match `enum pjsip_inv_state` in `pjsip-ua/sip_inv.h`. P16-5 (§62.14)
    /// consumes INCOMING=2 and EARLY=3 in `convert_call_state`.
    pub mod pjsip_inv_state {
        /// Before INVITE is sent or received.
        pub const NULL: u32 = 0;
        /// P18-1 §62.33: the C enumerator name (bindgen Rust-enum variant).
        pub const PJSIP_INV_STATE_NULL: u32 = 0;
        /// After INVITE is sent (outgoing).
        pub const CALLING: u32 = 1;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSIP_INV_STATE_CALLING: u32 = 1;
        /// Incoming INVITE received (inbound call offered).
        pub const INCOMING: u32 = 2;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSIP_INV_STATE_INCOMING: u32 = 2;
        /// Early media (183 Session Progress) received.
        pub const EARLY: u32 = 3;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSIP_INV_STATE_EARLY: u32 = 3;
        /// After a 2xx is sent/received.
        pub const CONNECTING: u32 = 4;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSIP_INV_STATE_CONNECTING: u32 = 4;
        /// After ACK is sent/received.
        pub const CONFIRMED: u32 = 5;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSIP_INV_STATE_CONFIRMED: u32 = 5;
        /// Session is terminated.
        pub const DISCONNECTED: u32 = 6;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSIP_INV_STATE_DISCONNECTED: u32 = 6;
    }

    // ---------------------------------------------------------------------------
    // pjsua_call_media_status — call media status constants (bindgen consts-style:
    // the PJSUA_CALL_MEDIA_ prefix is stripped).
    // ---------------------------------------------------------------------------

    /// Call media state, mapped from PJSIP's `pjsua_call_media_status`.
    pub mod pjsua_call_media_status {
        /// No media / initial state.
        pub const NONE: u32 = 0;
        /// P18-1 §62.33: the C enumerator name (bindgen Rust-enum variant).
        pub const PJSUA_CALL_MEDIA_NONE: u32 = 0;
        /// Media is active (send/receive).
        pub const ACTIVE: u32 = 1;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSUA_CALL_MEDIA_ACTIVE: u32 = 1;
        /// Media is locally held.
        pub const LOCAL_HOLD: u32 = 2;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSUA_CALL_MEDIA_LOCAL_HOLD: u32 = 2;
        /// Media is remotely held.
        pub const REMOTE_HOLD: u32 = 3;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSUA_CALL_MEDIA_REMOTE_HOLD: u32 = 3;
        /// Media error occurred.
        pub const ERROR: u32 = 4;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSUA_CALL_MEDIA_ERROR: u32 = 4;
    }

    // ---------------------------------------------------------------------------
    // PJSUA call state constants (pjsua_call_state)
    // ---------------------------------------------------------------------------

    /// Call is idle (not yet established or disconnected).
    pub const PJSUA_CALL_NULL: u32 = 0;
    /// Call is being set up (outgoing).
    pub const PJSUA_CALL_CALLING: u32 = 1;
    /// Incoming call is being alerted.
    pub const PJSUA_CALL_INCOMING: u32 = 2;
    /// Call is being set up (early media).
    pub const PJSUA_CALL_EARLY: u32 = 3;
    /// Call is active (media established).
    pub const PJSUA_CALL_CONNECTING: u32 = 4;
    /// Call is confirmed (media connected).
    pub const PJSUA_CALL_CONFIRMED: u32 = 5;
    /// Call is being disconnected.
    pub const PJSUA_CALL_DISCONNECTED: u32 = 6;

    // ---------------------------------------------------------------------------
    // PJSUA registration state constants (pjsua_reg_state)
    // ---------------------------------------------------------------------------

    /// Registration is not yet started.
    pub const PJSUA_REG_STATE_NULL: u32 = 0;
    /// Registration is being sent.
    pub const PJSUA_REG_STATE_REGISTERING: u32 = 1;
    /// Registration is active.
    pub const PJSUA_REG_STATE_ACTIVE: u32 = 2;
    /// Registration attempt failed.
    pub const PJSUA_REG_STATE_FAILED: u32 = 3;

    // ---------------------------------------------------------------------------
    // pj_str_t — PJSIP string descriptor
    // ---------------------------------------------------------------------------

    /// Mirror of PJSIP's `pj_str_t` struct.
    ///
    /// # Memory safety
    /// This struct is only used as an FFI argument passthrough — the pointer
    /// must point to valid memory for the duration of the FFI call.
    /// When using `PjOwnedStr` (from `ffi::pj_str`), the backing memory
    /// is Rust-owned `Vec<u8>`.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pj_str_t {
        /// Pointer to the string data (may be null if slen is 0).
        pub ptr: *mut i8,
        /// Length of the string in bytes.
        pub slen: i32,
    }

    // ---------------------------------------------------------------------------
    // pjsua_call_info — call information struct (minimal mirror)
    // ---------------------------------------------------------------------------

    /// Mirror of PJSIP's `pjsua_call_info` struct.
    ///
    /// Exposes the fields the crate consumes — `conf_slot` (for the conference
    /// bridge) and `media_status` (for `CallMediaStateChanged`) — matching the
    /// bindgen-generated struct's field names so shared code compiles under both
    /// modes. Full struct comes from bindgen when `pjsua-native` is enabled.
    #[repr(C)]
    #[derive(Debug)]
    pub struct pjsua_call_info {
        /// Conference port slot for this call's media.
        pub conf_slot: pjsua_conf_port_id,
        /// Call media status (`pjsua_call_media_status`); NONE in stub mode.
        pub media_status: u32,
    }

    // ---------------------------------------------------------------------------
    // pjmedia_port family — media-port types for the conf-bridge registration
    // (PX-3 / N0049 §39, N0085 §62.16). Field names mirror the bindgen output so
    // the shared adapter code compiles identically under both bodies.
    // ---------------------------------------------------------------------------

    /// Media format id for 16-bit signed PCM (`PJMEDIA_FORMAT_PCM` = L16).
    pub const PJMEDIA_FORMAT_PCM: u32 = 0;
    /// Top-most media type for audio (`PJMEDIA_TYPE_AUDIO`).
    pub const PJMEDIA_TYPE_AUDIO: u32 = 1;
    /// Audio format detail selector (`PJMEDIA_FORMAT_DETAIL_AUDIO`).
    pub const PJMEDIA_FORMAT_DETAIL_AUDIO: u32 = 1;

    /// Top-most media type (`pjmedia_type`) — mirrors the bindgen Rust enum so
    /// the shared adapter compiles identically under both bodies (P18-1 §62.33).
    #[repr(u32)]
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum pjmedia_type {
        PJMEDIA_TYPE_NONE = 0,
        PJMEDIA_TYPE_AUDIO = 1,
        PJMEDIA_TYPE_VIDEO = 2,
        PJMEDIA_TYPE_TEXT = 3,
        PJMEDIA_TYPE_APPLICATION = 4,
        PJMEDIA_TYPE_UNKNOWN = 5,
    }

    /// Media format id (`pjmedia_format_id`) — the PCM ids the adapter uses.
    #[repr(u32)]
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum pjmedia_format_id {
        PJMEDIA_FORMAT_L16 = 0,
        PJMEDIA_FORMAT_PCMA = 1463897153,
        PJMEDIA_FORMAT_PCMU = 1463897205,
    }

    /// Format detail selector (`pjmedia_format_detail_type`).
    #[repr(u32)]
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum pjmedia_format_detail_type {
        PJMEDIA_FORMAT_DETAIL_NONE = 0,
        PJMEDIA_FORMAT_DETAIL_AUDIO = 1,
        PJMEDIA_FORMAT_DETAIL_VIDEO = 2,
        PJMEDIA_FORMAT_DETAIL_MAX = 3,
    }

    /// Media direction (`pjmedia_dir`) — mirrors the bindgen Rust enum.
    #[repr(u32)]
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum pjmedia_dir {
        PJMEDIA_DIR_NONE = 0,
        PJMEDIA_DIR_ENCODING = 1,
        PJMEDIA_DIR_DECODING = 2,
        PJMEDIA_DIR_ENCODING_DECODING = 3,
    }

    /// Pool handle — opaque in PJSIP; the stub models it as a void pointer.
    pub type pj_pool_t = *mut std::ffi::c_void;
    /// Byte size type used by PJSIP.
    pub type pj_size_t = usize;
    /// Result code type (`pj_status_t`); `PJ_SUCCESS` is 0.
    pub type pj_status_t = i32;
    /// Frame type (`pjmedia_frame_type`) — opaque u32 in the stub.
    pub type pjmedia_frame_type = u32;
    /// Timestamp type (`pj_timestamp`) — opaque u32 in the stub.
    pub type pj_timestamp = u32;

    /// Audio format detail carried by `pjmedia_format.det.aud`.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjmedia_audio_format_detail {
        /// Audio clock rate in samples per second.
        pub clock_rate: std::ffi::c_uint,
        /// Number of audio channels.
        pub channel_count: std::ffi::c_uint,
        /// Frame interval in microseconds.
        pub frame_time_usec: std::ffi::c_uint,
        /// Number of bits per sample.
        pub bits_per_sample: std::ffi::c_uint,
        /// Average bitrate.
        pub avg_bps: u32,
        /// Maximum bitrate.
        pub max_bps: u32,
    }

    /// Stub representation of `pjmedia_format.det` — only the audio detail is
    /// modelled (the adapter touches `det.aud` exclusively). The native build
    /// replaces this with the bindgen union; the field path stays identical.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjmedia_format_det {
        /// Audio detail.
        pub aud: pjmedia_audio_format_detail,
    }

    /// Media format (`pjmedia_format`) — the stub models the fields the conf
    /// bridge reads: format id, media type, detail selector, and audio detail.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjmedia_format {
        /// Format id (e.g. `PJMEDIA_FORMAT_L16`).
        pub id: u32,
        /// Top-most media type.
        pub type_: pjmedia_type,
        /// Which detail member is active.
        pub detail_type: pjmedia_format_detail_type,
        /// Format detail (audio in this crate).
        pub det: pjmedia_format_det,
    }

    /// Port information (`pjmedia_port_info`) — the name, signature, direction,
    /// and format a `pjmedia_port` reports to the conference bridge.
    #[repr(C)]
    #[derive(Debug)]
    pub struct pjmedia_port_info {
        /// Port name.
        pub name: pj_str_t,
        /// Port signature.
        pub signature: u32,
        /// Port direction.
        pub dir: pjmedia_dir,
        /// Media format.
        pub fmt: pjmedia_format,
    }

    /// The `port_data` member of `pjmedia_port` — arbitrary creator data.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjmedia_port_data {
        /// Pointer data — the adapter stores the `Box<RustMediaPort>` here.
        pub pdata: *mut std::ffi::c_void,
        /// Long data.
        pub ldata: std::ffi::c_long,
    }

    /// Custom media port (`pjmedia_port`) — the struct `pjsua_conf_add_port`
    /// registers. The stub mirrors the bindgen field names so the adapter
    /// compiles under both bodies.
    #[repr(C)]
    #[derive(Debug)]
    pub struct pjmedia_port {
        /// Port information.
        pub info: pjmedia_port_info,
        /// Arbitrary creator data — holds the boxed `RustMediaPort`.
        pub port_data: pjmedia_port_data,
        /// Optional group lock.
        pub grp_lock: *mut std::ffi::c_void,
        /// Clock-source accessor (unused by the adapter).
        pub get_clock_src:
            Option<unsafe extern "C" fn(*mut pjmedia_port, pjmedia_dir) -> *mut std::ffi::c_void>,
        /// Sink interface — called by `pjmedia_port_put_frame`.
        pub put_frame:
            Option<unsafe extern "C" fn(*mut pjmedia_port, *mut pjmedia_frame) -> pj_status_t>,
        /// Source interface — called by `pjmedia_port_get_frame`.
        pub get_frame:
            Option<unsafe extern "C" fn(*mut pjmedia_port, *mut pjmedia_frame) -> pj_status_t>,
        /// Destructor — called by `pjmedia_port_destroy`.
        pub on_destroy: Option<unsafe extern "C" fn(*mut pjmedia_port) -> pj_status_t>,
    }

    /// Media frame (`pjmedia_frame`) — the buffer the RT `get_frame`/`put_frame`
    /// callbacks exchange.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjmedia_frame {
        /// Frame type (audio).
        pub type_: pjmedia_frame_type,
        /// Pointer to the frame buffer.
        pub buf: *mut std::ffi::c_void,
        /// Frame size in bytes.
        pub size: pj_size_t,
        /// Frame timestamp.
        pub timestamp: pj_timestamp,
        /// Bit info of the frame.
        pub bit_info: u32,
    }

    // ---------------------------------------------------------------------------
    // pjsua_codec_info — codec information struct (minimal mirror)
    // ---------------------------------------------------------------------------

    /// Mirror of PJSIP's `pjsua_codec_info` struct.
    ///
    /// Only the fields needed to build `Codec` are modelled; the full struct
    /// comes from bindgen when `pjsua-native` is enabled.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsua_codec_info {
        /// Codec ID string (e.g., "opus/48000/2").
        pub codec_id: pj_str_t,
        /// Codec priority (0-255), matching PJSIP 2.17.0 (pjsua-lib/pjsua.h:8166).
        pub priority: u8,
        /// Codec description string (PJSIP 2.17.0 shape).
        pub desc: pj_str_t,
        /// Internal buffer (PJSIP 2.17.0 shape).
        pub buf_: [u8; 64],
    }

    // ---------------------------------------------------------------------------
    // pjsua_transport_config — transport configuration (P16-2)
    // ---------------------------------------------------------------------------

    /// Mirror of PJSIP's `pjsua_transport_config` struct.
    ///
    /// Exposes the two fields the transport wiring consumes — `port` and
    /// `bound_addr` — matching the bindgen-generated struct's field names so
    /// shared code compiles under both modes. The full struct comes from bindgen
    /// when `pjsua-native` is enabled.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsua_transport_config {
        // [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
        /// Local port to bind (0 selects a PJSIP-assigned port).
        pub port: u32,
        /// Local address to bind (empty string selects all interfaces).
        pub bound_addr: pj_str_t,
    }

    // ---------------------------------------------------------------------------
    // pjsua_config / pjsua_callback — callback-bridge ABI (P11-11)
    // ---------------------------------------------------------------------------

    /// PJSIP boolean — maps to `pj_bool_t` (int).
    pub type pj_bool_t = i32;

    /// Mirror of `pjsip_rx_data.pkt_info` — the transport-received packet fields
    /// the raw SIP capture module reads (P17-2 / §62.22). Matches the vendored
    /// `sip_transport.h` layout: `packet` holds the original raw bytes and `len`
    /// is the received length (`pj_ssize_t`).
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsip_rx_data_pkt_info {
        /// Original raw packet bytes (`char packet[PJSIP_MAX_PKT_LEN]`).
        pub packet: [std::ffi::c_char; PJSIP_MAX_PKT_LEN],
        /// Length of the received packet.
        pub len: std::os::raw::c_long,
    }

    /// Mirror of PJSIP's `pjsip_rx_data` exposing the raw packet fields the raw
    /// SIP capture module reads. Under `pjsua-native` the bindgen struct exposes
    /// the same `pkt_info.packet[0..len]` field path.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsip_rx_data {
        /// Transport-received packet info (raw SIP bytes + length).
        pub pkt_info: pjsip_rx_data_pkt_info,
    }

    /// Opaque PJSIP endpoint (`pjsip_endpoint`) — only ever a pointer passthrough
    /// to `pjsip_endpt_register_module` (P17-2).
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsip_endpoint {
        _private: [u8; 0],
    }

    /// Opaque outgoing SIP message (`pjsip_tx_data`) — completes the
    /// `pjsip_module` struct mirror; the raw SIP module never wires TX handlers.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsip_tx_data {
        _private: [u8; 0],
    }

    /// Mirror of PJSIP's `pjsip_module` — the standard extension point the raw
    /// SIP capture module registers (sip_module.h:60-180). Field names and
    /// pointer types match the vendored header so the static initializer
    /// compiles identically under bindgen (`pjsua-native`).
    #[repr(C)]
    #[derive(Debug)]
    pub struct pjsip_module {
        /// Module name (`pj_str_t`), e.g. "mod_siprs_raw_sip".
        pub name: pj_str_t,
        /// Module ID — must be -1 before registration; PJSIP assigns a unique ID.
        pub id: i32,
        /// Initialization/start order relative to other modules.
        pub priority: i32,
        /// Optional load callback (NULL = PJ_SUCCESS).
        pub load: Option<unsafe extern "C" fn(*mut pjsip_endpoint) -> i32>,
        /// Optional start callback (NULL = PJ_SUCCESS).
        pub start: Option<unsafe extern "C" fn() -> i32>,
        /// Optional stop callback (NULL = PJ_SUCCESS).
        pub stop: Option<unsafe extern "C" fn() -> i32>,
        /// Optional unload callback (NULL = PJ_SUCCESS).
        pub unload: Option<unsafe extern "C" fn() -> i32>,
        /// Incoming request observer — return PJ_TRUE to consume, PJ_FALSE to defer.
        pub on_rx_request: Option<unsafe extern "C" fn(*mut pjsip_rx_data) -> pj_bool_t>,
        /// Incoming response observer — return PJ_TRUE to consume, PJ_FALSE to defer.
        pub on_rx_response: Option<unsafe extern "C" fn(*mut pjsip_rx_data) -> pj_bool_t>,
        /// Outgoing request observer (unused — P17-2 is RX-only).
        pub on_tx_request: Option<unsafe extern "C" fn(*mut pjsip_tx_data) -> i32>,
        /// Outgoing response observer (unused — P17-2 is RX-only).
        pub on_tx_response: Option<unsafe extern "C" fn(*mut pjsip_tx_data) -> i32>,
        /// Transaction-state observer (unused by the raw SIP module).
        pub on_tsx_state: Option<unsafe extern "C" fn(*mut pjsip_transaction, *mut pjsip_event)>,
        /// Module list linkage (next module) — null before registration.
        pub next: *mut pjsip_module,
        /// Module list linkage (previous module) — null before registration.
        pub prev: *mut pjsip_module,
    }

    /// Opaque SIP URI (`pjsip_uri`) — only ever a pointer passthrough.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsip_uri {
        _private: [u8; 0],
    }

    /// Opaque SIP transaction (`pjsip_transaction`) — only ever a pointer
    /// passthrough; no callback in the P11-11 set reads it.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsip_transaction {
        _private: [u8; 0],
    }

    /// Minimal mirror of `pjsip_transport` exposing the `id` member the
    /// `on_transport_state` handler reads (P17-3 §62.23).
    ///
    /// The vendored `pjsip_transport` struct (sip_transport.h L837-935) has no
    /// `id` member; this stub mirror exposes the id accessor path the handler
    /// compiles against. Native transport-id resolution (H1 restoration) is an
    /// open item tracked in the P17-3 spec.
    #[repr(C)]
    #[derive(Debug, Clone)]
    // [::TICKET::] P17-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-3 --for-spec --no-implementation-order`.
    pub struct pjsip_transport {
        /// Transport id read by `on_transport_state`.
        pub id: u32,
    }

    /// Opaque transport state info (`pjsip_transport_state_info`) — never read
    /// by the P17-3 handler; passed through as a null pointer in tests.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsip_transport_state_info {
        _private: [u8; 0],
    }

    /// Opaque STUN NAT detection result (`pj_stun_nat_detect_result`) — never
    /// read by the P17-3 handler; passed through as a null pointer in tests.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pj_stun_nat_detect_result {
        _private: [u8; 0],
    }

    /// Opaque registration info (`pjsua_reg_info`) — the `on_reg_state2`
    /// argument; P11-11 uses the legacy `on_reg_state(pjsua_acc_id)` instead.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsua_reg_info {
        _private: [u8; 0],
    }

    /// Minimal mirror of `pjsip_event` exposing the call-state field path the
    /// `on_call_state` callback reads. Under `pjsua-native` the real struct is a
    /// bindgen union; the shared `pjsip_event::call_state()` accessor reads the
    /// same `.body.call_state_info.state` path in both modes.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsip_event {
        /// Event payload body — only the `call_state_info` member is modelled.
        pub body: pjsip_event_body,
    }

    /// Mirror of the `pjsip_event_body` union — only the call-state member.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsip_event_body {
        /// Call-state event info (`pjsip_event_body_call_state_info`).
        pub call_state_info: pjsip_event_call_state_info,
    }

    /// Call-state event info carrying the `pjsip_inv_state`.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsip_event_call_state_info {
        /// Invite-session state (`pjsip_inv_state`), e.g. CONFIRMED = 5.
        pub state: u32,
    }

    /// Redirect decision returned by `on_call_redirected` (`pjsip_redirect_op`).
    ///
    /// Mirrors the bindgen consts-style surface: the enum type is an unsigned int
    /// and the enumerators are module-level constants. P11-11 only ever returns
    /// `PJSIP_REDIRECT_STOP` — the no-follow default that matches PJSIP's own
    /// behavior when the callback is absent.
    pub mod pjsip_redirect_op {
        /// Reject the redirection to the current target.
        pub const PJSIP_REDIRECT_REJECT: u32 = 0;
        /// Accept the redirection to the current target.
        pub const PJSIP_REDIRECT_ACCEPT: u32 = 1;
        /// Accept the redirection and replace the To header with the target.
        pub const PJSIP_REDIRECT_ACCEPT_REPLACE: u32 = 2;
        /// Defer the redirection decision (requires `pjsua_call_process_redirect`).
        pub const PJSIP_REDIRECT_PENDING: u32 = 3;
        /// Stop the whole redirection process and disconnect the call.
        pub const PJSIP_REDIRECT_STOP: u32 = 4;
    }

    /// Transport state enum (`pjsip_transport_state`) — mirrors `pjsip/sip_transport.h`.
    ///
    /// P16-4 §62.13 maps `NativeEvent::TransportStateChanged` states to the
    /// `SipEventPayload::Transport{Connected,Disconnected,Error}` payloads from
    /// these values. The stub mirrors the bindgen consts-style so the mapping
    /// compiles identically under both constant sources (P11-9 pattern).
    pub mod pjsip_transport_state {
        // [::TICKET::] P16-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-4 --for-spec --no-implementation-order`.
        // P18-1 §62.33: values corrected to the vendored `enum pjsip_transport_state`
        // in `pjsip/sip_transport.h` (PJSIP_TP_STATE_CONNECTED=0 … DESTROY=3).
        /// Transport is connected and usable (PJSIP_TP_STATE_CONNECTED = 0).
        pub const CONNECTED: u32 = 0;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSIP_TP_STATE_CONNECTED: u32 = 0;
        /// Transport has been disconnected (PJSIP_TP_STATE_DISCONNECTED = 1).
        pub const DISCONNECTED: u32 = 1;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSIP_TP_STATE_DISCONNECTED: u32 = 1;
        /// Transport is shutting down (PJSIP_TP_STATE_SHUTDOWN = 2).
        pub const SHUTDOWN: u32 = 2;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSIP_TP_STATE_SHUTDOWN: u32 = 2;
        /// Transport object is about to be destroyed (PJSIP_TP_STATE_DESTROY = 3).
        pub const DESTROY: u32 = 3;
        /// P18-1 §62.33: the C enumerator name.
        pub const PJSIP_TP_STATE_DESTROY: u32 = 3;
    }

    /// ICE stream operation enum (`pj_ice_strans_op`) — mirrors `pjmedia/transport_ice.h`.
    ///
    /// P19-2 §62.39: `on_ice_transport_error` reports which operation triggered
    /// the ICE failure. The stub mirrors the bindgen consts-style (P11-9
    /// pattern) so the callback's `op as u32` conversion compiles under both
    /// constant sources.
    // [::TICKET::] P19-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-2 --for-spec --no-implementation-order`.
    pub mod pj_ice_strans_op {
// [::TICKET::] P19-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-2 --for-spec --no-implementation-order`.
        /// Initialization (candidate gathering).
        pub const PJ_ICE_STRANS_OP_INIT: u32 = 0;
        /// Negotiation.
        pub const PJ_ICE_STRANS_OP_NEGOTIATION: u32 = 1;
        /// Keep-alive operation (currently TURN Refresh failure).
        pub const PJ_ICE_STRANS_OP_KEEP_ALIVE: u32 = 2;
        /// IP address change notification from STUN keep-alive.
        pub const PJ_ICE_STRANS_OP_ADDR_CHANGE: u32 = 3;
    }

    /// Application callback registry (`pjsua_callback`) — the fields P11-11 wires.
    ///
    /// Field names and their pointer types mirror the vendored `pjsua.h`
    /// declarations so `register_callbacks` compiles against both this stub and
    /// the bindgen output under `pjsua-native`.
    #[repr(C)]
    #[derive(Debug, Clone)]
    // [::TICKET::] P17-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-3 --for-spec --no-implementation-order`.
    pub struct pjsua_callback {
        /// `on_call_state` — call invite-session state changed.
        pub on_call_state: Option<unsafe extern "C" fn(pjsua_call_id, *mut pjsip_event)>,
        /// `on_incoming_call` — new incoming INVITE.
        pub on_incoming_call:
            Option<unsafe extern "C" fn(pjsua_acc_id, pjsua_call_id, *mut pjsip_rx_data)>,
        /// `on_call_media_state` — call media state changed.
        pub on_call_media_state: Option<unsafe extern "C" fn(pjsua_call_id)>,
        /// `on_dtmf_digit` — RFC 2833 DTMF digit received.
        pub on_dtmf_digit: Option<unsafe extern "C" fn(pjsua_call_id, i32)>,
        /// `on_call_transfer_status` — transfer progress report.
        pub on_call_transfer_status:
            Option<unsafe extern "C" fn(pjsua_call_id, i32, *const pj_str_t, i32, *mut i32)>,
        /// `on_reg_started` — registration/unregistration initiated.
        pub on_reg_started: Option<unsafe extern "C" fn(pjsua_acc_id, i32)>,
        /// `on_reg_state` — registration status changed (legacy single-arg form).
        pub on_reg_state: Option<unsafe extern "C" fn(pjsua_acc_id)>,
        /// `on_call_redirected` — INVITE about to be resent to a redirect target.
        pub on_call_redirected: Option<
            unsafe extern "C" fn(pjsua_call_id, *const pjsip_uri, *const pjsip_event) -> u32,
        >,
        /// `on_transport_state` — transport state changed (P17-3 §62.23).
        ///
        /// The `state` argument is typed `u32` to match the `pjsip_transport_state`
        /// module-consts surface (P11-9 pattern); bindgen under `pjsua-native`
        /// emits the same C enum as an unsigned int.
        pub on_transport_state: Option<
            unsafe extern "C" fn(*mut pjsip_transport, u32, *const pjsip_transport_state_info),
        >,
        /// `on_call_tsx_state` — transaction state changed (P17-3 §62.23).
        pub on_call_tsx_state:
            Option<unsafe extern "C" fn(pjsua_call_id, *mut pjsip_transaction, *mut pjsip_event)>,
        /// `on_call_replaced` — call replaced by a new call (P17-3 §62.23).
        pub on_call_replaced: Option<unsafe extern "C" fn(pjsua_call_id, pjsua_call_id)>,
        /// `on_nat_detect` — STUN NAT detection result (P17-3 §62.23).
        pub on_nat_detect: Option<unsafe extern "C" fn(*const pj_stun_nat_detect_result)>,
        /// `on_ice_transport_error` — ICE media transport error (P19-2 §62.39).
        ///
        /// Reports errors in the ICE media transport (currently TURN Refresh
        /// errors). The `op` argument is typed `u32` to match the
        /// `pj_ice_strans_op` module-consts surface (P11-9 pattern); bindgen
        /// under `pjsua-native` emits the same C enum as a Rust enum.
        // [::TICKET::] P19-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-2 --for-spec --no-implementation-order`.
        pub on_ice_transport_error: Option<
// [::TICKET::] P19-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-2 --for-spec --no-implementation-order`.
            unsafe extern "C" fn(
                index: std::os::raw::c_int,
                op: u32,
                status: pj_status_t,
                param: *mut std::ffi::c_void,
            ),
        >,
    }

    /// PJSUA global configuration — callback registry plus the STUN/TURN wiring
    /// surface (§62.17 / P16-8). Field names mirror the vendored `pjsua.h` so the
    /// wiring compiles identically under bindgen (`pjsua-native`).
    #[repr(C)]
    #[derive(Debug)]
    // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
    pub struct pjsua_config {
        /// Application callback registry (`pjsua_callback`).
        pub cb: pjsua_callback,
        /// Number of STUN server entries in `stun_srv` (at most 8).
        pub stun_srv_cnt: u32,
        /// STUN server URIs (`stun:host:port`).
        pub stun_srv: [pj_str_t; 8],
        /// TURN config selector (`PJSUA_TURN_CONFIG_USE_*`).
        pub turn_cfg_use: pjsua_turn_config_use,
        /// Custom TURN configuration (used when `turn_cfg_use == USE_CUSTOM`).
        pub turn_cfg: pjsua_turn_config,
    }

    /// Per-account configuration (`pjsua_acc_config`) — the TURN surface
    /// `apply_turn` reflects into.
    ///
    /// P18-1 §62.31: PJSIP 2.17 configures TURN per-account, not on the global
    /// `pjsua_config`; the stub models only the `turn_cfg_use`/`turn_cfg`
    /// members the wiring references (the vendored struct at
    /// `pjsua-lib/pjsua.h:4172` carries many more, all zeroed by the caller).
    #[repr(C)]
    #[derive(Debug)]
    pub struct pjsua_acc_config {
        /// TURN config selector (`PJSUA_TURN_CONFIG_USE_*`).
        pub turn_cfg_use: pjsua_turn_config_use,
        /// Custom TURN configuration (used when `turn_cfg_use == USE_CUSTOM`).
        pub turn_cfg: pjsua_turn_config,
    }

    // ---------------------------------------------------------------------------
    // STUN/TURN/ICE — pjsua_config / pjsua_media_config wiring surface (P16-8).
    // Field names and values mirror the vendored `pjsua.h` / `pjnath` headers.
    // ---------------------------------------------------------------------------

    /// TURN server connection type (`pj_turn_tp_type`, IANA protocol numbers).
    pub type pj_turn_tp_type = u32;

    /// UDP transport to the TURN server (`PJ_TURN_TP_UDP` = IANA UDP = 17).
    pub const PJ_TURN_TP_UDP: pj_turn_tp_type = 17;
    /// TCP transport to the TURN server (`PJ_TURN_TP_TCP` = IANA TCP = 6).
    pub const PJ_TURN_TP_TCP: pj_turn_tp_type = 6;
    /// TLS transport to the TURN server (`PJ_TURN_TP_TLS` = IANA TLS = 56).
    pub const PJ_TURN_TP_TLS: pj_turn_tp_type = 56;

    /// TURN config selector (`pjsua_turn_config_use`).
    pub type pjsua_turn_config_use = u32;

    /// Use the global TURN setting in `pjsua_media_config`.
    pub const PJSUA_TURN_CONFIG_USE_DEFAULT: pjsua_turn_config_use = 0;
    /// Use the custom `turn_cfg` below.
    pub const PJSUA_TURN_CONFIG_USE_CUSTOM: pjsua_turn_config_use = 1;

    /// STUN auth credential type (`pj_stun_auth_cred_type`).
    pub type pj_stun_auth_cred_type = u32;

    /// Static credential (realm / username / password).
    pub const PJ_STUN_AUTH_CRED_STATIC: pj_stun_auth_cred_type = 0;

    /// STUN password data type (`pj_stun_passwd_type`).
    pub type pj_stun_passwd_type = u32;

    /// Plaintext password in `static_cred.data`.
    pub const PJ_STUN_PASSWD_PLAIN: pj_stun_passwd_type = 0;

    /// Static long-term credential — the `static_cred` member of `pj_stun_auth_cred`.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pj_stun_auth_cred_static {
        /// Non-empty realm selects long-term credential.
        pub realm: pj_str_t,
        /// Authentication username.
        pub username: pj_str_t,
        /// Password data type (`PJ_STUN_PASSWD_PLAIN`).
        pub data_type: pj_stun_passwd_type,
        /// Password data (plaintext when `data_type == PLAIN`).
        pub data: pj_str_t,
        /// Optional NONCE (left empty for static credentials).
        pub nonce: pj_str_t,
    }

    /// Anonymous union of credential variants — the vendored `pjnath/stun_auth.h`
    /// names the union member `data`; the stub models only the `static_cred`
    /// member (P18-1 §62.31).
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pj_stun_auth_cred_union {
        /// Static credential variant.
        pub static_cred: pj_stun_auth_cred_static,
    }

    /// STUN authentication credential (`pj_stun_auth_cred`).
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pj_stun_auth_cred {
        /// Credential variant (`PJ_STUN_AUTH_CRED_STATIC`).
        pub type_: pj_stun_auth_cred_type,
        /// Credential payload union (member name `data` per the vendored header).
        pub data: pj_stun_auth_cred_union,
    }

    /// Custom TURN configuration (`pjsua_turn_config`) — the `turn_cfg` member
    /// of `pjsua_config`. TLS settings are a zero-length placeholder deferred
    /// to the native bindings (`turn_tls_setting` is only read for TLS).
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
    pub struct pjsua_turn_config {
        /// Enable the TURN candidate in ICE.
        pub enable_turn: pj_bool_t,
        /// TURN server in `DOMAIN:PORT` or `HOST:PORT` format.
        pub turn_server: pj_str_t,
        /// Connection type to the TURN server (`PJ_TURN_TP_*`).
        pub turn_conn_type: pj_turn_tp_type,
        /// Credential to authenticate with the TURN server.
        pub turn_auth_cred: pj_stun_auth_cred,
        /// TLS settings for TURN-TLS (zero-length stub; native bindings carry it).
        pub turn_tls_setting: [u8; 0],
    }

    /// ICE session options (`pj_ice_sess_options`) — only `aggressive` is modelled.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pj_ice_sess_options {
        /// Use aggressive nomination (only when trickle ICE is disabled).
        pub aggressive: pj_bool_t,
    }

    /// PJSUA media configuration (`pjsua_media_config`) — the ICE fields §62.17
    /// wires. Other media defaults are left to PJSIP.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
    pub struct pjsua_media_config {
        /// Enable ICE for media transport.
        pub enable_ice: pj_bool_t,
        /// Maximum number of host candidates to gather.
        pub ice_max_host_cands: i32,
        /// ICE session options (`ice_opt.aggressive`).
        pub ice_opt: pj_ice_sess_options,
    }

    // ---------------------------------------------------------------------------
    // Stub FFI calls (compile-time only — no link symbol needed yet)
    // ---------------------------------------------------------------------------

    /// Stub for `pjsua_call_get_info`.
    ///
    /// The non-`pjsua-native` build has no linked PJSIP library, so the stub
    /// fills the mirror deterministically: `conf_slot` echoes the call id and
    /// `media_status` is `NONE` (no real call media without the stack). Under
    /// `pjsua-native` this call is replaced by the bindgen symbol.
    ///
    /// # Safety
    ///
    /// `_info` must be non-null, properly aligned, and point to a valid,
    /// initialized `pjsua_call_info` struct. The caller is responsible for
    /// ensuring no concurrent mutable access to the pointed-to memory.
    pub unsafe fn pjsua_call_get_info(_call_id: pjsua_call_id, _info: *mut pjsua_call_info) -> i32 {
        if _info.is_null() {
            return PJ_EUNKNOWN;
        }
        unsafe {
            (*_info).conf_slot = _call_id as pjsua_conf_port_id;
            (*_info).media_status = pjsua_call_media_status::NONE;
        }
        PJ_SUCCESS
    }

    /// Next conference slot assigned by the `pjsua_conf_add_port` stub.
    ///
    /// A static counter gives every registered port a distinct non-negative
    /// slot so the default build can assert per-call registration (PX-3).
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn next_conf_slot() -> pjsua_conf_port_id {
        static NEXT_SLOT: std::sync::atomic::AtomicI32 = std::sync::atomic::AtomicI32::new(100);
        NEXT_SLOT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    }

    /// Stub for `pjsua_conf_add_port`.
    ///
    /// The default build has no linked conference bridge, so the stub assigns a
    /// deterministic slot and returns `PJ_SUCCESS`. A `#[cfg(test)]` hook
    /// (`stub_test_hooks`) forces a non-success status for the error path.
    ///
    /// # Safety
    /// `p_id` must be null or point to a valid `pjsua_conf_port_id`.
    pub unsafe fn pjsua_conf_add_port(
        _pool: *mut pj_pool_t,
        _port: *mut pjmedia_port,
        p_id: *mut pjsua_conf_port_id,
    ) -> i32 {
        #[cfg(test)]
        {
            let forced = crate::ffi::bindings::stub_test_hooks::conf_add_port_status();
            if forced != PJ_SUCCESS {
                return forced;
            }
        }
        if !p_id.is_null() {
            unsafe { *p_id = next_conf_slot() };
        }
        PJ_SUCCESS
    }

    /// Stub for `pjsip_endpt_register_module` (P17-2 / §62.22).
    ///
    /// The default build has no real endpoint, so the stub records the module
    /// pointer for tests and returns `PJ_SUCCESS` — or a forced non-success
    /// status via `stub_test_hooks` to exercise the error branch.
    ///
    /// # Safety
    /// `module` must be a valid, initialized `pjsip_module` pointer.
    pub unsafe fn pjsip_endpt_register_module(
        _endpt: *mut pjsip_endpoint,
        module: *mut pjsip_module,
    ) -> i32 {
        #[cfg(test)]
        {
            let forced = crate::ffi::bindings::stub_test_hooks::register_module_status();
            if forced != PJ_SUCCESS {
                return forced;
            }
            crate::ffi::bindings::stub_test_hooks::record_registered_module(module);
        }
        #[cfg(not(test))]
        let _ = module;
        PJ_SUCCESS
    }

    /// Stub for `pjsua_get_pjsip_endpt`.
    ///
    /// The default build has no PJSUA stack, so it returns null; the native
    /// build returns the real endpoint after `pjsua_init` (pjsua.h:2991).
    ///
    /// # Safety
    ///
    /// The returned pointer is only valid after `pjsua_init` in the native
    /// build; the caller must not dereference a null stub pointer.
    pub unsafe fn pjsua_get_pjsip_endpt() -> *mut pjsip_endpoint {
        std::ptr::null_mut()
    }

    /// Stub for `pjsua_call_get_conf_port` — echoes the call id as its slot.
    ///
    /// # Safety
    /// The default build has no real call media; the echo keeps the value
    /// deterministic for the conf-bridge registration loop (PX-3).
    pub unsafe fn pjsua_call_get_conf_port(call_id: pjsua_call_id) -> pjsua_conf_port_id {
        call_id as pjsua_conf_port_id
    }

    /// Stub for `pjsua_pool_create` — returns a non-null dummy pointer.
    ///
    /// # Safety
    /// The returned pointer is not a real pool; the default build never
    /// dereferences it (the conf-bridge stubs ignore the pool).
    pub unsafe fn pjsua_pool_create(
        _name: *const i8,
        _init_size: pj_size_t,
        _increment: pj_size_t,
    ) -> *mut std::ffi::c_void {
        std::ptr::NonNull::<u8>::dangling().as_ptr().cast()
    }

    /// Stub for `pjsua_conf_connect` — accepts the connection.
    ///
    /// # Safety
    /// The default build has no real conference bridge; every connection is
    /// accepted so the registration loop can be exercised end-to-end (PX-3).
    pub unsafe fn pjsua_conf_connect(
        _source: pjsua_conf_port_id,
        _sink: pjsua_conf_port_id,
    ) -> i32 {
        PJ_SUCCESS
    }

    /// Stub for `pjsua_enum_codecs`.
    ///
    /// The non-`pjsua-native` build has no linked PJSIP library, so no native
    /// codecs are available: `count` is set to 0 and success is returned.
    ///
    /// # Safety
    ///
    /// `count` must be non-null and point to a valid `u32`. `codecs` is
    /// unused by the stub and may be null.
    pub unsafe fn pjsua_enum_codecs(_codecs: *mut pjsua_codec_info, count: *mut u32) -> i32 {
        if count.is_null() {
            return PJ_EUNKNOWN;
        }
        unsafe {
            *count = 0;
        }
        PJ_SUCCESS
    }
}

#[cfg(not(feature = "pjsua-native"))]
pub use stub_aliases::*;

/// Test-only hooks for the default-build conf-bridge stubs (PX-3).
///
/// These let unit tests force a non-success status from the deterministic
/// `pjsua_conf_add_port` stub so the `ReactorError::NativeError` propagation
/// path is exercised without a real PJSIP stack.
#[cfg(all(test, not(feature = "pjsua-native")))]
pub(crate) mod stub_test_hooks {
    use std::sync::atomic::{AtomicI32, AtomicUsize, Ordering};
    use std::sync::Mutex;

    static CONF_ADD_PORT_STATUS: AtomicI32 = AtomicI32::new(super::PJ_SUCCESS);

    /// Serializes tests that force `CONF_ADD_PORT_STATUS` away from the default.
    ///
    /// Rust runs tests in parallel by default, so a test that forces
    /// `PJ_EUNKNOWN` can race with a sibling test that expects `PJ_SUCCESS`,
    /// leaking the forced status and failing the sibling (flaky). All tests
    /// that read or write the hook must go through [`with_conf_add_port_status`].
    // [::TICKET::] P17-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-4 --for-spec --no-implementation-order`.
    static CONF_ADD_PORT_HOOK_GUARD: Mutex<()> = Mutex::new(());

    /// The status the `pjsua_conf_add_port` stub currently returns.
    pub(crate) fn conf_add_port_status() -> i32 {
        CONF_ADD_PORT_STATUS.load(Ordering::Relaxed)
    }

    /// Force `pjsua_conf_add_port` to return `status` in subsequent calls.
    pub(crate) fn set_conf_add_port_status(status: i32) {
        CONF_ADD_PORT_STATUS.store(status, Ordering::Relaxed);
    }

    /// Run `f` with the conf-add-port hook forced to `status`, restoring
    /// `PJ_SUCCESS` afterwards. The module-wide mutex makes every hook-touching
    /// test mutually exclusive, removing the parallel-test race on the global.
    // [::TICKET::] P17-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-4 --for-spec --no-implementation-order`.
    pub(crate) fn with_conf_add_port_status<T>(status: i32, f: impl FnOnce() -> T) -> T {
        let _guard = CONF_ADD_PORT_HOOK_GUARD
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        set_conf_add_port_status(status);
        let result = f();
        set_conf_add_port_status(super::PJ_SUCCESS);
        result
    }

    /// The status the `pjsip_endpt_register_module` stub currently returns.
    static REGISTER_MODULE_STATUS: AtomicI32 = AtomicI32::new(super::PJ_SUCCESS);

    /// The last module pointer handed to `pjsip_endpt_register_module` (as usize).
    static LAST_REGISTERED_MODULE: AtomicUsize = AtomicUsize::new(0);

    /// The status the `pjsip_endpt_register_module` stub currently returns.
    pub(crate) fn register_module_status() -> i32 {
        REGISTER_MODULE_STATUS.load(Ordering::Relaxed)
    }

    /// Force `pjsip_endpt_register_module` to return `status` in subsequent calls.
    pub(crate) fn set_register_module_status(status: i32) {
        REGISTER_MODULE_STATUS.store(status, Ordering::Relaxed);
    }

    /// Record the module pointer passed to `pjsip_endpt_register_module`.
    pub(crate) fn record_registered_module(module: *mut super::pjsip_module) {
        LAST_REGISTERED_MODULE.store(module as usize, Ordering::SeqCst);
    }

    /// The last module pointer handed to `pjsip_endpt_register_module`, or 0.
    pub(crate) fn last_registered_module() -> usize {
        LAST_REGISTERED_MODULE.load(Ordering::SeqCst)
    }
}

// Shared — available in both modes: bindgen output and the stub aliases both
// define `pj_str_t`, so the `null()` constructor is attached here once.
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
impl pj_str_t {
    /// Create a null (zero-length) `pj_str_t`.
    pub const fn null() -> Self {
        Self {
            ptr: std::ptr::null_mut(),
            slen: 0,
        }
    }
}

/// Shared call-state accessor for `pjsip_event` — available in both modes.
///
/// Under `pjsua-native` the event body is a C union and reading the active
/// `call_state_info` member is the documented `on_call_state` path. Under the
/// stub build the mirror struct exposes the same field path so `on_call_state`
/// and its tests share one code path.
// [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
/// Read the invite-session state carried by the event.
///
/// P18-1 (§62.31): the vendored `pjsip_event` has no `call_state_info` member,
/// so this accessor exists only in the stub build; `on_call_state` resolves the
/// native state via `pjsua_call_get_info` instead.
#[cfg(not(feature = "pjsua-native"))]
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
impl pjsip_event {
    pub fn call_state(&self) -> u32 {
        self.body.call_state_info.state
    }
}

// ---------------------------------------------------------------------------
// Shared codec-enumeration helpers — available in both modes: the bindgen
// output and the stub aliases both define `pjsua_codec_info`, `pj_str_t`,
// `pjsua_enum_codecs`, and `PJ_SUCCESS`, so these helpers compile against
// either body.
// ---------------------------------------------------------------------------

/// Maximum number of codecs reportable by `pjsua_enum_codecs` (`PJMEDIA_MAX_CODECS`).
const MAX_ENUM_CODECS: usize = 256;

/// Read a `pj_str_t` into an owned `String`.
///
/// Returns an empty string for a null pointer or a non-positive length.
///
/// # Safety contract
/// The caller guarantees that `ptr` points to at least `slen` readable bytes
/// for the duration of the call (PJSIP static codec strings in the live path,
/// or a live `PjOwnedStr` in fixture tests).
pub fn pj_str_to_string(s: &pj_str_t) -> String {
    if s.ptr.is_null() || s.slen <= 0 {
        return String::new();
    }
    let len = s.slen as usize;
    // SAFETY: guarded above — ptr is non-null and slen > 0, and the caller
    // guarantees at least `slen` readable bytes for the duration of the call.
    let bytes = unsafe { std::slice::from_raw_parts(s.ptr as *const u8, len) };
    String::from_utf8_lossy(bytes).into_owned()
}

/// Decode a raw `pjsua_enum_codecs` result into the filled entries.
///
/// Returns an empty list when the status is not success, or when `count`
/// exceeds the buffer capacity (a protocol violation).
// [::TICKET::] P11-8, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-8|P18-1) --for-spec --no-implementation-order`.
fn decode_enumeration_result(
    status: i32,
    count: u32,
    mut raw: Vec<pjsua_codec_info>,
) -> Vec<pjsua_codec_info> {
    if status != crate::ffi::constants::PJ_SUCCESS || count as usize > raw.len() {
        return Vec::new();
    }
    raw.truncate(count as usize);
    raw
}

/// Enumerate native audio codecs from the PJSUA stack.
///
/// The raw `pjsua_codec_info` entries returned contain `pj_str_t` pointers
/// into PJSIP-owned static codec strings that remain valid for the process
/// lifetime; consumers must map them to owned types (e.g. `Codec`) promptly.
pub fn enumerate_codecs() -> Vec<pjsua_codec_info> {
    let mut raw = vec![unsafe { std::mem::zeroed() }; MAX_ENUM_CODECS];
    let mut count: u32 = 0;
    // SAFETY: raw.as_mut_ptr() points to MAX_ENUM_CODECS valid entries and
    // pjsua_enum_codecs writes at most that many; count is a valid pointer.
    // All-zero is a valid pjsua_codec_info (null ptr / slen 0 / rates 0).
    let status = unsafe { pjsua_enum_codecs(raw.as_mut_ptr(), &mut count) };
    if status != crate::ffi::constants::PJ_SUCCESS {
        tracing::warn!(
            status,
            "codec enumeration failed; degrading to empty available_codecs"
        );
    } else if count as usize > raw.len() {
        tracing::warn!(
            count,
            "codec enumeration count exceeds buffer capacity; degrading to empty available_codecs"
        );
    }
    decode_enumeration_result(status, count, raw)
}

// ---------------------------------------------------------------------------
// Call media status resolution — shared by both modes
// ---------------------------------------------------------------------------

/// Read the `media_status` field from a populated `pjsua_call_info`.
///
/// Pure decoder — unit-testable with a fixture struct; the FFI boundary is
/// confined to `resolve_call_media_status`.
pub fn media_status_from_call_info(info: &pjsua_call_info) -> u32 {
    // P18-1 (§62.33): media_status is a Rust enum under pjsua-native; the caller
    // consumes the raw u32 value.
    info.media_status as u32
}

/// Resolve the actual media status for a call via `pjsua_call_get_info`.
///
/// Under `pjsua-native` this runs the real bindgen FFI symbol against the
/// linked PJSIP library; under the stub build it reads the stub-produced
/// struct. A non-success `pj_status_t` is surfaced as
/// `ReactorError::BackendError` with the status preserved — never a canned
/// success.
pub fn resolve_call_media_status(call_id: pjsua_call_id) -> Result<u32, ReactorError> {
    let mut info: pjsua_call_info = unsafe { std::mem::zeroed() };
    // SAFETY: info is a valid, aligned, initialized pjsua_call_info; the FFI
    // fills it in place; the caller has no concurrent mutable access.
    let status = unsafe { pjsua_call_get_info(call_id, &mut info) };
    if status != crate::ffi::constants::PJ_SUCCESS {
        return Err(ReactorError::BackendError(format!(
            "pjsua_call_get_info({call_id}) failed with status {status}"
        )));
    }
    Ok(media_status_from_call_info(&info))
}

#[cfg(all(test, not(feature = "pjsua-native")))]
mod tests {
    use super::*;
    use crate::ffi::pj_str::PjOwnedStr;

    #[test]
    // [::TICKET::] P3-2, P11-5, P11-8, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P11-8|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn pj_str_t_null_creates_zero_length() {
        let owned = pj_str_t::null();
        assert_eq!(owned.slen, 0, "null pj_str_t must have slen=0");
        assert!(owned.ptr.is_null(), "null pj_str_t must have null ptr");
    }

    #[test]
    // [::TICKET::] P3-2, P11-10, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn pjsua_call_get_info_stub_returns_success() {
        let mut info = pjsua_call_info {
            conf_slot: 0,
            media_status: 0,
        };
        let status = unsafe { pjsua_call_get_info(42, &mut info) };
        assert_eq!(status, PJ_SUCCESS, "stub must return success");
        assert_eq!(info.conf_slot, 42, "conf_slot must match call_id");
        assert_eq!(
            info.media_status,
            pjsua_call_media_status::NONE,
            "stub media_status must be NONE (no real media without pjsua-native)"
        );
    }

    #[test]
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pjsua_call_get_info_null_returns_error() {
        let status = unsafe { pjsua_call_get_info(42, std::ptr::null_mut()) };
        assert_eq!(status, PJ_EUNKNOWN, "null info must return error");
    }

    #[test]
    // [::TICKET::] P11-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-10 --for-spec --no-implementation-order`.
    fn media_status_from_call_info_reads_field() {
        let info = pjsua_call_info {
            conf_slot: 7,
            media_status: pjsua_call_media_status::ACTIVE,
        };
        assert_eq!(
            media_status_from_call_info(&info),
            pjsua_call_media_status::ACTIVE,
            "decoder must read the media_status field from a populated pjsua_call_info"
        );
    }

    #[test]
    // [::TICKET::] P11-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-10 --for-spec --no-implementation-order`.
    fn resolve_call_media_status_returns_stub_value() -> Result<(), ReactorError> {
        // The helper must route through pjsua_call_get_info (the stub writes NONE),
        // proving the media_status never comes from a hardcoded literal.
        let status = resolve_call_media_status(42)?;
        assert_eq!(
            status,
            pjsua_call_media_status::NONE,
            "resolve_call_media_status must return the value pjsua_call_get_info wrote"
        );
        Ok(())
    }

    #[test]
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn call_state_constants_are_distinct() {
        let states = [
            PJSUA_CALL_NULL,
            PJSUA_CALL_CALLING,
            PJSUA_CALL_INCOMING,
            PJSUA_CALL_EARLY,
            PJSUA_CALL_CONNECTING,
            PJSUA_CALL_CONFIRMED,
            PJSUA_CALL_DISCONNECTED,
        ];
        let mut sorted: Vec<u32> = states.to_vec();
        sorted.sort();
        sorted.dedup();
        assert_eq!(
            sorted.len(),
            states.len(),
            "call state constants must be unique"
        );
    }

    #[test]
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pjsua_acc_id_is_i32() {
        // Compile-time assertion: pjsua_acc_id must be i32
        let _: pjsua_acc_id = 0i32;
        let _: pjsua_call_id = 0i32;
        let _: pjsua_conf_port_id = 0i32;
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P11-5, P11-10, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-10|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn stub_surface_is_callable_without_pjsua() {
        // C038-Pre: the FFI surface must be callable with no system PJSIP install.
        let mut info = pjsua_call_info {
            conf_slot: 0,
            media_status: 0,
        };
        let status = unsafe { pjsua_call_get_info(7, &mut info) };
        assert_eq!(status, PJ_SUCCESS);
        assert_eq!(info.conf_slot, 7);
        assert_eq!(
            info.media_status,
            pjsua_call_media_status::NONE,
            "stub media_status must be NONE"
        );
    }

    // [::TICKET::] P11-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-9 --for-spec --no-implementation-order`.
    #[test]
    // [::TICKET::] P11-9, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-9|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn stub_surface_exposes_p11_9_constants() {
        // P11-9: the error/state mapping modules consume these constants from
        // ffi::bindings. RED until the stub_aliases expose them; the type
        // annotations pin the ABI widths (i32 status, u32 enum values).
        let _success: i32 = PJ_SUCCESS;
        let _enomem: i32 = PJ_ENOMEM;
        let _einval: i32 = PJ_EINVALIDOP;
        let _ebusy: i32 = PJ_EBUSY;
        let _inv_state: u32 = pjsip_inv_state::CONFIRMED;
        let _media_state: u32 = pjsua_call_media_status::ACTIVE;
        let _ = (_success, _enomem, _einval, _ebusy, _inv_state, _media_state);
    }

    // ── P11-8: codec-enumeration FFI surface ───────────────────────────

    #[test]
    // @verifies C041
    // [::TICKET::] P11-8, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-8|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn pj_str_to_string_reads_valid_str() {
        let owned = PjOwnedStr::new("opus/48000/2");
        let raw = owned.as_raw();
        assert_eq!(pj_str_to_string(&raw), "opus/48000/2");
    }

    #[test]
    // @verifies C041
    // [::TICKET::] P11-8, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-8|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn pj_str_to_string_null_returns_empty() {
        let raw = pj_str_t::null();
        assert_eq!(pj_str_to_string(&raw), "");
    }

    #[test]
    // @verifies C041
    // [::TICKET::] P11-8, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-8|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn decode_enumeration_result_error_returns_empty() {
        let raw: Vec<pjsua_codec_info> = Vec::new();
        let result = decode_enumeration_result(PJ_EUNKNOWN, 3, raw);
        assert!(result.is_empty());
    }

    #[test]
    // @verifies C041
    // [::TICKET::] P11-8, P11-11, P12-7, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-8|P11-11|P12-7|P18-1) --for-spec --no-implementation-order`.
    fn decode_enumeration_result_truncates_to_count() {
        let zero = pjsua_codec_info {
            codec_id: pj_str_t::null(),
            priority: 0,
            desc: pj_str_t::null(),
            buf_: [0u8; 64],
        };
        let raw = vec![zero; 4];
        let result = decode_enumeration_result(PJ_SUCCESS, 2, raw);
        assert_eq!(result.len(), 2);
    }

    #[test]
    // @verifies C041
    // [::TICKET::] P11-8, P11-11, P12-7, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-8|P11-11|P12-7|P18-1) --for-spec --no-implementation-order`.
    fn decode_enumeration_result_count_exceeding_buffer_returns_empty() {
        let zero = pjsua_codec_info {
            codec_id: pj_str_t::null(),
            priority: 0,
            desc: pj_str_t::null(),
            buf_: [0u8; 64],
        };
        let raw = vec![zero; 2];
        // A count larger than the buffer capacity is a protocol violation.
        let result = decode_enumeration_result(PJ_SUCCESS, 256, raw);
        assert!(result.is_empty());
    }

    #[test]
    // @verifies C041
    // [::TICKET::] P11-8, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-8|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn enumerate_codecs_empty_without_native() {
        // The stub pjsua_enum_codecs reports count=0, so the safe wrapper
        // returns an empty list on the non-pjsua-native path.
        assert!(enumerate_codecs().is_empty());
    }

    #[test]
    // @verifies C041
    // [::TICKET::] P11-8, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-8|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn pjsua_enum_codecs_null_count_returns_error() {
        let status = unsafe { pjsua_enum_codecs(std::ptr::null_mut(), std::ptr::null_mut()) };
        assert_eq!(status, PJ_EUNKNOWN);
    }

    #[test]
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn pjsua_conf_add_port_stub_writes_slot_and_returns_success() {
        let mut slot: pjsua_conf_port_id = -1;
        let status =
            unsafe { pjsua_conf_add_port(std::ptr::null_mut(), std::ptr::null_mut(), &mut slot) };
        assert_eq!(status, PJ_SUCCESS, "stub must return success");
        assert!(slot >= 0, "stub must write a non-negative conf slot");
    }

    #[test]
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn pjsua_conf_add_port_stub_accepts_null_id() {
        let status = unsafe {
            pjsua_conf_add_port(
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        assert_eq!(status, PJ_SUCCESS, "stub must tolerate a null p_id");
    }

    #[test]
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn pjsua_call_get_conf_port_stub_echoes_call_id() {
        let slot = unsafe { pjsua_call_get_conf_port(9) };
        assert_eq!(slot, 9, "stub must echo the call id as its conf slot");
    }

    #[test]
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn pjsua_pool_create_stub_returns_non_null() {
        let pool = unsafe { pjsua_pool_create(c"px3-test".as_ptr(), 512, 512) };
        assert!(!pool.is_null(), "stub pool must be non-null");
    }

    #[test]
    // [::TICKET::] PX-3, P17-4, P17-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-3|P17-4|P17-5) --for-spec --no-implementation-order`.
    fn stub_test_hooks_can_force_conf_add_port_failure() {
        let mut slot: pjsua_conf_port_id = -1;
        let ok =
            unsafe { pjsua_conf_add_port(std::ptr::null_mut(), std::ptr::null_mut(), &mut slot) };
        assert_eq!(ok, PJ_SUCCESS);
        // P17-4 (boy-scout): route through the mutex-guarded helper so the forced
        // status never leaks into a parallel sibling test.
        stub_test_hooks::with_conf_add_port_status(PJ_EUNKNOWN, || {
            let forced = unsafe {
                pjsua_conf_add_port(std::ptr::null_mut(), std::ptr::null_mut(), &mut slot)
            };
            assert_eq!(
                forced, PJ_EUNKNOWN,
                "test hook must force a non-success status"
            );
        });
    }
}
