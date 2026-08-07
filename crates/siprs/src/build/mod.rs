// Build-strategy and CI/CD module.
//
// Sub-modules:
// - cicd_docker_prebuilt:  §44 CI/CD matrix, Docker Integration, Prebuilt Pipeline (N0054, P1-3)
// - build_strategy_os_deps: §28 Build Strategy & OS Dependencies (N0039, P10-2)
// - build_script_bindgen:   §27/§28 bindgen pipeline shared logic (P11-5) — included by
//   build.rs via `#[path]` and compiled here so `cargo test` can cover it.

pub mod build_strategy_os_deps;
// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
pub mod cicd_docker_prebuilt;
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
pub mod build_script_bindgen;
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
