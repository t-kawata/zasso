# #145 実装計画

## 要件
8 件の残余スタブを解決。marker 除去 + 実装補完。

## Phase 1: マーカーのみ除去（2件）
- mixer.rs:86 - MixerSourceEntry #[allow(dead_code)] + [::STUB::] 除去
- mixer.rs:116 - AudioMixer #[allow(dead_code)] + [::STUB::] 除去

## Phase 2: 挙動実装（4件）
- worker.rs:22 - AudioWorker #[allow(dead_code)] 除去 + 起動パス整備
- worker.rs:89 - Tap 配送実装（try_pair → tap_txs）
- client.rs:407 - AudioWorker に source 登録パス
- client.rs:487 - AudioWorker に tx 渡すパス

## Phase 3: PJSIP 活用（2件）
- callbacks.rs:268 - pjsip_event state 抽出
- callbacks.rs:385 - NatDetected info 展開

## 検証
- cargo test -p siprs（390）
- cargo test -p siprs --features pjsip（389）
- make check-be
- grep で 8 件のスタブが消えていること確認
