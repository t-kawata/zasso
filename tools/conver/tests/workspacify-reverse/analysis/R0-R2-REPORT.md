# R0 to R5.5 — scope, structure, dependencies, the execution surface, the semantic material, history, gaps and the oracle validity

Stages run: `R0`, `R0.5`, `R1`, `R2`, `R2.5`, `R3`, `R3.5`, `R4`, `R5`, `R5.5`.


# R0 — the analysis scope

Root: `/Users/kawata/shyme/zasso/tools/conver/siprs-for-reverse`

## The commit this is fixed to

the tree sits inside the work tree at /Users/kawata/shyme/zasso and is not a repository of its own, so its commit is that repository's HEAD and tools/conver/siprs-for-reverse records where it sits beneath it

- commit: `1210dfef6e6a2d16969212b7525aa1d699f77e5d`
- work tree root: `/Users/kawata/shyme/zasso`
- path beneath it: `tools/conver/siprs-for-reverse`
- the project is its own repository: `false`

## Exclusion rules

Directories whose contents are recorded rather than measured: `target`, `.git`, `vendor`, `node_modules`.

An excluded path is still recorded, and is marked `out_of_scope`. It is never dropped from the
record, so that "outside the scope" can never be read as "not there".

## Permissions

Held over the target: `read`. The run holds no write permission over what it measures and does not need one.

## External transmission

Policy: `none`. the analysis reads the target and writes only outside it, and sends nothing anywhere. No evidence leaves this machine, so no secret-exclusion rule is needed to permit the run.

# R0.5 — the scope boundary

Every artefact beneath `/Users/kawata/shyme/zasso/tools/conver/siprs-for-reverse` is classified into exactly one of `in_scope`, `out_of_scope`, `undetermined`.

| Coverage state | Artefacts |
|---|---|
| `in_scope` | 158 |
| `out_of_scope` | 7785 |
| `undetermined` | 2 |

## Outside the scope

These paths are recorded and marked `out_of_scope`: they are inside the tree and outside the
analysis. Their contents were not measured, and that is a statement about this run and not
about them.

- `target/.rustc_info.json` (build_output)
- `target/CACHEDIR.TAG` (build_output)
- `target/debug/.cargo-artifact-lock` (build_output)
- `target/debug/.cargo-build-lock` (build_output)
- `target/debug/.cargo-lock` (build_output)
- `target/debug/.fingerprint/async-trait-20eacc9f3dd99f94/dep-lib-async_trait` (build_output)
- `target/debug/.fingerprint/async-trait-20eacc9f3dd99f94/invoked.timestamp` (build_output)
- `target/debug/.fingerprint/async-trait-20eacc9f3dd99f94/lib-async_trait` (build_output)
- `target/debug/.fingerprint/async-trait-20eacc9f3dd99f94/lib-async_trait.json` (build_output)
- `target/debug/.fingerprint/atomic-waker-9fe67092b53e30e7/dep-lib-atomic_waker` (build_output)
- `target/debug/.fingerprint/atomic-waker-9fe67092b53e30e7/invoked.timestamp` (build_output)
- `target/debug/.fingerprint/atomic-waker-9fe67092b53e30e7/lib-atomic_waker` (build_output)
- `target/debug/.fingerprint/atomic-waker-9fe67092b53e30e7/lib-atomic_waker.json` (build_output)
- `target/debug/.fingerprint/atomic-waker-ba15cf2d59c16d35/dep-lib-atomic_waker` (build_output)
- `target/debug/.fingerprint/atomic-waker-ba15cf2d59c16d35/invoked.timestamp` (build_output)
- `target/debug/.fingerprint/atomic-waker-ba15cf2d59c16d35/lib-atomic_waker` (build_output)
- `target/debug/.fingerprint/atomic-waker-ba15cf2d59c16d35/lib-atomic_waker.json` (build_output)
- `target/debug/.fingerprint/autocfg-afef1c037b7be652/dep-lib-autocfg` (build_output)
- `target/debug/.fingerprint/autocfg-afef1c037b7be652/invoked.timestamp` (build_output)
- `target/debug/.fingerprint/autocfg-afef1c037b7be652/lib-autocfg` (build_output)
- `target/debug/.fingerprint/autocfg-afef1c037b7be652/lib-autocfg.json` (build_output)
- `target/debug/.fingerprint/axum-58ce587ff0bb1867/dep-lib-axum` (build_output)
- `target/debug/.fingerprint/axum-58ce587ff0bb1867/invoked.timestamp` (build_output)
- `target/debug/.fingerprint/axum-58ce587ff0bb1867/lib-axum` (build_output)
- `target/debug/.fingerprint/axum-58ce587ff0bb1867/lib-axum.json` (build_output)
- `target/debug/.fingerprint/axum-7b9d61eafc120ee5/dep-lib-axum` (build_output)
- `target/debug/.fingerprint/axum-7b9d61eafc120ee5/invoked.timestamp` (build_output)
- `target/debug/.fingerprint/axum-7b9d61eafc120ee5/lib-axum` (build_output)
- `target/debug/.fingerprint/axum-7b9d61eafc120ee5/lib-axum.json` (build_output)
- `target/debug/.fingerprint/axum-core-1a9a1f6253816dac/dep-lib-axum_core` (build_output)
- `target/debug/.fingerprint/axum-core-1a9a1f6253816dac/invoked.timestamp` (build_output)
- `target/debug/.fingerprint/axum-core-1a9a1f6253816dac/lib-axum_core` (build_output)
- `target/debug/.fingerprint/axum-core-1a9a1f6253816dac/lib-axum_core.json` (build_output)
- `target/debug/.fingerprint/axum-core-72c9ca8b138ccad5/dep-lib-axum_core` (build_output)
- `target/debug/.fingerprint/axum-core-72c9ca8b138ccad5/invoked.timestamp` (build_output)
- `target/debug/.fingerprint/axum-core-72c9ca8b138ccad5/lib-axum_core` (build_output)
- `target/debug/.fingerprint/axum-core-72c9ca8b138ccad5/lib-axum_core.json` (build_output)
- `target/debug/.fingerprint/base64-e25592333b0594e9/dep-lib-base64` (build_output)
- `target/debug/.fingerprint/base64-e25592333b0594e9/invoked.timestamp` (build_output)
- `target/debug/.fingerprint/base64-e25592333b0594e9/lib-base64` (build_output)
- … and 7745 more

## Undetermined

These paths could not be classified, and are held apart from both other states:

- `.DS_Store` — the instrument could not classify it
- `.gitignore` — the instrument could not classify it


# R1 — the static skeleton

Analysis mode: `syntax_only`. Every fact below was read from the source text
and its syntax tree. No name was resolved and no type was checked, so an item listed here is
an item the text declares — not a claim that it survives compilation.

## What was read

| Counter | Value |
|---|---|
| files discovered | 151 |
| files parsed | 150 |
| files with error nodes | 1 |
| files semantically resolved | 0 |
| configs enumerated | 1 |

`files_semantically_resolved` is zero by construction: this layer resolves nothing.

## Packages (E1)

- `.` — 1 file(s), declares 1 module(s)
- `examples` — 5 file(s), declares 7 module(s)
- `examples/common` — 2 file(s), declares 2 module(s)
- `src` — 8 file(s), declares 37 module(s)
- `src/api` — 19 file(s), declares 34 module(s)
- `src/architecture` — 12 file(s), declares 20 module(s)
- `src/audio` — 5 file(s), declares 6 module(s)
- `src/build` — 10 file(s), declares 18 module(s)
- `src/concurrency_contexts` — 1 file(s), declares 0 module(s)
- `src/config` — 11 file(s), declares 11 module(s)
- `src/error` — 5 file(s), declares 5 module(s)
- `src/ffi` — 12 file(s), declares 24 module(s)
- `src/model` — 10 file(s), declares 18 module(s)
- `src/runtime` — 13 file(s), declares 20 module(s)
- `src/security` — 3 file(s), declares 4 module(s)
- `src/state` — 10 file(s), declares 18 module(s)
- `src/tests` — 7 file(s), declares 12 module(s)
- `tests` — 16 file(s), declares 2 module(s)

## Public surface (E2)

