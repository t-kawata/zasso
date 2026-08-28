// [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.

#![cfg(feature = "pjsua-native")]

//! §62.19 real-SIP integration tests against docker Asterisk/coturn (Q9/Q9a-c).
//!
//! The whole file is gated by `#![cfg(feature = "pjsua-native")]` (Q9a) and
//! every test starts with a `docker_available()` check (Q9c): without docker
//! the test prints `[SKIPPED: docker unavailable]` and returns early.
//! `make test-integration` brings the Asterisk/coturn services up, runs this
//! binary with `--features pjsua-native`, and tears them down (Q9b).

use siprs::model::CallId;
use siprs::model::SipMessageDirection;
use siprs::tests::docker_asterisk_it::docker_available;
use siprs::{
    AccountConfig, CallMediaPreferences, ClientConfig, HangupReason, IceConfig,
    OutgoingCallRequest, RegistrationState, SecretString, SipClient, SipEventPayload,
    StunServerConfig, TransportConfig, TurnServerConfig, TurnTransport,
};
use std::time::Duration;

/// Upper bound for any event-wait loop (mirrors `IT_EVENT_TIMEOUT` in the
/// policy module). Prevents the tests from hanging when a server is absent.
const EVENT_TIMEOUT: Duration = Duration::from_secs(30);

/// Build a registered `AccountConfig` for `sip:user@host`.
///
/// `for_sip_uri` is an examples-only helper (P16-9), so the integration test
/// constructs `AccountConfig` directly against the public fields.
// [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.
fn registered_account(
    uri: &str,
    password: &str,
) -> Result<AccountConfig, Box<dyn std::error::Error>> {
    let (username, domain) = split_sip_uri(uri)?;
    Ok(AccountConfig {
        display_name: Some(username.clone()),
        username,
        password: SecretString::new(password),
        domain,
        allow_outbound_without_register: true,
        ..AccountConfig::default()
    })
}

/// Split `sip:user@host` into `(user, host)`, rejecting malformed URIs.
// [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.
fn split_sip_uri(uri: &str) -> Result<(String, String), Box<dyn std::error::Error>> {
    let rest = uri
        .strip_prefix("sip:")
        .ok_or_else(|| format!("target URI must start with sip: {uri}"))?;
    let (username, domain) = rest
        .split_once('@')
        .ok_or_else(|| format!("target URI must contain '@': {uri}"))?;
    Ok((username.to_string(), domain.to_string()))
}

/// Wait for the first event whose payload satisfies `predicate`, returning the
/// matching payload. Fails the test (panics) after `EVENT_TIMEOUT` and skips
/// lagged events — the loop never hangs.
async fn wait_for_event(
    events: &mut tokio::sync::broadcast::Receiver<siprs::SipEvent>,
    predicate: impl Fn(&SipEventPayload) -> bool,
) -> SipEventPayload {
    let deadline = tokio::time::Instant::now() + EVENT_TIMEOUT;
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        let received = tokio::time::timeout(remaining, events.recv())
            .await
            .unwrap_or_else(|_| panic!("timed out waiting for event after {EVENT_TIMEOUT:?}"));
        match received {
            Ok(event) if predicate(&event.payload) => return event.payload,
            Ok(_) => continue,
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(e) => panic!("event channel closed: {e:?}"),
        }
    }
}

/// Wait for the first raw SIP message whose text satisfies `predicate`,
/// returning the matching message. Fails the test (panics) after
/// `EVENT_TIMEOUT` and skips lagged events — the loop never hangs.
// [::TICKET::] P19-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-1 --for-spec --no-implementation-order`.
async fn wait_for_raw_sip(
    raw: &mut siprs::Subscription<siprs::model::RawSipMessage>,
    predicate: impl Fn(&siprs::model::RawSipMessage) -> bool,
) -> siprs::model::RawSipMessage {
    let deadline = tokio::time::Instant::now() + EVENT_TIMEOUT;
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        let received = tokio::time::timeout(remaining, raw.recv())
            .await
            .unwrap_or_else(|_| panic!("timed out waiting for raw sip message after {EVENT_TIMEOUT:?}"));
        match received {
            Ok(msg) if predicate(&msg) => return msg,
            Ok(_) => continue,
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(e) => panic!("raw sip channel closed: {e:?}"),
        }
    }
}

/// A siprs client bound to an ephemeral UDP transport, registering to the
/// docker Asterisk published on `127.0.0.1:5060`.
async fn client_against_asterisk() -> Result<
    (SipClient, tokio::sync::broadcast::Receiver<siprs::SipEvent>),
    Box<dyn std::error::Error>,
