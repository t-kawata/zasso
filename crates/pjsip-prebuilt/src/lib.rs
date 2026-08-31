//! Producer for vendored PJSIP prebuilt libraries (§62.36).
//!
//! Standalone crate, fully independent of the siprs crate. It builds PJSIP
//! 2.17.0 from `crates/siprs/vendor/pjsip` via CMake (host) or a committed
//! Dockerfile (Linux-from-Mac), stages the result into
//! `crates/siprs/vendor/prebuilt/<triple>/{include,lib}`, and verifies it with
//! `file` + `nm` + a minimal C link test (§62.36 Q16).
//!
//! Reads as prose: "detect the host OS, derive the §5.6 target set, build each
//! target with CMake or Docker, stage the install tree into vendor/prebuilt,
//! then verify the staged layout with file/nm/C-link."
//!
//! [::TICKET::] P18-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-2 --for-spec --no-implementation-order`

use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command as ProcessCommand;

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

/// Docker image tag for the Linux-from-Mac build container (§62.36 Q14).
pub const DOCKER_IMAGE: &str = "pjsip-prebuilt";
/// CMake flag that disables the video pipeline (RFC §28.3, mandatory).
pub const PJMEDIA_WITH_VIDEO_FLAG: &str = "-DPJMEDIA_WITH_VIDEO=OFF";
/// Release build type for reproducible prebuilt artifacts.
pub const CMAKE_BUILD_TYPE_FLAG: &str = "-DCMAKE_BUILD_TYPE=Release";
/// Disable OpenSSL-based SRTP so the build does not require a libsrtp install.
pub const SRTP_WITH_OPENSSL_FLAG: &str = "-DSRTP_WITH_OPENSSL=OFF";
/// Repo-root-relative path to the GitHub Actions workflow (repo root `.github`).
pub const PREBUILT_WORKFLOW_REL: &str = ".github/workflows/prebuilt.yml";
/// Repo-root-relative manifest path used by the CI workflow.
pub const PREBUILT_MANIFEST_REL: &str = "crates/pjsip-prebuilt/Cargo.toml";

/// A C source that links against the staged pjsua-lib and calls `pjsua_init`.
const LINK_TEST_C_SOURCE: &str = r#"#include <pjsua-lib/pjsua.h>
int main(void) { pj_status_t st = pjsua_init(); return st == PJ_SUCCESS ? 0 : 1; }
"#;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/// Host operating systems mapped by the §5.6 producer table.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostOs {
    MacOs,
    Windows,
    Linux,
    Unsupported,
}

impl HostOs {
    /// Normalizes `std::env::consts::OS`.
    pub fn from_std(os: &str) -> Self {
        match os {
            "macos" => Self::MacOs,
            "windows" => Self::Windows,
            "linux" => Self::Linux,
            _ => Self::Unsupported,
        }
    }
}

/// A rustc target triple such as `x86_64-unknown-linux-gnu`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TargetTriple(pub String);

impl From<&str> for TargetTriple {
    fn from(value: &str) -> Self {
        Self(value.to_owned())
    }
}

/// CPU architecture detected from a `file` output string.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Arch {
    Arm64,
    X86_64,
}

/// Machine format detected by the `file` command (§62.36 Q16 stage 1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MachineKind {
    MachO(Arch),
    Elf(Arch),
    Pe(Arch),
}

/// Fail-stop error for the producer pipeline (§5.3: no silent fallback).
#[derive(Debug)]
pub enum ProducerError {
    UnsupportedHost(String),
    UnsupportedTriple(String),
    Usage(String),
    CmakeFailed { triple: String, status: i32 },
    DockerFailed(i32),
    BuildOutputMissing(PathBuf),
    StagedLibMissing(PathBuf),
    VendorSourceMissing(PathBuf),
    Verify(VerifyFailure),
    Io(std::io::Error),
}

impl fmt::Display for ProducerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedHost(os) => write!(f, "unsupported host OS: {os}"),
            Self::UnsupportedTriple(triple) => write!(f, "unsupported target triple: {triple}"),
            Self::Usage(msg) => write!(f, "{msg}"),
            Self::CmakeFailed { triple, status } => {
                write!(f, "cmake failed for {triple} (exit {status})")
            }
            Self::DockerFailed(status) => write!(f, "docker failed (exit {status})"),
            Self::BuildOutputMissing(path) => write!(f, "build output missing at {path:?}"),
            Self::StagedLibMissing(path) => write!(f, "staged library missing under {path:?}"),
            Self::VendorSourceMissing(path) => write!(f, "vendored source missing at {path:?}"),
            Self::Verify(e) => write!(f, "{e}"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
        }
    }
}

impl std::error::Error for ProducerError {}

impl From<std::io::Error> for ProducerError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<VerifyFailure> for ProducerError {
    fn from(value: VerifyFailure) -> Self {
        Self::Verify(value)
    }
}

