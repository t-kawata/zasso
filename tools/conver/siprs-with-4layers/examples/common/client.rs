// Account-management helpers for the siprs example binaries.
//
// account_register and make_call include this module via `#[path]` to add an
// account through the public `SipClient::add_account` facade (RFC §41.2, P10-3)
// and resolve the authoritative handle for the subsequent register()/make_call()
// flow.

use std::time::Duration;

use siprs::{
    AccountCodecPolicy, AccountConfig, AccountMediaConfig, AccountTransportPolicy, DtmfMethod,
    DtmfPolicy, SecretString, SipAccountHandle, SipClient,
};

use crate::cli::{self, CliArgs};

/// Non-empty placeholder password for the unauthenticated local-Asterisk
/// example setups (§41.2 example value, §62.18).
const EXAMPLE_PASSWORD: &str = "example-secret";

/// SIP URI scheme prefix accepted by `for_sip_uri`.
const SIP_URI_PREFIX: &str = "sip:";

/// Registration expiry used by `for_sip_uri` (300 s, §62.18).
const EXAMPLE_REGISTRATION_EXPIRES: Duration = Duration::from_secs(300);

/// Ensure the flags required by a specific example are present.
///
/// Each example calls this with the flags it needs (e.g. account_register
/// requires --username/--domain/--password). The error names the first missing
/// flag and appends the shared usage template.
pub fn require(args: &CliArgs, required: &[&str]) -> Result<(), cli::CliError> {
    for flag in required {
        let present = match *flag {
            "--stun" => args.stun.is_some(),
            "--username" => args.username.is_some(),
            "--domain" => args.domain.is_some(),
            "--password" => args.password.is_some(),
            "--target" => args.target_uri.is_some(),
            "--call-id" => args.call_id.is_some(),
            "--gain" => args.gain.is_some(),
            other => {
                return Err(cli::CliError {
                    message: format!("unknown flag: {other}\n{}", cli::USAGE_TEMPLATE),
                });
            }
        };
        if !present {
            return Err(cli::CliError {
                message: format!("{flag} is required\n{}", cli::USAGE_TEMPLATE),
            });
        }
    }
    Ok(())
}

/// Add an account from the CLI arguments and resolve its `SipAccountHandle`.
///
/// Delegates to the public `SipClient::add_account` facade (RFC §41.2), which
/// validates the config fail-fast and returns the authoritative handle. The
/// config is built by `for_sip_uri` (§62.18) from the CLI's `sip:user@domain`
/// URI parts, then the CLI-provided password is applied on top of the
/// placeholder the URI helper uses for unauthenticated local Asterisk.
pub async fn add_account_and_resolve(
    // [::TICKET::] P13-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-3 --for-spec --no-implementation-order`.
    client: &SipClient,
    args: &CliArgs,
) -> Result<SipAccountHandle, Box<dyn std::error::Error>> {
    let username = required_field(args.username.as_deref(), "--username")?;
    let domain = required_field(args.domain.as_deref(), "--domain")?;
    let mut config = for_sip_uri(&format!("sip:{username}@{domain}"))?;
    config.password = SecretString::new(required_field(args.password.as_deref(), "--password")?);
    let account = client.add_account(config).await?;
    Ok(account)
}

/// Return the field value, or a CLI error naming the missing flag.
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn required_field(value: Option<&str>, flag: &str) -> Result<String, cli::CliError> {
    match value {
        Some(v) if !v.is_empty() => Ok(v.to_string()),
        _ => Err(cli::CliError {
            message: format!("{flag} is required\n{}", cli::USAGE_TEMPLATE),
        }),
    }
}

/// Build a minimal `AccountConfig` from a `sip:user@host` URI.
///
/// §62.18: derive `username`/`domain` from the URI and produce a configuration
/// that passes `AccountConfig::validate()` (§11.1). The RFC's `impl AccountConfig`
/// form cannot compile in an example crate (orphan rule E0116 — inherent impls on
/// foreign types are forbidden), so this is a free helper with identical behavior.
pub fn for_sip_uri(uri: &str) -> Result<AccountConfig, cli::CliError> {
    let (username, domain) = split_sip_uri(uri)?;
    Ok(AccountConfig {
        display_name: None,
        username,
        auth_username: None,
        password: SecretString::new(EXAMPLE_PASSWORD.to_string()),
        domain,
        registrar_uri: None,
        outbound_proxy: Vec::new(),
        contact_params: Vec::new(),
        transport: AccountTransportPolicy::Udp,
        register_on_start: false,
        allow_outbound_without_register: true,
        registration_expires: EXAMPLE_REGISTRATION_EXPIRES,
        codecs: AccountCodecPolicy::default(),
        dtmf: DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733, DtmfMethod::Info, DtmfMethod::Inband],
            receive_methods: vec![DtmfMethod::Rfc4733, DtmfMethod::Info, DtmfMethod::Inband],
            default_send_method: DtmfMethod::Rfc4733,
        },
        media: AccountMediaConfig::default(),
        auto_reject_timer: None,
        headers: Vec::new(),
    })
}

/// Split `sip:user@host` into its `(username, domain)` parts, rejecting input
/// that lacks the `sip:` prefix, the `@` separator, or either non-empty part.
// [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
fn split_sip_uri(uri: &str) -> Result<(String, String), cli::CliError> {
    let rest = uri
        .strip_prefix(SIP_URI_PREFIX)
        .ok_or_else(|| invalid_uri(uri))?;
    let (username, domain) = rest.split_once('@').ok_or_else(|| invalid_uri(uri))?;
    if username.is_empty() {
        return Err(invalid_uri(uri));
    }
    if domain.is_empty() {
        return Err(invalid_uri(uri));
    }
    Ok((username.to_string(), domain.to_string()))
}

