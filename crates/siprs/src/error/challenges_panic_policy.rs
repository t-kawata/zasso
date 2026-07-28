// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0055:  §45 Implementation Challenges & §46 Panic Policy
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0055 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Panic policy and known implementation challenges for the siprs crate.
//!
//! ## Panic policy
//!
//! The crate aims to be panic-free in production. All FFI callbacks must use
//! `catch_unwind` to prevent Rust panics from unwinding into C code, which is
//! undefined behaviour. The [`CleanupProcedure`] type provides a structured way
//! to run ordered cleanup steps after a panic is caught.
//!
//! ## Known challenges
//!
//! 1. **Callback-to-async bridge**: PJSIP callbacks must only enqueue events;
//!    state transitions are driven by the async reactor. This prevents
//!    reentrancy and mutex inversion.
//! 2. **Audio timing drift**: Solved by `PairAligner` + tolerance + zero-padding
//!    + drift metrics.
//! 3. **Multi-source injection**: Per-call `AudioMixer` with a source lifecycle
//!    API, switching atomically on frame boundaries.
//! 4. **Native ID reuse**: Separate public IDs with bi-map conversion, avoiding
//!    confusion when PJSIP reuses internal IDs.

use crate::error::{SipError, SipErrorKind};

/// A single step in a panic-cleanup procedure.
///
/// Each step is a named closure that performs one action (close handle,
/// release resource, log error, restore state). Steps declared in a
/// [`CleanupProcedure`] are executed in declaration order.
pub struct PanicStep {
    /// Human-readable name for logging and debugging.
    name: &'static str,
    /// The cleanup action. Returning `Err` causes the procedure to stop
    /// and propagate the error — remaining steps are skipped.
    action: Box<dyn FnOnce() -> Result<(), SipError>>,
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl PanicStep {
    /// Creates a new cleanup step with a descriptive name.
    pub fn new(
        name: &'static str,
        action: impl FnOnce() -> Result<(), SipError> + 'static,
    ) -> Self {
        PanicStep {
            name,
            action: Box::new(action),
        }
    }

    /// Returns the step's name.
    pub fn name(&self) -> &'static str {
        self.name
    }

    /// Consumes the step and executes its action.
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn execute(self) -> Result<(), SipError> {
        (self.action)()
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl std::fmt::Debug for PanicStep {
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PanicStep")
            .field("name", &self.name)
            .finish()
    }
}

/// A sequence of cleanup steps to run after a panic is caught.
///
/// The standard 4-step cleanup order is:
/// 1. `close_handles` — Close native PJSUA handles
/// 2. `release_resources` — Release allocated native resources
/// 3. `log_error` — Log the panic details
/// 4. `restore_state` — Restore the system to a known-safe state
///
/// ## Error handling
///
/// If any step returns `Err`, `execute()` stops immediately and returns the
/// error. Remaining steps are not executed.
pub struct CleanupProcedure {
    steps: Vec<PanicStep>,
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl CleanupProcedure {
    /// Creates a new cleanup procedure from an ordered list of steps.
    pub fn new(steps: Vec<PanicStep>) -> Self {
        CleanupProcedure { steps }
    }

    /// Returns the number of steps in this procedure.
    pub fn len(&self) -> usize {
        self.steps.len()
    }

    /// Returns `true` if there are no steps.
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }

    /// Executes all steps in declaration order.
    ///
    /// If a step returns `Err`, execution stops and the error is returned.
    /// Subsequent steps are skipped.
    pub fn execute(self) -> Result<(), SipError> {
        for step in self.steps {
            step.execute()?;
        }
        Ok(())
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl std::fmt::Debug for CleanupProcedure {
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CleanupProcedure")
            .field("step_count", &self.steps.len())
            .finish()
    }
}

/// A wrapper around `std::panic::catch_unwind` for use in FFI callbacks.
///
/// Captures any panic raised by the closure and returns it as an `Err`.
/// The panic payload is converted to a `SipError` with kind
/// `InternalInvariantBroken`, allowing the caller to handle it through
/// normal error propagation.
///
/// ## Usage
///
/// ```rust
/// use siprs::error::challenges_panic_policy::ffi_catch_unwind;
///
/// let result = ffi_catch_unwind("process_incoming_call", || {
///     // FFI-safe work — panics are caught here
///     Ok(42)
/// });
/// assert!(result.is_ok());
/// ```
pub fn ffi_catch_unwind<T>(
    operation_name: &'static str,
    f: impl FnOnce() -> Result<T, SipError> + std::panic::UnwindSafe,
) -> Result<T, SipError> {
    let result = std::panic::catch_unwind(f);
    match result {
        Ok(inner) => inner,
        Err(panic_payload) => {
            let message = match panic_payload.downcast_ref::<&str>() {
                Some(s) => format!("panic in '{operation_name}': {s}"),
                None => match panic_payload.downcast_ref::<String>() {
                    Some(s) => format!("panic in '{operation_name}': {s}"),
                    None => format!("panic in '{operation_name}' (unknown payload type)"),
                },
            };
            // Log the panic before returning
            tracing::error!("{}", message);
            // RFC §14.1: callback panic is an invariant violation, not an operational error
            Err(SipError::new(SipErrorKind::InternalInvariantBroken, message))
        }
    }
}

// ---------------------------------------------------------------------------
// Tests — §45/§46 Panic Policy (N0055)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::SipError;

