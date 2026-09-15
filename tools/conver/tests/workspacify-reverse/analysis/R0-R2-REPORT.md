# R0 to R8 — scope, structure, dependencies, the execution surface, the semantic material, history, gaps, the oracle validity and the red reconstruction plan

Stages run: `R0`, `R0.5`, `R1`, `R2`, `R2.5`, `R3`, `R3.5`, `R4`, `R5`, `R5.5`, `R6`, `R6.5`, `R7`, `R8`.


# R0 — the analysis scope

Root: `/Users/kawata/shyme/zasso/tools/conver/siprs-for-reverse`

## The commit this is fixed to

the tree sits inside the work tree at /Users/kawata/shyme/zasso and is not a repository of its own, so its commit is that repository's HEAD and tools/conver/siprs-for-reverse records where it sits beneath it

- commit: `1266a9137ef7065fd5c7e2d86c8e8eb439778248`
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

## The pattern this subject is

`pattern-1` — Pattern 1. Read from the filesystem; it is not a gate, and no stage below branches on it (design 1.1 and 1.2).

What was found:

- `project-source`: `build.rs` (root)

What was searched for and not found:

- `RFC-*.md` — searched, not found
- `*-GRAPH.json` — searched, not found
- `*-Dirs-Tree.json` — searched, not found
- `Tickets.json` — searched, not found
- `DesignTree.json` — searched, not found
- `RFC-SEED.md` — searched, not found
- `WORKSPACIFY-*MANIFEST*` — searched, not found

## Eligibility — the conditions, read before anything runs

ABOUT-REVERSE 3.6 names six conditions a reverse rotation needs and six danger signals that make it unlikely to work. Both are read below from the source text of `/Users/kawata/shyme/zasso/tools/conver/siprs-for-reverse`, before any analysis stage runs, so the material is in front of a reader at the point where deciding is cheap.

**This is not a judgement about whether the rotation will succeed.** There is no score and no threshold here, because a score would look objective while encoding a threshold nobody chose (ABOUT-REVERSE 7.7.2). The decision is yours, and design 4.1 records rebuilding from zero as the choice most often taken in practice.

### Does the project build?

**not read by this channel** (`not_measurable_statically`), read by no channel in this run.

What was found, and where (1 entry):

- `Cargo.toml:1` — the manifest declares the project at this line; that it is present is a source fact, and whether it builds is not

What would settle it: A manifest is present, and whether it builds is a `build_semantic` question this read-only run does not answer — a build writes to the subject and the analysis refuses to publish when a byte moved. Running the declared build would settle it.

### Do tests exist, and can they be run?

**not read by this channel** (`not_measurable_statically`), read by no channel in this run.

What was found, and where (29 entries):

- `src/api/dtmf_spec_received.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/config/account_config_spec.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/config/client_config_spec.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/config/transport_ice_spec.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/model/dtmf_spec.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/model/raw_sip_message_spec.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/tests/docker_asterisk_it.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/tests/m20_test_dual_client.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/tests/mod.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/tests/raw_sip_real_test.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/tests/real_pjsip_itest.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/tests/test_apilayer5.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `src/tests/test_strategy_4layer.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `tests/non_exhaustive.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `tests/ownership_ffi_boundary.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `tests/runtime_audio_lifecycle.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `tests/sip_integration.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `tests/verify_feature_additive_build.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `tests/verify_spec_0963da9b.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- `tests/verify_spec_26d77120.rs` — a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads
- … and 9 more, every one recorded in the JSON beside this report

What would settle it: Whether these tests run and pass is a `runtime_dynamic` question, and this read-only run executes nothing. `cargo test` is the command the declared `Cargo.toml` implies, and running it would settle the condition.

### Does a git history exist?

**read, and present** (`established_statically`), read by the `source_static` channel.

What was found, and where (1 entry):

- `.` — the run fixed this subject at commit 1266a9137ef7, and this project sits inside the work tree at /Users/kawata/shyme/zasso and is not a repository of its own

A history exists and this run has its commit. Whether that history carries meaning — squashed, rewritten, or migrated from another VCS — is what R4 reads into `HISTORY-PROVENANCE.json`, and the danger signal below reports that half as unread rather than as clean.

### Is the main language analysable?

**read, and present** (`established_statically`), read by the `source_static` channel.

What was found, and where (151 entries):

- `build.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `examples/account_register.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `examples/audio_tap.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `examples/client_init.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `examples/common/cli.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `examples/common/client.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `examples/make_call.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `examples/tts_source.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/account.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/api/asyncaudiosrc_adapter.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/api/audio_subscribe_bp.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/api/call_api_expansion.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/api/call_api_semantics.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/api/call_types.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/api/dtmf_spec_received.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/api/dtmf_unification.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/api/event_bus_guarantees.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/api/event_bus_unify.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/api/event_model_payload_bus.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- `src/api/eventbus_receiver.rs` — rust, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read
- … and 131 more, every one recorded in the JSON beside this report

