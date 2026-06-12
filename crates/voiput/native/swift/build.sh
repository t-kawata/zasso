#!/bin/bash
set -euo pipefail

# SpeechHelper 静的ライブラリのビルド
# 出力: prebuilt/macos/libSpeechHelper.a
#
# 移植元: ~/shyme/mycute/Makefile swift-lib ターゲット
# Xcode Command Line Tools の swiftc が必要。

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$(cd "$SCRIPT_DIR/../../prebuilt/macos" && pwd)"

mkdir -p "$OUT_DIR"

# swiftc の存在確認
if ! command -v swiftc &>/dev/null; then
    echo "[build.sh] ERROR: swiftc not found. Install Xcode Command Line Tools." >&2
    exit 1
fi

swiftc \
    -emit-library -static \
    -o "$OUT_DIR/libSpeechHelper.a" \
    -module-name SpeechHelper \
    -parse-as-library \
    "$SCRIPT_DIR/SpeechHelper.swift"

echo "[build.sh] Built: $OUT_DIR/libSpeechHelper.a ($(wc -c < "$OUT_DIR/libSpeechHelper.a") bytes)"
