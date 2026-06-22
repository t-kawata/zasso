# M8-1: hotkey/ モジュール 実装計画

## 要件
voiput crate にホットキー監視機能 (hotkey/ モジュール) を移植する。
macOS の CGEventTap、Windows の rdev+GetAsyncKeyState ポーリング+WH_KEYBOARD_LL フック。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
| crates/voiput/Cargo.toml | 変更 | rdev + winapi features 追加 |
| crates/voiput/src/constants.rs | 変更 | HOTKEY_DOUBLE_TAP_MIN_MS / MAX_MS + テスト |
| crates/voiput/src/hotkey/mod.rs | 新規 | HotkeyAction enum + 内部型 |
| crates/voiput/src/hotkey/mac.rs | 新規 | CGEventTap macOS 実装 |
| crates/voiput/src/hotkey/win.rs | 新規 | rdev + GetAsyncKeyState Windows 実装 |
| crates/voiput/src/hotkey/win_hook.rs | 新規 | WH_KEYBOARD_LL 低レベルフック |
| crates/voiput/src/lib.rs | 変更 | mod hotkey + cfg-gated re-export |

## Boy Scout 改善
- static mut → Atomic 置き換え
- lazy_static! → once_cell 化
- 関数名の動詞始まり化 (alt_monitor_thread → run_alt_monitoring)
- 全 unsafe に SAFETY コメント

## テスト計画
21 ユニットテスト (定数、parse ロジック、ビット操作、時刻計算、状態遷移)

## 実装手順
1. 定数追加
2. Cargo.toml 更新
3. hotkey/mod.rs
4. hotkey/mac.rs
5. hotkey/win.rs
6. hotkey/win_hook.rs
7. lib.rs 更新
8. 全テスト通過確認

## 物理的レビュー方法
run-quality-checks.js + grep 翻訳可能性 + make test + validate-structure.js

## リスク
- CGEventTap 作成は Accessibility 許可依存
- winapi features 不足でコンパイルエラー
- VoiputConfig 統合は M8-3 に延期
