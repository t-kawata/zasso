// [::TICKET::] P12-10: Layer 5 TestApp harness.
//
// Builds an axum Router backed by `siprs::runtime::backend::MockBackend`
// (P1-3, N0053) so the REST and WebSocket Layer 5 tests run PJSIP-free and
// deterministically. The Router registers the `siprs::api::http_ws_protocol`
// PATH_* constants with thin test handlers, and exposes REST helpers driven
// through `tower::ServiceExt::oneshot` plus a `spawn()` helper that serves
// the Router on an ephemeral listener for WebSocket tests.
//
// The production handlers in siprs-server/src are P4-3 STUBs; this harness
// deliberately does not depend on them.
//
// Each integration-test binary (tests/api/*, tests/ws/*) compiles this module
// and uses only a subset of the harness API, so dead_code fires per-binary.
// Every item below is exercised by at least one test binary; the allow is a
// structural necessity of the shared-harness pattern, not an incomplete item.
#![allow(dead_code)]

use std::net::SocketAddr;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use siprs::api::http_ws_protocol::{
    AudioFrameHeader, SequenceGenerator, WsBinaryFrame, WsTextFrame, PATH_ACCOUNTS,
    PATH_AUTH_TOKEN, PATH_HEALTH, PATH_WS, PATH_WS_AUDIO,
};
use siprs::api::standalone_server_config::{AuthConfig, AuthMode};
use siprs::config::account_config_spec::AccountConfig;
use siprs::runtime::backend::{MockBackend, SipBackend};
use siprs::security::auth_jwt_middleware::{Claims, JwtValidator};
use siprs::security::SecretString;
use tokio::sync::Mutex;
use tower::ServiceExt;

/// Shared state for the Layer 5 test router.
#[derive(Clone)]
pub struct AppState {
    /// MockBackend is the single source of truth for account list/create.
    pub backend: Arc<Mutex<MockBackend>>,
    /// Auth-mode switch exercised by `authorize` (C064 invariant).
    pub auth_config: AuthConfig,
    /// JWT signer/validator for the JWT auth mode.
    pub validator: JwtValidator,
    /// Shared monotonic sequence domain for event and audio frames (C063).
    pub generator: Arc<SequenceGenerator>,
}

/// Axum test application backed by MockBackend.
///
/// REST requests are driven through `tower::ServiceExt::oneshot`;
/// WebSocket tests call `spawn()` and connect via tokio-tungstenite.
#[derive(Clone)]
pub struct TestApp {
    pub router: Router,
    pub state: AppState,
}

impl TestApp {
    /// Build a TestApp in the default LocalhostOnly auth mode.
    pub fn new() -> Self {
        Self::with_auth(AuthConfig::default())
    }

    /// Build a TestApp with an explicit auth configuration.
    pub fn with_auth(auth_config: AuthConfig) -> Self {
        let backend = Arc::new(Mutex::new(MockBackend::new()));
        let secret = auth_config
            .jwt_secret
            .as_ref()
            .map(|value| value.as_str().to_string())
            .unwrap_or_default();
        let validator = JwtValidator::new(secret);
        let generator = Arc::new(SequenceGenerator::new());
        let state = AppState {
            backend,
            auth_config,
            validator,
            generator,
        };
        let router = build_test_router(state.clone());
        TestApp { router, state }
    }

    /// Build a TestApp in JWT mode with the given signing secret.
    pub fn with_jwt(secret: &str) -> Self {
        let auth_config = AuthConfig {
            mode: AuthMode::Jwt,
            jwt_secret: Some(SecretString::new(secret.to_string())),
            ..Default::default()
        };
        Self::with_auth(auth_config)
    }

    /// GET a path through the router.
    pub async fn get(&self, path: &str) -> Response {
        let request = Request::builder()
            .uri(path)
            .body(Body::empty())
            .expect("valid GET request");
        // Router's service error type is `Infallible` — exhaustively matching
        // the empty enum avoids a panic on an impossible failure.
        match self.router.clone().oneshot(request).await {
            Ok(response) => response,
            Err(never) => match never {},
        }
    }

