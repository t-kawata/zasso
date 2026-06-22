# M18-1: RustMediaPort — 実装サマリ

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/ffi/media.rs` | 新規 | MAX_FRAME_BYTES/MediaFrame/PortDirection/RustMediaPort(read_frame/write_frame/push_rx/pop_tx) + PjmediaFrame + extern "C" callbacks + 8 テスト |
| `src/ffi/mod.rs` | 変更 | pub mod media; 追加 |

## 検証結果
- ✅ `cargo check -p siprs` — 0 error, 0 warning
- ✅ `cargo test` — 384 PASS（376→384、+8 テスト）
- ✅ 品質チェック — 3 issues（全てテスト内 unwrap、許容）
- ✅ `cargo fmt` — 通過

## 主要コンポーネント
1. **MAX_FRAME_BYTES** = 3840（48kHz/stereo/20ms/16bit）
2. **MediaFrame** — 固定長 [u8; 3840] + len（RT callback 内メモリ確保ゼロ）
3. **PortDirection** — Capture（受信）/ Playback（送信）
4. **RustMediaPort** — 双方向 ArrayQueue + oldest-drop
   - `read_frame()`: tx_queue から読み出し、空ならゼロフィル
   - `write_frame()`: rx_queue に書き込み、満杯なら oldest-drop
   - `push_rx()` / `pop_tx()`: AudioWorkerTask 用 API
5. **PjmediaFrame** — #[repr(C)] 手動定義（bindgen 代替）
6. **extern "C"** — rust_media_port_get_frame / rust_media_port_put_frame
