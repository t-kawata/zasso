---
tree:
  level: child
  childId: "02"
  childName: siprs-server — HTTP/WebSocket API Server
slug: siprs-server
canonicalRfcPath: ../RFC-ROOT.md
canonicalRfcSection: "§52（HTTP/WebSocket API 層・crate 分割方針）, §53（スタンドアロンサーバーモード）, §54（API プロトコル構成）, §55（JWT 認証・認可）, §56（SQLite 永続化）, §57（テスト戦略拡張 Layer 5）"
ioSchema: "POST /api/v1/auth/login → { token: JWT }
GET/POST /api/v1/accounts → Account CRUD
POST /api/v1/accounts/:id/register → 登録制御
POST /api/v1/calls → make_call (OutgoingCallRequest)
POST /api/v1/calls/:id/hangup → 切断
POST /api/v1/calls/:id/dtmf → DTMF 送信
GET /api/v1/ws → WebSocket upgrade (イベント stream + 音声バイナリフレーム)
GET /api/v1/health → { status: "ok" }
pub fn build_router(client: SipClient, jwt_secret: &str) -> axum::Router"
decouplingMethod: "Cargo.toml path dep → siprs = { path = "../siprs", features = ["serde"] }。siprs の pub API（SipClient, EventBus, SipEventPayload）のみ使用。HTTP 依存（axum, tokio-tungstenite）は siprs に一切混入させない。JWT secret は環境変数または設定ファイルから注入。"
dependencyOn: [01]
---

# RFC: siprs-server — HTTP/WebSocket API Server

<!--
===== Anchor Marker System =====
このファイルの一部のセクションには「機械転記ブロック」として、
親RFC（../RFC-ROOT.md）から機械的に転記された内容が含まれている。
機械転記ブロックは開始マーカーと終了マーカー
で囲まれており、generate-child-rfcs.js の再実行で自動更新される。

機械転記ブロック以外の記述（AI記述部）は維持される。機械転記ブロックの
内容を変更する場合は、必ず親RFCの該当マーカー範囲を編集した上で
generate-child-rfcs.js を再実行すること。
===============================
-->

## 責務

<!-- 機械転記ブロック（generate-child-rfcs.js が更新。自動管理のため直接編集禁止） -->
## 52. HTTP/WebSocket API 層 — 責務範囲と crate 分割

本 crate は Rust 公開 API（SipClient, SipAccountHandle, EventBus）を提供する純粋なライブラリとしての側面と、HTTP/WebSocket 経由で外部から全操作・全イベント取得を可能にするスタンドアロンサーバーとしての側面を併せ持つ。

### 52.1 Crate 分割方針（設計判断）

**決定: 分離 crate 方式（siprs + siprs-server）**

```text
zasso/
├── crates/
│   ├── siprs/              # 純粋なSIPクライアントライブラリ
│   │   └── src/            # 既存 §6 のモジュール群
│   └── siprs-server/       # HTTP/WebSocket API サーバー
│       ├── src/
│       │   ├── main.rs     # スタンドアロンバイナリ
│       │   ├── lib.rs      # Tauri 埋め込み用ライブラリエントリ
│       │   ├── routes/     # Axum ルーター定義
│       │   ├── auth/       # JWT 認証・認可
│       │   ├── ws/         # WebSocket セッション管理
│       │   └── db/         # SQLite 永続化（migrations/ 含む）
│       └── migrations/     # SeaORM マイグレーションファイル
```

**選択理由**:
- Tauri アプリに埋め込む場合、HTTP/WS サーバー全体（Axum, tokio-tungstenite, rusqlite 等）の依存は不要。分離によりバンドルサイズを最小化する。
- siprs の責務を「SIP クライアントコア」に限定し、単体テストが HTTP 依存から解放される。
- 将来のバックエンド差し替え（PJSIP → 独自実装）の際も siprs-server は影響を受けない。

```toml
# siprs-server/Cargo.toml（workspace メンバーとして追加）
[package]
name = "siprs-server"
version.workspace = true
edition.workspace = true

[dependencies]
siprs = { path = "../siprs", features = ["serde"] }
axum = "0.8"
tokio = { workspace = true, features = ["full"] }
tokio-tungstenite = "0.24"
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
jsonwebtoken = "9"
rusqlite = { version = "0.32", features = ["bundled"] }
sea-orm = { version = "1.1", features = ["sqlite-sqlx", "macros"] }
tracing = { workspace = true }

[features]
default = []
cli = ["clap"]   # バイナリビルド時のみ

[lib]
name = "siprs_server"
path = "src/lib.rs"

[[bin]]
name = "siprs-server"
path = "src/main.rs"
required-features = ["cli"]
```

