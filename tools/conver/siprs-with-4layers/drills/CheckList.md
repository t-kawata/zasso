# RFC 要件チェックリスト

> **⚠️ このファイルはスクリプトにより自動生成された雛形です。**
> AIが目視チェックし、補足事項・プロジェクト固有の制約を追記してから使用すること。

生成日時: 2026-08-28T01:45:27.483Z
DesignTree バージョン: 1

---

## 全体チェック

- [ ] RFC全体にTBD / TODO / スタブ / 委譲 が0件であること
- [ ] 全セクションにコードスニペットが含まれていること
- [ ] DesignTreeの全ノードがRFCのいずれかのセクションに対応していること

---

## §1 raw SIP 生産経路の設計（vendored PJSIP < 2.13 制約） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §1.1 raw SIP キャプチャ機構の選択（pjsip_module vs tpmgr recv_data_cb） ✅

- [ ] **raw SIP キャプチャ機構の選択（pjsip_module vs tpmgr recv_data_cb）** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §2 P1/P2 FFI コールバック登録スコープ（on_transport_state 等） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §3 TestBackend の登録イベント発火と account_register example 完走 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §4 CallEntry.state のネイティブ遷移反映（call_state 整合性） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §5 CallResumed の発火設計（resume の観測手段） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §5.1 CallResumed 実装機構（メディア状態遷移の検出） ✅

- [ ] **CallResumed 実装機構（メディア状態遷移の検出）** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §6 DtmfSent の意味論（PJSIP コールバック vs 500ms タイムアウト契約） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §7 tap 駆動の生産経路（pjsua_conf_set_callback 欠如への対応） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §8 文書化決定（マイク source 位置づけ / unsubscribe drop ベース） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §8.1 unsubscribe のユーザーフレンドリーな API 設計 ✅

- [ ] **unsubscribe のユーザーフレンドリーな API 設計** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §9 vendored PJSIP バージョン戦略（2.17.0 維持+コード適応 vs 更新） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §10 bindgen enum/const 生成戦略（PJ_SUCCESS / pjsip_inv_state） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §11 静的ライブラリのリンク対象とリンク名修正（pjproject vs 個別 lib） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

### §11.1 静的リンクの安全な方法（link-order 耐性 + ドリフト耐性） ✅

- [ ] **静的リンクの安全な方法（link-order 耐性 + ドリフト耐性）** が設計として完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと


---

## §12 build.rs vendored-source build フォールバックの実装範囲 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §13 producer ツール crates/pjsip-prebuilt の CLI 形状 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §14 producer の Linux-from-Mac Docker 連携設計 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §15 CI OS マトリクスとプレビルドコミット運用 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §16 producer DoD 検証（file/nm vs 最小 C リンクテスト） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §17 H8 raw SIP TestBackend 検証経路の設計 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §18 H8 on_ice_transport_error 登録と IceTransportError 経路 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §19 H13 push_media_frame 生産経路の配線 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §20 H14 AddAudioSource 時の RustMediaPort conf bridge 再登録 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §21 H15/EXAMPLES 実 PJSIP 統合テストのスコープ ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §22 チケット構造とフェーズ割当（A/B 最優先 + ギャップ） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## AI Supplementary Notes (drill round 4)

### Scope mapping (what must be appended to RFC-ROOT.md)

- **§1–§8 (Q1–Q8)**: belong to the **previous round (round 3)** — already implemented as P17-2..P17-9 and written into RFC **§62.22–§62.30**. These checklist items are historical (already satisfied); do NOT re-write them.
- **§9–§22 (Q9–Q22)**: the **round-4 evolution scope** of THIS drill. Must be appended to RFC-ROOT.md as **new §62.31+ sections** (implementation integration design round 4), each with:
  - **Code snippets** (every design decision must include runnable-looking code examples)
  - **I/O boundary reference info** (for graphify / boundify partitioning)
  - **No TBD / TODO / stubs / deferrals** in any form.

### Binding design policy (from docs/PJSUA-NATIVE-PREBUILT-DESIGN-BRIEF.md §5)

1. **Producer/consumer separation is MANDATORY.** Prebuilt binaries committed to git (§5.1); `build.rs` is the consumer orchestrator (§5.2); a dedicated independent tool `crates/pjsip-prebuilt` is the producer (§5.3); Docker-based real-PJSIP tests run in CI (§5.4); two-ticket structure Ticket A (consumer/bindgen alignment) + Ticket B (producer/prebuilt + CI + commit) (§5.5).
2. **Ticket A DoD**: `cargo build --features pjsua-native` passes AND `make test-integration` runs green in CI.
3. **Ticket B DoD is independent** of Ticket A's compile success — "the library alone builds and stages successfully".
4. **Ticket ordering (user directive)**: design-brief tickets (A/B) are FIRST priority; README RESIDUE gap tickets (H8/H13/H14/H15/EXAMPLES) are lined up AFTER them.
5. **No dummy implementations**: real-PJSIP behavior must be verified with the real `pjsua-native` build (Q17). Test-only hooks that substitute for real behavior are prohibited as proof.

