---
id: 56
title: プリビルドライブラリ自動ビルド
status: reviewed
ticket_ref: M6-1
created_at: "2026-06-12"
updated_at: 2026-06-12
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0056-untitled-2/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0056-untitled-2/review.md
---

## 背景 (Background)

### 現状の課題

voiput crate の `build.rs` は現在、以下の状態にある：

- **ONNX モデル自動ダウンロード**: 動作している（HuggingFace から 6 ファイル）
- **macOS スタブ生成**: 動作している（cc + ar で最小スタブを生成してリンク解決）
- **Windows スタブ生成**: 動作している（cl.exe + lib.exe でスタブ生成）

しかし、**本物のネイティブライブラリへの自動ビルド機構が欠けている**。現状はスタブがリンクされるだけで、`SpeechRecognizer` の macOS/Windows バックエンドは初期化に失敗する（`init()` が -1 を返す）。

M6-1 では以下を実装する：

1. **MYCUTE からの Swift / C# ソースコピー**: `~/shyme/mycute/native/` から `crates/voiput/native/` へ
2. **自動ビルドスクリプト**: macOS `build.sh` / Windows `build.ps1`
3. **build.rs の自動ビルド機能**: プリビルドライブラリ不在時に `native/` から自動ビルド
4. **`libs/<platform>/` ランタイムライブラリ収集**: sherpa-onnx の OUT_DIR から動的ライブラリを収集
5. **`libs/` の完全性検証**: ビルド完了時に全ファイルの存在確認

### 調査結果 (Investigation)

#### 既存の build.rs (`crates/voiput/build.rs`)

- 500行、macOS/Windows のリンク設定 + ONNX モデル自動ダウンロード
- `link_macos()`: Swift runtime library path の自動探索、RPATH設定、Framework リンク
- `link_windows()`: MSVC ツールチェーン自動検出、システムライブラリリンク
- **不足している機能**:
  - `native/<platform>/` のソースファイルが存在しない（空のディレクトリ）
  - プリビルド不在時の自動ビルド（`native/swift/build.sh` 実行）がない
  - `libs/<platform>/` へのランタイムライブラリ収集がない
  - `cargo:rerun-if-changed=native/` の設定がない

#### MYCUTE のネイティブソース

| ファイル | サイズ | 説明 |
|---------|--------|------|
| `native/swift/SpeechHelper.swift` | 512行 | macOS 音声認識 FFI（Classic + Tahoe + NativeCapture） |
| `native/swift/speech_helper.h` | 50行 | C ヘッダー（ブリッジ用） |
| `native/cs/SpeechHelper/SpeechHelper.cs` | 952行 | Windows 音声認識 FFI（WinRT SpeechRecognizer） |
| `native/cs/SpeechHelper/Check.cs` | 13行 | ヘルスチェック補助 |
| `native/cs/SpeechHelper/SpeechHelper.csproj` | 28行 | C# プロジェクトファイル |

#### sherpa-onnx ランタイムライブラリ（macOS、OUT_DIR）

| ファイル | 説明 |
|---------|------|
| `libsherpa-onnx-c-api.dylib` | sherpa-onnx C API（必須） |
| `libsherpa-onnx-cxx-api.dylib` | sherpa-onnx C++ API（任意、スキップ可） |
| `libonnxruntime.1.24.4.dylib` | ONNX Runtime（必須） |
| `libonnxruntime.dylib` | シンボリックリンク/エイリアス |

#### 依存関係

- **Swift ビルド**: Xcode Command Line Tools（`swiftc`, `swift`）
- **C# ビルド**: .NET SDK 9.0+（`dotnet publish`）
- **ランタイム**: macOS sherpa-onnx の shared dylib は cargo build の OUT_DIR に自動配置される

### Acceptance Criteria

