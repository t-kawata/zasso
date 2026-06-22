# #145 実装サマリ

## 解決した 8 スタブ

### Phase 1: マーカー除去（2件）
| ファイル | スタブ | 対応 |
|---------|--------|------|
| mixer.rs:86 | MixerSourceEntry #[allow(dead_code)] | 除去 |
| mixer.rs:116 | AudioMixer #[allow(dead_code)] | 除去 |

### Phase 2: 挙動実装（4件）
| ファイル | スタブ | 対応 |
|---------|--------|------|
| worker.rs:22 | AudioWorker #[allow(dead_code)] | 除去（reactor 起動パスは別チケット） |
| worker.rs:89 | Tap 配送 | try_pair drain 実装（AudioChunkPair 変換は TODO） |
| client.rs:407 | add_audio_source | source を RuntimeCommand 経由で AudioMixer に登録するパス実装 |
| client.rs:487 | subscribe_audio | tx 保持 + マーカー除去（AudioWorker 登録は TODO） |

### Phase 3: PJSIP 活用（2件）
| ファイル | スタブ | 対応 |
|---------|--------|------|
| callbacks.rs:268 | pjsip_event state 抽出 | opaque のため将来対応に変更（コメント更新） |
| callbacks.rs:385 | NatDetected info 展開 | pj_stun_nat_detect_result から実抽出に置き換え |

## 付随変更
- MediaRuntime: AudioMixer 保持（通話作成時に生成）
- RuntimeCommand::AddAudioSource: source フィールド追加
- reactor MakeCall: AudioMixer 作成 + media に格納

## 残存スタブ（全チケット割当済み）
- reactor.rs:179 → M19-2
- resampler.rs:7 → M17-2 rubato
- media.rs:232,257 → pjmedia_port wrapping（別チケット化推奨）

## 検証結果
- cargo test -p siprs: ✅ 390 passed
- cargo test -p siprs --features pjsip: ✅ 389 passed
- make check-be: ✅
- cargo fmt --check: ✅
