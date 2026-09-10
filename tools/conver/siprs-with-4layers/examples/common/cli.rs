// Shared CLI argument parsing and client-config construction for the siprs
// example binaries.
//
// All five examples (client_init, account_register, make_call, audio_tap,
// tts_source) include this module via `#[path]`, so they share one `--flag
// value` convention, one usage message, and one client-configuration helper
// (CLI determinism invariant). No example re-implements argument parsing.

use std::fmt;

use siprs::{ClientConfig, StunServerConfig};

/// The shared usage message printed when arguments are missing or invalid.
pub const USAGE_TEMPLATE: &str =
    "Usage: <example> --host <host> [--port <port>] [--stun <uri>] [--username <user>] \
     [--domain <domain>] [--password <pass>] [--target <sip:uri>] [--call-id <id>] [--gain <f32>]";

/// Default SIP port when `--port` is omitted.
pub const DEFAULT_SIP_PORT: u16 = 5060;

/// Minimum accepted SIP port (matches config::MIN_SIP_PORT).
pub const MIN_SIP_PORT: u16 = 1;

/// Maximum accepted SIP port (matches config::MAX_SIP_PORT).
pub const MAX_SIP_PORT: u16 = 65535;

/// Parsed and validated command-line arguments shared by all examples.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct CliArgs {
    /// SIP proxy host — required and validated non-empty by `parse`.
    pub host: String,
    /// SIP proxy port — defaults to 5060, range [1, 65535].
    pub port: u16,
    /// Optional STUN server URI (e.g. "stun:stun.l.google.com:19302").
    pub stun: Option<String>,
    /// Account username (account_register).
    pub username: Option<String>,
    /// Account domain (account_register).
    pub domain: Option<String>,
    /// Account password (account_register).
    pub password: Option<String>,
    /// Target SIP URI for an outgoing call (make_call).
    pub target_uri: Option<String>,
    /// Call id for audio operations (audio_tap, tts_source).
    pub call_id: Option<u64>,
    /// Audio source gain in [0.0, 2.0] (tts_source).
    pub gain: Option<f32>,
}

/// An argument-parsing or validation failure carrying a user-facing message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliError {
    /// Human-readable error message including the shared usage template.
    pub message: String,
}

// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
impl fmt::Display for CliError {
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
impl std::error::Error for CliError {}

/// Parse `--flag value` pairs into a validated `CliArgs`.
///
/// Rejects unknown flags, missing values, empty string values, out-of-range
/// ports, and non-numeric values before any network I/O. The returned value
/// always carries a non-empty `host`, so examples can build a `ClientConfig`
/// without re-checking it.
pub fn parse<S: Into<String>>(args: impl IntoIterator<Item = S>) -> Result<CliArgs, CliError> {
    let mut cli = CliArgs {
        port: DEFAULT_SIP_PORT,
        ..CliArgs::default()
    };
    let mut iter = args.into_iter();
    while let Some(flag) = iter.next() {
        let flag = flag.into();
        let value = iter
            .next()
            .map(Into::into)
            .ok_or_else(|| missing_value_error(&flag))?;
        if value.is_empty() {
            return Err(empty_value_error(&flag));
        }
        match flag.as_str() {
            "--host" => cli.host = value,
            "--port" => cli.port = parse_port(&value)?,
            "--stun" => cli.stun = Some(value),
            "--username" => cli.username = Some(value),
            "--domain" => cli.domain = Some(value),
            "--password" => cli.password = Some(value),
            "--target" => cli.target_uri = Some(value),
            "--call-id" => cli.call_id = Some(parse_u64_flag("--call-id", &value)?),
            "--gain" => cli.gain = Some(parse_f32_flag("--gain", &value)?),
            other => return Err(unknown_flag_error(other)),
        }
    }
    require_host(&cli)?;
    Ok(cli)
}

/// Build a `ClientConfig` from the shared CLI arguments.
///
/// `--stun` is forwarded to `stun_servers` (RFC §13). The legacy
/// `--host`/`--port` SIP-proxy fields have no RFC §10 `ClientConfig`
/// equivalent — the SIP proxy is configured per-account via `AccountConfig` —
/// so the remaining fields use the RFC defaults (which pass §42 validation).
pub fn build_client_config(args: &CliArgs) -> ClientConfig {
    let mut config = ClientConfig::default();
    if let Some(uri) = &args.stun {
        config
            .stun_servers
            .push(StunServerConfig { uri: uri.clone() });
    }
    config
}

/// Reject an empty `--host` before any network I/O.
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn require_host(cli: &CliArgs) -> Result<(), CliError> {
    if cli.host.trim().is_empty() {
        Err(missing_flag_error("--host"))
    } else {
        Ok(())
    }
}

/// Parse a SIP port, enforcing the range [1, 65535].
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn parse_port(value: &str) -> Result<u16, CliError> {
    let port: u16 = value
        .parse()
        .map_err(|_| CliError {
            message: format!("--port must be an integer in [{MIN_SIP_PORT}, {MAX_SIP_PORT}]: {value}\n{USAGE_TEMPLATE}"),
        })?;
    if port < MIN_SIP_PORT {
        return Err(CliError {
            message: format!("--port must be in the range [{MIN_SIP_PORT}, {MAX_SIP_PORT}]: {port}\n{USAGE_TEMPLATE}"),
        });
    }
    Ok(port)
}

/// Parse an integer flag value.
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn parse_u64_flag(flag: &str, value: &str) -> Result<u64, CliError> {
    value.parse().map_err(|_| CliError {
        message: format!("{flag} must be an integer: {value}\n{USAGE_TEMPLATE}"),
    })
}

/// Parse a float flag value.
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn parse_f32_flag(flag: &str, value: &str) -> Result<f32, CliError> {
    value.parse().map_err(|_| CliError {
        message: format!("{flag} must be a number: {value}\n{USAGE_TEMPLATE}"),
    })
}

// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn missing_value_error(flag: &str) -> CliError {
    CliError {
        message: format!("missing value for {flag}\n{USAGE_TEMPLATE}"),
    }
}

// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn empty_value_error(flag: &str) -> CliError {
    CliError {
        message: format!("{flag} must not be empty\n{USAGE_TEMPLATE}"),
    }
}

// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn unknown_flag_error(flag: &str) -> CliError {
    CliError {
        message: format!("unknown flag: {flag}\n{USAGE_TEMPLATE}"),
    }
}

// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn missing_flag_error(flag: &str) -> CliError {
    CliError {
        message: format!("{flag} is required\n{USAGE_TEMPLATE}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal ──────────────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn cli_parser_accepts_documented_flags() -> Result<(), CliError> {
        let args = [
            "--host",
            "sip.example.com",
            "--port",
            "5060",
            "--username",
            "alice",
            "--domain",
            "example.com",
            "--password",
            "s3cret!",
            "--target",
            "sip:bob@example.com",
            "--call-id",
            "7",
            "--gain",
            "0.6",
            "--stun",
            "stun:stun.l.google.com:19302",
        ];
        let cli = parse(args)?;
        assert_eq!(cli.host, "sip.example.com");
        assert_eq!(cli.port, 5060);
        assert_eq!(cli.username.as_deref(), Some("alice"));
        assert_eq!(cli.domain.as_deref(), Some("example.com"));
        assert_eq!(cli.target_uri.as_deref(), Some("sip:bob@example.com"));
        assert_eq!(cli.call_id, Some(7));
        assert_eq!(cli.gain, Some(0.6));
        assert_eq!(cli.stun.as_deref(), Some("stun:stun.l.google.com:19302"));
        Ok(())
    }

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn cli_parser_defaults_port_to_5060() -> Result<(), CliError> {
        let cli = parse(["--host", "sip.example.com"])?;
        assert_eq!(cli.host, "sip.example.com");
        assert_eq!(cli.port, DEFAULT_SIP_PORT);
        assert_eq!(cli.stun, None);
        Ok(())
    }

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    // [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
    fn build_client_config_maps_stun_to_stun_servers() {
        let cli = CliArgs {
            host: "sip.example.com".into(),
            port: 5060,
            stun: Some("stun:stun.l.google.com:19302".into()),
            ..CliArgs::default()
        };
        let config = build_client_config(&cli);
        assert_eq!(
            config.stun_servers.len(),
            1,
            "RFC §13 stun_servers must carry the --stun URI"
        );
        assert_eq!(config.stun_servers[0].uri, "stun:stun.l.google.com:19302");
        assert!(
            config.validate().is_ok(),
            "RFC §10 ClientConfig built from CLI args must pass §42 validation"
        );
    }

    // ── Error ───────────────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn cli_parser_rejects_missing_host() {
        let err = parse(std::iter::empty::<String>()).unwrap_err();
        assert!(
            err.message.contains("Usage:"),
            "must include usage: {}",
            err.message
        );
        assert!(
            err.message.contains("--host"),
            "must name --host: {}",
            err.message
        );
    }

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn cli_parser_rejects_unknown_flag() {
        let err = parse(["--host", "h", "--bogus", "x"]).unwrap_err();
        assert!(
            err.message.contains("--bogus"),
            "must name the unknown flag: {}",
            err.message
        );
    }

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn cli_parser_rejects_missing_value() {
        let err = parse(["--host"]).unwrap_err();
        assert!(
            err.message.contains("Usage:"),
            "must include usage: {}",
            err.message
        );
    }

    // ── Boundary ────────────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn cli_parser_rejects_empty_values() {
        for flag in ["--host", "--target", "--username"] {
            let err = parse([flag, ""]).unwrap_err();
            assert!(
                err.message.contains(flag),
                "must name the empty field: {}",
                err.message
            );
        }
    }

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn cli_parser_port_range() {
        assert!(parse(["--host", "h", "--port", "0"]).is_err());
        assert!(parse(["--host", "h", "--port", "65536"]).is_err());
        assert!(parse(["--host", "h", "--port", "1"]).is_ok());
        assert!(parse(["--host", "h", "--port", "65535"]).is_ok());
    }

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn cli_parser_rejects_non_numeric_port() {
        let err = parse(["--host", "h", "--port", "abc"]).unwrap_err();
        assert!(
            err.message.contains("--port"),
            "must name --port: {}",
            err.message
        );
    }
}
