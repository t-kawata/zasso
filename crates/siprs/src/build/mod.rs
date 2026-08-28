// Build-strategy and CI/CD module.
//
// Sub-modules:
// - cicd_docker_prebuilt:  §44 CI/CD matrix, Docker Integration, Prebuilt Pipeline (N0054, P1-3)
// - build_strategy_os_deps: §28 Build Strategy & OS Dependencies (N0039, P10-2)
// - build_script_bindgen:   §27/§28 bindgen pipeline shared logic (P11-5) — included by
//   build.rs via `#[path]` and compiled here so `cargo test` can cover it.
// - vendored_pjsip_strategy: §62.32 vendored PJSIP 2.17.0 version strategy (N0101, P18-1)
// - bindgen_enum_generation: §62.33 bindgen enum/const generation strategy (N0102, P18-1)
// - static_link_strategy:    §62.34 static link-set derivation strategy (N0103, P18-1)
// - build_rs_resolution:     §62.35 build.rs 4-stage resolution pipeline (N0104, P18-1)

pub mod build_strategy_os_deps;
// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
pub mod cicd_docker_prebuilt;
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
pub mod build_script_bindgen;
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
pub mod vendored_pjsip_strategy;
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
pub mod bindgen_enum_generation;
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
pub mod static_link_strategy;
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
pub mod build_rs_resolution;
