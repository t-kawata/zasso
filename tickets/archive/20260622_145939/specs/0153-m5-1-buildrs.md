---
ticket_id: 153
title: "M5-1: build.rs モデル自動ダウンロード"
slug: m5-1-buildrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0153-m5-1-buildrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0153-m5-1-buildrs/review.md
plan_path: /Users/kawata/shyme/zasso/tickets/context/0153-m5-1-buildrs/plan.md
---

# M5-1: build.rs モデル自動ダウンロード

## Summary

`build.rs` を作成し、GGUF モデルファイルの自動ダウンロードを実装する。
2つのビルトインモデル（Qwen3.5-0.8B-Q4_K_M, Qwen3.5-2B-Q4_K_M）を
ビルド時に自動的にダウンロードし、「clone & build」だけで推論実行を可能にする。

## Background

### 設計上の位置づけ（RFC §7.1, §7.2）

ggufrs の「clone & build」を実現するための最重要機能。
voiput crate と同一方式（curl/powershell ベース）を採用し、プロジェクト全体の
一貫性を保つ。新しい依存クレートを追加せず、OS 標準のダウンロードツールを使用する。

### 現在の実装状況

- `build.rs`: **未作成**
- `.gitignore`: `/models/` は**既に記述済み**
- `consts/settings.rs`: `DEFAULT_MODEL_DIR`（"models"）と `CURL_TIMEOUT_SECS`（60秒）は**定義済み**
- `consts/mod.rs`: 上記定数は `pub(crate) use` で再公開済み
- `voiput/build.rs`: 参考実装あり — curl（Unix）/ powershell（Windows）のダウンロード関数

### このチケットの必要性

現在、ggufrs のモデルファイルは手動で `models/` ディレクトリに配置する必要がある。
build.rs で自動ダウンロードを行うことで、以下の問題が解決される：

1. **「clone & build」の断絶**: 現在はモデルを別途ダウンロードする手順が必要
2. **バージョン管理の不在**: どのバージョンのモデルを使うべきかが不明確
3. **ビルドの再現性**: モデル不在による推論失敗がビルド時に検出できない

## Scope

### 実装するもの

1. **`crates/ggufrs/build.rs` 作成**
   - `MODEL_FILES` 定数配列: 2つのビルトインモデルの（ファイル名, URL）組
   - `download_file()` Unix 版: `curl -sS -L -m <timeout> -o <dest> <url>` を実行
   - `download_file()` Windows 版: `powershell Invoke-WebRequest` を実行
   - `main()`: モデルディレクトリ作成 → 各ファイルをダウンロード → 存在確認 assert
   - `cargo:rerun-if-changed=models/` で再ビルド条件を指定

2. **`.gitignore` 確認**: `/models/` が既に記述済みであることを確認（変更不要）

### 実装しないもの

- GPU 自動検証 — M5-4 で実装
- feature flags の最終調整 — M5-4 で実装
- カスタムモデルURLの設定ファイルからの読み込み — 現状はハードコードで十分
- ダウンロード進捗バー表示 — curl のデフォルト出力で代替

## Investigation

### ソースコード調査結果

#### 現在のファイル状態

**build.rs**: 未作成。`crates/ggufrs/build.rs` として新規作成する。
Rust のビルドスクリプトは `Cargo.toml` と同じディレクトリに配置する。

**.gitignore** (`crates/ggufrs/.gitignore`):
```gitignore
# ggufrs — ビルド生成物・モデルファイル
# ビルド生成物
/target/
# 自動ダウンロードされるモデルファイル（build.rs で配置）
/models/
```
`/models/` は既に記述済みで変更不要。ただし `.gitignore` が crate ルートに
配置されていることを確認する（`crates/ggufrs/.gitignore` に存在）。

#### 参照: voiput の build.rs 実装

voiput の build.rs は `crates/voiput/build.rs` に実装済み。
ダウンロード関数のパターン:

```rust
// Unix（curl）
#[cfg(not(target_os = "windows"))]
fn download_file(url: &str, dest: &Path) {
    let status = Command::new("curl")
        .args(["-sS", "-L", "-m", "60", "-o", &dest.to_string_lossy(), url])
        .status()
        .expect("Failed to execute curl");
    assert!(status.success(), "Failed to download: {url}");
}

// Windows（powershell）
#[cfg(target_os = "windows")]
fn download_file(url: &str, dest: &Path) {
    let status = Command::new("powershell")
        .args([
            "-NoProfile", "-Command",
            &format!("[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '{url}' -OutFile '{}'", dest.display()),
        ])
        .status()
        .expect("Failed to execute PowerShell.");
    assert!(status.success(), "Failed to download: {url}");
}
```

#### 定数の状態

`consts/settings.rs` に `DEFAULT_MODEL_DIR`（"models"）と `CURL_TIMEOUT_SECS`（60）が
定義済みだが、build.rs は crate の Rust コードに依存できない（ビルドスクリプトは
crate とは独立してコンパイルされる）。そのため、build.rs 内で同様の定数を
直接定義する必要がある。

#### スタブ状況

`crates/ggufrs/src/bin/test-run.rs` に M5-2 用のスタブが2箇所存在する。
M5-1 ではこれらを解決しない（M5-2 担当）。

#### 依存チケットの状態

- **M0-1** (Cargo.toml): ✅ 完了。Cargo.toml は存在し、build.rs の配置も可能

