---
ticket_id: 23
title: M12-1: Tauri コマンド + RunEvent::Exit ハンドラ
slug: m12-1-tauri-runeventexit
status: wont-implement
created_at: 2026-06-10
updated_at: 2026-06-10
---
# M12-1: Tauri コマンド + RunEvent::Exit ハンドラ

## Summary

**このチケットはスコープ外として決定した。実装しない。**

Tauri 統合はアプリケーション層（zasso 本体の src-tauri/）の責務であり、
`process-registry` クレートに含めるべきではない。

## 判断理由

- `tauri` への依存を追加するとクレートの独立性が損なわれる
- `Clone + Send + Sync` は既に充足済み（`tauri::State` として利用可能）
- `ProcessState` の serde により JSON シリアライズは既に可能
- `shutdown_all()` は M9-1 で実装済み（`RunEvent::Exit` で呼ぶだけ）
- Tauri コマンドはアプリ側で 10 行程度で記述可能であり、クレートに含む価値がない

## アプリケーション側での実装例（参考）

```rust
// アプリ側 src-tauri/src/ に記述すべきコード
#[tauri::command]
async fn list_processes(state: tauri::State<'_, ProcessRegistry>) -> Result<...> {
    Ok(state.snapshot().await)
}

// setup() 内
app.on_event(|app, event| {
    if let RunEvent::Exit = event {
        let r = app.state::<ProcessRegistry>().inner().clone();
        std::thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_all().build().unwrap()
                .block_on(async move { r.shutdown_all().await });
        });
    }
});
```
