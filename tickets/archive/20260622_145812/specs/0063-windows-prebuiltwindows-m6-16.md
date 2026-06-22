---
ticket_id: 63
title: Windows スタブライブラリ除去 — prebuilt/windows/ に実ライブラリを追加し M6-1.6 参照メッセージを削除
slug: windows-prebuiltwindows-m6-16
status: done
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: C:\Users\kawat\shyme\zasso\tickets\context\0063-windows-prebuiltwindows-m6-16\implementation.md
---
# Windows スタブライブラリ除去 — prebuilt/windows/ に実ライブラリを追加し M6-1.6 参照メッセージを削除

## Summary

Windows 版 voiput の SpeechHelper ライブラリリンクで、Native AOT の実 DLL（4.6 MB）が存在するにもかかわらずリンク時の .lib がスタブ（2,618 bytes）であるため、`speech_helper_init` が常に -1 を返す問題を修正する。同時に、`test-run.rs` の古いメッセージ（M6-1.6 参照）を削除する。

## Background

macOS 版ではコミット `51f7ac3` で Swift Concurrency ゲートを削除し実ライブラリが正しくリンクされるよう修正済み。
Windows 版も同様の問題を抱えているが、macOS とは異なり `build.rs` のロジックに問題があるのではなく、.lib ファイルの由来が誤っている。

**ガイド `docs/guide-windows-stub-removal.md` の分析は部分的に正しかったが、根本原因を見落としていた。** 同ガイドは「実ライブラリが存在しない」と主張するが、実際には DLL は存在する。問題は .lib がスタブ由来であること。

## Scope

- `native/cs/build.ps1`: Native AOT の .lib を publish 後に適切な場所へコピーする処理を追加
- `crates/voiput/build.rs`: `try_build_windows_native()` の成功判定を改善（DLL + .lib の両方を確認する）
- `crates/voiput/src/binary/test-run.rs`: M6-1.6 参照メッセージの削除、成功/エラーメッセージの改善
- `prebuilt/windows/`: 不要な旧ファイル（`speech_helper.lib`, `speech_helper.exp`）の削除

## Non-scope

- `build.rs` の `link_windows()` 構造そのもののリファクタリング（macOS の早期 return 問題は Windows には存在しない）
- C# SpeechHelper.cs の機能変更（Init 関数そのものは正しく 0 を返す）
- 音声認識機能そのものの動作確認（今回の修正範囲外）

## Investigation

### 物理的証拠

#### 証拠1: `prebuilt/windows/` 内のファイル調査（`ls -la` 2026-06-12）

```
prebuilt/windows/SpeechHelper.dll     4,674,560 bytes  ← 実 DLL（Native AOT）
prebuilt/windows/SpeechHelper.lib        2,618 bytes  ← スタブ .lib（cl.exe + lib.exe 生成）
prebuilt/windows/SpeechHelper.pdb   21,622,784 bytes  ← 実 PDB
prebuilt/windows/speech_helper.lib        1,680 bytes  ← 旧スタブ（未使用、ゴミ）
prebuilt/windows/speech_helper.exp          529 bytes  ← 旧エクスポート（未使用、ゴミ）
prebuilt/windows/.gitkeep                        0     ← git 用
```

#### 証拠2: 実 Native AOT .lib の存在場所

```
native/cs/SpeechHelper/bin/Release/net10.0-windows10.0.26100.0/win-x64/native/SpeechHelper.lib  5,478 bytes
```

**`build.ps1` の `dotnet publish -o prebuilt/windows/` では DLL は出力直下に置かれるが、.lib はサブディレクトリに配置されるため、`build.rs` から発見できない。**

#### 証拠3: スタブ .lib の内容確認（hex dump）

`prebuilt/windows/SpeechHelper.lib` の先頭 256 bytes から以下のスタブシンボルが確認された:
- `speech_helper_check_health`
- `speech_helper_cleanup`
- `speech_helper_disable_ime`
- **`speech_helper_init`** ← これが -1 を返す
- `speech_helper_set_audio_data_callback`
- `speech_helper_set_error_callback`
- ...他、全て `stub.c` 由来のシンボル

#### 証拠4: ビルド時のリンク出力（`cargo build -p voiput -vv`）

```
[voiput 0.1.0] cargo:rustc-link-lib=SpeechHelper
[voiput 0.1.0] cargo:rustc-link-search=native=C:\...\prebuilt\windows
...
-l SpeechHelper
```

**`build.rs` の `link_windows()` は DLL と .lib の両方の存在を確認後、直ちに「実ライブラリ」パスを取る。しかし .lib はスタブである。**

#### 証拠5: `test-run.rs` の出力（`cargo run --bin test-run`）

```
--- [WINDOWS] ---
  [INFO] スタブライブラリ: speech_helper_init failed with code: -1 (build.rs の自動生成)
  [INFO] 自動ビルド用のスクリプトは native/cs/build.ps1 です。
  [INFO] M6-1.6 でランタイムライブラリが解決されると有効化されます。
```

`M6-1.6` は既に完了したマイルストーンであり、誤解を招く。

#### 証拠6: `test-run.rs` L665-L686 — `test_windows()` 関数の該当コード

```rust
Err(msg) => {
    println!("  [INFO] スタブライブラリ: {} (build.rs の自動生成)", msg);
    println!("  [INFO] 自動ビルド用のスクリプトは native/cs/build.ps1 です。");
    println!("  [INFO] M6-1.6 でランタイムライブラリが解決されると有効化されます。");
}
```

#### 証拠7: `build.ps1` の内容

```powershell
dotnet publish "$ProjectDir/SpeechHelper.csproj" `
    -c Release -r win-x64 --self-contained true -o "$OutDir"