- `USAGE_TEMPLATE` (constant, `pub`) — examples/common/cli.rs:14
- `DEFAULT_SIP_PORT` (constant, `pub`) — examples/common/cli.rs:19
- `MIN_SIP_PORT` (constant, `pub`) — examples/common/cli.rs:22
- `MAX_SIP_PORT` (constant, `pub`) — examples/common/cli.rs:25
- `CliArgs` (struct, `pub`) — examples/common/cli.rs:29
- `CliError` (struct, `pub`) — examples/common/cli.rs:52
- `parse` (function, `pub`) — examples/common/cli.rs:71
- `build_client_config` (function, `pub`) — examples/common/cli.rs:109
- `require` (function, `pub`) — examples/common/client.rs:32
- `add_account_and_resolve` (function, `pub`) — examples/common/client.rs:64
- `for_sip_uri` (function, `pub`) — examples/common/client.rs:92
- `ErasedAudioSource` (trait, `pub`) — src/api/asyncaudiosrc_adapter.rs:41
- `SyncAudioSource` (trait, `pub`) — src/api/asyncaudiosrc_adapter.rs:77
- `SyncSourceAdapter` (struct, `pub`) — src/api/asyncaudiosrc_adapter.rs:98
- `new` (function, `pub`) — src/api/asyncaudiosrc_adapter.rs:104
- `into_inner` (function, `pub`) — src/api/asyncaudiosrc_adapter.rs:109
- `open_default_microphone_source` (function, `pub`) — src/api/asyncaudiosrc_adapter.rs:154
- `CpalMicrophoneSource` (struct, `pub`) — src/api/asyncaudiosrc_adapter.rs:280
- `new` (function, `pub`) — src/api/asyncaudiosrc_adapter.rs:289
- `MIN_TAP_CAPACITY` (constant, `pub`) — src/api/audio_subscribe_bp.rs:11
- `AudioTapMode` (enum, `pub`) — src/api/audio_subscribe_bp.rs:19
- `AudioTapHandle` (struct, `pub`) — src/api/audio_subscribe_bp.rs:64
- `recv` (function, `pub`) — src/api/audio_subscribe_bp.rs:88
- `AudioTapSender` (struct, `pub`) — src/api/audio_subscribe_bp.rs:123
- `push` (function, `pub`) — src/api/audio_subscribe_bp.rs:153
- `try_push` (function, `pub`) — src/api/audio_subscribe_bp.rs:195
- `tap_channel` (function, `pub`) — src/api/audio_subscribe_bp.rs:212
- `validate_tap_capacity` (function, `pub`) — src/api/audio_subscribe_bp.rs:226
- `CALL_API_METHODS` (constant, `pub`) — src/api/call_api_expansion.rs:8
- `answer_call_state` (function, `pub(crate)`) — src/api/call_api_expansion.rs:27
- `validate_answer_code` (function, `pub`) — src/api/call_api_semantics.rs:31
- `CallApiSemantics` (trait, `pub`) — src/api/call_api_semantics.rs:47
- `validate_dtmf_digits` (function, `pub`) — src/api/call_api_semantics.rs:75
- `validate_dtmf_send_method` (function, `pub`) — src/api/call_api_semantics.rs:94
- `Codec` (enum, `pub`) — src/api/call_types.rs:9
- `CallMediaPreferences` (struct, `pub`) — src/api/call_types.rs:16
- `AuthOverride` (enum, `pub`) — src/api/call_types.rs:37
- `OutgoingCallRequest` (struct, `pub`) — src/api/call_types.rs:46
- `CallMediaConstraints` (struct, `pub`) — src/api/call_types.rs:62
- `validate_strict` (function, `pub`) — src/api/call_types.rs:67
- … and 1010 more

## Types (E3)

