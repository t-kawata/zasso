# 実装成果: チケット #72 — M6-1 SipEventPayload enum + Info 構造体

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/event.rs | 新規 | SipEventPayload (36 variants) + 20 Info structs + 6 tests |
| crates/siprs/src/error.rs | 修正 | SipError に Clone を追加 |
| crates/siprs/src/lib.rs | 修正 | pub mod event; を有効化 |

## 実装内容

### SipEventPayload (36 variants)
- 登録系 6 / 発着信系 13 / メディア系 3 / DTMF系 2
- ICE系 3 / トランスポート系 3 / アカウント系 3
- ライフサイクル系 2 / エラー系 1
- #[non_exhaustive] + #[derive(Debug, Clone)]

### Info 構造体 (20 スケルトン)
- 全フィールド空 — M6-2 以降で追加
- ClientCapabilities / ReferRequest も空構造体として仮定義

### Boy Scout: SipError に Clone 追加
- SipEventPayload の Error(SipError) バリアントで Clone が必要だったため

## テスト結果
- 209 tests PASS（既存 203 + 新規 6）
- 0 warnings
- Quality checks: 0 issues（commented-out コメント 1 件修正済み）
