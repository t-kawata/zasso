# 実装サマリ — チケット #63: Windows スタブライブラリ除去

## 変更したファイル

### 1. `native/cs/SpeechHelper/SpeechHelper.csproj`
- **変更**: `CopyNativeAotLibs` ターゲットにプロジェクト自身の .lib のコピーを追加
- **詳細**: `<Copy SourceFiles="$(OutputPath)native\$(TargetName).lib" DestinationFolder="$(PublishDir)" SkipUnchangedFiles="true" />`
- **効果**: `dotnet publish` 時に Native AOT の import library（SpeechHelper.lib, 5,478 bytes）が `prebuilt/windows/` 直下にコピーされるようになった

### 2. `crates/voiput/build.rs`
- **変更A** (`try_build_windows_native()`): Native AOT ビルド成功確認時に、.lib が `win-x64/native/` サブディレクトリにある場合のフォールバックコピーを追加
- **変更B** (コメント: Boy Scout): 3箇所の `M6-1` 参照を更新:
  - L274: `（M6-1 で本物に差し替え）` → `（Native AOT ビルド後に置き換わる）`
  - L337 (stub.c): `// M6-1 で本物の...` → `// 実ライブラリが prebuilt/windows/ に存在しない場合のフォールバック`
  - L398: `Replace with real library via M6-1 build` → `Run native/cs/build.ps1 for real library`
  - L282: doc comment に `.lib` サイズ条件（5,000 bytes以上）を追記

### 3. `crates/voiput/src/binary/test-run.rs`
- **変更**: `test_windows()` のエラーメッセージから `M6-1.6` 参照行を削除し、`実ライブラリは prebuilt/windows/ に自動ビルド済みです。` に置き換え

### 4. `prebuilt/windows/`
- **削除**: `speech_helper.lib`（旧スタブ, 1,680 bytes）
- **削除**: `speech_helper.exp`（旧エクスポート, 529 bytes）
- **更新**: `SpeechHelper.lib` をスタブ（2,618 bytes）から Native AOT（5,478 bytes）に差し替え

## 検証結果

| 項目 | 結果 |
|------|------|
| `cargo build -p voiput` | ✅ 成功（スタブ警告なし） |
| `.lib` サイズ確認 | ✅ 5,478 bytes（Native AOT 由来） |
| ビルドスクリプトからの .lib コピー | ✅ csproj の PostPublish ターゲットで動作 |
| 旧スタブファイル削除 | ✅ `speech_helper.lib` / `speech_helper.exp` 削除済み |
| M6-1.6 参照除去（変更ファイル内） | ✅ 全除去完了 |
| 品質チェック | ✅ 0 issues |
| バイナリの PE 検証 | ✅ 正常な PE ファイル（MZ + PE シグネチャ確認済み） |
| `cargo run --bin test-run` | ⚠️ アプリケーション制御ポリシーでブロック（Windows システム設定、コード範囲外） |

## 根本原因の修正

`build.rs` の `link_windows()` は `prebuilt/windows/SpeechHelper.dll`（実 DLL）と `SpeechHelper.lib` の両方の存在を確認すると直ちに「実ライブラリ」パスを取る。しかし `dotnet publish` は DLL のみを出力直下に配置し、Native AOT の import library（.lib）はサブディレクトリに留まる。そのため過去のビルドで生成されたスタブ .lib（2,618 bytes, stub.c 由来）が永続的にリンクされ、`speech_helper_init` が常に -1 を返していた。

**修正**: `SpeechHelper.csproj` の `CopyNativeAotLibs` ターゲットに、プロジェクト自身の .lib を publish 出力に含める処理を追加。これにより、`dotnet publish` 完了時に Native AOT の正しい import library（5,478 bytes）が `prebuilt/windows/SpeechHelper.lib` に配置される。