```toml
# siprs/Cargo.toml への feature 追記（参考）
[features]
default = []
serde = ["dep:serde", "dep:serde_json", "dep:secrecy/serde"]
tls = []    # PJSIP TLS transport
srtp = []   # PJSIP SRTP

# 注: siprs 自体に Axum 等の HTTP 依存は一切追加しない。
# 「server」feature も siprs には定義せず、siprs-server のみが依存を持つ。
```

### 52.2 ライセンス方針

本 crate は PJSIP（GPL v2）に依存する。1.0 リリースまでの現フェーズではライセンス形式は未確定とし、実装を優先する。

**目標ライセンス構成（1.0 リリース時に確定）**:
- siprs 本体: MIT / Apache 2.0 デュアルライセンス
- PJSIP とのリンク: GPL linking exception を明示的に付与
- 商用利用者: GPL のコピーレフト効果がアプリ全体に及ばないよう例外条項で保護

```text
// LICENSE 冒頭（目標）
siprs is dual-licensed under MIT and Apache 2.0.
The PJSIP library (vendored under vendor/pjsip/) is licensed under GPL v2.
As a special exception, programs linked against siprs are not required
to be licensed under GPL v2. This exception does not apply to modifications
of siprs itself.
```

### 52.3 マルチインスタンス方式（設計判断）

PJSIP の `pjsua_init()` は 1 回のみ呼び出し可能である。この制約の下で複数 SipClient を扱う方式を以下の方針とする。

**決定: 単一 PjsuaBackend singleton 共有（Dual Client）モデルを本番運用として正式サポート**

- 最初の `SipClient::new()` で Reactor + PjsuaBackend singleton を生成する。
- 2 つ目以降の `SipClient::new()` は既存の PjsuaBackend singleton を共有し、Reactor に新規 EventBus を追加登録する。
- イベント配送は `account_id` ベースの EventBus 振り分けにより Client ごとに分離する（§27a M20 追補 参照）。
- Dual Client はテスト用 utility ではなく、本番マルチテナント運用の標準モデルとする。

```rust
// マルチインスタンス初期化の本番使用例
let client_a = SipClient::new(config_a).await?; // 初回 → PjsuaBackend singleton 生成
let client_b = SipClient::new(config_b).await?; // 2回目 → singleton 共有 + EventBus 追加

let handle_a = client_a.add_account(account_a).await?;
let handle_b = client_b.add_account(account_b).await?;

// client_a のイベントは client_a の EventBus にのみ配送される
// client_b のイベントは client_b の EventBus にのみ配送される
```

### 52.4 PJSIP 非 Pure Rust の補足

本 crate は `vendor/pjsip/` 内の C ライブラリ（PJSUA 2.17）に依存する。`unsafe` FFI 境界は `ffi/` モジュールに隔離され、以下の監査方針に従う。

- `ffi/bindings.rs`: `bindgen` 自動生成。手動編集禁止。
- `ffi/callbacks.rs`: extern "C" 関数。catch_unwind 必須。最小限の work enqueue のみ。
- `ffi/strings.rs`: `pj_str_t` <-> Rust &str 変換。常に Rust 側でメモリ所有。

### 設計判断の補足

**分離 crate 方式の選択理由（§52.1）**: siprs と siprs-server を別 crate とする最大の利点は、Tauri
アプリ埋め込み時のバンドルサイズ最小化である。siprs-server が依存する axum（〜150KB）、tokio-tungstenite、
rusqlite 等は Tauri の IPC 経由で siprs を直接使用する場合には不要であり、siprs 単体の依存は
PJSIP FFI + tokio + crossbeam + rubato に限定される。また HTTP スタックの分離により siprs の単体テストが
HTTP 依存から解放され、テスト実行速度と信頼性が向上する。

**REST + WebSocket の 2 層構成（§54）**: 操作系（REST）とイベント配信（WebSocket）をプロトコルレベルで
分離するのは、以下の理由による: (1) REST はリクエスト/レスポンスの同期操作に適し、WebSocket は長時間の
イベントストリームに適する。(2) 音声バイナリフレームは WebSocket のバイナリフレームで送受信でき、
REST の JSON シリアライズオーバーヘッドを回避できる。(3) 障害発生時に REST API の死活監視
（GET /health）と WebSocket のイベント断絶を独立して検出できる。

