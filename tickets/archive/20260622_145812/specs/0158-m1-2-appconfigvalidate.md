---
ticket_id: 158
title: "M1-2: AppConfig::validate — 集約型設定検証"
slug: m1-2-appconfigvalidate
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0158-m1-2-appconfigvalidate/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0158-m1-2-appconfigvalidate/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0158-m1-2-appconfigvalidate/review.md
---

# M1-2: AppConfig::validate — 集約型設定検証

## Summary

`AppConfig` に `pub fn validate(&self) -> Result<(), Vec<ConfigError>>` メソッドを追加する。全エラーを収集してから一度に報告する集約型バリデーションを実装し、RFC §2.1 の全検証ルールをカバーする。本チケットは純粋ロジックのみで I/O・非同期は含まない。

## Background

`anthropx` の設定システムは TOML ファイルまたはプログラム的構築の二刀流をサポートする。設定の不整合は起動時に検出する必要がある。集約型バリデーションにより、ユーザーは1回の起動ですべての設定ミスを修正できる。

例えば、以下のような設定ミスが同時に発生した場合:
- provider の `api_keys` が空
- 同一 provider 内で `models.public` が重複
- ポート番号が 0

集約型バリデーションはこれらすべてのエラーを収集し、`Vec<ConfigError>` として一度に報告する。これによりユーザーは起動を繰り返すことなく全修正を一度に行える。

**参照設計書:** `crates/anthropx/RFC.md` (§2.1 設定検証ルール)

## Scope

- `impl AppConfig { pub fn validate(&self) -> Result<(), Vec<ConfigError>> }` を `src/config/mod.rs` に追加（既存の `impl AppConfig` ブロックまたは新しいブロックとして）
- 以下の検証項目を実装:

### 検証項目

| # | チェック | エラー種別 | 備考 |
|---|---------|-----------|------|
| 1 | `api_keys` が空でない | `ConfigError::EmptyApiKeys(name)` | `provider.api_keys.is_empty()` |
| 2 | `models.public` が provider 内で一意 | `ConfigError::DuplicateModel(name)` | HashSet で重複検出 |
| 3 | `model_aliases` の値が public model 名と衝突しない | `ConfigError::DuplicateAlias(alias, existing)` | alias の値が同一 provider 内の model.public と競合する場合 |
| 4 | ポート番号が `1..=65535` | 該当エラーなし → RFC に従いエラー種別は `ValidationFailed` に集約せず個別に追加。実際は `ConfigError::ValidationFailed` 相当の情報を Vec に含める。ポート0は範囲外として検出 | `global.port` が 1〜65535 |
| 5 | timeout 値が 0 でない | 該当エラーなし → `connect_ms` / `read_ms` / `total_ms` が 0 の場合エラー追加 | RFC の汎用エラーとして文字列で表現 |

**注記**: `url_prefix` の正規化（先頭 `/` 付与、末尾 `/` 除去）および `max_queue=0` の許容は検証ではなく変換または許容事項であるため、本チケットのスコープから除外する。これらの処理は M2-3 (ConfigLoader) または M4-1 (起動シーケンス) で行う。

### このチケットで実装しないこと

- `url_prefix` の正規化（M2-3 または M4-1 で実施）
- `max_queue=0` の特別扱い（デフォルトで許容される）
- global alias と provider alias の競合チェック（競合しても許容、provider 優先、ログ出力は observability モジュールで）

## Investigation

### コードベース調査結果

- **発見1**: `AppConfig` は `src/config/mod.rs` に `#[derive(Debug, Clone, Default, serde::Deserialize, serde::Serialize)]` で定義済み。現在 `impl AppConfig` ブロックは存在しない（Default は derive）。
- **発見2**: `ConfigError` は `src/config/mod.rs` に6 variant で定義済み。`ValidationFailed(Vec<ConfigError>)` が集約型バリデーションのラッパーとして使用可能。
- **発見3**: `ProviderConfig` は必須フィールド（`transparent`, `base_url`, `api_keys`）とオプショナルフィールドを持つ。`api_keys` の空チェックは M0-1 の不変条件として既に文書化済み。
- **発見4**: `ModelConfig` は `pub enabled: bool` を持つ。無効なモデル（`enabled: false`）の `public` 名も重複チェックの対象とする（同一 provider 内で有効・無効を問わず一意であるべき）。
- **発見5**: M0-1, M0-2, M1-1 はいずれも reviewed 完了済み。

