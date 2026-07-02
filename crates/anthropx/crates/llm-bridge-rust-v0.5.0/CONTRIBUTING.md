# Contributing to llm-bridge-rust

Thank you for your interest in contributing to `llm-bridge-rust`! This document provides guidelines and information for contributors.

## Code of Conduct

This project follows the [Rust Code of Conduct](https://www.rust-lang.org/policies/code-of-conduct). Please be respectful and constructive in all interactions.

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check existing [issues](https://github.com/TokenFleet-AI/llm-bridge-rust/issues) to avoid duplicates.

When creating a bug report, include:
- Clear description of the issue
- Steps to reproduce (with code examples if possible)
- Expected vs actual behavior
- Environment details (Rust version, OS, etc.)
- Relevant logs or error messages

### Suggesting Enhancements

Feature requests are welcome! Please include:
- Use case and motivation
- Proposed API or behavior (if applicable)
- Alternative solutions considered

### Pull Requests

1. **Fork the repository** and create your branch from `master`
2. **Follow the development workflow** (see below)
3. **Write tests** for any new functionality
4. **Update documentation** as needed
5. **Ensure CI passes** before submitting

## Development Workflow

### Prerequisites

- Rust (latest stable, see `rust-toolchain.toml`)
- `cargo-deny` for dependency auditing
- `pre-commit` (optional, recommended)

### Setup

```bash
git clone https://github.com/TokenFleet-AI/llm-bridge-rust.git
cd llm-bridge-rust
cargo build
```

### Code Style

This project enforces strict code quality standards via `CLAUDE.md`:

- **Formatting:** `cargo +nightly fmt`
- **Linting:** `cargo clippy -- -D warnings -W clippy::pedantic`
- **Documentation:** All public items require rustdoc with examples
- **Error handling:** No `unwrap()`/`expect()` in production code
- **Testing:** `test_should_...` naming convention

### Testing

```bash
# Run all tests
cargo test

# Run with coverage (requires cargo-tarpaulin)
cargo tarpaulin

# Run specific test
cargo test test_name
```

### Before Submitting

Run the full validation suite:

```bash
cargo build
cargo test
cargo +nightly fmt
cargo clippy -- -D warnings -W clippy::pedantic
cargo deny check
cargo audit
```

Or use the Makefile target (if available):

```bash
make ci
```

## Code Review Process

1. All PRs require at least one review
2. CI must pass (tests, clippy, fmt, deny, audit)
3. Address reviewer feedback before merging
4. Squash commits for clean history

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Examples:
- `feat(transform): add OpenAI Responses API support`
- `fix(security): use constant-time comparison for API keys`
- `docs(readme): update installation instructions`

## Security

For security vulnerabilities, please follow the process in [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.

## Questions?

- Open a [discussion](https://github.com/TokenFleet-AI/llm-bridge-rust/discussions) for general questions
- Check existing [issues](https://github.com/TokenFleet-AI/llm-bridge-rust/issues) for similar questions

Thank you for contributing! 🦀
