# Normative Words Specification

## Rules

Clients MUST NOT retry after a failure.

SHALL be idempotent.

実装必須: 検査対象は error code を返す。

不変条件: balance >= 0.

禁止: raw SQL.