1. `native/swift/SpeechHelper.swift` と `native/swift/speech_helper.h` が `crates/voiput/native/swift/` に存在すること
2. `native/cs/SpeechHelper/` の全ファイルが `crates/voiput/native/cs/SpeechHelper/` に存在すること
3. `native/swift/build.sh` が存在し、macOS で実行可能であること
4. `native/cs/build.ps1` が存在し、Windows で実行可能であること
5. build.rs が `prebuilt/<platform>/<lib>` 不在時に自動ビルドを実行すること
6. build.rs が `libs/<platform>/` にランタイムライブラリを収集すること
7. 自動ビルド失敗時は `panic!` でビルドが停止すること（リンクエラーを未然に防止）
8. `cargo:rerun-if-changed=native/` でソース変更が検出され、再ビルドがトリガーされること
9. 既存の 107 テストがすべて通過すること
10. macOS で `test-run` の `[MACOS]` セクションがスタブではなく実ライブラリの結果を表示すること（M6-1.5 で本物に差し替わるまではスタブのままでも可）

## スコープ (Scope)

### 実装範囲（やること）

- **MYCUTE からの Swift ソースコピー**: `native/swift/SpeechHelper.swift`, `speech_helper.h`
- **MYCUTE からの C# ソースコピー**: `native/cs/SpeechHelper/*`
- **`native/swift/build.sh`** 作成: MYCUTE Makefile の swift-lib ターゲットを基に
- **`native/cs/build.ps1`** 作成: MYCUTE Makefile の windows-helper ターゲットを基に
- **build.rs の更新**:
  - `native/` の cargo:rerun-if-changed 設定
  - プリビルド不在時の自動ビルドロジック（リンク設定は既存のものを流用）
  - `libs/<platform>/` へのランタイムライブラリ収集（sherpa-onnx OUT_DIR からコピー）
  - `libs/` の完全性検証（ファイル欠落時 panic）
- **libs/ の gitignore**: ビルド生成物のため .gitignore に追加

### 実装範囲外（やらないこと）

- **M6-1.5**: macOS `libs/macos/` のランタイムライブラリ収集（本チケットでは build.rs の収集ロジックまで。具体的なファイルの同梱確認は M6-1.5）
- **M6-1.6**: Windows `libs/windows/` のランタイムライブラリ収集（同上）
- **M6-2**: 統合テスト（`tests/` ディレクトリ）
- **M6-3**: README の記述
- MYCUTE の Tauri 関連コード（`tauri_build::build()`）

## 設計 (Design)

### ファイル構成（完成状態）

```
crates/voiput/
├── build.rs                          # 更新: 自動ビルド + libs/ 収集
├── native/
│   ├── swift/
│   │   ├── SpeechHelper.swift        # コピー元: ~/shyme/mycute/native/swift/
│   │   ├── speech_helper.h           # コピー元: ~/shyme/mycute/native/swift/
│   │   └── build.sh                  # 新規作成: swiftc による静的ライブラリビルド
│   └── cs/
│       └── SpeechHelper/
│           ├── SpeechHelper.cs       # コピー元: ~/shyme/mycute/native/cs/SpeechHelper/
│           ├── Check.cs              # コピー元: ~/shyme/mycute/native/cs/SpeechHelper/
│           └── SpeechHelper.csproj   # コピー元: ~/shyme/mycute/native/cs/SpeechHelper/
├── prebuilt/                         # （生成物）自動ビルドされたライブラリ
│   ├── macos/libSpeechHelper.a
│   └── windows/SpeechHelper.lib + SpeechHelper.dll
└── libs/                             # （生成物）ランタイムライブラリ
    ├── macos/
    │   ├── libsherpa-onnx-c-api.dylib
    │   └── libonnxruntime.1.24.4.dylib
    └── windows/
        ├── sherpa-onnx-c-api.dll
        ├── onnxruntime.dll
        ├── SpeechHelper.dll
        ├── vcruntime140.dll
        ├── vcruntime140_1.dll
        └── msvcp140.dll
```

### build.rs の自動ビルドフロー