rust dominates with 150 source file(s), and `GRAMMAR_BY_LANGUAGE` carries the `tree-sitter-rust` grammar for it. A grammar being installed is not the same as an extractor being written: the capability matrix carries that second half, and this condition claims only the first.

### Does the directory structure carry meaning?

**read, and present** (`established_statically`), read by the `source_static` channel.

What was found, and where (1 entry):

- `.` — 151 source file(s) sit in 17 source-bearing directories, the largest holding 0.1258 of them

### Do documentation or comments survive somewhere?

**read, and present** (`established_statically`), read by the `source_static` channel.

What was found, and where (1 entry):

- `build.rs:1` — the first comment line in the source population, read from the text with the comment prefix its language uses

### The danger signals

Each signal is reported with what raises it and what it is evidence of. No count of them is summed: a total would be a grade in a costume.

- **Are tests missing, or present and not passing?** — not read by this channel (`not_measurable_statically`).
  - `src/api/dtmf_spec_received.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/config/account_config_spec.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/config/client_config_spec.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/config/transport_ice_spec.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/model/dtmf_spec.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/model/raw_sip_message_spec.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/tests/docker_asterisk_it.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/tests/m20_test_dual_client.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/tests/mod.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/tests/raw_sip_real_test.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/tests/real_pjsip_itest.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/tests/test_apilayer5.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `src/tests/test_strategy_4layer.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `tests/non_exhaustive.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `tests/ownership_ffi_boundary.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `tests/runtime_audio_lifecycle.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `tests/sip_integration.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `tests/verify_feature_additive_build.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `tests/verify_spec_0963da9b.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - `tests/verify_spec_26d77120.rs` — a test file that exists; whether it passes is not a fact this channel reads
  - … and 9 more, every one recorded in the JSON beside this report
  What would raise it: Running the suite is what would raise or dismiss the second half — `runtime_dynamic` evidence, which this read-only run does not take.
  This is evidence of test files being present. It is not evidence of their passing, and the two halves are reported apart so the first is never read as the second.

- **Is the history gone — squashed, or migrated from another VCS?** — not read by this channel (`not_measurable_statically`).
  - `.` — the run resolved a commit for this subject, so the "no history" half of this signal does not fire from the source text
  What would raise it: Whether that history was squashed or migrated is read by R4 into `HISTORY-PROVENANCE.json` — `source_static` evidence this run has not taken. R4 settles it.
  This is evidence of a history being reachable. It is not evidence of that history being intact; reporting it as dismissed would be reading a channel limit as an absence (F12).

- **Does material the analysis records rather than reads dominate the tree?** — read, and not there (`not_established_statically`).
  - `.` — 2 artefact(s) sit under directories the analysis records rather than measures, against 151 in the project's own source
  What would raise it: A `source_static` reading settles this and this one was taken; no further channel is needed.
  This is evidence of how much material the analysis records rather than reads as the project's own source. It is not evidence of that material having been generated, and the two are different claims.

- **Is a dynamic language with dominant metaprogramming the population?** — read, and not there (`not_established_statically`).
  - `.` — rust dominates the population, and it composes statically
  What would raise it: A `source_static` reading settles this, and the reading was taken: the signal cannot fire on a corpus with no dynamic language.
  This is evidence of the language the population is written in. It is not evidence of metaprogramming being absent — the mechanism markers are not read for any of the six languages.

- **Is the business knowledge closed to a particular person?** — not read by this channel (`not_measurable_statically`).
  - `.` — whether the business knowledge is closed to a person is not a fact any file records, and no channel here reaches it
  What would raise it: A person who knows the project would settle this — the answer is not in the tree, and no mode of reading the tree produces it.
  This is evidence of the question standing open. It is not evidence of the knowledge being closed, and it is not evidence of it being shared.

- **Is it too large for mechanical analysis to be realistic?** — read, and not there (`not_established_statically`).
  - `.` — 151 file(s) in the project's own source, against the 20000 this instrument declares impractical
  What would raise it: A `source_static` reading settles this and this one was taken; no further channel is needed.
  This is evidence of the size of the population mechanical analysis would have to read, against a marker this instrument declares rather than a threshold chosen here. It is not evidence of the project being too large to attempt.

### What this does and does not establish

Every fact above was read from the source text and the names of the files it is written in: the artefact walk, the extension each path carries, and the first comment line each language's prefix finds. Nothing was built and nothing was run, so the two conditions that need a build or an execution are reported at the strength this channel supports with the channel that would settle them named.

An entry marked `not_measurable_statically` was not read by this channel. That is a statement about this run and not about the project, and it is kept apart from `not_established_statically` — which says the tree was read and the thing is not there — so that a limit of the instrument can never be read as an absence in the project (failure F12).

These are the conditions and the signals of ABOUT-REVERSE 3.6, read from the source text and published before anything runs. This is not a judgement about whether the reverse rotation will succeed, and no field here combines them into one: the conditions and the signals are material for a human deciding whether to start, or to rebuild from zero (design 4.1), and the decision is yours.

