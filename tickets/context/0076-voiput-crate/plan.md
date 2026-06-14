# M8-3: Voiput 拡張 実装計画

## 要件
Voiput にホットキー駆動音声入力の全責務を内蔵する。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
| src/types.rs | 変更 | InputMode enum + SttEvent::Flushed variant |
| src/voiput.rs | 変更 | 7新規フィールド + 6新規メソッド + flush_tx発火 + ホットキーディスパッチ |

## Boy Scout
- flush_tx 4段階発火を try_send_flush_text() に抽出
- cfg 分岐を関数内部で完結
- oneshot の unwrap 禁止

## テスト計画
9 ユニットテスト

## 実装手順
1. types.rs: InputMode + Flushed variant
2. voiput.rs: フィールド追加
3. build_flush_text() / try_send_flush_text()
4. request_flush() / paste_at_cursor()
5. enable_hotkeys() / disable_hotkeys()
6. next_event() 内 flush_tx 発火
7. テスト + cargo check
