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
//   - NODE_ID=N0086:  62.17 STUN/TURN/ICE 配線と coturn 検証
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0086 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P16-8: STUN/TURN/ICE wiring — §62.17 / N0086.
//
// This module maps `ClientConfig.stun_servers` / `turn_servers` / `ice` (§13)
// onto the PJSIP `pjsua_config` (STUN array + TURN struct) and
// `pjsua_media_config` (ICE flags). The pure reflection helpers compile and
// are unit-tested in the default (stub) build; `backend_calls::initialize`
// invokes them under `pjsua-native` (C038 — no unsafe outside src/ffi/).

use crate::config::transport_ice_spec::{IceConfig, TurnServerConfig, TurnTransport};
use crate::config::ClientConfig;
use crate::error::{SipError, SipErrorKind};
use crate::ffi::bindings;
use crate::ffi::pj_str::PjOwnedStr;

/// Maximum number of STUN servers the PJSIP `pjsua_config.stun_srv[8]` array holds.
const STUN_SRV_MAX: usize = 8;

/// Rust-owned strings backing the reflected global `pjsua_config.stun_srv`.
///
/// A `pj_str_t` points into its `PjOwnedStr` backing buffer, so the caller must
/// keep these owned strings alive while the reflected config is passed to PJSUA.
/// `apply_stun` returns this guard so callers hold it in scope alongside the
/// config (the `backend_calls::initialize` pattern).
pub struct StunOwned {
    /// STUN server URIs, backing `cfg.stun_srv[0..stun_srv_cnt]`.
    pub stun: Vec<PjOwnedStr>,
}

/// Rust-owned strings backing the reflected account `pjsua_acc_config.turn_cfg`.
///
/// P18-1 §62.31: TURN is an account-level setting in PJSIP 2.17 — the vendored
/// global `pjsua_config` has no `turn_cfg` fields — so `apply_turn` reflects it
/// into the per-account config and returns this guard for the call's lifetime.
pub struct TurnOwned {
    /// TURN server URI, backing `cfg.turn_cfg.turn_server`.
    pub turn_server: Option<PjOwnedStr>,
    /// TURN username, backing `cfg.turn_cfg.turn_auth_cred.static_cred.username`.
    pub turn_username: Option<PjOwnedStr>,
    /// TURN password, backing `cfg.turn_cfg.turn_auth_cred.static_cred.data`.
    pub turn_password: Option<PjOwnedStr>,
}

/// Resolve the PJSIP TURN connection-type value for a `TurnTransport`.
///
/// Values mirror `enum pj_turn_tp_type` in `pjnath/turn_session.h` (IANA
/// protocol numbers). The symbol name differs per build — the stub declares bare
/// `PJ_TURN_TP_*` constants while bindgen emits the Rust enum
/// `bindings::pj_turn_tp_type::PJ_TURN_TP_*` (P18-1 §62.33) — so the value is
/// resolved by a cfg-paired helper; the numeric result is identical in both.
pub fn resolve_turn_conn_type(transport: TurnTransport) -> bindings::pj_turn_tp_type {
    match transport {
        TurnTransport::Udp => turn_tp_value(TurnTransport::Udp),
        TurnTransport::Tcp => turn_tp_value(TurnTransport::Tcp),
        TurnTransport::Tls => turn_tp_value(TurnTransport::Tls),
    }
}

#[cfg(feature = "pjsua-native")]
// [::TICKET::] P16-8, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-8|P18-1) --for-spec --no-implementation-order`.
fn turn_tp_value(transport: TurnTransport) -> bindings::pj_turn_tp_type {
    match transport {
        TurnTransport::Udp => bindings::pj_turn_tp_type::PJ_TURN_TP_UDP,
        TurnTransport::Tcp => bindings::pj_turn_tp_type::PJ_TURN_TP_TCP,
        TurnTransport::Tls => bindings::pj_turn_tp_type::PJ_TURN_TP_TLS,
    }
}