/// A staged artifact failed one of the three verify stages (§62.36 Q16).
#[derive(Debug)]
pub enum VerifyFailure {
    StageMissing(PathBuf),
    WrongArchitecture {
        expected: MachineKind,
        actual: MachineKind,
    },
    SymbolMissing(&'static str),
    CLinkTestFailed(i32),
    Io(std::io::Error),
}

impl fmt::Display for VerifyFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::StageMissing(path) => write!(f, "stage not present at {path:?}"),
            Self::WrongArchitecture { expected, actual } => {
                write!(f, "wrong architecture: expected {expected:?}, found {actual:?}")
            }
            Self::SymbolMissing(symbol) => write!(f, "required symbol {symbol} missing from nm output"),
            Self::CLinkTestFailed(status) => write!(f, "C link test failed (exit {status})"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
        }
    }
}

impl std::error::Error for VerifyFailure {}

impl From<std::io::Error> for VerifyFailure {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

/// CLI subcommands (§62.36 Q13 shape + §62.37 build-all/verify-all).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    Build { triple: TargetTriple },
    BuildAll,
    Stage { triple: TargetTriple },
    StageAll,
    Verify { triple: TargetTriple },
    VerifyAll,
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/// Repository root — the producer lives at `crates/pjsip-prebuilt`, two levels
/// below the repo root (the zasso monorepo).
pub fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..")
}

/// The producer crate directory (holds the committed Dockerfile).
pub fn crate_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// `crates/siprs/vendor` — the vendored PJSIP source and prebuilt target tree.
pub fn siprs_vendor_dir() -> PathBuf {
    repo_root().join("crates").join("siprs").join("vendor")
}

/// `crates/siprs/vendor/pjsip` — the PJSIP 2.17.0 source with CMakeLists.txt.
pub fn vendored_pjsip_dir() -> PathBuf {
    siprs_vendor_dir().join("pjsip")
}

/// `crates/siprs/vendor/prebuilt` — the staged prebuilt target tree.
pub fn prebuilt_root() -> PathBuf {
    siprs_vendor_dir().join("prebuilt")
}

/// The repo-root workflow file the CI runs.
pub fn prebuilt_workflow_path() -> PathBuf {
    repo_root().join(PREBUILT_WORKFLOW_REL)
}

// ---------------------------------------------------------------------------
// Host detection and target set (§5.6)
// ---------------------------------------------------------------------------

/// Detects the host triple from `rustc -vV`.
pub fn detect_host_triple() -> Result<TargetTriple, ProducerError> {
    let output = ProcessCommand::new("rustc").arg("-vV").output()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let host = stdout
        .lines()
        .find_map(|line| line.strip_prefix("host: "))
        .ok_or_else(|| ProducerError::UnsupportedHost("rustc -vV produced no host: line".to_owned()))?;
    Ok(TargetTriple::from(host))
}

/// The §5.6 target set for the current host.
pub fn target_set_for_host(host: &HostOs) -> Result<Vec<TargetTriple>, ProducerError> {
    let host_triple = detect_host_triple()?;
    target_set_for_host_on(host, &host_triple)
}

/// The §5.6 target set for a host with an explicit host triple (testable).
pub fn target_set_for_host_on(
    host: &HostOs,
    host_triple: &TargetTriple,
) -> Result<Vec<TargetTriple>, ProducerError> {
    match host {
        HostOs::MacOs => Ok(vec![
            host_triple.clone(),
            TargetTriple::from("x86_64-unknown-linux-gnu"),
        ]),
        HostOs::Windows => Ok(vec![TargetTriple::from("x86_64-pc-windows-msvc")]),
        HostOs::Linux => Ok(vec![TargetTriple::from("x86_64-unknown-linux-gnu")]),
        HostOs::Unsupported => Err(ProducerError::UnsupportedHost(std::env::consts::OS.to_owned())),
    }
}

/// Whether the triple is one of the §5.6 target set entries.
pub fn is_supported_target(triple: &TargetTriple) -> bool {
    matches!(
        triple.0.as_str(),
        "aarch64-apple-darwin"
            | "x86_64-apple-darwin"
            | "x86_64-unknown-linux-gnu"
            | "x86_64-pc-windows-msvc"
    )
}

// ---------------------------------------------------------------------------
// CMake / Docker command construction
// ---------------------------------------------------------------------------

/// Builds the `cmake -S <source> -B <build>` argument vector (§28.3 flags).
pub fn cmake_build_args(
    triple: &TargetTriple,
    source: &Path,
    build: &Path,
) -> Result<Vec<String>, ProducerError> {
    if !source.join("CMakeLists.txt").is_file() {
        return Err(ProducerError::VendorSourceMissing(source.to_path_buf()));
    }
    let install = build.join("install");
    let mut args = vec![
        "-S".to_owned(),
        source.display().to_string(),
        "-B".to_owned(),
        build.display().to_string(),
        format!("-DCMAKE_INSTALL_PREFIX={}", install.display()),
        PJMEDIA_WITH_VIDEO_FLAG.to_owned(),
        CMAKE_BUILD_TYPE_FLAG.to_owned(),
        SRTP_WITH_OPENSSL_FLAG.to_owned(),
    ];
    if triple.0.contains("windows") {
        args.extend([
            "-G".to_owned(),
            "Visual Studio 17 2022".to_owned(),
            "-A".to_owned(),
            "x64".to_owned(),
        ]);
    }
    Ok(args)
}

