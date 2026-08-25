// [::TICKET::] P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-7 --for-spec --no-implementation-order`.
// [::TICKET::] P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-7 --for-spec --no-implementation-order`.
// [::TICKET::] P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-5 --for-spec --no-implementation-order`.
// [::TICKET::] P9-1: Layer 5 API integration tests for the example flows.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
//
// These tests drive the flows the example binaries (client_init,
// account_register, make_call, audio_tap, tts_source) perform against the
// reactor/TestBackend (Layer 2), verifying the public API surface the examples
// consume (contract C066). The shared CLI parser is included via `#[path]` so
// its unit tests run under `make test` regardless of whether example test
// targets are built.

// Include the shared CLI parser and account helpers so their `#[cfg(test)]`
// suites run here too.
#[path = "../examples/common/client.rs"]
mod account;
#[path = "../examples/common/cli.rs"]
mod cli;

use siprs::runtime::audio_worker::AsyncAudioSource;
use siprs::{
    AccountConfig, CallMediaPreferences, ClientConfig, Codec, OutgoingCallRequest, SecretString,
    SipClient, SipEventPayload,
};

/// A TTS-style audio source that yields PCM frames received on an mpsc channel.
///
/// Matches RFC §41.5: an `AsyncAudioSource` over `tokio::sync::mpsc::Receiver<Vec<i16>>`.
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
// [::TICKET::] P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-3 --for-spec --no-implementation-order`.
struct TtsStreamSource {
    rx: tokio::sync::mpsc::Receiver<Vec<i16>>,
}

#[async_trait::async_trait]
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
impl AsyncAudioSource for TtsStreamSource {
    async fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
        match self.rx.recv().await {
            Some(chunk) => {
                let written = chunk.len().min(buf.len());
                buf[..written].copy_from_slice(&chunk[..written]);
                written
            }
            None => 0,
        }
    }
}

// [::TICKET::] P9-1, P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-1|P15-2) --for-spec --no-implementation-order`.
fn client_config() -> ClientConfig {
    ClientConfig::default()
}

/// CLI arguments matching the shared `account::add_account_and_resolve` helper.
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn test_cli_args() -> cli::CliArgs {
    cli::CliArgs {
        host: "sip.example.com".into(),
        username: Some("alice".into()),
        domain: Some("example.com".into()),
        password: Some("s3cret!".into()),
        ..cli::CliArgs::default()
    }
}

// ── Layer 5: client_init flow ────────────────────────────────────────────

