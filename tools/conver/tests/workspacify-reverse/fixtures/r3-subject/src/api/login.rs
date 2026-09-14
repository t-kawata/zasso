// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
use crate::error::LoginError;

pub fn login(name: &str, locked: bool) -> Result<u8, LoginError> {
    assert!(!name.is_empty());
    if locked {
        return Err(LoginError::Locked);
    }
    let session = open(name).expect("open");
    while session < 3 {
        session += 1;
    }
    Ok(session)
}