### Concrete implementation constraints to encode

- **Q9**: keep vendored PJSIP 2.17.0 (latest is 2.17; no upgrade target exists). Adapt code: derive codec name/rate from `codec_id`; fix constant references to real PJSIP names (e.g. `PJSIP_CRED_DATA_PLAIN_PASSWD`, `PJSUA_CALL_INVALID_ID`) where the referenced symbol is absent.
- **Q10**: bindgen config — allowlist enum types (`pjsip_inv_state`, `pjsip_tsx_state`, `pj_status_t`, …) and generate as Rust enums (`default_enum_style=rust`, `prepend_enum_name(false)`); `PJ_SUCCESS` etc. emitted as enum enumerators/consts.
- **Q11/Q11a**: link set derived from the resolved `lib/` directory. Prefer `libpjproject.a`/`pjproject.lib` when present (single `static=pjproject`); else enumerate `lib*.a` stems. Wrap with `--start-group`/`--end-group` on Linux only. Per-target system deps (macOS frameworks; Linux `asound/ssl/crypto/uuid/pthread/m/dl/rt`; Windows `ws2_32/ole32/...`).
- **Q12**: build.rs 4-stage pipeline — prebuilt → system (pkg-config/env) → vendored-source CMake build inside build.rs → fail-stop (no warning-and-continue).
- **Q13**: `crates/pjsip-prebuilt` standalone crate (own Cargo.toml, no workspace creation). CLI: `build <triple>` / `stage <triple>` / `verify <triple>`; host-OS detection per §5.6.
- **Q14**: committed `Dockerfile` (ubuntu + build-essential/cmake/libasound2-dev/libssl-dev/libuuid-dev); `docker run -v $(pwd)/vendor:/work/vendor`; artifacts land on host volume.
- **Q15**: producer runs in CI on normal push; prebuilt committed directly (no PR ceremony). 3-OS matrix (macos/ubuntu/windows).
- **Q16**: DoD verification = `file` + `nm` (symbol presence) AND minimal C link test (link a C program calling `pjsua_init` against staged libs).
- **Q17**: raw SIP verification ONLY via real pjsua-native integration test (pjsip_module hook → `enqueue_raw_sip_bytes` → `subscribe_raw_sip`). No TestBackend dummy hooks.
- **Q18**: add `on_ice_transport_error` to the `pjsua_callback` mirror; register in `register_callbacks`; build `NativeEvent::IceTransportError` from `pjsip_error_info`.
- **Q19**: `RustMediaPort` port ops → `push_frame_to_tap`; verify real conf bridge drives it in integration test (P17-8 structure is complete).
- **Q20**: re-run `register_media_ports_for_calls` when `AddAudioSource` creates a mixer.
- **Q21**: `sip_integration.rs` / `docker_asterisk_it.rs` cover protocol level (REGISTER→200, INVITE→180/200, BYE, SIP INFO/RFC4733 DTMF, STUN/TURN via coturn) AND communication level (RTP media between 2 endpoints). `make test-integration` runs in CI.
- **Q22**: phase 18 = Ticket A + Ticket B (parallel); phase 19+ = H8/H13/H14/H15/EXAMPLES in sequence.

### I/O boundary hints for downstream steps

- **New artifacts**: `crates/pjsip-prebuilt` (producer, independent), `Dockerfile` (producer), regenerated `vendor/prebuilt/<target>/` (per OS), modified `build.rs` (consumer resolver), modified `src/build/build_script_bindgen.rs` (bindgen config), `src/ffi/bindings.rs` (generated stubs → bindgen output), `src/ffi/callback.rs` (on_ice_transport_error), `src/config/observability_metrics.rs` (codec_id derivation), `src/state/m20_callstate_mapping.rs` (enum), `src/runtime/backend.rs` (AccountId import, push_media_frame callers), `src/runtime/command.rs` (AddAudioSource re-registration), `tests/sip_integration.rs` / `src/tests/docker_asterisk_it.rs` (real integration).
- **Consumer (siprs) owns**: `build.rs` resolution pipeline + bindgen config + FFI alignment (Ticket A).
- **Producer owns**: PJSIP build, staging to `vendor/prebuilt/<target>/`, CI matrix, verification (Ticket B). No dependency on siprs.
- **Test boundary**: real-PJSIP tests require Docker (Asterisk/coturn) and the `pjsua-native` feature; they are gated behind `make test-integration`.