- `RegistrationOutcome` (enum) — examples/account_register.rs:69
- `CliArgs` (struct) — examples/common/cli.rs:29
- `CliError` (struct) — examples/common/cli.rs:52
- `CallOutcome` (enum) — examples/make_call.rs:87
- `TtsStreamSource` (struct) — examples/tts_source.rs:31
- `ErasedAudioSource` (trait) — src/api/asyncaudiosrc_adapter.rs:41
- `SyncAudioSource` (trait) — src/api/asyncaudiosrc_adapter.rs:77
- `SyncSourceAdapter` (struct) — src/api/asyncaudiosrc_adapter.rs:98
- `SampleQueue` (struct) — src/api/asyncaudiosrc_adapter.rs:172
- `CpalMicrophoneSource` (struct) — src/api/asyncaudiosrc_adapter.rs:280
- `SampleFormatHandler` (enum) — src/api/asyncaudiosrc_adapter.rs:393
- `TestSource` (struct) — src/api/asyncaudiosrc_adapter.rs:476
- `EmptySource` (struct) — src/api/asyncaudiosrc_adapter.rs:500
- `TestData` (struct) — src/api/asyncaudiosrc_adapter.rs:517
- `FixedSource` (struct) — src/api/asyncaudiosrc_adapter.rs:535
- `Done` (struct) — src/api/asyncaudiosrc_adapter.rs:561
- `OneShot` (struct) — src/api/asyncaudiosrc_adapter.rs:596
- `TestSource` (struct) — src/api/asyncaudiosrc_adapter.rs:655
- `BigSource` (struct) — src/api/asyncaudiosrc_adapter.rs:694
- `AudioTapMode` (enum) — src/api/audio_subscribe_bp.rs:19
- `TapQueue` (struct) — src/api/audio_subscribe_bp.rs:34
- `AudioTapHandle` (struct) — src/api/audio_subscribe_bp.rs:64
- `AudioTapSender` (struct) — src/api/audio_subscribe_bp.rs:123
- `CallApiSemantics` (trait) — src/api/call_api_semantics.rs:47
- `Codec` (enum) — src/api/call_types.rs:9
- `CallMediaPreferences` (struct) — src/api/call_types.rs:16
- `AuthOverride` (enum) — src/api/call_types.rs:37
- `OutgoingCallRequest` (struct) — src/api/call_types.rs:46
- `CallMediaConstraints` (struct) — src/api/call_types.rs:62
- `DtmfSendApi` (enum) — src/api/dtmf_unification.rs:12
- `UnifiedEventBusTopology` (enum) — src/api/event_bus_unify.rs:12
- `EventTimestamp` (struct) — src/api/event_model_payload_bus.rs:23
- `EventDirection` (enum) — src/api/event_model_payload_bus.rs:36
- `EventMeta` (struct) — src/api/event_model_payload_bus.rs:49
- `RegistrationInfo` (struct) — src/api/event_model_payload_bus.rs:91
- `RegistrationFailure` (struct) — src/api/event_model_payload_bus.rs:98
- `ConnectedCallInfo` (struct) — src/api/event_model_payload_bus.rs:106
- `DtmfReceivedInfo` (struct) — src/api/event_model_payload_bus.rs:124
- `MediaActiveInfo` (struct) — src/api/event_model_payload_bus.rs:137
- `CallResumedInfo` (struct) — src/api/event_model_payload_bus.rs:143
- `MediaErrorInfo` (struct) — src/api/event_model_payload_bus.rs:149
- `MediaStoppedInfo` (struct) — src/api/event_model_payload_bus.rs:156
- `EarlyMediaInfo` (struct) — src/api/event_model_payload_bus.rs:162
- `IncomingCallInfo` (struct) — src/api/event_model_payload_bus.rs:169
- `CancelInfo` (struct) — src/api/event_model_payload_bus.rs:178
- `ReferRequest` (struct) — src/api/event_model_payload_bus.rs:189
- `TransferInfo` (struct) — src/api/event_model_payload_bus.rs:199
- `IceSuccessInfo` (struct) — src/api/event_model_payload_bus.rs:207
- `IceFailureInfo` (struct) — src/api/event_model_payload_bus.rs:214
- `TransportConnectedInfo` (struct) — src/api/event_model_payload_bus.rs:221
- `TransportDisconnectedInfo` (struct) — src/api/event_model_payload_bus.rs:229
- `TransportErrorInfo` (struct) — src/api/event_model_payload_bus.rs:236
- `AccountSnapshot` (struct) — src/api/event_model_payload_bus.rs:244
- `SipEventPayload` (enum) — src/api/event_model_payload_bus.rs:267
- `SipEvent` (struct) — src/api/event_model_payload_bus.rs:382
- `EventBus` (struct) — src/api/eventbus_receiver.rs:21
- `AccountEventReceiver` (struct) — src/api/eventbus_receiver.rs:97
- `Subscription` (struct) — src/api/eventbus_receiver.rs:152
- `SubscriptionSource` (trait) — src/api/eventbus_receiver.rs:214
- `AudioFrameHeader` (struct) — src/api/http_ws_protocol.rs:48
- `WsTextFrame` (struct) — src/api/http_ws_protocol.rs:120
- `WsBinaryFrame` (struct) — src/api/http_ws_protocol.rs:138
- `SequenceGenerator` (struct) — src/api/http_ws_protocol.rs:181
- `IncomingCall` (struct) — src/api/incoming_call_refer.rs:29
- `IncomingCallConfig` (struct) — src/api/incoming_call_refer.rs:57
- `DtmfSentInfo` (struct) — src/api/m20_dtmfsent_twophase.rs:25
- `SentDtmfError` (enum) — src/api/m20_dtmfsent_twophase.rs:42
- `DtmfSentTimeoutRequest` (struct) — src/api/m20_dtmfsent_twophase.rs:63
- `SipAccountHandle` (struct) — src/api/public_api_design.rs:15
- `ConfigError` (enum) — src/api/standalone_server_config.rs:30
- `AuthMode` (enum) — src/api/standalone_server_config.rs:39
- `AuthConfig` (struct) — src/api/standalone_server_config.rs:50
- `ServerConfig` (struct) — src/api/standalone_server_config.rs:95
- `AppState` (struct) — src/api/standalone_server_config.rs:127
- `DesignDecisionId` (enum) — src/architecture/impl_integration_design.rs:8
- `ResidueRootCause` (struct) — src/architecture/impl_integration_design.rs:65
- `IoBoundaryRow` (struct) — src/architecture/impl_integration_design.rs:105
- `DeleteTarget` (struct) — src/architecture/impl_integration_design.rs:170
- `Round2IoBoundaryRow` (struct) — src/architecture/io_boundary_round2.rs:9
- `Round2DeleteTarget` (struct) — src/architecture/io_boundary_round2.rs:25
- `Round3IoBoundaryRow` (struct) — src/architecture/io_boundary_round3.rs:10
- `Round3DeleteTarget` (struct) — src/architecture/io_boundary_round3.rs:26
- `Round4Section` (enum) — src/architecture/io_boundary_round4.rs:11
- `Round4IoBoundaryRow` (struct) — src/architecture/io_boundary_round4.rs:101
- `Round4DeleteTarget` (struct) — src/architecture/io_boundary_round4.rs:117
- `Round2Section` (enum) — src/architecture/round2_scope_rootcause.rs:5
- `Round2RootCause` (struct) — src/architecture/round2_scope_rootcause.rs:80
- `Round2Policy` (struct) — src/architecture/round2_scope_rootcause.rs:150
- `BreakingChange` (enum) — src/architecture/round2_scope_rootcause.rs:170
- `Round3Section` (enum) — src/architecture/round3_scope_rootcause.rs:4
- `Round3RootCause` (struct) — src/architecture/round3_scope_rootcause.rs:82
- `Round3Policy` (struct) — src/architecture/round3_scope_rootcause.rs:149
- `Round3BreakingChange` (enum) — src/architecture/round3_scope_rootcause.rs:170
- `Round4TicketSpec` (enum) — src/architecture/round4_tickets.rs:15
- `ChannelSelector` (enum) — src/audio/media_path_arch.rs:15
- `WavWriter` (struct) — src/audio/media_path_wiring.rs:115
- `WavFileSource` (struct) — src/audio/media_path_wiring.rs:203
- `ParsedWav` (struct) — src/audio/media_path_wiring.rs:244
- `AudioOrchestrationError` (enum) — src/audio/pipeline.rs:25
- `AudioFormatSpec` (struct) — src/audio/pipeline.rs:46
- `Error` (alias) — src/audio/pipeline.rs:75
- `AudioPipelineConfig` (struct) — src/audio/pipeline.rs:93
- `ProcessedFrame` (struct) — src/audio/pipeline.rs:134
- `AudioPipeline` (struct) — src/audio/pipeline.rs:166
- `ResolvedPjsip` (enum) — src/build/build_script_bindgen.rs:268
- `PjsipVersion` (struct) — src/build/build_strategy_os_deps.rs:18
- `PjsipDetection` (enum) — src/build/build_strategy_os_deps.rs:37
- `PjsipDetectionError` (enum) — src/build/build_strategy_os_deps.rs:56
- `DetectionBackend` (trait) — src/build/build_strategy_os_deps.rs:67
- `ResolvedFeatures` (struct) — src/build/build_strategy_os_deps.rs:73
- `CiJobStatus` (struct) — src/build/build_strategy_os_deps.rs:84
- `EnvDetectionBackend` (struct) — src/build/build_strategy_os_deps.rs:145
- `MockDetectionBackend` (struct) — src/build/build_strategy_os_deps.rs:217
- `CiOsTarget` (enum) — src/build/cicd_docker_prebuilt.rs:7
- `FeatureCombination` (enum) — src/build/cicd_docker_prebuilt.rs:31
- `DockerIntegrationJob` (struct) — src/build/cicd_docker_prebuilt.rs:60
- `PrebuiltRefreshPipeline` (struct) — src/build/cicd_docker_prebuilt.rs:82
- `ProducerHost` (enum) — src/build/prebuilt_producer.rs:13
- `ProducerTriple` (struct) — src/build/prebuilt_producer.rs:34
- `ProducerMachineKind` (enum) — src/build/prebuilt_producer.rs:57
- `HangupReason` (enum) — src/call.rs:20
- `SipCall` (struct) — src/call.rs:45
- `SipClient` (struct) — src/client.rs:50
- `RuntimeCommand` (enum) — src/concurrency_contexts/command_serialization.rs:8
- `AuthCredentials` (struct) — src/config.rs:34
- `DtmfConfig` (struct) — src/config.rs:63
- `AccountTransportPolicy` (enum) — src/config/account_config_spec.rs:8
- `SrtpPolicy` (enum) — src/config/account_config_spec.rs:25
- `OpusConfig` (struct) — src/config/account_config_spec.rs:34
- `AccountCodecPolicy` (struct) — src/config/account_config_spec.rs:64
- `DtmfPolicy` (struct) — src/config/account_config_spec.rs:82
- `AccountMediaConfig` (struct) — src/config/account_config_spec.rs:93
- `AccountConfig` (struct) — src/config/account_config_spec.rs:126
- `AccountConfigPatch` (struct) — src/config/account_config_spec.rs:278
- `LogLevel` (enum) — src/config/client_config_spec.rs:11
- `ClientAudioConfig` (struct) — src/config/client_config_spec.rs:22
- `RawSipEventConfig` (struct) — src/config/client_config_spec.rs:61
- `TimeoutConfig` (struct) — src/config/client_config_spec.rs:85
- `ClientConfig` (struct) — src/config/client_config_spec.rs:113
- `ConfigUnificationDecision` (struct) — src/config/client_config_unify.rs:12
- `NegotiatedCodec` (enum) — src/config/codec_policy_fallback.rs:18
- `CodecSelectionPolicy` (enum) — src/config/codec_policy_fallback.rs:34
- `CodecInfo` (struct) — src/config/m20_codec_auto_mode.rs:31
- `CodecAutoMode` (struct) — src/config/m20_codec_auto_mode.rs:62
- `TestResult` (alias) — src/config/m20_codec_auto_mode.rs:123
- `ClientCapabilities` (struct) — src/config/observability_metrics.rs:25
- `TransportKind` (enum) — src/config/observability_metrics.rs:148
- `SrtpImplementation` (enum) — src/config/observability_metrics.rs:159
- `Codec` (struct) — src/config/observability_metrics.rs:168
- `AudioDeviceCaps` (struct) — src/config/observability_metrics.rs:242
- `MetricsLookupError` (struct) — src/config/observability_metrics.rs:260
- `MetricsCounter` (struct) — src/config/observability_metrics.rs:274
- `MetricsGauge` (struct) — src/config/observability_metrics.rs:307
- `MetricsRegistry` (struct) — src/config/observability_metrics.rs:351
- `TlsCertInfo` (struct) — src/config/semver_sip_networking.rs:31
- `SrtpPolicy` (enum) — src/config/srtp_transport_reconnect.rs:17
- `TransportProtocol` (enum) — src/config/srtp_transport_reconnect.rs:63
- `ReconnectPolicy` (struct) — src/config/srtp_transport_reconnect.rs:105
- `TestResult` (alias) — src/config/srtp_transport_reconnect.rs:202
- `StunOwned` (struct) — src/config/stun_turn_ice_wiring.rs:24
- `TurnOwned` (struct) — src/config/stun_turn_ice_wiring.rs:34
- `TransportConfig` (enum) — src/config/transport_ice_spec.rs:10
- `UdpTransportConfig` (struct) — src/config/transport_ice_spec.rs:37
- `TcpTransportConfig` (struct) — src/config/transport_ice_spec.rs:43
- `TlsTransportConfig` (struct) — src/config/transport_ice_spec.rs:52
- `TlsConfig` (struct) — src/config/transport_ice_spec.rs:62
- `IceConfig` (struct) — src/config/transport_ice_spec.rs:95
- `StunServerConfig` (struct) — src/config/transport_ice_spec.rs:124
- `TurnTransport` (enum) — src/config/transport_ice_spec.rs:131
- `TurnServerConfig` (struct) — src/config/transport_ice_spec.rs:142
- `SemverPhase` (enum) — src/config/versioning_policy.rs:4
- `ChangeKind` (enum) — src/config/versioning_policy.rs:13
- `VersionBump` (enum) — src/config/versioning_policy.rs:24
- `VersionError` (enum) — src/config/versioning_policy.rs:35
- `VersionPolicy` (struct) — src/config/versioning_policy.rs:53
- `ImplementationChallenge` (enum) — src/error/challenges_panic_policy.rs:7
- `PanicPolicy` (struct) — src/error/challenges_panic_policy.rs:61
- `SipErrorKind` (enum) — src/error/error_design_siperror.rs:29
- `SipError` (struct) — src/error/error_design_siperror.rs:168
- `AccountInfo` (struct) — src/error/m20_runtime_command_error.rs:97
- `ShutdownCommandAction` (enum) — src/error/m20_shutdown_routing.rs:19
- `ShutdownCommandRouter` (struct) — src/error/m20_shutdown_routing.rs:41
- `pjsua_acc_id` (alias) — src/ffi/bindings.rs:32
- `pjsua_call_id` (alias) — src/ffi/bindings.rs:35
- `pjsua_conf_port_id` (alias) — src/ffi/bindings.rs:38
- `pjsua_transport_id` (alias) — src/ffi/bindings.rs:41
- `pj_str_t` (struct) — src/ffi/bindings.rs:205
- `pjsua_call_info` (struct) — src/ffi/bindings.rs:224
- `pjmedia_type` (enum) — src/ffi/bindings.rs:248
- `pjmedia_format_id` (enum) — src/ffi/bindings.rs:260
- `pjmedia_format_detail_type` (enum) — src/ffi/bindings.rs:269
- `pjmedia_dir` (enum) — src/ffi/bindings.rs:279
- `pj_pool_t` (alias) — src/ffi/bindings.rs:287
- `pj_size_t` (alias) — src/ffi/bindings.rs:289
- `pj_status_t` (alias) — src/ffi/bindings.rs:291
- `pjmedia_frame_type` (alias) — src/ffi/bindings.rs:293
- `pj_timestamp` (alias) — src/ffi/bindings.rs:295
- `pjmedia_audio_format_detail` (struct) — src/ffi/bindings.rs:300
- `pjmedia_format_det` (struct) — src/ffi/bindings.rs:320
- `pjmedia_format` (struct) — src/ffi/bindings.rs:329
- `pjmedia_port_info` (struct) — src/ffi/bindings.rs:344
- `pjmedia_port_data` (struct) — src/ffi/bindings.rs:358
- `pjmedia_port` (struct) — src/ffi/bindings.rs:370
- `pjmedia_frame` (struct) — src/ffi/bindings.rs:394
- `pjsua_codec_info` (struct) — src/ffi/bindings.rs:417
- `pjsua_transport_config` (struct) — src/ffi/bindings.rs:440
- `pj_bool_t` (alias) — src/ffi/bindings.rs:452
- `pjsip_rx_data_pkt_info` (struct) — src/ffi/bindings.rs:460
- `pjsip_rx_data` (struct) — src/ffi/bindings.rs:472
- `pjsip_endpoint` (struct) — src/ffi/bindings.rs:481
- `pjsip_tx_data` (struct) — src/ffi/bindings.rs:489
- `pjsip_module` (struct) — src/ffi/bindings.rs:499
- `pjsip_uri` (struct) — src/ffi/bindings.rs:533
- `pjsip_transaction` (struct) — src/ffi/bindings.rs:541
- `pjsip_transport` (struct) — src/ffi/bindings.rs:554
- `pjsip_transport_state_info` (struct) — src/ffi/bindings.rs:563
- `pj_stun_nat_detect_result` (struct) — src/ffi/bindings.rs:571
- `pjsua_reg_info` (struct) — src/ffi/bindings.rs:579
- `pjsip_event` (struct) — src/ffi/bindings.rs:589
- `pjsip_event_body` (struct) — src/ffi/bindings.rs:597
- `pjsip_event_call_state_info` (struct) — src/ffi/bindings.rs:605
- `pjsua_callback` (struct) — src/ffi/bindings.rs:680
- `pjsua_config` (struct) — src/ffi/bindings.rs:737
- `pjsua_acc_config` (struct) — src/ffi/bindings.rs:759
- `pj_turn_tp_type` (alias) — src/ffi/bindings.rs:772
- `pjsua_turn_config_use` (alias) — src/ffi/bindings.rs:782
- `pj_stun_auth_cred_type` (alias) — src/ffi/bindings.rs:790
- `pj_stun_passwd_type` (alias) — src/ffi/bindings.rs:796
- `pj_stun_auth_cred_static` (struct) — src/ffi/bindings.rs:804
- `pj_stun_auth_cred_union` (struct) — src/ffi/bindings.rs:822
- `pj_stun_auth_cred` (struct) — src/ffi/bindings.rs:830
- `pjsua_turn_config` (struct) — src/ffi/bindings.rs:842
- `pj_ice_sess_options` (struct) — src/ffi/bindings.rs:858
- `pjsua_media_config` (struct) — src/ffi/bindings.rs:867
- `TransportStateParam` (alias) — src/ffi/callback.rs:30
- `TransportStateParam` (alias) — src/ffi/callback.rs:32
- `IceStransOpParam` (alias) — src/ffi/ice_transport_error.rs:14
- `IceStransOpParam` (alias) — src/ffi/ice_transport_error.rs:16
- `MediaPortAdapter` (struct) — src/ffi/media_port_adapter.rs:60
- `PjOwnedStr` (struct) — src/ffi/pj_str.rs:23
- `TransportKind` (enum) — src/ffi/transport_wiring.rs:20
- `TimedFrame` (struct) — src/model/audio_aligner.rs:15
- `PairAligner` (struct) — src/model/audio_aligner.rs:45
- `SampleRate` (enum) — src/model/audio_format_chunkpair.rs:25
- `BitDepth` (enum) — src/model/audio_format_chunkpair.rs:55
- `ChannelLayout` (enum) — src/model/audio_format_chunkpair.rs:71
- `AudioFormat` (struct) — src/model/audio_format_chunkpair.rs:87
- `AudioFormatError` (enum) — src/model/audio_format_chunkpair.rs:134
- `AudioChunk` (enum) — src/model/audio_format_chunkpair.rs:158
- `AudioChunkPair` (struct) — src/model/audio_format_chunkpair.rs:191
- `ResamplePipeline` (struct) — src/model/audio_resampler.rs:21
- `DtmfMethod` (enum) — src/model/dtmf_spec.rs:9
- `IdError` (enum) — src/model/id_design_newtype.rs:12
- `AccountId` (struct) — src/model/id_design_newtype.rs:43
- `Error` (alias) — src/model/id_design_newtype.rs:80
- `CallId` (struct) — src/model/id_design_newtype.rs:94
- `Error` (alias) — src/model/id_design_newtype.rs:128
- `AudioSourceId` (struct) — src/model/id_design_newtype.rs:142
- `Error` (alias) — src/model/id_design_newtype.rs:176
- `BiMap` (struct) — src/model/id_design_newtype.rs:199
- `TestBiMap` (alias) — src/model/id_design_newtype.rs:462
- `PortDirection` (enum) — src/model/media_bridge.rs:13
- `MediaFrame` (struct) — src/model/media_bridge.rs:29
- `AudioBridge` (struct) — src/model/media_bridge.rs:72
- `MemoryOwnership` (enum) — src/model/memory_ownership_defaults.rs:17
- `OwnershipScope` (enum) — src/model/memory_ownership_defaults.rs:42
- `NativePtrClassification` (struct) — src/model/memory_ownership_defaults.rs:55
- `MemoryOwnershipTag` (trait) — src/model/memory_ownership_defaults.rs:96
- `TransportKind` (enum) — src/model/memory_ownership_defaults.rs:107
- `CodecKind` (enum) — src/model/memory_ownership_defaults.rs:115
- `DtmfSendMethod` (enum) — src/model/memory_ownership_defaults.rs:122
- `SrtpMode` (enum) — src/model/memory_ownership_defaults.rs:131
- `AudioDelivery` (struct) — src/model/memory_ownership_defaults.rs:142
- `DefaultPolicies` (struct) — src/model/memory_ownership_defaults.rs:161
- `SipMessageDirection` (enum) — src/model/raw_sip_message_spec.rs:14
- `RawSipMessage` (struct) — src/model/raw_sip_message_spec.rs:25
- `DatabasePool` (struct) — src/model/sqlite_schema.rs:22
- `AccountEntity` (struct) — src/model/sqlite_schema.rs:216
- `TransportConfigEntity` (struct) — src/model/sqlite_schema.rs:235
- `TransportKind` (enum) — src/model/sqlite_schema.rs:245
- `ClientSettingEntity` (struct) — src/model/sqlite_schema.rs:279
- `TlsConfigEntity` (struct) — src/model/sqlite_schema.rs:288
- `AddAudioSourceContext` (struct) — src/runtime/add_audio_source.rs:18
- `AsyncAudioSource` (trait) — src/runtime/audio_worker.rs:29
- `MockAsyncAudioSource` (struct) — src/runtime/audio_worker.rs:41
- `MixerSourceEntry` (struct) — src/runtime/audio_worker.rs:110
- `AudioMixer` (struct) — src/runtime/audio_worker.rs:147
- `RustMediaPort` (struct) — src/runtime/audio_worker.rs:362
- `AudioWorkerTask` (struct) — src/runtime/audio_worker.rs:453
- `AudioWorkerInner` (struct) — src/runtime/audio_worker.rs:550
- `EnableAllSubscriber` (struct) — src/runtime/audio_worker.rs:678
- `Capture` (struct) — src/runtime/audio_worker.rs:1195
- `CallIdVisitor` (struct) — src/runtime/audio_worker.rs:1206
- `PanickingAudioSource` (struct) — src/runtime/audio_worker.rs:1566
- `AudioTapRegistry` (alias) — src/runtime/backend.rs:43
- `SipBackend` (trait) — src/runtime/backend.rs:83
- `TestBackend` (struct) — src/runtime/backend.rs:231
- `PjsuaBackend` (struct) — src/runtime/backend.rs:657
- `AudioMixerMap` (alias) — src/runtime/backend_selection.rs:22
- `ReactorError` (enum) — src/runtime/command.rs:7
- `Reply` (struct) — src/runtime/command.rs:39
- `DebugBox` (struct) — src/runtime/command.rs:69
- `RuntimeCommand` (enum) — src/runtime/command.rs:103
- `BackendFn` (alias) — src/runtime/command.rs:268
- `DispatchCommand` (enum) — src/runtime/command.rs:279
- `RuntimeHandle` (struct) — src/runtime/handle.rs:26
- `BootConfig` (struct) — src/runtime/reactor.rs:53
- `CoreReactor` (struct) — src/runtime/reactor.rs:101
- `SpawnResult` (alias) — src/runtime/reactor.rs:105
- `CallTable` (alias) — src/runtime/reactor.rs:1003
- `AccountTable` (alias) — src/runtime/reactor.rs:1006
- `CallStateTables` (struct) — src/runtime/reactor.rs:1014
- `SendDtmfContext` (struct) — src/runtime/reactor.rs:1195
- `TransportRuntimeState` (struct) — src/runtime/state.rs:10
- `ClientCapabilities` (struct) — src/runtime/state.rs:20
- `ClientState` (struct) — src/runtime/state.rs:41
- `AccountEntry` (struct) — src/runtime/state.rs:57
- `CallEntry` (struct) — src/runtime/state.rs:73
- `ClientStateSnapshot` (struct) — src/runtime/state.rs:95
- `Claims` (struct) — src/security/auth_jwt_middleware.rs:10
- `JwtError` (enum) — src/security/auth_jwt_middleware.rs:25
- `JwtValidator` (struct) — src/security/auth_jwt_middleware.rs:42
- `SecretString` (struct) — src/security/security_platform_diffs.rs:37
- `CallTransitionError` (struct) — src/state/call_state_model.rs:6
- `CallState` (enum) — src/state/call_state_model.rs:34
- `CallMediaState` (enum) — src/state/m20_callstate_mapping.rs:15
- `CallDirection` (enum) — src/state/m20_callstate_mapping.rs:32
- `CallStateTransition` (struct) — src/state/m20_callstate_mapping.rs:51
- `NativeEvent` (enum) — src/state/m20_native_event_conv.rs:25
- `AccountInfoSnapshot` (struct) — src/state/m20_registr_cmd_pat.rs:10
- `TransitionError` (struct) — src/state/registr_state_machine.rs:6
- `RegistrationState` (enum) — src/state/registr_state_machine.rs:55
- `ShutdownPhase` (enum) — src/state/shutdown_specification.rs:17
- `ShutdownError` (enum) — src/state/shutdown_specification.rs:60
- `ShutdownSpec` (struct) — src/state/shutdown_specification.rs:116
- `ShutdownGate` (enum) — src/state/shutdown_wiring.rs:19
- `IntegrationDirection` (enum) — src/tests/docker_asterisk_it.rs:44
- `IntegrationTestEntry` (struct) — src/tests/docker_asterisk_it.rs:55
- `DockerItPolicy` (struct) — src/tests/docker_asterisk_it.rs:66
- `M20FeatureTestEntry` (struct) — src/tests/m20_test_dual_client.rs:7
- `M20TestLayer` (enum) — src/tests/m20_test_dual_client.rs:20
- `DualClientContext` (struct) — src/tests/m20_test_dual_client.rs:111
- `RawSipRealTestPolicy` (struct) — src/tests/raw_sip_real_test.rs:45
- `RealPjsipItestPolicy` (struct) — src/tests/real_pjsip_itest.rs:43
- `TestLayer` (enum) — src/tests/test_strategy_4layer.rs:8
- `Layer1Scope` (enum) — src/tests/test_strategy_4layer.rs:60
- `TtsStreamSource` (struct) — tests/verify_spec_e0606bc3.rs:25

