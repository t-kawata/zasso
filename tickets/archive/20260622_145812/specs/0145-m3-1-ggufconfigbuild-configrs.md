---
ticket_id: 145
title: M3-1: GgufConfig::build 完全実装 (config.rs)
slug: m3-1-ggufconfigbuild-configrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0145-m3-1-ggufconfigbuild-configrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0145-m3-1-ggufconfigbuild-configrs/review.md
---
# M3-1: GgufConfig::build 完全実装 (config.rs)

## Summary

`GgufConfig` に3層マージの完全実装を追加する。コード内設定 → 埋め込みJSON → ファイルJSON の順にマージし、最終的な設定を生成する。これにより、ファイル I/O を含む設定の動的読み込みが初めて可能になる。

## Background

### 設計上の位置づけ（RFC §4.2）

ggufrs の設定は3層構造でマージされ、上位層が下位層を上書きする：

| 優先度 | 層 | メソッド | 説明 |
|--------|-----|---------|------|
| 低 | コードベタ書き | `from_code()` | プログラム内で直接構築（L0 実装済み） |
| 中 | 埋め込みJSON | `from_json_str()` | `include_str!()` でコンパイル時埋め込み |
| 高 | ファイルJSON | `from_file()` | ディスク上の設定ファイル（ランタイム変更可能） |

### 現在の実装状況

- `GgufConfig::from_code()` (`config.rs:304`): **実装済み** — コード内設定の生成
- `GgufConfig::merge_overlay()` (`config.rs:320`): **実装済みだが未呼び出し** — `#[allow(dead_code)]` で抑制中
- `ConfigLayer` enum (`config.rs:355`): **定義済み** — Code/JsonStr/File の3層
- `std::io::Error` → `GgufError::InvalidConfig` (error.rs:29-33): **実装済み** — `#[from]` による自動変換
- `serde_json::Error` → `GgufError::InvalidConfig` (error.rs:39-43): **実装済み** — `#[from]` による自動変換

### このチケットの必要性

M1-4 で実装した `merge_overlay()` は内部マージロジックとして機能するが、呼び出し元となる `build()`, `merge()`, `from_file()`, `from_json_str()` が未実装のためデッドコード状態にある。このチケットで外部インターフェースを完成させ、`merge_overlay()` の `#[allow(dead_code)]` を解消し、3層マージを実際に使用可能にする。

## Scope

### 実装するもの

1. **`GgufConfig::build(code: Self, json: Option<&str>, file: Option<&Path>) -> Result<Self>`**
   - 3層マージのエントリポイント（RFC のユースケースに対応）
   - `code` → `json`(Some) → `file`(Some) の順にマージ
   - 各層が `None` の場合はスキップ

2. **`GgufConfig::from_json_str(json: &str, base: Self) -> Result<Self>`**
   - JSON 文字列をパースし、`merge_overlay()` でベースにマージ
   - `serde_json::from_str()` でパース
   - パース失敗は `GgufError::InvalidConfig` として伝播

3. **`GgufConfig::from_file(path: &Path, base: Self) -> Result<Self>`**
   - ファイルを読み取り、JSON パースし、ベースにマージ
   - `std::fs::read_to_string()` → `serde_json::from_str()` → `merge_overlay()`
   - ファイル不存在・読み取り失敗は `GgufError::InvalidConfig` として伝播

4. **`GgufConfig::merge(layers: Vec<ConfigLayer>) -> Result<Self>`**
   - `ConfigLayer` 配列を順次マージ（一般化されたインターフェース）
   - `ConfigLayer::Code` → 直接適用（ベースとして使用）
   - `ConfigLayer::JsonStr` → `from_json_str()` 相当の処理
   - `ConfigLayer::File` → `from_file()` 相当の処理
   - マージ順序（低→高）で適用

5. **`merge_overlay()` の `#[allow(dead_code)]` 除去**
   - M3-1 で全ての呼び出し元が実装されるため、抑制は不要になる

### 実装しないもの

- `cfg.rs` 等の設定ファイルテンプレート自動生成 — このチケットでは扱わない
- JSON config スキーマのバリデーション（必須フィールドチェック等）— 現状の serde デシリアライズで発生するエラーのみ対応し、論理バリデーションは将来検討
- 環境変数による設定上書き — Layer 3 の範疇外（RuntimeConfig 等で別途検討）
- デフォルト設定ファイルの自動生成 — M5-1 以降で検討
- `include_str!()` 用のサンプル JSON ファイル作成 — このチケットではテスト用にインライン JSON を使用する

## Investigation

### ソースコード調査結果

#### config.rs の現在の構造

**ファイル: `crates/ggufrs/src/config.rs`** (全848行)

