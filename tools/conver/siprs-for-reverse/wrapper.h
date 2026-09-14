//
// This file is the single entry point for bindgen. Only the headers
// listed here are scanned for FFI declarations.
//
// The includes are active (P11-5): bindgen scans this file only when the
// `pjsua-native` feature is enabled, so the default build never requires a
// system PJSIP install.
#include <pjsua.h>
#include <pjmedia.h>
#include <pjmedia-codec/opus.h>
