# 実装成果: チケット #74 — M6-3 RawSipMessage / SipMessageDirection

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/event.rs | 追記 | SipMessageDirection + RawSipMessage + 2 methods + 8 tests |

## 実装内容

### SipMessageDirection (enum)
- Sent / Received — SIP メッセージの物理的送受信方向

### RawSipMessage (struct) — 9 fields
- direction, transport, start_line, headers, body, text, content_length, remote_addr, local_addr
- from_raw_parts(...) — 全 9 引数の constructor（FFI 層用）
- with_redaction(redact) — Authorization / Proxy-Authorization を "***REDACTED***" に置換
- ヘッダ名比較は to_lowercase() で大文字小文字区別なし

## テスト結果
- 224 tests PASS（既存 216 + 新規 8）
- 0 warnings
- Quality checks: 0 issues

## 🎉 M6 マイルストーン完了
- M6-1 (#72): SipEventPayload ✅
- M6-2 (#73): SipEvent / EventMeta ✅
- M6-3 (#74): RawSipMessage ✅
