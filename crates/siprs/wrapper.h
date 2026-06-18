#ifndef SIPRS_WRAPPER_H
#define SIPRS_WRAPPER_H

// autoconf 非依存のエンディアン定義。
// PJSIP は pj/config.h で PJ_IS_LITTLE_ENDIAN / PJ_IS_BIG_ENDIAN を要求するが、
// autoconf なしでもコンパイル可能にするため、プラットフォーム定義から直接設定する。
#if defined(__APPLE__)
#  define PJ_IS_LITTLE_ENDIAN 1
#  define PJ_IS_BIG_ENDIAN 0
#elif defined(__linux__)
#  define PJ_IS_LITTLE_ENDIAN 1
#  define PJ_IS_BIG_ENDIAN 0
#elif defined(_WIN32)
#  define PJ_IS_LITTLE_ENDIAN 1
#  define PJ_IS_BIG_ENDIAN 0
#endif

// ビデオ関連コードの生成抑制（必須要件: §28.3 PJMEDIA_WITH_VIDEO=OFF）。
// 参照: docs/rust-sip-client-rfc.md §28.3
#define PJMEDIA_HAS_VIDEO 0

// PJSIP コア。pjsua の基本機能に必要な主要ヘッダ。
#include <pjsip.h>
#include <pjsip_ua.h>
#include <pjsua-lib/pjsua.h>

// Opus コーデック。通話音声の高品質エンコード/デコードに使用。
#include <pjmedia-codec/opus.h>

// SIP エラーコードの文字列変換ヘルパー。
#include <pjsip/sip_errno.h>

#endif /* SIPRS_WRAPPER_H */