#[cfg(not(feature = "pjsua-native"))]
// [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
fn turn_tp_value(transport: TurnTransport) -> bindings::pj_turn_tp_type {
    match transport {
        TurnTransport::Udp => bindings::PJ_TURN_TP_UDP,
        TurnTransport::Tcp => bindings::PJ_TURN_TP_TCP,
        TurnTransport::Tls => bindings::PJ_TURN_TP_TLS,
    }
}

#[cfg(feature = "pjsua-native")]
// [::TICKET::] P16-8, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-8|P18-1) --for-spec --no-implementation-order`.
fn turn_config_custom() -> bindings::pjsua_turn_config_use {
    bindings::pjsua_turn_config_use::PJSUA_TURN_CONFIG_USE_CUSTOM
}

#[cfg(not(feature = "pjsua-native"))]
// [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
fn turn_config_custom() -> bindings::pjsua_turn_config_use {
    bindings::PJSUA_TURN_CONFIG_USE_CUSTOM
}

#[cfg(feature = "pjsua-native")]
// [::TICKET::] P16-8, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-8|P18-1) --for-spec --no-implementation-order`.
fn stun_auth_cred_static() -> bindings::pj_stun_auth_cred_type {
    bindings::pj_stun_auth_cred_type::PJ_STUN_AUTH_CRED_STATIC
}

#[cfg(not(feature = "pjsua-native"))]
// [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
fn stun_auth_cred_static() -> bindings::pj_stun_auth_cred_type {
    bindings::PJ_STUN_AUTH_CRED_STATIC
}

#[cfg(feature = "pjsua-native")]
// [::TICKET::] P16-8, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-8|P18-1) --for-spec --no-implementation-order`.
fn stun_passwd_plain() -> bindings::pj_stun_passwd_type {
    bindings::pj_stun_passwd_type::PJ_STUN_PASSWD_PLAIN
}

#[cfg(not(feature = "pjsua-native"))]
// [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
fn stun_passwd_plain() -> bindings::pj_stun_passwd_type {
    bindings::PJ_STUN_PASSWD_PLAIN
}

/// Reflect `ClientConfig.stun_servers` into a global `pjsua_config`.
///
/// Reads as prose: reflect each STUN server URI into the `stun_srv` array (and
/// its count). Returns the owned strings so the caller keeps the reflected
/// `pj_str_t` pointers valid. Fails fast: more than `STUN_SRV_MAX` STUN servers
/// returns an `InvalidConfig` error without partially reflecting the config.
pub fn apply_stun(
    cfg: &mut bindings::pjsua_config,
    config: &ClientConfig,
) -> Result<StunOwned, SipError> {
    if config.stun_servers.len() > STUN_SRV_MAX {
        return Err(SipError::new(
            SipErrorKind::InvalidConfig,
            format!(
                "too many STUN servers: {} (pjsua_config.stun_srv holds at most {STUN_SRV_MAX})",
                config.stun_servers.len()
            ),
        ));
    }

    let stun: Vec<PjOwnedStr> = config
        .stun_servers
        .iter()
        .map(|server| PjOwnedStr::new(&server.uri))
        .collect();
    for (index, owned) in stun.iter().enumerate() {
        cfg.stun_srv[index] = owned.as_raw();
    }
    cfg.stun_srv_cnt = config.stun_servers.len() as u32;

    Ok(StunOwned { stun })
}