# R0.5 — the scope boundary

Every artefact beneath `/Users/kawata/shyme/zasso/tools/conver/siprs-for-reverse` is classified into exactly one of `in_scope`, `out_of_scope`, `undetermined`.

| Coverage state | Artefacts |
|---|---|
| `in_scope` | 158 |
| `out_of_scope` | 2 |
| `undetermined` | 2 |

## Outside the scope

These paths are recorded and marked `out_of_scope`: they are inside the tree and outside the
analysis. Their contents were not measured, and that is a statement about this run and not
about them.

- `target` (build_output)
- `vendor` (dependency)


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
| files parsed | 151 |
| files with error nodes | 1 |
| files semantically resolved | 0 |
| configs enumerated | 1 |

`files_semantically_resolved` is zero by construction: this layer resolves nothing.

## Packages (E1)

- `.` — 2 file(s), declares 1 module(s)
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
- … and 1030 more, every one recorded in the JSON beside this report

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
- … and 327 more, every one recorded in the JSON beside this report

## Error types (E4)

- `CliError` (struct) — examples/common/cli.rs:52 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type
- `AuthOverride` (enum) — src/api/call_types.rs:37 — signals: name_matches_error; 2 variant(s)
- `RegistrationFailure` (struct) — src/api/event_model_payload_bus.rs:98 — signals: name_matches_error
- `MediaErrorInfo` (struct) — src/api/event_model_payload_bus.rs:149 — signals: name_matches_error
- `ReferRequest` (struct) — src/api/event_model_payload_bus.rs:189 — signals: name_matches_error
- `IceFailureInfo` (struct) — src/api/event_model_payload_bus.rs:214 — signals: name_matches_error
- `TransportErrorInfo` (struct) — src/api/event_model_payload_bus.rs:236 — signals: name_matches_error
- `SentDtmfError` (enum) — src/api/m20_dtmfsent_twophase.rs:42 — signals: name_matches_error, appears_as_result_error_type; 2 variant(s)
- `ConfigError` (enum) — src/api/standalone_server_config.rs:30 — signals: name_matches_error, appears_as_result_error_type; 2 variant(s)
- `AudioOrchestrationError` (enum) — src/audio/pipeline.rs:25 — signals: name_matches_error, appears_as_result_error_type; 4 variant(s)
- `Error` (alias) — src/audio/pipeline.rs:75 — signals: name_matches_error
- `PjsipDetectionError` (enum) — src/build/build_strategy_os_deps.rs:56 — signals: name_matches_error, appears_as_result_error_type; 2 variant(s)
- `MetricsLookupError` (struct) — src/config/observability_metrics.rs:260 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type
- `VersionError` (enum) — src/config/versioning_policy.rs:35 — signals: name_matches_error, appears_as_result_error_type; 1 variant(s)
- `SipErrorKind` (enum) — src/error/error_design_siperror.rs:29 — signals: name_matches_error; 24 variant(s)
- `SipError` (struct) — src/error/error_design_siperror.rs:168 — signals: name_matches_error, implements_error_trait
- `AudioFormatError` (enum) — src/model/audio_format_chunkpair.rs:134 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type; 1 variant(s)
- `IdError` (enum) — src/model/id_design_newtype.rs:12 — signals: name_matches_error, implements_error_trait, appears_as_result_error_type; 1 variant(s)
- `Error` (alias) — src/model/id_design_newtype.rs:80 — signals: name_matches_error
- `Error` (alias) — src/model/id_design_newtype.rs:128 — signals: name_matches_error
- … and 6 more, every one recorded in the JSON beside this report

These are candidates, not verdicts. A name matching `Error` and an implementation of the
`Error` trait are evidence that a reader may weigh; neither decides what the type means.

## Limitations

- `no_build_database` over `the C/C++ extraction` — compile_commands.json was not found, so include resolution and translation-unit composition were chosen by the analyser rather than taken from the project — an approximation the analyser chose for itself, and the E1 and E5 readings for C/C++ are conclusions of that approximation

# R2 — the dependency hypothesis

Analysis mode: `syntax_only`. The coupling claim is `hypothesis`,
and this graph represents runtime binding: `false`.

> An import graph is a hypothesis about coupling read from use declarations. It does not represent runtime binding: dynamic dispatch, dependency injection, plugin registration, configuration-driven selection and reflection all couple code that no import names. The execution surface measured at R2.5 lists those mechanisms separately, and a proposition touching one of them may not be classified observed on this graph alone. This run enumerated 795 dynamic mechanism(s) at R2.5 — by language, c_cpp: 3, rust: 792; each one is a place where the graph below and the running program can disagree.

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

## The partition material

The three quantities below are counts over a named population, not a score. There is no `eligible`
field and no verdict of any kind, for the same reason the capability profile carries none: a number
that looked objective while encoding a threshold nobody chose would decide the boundary by accident.

### Cohesion, by candidate boundary

