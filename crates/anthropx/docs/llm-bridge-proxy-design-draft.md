# LLM Bridge Proxy Server 設計書ドラフト

## 概要

本設計は、`llm-bridge-core` を変換コアとして利用し、Claude Code から利用可能な **Anthropic 互換 API プロキシサーバー**を Rust でワンバイナリとして提供するための完全設計を定義するものである。[cite:17][cite:19][cite:66]
外向きの API 面は Anthropic Messages API を中心に公開し、内部では provider ごとに **透過転送**または **Anthropic→OpenAI 互換翻訳**を切り替えて upstream へ中継する。[cite:17][cite:19][cite:66]

本サーバーの主要目的は次の 4 点である。

- Claude Code が `ANTHROPIC_BASE_URL` を切り替えるだけで利用できる Anthropic 互換 endpoint を提供すること。[cite:61][cite:66]
- 1 つの endpoint の背後に複数 provider を集約し、`provider/model` 形式の model 指定で適切にルーティングすること。[cite:66]
- provider ごとに複数 API key と複数 model を管理し、起動時乱択 + 以後 round-robin の key 選択を行うこと。[cite:66]
- OpenAI 互換 upstream に対しては `llm-bridge-core` によって Anthropic Messages API と streaming SSE を翻訳し、Claude Code 互換の運用を成立させること。[cite:17][cite:19]

## 目的と非目的

### 目的

本システムは **Anthropic 互換 front door** を 1 つ提供し、各 provider を設定ファイルで追加・差し替え可能にする。[cite:61][cite:66]
また、`llm-bridge-core` が担う protocol transformation と、サーバーが担う routing・auth・scheduling・observability を明確に分離することで、Rust 実装を単純かつ保守可能に保つ。[cite:17][cite:19]

### 非目的

本システムは model 推論そのものを行わず、provider の学習・量子化・推論実装には責任を持たない。[cite:66]
また、外部 DB、Redis、永続ジョブキューなどの外部状態管理を導入せず、単一プロセス・メモリ内状態のみで動作する。[cite:66]

## 設計原則

- 単一責務: protocol translation は `llm-bridge-core` に委譲し、HTTP gateway と policy は本サーバーが担う。[cite:17][cite:19]
- ワンバイナリ: 実行に必要なのはバイナリと `-c` で指定する TOML のみとする。[cite:66]
- 明示的ルーティング: model 指定は `provider/model` を基本とし、曖昧な default provider ルーティングは行わない。[cite:66]
- provider 主導設定: upstream URL、認証、モデル公開名、エイリアス、timeout、queue、lossy 許容などを provider 単位で制御する。[cite:17][cite:19]
- 可観測性内蔵: `/healthz`、`/metrics`、構造化ログを初版から含める。[cite:66]

## システム境界

### 変換コアの責務

`llm-bridge-core` は、Anthropic Messages API と OpenAI 系 API の間で request payload、response payload、streaming SSE events を変換するライブラリとして扱う。[cite:17][cite:19]
さらに、未対応機能について explicit lossy downgrade を提供するため、翻訳の中心的意味論は crate に委譲する。[cite:17]

### プロキシサーバーの責務

本サーバーは次を担当する。

- TOML 設定の読込と検証。
- HTTP endpoint の公開。
- `provider/model` 解析と alias 解決。
- provider / model / key 選択。
- transparent / translate 分岐。
- upstream 認証 header の注入。
- retry / failover / timeout / queue 制御。
- `/v1/models` 合成。
- ログ、メトリクス、ヘルスチェック提供。

これらは `llm-bridge-core` の説明範囲には含まれておらず、gateway 実装側で定義する必要がある。[cite:17][cite:19]

## 全体アーキテクチャ

クライアントは本サーバーの Anthropic 互換 endpoint に対して `/v1/messages` などを送信する。[cite:61][cite:66]
サーバーは request の `model` を `provider/model` として解釈し、provider 設定に従って transparent または translate を選択する。[cite:66]
transparent の場合は upstream へ HTTP 的に透過転送し、translate の場合は `llm-bridge-core` を用いて Anthropic request を OpenAI 互換 request に翻訳して送出する。[cite:17][cite:19]
レスポンスは逆方向に処理され、Claude Code からは Anthropic 互換 endpoint として観測される。[cite:61][cite:66]

## 外部公開 API

### 基本方針