/// Constructs the `cmake` command for a host build.
pub fn cmake_build_command(
    triple: &TargetTriple,
    source: &Path,
    build: &Path,
) -> Result<ProcessCommand, ProducerError> {
    let args = cmake_build_args(triple, source, build)?;
    let mut cmd = ProcessCommand::new("cmake");
    cmd.args(&args);
    Ok(cmd)
}

/// Argument vector for `docker build -t pjsip-prebuilt <crate_dir>`.
pub fn docker_build_args(crate_dir: &Path) -> Vec<String> {
    vec![
        "build".to_owned(),
        "-t".to_owned(),
        DOCKER_IMAGE.to_owned(),
        crate_dir.display().to_string(),
    ]
}

/// Argument vector for `docker run --rm -v <vendor>:/work/vendor ...`.
pub fn docker_run_args(vendor_dir: &Path) -> Vec<String> {
    vec![
        "run".to_owned(),
        "--rm".to_owned(),
        "-v".to_owned(),
        format!("{}:/work/vendor", vendor_dir.display()),
        DOCKER_IMAGE.to_owned(),
        "cmake".to_owned(),
        "-S".to_owned(),
        "/work/vendor/pjsip".to_owned(),
        "-B".to_owned(),
        "/work/vendor/build".to_owned(),
        "-DCMAKE_INSTALL_PREFIX=/work/vendor/build/install".to_owned(),
        PJMEDIA_WITH_VIDEO_FLAG.to_owned(),
        CMAKE_BUILD_TYPE_FLAG.to_owned(),
    ]
}

/// Builds the `docker build` command (image build, §62.36 Q14).
pub fn docker_build_command(crate_dir: &Path) -> ProcessCommand {
    let args = docker_build_args(crate_dir);
    let mut cmd = ProcessCommand::new("docker");
    cmd.args(&args);
    cmd
}

/// Builds the `docker run` command (in-container cmake, volume-mounted vendor).
pub fn docker_run_command(vendor_dir: &Path) -> ProcessCommand {
    let args = docker_run_args(vendor_dir);
    let mut cmd = ProcessCommand::new("docker");
    cmd.args(&args);
    cmd
}

// ---------------------------------------------------------------------------
// Build orchestration
// ---------------------------------------------------------------------------

/// Builds one target and returns the install-tree directory.
pub fn build_for_target(triple: &TargetTriple, host: &HostOs) -> Result<PathBuf, ProducerError> {
    build_for_target_with(triple, host, &run_cmake_status, &run_docker_status)
}

/// Build orchestration with injected cmake/docker executors (testable core).
pub fn build_for_target_with(
    triple: &TargetTriple,
    host: &HostOs,
    cmake: &dyn Fn(&TargetTriple, &Path, &Path) -> Result<(), ProducerError>,
    docker: &dyn Fn(&Path) -> Result<(), ProducerError>,
) -> Result<PathBuf, ProducerError> {
    if !is_supported_target(triple) {
        return Err(ProducerError::UnsupportedTriple(triple.0.clone()));
    }
    let install_dir = install_dir_for(triple, host);
    if is_linux_from_mac(host, triple) {
        docker(&crate_dir())?;
        docker(&siprs_vendor_dir())?;
    } else {
        cmake(triple, &vendored_pjsip_dir(), &build_dir_for(triple))?;
    }
    Ok(install_dir)
}

fn run_cmake_status(triple: &TargetTriple, source: &Path, build: &Path) -> Result<(), ProducerError> {
    let mut cmd = cmake_build_command(triple, source, build)?;
    let status = cmd.status().map_err(ProducerError::Io)?;
    if status.success() {
        Ok(())
    } else {
        Err(ProducerError::CmakeFailed {
            triple: triple.0.clone(),
            status: status.code().unwrap_or(-1),
        })
    }
}

fn run_docker_status(path: &Path) -> Result<(), ProducerError> {
    let status = ProcessCommand::new("docker")
        .arg("build")
        .arg("-t")
        .arg(DOCKER_IMAGE)
        .arg(path)
        .status()
        .map_err(ProducerError::Io)?;
    if status.success() {
        Ok(())
    } else {
        Err(ProducerError::DockerFailed(status.code().unwrap_or(-1)))
    }
}

fn is_linux_from_mac(host: &HostOs, triple: &TargetTriple) -> bool {
    *host == HostOs::MacOs && triple.0.contains("unknown-linux")
}

fn build_dir_for(triple: &TargetTriple) -> PathBuf {
    prebuilt_root().join(".build").join(&triple.0)
}

fn install_dir_for(triple: &TargetTriple, host: &HostOs) -> PathBuf {
    if is_linux_from_mac(host, triple) {
        siprs_vendor_dir().join("build").join("install")
    } else {
        build_dir_for(triple).join("install")
    }
}