An edge whose two ends are the same directory is internal coupling; an edge that leaves or enters
the directory is external coupling, and it is external for both of its ends.

| package | member files | internal | external | incident | external ratio |
|---|---|---|---|---|---|
| `examples` | `examples/account_register.rs`, `examples/make_call.rs` | 0 | 2 | 2 | 1.00 |
| `src` | `src/account.rs`, `src/call.rs`, `src/client.rs`, `src/config.rs`, `src/event.rs`, `src/lib.rs`, `src/transport.rs` | 5 | 58 | 63 | 0.92 |
| `src/api` | `src/api/asyncaudiosrc_adapter.rs`, `src/api/audio_subscribe_bp.rs`, `src/api/call_api_expansion.rs`, `src/api/call_api_semantics.rs`, `src/api/call_types.rs`, `src/api/dtmf_spec_received.rs`, `src/api/dtmf_unification.rs`, `src/api/event_bus_unify.rs`, `src/api/event_model_payload_bus.rs`, `src/api/eventbus_receiver.rs`, `src/api/incoming_call_events.rs`, `src/api/incoming_call_refer.rs`, `src/api/m20_dtmfsent_twophase.rs`, `src/api/public_api_design.rs`, `src/api/standalone_server_config.rs` | 12 | 105 | 117 | 0.90 |
| `src/architecture` | `src/architecture/io_boundary_round2.rs`, `src/architecture/io_boundary_round3.rs`, `src/architecture/io_boundary_round4.rs`, `src/architecture/round3_scope_rootcause.rs`, `src/architecture/round4_tickets.rs` | 8 | 5 | 13 | 0.38 |
| `src/audio` | `src/audio/media_path_wiring.rs`, `src/audio/pipeline.rs` | 0 | 27 | 27 | 1.00 |
| `src/build` | `src/build/bindgen_enum_generation.rs`, `src/build/build_rs_resolution.rs`, `src/build/build_strategy_os_deps.rs`, `src/build/static_link_strategy.rs`, `src/build/vendored_pjsip_strategy.rs` | 5 | 1 | 6 | 0.17 |
| `src/config` | `src/config/account_config_spec.rs`, `src/config/client_config_spec.rs`, `src/config/client_config_unify.rs`, `src/config/codec_policy_fallback.rs`, `src/config/m20_codec_auto_mode.rs`, `src/config/observability_metrics.rs`, `src/config/srtp_transport_reconnect.rs`, `src/config/stun_turn_ice_wiring.rs`, `src/config/transport_ice_spec.rs` | 7 | 69 | 76 | 0.91 |
| `src/error` | `src/error/error_design_siperror.rs`, `src/error/error_native_status.rs`, `src/error/m20_runtime_command_error.rs`, `src/error/m20_shutdown_routing.rs` | 4 | 46 | 50 | 0.92 |
| `src/ffi` | `src/ffi/backend_calls.rs`, `src/ffi/bindings.rs`, `src/ffi/callback.rs`, `src/ffi/ice_transport_error.rs`, `src/ffi/media_port_adapter.rs`, `src/ffi/pj_str.rs`, `src/ffi/raw_sip_module.rs`, `src/ffi/transport_wiring.rs` | 17 | 42 | 59 | 0.71 |
| `src/model` | `src/model/audio_format_chunkpair.rs`, `src/model/audio_resampler.rs`, `src/model/media_bridge.rs`, `src/model/memory_ownership_defaults.rs`, `src/model/raw_sip_message_spec.rs` | 5 | 55 | 60 | 0.92 |
| `src/runtime` | `src/runtime/add_audio_source.rs`, `src/runtime/audio_worker.rs`, `src/runtime/backend.rs`, `src/runtime/backend_selection.rs`, `src/runtime/command.rs`, `src/runtime/event_path_wiring.rs`, `src/runtime/handle.rs`, `src/runtime/mod.rs`, `src/runtime/push_media_frame.rs`, `src/runtime/reactor.rs`, `src/runtime/state.rs` | 38 | 94 | 132 | 0.71 |
| `src/security` | _none measured_ | 0 | 5 | 5 | 1.00 |
| `src/state` | `src/state/m20_callstate_mapping.rs`, `src/state/m20_native_event_conv.rs`, `src/state/m20_registr_cmd_pat.rs`, `src/state/reg_account_lifecycle.rs`, `src/state/registr_wiring.rs`, `src/state/shutdown_specification.rs`, `src/state/shutdown_wiring.rs` | 13 | 75 | 88 | 0.85 |
| `src/tests` | `src/tests/docker_asterisk_it.rs`, `src/tests/raw_sip_real_test.rs`, `src/tests/real_pjsip_itest.rs`, `src/tests/test_apilayer5.rs` | 6 | 4 | 10 | 0.40 |

The directory whose coupling leaves it most often is `examples`: 2 of its 2 incident edge(s) leave it or arrive from outside, so it reads as a boundary. The coupling was read from `examples/account_register.rs`, `examples/make_call.rs`, and the evidence is recorded at examples/account_register.rs:20.