## Error types (E4)

- `CliError` (struct) — examples/common/cli.rs:52 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type
- `AuthOverride` (enum) — src/api/call_types.rs:37 — signals: name_matches_error; 4 variant(s)
- `RegistrationFailure` (struct) — src/api/event_model_payload_bus.rs:98 — signals: name_matches_error
- `MediaErrorInfo` (struct) — src/api/event_model_payload_bus.rs:149 — signals: name_matches_error
- `ReferRequest` (struct) — src/api/event_model_payload_bus.rs:189 — signals: name_matches_error
- `IceFailureInfo` (struct) — src/api/event_model_payload_bus.rs:214 — signals: name_matches_error
- `TransportErrorInfo` (struct) — src/api/event_model_payload_bus.rs:236 — signals: name_matches_error
- `SentDtmfError` (enum) — src/api/m20_dtmfsent_twophase.rs:42 — signals: name_matches_error, appears_as_result_error_type; 2 variant(s)
- `ConfigError` (enum) — src/api/standalone_server_config.rs:30 — signals: name_matches_error, appears_as_result_error_type; 5 variant(s)
- `AudioOrchestrationError` (enum) — src/audio/pipeline.rs:25 — signals: name_matches_error, appears_as_result_error_type; 4 variant(s)
- `Error` (alias) — src/audio/pipeline.rs:75 — signals: name_matches_error
- `PjsipDetectionError` (enum) — src/build/build_strategy_os_deps.rs:56 — signals: name_matches_error, appears_as_result_error_type; 4 variant(s)
- `MetricsLookupError` (struct) — src/config/observability_metrics.rs:260 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type
- `VersionError` (enum) — src/config/versioning_policy.rs:35 — signals: name_matches_error, appears_as_result_error_type; 9 variant(s)
- `SipErrorKind` (enum) — src/error/error_design_siperror.rs:29 — signals: name_matches_error; 24 variant(s)
- `SipError` (struct) — src/error/error_design_siperror.rs:168 — signals: name_matches_error, implements_error_trait
- `AudioFormatError` (enum) — src/model/audio_format_chunkpair.rs:134 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type; 11 variant(s)
- `IdError` (enum) — src/model/id_design_newtype.rs:12 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type; 1 variant(s)
- `Error` (alias) — src/model/id_design_newtype.rs:80 — signals: name_matches_error
- `Error` (alias) — src/model/id_design_newtype.rs:128 — signals: name_matches_error
- `Error` (alias) — src/model/id_design_newtype.rs:176 — signals: name_matches_error
- `ReactorError` (enum) — src/runtime/command.rs:7 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type; 45 variant(s)
- `JwtError` (enum) — src/security/auth_jwt_middleware.rs:25 — signals: name_matches_error, appears_as_result_error_type; 3 variant(s)
- `CallTransitionError` (struct) — src/state/call_state_model.rs:6 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type
- `TransitionError` (struct) — src/state/registr_state_machine.rs:6 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type
- `ShutdownError` (enum) — src/state/shutdown_specification.rs:60 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type; 7 variant(s)