/// Stages a built target's install tree into `vendor/prebuilt/<triple>`.
pub fn stage_built_target(triple: &TargetTriple, host: &HostOs) -> Result<(), ProducerError> {
    let install = install_dir_for(triple, host);
    stage_to_vendor(triple, &install, &prebuilt_root())
}

/// Builds and stages every §5.6 target for the host.
pub fn build_all(host: &HostOs) -> Result<(), ProducerError> {
    for triple in target_set_for_host(host)? {
        build_for_target(&triple, host)?;
        stage_built_target(&triple, host)?;
    }
    Ok(())
}

/// Verifies every staged §5.6 target for the host.
pub fn verify_all(host: &HostOs) -> Result<(), ProducerError> {
    for triple in target_set_for_host(host)? {
        verify_staged(&prebuilt_root().join(&triple.0), &triple)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Staging and layout validation
// ---------------------------------------------------------------------------

/// Copies the build install tree's `include`/`lib` into `vendor/prebuilt/<triple>`.
pub fn stage_to_vendor(
    triple: &TargetTriple,
    build_dir: &Path,
    prebuilt_root: &Path,
) -> Result<(), ProducerError> {
    if !build_dir.join("include").is_dir() || !build_dir.join("lib").is_dir() {
        return Err(ProducerError::BuildOutputMissing(build_dir.to_path_buf()));
    }
    let staged = prebuilt_root.join(&triple.0);
    let staged_lib = staged.join("lib");
    let staged_include = staged.join("include");
    std::fs::create_dir_all(&staged_lib)?;
    std::fs::create_dir_all(&staged_include)?;
    copy_tree(&build_dir.join("include"), &staged_include)?;
    copy_tree(&build_dir.join("lib"), &staged_lib)?;
    Ok(())
}

/// Copies a directory tree recursively.
fn copy_tree(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !src.is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_tree(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Staged-layout invariant: `include/pjsua.h` + a non-empty `lib/` with pjsua libs.
pub fn validate_staged_layout(staged: &Path) -> Result<(), ProducerError> {
    let include = staged.join("include");
    if !include.join("pjsua.h").is_file() {
        return Err(ProducerError::StagedLibMissing(include));
    }
    let lib = staged.join("lib");
    let has_library = std::fs::read_dir(&lib)
        .map(|entries| {
            entries.flatten().any(|entry| {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                is_pjsua_library_name(&name)
            })
        })
        .unwrap_or(false);
    if !has_library {
        return Err(ProducerError::StagedLibMissing(lib));
    }
    Ok(())
}

/// Whether an archive file name is a PJSIP static library.
///
/// Accepts both the Unix naming (`libpjsua-lib.a`, `libpjproject.a`) and the
/// MSVC naming (`pjsua-lib.lib`) so the staged-layout invariant holds on all
/// three §5.6 targets.
fn is_pjsua_library_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    (lower.starts_with("libpjsua") || lower.starts_with("pjsua") || lower.starts_with("libpjproject"))
        && (lower.ends_with(".a") || lower.ends_with(".lib"))
}

// ---------------------------------------------------------------------------
// Verify predicates (§62.36 Q16)
// ---------------------------------------------------------------------------

/// Parses a `file` output line into a machine kind.
pub fn parse_file_output(output: &str) -> MachineKind {
    let lower = output.to_ascii_lowercase();
    let arch = if lower.contains("arm64") || lower.contains("aarch64") {
        Arch::Arm64
    } else {
        Arch::X86_64
    };
    if lower.contains("mach-o") {
        MachineKind::MachO(arch)
    } else if lower.contains("elf") {
        MachineKind::Elf(arch)
    } else {
        MachineKind::Pe(arch)
    }
}

/// Whether `nm` output exposes the required PJSIP entry symbols.
pub fn nm_output_has_pjsua_symbols(output: &str) -> bool {
    output.contains("pjsua_init") || output.contains("pj_init")
}

/// The machine kind a staged triple must link to.
pub fn expected_machine_kind(triple: &TargetTriple) -> MachineKind {
    if triple.0.contains("apple") {
        let arch = if triple.0.starts_with("aarch64") {
            Arch::Arm64
        } else {
            Arch::X86_64
        };
        MachineKind::MachO(arch)
    } else if triple.0.contains("windows") {
        MachineKind::Pe(Arch::X86_64)
    } else {
        MachineKind::Elf(Arch::X86_64)
    }
}

/// Derives sorted `-l` stems from a staged `lib/` directory.
///
/// Handles both the Unix `lib<name>.a` and the MSVC `<name>.lib` naming, so the
/// CMake C link test works on every §5.6 target.
pub fn link_test_lib_stems(lib_dir: &Path) -> Vec<String> {
    let mut stems: Vec<String> = std::fs::read_dir(lib_dir)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|entry| {
                    let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                    let unprefixed = name.strip_prefix("lib").unwrap_or(&name);
                    unprefixed
                        .strip_suffix(".a")
                        .or_else(|| unprefixed.strip_suffix(".lib"))
                        .map(|stem| stem.to_owned())
                })
                .collect()
        })
        .unwrap_or_default();
    stems.sort();
    stems.dedup();
    stems
}