/// Reflect the first TURN server into an account `pjsua_acc_config`.
///
/// P18-1 §62.31: PJSIP 2.17 configures TURN per-account (`pjsua_acc_config`),
/// not on the global `pjsua_config`. Reflects the selector, enable flag, server
/// URI, connection type, and static credential, and returns the owned strings
/// so the caller keeps the reflected `pj_str_t` pointers valid.
pub fn apply_turn(
    cfg: &mut bindings::pjsua_acc_config,
    turn_servers: &[TurnServerConfig],
) -> Result<TurnOwned, SipError> {
    let turn = turn_servers.first();
    let turn_server = turn.map(|server| PjOwnedStr::new(&server.uri));
    let turn_username =
        turn.and_then(|server| server.username.as_ref().map(|u| PjOwnedStr::new(u)));
    let turn_password = turn.and_then(|server| {
        server
            .password
            .as_ref()
            .map(|p| PjOwnedStr::new(p.expose_secret()))
    });

    if let Some(turn) = turn {
        cfg.turn_cfg_use = turn_config_custom();
        cfg.turn_cfg.enable_turn = 1;
        if let Some(owned) = &turn_server {
            cfg.turn_cfg.turn_server = owned.as_raw();
        }
        cfg.turn_cfg.turn_conn_type = resolve_turn_conn_type(turn.transport);
        if turn.username.is_some() || turn.password.is_some() {
            cfg.turn_cfg.turn_auth_cred.type_ = stun_auth_cred_static();
            // P18-1 §62.31: the vendored pj_stun_auth_cred is a union — the
            // static credential lives in the `data.static_cred` member.
            if let Some(owned) = &turn_username {
                cfg.turn_cfg.turn_auth_cred.data.static_cred.username = owned.as_raw();
            }
            if let Some(owned) = &turn_password {
                cfg.turn_cfg.turn_auth_cred.data.static_cred.data_type = stun_passwd_plain();
                cfg.turn_cfg.turn_auth_cred.data.static_cred.data = owned.as_raw();
            }
        }
    }

    Ok(TurnOwned {
        turn_server,
        turn_username,
        turn_password,
    })
}

/// Reflect `IceConfig` into a `pjsua_media_config`.
///
/// Maps `enabled` → `enable_ice`, `max_host_candidates` → `ice_max_host_cands`,
/// and `aggressive_nomination` → `ice_opt.aggressive` (§13 / §62.17). All three
/// fields have valid values for every `IceConfig`, so the reflection is total.
pub fn apply_ice(cfg: &mut bindings::pjsua_media_config, ice: &IceConfig) {
    cfg.enable_ice = ice.enabled as bindings::pj_bool_t;
    cfg.ice_max_host_cands = ice.max_host_candidates as i32;
    cfg.ice_opt.aggressive = ice.aggressive_nomination as bindings::pj_bool_t;
}

#[cfg(test)]
mod tests {
    use crate::architecture::round2_scope_rootcause::Round2Section;
    use crate::config::stun_turn_ice_wiring::{
        apply_ice, apply_stun, apply_turn, resolve_turn_conn_type,
    };
    use crate::config::transport_ice_spec::{
        IceConfig, StunServerConfig, TurnServerConfig, TurnTransport,
    };
    use crate::config::ClientConfig;
    use crate::error::{SipError, SipErrorKind};
    use crate::ffi::bindings;
    use crate::security::SecretString;

    // ── C111-pre (N0086→N0068): §62 親セクションが存在する ─────────────

    #[test]
    // @verifies C111-pre
    // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
    fn round2_section_resolves_62_17_to_n0086() {
        assert_eq!(Round2Section::StunTurnIceWiring.section(), "62.17");
        assert_eq!(Round2Section::StunTurnIceWiring.node_id(), "N0086");
    }

    // ── C111-post (N0086→N0068): 62.17 が STUN/TURN/ICE 配線を定義する ────

    #[test]
    // @verifies C111-post
    // [::TICKET::] P16-8, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-8|P18-1) --for-spec --no-implementation-order`.
    fn stun_turn_ice_wiring_surface_is_reachable() -> Result<(), SipError> {
        let mut cfg: bindings::pjsua_config = unsafe { std::mem::zeroed() };
        let config = ClientConfig::default();
        let _owned = apply_stun(&mut cfg, &config)?;
        let mut acc: bindings::pjsua_acc_config = unsafe { std::mem::zeroed() };
        let _turn = apply_turn(&mut acc, &config.turn_servers)?;
        let mut media: bindings::pjsua_media_config = unsafe { std::mem::zeroed() };
        apply_ice(&mut media, &config.ice);
        Ok(())
    }

    // ── C112-pre (N0086→N0015): §12/§13 Transport/ICE 仕様を定義する ──────

