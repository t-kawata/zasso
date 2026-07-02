## Summary / 摘要

- What changed?
- 为什么要改？

## User-visible impact / 用户可见影响

- [ ] No user-visible change / 无用户可见变化
- [ ] User-visible change / 有用户可见变化（请说明）

## Validation / 验证

- [ ] `cargo build --workspace --all-features`
- [ ] `cargo nextest run --all-features`
- [ ] `cargo +nightly fmt --all -- --check`
- [ ] `cargo clippy -- -D warnings -W clippy::pedantic`
- [ ] `cargo audit`
- [ ] `cargo deny check`
- [ ] Docs only / 仅文档改动
- [ ] Other / 其他（请说明）

## Release labels / 发布标签

Pick at least one label that matches this PR. If this is a breaking change,
also add `breaking-change` or `semver-major`.

- [ ] `feature`
- [ ] `enhancement`
- [ ] `fix`
- [ ] `bug`
- [ ] `docs`
- [ ] `chore`
- [ ] `ci`
- [ ] `refactor`
- [ ] `test`
- [ ] `skip-release-notes`

## Breaking changes / 兼容性变更

- [ ] None / 无
- [ ] Yes / 有（请说明影响与迁移方式）

## Notes for reviewers / 需要 reviewer 特别关注的点

- Risky area / 风险点：
- Follow-up work / 后续工作：

## Checklist / 提交检查项

- [ ] I updated docs/examples when needed / 必要时已同步更新文档或示例
- [ ] I chose release label(s) for this PR / 已为本 PR 选择 release label
- [ ] I described validation above / 已填写验证方式
