// Module declarations for the concurrency model subsystem.
//
// Each submodule corresponds to one RFC design node defining the
// single-core-reactor serialization architecture (§7).

pub mod account_handle_api;
pub mod command_serialization;
pub mod crate_root_api;
pub mod outgoing_call_request;
pub mod sipclient_methods;
pub mod sipclient_struct;

// Re-export primary concurrency-model types.
// [::STUB::] P0-4: re-exports will be activated when crate_root_api has actual items
#[allow(unused_imports)]
pub use crate_root_api::*;
