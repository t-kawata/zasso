---
type: "Page"
title: "10. Threading, callbacks, ownership: non-negotiable FFI rules"
description: "One PJSUA global instance per process; serialize lifecycle. `pjsua_create` initializes PJLIB/registers calling thread; do not call pj_thread_is_registered before init. Any other Rust/OS thread..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-13"
    title: "10. Threading, callbacks, ownership: non-negotiable FFI rules"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "ceddcce54e350c9826b185e017f39094ad9629f3ac9b93ebb4d7d97ad48b9c02"
x-requires: [pages/pjsip-build-guide/9-build-and-execute-rust-ffi-tests-in-each-actual-os]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "382-388"
x-topic: "pjsip-build-guide"
---
## 10. Threading, callbacks, ownership: non-negotiable FFI rules
One PJSUA global instance per process; serialize lifecycle. `pjsua_create` initializes PJLIB/registers calling thread; do not call pj_thread_is_registered before init. Any other Rust/OS thread calling PJLIB registers itself (must execute on that thread); descriptor must live entire thread lifetime. Supplied helper uses TLS storage, unsafe precondition; do not register using stack local descriptor then return. Join/stop all external threads before pjsua_destroy/pj_shutdown; a registration helper is not permission to shut library down under worker.

Tokio tasks migrate threads; registering a task != registering execution threads. Prefer dedicated native control thread / actor, command queue; schedule all PJSUA operations there. Callbacks may arrive on native worker/media threads; never assume Tokio context. Callback: no panic across extern C; catch boundary + error event; no blocking reentrant lifecycle call; no borrowed pj_str_t/audio buffer retention; copy to Rust-owned memory or documented transferred-ownership handle. Queue bounded; overflow behavior explicit; no holding same mutex across a C call that synchronously invokes callback requiring it. No `CString::as_ptr()` beyond CString lifetime; no Rust deallocation of PJSIP pool memory; no C free of Rust allocation. Destruction order: stop inbound events -> terminate sessions -> drain/disable callbacks -> join workers -> release dependent pools/objects -> library shutdown. Exceptions at C++/Rust boundary forbidden unless explicitly designed unwind ABI; this guide targets C PJSUA, not C++ ABI binding.

Strings: pj_str_t length authoritative, not necessarily NUL-terminated; reject negative/overflow length before slice; byte encoding policy explicit; don't CStr::from_ptr arbitrary PJ string. Fixed arrays: size macro/profile authoritative; don't manually transcribe pjsua structs into Rust. Bitfields: bindgen accessors (`setting.set_plc(0)`/`plc()`); don't take address of C bitfield. C enum representation: module constants+integer type; invalid network values remain checked integers not invalid Rust discriminants. `Send`/`Sync` not guessed for raw handles; constrain wrappers; store pool ownership/lifetime.

[^pjsip-build-guide-13]

[^pjsip-build-guide-13]: 10. Threading, callbacks, ownership: non-negotiable FFI rules — sources/pjsip-build-guide.md, lines 382-388.

