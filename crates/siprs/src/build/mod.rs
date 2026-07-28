
// Build-strategy and CI/CD module.
//
// Sub-modules:
// - cicd_docker_prebuilt:  §44 CI/CD matrix, Docker Integration, Prebuilt Pipeline (N0054, P1-3)
// - build_strategy_os_deps: §28 Build Strategy & OS Dependencies (N0039, P3-2)

pub mod cicd_docker_prebuilt;
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
