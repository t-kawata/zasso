// Account-management helpers for the siprs example binaries.
//
// account_register and make_call include this module via `#[path]` to add an
// account through the public `SipClient::add_account` facade (RFC §41.2, P10-3)
// and resolve the authoritative handle for the subsequent register()/make_call()
// flow.

use siprs::{AccountConfig, SecretString, SipAccountHandle, SipClient};

use crate::cli::{self, CliArgs};

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
/// validates the config fail-fast and returns the authoritative handle.
pub async fn add_account_and_resolve(
    // [::TICKET::] P13-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-3 --for-spec --no-implementation-order`.
    client: &SipClient,
    args: &CliArgs,
) -> Result<SipAccountHandle, Box<dyn std::error::Error>> {
    let config = AccountConfig {
        username: required_field(args.username.as_deref(), "--username")?,
        domain: required_field(args.domain.as_deref(), "--domain")?,
        password: SecretString::new(required_field(args.password.as_deref(), "--password")?),
        ..AccountConfig::default()
    };
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
}
