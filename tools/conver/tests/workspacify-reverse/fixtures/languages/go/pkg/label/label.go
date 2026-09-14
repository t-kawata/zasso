// Package label renders the text a widget carries.
//
// It is a second package in the same module, so the widget package reaches it
// through an import statement rather than through a convention a reader has to
// infer. The two packages sit in different directories, which is what makes the
// dependency a boundary crossing the instrument can measure.
package label

// Of renders the label for an identity.
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
func Of(identity string) string {
	return "widget-" + identity
}
