# Changelog

All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/) for commit guidelines.

---
## [unreleased]

### Bug Fixes

- **(transform)** address code review findings - ([5930693](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/593069318afca3cc965bbeaf9a80afe48cf5ee0b)) - baoyx

### Documentation

- add release guide with two-step workflow - ([51f6f41](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/51f6f41dbe3037a81ee38795a1bd08fb1292f665)) - baoyx
- add protocol transform enhancements plan and design spec - ([f1aecfd](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/f1aecfd14324ef4eadc32e2ad5247e28fec8d331)) - baoyx

### Features

- **(model)** add conversion_trail field to TransformResponse (#1) - ([d938533](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/d9385339bd57a8d56b5a072e8deb5eb121018d10)) - baoyx
- **(transform)** add centralized stop reason mapping (#1) - ([fbed5e2](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/fbed5e2229cee7da1cd74c42afdbedc8799dca93)) - baoyx
- **(transform)** add TransformOptions and field filter (#1) - ([4342c5c](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/4342c5ce448c474598d0f628a039d7194b0ab451)) - baoyx
- **(transform)** add thinking/reasoning parameter mapping (#1) - ([0a4afa5](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/0a4afa5c3d97faf499837ebdbecddf98dedab2eb)) - baoyx
- **(transform)** add web search tool mapping (#1) - ([ecae193](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/ecae193d4f371acec63ad49150499afcda73953e)) - baoyx
- **(transform)** add ProtocolAdapter trait and AdapterRegistry (#1) - ([9ead63a](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/9ead63a2042e9c8d09e4dbdafb633d55670ef7e8)) - baoyx

### Miscellaneous Chores

- add issue reference to plan file (#1) - ([fa2b248](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/fa2b2484f97144492aec8d393ab24534bbb95dfa)) - baoyx
- release 0.5.0 - ([dd4bf36](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/dd4bf36711575b2ae6d5c28221c8702b302fcf2f)) - baoyx

### Refactoring

- **(transform)** use centralized stop_reason mapping (#1) - ([31cd95b](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/31cd95b5e9ef246bbbe8782693707f458974b06e)) - baoyx

### Tests

- **(fixtures)** add fixtures for field-filter, thinking, web-search (#1) - ([c4c2760](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/c4c2760d5ab28abe89ed535c5addc4d725d27b71)) - baoyx

---
## [0.3.0](https://github.com/TokenFleet-AI/llm-bridge-rust/compare/v0.2.6..v0.3.0) - 2026-06-26

### Bug Fixes

- Codex OpenAiResponses compatibility - ([36e731d](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/36e731d563fdb256ed8f28abba8c1f26f9eea66f)) - baoyx
- remove unused pytest imports from test files - ([c7312e5](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/c7312e5f7cd21632c9bc0116c7eb83196c20cdfc)) - baoyx
- remove incorrect test for Responses API unknown fields - ([7e9d009](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/7e9d009e557c0512af03a8997de92a84e7653887)) - baoyx

### Documentation

- add protocol transform validation tool design spec - ([c69c620](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/c69c6202be2871b46e52754464a2c85f89f50da3)) - baoyx
- add protocol transform validation tool implementation plan - ([e80950f](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/e80950ff79d6f4c6a55801d618c7954d309ddf01)) - baoyx

### Features

- add validate-cli example for offline protocol validation - ([5b1a83c](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/5b1a83c515ab083cc9ee2c98bc5547d607f55c44)) - baoyx
- init Python validation project skeleton - ([190e03d](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/190e03d3be066311b25894e15cd36a8410b2373b)) - baoyx
- add fixture loader with unit tests - ([415d87a](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/415d87a50f2cc2e30e4fa5b9890fc522f523aabc)) - baoyx
- add Rust CLI runner with unit tests - ([7c00a94](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/7c00a94a6660947ccf8872eb3065ced58b7aca7f)) - baoyx
- add OpenAI structure validators - ([4e19a58](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/4e19a5857310bda0d6308008f34fb346d9b2fe4e)) - baoyx
- add Anthropic structure validators - ([7b849eb](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/7b849eb1be22064e4d5d0fd49b731688e5a29c7d)) - baoyx
- add stream sequence state-machine validators - ([48d8b8d](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/48d8b8d5f80644153fc2bbe45af36423696e6f91)) - baoyx
- add litellm best-effort semantic comparator - ([90bc1b5](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/90bc1b593620064ea5ca273f46263736af5bb84c)) - baoyx
- add report generator with unit tests (Task 9) - ([f85f2ae](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/f85f2ae43fd8f612a3b4a8ad0b54e371314e4ca4)) - baoyx
- add main CLI entry point wiring all components - ([39ee010](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/39ee010d5a9fb28c513d125de909e2d1abead473)) - baoyx
- add make validate-protocol target - ([fa07af5](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/fa07af5865191c91fb0b0f869f2cd7e8f20f131f)) - baoyx
- split release into push and publish steps for CI safety - ([c5bbc44](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/c5bbc44924499a751bb3021dcb470d41189236c2)) - baoyx

### Miscellaneous Chores

- release 0.3.0 - ([35e43da](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/35e43daf4a3416ae2d148a6e2beb70cc0378a637)) - baoyx

### Other

- Merge branch 'worktree-protocol-transform-validation' - ([921140f](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/921140f8e5fa2a0f2b41ea8a7f12dadd0b1df450)) - baoyx
- Update CHANGELOG.md - ([2e74669](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/2e74669047afecd997e999854394d6bb817652bd)) - baoyx

### Style

- fix formatting in openai_to_responses.rs - ([9c01396](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/9c01396a0ef8c0309ba4cabf231e0406189d6564)) - baoyx

### Tests

- add end-to-end smoke test for validation pipeline - ([46f997c](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/46f997ce518f550e7101bd5e3b58047f2f9806c9)) - baoyx

---
## [0.2.6](https://github.com/TokenFleet-AI/llm-bridge-rust/compare/v0.2.5..v0.2.6) - 2026-06-12

### Bug Fixes

- protocol conversion - enable_thinking leak, tools truncation, security hardening - ([adce3de](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/adce3de76cb1fb12d1d3aed2f11018a7a37d2ff2)) - baoyx
- remove deny_unknown_fields from AnthropicBody (caused Claude Code requests to fail) - ([352e9cd](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/352e9cd37c46f78ea5d2ae3abdaed5c487297a37)) - baoyx

### Miscellaneous Chores

- bump version to 0.2.6 and update CHANGELOG - ([ad0cb37](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/ad0cb375dee67fb197a41ff3529ff1ee3c4eb033)) - baoyx

### Refactoring

- remove unused validator dependency - ([fa6e462](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/fa6e46279a211d78c740449bb28890cc2a0eceb4)) - baoyx

---
## [0.2.5](https://github.com/TokenFleet-AI/llm-bridge-rust/compare/v0.2.4..v0.2.5) - 2026-06-11

### Bug Fixes

- **(security)** use constant-time comparison and enable TLS verification - ([9414590](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/9414590ba7bc192073bbff3a98fa621f3f43bcaa)) - baoyx
- add version to llm-bridge-core workspace dependency for publish - ([9c1e90d](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/9c1e90d285d87faff6598782aa797a6902857efc)) - baoyx
- publish only llm-bridge-core, not server app - ([c96ba52](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/c96ba524eea9a5a57a9548d24e23acf64d62f22a)) - baoyx
- use git tag badge instead of GitHub release badge - ([67062ac](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/67062accadd25b215631a65033cb5c02c9bfc1e3)) - baoyx
- sanitize tool schemas for strict Chat Completions validators - ([8ba0583](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/8ba0583a2091d63ec62377b69a7f30650c56f165)) - baoyx

### Documentation

- rewrite README - add Quick Start, examples, fix license, structure, and badges - ([7a5557b](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/7a5557b5dd3b88e08b9b6b73cd8cd7cc1c513a13)) - baoyx
- update copyright year to 2020-2026 - ([647a61c](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/647a61ccb212d7c73188cf26a3ae81078523be7b)) - baoyx

### Miscellaneous Chores

- bump version to 0.2.5 and update CHANGELOG - ([9ce2834](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/9ce283421e705ea6e7d770cec162b2109739e2dd)) - baoyx

### Refactoring

- fix P1/P2 code quality issues - ([2ea004f](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/2ea004f7dcd6775c8a74caedfa4f93e8e5027890)) - baoyx
- remove apps/server placeholder - ([f274ecc](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/f274ecc546a7928b8acd75e657ce83e39597db9e)) - baoyx
- split http-proxy.rs into modular structure - ([69e2df6](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/69e2df6b6711cafb6f34b344bd6b03289ee36ecf)) - baoyx

---
## [0.2.4](https://github.com/TokenFleet-AI/llm-bridge-rust/compare/v0.2.3..v0.2.4) - 2026-06-04

### Bug Fixes

- **(core)** increase MAX_MESSAGES_COUNT to 10,000 and add release guide - ([a47203f](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/a47203f55159cb62d780596f85ad955bac051452)) - baoyx

### Documentation

- update CHANGELOG.md for v0.2.3 - ([108bcb7](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/108bcb79ee68393e568a4c7d8a4a95dc7be901f2)) - baoyx
- refresh README files and fix Cargo.toml metadata for v0.2.4 - ([4c19e7c](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/4c19e7c66e0953bbe1388a043762a937686162ee)) - baoyx

### Features

- **(core)** extend Usage struct with cache and reasoning token fields - ([03ea989](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/03ea989084924a7ead73fec47b8b24c4e8967491)) - baoyx

### Miscellaneous Chores

- bump version to 0.2.3 - ([0883448](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/088344806d7b2ef7cc12cf17061b1597e68cf1a7)) - baoyx
- add crates.io publish support via cargo-release - ([13f78af](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/13f78af54b897f1f71904bea5f445caf115eddc4)) - baoyx
- fix cargo-release flags in release target - ([991fa32](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/991fa32e7c7d1a2dc110480763175ed1a6474aef)) - baoyx
- add http-proxy script and gitignore logs/ - ([a1d07cd](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/a1d07cdf9fae60428a3625d663720763c2739d33)) - baoyx
- add --no-confirm to all cargo-release steps - ([83c6413](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/83c6413405fa3cdf8a7ed03e6c22e9c973bd9f30)) - baoyx

### Other

- Update CHANGELOG.md - ([da0fb04](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/da0fb04af7712593e16d3459828855ca77481432)) - baoyx

---
## [0.2.3] - 2026-05-21

### Bug Fixes

- **(ci)** align pre-commit hook and CLAUDE.md clippy flags with CI - ([e6b8d44](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/e6b8d44902627515d10940c775642dc258292bf8)) - baoyx
- **(ci)** add check-agent-sync to pre-commit hook to catch sync issues locally - ([d076d41](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/d076d41d86d2a3c00ba1fec0ac4d8b2ba9196d8f)) - baoyx
- **(core)** add resource limits and error sanitization for security hardening - ([2ce6ce6](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/2ce6ce6dab479e29ea428f69b5fdae701b92f638)) - baoyx
- **(core)** resolve clippy pedantic warnings in stream modules - ([b81c6c6](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/b81c6c682f0a3edab7d641e393577584781f8a86)) - baoyx
- **(core)** increase MAX_MESSAGES_COUNT from 100 to 1000 - ([c4fd92f](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/c4fd92f0b171c7af3f32164024d99fa477bfda1f)) - baoyx
- address P2 code review quick wins - ([e676560](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/e676560df7aff6af6fe9ffe9bb197c7d709439e6)) - baoyx
- address P2 code review quick wins - ([c639534](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/c639534d8685e809b046384199b8f02264a0f150)) - baoyx
- sync AGENTS.md with CLAUDE.md after clippy flags update - ([c5cca6a](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/c5cca6aa0c0f0bb923c4dd8b2c22178831d67bad)) - baoyx
- correct git-cliff repository URL in changelog links - ([b1e391b](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/b1e391b5e8e0aa0a39ff3c0576cb52edf008a4ef)) - baoyx

### Documentation

- document streaming translation gaps - ([db66740](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/db66740be6b9c1bd9b13caba07cccd2c6f2c7443)) - baoyx
- add OpenAI→OpenAI and Gemini→Gemini passthrough to streaming matrix - ([c12cb0f](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/c12cb0fcfe570773ddca1a937898459a18bb522e)) - baoyx
- update README and specs for OpenAI Responses API and streaming status - ([66fb7b5](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/66fb7b53fd4b632a879d5971bda96f3c1fc5ef75)) - baoyx
- add project documentation library - ([b540a17](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/b540a17141050bf9b7afb0dc088acb54769ca04d)) - baoyx
- update examples README with missing examples and current protocol matrix - ([c5cca80](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/c5cca80689b797921882c8a56868af0dc4f499f1)) - baoyx
- add http-proxy usage guide to examples README - ([11e3a84](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/11e3a84f6f64632ed240a9aa9028cc87419ebec4)) - baoyx
- refresh CLAUDE.md and AGENTS.md with llm-bridge agent guide - ([e3877a8](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/e3877a853e68c8a51a02e5e492da7b61adc3fb72)) - baoyx
- update CHANGELOG.md for v0.2.0 - ([03786cf](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/03786cf8eef93f365ce424b9da467eb17b2e8dd7)) - baoyx
- update CHANGELOG.md for v0.2.1 and v0.2.2 - ([2a583de](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/2a583dee3d4ec7931bc76b61ac9055b1025bf88e)) - baoyx

### Features

- **(core)** deliver Phase 1 — Rust core foundation with non-streaming transforms - ([4949a64](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/4949a64b7da0ebc9ad238385afe5c1efbb23a224)) - baoyx
- **(core)** deliver Phase 2 — streaming spine with SSE parsing and provider normalization - ([470beb7](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/470beb77ad6182b4a3beb4820ed98666ef791315)) - baoyx
- **(core)** deliver Phase 3 — provider compatibility expansion - ([35e7aff](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/35e7aff44a86591f76ce2d9411a66fed5687dcde)) - baoyx
- **(core)** deliver Phase 4 — quality gate with fixture-driven tests - ([1090046](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/1090046096dc5d53c57d044e387035c4c7e113e7)) - baoyx
- **(core)** implement OpenAI Responses API transforms (Phase 5) - ([fd117bf](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/fd117bf65dea32773bf07f4618d30331ea651229)) - baoyx
- **(core)** add README.md for crates.io - ([ec729bf](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/ec729bf176cd194305ee3f5ef4b051af7d0f702d)) - baoyx
- **(examples)** add 5 runnable examples with Chinese descriptions - ([cfd2693](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/cfd2693edda48e895f6d41568ad0875f92dec1b6)) - baoyx
- **(protocol-transform)** add spec set, docs, and Apache 2.0 license - ([6d5b0ae](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/6d5b0ae77e3c5f5eb59c729815b27a1584a03006)) - baoyx
- **(transform)** expand to bidirectional Anthropic↔OpenAI protocol transform - ([e92237b](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/e92237b6bb2f89289618ce919e670d65014a3f59)) - baoyx
- enhance transform.rs and add http-proxy example - ([2959158](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/2959158a1a86ac93be4d530606f7e49c806c9ca9)) - baoyx
- refactor protocol transform pipeline and update specs - ([bdcbf1c](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/bdcbf1c017c4f1fad3c931df9d673fbc7b959f1d)) - baoyx
- http-proxy primary/backup failover with Anthropic passthrough - ([12d993e](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/12d993e56706ac57cd5d57cfbcaf04dd7a1f713e)) - baoyx

### Miscellaneous Chores

- **(spec)** complete Phase 0 fixtures and deliverables - ([71cafc1](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/71cafc1b7779ed8f173eb04726985a6d6b1c36aa)) - baoyx
- initial project setup for llm-bridge - ([e0c9a5d](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/e0c9a5d5e8bd6b745f3cadb26068768adbf3aa2d)) - baoyx
- add .DS_Store and .idea/ to gitignore, remove LICENSE.md - ([bf30ca2](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/bf30ca23d2d60024bfbce93df937dc67cad82810)) - baoyx
- rewrite Makefile with llm-bridge targets - ([b3863e4](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/b3863e44426e4562f8190cfe82dcb641fe5c3f42)) - baoyx
- sync phase status across READMEs and specs, add auto-update directive - ([19edf47](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/19edf4742269a9d4da0ba608f146573f4b86b226)) - baoyx
- remove unused .agents/skills and fix clippy/typos warnings - ([63b63fd](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/63b63fd5d26742566d61fdd7e17247017153d428)) - baoyx
- add Ruflo swarm team initialization script - ([0be9ad4](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/0be9ad49ee4bf72e5dd468dd88b0ab06c352e673)) - baoyx
- bump version to 0.2.0 - ([3bf50ea](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/3bf50ea940db6351cc97d6bef9e7659f05938e6a)) - baoyx
- bump version to 0.2.0 and update authors - ([4f706f5](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/4f706f520ca7d20ac1e69ebfb8a67002e5320b15)) - baoyx

### Other

- add github workflows and community templates - ([7522aff](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/7522affced471805ac0b1a958944fdeb1f115f03)) - baoyx

### Performance

- optimize SSE serialization and buffer allocation - ([60c1ed9](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/60c1ed97ce6db9abe03d5c31f034c59173ab1a25)) - baoyx

### Refactoring

- **(core)** architecture improvements — non_exhaustive enums, nested ResponsesStreamState, typed-builder, newtypes - ([bba5e99](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/bba5e99288ff675839bdddf05dea75a0d17fd92b)) - baoyx
- **(core)** split transform.rs and stream.rs into submodules - ([9e6fcc6](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/9e6fcc6d6c23759937991abbe986b9c3297b3aec)) - baoyx
- **(core)** extract common SSE frame dispatch logic - ([4048a06](https://github.com/TokenFleet-AI/llm-bridge-rust/commit/4048a060573d62e3be6a35d05a8405f8c7e5fad1)) - baoyx

<!-- generated by git-cliff -->
