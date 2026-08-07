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
//   - NODE_ID=N0030:  §21 Audio Format Model & AudioChunkPair
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0030 --hops=2)
//   - NODE_ID=N0035:  §25 IN/OUT Pair Alignment Algorithm
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0035 --hops=2)
//   - NODE_ID=N0036:  §26 Resampler Design & Stereo Mapping
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0036 --hops=2)
//   - NODE_ID=N0040:  §29 Codec Policy & Fallback Rules
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0040 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
/// Higher-level audio orchestration — composes the model/ audio primitives
/// (AudioFormat, AudioChunkPair, PairAligner, ResamplePipeline) and the
/// config/ codec policy types (NegotiatedCodec, CodecSelectionPolicy) into a
/// usable align → resample → codec-policy pipeline.
// [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
pub mod pipeline;

// [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
pub use pipeline::{AudioOrchestrationError, AudioPipeline, AudioPipelineConfig, ProcessedFrame};
