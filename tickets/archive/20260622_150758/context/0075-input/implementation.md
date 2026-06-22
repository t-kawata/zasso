# M8-2: input/ モジュール実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| Cargo.toml | 変更 | arboard = "3.6.1" 追加 |
| constants.rs | 変更 | KEY_DELAY_MS_MAC/WIN, DELETION_COOLDOWN/WEIGHT 計6定数 + テスト追加 |
| input/mod.rs | 新規 | プラットフォーム分岐 + pub use keyboard_mac/win as keyboard |
| input/clipboard.rs | 新規 | arboard ラッパー、CLIPBOARD_LOCK 排他、get/set/get_selected_text/save_paste_and_restore/replace_selected_text |
| input/keyboard_mac.rs | 新規 | CGEvent キーボード注入 (type_text/input_diff/send_backspaces/send_cmd_c/v) |
| input/keyboard_win.rs | 新規 | SendInput キーボード注入、クリップボード方式優先+フォールバック |
| lib.rs | 変更 | pub mod input 宣言追加 |

## Boy Scout 改善実績
- Mutex::lock().unwrap() → .expect("...") に全置き換え ✅
- static mut ゼロ ✅
- 全 unsafe ブロックに // SAFETY: コメント付与 ✅
- Windows type_text の2段階設計に理由コメント ✅

## テスト実績
- 全 142 テスト通過 (126 unit + 14 integration + 2 doc)
- 新規 input テスト 11 件すべて通過
  - clipboard.rs (4): get/set 往復, 空取得, Mutex 排他, PASTE_DELAY 定数
  - keyboard_mac.rs (6): is_authorized, input_diff, send_backspaces(0), send_cmd_c/v, INPUT_LOCK
  - constants.rs (1): 6定数値一致