**JWT 認証モデル（§55）**: SIP アカウントの認証情報（username/password/domain）で JWT を発行し、
以降の全 API 呼び出しを Bearer token で認証する。SIP アカウント認証を JWT 発行の根拠とすることで、
別途ユーザー管理システムを導入せずに認証を実現する。Axum Layer として実装することで、
認証方式の差し替え（API Key、OAuth2 等）が Layer 交換のみで可能な設計とする。

**SQLite 選択の理由（§56）**: 設定永続化に SQLite（rusqlite bundled）を選択するのは、
(1) スタンドアロンサーバーが単一プロセスで動作するため client/server 型 DB が不要、
(2) bundled feature により SQLite ライブラリの別途インストールが不要、
(3) SeaORM 経由で将来の PostgreSQL/MySQL 移行パスを確保できるためである。

### 実装上の注意点

- **Axum Router の構築**: `build_router(state)` 関数は siprs::SipClient を AppState に保持し、
  各ハンドラが State 経由で SipClient のメソッドを呼び出す構造とする。WebSocket ハンドラは
  SipClient の EventBus から broadcast::Receiver を取得し、受信した SipEvent を
  JSON テキストフレームとしてクライアントに転送する。
- **音声フレームの転送**: WebSocket 経由の音声バイナリフレームは先頭 24 バイトの固定ヘッダ
  （sequence_number, timestamp, format 情報）+ 可変長 PCM データで構成する。
  クライアントはヘッダの sequence_number により制御系イベントと音声の時間的相関を復元できる。
- **設定永続化の分離**: siprs-server がアカウント設定を SQLite に永続化するが、siprs は
  メモリ上の設定管理のみを行う。siprs-server 起動時に DB から設定を読み出し siprs に注入する
  フローとし、siprs の API が DB に依存しない設計を維持する。
<!-- /機械転記ブロック -->

## I/O境界

<!-- 機械転記ブロック（generate-child-rfcs.js が更新。自動管理のため直接編集禁止） -->
## 53. スタンドアロンサーバーモード

siprs-server crate は Axum ベースの HTTP/WS サーバーとして動作し、全ての SIP 操作とイベント取得を外部 API として公開する。

### 53.1 起動モード

```rust
// siprs-server/src/main.rs — バイナリエントリ
#[tokio::main]
async fn main() -> Result<(), SipError> {
    let config = ServerConfig::from_args(); // clap で CLI 引数パース

    // siprs の SipClient を初期化
    let sip_client = SipClient::new(config.client_config).await?;

    // 永続化 DB を初期化（rusqlite + SeaORM）
    let db = DatabasePool::open(&config.db_path).await?;

    // 保存済みアカウントを復元
    let accounts = db.load_accounts().await?;
    for account_config in accounts {
        sip_client.add_account(account_config).await?;
    }

    // Axum サーバー起動
    let app_state = AppState { sip_client, db };
    let router = build_router(app_state);

    let listener = tokio::net::TcpListener::bind(config.bind_addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
```

### 53.2 設定ファイル構成

```rust
/// siprs-server の起動設定。ファイル（JSON/YAML）または CLI 引数で指定。
pub struct ServerConfig {
    pub bind_addr: SocketAddr,            // デフォルト: 127.0.0.1:3910
    pub db_path: PathBuf,                 // デフォルト: ~/.siprs/data.db
    pub config_file: Option<PathBuf>,     // ClientConfig + AccountConfig を外部ファイルから一括読み込み
    pub allowed_origins: Vec<String>,     // CORS 設定
    pub auth: AuthConfig,
}

pub struct AuthConfig {
    pub mode: AuthMode,                   // None | ApiKey | Jwt
    pub jwt_secret: Option<SecretString>, // JWT 秘密鍵
    pub jwt_expiry_secs: u64,            // デフォルト: 3600
}

pub enum AuthMode {
    /// 127.0.0.1 のみ Listen（デフォルト）
    LocalhostOnly,
    /// API Key 認証
    ApiKey { key: SecretString },
    /// JWT 認証（SIP アカウント認証から発行）
    Jwt,
}
```
<!-- /機械転記ブロック -->

## 親との関係

根拠: §52（HTTP/WebSocket API 層・crate 分割方針）, §53（スタンドアロンサーバーモード）, §54（API プロトコル構成）, §55（JWT 認証・認可）, §56（SQLite 永続化）, §57（テスト戦略拡張 Layer 5）