### 依存関係の充足確認

| 先行チケット | ステータス | 備考 |
|------------|-----------|------|
| M0-1 (#155) | ✅ reviewed | AppConfig, ProviderConfig, ModelConfig, GlobalConfig 必須 |
| M0-2 (#156) | ✅ reviewed | ConfigError 必須 |
| M1-1 (#157) | ✅ reviewed | 間接的なみ（型定義を利用しない） |

## Test Plan

### ユニットテスト計画

全テストは `src/config/mod.rs` の既存 `#[cfg(test)] mod tests` に追記する。外部依存なし。

| # | テストケース | 種別 | 検証内容 |
|---|------------|------|---------|
| 1 | `validate_ok_default` | 正常系 | `AppConfig::default()` → `Ok(())` |
| 2 | `validate_ok_single_provider` | 正常系 | 正常な provider 設定 → `Ok(())` |
| 3 | `validate_empty_api_keys` | 異常系 | `api_keys=[]` → `Err(vec![EmptyApiKeys])` |
| 4 | `validate_duplicate_model_public` | 異常系 | 同一 provider 内で `models.public` 重複 → `Err(vec![DuplicateModel])` |
| 5 | `validate_duplicate_alias` | 異常系 | 同一 provider 内で alias が model.public と衝突 → `Err` |
| 6 | `validate_port_zero` | 異常系 | `port=0` → `Err` |
| 7 | `validate_port_too_high` | 境界値 | `port=65536` → `Err`（u16 では表現不可のためテスト不要。実際は 65535 を超えるとコンパイルエラー） |
| 8 | `validate_multiple_errors` | 異常系 | 複数設定ミス → Vec に全エラーが含まれる（集約確認） |
| 9 | `validate_timeout_zero` | 異常系 | `connect_ms=0` → `Err` |
| 10 | `validate_ok_max_queue_zero` | 正常系 | `max_queue=0` → `Ok(())`（許容） |

### ユニットテスト不可能な項目（例外）

- `url_prefix` の正規化が正しく行われること → M2-3 または M4-1
- `validate` が起動シーケンスで正しく呼ばれること → M4-1 の integration test
- global alias と provider alias の競合ログ出力 → observability モジュール

## Boy Scout Rule — 翻訳可能性計画

- **関数名は動詞句**: `validate` — 「検証する」
- **変数名はドメイン概念**: `provider_name`, `errors`, `seen_public_names`
- **一関数一責務**: `validate()` は検証のみ。正規化や変換は別関数
- **コメントは「なぜ」**: 各チェックの背景（なぜ重複が問題か、なぜポート0が不正か）を日本語で説明
- **集約パターン**: `errors` ベクタに `push` していくパターンは RFC §2.1 の設計判断をそのままコード化。この意図（一度に全エラー報告）をコメントで明示

## Acceptance Criteria

- [ ] `cargo check -p anthropx` が警告ゼロで通過する
- [ ] `cargo clippy -D warnings` が通過する
- [ ] `cargo test -p anthropx` が全テスト（既存66 + 新規10 = 76 + 1 doctest）通過する
- [ ] `AppConfig::default().validate()` が `Ok(())` を返す
- [ ] 空の `api_keys` を `EmptyApiKeys` エラーとして検出する
- [ ] 重複した `models.public` を `DuplicateModel` エラーとして検出する
- [ ] 複数の設定ミスを集約して報告する（Vec に全エラー含む）
- [ ] `max_queue=0` を許容する（エラーにしない）
- [ ] ポート番号 0 をエラーとして検出する

## 依存・関連チケットID

| 関係 | チケット | 内容 |
|------|---------|------|
| **先行実装必須 (reviewed)** | M0-1 (#155) | AppConfig, ProviderConfig, ModelConfig, GlobalConfig |
| **先行実装必須 (reviewed)** | M0-2 (#156) | ConfigError |
| **先行実装必須 (reviewed)** | M1-1 (#157) | 間接依存（型定義のみ） |
| **後続** | M2-3 (#161) | ConfigLoader から validate が呼ばれる |
| **後続** | M4-1 (#TBD) | ProxyServer::start から validate が呼ばれる |
