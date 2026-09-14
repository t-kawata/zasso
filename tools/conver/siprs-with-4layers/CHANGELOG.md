# Changelog

## [Unreleased]

### P7-3 — Standalone Server Mode, HTTP/WS Protocol, SQLite Persistence & Reference Info (ABC closure)

- Test hardening: pinned all 20 REST/WS path constants to their exact RFC S54 values (O-003).
- Test hardening: SequenceGenerator monotonicity and uniqueness verified over 1M iterations (O-004).
- Test hardening: AuthConfig::validate() error kind asserted as the exact ConfigError variant (O-005).
- Test hardening: SQLite CREATE TABLE column types pinned to RFC S56 (O-006).
- Test hardening: DatabasePool::open() invalid-path error and init_schema()/query_tables() 4-table creation covered (O-002).
- Added spec-verification integration tests reading specs/P7-3.md (O-001) and crate-root re-export checks (O-008).

## [0.x] — 開発フェーズ

### 運用ルール

- 0.x フェーズでは semver に厳密には準拠しない。
- 必要に応じて破壊的変更を行い、安定化を優先する。
- パブリック API の変更は本ファイルおよびマイグレーションガイドで明示する。
- SipEventPayload のバリアント追加は破壊的変更と見なさない。

### リリース記録

- **0.1.0** — 初回リリース。crate 最小構成確立。