外向き API の正規面は Anthropic 互換 API とする。[cite:61][cite:66]
Claude Code は Anthropic Messages API を用いるカスタム endpoint に向けられるため、互換性の中核は `/v1/messages` に置く。[cite:66]

### エンドポイント

実装対象 endpoint は以下とする。

| Endpoint | 用途 | 備考 |
|---|---|---|
| `GET {url_prefix}/healthz` | liveness/readiness | 内部状態の簡易検査 |
| `GET {url_prefix}/metrics` | Prometheus metrics | text exposition format |
| `GET {url_prefix}/v1/models` | 公開 model 一覧 | 全 provider の実体 model を合成 |
| `POST {url_prefix}/v1/messages` | Anthropic Messages | 非 stream / stream の両方をサポート |

`url_prefix` は global 設定により前置される HTTP パス prefix である。[cite:66]
空文字も許容し、その場合は `/v1/messages` などがルート直下に公開される。[cite:66]

## ルーティング仕様

### model 解析

受信 request の `model` は原則として `provider/model` 形式でなければならない。[cite:66]
解析は **最初の `/` のみ**で split し、左辺を provider 名、残りすべてを model 名として扱う。[cite:66]
したがって `litellm/openai/gpt-4.1` は provider=`litellm`、model=`openai/gpt-4.1` と解釈される。[cite:66]

### provider 解決

provider 名は TOML の provider 定義名と完全一致しなければならない。[cite:66]
一致しない場合は 400 系の Anthropic 互換エラーを返す。[cite:66]

### alias 解決

model 解決順序は次のとおりとする。

1. provider 単位 alias。
2. global alias。
3. 登録済み public model 名。

この順序は provider 固有の意味づけを優先するためである。[cite:66]
解決された結果は **実体 model 定義**に正規化され、その後 upstream 名へ変換される。[cite:66]

### default provider の不採用

`provider/model` でない model を暗黙の default provider に流す機能は持たない。[cite:66]
これにより設定の曖昧さを排除する。[cite:66]

## Provider モード

### transparent

`transparent = true` の provider は、upstream `base_url` に対して HTTP リクエストとレスポンスを透過中継する。[cite:66]
ただし「完全透過」は HTTP 的な意味での完全コピーではなく、hop-by-hop header を除外し、upstream 認証は provider 設定で上書きする安全な reverse proxy として定義する。[cite:66]

transparent provider でも allow-list は有効であり、明示的に許可されていない model は upstream に送出しない。[cite:66]
allow-list が空のときのみ、当該 provider では任意 model を通してよい。[cite:66]

### translate

`transparent = false` の provider は translate provider とみなされる。[cite:66]
このモードでは Anthropic request を `llm-bridge-core` で OpenAI 互換 request に変換し、upstream `base_url` に転送する。[cite:17][cite:19]
レスポンスと streaming SSE も同様に Anthropic 互換へ戻す。[cite:17][cite:19]

translate provider の `base_url` は OpenAI 互換 endpoint root、たとえば `http://127.0.0.1:8080/v1` のような形式を想定する。[cite:66]

## API key スケジューリング

### 基本仕様

各 provider は複数の `api_keys` を持てる。[cite:66]
サーバー起動時、provider ごとに開始 index を乱択し、その key を最初に使用する。[cite:66]
以後は同 provider 内で round-robin により次 key へ進む。[cite:66]

### 状態保持

このスケジューラ状態はメモリ内にのみ保持する。[cite:66]
サーバー再起動時は再初期化される。[cite:66]

### failover

non-stream request に限り、対象 key の失敗時に同一 provider 内の次 key へ failover 再試行を許可する。[cite:66]
stream 開始後は key failover を行わず、その request をエラー終端させる。[cite:66]

## モデル定義

### model 構造

provider ごとの model 定義は単なる文字列配列ではなく、以下の構造体配列とする。[cite:66]

| フィールド | 型 | 意味 |
|---|---|---|
| `public` | string | 外部に公開する model 名 |
| `upstream` | string | upstream に送る実 model 名 |
| `enabled` | bool | 有効/無効 |
| `tags` | string array | 任意メタデータ |
| `max_tokens_cap` | integer? | 上限制約 |
| `aliases` | string array | 当該 model の別名 |

### allow-list と列挙の関係

