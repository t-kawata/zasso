package widget

import "testing"

// TestRender is table-driven: one test carries three cases, and the cases are
// data rather than branches. A reader that enumerates test entries sees one
// expectation where the table holds three.
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
func TestRender(t *testing.T) {
	testCases := []struct {
		name     string
		identity string
		label    string
		want     string
	}{
		{name: "unnamed", identity: "7", label: "", want: "widget-7:"},
		{name: "named", identity: "7", label: "front-door", want: "widget-7:front-door"},
		{name: "empty identity", identity: "", label: "side", want: "widget-:side"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			widget := Widget{Name: testCase.label}
			widget.ID = testCase.identity

			if got := widget.Render(); got != testCase.want {
				t.Fatalf("Render() = %q, want %q", got, testCase.want)
			}
		})
	}
}
