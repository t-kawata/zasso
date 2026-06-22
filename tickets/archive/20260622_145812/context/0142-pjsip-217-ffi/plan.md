# M19-1b / #142 実装計画

## 要件
PJSIP 2.17 ソースを zasso git 管理下に統合し、cargo build --features pjsip で CMake ビルド→bindgen→リンクが動作する状態にする。PJSIP 不在で保留されていた全 FFI スタブを実 PJSUA C API 呼び出しで実装する。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| .gitignore | 修正 | vendor/pjsip/ 除外削除 |
| build.rs | 修正 | ライブラリ名修正、cmake 直接呼び出し |
| pjsua_backend.rs | 修正 | cfg(pjsip) 14 todo!() → 実 FFI |
| media.rs | 修正 | cfg(pjsip) conf → 実 API |

## Phase 1: ビルド基盤
1. .gitignore 修正（vendor/pjsip/ 管理下へ）
2. required_libraries() 修正（pj→pjlib, 18ライブラリ）
3. cmake crate 廃止→std::process::Command 直接呼び出し
4. ライブラリ収集関数（find *.a → flat lib/）
5. bindgen include パス動的収集

## Phase 2: PjsuaBackend 14 メソッド
initialize/shutdown/create_transport/add_account/remove_account/set_registration/make_call/answer_call/hangup/conf_connect/conf_disconnect/configure_codecs/send_dtmf/transfer_call

## Phase 3: AudioBridge conf
connect_to_conference/disconnect → 実 pjsua_conf_* API

## Phase 4: 検証
既存テスト全通過 + cfg ゲート調整