    // ── C056-precondition: CleanupProcedure constructable ──────────────

    /// @verifies C056-precondition
    #[test]
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn cleanup_procedure_constructable_with_steps() {
        let steps = vec![
            PanicStep::new("close_handles", || Ok(())),
            PanicStep::new("release_resources", || Ok(())),
            PanicStep::new("log_error", || Ok(())),
            PanicStep::new("restore_state", || Ok(())),
        ];
        let procedure = CleanupProcedure::new(steps);
        assert_eq!(procedure.len(), 4);
        assert!(!procedure.is_empty());
    }

    // ── C056-postcondition: execute calls all steps in order ───────────

    /// @verifies C056-postcondition
    #[test]
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn cleanup_procedure_execute_calls_all_steps_in_order() {
        let call_order = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let order = call_order.clone();
        let steps = vec![
            PanicStep::new("a", {
                let step_order = order.clone();
                move || {
                    step_order.lock().unwrap().push("a");
                    Ok(())
                }
            }),
            PanicStep::new("b", {
                let step_order = order.clone();
                move || {
                    step_order.lock().unwrap().push("b");
                    Ok(())
                }
            }),
        ];
        let proc = CleanupProcedure::new(steps);
        let _ = proc.execute();
        let executed = call_order.lock().unwrap();
        assert_eq!(*executed, vec!["a", "b"]);
    }

    // ── C056-error: step failure stops execution ───────────────────────

    /// @verifies C056-invariant
    #[test]
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn cleanup_procedure_step_failure_skips_remaining() {
        let call_order = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let order = call_order.clone();
        let steps = vec![
            PanicStep::new("ok1", || Ok(())),
            PanicStep::new("fail", || Err(SipError::internal_error("step failed"))),
            PanicStep::new("skipped", move || {
                order.lock().unwrap().push("should_not_run");
                Ok(())
            }),
        ];
        let proc = CleanupProcedure::new(steps);
        let result = proc.execute();
        assert!(result.is_err());
        let executed = call_order.lock().unwrap();
        assert!(executed.is_empty()); // third step not reached
    }

    // ── C056-boundary: empty step list ─────────────────────────────────

    /// @verifies C056-postcondition
    #[test]
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn cleanup_procedure_empty_step_list() {
        let proc = CleanupProcedure::new(vec![]);
        assert_eq!(proc.len(), 0);
        assert!(proc.is_empty());
        let result = proc.execute();
        assert!(result.is_ok());
    }

    // ── C056-postcondition: catch_unwind captures panic ────────────────

    /// @verifies C056-postcondition
    #[test]
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn catch_unwind_captures_panic_with_str() {
        let result = std::panic::catch_unwind(|| {
            panic!("intentional panic");
        });
        assert!(result.is_err());
    }

    /// @verifies C056-postcondition
    #[test]
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn ffi_catch_unwind_returns_ok_on_success() {
        let result = ffi_catch_unwind("test_ok", || Ok(42));
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    /// @verifies C056-postcondition
    #[test]
// [::TICKET::] P1-2, P4-1, PX-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1|PX-1) --for-spec --no-implementation-order`.
    fn ffi_catch_unwind_captures_panic() {
        let result: Result<(), SipError> = ffi_catch_unwind("test_panic", || {
            panic!("crash");
        });
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.kind, crate::error::SipErrorKind::InternalInvariantBroken);
        assert!(err.message.contains("test_panic"));
    }

    /// @verifies C056-postcondition
    #[test]
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn ffi_catch_unwind_propagates_error() {
        let result: Result<(), SipError> = ffi_catch_unwind("test_err", || {
            Err(SipError::internal_error("business logic error"))
        });
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.message.contains("business logic error"));
    }

    // ── PanicStep ─────────────────────────────────────────────────────

    #[test]
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn panic_step_name_accessible() {
        let step = PanicStep::new("my_step", || Ok(()));
        assert_eq!(step.name(), "my_step");
    }

    #[test]
// [::TICKET::] P1-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P4-1) --for-spec --no-implementation-order`.
    fn panic_step_debug_fmt() {
        let step = PanicStep::new("test_step", || Ok(()));
        let debug = format!("{:?}", step);
        assert!(debug.contains("PanicStep"));
        assert!(debug.contains("test_step"));
    }
}