- `GpuProvider` enum (L19-50): 定義済み、テスト済み
- `GpuProvider` impl (L52-107): `detect()`, `from_str()`, `mistralrs_feature()` 実装済み、テスト済み
- `GpuConfig` struct (L113-135): 定義済み、テスト済み
- `ModelConfig` struct (L141-185): 定義済み、テスト済み
- `ModelConfig` impl (L187-236): `qwen3_5_0_8b()`, `qwen3_5_2b()`, `custom()` 実装済み、テスト済み
- `ServerConfig` struct (L243-272): 定義済み、テスト済み
- `GgufConfig` struct (L280-296): 定義済み、テスト済み
- `GgufConfig` impl (L298-346):
  - `from_code()` (L304): **実装済み**
  - `merge_overlay()` (L320): **実装済みだが `#[allow(dead_code)]`**
- `ConfigLayer` enum (L354-371): 定義済み、テスト済み
- Tests (L373-847): 全テストパス済み

**M3-1 で追加すべき箇所:**
- `GgufConfig` impl ブロック内に `build()`, `from_json_str()`, `from_file()`, `merge()` を追加

#### error.rs のエラー変換（確認済み）

```rust
// From 実装済み（error.rs:29-43）
impl From<std::io::Error> for GgufError      // → InvalidConfig(string)
impl From<serde_json::Error> for GgufError   // → InvalidConfig(string)
```

両方とも実装済みのため、M3-1 では新たな From 実装は不要。`?` 演算子で透過的に変換できる。

#### スタブ状況

```bash
# config.rs の該当スタブ
crates/ggufrs/src/config.rs:5:
  [::STUB::] M3-1 で GgufConfig::build + merge 完全実装（ファイルI/O）
crates/ggufrs/src/config.rs:318:
  [::STUB::] M3-1 で GgufConfig::build からの呼び出しが追加され、dead_code が解消される
```

M3-1 の実装により両方とも解決される。

#### README.md のスタブ状態

README.md に記載された未実装箇所のうち、GgufConfig 関連:
- `GgufConfig::build()` 未実装 ✔ → M3-1 で解決
- `GgufConfig::merge()` 未実装 ✔ → M3-1 で解決

#### 依存チケットの状態

- **M0-5** (構造体定義): ✅ 完了 — `GgufConfig`, `ConfigLayer`, `GpuConfig`, `ServerConfig` 全て定義済み
- **M1-4** (merge_overlay): ✅ 完了 — マージロジック実装済み、テスト済み
- **M1-3** (Error From impls): ✅ 完了 — `io::Error` と `serde_json::Error` の変換実装済み

すべての依存が完了しており、M3-1 はブロックされていない。

## Test Plan

### ユニットテスト計画

実装する全メソッドに対して、以下の観点でテストを記述する。テストは `config.rs` 内の既存 `#[cfg(test)] mod tests` に追加する。

#### 1. `GgufConfig::from_json_str()`

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 1.1 | 有効なJSONでモデル上書き | 正常系 | ベースのモデル名と同名のモデルを含むJSON → フィールドが上書きされる |
| 1.2 | 有効なJSONでモデル追加 | 正常系 | ベースにないモデル名を含むJSON → モデルが追加される |
| 1.3 | 有効なJSONでserver/gpu上書き | 正常系 | server.bind, gpu.provider が上書きされる |
| 1.4 | 空のJSONオブジェクト | 正常系 | `{}` → ベースがそのまま維持される |
| 1.5 | 不正なJSON文字列 | 異常系 | パースエラー → `GgufError::InvalidConfig` |
| 1.6 | 不完全なJSON（型不一致） | 異常系 | serde デシリアライズエラー → `GgufError::InvalidConfig` |

#### 2. `GgufConfig::from_file()`

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 2.1 | 存在するJSONファイルの読み込み | 正常系 | 一時ファイルを作成して読み込み、マージ結果を検証 |
| 2.2 | 存在しないファイルパス | 異常系 | `NotFound` → `GgufError::InvalidConfig` |
| 2.3 | 不正な内容のファイル | 異常系 | パースエラー → `GgufError::InvalidConfig` |

#### 3. `GgufConfig::build()`

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 3.1 | 3層マージ（コード+JSON+ファイル） | 正常系 | 一時ファイル作成し、全層を適切にマージ |
| 3.2 | コードのみ（JSON/ファイル None） | 正常系 | `json: None, file: None` → コード設定そのまま |
| 3.3 | コード+JSONのみ | 正常系 | `file: None` → JSON で上書き |
| 3.4 | コード+ファイルのみ | 正常系 | `json: None` → ファイルで上書き |
| 3.5 | ファイル不存在エラー | 異常系 | 存在しないファイルパス → `GgufError::InvalidConfig` |

#### 4. `GgufConfig::merge()`

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 4.1 | Codeのみの1層 | 正常系 | `vec![ConfigLayer::Code(cfg)]` → cfg がそのまま返る |
| 4.2 | JsonStrのみ | 正常系 | 有効なJSON文字列で構築可能 |
| 4.3 | Fileのみ | 正常系 | 一時ファイル作成、読み込み成功 |
| 4.4 | 3層（Code→JsonStr→File） | 正常系 | 各層の優先度通りにマージされる |
| 4.5 | 空のベクタ | 正常系 | `vec![]` → Ok(GgufConfig::from_code(vec![])) 相当のデフォルト |
| 4.6 | JsonStr 不正JSON | 異常系 | パースエラー → `GgufError::InvalidConfig` |
| 4.7 | File 不存在 | 異常系 | `NotFound` → `GgufError::InvalidConfig` |