These are candidates, not verdicts. A name matching `Error` and an implementation of the
`Error` trait are evidence that a reader may weigh; neither decides what the type means.

## Limitations

- `EXTRACTOR_NOT_WRITTEN` over `**/*.c_cpp` — c_cpp is reachable by the syntax layer, which carries a grammar for it, but this instrument version has no extractor for it — so nothing was extracted from those files

# R2 — the dependency hypothesis

Analysis mode: `syntax_only`. The coupling claim is `hypothesis`,
and this graph represents runtime binding: `false`.

> An import graph is a hypothesis about coupling read from use declarations. It does not represent runtime binding: dynamic dispatch, dependency injection, plugin registration, configuration-driven selection and reflection all couple code that no import names. The execution surface measured at R2.5 lists those mechanisms separately, and a proposition touching one of them may not be classified observed on this graph alone. This run enumerated 792 dynamic mechanism(s) at R2.5; each one is a place where the graph below and the running program can disagree.

## Measured edges

| From | To | Kind | Imports | First location |
|---|---|---|---|---|
| `examples` | `src` | syntactic_import | 2 | examples/account_register.rs:20 |
| `src` | `src/api` | syntactic_import | 18 | src/account.rs:5 |
| `src` | `src/audio` | syntactic_import | 2 | src/client.rs:17 |
| `src` | `src/config` | syntactic_import | 10 | src/call.rs:9 |
| `src` | `src/error` | syntactic_import | 7 | src/call.rs:10 |
| `src` | `src/model` | syntactic_import | 2 | src/call.rs:11 |
| `src` | `src/runtime` | syntactic_import | 3 | src/client.rs:25 |
| `src` | `src/security` | syntactic_import | 1 | src/lib.rs:61 |
| `src` | `src/state` | syntactic_import | 7 | src/call.rs:12 |
| `src/api` | `src` | syntactic_import | 6 | src/api/call_api_semantics.rs:107 |
| `src/api` | `src/architecture` | syntactic_import | 1 | src/api/event_bus_unify.rs:2 |
| `src/api` | `src/config` | syntactic_import | 15 | src/api/call_api_semantics.rs:3 |
| `src/api` | `src/error` | syntactic_import | 7 | src/api/asyncaudiosrc_adapter.rs:9 |
| `src/api` | `src/model` | syntactic_import | 21 | src/api/asyncaudiosrc_adapter.rs:11 |
| `src/api` | `src/runtime` | syntactic_import | 4 | src/api/asyncaudiosrc_adapter.rs:5 |
| `src/api` | `src/security` | syntactic_import | 1 | src/api/standalone_server_config.rs:17 |
| `src/api` | `src/state` | syntactic_import | 8 | src/api/call_api_expansion.rs:2 |
| `src/audio` | `src/config` | syntactic_import | 6 | src/audio/pipeline.rs:2 |
| `src/audio` | `src/error` | syntactic_import | 2 | src/audio/media_path_wiring.rs:23 |
| `src/audio` | `src/model` | syntactic_import | 8 | src/audio/media_path_wiring.rs:24 |
| `src/audio` | `src/runtime` | syntactic_import | 2 | src/audio/media_path_wiring.rs:27 |
| `src/config` | `src/api` | syntactic_import | 1 | src/config/account_config_spec.rs:2 |
| `src/config` | `src/architecture` | syntactic_import | 2 | src/config/client_config_unify.rs:2 |
| `src/config` | `src/error` | syntactic_import | 9 | src/config/account_config_spec.rs:364 |
| `src/config` | `src/ffi` | syntactic_import | 9 | src/config/observability_metrics.rs:12 |
| `src/config` | `src/model` | syntactic_import | 3 | src/config/account_config_spec.rs:21 |
| `src/config` | `src/security` | syntactic_import | 3 | src/config/account_config_spec.rs:3 |
| `src/error` | `src/ffi` | syntactic_import | 4 | src/error/error_design_siperror.rs:11 |
| `src/error` | `src/model` | syntactic_import | 5 | src/error/error_design_siperror.rs:344 |
| `src/error` | `src/runtime` | syntactic_import | 6 | src/error/error_design_siperror.rs:6 |
| `src/error` | `src/state` | syntactic_import | 2 | src/error/m20_runtime_command_error.rs:175 |
| `src/ffi` | `src/api` | syntactic_import | 2 | src/ffi/backend_calls.rs:13 |
| `src/ffi` | `src/architecture` | syntactic_import | 1 | src/ffi/transport_wiring.rs:178 |
| `src/ffi` | `src/audio` | syntactic_import | 1 | src/ffi/media_port_adapter.rs:188 |
| `src/ffi` | `src/config` | syntactic_import | 1 | src/ffi/transport_wiring.rs:12 |
| `src/ffi` | `src/model` | syntactic_import | 3 | src/ffi/backend_calls.rs:25 |
| `src/ffi` | `src/runtime` | syntactic_import | 9 | src/ffi/backend_calls.rs:27 |
| `src/ffi` | `src/state` | syntactic_import | 3 | src/ffi/callback.rs:19 |
| `src/model` | `src/config` | syntactic_import | 2 | src/model/raw_sip_message_spec.rs:2 |
| `src/model` | `src/error` | syntactic_import | 2 | src/model/raw_sip_message_spec.rs:287 |
| `src/model` | `src/runtime` | syntactic_import | 1 | src/model/media_bridge.rs:5 |
| `src/runtime` | `src/api` | syntactic_import | 8 | src/runtime/event_path_wiring.rs:7 |
| `src/runtime` | `src/audio` | syntactic_import | 6 | src/runtime/add_audio_source.rs:6 |
| `src/runtime` | `src/config` | syntactic_import | 4 | src/runtime/backend_selection.rs:7 |
| `src/runtime` | `src/error` | syntactic_import | 2 | src/runtime/backend.rs:1273 |
| `src/runtime` | `src/ffi` | syntactic_import | 5 | src/runtime/add_audio_source.rs:71 |
| `src/runtime` | `src/model` | syntactic_import | 8 | src/runtime/audio_worker.rs:10 |
| `src/runtime` | `src/state` | syntactic_import | 19 | src/runtime/backend.rs:30 |
| `src/state` | `src/api` | syntactic_import | 11 | src/state/m20_callstate_mapping.rs:4 |
| `src/state` | `src/config` | syntactic_import | 4 | src/state/m20_native_event_conv.rs:8 |
| `src/state` | `src/ffi` | syntactic_import | 4 | src/state/m20_callstate_mapping.rs:43 |
| `src/state` | `src/runtime` | syntactic_import | 17 | src/state/reg_account_lifecycle.rs:123 |
| `src/tests` | `src/api` | syntactic_import | 2 | src/tests/test_apilayer5.rs:18 |
| `src/tests` | `src/architecture` | syntactic_import | 1 | src/tests/docker_asterisk_it.rs:173 |
| `src/tests` | `src/build` | syntactic_import | 1 | src/tests/docker_asterisk_it.rs:174 |