    /// GET a path with a Bearer token.
    pub async fn get_auth(&self, path: &str, token: &str) -> Response {
        let request = Request::builder()
            .uri(path)
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .body(Body::empty())
            .expect("valid GET request");
        match self.router.clone().oneshot(request).await {
            Ok(response) => response,
            Err(never) => match never {},
        }
    }

    /// POST JSON to a path through the router.
    pub async fn post_json(&self, path: &str, body: Value) -> Response {
        let request = Request::builder()
            .method("POST")
            .uri(path)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(serde_json::to_vec(&body).expect("JSON body")))
            .expect("valid POST request");
        match self.router.clone().oneshot(request).await {
            Ok(response) => response,
            Err(never) => match never {},
        }
    }

    /// Seed a MockBackend account; returns its native id.
    pub async fn seed_account(&self, username: &str, domain: &str, password: &str) -> i32 {
        let config = test_account_config(username, domain, password);
        let mut backend = self.state.backend.lock().await;
        let (id, _entry) = backend
            .add_account(&config)
            .expect("MockBackend adds account");
        id
    }

    /// Serve the Router on an ephemeral listener and yield its socket address.
    pub async fn spawn(&self) -> SocketAddr {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind ephemeral listener");
        let addr = listener.local_addr().expect("listener address");
        let router = self.router.clone();
        tokio::spawn(async move {
            axum::serve(listener, router).await.expect("axum serve");
        });
        addr
    }
}

impl Default for TestApp {
    fn default() -> Self {
        Self::new()
    }
}

/// Build the Layer 5 test router with MockBackend-backed handlers.
///
/// Public routes (health, token issuance) bypass auth; the remaining routes
/// are protected by the `require_auth` middleware.
fn build_test_router(state: AppState) -> Router {
    let public_routes = Router::new()
        .route(PATH_HEALTH, get(health_check))
        .route(PATH_AUTH_TOKEN, post(issue_token));

    let protected_routes = Router::new()
        .route(PATH_ACCOUNTS, get(list_accounts).post(add_account))
        .route(PATH_WS, get(ws_handler))
        .route(PATH_WS_AUDIO, get(ws_audio_handler))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            require_auth,
        ));

    public_routes.merge(protected_routes).with_state(state)
}

/// C064 auth predicate — the testable form of the LocalhostOnly/JWT switch.
pub fn authorize(
    peer_ip: &str,
    bearer: Option<&str>,
    auth: &AuthConfig,
    validator: &JwtValidator,
) -> bool {
    match auth.mode {
        AuthMode::LocalhostOnly => is_localhost(peer_ip),
        AuthMode::Jwt => bearer
            .map(|token| validator.validate_token(token).is_ok())
            .unwrap_or(false),
        AuthMode::ApiKey { .. } => false,
    }
}

fn is_localhost(peer_ip: &str) -> bool {
    peer_ip.starts_with("127.") || peer_ip == "::1"
}

async fn require_auth(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let bearer = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    // Test requests originate from the local machine (127.0.0.1).
    if authorize("127.0.0.1", bearer, &state.auth_config, &state.validator) {
        next.run(request).await
    } else {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "unauthorized" })),
        )
            .into_response()
    }
}

async fn health_check() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