#### 5. `merge_overlay()` の dead_code 解消確認

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 5.1 | `#[allow(dead_code)]` が除去できる | コンパイル | 全メソッドで merge_overlay が呼ばれることを確認（テストでなくコンパイルチェック） |
| 5.2 | 既存 merge_overlay テストが通過 | 回帰 | 既存7テストが全て通過 |

#### カバレッジ目標

- `from_json_str()`: 100%
- `from_file()`: ラインカバレッジ100%（2.2 と 2.3 のエラーパスを含む）
- `build()`: ラインカバレッジ100%（全ブランチを網羅）
- `merge()`: ラインカバレッジ100%（全 ConfigLayer バリアント + エラーパス）
- 全体コンフィグモジュール: 80%以上維持（既存テスト + 新規テストで達成）

### ユニットテスト不可能な項目（例外）

なし。ファイル I/O は一時ファイル作成によりテスト可能。JSON パースの失敗は不正文字列の注入によりテスト可能。全操作が純粋な関数としてテスト可能であり、外部サービスやハードウェア依存は含まれない。

## Boy Scout Rule — 翻訳可能性計画

### 現在のコードの評価

現在の `config.rs` は既に高い翻訳可能性を持っている：

- ✅ `from_code()` — 「コードから設定を生成する」と逐語訳可能
- ✅ `merge_overlay()` — 「上位設定を自身にマージする」と逐語訳可能
- ✅ 変数名: `overlay`, `existing`, `overlay_model` — ドメイン概念を正確に表現
- ✅ コメントは「なぜ」を日本語で説明（マージ条件の意図等）
- ✅ テスト名も翻訳可能（`gpu_provider_all_variants_roundtrip_json` 等）

### M3-1 実装で遵守すべき翻訳可能性のルール

1. **関数名は動詞句にする**: `build`, `from_json_str`, `from_file`, `merge` は適切（RFC の命名を踏襲）
2. **変数名はドメイン概念を表現する**: `layers`, `code_config`, `json_content`, `file_config` 等
3. **一関数一責務**: 各メソッドは単一の責務（buildは3層の直列マージ制御、from_json_strはJSONパース+マージ、mergeはConfigLayer配列の反復マージ）
4. **ハードコード値の定数化**: ファイル読み取りバッファサイズ等はハードコードせず、必要なら settings.rs に定数追加
5. **`?` 演算子によるエラー伝播**: `unwrap()` を使用せず、既存の `From` impl で `?` で伝播する
6. **コメントは「なぜ」を説明**: コードが「何を」しているかは関数名で語り、コメントはマージ順序の設計判断等を日本語で説明

### 具体的な改善

- 既存の `merge_overlay` の `#[allow(dead_code)]` を除去する（このチケットで解決）
- 新規コードに古い違反を持ち込まない

## Acceptance Criteria

- [ ] `GgufConfig::build()` が実装され、3層マージが正しく動作する
- [ ] `GgufConfig::from_json_str()` が実装され、JSONパース＋マージが動作する
- [ ] `GgufConfig::from_file()` が実装され、ファイル読み取り＋パース＋マージが動作する
- [ ] `GgufConfig::merge()` が実装され、任意の `ConfigLayer` 配列をマージできる
- [ ] ファイル不存在・JSON不正のエラーハンドリングが正しく動作する
- [ ] `#[allow(dead_code)]` が `merge_overlay()` から除去されている
- [ ] `[::STUB::]` マーカーが `config.rs` から2箇所とも除去されている
- [ ] 既存テストが全て通過している
- [ ] 新規テストが全て通過し、カバレッジ目標を達成している
- [ ] 翻訳可能性ルールに従った命名・構造になっている

## Notes

- `build()` の `json` 引数は `Option<&str>` 型 — `include_str!()` の戻り値が `&str` であるため
- `build()` の `file` 引数は `Option<&Path>` 型 — ファイルパス表現の一般性のため
- エラー変換は `?` 演算子に任せる（`From` impl は error.rs に既存）
- ファイル操作のテストは `std::fs` と一時ファイル or メモリファイルで実施する
- 依存: M1-4（merge_overlay）✅完了、M0-5（構造体定義）✅完了、M1-3（Error From）✅完了
- 後続チケット: M3-2（generate実装）以降は `GgufConfig` を活用する側面
- 参照: RFC.md §4.2（JSON マルチソースマージ）、§Implementation（設定マージの実装詳細）
- 参照: `crates/ggufrs/Tickets.md` L367-391（オリジナルチケット定義）

### 成果物

- 計画: context/0145-m3-1-ggufconfigbuild-configrs/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0145-m3-1-ggufconfigbuild-configrs/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0145-m3-1-ggufconfigbuild-configrs/review.md（未作成、/review-ticket 全チェック通過後に作成）