> {
    let config = ClientConfig {
        // Port 0 asks the OS for a free ephemeral UDP port so the client never
        // collides with the docker-published Asterisk port 5060 on the host.
        transports: vec![TransportConfig::udp(0)],
        ..ClientConfig::default()
    };
    Ok(SipClient::new(config).await?)
}

/// Q9 + H5: siprs REGISTERs to Asterisk and reaches `Registered`.
#[tokio::test]
// @verifies C117-post
async fn register_against_asterisk() -> Result<(), Box<dyn std::error::Error>> {
    if !docker_available() {
        return Ok(());
    }
    let (client, mut events) = client_against_asterisk().await?;
    let account = client
        .add_account(registered_account("sip:1001@127.0.0.1:5060", "password")?)
        .await?;

    let payload = wait_for_event(&mut events, |p| {
        matches!(
            p,
            SipEventPayload::RegistrationStateChanged(RegistrationState::Registered)
        )
    })
    .await;
    assert!(matches!(
        payload,
        SipEventPayload::RegistrationStateChanged(RegistrationState::Registered)
    ));
    assert_eq!(
        account.registration_state().await?,
        RegistrationState::Registered
    );

    client.shutdown().await?;
    Ok(())
}

/// Q17 (§62.38): the real pjsua-native path delivers a real SIP message to
/// `subscribe_raw_sip()`. Asterisk's 401/200 responses to the client REGISTER
/// carry `CSeq: N REGISTER` and are captured by the observation-only
/// `pjsip_module` hook — TestBackend test-only hooks are never involved.
#[tokio::test]
// @verifies C145-post
// @verifies C146-post
// [::TICKET::] P19-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-1 --for-spec --no-implementation-order`.
async fn raw_sip_rx_reaches_subscriber() -> Result<(), Box<dyn std::error::Error>> {
    if !docker_available() {
        return Ok(());
    }
    let (client, mut events) = client_against_asterisk().await?;
    // Subscribe before registering so no raw message is missed.
    let mut raw = client
        .subscribe_raw_sip()
        .ok_or_else(|| "raw sip enabled but no raw channel was created")?;
    client
        .add_account(registered_account("sip:1001@127.0.0.1:5060", "password")?)
        .await?;
    wait_for_event(&mut events, |p| {
        matches!(
            p,
            SipEventPayload::RegistrationStateChanged(RegistrationState::Registered)
        )
    })
    .await;
    let msg = wait_for_raw_sip(&mut raw, |m| m.text().contains("REGISTER")).await;
    assert!(msg.text().contains("REGISTER"));
    assert_eq!(msg.direction, SipMessageDirection::Response);
    client.shutdown().await?;
    Ok(())
}

/// Q9 + §62.14: siprs places an outbound call to Asterisk, the echo application
/// answers, media connects, and hangup reaches `CallDisconnected`.
#[tokio::test]
// @verifies C117-post
async fn outgoing_call_to_asterisk() -> Result<(), Box<dyn std::error::Error>> {
    if !docker_available() {
        return Ok(());
    }
    let (client, mut events) = client_against_asterisk().await?;
    let account = client
        .add_account(registered_account("sip:1001@127.0.0.1:5060", "password")?)
        .await?;
    wait_for_event(&mut events, |p| {
        matches!(
            p,
            SipEventPayload::RegistrationStateChanged(RegistrationState::Registered)
        )
    })
    .await;

    let raw_call_id = account
        .make_call(OutgoingCallRequest {
            target_uri: "sip:1001@127.0.0.1:5060".into(),
            headers: Vec::new(),
            auth_override: None,
            preferred_transport: None,
            media: CallMediaPreferences::default(),
            auto_answer_refer: false,
        })
        .await?;
    let call_id = CallId::from_u64(raw_call_id)?;

    let connected = wait_for_event(&mut events, |p| {
        matches!(p, SipEventPayload::CallConnected(_))
    })
    .await;
    assert!(matches!(connected, SipEventPayload::CallConnected(_)));

    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    // PX-3 / C119-post: with register_conf_callback now wiring the per-call
    // RustMediaPort into the PJSIP conf bridge at boot, an established call must
    // reach MediaActive — media actually flowing through the conference bridge.
    let media = wait_for_event(&mut events, |p| {
        matches!(p, SipEventPayload::MediaActive(_))
    })
    .await;
    assert!(
        matches!(media, SipEventPayload::MediaActive(_)),
        "media must flow through the conf bridge after the RustMediaPort registration"
    );

    client.hangup(call_id, HangupReason::LocalUser).await?;
    wait_for_event(&mut events, |p| {
        matches!(p, SipEventPayload::CallDisconnected)
    })
    .await;

    client.shutdown().await?;
    Ok(())
}

