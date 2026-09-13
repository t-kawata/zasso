// [::TICKET::] P23-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-11 --for-spec --no-implementation-order`.
//! Issuing, refreshing and revoking session tokens.

pub struct Session {
    pub subject: String,
    pub expires_at_unix: u64,
}

/// Issue a session for a subject whose credential has already been verified.
pub fn issue(subject: &str, now_unix: u64, lifetime_seconds: u64) -> Session {
    Session {
        subject: subject.to_owned(),
        expires_at_unix: now_unix + lifetime_seconds,
    }
}

/// Refresh a session that has not yet expired.
pub fn refresh(session: &Session, now_unix: u64, lifetime_seconds: u64) -> Option<Session> {
    if session.expires_at_unix <= now_unix {
        return None;
    }
    Some(issue(&session.subject, now_unix, lifetime_seconds))
}

/// Whether a session is still accepted at the given instant.
pub fn is_live(session: &Session, now_unix: u64) -> bool {
    session.expires_at_unix > now_unix
}
