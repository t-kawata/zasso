# Protocol Transform — Image URL Handling Security Contract

Status: frozen for Phase 1 · Source: [10-protocol-transform-design.md §4.4](./10-protocol-transform-design.md#44-image-url-handling-security)

## Scope

This contract applies to all current `ImageSource::Url` handling in the protocol-transform core.

In the current scope, the transformer performs **no external HTTP downloads** for image URLs.

## Security invariants

| # | Rule | Rationale |
| --- | --- | --- |
| S1 | Transform layer must not issue DNS lookups or HTTP requests for image URLs | Keeps transformer pure; removes SSRF/download attack surface |
| S2 | `ImageSource::Url` is treated as data only; wrapping into target schema must not mutate the URL payload | Avoids hidden normalization and surprising side effects |
| S3 | Logs must not emit full sensitive URLs with query strings intact | Prevents accidental secret leakage in logs |
| S4 | Any future reintroduction of image downloading requires a dedicated spec revision before implementation | Prevents accidental scope creep back into risky I/O |

## Error handling

- Current scope must not emit download-specific errors because no download path exists.
- If a target protocol cannot represent an incoming image URL, the transform must fail or degrade **without** performing network I/O.
- All related logs must use `debug!` level and redact query strings when logging URLs.

## Interface contract

```rust,ignore
pub enum ImageSource {
    Inline { media_type: String, data: String },
    Url { url: String },
}
```

- Transform functions may preserve `ImageSource::Url` or map it into an equivalent target-field representation.
- Transform functions must not resolve, fetch, or rewrite the URL through external I/O.
- Unsupported image URL shapes must be handled by explicit lossy downgrade or format errors at the transform boundary.

## Dependencies

- No runtime HTTP client dependency is required for image URL handling in the current scope.
- If future scope reintroduces downloads, this file must be updated before adding networking dependencies.