async fn issue_token(State(state): State<AppState>, Json(body): Json<Value>) -> Response {
    let username = body["username"].as_str().unwrap_or_default();
    let password = body["password"].as_str().unwrap_or_default();
    let domain = body["domain"].as_str().unwrap_or_default();

    let backend = state.backend.lock().await;
    let account = backend
        .accounts
        .values()
        .find(|entry| entry.config.username == username && entry.config.domain == domain);

    match account {
        Some(entry) if entry.config.password.as_str() == password => {
            let claims = Claims {
                sub: entry.id.to_string(),
                username: username.to_string(),
                domain: domain.to_string(),
                exp: u64::MAX,
                scope: "sip:all".to_string(),
            };
            match state.validator.issue_token(&claims) {
                Ok(token) => (StatusCode::OK, Json(json!({ "token": token }))).into_response(),
                Err(_) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "token issuance failed" })),
                )
                    .into_response(),
            }
        }
        _ => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "invalid credentials" })),
        )
            .into_response(),
    }
}

async fn list_accounts(State(state): State<AppState>) -> Json<Value> {
    let backend = state.backend.lock().await;
    let accounts: Vec<Value> = backend
        .accounts
        .values()
        .map(|entry| {
            json!({
                "id": entry.id,
                "username": entry.config.username,
                "domain": entry.config.domain,
            })
        })
        .collect();
    Json(json!({ "accounts": accounts }))
}

async fn add_account(State(state): State<AppState>, Json(body): Json<Value>) -> Response {
    let username = body["username"].as_str().unwrap_or_default().to_string();
    let domain = body["domain"].as_str().unwrap_or_default().to_string();
    let password = body["password"].as_str().unwrap_or_default().to_string();
    let config = test_account_config(&username, &domain, &password);

    let mut backend = state.backend.lock().await;
    match backend.add_account(&config) {
        Ok((id, _entry)) => (StatusCode::OK, Json(json!({ "id": id }))).into_response(),
        Err(_) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "account add failed" })),
        )
            .into_response(),
    }
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_control_socket(socket, state))
}

async fn ws_audio_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_audio_only_socket(socket, state))
}

/// Control+audio stream: emit one ClientInitialized event text frame then one
/// audio binary frame, both drawn from the shared SequenceGenerator (C063).
async fn handle_control_socket(mut socket: WebSocket, state: AppState) {
    let seq_event = state.generator.next();
    let event_frame = WsTextFrame {
        msg_type: "event".into(),
        seq: seq_event,
        payload: json!({ "kind": "ClientInitialized" }),
    };
    if let Ok(text) = serde_json::to_string(&event_frame) {
        let _ = socket.send(Message::Text(text)).await;
    }

    let seq_audio = state.generator.next();
    let audio_frame = WsBinaryFrame {
        header: test_audio_header(seq_audio),
        data: vec![0u8; 320],
    };
    let _ = socket.send(Message::Binary(audio_frame.encode())).await;
}

/// Audio-only stream: emit two audio binary frames from the shared generator.
async fn handle_audio_only_socket(mut socket: WebSocket, state: AppState) {
    for _ in 0..2 {
        let audio_frame = WsBinaryFrame {
            header: test_audio_header(state.generator.next()),
            data: vec![0u8; 320],
        };
        let _ = socket.send(Message::Binary(audio_frame.encode())).await;
    }
}

/// Construct an `AudioFrameHeader` with a fixed 20 ms / 48 kHz PCM layout.
fn test_audio_header(sequence_number: u64) -> AudioFrameHeader {
    AudioFrameHeader {
        sequence_number,
        timestamp_ms: 0,
        frame_ms: 20,
        sample_rate: 48000,
        channels: 1,
        bits_per_sample: 16,
        call_id: 0,
        reserved: [0u8; 4],
    }
}

/// Construct an `AccountConfig` for the test backend.
fn test_account_config(username: &str, domain: &str, password: &str) -> AccountConfig {
    AccountConfig {
        username: username.to_string(),
        domain: domain.to_string(),
        password: SecretString::new(password.to_string()),
        ..Default::default()
    }
}

/// Read a response body and parse it as JSON.
pub async fn body_json(response: Response) -> Value {
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("collect response body")
        .to_bytes();
    serde_json::from_slice(&bytes).expect("response body is valid JSON")
}
