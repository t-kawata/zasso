# Spike report — one vertical slice through R0.5, R3.5 and R7

This is the measurement R-7 asked for. The design declined to estimate card volume on
paper and named this run as the instrument that would measure it instead, so the numbers
below are observations of one slice rather than a projection of the whole project.

## What was run

The slice is named `dtmf`. It was resolved to 4 seed file(s) and crosses
3 director(ies): `src/api`, `src/config`, `src/model`.

## What the run measured

| Measurement | Value |
|---|---|
| claims in the slice | 63 |
| — observed | 4 |
| — inferred | 3 |
| — normative | 0 |
| — unresolved | 56 |
| decision cards | 7 |
| cards withheld by layering | 48 |
| unresolved rate | 0.8888888888888888 |
| decision time (minutes) | not recorded |
| decision time per card (minutes) | not recorded |
| human interventions | 0 |

Decision time and human interventions are recorded by hand as the run proceeds and passed
in, because the implementation loop runs one ticket per session and neither is observable
to the harness. The aggregation from the recorded samples to the values above is the part a
test can hold; the recording is the human's.

No decision sample was recorded for this run, so the decision-time rows above say so rather than showing a zero. A zero would read as "instant" when it means "unobserved".

Every `unresolved` claim is handed to the human grill, so their number is what decides whether
the cards are decisions or questions. Read the unresolved rate beside the card count: a slice
whose claims are mostly unresolved produces cards that are mostly requests for a judgement the
analysis could not make, and that is a different result from a slice that recovered contracts.

## Extrapolation to the whole project

Rule: cards per seed file multiplied by the project source file count.

The slice covers 4 of the project's 126 source file(s),
so the same rate projects to about **221 decision card(s)** and
**1985 claim(s)** for the whole project.

This is a rate, not a promise. A vertical slice meets boundaries a horizontal sweep does
not, and the rate will move once Pass 2 begins.

## What this does not measure

The analysis mode is `source_static`: claims were read from the source text
and its syntax alone, with no execution, build or trace evidence. Which parser the later
stages adopt is **P22-4's decision and is not taken here** — this run must not be read as
having chosen one.

The target tree was digested before and after the run. Both digests are `f29f7a8dfb168f175e15c1cb72a0a37500dafc2aa0ed4047cfde607e44551b84`: the
measurement left every byte of what it measured as it found it.

## Disagreements

## Reconciliation

Stage: `r1`
Candidate: `tests/workspacify-reverse/spike/candidates/r1.candidate.json`

### Disagreements (11)

**missing_from_analysis** — the answer key has it and the analysis did not produce it (11)

- `src` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `src/architecture` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `src/audio` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `src/build` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `src/concurrency_contexts` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `src/error` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `src/ffi` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `src/runtime` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `src/security` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `src/state` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `src/tests` — present in the answer key and not produced by the analysis (analysis mode: source_static)

### Unobserved (1)

These regions were never looked at. They are not agreement and not disagreement, and summing them into either would hide the only signal that matters.

- `the partition members outside this vertical slice` — stopped at R0.5: 7.7.1 Pass 1 fixes boundaries along one execution path; the packages it does not cross are Pass 2 work and were never looked at by this run

### Expected differences (97)

Known and intentional differences between the two trees, recorded so they are not classified as findings.

