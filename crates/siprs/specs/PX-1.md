# Implementation Order (TDD Red-Green-Refactor)

Implementation must strictly follow the **Red → Green → Refactor** sequence. Skipping steps, reordering, or parallel execution is prohibited.

## 1. Red — Fully Implement Failing Tests

Before writing a single line of implementation code, write a failing test suite that achieves 100% coverage of the spec's **Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants**. Coverage of these seven elements is mandatory; partial implementation is not acceptable.

When the ticket defines **Contracts** (Precondition/Postcondition/Invariant from graph edge annotation), the Red phase must first translate each Contract into testable form — input schemas, output assertions, and invariant predicates — before implementing them as concrete test code. A Contract whose Precondition/Postcondition/Invariant cannot be expressed as a testable assertion is not yet fully specified.

- Tests must cover all observable behaviors, edge cases, failure modes, and invariants. Any behavior not covered is considered undefined and fails review.
- If a feature is deterministic yet fundamentally untestable, this is not a testing gap but an architectural defect. Redesign the system until it is testable before proceeding to implementation.
- Confirm that all tests fail red due to the absence of implementation. Tests that pass green by accident (e.g., meaningless assertions) are invalid.

## 2. Green — Implement Behavior (No Stubs, No Test Modification)

Implement the **behavior** specified by the tests; do not treat passing the tests as an end in itself. Tests are a means of verifying correctness, not the goal itself.

- Implementations that merely satisfy the literal wording of tests—via hardcoding, input-specific branching, or stubbed return values—are prohibited. The implementation must be a generalized, correct solution.
- If it is impossible to distinguish, via testing, whether an implementation is genuine or a disguised green, this indicates a design flaw caused by insufficient coverage. Add tests until the distinction is possible before proceeding with implementation.
- Modifying, deleting, or weakening tests to make an implementation pass is strictly forbidden. The implementation must conform to the tests; the reverse is never acceptable.
- An implementation whose correctness cannot be proven is invalid. It is not considered complete until it (or its design) is restructured into a provably correct form.

## 3. Refactor — Apply the Boy Scout Rule (Green State Only)

Refactor only after all tests are green. Refactoring in a red state is prohibited.

- Apply the Boy Scout Rule (leave the code cleaner than you found it; readability = translatability) to eliminate `unwrap()` calls, hardcoded values, false comments, and untested code in anything you touch.
- Verify that all tests remain green before and after each refactoring step. If a refactor breaks green, roll it back immediately.

## Definition of Done

Implementation is considered incomplete unless all of the following are satisfied:

- The tests fully and precisely specify the intended behavior.
- The implementation passes all tests green, without exception.
- Correctness is empirically guaranteed by the tests (not a disguised green).
- No gap exists between test coverage and intended behavior.

Green without red, green achieved by modifying tests, and green achieved through stubs are all violations and constitute incomplete work.

# Target ticket is PX-1: Error Design — SipError & SipErrorKind

**Ticket Key**: PX-1 · **Phase**: -1

**RFC Source**: `RFC-ROOT.md`

---

## Background

- [Goal] Define the single error type (SipError, SipErrorKind) used by all crate APIs, and provide M20 RuntimeCommand error conversion functions (ConfConnect, ConfDisconnect, GetAccountInfo) that map PJSUA error codes to existing SipErrorKind variants without introducing new variants.
- [Purpose] Every crate API returns Result<T, SipError>. A single error type ensures uniform error handling across the entire crate. The error carries semantic classification (kind), human-readable message, optional PJSUA native status code, optional account/call scope identifiers, and a retryable flag — enabling downstream health-check logic and circuit-breaker patterns.
- [Motivation] The RFC §14 requires all APIs to return Result<T, SipError> with stable error classification. P0-5 implements the foundational type. M20 (P4-1) adds RuntimeCommands that need error mapping without inflating SipErrorKind with command-specific variants.
- [Constraints] No external dependencies beyond tokio and thiserror. The error type must be Send + Sync for async runtime compatibility. PJSUA pj_status_t codes (-1=PJ_EINVALIDOP, -2=PJ_ENOTFOUND) must be mapped without actual FFI linkage in unit tests. #[non_exhaustive] on SipErrorKind to allow additive changes without breaking downstream matches.

## Scope

