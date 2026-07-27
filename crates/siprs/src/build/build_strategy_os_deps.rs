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
//   - NODE_ID=N0039:  §28 Build Strategy & OS Dependencies
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0039 --hops=2)
//
// Cross-referenced design context:
//   - requirement/§4 Compliance Requirements [NODE_ID=N0005]
//     (part_of ← src/config/versioning_policy.rs)
//     (depends_on ← src/config/client_config_spec.rs)
//     (depends_on ← src/build/build_strategy_os_deps.rs)
//     → (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0005 --hops=2)
//   - CI/CD & M20 Docker/Prebuilt Pipeline [NODE_ID=N0054]
//     (validates → N0039)
//     → (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0054 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.

//! Build strategy and OS-specific package dependencies for the siprs crate.
//!
//! This module defines how the crate builds and links against PJSIP.
//! The build uses a **prebuilt-first** strategy: if prebuilt PJSIP libraries
//! exist under `vendor/prebuilt/{target-triple}/`, they are used directly.
//! Otherwise, the build falls back to compiling PJSIP from source.
//!
//! # Strategy
//!
//! 1. Check `vendor/prebuilt/{target-triple}/lib/` for prebuilt libraries.
//! 2. If all required libraries are present, emit link directives and generate
//!    bindings from the prebuilt include directory.
//! 3. Otherwise, build PJSIP from source via CMake at `vendor/pjsip/`.
//! 4. Place build artifacts in `OUT_DIR/pjsip-build/`.
//! 5. Emit link directives and generate bindings from the build output.
//!
//! ```rust,ignore
//! // Pseudo-code implementation for build.rs
//! fn main() {
//!     let target = std::env::var("TARGET").unwrap();
//!     let prebuilt_root = PathBuf::from("vendor/prebuilt").join(&target);
//!
//!     if prebuilt_available(&prebuilt_root) {
//!         emit_link_directives(&prebuilt_root);
//!         generate_bindings(prebuilt_root.join("include"));
//!         return;
//!     }
//!
//!     let src_root = PathBuf::from("vendor/pjsip");
//!     let build_root = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("pjsip-build");
//!     build_pjsip_from_source(&src_root, &build_root, &target);
//!     emit_link_directives(&build_root);
//!     generate_bindings(build_root.join("include"));
//! }
//! ```

/// Describes the build strategy configuration for the siprs crate.
///
/// This struct documents the prebuilt-first algorithm, CMake flags, and
/// OS-specific system package dependencies required for building PJSIP.
/// Actual build.rs implementation will consume these constants.
pub struct BuildStrategy {
    /// Path to prebuilt library directory, using `vendor/prebuilt/{target-triple}/`.
    pub prebuilt_path: &'static str,
    /// Path to PJSIP source directory for source-build fallback.
    pub source_path: &'static str,
    /// CMake flags passed to PJSIP source build.
    pub cmake_flags: &'static [&'static str],
    /// OS-specific system package dependencies keyed by OS name.
    pub os_dependencies: &'static [(&'static str, &'static [&'static str])],
}

// [::TICKET::] P2-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-2|P4-1) --for-spec --no-implementation-order`.
impl BuildStrategy {
    /// The canonical build strategy with prebuilt-first approach.
    ///
    /// This strategy applies to all three supported target OSes:
    /// Ubuntu 22.04 x86_64, macOS arm64, and Windows x86_64.
    pub const DEFAULT: BuildStrategy = BuildStrategy {
        prebuilt_path: "vendor/prebuilt/{target-triple}/lib",
        source_path: "vendor/pjsip",
        cmake_flags: &[
            "-DPJMEDIA_WITH_VIDEO=OFF",
            "-DPJMEDIA_HAS_OPUS_CODEC=1",
            // TLS and SRTP flags are feature-gated in Cargo.toml:
            // "tls" feature → enables PJ TLS transport
            // "srtp" feature → enables SRTP support
        ],
        os_dependencies: &[
            (
                "Ubuntu 22.04 x86_64",
                &[
                    "build-essential",
                    "cmake",
                    "libasound2-dev",
                    "libssl-dev",
                    "libcrypto-dev",
                    "libuuid-dev",
                    "libsrtp2-dev",
                ],
            ),
            ("macOS arm64", &["pkg-config", "cmake"]),
            ("Windows x86_64", &["MSVC Build Tools", "vcpkg: libsrtp"]),
        ],
    };
}

/// CMake flags used when building PJSIP from source.
///
/// `PJMEDIA_WITH_VIDEO=OFF` is mandatory — this crate is audio-only.
/// Opus codec is enabled as the primary audio codec.
pub mod cmake_flags {
    /// Disables video support in PJSIP media stack.
    pub const PJMEDIA_WITH_VIDEO: &str = "-DPJMEDIA_WITH_VIDEO=OFF";

    /// Enables Opus audio codec in PJSIP.
    pub const OPUS_ENABLED: &str = "-DPJMEDIA_HAS_OPUS_CODEC=1";
}

/// Target platform identifiers for the three supported OSes.
///
/// These triples are used to locate prebuilt libraries and configure
/// OS-specific build parameters.
pub mod target_triples {
    /// Ubuntu 22.04 / Linux x86_64
    pub const LINUX_X86_64: &str = "x86_64-unknown-linux-gnu";
    /// macOS arm64 (Apple Silicon)
    pub const MACOS_ARM64: &str = "aarch64-apple-darwin";
    /// Windows x86_64
    pub const WINDOWS_X86_64: &str = "x86_64-pc-windows-msvc";
}

/// OS-specific system package installation commands for source-build fallback.
///
/// These packages are required when prebuilt libraries are unavailable and
/// PJSIP must be compiled from source. The CI/CD pipeline (P1-4) validates
/// these dependencies via Docker-based matrix builds.
pub mod os_setup {
    /// Ubuntu 22.04 package installation command.
    pub const UBUNTU_SETUP: &str = r#"sudo apt-get install -y \
    build-essential cmake \
    libasound2-dev          # ALSA audio backend
    libssl-dev              # TLS transport
    libcrypto-dev           # OpenSSL crypto
    libuuid-dev             # UUID generation
    libsrtp2-dev            # SRTP (optional, feature dependent)"#;

    /// macOS arm64 package installation command.
    pub const MACOS_SETUP: &str = r#"brew install pkg-config cmake
# System frameworks (CoreAudio, CoreFoundation, Security) are
# auto-linked via Xcode CLI tools."#;

    /// Windows x86_64 package installation command.
    pub const WINDOWS_SETUP: &str = r#"# MSVC Build Tools or Visual Studio required.
# libsrtp via vcpkg (recommended):
vcpkg install libsrtp:x64-windows"#;
}

/// Prebuilt library availability check logic.
///
/// The CI/CD matrix (P1-4, N0054) runs prebuilt-available validation across
/// all 3 target OSes. When prebuilt libraries are missing, the build falls
/// back to source compilation and emits user-friendly error messages listing
/// the required system packages.
///
/// # Errors
///
/// Missing system packages cause CMake configure failures. The build.rs
/// script should emit clear instructions referencing the setup commands in
/// this module and the crate README.
pub mod ci_integration {
    /// Marker constant for CI/CD matrix validation.
    /// The CI pipeline (P1-4) validates prebuilt and source build configurations
    /// across 3 OSes x 4 feature combinations = 12 configurations.
    pub const CI_MATRIX_COVERAGE: &str = "3 OSes x 4 features = 12 configurations";
}
