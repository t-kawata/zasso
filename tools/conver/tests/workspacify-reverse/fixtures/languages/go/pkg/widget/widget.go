// Package widget is the Go representative's subject: small, and carrying the
// constructs a syntax reader has to resolve rather than the ones it can read off
// a declaration.
package widget

import "example.test/widget/pkg/label"

// Widget is an embedded struct. Its identity fields are not named here: they are
// promoted from the embedded type below, so a reader that lists only the fields
// written in this declaration sees a widget with one field.
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
type Widget struct {
	widgetBase
	Name string
}

// widgetBase carries what every widget has before it is named. It is declared
// after the type that embeds it, which Go permits and a reader resolving names in
// file order has to handle.
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
type widgetBase struct {
	ID string
}

// Identity reports the promoted identifier, so the embedding is observable
// rather than a matter of how the struct happens to be laid out.
func (w Widget) Identity() string {
	return w.ID
}

// Render names the widget and returns the label it would carry.
//
// The label is built by the label package rather than here, so this package's
// dependency on another package of the module is an import statement a reader
// can follow rather than a convention.
func (w Widget) Render() string {
	return label.Of(w.ID) + ":" + w.Name
}