```
build.rs main()
  ├── ONNX モデル自動ダウンロード（既存、変更なし）
  ├── link_macos() / link_windows()
  │   ├── prebuilt/<lib> 存在 かつ 100KB以上 → 本物としてリンク
  │   ├── prebuilt/<lib> 不在/小さい かつ native/build.sh 存在 → 自動ビルド実行
  │   │   └── 成功 → prebuilt/ に配置 → リンク
  │   │   └── 失敗 → panic! 
  │   └── どちらも不可 → スタブ生成（既存、最終手段）
  └── collect_runtime_libs()
      ├── macOS: OUT_DIR から *.dylib → libs/macos/ へコピー
      ├── Windows: OUT_DIR から *.dll → libs/windows/ へコピー
      └── コピー後、全必須ファイルの存在確認（欠落時 panic!）
```

### macOS build.sh（擬似コード）

```bash
#!/bin/bash
# SpeechHelper 静的ライブラリのビルド
# 出力: prebuilt/macos/libSpeechHelper.a

SWIFTC=swiftc
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$(cd "$SRC_DIR/../../prebuilt/macos" && pwd)"

mkdir -p "$OUT_DIR"

$SWIFTC \
  -emit-library -static \
  -o "$OUT_DIR/libSpeechHelper.a" \
  -Xlinker -force_load_swift_libs \
  -module-name SpeechHelper \
  -parse-as-library \
  "$SRC_DIR/SpeechHelper.swift"

echo "Built: $OUT_DIR/libSpeechHelper.a"
```

### Windows build.ps1（擬似コード）

```powershell
# SpeechHelper DLL (Native AOT) のビルド
# 出力: prebuilt/windows/SpeechHelper.lib + SpeechHelper.dll

$ProjectDir = "$PSScriptRoot/SpeechHelper"
$PublishDir = "$PSScriptRoot/../../prebuilt/windows"

dotnet publish "$ProjectDir/SpeechHelper.csproj" `
  -c Release `
  --self-contained true `
  -o "$PublishDir"

