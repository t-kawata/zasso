---
title: "Windows スタブライブラリ除去 — M6-1.6 相当の対応手順"
created_at: "2026-06-12"
updated_at: "2026-06-12"
---

# Windows スタブライブラリ除去の対応手順

## 背景

voiput crate の macOS 版では、`prebuilt/macos/libSpeechHelper.a` が実ライブラリ（208KB）としてビルド済みで git 管理されているにもかかわらず、`build.rs` の `can_use_real_library()` 関数が Swift Concurrency ランタイムのファイル存在チェックをしていたため、**スタブライブラリ（2.5KB）がリンクされていました**。

macOS での修正内容:

1. **`build.rs`**: Swift Concurrency のファイル存在チェック（`/usr/lib/swift/libswift_Concurrency.dylib`）を削除し、実ライブラリが存在すれば常に使用するよう変更。また、早期 return により Swift ランタイムパス（`cargo:rustc-link-search` + rpath）の設定がスキップされていた構造を修正し、常に Swift パスが設定されるようにした。
2. **`src/binary/test-run.rs`**: `[MACOS]` セクションの古いメッセージ（「M6-1.5 でランタイムライブラリが解決されると有効化」）を削除。
3. **`src/binary/test-run.rs`**: VAD モデルパスを `/tmp/` のダミーから実在する `models/` ディレクトリのパスに修正。

参照コミット: `51f7ac3`

## Windows で必要な対応

Windows でも同様の問題が発生しています。`cargo run --bin test-run` の出力:

```
--- [WINDOWS] ---
  [INFO] スタブライブラリ: speech_helper_init failed with code: -1 (build.rs の自動生成)
  [INFO] 自動ビルド用のスクリプトは native/cs/build.ps1 です。
  [INFO] M6-1.6 でランタイムライブラリが解決されると有効化されます。
```

### 根本原因

macOS とは異なり、Windows の `build.rs` には実ライブラリの使用を妨げる人為的なゲートは**ありません**（`link_windows()` は `SpeechHelper.dll + .lib` が存在すれば直ちにリンクする）。問題は **実ライブラリが `prebuilt/windows/` に存在しない** ことです。

そのため、以下のフォールバックパスが動作しています:

```
実ライブラリ不在 → C# Native AOT ビルド試行（build.ps1）→ 失敗 → スタブ生成
```

### 対応手順

#### ファイル1: `crates/voiput/build.rs` — `link_windows()` 関数

**現状:**

```rust
#[cfg(target_os = "windows")]
fn link_windows(prebuilt: &PathBuf) {
    let win_dir = prebuilt.join("windows");
    let lib_path = win_dir.join("SpeechHelper.lib");
    let dll_path = win_dir.join("SpeechHelper.dll");

    // 本物のライブラリ（.lib + .dll の両方が存在）を使う
    if dll_path.exists() && lib_path.exists() {
        println!("cargo:rustc-link-lib=SpeechHelper");
        println!("cargo:rustc-link-search=native={}", win_dir.display());
        copy_windows_dll_to_out(&dll_path);
        emit_windows_system_libs();
        return;
    }

    // C# Native AOT ビルドを試行
    if try_build_windows_native(&win_dir) { ... return; }

    // スタブ生成
    create_stub_windows_lib_warning(&win_dir, &lib_path);
    emit_windows_system_libs();
}
```

**必要な修正:**

1. **実ライブラリの事前ビルドと git 管理**:
   - Windows PC で `powershell -File crates/voiput/native/cs/build.ps1` を実行し、`prebuilt/windows/SpeechHelper.dll` と `prebuilt/windows/SpeechHelper.lib` を生成する
   - 生成されたファイルを git に追加する（`.gitignore` で `prebuilt/` が除外されていないことを確認）
   - 参考: macOS では `prebuilt/macos/libSpeechHelper.a`（208KB）が git 管理されている

