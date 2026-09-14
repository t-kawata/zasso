"""The metaclass every type in this representative is built by.

A metaclass changes what happens when a class statement runs, so the classes it
creates are not fully described by the class statements themselves: the registry
below gains an entry per class without any class body naming it.
"""

# Every class built through RegistryMeta, keyed by the name it was declared under.
REGISTRY = {}


# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
class RegistryMeta(type):
    """Build the class, then record it under its own name."""

# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
    def __new__(metaclass, name, bases, namespace):
        created = super().__new__(metaclass, name, bases, namespace)
        REGISTRY[name] = created
        return created


# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
class Widget(metaclass=RegistryMeta):
    """A widget carrying the identifier it was built with."""

# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
    def __init__(self, identity):
        self.identity = identity

# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
    def label(self):
        return "widget-" + self.identity
