# 実装サマリ: ProviderClient 導入 + ConcurrencyLimiter 接続

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `provider/mod.rs` | 追加 | `ProviderClient` 構造体（config/http_client/scheduler/limiter 統合） |
| `provider/limiter.rs` | 追加 | `From<LimiterError> for ProxyError` |
| `app_state.rs` | 改修 | 3 HashMap → `providers: HashMap<String, ProviderClient>` + `resolve_provider()` |
| `lifecycle.rs` | 改修 | 3 builder → `build_provider_clients()` 統合 |
| `provider/transparent.rs` | 改修 | `resolve_provider()` + `limiter.acquire()` |
| `provider/translate.rs` | 改修 | `resolve_provider()` + `limiter.acquire()`、inner 関数の引数簡略化（9→7 params） |
| `http/routes.rs` | 修正 | テスト fixtures 更新（`AppState::new()` 2-arg） |
| `http/router.rs` | 修正 | テスト fixtures 更新 + `build_provider_clients()` 使用 |
| `http/auth.rs` | 修正 | テスト fixtures 更新 |
| `tests/mock_server.rs` | 修正 | テスト fixtures 更新 |
| `tests/real_provider.rs` | 修正 | `build_provider_clients()` 使用 |

## アーキテクチャ変更

### Before
```
AppState {
    config: AppConfig,
    http_clients: HashMap<String, Client>,    // ← 個別 lookup
    schedulers: HashMap<String, KeyScheduler>,// ← 個別 lookup
    limiters: HashMap<String, Limiter>,       // ← 接続されていない
}
```

### After
```
AppState {
    config: AppConfig,
    providers: HashMap<String, ProviderClient>, // ← 1回の lookup
}

ProviderClient {
    config: ProviderConfig,
    http_client: Client,
    scheduler: KeyScheduler,
    limiter: ConcurrencyLimiter,  // ← acquire() 各 handler 先頭で呼び出し
}
```

### ConcurrencyLimiter 接続
- `handle_transparent()`: `let _permit = provider.limiter.acquire().await?;`
- `handle_translate()`: 同上

## テスト結果
- 152 lib tests: all passed（3旧builder tests → 2新tests に統合）
- 0 warnings on compile
- 0 unwrap/expect in production code