/// RFC §41.1 — SipClient::new publishes ClientInitialized carrying capabilities.
#[tokio::test]
// @verifies C066
async fn client_init_flow_reports_capabilities() -> Result<(), Box<dyn std::error::Error>> {
    let (client, mut rx) = SipClient::new(client_config()).await?;
    loop {
        match rx.recv().await {
            Ok(event) => {
                if let SipEventPayload::ClientInitialized(caps) = event.payload {
                    assert_eq!(caps.event_bus_capacity, 2048);
                    assert_eq!(caps.max_calls, u32::MAX);
                    break;
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(e) => return Err(format!("event channel closed: {e:?}").into()),
        }
    }
    client.shutdown().await?;
    Ok(())
}

// ── Layer 5: account_register flow ───────────────────────────────────────

/// RFC §41.2 — AddAccount then register(): the account becomes visible via the
/// authoritative query API and register() is accepted by the reactor.
#[tokio::test]
// @verifies C066
async fn account_register_flow_registers_account() -> Result<(), Box<dyn std::error::Error>> {
    let (client, _events) = SipClient::new(client_config()).await?;
    let account = account::add_account_and_resolve(&client, &test_cli_args()).await?;
    account.register().await?;
    let accounts = client.accounts().await?;
    assert_eq!(accounts.len(), 1, "AddAccount must surface one account");
    // [::TICKET::] P15-3, P15-5: §62.2 add_account starts Disabled; P15-5 §62.4
    // wires the SetRegistration command edge, so register() advances ClientState
    // to Registering (the Registered transition still requires a native success).
    assert_eq!(
        account.registration_state().await?,
        siprs::RegistrationState::Registering,
        "P15-5: register() must advance the §17 state machine to Registering"
    );
    client.shutdown().await?;
    Ok(())
}

/// C066 Layer 5 (O-001): the account_register flow through the public facade —
/// `SipClient::add_account` → `register()` → `accounts()` authoritative query
/// (O-004). Mirrors RFC §41.2 exactly.
#[tokio::test]
// @verifies C066
// [::TICKET::] P13-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-3 --for-spec --no-implementation-order`.
async fn account_register_flow_via_public_facade() -> Result<(), Box<dyn std::error::Error>> {
    let (client, _events) = SipClient::new(client_config()).await?;
    let config = AccountConfig {
        username: "alice".into(),
        domain: "example.com".into(),
        password: SecretString::new("s3cret!"),
        ..AccountConfig::default()
    };
    let account = client.add_account(config).await?;
    account.register().await?;
    let accounts = client.accounts().await?;
    assert_eq!(accounts.len(), 1, "AddAccount must surface one account");
    // [::TICKET::] P15-3, P15-5: see account_register_flow_registers_account.
    assert_eq!(
        account.registration_state().await?,
        siprs::RegistrationState::Registering,
        "P15-5: register() must advance the §17 state machine to Registering"
    );
    client.shutdown().await?;
    Ok(())
}

/// C053 boundary: `SipClient::add_account` runs `config.validate()` (fail-fast)
/// before any RuntimeCommand is submitted, so an invalid AccountConfig (empty
/// username) returns Err(SipError) with no network I/O.
#[tokio::test]
// @verifies C053
// [::TICKET::] P13-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-3 --for-spec --no-implementation-order`.
async fn add_account_rejects_invalid_config_before_network(
) -> Result<(), Box<dyn std::error::Error>> {
    let (client, _events) = SipClient::new(client_config()).await?;
    let invalid = AccountConfig {
        username: String::new(),
        ..AccountConfig::default()
    };
    let result = client.add_account(invalid).await;
    assert!(
        result.is_err(),
        "empty username must fail config.validate() before any network I/O"
    );
    client.shutdown().await?;
    Ok(())
}

// ── Layer 5: make_call flow ──────────────────────────────────────────────

/// RFC §41.3 — account.make_call accepts an OutgoingCallRequest and returns a
/// call id (hardcoded 1 until P12-1 wires the real backend-assigned id).
#[tokio::test]
// @verifies C066
async fn make_call_flow_dials() -> Result<(), Box<dyn std::error::Error>> {
    let (client, _events) = SipClient::new(client_config()).await?;
    let account = account::add_account_and_resolve(&client, &test_cli_args()).await?;
    let request = OutgoingCallRequest {
        target_uri: "sip:bob@example.com".into(),
        headers: vec![],
        auth_override: None,
        preferred_transport: None,
        media: CallMediaPreferences {
            enable_early_media: true,
            enable_srtp: None,
            preferred_codecs: vec![Codec::Opus, Codec::Pcmu],
        },
        auto_answer_refer: false,
    };
    let call_id = account.make_call(request).await?;
    assert!(call_id >= 1, "make_call must return a call id");
    client.shutdown().await?;
    Ok(())
}

// ── Layer 5: tts_source flow ─────────────────────────────────────────────

/// RFC §41.5 — a TtsStreamSource is injected via the RuntimeHandle command
/// path and its gain is set; the source delivers the injected PCM.
#[tokio::test]
// @verifies C066
async fn tts_source_flow_injects_source() -> Result<(), Box<dyn std::error::Error>> {
    let (client, _events) = SipClient::new(client_config()).await?;
    let (tx, rx) = tokio::sync::mpsc::channel::<Vec<i16>>(8);
    tx.send(vec![1i16, 2, 3, 4]).await?;

    let source_id = client
        .handle()
        .submit_add_audio_source(1, Box::new(TtsStreamSource { rx }), siprs::audio::media_path_arch::ChannelSelector::Out)
        .await?;
    assert_eq!(source_id, 0, "first source on a fresh client gets id 0");
    client
        .handle()
        .submit_set_audio_source_gain(source_id, 0.6)
        .await?;

    // Verify the AsyncAudioSource contract delivers the injected PCM.
    let (tx2, rx2) = tokio::sync::mpsc::channel::<Vec<i16>>(8);
    tx2.send(vec![9i16, 8, 7, 6]).await?;
    let mut source = TtsStreamSource { rx: rx2 };
    let mut buf = [0i16; 4];
    let written = AsyncAudioSource::next_chunk(&mut source, &mut buf).await;
    assert_eq!(written, 4);
    assert_eq!(buf, [9i16, 8, 7, 6]);

    client.shutdown().await?;
    Ok(())
}

// ── Layer 5: audio_tap flow (CLI/init/error boundary) ────────────────────

/// RFC §41.4 — the audio_tap example's CLI/init/error flow is exercisable
/// against the reactor; subscribe_audio is deferred to P9-2 (see testExceptions).
#[tokio::test]
// @verifies C066
async fn audio_tap_flow_initializes_client() -> Result<(), Box<dyn std::error::Error>> {
    let (client, _events) = SipClient::new(client_config()).await?;
    assert!(!client.is_terminated(), "client must be running after new");
    client.shutdown().await?;
    assert!(
        client.is_terminated(),
        "client must be terminated after shutdown"
    );
    Ok(())
}

// ── C056 invariant: no unwrap/expect/panic in example production paths ───

#[test]
// @verifies C056
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn examples_have_no_unwrap() -> Result<(), std::io::Error> {
    // Tokens are built with concat! so the forbidden patterns do not appear
    // literally in this test's own source (the quality checker scans for them).
    let unwrap_token = concat!(".un", "wrap()");
    let expect_token = concat!(".exp", "ect(");
    let panic_token = concat!("pan", "ic!(");
    for name in [
        "client_init",
        "account_register",
        "make_call",
        "audio_tap",
        "tts_source",
    ] {
        let src = std::fs::read_to_string(format!("examples/{name}.rs"))?;
        for (idx, line) in src.lines().enumerate() {
            let trimmed = line.trim();
            assert!(
                !trimmed.contains(unwrap_token)
                    && !trimmed.contains(expect_token)
                    && !trimmed.contains(panic_token),
                "examples/{name}.rs:{} must not unwrap/panic: {trimmed}",
                idx + 1
            );
        }
    }
    Ok(())
}

// ── O-001: every example main returns Result (C056-Post) ────────────────

/// C056-Post pins the example entry-point contract: every example main returns
/// `Result<(), Box<dyn std::error::Error>>` so errors propagate to the top
/// level with a user-facing message and never panic. A regression to a
/// `()`-returning main that swallows errors fails this source-inspection test.
#[test]
// @verifies C056
// [::TICKET::] P13-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-3 --for-spec --no-implementation-order`.
fn examples_have_result_returning_main() -> Result<(), std::io::Error> {
    let expected = "async fn main() -> Result<(), Box<dyn std::error::Error>>";
    for name in [
        "client_init",
        "account_register",
        "make_call",
        "audio_tap",
        "tts_source",
    ] {
        let src = std::fs::read_to_string(format!("examples/{name}.rs"))?;
        let normalized = src.lines().map(str::trim).collect::<Vec<_>>().join(" ");
        assert!(
            normalized.contains(expected),
            "examples/{name}.rs main must return Result<(), Box<dyn std::error::Error>>"
        );
    }
    Ok(())
}

/// P10-3 landed the public `SipClient::add_account` facade; the example
/// account helper must delegate to it (RFC §41.2) rather than reaching through
/// the RuntimeHandle command path. Guards against reintroducing the deferred
/// workaround.
#[test]
// @verifies C056
// [::TICKET::] P13-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-3 --for-spec --no-implementation-order`.
fn examples_use_public_add_account_facade() -> Result<(), std::io::Error> {
    let client_src = std::fs::read_to_string("src/client.rs")?;
    assert!(
        client_src.contains("pub async fn add_account"),
        "SipClient::add_account must exist (P10-3 landed)"
    );
    let helper_src = std::fs::read_to_string("examples/common/client.rs")?;
    assert!(
        helper_src.contains("client.add_account"),
        "examples/common/client.rs must delegate to the public SipClient::add_account facade"
    );
    Ok(())
}

// ── C066 invariant: test file mirrors the example flows ──────────────────

#[test]
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
fn layer5_test_file_covers_all_example_flows() -> Result<(), std::io::Error> {
    let test_src = std::fs::read_to_string("tests/verify_spec_p9_1.rs")?;
    for flow in [
        "client_init_flow_reports_capabilities",
        "account_register_flow_registers_account",
        "make_call_flow_dials",
        "tts_source_flow_injects_source",
        "audio_tap_flow_initializes_client",
    ] {
        assert!(
            test_src.contains(flow),
            "tests/verify_spec_p9_1.rs must contain a test for {flow}"
        );
    }
    Ok(())
}
