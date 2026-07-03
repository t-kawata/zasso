---
tree:
  level: child
  childId: "01"
  childName: SIP Client Core (siprs)
slug: siprs-core
canonicalRfcPath: ../RFC-ROOT.md
canonicalRfcSection: "§1-51, §58-60, §61"
ioSchema: "pub struct SipClient + pub trait AsyncAudioSource + pub struct EventBus + pub enum SipEventPayload + pub struct SipError"
decouplingMethod: "Cargo.toml workspace member + pub struct/pub trait/pub enum"
dependencyOn: []
---

# RFC: SIP Client Core (siprs)

## 責務

PJSUA 2.17 を FFI 経由でラップし、tokio ネイティブな SIP クライアント API（SipClient, SipAccountHandle, EventBus）を提供する。具体的には：
1. SipClient::new() による初期化と shutdown
2. 複数 SIP アカウントの動的追加・削除・register/unregister
3. 発信（INVITE）・着信応答・切断 (BYE)・保留・転送 (REFER)
4. DTMF 3方式（Inband/SIP INFO/RFC4733）の送受信
5. 音声ミキシング（複数 AsyncAudioSource の mixing）+ IN/OUT ペア配信
6. リサンプル（rubato）・型変換・IN/OUT ペア整列（PairAligner）
7. 制御系イベント（SipEventPayload）と RawSIP メッセージの EventBus 配信
8. コーデックポリシー（PCMU + Opus のみ）の強制
9. ICE/STUN/TURN 設定、TLS トランスポート、SRTP（feature flag）
10. 観測性（tracing span + optional metrics counters）

## I/O境界

- **公開 API 境界**: SipClient（Clone + Send + Sync）の公開 async fn 群が唯一の外界接点。利用者は RuntimeCommand MPSC と oneshot reply 経由で Reactor と通信する。EventBus (tokio::sync::broadcast) は観測専用、Source of Truth ではない。
- **FFI 境界 (unsafe)**: ffi/ モジュール内の bindgen 自動生成コード + safe wrapper。callback bridge は NativeEvent enum で抽象化済み。catch_unwind 必須。
- **Async 境界**: Reactor（単一スレッド）← lock-free queue → AudioWorkerTask（個別スレッド）。lock-free queue 経由の一方向通信で RT スレッド上の非決定的遅延を排除。

## 親との関係

根拠: §1-51, §58-60, §61

正典 RFC の§1-51（目的、全体構成、並行性モデル、公開API、ID設計、Config、エラー設計、イベントモデル、SIP状態機械、DTMF、音声パイプライン、FFI層、SipBackend抽象化、ビルド戦略、codec、SRTP、shutdown、観測性、テスト戦略、CI/CD、panic policy、メモリ所有権規則、受け入れ基準）および §58-60（バージョニング、SIPネットワーキング詳細、既存RFC対応関係）、§61（I/O境界参考情報）の設計を継承する。
本子RFCは正典RFCの SIP クライアントコア部分を独立した設計文書として抽出したものであり、siprs-server（子02）から依存される側として位置づけられる。

## 依存関係

子02（siprs-server）から Cargo.toml path dependency で依存される側。本子RFCの実装に他の子RFCの完了は不要。
外部依存: PJSIP 2.17 (vendor/pjsip/ C library), bindgen (build時), tokio (async runtime + channels), dashmap, crossbeam-queue, rubato, secrecy, thiserror, serde (optional), tracing, pjemalloc (optional)
