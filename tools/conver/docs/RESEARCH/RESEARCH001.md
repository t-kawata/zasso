`INFERENCE` — 判定は **REJECT / 証拠不足**。今回取得した資料だけでは、要求された「2026-11-12 時点の最新安定版」「相互互換性」「全 API の版固定検証」「六つのコンパイル済み skeleton」を証明できない。未検証コードを canonical compiling skeleton と表示したり、検索で見つからない API を不存在と断定したりはしない。

`UNKNOWN` — 以下は完全な D1–D10 納品ではない。取得できた一次資料による監査結果、仕様上の欠落、生成・検査契約の確定可能部分を示す。全 acceptance criteria を満たした成果物としての採用は禁止。解決に必要な証拠は、各項の `UNKNOWN` に記載する。

`INFERENCE` — 回答言語は冒頭の「日本語で答えよ」を採用する。以下の `MUST` は既存 SDK の仕様ではなく、本回答が提案するプロジェクト契約であり、すべて `INFERENCE` として区別する。

## 1. 証拠の適格性と監査境界

| 分類 | 結果 | 影響・解決 |
|---|---|---|
| `FACT` | crates.io の取得結果は `axum 0.8.9` を `max_stable_version` と表示。公開日時 `2026-04-14T07:55:20.258398Z`、MSRV `1.80`、edition `2021`、MIT、非 yank を表示。 [FACT: [https://crates.io/api/v1/crates/axum](https://crates.io/api/v1/crates/axum) @ 0.8.9]  [crates](https://crates.io/api/v1/crates/axum) | この版のメタデータは確認済み。 |
| `UNKNOWN` | 他の全 crate について、2026-11-12 を cutoff とした公開版一覧の完全な検証は未完了。 | `latest` ページの表示だけで当日最新とは認定しない。公開日時・yank 状態を含む registry snapshot が必要。 |
| `UNKNOWN` | Cargo による依存解決、Rust 1.95 によるビルド、テストは未実行。 | 相互互換性、推移的 MSRV、skeleton のコンパイル成功を認定できない。実際の workspace とビルドログが必要。 |
| `UNKNOWN` | 対象 lockfile に対する RustSec、cargo-deny、cargo-vet の実行結果なし。 | 「既知 advisory なし」「監査済み」とは認定しない。DB revision、lockfile digest、実行結果が必要。 |
| `UNKNOWN` | 元の「既存仕様」の本文、operation schema、dispatcher API、identity API、OKF schema が未提示。 | envelope、error category、認証 audience、exit code、OKF atom を実装可能な型に固定できない。該当仕様の版固定入力が必要。 |

`INFERENCE` — 「資料不足で適格性を証明できない」と「SDK の機能不足により適格でない」は異なる。本監査では前者を `UNQUALIFIED`、後者を `NONE QUALIFIES` と分ける。証拠不足だけを理由として、SDK に機能が存在しないとは結論しない。

## 2. D1 — 宣言仕様の監査

| Interface | 宣言 | 確認できた実体 | 判定 |
|---|---|---|---|
| REST | `axum`; `router() -> axum::Router` | `axum 0.8.9` に `Router`、`Json`、`extract::State`、`http` 再公開、`Router::new().route(...).with_state(...)` の公式例が存在。 [FACT: [https://docs.rs/axum/0.8.9/axum/](https://docs.rs/axum/0.8.9/axum/) @ 0.8.9]  [docs](https://docs.rs/axum/0.8.9/axum/) | `INFERENCE` — 戻り値型は成立する。`router()` 自体はプロジェクトが定義する関数であり、SDK 提供関数という意味ではない。 |
| REST | `json`, `cors`, `trace` | `axum 0.8.9` の `json` は確認済み。同版 feature map に `cors`、`trace` はない。 [FACT: [https://crates.io/api/v1/crates/axum](https://crates.io/api/v1/crates/axum) @ 0.8.9]  [crates](https://crates.io/api/v1/crates/axum) | `INFERENCE` — feature を crate ごとに分離せず `axum` に付与する仕様なら `SPEC-API-INVALID`。 |
| REST | `tower-http` の CORS・trace | 取得ページは `tower-http 0.7.1`。`cors`、`trace`、`limit`、`request-id` 等の feature に対応する module を掲載。 [FACT: [https://docs.rs/tower-http/latest/tower_http/](https://docs.rs/tower-http/latest/tower_http/) @ 0.7.1〈取得表示〉]  [docs](https://docs.rs/tower-http/latest/tower_http/) | `UNKNOWN` — cutoff 時点の選定版および `axum 0.8.9` との解決済み graph は未確認。 |
| REST | `utoipa::ToSchema`, `utoipa::OpenApi` | 取得ページは `utoipa 6.0.0`。両 trait と derive macro を掲載。derive macro は `macros` feature。 [FACT: [https://docs.rs/utoipa/latest/utoipa/](https://docs.rs/utoipa/latest/utoipa/) @ 6.0.0〈取得表示〉]  [docs](https://docs.rs/utoipa/latest/utoipa/) | `FACT` — 名前は確認済み。`UNKNOWN` — 選定版としての確定、他 crate との型互換性は未確認。 |
| REST | `utoipa-swagger-ui` | 取得ページは `10.0.2`。`axum`、`vendored` feature、`SwaggerUi::new(...).url(...)` を axum router に merge する例を掲載。 [FACT: [https://docs.rs/utoipa-swagger-ui/latest/utoipa_swagger_ui/](https://docs.rs/utoipa-swagger-ui/latest/utoipa_swagger_ui/) @ 10.0.2〈取得表示〉]  [docs](https://docs.rs/utoipa-swagger-ui/latest/utoipa_swagger_ui/) | `UNKNOWN` — `utoipa 6.0.0` との互換性は未確認。同じページに登場する最新版同士を互換と認定しない。 |
| WebSocket | `axum` の `ws` | `axum 0.8.9` の `extract::ws` は `ws` feature 下に存在。 [FACT: [https://docs.rs/axum/0.8.9/axum/extract/ws/index.html](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html) @ 0.8.9]  [docs](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html) | `FACT` — 宣言された実装系統は存在。 |
| WebSocket | upgrade、split | 同版公式例に `WebSocketUpgrade`、`on_upgrade`、`WebSocket`、`Message`、`futures_util::sink::SinkExt`、`stream::StreamExt`、`socket.split()` が存在。 [FACT: [https://docs.rs/axum/0.8.9/axum/extract/ws/index.html](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html) @ 0.8.9]  [docs](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html) | `UNKNOWN` — `futures-util` の選定版、全 signature、queue・cleanup 実装は未検証。 |
| CLI | `clap::Parser`, `Subcommand`, `Args` | 取得ページは `clap 4.6.7`。三 trait、`CommandFactory`、derive 利用例を掲載。 [FACT: [https://docs.rs/clap/latest/clap/](https://docs.rs/clap/latest/clap/) @ 4.6.7〈取得表示〉]  [docs](https://docs.rs/clap/latest/clap/) | `FACT` — 名前は存在。`UNKNOWN` — cutoff、正確な feature closure、MSRV は未確定。 |
| CLI | `reqwest` の `json` | 取得ページは `reqwest 0.13.5`。非同期 `Client` は Tokio を要求。JSON request helper は `json` feature を要求。 [FACT: [https://docs.rs/reqwest/latest/reqwest/](https://docs.rs/reqwest/latest/reqwest/) @ 0.13.5〈取得表示〉]  [docs](https://docs.rs/reqwest/latest/reqwest/) | `FACT` — feature 名は存在。`UNKNOWN` — CLI 全体の互換性は未確認。 |
| CLI | `run() -> ExitCode` | プロジェクト側の公開関数として要求されている。 | `UNKNOWN` — runtime 所有者、非同期 dispatch の待機方法、I/O 注入方法が未定義。SDK API の誤りとは判定しない。 |
| gRPC | `tonic`, `prost`, `tonic-prost`, `tonic-prost-build` | tonic の取得ページは `0.14.9`。`transport`、`server`、`channel`、`router`、`codegen` を掲載。 [FACT: [https://docs.rs/tonic/latest/tonic/](https://docs.rs/tonic/latest/tonic/) @ 0.14.9〈取得表示〉]  [docs](https://docs.rs/tonic/latest/tonic/) | `UNKNOWN` — 四 crate の厳密な版組合せは未確認。 |
| gRPC | `transport`, `codegen` のみ | tonic の取得ページでは axum ベース router を `router` feature として分離。 [FACT: [https://docs.rs/tonic/latest/tonic/](https://docs.rs/tonic/latest/tonic/) @ 0.14.9〈取得表示〉]  [docs](https://docs.rs/tonic/latest/tonic/) | `INFERENCE` — default features を無効化する契約では、宣言 surface に必要な feature を再検証する必要がある。`transport,codegen` だけで十分とは認定しない。 |
| gRPC | build.rs | 公式 build crate の取得資料に `tonic_prost_build::configure().compile_protos(...)` の例あり。 [FACT: [https://docs.rs/tonic-prost-build/latest/tonic_prost_build/](https://docs.rs/tonic-prost-build/latest/tonic_prost_build/) @ 0.14.9〈取得表示〉]  [docs](https://docs.rs/tonic-prost-build/latest/tonic_prost_build/) | `UNKNOWN` —検索結果内に `0.14.6` と `0.14.9` の表示不整合もある。版固定ソースによる再検証が必要。  [docs](https://docs.rs/crate/tonic-prost-build/latest) |
| MCP | `server() -> rmcp::Server` | `rmcp 3.9.0` の全公開 item 一覧には `ServerHandler`、`RoleServer`、`RunningService`、`StreamableHttpService` 等が掲載され、`rmcp::Server` は掲載されていない。 [FACT: [https://docs.rs/rmcp/3.9.0/rmcp/all.html](https://docs.rs/rmcp/3.9.0/rmcp/all.html) @ 3.9.0]  [docs](https://docs.rs/rmcp/3.9.0/rmcp/all.html) | `INFERENCE` — 調査した rustdoc 構成に対して `SPEC-API-INVALID`。feature 全構成での不存在証明は別途必要。 |
| MCP | handler / HTTP surface | 同版一覧に `handler::server::ServerHandler`、`transport::streamable_http_server::tower::StreamableHttpService` が存在。 [FACT: [https://docs.rs/rmcp/3.9.0/rmcp/all.html](https://docs.rs/rmcp/3.9.0/rmcp/all.html) @ 3.9.0]  [docs](https://docs.rs/rmcp/3.9.0/rmcp/all.html) | `INFERENCE` — HTTP adapter の公開 surface をプロジェクト定義の router factory とし、その内部で SDK service を組み込む設計に変更する。正確な constructor は未確定。 |
| MCP | 外部 session store | 同版一覧に `SessionManager`、`SessionStore`、`EventStore`、`NeverSessionManager` が存在。 [FACT: [https://docs.rs/rmcp/3.9.0/rmcp/all.html](https://docs.rs/rmcp/3.9.0/rmcp/all.html) @ 3.9.0]  [docs](https://docs.rs/rmcp/3.9.0/rmcp/all.html) | `UNKNOWN` — trait の required methods、耐障害性、stateless/resume の成立条件は未検証。名前の存在だけで実装可能とは認定しない。 |
| A2A | package `a2a-lf`、Rust 名 `a2a` | 取得した crate documentation は「published as `a2a-lf` and imported … as `a2a`」と明記。repository は `a2aproject/a2a-rs` と記載。 [FACT: [https://docs.rs/a2a-lf/latest/a2a/](https://docs.rs/a2a-lf/latest/a2a/) @ 取得ページ・版番号未確定]  [docs](https://docs.rs/a2a-lf/latest/a2a/) | `UNKNOWN` — 名称対応を支持する証拠はあるが、版固定条件は未達。`SPEC-CRATE-INVALID` と断定する根拠はない。 |
| A2A | package `a2a-server-lf`、Rust 名 `a2a_server` | `a2a-server-lf 0.4.3` の rustdoc が `a2a_server` として存在。 [FACT: [https://docs.rs/a2a-server-lf/0.4.3/a2a_server/](https://docs.rs/a2a-server-lf/0.4.3/a2a_server/) @ 0.4.3]  [docs](https://docs.rs/a2a-server-lf/0.4.3/a2a_server/) | `FACT` — package と library 名の対応は確認済み。 |
| A2A | `a2a_server::A2aServer` | 同版 crate root は `DefaultRequestHandler`、`RequestHandler`、`AgentExecutor`、`TaskStore` 等を再公開。`A2aServer` は掲載されていない。 [FACT: [https://docs.rs/a2a-server-lf/0.4.3/a2a_server/](https://docs.rs/a2a-server-lf/0.4.3/a2a_server/) @ 0.4.3]  [docs](https://docs.rs/a2a-server-lf/0.4.3/a2a_server/) | `INFERENCE` — この root surface に対して `SPEC-API-INVALID`。未取得 feature 構成まで含む不存在断定はしない。 |
| A2A | `TaskStore` | `a2a_server::TaskStore` の再公開は確認済み。 [FACT: [https://docs.rs/a2a-server-lf/0.4.3/a2a_server/](https://docs.rs/a2a-server-lf/0.4.3/a2a_server/) @ 0.4.3]  [docs](https://docs.rs/a2a-server-lf/0.4.3/a2a_server/) | `UNKNOWN` — async trait 形、error、tenant enforcement、外部 store wiring は未検証。 |

`INFERENCE` — `SPEC-SURFACE-INVALID` は「要求する機能をその crate で実装できない」場合に限る。今回確認した型名の誤りだけでは、MCP/A2A の機能 surface 全体を `SPEC-SURFACE-INVALID` と断定しない。

## 3. D2 — 版・feature・supply-chain 判定表

`UNKNOWN` — 以下は互換性が証明された version matrix ではない。`確認対象版` と `採用可能版` を混同しない。`未確認` のある行は production admission を拒否する。

| Interface / Role | Crate | 確認対象版 | 確認した feature / API | Default policy | License / MSRV / Release | Maintenance / Advisory | Decision |
|---|---|---:|---|---|---|---|---|
| REST・WS | `axum` | `0.8.9` | `json`,`ws`,`http1`,`tokio` | `INFERENCE` — 明示無効、必要分を列挙 | `FACT` — MIT / 1.80 / 2026-04-14。  [crates](https://crates.io/api/v1/crates/axum) | `UNKNOWN` — health・advisory 未監査 | 条件付き候補 |
| REST test / middleware | `tower` | `0.5.3` | `util`,`make` が manifest に存在 | `INFERENCE` — 明示無効 | `FACT` — MIT / 1.64.0。 [FACT: [https://docs.rs/crate/tower/latest/source/Cargo.toml.orig](https://docs.rs/crate/tower/latest/source/Cargo.toml.orig) @ 0.5.3〈取得表示〉]  [docs](https://docs.rs/crate/tower/latest/source/Cargo.toml.orig) | `UNKNOWN` | 未採用 |
| REST middleware | `tower-http` | `0.7.1` 表示 | `cors`,`trace`,`limit`,`request-id` | `INFERENCE` — 明示無効 | `UNKNOWN` | `UNKNOWN` | 未採用  [docs](https://docs.rs/tower-http/latest/tower_http/) |
| REST schema | `utoipa` | `6.0.0` 表示 | `macros`,`axum_extras` | `INFERENCE` — 明示無効 | `UNKNOWN` | `UNKNOWN` | 未採用  [docs](https://docs.rs/utoipa/latest/utoipa/) |
| REST UI | `utoipa-swagger-ui` | `10.0.2` 表示 | `axum`,`vendored` | `INFERENCE` — 明示無効 | `UNKNOWN` | `UNKNOWN` | 未採用  [docs](https://docs.rs/utoipa-swagger-ui/latest/utoipa_swagger_ui/) |
| WS split | `futures-util` | `UNKNOWN` | axum 公式例で `SinkExt`,`StreamExt` 利用 | 未確定 | `UNKNOWN` | `UNKNOWN` | 未採用  [docs](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html) |
| 共通 runtime | `tokio` | `1.54.1` 表示 | `rt`,`rt-multi-thread`,`macros`,`sync`,`time`,`net`,`io-util`,`test-util` | `FACT` — default feature なし。 [FACT: [https://docs.rs/tokio/latest/tokio/](https://docs.rs/tokio/latest/tokio/) @ 1.54.1〈取得表示〉]  [docs](https://docs.rs/tokio/latest/tokio/) | `UNKNOWN` | `UNKNOWN` | 未採用 |
| CLI parser | `clap` | `4.6.7` 表示 | `derive` 利用例、三 trait | 未確定 | `UNKNOWN` — ページ本文の MSRV 記載を manifest の代替証拠にしない | `UNKNOWN` | 未採用  [docs](https://docs.rs/clap/latest/clap/) |
| CLI REST client | `reqwest` | `0.13.5` 表示 | `json`,`rustls`,`stream` | `INFERENCE` — 明示無効 | `UNKNOWN` | `UNKNOWN` | 未採用  [docs](https://docs.rs/reqwest/latest/reqwest/) |
| gRPC transport | `tonic` | `0.14.9` 表示 | `transport`,`codegen`,`router`,`tls-ring` | `INFERENCE` — 明示無効 | `UNKNOWN` | `UNKNOWN` | 未採用  [docs](https://docs.rs/tonic/latest/tonic/) |
| gRPC message | `prost` | `UNKNOWN` | 未検証 | 未確定 | `UNKNOWN` | `UNKNOWN` | 未採用 |
| gRPC codec | `tonic-prost` | `UNKNOWN` | 未検証 | 未確定 | `UNKNOWN` | `UNKNOWN` | 未採用 |
| gRPC generator | `tonic-prost-build` | `0.14.9` / `0.14.6` 表示競合 | `configure`,`compile_protos` | 未確定 | `UNKNOWN` | `UNKNOWN` | 版確定まで拒否  [docs](https://docs.rs/tonic-prost-build/latest/tonic_prost_build/) |
| MCP | `rmcp` | `3.9.0` | handler、transport、store trait の名前 | 未確定 | `UNKNOWN` | `UNKNOWN` | 未採用  [docs](https://docs.rs/rmcp/3.9.0/rmcp/all.html) |
| A2A model | `a2a-lf` | `UNKNOWN` | package/import 対応 | 未確定 | `UNKNOWN` | `UNKNOWN` | 未採用  [docs](https://docs.rs/a2a-lf/latest/a2a/) |
| A2A server | `a2a-server-lf` | `0.4.3` | executor、handler、store 再公開 | 未確定 | `FACT` — Apache-2.0、2026-08-28 の表示。MSRV 未確認。 [FACT: [https://docs.rs/a2a-server-lf/latest/a2a_server/all.html](https://docs.rs/a2a-server-lf/latest/a2a_server/all.html) @ 0.4.3〈取得表示〉]  [docs](https://docs.rs/a2a-server-lf/latest/a2a_server/all.html) | `UNKNOWN` — owner・公式認定・advisory 未確認 | 未採用 |

`INFERENCE` — 相互互換性の成立条件は、版番号の見た目ではなく、全対象 profile での依存解決、型一致、コンパイル、実行試験の成功とする。

`INFERENCE` — edition 2021 の workspace が依存する crate すべてに edition 2021 を要求する契約にはしない。検査対象は workspace package の edition、選定 toolchain での依存 graph 全体のビルド結果、プロジェクト MSRV である。

`UNKNOWN` — Rust 1.95 の実行証拠がないため、`axum` の宣言 MSRV が 1.80 であることから workspace 全体の 1.95 互換を推定しない。推移依存と build dependencies を含む `cargo +1.95.0 check --locked` の成功証拠が必要。

## 4. D3 — 検証できた API と、検証できていない signature

| Interface | Item / sequence | 検証範囲 | Source |
|---|---|---|---|
| REST | `Router::new().route("/", get(handler))` | `FACT` — 公式例で直接確認。generic bounds の全 signature は未抽出。 | [FACT: [https://docs.rs/axum/0.8.9/axum/](https://docs.rs/axum/0.8.9/axum/) @ 0.8.9]  [docs](https://docs.rs/axum/0.8.9/axum/) |
| REST | `.with_state(state)` → `Router<()>` | `FACT` — `Router<S>` は state が不足する router、`with_state` で供給するとの説明。 | [FACT: [https://docs.rs/axum/0.8.9/axum/](https://docs.rs/axum/0.8.9/axum/) @ 0.8.9]  [docs](https://docs.rs/axum/0.8.9/axum/) |
| REST | `State(state): State<Arc<AppState>>` | `FACT` — 公式例で確認。 | [FACT: [https://docs.rs/axum/0.8.9/axum/](https://docs.rs/axum/0.8.9/axum/) @ 0.8.9]  [docs](https://docs.rs/axum/0.8.9/axum/) |
| REST | `.route_layer(middleware::from_fn(auth))` | `FACT` — 公式例で確認。 | [FACT: [https://docs.rs/axum/0.8.9/axum/](https://docs.rs/axum/0.8.9/axum/) @ 0.8.9]  [docs](https://docs.rs/axum/0.8.9/axum/) |
| REST | `async fn auth(req: Request, next: Next) -> Result<Response, StatusCode>` | `FACT` — 公式例にこの形の関数あり。これは SDK 関数の signature ではなく例の middleware signature。 | [FACT: [https://docs.rs/axum/0.8.9/axum/](https://docs.rs/axum/0.8.9/axum/) @ 0.8.9]  [docs](https://docs.rs/axum/0.8.9/axum/) |
| WS | `ws.on_upgrade(handle_socket)` | `FACT` — 公式例で確認。 | [FACT: [https://docs.rs/axum/0.8.9/axum/extract/ws/index.html](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html) @ 0.8.9]  [docs](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html) |
| WS | `socket.split()` | `FACT` — `StreamExt` による concurrent read/write の公式例。 | [FACT: [https://docs.rs/axum/0.8.9/axum/extract/ws/index.html](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html) @ 0.8.9]  [docs](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html) |
| REST UI | `SwaggerUi::new(...).url(..., ApiDoc::openapi())` | `FACT` — 取得版の公式例で確認。版固定した依存型の一致は未検証。 | [FACT: [https://docs.rs/utoipa-swagger-ui/latest/utoipa_swagger_ui/](https://docs.rs/utoipa-swagger-ui/latest/utoipa_swagger_ui/) @ 10.0.2〈取得表示〉]  [docs](https://docs.rs/utoipa-swagger-ui/latest/utoipa_swagger_ui/) |
| MCP | `ServerHandler`, `StreamableHttpService`, `SessionManager`, `SessionStore`, `EventStore` | `FACT` — 名前の存在のみ。 | [FACT: [https://docs.rs/rmcp/3.9.0/rmcp/all.html](https://docs.rs/rmcp/3.9.0/rmcp/all.html) @ 3.9.0]  [docs](https://docs.rs/rmcp/3.9.0/rmcp/all.html) |
| A2A | `AgentExecutor`, `ExecutorContext`, `DefaultRequestHandler`, `RequestHandler`, `TaskStore`, `CallInterceptor` | `FACT` — root 再公開の存在のみ。 | [FACT: [https://docs.rs/a2a-server-lf/0.4.3/a2a_server/](https://docs.rs/a2a-server-lf/0.4.3/a2a_server/) @ 0.4.3]  [docs](https://docs.rs/a2a-server-lf/0.4.3/a2a_server/) |

`UNKNOWN` — D3 の「skeleton に使うすべての型・method・signature を掲載」は未達。item の名前、公式例の式、完全な関数 signature、実際のコンパイル結果を同一視しない。

## 5. 六つの ICS — 採用を阻止している不足と実装方法契約

### 5.1 REST ICS

`INFERENCE` — 選定候補は `axum 0.8.9`。公開 factory はプロジェクト定義の `router(state: AdapterState) -> axum::Router` に変更する。引数なしを維持する場合は、その factory が依存注入を受け取る別の composition root を仕様で定義する。

`INFERENCE` — 実行順序を次に固定する。これは SDK の仕様ではなく、要求された制約の実装方法契約である。

```text
request_id の検査・発行
→ trace context
→ CORS / preflight
→ protected route の credential verifier
→ body limit
→ decode / semantic request conversion
→ dispatcher
→ semantic response/error conversion
→ request_id response propagation
```

| 項目 | 契約 |
|---|---|
| `INFERENCE` — public/protected | protected router に auth を付与してから public router と合成する。合成後の auth 一括付与は禁止。 |
| `INFERENCE` — dispatcher | handler が呼べるアプリケーション entry point は注入された dispatcher のみ。operation implementation crate への adapter の依存は禁止。 |
| `INFERENCE` — auth | credential parsing と verification を分離。identity constructor の直接呼出しは禁止。 |
| `INFERENCE` — body limit | middleware の存在だけでなく oversized body が dispatcher に到達しないことを probe で検証する。 |
| `INFERENCE` — errors | auth、extractor、body limit、404/405、dispatcher の各 error path を共通 renderer に接続する。 |
| `INFERENCE` — OpenAPI | operation manifest と生成 document の operation ID、path、method、schema reference を集合比較する。 |
| `INFERENCE` — forbidden | `actix-web`、`warp`、`poem` の直接 production dependency、手書き HTTP server、直接 operation 呼出し。 |
| `UNKNOWN` — blocker | verifier・dispatcher・envelope 型、body limit 値、CORS allowlist、error mapping が未提示。これらを捏造せず compiling skeleton の発行を停止する。 |

`FACT` — Swagger UI の取得版は通常ビルドで UI archive を取得する構成を説明し、`vendored` feature をネットワーク不要環境向けとして説明している。 [FACT: [https://docs.rs/utoipa-swagger-ui/latest/utoipa_swagger_ui/](https://docs.rs/utoipa-swagger-ui/latest/utoipa_swagger_ui/) @ 10.0.2〈取得表示〉] [docs](https://docs.rs/utoipa-swagger-ui/latest/utoipa_swagger_ui/)

`INFERENCE` — reproducible build 契約では UI の非固定ネットワーク取得を禁止する。vendored crate の版・checksum を lockfile に含める。ただし対象版の manifest 未確認のため、今回の Cargo block には採用しない。

### 5.2 WebSocket ICS

`FACT` — `axum 0.8.9` の公式 upgrade と split の実装経路は確認できた。 [FACT: [https://docs.rs/axum/0.8.9/axum/extract/ws/index.html](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html) @ 0.8.9] [docs](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html)

`INFERENCE` — sequence を次に固定する。

```text
Origin 検査
→ ticket header の単一値抽出
→ ticket redemption
→ connection context 確定
→ on_upgrade
→ read/write split
→ bounded outbound queue
→ dispatcher stream bridge
→ close / cancellation / join / resource release
```

| 項目 | 契約 |
|---|---|
| `INFERENCE` — pre-accept auth | redemption 失敗時の probe で upgrade callback が呼ばれないことを検証する。 |
| `INFERENCE` — FIFO | 同じ resource key の dispatch 開始順を記録し、入力順と比較する。bounded queue の存在だけを FIFO の証拠にしない。 |
| `INFERENCE` — correlation | connection 内の request ID registry と operation stream ID を別管理する。重複 ID の規則は既存仕様から取り込む。 |
| `INFERENCE` — backpressure | queue capacity、最大 message size、enqueue deadline、close timeout を生成設定に固定する。queue 満杯を無期限待機にしない。 |
| `INFERENCE` — half-close | client-input-closed と server-output-ended を別状態として検査する。 |
| `INFERENCE` — cleanup | reader、writer、heartbeat、dispatch child task の終了と lease 解放を観測する。 |
| `INFERENCE` — forbidden | query ticket、unbounded channel、async task 内の blocking send、operation 直接呼出し。 |
| `UNKNOWN` — blocker | ticket header 名、redemption API、stream frame schema、capacity・timeout 値、close 1013 の正確な SDK 呼出しが未検証。 |
| `UNKNOWN` — driver | `duplex` だけで実際の HTTP upgrade path を成立させる harness は未検証。HTTP connection driver と client handshake の版固定実装が必要。 |

### 5.3 CLI ICS

`FACT` — clap の取得版に `Parser`、`Subcommand`、`Args`、`CommandFactory` が存在する。reqwest の取得版には非同期 Tokio client と JSON helper が存在する。 [FACT: [https://docs.rs/clap/latest/clap/](https://docs.rs/clap/latest/clap/) @ 4.6.7〈取得表示〉]  [FACT: [https://docs.rs/reqwest/latest/reqwest/](https://docs.rs/reqwest/latest/reqwest/) @ 0.13.5〈取得表示〉] [docs](https://docs.rs/clap/latest/clap/)

`INFERENCE` — sequence を固定する。

```text
fallible parse
→ validation
→ explicit local / REST / gRPC selection
→ credential acquisition
→ verifier / identity issuer または remote client
→ operation request
→ dispatcher / client
→ output renderer
→ exit-category conversion
```

| 項目 | 契約 |
|---|---|
| `INFERENCE` — generated commands | clap attributes は adapter の生成 command DTO のみに付与する。operation type に付与しない。 |
| `INFERENCE` — parse | parse 失敗時にプロセスを終了させる経路と `ExitCode` を返す経路を混在させない。全 output/exit を runner が所有する設計に固定する。 |
| `INFERENCE` — mode | network failure 時の local fallback を禁止。mode は入力設定だけで決まる。 |
| `INFERENCE` — output | stdout は結果専用。progress、warning、diagnostic は stderr。JSON と JSONL の同時指定を parse/validation で拒否する。 |
| `INFERENCE` — secrets | token/password/credential 本体を受け取る argv option を生成しない。file path、stdin、TTY 選択だけを生成する。 |
| `INFERENCE` — permission | file を開いた後、その同じ handle に対して owner・mode・file type を検査する。検査と read の対象を別 path lookup にしない。 |
| `INFERENCE` — forbidden | operation crate の clap dependency、argv secret option、stdout progress、暗黙 mode fallback。 |
| `UNKNOWN` — blocker | `LocalCredentialVerifier` と `LocalIdentityIssuer` はプロジェクト API として未提示。signature を発明しない。 |
| `UNKNOWN` — blocker | exit code table、secret file の OS 別許容権限、TTY backend、CLI runtime ownership が未確定。 |

### 5.4 gRPC ICS

`FACT` — tonic の取得版では `transport` と `codegen` に加え `router` が別 feature として説明されている。 [FACT: [https://docs.rs/tonic/latest/tonic/](https://docs.rs/tonic/latest/tonic/) @ 0.14.9〈取得表示〉] [docs](https://docs.rs/tonic/latest/tonic/)

| 項目 | 契約 |
|---|---|
| `INFERENCE` — generation | `.proto`、generator crate、protoc binary、include root、descriptor output をすべて version/hash 固定する。 |
| `INFERENCE` — check-in | checked-in generated source を正本にせず、再生成結果との差分ゼロを gate にする。 |
| `INFERENCE` — auth | metadata extraction → verifier → audience validation → identity extension → dispatcher とする。 |
| `UNKNOWN` — interceptor | 選定版 interceptor signature と非同期 verifier の適合性を未検証。非同期 verification を同期 interceptor 内で blocking 実行する skeleton は発行しない。 |
| `INFERENCE` — status | category mapping を共通 manifest から生成する。`google.rpc.Status` details も redaction 後のデータだけを構築する。 |
| `INFERENCE` — streams | unary、server stream、client stream、bidi を独立 test にする。一つの server-stream test で他の形を証明しない。 |
| `INFERENCE` — cancellation | client cancellation が dispatcher cancellation probe に到達し、child task と capacity permit が解放されることを検証する。 |
| `INFERENCE` — TLS | listener address と TLS policy を composition root で検査する。外部 TLS 終端を許す場合は trusted boundary の別契約を要求する。 |
| `INFERENCE` — forbidden | core/operation の protobuf dependency、手書き HTTP/2、service 内の business logic。 |
| `UNKNOWN` — blocker | proto、生成 trait、codec version、details message、deadline API、TLS config、正確な interceptor API が未確認。 |

### 5.5 MCP ICS

`FACT` — `rmcp 3.9.0` に `ServerHandler`、tool router、streamable HTTP service、session/event store trait、never-session manager の名前が存在する。 [FACT: [https://docs.rs/rmcp/3.9.0/rmcp/all.html](https://docs.rs/rmcp/3.9.0/rmcp/all.html) @ 3.9.0] [docs](https://docs.rs/rmcp/3.9.0/rmcp/all.html)

`INFERENCE` — `server() -> rmcp::Server` を廃止する。プロジェクト定義の HTTP router factory と SDK handler implementation に責任を分割する。未検証の SDK constructor を修正 signature として提示しない。

| 項目 | 契約 |
|---|---|
| `INFERENCE` — tools | operation manifest → generated tool registration → parameter conversion → dispatcher の単一路。 |
| `INFERENCE` — stateless の定義 | 「session 不使用」と「外部永続 session による instance stateless」を別 deployment profile とする。 |
| `INFERENCE` — resume | resume を要求する profile では、event log の永続性・cursor・retention を検証する。session ID 非発行だけで resume を証明しない。 |
| `INFERENCE` — auth | HTTP boundary で認証し、verified identity を handler context に注入する。downstream token passthrough を禁止する。 |
| `INFERENCE` — dual mode | JSON response と SSE response の両経路で同じ dispatcher probe を通過させる。 |
| `INFERENCE` — forbidden | 手書き JSON-RPC、production の local session map、sticky-session 前提、手書き SSE、全 stream の collect。 |
| `UNKNOWN` — blocker | `3.9.0` の feature map、config fields、GET/DELETE behavior、event ID、auth hooks、tool macro signature、in-process transport の正確な API が未検証。 |
| `UNKNOWN` — spec | 選定する MCP protocol revision が未固定。SDK 版だけで protocol semantics を確定しない。 |

### 5.6 A2A ICS

`FACT` — `a2a-server-lf 0.4.3` は `AgentExecutor`、`ExecutorContext`、`DefaultRequestHandler`、`RequestHandler`、`TaskStore`、`CallInterceptor` を root 再公開している。 [FACT: [https://docs.rs/a2a-server-lf/0.4.3/a2a_server/](https://docs.rs/a2a-server-lf/0.4.3/a2a_server/) @ 0.4.3] [docs](https://docs.rs/a2a-server-lf/0.4.3/a2a_server/)

| 項目 | 契約 |
|---|---|
| `INFERENCE` — construction | `A2aServer` を要求する現行宣言を撤回し、検証済み handler/executor/router 構成が確定してから factory を生成する。 |
| `INFERENCE` — shared execution | send と stream は同一 executor entry point を利用する。別々に business logic を実装しない。 |
| `INFERENCE` — TaskStore | tenant・owner を全 read/write/query/cancel path の必須 context にする。ID の取得可能性だけで権限を判定しない。 |
| `INFERENCE` — external state | task record、execution claim、event log、idempotency record の永続化要件を分離する。task record の保存だけで restart recovery を証明しない。 |
| `INFERENCE` — cancellation | durable task state と実行中 worker の cancellation の整合を検査する。 |
| `INFERENCE` — resubscribe | 別 instance が同じ durable log から cursor 以降の event を返す試験を要求する。 |
| `INFERENCE` — forbidden | production の in-memory task store、sticky session、手書き SSE、adapter 内 business logic。 |
| `UNKNOWN` — blocker | `TaskStore` required methods、async trait 形、error type、router constructor、event queue、SSE terminal behavior が未確認。trait impl を発明しない。 |
| `UNKNOWN` — ownership | package owner、release signer、repository governance、公式 SDK としての認定は未確認。repository namespace だけを公式性の証拠にしない。 |
| `UNKNOWN` — protocol | 取得した model documentation は A2A v1 と説明するが、要求された wire method 群との版対応を未確認。protocol revision の固定が必要。  [docs](https://docs.rs/a2a-lf/latest/a2a/) |

## 6. D5・D6 — 実装方法を強制する契約

### 6.1 正本ファイルと生成物

`INFERENCE` — 次の layout をプロジェクト契約として採用する。crate/API の未解決値を埋めるまで adapter source の生成は禁止する。

```text
contracts/
  inputs/
    operations.json
    behavior.json
    identity.json
    deployment.json
    okf-schema.json
  dependency-policy.json
  api-evidence.json
  source-policy.json
  tests.json
  attestation.json
templates/
  rest/
  websocket/
  cli/
  grpc/
  mcp/
  a2a/
generated/
  provenance.json
evidence/
  toolchain.json
  metadata.json
  features.txt
  build-results.json
  test-results.json
  supply-chain.json
```

`INFERENCE` — `api-evidence.json` の各 item は最低限、package、version、feature profile、item path、完全 signature、source URL、source digest、取得日時、compile-probe ID を持つ。`UNKNOWN` が一つでもあれば admission を拒否する。

`INFERENCE` — 生成マーカーは provenance の索引に限定する。マーカーの存在を生成物の真正性の証明にしない。保護された template/input revision からの再生成結果と byte equality を検証する。

### 6.2 dependency graph

`INFERENCE` — workspace の内部 crate 名は未提示であるため、以下は role ベースの policy とする。

| From role | Allowed | Forbidden |
|---|---|---|
| core | domain primitives | adapter、protocol SDK、CLI parser、protobuf generated |
| operation-contract | core | adapter、protocol SDK、storage implementation |
| dispatcher | operation-contract、identity contract | adapter |
| interface adapter | dispatcher contract、identity contract、当該 protocol SDK、transport DTO | operation implementation、business storage implementation |
| composition root | adapter、dispatcher implementation、verifier、store implementation | 制限は deployment policy に従う |
| test driver | 対象 adapter、probe、必要な protocol client | production dependency への混入 |

`INFERENCE` — 禁止条件は direct edge と transitive reachability を分ける。たとえば「REST adapter が `actix-web` を直接採用しない」と「graph 全体に `actix-web` が存在しない」は異なるルールとし、後者を無条件に適用しない。

`INFERENCE` — dependency checker の擬似コード：

```text
for each supported target and deployment profile:
    metadata = run_cargo_metadata(locked=true, feature_profile=profile)
    fail if command failed or JSON invalid

    verify package identity by:
        package name + exact version + source + checksum evidence

    verify:
        all workspace dependencies inherit approved declarations
        no unapproved registry / git / path source
        no workspace patches or replacements outside approved policy
        all required direct edges exist
        all forbidden direct edges are absent
        all forbidden reachability paths are absent
        resolved node feature sets match profile allowlists
        build dependencies are included
        target-conditional dependencies are evaluated

    fail on missing package, missing edge, missing feature, unknown source,
            unexpected duplicate identity or unclassified node
```

`INFERENCE` — feature 検査は manifest 記載と resolved feature closure の両方を対象にする。`default-features = false` の記載だけで「default feature が graph で有効になっていない」とは認定しない。

`INFERENCE` — `cargo tree -e features` は人間向け補助証拠として保存し、最終判定は structured metadata と profile ごとの compile probe で行う。文字列 grep のみの feature gate は禁止する。

### 6.3 source detector

`INFERENCE` — 必須 import や method 名の出現だけでは実装方法を証明しない。未到達コード、alias、同名関数、マクロ展開による迂回を拒否する必要があるため、次の四層で検証する。

| 層 | 検査 |
|---|---|
| AST | module layout、generated DTO、trait impl、禁止 attribute、禁止構文 |
| resolved identity | 呼出し先の crate・item identity、re-export、alias を解決 |
| generated equality | approved generator の再生成結果と一致 |
| runtime probe | verifier・dispatcher・store・cancellation の実際の通過と非通過 |

`INFERENCE` — detector が解釈できない macro、`include!`、動的 dispatch、build script 生成経路は silent pass しない。許可済み SDK macro または固定生成物以外は拒否し、例外は対象 node と理由を版固定した attestation に要求する。

`INFERENCE` — false-positive は rule の無効化で解消しない。狭い scope、expiry、reviewer、根拠、回帰試験を持つ exception record で解消する。

### 6.4 ready-to-paste normative rows

`INFERENCE` — 以下は新規プロジェクト規則。既存仕様と衝突する場合は既存 behavior を黙って変更せず、conflict record を必須とする。

| Rule ID | MUST text | Fixed/Open | Verification |
|---|---|---|---|
| `IMP-DEP-001` | The generator MUST emit only dependency identities and feature profiles admitted by the versioned dependency policy. | Fixed | metadata gate |
| `IMP-DEP-002` | The gate MUST reject every unresolved dependency, source, feature, advisory disposition, or license disposition. | Fixed | negative fixtures |
| `IMP-GEN-001` | Every generated adapter MUST equal regeneration from approved inputs and templates. | Fixed | byte comparison |
| `IMP-SRC-001` | Required-call checks MUST resolve item identity and MUST reject unresolved analysis. | Fixed | detector fixtures |
| `IMP-REST-001` | Every protected REST request MUST pass the injected verifier before body decoding and dispatcher invocation. | Fixed | order probe |
| `IMP-REST-002` | REST handlers MUST invoke the dispatcher and MUST NOT invoke operation implementations directly. | Fixed | graph + call identity |
| `IMP-WS-001` | Origin validation and ticket redemption MUST complete before the upgrade callback is accepted. | Fixed | handshake + probe |
| `IMP-WS-002` | Every WebSocket application queue MUST have a generated finite capacity and a tested overload policy. | Fixed; limits Open | source + overload test |
| `IMP-CLI-001` | Operation crates MUST NOT depend on clap or contain clap parsing attributes. | Fixed | graph + AST |
| `IMP-CLI-002` | The generated CLI MUST NOT accept credential contents through argv and MUST reserve stdout for result output. | Fixed | command manifest + process test |
| `IMP-GRPC-001` | Protobuf types MUST remain outside core and operation-contract crates. | Fixed | graph + resolved types |
| `IMP-GRPC-002` | Every gRPC call MUST propagate verified identity, deadline, and cancellation through the dispatcher boundary. | Fixed | four-shape protocol tests |
| `IMP-MCP-001` | MCP methods and transports MUST use the admitted SDK implementation and MUST NOT use handwritten JSON-RPC or SSE framing. | Fixed | resolved calls + wire test |
| `IMP-MCP-002` | Every resumable deployment MUST pass cross-instance and restart replay tests without sticky routing. | Fixed | multi-process test |
| `IMP-A2A-001` | A2A send and stream methods MUST use one shared executor path. | Fixed | executor probe |
| `IMP-A2A-002` | Every task and event access MUST enforce tenant and owner authorization through the external persistence boundary. | Fixed | negative ownership tests |
| `IMP-GATE-001` | Missing tests, zero selected tests, skipped mandatory tests, missing evidence, and detector failures MUST reject admission. | Fixed | gate self-tests |
| `IMP-ATT-001` | Human attestations MUST bind the source revision, lockfile digest, template revision, reviewer, scope, and expiry. | Fixed | attestation schema |

### 6.5 gate semantics

`INFERENCE` — custom gate の終了コードは次に固定する。これは Cargo や supply-chain tool 自体の exit code 仕様ではない。

| Exit | 意味 |
|---:|---|
| `0` | 全必須 evidence と test が成功 |
| `10` | 入力契約不足・schema 不正 |
| `20` | dependency / feature / source 違反 |
| `30` | scaffold / source detector 違反 |
| `40` | build / API probe 失敗 |
| `50` | protocol / method proof test 失敗 |
| `60` | supply-chain disposition 不成立 |
| `70` | attestation 不足・期限切れ |
| `80` | infrastructure failure / 証拠取得不能 |

`INFERENCE` — `80` を warning 扱いにしない。CI 順序は input validation → dependency resolution → supply-chain → regeneration → source analysis → build → method proof → deployment proof → attestation → admission とする。

`UNKNOWN` — exact `deny.toml`、cargo-deny / cargo-vet / cargo-audit の版、引数、設定 schema は今回未検証。したがって ready-to-paste と称する設定は提示しない。license allowlist を MIT/Apache-2.0 だけに固定して全 graph が通るとの主張もしない。選定 tool 版の公式 schema と実際の lockfile が必要。

## 7. D8 — method proof test matrix

`INFERENCE` — 以下の test 名・driver・期待値は契約案。実装済み・実行済みの test ではない。全行に個別 evidence を要求し、名前が一致する test が存在するだけでは合格にしない。

`INFERENCE` — `M(name)` は project-owned gate が `tests.json` の当該 ID を実行する記法とする。gate executable は未実装のため、現時点では exact executable command ではない。

| ID / test name | Interface | Invariant | Test type | Driver | Command | Expected |
|---|---|---|---|---|---|---|
| `rest_route_manifest` | REST | route exists | integration | router | `M(rest_route_manifest)` | manifest 全 route に到達 |
| `rest_auth_order` | REST | auth | method probe | router + verifier/dispatcher probe | `M(rest_auth_order)` | 未認証で decode/dispatch なし |
| `rest_envelope_parity` | REST | envelope | golden | router | `M(rest_envelope_parity)` | behavior fixture 一致 |
| `rest_error_paths` | REST | error mapping | negative | router | `M(rest_error_paths)` | 全 rejection path 一致 |
| `rest_openapi_equal` | REST | OpenAPI equality | structural | document generator | `M(rest_openapi_equal)` | operation/schema 集合一致 |
| `ws_ticket_redeem_once` | WS | ticket | integration | HTTP upgrade | `M(ws_ticket_redeem_once)` | redeem 一回、再利用拒否 |
| `ws_origin_reject` | WS | origin | negative | HTTP upgrade | `M(ws_origin_reject)` | callback 未実行 |
| `ws_upgrade_auth_reject` | WS | upgrade rejection | negative | HTTP upgrade | `M(ws_upgrade_auth_reject)` | socket 未受理 |
| `ws_correlation` | WS | correlation | protocol | socket client | `M(ws_correlation)` | ID 対応一致 |
| `ws_resource_fifo` | WS | ordering | concurrency | socket + dispatch probe | `M(ws_resource_fifo)` | resource ごとの順序一致 |
| `ws_stream_lifecycle` | WS | open/item/end/close/cancel | state-machine | socket client | `M(ws_stream_lifecycle)` | 全 transition と half-close |
| `ws_backpressure` | WS | bounded queue | overload | slow reader | `M(ws_backpressure)` | capacity 境界、1013 policy |
| `ws_cleanup` | WS | cleanup | cancellation | socket + task/lease probe | `M(ws_cleanup)` | task・lease 残留なし |
| `cli_command_tree` | CLI | generated tree | structural | parser | `M(cli_command_tree)` | manifest 一致 |
| `cli_dispatch_mode` | CLI | local/remote | method probe | injected runner | `M(cli_dispatch_mode)` | 選択した entry のみ呼出し |
| `cli_stdio` | CLI | stdout/stderr | process | subprocess | `M(cli_stdio)` | stdout 結果専用 |
| `cli_json_jsonl` | CLI | JSON/JSONL | process | subprocess | `M(cli_json_jsonl)` | framing と競合指定拒否 |
| `cli_exit_categories` | CLI | exit codes | process | subprocess | `M(cli_exit_categories)` | 全 category 一致 |
| `cli_argv_secret_reject` | CLI | no argv secrets | negative | parser + subprocess | `M(cli_argv_secret_reject)` | secret option 不受理 |
| `grpc_regeneration` | gRPC | proto | regeneration | pinned generator | `M(grpc_regeneration)` | 差分ゼロ |
| `grpc_auth_audience` | gRPC | auth | negative | protocol client + probe | `M(grpc_auth_audience)` | audience 不一致で dispatch なし |
| `grpc_status_details` | gRPC | status mapping | golden | protocol client | `M(grpc_status_details)` | code/details/redaction 一致 |
| `grpc_four_shapes` | gRPC | unary/streams | protocol | protocol client | `M(grpc_four_shapes)` | 四形を個別実行 |
| `grpc_deadline` | gRPC | deadline | timing/probe | protocol client | `M(grpc_deadline)` | dispatcher に deadline 到達 |
| `grpc_cancel` | gRPC | cancellation | protocol/probe | protocol client | `M(grpc_cancel)` | child task・permit 解放 |
| `grpc_tls_boundary` | gRPC | TLS | deployment | real TLS listener | `M(grpc_tls_boundary)` | 外部 plaintext 拒否 |
| `mcp_tools` | MCP | tool mapping | structural/protocol | SDK client | `M(mcp_tools)` | tool と operation 一致 |
| `mcp_auth` | MCP | auth | HTTP negative | HTTP client | `M(mcp_auth)` | discovery/challenge/audience |
| `mcp_cross_instance` | MCP | stateless | deployment | two instances | `M(mcp_cross_instance)` | affinity なし |
| `mcp_restart` | MCP | restart | fault | process supervisor | `M(mcp_restart)` | profile の回復要件一致 |
| `mcp_dual_mode` | MCP | JSON/SSE | protocol | HTTP client | `M(mcp_dual_mode)` | 両経路が同じ dispatch |
| `mcp_resume` | MCP | SSE resume | replay | two instances + event store | `M(mcp_resume)` | cursor 以降を再生 |
| `mcp_cancel` | MCP | cancellation | protocol/probe | SDK client | `M(mcp_cancel)` | dispatch cancellation |
| `mcp_progress` | MCP | progress | protocol | SDK client | `M(mcp_progress)` | token/correlation 一致 |
| `a2a_skills_card` | A2A | skill/card | structural/protocol | HTTP client | `M(a2a_skills_card)` | manifest 一致 |
| `a2a_owner_isolation` | A2A | ownership | negative | two tenants | `M(a2a_owner_isolation)` | 他 tenant の全 access 拒否 |
| `a2a_external_store` | A2A | external store | method probe | store proxy | `M(a2a_external_store)` | 全永続操作が外部境界を通過 |
| `a2a_cross_instance` | A2A | stateless | deployment | two instances | `M(a2a_cross_instance)` | affinity なし |
| `a2a_restart` | A2A | restart/dedup | fault | process supervisor | `M(a2a_restart)` | claim・dedup・event 回復 |
| `a2a_send_stream` | A2A | dual mode | protocol/probe | A2A client | `M(a2a_send_stream)` | shared executor、terminal 一致 |
| `a2a_cancel` | A2A | cancellation | protocol/store | A2A client | `M(a2a_cancel)` | durable state と実行停止整合 |
| `a2a_resubscribe` | A2A | resubscribe | replay | second instance | `M(a2a_resubscribe)` | 継続 event 取得 |
| `cross_operation_parity` | cross | operation parity | differential | six clients | `M(cross_operation_parity)` | 正規化結果一致 |
| `cross_request_id` | cross | request_id | differential | six clients | `M(cross_request_id)` | 境界を越えて追跡可能 |
| `cross_error_category` | cross | error parity | differential | six clients | `M(cross_error_category)` | category 一致 |
| `dependency_contract` | dependency | crate/feature/edges | static | metadata checker | `M(dependency_contract)` | required 存在、forbidden 不在 |
| `source_contract` | source | API/patterns | static | resolved detector | `M(source_contract)` | item identity と生成一致 |

`INFERENCE` — 純粋な in-process driver だけでは、process restart、load balancer affinity、proxy buffering、実際の CLI exit、TTY、OS permission、外部 TLS 終端を証明しない。これらには subprocess、複数 instance、実 proxy、実 filesystem/TTY を用いる。

`INFERENCE` — router の in-process request は HTTP upgrade 完了の証拠にしない。WebSocket 試験では HTTP connection と upgrade callback まで実行する harness を要求する。

## 8. D9 — Risk register と既存要求の衝突

| ID | 分類 | Severity / Likelihood | 内容 | Mitigation / owner decision |
|---|---|---|---|---|
| `R01` | `UNKNOWN` | Critical / 未評価 | cutoff 時点の latest 未確定 | registry snapshot と公開日時を固定 |
| `R02` | `UNKNOWN` | Critical / 未評価 | API signature、feature、compile 未検証 | exact-version source、compile probe |
| `R03` | `INFERENCE` | High / High | latest docs を同時採用すると異なる major 型が混在する危険 | manifest dependency requirements と resolved types を検証 |
| `R04` | `UNKNOWN` | Critical / 未評価 | advisory と owner 未監査 | lockfile 全体の supply-chain evidence |
| `R05` | `INFERENCE` | High / High | template marker は手編集・偽装を防がない | 再生成一致、保護 branch、review |
| `R06` | `INFERENCE` | High / High | method 名 grep は未到達コードで通過する | resolved identity + runtime probe |
| `R07` | `INFERENCE` | Critical / Medium | local store の禁止だけでは affinity を排除できない | execution claim/event log を含む cross-instance test |
| `R08` | `INFERENCE` | High / Medium | proxy による SSE buffering と idle timeout | 実 ingress 経由で first-event latency と heartbeat を測定 |
| `R09` | `INFERENCE` | Critical / Medium | credential、metadata、details の秘密漏洩 | redaction fixture、ログ capture、human dataflow review |
| `R10` | `INFERENCE` | High / Medium | sleep ベースの concurrency test が flaky | barrier、probe、仮想時間、bounded deadlines |
| `R11` | `UNKNOWN` | Critical / 未評価 | MCP の no-session と resumability の同時要件 | deployment profile と protocol revision を確定 |
| `R12` | `UNKNOWN` | Critical / 未評価 | A2A protocol revision と wire method の対応 | 選定仕様の版固定 conformance fixture |
| `R13` | `UNKNOWN` | Critical / 未評価 | 元 behavior specification 未提示 | operation/envelope/error/auth/stream/exit の正本入力 |
| `R14` | `INFERENCE` | High / High | 一切の `HashMap` 禁止は connection-local correlation まで誤拒否 | 禁止対象を authoritative session/task store に限定 |
| `R15` | `INFERENCE` | Critical / Medium | adapter の business logic 不在は一般的な AST 検査だけでは完全証明できない | restricted template、依存境界、差分 review、attestation |
| `R16` | `INFERENCE` | High / Medium | 無制限の exception で fail-closed が空洞化 | expiry・scope・reviewer・回帰試験付き例外だけ許可 |

### 8.1 人間による確認が残る項目

`INFERENCE` — 次は機械検査だけで完全に確定しないため attestation を要求する。

| Attestation | 必須 evidence |
|---|---|
| business logic の adapter 混入なし | generated diff、許可 call graph、reviewer |
| SDK ownership / governance の受容 | owner 一覧、repository governance、署名・公開履歴 |
| 認証 boundary の妥当性 | audience、tenant binding、trusted proxy、token flow |
| production store の障害意味論 | consistency、claim fencing、retention、recovery test |
| 既存 behavior との非衝突 | behavior revision、conflict list、承認者 |
| license policy | 全 graph の license expression と承認 disposition |

### 8.2 OKF atom

`UNKNOWN` — `type`、`phase`、`delivery`、`applies_to`、`requires`、`references` の正規 schema と許容 enum が提示されていない。値を発明した ready-to-paste atom は出力しない。影響：Q8.6 と acceptance criterion 13 の OKF 部分は未達。解決：versioned OKF schema と既存 atom の適合例が必要。

## 9. Deliverable acceptance status

| Deliverable | Status | 不足 |
|---|---|---|
| D1 Audit | 部分完了 | 全 package・全 feature・全 signature の版固定監査 |
| D2 Matrix | 未合格 | cutoff、MSRV、license、maintenance、advisory、互換性 |
| D3 API table | 部分完了 | 完全 signature、source permalink、compile probes |
| D4 六 ICS | 未合格 | exact Cargo block、compiling skeleton、実 test |
| D5 Enforcement | 設計案 | 実装・tool pin・self-test |
| D6 Normative block | 提案済み | 元仕様との conflict review、OKF schema |
| D7 Scaffold content | 未合格 | verified imports・trait impl・config defaults |
| D8 Test matrix | 契約案 | exact executable commands・実 test implementation |
| D9 Risks | 提案済み | project owner の disposition |
| D10 Decision | admission 拒否 | 以下 |

## Decision

| Interface | 一つの候補系統 | 現時点の決定 |
|---|---|---|
| REST | `axum 0.8.9` + Tower middleware + generated dispatcher adapter | `INFERENCE` — `UNQUALIFIED`。axum 自体の版・feature・主要経路は確認。関連 crate の互換性と compiling skeleton の証拠不足。 |
| WebSocket | `axum 0.8.9` の upgrade + split + bounded bridge | `INFERENCE` — `UNQUALIFIED`。upgrade/split は確認。ticket・stream protocol・queue・cleanup・driver の版固定証拠不足。 |
| CLI | clap generated command DTO + explicit local/REST/gRPC runner | `INFERENCE` — `UNQUALIFIED`。command trait は確認。版 matrix、identity API、exit/secret policy、実行証拠不足。 |
| gRPC | tonic + prost 系の生成 service + dispatcher bridge | `INFERENCE` — `UNQUALIFIED`。四 crate の正確な互換版、生成 trait、auth/deadline/cancel API が未確定。 |
| MCP | `rmcp` の `ServerHandler` + SDK streamable HTTP service | `INFERENCE` — 現行 `rmcp::Server` 宣言は修正対象。採用は `UNQUALIFIED`。stateless/resume/API の証拠不足。 |
| A2A | `a2a-lf` / `a2a-server-lf` 系 handler・executor・外部 store | `INFERENCE` — package/import 対応は部分確認。現行 `A2aServer` 宣言は修正対象。採用は `UNQUALIFIED`。TaskStore・protocol・ownership・compile 証拠不足。 |

`UNKNOWN` — 六 interface のいずれについても、今回の証拠から「全要求を満たす実装が完成した」「他の候補も含めて NONE QUALIFIES」とは証明できない。正確な admission 結果は「候補あり、採用証明未成立」。canonical compiling skeleton、exact workspace pin、exact deny configuration を含む完成契約としては承認しない。
