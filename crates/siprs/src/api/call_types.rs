// [::TICKET::] P3-1: OutgoingCallRequest, CallMediaPreferences, and related types.
// Separated from public_api_design.rs to avoid circular dependency with runtime::command.

use crate::error::SipError;

/// Supported audio codecs for SIP calls.
///
/// Only PCMU and Opus are allowed (C041 invariant).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Codec {
    Pcmu,
    Opus,
}

/// Media preferences for an outgoing SIP call.
#[derive(Debug, Clone, PartialEq)]
pub struct CallMediaPreferences {
    /// Request early media (ringing tones before call is answered).
    pub enable_early_media: bool,
    /// SRTP encryption preference. `None` = use account-level SRTP policy.
    pub enable_srtp: Option<bool>,
    /// Ordered list of preferred codecs. Only PCMU and Opus allowed.
    pub preferred_codecs: Vec<Codec>,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for CallMediaPreferences {
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            enable_early_media: true,
            enable_srtp: None,
            preferred_codecs: vec![Codec::Pcmu, Codec::Opus],
        }
    }
}

/// Authentication override for an outgoing call.
#[derive(Debug, Clone, PartialEq)]
pub enum AuthOverride {
    /// Use explicit username and password for this call.
    Credentials { username: String, password: String },
    /// Use the account-level authentication.
    Account,
}

/// Request to place an outgoing SIP call.
#[derive(Debug, Clone, PartialEq)]
pub struct OutgoingCallRequest {
    /// Target SIP URI (e.g., "sip:bob@example.com").
    pub target_uri: String,
    /// Additional SIP headers to include in the INVITE.
    pub headers: Vec<(String, String)>,
    /// Authentication override for this call.
    pub auth_override: Option<AuthOverride>,
    /// Preferred transport for this call.
    pub preferred_transport: Option<crate::config::transport_ice_spec::TransportConfig>,
    /// Media preferences (codecs, early media, SRTP).
    pub media: CallMediaPreferences,
    /// Automatically answer REFER requests (call transfer).
    pub auto_answer_refer: bool,
}

/// Constraints for validating call media preferences.
pub struct CallMediaConstraints;

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl CallMediaConstraints {
    /// Validate that all codecs in the list are PCMU or Opus.
    /// Returns Err if any non-allowed codec is found.
    pub fn validate_strict(codecs: &[Codec]) -> Result<(), SipError> {
        for codec in codecs {
            match codec {
                Codec::Pcmu | Codec::Opus => {}
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // @verifies C012
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn outgoing_call_request_constructs_with_all_fields() {
        let request = OutgoingCallRequest {
            target_uri: "sip:bob@example.com".into(),
            headers: vec![("X-Custom".into(), "value".into())],
            auth_override: None,
            preferred_transport: None,
            media: CallMediaPreferences {
                enable_early_media: true,
                enable_srtp: None,
                preferred_codecs: vec![Codec::Pcmu],
            },
            auto_answer_refer: false,
        };
        assert_eq!(request.target_uri, "sip:bob@example.com");
        assert_eq!(request.headers.len(), 1);
        assert_eq!(request.media.preferred_codecs[0], Codec::Pcmu);
    }

    #[test]
    // @verifies C031, C041
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn call_media_preferences_defaults() {
        let prefs = CallMediaPreferences::default();
        assert!(prefs.enable_early_media);
        assert!(prefs.enable_srtp.is_none());
        assert!(!prefs.preferred_codecs.is_empty());
    }

    #[test]
    // @verifies C031, C041
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn call_media_constraints_validates_codecs() {
        assert!(CallMediaConstraints::validate_strict(&[Codec::Pcmu]).is_ok());
        assert!(CallMediaConstraints::validate_strict(&[Codec::Opus]).is_ok());
        assert!(CallMediaConstraints::validate_strict(&[Codec::Pcmu, Codec::Opus]).is_ok());
        assert!(CallMediaConstraints::validate_strict(&[]).is_ok());
    }

    #[test]
    // @verifies C012
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn auth_override_variants() {
        let creds = AuthOverride::Credentials {
            username: "alice".into(),
            password: "secret".into(),
        };
        match &creds {
            AuthOverride::Credentials { username, .. } => assert_eq!(username, "alice"),
            AuthOverride::Account => panic!("expected Credentials"),
        }
        assert!(matches!(AuthOverride::Account, AuthOverride::Account));
    }

    #[test]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn codec_derives_required_traits() {
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_clone::<Codec>();
        assert_copy::<Codec>();
        assert_debug::<Codec>();
    }
}