2. **フォールバックパスの警告メッセージ更新**:
   - `create_stub_windows_lib_warning()` 内のコメント `"M6-1 で本物の SpeechHelper.lib に差し替えること"`（stub.c 内のコメント） → `"実ライブラリが prebuilt/windows/ に存在しません。native/cs/build.ps1 を実行してください"`
   - `create_stub_windows_lib_warning()` 内の `println!("cargo:warning=Using stub speech_helper.lib ...")` で `M6-1` への言及があれば削除/更新

   macOS 版での参考修正（build.rs の `generate_stub_macos` 呼び出し前）:
   ```rust
   // Before (macOS):
   println!("cargo:note=libSpeechHelper.a exists but Swift Concurrency not available (macOS 15). Using stub.");
   // After:
   // （メッセージ自体を削除。実ライブラリが存在しない場合のみスタブに落ちる）
   ```

3. **構造的には修正不要**（macOS のような早期 return + ランタイムパススキップの問題は Windows には存在しない）

#### ファイル2: `crates/voiput/src/binary/test-run.rs` — `test_windows()` 関数

**現状（L679-L683）:**

```rust
Err(msg) => {
    println!("  [INFO] スタブライブラリ: {} (build.rs の自動生成)", msg);
    println!("  [INFO] 自動ビルド用のスクリプトは native/cs/build.ps1 です。");
    println!("  [INFO] M6-1.6 でランタイムライブラリが解決されると有効化されます。");
}
```

**必要な修正:**

1. `"M6-1.6 でランタイムライブラリが解決されると有効化されます。"` → **削除する**（M6-1.6 は既に完了しており、誤解を招く）
2. 実ライブラリが存在する場合の成功メッセージに変更する（macOS の `test_macos()` を参考に）

   macOS 版での参考修正:
   ```rust
   // Before:
   //   [INFO] スタブライブラリ: ...
   //   [INFO] M6-1.5 でランタイムライブラリが解決されると有効化されます。
   // After:
   //   ✓ MacSpeechBackend::new() 成功 (libSpeechHelper.a リンク OK)
   ```

   期待する出力（実ライブラリリンク成功時）:
   ```
   --- [WINDOWS] ---
     ✓ WinSpeechBackend::new() 成功 (SpeechHelper.lib リンク OK)
   ```

   期待する出力（スタブフォールバック時、最小限のメッセージ）:
   ```
   --- [WINDOWS] ---
     [INFO] スタブライブラリ: speech_helper_init failed with code: -1
     [INFO] 自動ビルド用のスクリプトは native/cs/build.ps1 です。
   ```

### 検証手順

実ライブラリ生成後:

```powershell
# 実ライブラリがリンクされることを確認
cargo build --package voiput 2>&1 | findstr SpeechHelper

# 全テスト通過
cargo test --package voiput

# test-run で WINDOWS セクションを確認
cargo run --bin test-run
```

期待する WINDOWS セクション出力:

```
--- [WINDOWS] ---
  ✓ WinSpeechBackend::new() 成功 (SpeechHelper.lib リンク OK)
```

### 補足: macOS と Windows の非対称性

| 項目 | macOS | Windows |
|------|-------|---------|
| 実ライブラリの状態 | 既に存在（208KB, git管理） | 未ビルド（これから生成が必要） |
| build.rs の問題 | Swift Concurrency ゲートが偽陰性 | 問題なし（実ライブラリが存在すればリンクされる） |
| 必要な作業 | ゲート削除 + メッセージ更新 | 実ライブラリビルド + git管理 + メッセージ更新 |
| test-run.rs のメッセージ | 古い M6-1.5 参照を削除 | 古い M6-1.6 参照を削除 |

### 参考: macOS での修正コミット

```bash
git show 51f7ac3 --stat
# M  crates/voiput/build.rs
# M  crates/voiput/prebuilt/macos/libSpeechHelper.a
# M  crates/voiput/src/binary/test-run.rs
```

`build.rs` の修正内容は `git show 51f7ac3 -- crates/voiput/build.rs` で確認可能。
