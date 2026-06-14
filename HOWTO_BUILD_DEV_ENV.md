# 開発環境構築手順 (HOWTO_BUILD_DEV_ENV)

## プロジェクト概要

zasso は以下の技術スタックで構成されるデスクトップアプリケーションです。

| 層 | 技術 | 役割 |
|----|------|------|
| デスクトップシェル | Tauri v2 (Rust) | ウィンドウ管理、システムトレイ、ネイティブ機能 |
| フロントエンド | Quasar (Vue.js 3)  via Vite | UI 全体 |
| REST API | Axum (Rust) | バックエンドサーバー |
| 音声認識 | voiput crate | クロスプラットフォーム音声認識 |
| Windows 音声認識 | C# Native AOT DLL | WinRT SpeechRecognizer |
| macOS 音声認識 | Swift 静的ライブラリ | SFSpeechRecognizer |
| データベース | SeaORM (SQLite / MySQL / PostgreSQL) | 永続化 |

---

## 共通 prerequisites（全プラットフォーム）

| ツール | バージョン | インストール方法 |
|--------|-----------|----------------|
| Git | 任意 | https://git-scm.com またはパッケージマネージャ |
| Rust | 最新安定 (rustc 1.95+, edition 2021) | https://rustup.rs |
| Node.js | 18+ | https://nodejs.org またはパッケージマネージャ |
| pnpm | 9+ | `npm install -g pnpm` |

```bash
# Rust のインストール
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# ツールチェーンの確認
rustup show

# pnpm のインストール
npm install -g pnpm
```

### リポジトリのクローン

```bash
git clone https://github.com/t-kawata/zasso.git
cd zasso
```

---

## Windows 開発環境

### 必要なツール