## Cycles

Each entry is a set of packages that can all reach one another. The order is alphabetical and is **not** a path: nothing here claims an edge runs from each package to the next.

- 9 mutually reachable: `src`, `src/api`, `src/audio`, `src/config`, `src/error`, `src/ffi`, `src/model`, `src/runtime`, `src/state`

## External dependencies

### `Cargo.toml`

- `async-trait` — "0.1"
- `axum` — { version = "0.7", optional = true }
- `axum` — "0.7"
- `bindgen` — "0.69"
- `cfg-if` — "1"
- `chrono` — { version = "0.4", optional = true }
- `clap` — { version = "4", optional = true }
- `cpal` — { version = "0.18", optional = true }
- `crossbeam-queue` — "0.3"
- `dashmap` — "6"
- `jsonwebtoken` — "9"
- `name` — "client_init"
- `name` — "account_register"
- `name` — "make_call"
- `name` — "audio_tap"
- `name` — "tts_source"
- `name` — "verify_spec_e0606bc3"
- `name` — "verify_spec_a4ecaf0f"
- `name` — "runtime_audio_lifecycle"
- `name` — "verify_spec_0963da9b"
- `name` — "verify_spec_f330ed39"
- `name` — "sip_integration"
- `required-features` — ["test-util"]
- `required-features` — ["test-util"]
- `required-features` — ["test-util"]
- `required-features` — ["test-util"]
- `required-features` — ["test-util"]
- `required-features` — ["pjsua-native"]
- `rusqlite` — { version = "0.32", features = ["bundled"], optional = true }
- `sea-orm` — { version = "1", features = ["sqlx-sqlite", "macros", "runtime-tokio-rustls"], optional = true }
- `serde` — { version = "1", optional = true, features = ["derive"] }
- `serde_json` — { version = "1", optional = true }
- `serde_json` — "1"
- `thiserror` — "2"
- `tokio` — { version = "1", features = ["sync", "rt", "rt-multi-thread", "time", "macros", "net", "process", "test-util"] }
- `tower` — { version = "0.5", features = ["util"] }
- `tower-http` — { version = "0.5", features = ["cors"], optional = true }
- `tower-http` — { version = "0.5", features = ["cors"] }
- `tracing` — "0.1"
- `zeroize` — { version = "1", optional = true }

## Limitations

- `IMPORT_NOT_RESOLVED` over `build.rs, examples/account_register.rs, examples/audio_tap.rs, examples/client_init.rs, examples/common/cli.rs, examples/common/client.rs, examples/make_call.rs, examples/tts_source.rs, src/api/asyncaudiosrc_adapter.rs, src/api/audio_subscribe_bp.rs, and 120 more file(s)` — 356 use declaration(s) name a module this walk could not resolve to a source member — in build.rs (1), examples/account_register.rs (7), examples/audio_tap.rs (4), examples/client_init.rs (4), examples/common/cli.rs (3), examples/common/client.rs (4), examples/make_call.rs (4), examples/tts_source.rs (4), src/api/asyncaudiosrc_adapter.rs (4), src/api/audio_subscribe_bp.rs (5), and more. The graph below therefore holds fewer edges than the source states, and an absent edge here is a gap in the measurement rather than an absence of coupling

# R2.5 — the execution surface

Analysis mode: `syntax_only`.

> This list is evidence of presence, not proof of absence. A mechanism not listed here is one this instrument did not find, which is not the same as one that is not there — no static analysis of an arbitrary program can be exhaustive about dynamic mechanisms.

## What was found

| Mechanism kind | Count |
|---|---|
| `code_generation` | 1 |
| `compile_time_embedding` | 5 |
| `conditional_compilation` | 391 |
| `config_driven` | 19 |
| `dynamic_dispatch` | 331 |
| `ffi` | 45 |

## Every mechanism, with its location

- `code_generation` — `build.rs:1` — `# build script`
  - a build script runs before compilation and commonly writes source that no import names
- `compile_time_embedding` — `src/api/asyncaudiosrc_adapter.rs:993` — `include_str!("asyncaudiosrc_adapter.rs")`
  - include_str! makes a build-time input a dependency of this file
- `compile_time_embedding` — `src/ffi/bindings.rs:23` — `include!(concat!(env!("OUT_DIR"), "/bindings.rs"))`
  - include! makes a build-time input a dependency of this file
- `compile_time_embedding` — `src/security/security_platform_diffs.rs:155` — `include_str!("security_platform_diffs.rs")`
  - include_str! makes a build-time input a dependency of this file
- `compile_time_embedding` — `src/security/security_platform_diffs.rs:183` — `include_str!("security_platform_diffs.rs")`
  - include_str! makes a build-time input a dependency of this file
- `compile_time_embedding` — `src/tests/test_apilayer5.rs:27` — `include_str!("../../Cargo.toml")`
  - include_str! makes a build-time input a dependency of this file
- `conditional_compilation` — `examples/common/cli.rs:181` — `#[cfg(test)]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `examples/common/client.rs:142` — `#[cfg(test)]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:10` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:12` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:14` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:153` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:16` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:170` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:176` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:209` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:213` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:217` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:224` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- `conditional_compilation` — `src/api/asyncaudiosrc_adapter.rs:235` — `#[cfg(feature = "cpal-input")]`
  - a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build
- … and 772 more, every one recorded in the JSON beside this report

Every mechanism above is a place where the import graph and the running program can disagree.
A proposition touching one of them may not be classified `observed` without dynamic evidence (R-1).

## Limitations