/// Q4 + Q9: Asterisk originates an inbound call via `channel originate`, siprs
/// receives `IncomingCall`, answers with 200, and the call connects.
#[tokio::test]
// @verifies C117-post
async fn incoming_call_via_originate() -> Result<(), Box<dyn std::error::Error>> {
    if !docker_available() {
        return Ok(());
    }
    let (client, mut events) = client_against_asterisk().await?;
    // The account handle is not needed — registration is a side effect that
    // registers sip:1002 with Asterisk before the inbound call is originated.
    client
        .add_account(registered_account("sip:1002@127.0.0.1:5060", "password")?)
        .await?;
    wait_for_event(&mut events, |p| {
        matches!(
            p,
            SipEventPayload::RegistrationStateChanged(RegistrationState::Registered)
        )
    })
    .await;

    originate_call_to("PJSIP/1002").await?;

    let incoming = wait_for_event(&mut events, |p| {
        matches!(p, SipEventPayload::IncomingCall(_))
    })
    .await;
    let SipEventPayload::IncomingCall(call) = incoming else {
        panic!("expected IncomingCall");
    };
    client.answer(call.call_id, 200).await?;
    wait_for_event(&mut events, |p| {
        matches!(p, SipEventPayload::CallConnected(_))
    })
    .await;

    client.shutdown().await?;
    Ok(())
}

/// Originate an inbound call from the docker Asterisk CLI to a registered
/// endpoint, running the echo application when the call is answered.
async fn originate_call_to(endpoint: &str) -> Result<(), Box<dyn std::error::Error>> {
    let status = tokio::process::Command::new("docker")
        .args([
            "compose",
            "exec",
            "-T",
            "asterisk",
            "asterisk",
            "-rx",
            &format!("channel originate {endpoint} application echo"),
        ])
        .status()
        .await?;
    assert!(status.success(), "channel originate returned {status:?}");
    Ok(())
}

/// Q7a (deferred from P16-8): coturn provides STUN/TURN/ICE at the protocol
/// level. With STUN/TURN configured, a connecting call proves STUN binding,
/// TURN allocate, and relay-candidate media selection succeeded.
#[tokio::test]
// @verifies C117-post
async fn coturn_stun_turn_ice() -> Result<(), Box<dyn std::error::Error>> {
    if !docker_available() {
        return Ok(());
    }
    let config = ClientConfig {
        transports: vec![TransportConfig::udp(0)],
        stun_servers: vec![StunServerConfig {
            uri: "stun:127.0.0.1:3478".into(),
        }],
        turn_servers: vec![TurnServerConfig {
            uri: "turn:127.0.0.1:3478".into(),
            username: Some("testuser".into()),
            password: Some(SecretString::new("testpass")),
            transport: TurnTransport::Udp,
        }],
        ice: IceConfig {
            enabled: true,
            ..IceConfig::default()
        },
        ..ClientConfig::default()
    };
    let (client, mut events) = SipClient::new(config).await?;
    let account = client
        .add_account(registered_account("sip:1001@127.0.0.1:5060", "password")?)
        .await?;
    wait_for_event(&mut events, |p| {
        matches!(
            p,
            SipEventPayload::RegistrationStateChanged(RegistrationState::Registered)
        )
    })
    .await;

    let raw_call_id = account
        .make_call(OutgoingCallRequest {
            target_uri: "sip:1001@127.0.0.1:5060".into(),
            headers: Vec::new(),
            auth_override: None,
            preferred_transport: None,
            media: CallMediaPreferences::default(),
            auto_answer_refer: false,
        })
        .await?;
    let _call_id = CallId::from_u64(raw_call_id)?;

    let connected = wait_for_event(&mut events, |p| {
        matches!(p, SipEventPayload::CallConnected(_))
    })
    .await;
    assert!(matches!(connected, SipEventPayload::CallConnected(_)));
    let media = wait_for_event(&mut events, |p| {
        matches!(p, SipEventPayload::MediaActive(_))
    })
    .await;
    assert!(matches!(media, SipEventPayload::MediaActive(_)));

    client.shutdown().await?;
    Ok(())
}
