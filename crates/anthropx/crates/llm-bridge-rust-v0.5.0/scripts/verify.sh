#!/usr/bin/env bash
# Verify script for llm-bridge pipeline
# Runs the full CI gate: fmt + clippy + test
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Running fmt check ==="
cargo +nightly fmt --check

echo "=== Running clippy ==="
cargo clippy -- -D warnings -W clippy::pedantic

echo "=== Running tests ==="
cargo nextest run --all-features

echo "=== All checks passed ==="
