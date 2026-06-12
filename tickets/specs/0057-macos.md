---
id: 57
title: "macOS ランタイムライブラリ収集"
status: reviewed
ticket_ref: M6-1.5
created_at: "2026-06-12"
updated_at: 2026-06-12
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0057-macos/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0057-macos/review.md
---

## 背景 (Background)

### 現状

M6-1 により、`build.rs` の `collect_runtime_libs_macos()` が以下の2ファイルを `target/debug/` から `libs/macos/` にコピーするようになった：

| ファイル | サイズ | 状態 |
|---------|--------|------|
| `libsherpa-onnx-c-api.dylib` | 4.1MB | ✅ 収集済み |
| `libonnxruntime.1.24.4.dylib` | 26MB | ✅ 収集済み |

しかし、以下の課題が残っている：

1. **`libonnxruntime.dylib` 未収集**: sherpa-onnx prebuilt には `libonnxruntime.dylib` が実ファイルとして存在する（`@rpath/libonnxruntime.1.24.4.dylib` と同じ Identity）。ランタイム探索のフォールバックとして必要。
2. **実ライブラリ未使用**: `build.rs` の `can_use_real_library()` が `/usr/lib/swift/libswift_Concurrency.dylib` の存在を確認しているが、macOS 15 では当該 dylib が不在。スタブでフォールバックしている。
3. **`libswift_Concurrency.dylib` 問題**: Tahoe (macOS 26+) 用の Swift コードが `Task` を使用しており、`-Xlinker -force_load_swift_libs` によってリンク時参照が強制される。macOS 15 ではこの dylib が dyld cache に存在せず、実ライブラリリンク時に実行時クラッシュする。
4. **バージョン固定問題**: `libonnxruntime.1.24.4.dylib` がハードコードされており、sherpa-onnx のバージョンアップでファイル名が変わるとコピーされなくなる。

### 調査結果 (Investigation)

#### ランタイム依存チェーン

```
test-run バイナリ
  ├── @rpath/libonnxruntime.1.24.4.dylib (via sherpa-onnx-c-api)
  │     └── CoreML.framework, Foundation.framework, CoreFoundation.framework
  │     └── /usr/lib/libc++.1.dylib, libSystem.B.dylib (システム標準)
  └── @rpath/libswift_Concurrency.dylib (via SpeechHelper static lib, Tahoe code)
        └── macOS 15 では dyld cache に存在せず → リンクエラー
```

#### libonnxruntime.dylib の実体

sherpa-onnx prebuilt (`target/sherpa-onnx-prebuilt/sherpa-onnx-v1.13.2-osx-arm64-shared-lib/lib/`) には `libonnxruntime.dylib` が実ファイルとして存在する。Identity は `@rpath/libonnxruntime.1.24.4.dylib` で、バージョン付きファイルと同一内容。

#### `-force_load_swift_libs` の問題

`build.sh` の `-Xlinker -force_load_swift_libs` により、Swift ランタイムライブラリがすべて強制リンクされる。Tahoe コードが `Task` (`libswift_Concurrency.dylib`) を使用しているため、未実行コードパスにもかかわらず参照が残る。

### Acceptance Criteria

1. `libs/macos/libonnxruntime.dylib` が存在すること（prebuilt からコピー）
2. `can_use_real_library()` の判定条件を「libs/macos/ の全必須 dylib が揃っていること」に変更すること
3. 実ライブラリ使用時に `libswift_Concurrency.dylib` が解決できない問題を解決すること（build.sh から `-force_load_swift_libs` を除去）
4. 再ビルド後の実ライブラリが `libswift_Concurrency.dylib` に依存しないことを確認すること
5. 全 107 テストが通過すること
6. `DYLD_PRINT_LIBRARIES=1` で実行し、全 dylib が過不足なくロードされることを確認すること

## スコープ (Scope)

### 実装範囲（やること）

- **`native/swift/build.sh`**: `-Xlinker -force_load_swift_libs` を除去
- **`build.rs`**:
  - `collect_runtime_libs_macos()` に `libonnxruntime.dylib` 収集を追加
  - バージョン固定からパターンマッチ（`libonnxruntime.*.dylib`）に変更
  - `can_use_real_library()` の判定条件を「libs/macos/ の全必須 dylib 存在」に変更
- **実機検証**: `DYLD_PRINT_LIBRARIES=1 cargo run --bin test-run` で動作確認

### 実装範囲外（やらないこと）

- **M6-1.6**: Windows ランタイムライブラリ収集
- **M6-2**: 統合テスト
- **M6-3**: README
- Tahoe コードパスの修正（macOS 26 未満では到達しないため）

## 設計 (Design)

### build.sh の修正

```bash
# Before:
swiftc \
    -emit-library -static \
    -o "$OUT_DIR/libSpeechHelper.a" \
    -Xlinker -force_load_swift_libs \    # ← 削除
    -module-name SpeechHelper \
    -parse-as-library \
    "$SCRIPT_DIR/SpeechHelper.swift"

# After:
swiftc \
    -emit-library -static \
    -o "$OUT_DIR/libSpeechHelper.a" \
    -module-name SpeechHelper \
    -parse-as-library \
    "$SCRIPT_DIR/SpeechHelper.swift"
```

### build.rs の修正

#### collect_runtime_libs_macos() の改善

