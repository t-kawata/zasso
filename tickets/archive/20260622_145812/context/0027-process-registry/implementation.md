# 実装サマリー: process-registry ポート競合検出（チケット #27）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/src/error.rs` | 修正 | `RegistryError::PortInUse { host: IpAddr, port: u16 }` 追加 + テスト2件 |
| `crates/procreg/src/port.rs` | **新規** | `is_port_free()` 関数 + テスト5件 |
| `crates/procreg/src/spawn.rs` | 修正 | `spawn_one()` 先頭にポート競合チェック追加 |
| `crates/procreg/src/lib.rs` | 修正 | `pub mod port;` 宣言追加 |

## 仕組み

`spawn_one()` の冒頭で、`ReadyCondition::TcpPort` のプロセスのみ `is_port_free()` を呼び出す。
`is_port_free()` は `std::net::TcpListener::bind()` を使用してポート占有を確認。
OS コマンド（lsof, netstat）は一切使用しない。

```
spawn_one() {
    1. [NEW] port::is_port_free(host, port)? → 使用中なら PortInUse エラー
    2. cmd.spawn()?  ← ポートが空いている場合のみ到達
    ...
    wait_ready(TcpPort)?  ← 孤児がいてもステップ1でブロックされる
}
```

## テスト結果
- 全テスト: 83 passed（既存76 + 新規7）
- run-quality-checks: 0 issues
- 翻訳可能性チェック: 合格

## 新規テスト詳細
| テスト | 結果 |
|--------|------|
| `error::port_inuse_display` | ✅ |
| `error::port_inuse_source_is_none` | ✅ |
| `port::free_port_returns_true` | ✅ |
| `port::bound_port_returns_false` | ✅ |
| `port::release_then_free` | ✅ |
| `port::ipv4_loopback` | ✅ |
| `port::ipv6_loopback` | ✅ |