<!-- 機械転記ブロック（generate-child-rfcs.js が更新。自動管理のため直接編集禁止） -->
## 54. HTTP/WebSocket API プロトコル構成

**決定: REST（操作系）+ WebSocket（イベント配信 + 音声バイナリ）の 2 層構成**

### 54.1 REST API エンドポイント一覧

全操作は RESTful なエンドポイントとして公開する。

| Method | Path | 説明 |
|--------|------|------|
| `POST` | `/api/v1/auth/token` | SIP アカウント認証 → JWT 発行 |
| `GET` | `/api/v1/accounts` | アカウント一覧 |
| `POST` | `/api/v1/accounts` | アカウント追加 |
| `DELETE` | `/api/v1/accounts/:id` | アカウント削除 |
| `GET` | `/api/v1/accounts/:id` | アカウント情報取得 |
| `POST` | `/api/v1/accounts/:id/register` | Register 実行 |
| `POST` | `/api/v1/accounts/:id/unregister` | Unregister 実行 |
| `POST` | `/api/v1/accounts/:id/calls` | 発信（make_call） |
| `GET` | `/api/v1/calls` | 通話一覧 |
| `GET` | `/api/v1/calls/:id` | 通話状態取得 |
| `POST` | `/api/v1/calls/:id/hangup` | 切断 |
| `POST` | `/api/v1/calls/:id/hold` | Hold |
| `POST` | `/api/v1/calls/:id/unhold` | Hold 解除 |
| `POST` | `/api/v1/calls/:id/dtmf` | DTMF 送信 |
| `POST` | `/api/v1/calls/:id/transfer` | 転送（REFER） |
| `GET` | `/api/v1/events` | Server-Sent Events（制御系イベント監視用） |
| `GET` | `/api/v1/health` | ヘルスチェック |
| `POST` | `/api/v1/shutdown` | SIP Client シャットダウン |

### 54.2 WebSocket エンドポイント

```text
ws://<host>:<port>/api/v1/ws            # 制御系イベント + 音声チャンク
ws://<host>:<port>/api/v1/ws/audio      # 音声チャンク専用（制御系不要時）
```

WebSocket 接続時は `Authorization: Bearer <token>` ヘッダで認証する。音声専用チャネルは制御系イベントの配送負荷を受けず、音声チャンクの安定転送に特化する。

### 54.3 Axum Router 構造

```rust
// siprs-server/src/routes/mod.rs
pub fn build_router(state: AppState) -> Router {
    Router::new()
        // 認証不要
        .route("/api/v1/health", get(health_check))
        .route("/api/v1/auth/token", post(auth::issue_token))
        // JWT 認証必須（layer で共通検証）
        .route("/api/v1/accounts", get(list_accounts).post(add_account))
        .route("/api/v1/accounts/:id", get(get_account).delete(remove_account))
        .route("/api/v1/accounts/:id/register", post(register_account))
        .route("/api/v1/accounts/:id/unregister", post(unregister_account))
        .route("/api/v1/accounts/:id/calls", post(make_call))
        .route("/api/v1/calls", get(list_calls))
        .route("/api/v1/calls/:id", get(get_call_state))
        .route("/api/v1/calls/:id/hangup", post(hangup_call))
        .route("/api/v1/calls/:id/hold", post(hold_call))
        .route("/api/v1/calls/:id/unhold", post(unhold_call))
        .route("/api/v1/calls/:id/dtmf", post(send_dtmf))
        .route("/api/v1/calls/:id/transfer", post(transfer_call))
        .route("/api/v1/shutdown", post(shutdown))
        // WebSocket
        .route("/api/v1/ws", get(ws_handler))
        .route("/api/v1/ws/audio", get(ws_audio_handler))
        // JWT 認証レイヤー
        .layer(AxumJWTAuthLayer::new(state.jwt_validator.clone()))
        .with_state(state)
}
```

### 54.4 WebSocket メッセージプロトコル

制御系イベント（JSON テキストフレーム）と音声チャンク（バイナリフレーム）は同一または別個の WebSocket 接続で配送される。

**テキストフレーム（制御系イベント）**:

```json
{
  "type": "event",
  "seq": 1042,
  "payload": {
    "kind": "CallConnected",
    "call_id": 7,
    "account_id": 3,
    "timestamp_ms": 1748935200123
  }
}
```

**バイナリフレーム（音声チャンク）**: 先頭 24 バイトの固定ヘッダ + 可変長 PCM データで構成する。