- `src/api/asyncaudiosrc_adapter.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/audio_subscribe_bp.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/call_api_expansion.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/call_api_semantics.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/dtmf_spec_received.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/dtmf_unification.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/event_bus_guarantees.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/event_bus_unify.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/event_model_payload_bus.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/eventbus_receiver.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/http_ws_crate_split.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/http_ws_protocol.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/incoming_call_events.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/incoming_call_refer.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/m20_dtmfsent_twophase.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/public_api_design.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/api/standalone_server_config.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/architecture/crate_scope.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/architecture/examples_e1e5.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/architecture/impl_integration_design.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/architecture/io_boundary_round2.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/architecture/io_boundary_round3.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/architecture/io_boundary_round4.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/architecture/policy_reference.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/architecture/round2_scope_rootcause.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/architecture/round3_scope_rootcause.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/architecture/round4_scope_rootcause.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/architecture/round4_tickets.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/audio/audiomixer_rt_boundary.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/audio/media_path_arch.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/audio/media_path_wiring.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/build/bindgen_enum_generation.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/build/build_rs_resolution.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/build/build_strategy_os_deps.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/build/cicd_docker_prebuilt.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/build/prebuilt_ci_commit.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/build/prebuilt_producer.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/build/static_link_strategy.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/build/vendored_pjsip_strategy.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/concurrency_contexts/command_serialization.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/config/account_config_spec.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/config/client_config_spec.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/config/client_config_unify.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/config/codec_policy_fallback.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/config/m20_codec_auto_mode.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/config/observability_metrics.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/config/semver_sip_networking.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/config/srtp_transport_reconnect.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/config/stun_turn_ice_wiring.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/config/transport_ice_spec.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/config/versioning_policy.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/error/challenges_panic_policy.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/error/error_design_siperror.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/error/error_native_status.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/error/m20_runtime_command_error.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/error/m20_shutdown_routing.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/ffi/callback.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/ffi/ice_transport_error.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/ffi/m20_dual_client_routing.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/ffi/pjsip_ffi_layer.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/ffi/raw_sip_module.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/ffi/transport_wiring.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/model/audio_aligner.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/model/audio_format_chunkpair.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/model/audio_resampler.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/model/dtmf_spec.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/model/id_design_newtype.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/model/media_bridge.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/model/memory_ownership_defaults.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/model/raw_sip_message_spec.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/model/sqlite_schema.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/runtime/add_audio_source.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/runtime/audio_worker.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/runtime/audioworker_lifecycle.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/runtime/backend.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/runtime/backend_selection.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/runtime/event_path_wiring.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/runtime/mod.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/runtime/push_media_frame.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/runtime/runtime_state_lock_rules.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/security/auth_jwt_middleware.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/security/security_platform_diffs.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/state/call_state_model.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/state/m20_callstate_mapping.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/state/m20_native_event_conv.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/state/m20_registr_cmd_pat.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/state/reg_account_lifecycle.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/state/registr_state_machine.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/state/registr_wiring.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/state/shutdown_specification.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/state/shutdown_wiring.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/tests/docker_asterisk_it.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/tests/m20_test_dual_client.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/tests/raw_sip_real_test.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/tests/real_pjsip_itest.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/tests/test_apilayer5.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed
- `src/tests/test_strategy_4layer.rs` (trace-stripped) — the two files differ only in comment lines, so no production line changed

### Findings

- 1 region(s) were never observed. They are not agreement and not disagreement; only a human can decide what their absence costs this measurement.


## Reconciliation

Stage: `r3`
Candidate: `tests/workspacify-reverse/spike/candidates/r3.candidate.json`

### Disagreements (261)

**missing_from_analysis** — the answer key has it and the analysis did not produce it (198)

- `C001` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C002` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C003` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C004` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C005` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C006` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C007` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C008` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C009` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C010` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C011` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C012` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C013` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C014` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C015` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C016` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C017` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C018` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C019` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C020` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C021` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C022` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C023` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C024` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C025` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C026` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C027` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C028` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C029` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C030` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C031` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C032` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C033` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C034` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C035` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C036` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C037` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C038` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C039` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C040` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C041` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C042` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C043` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C044` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C045` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C046` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C047` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C048` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C049` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C050` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C051` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C052` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C053` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C054` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C055` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C056` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C057` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C058` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C059` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C060` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C061` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C062` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C063` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C064` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C065` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C066` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C067` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C068` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C069` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C070` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C071` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C072` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C073` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C074` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C075` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C076` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C077` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C078` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C079` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C080` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C081` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C082` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C083` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C084` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C085` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C086` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C087` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C088` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C089` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C090` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C091` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C092` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C093` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C094` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C095` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C096` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C097` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C098` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C099` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C100` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C101` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C102` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C103` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C104` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C105` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C106` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C107` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C108` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C109` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C110` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C111` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C111-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C111-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C111-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C112` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C112-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C112-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C112-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C113-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C113-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C113-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C114` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C115` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C116-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C116-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C116-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C117-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C117-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C117-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C118-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C118-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C118-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C119` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C120` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C121` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C122` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C123` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C124` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C125` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C126` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C127` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C128` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C129` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C130` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C131` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C132` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C133` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C134` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C135` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C136` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C137` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C138` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C139` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C140` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C141` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C142` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C143` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C144` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C145-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C145-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C145-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C146-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C146-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C146-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C147` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C148` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C148-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C148-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C148-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C149` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C149-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C149-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C149-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C150` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C150-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C150-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C150-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C151` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C151-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C151-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C151-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C152` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C152-inv` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C152-post` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C152-pre` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `C153` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `N0013` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `N0015` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `N0067` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `N0078` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `N0080` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `P18-1` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `Round-3` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `Round-4` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `TS-003` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `pre-PX-115` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `round-3` — present in the answer key and not produced by the analysis (analysis mode: source_static)
- `round-4` — present in the answer key and not produced by the analysis (analysis mode: source_static)

**extra_in_analysis** — the analysis produced it and the answer key does not have it (63)

- `clm-dtmf_spec-invariant-36` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec-invariant-37` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec-invariant-38` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec-invariant-47` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec-invariant-48` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec-invariant-51` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec-invariant-65` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec-invariant-68` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec-invariant-78` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-boundary_crossing-2` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-boundary_crossing-23` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-103` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-104` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-105` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-106` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-34` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-35` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-45` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-46` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-58` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-59` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-69` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-81` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_spec_received-invariant-91` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_unification-boundary_crossing-51` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_unification-boundary_crossing-8` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_unification-invariant-38` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_unification-invariant-39` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_unification-invariant-44` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-dtmf_unification-invariant-52` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-boundary_crossing-51` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-boundary_crossing-54` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-failure_contract-178` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-failure_contract-20` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-failure_contract-206` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-failure_contract-22` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-failure_contract-221` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-failure_contract-312` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-failure_contract-33` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-132` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-137` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-144` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-145` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-146` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-150` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-175` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-196` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-197` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-198` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-209` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-211` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-224` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-235` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-241` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-248` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-271` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-283` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-284` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-309` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-339` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-340` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-342` — present in the analysis output and in no answer-key member (analysis mode: source_static)
- `clm-m20_dtmfsent_twophase-invariant-343` — present in the analysis output and in no answer-key member (analysis mode: source_static)

### Unobserved (1)

These regions were never looked at. They are not agreement and not disagreement, and summing them into either would hide the only signal that matters.

- `the contract annotations under tests/` — stopped at R3.5: PX-203 removed every @verifies comment from the subject, so no claim can be anchored to an annotated contract id yet; the ledger re-derives the anchors only once R5 and R6 run

### Expected differences (0)

None.

### Findings

- 1 region(s) were never observed. They are not agreement and not disagreement; only a human can decide what their absence costs this measurement.


A disagreement list is not a score. Classifying each entry — the analysis missed something
the forward rotation had, the analysis found something the forward rotation did not have, or
the forward rotation's own artefact was a free choice rather than a necessary one — depends
on intent, which neither tree records. That work is a human's.
