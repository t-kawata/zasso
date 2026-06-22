# 計画: チケット #110 — M12-6 #[tracing::instrument] 計装

## 要件
RFC §34.1 準拠。SipClient 全公開 API に #[tracing::instrument] を付与。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 修正 | 全 pub fn に #[tracing::instrument] 付与、use tracing::instrument 追加 |

## 計装詳細
- new(): skip_all (cfg(test))
- subscribe(): skip(self)
- subscribe_raw_sip(): skip(self)
- subscribe_account(): skip(self), fields(account_id = %account_id)
- add_account(): skip(self, config) — config に secret 含む可能性
- remove_account(): skip(self), fields(account_id = %account_id)
- account(): skip(self), fields(account_id = %account_id)
- accounts(): skip(self)
- shutdown(): skip(self)
- is_shutdown(): skip(self)

## 実装手順
1. use tracing::instrument 追加
2. 各メソッドに #[tracing::instrument] 付与
3. cargo check --all-targets (0 warnings)
4. cargo test (全 PASS)

## レビュー方法
- run-quality-checks.js on client.rs
- 翻訳可能性 grep
- 全テスト PASS

## リスク
- なし（純粋な注釈追加、ロジック変更なし）
