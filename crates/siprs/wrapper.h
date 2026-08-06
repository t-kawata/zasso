// [::TICKET::] P3-2: PJSIP header includes for bindgen.
//
// This file is the single entry point for bindgen. Only the headers
// listed here are scanned for FFI declarations.
//
// The includes are active (P11-5): bindgen scans this file only when the
// `pjsua-native` feature is enabled, so the default build never requires a
// system PJSIP install.
// [::TICKET::] P3-2, P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5) --for-spec --no-implementation-order`.
#include <pjsua.h>
#include <pjmedia.h>
#include <pjmedia-codec/opus.h>
