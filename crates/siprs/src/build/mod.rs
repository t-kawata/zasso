
// Build and CI/CD module declarations.
//
// This module documents the build strategy, OS dependency resolution,
// and CI/CD pipeline configuration.
//
// [::TICKET::] P1-4: build module declared.
//   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`

pub mod build_strategy_os_deps;
pub mod cicd_docker_prebuilt;
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