- `SURFACE_PARTIAL_ON_PARSE_ERROR` over `src/ffi/backend_calls.rs` — the grammar recovered near: &raw, raw,. Mechanisms inside the recovered region may not have been detected, so an absent mechanism here is a limit of the pinned grammar rather than a fact about the file
- `EXTRACTOR_NOT_WRITTEN` over `**/*.c_cpp` — c_cpp is reachable by the syntax layer but this instrument version enumerates no mechanisms for it, so an empty surface for those files means they were not examined for one

# R3 — the semantic material

33165 fact(s) enumerated, 3509 candidate(s) raised. A candidate is a proposition the source text supports and cannot settle; none of them is a contract.

## Families

| family | facts | what it holds |
|---|---|---|
| public_surface | 1172 | declarations the text marks public |
| types | 347 | structs, enums, unions, traits and aliases |
| error_types | 224 | declared types carrying an error signal |
| guards | 4299 | branches, early returns and loop conditions |
| invariants | 3609 | assertions and unwrapping calls |
| state_machines | 47 | state-like fields and the assignments to them |
| side_effects | 16110 | I/O, panics and writes beyond the local frame |
| tests | 7357 | boundary values and expected failures a test declares |

## Language coverage

- `c_cpp` — 0 fact(s)
- `rust` — 33165 fact(s)

Not exercised by this population: `typescript`, `javascript`, `go`, `python`. The vocabulary for these is declared and its correctness is unverified here — an untested table, not an absence of the material in the project.

## What this run could not look at

- `build_semantic` — layer C is not built here (docs/P22-ANALYSIS-TECH.md §7): name resolution, type checking and cfg evaluation need a semantic adapter, so a proposition resting on any of them is not observed
- `runtime_dynamic` — no execution, build or trace evidence was collected, so dynamic dispatch targets, generated code and post-preprocessing composition are not observable in this run

## Limitations of the instrument

- `language_absent_from_population` (typescript) — the typescript vocabulary was declared and not exercised by this run; its correctness is unverified here
- `language_absent_from_population` (javascript) — the javascript vocabulary was declared and not exercised by this run; its correctness is unverified here
- `language_absent_from_population` (go) — the go vocabulary was declared and not exercised by this run; its correctness is unverified here
- `language_absent_from_population` (python) — the python vocabulary was declared and not exercised by this run; its correctness is unverified here
- `state_field_by_name` (all languages) — a state field is recognised by its name, so a state carried under a name outside the vocabulary is not enumerated

## Claim ledger

Claims: 4460 · candidates: 3509

| class | count | what it means |
|---|---|---|
| observed | 337 | read from the source text or its syntax |
| inferred | 409 | an inference the source text supports but does not state |
| normative | 0 | settled only by a recorded human decision |
| unresolved | 3714 | not decidable here; handed to the human grill |

### Evidence independence

4460 evidence record(s) fold to **47 independent** component(s). 4413 record(s) share a derivation with another record and therefore count once — the difference between the number of records and the number of things they support.

Relations found: `same_commit` (medium), `same_syntax_span` (strong).
Commit channel consulted: yes.
Assessments: independent 1, folded 4459. An `unknown` assessment means no consulted channel could settle the question, which is a different statement from "these are independent" and the one the design requires.

Unresolved rate: 0.8327354260089687

### Claims

- `clm-account_register-failure_contract-53` (inferred, failure_contract) — the failure at examples/account_register.rs:53 is a contracted outcome the caller may rely on
  - evidence: `examples/account_register.rs:53` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: remove the error path at examples/account_register.rs:53 and observe whether any test fails
- `clm-account_register-failure_contract-95` (inferred, failure_contract) — the failure at examples/account_register.rs:95 is a contracted outcome the caller may rely on
  - evidence: `examples/account_register.rs:95` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: remove the error path at examples/account_register.rs:95 and observe whether any test fails
- `clm-account_register-failure_contract-96` (inferred, failure_contract) — the failure at examples/account_register.rs:96 is a contracted outcome the caller may rely on
  - evidence: `examples/account_register.rs:96` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: remove the error path at examples/account_register.rs:96 and observe whether any test fails
- `clm-audio_tap-failure_contract-48` (inferred, failure_contract) — the failure at examples/audio_tap.rs:48 is a contracted outcome the caller may rely on
  - evidence: `examples/audio_tap.rs:48` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: remove the error path at examples/audio_tap.rs:48 and observe whether any test fails
- `clm-client_init-failure_contract-43` (inferred, failure_contract) — the failure at examples/client_init.rs:43 is a contracted outcome the caller may rely on
  - evidence: `examples/client_init.rs:43` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: remove the error path at examples/client_init.rs:43 and observe whether any test fails
- `clm-client_init-failure_contract-44` (inferred, failure_contract) — the failure at examples/client_init.rs:44 is a contracted outcome the caller may rely on
  - evidence: `examples/client_init.rs:44` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: remove the error path at examples/client_init.rs:44 and observe whether any test fails
- `clm-cli-failure_contract-84` (inferred, failure_contract) — the failure at examples/common/cli.rs:84 is a contracted outcome the caller may rely on
  - evidence: `examples/common/cli.rs:84` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: remove the error path at examples/common/cli.rs:84 and observe whether any test fails
- `clm-cli-failure_contract-96` (inferred, failure_contract) — the failure at examples/common/cli.rs:96 is a contracted outcome the caller may rely on
  - evidence: `examples/common/cli.rs:96` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: remove the error path at examples/common/cli.rs:96 and observe whether any test fails
- `clm-cli-failure_contract-122` (inferred, failure_contract) — the failure at examples/common/cli.rs:122 is a contracted outcome the caller may rely on
  - evidence: `examples/common/cli.rs:122` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: remove the error path at examples/common/cli.rs:122 and observe whether any test fails
- `clm-cli-failure_contract-136` (inferred, failure_contract) — the failure at examples/common/cli.rs:136 is a contracted outcome the caller may rely on
  - evidence: `examples/common/cli.rs:136` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: remove the error path at examples/common/cli.rs:136 and observe whether any test fails
- `clm-cli-invariant-210` (unresolved, invariant) — the condition asserted at examples/common/cli.rs:210 holds
  - evidence: `examples/common/cli.rs:210` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: mutate the asserted condition at examples/common/cli.rs:210 and observe whether any test fails
  - to the grill: Which configuration does the condition at examples/common/cli.rs:210 hold in? The assertion sits behind a #[cfg] gate, so what ships cannot be read from the text alone.
- `clm-cli-invariant-211` (unresolved, invariant) — the condition asserted at examples/common/cli.rs:211 holds
  - evidence: `examples/common/cli.rs:211` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: mutate the asserted condition at examples/common/cli.rs:211 and observe whether any test fails
  - to the grill: Which configuration does the condition at examples/common/cli.rs:211 hold in? The assertion sits behind a #[cfg] gate, so what ships cannot be read from the text alone.
- `clm-cli-invariant-212` (unresolved, invariant) — the condition asserted at examples/common/cli.rs:212 holds
  - evidence: `examples/common/cli.rs:212` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: mutate the asserted condition at examples/common/cli.rs:212 and observe whether any test fails
  - to the grill: Which configuration does the condition at examples/common/cli.rs:212 hold in? The assertion sits behind a #[cfg] gate, so what ships cannot be read from the text alone.
- `clm-cli-invariant-213` (unresolved, invariant) — the condition asserted at examples/common/cli.rs:213 holds
  - evidence: `examples/common/cli.rs:213` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: mutate the asserted condition at examples/common/cli.rs:213 and observe whether any test fails
  - to the grill: Which configuration does the condition at examples/common/cli.rs:213 hold in? The assertion sits behind a #[cfg] gate, so what ships cannot be read from the text alone.
- `clm-cli-invariant-214` (unresolved, invariant) — the condition asserted at examples/common/cli.rs:214 holds
  - evidence: `examples/common/cli.rs:214` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: mutate the asserted condition at examples/common/cli.rs:214 and observe whether any test fails
  - to the grill: Which configuration does the condition at examples/common/cli.rs:214 hold in? The assertion sits behind a #[cfg] gate, so what ships cannot be read from the text alone.
- `clm-cli-invariant-215` (unresolved, invariant) — the condition asserted at examples/common/cli.rs:215 holds
  - evidence: `examples/common/cli.rs:215` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: mutate the asserted condition at examples/common/cli.rs:215 and observe whether any test fails
  - to the grill: Which configuration does the condition at examples/common/cli.rs:215 hold in? The assertion sits behind a #[cfg] gate, so what ships cannot be read from the text alone.
- `clm-cli-invariant-216` (unresolved, invariant) — the condition asserted at examples/common/cli.rs:216 holds
  - evidence: `examples/common/cli.rs:216` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: mutate the asserted condition at examples/common/cli.rs:216 and observe whether any test fails
  - to the grill: Which configuration does the condition at examples/common/cli.rs:216 hold in? The assertion sits behind a #[cfg] gate, so what ships cannot be read from the text alone.
- `clm-cli-invariant-217` (unresolved, invariant) — the condition asserted at examples/common/cli.rs:217 holds
  - evidence: `examples/common/cli.rs:217` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: mutate the asserted condition at examples/common/cli.rs:217 and observe whether any test fails
  - to the grill: Which configuration does the condition at examples/common/cli.rs:217 hold in? The assertion sits behind a #[cfg] gate, so what ships cannot be read from the text alone.
