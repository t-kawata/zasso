
//! Round-4 ticket structure and phase assignment (§62.43 / N0112).
//!
//! Records the round-4 ticket split required by design brief §5.5: phase 18
//! holds Ticket A (consumer/bindgen alignment) and Ticket B (producer, prebuilt,
//! CI, commit) in parallel, and phase 19+ chains the gap tickets (H8, H13, H14,
//! H15, EXAMPLES) in order (user directive: A/B first, gaps after).

/// The 7 round-4 tickets (§62.43 / N0112).
///
/// Phase 18: Ticket A (consumer/bindgen alignment) and Ticket B (producer,
/// prebuilt, CI, commit) are the highest-priority, parallelizable tickets.
/// Phase 19+: H8, H13, H14, H15, EXAMPLES gap tickets follow in order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Round4TicketSpec {
    /// Ticket A — consumer/bindgen alignment (P18-1, §62.31–62.35).
    TicketAConsumerBindgen,
    /// Ticket B — producer/prebuilt + CI + commit (P18-2, §62.36–62.37).
    TicketBProducerPrebuilt,
    /// H8 — raw SIP real PJSIP verification path (P19-1, §62.38).
    H8RawSipIntegration,
    /// H8 — on_ice_transport_error registration (P19-2, §62.39).
    H8IceTransportError,
    /// H13 — push_media_frame production wiring (P19-3, §62.40).
    H13PushMediaFrame,
    /// H14 — RustMediaPort conf-bridge re-registration on AddAudioSource (P19-4, §62.41).
    H14ConfBridgeReregister,
    /// H15 / EXAMPLES — real-PJSIP protocol + RTP integration tests (P19-5, §62.42).
    H15ExamplesRealPjsip,
}

impl Round4TicketSpec {
    /// The Tickets.json ticket key for this round-4 ticket.
    pub fn ticket_key(self) -> &'static str {
        match self {
            Round4TicketSpec::TicketAConsumerBindgen => "P18-1",
            Round4TicketSpec::TicketBProducerPrebuilt => "P18-2",
            Round4TicketSpec::H8RawSipIntegration => "P19-1",
            Round4TicketSpec::H8IceTransportError => "P19-2",
            Round4TicketSpec::H13PushMediaFrame => "P19-3",
            Round4TicketSpec::H14ConfBridgeReregister => "P19-4",
            Round4TicketSpec::H15ExamplesRealPjsip => "P19-5",
        }
    }

    /// The phase this ticket is assigned to (§62.43): 18 for A/B, 19 for gaps.
    pub fn phase(self) -> u16 {
        match self {
            Round4TicketSpec::TicketAConsumerBindgen
            | Round4TicketSpec::TicketBProducerPrebuilt => 18,
            Round4TicketSpec::H8RawSipIntegration
            | Round4TicketSpec::H8IceTransportError
            | Round4TicketSpec::H13PushMediaFrame
            | Round4TicketSpec::H14ConfBridgeReregister
            | Round4TicketSpec::H15ExamplesRealPjsip => 19,
        }
    }

    /// The RFC §62 subsection(s) this ticket resolves (e.g. "62.31–62.35").
    pub fn section(self) -> &'static str {
        match self {
            Round4TicketSpec::TicketAConsumerBindgen => "62.31–62.35",
            Round4TicketSpec::TicketBProducerPrebuilt => "62.36–62.37",
            Round4TicketSpec::H8RawSipIntegration => "62.38",
            Round4TicketSpec::H8IceTransportError => "62.39",
            Round4TicketSpec::H13PushMediaFrame => "62.40",
            Round4TicketSpec::H14ConfBridgeReregister => "62.41",
            Round4TicketSpec::H15ExamplesRealPjsip => "62.42",
        }
    }
}

/// The §62.43 ticket ordering: A/B first (phase 18), gap tickets after (phase 19+).
pub fn round4_ticket_ordering() -> [Round4TicketSpec; 7] {
    [
        Round4TicketSpec::TicketAConsumerBindgen,
        Round4TicketSpec::TicketBProducerPrebuilt,
        Round4TicketSpec::H8RawSipIntegration,
        Round4TicketSpec::H8IceTransportError,
        Round4TicketSpec::H13PushMediaFrame,
        Round4TicketSpec::H14ConfBridgeReregister,
        Round4TicketSpec::H15ExamplesRealPjsip,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::architecture::round4_scope_rootcause::{
        is_round4_scope_target, ROUND4_SCOPE_TARGETS,
    };

    #[test]
    fn round4_scope_targets_are_settled() {
        assert_eq!(ROUND4_SCOPE_TARGETS.len(), 9);
        for target in ROUND4_SCOPE_TARGETS {
            assert!(
                is_round4_scope_target(target),
                "missing scope target {target}"
            );
        }
        assert!(!is_round4_scope_target(
            "src/architecture/io_boundary_round3.rs"
        ));
        assert!(!is_round4_scope_target(
            "src/architecture/round3_scope_rootcause.rs"
        ));
    }

    #[test]
    fn round4_tickets_map_to_sections() {
        let ordering = round4_ticket_ordering();
        assert_eq!(ordering.len(), 7);
        let keys: Vec<&str> = ordering.iter().map(|t| t.ticket_key()).collect();
        assert_eq!(
            keys,
            vec!["P18-1", "P18-2", "P19-1", "P19-2", "P19-3", "P19-4", "P19-5"]
        );
        for ticket in ordering {
            let sec = ticket.section();
            assert!(sec.starts_with("62."), "section must be 62.x: {sec}");
        }
    }

    #[test]
    fn ab_tickets_first_then_gaps() {
        let ordering = round4_ticket_ordering();
        assert_eq!(ordering.len(), 7);
        assert_eq!(ordering[0].phase(), 18);
        assert_eq!(ordering[1].phase(), 18);
        assert_eq!(ordering[0].ticket_key(), "P18-1");
        assert_eq!(ordering[1].ticket_key(), "P18-2");
        for ticket in &ordering[2..] {
            assert_eq!(ticket.phase(), 19);
        }
        let phases: Vec<u16> = ordering.iter().map(|t| t.phase()).collect();
        assert!(phases.windows(2).all(|w| w[0] <= w[1]));
    }
}