    #[test]
    // @verifies C112-pre
    // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
    fn ice_config_default_matches_section_13() {
        let ice = IceConfig::default();
        assert!(ice.enabled);
        assert!(ice.aggressive_nomination);
        assert!(!ice.trickle_ice);
        assert!(!ice.renomination);
        assert_eq!(ice.max_host_candidates, 16);
    }

    // ── C112-post (N0086→N0015): pjsua_config への反映 ──────────────────

    #[test]
    // @verifies C112-post
    // [::TICKET::] P16-8, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-8|P18-1) --for-spec --no-implementation-order`.
    fn apply_stun_reflects_stun_uri_into_config() -> Result<(), SipError> {
        let config = ClientConfig {
            stun_servers: vec![StunServerConfig {
                uri: "stun:stun.example.com:3478".into(),
            }],
            ..Default::default()
        };
        let mut cfg: bindings::pjsua_config = unsafe { std::mem::zeroed() };
        let _owned = apply_stun(&mut cfg, &config)?;
        assert_eq!(cfg.stun_srv_cnt, 1);
        assert_eq!(
            bindings::pj_str_to_string(&cfg.stun_srv[0]),
            "stun:stun.example.com:3478"
        );
        Ok(())
    }

    #[test]
    // @verifies C112-post
    // [::TICKET::] P16-8, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-8|P18-1) --for-spec --no-implementation-order`.
    fn apply_turn_reflects_turn_server_into_config() -> Result<(), SipError> {
        let config = ClientConfig {
            turn_servers: vec![TurnServerConfig {
                uri: "turn:turn.example.com:3478".into(),
                username: Some("user".into()),
                password: Some(SecretString::new("pass")),
                transport: TurnTransport::Udp,
            }],
            ..Default::default()
        };
        let mut cfg: bindings::pjsua_acc_config = unsafe { std::mem::zeroed() };
        let _owned = apply_turn(&mut cfg, &config.turn_servers)?;
        assert_eq!(cfg.turn_cfg_use, bindings::PJSUA_TURN_CONFIG_USE_CUSTOM);
        assert_eq!(cfg.turn_cfg.enable_turn, 1);
        assert_eq!(
            bindings::pj_str_to_string(&cfg.turn_cfg.turn_server),
            "turn:turn.example.com:3478"
        );
        assert_eq!(cfg.turn_cfg.turn_conn_type, bindings::PJ_TURN_TP_UDP);
        Ok(())
    }

    // ── C113-post (N0086→N0070): STUN/TURN/ICE の実配線を追補する ────────

    #[test]
    // @verifies C113-post
    // [::TICKET::] P16-8, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-8|P18-1) --for-spec --no-implementation-order`.
    fn apply_turn_reflects_turn_auth_cred() -> Result<(), SipError> {
        let config = ClientConfig {
            turn_servers: vec![TurnServerConfig {
                uri: "turn:turn.example.com:3478".into(),
                username: Some("alice".into()),
                password: Some(SecretString::new("s3cret")),
                transport: TurnTransport::Tcp,
            }],
            ..Default::default()
        };
        let mut cfg: bindings::pjsua_acc_config = unsafe { std::mem::zeroed() };
        let _owned = apply_turn(&mut cfg, &config.turn_servers)?;
        let cred = &cfg.turn_cfg.turn_auth_cred.data.static_cred;
        assert_eq!(cred.data_type, bindings::PJ_STUN_PASSWD_PLAIN);
        assert_eq!(bindings::pj_str_to_string(&cred.username), "alice");
        assert_eq!(bindings::pj_str_to_string(&cred.data), "s3cret");
        Ok(())
    }

    #[test]
    // @verifies C112-post
    // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
    fn apply_ice_reflects_ice_settings_into_media_config() {
        let ice = IceConfig {
            enabled: true,
            aggressive_nomination: true,
            trickle_ice: false,
            renomination: false,
            max_host_candidates: 10,
        };
        let mut media: bindings::pjsua_media_config = unsafe { std::mem::zeroed() };
        apply_ice(&mut media, &ice);
        assert_eq!(media.enable_ice, 1);
        assert_eq!(media.ice_max_host_cands, 10);
        assert_eq!(media.ice_opt.aggressive, 1);
    }