```rust
fn collect_runtime_libs_macos(manifest_dir: &std::path::Path) {
    let target_dir = std::path::PathBuf::from(env::var("OUT_DIR").unwrap())
        .join("../../..");
    let libs_dir = manifest_dir.join("libs").join("macos");
    std::fs::create_dir_all(&libs_dir).unwrap();

    // sherpa-onnx dylib 一覧（libonnxruntime.dylib は @rpath 解決用の実ファイル）
    let dylibs = [
        "libsherpa-onnx-c-api.dylib",
        "libonnxruntime.1.24.4.dylib",
        "libonnxruntime.dylib",
    ];

    for name in &dylibs {
        let src = target_dir.join(name);
        if src.exists() {
            let dest = libs_dir.join(name);
            let _ = std::fs::copy(&src, &dest);
        }
    }

    // 必須ファイルの存在確認（libonnxruntime.dylib は必須）
    let required = [
        "libsherpa-onnx-c-api.dylib",
        "libonnxruntime.dylib",
    ];
    let mut all_ok = true;
    for name in &required {
        if !libs_dir.join(name).exists() {
            all_ok = false;
        }
    }
    assert!(all_ok, "...");
}
```

#### can_use_real_library() の変更

```rust
// Before:
fn can_use_real_library() -> bool {
    std::path::Path::new("/usr/lib/swift/libswift_Concurrency.dylib").exists()
}

// After:
fn can_use_real_library() -> bool {
    // libs/macos/ に必須 dylib が全て揃っていれば実ライブラリを使用可能とする。
    // Swift ランタイム（libswift_Concurrency.dylib 等）は macOS 15+ の
    // dyld shared cache に含まれるため同封不要。
    let libs_dir = /* ... */;
    ["libsherpa-onnx-c-api.dylib", "libonnxruntime.dylib"]
        .iter()
        .all(|name| libs_dir.join(name).exists())
}
```

### 実機検証手順

```bash
# 1. 実ライブラリで再ビルド
cargo build --package voiput

# 2. dylib ロード確認
DYLD_PRINT_LIBRARIES=1 cargo run --bin test-run 2>&1 | grep -E "dylib|libsherpa|onnxruntime|swift"

# 3. 全テスト
cargo test --package voiput
```

## テスト計画 (Test Plan)

### ユニットテスト計画

build.rs の修正はユニットテストでは検証不可。以下の手動検証で品質を担保する。

| # | 確認内容 | 方法 | 環境 |
|---|---------|------|------|
| 1 | `libonnxruntime.dylib` が libs/macos/ に存在 | `ls -la libs/macos/libonnxruntime.dylib` | macOS |
| 2 | 実ライブラリが使用されている | build.rs の warning 出力で確認 | macOS |
| 3 | `libswift_Concurrency.dylib` 未参照 | `otool -L target/debug/test-run` に swift_Concurrency がないこと | macOS |
| 4 | 全テスト通過 | `cargo test --package voiput` | 全 |
| 5 | DYLD_PRINT_LIBRARIES で過不足確認 | DYLD_PRINT_LIBRARIES=1 で実行 | macOS |

### ユニットテスト不可能な項目（例外）

- **dylib ロード検証**: 動的リンクのためユニットテスト不可。DYLD_PRINT_LIBRARIES による手動検証
- **Swift コンパイラの動作**: 環境依存のため手動検証。build.sh には swiftc 存在確認あり

## 実装手順

### Step 1: build.sh から `-force_load_swift_libs` を削除

### Step 2: build.rs の collect_runtime_libs_macos() を更新
- `libonnxruntime.dylib` のコピー追加
- 必須チェックを `libonnxruntime.1.24.4.dylib` → `libonnxruntime.dylib` に変更

### Step 3: build.rs の can_use_real_library() を更新
- Swift Concurrency チェック → libs/macos/ 完全性チェック

### Step 4: 実ライブラリで再ビルド
```bash
touch build.rs && cargo build --package voiput
```

### Step 5: テスト実行
```bash
cargo test --package voiput
```

### Step 6: DYLD_PRINT_LIBRARIES 検証
```bash
DYLD_PRINT_LIBRARIES=1 cargo run --bin test-run 2>&1 | grep -E "libsherpa|onnxruntime"
```

## 物理的レビュー方法

1. `ls -la libs/macos/libonnxruntime.dylib` — ファイル存在
2. `cargo build` の warning に "Using real libSpeechHelper.a" と表示されること
3. `otool -L target/debug/test-run | grep swift_Concurrency` → 空であること
4. `cargo test` 全通過
5. DYLD_PRINT_LIBRARIES 出力で dylib が過不足なくロードされること

## リスク

| リスク | 確率 | 影響 | 対策 |
|-------|------|------|------|
| `-force_load_swift_libs` 除去でリンクエラー | 低 | 高 | build.sh で swiftc のエラーを確認。失敗時は元のフラグでリビルド |
| libonnxruntime のバージョン変更 | 中 | 低 | `libonnxruntime.*.dylib` のグロブパターンで対応 |

## Boy Scout Rule — 翻訳可能性計画

- `build.rs`: `can_use_real_library()` の命名は適切（動詞句）。`collect_runtime_libs_macos()` も同様
- `build.sh`: コメントは日本語。英語のエラーメッセージと混在しないよう注意
