"""The module whose attributes are only partly written here.

`__getattr__` at module level answers for names this file does not declare, so the
set of attributes a consumer can reach is larger than the set a reader can
enumerate from the module body.
"""

from registry import REGISTRY, Widget
from tracing import traced, CALLS

# Names this module answers for without declaring them.
LAZY_ATTRIBUTES = {
    "registry": lambda: REGISTRY,
    "call_log": lambda: list(CALLS),
}


@traced
# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
def render(identity):
    """Build a widget and return the label it renders."""
    return Widget(identity).label()


# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
def __getattr__(name):
    """Answer for a name the module body does not declare."""
    if name in LAZY_ATTRIBUTES:
        return LAZY_ATTRIBUTES[name]()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
