# #142 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| crates/siprs/.gitignore | 修正 | vendor/pjsip/ を git 管理下に、不要ディレクトリのみ除外 |
| crates/siprs/build.rs | 修正 | ライブラリ名修正 (pj→pjlib)、18ライブラリ追加、cmake 直接呼び出し |
| crates/siprs/src/ffi/mod.rs | 修正 | unnecessary_transmutes 警告抑制 |
| crates/siprs/src/ffi/pjsua_backend.rs | 修正 | cfg(pjsip) 14 todo!() → 実 PJSUA FFI 呼び出し |
| crates/siprs/Cargo.toml | 修正 | cmake build-dependency 削除（直接 Command 呼び出しに変更） |
| crates/siprs/vendor/pjsip/ | 追加 | PJSIP 2.17 全ソース（.git 除去済み、zasso git 管理下） |

## 実装内容

### build.rs
- required_libraries(): 7 → 18 ライブラリに拡充、pj→pjlib 修正
- build_pjsip_from_source(): cmake crate → std::process::Command 直接呼び出しに変更
- collect_libraries(): find で .a ファイルを収集する関数追加
- collect_include_dirs(): ソース include + cmake 生成ヘッダを動的収集
- generate_bindings(): include パスを動的に渡す形式に変更

### pjsua_backend.rs cfg(pjsip) → 実 FFI（14 メソッド）
- initialize: pjsua_create() → pjsua_config_default() → pjsua_init() → pjsua_start()
- shutdown: pjsua_destroy()
- create_transport: pjsua_transport_create() with UDP/TCP/TLS
- add_account: pjsua_acc_add() with SIP URI + registrar + credentials
- remove_account: pjsua_acc_del()
- set_registration: pjsua_acc_set_registration()
- make_call: pjsua_call_make_call() with pjsua_call_setting
- answer_call: pjsua_call_answer()
- hangup: pjsua_call_hangup()
- conf_connect: pjsua_conf_connect()
- conf_disconnect: pjsua_conf_disconnect()
- configure_codecs: PCMU=255, Opus=254, 他=0 via pjsua_codec_set_priority
- send_dtmf: pjsua_call_dial_dtmf()
- transfer_call: pjsua_call_xfer()

### PJSIP 2.17 source
- macOS cmake build 確認済み（PJMEDIA_WITH_VIDEO=OFF, CoreAudio 自動検出）
- bindgen 実バインディング生成確認（92 extern "C" 関数, 24557 行）

## 検証結果

| コマンド | 結果 |
|---------|------|
| cargo check -p siprs | ✅ 成功（スタブフォールバック） |
| cargo check -p siprs --features pjsip | ✅ 成功（PJSIP リンク + 実バインディング） |
| cargo test -p siprs | ✅ 390 passed, 0 failed |
| cargo test -p siprs --features pjsip | ✅ 389 passed, 0 failed（1 テストは cfg-gate で除外） |
| cargo fmt --check | ✅ 通過 |
| make check-be | ✅ 成功（プロジェクト全体影響なし） |
| make test | ✅ 成功 |