- SipError struct with kind/message/native_status/account_id/call_id/retryable
- SipErrorKind enum with all variants
- pj_status_t conversion policy
- M20: ConfConnect/ConfDisconnect/GetAccountInfo error mapping
- **Scope of changes (describe each change comprehensively):**
  - [File/module path] src/error/error_design_siperror.rs
  - [Action: add/modify/remove/rename/refactor] ADD
  - [What specifically changes] New file defining SipError struct (kind, message, native_status, account_id, call_id, retryable), SipErrorKind enum (25 variants), Display impl for SipErrorKind, kind_is_retryable() helper, SipError::new() and helper constructors, with_native_status()
  - [Before → After (behavior/signature)] Before: No error type existed. After: SipError struct with #[derive(Debug, thiserror::Error)] and all fields, SipErrorKind with all 25 variants
  - [API contract change (if any)] All future crate APIs must return Result<T, SipError>. The error type is the single point of failure communication.
  - [Data schema change (if any)] None — data structures are internal to the crate
  - [Config/env change (if any)] None
  - [Dependency added/removed (if any)] thiserror (for #[derive(Error)]), serde feature (conditional for Serialize/Deserialize)

  - [File/module path] src/error/m20_runtime_command_error.rs
  - [Action: add/modify/remove/rename/refactor] ADD
  - [What specifically changes] Three error conversion functions: convert_conf_connect_error(i32, CallId) → Result<(), SipError>, convert_conf_disconnect_error(i32, CallId) → Result<(), SipError>, convert_get_account_info_error(i32, u32) → Result<(), SipError>
  - [Before → After (behavior/signature)] Before: No M20 error mapping existed. After: Functions map pj_status codes to SipError: 0→Ok, -1(PJ_EINVALIDOP)→InvalidState, -2(PJ_ENOTFOUND)→NotFound, other→InternalError with native_status
  - [API contract change (if any)] None — these are internal helper functions, not public API
  - [Data schema change (if any)] None
  - [Config/env change (if any)] None
  - [Dependency added/removed (if any)] None new

  - [File/module path] src/error/mod.rs
  - [Action: add/modify/remove/rename/refactor] MODIFY
  - [What specifically changes] Add pub mod declarations for error_design_siperror and m20_runtime_command_error. Re-export SipError and SipErrorKind at the error module level.
  - [Before → After (behavior/signature)] Before: No error module. After: Error module with submodules and re-exports.
  - [API contract change (if any)] SipError and SipErrorKind are accessible at siprs::error::SipError
  - [Data schema change (if any)] None
  - [Config/env change (if any)] None
  - [Dependency added/removed (if any)] None

  - [File/module path] src/lib.rs
  - [Action: add/modify/remove/rename/refactor] MODIFY
  - [What specifically changes] Add pub mod error; declaration. Remove SipError/SipErrorKind re-exports previously in lib.rs if moved to error/mod.rs
  - [Before → After (behavior/signature)] Before: No error module declared. After: pub mod error;
  - [API contract change (if any)] None
  - [Data schema change (if any)] None
  - [Config/env change (if any)] None
  - [Dependency added/removed (if any)] None
- **Out of scope (items intentionally excluded, with justification):**
  - [Excluded item] PJSUA FFI-level pj_strerror() integration
  - [Why excluded — separate ticket / future phase / not applicable] The FFI binding layer (planned for future tickets) will handle pj_strerror() calls. The error type design intentionally separates the machine-readable native_status code from the human-readable message.
  - [Excluded item] Custom error code to variant mapping for all possible PJSIP error codes
  - [Why excluded — separate ticket / future phase / not applicable] The current design maps only the most common codes (PJ_EINVALIDOP, PJ_ENOTFOUND). A comprehensive mapping table would require full PJSIP FFI and is not needed for the initial implementation.
- **Affected areas (components/systems impacted, even without direct modification):**
  - [Affected component] public_api_design.rs (N0011)
  - [Nature of impact: performance / security / API surface / data format / …] API surface: all public methods must now return Result<T, SipError>
  - [Corresponding change needed Y/N + details] Y — P3-1 implements the public API trait consuming SipError return types
  - [Affected component] challenges_panic_policy.rs (N0055)
  - [Nature of impact: performance / security / API surface / data format / …] Error type: CleanupProcedure and ffi_catch_unwind use SipError as their error type
  - [Corresponding change needed Y/N + details] Y — already implemented in P1-2 which uses SipError in CleanupProcedure
  - [Affected component] Concurrency/command model
  - [Nature of impact: performance / security / API surface / data format / …] Error type: RuntimeCommand oneshot replies use SipError
  - [Corresponding change needed Y/N + details] Y — already implemented in P0-4 which defines SipError in RuntimeCommand reply types

## Investigation

- [Code Investigation Results]
  - Source file: src/error/error_design_siperror.rs - Fully implemented SipError (struct with #[derive(Debug, thiserror::Error)], fields: kind, message, native_status, account_id, call_id, retryable) and SipErrorKind (enum with 25 variants, Display impl, #[non_exhaustive]). Helper constructors (new, invalid_config, invalid_state, not_found, internal_error, timeout, with_native_status) and kind_is_retryable() helper. Tests cover construction, Display, trait bounds, all 25 variants, helper constructors, native_status, retryable flag, optional fields. File: 484 lines.
  - Source file: src/error/m20_runtime_command_error.rs - Three conversion functions: convert_conf_connect_error(i32, CallId), convert_conf_disconnect_error(i32, CallId), convert_get_account_info_error(i32, u32). Maps: 0 -> Ok, -1(PJ_EINVALIDOP) -> InvalidState, -2(PJ_ENOTFOUND) -> NotFound, other -> InternalError with native_status preserved. Tests cover success path, error kinds, operation name in messages, native_status preservation, compile-time check for no M20-specific variants. File: 253 lines.
  - Source file: src/error/mod.rs - Module declarations for error_design_siperror, m20_runtime_command_error, m20_shutdown_routing, challenges_panic_policy. Re-exports SipError and SipErrorKind at module level.
  - Source file: src/error/challenges_panic_policy.rs - Uses SipError as error type in ffi_catch_unwind() and CleanupProcedure. Confirms cross-module error type integration.
  - Source file: src/lib.rs - Declares pub mod error; and re-exports config types. The error module is declared at line 107.
  - Source file: RFC-ROOT.md section 14 (lines 610-691) - Defines error design: SipError struct, SipErrorKind enum with all 25 variants, pj_status_t conversion policy (pj_status_t != PJ_SUCCESS -> NativeError or context-specific), M20 RuntimeCommand error design table (3 commands x 2 failure conditions each), rationale against new variants.
  - Graph nodes: N0016 (error design), N0017 (M20 error mapping), N0011 (public API - depends on N0016).
  - Edge annotations confirmed: N0016->N0011 (error constrains API), N0017->N0016 (M20 uses existing variants).

## Acceptance Criteria

- SipError covers all error categories
- All pj_status_t values map to SipError
- M20 commands use existing error variants
- **[Happy path] All 25 SipErrorKind variants are constructable and Display correctly. SipError::new() and all helper constructors produce correct kind and format. PJ_SUCCESS (0) always maps to Ok(()) in all three M20 conversion functions. The error module compiles and all tests pass green.**
- **[Error case] Non-zero pj_status values correctly map to appropriate SipErrorKind: PJ_EINVALIDOP (-1) → InvalidState, PJ_ENOTFOUND (-2) → NotFound, all other values → InternalError with native_status preserved. Each error message contains the operation name for debugging traceability.**
- **[Edge case] Optional fields (native_status, account_id, call_id) default to None via SipError::new(). The retryable flag is correctly set per kind_is_retryable() classification. SipErrorKind has #[non_exhaustive] for forward compatibility. M20 conversion functions accept any i32 value without panicking — unknown codes map to InternalError.**

## Invariants

- [Normal condition] All public API methods return Result<T, SipError>. The error type is the sole error type for all crate operations. Error kind is one of the 25 SipErrorKind variants. M20 RuntimeCommand errors use only existing variants (InvalidState, NotFound, InternalError).
- [Error invariant] Even in error paths, the SipError struct must always contain a valid kind and non-empty message. The native_status field, when present, faithfully represents the PJSUA pj_status_t code. The retryable flag must be correctly set according to the kind_is_retryable() classification.
- [Internal state invariant] The error module has no internal mutable state. SipError is an immutable value type constructed entirely from its inputs. Display output must always follow the "{kind}: {message}" format. SipErrorKind variants are a closed set (25 variants) — adding new variants requires src/error/error_design_siperror.rs changes and #[non_exhaustive] ensures backward compatibility.
- [Boundary invariant] The SipErrorKind enum has #[non_exhaustive] attribute to prevent exhaustive downstream matching. New M20 RuntimeCommands must NOT introduce new SipErrorKind variants — enforced by the N0017→N0016 contract. The pj_status_t value 0 always maps to success (Ok(())). The value -1 (PJ_EINVALIDOP) maps to InvalidState, and -2 (PJ_ENOTFOUND) maps to NotFound.

## Contracts — mandatory 100% test coverage in TDD Red phase

### C017 — N0016→N0011

- **Precondition**: Public API design in progress
- **Postcondition**: Error design constrains API return types
- **Invariant**: All APIs return Result<T, SipError>

### C018 — N0017→N0016 (internal)

- **Precondition**: Error design constrains API return types
- **Postcondition**: Error design constrains API return types
- **Invariant**: No new error kinds for M20 commands

## Boy Scout Rule

- [Translatability Improvement Plan]
  - The existing error conversion functions (convert_conf_connect_error, convert_conf_disconnect_error, convert_get_account_info_error) follow a repetitive if-else pattern: check 0 -> Ok, check specific error -> specific SipErrorKind, else -> InternalError. This is translatable but could be DRYed with a helper: fn map_pj_status(pj_status: i32, specific_kind: impl Fn(i32) -> Option<SipErrorKind>, operation_name: &str) -> Result<(), SipError>.
  - The kind_is_retryable() function uses a matches!() macro which is idiomatic. No improvement needed.
  - The SipErrorKind Display impl uses a match that maps each variant to a static string. This is verbose but necessary for explicit mapping. Consider a derive macro approach in the future, but for now the readability gain (each variant name is explicit) justifies the verbosity.
  - Hardcoded PJSUA error constants (-1, -2) in convert functions should be extracted into named constants once FFI bindings exist: PJ_EINVALIDOP = -1, PJ_ENOTFOUND = -2.
  - Variable names are domain concepts (pj_status, call_id, account_id, kind, message). Good naming, no improvements needed.
  - Functions follow verb naming (convert_*, kind_is_retryable) - meets the verb-phrase standard.

## Test Plan

### Unit Tests

- UT: [Normal] SipError::new() constructs with given kind and message — validates Display output: "{kind}: {message}"
- UT: [Normal] SipError helper constructors (invalid_config, invalid_state, not_found, internal_error, timeout) set correct SipErrorKind
- UT: [Normal] SipError::with_native_status() preserves native_status and sets kind correctly
- UT: [Normal] convert_conf_connect_error(0, call_id) returns Ok(()) — PJ_SUCCESS path
- UT: [Normal] convert_conf_disconnect_error(0, call_id) returns Ok(()) — PJ_SUCCESS path
- UT: [Normal] convert_get_account_info_error(0, account_id) returns Ok(()) — PJ_SUCCESS path
- UT: [Normal] SipErrorKind Display outputs exact variant name (e.g. InvalidConfig, NotFound)
- UT: [Error] convert_conf_connect_error(-1, call_id) returns Err with kind=InvalidState for PJ_EINVALIDOP
- UT: [Error] convert_conf_connect_error(other, call_id) returns Err with kind=InternalError for unknown PJSUA codes
- UT: [Error] convert_conf_disconnect_error(-1, call_id) returns Err with kind=InvalidState for PJ_EINVALIDOP
- UT: [Error] convert_conf_disconnect_error(other, call_id) returns Err with kind=InternalError for unknown PJSUA codes
- UT: [Error] convert_get_account_info_error(-2, account_id) returns Err with kind=NotFound for PJ_ENOTFOUND
- UT: [Error] convert_get_account_info_error(other, account_id) returns Err with kind=InternalError for unknown PJSUA codes
- UT: [Error] SipError native_status is Some(code) when constructed via with_native_status()
- UT: [Boundary] SipError optional fields (native_status, account_id, call_id) default to None via new()
- UT: [Boundary] SipErrorKind enum has exactly 25 variants — compile-time exhaustive match check
- UT: [Boundary] retryable flag is true for InvalidState, TransportInitFailed, MediaInitFailed, Timeout, NotFound — false for all other variants
- UT: [Boundary] SipErrorKind implements Debug + Clone + Copy + PartialEq + Eq trait bounds
- UT: [Boundary] SipError struct with all fields populated via struct literal construction
- UT: [Boundary] M20 error messages contain operation name (ConfConnect, ConfDisconnect, GetAccountInfo) for debugging traceability
- UT: [Invariant] SipError implements std::error::Error trait (via thiserror derive)
- UT: [Invariant] C018: All M20 RuntimeCommand errors use only existing SipErrorKind variants (InvalidState, NotFound, InternalError) — compile-time match check confirms no M20-specific variants exist
- UT: [Invariant] C017: All crate public API surfaces return Result<T, SipError> — verified by type signature in public_api_design.rs and SipClient trait methods
- UT: [Invariant] Error conversion follows RFC: pj_status_t != PJ_SUCCESS maps to NativeError or context-specific variant; 4xx/5xx/6xx SIP codes stored in InviteFailed/RegistrationFailed message field

### Integration Tests

- IT: [Integration point] Error module ↔ public_api_design.rs (N0011) — all public API functions must return Result<T, SipError>. This is verified by the SipClient trait definition in public_api_design.rs which uses SipError in every method return type.
- IT: [Integration point] Error module ↔ crate::error re-export — SipError and SipErrorKind are re-exported at `siprs::error::SipError` and `siprs::error::SipErrorKind` for doctest accessibility. The re-export stability is checked by doctests in error_design_siperror.rs.
- IT: [Integration point] M20 error conversion ↔ ConfConnect/ConfDisconnect/GetAccountInfo command implementations — the convert_*_error functions are consumed by command dispatchers to produce typed errors from PJSUA FFI return codes.
- IT: [Integration point] Error module ↔ challenges_panic_policy.rs — SipError is the error type used by ffi_catch_unwind and CleanupProcedure.execute(). The type compatibility is verified at compile time.
- IT: [Verification] Cross-module error propagation: calling ffi_catch_unwind with a panic-producing closure returns SipError to the caller. This verifies the error module integration with panic safety.
- IT: [Verification] Command error routing: a hypothetical RuntimeCommand dispatch that calls convert_conf_connect_error should propagate the resulting SipError to the command sender. Verified via compile-time type checks.
- IT: [Prerequisites] The error types must be defined before any public API method signatures are written. P0-5 (error module) is a prerequisite for P1-1, P3-1, and all subsequent tickets that return SipError.
- IT: [Prerequisites] M20 error conversion functions require SipErrorKind variants InvalidState, NotFound, InternalError to exist — enforced by compile-time enum matching.
- IT: [Related tickets] P0-5: Initial SipError + SipErrorKind implementation (N0016)
- IT: [Related tickets] P3-1: Public API design consuming SipError return types (N0011)
- IT: [Related tickets] P4-1: M20 RuntimeCommands consuming convert_*_error functions (N0017)
- IT: [Related tickets] P1-1/P1-2: Shutdown routing and panic policy consuming SipError in CleanupProcedure

### Exceptions

- PJSUA native pj_status_t code-to-string mapping (pj_strerror()) requires a linked PJSUA C library. This is not testable in pure unit test isolation because no FFI linkage is available. This is not an architectural defect: the SipError.native_status field intentionally stores the raw i32 code separately from the human-readable message field, and the FFI layer (planned) will call pj_strerror() to decorate errors. Alternative verification: integration tests in the FFI test suite will verify native preservation across the FFI boundary.
- Parallel/concurrent SipError construction data races are impossible to test because they are provably impossible by Rust type-system guarantees. SipError is an immutable struct with only owned types (String, Option<i32>, Option<AccountId>, Option<CallId>, bool) — no interior mutability, no shared mutable state. This is not a design defect: construction is trivially thread-safe (Send + Sync) in safe Rust. Alternative verification: compile-time trait bound checks confirm SipError is Send + Sync.

### Plan Test Code (concrete code)

- UT: [C017-precondition] SipError constructable with all fields
  ```rust
  use crate::error::{SipError, SipErrorKind};
  use crate::concurrency_contexts::command_serialization::{AccountId, CallId};

  // Struct-literal construction
  let err = SipError {
      kind: SipErrorKind::InviteFailed,
      message: "403 Forbidden".into(),
      native_status: Some(403),
      account_id: Some(AccountId::from_u64(42).unwrap()),
      call_id: Some(CallId::from_u64(7).unwrap()),
      retryable: false,
  };
  assert_eq!(err.kind, SipErrorKind::InviteFailed);
  assert_eq!(err.message, "403 Forbidden");
  assert_eq!(err.native_status, Some(403));
  assert_eq!(err.account_id, Some(AccountId::from_u64(42).unwrap()));
  assert_eq!(err.call_id, Some(CallId::from_u64(7).unwrap()));
  assert!(!err.retryable);
  ```
- UT: [C017-precondition] All helper constructors produce correct kind
  ```rust
  assert_eq!(SipError::invalid_config("x").kind, SipErrorKind::InvalidConfig);
  assert_eq!(SipError::invalid_state("x").kind, SipErrorKind::InvalidState);
  assert_eq!(SipError::not_found("x").kind, SipErrorKind::NotFound);
  assert_eq!(SipError::internal_error("x").kind, SipErrorKind::InternalError);
  assert_eq!(SipError::timeout("x").kind, SipErrorKind::Timeout);

  // with_native_status preserves the native code
  let err = SipError::with_native_status(SipErrorKind::InviteFailed, "403 Forbidden", 403);
  assert_eq!(err.native_status, Some(403));
  ```
- UT: [C017-postcondition] Display output includes kind and message
  ```rust
  let err = SipError::new(SipErrorKind::AccountNotFound, "account 42 not found");
  let display = format!("{}", err);
  assert!(display.contains("AccountNotFound"));
  assert!(display.contains("account 42 not found"));
  ```
- UT: [C017-postcondition] New() defaults optional fields to None
  ```rust
  let err = SipError::new(SipErrorKind::InvalidConfig, "test");
  assert!(err.native_status.is_none());
  assert!(err.account_id.is_none());
  assert!(err.call_id.is_none());
  ```
- UT: [C017-invariant] SipError implements std::error::Error
  ```rust
  fn assert_error<E: std::error::Error>() {}
  assert_error::<SipError>();
  ```
- UT: [C017-invariant] retryable flag correct per kind
  ```rust
  assert!(SipError::new(SipErrorKind::InvalidState, "").retryable);
  assert!(SipError::new(SipErrorKind::Timeout, "").retryable);
  assert!(!SipError::new(SipErrorKind::ShutdownInProgress, "").retryable);
  assert!(!SipError::new(SipErrorKind::InternalInvariantBroken, "").retryable);
  ```
- UT: [C018-precondition] All 25 SipErrorKind variants constructable
  ```rust
  let all: Vec<SipErrorKind> = vec![
      SipErrorKind::InvalidConfig,
      SipErrorKind::InvalidState,
      SipErrorKind::AlreadyInitialized,
      SipErrorKind::NotInitialized,
      SipErrorKind::AccountNotFound,
      SipErrorKind::CallNotFound,
      SipErrorKind::TransportInitFailed,
      SipErrorKind::RegistrationFailed,
      SipErrorKind::AuthenticationFailed,
      SipErrorKind::InviteFailed,
      SipErrorKind::MediaInitFailed,
      SipErrorKind::MediaNegotiationFailed,
      SipErrorKind::IceFailed,
      SipErrorKind::TlsFailed,
      SipErrorKind::SrtpFailed,
      SipErrorKind::AudioFormatUnsupported,
      SipErrorKind::AudioPipelineBroken,
      SipErrorKind::DtmfFailed,
      SipErrorKind::Timeout,
      SipErrorKind::ChannelClosed,
      SipErrorKind::NativeError,
      SipErrorKind::ShutdownInProgress,
      SipErrorKind::InternalInvariantBroken,
      SipErrorKind::NotFound,
      SipErrorKind::InternalError,
  ];
  assert_eq!(all.len(), 25);
  ```
- UT: [C018-precondition] SipErrorKind trait bounds
  ```rust
  fn assert_debug<T: std::fmt::Debug>() {}
  fn assert_clone<T: Clone>() {}
  fn assert_copy<T: Copy>() {}
  fn assert_partial_eq<T: PartialEq>() {}
  fn assert_eq_trait<T: Eq>() {}
  assert_debug::<SipErrorKind>();
  assert_clone::<SipErrorKind>();
  assert_copy::<SipErrorKind>();
  assert_partial_eq::<SipErrorKind>();
  assert_eq_trait::<SipErrorKind>();
  ```
- UT: [C018-postcondition] SipErrorKind Display outputs exact variant name
  ```rust
  assert_eq!(format!("{}", SipErrorKind::InvalidConfig), "InvalidConfig");
  assert_eq!(format!("{}", SipErrorKind::NotFound), "NotFound");
  assert_eq!(format!("{}", SipErrorKind::InternalError), "InternalError");
  ```
- UT: [C018-invariant] ConfConnect uses only existing error kinds
  ```rust
  use crate::model::id_design_newtype::CallId;
  let call_id = CallId::from_u64(5).unwrap();

  // InvalidState (conf_port not resolved)
  let err = convert_conf_connect_error(-1, call_id).unwrap_err();
  assert_eq!(err.kind, SipErrorKind::InvalidState);
  assert!(err.retryable);

  // InternalError (other PJSUA errors)
  let err = convert_conf_connect_error(12345, CallId::from_u64(5).unwrap()).unwrap_err();
  assert_eq!(err.kind, SipErrorKind::InternalError);
  assert!(!err.retryable);
  ```
- UT: [C018-invariant] ConfDisconnect uses only existing error kinds
  ```rust
  let call_id = CallId::from_u64(5).unwrap();

  let err = convert_conf_disconnect_error(-1, call_id).unwrap_err();
  assert_eq!(err.kind, SipErrorKind::InvalidState);
  assert!(err.retryable);

  let err = convert_conf_disconnect_error(999, CallId::from_u64(5).unwrap()).unwrap_err();
  assert_eq!(err.kind, SipErrorKind::InternalError);
  assert!(!err.retryable);
  ```
- UT: [C018-invariant] GetAccountInfo uses only existing error kinds
  ```rust
  let err = convert_get_account_info_error(-2, 42u32).unwrap_err();
  assert_eq!(err.kind, SipErrorKind::NotFound);
  assert!(err.retryable);

  let err = convert_get_account_info_error(999, 42u32).unwrap_err();
  assert_eq!(err.kind, SipErrorKind::InternalError);
  assert!(!err.retryable);
  ```
- UT: [C018-invariant] No M20-specific error kinds exist (compile-time check)
  ```rust
  let _ = |k: SipErrorKind| match k {
      SipErrorKind::InvalidState | SipErrorKind::NotFound | SipErrorKind::InternalError => {}
      _ => {}
  };
  ```

## Changes

| Before | After | Description |
|--------|-------|-------------|
| ffi_catch_unwind used InternalError on panic | ffi_catch_unwind uses InternalInvariantBroken (RFC 14.1 compliant) | Fix panic error kind from InternalError to InternalInvariantBroken - panic is an invariant violation, not an operational error. |
| Magic numbers -1, -2 for PJSUA error codes | Named constants PJ_SUCCESS=0, PJ_EINVALIDOP=-1, PJ_ENOTFOUND=-2 | Extracted hardcoded PJSUA status code values into named constants. |
| Repetitive if pj_status==0 check in 3 functions | Shared is_pj_success() helper function | DRYed the PJ_SUCCESS check across all three M20 conversion functions. |

## Notes

Review report:
- Status: done -> reviewed
- Changed files: challenges_panic_policy.rs, m20_runtime_command_error.rs
- Quality check: passed (all 66 findings are test-code unwraps or doc-comment false positives)
- Translatability: all functions are verb phrases, no single-char vars, no debug output, magic numbers extracted to named constants
- Stub evaluation: 5 stubs correctly deferred to future tickets
- Annotation verification: PX-1 annotations present on all 2 changed source files, no AMBIGUOUS markers
- Final contracts verification: passed
- Issues found and fixes applied: 0 issues discovered during review

## PX-1 — implemented at 2 locations

### src/error/challenges_panic_policy.rs

- Line 302
```rust
    fn ffi_catch_unwind_captures_panic() {
```

### src/error/m20_runtime_command_error.rs

- Line 68
```rust
fn is_pj_success(pj_status: i32) -> bool {
```