- `clm-cli-invariant-224` (unresolved, invariant) — the condition asserted at examples/common/cli.rs:224 holds
  - evidence: `examples/common/cli.rs:224` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: mutate the asserted condition at examples/common/cli.rs:224 and observe whether any test fails
  - to the grill: Which configuration does the condition at examples/common/cli.rs:224 hold in? The assertion sits behind a #[cfg] gate, so what ships cannot be read from the text alone.
- `clm-cli-invariant-225` (unresolved, invariant) — the condition asserted at examples/common/cli.rs:225 holds
  - evidence: `examples/common/cli.rs:225` (source_static)
  - independent support: 1 (records: 1)
  - falsified by: mutate the asserted condition at examples/common/cli.rs:225 and observe whether any test fails
  - to the grill: Which configuration does the condition at examples/common/cli.rs:225 hold in? The assertion sits behind a #[cfg] gate, so what ships cannot be read from the text alone.
- … and 4440 more, every one recorded in the JSON beside this report

### Candidates — observed, classification undecided

- `cand-fact-examples_account_register.rs-error_return-53-35` (error_return, observed)
  - at: `examples/account_register.rs:53`
  - undecided: whether a caller may rely on the failure or it is an internal guard
- `cand-fact-examples_account_register.rs-error_return-96-77` (error_return, observed)
  - at: `examples/account_register.rs:96`
  - undecided: whether a caller may rely on the failure or it is an internal guard
- `cand-fact-examples_client_init.rs-error_return-44-36` (error_return, observed)
  - at: `examples/client_init.rs:44`
  - undecided: whether a caller may rely on the failure or it is an internal guard
- `cand-fact-examples_common_cli.rs-error_return-84-29` (error_return, observed)
  - at: `examples/common/cli.rs:84`
  - undecided: whether a caller may rely on the failure or it is an internal guard
- `cand-fact-examples_common_cli.rs-error_return-96-61` (error_return, observed)
  - at: `examples/common/cli.rs:96`
  - undecided: whether a caller may rely on the failure or it is an internal guard
- `cand-fact-examples_common_cli.rs-error_return-122-77` (error_return, observed)
  - at: `examples/common/cli.rs:122`
  - undecided: whether a caller may rely on the failure or it is an internal guard
- `cand-fact-examples_common_cli.rs-error_return-136-84` (error_return, observed)
  - at: `examples/common/cli.rs:136`
  - undecided: whether a caller may rely on the failure or it is an internal guard
- `cand-fact-examples_common_cli.rs-assert-210-117` (assert, observed)
  - at: `examples/common/cli.rs:210`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-211-119` (assert, observed)
  - at: `examples/common/cli.rs:211`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-212-121` (assert, observed)
  - at: `examples/common/cli.rs:212`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-213-123` (assert, observed)
  - at: `examples/common/cli.rs:213`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-214-125` (assert, observed)
  - at: `examples/common/cli.rs:214`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-215-127` (assert, observed)
  - at: `examples/common/cli.rs:215`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-216-129` (assert, observed)
  - at: `examples/common/cli.rs:216`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-217-131` (assert, observed)
  - at: `examples/common/cli.rs:217`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-224-135` (assert, observed)
  - at: `examples/common/cli.rs:224`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-225-137` (assert, observed)
  - at: `examples/common/cli.rs:225`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-226-138` (assert, observed)
  - at: `examples/common/cli.rs:226`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-239-145` (assert, observed)
  - at: `examples/common/cli.rs:239`
  - undecided: whether the condition is an invariant of the type or a defensive check
- `cand-fact-examples_common_cli.rs-assert-244-148` (assert, observed)
  - at: `examples/common/cli.rs:244`
  - undecided: whether the condition is an invariant of the type or a defensive check
- … and 3489 more, every one recorded in the JSON beside this report

Independence policy: Evidence joined by a strong or medium lineage relation forms one connected component and counts as one independent piece of support; similar_wording never collapses automatically. The number of components is what a claim reports, never the number of evidence records. An item whose independence no consulted channel can settle is recorded as unknown.

### Observation channels this run did not use

- `build_semantic` — layer C is not built here (docs/P22-ANALYSIS-TECH.md §7): name resolution, type checking and cfg evaluation need a semantic adapter, so a proposition resting on any of them is not observed
- `runtime_dynamic` — no execution, build or trace evidence was collected, so dynamic dispatch targets, generated code and post-preprocessing composition are not observable in this run

## History and decision provenance

> A commit records what changed, never why. It is not proof of design intent. Co-change is evidence that two artefacts are not independent; it is never evidence that they are. Every provenance entry below is a candidate for a human to decide, and the message that carries it is evidence about the change, never about the reason for it.

| Reading | Count |
|---|---|
| commits in the repository | 934 |
| commits touching this population | 1 |
| transitions | 158 |
| co-change groups | 12403 |
| provenance candidates | 158 |
| unreadable commits | 0 |

**History quality**: `contaminated` at `low` confidence.

- **mass_reformat** (1 commit(s)) — a commit this wide is a bulk operation rather than a design step, so co-change among its files records the tool that ran, not a coupling a reader should trust
- **squash** (1 commit(s)) — intermediate commits were collapsed, so the steps between two states are not recoverable
- **vendoring** (1 commit(s)) — vendored code is copied rather than designed, so its history describes an upstream release and not a decision taken here

## Gaps and contradictions

> A gap list measures the detector and its population, not the project. A small number of gaps is never read as quality or success: gaps are the measurement itself, and a run that found none has more to explain than one that found several. Nothing below claims a region is absent — a region this instrument did not look at is unobserved, and the two are not the same word.

**9748 gap(s)** across 6 kind(s).

| Kind | Count | Meaning |
|---|---|---|
| `absent_red` | 700 | a public surface with no test that could fail for it |
| `circular_reasoning` | 10 | a test written from the design, so it agrees with the implementation by construction |
| `comment_code_drift` | 956 | a comment and the code beneath it disagree |
| `dead_code` | 2 | nothing in the analysed population references it |
| `stub` | 293 | an incomplete implementation: a stub marker, a TODO, a panic, or an empty body |
| `unobserved_surface` | 7787 | a construct, path or boundary never observed — which is not the same as absent |

| Gap | File | Line | Kind |
|---|---|---|---|
| `gap-**/*.c_cpp-unobserved_surface-1` | `**/*.c_cpp` | 1 | `unobserved_surface` |
| `gap-build.rs-stub-28` | `build.rs` | 28 | `stub` |
| `gap-build.rs-stub-50` | `build.rs` | 50 | `stub` |
| `gap-build.rs-comment_code_drift-74` | `build.rs` | 74 | `comment_code_drift` |
| `gap-build.rs-comment_code_drift-88` | `build.rs` | 88 | `comment_code_drift` |
| `gap-build.rs-stub-108` | `build.rs` | 108 | `stub` |
| `gap-build.rs-stub-115` | `build.rs` | 115 | `stub` |
| `gap-build.rs-stub-120` | `build.rs` | 120 | `stub` |
| `gap-build.rs-comment_code_drift-197` | `build.rs` | 197 | `comment_code_drift` |
| `gap-build.rs-stub-207` | `build.rs` | 207 | `stub` |
| `gap-build.rs-stub-218` | `build.rs` | 218 | `stub` |
| `gap-build.rs-stub-220` | `build.rs` | 220 | `stub` |
| `gap-build.rs-stub-229` | `build.rs` | 229 | `stub` |
| `gap-build.rs-stub-231` | `build.rs` | 231 | `stub` |
| `gap-build.rs-stub-253` | `build.rs` | 253 | `stub` |
| `gap-build.rs-stub-255` | `build.rs` | 255 | `stub` |
| `gap-build.rs-stub-267` | `build.rs` | 267 | `stub` |
| `gap-build.rs-stub-277` | `build.rs` | 277 | `stub` |
| `gap-build.rs-stub-281` | `build.rs` | 281 | `stub` |
| `gap-build.rs-comment_code_drift-330` | `build.rs` | 330 | `comment_code_drift` |

**9728 gap(s) were not printed.** The list above is capped so that it can be read; the JSON beside this report carries every entry.

## Oracle validity

> A mutation score measures how many injected changes the current tests detect. It is not a measure of contract coverage, and no score is emitted here. A survivor is a question about the oracle, not a failure of the implementation.

**Mutation results supplied**: no.

**Channels this run could not consult:**

- no mutation results were supplied to this run, so no survivor was classified and no equivalence was decided. This is a missing channel, not a suite with no gaps: mutation execution belongs to a stage that can build and run the target.

**Survivors classified**: 0. **Discarded as equivalent by the ladder**: 0.

# The analysis attempt ledger

Without this ledger `extracted_count: 0` would mean both "analysed and found nothing" and
"could not analyse", and therefore neither. The two counts are reported separately for that
reason.

| Count | Value |
|---|---|
| attempts recorded | 604 |
| analysed and extracted nothing | 122 |
| could not run | 0 |

## Attempts that could not run

None: every file the run reached was parsed.

## How to read this

The analysis mode is `syntax_only`. Every fact above was read from source text and its syntax
tree: no name was resolved, no type was checked, and no configuration was replayed. The
execution surface is evidence of presence and not proof of absence. Nothing here decides
whether the project is correct, complete or well designed — that judgement is a human's, and
this report exists to put the material for it in front of one.

