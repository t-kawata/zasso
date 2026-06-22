# 計画: ProviderClient 導入 + ConcurrencyLimiter 接続

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| provider/mod.rs | 追加 | ProviderClient 構造体定義 |
| config/mod.rs | 追加 | From<LimiterError> for ProxyError |
| app_state.rs | 改修 | 3 HashMap → providers + resolve_provider() |
| lifecycle.rs | 改修 | 3 builder → build_provider_clients() |
| provider/transparent.rs | 改修 | resolve_provider + limiter.acquire |
| provider/translate.rs | 改修 | 同上 |
| http/routes.rs | 修正 | テスト fixtures 更新 |
| http/router.rs | 修正 | テスト fixtures 更新 |

## 実装手順

1. provider/mod.rs: ProviderClient 構造体
2. config/mod.rs: From<LimiterError> for ProxyError
3. app_state.rs: AppState 再構成
4. lifecycle.rs: build_provider_clients() 統合
5. provider/transparent.rs: resolve_provider + acquire
6. provider/translate.rs: 同上
7. 全テスト fixtures 更新
8. cargo check --all-targets, cargo test

## テスト計画

- ProviderClient 型検証 (compile-time)
- resolve_provider 正常系/異常系 (app_state.rs mod tests)
- build_provider_clients (lifecycle.rs mod tests)
- LimiterError→ProxyError マッピング (config/mod.rs mod tests)
- 既存153 tests に回帰なし

## 物理的レビュー方法

1. run-quality-checks.js
2. 翻訳可能性 grep: 関数名動詞句、unwrap/expect なし
3. cargo check / cargo test 全てパス