依存は M0-1 のみで、他チケットに依存しない（独立して実装可能）。

#### モデルファイルの URL

RFC §7.1 に記載されたモデルファイルの URL（Hugging Face unsloth）：

```rust
const MODEL_FILES: &[(&str, &str)] = &[
    (
        "Qwen3.5-0.8B-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
    ),
    (
        "Qwen3.5-2B-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf",
    ),
];
```

## Test Plan

### テスト計画

build.rs はビルドスクリプトであるため、通常の `cargo test` ではテストできない。
以下の方法で検証する：

#### 1. コンパイル確認

| # | ケース | 内容 |
|---|--------|------|
| 1.1 | build.rs がコンパイル可能 | `cargo check` でビルドスクリプトが正常にコンパイルされる |
| 1.2 | `.gitignore` に `/models/` が含まれる | ファイル読み取りで確認（Rust 以外の方法だが重要） |

#### 2. 冪等性の確認（手動）

| # | ケース | 内容 |
|---|--------|------|
| 2.1 | モデル不在時はダウンロード | `models/` を削除して `cargo build` → 自動ダウンロードを確認 |
| 2.2 | モデル存在時はスキップ | `models/` にダミーファイルを配置 → 再ビルドが警告なく完了 |
| 2.3 | 不完全ファイルの再ダウンロード | 途中までしかないファイル → 上書きダウンロード |

#### 3. エラーハンドリング

| # | ケース | 内容 |
|---|--------|------|
| 3.1 | ネットワーク不通時 | ダウンロード失敗 → panic でビルド停止（不完全ファイル防止） |
| 3.2 | タイムアウト超過 | 60秒以内に完了しない場合 → curl がタイムアウトし panic |

### テスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| 実際のネットワークダウンロードの自動テスト | 外部ネットワーク依存。CI にモデルを事前配置する等の仕組みが必要。手動確認で代替。 |
| Windows 版の自動テスト | Windows CI ランナーが必要。現状は macOS/Linux のみ。 |

## Boy Scout Rule — 翻訳可能性計画

### 現在のコードの評価

新規作成ファイルのため、過去の違反を引き継ぐリスクはない。

### 遵守すべき翻訳可能性のルール

1. **関数名は動詞句にする**:
   - `download_file` — 「ファイルをダウンロードする」
   - `main` — build.rs のエントリポイント（標準命名）

2. **変数名はドメイン概念を表現する**:
   - `model_files` — モデルファイル一覧
   - `model_dir` — モデル格納ディレクトリのパス
   - `filename`, `url` — ファイル名と URL（self-documenting）

3. **一関数一責務**:
   - `main`: ディレクトリ作成 → ダウンロード → 存在確認（一連の流れ）
   - `download_file`: ダウンロード実行のみ（Unix/Windows で cfg 分岐）

4. **ハードコード値の定数化**:
   - `MODEL_FILES`: ファイル名と URL は定数配列として定義
   - `CURL_TIMEOUT_SECS`: タイムアウト値（settings.rs の値と整合させる）

5. **エラー処理**:
   - `expect()` による明示的なパニック（ビルドスクリプトでは回復不能エラーは panic が適切）
   - 不完全ファイルを残さない（ダウンロード失敗時に panic → 次回ビルドで再ダウンロード）

## Acceptance Criteria

- [ ] `crates/ggufrs/build.rs` が作成されている
- [ ] 2つのビルトインモデルの URL が `MODEL_FILES` 定数配列として定義されている
- [ ] Unix 版 `download_file()` が curl を使用して実装されている
- [ ] Windows 版 `download_file()` が powershell を使用して実装されている
- [ ] `main()` でモデルディレクトリ作成 → ダウンロード → 存在確認が実装されている
- [ ] ダウンロード失敗時に panic する（不完全ファイルを残さない）
- [ ] `cargo:rerun-if-changed=models/` が出力されている
- [ ] `.gitignore` に `/models/` が記述済み（変更不要）
- [ ] `cargo check` が通過する
- [ ] `cargo build` が正常に動作する
- [ ] 全既存テスト（159件）が通過する

## Notes

- build.rs は crate の Rust コードに依存できないため、`DEFAULT_MODEL_DIR` や
  `CURL_TIMEOUT_SECS` を settings.rs から参照することはできない。build.rs 内で
  同様の定数を直接定義する（値は settings.rs と整合させること）
- voiput の build.rs が参考実装として存在する（`crates/voiput/build.rs`）
- モデルファイルサイズ: Qwen3.5-0.8B-Q4_K_M 約 600MB、Qwen3.5-2B-Q4_K_M 約 1.2GB
- Hugging Face unsloth からのダウンロード。大規模ファイルのためタイムアウト60秒は
  設定として妥当（RFC の根拠を踏襲）
- 依存: M0-1（Cargo.toml）のみ。他チケットから独立して実装可能
- 参照: RFC.md §7.1（ダウンロード方式）、§7.2（ファイル構成）
- 参照: `crates/ggufrs/Tickets.md` L554-575（オリジナルチケット定義）
- 参照: `crates/voiput/build.rs`（参考実装）

### 成果物

- 計画: context/0153-m5-1-buildrs/plan.md（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: context/0153-m5-1-buildrs/implementation.md（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: context/0153-m5-1-buildrs/review.md（未作成、`/review-ticket` 全チェック通過後に作成）