Write-Output "Built: $PublishDir/SpeechHelper.dll"
```

### libs/ 収集ロジック（build.rs 内）

```rust
fn collect_runtime_libs() {
    let target_dir = PathBuf::from(env::var("OUT_DIR").unwrap())
        .join("../../.."); // target/debug/
    let libs_target = manifest_dir.join("libs");

    #[cfg(target_os = "macos")] {
        let mac_dir = libs_target.join("macos");
        std::fs::create_dir_all(&mac_dir).unwrap();
        // sherpa-onnx の dylib をコピー
        copy_if_exists(
            &target_dir.join("libsherpa-onnx-c-api.dylib"),
            &mac_dir.join("libsherpa-onnx-c-api.dylib"),
        );
        copy_if_exists(
            &target_dir.join("libonnxruntime.1.24.4.dylib"),
            &mac_dir.join("libonnxruntime.1.24.4.dylib"),
        );
        // 存在確認
        assert!(
            mac_dir.join("libsherpa-onnx-c-api.dylib").exists(),
            "libs/macos/ に必須 dylib が不足しています"
        );
    }
}
```

## テスト計画 (Test Plan)

### ユニットテスト計画

build.rs は TEST 環境では実行されないため、ユニットテストではなく **ビルド検証と実行時確認** で品質を担保する。

| # | 確認内容 | 方法 | 環境 |
|---|---------|------|------|
| 1 | macOS: `native/swift/build.sh` が存在すること | `test -f native/swift/build.sh` | 全 |
| 2 | macOS: `native/swift/SpeechHelper.swift` が存在すること | `test -f native/swift/SpeechHelper.swift` | 全 |
| 3 | Windows: `native/cs/build.ps1` が存在すること | `test -f native/cs/build.ps1` | 全 |
| 4 | Windows: `native/cs/SpeechHelper/SpeechHelper.cs` が存在すること | `test -f native/cs/SpeechHelper/SpeechHelper.cs` | 全 |
| 5 | `cargo build` がパニックしないこと | `cargo build --package voiput` | 全 |
| 6 | 既存107テストが通過すること | `cargo test --package voiput` | 全 |
| 7 | macOS: test-run の `[MACOS]` が実ライブラリの結果を表示すること | `cargo run --bin test-run` | macOS |
| 8 | `libs/macos/` に必須 dylib が存在すること | `test -f libs/macos/libsherpa-onnx-c-api.dylib` | macOS |

### ユニットテスト不可能な項目（例外）

- **Swift/C# コンパイラの有無検証**: build.rs 内で実行するため、ユニットテストでは代用不可。エラー時は panic! で明確なメッセージを表示する
- **Windows の自動ビルド**: macOS 環境では検証不可。ビルドスクリプトの構文チェックのみ行う

## 実装手順 (Implementation Steps)

### Step 1: ネイティブソースを MYCUTE からコピー

```bash
MYCUTE=~/shyme/mycute
# macOS
cp "$MYCUTE/native/swift/SpeechHelper.swift" crates/voiput/native/swift/
cp "$MYCUTE/native/swift/speech_helper.h" crates/voiput/native/swift/
# Windows
cp "$MYCUTE/native/cs/SpeechHelper/SpeechHelper.cs" crates/voiput/native/cs/SpeechHelper/
cp "$MYCUTE/native/cs/SpeechHelper/Check.cs" crates/voiput/native/cs/SpeechHelper/
cp "$MYCUTE/native/cs/SpeechHelper/SpeechHelper.csproj" crates/voiput/native/cs/SpeechHelper/
```

### Step 2: build.sh を作成

`native/swift/build.sh` — MYCUTE Makefile の `swift-lib` ターゲットを基に

### Step 3: build.ps1 を作成

`native/cs/build.ps1` — MYCUTE Makefile の `windows-helper` ターゲットを基に

### Step 4: build.rs を更新

- `cargo:rerun-if-changed=native/` を追加
- 自動ビルドロジック: prebuilt 不在時に native/build.sh または build.ps1 を実行
- `collect_runtime_libs()` 関数を追加: libs/<platform>/ へのコピー
- `libs/` の存在確認 (cargo:rerun-if-changed も設定)
- `cargo:rerun-if-changed=libs/` の設定

### Step 5: .gitignore を更新

`libs/` はビルド生成物のため `.gitignore` に追加（`prebuilt/` はすでに gitignore 対象か確認）

### Step 6: ビルド・テスト確認

```bash
cargo build --package voiput
cargo test --package voiput
cargo run --bin test-run
```

## 物理的レビュー方法 (Review Method)

1. **ファイル存在確認**: `test -f native/swift/build.sh` 等
2. **コンパイル確認**: `cargo build --package voiput` が通ること
3. **テスト実行**: `cargo test --package voiput` の全テスト通過
4. **品質チェック**: `run-quality-checks.js` で変更ファイルをチェック
5. **test-run 実行**: `[MACOS]` / `[WINDOWS]` セクションの変化を確認

## リスク (Risks)

| リスク | 確率 | 影響 | 対策 |
|-------|------|------|------|
| `swiftc` 未インストール | 低 | 高 | build.rs 内で存在確認し、なければスタブ生成にフォールバック |
| `dotnet` 未インストール | 中（macOS） | 中 | スタブ生成にフォールバック、warning を出力 |
| sherpa-onnx dylib のバージョン変更 | 中 | 中 | ファイル名のパターンマッチで対応（`libonnxruntime.*.dylib`） |
| MYCUTE のネイティブソースがビルドできない | 低 | 高 | MYCUTE のビルド設定を確認。必要に応じて voiput 用に調整 |

## Boy Scout Rule — 翻訳可能性計画

### スコープ内

- `build.rs`: 新規追加する関数（`collect_runtime_libs`）は動詞句で命名。既存の `link_macos` / `link_windows` は命名規則に沿っている
- `build.sh` / `build.ps1`: シェルスクリプトのコメントは日本語（日本人開発者向け）

### スコープ外（注意点）

- `build.rs` の `link_macos()` 関数（148-261行）は「ライブラリリンク」と「Swift runtime パス探索」と「Framework リンク」の3責務を持つ。分割するとより翻訳可能性が高まるが、M6-1 では差分を最小に抑えるため現状維持とする