/// Build the CLI error naming the expected URI form and appending the usage text.
// [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
fn invalid_uri(uri: &str) -> cli::CliError {
    cli::CliError {
        message: format!("expected sip:user@host, got {uri}\n{}", cli::USAGE_TEMPLATE),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn require_passes_when_all_flags_present() -> Result<(), cli::CliError> {
        let args = CliArgs {
            host: "sip.example.com".into(),
            username: Some("alice".into()),
            domain: Some("example.com".into()),
            password: Some("s3cret!".into()),
            ..CliArgs::default()
        };
        require(&args, &["--username", "--domain", "--password"])?;
        Ok(())
    }

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn require_reports_first_missing_flag() {
        let args = CliArgs {
            host: "sip.example.com".into(),
            username: Some("alice".into()),
            ..CliArgs::default()
        };
        let err = require(&args, &["--domain"]).unwrap_err();
        assert!(
            err.message.contains("--domain"),
            "must name the missing flag: {}",
            err.message
        );
        assert!(
            err.message.contains("Usage:"),
            "must include usage: {}",
            err.message
        );
    }

    #[test]
    // [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
    fn require_rejects_unknown_flag() {
        let args = CliArgs {
            host: "sip.example.com".into(),
            ..CliArgs::default()
        };
        let err = require(&args, &["--bogus"]).unwrap_err();
        assert!(
            err.message.contains("--bogus"),
            "must name the unknown flag: {}",
            err.message
        );
    }

    // ── for_sip_uri (§62.18: sip:user@host → AccountConfig) ──────────

    /// @verifies C115
    #[test]
    // [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
    fn for_sip_uri_builds_valid_config() -> Result<(), cli::CliError> {
        let config = for_sip_uri("sip:1001@asterisk.local")?;
        assert_eq!(config.username, "1001");
        assert_eq!(config.domain, "asterisk.local");
        assert!(
            !config.password.as_str().is_empty(),
            "§11.1: password must be non-empty"
        );
        assert_eq!(config.transport, AccountTransportPolicy::Udp);
        assert!(!config.register_on_start, "E2 calls register() explicitly");
        assert!(
            config.allow_outbound_without_register,
            "E3 places calls without registering"
        );
        assert_eq!(config.registration_expires, EXAMPLE_REGISTRATION_EXPIRES);
        assert!(
            config.validate().is_ok(),
            "§11.1: for_sip_uri output must validate"
        );
        Ok(())
    }

    /// @verifies C115
    #[test]
    // [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
    fn for_sip_uri_dtmf_carries_all_methods() -> Result<(), cli::CliError> {
        let config = for_sip_uri("sip:1001@asterisk.local")?;
        assert_eq!(
            config.dtmf.send_methods,
            vec![DtmfMethod::Rfc4733, DtmfMethod::Info, DtmfMethod::Inband],
            "§62.18 all-methods intent in the current DtmfPolicy shape"
        );
        assert_eq!(
            config.dtmf.receive_methods,
            vec![DtmfMethod::Rfc4733, DtmfMethod::Info, DtmfMethod::Inband]
        );
        assert_eq!(config.dtmf.default_send_method, DtmfMethod::Rfc4733);
        Ok(())
    }

    /// @verifies C115
    #[test]
    // [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
    fn for_sip_uri_rejects_missing_sip_prefix() {
        let err = for_sip_uri("1001@asterisk.local").unwrap_err();
        assert!(
            err.message.contains("expected sip:user@host"),
            "{}",
            err.message
        );
    }

    /// @verifies C115
    #[test]
    // [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
    fn for_sip_uri_rejects_missing_at_separator() {
        let err = for_sip_uri("sip:1001").unwrap_err();
        assert!(
            err.message.contains("expected sip:user@host"),
            "{}",
            err.message
        );
    }

    /// @verifies C115
    #[test]
    // [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
    fn for_sip_uri_rejects_empty_username() {
        let err = for_sip_uri("sip:@asterisk.local").unwrap_err();
        assert!(
            err.message.contains("expected sip:user@host"),
            "{}",
            err.message
        );
    }

    /// @verifies C115
    #[test]
    // [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
    fn for_sip_uri_rejects_empty_domain() {
        let err = for_sip_uri("sip:1001@").unwrap_err();
        assert!(
            err.message.contains("expected sip:user@host"),
            "{}",
            err.message
        );
    }

    /// @verifies C115
    #[test]
    // [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
    fn for_sip_uri_output_passes_section_11_1_validation() -> Result<(), cli::CliError> {
        let config = for_sip_uri("sip:alice@example.com")?;
        assert!(!config.username.trim().is_empty(), "username non-empty");
        assert!(!config.domain.trim().is_empty(), "domain non-empty");
        assert!(!config.password.as_str().is_empty(), "password non-empty");
        assert!(
            config.codecs.enable_pcmu || config.codecs.enable_opus,
            "≥1 codec (PCMU or Opus)"
        );
        assert!(!config.dtmf.send_methods.is_empty(), "≥1 DTMF send method");
        assert!(
            !config.dtmf.receive_methods.is_empty(),
            "≥1 DTMF receive method"
        );
        assert!(config.registration_expires.as_secs() > 0, "expiry > 0");
        Ok(())
    }
}
