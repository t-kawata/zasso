---
type: CodeBlock
id: codeblock/30-rest-adapter-5-generated-bindings/1/baf293206fde
phase: adapter
delivery: must
applies_to: rest
requires: []
references: []
content_sha256: baf293206fde592bccb2c2ff1c8293a30deece54d76d2e0c2394c40e041b5fa5
source: sources/30-REST.md
---
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
