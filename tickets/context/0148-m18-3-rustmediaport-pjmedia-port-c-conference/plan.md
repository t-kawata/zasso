# #148 実装計画

## 要件
media.rs の残り 2 スタブを解決。pjmedia_port C ラッパーで AudioBridge conference 接続を実装。

## 変更ファイル
| ファイル | 種別 | 内容 |
|---------|------|------|
| ffi/media.rs | 修正 | register_media_port + cfg(pjsip) connect/disconnect + [::STUB::] 除去 |

## 実装手順
1. register_media_port(): pool確保→pjmedia_port構築→get_frame/put_frame設定→conf_add_port
2. connect_to_conference cfg(pjsip): register ×2 + conf_connect ×2
3. disconnect cfg(pjsip): conf_disconnect ×2
4. [::STUB::] 削除
5. 検証
