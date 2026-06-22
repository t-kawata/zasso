# #148 実装サマリ

## 変更ファイル
`src/ffi/media.rs` のみ

## 実装内容
- conf_port_get_frame / conf_port_put_frame: pjmedia_port→RustMediaPort 変換 callback
- register_conf_port(): pj_pool_t 確保→pjmedia_port 構築→pjsua_conf_add_port()
- AudioBridge::connect_to_conference() cfg(pjsip): 2ポート登録 + pjsua_conf_connect ×2
- AudioBridge::disconnect() cfg(pjsip): pjsua_conf_disconnect + conf_remove_port
- AudioBridge に capture_conf_id / playback_conf_id フィールド追加
- [::STUB::] マーカー 2 件削除（行 232, 257）

## 検証結果
| コマンド | 結果 |
|---------|------|
| cargo test -p siprs | ✅ 392 passed |
| cargo fmt --check | ✅ |
| make check-be | ✅ |
| siprs [::STUB::] 残数 | **🎉 0** |