```rust
/// WebSocket バイナリフレームの固定ヘッダ構造（24 bytes）
#[repr(C, packed)]
pub struct AudioFrameHeader {
    pub sequence_number: u64,     // グローバルシーケンス番号（EventBus と共通）
    pub timestamp_ms: u64,        // サンプリング時刻（Unix epoch ms）
    pub frame_ms: u16,            // フレーム長（ms）、通常 20
    pub sample_rate: u16,         // サンプリングレート（Hz）
    pub channels: u8,             // チャネル数（1=mono, 2=stereo）
    pub bits_per_sample: u8,      // ビット深度（16= i16）
    pub call_id: u32,             // 通話 ID（0 は制御用）
    pub reserved: [u8; 4],        // 将来拡張用
}
// 合計 24 バイト
```

### 54.5 イベント-音声時間的相関保証（設計判断）

**決定: グローバルシーケンス番号（sequence number）をプライマリキーとし、タイムスタンプをフォールバック指標として併用する。**

EventBus が発行する全 SipEvent には単調増加する u64 sequence number が付与される。AudioChunkPair にも同一系列の sequence number 範囲（`first_seq: u64, last_seq: u64`）が載り、受信側は sequence number で制御系イベントと音声チャンクを対応付ける。

```rust
// SipEvent への sequence number 追加
#[derive(Debug, Clone)]
pub struct SipEvent {
    pub meta: EventMeta,
    pub seq: u64,               // 追加: グローバルシーケンス番号
    pub payload: SipEventPayload,
}

// AudioChunkPair への sequence number 範囲追加
#[derive(Debug, Clone)]
pub struct AudioChunkPair {
    pub first_seq: u64,         // このチャンクの先頭サンプルに対応する sequence number
    pub last_seq: u64,          // このチャンクの最終サンプルに対応する sequence number
    pub timestamp: EventTimestamp,
    pub input: AudioBuffer,
    pub output: AudioBuffer,
}
```

対応付けの具体例:
1. 時刻 T に `CallConnected` イベント（seq=1000）が発行される
2. 時刻 T から T+20ms の音声チャンクには `first_seq=1000, last_seq=1010` が載る
3. 受信側は `seq=1000` の CallConnected と `first_seq=1000` の音声チャンクが同時刻の情報であると判断できる
<!-- /機械転記ブロック -->

## 依存関係

<!-- 機械転記ブロック（generate-child-rfcs.js が更新。自動管理のため直接編集禁止） -->
## 55. 認証・認可モデル

**決定: SIP アカウント認証による JWT 発行 + Bearer Token 検証（Axum middleware）**

### 55.1 JWT 発行エンドポイント

```rust
// POST /api/v1/auth/token
// Request:  { "sip_username": "1001", "sip_password": "secret", "sip_domain": "pbx.example.com" }
// Response: { "token": "eyJ...", "expires_in": 3600 }

async fn issue_token(
    Json(req): Json<AuthRequest>,
    State(state): State<AppState>,
) -> Result<Json<AuthResponse>, AuthError> {
    // 1. SIP アカウントが存在し、認証情報が一致するか検証
    let account = state.sip_client.find_account(&req.sip_username, &req.sip_domain)
        .ok_or(AuthError::InvalidCredentials)?;

    // 2. JWT 発行
    let claims = Claims {
        sub: account.id().to_string(),
        username: req.sip_username,
        domain: req.sip_domain,
        exp: now + state.config.auth.jwt_expiry_secs,
        scope: "sip:all",   // 全 API 操作可能
    };
    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(secret));

    Ok(Json(AuthResponse { token, expires_in: state.config.auth.jwt_expiry_secs }))
}
```

### 55.2 Axum JWT 認証 Middleware

```rust
/// JWT 認証レイヤー。Authorization: Bearer <token> ヘッダを検証する。
/// WebSocket 接続時も同一のトークンをクエリパラメータまたはヘッダで検証する。
pub struct AxumJWTAuthLayer {
    validator: JwtValidator,
}

impl<S> Layer<S> for AxumJWTAuthLayer {
    type Service = AxumJWTAuthMiddleware<S>;
    fn layer(&self, inner: S) -> Self::Service {
        AxumJWTAuthMiddleware { inner, validator: self.validator.clone() }
    }
}
```

### 55.3 認証設定のデフォルト

- デフォルトのバインドアドレス: `127.0.0.1:3910`（ローカルホストのみ）
- デフォルトの認証モード: `LocalhostOnly`（認証不要）
- 外部公開時は `AuthConfig` で認証モードを強制する


<!-- /機械転記ブロック -->
