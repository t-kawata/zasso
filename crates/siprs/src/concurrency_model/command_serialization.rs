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
//   - NODE_ID=N0015:  §7.2 command serialization
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0015 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::STUB::] P4-9: RuntimeCommand handler implementations are stubbed.
// This file defines the enum skeleton and the core reactor dispatch;
// each variant's execution logic will be implemented in P4-9.

/// Commands serialized through the core reactor via unbounded MPSC channel.
///
/// Each variant will carry a `oneshot::Sender` for the command result.
/// Full sender/receiver wiring will use `tokio::sync::mpsc` + `oneshot`
/// when tokio is added as a dependency (P4-9).
///
/// [::STUB::] P4-9: replace placeholder `()` reply types with
/// `tokio::sync::oneshot::Sender<Result<..., SipError>>`.
#[derive(Debug)]
pub enum RuntimeCommand {
    Initialize {
        config: (),
        reply: (),
    },
    AddAccount {
        config: (),
        reply: (),
    },
    RemoveAccount {
        account_id: (),
        reply: (),
    },
    SetRegistration {
        account_id: (),
        enabled: bool,
        reply: (),
    },
    MakeCall {
        account_id: (),
        request: (),
        reply: (),
    },
    Hangup {
        call_id: (),
        reason: (),
        reply: (),
    },
    Hold {
        call_id: (),
        reply: (),
    },
    Unhold {
        call_id: (),
        reply: (),
    },
    SendDtmf {
        call_id: (),
        digits: String,
        method: (),
        reply: (),
    },
    Shutdown {
        reply: (),
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_command_is_debug() {
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_debug::<RuntimeCommand>();
    }

    #[test]
    fn runtime_command_has_ten_variants() {
        let variants = vec![
            RuntimeCommand::Initialize {
                config: (),
                reply: (),
            },
            RuntimeCommand::AddAccount {
                config: (),
                reply: (),
            },
            RuntimeCommand::RemoveAccount {
                account_id: (),
                reply: (),
            },
            RuntimeCommand::SetRegistration {
                account_id: (),
                enabled: true,
                reply: (),
            },
            RuntimeCommand::MakeCall {
                account_id: (),
                request: (),
                reply: (),
            },
            RuntimeCommand::Hangup {
                call_id: (),
                reason: (),
                reply: (),
            },
            RuntimeCommand::Hold {
                call_id: (),
                reply: (),
            },
            RuntimeCommand::Unhold {
                call_id: (),
                reply: (),
            },
            RuntimeCommand::SendDtmf {
                call_id: (),
                digits: "1".into(),
                method: (),
                reply: (),
            },
            RuntimeCommand::Shutdown { reply: () },
        ];
        assert_eq!(variants.len(), 10);
    }
}