/// System libraries a staged triple must link against (RFC §28.4).
pub fn system_libs_for(triple: &TargetTriple) -> Vec<&'static str> {
    if triple.0.contains("apple") {
        vec!["m", "pthread", "dl", "resolv", "iconv"]
    } else if triple.0.contains("windows") {
        vec!["ws2_32", "ole32", "userenv", "winmm", "iphlpapi", "crypt32"]
    } else {
        vec!["asound", "ssl", "crypto", "uuid", "pthread", "m", "dl", "rt"]
    }
}

/// Runs the three-stage verify: nm symbols, C link test, file machine format.
pub fn verify_staged(staged: &Path, triple: &TargetTriple) -> Result<(), VerifyFailure> {
    validate_staged_layout(staged).map_err(|_| VerifyFailure::StageMissing(staged.to_path_buf()))?;

    // Stage 2: nm symbol check on the pjsua-lib archive.
    let nm_out = ProcessCommand::new("nm")
        .arg("-g")
        .arg(staged.join("lib").join("libpjsua-lib.a"))
        .output()?;
    if !nm_output_has_pjsua_symbols(&String::from_utf8_lossy(&nm_out.stdout)) {
        return Err(VerifyFailure::SymbolMissing("pjsua_init"));
    }

    // Stage 3: minimal C link test driven by CMake. CMake selects the platform
    // compiler (MSVC `cl` on Windows, `cc` on Unix) and resolves static-lib
    // circular references with LINK_GROUP:RESCAN on GNU linkers, so the same
    // verify runs on all three CI runners (§62.36 Q16).
    let work = write_c_link_test(staged, triple)?;
    let build_dir = work.join("build");
    let configure_status = ProcessCommand::new("cmake")
        .arg("-S")
        .arg(&work)
        .arg("-B")
        .arg(&build_dir)
        .status()?;
    if !configure_status.success() {
        return Err(VerifyFailure::CLinkTestFailed(configure_status.code().unwrap_or(-1)));
    }
    let build_status = ProcessCommand::new("cmake")
        .arg("--build")
        .arg(&build_dir)
        .status()?;
    if !build_status.success() {
        return Err(VerifyFailure::CLinkTestFailed(build_status.code().unwrap_or(-1)));
    }
    let c_bin = linked_test_binary(&build_dir);
    let run_status = ProcessCommand::new(&c_bin).status()?;
    if !run_status.success() {
        return Err(VerifyFailure::CLinkTestFailed(run_status.code().unwrap_or(-1)));
    }

    // Stage 1: file machine format on the linked binary (wrong-arch detection).
    let expected = expected_machine_kind(triple);
    let file_out = ProcessCommand::new("file").arg(&c_bin).output()?;
    let actual = parse_file_output(&String::from_utf8_lossy(&file_out.stdout));
    if actual != expected {
        return Err(VerifyFailure::WrongArchitecture { expected, actual });
    }
    Ok(())
}

/// Writes `link_test.c` + `CMakeLists.txt` into a scratch dir and returns it.
fn write_c_link_test(staged: &Path, triple: &TargetTriple) -> Result<PathBuf, VerifyFailure> {
    let work = staged.join(".verify");
    std::fs::create_dir_all(&work)?;
    std::fs::write(work.join("link_test.c"), LINK_TEST_C_SOURCE)?;

    let include_dir = staged.join("include");
    let lib_dir = staged.join("lib");
    let link_args: Vec<String> = link_test_lib_stems(&lib_dir)
        .iter()
        .map(|stem| stem.to_owned())
        .chain(system_libs_for(triple).iter().map(|s| s.to_string()))
        .collect();
    let cmake = format!(
        "cmake_minimum_required(VERSION 3.24)\n\
         project(pjsip_link_test C)\n\
         add_executable(link_test link_test.c)\n\
         target_include_directories(link_test PRIVATE \"{include}\")\n\
         target_link_directories(link_test PRIVATE \"{lib}\")\n\
         target_link_libraries(link_test PRIVATE $<LINK_GROUP:RESCAN,{args}>)\n",
        include = include_dir.display(),
        lib = lib_dir.display(),
        args = link_args.join(","),
    );
    std::fs::write(work.join("CMakeLists.txt"), cmake)?;
    Ok(work)
}

