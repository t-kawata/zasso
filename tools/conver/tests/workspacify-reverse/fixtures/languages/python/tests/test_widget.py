"""The sufficiency of the file name, not of the assertions.

P24-1's declaration records the presence of a test file per representative and
nothing about what it asserts, so this file exists to make that claim true and to
be readable — the adequacy of what it covers is the open item the declaration
records rather than something this file settles.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import registry as registry_module
import widget


# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
class WidgetTest(unittest.TestCase):
# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
    def test_the_decorator_records_the_call(self):
        self.assertEqual(widget.render("7"), "widget-7")
        self.assertEqual(widget.call_log, ["render"])

# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
    def test_the_metaclass_registered_the_type(self):
        self.assertIn("Widget", widget.registry)

# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
    def test_a_name_the_module_does_not_declare_is_answered(self):
        # `registry` is not a name `widget`'s body declares, so reaching it at all
        # is the hook answering, and identity is what the hook hands back.
        self.assertIs(widget.registry, registry_module.REGISTRY)


if __name__ == "__main__":
    unittest.main()
