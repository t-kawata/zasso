
//! N0105 — prebuilt producer tool design model (§62.36).
//!
//! The executable producer lives in the standalone crate `crates/pjsip-prebuilt`
//! (siprs-independent, C143 invariant). This module keeps the *testable pure
//! logic* of that design inside the siprs crate so `make test` can cover it:
//! host-OS detection → §5.6 target set, staged-layout validation, and the
//! verify predicates (file / nm) from §62.36 Q16.
//!

/// Host operating systems mapped by the §5.6 producer table.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProducerHost {
    MacOs,
    Windows,
    Linux,
    Unsupported,
}

impl ProducerHost {
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
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct ProducerTriple(pub String);

/// The §5.6 target set for a host OS with an explicit host triple.
///
/// macOS produces the host triple plus a Docker-built Linux triple; Windows
/// produces MSVC only; Linux produces the host Linux triple.
pub fn target_set_for_host(
    host: &ProducerHost,
    host_triple: &str,
) -> Result<Vec<ProducerTriple>, &'static str> {
    match host {
        ProducerHost::MacOs => Ok(vec![
            ProducerTriple(host_triple.to_owned()),
            ProducerTriple("x86_64-unknown-linux-gnu".to_owned()),
        ]),
        ProducerHost::Windows => Ok(vec![ProducerTriple("x86_64-pc-windows-msvc".to_owned())]),
        ProducerHost::Linux => Ok(vec![ProducerTriple("x86_64-unknown-linux-gnu".to_owned())]),
        ProducerHost::Unsupported => Err("unsupported host OS — §5.6 has no mapping"),
    }
}

/// Machine format detected by the `file` command (§62.36 Q16 stage 1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProducerMachineKind {
    MachO,
    Elf,
    Pe,
}

/// Parses a `file` output line into a machine kind.
pub fn parse_file_output(output: &str) -> ProducerMachineKind {
    let lower = output.to_ascii_lowercase();
    if lower.contains("mach-o") {
        ProducerMachineKind::MachO
    } else if lower.contains("elf") {
        ProducerMachineKind::Elf
    } else {
        ProducerMachineKind::Pe
    }
}

/// Whether `nm` output exposes the required PJSIP entry symbols (§62.36 Q16 stage 2).
pub fn nm_output_has_pjsua_symbols(output: &str) -> bool {
    output.contains("pjsua_init") || output.contains("pj_init")
}

/// Staged-layout invariant: `include/pjsua.h` + a non-empty `lib/` with pjsua libs.
pub fn validate_staged_layout(staged: &std::path::Path) -> Result<(), &'static str> {
    let include = staged.join("include");
    if !include.join("pjsua.h").is_file() {
        return Err("staged include/pjsua.h missing");
    }
    let lib = staged.join("lib");
    let has_library = std::fs::read_dir(&lib)
        .map(|entries| {
            entries.flatten().any(|entry| {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                (name.starts_with("libpjsua") || name == "libpjproject.a")
                    && (name.ends_with(".a") || name.ends_with(".lib"))
            })
        })
        .unwrap_or(false);
    if !has_library {
        return Err("staged lib/ has no pjsua library");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_set_follows_design_brief_s5_6() -> Result<(), &'static str> {
        let macos = target_set_for_host(&ProducerHost::MacOs, "aarch64-apple-darwin")?;
        assert!(macos.iter().any(|t| t.0 == "aarch64-apple-darwin"));
        assert!(macos.iter().any(|t| t.0 == "x86_64-unknown-linux-gnu"));

        let windows = target_set_for_host(&ProducerHost::Windows, "x86_64-pc-windows-msvc")?;
        assert_eq!(
            windows,
            vec![ProducerTriple("x86_64-pc-windows-msvc".to_owned())]
        );

        let linux = target_set_for_host(&ProducerHost::Linux, "x86_64-unknown-linux-gnu")?;
        assert!(linux.iter().any(|t| t.0 == "x86_64-unknown-linux-gnu"));

        assert!(target_set_for_host(&ProducerHost::Unsupported, "x86_64").is_err());
        Ok(())
    }

    #[test]
    fn file_and_nm_predicates_detect_expected_formats() {
        assert_eq!(
            parse_file_output("Mach-O 64-bit arm64"),
            ProducerMachineKind::MachO
        );
        assert_eq!(
            parse_file_output("ELF 64-bit LSB"),
            ProducerMachineKind::Elf
        );
        assert_eq!(
            parse_file_output("PE32+ executable"),
            ProducerMachineKind::Pe
        );
        assert!(nm_output_has_pjsua_symbols("T _pjsua_init"));
        assert!(nm_output_has_pjsua_symbols("T _pj_init"));
        assert!(!nm_output_has_pjsua_symbols("T _pj_strdup"));
    }

    #[test]
    fn staged_layout_invariant_rejects_incomplete_stage() -> Result<(), std::io::Error> {
        let staged =
            std::env::temp_dir().join(format!("p18-2-siprs-producer-{}", std::process::id()));
        let lib = staged.join("lib");
        let include = staged.join("include");
        std::fs::create_dir_all(&lib)?;
        std::fs::create_dir_all(&include)?;
        std::fs::write(include.join("pjsua.h"), b"")?;
        std::fs::write(lib.join("libpjsua-lib.a"), b"")?;
        assert!(validate_staged_layout(&staged).is_ok());

        std::fs::remove_dir_all(&lib)?;
        std::fs::create_dir_all(&lib)?;
        assert!(validate_staged_layout(&staged).is_err());
        Ok(())
    }
}