| ツール | 必須 | バージョン | インストール方法 |
|--------|------|-----------|----------------|
| Visual Studio Build Tools | ✅ **必須** | 2022+ (17.x) | [Visual Studio ダウンロード](https://visualstudio.microsoft.com/ja/downloads/) — 「C++によるデスクトップ開発」ワークロード |
| .NET SDK | ✅ **必須** | 10.0+ | https://dotnet.microsoft.com/ja-jp/download |
| WebView2 | ✅ 標準搭載 | — | Windows 10/11 に標準搭載 |
| Windows SDK | ✅ Build Tools に含む | 10.0.26100+ | Build Tools インストーラで選択 |

### インストール手順

#### 1. Visual Studio Build Tools

インストーラを実行し、以下のワークロードを選択してください：

- **C++ によるデスクトップ開発** (Desktop development with C++)
  - 内部のオプション「MSVC v143 - VS 2022 C++ x64/x86 ビルドツール」も含まれていることを確認
- **Windows 10 SDK (10.0.26100.0)** 以上

> **注意**: `cargo build` は MSVC リンカ（link.exe）を必要とします。MinGW/GCC ではビルドできません。

#### 2. .NET SDK

https://dotnet.microsoft.com/ja-jp/download/dotnet/10.0 から SDK をインストール。

```powershell
# インストール確認
dotnet --version
# → 10.0.300 以上
```

#### 3. Rust (rustup)

```powershell
# rustup をインストール。デフォルトは MSVC ツールチェーン
# すでにインストール済みの場合は最新に更新
rustup update stable
```

Rust ツールチェーンは `stable-x86_64-pc-windows-msvc` を使用します。`gnu` 系ではビルドできません。

```powershell
# 確認
rustc --version
rustup show
```

### ビルドの流れ

```powershell
# 1. ネイティブライブラリを事前ビルド（初回のみ・更新時）
cd crates/voiput
powershell -NoProfile -ExecutionPolicy Bypass -File native/cs/build.ps1

# 2. プロジェクトルートに戻る
cd ../..

# 3. フロントエンド依存解決
cd fe
pnpm install
cd ..

# 4. ビルド
cargo build

# 5. テスト
cargo test --package voiput

# 6. 開発用デモ
cargo run --bin test-run  # または crates/voiput ディレクトリで実行
```

> **build.rs** が自動的に Native AOT ビルドを実行します。`native/cs/build.ps1` を事前実行しなくても `cargo build` 時に自動でビルドされますが、初回はビルド時間が長くなります。

### HVCI (メモリ整合性) によるブロックと回避方法

#### 現象

Windows で Memory Integrity（HVCI / Hypervisor-protected Code Integrity）が有効な環境では、`cargo run --bin test-run` や `cargo test` で以下のエラーが発生します。

```
Caused by:
  アプリケーション制御ポリシーによってこのファイルがブロックされました。 (os error 4551)
```

これは **未署名の開発ビルドバイナリ** が HVCI によって実行を拒否されるためです。コードの問題ではなく、開発環境固有の制約です。

#### 回避手順

**方法 A: メモリ整合性を一時的にオフにする（推奨）**

1. 「Windows セキュリティ」を開く（スタートメニューから検索）
2. 「デバイス セキュリティ」 → 「コア分離の詳細」
3. 「メモリ整合性」を **オフ**
4. PC を再起動

検証が終わったら、同じ手順でオンに戻してください。

**方法 B: ビルド出力ディレクトリを Windows Defender の除外に追加**

```powershell
# 管理者 PowerShell
Add-MpPreference -ExclusionPath "C:\path\to\zasso\crates\voiput\target"
```

ただし、HVCI（メモリ整合性）が有効な場合は効果がありません（上記の方法 A が必要）。

**方法 C: コード署名証明書で署名する（本番配布時）**

配布用バイナリは EV コード署名証明書で署名することで、HVCI 下でも実行可能になります。
Tauri ビルド（`make build`）の成果物は署名して配布するフローが標準です。

#### 注意点

- HVCI は **Windows 11 の企業管理端末で有効になっていることが多い** ですが、一般ユーザーではほとんどオフです
- 署名なし開発バイナリのブロックは開発機のみの問題で、配布物には影響しません
- メモリ整合性をオフにしても、Windows Defender のリアルタイム保護は有効なままです

#### 補足: Windows Defender リアルタイム保護によるブロック

上記の方法 B（Defender 除外）は、**HVCI ではなく Windows Defender リアルタイム保護が原因でブロックされている場合に有効です。** 以下のエラーは HVCI と Defender の両方で発生し得るため、実際にどちらがブロックしているかは事象ごとに切り分けが必要です。

```
Caused by:
  アプリケーション制御ポリシーによってこのファイルがブロックされました。 (os error 4551)
```

実機での切り分けと対策：

```powershell
# Defender のリアルタイム保護状態を確認
Get-MpComputerStatus | Select-Object RealTimeProtectionEnabled

# プロジェクト全体を Defender 除外に追加（管理者権限不要）
Add-MpPreference -ExclusionPath "C:\path\to\zasso"
Add-MpPreference -ExclusionPath "C:\path\to\zasso\target"
Add-MpPreference -ExclusionPath "C:\path\to\zasso\crates"
Add-MpPreference -ExclusionPath "C:\path\to\zasso\src-tauri\target"
```

除外追加後にブロックが解消されれば、原因は Defender リアルタイム保護です。解消されなければ HVCI または WDAC が原因のため、上記の方法 A または方法 C を試してください。

---

## macOS 開発環境

### 必要なツール

| ツール | バージョン | インストール方法 |
|--------|-----------|----------------|
| Xcode | 16+ | App Store または https://developer.apple.com |
| Xcode Command Line Tools | — | `xcode-select --install` |
| Rust (rustup) | stable | https://rustup.rs |

### インストール手順

#### 1. Xcode Command Line Tools

```bash
xcode-select --install
```

Xcode を App Store からインストールしている場合は、一度 `xcode-select` でパスを通します。

```bash
sudo xcode-select -switch /Applications/Xcode.app/Contents/Developer
```

#### 2. Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable
```

### ビルドの流れ

```bash
# 1. ネイティブライブラリを事前ビルド（初回のみ・更新時）
bash crates/voiput/native/swift/build.sh

# 2. フロントエンド依存解決
cd fe
pnpm install
cd ..

# 3. ビルド
cargo build

# 4. テスト
cargo test --package voiput
```

> `build.rs` が自動的に Swift ライブラリをビルドします（`native/swift/build.sh` を呼び出します）。

### macOS 15+ と Swift Concurrency ランタイム

macOS 16+ では `libswift_Concurrency.dylib` が dyld 共有キャッシュ内にあるため、ファイル存在チェックでは検出できません。`build.rs` は swiftc の `-print-target-info` 出力をパースしてランタイムパスを解決します。Xcode がインストールされていれば自動的に動作します。

---

## Linux 開発環境

### 必要なツール

| ツール | インストール方法 |
|--------|----------------|
| Rust | https://rustup.rs |
| システムライブラリ | パッケージマネージャでインストール |

### システムライブラリ

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libasound2-dev \
    libsoup-3.0-dev \
    libjavascriptcoregtk-4.1-dev
```

```bash
# Fedora
sudo dnf groupinstall "C Development Tools and Libraries"
sudo dnf install webkit2gtk4.1-devel gtk3-devel \
    libappindicator-gtk3-devel librsvg2-devel \
    openssl-devel alsa-lib-devel
```

### 制約

Linux では OS ネイティブの音声認識バックエンド（macOS の SFSpeechRecognizer、Windows の WinRT SpeechRecognizer）は**利用できません**。OpenAI Whisper API バックエンドのみが使用可能です。

```bash
# テスト実行（OpenAI バックエンドのみ）
cargo test --package voiput

# OpenAI モードで test-run
cargo run --bin test-run -- --openai-key=sk-xxxxx
```

`test-run` を引数なしで実行した場合、WINDOWS と MACOS のセクションは `[SKIP]` と表示されます。

---

## フロントエンド開発

フロントエンドは `fe/` ディレクトリにあります。

```bash
# 依存関係インストール
cd fe
pnpm install

# 開発サーバー起動（ホットリロード）
pnpm quasar dev

# プロダクションビルド
pnpm quasar build
```

### Tauri との統合

フロントエンドとバックエンドを統合するには、プロジェクトルートで以下を実行：

```bash
# 開発モード（ホットリロード + Tauri）
make run

# 本番ビルド
make build
```

---

## テスト

```bash
# 全テスト
cargo test --package voiput

# 統合テストのみ
cargo test --test integration_test

# 特定モジュール
cargo test --package voiput -- pipeline::
```

Windows では `cargo test` 実行時に `crates/voiput/` ディレクトリにいる必要がある場合があります。

---

## 開発用デモ (test-run)

```bash
# 全機能デモ
cargo run --bin test-run

# 音声再生テスト
cargo run --bin test-run -- --audio-verify

# OpenAI 実認識テスト
cargo run --bin test-run -- --openai-key=sk-xxxxx

# カスタムベースURL
cargo run --bin test-run -- --openai-key=sk-xxxxx --base-url=http://localhost:8080/v1
```

> `test-run` バイナリは `crates/voiput/src/binary/test-run.rs` にあります。
> `cargo run --bin test-run` はリポジトリルートではなく `crates/voiput/` から実行することもできます。

---

## ネイティブライブラリの手動ビルド

通常は `build.rs` が自動的にビルドしますが、トラブルシューティングや事前ビルドのために手動で実行することもできます。

### Windows (C# Native AOT)

```powershell
cd crates/voiput
powershell -NoProfile -ExecutionPolicy Bypass -File native/cs/build.ps1
```

出力: `crates/voiput/prebuilt/windows/SpeechHelper.dll` + `.lib`

必要条件:
- .NET SDK 10.0+ (`dotnet --version`)
- Visual Studio Build Tools 2022+（MSVC コンパイラ）

### macOS (Swift 静的ライブラリ)

```bash
bash crates/voiput/native/swift/build.sh
```

出力: `crates/voiput/prebuilt/macos/libSpeechHelper.a`

必要条件:
- Xcode Command Line Tools (`swiftc`)

---

## トラブルシューティング

### 「アプリケーション制御ポリシーによってブロックされました」(Windows)

Windows Defender リアルタイム保護、HVCI（メモリ整合性）、WDAC（Windows Defender Application Control）のいずれかが原因です。

→ **HVCI / メモリ整合性** の項および上記の補足を参照。

### `make push` が `error: invalid path 'nul'` で失敗する

#### 現象

```text
error: invalid path 'nul'
error: unable to add 'nul' to index
fatal: adding files failed
```

`nul` は Windows の予約デバイス名です。Git Bash (MSYS2) 環境で何らかのプロセス（`sed -i` の一時ファイル生成等）がカレントディレクトリに実ファイル `nul` を生成すると、`git add .` が Windows の予約名制限に引っかかって失敗します。

#### 対処

```bash
# ファイルを削除
rm -f nul

# .gitignore に追加して再発防止
echo "nul" >> .gitignore
```

プロジェクトの `.gitignore` にはあらかじめ `nul` が記載済みです。

### 「LINK : fatal error LNK1104: file 'SpeechHelper.lib' を開くことができません」

```powershell
# ネイティブライブラリを手動ビルド
powershell -NoProfile -ExecutionPolicy Bypass -File crates/voiput/native/cs/build.ps1
```

### 「swiftc not found」(macOS)

```bash
xcode-select --install
# または
sudo xcode-select -switch /Applications/Xcode.app/Contents/Developer
```

### VAD モデルファイルがダウンロードされない

`build.rs` が初回ビルド時に自動ダウンロードします。
プロキシ環境下の場合は環境変数 `HTTP_PROXY` / `HTTPS_PROXY` を設定してください。

```bash
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
```

手動ダウンロード: https://huggingface.co/t-kawata/mycute
