---
type: "Section"
title: "5. Generated Bindings"
description: "The generator emits one handler per operation. A generated handler has this"
sources: 
  - resource: "sources/30-REST.md"
    id: "30-rest-5-generated-bindings"
    title: "5. Generated Bindings"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/30-REST.md"
x-source-span: "105-147"
---
## 5. Generated Bindings

The generator emits one handler per operation. A generated handler has this
fixed shape:

```rust
async fn account_add(
    State(state): State<RestState>,
    Extension(identity): Extension<Arc<VerifiedIdentity>>,
    headers: axum::http::HeaderMap,
    Json(envelope): Json<SemanticRequest>,
) -> Result<Json<SemanticReply>, RestError> {
    let header_wire = WireContext::from_headers(&headers);
    let body_request_id = envelope.context.request_id;
    let wire = header_wire
        .merge(envelope.context)
        .map_err(|error| RestError::from_contract(error, body_request_id))?;
    let result = state
        .dispatcher
        .execute_verified(
            identity,
            INTERFACE_REST,
            state.config.audience,
            OperationId::new("account.add"),
            wire,
            envelope.request,
        )
        .await;
    Ok(Json(SemanticReply::from_result(result)))
}
```

The generator also emits:

- route registration in `routes/protected.rs`;
- `schema::<Operation>Request` / `Response` with `utoipa::ToSchema`;
- the OpenAPI path entry;
- a conformance matrix row.

Generated files carry `// @generated` and are not edited by hand.

---

