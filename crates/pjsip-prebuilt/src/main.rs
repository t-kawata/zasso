//! CLI entry point for the PJSIP prebuilt producer (§62.36).
//!
//! Reads as prose: "parse the subcommand, detect the host OS, dispatch build /
//! stage / verify, and translate every failure into a non-zero exit code."
//!
//! [::TICKET::] P18-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-2 --for-spec --no-implementation-order`

use pjsip_prebuilt::{
    build_all, build_for_target, parse_command, prebuilt_root, stage_built_target, verify_all,
    verify_staged, Command, HostOs, ProducerError, TargetTriple,
};
use std::process::ExitCode;

fn main() -> ExitCode {
    let host = HostOs::from_std(std::env::consts::OS);
    let args: Vec<String> = std::env::args().skip(1).collect();
    match dispatch(parse_command(&args), &host) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("pjsip-prebuilt: {error}");
            ExitCode::FAILURE
        }
    }
}

/// Routes a parsed subcommand to the matching producer operation.
fn dispatch(command: Result<Command, ProducerError>, host: &HostOs) -> Result<(), ProducerError> {
    match command? {
        Command::Build { triple } => build_one(&triple, host),
        Command::BuildAll => build_all(host),
        Command::Stage { triple } => stage_built_target(&triple, host),
        Command::StageAll => {
            for triple in pjsip_prebuilt::target_set_for_host(host)? {
                stage_built_target(&triple, host)?;
            }
            Ok(())
        }
        Command::Verify { triple } => verify_one(&triple),
        Command::VerifyAll => verify_all(host),
    }
}

fn build_one(triple: &TargetTriple, host: &HostOs) -> Result<(), ProducerError> {
    build_for_target(triple, host)?;
    stage_built_target(triple, host)
}

fn verify_one(triple: &TargetTriple) -> Result<(), ProducerError> {
    verify_staged(&prebuilt_root().join(&triple.0), triple)?;
    Ok(())
}