allow-list が空であれば upstream への model 通過は自由とする。[cite:66]
ただし `GET /v1/models` に公開する model は、登録済み model 構造体配列に存在するものだけである。[cite:66]

## 設定ファイル仕様

### CLI

設定ファイルは `-c <path>` で指定された TOML から読み込む。[cite:66]
環境変数による上書きは行わない。[cite:66]

### TOML 全体像

```toml
[global]
port = 8088
url_prefix = ""
require_client_auth = false
log_format = "json"
allow_lossy = true

[global.timeouts]
connect_ms = 3000
read_ms = 600000
total_ms = 600000

[global.limits]
default_max_in_flight = 64
default_max_queue = 256

[global.aliases]
"claude-opus" = "deepseek/deepseek-v4-pro"
"claude-sonnet" = "deepseek/deepseek-v4-flash"

[providers.deepseek]
transparent = true
base_url = "https://api.deepseek.com/anthropic"
api_keys = ["sk-a", "sk-b"]
max_in_flight = 64
max_queue = 256

[[providers.deepseek.models]]
public = "deepseek-v4-pro"
upstream = "deepseek-v4-pro"
enabled = true
tags = ["reasoning", "premium"]
max_tokens_cap = 32000
aliases = ["opus"]

[[providers.deepseek.models]]
public = "deepseek-v4-flash"
upstream = "deepseek-v4-flash"
enabled = true
tags = ["fast"]
max_tokens_cap = 32000
aliases = ["sonnet", "haiku"]

[providers.qwen]
transparent = false
base_url = "http://127.0.0.1:8080/v1"
api_keys = ["sk-optiq-local"]
allow_lossy = true
openai_wire_api = "auto"
max_in_flight = 16
max_queue = 64

[[providers.qwen.models]]
public = "qwen3.6-27b"
upstream = "Qwen3.6-27B-OptiQ-4bit"
enabled = true
tags = ["local", "coder"]
max_tokens_cap = 32768
aliases = ["qwen-main", "local-coder"]
```

### スキーマ要件

- `global.port` は待受ポートである。[cite:66]
- `global.url_prefix` は endpoint 全体に付与されるパス prefix である。[cite:66]
- `global.require_client_auth` は外向き認証必須化フラグである。[cite:66]
- `global.log_format` は `text` または `json` を取る。[cite:66]
- `global.allow_lossy` は provider 未指定時の既定値である。[cite:17][cite:66]
- `providers.<name>.transparent` が `false` の場合、その provider は translate mode である。[cite:66]

## Rust 主要型

```rust
pub struct AppConfig {
    pub global: GlobalConfig,
    pub providers: BTreeMap<String, ProviderConfig>,
}

pub struct GlobalConfig {
    pub port: u16,
    pub url_prefix: String,
    pub require_client_auth: bool,
    pub log_format: LogFormat,
    pub allow_lossy: bool,
    pub timeouts: TimeoutConfig,
    pub limits: GlobalLimitConfig,
    pub aliases: BTreeMap<String, String>,
}

pub struct TimeoutConfig {
    pub connect_ms: u64,
    pub read_ms: u64,
    pub total_ms: u64,
}

pub struct GlobalLimitConfig {
    pub default_max_in_flight: usize,
    pub default_max_queue: usize,
}

pub struct ProviderConfig {
    pub transparent: bool,
    pub base_url: String,
    pub api_keys: Vec<String>,
    pub allow_lossy: Option<bool>,
    pub openai_wire_api: Option<OpenAiWireApi>,
    pub max_in_flight: Option<usize>,
    pub max_queue: Option<usize>,
    pub model_aliases: BTreeMap<String, String>,
    pub models: Vec<ModelConfig>,
}

pub struct ModelConfig {
    pub public: String,
    pub upstream: String,
    pub enabled: bool,
    pub tags: Vec<String>,
    pub max_tokens_cap: Option<u32>,
    pub aliases: Vec<String>,
}

pub enum LogFormat { Text, Json }
pub enum OpenAiWireApi { Auto, ChatCompletions, Responses }
```

`BTreeMap` を採用することで `/v1/models` の列挙や設定検証時のソート済み出力を得やすくする。[cite:66]

## リクエスト処理フロー

### `/v1/messages`

