---
ticket_id: 79
title: request_permissions 権限ガイド実装 — 設定画面誘導までを crate 責務に
slug: request-permissions-crate
status: done
created_at: 2026-06-14
updated_at: 2026-06-14
plan_path: /Users/kawata/shyme/zasso/tickets/context/0079-request-permissions-crate/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0079-request-permissions-crate/implementation.md
---

# request_permissions 権限ガイド実装 — 設定画面誘導までを crate 責務に

## Summary

`Voiput::request_permissions()` が `false` を返した際に、ログによる具体的な設定手順の表示と OS 設定画面の自動起動までを行う。権限不足をユーザーが自力で解決できるようにすることを crate の責務とする。

## Background

現状の `request_permissions()` は権限状態を `bool` で返すだけであり、権限不足時にユーザーが何をすれば良いか一切案内しない。MYCUTE では Tauri フロントエンド経由でダイアログ表示していたが、voiput crate は GUI を持たないため、`log::warn!` による手順表示 + `Command::open` / `start` による設定画面起動で代替する。

## Scope

- `src/voiput.rs` — `request_permissions()` の拡張（false 時のガイド表示 + 設定画面起動）

## Non-scope

- GUI ダイアログの実装（crate の責務外）
- Windows/macOS 以外のプラットフォーム対応

## Investigation

### 現状の request_permissions() 実装

`voiput.rs:125-141`:
```rust
pub async fn request_permissions(&self) -> Result<bool, VoiputError> {
    #[cfg(target_os = "macos")]
    {
        let status =
            unsafe { crate::native::mac_ffi::speech_helper_request_authorization() };
        Ok(status == 1)  // 1 = authorized
    }
    #[cfg(target_os = "windows")]
    {
        let health = crate::native::win_ffi::health_check_result();
        Ok((health & 4) == 0)  // bit 2 (4) = マイク権限なし
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(false)
    }
}
```

`false` 時に起きること:
- `Ok(false)` が返るだけ
- 呼び出し側で何も表示しない
- ユーザーは何のエラーかわからない

### macOS の権限設定パス

- 音声認識: `システム設定 → プライバシーとセキュリティ → 音声認識`
- マイク: `システム設定 → プライバシーとセキュリティ → マイク`
- アクセシビリティ（CGEventTap 用）: `システム設定 → プライバシーとセキュリティ → アクセシビリティ`

macOS 設定画面を開く: `open "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition"`

### Windows の権限設定パス

- マイク: `設定 → プライバシーとセキュリティ → マイク`
- 音声認識: `設定 → プライバシーとセキュリティ → 音声認識`

Windows 設定画面を開く: `cmd /c start ms-settings:privacy-microphone`

## Test Plan

### ユニットテスト計画

| # | テスト | 種別 | ファイル | 内容 |
|---|--------|------|----------|------|
| 1 | `request_permissions_guide_display` | 正常系 | `voiput.rs` | 権限ガイド表示関数がパニックしないこと |
| 2 | 既存全テスト回帰 | 回帰 | — | 158テスト通過 |

### ユニットテスト不可能な項目（例外）

- 実際の OS 設定画面起動（`Command::new("open")` / `start`）：テスト環境では実行しない

## Boy Scout Rule — 翻訳可能性計画

- `request_permissions()` に「①権限確認 ②ガイド表示 ③設定画面起動」のコメントを追加
- ガイド文字列はプラットフォーム別定数として定義し、ハードコード抑止

## Acceptance Criteria

- [ ] macOS: `request_permissions()` が `Ok(false)` の場合、`log::warn!` で音声認識・マイク・アクセシビリティの設定パスが表示される
- [ ] macOS: `Ok(false)` の場合、`open` コマンドで設定アプリが起動する
- [ ] Windows: `Ok(false)` の場合、`log::warn!` で設定パスが表示される
- [ ] Windows: `ms-settings:privacy-microphone` が `start` コマンドで開く
- [ ] 権限ありの場合、従来通り `Ok(true)` を返しガイド表示は行わない
- [ ] 全既存テスト通過

## Notes

### 依存・関連チケット

| チケット | 関係 | 説明 |
|---------|------|------|
| #78 | 後続 | request_permissions の改善依頼から派生 |

### 成果物

- 計画: context/0079-request-permissions-crate/plan.md（未作成）
- 実装サマリ: context/0079-request-permissions-crate/implementation.md（未作成）
- レビュー報告書: context/0079-request-permissions-crate/review.md（未作成）