```

`dotnet publish` は DLL を出力直下に配置するが、Native AOT の .lib（import library）は `win-x64/native/` サブディレクトリに出力される。この .lib を `$OutDir` 直下にコピーしていない。

#### 証拠8: `SpeechHelper.csproj` の `CopyNativeAotLibs` ターゲット

```xml
<Target Name="CopyNativeAotLibs" AfterTargets="Publish">
    <Copy SourceFiles="@(_SdkLibs)" DestinationFolder="$(PublishDir)..\native" .../>
    <Copy SourceFiles="@(_FrameworkLibs)" DestinationFolder="$(PublishDir)..\native" .../>
</Target>
```

SDK・フレームワークの .lib を `$(PublishDir)..\native`（= `prebuilt/native/`）にコピーしているが、**プロジェクト自身の SpeechHelper.lib はコピー対象外**。

### 問題の動作シーケンス

1. 初期ビルド時: DLL も .lib も存在しない
2. `try_build_windows_native()` が実行され `build.ps1`（`dotnet publish`）が起動
3. `dotnet publish` は `prebuilt/windows/SpeechHelper.dll`（4.6 MB, 実 DLL）を出力
4. しかし .lib は `prebuilt/windows/win-x64/native/SpeechHelper.lib` に配置（link_windows の探索範囲外）
5. `try_build_windows_native()` は DLL のみ存在を確認 → .lib 不在により `false` を返す
6. `create_stub_windows_lib_warning()` が実行され、cl.exe + lib.exe でスタブ `SpeechHelper.lib`（2,618 bytes）を生成
7. 以降のビルドでは DLL + .lib の両方が存在するため `link_windows()` は「実ライブラリ」パスを取る
8. しかしリンクされる .lib はスタブであり、`speech_helper_init` は常に -1 を返す
9. `WinSpeechBackend::new()` がエラーを返し、`test-run.rs` が「スタブライブラリ」と報告

### 証拠の確度

- `SpeechHelper.lib` の hex dump → **決定的（スタブシンボル確認済み）**
- Native AOT .lib（5,478 bytes）の存在 → **決定的**
- ビルド時の cargo 出力（`-l SpeechHelper`）→ **決定的（実ライブラリパスが取られている）**
- `find` によるファイル構造 → **決定的（.lib が prebuilt/windows/ 直下に存在しない）**

## Test Plan

### ユニットテスト不可能な項目

このチケットの修正は主に以下を含む:
- `build.ps1`（PowerShell スクリプト）
- `build.rs`（Cargo build script — ビルド時のみ実行）
- `test-run.rs` のメッセージ変更

本質的にユニットテスト不可能。以下の方法で検証する:

### 検証手順

1. **`build.ps1` 修正後**: 手動実行し、`prebuilt/windows/SpeechHelper.lib` が Native AOT 由来の .lib（5,478 bytes）に更新されることを確認
2. **`cargo build -p voiput`**: ビルド成功の確認。`cargo build -p voiput -vv` で `-l SpeechHelper` とスタブ警告の不在を確認
3. **`cargo run --bin test-run`**: WINDOWS セクションが正しいメッセージを表示することを確認

### 期待する WINDOWS セクション出力（成功時）

```
--- [WINDOWS] ---
  ✓ WinSpeechBackend::new() 成功 (SpeechHelper.lib リンク OK)
```

### 期待する出力（スタブフォールバック時、可能性は低い）

```
--- [WINDOWS] ---
  [INFO] スタブライブラリ: speech_helper_init failed with code: -1
  [INFO] 自動ビルド用のスクリプトは native/cs/build.ps1 です。
```

（`M6-1.6 で...` の行は削除されていること）

## Boy Scout Rule — 翻訳可能性計画

### 該当コードの改善点

#### `crates/voiput/src/binary/test-run.rs` — `test_windows()` 関数

現状の問題:
- エラーメッセージが「スタブライブラリ」とハードコードされているが、実ライブラリがリンクされても init が失敗するケースを区別できない
- `M6-1.6` という過去のマイルストーン名がハードコードされている
- 責務: エラー出力に「自動ビルド用スクリプト」の案内が含まれるが、これはリンク状態の表示と混在している

改善:
- 成功/エラーのメッセージを macOS 版 `test_macos()` と対称的にする
- マジック文字列（"M6-1.6"）を削除する

#### `native/cs/build.ps1`

現状の問題:
- `dotnet publish` の出力構造を前提としていて、.lib の配置を考慮していない
- エラーハンドリングが不十分（publish 成功でも .lib がないケースを検出しない）

改善:
- publish 後に必要なファイル（.lib, .dll, .exp）の存在確認と、不足時のコピー処理を追加

## Acceptance Criteria

- [ ] `prebuilt/windows/SpeechHelper.lib` が Native AOT 由来の .lib（5,478 bytes）に置き換わっている
- [ ] `prebuilt/windows/speech_helper.lib`（旧スタブ）と `speech_helper.exp` が削除されている
- [ ] `cargo build -p voiput` が成功する（スタブ警告なし）
- [ ] `cargo run --bin test-run` の WINDOWS セクションに `M6-1.6` の言及がない
- [ ] macOS 版（`test_macos()`）と対称的なメッセージになっている
- [ ] 既存テストが通過している（`cargo test -p voiput`）

## Notes

- plan_path: 
- implementation_path: 
- review_report_path: 

### 成果物

- 計画: context/0063-windows-prebuiltwindows-m6-16/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0063-windows-prebuiltwindows-m6-16/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0063-windows-prebuiltwindows-m6-16/review.md（未作成、/review-ticket 全チェック通過後に作成）