1. HTTP request を受信する。
2. `require_client_auth=true` の場合、外向き認証 header を検証する。
3. request body の `model` を `provider/model` として解析する。[cite:66]
4. provider 存在確認、alias 解決、model 定義解決を行う。[cite:66]
5. provider の concurrency token を取得する。
6. provider の key scheduler から key を選ぶ。[cite:66]
7. `transparent` なら reverse proxy、`translate` なら `llm-bridge-core` による変換を行う。[cite:17][cite:19]
8. upstream からの response / SSE を Anthropic 互換で返す。[cite:17][cite:19]
9. メトリクス記録、ログ出力、queue / token 解放を行う。

### `/v1/models`

`/v1/models` は全 provider の **enabled な実体 model** を `provider/public` 名で列挙し、ソートして返す。[cite:66]
alias は追加メタデータとして含めるが、実体 entry と同列の primary model としては返さない。[cite:66]

## HTTP 詳細

### クライアント認証

クライアント認証は optional とし、`require_client_auth=true` の場合のみ必須化する。[cite:66]
認証 header としては `Authorization: Bearer ...` と `x-api-key` の両方を受け入れるのが実用的である。[cite:68]

### upstream 認証

upstream への認証は必ず provider 設定の `api_keys` から注入する。[cite:66]
クライアント由来の Authorization header は upstream へ透過しない。[cite:66]

### transparent header policy

transparent mode では hop-by-hop header は送出しない。[cite:66]
それ以外の header は原則透過としつつ、認証系・接続制御系は proxy が責任を持って再構成する。[cite:66]

## Timeout / Retry / Queue 制御

### timeout

timeout は `connect`, `read`, `total` の 3 種を持つ。[cite:66]
既定値は global 設定から供給し、provider は必要に応じて override する。[cite:66]

### retry

retry 対象は provider 内 key failover を伴う non-stream request に限定する。[cite:66]
streaming response では partial output の意味的一貫性を優先し、mid-stream failover は行わない。[cite:66]

### concurrency と queue

provider ごとに `max_in_flight` と `max_queue` を持つ。[cite:66]
in-flight が上限に達したときは bounded queue で待機し、queue も満杯なら 429 を返す。[cite:66]

## Lossy translation の扱い

translate provider では `llm-bridge-core` の lossy downgrade 能力を利用する。[cite:17][cite:19]
`allow_lossy` は global default を持ち、provider 単位で override 可能とする。[cite:17][cite:66]
lossy が発生した場合はログとメトリクスで可視化する。[cite:17]

## ログとメトリクス

### ログ

ログ形式は `text` と `json` を切替可能とする。[cite:66]
API key の生値は絶対に出力せず、必要なら key index または fingerprint のみを記録する。[cite:66]

出力すべき主要フィールド:

- timestamp
- request_id
- provider
- public_model
- upstream_model
- mode (`transparent` / `translate`)
- stream flag
- selected_key_index
- status_code
- latency_ms
- lossy_applied
- retry_count

### メトリクス

Prometheus 形式の `/metrics` を提供する。[cite:66]
最低限必要なメトリクスは以下とする。

- `llm_bridge_requests_total{provider,mode,stream,status}`
- `llm_bridge_request_latency_ms_bucket{provider,mode}`
- `llm_bridge_in_flight{provider}`
- `llm_bridge_queue_depth{provider}`
- `llm_bridge_key_selected_total{provider,key_index}`
- `llm_bridge_key_failover_total{provider}`
- `llm_bridge_lossy_total{provider,model}`
- `llm_bridge_upstream_errors_total{provider,category}`

## エラー仕様

### 基本方針

クライアントに返すエラーは可能な限り Anthropic 互換 schema に正規化する。[cite:66]
provider 不明、model 不明、設定不備、queue overflow、upstream timeout などは raw upstream body をそのまま返すのではなく、クライアントが扱いやすい標準化エラーへ詰め替える。[cite:66]

### ステータスコード

- provider 不明: 400
- model 不明: 400
- client auth 不備: 401 または 403
- queue overflow: 429
- upstream timeout: 504
- upstream 接続失敗: 502
- 設定不整合: 500

## `/v1/models` レスポンス方針

`/v1/models` は Anthropic 互換性を壊さない範囲で、実運用に必要な discoverability を優先する。[cite:60][cite:66]
返却内容には少なくとも `provider/public` の完全名、display 用の短名、enabled 状態、tags、aliases を含める。[cite:66]
ソート順は provider 名、次に public model 名の昇順とする。[cite:66]

