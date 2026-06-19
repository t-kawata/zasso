# RFC 要件チェックリスト

> **⚠️ このファイルはスクリプトにより自動生成された雛形です。**
> AIが目視チェックし、補足事項・プロジェクト固有の制約を追記してから使用すること。

生成日時: 2026-06-19T02:24:30.364Z
DesignTree バージョン: 1

---

## 全体チェック

- [ ] RFC全体にTBD / TODO / スタブ / 委譲 が0件であること
- [ ] 全セクションにコードスニペットが含まれていること
- [ ] DesignTreeの全ノードがRFCのいずれかのセクションに対応していること

---

## §1 アーキテクチャ: ライブラリ + バイナリのデュアルモード構成 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §2 HTTPサーバーフレームワーク選択とルーティング設計 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §2.1 クライアント認証の実装: Bearer / x-api-key 両対応 ✅

- [ ] **クライアント認証の実装: Bearer / x-api-key 両対応** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §2.2 upstream認証注入とtransparent header policy ✅

- [ ] **upstream認証注入とtransparent header policy** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §3 設定システム: TOML読込 + プログラム的APIの二刀流 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §3.1 設定検証ルールの実装: 起動時バリデーション ✅

- [ ] **設定検証ルールの実装: 起動時バリデーション** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §4 Providerルーティング・解決・スケジューラの中核設計 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §4.1 llm-bridge-core との結合インターフェース設計 ✅

- [ ] **llm-bridge-core との結合インターフェース設計** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §4.2 Lossy translation 制御: allow_lossy 伝搬と可視化 ✅

- [ ] **Lossy translation 制御: allow_lossy 伝搬と可視化** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと
#### §4.2.1 Error級 lossy 続行フラグの設計: allow_lossy の値拡張または別フラグ ✅

- [ ] **Error級 lossy 続行フラグの設計: allow_lossy の値拡張または別フラグ** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §4.3 GET /v1/models のレスポンススキーマ設計 ✅

- [ ] **GET /v1/models のレスポンススキーマ設計** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §4.4 Streaming SSE 転送方式と translate mode のSSE変換 ✅

- [ ] **Streaming SSE 転送方式と translate mode のSSE変換** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §4.5 HTTP client pool: provider ごとの reqwest::Client 管理 ✅

- [ ] **HTTP client pool: provider ごとの reqwest::Client 管理** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


### §4.6 OpenAiWireApi (auto/chat_completions/responses) の使い方と選択ロジック ✅

- [ ] **OpenAiWireApi (auto/chat_completions/responses) の使い方と選択ロジック** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §5 並行性制御: in-flight制限とbounded queue ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §6 ライフサイクル管理と可観測性の埋め込みAPI ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §7 エラー型設計とAnthropic互換エラー応答 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §8 テスト戦略: 結合テストとCI ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

<!-- ============================================================ -->
<!-- AI補足: プロジェクト固有の制約・注意事項 -->
<!-- ============================================================ -->

### プロジェクト全体制約

- [ ] **`#![forbid(unsafe_code)]`**: llm-bridge-core と同様に crate ルートで unsafe を禁止すること
- [ ] **`#![warn(missing_docs)]`**: 公開 API にはドキュメントコメントを必須とすること
- [ ] **zasso ポート競合回避**: デフォルトポートは 8088 だが、zasso 既存ポート(3910/3911/3912)と競合しないこと。`GlobalConfig.port` で変更可能であること
- [ ] **設定値は `consts/settings.rs` で一元管理**: ポート番号・デフォルト timeout 値・queue 上限等のマジックナンバーは `settings.rs` に定義し、`consts/mod.rs` 経由で参照すること（テストコード内も含めて直書き禁止）
- [ ] **Makefile 抽象化**: `make check-be` / `make test` 経由でビルド・テストを実行できるよう、workspace Cargo.toml と Makefile に対応を追加すること
- [ ] **crate 独立ビルド確認**: workspace 外の空ディレクトリで `cargo add anthropx --path ../zasso/crates/anthropx` が成功し、`cargo build` が通ること
- [ ] **コメントは日本語**: Rust コード内のコメントは日本語で記述すること（`// これは日本語`）。ログメッセージ (`log::info!`, `tracing::info!`) は英語
- [ ] **ライブラリ + バイナリのデュアルモード**: `[lib]` と `[[bin]]` を Cargo.toml に両方定義し、`cargo add` と `cargo install` の両方をサポートすること。RFC 内に Cargo.toml の `[lib]` / `[[bin]]` / `[features]` 3セクションのコード例を含めること
- [ ] **feature flag 制御**: `features = ["server"]` で Axum 依存 + バイナリモード有効化。server 無効時は HTTP 依存ゼロで `AppConfig` 型のみ利用可能
- [ ] **`error_lossy_continue` デフォルト値**: `false`（未設定時は Error 級 lossy で拒否）。RFC 内でデフォルトと動作を明記すること

### テスト固有制約

- [ ] **axum::test mock server**: CI で実行可能な mock upstream テストを全 acceptance criteria に対して用意すること
- [ ] **実 provider 結合テスト**: `#[cfg(feature = "integration-test")]` または環境変数で API key を注入し、実際の upstream provider に対する通しテストを実行可能にすること
- [ ] **実 provider テストは CI ではスキップ**: `#[ignore]` または feature gate で分離し、定期実行・手動実行のみで動作させること

### 受け入れ基準（draft 10項目）— RFC完成後、個別に照合すること

- [ ] **AC#1**: transparent provider に対する non-stream `/v1/messages` が成功する
- [ ] **AC#2**: transparent provider に対する stream `/v1/messages` が成功する
- [ ] **AC#3**: translate provider に対する non-stream `/v1/messages` が成功する
- [ ] **AC#4**: translate provider に対する stream `/v1/messages` が成功する
- [ ] **AC#5**: non-stream request で API key failover が機能する
- [ ] **AC#6**: stream request では failover せずエラー終端する
- [ ] **AC#7**: `/v1/models` が provider/model 一覧をソートして返す
- [ ] **AC#8**: `provider/model` の最初の `/` のみで split される
- [ ] **AC#9**: queue overflow 時に 429 を返す
- [ ] **AC#10**: `/metrics` と `/healthz` が利用可能である

### RFC 記述時の強制事項

- [ ] **TBD / TODO / スタブ / 委譲 ゼロ**: これらの表現を一切含まず、18ノードすべてを完全記述すること
- [ ] **全決定にコード例**: 各設計判断に対応する Rust コードスニペットを必ず含めること（型定義、関数シグネチャ、handler 実装の一部など）
- [ ] **IETF スタイル準拠**: Abstract / Motivation / Design / Implementation / Appendix のセクション構成を守ること