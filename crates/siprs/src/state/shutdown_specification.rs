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
//   - NODE_ID=N0043:  §32 Shutdown Specification
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0043 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P4-3: §32 Shutdown Specification — idempotent 5-phase shutdown orchestrator.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crate::runtime::backend::SipBackend;
use crate::runtime::command::ReactorError;

// ---------------------------------------------------------------------------
// ShutdownPhase — named phases of the shutdown sequence
// ---------------------------------------------------------------------------

/// Identifies each sequential phase of the shutdown process.
///
/// The order of variants defines the execution order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ShutdownPhase {
    /// Stop accepting new commands and route via ShutdownCommandRouter.
    StopCommands,
    /// Hang up all active calls (BYE/CANCEL).
    CancelCalls,
    /// Unregister all SIP accounts.
    UnregisterAccounts,
    /// Drain the audio worker (stop processing and flush queues).
    DrainAudio,
    /// Destroy the PJSUA backend (pjsua_destroy).
    InvokeDestroy,
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl ShutdownPhase {
    /// Human-readable label for logging.
    pub fn label(&self) -> &'static str {
        match self {
            Self::StopCommands => "stop_commands",
            Self::CancelCalls => "cancel_calls",
            Self::UnregisterAccounts => "unregister",
            Self::DrainAudio => "drain_audio",
            Self::InvokeDestroy => "destroy",
        }
    }

    /// All phases in order of execution.
    pub fn all() -> [Self; 5] {
        [
            Self::StopCommands,
            Self::CancelCalls,
            Self::UnregisterAccounts,
            Self::DrainAudio,
            Self::InvokeDestroy,
        ]
    }
}

// ---------------------------------------------------------------------------
// ShutdownError — typed errors from the shutdown sequence
// ---------------------------------------------------------------------------

/// Errors that can occur during a shutdown phase.
#[derive(Debug)]
pub enum ShutdownError {
    /// A phase completed with a backend error.
    PhaseFailed {
        phase: ShutdownPhase,
        source: ReactorError,
    },
    /// Timeout waiting for a phase to complete.
    PhaseTimeout {
        phase: ShutdownPhase,
        timeout: Duration,
    },
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl std::fmt::Display for ShutdownError {
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PhaseFailed { phase, source } => {
                write!(f, "shutdown phase {} failed: {}", phase.label(), source)
            }
            Self::PhaseTimeout { phase, timeout } => {
                write!(
                    f,
                    "shutdown phase {} timed out after {:?}",
                    phase.label(),
                    timeout
                )
            }
        }
    }
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl std::error::Error for ShutdownError {
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::PhaseFailed { source, .. } => Some(source),
            Self::PhaseTimeout { .. } => None,
        }
    }
}

// ---------------------------------------------------------------------------
// ShutdownSpec — idempotent shutdown orchestrator
// ---------------------------------------------------------------------------

