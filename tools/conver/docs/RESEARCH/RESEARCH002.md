# RESEARCH002 — 監査訂正・追加正本の適用・実行証拠

- INFERENCE — 本書は部分納品。D1–D4/D6/D7 完成物ではない。admission は REJECT。
- INFERENCE — 六界面の判定は UNQUALIFIED を維持する。SDK 機能不足を証明していないため NONE QUALIFIES に変更しない。
- FACT（環境観測）— cargo、rustc、rustup の実行ファイルは存在しない。指定された 10-CONTRACTS.md と CORE-01.md も実行環境に存在しない。環境証拠は添付 JSON に保存した。
- FACT（コネクタ観測）— GitHub コネクタは DISCONNECTED。リポジトリの読み書きは行っていない。
- INFERENCE — ユーザー貼付の seam、依存宣言、CLI exit table、OKF atom 例を今回の正本として使う。元ファイルを読んだとは主張しない。

## D1 — 前回答の訂正

| ID | 訂正 | 分類・処置 |
|---|---|---|
| COR-01 | REST の axum=json、tower-http=cors/trace は正しく分離されている。 | FACT（提示正本 §2.1/§3.3）。前回答の feature 誤帰属に基づく不正疑義を撤回する。 |
| COR-02 | WS の axum=ws、tokio=sync/time、futures-util=指定なし。 | FACT（提示正本 §2.1/§3.3）。不足 feature は選定 profile の検証後に追加理由を示す。 |
| COR-03 | router/server/service/run は project factory。 | FACT（提示正本 §2.2）。SDK に同名関数がないことを不正判定に使わない。 |
| COR-04 | rmcp::Server の不存在証明は未完了。 | UNKNOWN。SPEC-API-INVALID を撤回し SPEC-API-SUSPECT とする。source、cfg/re-export、all-features、import probe が必要。 |
| COR-05 | a2a_server::A2aServer の不存在証明は未完了。 | UNKNOWN。SPEC-API-INVALID を撤回し SPEC-API-SUSPECT とする。source、cfg/re-export、all-features、import probe が必要。 |
| COR-06 | project TaskStore と SDK TaskStore は別 contract。 | FACT（提示正本 §3.2）。SDK trait の実装 adapter を独立に検証する。 |
| COR-07 | a2a-lf の版が不明な pair は採用しない。 | INFERENCE。単独 package の実在と相互互換性を分離する。 |
| COR-08 | OKF enum は提示された観測値に限定。 | FACT（提示正本 §3.4）。非 mcp の applies_to 値を類推生成しない。 |
| COR-09 | IMP-* は横断 enforcement に限定。 | FACT（提示正本 §4.4）。前回答の IMP-REST/WS/CLI/GRPC/MCP/A2A は registry 登録用 ID として採用しない。 |

## 今回追加取得した一次資料

### axum