    #[test]
    // @verifies C112-post
    // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
    fn resolve_turn_conn_type_maps_transport_to_pj_turn_tp() {
        assert_eq!(
            resolve_turn_conn_type(TurnTransport::Udp),
            bindings::PJ_TURN_TP_UDP
        );
        assert_eq!(
            resolve_turn_conn_type(TurnTransport::Tcp),
            bindings::PJ_TURN_TP_TCP
        );
        assert_eq!(
            resolve_turn_conn_type(TurnTransport::Tls),
            bindings::PJ_TURN_TP_TLS
        );
    }

    // ── Error / Boundary / Invariant ──────────────────────────────────

    #[test]
    // @verifies C112-post
    // [::TICKET::] P16-8, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-8|P18-1) --for-spec --no-implementation-order`.
    fn apply_stun_rejects_more_than_eight_stun_servers() -> Result<(), SipError> {
        let config = ClientConfig {
            stun_servers: (0..9)
                .map(|i| StunServerConfig {
                    uri: format!("stun:s{i}.example.com:3478"),
                })
                .collect(),
            ..Default::default()
        };
        let mut cfg: bindings::pjsua_config = unsafe { std::mem::zeroed() };
        let result = apply_stun(&mut cfg, &config);
        assert!(result.is_err());
        assert!(matches!(
            result,
            Err(SipError {
                kind: SipErrorKind::InvalidConfig,
                ..
            })
        ));
        assert_eq!(cfg.stun_srv_cnt, 0, "no partial reflection on error");
        Ok(())
    }

    #[test]
    // @verifies C112-inv
    // [::TICKET::] P16-8, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-8|P18-1) --for-spec --no-implementation-order`.
    fn apply_stun_with_no_servers_is_noop() -> Result<(), SipError> {
        let config = ClientConfig::default();
        let mut cfg: bindings::pjsua_config = unsafe { std::mem::zeroed() };
        let _owned = apply_stun(&mut cfg, &config)?;
        assert_eq!(cfg.stun_srv_cnt, 0);
        let mut acc: bindings::pjsua_acc_config = unsafe { std::mem::zeroed() };
        let _turn = apply_turn(&mut acc, &config.turn_servers)?;
        assert_eq!(acc.turn_cfg_use, bindings::PJSUA_TURN_CONFIG_USE_DEFAULT);
        assert_eq!(acc.turn_cfg.enable_turn, 0);
        Ok(())
    }

    #[test]
    // @verifies C111-inv + C112-inv
    // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
    fn apply_ice_default_reflects_section_13_defaults() {
        let ice = IceConfig::default();
        let mut media: bindings::pjsua_media_config = unsafe { std::mem::zeroed() };
        apply_ice(&mut media, &ice);
        assert_eq!(media.enable_ice, 1);
        assert_eq!(media.ice_max_host_cands, 16);
        assert_eq!(media.ice_opt.aggressive, 1);
    }

    #[test]
    // @verifies C113-inv
    // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
    fn wiring_accepts_unified_config_types() {
        // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
        fn assert_unified<T>() {}
        assert_unified::<StunServerConfig>();
        assert_unified::<TurnServerConfig>();
        assert_unified::<IceConfig>();
        let config = ClientConfig::default();
        let _stun: &Vec<StunServerConfig> = &config.stun_servers;
        let _turn: &Vec<TurnServerConfig> = &config.turn_servers;
        let _ice: &IceConfig = &config.ice;
    }

    #[test]
    // @verifies C113-pre
    // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
    fn client_config_exposes_unified_stun_turn_ice_fields() {
        let config = ClientConfig::default();
        assert!(config.stun_servers.is_empty());
        assert!(config.turn_servers.is_empty());
        assert!(config.ice.enabled);
    }
}
