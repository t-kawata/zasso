"""The decorator applied in `widget.py`.

A decorator replaces the name it is applied to, so the function a caller reaches
is not the function the `def` statement declared. A reader that resolves names by
declaration sees the undecorated function.
"""

import functools

# The names of the calls that have arrived, in the order they arrived.
CALLS = []


# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
def traced(function):
    """Record the call, then make it."""

    @functools.wraps(function)
# [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
    def wrapper(*args, **kwargs):
        CALLS.append(function.__name__)
        return function(*args, **kwargs)

    return wrapper