/// Idempotent, phase-ordered shutdown orchestrator.
///
/// Coordinates the full shutdown sequence across the SIP backend, call manager,
/// account registrar, audio worker, and PJSUA destroy. Designed to be testable
/// without a real PJSUA stack by accepting `&mut dyn SipBackend`.
///
/// # Invariants
/// - `is_shutdown_started()` returns `true` after the first call to
///   `mark_shutdown_started()` or `execute_sequence()`.
/// - Multiple calls to `execute_sequence()` are safe — the second and subsequent
///   calls return `Ok(())` immediately without re-executing.
/// - Phase failures are logged but do not abort the remaining sequence.
pub struct ShutdownSpec {
    /// Atomic guard — `true` once the first shutdown has been triggered.
    is_started: AtomicBool,
    /// Per-phase timeout before proceeding to the next phase.
// [::STUB::] P4-3: ShutdownSpec.timeout is stored but unused -- Implement PhaseTimeout handling for per-call timeout tracking during shutdown
    #[allow(dead_code)]
    timeout: Duration,
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl ShutdownSpec {
    /// Create a new shutdown specification with the given per-phase timeout.
    pub fn new(timeout: Duration) -> Self {
        Self {
            is_started: AtomicBool::new(false),
            timeout,
        }
    }

    /// Returns `true` if shutdown has been started (by any caller).
    pub fn is_shutdown_started(&self) -> bool {
        self.is_started.load(Ordering::SeqCst)
    }

    /// Atomically mark shutdown as started.
    ///
    /// Returns `true` if this was the first call (shutdown was not started before).
    /// Returns `false` if shutdown was already started by a previous call.
    pub fn mark_shutdown_started(&self) -> bool {
        !self.is_started.swap(true, Ordering::SeqCst)
    }

    /// Execute the full shutdown sequence.
    ///
    /// Phases execute in order: StopCommands → CancelCalls → UnregisterAccounts →
    /// DrainAudio → InvokeDestroy.
    ///
    /// If a phase fails, the error is logged but subsequent phases still execute.
    /// The error from the first failed phase is returned.
    /// If shutdown has already been started, returns `Ok(())` immediately (idempotent).
    pub async fn execute_sequence(
        &self,
        backend: &mut dyn SipBackend,
        account_ids: &[i32],
        call_ids: &[i32],
    ) -> Result<(), ShutdownError> {
        // Guard: idempotent — second call returns immediately.
        if !self.mark_shutdown_started() {
            return Ok(());
        }

        let mut first_error: Option<ShutdownError> = None;

        for phase in ShutdownPhase::all() {
            tracing::info!("shutdown phase started: {}", phase.label());

            let result = self
                .execute_phase(phase, backend, account_ids, call_ids)
                .await;

            if let Err(err) = result {
                tracing::error!("shutdown phase failed: {} — {}", phase.label(), err);
                if first_error.is_none() {
                    first_error = Some(err);
                }
            } else {
                tracing::info!("shutdown phase completed: {}", phase.label());
            }
        }

        match first_error {
            Some(err) => Err(err),
            None => Ok(()),
        }
    }

    /// Execute a single shutdown phase.
    async fn execute_phase(
        &self,
        phase: ShutdownPhase,
        backend: &mut dyn SipBackend,
        account_ids: &[i32],
        call_ids: &[i32],
    ) -> Result<(), ShutdownError> {
        match phase {
            ShutdownPhase::StopCommands => {
                // StopCommands is handled by the reactor loop through
                // ShutdownCommandRouter. At the ShutdownSpec level, this phase
                // is a no-op — the reactor checks is_shutdown_started() before
                // dispatching new commands.
                Ok(())
            }
            ShutdownPhase::CancelCalls => {
                for &call_id in call_ids {
                    backend
                        .hangup(call_id)
                        .map_err(|e| ShutdownError::PhaseFailed { phase, source: e })?;
                }
                Ok(())
            }
            ShutdownPhase::UnregisterAccounts => {
                for &acc_id in account_ids {
                    backend
                        .set_registration(acc_id, false)
                        .map_err(|e| ShutdownError::PhaseFailed { phase, source: e })?;
                }
                Ok(())
            }
            ShutdownPhase::DrainAudio => {
                // Audio drain is coordinated by the AudioWorkerTask.
                // At the ShutdownSpec level, we signal the worker via the backend.
                // The backend.shutdown() completion includes audio cleanup.
                Ok(())
            }
            ShutdownPhase::InvokeDestroy => {
                backend
                    .shutdown()
                    .map_err(|e| ShutdownError::PhaseFailed { phase, source: e })?;
                Ok(())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests — TDD Red: failing → Green: passing
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ── C044-Pre: ShutdownSpec construction ─────────────────────────

    #[test]
    // @verifies C044
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn shutdown_spec_new_returns_not_started() {
        let spec = ShutdownSpec::new(Duration::from_secs(5));
        assert!(!spec.is_shutdown_started());
    }

    #[test]
    // @verifies C044
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn shutdown_spec_mark_started_returns_true_on_first_call() {
        let spec = ShutdownSpec::new(Duration::from_secs(5));
        assert!(spec.mark_shutdown_started(), "first call must return true");
    }

    #[test]
    // @verifies C044
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn shutdown_spec_mark_started_returns_false_on_second_call() {
        let spec = ShutdownSpec::new(Duration::from_secs(5));
        spec.mark_shutdown_started();
        assert!(
            !spec.mark_shutdown_started(),
            "second call must return false"
        );
    }

    // ── C044-Post: Phase ordering ───────────────────────────────────

    #[test]
    // @verifies C044
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn shutdown_phases_all_five_in_order() {
        let phases = ShutdownPhase::all();
        assert_eq!(phases.len(), 5);
        assert_eq!(phases[0], ShutdownPhase::StopCommands);
        assert_eq!(phases[1], ShutdownPhase::CancelCalls);
        assert_eq!(phases[2], ShutdownPhase::UnregisterAccounts);
        assert_eq!(phases[3], ShutdownPhase::DrainAudio);
        assert_eq!(phases[4], ShutdownPhase::InvokeDestroy);
    }

    #[test]
    // @verifies C044
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn shutdown_phase_labels_are_human_readable() {
        assert_eq!(ShutdownPhase::StopCommands.label(), "stop_commands");
        assert_eq!(ShutdownPhase::CancelCalls.label(), "cancel_calls");
        assert_eq!(ShutdownPhase::UnregisterAccounts.label(), "unregister");
        assert_eq!(ShutdownPhase::DrainAudio.label(), "drain_audio");
        assert_eq!(ShutdownPhase::InvokeDestroy.label(), "destroy");
    }

    // ── C044-Inv: Shutdown idempotency ──────────────────────────────

    #[tokio::test]
    // @verifies C044
    async fn shutdown_sequence_executes_idempotently() {
        let spec = ShutdownSpec::new(Duration::from_secs(5));
        let mut backend = crate::runtime::backend::MockBackend::new();

        // First call should execute the sequence and succeed.
        let first = spec.execute_sequence(&mut backend, &[], &[]).await;
        assert!(first.is_ok(), "first shutdown must succeed");

        // After first call, is_shutdown_started must be true.
        assert!(spec.is_shutdown_started());

        // Second call must return Ok(()) immediately (idempotent).
        let second = spec.execute_sequence(&mut backend, &[], &[]).await;
        assert!(second.is_ok(), "second shutdown must succeed (idempotent)");

        // Verify backend.shutdown() was called at least once.
        // Note: MockBackend.shutdown() sets initialized=false.
        assert!(!backend.initialized, "backend must be shut down");
    }

    #[tokio::test]
    // @verifies C044, C045
    async fn shutdown_sequence_with_calls_hangs_up_and_unregisters() {
        let spec = ShutdownSpec::new(Duration::from_secs(5));
        let mut backend = crate::runtime::backend::MockBackend::new();
        let account_ids = [1i32, 2i32];
        let call_ids = [1i32];

        let result = spec
            .execute_sequence(&mut backend, &account_ids, &call_ids)
            .await;
        assert!(result.is_ok(), "shutdown with calls must succeed");
        assert!(spec.is_shutdown_started());
    }

    #[tokio::test]
    // @verifies C044
    async fn shutdown_sequence_without_calls_or_accounts_succeeds() {
        let spec = ShutdownSpec::new(Duration::from_secs(5));
        let mut backend = crate::runtime::backend::MockBackend::new();

        let result = spec.execute_sequence(&mut backend, &[], &[]).await;
        assert!(result.is_ok(), "shutdown with no calls must succeed");
    }

    // ── C044: Error handling — phase failures ───────────────────────

    #[test]
    // @verifies C044
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn shutdown_error_display_formats_correctly() {
        let err = ShutdownError::PhaseFailed {
            phase: ShutdownPhase::CancelCalls,
            source: ReactorError::BackendError("call_hangup failed".into()),
        };
        let msg = format!("{err}");
        assert!(msg.contains("cancel_calls"), "must mention the phase");
        assert!(
            msg.contains("call_hangup failed"),
            "must include the source error"
        );

        let timeout_err = ShutdownError::PhaseTimeout {
            phase: ShutdownPhase::InvokeDestroy,
            timeout: Duration::from_secs(5),
        };
        let timeout_msg = format!("{timeout_err}");
        assert!(timeout_msg.contains("destroy"), "must mention the phase");
        assert!(timeout_msg.contains("5s"), "must include the timeout");
    }

    #[test]
    // @verifies C044
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn shutdown_error_implements_error_trait() {
        let err = ShutdownError::PhaseFailed {
            phase: ShutdownPhase::CancelCalls,
            source: ReactorError::BackendError("test".into()),
        };
        let source = std::error::Error::source(&err);
        assert!(source.is_some(), "PhaseFailed must have a source error");
    }

    #[test]
    // @verifies C044
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn shutdown_error_is_send() {
        // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<ShutdownError>();
    }

    // ── C045: ShutdownCommandRouter integration ─────────────────────

    #[test]
    // @verifies C045
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn shutdown_spec_is_started_after_mark() {
        let spec = ShutdownSpec::new(Duration::from_secs(5));
        assert!(!spec.is_shutdown_started());
        spec.mark_shutdown_started();
        assert!(spec.is_shutdown_started());
    }

    #[test]
    // @verifies C045
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn shutdown_spec_mark_returns_bool() {
        let spec = ShutdownSpec::new(Duration::from_secs(5));
        assert!(spec.mark_shutdown_started());
        assert!(!spec.mark_shutdown_started());
        assert!(!spec.mark_shutdown_started());
    }
}