**Why this matters.** Because the terminal state is a per-directory re-instantiation of the four
layers, a wrong boundary does not produce one wrong file — it produces a whole wrong structure, in
every directory, at every level. The counts above are what the decision has to be made from, and
they are static: a directory that looks cohesive because the syntax layer cannot see the macro
that crosses it will read as cohesive here until the execution surface is measured against it.

### Dependency density

55 measured edge(s) over 182 possible ordered pair(s) of the 14 package(s) measured — density 0.302. The population is `examples`, `src`, `src/api`, `src/architecture`, `src/audio`, `src/build`, `src/config`, `src/error`, `src/ffi`, `src/model`, `src/runtime`, `src/security`, `src/state`, `src/tests`.

A density of one means every ordered pair of packages carries at least one import; a density of zero
means none does. Neither is a verdict: a graph can be dense and correctly partitioned, or sparse and
wrongly partitioned, and this number cannot tell the two apart.

### Boundary crossings

Each row is one directed crossing. The count is the number of call sites in the source package that
name the target of that crossing. A count of zero says the syntax layer looked and saw no call; it is
not the same fact as a crossing that was not measured.

| from | to | call sites | measured |
|---|---|---|---|
| `examples` | `src` | _not measured_ | no |
| `src` | `src/api` | _not measured_ | no |
| `src` | `src/audio` | _not measured_ | no |
| `src` | `src/config` | _not measured_ | no |
| `src` | `src/error` | _not measured_ | no |
| `src` | `src/model` | _not measured_ | no |
| `src` | `src/runtime` | _not measured_ | no |
| `src` | `src/security` | _not measured_ | no |
| `src` | `src/state` | _not measured_ | no |
| `src/api` | `src` | _not measured_ | no |
| `src/api` | `src/architecture` | _not measured_ | no |
| `src/api` | `src/config` | _not measured_ | no |
| `src/api` | `src/error` | _not measured_ | no |
| `src/api` | `src/model` | _not measured_ | no |
| `src/api` | `src/runtime` | _not measured_ | no |
| `src/api` | `src/security` | _not measured_ | no |
| `src/api` | `src/state` | _not measured_ | no |
| `src/audio` | `src/config` | _not measured_ | no |
| `src/audio` | `src/error` | _not measured_ | no |
| `src/audio` | `src/model` | _not measured_ | no |
| `src/audio` | `src/runtime` | _not measured_ | no |
| `src/config` | `src/api` | _not measured_ | no |
| `src/config` | `src/architecture` | _not measured_ | no |
| `src/config` | `src/error` | _not measured_ | no |
| `src/config` | `src/ffi` | _not measured_ | no |
| `src/config` | `src/model` | _not measured_ | no |
| `src/config` | `src/security` | _not measured_ | no |
| `src/error` | `src/ffi` | _not measured_ | no |
| `src/error` | `src/model` | _not measured_ | no |
| `src/error` | `src/runtime` | _not measured_ | no |
| `src/error` | `src/state` | _not measured_ | no |
| `src/ffi` | `src/api` | _not measured_ | no |
| `src/ffi` | `src/architecture` | _not measured_ | no |
| `src/ffi` | `src/audio` | _not measured_ | no |
| `src/ffi` | `src/config` | _not measured_ | no |
| `src/ffi` | `src/model` | _not measured_ | no |
| `src/ffi` | `src/runtime` | _not measured_ | no |
| `src/ffi` | `src/state` | _not measured_ | no |
| `src/model` | `src/config` | _not measured_ | no |
| `src/model` | `src/error` | _not measured_ | no |
| `src/model` | `src/runtime` | _not measured_ | no |
| `src/runtime` | `src/api` | _not measured_ | no |
| `src/runtime` | `src/audio` | _not measured_ | no |
| `src/runtime` | `src/config` | _not measured_ | no |
| `src/runtime` | `src/error` | _not measured_ | no |
| `src/runtime` | `src/ffi` | _not measured_ | no |
| `src/runtime` | `src/model` | _not measured_ | no |
| `src/runtime` | `src/state` | _not measured_ | no |
| `src/state` | `src/api` | _not measured_ | no |
| `src/state` | `src/config` | _not measured_ | no |
| `src/state` | `src/ffi` | _not measured_ | no |
| `src/state` | `src/runtime` | _not measured_ | no |
| `src/tests` | `src/api` | _not measured_ | no |
| `src/tests` | `src/architecture` | _not measured_ | no |
| `src/tests` | `src/build` | _not measured_ | no |

No crossing carries a call count in this run. R3 has not run in this analysis, so the call sites in the source package that name this edge's target were not extracted. This crossing is not measured, which is not the same fact as a count of zero — a static call graph cannot see a call behind a trait object, a macro or a registry.

The counts are static where they exist at all: the execution surface beside this report names the
mechanisms a call can hide behind, and each one is a place where this table and the running program
can disagree.

### The question this material asks

