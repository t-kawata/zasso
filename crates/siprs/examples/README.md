# siprs Usage Examples

This directory contains compilable example programs demonstrating the siprs
crate's public API.

## Prerequisites

- **PJSIP development library**: All examples require the PJSIP native library
  (v2.x) to be installed on the build system. Without it, the examples will
  fail at link time. Install via your system package manager:

  ```bash
  # macOS (Homebrew)
  brew install pjsip

  # Ubuntu/Debian
  apt-get install libpjproject-dev

  # Arch Linux
  pacman -S pjsip
  ```

- **Rust toolchain**: MSRV 1.95 or later.

## Examples

| File | Description | Dependencies |
|------|-------------|--------------|
| [client_init.rs](client_init.rs) | SIP client initialization with UDP/TCP transports and STUN | PJSIP |
| [account_register.rs](account_register.rs) | Account addition, registration, and event subscription | PJSIP, SIP registrar |
| [make_call.rs](make_call.rs) | Outgoing call with event lifecycle (ringing → connected → hangup) | PJSIP, registered account |
| [audio_tap.rs](audio_tap.rs) | Lossless audio capture from an active call, with optional microphone source | PJSIP, active call; `cpal-input` feature for microphone |
| [tts_source.rs](tts_source.rs) | Custom `AsyncAudioSource` trait implementation for TTS injection | PJSIP, active call |

## Building

All examples compile with the crate's default features:

```bash
cargo check --examples
```

## Running

> **Note**: The examples require network access to a SIP server/PBX for
> registration and call scenarios. Audio tap examples require an active call.

```bash
# Run a specific example
cargo run --example client_init
cargo run --example account_register
cargo run --example make_call
```

## Feature Flags

- `serde` (default): Serialization support for public types.
- `tls` (default): TLS transport support.
- `srtp` (off by default): SRTP media encryption.
- `cpal-input` (off by default): Microphone/audio-capture source.
