// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
pub struct Session {
    pub state: u8,
}

// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
impl Session {
    pub fn advance(&mut self) {
        if self.state == 0 {
            self.state = 1;
        }
    }
}