Decide whether each directory above is a boundary the four-layer structure wants to keep, or a line drawn through coupling that belongs together — and where a crossing is real, decide whether it is an intended layering or an accident of history. 14 package(s) are in front of you; nothing here answers the question, and nothing here ranks them for you.

What remains unresolved is the coupling the syntax layer cannot follow: the call counts are static, so a call behind a trait object, a macro or a registry lookup leaves no trace. That gap is R2.5's and is recorded in `EXECUTION-SURFACE.json` beside this report.

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

- `IMPORT_NOT_RESOLVED` over `build.rs, examples/account_register.rs, examples/audio_tap.rs, examples/client_init.rs, examples/common/cli.rs, examples/common/client.rs, examples/make_call.rs, examples/tts_source.rs, src/api/asyncaudiosrc_adapter.rs, src/api/audio_subscribe_bp.rs, and 121 more file(s)` — 359 use declaration(s) name a module this walk could not resolve to a source member — in build.rs (1), examples/account_register.rs (7), examples/audio_tap.rs (4), examples/client_init.rs (4), examples/common/cli.rs (3), examples/common/client.rs (4), examples/make_call.rs (4), examples/tts_source.rs (4), src/api/asyncaudiosrc_adapter.rs (4), src/api/audio_subscribe_bp.rs (5), and more. The graph below therefore holds fewer edges than the source states, and an absent edge here is a gap in the measurement rather than an absence of coupling

# R2.5 — the execution surface

Analysis mode: `syntax_only`.

> This list is evidence of presence, not proof of absence. A mechanism not listed here is one this instrument did not find, which is not the same as one that is not there — no static analysis of an arbitrary program can be exhaustive about dynamic mechanisms.

## What was found

| Mechanism kind | Count |
|---|---|
| `code_generation` | 1 |
| `compile_time_embedding` | 8 |
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
- `compile_time_embedding` — `wrapper.h:10` — `#include <pjmedia-codec/opus.h>`
  - an include composes declarations from another file, so what this translation unit holds is written elsewhere
- `compile_time_embedding` — `wrapper.h:8` — `#include <pjsua.h>`
  - an include composes declarations from another file, so what this translation unit holds is written elsewhere
- `compile_time_embedding` — `wrapper.h:9` — `#include <pjmedia.h>`
  - an include composes declarations from another file, so what this translation unit holds is written elsewhere
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
- … and 775 more, every one recorded in the JSON beside this report

Every mechanism above is a place where the import graph and the running program can disagree.
A proposition touching one of them may not be classified `observed` without dynamic evidence (R-1).

## Limitations

- `SURFACE_PARTIAL_ON_PARSE_ERROR` over `src/ffi/backend_calls.rs` — the grammar recovered near: &raw, raw,. Mechanisms inside the recovered region may not have been detected, so an absent mechanism here is a limit of the pinned grammar rather than a fact about the file

# R2.5 — the static/dynamic coupling difference

Stage: `r2.5`. Subject: `/Users/kawata/shyme/zasso/tools/conver/siprs-for-reverse`.

> A difference of zero, or a disagreement of zero, can be a signal of abnormality rather than of health. The dynamic channel reports what one bounded session ran, and an empty dynamicOnly set means this session ran nothing the static reading had failed to list — not that no mechanism hides from a static reading. A mechanism that ran and left no static trace is invisible here exactly as it is there.

## The dynamic channel

A session ran: `ses-476b8e6124ee81d6`, inside a disposable copy of the subject.
The subject was digested before and after and did not move.

## What the session exercised

Nothing. The session ran the subject's own declared start command and observed no dynamic construct at run time.

## What the session did not exercise

395 mechanism(s) this channel can reach were not exercised by this session. That is a statement about the session's scope, not about the program: a mechanism this session did not reach has not been shown to be absent from the program.

## What this channel cannot reach at all

- `code_generation` — a generator runs before the program exists, so a session of the built program has nothing to observe
- `compile_time_embedding` — the compiler reads a build-time input while constructing the program, so a session of the built program has nothing to observe
- `conditional_compilation` — the compiler selects a branch while constructing the program, so the branch not taken is absent from everything a session runs

## The difference between the two surfaces

- `both`: 0
- `staticOnly`: 795
- `dynamicOnly`: 0

A `dynamicOnly` of zero is a signal rather than a clean result. A mechanism that ran and left no static trace is the case the static reading cannot see and the case this channel exists to find; a session that surfaced none of them has told a reader about its own scope and nothing about the program.

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

## What the vocabulary was exercised over