FACT — 固定版 0.8.9 の公式文書は json と ws を axum feature として記載する。json は既定有効、ws は既定無効。Router、State、with_state、route_layer の公式例を掲載する。
[FACT: https://docs.rs/axum/0.8.9/axum/ @ 0.8.9] [web:34]

INFERENCE — 正しい依存宣言には feature 誤帰属がない。実際の feature closure と補助 crate の版は未解決であり、REST 全体を VALID に昇格させない。

### A2A model

FACT — a2a-lf 0.4.2 の固定版 package page が取得できた。package は a2a-lf、Rust import 名は a2a と明記されている。
[FACT: https://docs.rs/crate/a2a-lf/0.4.2 @ 0.4.2] [web:55]

FACT — 同じ 0.4.2 page 内の Install 例は version = "0.2" のままである。
[FACT: https://docs.rs/crate/a2a-lf/0.4.2 @ 0.4.2] [web:55]

INFERENCE — README の install snippet を当該 release の dependency requirement の証拠として使わない。0.4.2 の存在は確認したが、最新安定版とは認定しない。a2a-server-lf 0.4.3 との pair も認定しない。

UNKNOWN — crates.io API の a2a-lf と a2a-server-lf は今回取得失敗。公開日、yank、license、MSRV、owner、両者の dependency requirement は未確定。影響：A2A version matrix は UNQUALIFIED。解決：registry metadata、両 manifest、解決済み lockfile。

### A2A server

FACT — a2a-server-lf 0.4.3 の crate root に AgentExecutor、ExecutorContext、DefaultRequestHandler、RequestHandler、CallInterceptor、TaskStore の再公開を確認した。
[FACT: https://docs.rs/a2a-server-lf/0.4.3/a2a_server/ @ 0.4.3] [web:18]

UNKNOWN — 固定版 source と all-features の取得に失敗した。root 一覧に A2aServer がないことだけでは不存在を確定しない。SPEC-API-SUSPECT を維持する。

### MCP

UNKNOWN — rmcp 3.9.0 の registry API、固定版 lib source、feature page の取得に失敗した。rmcp::Server の存在／不存在を決着できない。SPEC-API-SUSPECT を維持する。HTTP service factory の正確な戻り値型も未確定。

## プロジェクト seam の確定事項

| 項目 | 今回の正本 | 実装方法契約 |
|---|---|---|
| authentication | FACT（提示正本）— AccessTokenVerifier::verify は同期 Result<Arc<VerifiedIdentity>, AuthenticationError>。 | INFERENCE — 認証 hook の async/sync 不適合という前回答の project-seam blocker を解除。SDK interceptor signature の検証は別問題。 |
| identity | FACT（提示正本）— verifier が Arc<VerifiedIdentity> を返す。 | INFERENCE — adapter は VerifiedIdentity を構築しない。認証済み値を execute_verified 系に渡す。 |
| public operation | FACT（提示正本）— execute_anonymous 系は PeerInfo を取る。 | INFERENCE — public/protected を generated operation metadata で分ける。失敗時の anonymous fallback を禁止。 |
| dispatch | FACT（提示正本）— interface、audience、operation、wire、request を全形が受け取る。 | INFERENCE — generated mapping が全引数を一度だけ構築し、対応する一つの dispatcher entry に渡す。 |
| wire | FACT（提示正本）— request_id、deadline_unix_ns、idempotency_key、trace_id。 | INFERENCE — transport conversion と dispatcher forwarding を別々に test する。 |
| reply | FACT（提示正本）— SemanticReply は request_id と SemanticOutcome。 | INFERENCE — response body を任意の JSON envelope に置き換えない。 |
| A2A ownership | FACT（提示正本）— TaskOwner は subject と optional tenant。load/save に owner 必須。 | INFERENCE — SDK adapter に owner を省略する path を設けない。 |
| task store | FACT（提示正本）— load は Option<Value>、save は Result<(), String>。 | INFERENCE — SDK error mapping、event log、claim、dedup をこの seam から自動的に導けるとは主張しない。 |
| CLI exits | FACT（提示正本）— 0,2,3,4,5,6,7,8,130。 | INFERENCE — 既定値や汎用 exit=1 を作らず、提示表を runner の正本にする。 |

INFERENCE — 提示された Dispatcher の宣言は説明用略記を含む。これは新たな質問理由にしない。一方、実際の project crate の import path、stream handle layout、OperationResultBody→SemanticReply conversion を発明したコードを project API として表示しない。compile fixture に必要な補助型は fixture-only と明示し、real-project integration と区別する。

## compile と lockfile の実行契約

FACT — Cargo の --locked は lockfile がない場合、または resolution が lockfile を変更する場合に error となる。
[FACT: https://doc.rust-lang.org/cargo/commands/cargo-check.html @ 取得した公式文書・Cargo 1.95 固定版ではない] [web:59]

FACT — cargo generate-lockfile は lockfile を生成し、既存 lockfile がある場合は再生成する。
[FACT: https://doc.rust-lang.org/cargo/commands/cargo-generate-lockfile.html @ 取得した公式文書・Cargo 1.95 固定版ではない] [web:61]

INFERENCE — 新規 workspace の lockfile bootstrap と再現検査を分離する。以下は実行手順案であり、今回実行していない。Cargo 1.95 上でのコマンド検証も未実施。

```sh
# Bootstrap: approved direct versions + admitted registry snapshot only.
cargo +1.95 generate-lockfile
# Review lockfile, resolved closure, licenses, advisories, checksums.
# Record SHA-256, then commit Cargo.lock.
cargo +1.95 metadata --locked --format-version 1 > metadata.json
cargo +1.95 tree --locked -e features > features.txt
cargo +1.95 check --locked --workspace --all-targets
```

INFERENCE — bootstrap が 2026-11-12 後に動く場合、direct dependency だけを固定しても、推移依存が cutoff 後になる危険を除去しない。cutoff 用 registry snapshot または当時の承認済み lockfile を要求する。

UNKNOWN — この環境に Cargo がないため lockfile を生成していない。Cargo.lock の digest と advisory DB revision は null。check の exit code も null。これらを PASS、0、空文字 digest に置き換えない。

## API suspect の決着手順

INFERENCE — package ごとに次をすべて証拠化する。

1. registry checksum と source archive の digest を照合する。
2. lib target 名、root module、pub use、cfg、macro-generated export を追跡する。
3. default-disabled、production profile、all-features を分ける。
4. source text search は候補抽出に限定し、存在／不存在の最終証明にしない。
5. all-features doc と exact-import compile probe を実行する。
6. source trace と compile diagnostic が一致した場合だけ INVALID または VALID に変更する。
7. all-features 自体が conflict または platform constraint で build 不可能なら UNKNOWN を維持し、失敗原因を保存する。

UNKNOWN — rmcp::Server と a2a_server::A2aServer はこの手順未完了。代替 factory の正確な signature を verified として生成しない。

## metadata 必須検査

INFERENCE — direct declaration、resolved identity、target/profile closure を分ける。

- workspace dependency の version requirement が exact であること。
- package alias と lib target 名を区別すること。
- default-features policy と resolved features を両方検査すること。
- build dependency と target-conditional dependency を含めること。
- approved source、package/version、checksum evidence を照合すること。
- adapter→dispatcher contract を要求し、adapter→operation implementation を拒否すること。
- core/operation→transport SDK を拒否すること。
- patch/replacement/git source を policy にない限り拒否すること。
- metadata の失敗、JSON 不正、未知 node、未知 feature を fail-closed にすること。

## Conflict records

| ID | 対象 | 前回答との衝突 | 処置 |
|---|---|---|---|
| CR-001 | REST/WS dependency | feature の誤帰属 | 前回答の該当疑義を撤回。提示 block を正本化。 |
| CR-002 | factory | 引数なし factory を勝手に state 引数付きへ変更 | 公開 seam を自動変更しない。DI は composition plan として別管理。 |
| CR-003 | MCP/A2A API | all.html だけで INVALID とした | SUSPECT に降格。source/all-features/import probe 待ち。 |
| CR-004 | A2A store | SDK trait と project seam の同一視 | 独立 adapter layer として検証。 |
| CR-005 | rule IDs | interface-specific IMP-* | 横断以外の IMP-* を撤回。既存 registry の採番確認後に既存 prefix を拡張。 |
| CR-006 | MCP persistence | session state lives in adapter と外部 session store | INFERENCE — adapter の所有責務と物理配置を分離。ただし business table 判定は元仕様 review を要する。 |
| CR-007 | OKF | applies_to を interface 名から類推 | mcp 以外は生成しない。既存 atom の取得・提示を待つ。 |

## D1–D7 acceptance ledger

| Deliverable | 状態 | 今回追加したもの | 未完了 |
|---|---|---|---|
| D1 | PARTIAL | 誤帰属撤回、factory 区別、SUSPECT 再分類 | source/all-features の決着 |
| D2 | INCOMPLETE | a2a-lf 0.4.2 の固定版実在 | 全 package の cutoff metadata と互換 lockfile |
| D3 | INCOMPLETE | fixed-version document の再取得 | 全 signature、manifest、compile probe |
| D4 | NOT DELIVERED | seam 適用方針 | 六つの exact Cargo/skeleton |
| D5 | DEFERRED | metadata 検査項目 | compile probe 後の実装 |
| D6 | DRAFT ONLY | IMP prefix と conflict の訂正 | 既存採番と各 MUST の実装検証 |
| D7 | NOT DELIVERED | 生成停止理由の明示 | 正確な imports/traits/config |
| D8 | DEFERRED | 未実行を PASS としない契約 | 実 test driver/command |

INFERENCE — compile 未実施の skeleton が存在する場合のラベルは PROPOSED-NOT-COMPILED。本納品は六 skeleton 自体を出していないため、報告書全体をそのラベルで偽装せず BLOCKED-NOT-COMPILED とする。

## Decision

INFERENCE — REST、WebSocket、CLI、gRPC、MCP、A2A はすべて UNQUALIFIED。RESEARCH002 の完全納品条件は未達。修正済み D1 と取得証拠を部分納品する。未取得 source・未実行 compile・未生成 lockfile を事実に昇格させない。
