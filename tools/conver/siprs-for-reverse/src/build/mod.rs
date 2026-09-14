// Build-strategy and CI/CD module.
//
// Sub-modules:
// - cicd_docker_prebuilt:  §44 CI/CD matrix, Docker Integration, Prebuilt Pipeline (N0054, P1-3)
// - build_strategy_os_deps: §28 Build Strategy & OS Dependencies (N0039, P10-2)
// - build_script_bindgen:   §27/§28 bindgen pipeline shared logic (P11-5) — included by
//   build.rs via `#[path]` and compiled here so `cargo test` can cover it.
// - vendored_pjsip_strategy: §62.32 vendored PJSIP 2.17.0 version strategy (N0101, P18-1)
// - bindgen_enum_generation: §62.33 bindgen enum/constant generation strategy (N0102, P18-1)
// - static_link_strategy:    §62.34 static link-set derivation strategy (N0103, P18-1)
// - build_rs_resolution:     §62.35 build.rs 4-stage resolution pipeline (N0104, P18-1)
// - prebuilt_producer:       §62.36 producer tool design model — host/target set, verify predicates (N0105, P18-2)
// - prebuilt_ci_commit:      §62.37 3-OS CI matrix + direct prebuilt commit model (N0106, P18-2)

pub mod build_strategy_os_deps;
pub mod cicd_docker_prebuilt;
pub mod build_script_bindgen;
pub mod vendored_pjsip_strategy;
pub mod bindgen_enum_generation;
pub mod static_link_strategy;
pub mod build_rs_resolution;
pub mod prebuilt_producer;
pub mod prebuilt_ci_commit;