- `rust` — 23 kind(s) observed; every declared kind was reached here
- `typescript` — 0 kind(s) observed; 22 declared and not reached by this population: `argument_read`, `assert`, `conditional`, `dominating_branch`, `early_return`, `error_return`, `error_type`, `error_variant`, `field_read`, `field_write`, `global_read`, `global_write`, `io_read`, `io_write`, `loop_condition`, `public_item`, `state_assignment`, `state_field`, `test_boundary_value`, `test_expected_exception`, `throw`, `type_declaration`
- `javascript` — 0 kind(s) observed; 22 declared and not reached by this population: `argument_read`, `assert`, `conditional`, `dominating_branch`, `early_return`, `error_return`, `error_type`, `error_variant`, `field_read`, `field_write`, `global_read`, `global_write`, `io_read`, `io_write`, `loop_condition`, `public_item`, `state_assignment`, `state_field`, `test_boundary_value`, `test_expected_exception`, `throw`, `type_declaration`
- `go` — 0 kind(s) observed; 23 declared and not reached by this population: `argument_read`, `assert`, `conditional`, `dominating_branch`, `early_return`, `error_return`, `error_type`, `error_variant`, `field_read`, `field_write`, `global_read`, `global_write`, `io_read`, `io_write`, `loop_condition`, `panic`, `public_item`, `state_assignment`, `state_field`, `test_boundary_value`, `test_expected_exception`, `type_declaration`, `unwrap_expect`
- `python` — 0 kind(s) observed; 22 declared and not reached by this population: `argument_read`, `assert`, `conditional`, `dominating_branch`, `early_return`, `error_return`, `error_type`, `error_variant`, `field_read`, `field_write`, `global_read`, `global_write`, `io_read`, `io_write`, `loop_condition`, `public_item`, `state_assignment`, `state_field`, `test_boundary_value`, `test_expected_exception`, `throw`, `type_declaration`
- `c_cpp` — 0 kind(s) observed; 21 declared and not reached by this population: `argument_read`, `assert`, `conditional`, `dominating_branch`, `early_return`, `error_type`, `error_variant`, `field_read`, `field_write`, `global_read`, `global_write`, `io_read`, `io_write`, `loop_condition`, `public_item`, `state_assignment`, `state_field`, `test_boundary_value`, `test_expected_exception`, `throw`, `type_declaration`

## What this run could not look at

- `build_semantic` — layer C is not built here (docs/P22-ANALYSIS-TECH.md §7): name resolution, type checking and cfg evaluation need a semantic adapter, so a proposition resting on any of them is not observed
- `runtime_dynamic` — no execution, build or trace evidence was collected, so dynamic dispatch targets, generated code and post-preprocessing composition are not observable in this run

## Limitations of the instrument

- `language_absent_from_population` (typescript) — the typescript vocabulary was declared and not exercised by this run; its correctness is unverified here
- `language_absent_from_population` (javascript) — the javascript vocabulary was declared and not exercised by this run; its correctness is unverified here
- `language_absent_from_population` (go) — the go vocabulary was declared and not exercised by this run; its correctness is unverified here
- `language_absent_from_population` (python) — the python vocabulary was declared and not exercised by this run; its correctness is unverified here
- `vocabulary_table_exercised` (rust/FACT_VOCABULARY) — the rust FACT_VOCABULARY was read over this population, reaching 23 of its 23 declared kinds; what it reaches beyond this population is not claimed
- `vocabulary_table_exercised` (rust/NAME_FILTERS) — the rust NAME_FILTERS was read over this population; what it reaches beyond this population is not claimed
- `vocabulary_table_unexercised` (typescript/FACT_VOCABULARY) — the typescript FACT_VOCABULARY was declared and this run held no typescript file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (typescript/NAME_FILTERS) — the typescript NAME_FILTERS was declared and this run held no typescript file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (javascript/FACT_VOCABULARY) — the javascript FACT_VOCABULARY was declared and this run held no javascript file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (javascript/NAME_FILTERS) — the javascript NAME_FILTERS was declared and this run held no javascript file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (go/FACT_VOCABULARY) — the go FACT_VOCABULARY was declared and this run held no go file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (go/NAME_FILTERS) — the go NAME_FILTERS was declared and this run held no go file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (python/FACT_VOCABULARY) — the python FACT_VOCABULARY was declared and this run held no python file, so nothing of it was exercised here
- `vocabulary_table_unexercised` (python/NAME_FILTERS) — the python NAME_FILTERS was declared and this run held no python file, so nothing of it was exercised here
- `vocabulary_table_exercised` (c_cpp/FACT_VOCABULARY) — the c_cpp FACT_VOCABULARY was read over this population, reaching 0 of its 21 declared kinds; what it reaches beyond this population is not claimed
- `vocabulary_table_exercised` (c_cpp/NAME_FILTERS) — the c_cpp NAME_FILTERS was read over this population; what it reaches beyond this population is not claimed
- `state_field_by_name` (all languages) — a state field is recognised by its name, so a state carried under a name outside the vocabulary is not enumerated

## Claim ledger

Claims: 4460 · candidates: 3509

| class | count | what it means |
|---|---|---|
| observed | 336 | read from the source text or its syntax |
| inferred | 409 | an inference the source text supports but does not state |
| normative | 0 | settled only by a recorded human decision |
| unresolved | 3715 | not decidable here; handed to the human grill |

### Evidence independence