/// The linked test binary path (`.exe` on Windows, plain name on Unix).
fn linked_test_binary(build_dir: &Path) -> PathBuf {
    let unix = build_dir.join("link_test");
    if unix.exists() {
        unix
    } else {
        build_dir.join("link_test.exe")
    }
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

/// Parses CLI arguments into a `Command` (§62.36 Q13 shape).
pub fn parse_command(args: &[String]) -> Result<Command, ProducerError> {
    match args.first().map(String::as_str) {
        Some("build") => Ok(Command::Build {
            triple: require_triple(args)?,
        }),
        Some("build-all") => Ok(Command::BuildAll),
        Some("stage") => Ok(Command::Stage {
            triple: require_triple(args)?,
        }),
        Some("stage-all") => Ok(Command::StageAll),
        Some("verify") => Ok(Command::Verify {
            triple: require_triple(args)?,
        }),
        Some("verify-all") => Ok(Command::VerifyAll),
        Some(other) => Err(ProducerError::Usage(format!("unknown subcommand: {other}"))),
        None => Err(ProducerError::Usage(
            "missing subcommand (build|build-all|stage|stage-all|verify|verify-all)".to_owned(),
        )),
    }
}

fn require_triple(args: &[String]) -> Result<TargetTriple, ProducerError> {
    args.get(1)
        .map(|triple| TargetTriple::from(triple.as_str()))
        .ok_or_else(|| {
            ProducerError::Usage(format!("missing <triple> for subcommand {}", args[0]))
        })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("p18-2-{}-{name}", std::process::id()))
    }

    // @verifies C143
    #[test]
    fn target_set_for_host_maps_per_design_brief_s5_6() {
        // C143 Precondition: host OS detection produces the §5.6 target set.
        let macos_set =
            target_set_for_host_on(&HostOs::MacOs, &TargetTriple::from("aarch64-apple-darwin"))
                .unwrap();
        assert!(macos_set.contains(&TargetTriple::from("aarch64-apple-darwin")));
        assert!(macos_set.contains(&TargetTriple::from("x86_64-unknown-linux-gnu")));

        let windows_set =
            target_set_for_host_on(&HostOs::Windows, &TargetTriple::from("x86_64-pc-windows-msvc"))
                .unwrap();
        assert_eq!(windows_set, vec![TargetTriple::from("x86_64-pc-windows-msvc")]);

        let linux_set =
            target_set_for_host_on(&HostOs::Linux, &TargetTriple::from("x86_64-unknown-linux-gnu"))
                .unwrap();
        assert!(linux_set.contains(&TargetTriple::from("x86_64-unknown-linux-gnu")));
    }

    #[test]
    fn unsupported_host_errors_out() {
        // C143 Precondition error path: unsupported host fails, never silently skips.
        let result = target_set_for_host_on(
            &HostOs::Unsupported,
            &TargetTriple::from("aarch64-apple-darwin"),
        );
        assert!(matches!(result, Err(ProducerError::UnsupportedHost(_))));
        assert_eq!(HostOs::from_std("freebsd"), HostOs::Unsupported);
    }

    #[test]
    fn stage_to_vendor_creates_layout_and_validate_passes() {
        // C143 Postcondition: stage produces vendor/prebuilt/<triple>/{include,lib}.
        let prebuilt_root = temp_dir("stage-root");
        let triple = TargetTriple::from("aarch64-apple-darwin");
        let build_dir = temp_dir("stage-build");
        std::fs::create_dir_all(build_dir.join("include")).unwrap();
        std::fs::write(build_dir.join("include/pjsua.h"), b"").unwrap();
        std::fs::create_dir_all(build_dir.join("lib")).unwrap();
        std::fs::write(build_dir.join("lib/libpjsua-lib.a"), b"").unwrap();

        stage_to_vendor(&triple, &build_dir, &prebuilt_root).unwrap();

        let staged_dir = prebuilt_root.join(&triple.0);
        assert!(staged_dir.join("lib/libpjsua-lib.a").exists());
        assert!(staged_dir.join("include/pjsua.h").exists());
        assert!(validate_staged_layout(&staged_dir).is_ok());
    }

    #[test]
    fn stage_to_vendor_rejects_missing_build_output() {
        // C143 Postcondition error: a build dir without include/lib must not stage.
        let prebuilt_root = temp_dir("stage-root-err");
        let triple = TargetTriple::from("aarch64-apple-darwin");
        let empty_build = temp_dir("stage-build-empty");
        std::fs::create_dir_all(&empty_build).unwrap();
        let result = stage_to_vendor(&triple, &empty_build, &prebuilt_root);
        assert!(matches!(result, Err(ProducerError::BuildOutputMissing(_))));
    }

    #[test]
    fn parse_file_output_detects_machine_kinds() {
        // C143 Postcondition: file output parsing for the 3 target machine formats.
        assert_eq!(
            parse_file_output("Mach-O 64-bit arm64 executable"),
            MachineKind::MachO(Arch::Arm64)
        );
        assert_eq!(
            parse_file_output("ELF 64-bit LSB shared object, x86-64"),
            MachineKind::Elf(Arch::X86_64)
        );
        assert_eq!(
            parse_file_output("PE32+ executable (console) x86-64"),
            MachineKind::Pe(Arch::X86_64)
        );
    }

    #[test]
    fn nm_output_detects_required_symbols() {
        // C143 Postcondition: nm output contains pjsua_init / pj_init.
        assert!(nm_output_has_pjsua_symbols("0000000000001234 T _pjsua_init"));
        assert!(nm_output_has_pjsua_symbols("0000000000001234 T _pj_init"));
        assert!(!nm_output_has_pjsua_symbols("0000000000001234 T _pj_strdup"));
    }

    // @verifies C143
    #[test]
    fn build_failure_returns_err_no_silent_fallback() {
        // C143 Invariant: fail-stop, no silent fallback.
        let triple = TargetTriple::from("x86_64-unknown-linux-gnu");
        let host = HostOs::Linux;
        let failing = |_: &TargetTriple, _: &Path, _: &Path| {
            Err(ProducerError::CmakeFailed {
                triple: triple.0.clone(),
                status: 1,
            })
        };
        let ok = |_: &Path| Ok(());
        let result = build_for_target_with(&triple, &host, &failing, &ok);
        assert!(matches!(result, Err(ProducerError::CmakeFailed { .. })));

        let unsupported = TargetTriple::from("arm-unknown-linux-gnueabi");
        let result = build_for_target_with(&unsupported, &host, &failing, &ok);
        assert!(matches!(result, Err(ProducerError::UnsupportedTriple(_))));
    }

    #[test]
    fn producer_manifest_has_no_siprs_dependency() {
        // C143 Invariant: producer is independent of siprs compile.
        let manifest = std::fs::read_to_string(crate_dir().join("Cargo.toml")).unwrap();
        let dependencies = manifest.split("[dependencies]").nth(1).unwrap_or("");
        assert!(
            !dependencies.contains("siprs"),
            "producer must not depend on siprs"
        );
    }

    // @verifies C144
    #[test]
    fn prebuilt_workflow_triggers_on_push_with_paths() {
        // C144 Precondition: workflow triggers on push to master/siprs with the two path globs.
        let yaml = std::fs::read_to_string(prebuilt_workflow_path())
            .unwrap_or_else(|e| panic!("cannot read {}: {e}", prebuilt_workflow_path().display()));
        assert!(yaml.contains("branches: [master, siprs]"));
        assert!(yaml.contains("crates/siprs/vendor/pjsip/**"));
        assert!(yaml.contains("crates/pjsip-prebuilt/**"));
    }

    #[test]
    fn prebuilt_workflow_runs_3os_matrix_build_verify_commit() {
        // C144 Postcondition: 3-OS matrix runs build-all + verify-all and commits directly.
        let yaml = std::fs::read_to_string(prebuilt_workflow_path())
            .unwrap_or_else(|e| panic!("cannot read {}: {e}", prebuilt_workflow_path().display()));
        assert!(yaml.contains("macos-latest"));
        assert!(yaml.contains("ubuntu-latest"));
        assert!(yaml.contains("windows-latest"));
        assert!(yaml.contains("-- build-all"));
        assert!(yaml.contains("-- verify-all"));
        assert!(yaml.contains("git-auto-commit-action@v5"));
    }

    // @verifies C144
    #[test]
    fn all_s5_6_targets_covered_by_host_mapping() {
        // C144 Invariant: the union of every host's §5.6 target set covers the target space.
        let all: std::collections::BTreeSet<_> = [
            target_set_for_host_on(&HostOs::MacOs, &TargetTriple::from("aarch64-apple-darwin"))
                .unwrap(),
            target_set_for_host_on(&HostOs::MacOs, &TargetTriple::from("x86_64-apple-darwin"))
                .unwrap(),
            target_set_for_host_on(&HostOs::Windows, &TargetTriple::from("x86_64-pc-windows-msvc"))
                .unwrap(),
            target_set_for_host_on(&HostOs::Linux, &TargetTriple::from("x86_64-unknown-linux-gnu"))
                .unwrap(),
        ]
        .into_iter()
        .flatten()
        .collect();
        for required in [
            "aarch64-apple-darwin",
            "x86_64-apple-darwin",
            "x86_64-unknown-linux-gnu",
            "x86_64-pc-windows-msvc",
        ] {
            assert!(
                all.contains(&TargetTriple::from(required)),
                "missing {required}"
            );
        }
    }

    #[test]
    fn staged_layout_invariant_rejects_empty_lib() {
        // C144 Invariant: a staged <triple>/{include,lib} with an empty lib/ is invalid.
        let staged = temp_dir("c144-empty");
        std::fs::create_dir_all(staged.join("include")).unwrap();
        std::fs::create_dir_all(staged.join("lib")).unwrap();
        std::fs::write(staged.join("include/pjsua.h"), b"").unwrap();
        assert!(validate_staged_layout(&staged).is_err());
    }

    #[test]
    fn parse_command_parses_all_subcommands() {
        // §62.36 Q13 shape + §62.37 build-all/verify-all.
        let build = parse_command(&["build".to_owned(), "aarch64-apple-darwin".to_owned()]).unwrap();
        assert!(matches!(build, Command::Build { triple } if triple.0 == "aarch64-apple-darwin"));
        assert!(matches!(
            parse_command(&["build-all".to_owned()]).unwrap(),
            Command::BuildAll
        ));
        assert!(matches!(
            parse_command(&["stage".to_owned(), "x86_64-pc-windows-msvc".to_owned()]).unwrap(),
            Command::Stage { .. }
        ));
        assert!(matches!(
            parse_command(&["verify-all".to_owned()]).unwrap(),
            Command::VerifyAll
        ));
        assert!(parse_command(&["frobnicate".to_owned()]).is_err());
        assert!(parse_command(&["build".to_owned()]).is_err());
        assert!(parse_command(&[]).is_err());
    }

    #[test]
    fn cmake_build_args_include_mandatory_flags() {
        // §28.3: PJMEDIA_WITH_VIDEO=OFF is mandatory.
        let source = temp_dir("cmake-src");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("CMakeLists.txt"), b"project(pjproject)").unwrap();
        let build = temp_dir("cmake-build");
        let args = cmake_build_args(
            &TargetTriple::from("x86_64-unknown-linux-gnu"),
            &source,
            &build,
        )
        .unwrap();
        assert!(args.iter().any(|a| a == PJMEDIA_WITH_VIDEO_FLAG));
        assert!(args.iter().any(|a| a == CMAKE_BUILD_TYPE_FLAG));
        assert!(args.iter().any(|a| a == SRTP_WITH_OPENSSL_FLAG));

        let windows_args = cmake_build_args(
            &TargetTriple::from("x86_64-pc-windows-msvc"),
            &source,
            &build,
        )
        .unwrap();
        assert!(windows_args.iter().any(|a| a == "Visual Studio 17 2022"));
        assert!(windows_args.iter().any(|a| a == "x64"));

        let missing = cmake_build_args(
            &TargetTriple::from("x86_64-unknown-linux-gnu"),
            &temp_dir("cmake-missing"),
            &build,
        );
        assert!(matches!(missing, Err(ProducerError::VendorSourceMissing(_))));
    }

    #[test]
    fn docker_args_mount_vendor_volume() {
        // §62.36 Q14: docker run mounts the host vendor dir into /work/vendor.
        let vendor = Path::new("/tmp/zasso-vendor");
        let run = docker_run_args(vendor);
        assert!(run.iter().any(|a| a == "-v"));
        assert!(run.iter().any(|a| a == "/tmp/zasso-vendor:/work/vendor"));
        assert!(run.iter().any(|a| a == "-S"));
        assert!(run.iter().any(|a| a == "/work/vendor/pjsip"));
    }

    #[test]
    fn link_test_lib_stems_derives_sorted_stems() {
        let lib = temp_dir("lib-stems");
        std::fs::create_dir_all(&lib).unwrap();
        std::fs::write(lib.join("libpjsip.a"), b"").unwrap();
        std::fs::write(lib.join("libpjmedia.a"), b"").unwrap();
        std::fs::write(lib.join("libpjlib.a"), b"").unwrap();
        std::fs::write(lib.join("libpjproject.a"), b"").unwrap();
        let stems = link_test_lib_stems(&lib);
        assert_eq!(stems, vec!["pjlib", "pjmedia", "pjproject", "pjsip"]);
    }

    #[test]
    fn link_test_lib_stems_accepts_msvc_lib_names() {
        // C143 Postcondition: MSVC `.lib` names (no `lib` prefix) are derived too.
        let lib = temp_dir("lib-stems-msvc");
        std::fs::create_dir_all(&lib).unwrap();
        std::fs::write(lib.join("pjsua-lib.lib"), b"").unwrap();
        std::fs::write(lib.join("pjmedia.lib"), b"").unwrap();
        let stems = link_test_lib_stems(&lib);
        assert_eq!(stems, vec!["pjmedia", "pjsua-lib"]);
    }

    #[test]
    fn staged_layout_accepts_msvc_lib_names() {
        // C143 Postcondition: the staged-layout invariant holds for MSVC `.lib`.
        let staged = temp_dir("c143-msvc-stage");
        std::fs::create_dir_all(staged.join("include")).unwrap();
        std::fs::create_dir_all(staged.join("lib")).unwrap();
        std::fs::write(staged.join("include/pjsua.h"), b"").unwrap();
        std::fs::write(staged.join("lib/pjsua-lib.lib"), b"").unwrap();
        assert!(validate_staged_layout(&staged).is_ok());
    }

    #[test]
    fn system_libs_are_target_specific() {
        assert!(system_libs_for(&TargetTriple::from("x86_64-unknown-linux-gnu")).contains(&"asound"));
        assert!(system_libs_for(&TargetTriple::from("x86_64-pc-windows-msvc")).contains(&"ws2_32"));
        assert!(system_libs_for(&TargetTriple::from("aarch64-apple-darwin")).contains(&"iconv"));
    }

    #[test]
    fn verify_staged_flow_rejects_empty_stage() {
        // Verify's first step is the staged-layout invariant.
        let staged = temp_dir("verify-empty");
        std::fs::create_dir_all(&staged).unwrap();
        let result = verify_staged(&staged, &TargetTriple::from("aarch64-apple-darwin"));
        assert!(matches!(result, Err(VerifyFailure::StageMissing(_))));
    }

}
