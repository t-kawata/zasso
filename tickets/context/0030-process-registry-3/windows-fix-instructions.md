# Windows 動作修正 指示書

## 問題1: sidecar テストが拡張子 `.exe` で失敗する

**エラー内容**:
```
sidecar::tests::bifrost_def_program_path_ends_with_bifrost_http FAILED
  program path should end with 'bifrost/bifrost-http'
  actual: C:\Users\kawat\AppData\Local\Temp\...\bifrost\bifrost-http.exe
```

**原因**: `src-tauri/src/sidecar.rs` の `binary_filename()` が Windows で `"bifrost-http.exe"` を返すが、
テストが `.exe` を想定していない。

**修正箇所**: `src-tauri/src/sidecar.rs` 122〜130行目

```rust
// 現在のコード:
let expected_suffix = format!("bifrost{}bifrost-http", std::path::MAIN_SEPARATOR);

// 修正案:
let expected_suffix = if cfg!(target_os = "windows") {
    format!("bifrost{}bifrost-http.exe", std::path::MAIN_SEPARATOR)
} else {
    format!("bifrost{}bifrost-http", std::path::MAIN_SEPARATOR)
};
```

または、`binary_filename()` を呼び出して比較する方法もある：
```rust
let expected_suffix = format!("bifrost{}{}", std::path::MAIN_SEPARATOR, binary_filename());
```

## 問題2: Windows で統合テストがフリーズする

**証拠**: `cargo test`（procreg）の出力で、統合テストが3件中2件しか結果が出ていない。
`test_depends_on_ordering` と思われるテストがフリーズしている可能性が高い。

### フリーズの原因として考えられる箇所（優先順位順）

### 原因A: watchdog 内の tasklist パース

**ファイル**: `crates/procreg/watchdog/src/main.rs`（Windows の `process_is_alive`）

```rust
#[cfg(windows)]
fn process_is_alive(pid: u32) -> bool {
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .output()
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.contains(&pid.to_string())
        })
        .unwrap_or(false)
}
```

**調査すべきこと**:
1. `tasklist` の出力フォーマットを確認（`/NH` なしで実行し、実際の出力をキャプチャ）
2. PID 文字列が `out` に含まれているかの判定ロジックが正しいか確認
   - `tasklist` の出力には PID が数値で含まれる。`1234` が `12345` にもマッチする可能性
   - ただしこれは誤検知（false positive）であって、フリーズの原因にはならないはず
3. 最も怪しいのは `.output()` がハングしている可能性
   - `tasklist` がプロンプトを表示して終了しないケース
   - `timeout` 付きで実行する必要があるか確認

**修正案**: kill や tasklist にタイムアウトを追加する

### 原因B: watchdog バイナリの展開が Windows で正常に動作していない

**ファイル**: `crates/procreg/src/watchdog.rs` の `extract_watchdog()`

`create_new(true)` で排他ロックしているが、Windows のファイルシステムでは
プロセス実行中にファイルがロックされる可能性がある。

**調査手順**:
1. `extract_watchdog()` が正常にファイルを作成し、内容が正しいか確認
   - 展開先: `%TEMP%\procreg-watchdog-<PID>-<counter>`
2. `std::fs::write` で書き込んだバイナリが `std::process::Command` で実行可能か確認
3. 一時ファイル作成のデバッグログを追加して実際のパスを出力

### 原因C: spawn_one の Windows パス

**ファイル**: `crates/procreg/src/spawn.rs`

`spawn_one` で `tokio::process::Command` に `watchdog_path` と `--` 区切りで引数を渡しているが、
Windows の `cmd.exe` 等を子プロセスとして起動する場合に引数解釈が異なる可能性。

**調査手順**:
1. `test_depends_on_ordering` と `test_start_and_stop` のそれぞれに
   タイムアウトを付けて単体実行し、どちらがフリーズするか特定
2. 以下のように `#[cfg(windows)]` で分岐したテストを追加して検証：

```rust
#[cfg(windows)]
#[tokio::test(flavor = "multi_thread")]
async fn test_watchdog_spawns_cmd_on_windows() {
    // watchdog 経由で cmd /c echo が実行できるか
    let watchdog_path = crate::watchdog::extract_watchdog().unwrap();
    let output = tokio::process::Command::new(&watchdog_path)
        .arg("--")
        .arg("cmd.exe")
        .arg("/c")
        .arg("echo hello")
        .output()
        .await;
    assert!(output.is_ok());
    let out = output.unwrap();
    assert!(out.status.success());
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("hello"));
}
```

## 修正後の確認コマンド

```powershell
# procreg 単体テスト（フリーズしないことを確認）
cd crates\procreg
cargo test --lib -- --test-threads=1

# 統合テスト（フリーズしないことを確認）
cargo test --test integration -- --test-threads=1 --nocapture

# src-tauri テスト
cd ..\src-tauri
cargo test --lib -- sidecar
```