4460 evidence record(s) fold to **47 independent** component(s). 4413 record(s) share a derivation with another record and therefore count once — the difference between the number of records and the number of things they support.

Relations found: `same_commit` (medium), `same_syntax_span` (strong).
Commit channel consulted: yes.
Assessments: independent 1, folded 4459. An `unknown` assessment means no consulted channel could settle the question, which is a different statement from "these are independent" and the one the design requires.

Unresolved rate: 0.8329596412556054

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
| commits in the repository | 1004 |
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

**2064 gap(s)** across 6 kind(s).

| Kind | Count | Meaning |
|---|---|---|
| `absent_red` | 700 | a public surface with no test that could fail for it |
| `circular_reasoning` | 10 | a test written from the design, so it agrees with the implementation by construction |
| `comment_code_drift` | 956 | a comment and the code beneath it disagree |
| `dead_code` | 102 | nothing in the analysed population references it |
| `stub` | 293 | an incomplete implementation: a stub marker, a deferred-work note, a panic, or an empty body |
| `unobserved_surface` | 3 | a construct, path or boundary never observed — which is not the same as absent |

| Gap | File | Line | Kind |
|---|---|---|---|
| `gap-build.rs-dead_code-13` | `build.rs` | 13 | `dead_code` |
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

**2044 gap(s) were not printed.** The list above is capped so that it can be read; the JSON beside this report carries every entry.

## Oracle validity

> A mutation score measures how many injected changes the current tests detect. It is not a measure of contract coverage, and no score is emitted here. A survivor is a question about the oracle, not a failure of the implementation.

**Mutation results supplied**: no.

**Channels this run could not consult:**

- no mutation results were supplied to this run, so no survivor was classified and no equivalence was decided. This is a missing channel, not a suite with no gaps: mutation execution belongs to a stage that can build and run the target.

**Survivors classified**: 0. **Discarded as equivalent by the ladder**: 0.

### Trivial compiler-normalisation equivalence

> A trivial comparison decides whether two texts normalise to the same tree under one named grammar. It is not a decision about meaning: semantic equivalence is undecidable for general programs, so this stage never claims it, and every verdict records the two normalised forms it rested on so a reader can see what was compared.

**Grammar**: `tree-sitter-rust` (`tree-sitter-rust@0.23.2`), comments `stripped`.

- no mutant pair was presented to this run, so no comparison was computed. E13 decides a pair, and an empty comparison list is the absence of an input rather than a clean result

**Comparisons**: 0 (0 trivially equivalent, 0 not trivially equivalent, 0 unreadable).


## Capability matrix

| Extraction item | rust | typescript | javascript | go | python | c_cpp |
|---|---|---|---|---|---|---|
| E1 | failed | not_attempted | not_attempted | not_attempted | not_attempted | partial |
| E2 | failed | not_attempted | not_attempted | not_attempted | not_attempted | partial |
| E3 | failed | not_attempted | not_attempted | not_attempted | not_attempted | partial |
| E4 | failed | not_attempted | not_attempted | not_attempted | not_attempted | partial |
| E5 | failed | not_attempted | not_attempted | not_attempted | not_attempted | partial |
| E6 | failed | not_attempted | not_attempted | not_attempted | not_attempted | partial |
| E7 | partial | not_attempted | not_attempted | not_attempted | not_attempted | partial |
| E8 | partial | not_attempted | not_attempted | not_attempted | not_attempted | partial |
| E9 | partial | not_attempted | not_attempted | not_attempted | not_attempted | partial |
| E10 | partial | not_attempted | not_attempted | not_attempted | not_attempted | partial |
| E11 | partial | not_attempted | not_attempted | not_attempted | not_attempted | partial |
| E12 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E13 | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle | unsupported_in_principle |
| E14 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E15 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |
| E16 | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted | not_attempted |

Derived from this run's own attempt ledger; 22 cell(s) rest on at least one recorded attempt.

A gap here is a limitation of the instrument, not evidence about the project. A cell reading `not_attempted` states that this run made no attempt of that family for that language; it is never a statement that the project lacks the thing being sought.

# The analysis attempt ledger

Without this ledger `extracted_count: 0` would mean both "analysed and found nothing" and
"could not analyse", and therefore neither. The two counts are reported separately for that
reason.

| Count | Value |
|---|---|
| attempts recorded | 605 |
| analysed and extracted nothing | 125 |
| could not run | 3 |

## Attempts that could not run

- `src/ffi/backend_calls.rs` — phase `parse`, reason `grammar_recovered`
- `src/ffi/backend_calls.rs` — phase `parse`, reason `grammar_recovered`
- `src/ffi/backend_calls.rs` — phase `parse`, reason `grammar_recovered`

## How to read this

The analysis mode is `syntax_only`. Every fact above was read from source text and its syntax
tree: no name was resolved, no type was checked, and no configuration was replayed. The
execution surface is evidence of presence and not proof of absence. Nothing here decides
whether the project is correct, complete or well designed — that judgement is a human's, and
this report exists to put the material for it in front of one.

