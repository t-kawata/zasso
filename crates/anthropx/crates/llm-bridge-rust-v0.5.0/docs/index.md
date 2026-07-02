# Documentation Index

This directory contains project documentation for `llm-bridge-rust`, a Rust library for protocol transformation between LLM APIs.

## Agent workflow

- [Ruflo Usage](./ruflo-usage.md) — how this template uses Ruflo for agent workflow and orchestration.
- [CodeGraph Usage](./codegraph-usage.md) — 通用代码图谱/关系分析教程，用于快速理解仓库结构、调用链和影响面。

## Security

- [Security Audit Report](./security-audit-report.md) — 全面安全审查报告，涵盖输入验证、错误处理、SSRF 防护、TLS 配置、资源限制、敏感信息泄露、依赖安全等（2026-06-11）。

## Development workflow

- [Pre-commit Usage](./pre-commit-usage.md) — how to install and run repository pre-commit hooks.
- [Code Quality Report](./code-quality-report.md) — 基于 CLAUDE.md 规范的全面代码质量审查报告（2026-06-11）。

## SPARC 文档中心

小任务找专家，大任务找协调器；`TDD` 是规则，不是入口；高风险任务不得单 Agent 一把梭。

- [SPARC 使用规范](./sparc-usage-guideline.md) — 内部使用规范，用于统一单 Agent 与多智能体工作流的入口选择。
- [提示词模板库](./prompt-template-library.md) — 常用 SPARC 任务提示词模板，可直接复制使用。
- [TDD 规范](./tdd-guideline.md) — TDD 工作流规则、推荐顺序与阶段门禁。
- [高风险任务处理规范](./high-risk-task-guideline.md) — 高风险改动的协作、测试与审查要求。
- [文档搜索索引](./search.md) — GitHub 可渲染的轻量检索入口。

## Specs

- [Protocol Transform Enhancements Design](./superpowers/specs/2026-06-26-protocol-transform-enhancements-design.md) — 借鉴 new-api 的 6 项协议转换增强：Stop Reason 映射表、转换链追踪、字段安全过滤、Adapter Trait、Thinking 映射、Web Search 映射（2026-06-26）。

## Analysis Reports

- [Protocol Conversion Analysis](./protocol-conversion-analysis-2026-06-11.md) — 协议转换全面分析报告：17 个问题（2 Critical / 5 High / 4 Medium / 6 Low），含 enable_thinking 泄露修复方案、测试覆盖矩阵、修复优先级（2026-06-11）。

## 推荐阅读顺序

1. 先读 [SPARC 使用规范](./sparc-usage-guideline.md)，建立整体判断框架。
2. 再看 [提示词模板库](./prompt-template-library.md)，拿到可直接复制的任务模板。
3. 涉及测试先行时，补充阅读 [TDD 规范](./tdd-guideline.md)。
4. 涉及重构、安全、兼容性等高风险改动时，补充阅读 [高风险任务处理规范](./high-risk-task-guideline.md)。
5. 需要快速定位主题时，使用 [文档搜索索引](./search.md)。

Owner: baoyx · 版本：v1.0 · 生效日期：2026-05-21 · 最后更新：2026-05-21
6. 发布流程参考 [发布指南](./release-guide.md)。
