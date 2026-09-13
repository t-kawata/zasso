// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
//go:build linux

package widget

// linuxOnlyLabel is compiled only where the build constraint above holds, so the
// same directory carries different declarations on different platforms. A reader
// that ignores build constraints sees one more declaration than any single build
// does, and a reader that applies the host's constraint sees a different set than
// a reader on another host.
var linuxOnlyLabel = "linux"
