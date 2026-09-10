#!/usr/bin/env sh
# A thin launcher: it locates the Node implementation and adds no logic of its own.
# Everything the entry point decides is decided in install.js, so the two
# platform launchers cannot drift apart.
set -e
exec node "$(dirname "$0")/install.js" "$@"