## 実装構成案

```text
src/
  main.rs
  cli.rs
  config.rs
  app_state.rs
  http/
    mod.rs
    routes.rs
    auth.rs
    errors.rs
    models.rs
  routing/
    mod.rs
    resolver.rs
    aliases.rs
  provider/
    mod.rs
    transparent.rs
    translate.rs
    scheduler.rs
    limits.rs
  bridge/
    mod.rs
    anthropic_openai.rs
  observability/
    mod.rs
    logging.rs
    metrics.rs
  util/
    mod.rs
    headers.rs
    ids.rs
```

この分割により、設定、routing、provider 実行、変換、可観測性を明確に分けられる。[cite:17][cite:19]

## 起動シーケンス

1. CLI 引数から `-c` を取得する。[cite:66]
2. TOML を読み込む。[cite:66]
3. schema validation、重複 alias、重複 public model、空 API key 配列などを検証する。[cite:66]
4. provider ごとの scheduler と queue limiter を初期化する。[cite:66]
5. HTTP client pool を provider ごとに構築する。
6. ルータを組み立て、`port` で待受開始する。[cite:66]

## 設定検証ルール

- provider 名は一意でなければならない。[cite:66]
- `api_keys` は 1 件以上必要である。[cite:66]
- `models.public` は provider 内で一意でなければならない。[cite:66]
- `aliases` は同一 provider 内で衝突してはならない。[cite:66]
- global alias は provider alias と競合してもよいが、解決時は provider alias を優先する。[cite:66]
- `max_queue=0` は queue 無効、超過時即 429 として扱ってよい。
- `url_prefix` は先頭 `/` を正規化し、末尾 `/` は内部的に除去する。

## 受け入れ基準

### 機能試験

最低限、以下の試験を全て通すことを受け入れ条件とする。

1. transparent provider に対する non-stream `/v1/messages` が成功する。[cite:66]
2. transparent provider に対する stream `/v1/messages` が成功する。[cite:66]
3. translate provider に対する non-stream `/v1/messages` が成功する。[cite:17][cite:19]
4. translate provider に対する stream `/v1/messages` が成功する。[cite:17][cite:19]
5. non-stream request で API key failover が機能する。[cite:66]
6. stream request では failover せずエラー終端する。[cite:66]
7. `/v1/models` が provider/model 一覧をソートして返す。[cite:66]
8. `provider/model` の最初の `/` のみで split される。[cite:66]
9. queue overflow 時に 429 を返す。[cite:66]
10. `/metrics` と `/healthz` が利用可能である。[cite:66]

### Claude Code 実運用試験

Claude Code を `ANTHROPIC_BASE_URL` で本サーバーへ向け、transparent provider と translate provider を同時に定義した config で通常運用できることを確認する。[cite:61][cite:66]
ここでの通常運用とは、model 指定、会話、streaming 応答、および標準的な Claude Messages ワークフローが停止せず成立することである。[cite:66]

## 実装上の注意

Anthropic 互換性を外向きに保つため、クライアント向け schema は可能な限り Anthropic に寄せ、upstream 固有差異はサーバー内部へ閉じ込めるべきである。[cite:60][cite:66]
また、lossy translation を許容する場合でも、その発生は silent にせず observability 面で露出させるべきである。[cite:17]

## 未解決事項

設計上の本質論点はほぼ解消しているが、実装前に次の 2 点だけはコード着手時に確認する価値がある。

- `llm-bridge-core` の具体的 API surface に合わせて、translate provider 側アダプタ層の関数境界を最終調整すること。[cite:17][cite:19]
- `/v1/models` のレスポンス形状を Anthropic 互換と実用性のどちらにどこまで寄せるかを、実クライアント観測で最終確認すること。[cite:60][cite:66]

## 結論

本設計により、`llm-bridge-core` を protocol transform の中核に据えつつ、provider 集約、key scheduling、model 管理、observability を備えた Rust 製ワンバイナリ Anthropic 互換 proxy を実装できる。[cite:17][cite:19][cite:66]
特に Claude Code 利用を主眼に置いた `provider/model` ルーティング、transparent / translate の二相 provider、起動時乱択 + round-robin key 運用、`/v1/models` 合成、および `/metrics` / `/healthz` を含む設計は、今回の要件をそのまま実装可能な粒度まで落としている。[cite:61][cite:66]
