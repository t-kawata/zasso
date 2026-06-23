# RFC_001: CLI レイヤ（conver-cli）実装チケット分解設計書

> **生成元:** crates/conver/rfc-001-cli/RFC_001.md
> **生成日:** 2026-06-23
> **分析済みセクション:** §1 システム構造, §2 コマンド体系, §3 設定解決, §4 ルーティング, §5 互換レイヤ, §6 Init, §7 エラー型, §8 エントリポイント, §9 埋め込みアセット, §A Settings スキーマ, §C 完了条件, §E 設計資料, Appendix D 受入テスト

---

## 依存グラフ（5層モデル）

```
Layer 0 (型定義):       M0 ─── M1
                          \      \
Layer 1 (純粋関数):       M2 ─── M3 ─── M4 ─── M5
                          |      |      |      |
Layer 2 (非同期/I/O):    M6 ─── M7           |
                          |      |            |
Layer 3 (ライフサイクル): M8 ←──┴─────────────┘
                          |
Layer 4 (統合):          M9 ─── M10
```

| 層 | 内容 | 外部依存 |
|----|------|---------|
| Layer 0 (型定義) | 構造体、列挙型、エラー型、トレイト定義 | なし（thiserror, serde はderiveマクロ） |
| Layer 1 (純粋関数) | Merge実装、compat変換、router変換、パーサー定義 | なし |
| Layer 2 (非同期/I/O) | ファイル読み込み、設定解決、アセット展開 | ファイルI/O（std::fs） |
| Layer 3 (ライフサイクル管理) | エントリポイント・全モジュール統合 | ファイルI/O + conver-core/storage |
| Layer 4 (統合) | 結合テスト、受入テスト | cargo bin |

---

## Phase 1: 型定義基盤（Layer 0）

> **外部依存:** thiserror (derive), serde (derive), clap (derive)

このフェーズでは、後続の全実装が依存する型定義を確立する。
外部I/Oは一切行わず、メモリ内完結・決定論的・ミリ秒単位で検証可能。

### M0: モジュール骨格 + lib.rs 共通型 + エラー型

> **DB:** メモリ内完結（不使用）

#### チケット M0-1: Crate 構成 + lib.rs（モジュール宣言 + EmbeddedAsset + AssetKind）

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§1 システム構造, §9 埋め込みアセット)
* **依存・関連チケット:** M0-1 → M0-2（先行）、M0-1 → M5（後続：routerで使用）
* **対象不変条件 / 規範:** §1 システム構造（lib.rs のモジュール宣言）、§9 EmbeddedAsset 構造体、§9 AssetKind 列挙型
* **実装の背景と目的:** 全モジュールの親となる crate 構成と共通型を定義する。`EmbeddedAsset` は `include_bytes!` で埋め込まれた資産を表現し、`InitRunner` でアセット展開に使用される。`AssetKind` はアセット種別を区別するための enum で、現時点では SlashCommand と ConfigTemplate の2バリアント。後方互換性のため新しいバリアントの追加は常に可能とする。
* **実装スコープ:**
  - `crates/conver/rfc-001-cli/Cargo.toml` の作成（依存関係: clap, serde, serde_json, thiserror, dirs, sha2, conver-core, conver-storage）
  - `crates/conver/rfc-001-cli/src/lib.rs`:
    - `pub mod parser;` / `pub mod config;` / `pub mod router;` / `pub mod init;` / `pub mod compat;` の5モジュール宣言
    - `EmbeddedAsset` 構造体: `logical_name: String`, `relative_path: PathBuf`, `bytes: &'static [u8]`, `sha256: String`, `asset_kind: AssetKind`
    - `AssetKind` 列挙型: `SlashCommand`, `ConfigTemplate` の2バリアント
  - `crates/conver/rfc-001-cli/src/parser.rs`（空のスタブ — `[::STUB::]` でマークし M4 で解決）
  - `crates/conver/rfc-001-cli/src/config.rs`（空のスタブ — `[::STUB::]` でマークし M1 で解決）
  - `crates/conver/rfc-001-cli/src/router.rs`（空のスタブ — `[::STUB::]` でマークし M5 で解決）
  - `crates/conver/rfc-001-cli/src/init.rs`（空のスタブ — `[::STUB::]` でマークし M7 で解決）
  - `crates/conver/rfc-001-cli/src/compat.rs`（空のスタブ — `[::STUB::]` でマークし M3 で解決）
* **テストコードによる検証:**
  1. `cargo check -p conver-cli` が成功すること（モジュール構造のコンパイル検証）
  2. `EmbeddedAsset` の全フィールドにアクセス可能であること
  3. `AssetKind::SlashCommand` と `AssetKind::ConfigTemplate` のマッチが網羅的であること（`#[non_exhaustive]` 未使用の確認）
  4. スタブモジュールが `[::STUB::]` マーカーとともにコンパイル可能であること
* **計装方法・観測対象:** `cargo check` のコンパイル通過。crate メタデータ（name, version, edition）の確認。

#### チケット M0-2: エラー型定義（ConfigError, RoutingError, InitError, CompatError）

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§7 エラー型)
* **依存・関連チケット:** M0-1 → M0-2（先行：lib.rs のモジュール構造が必要）、M0-2 → M2（後続：Merge 実装に ConfigError が必要）、M0-2 → M5（後続：RoutingError が router で使用）、M0-2 → M7（後続：InitError が init で使用）、M0-2 → M3（後続：CompatError が compat で使用）
* **対象不変条件 / 規範:** §7 エラー型の完全な定義
* **実装の背景と目的:** 4種類のエラー型を定義し、各モジュールのエラー処理基盤を確立する。`thiserror` の `#[derive(Error)]` で統一的なエラー表現を提供し、エラーメッセージは日本語（利用者向け）とする。`ConfigError` は `std::io::Error` と `serde_json::Error` を source としてラップする。
* **実装スコープ:**
  - `crates/conver/rfc-001-cli/src/config.rs` に以下の4エラー型を定義（config.rs に配置するか、別ファイルで一元管理するかの判断。RFC の記述に従い各モジュールに配置）：
    - `ConfigError`（§7 定義通り）:
      - `NoHomeDir` — ホームディレクトリが解決できない
      - `Io(PathBuf, std::io::Error)` — 設定ファイルI/Oエラー
      - `Parse(PathBuf, serde_json::Error)` — JSONパースエラー
      - `UnknownKey(String)` — 不明な設定キー
    - `RoutingError`（§7 定義通り）:
      - `UnknownCommand(String)` — 不明なコマンド
      - `ExecutionFailed(conver_core::WorkflowError)` — 実行失敗（from トレイト実装）
    - `InitError`（§7 定義通り）:
      - `Conflict(String)` — ファイル競合
      - `Io(std::io::Error)` — I/Oエラー（from トレイト実装）
    - `CompatError`（§7 定義通り）:
      - `TranslationFailed(String)` — 互換コマンド変換失敗
      - `UnknownCommand` — 不明な互換コマンド
* **テストコードによる検証:**
  1. 全エラー型が `std::error::Error` トレイトを実装していること
  2. 全エラー型の `Display` 実装が意味のあるメッセージを返すこと
  3. `ConfigError::Io` から `std::io::Error` の source が取得可能であること
  4. `RoutingError` が `conver_core::WorkflowError` から `?` 演算子で変換可能であること（`From` impl）
  5. `InitError` が `std::io::Error` から `?` 演算子で変換可能であること
* **計装方法・観測対象:** `cargo test` のユニットテスト全パス。`std::error::Error` トレイト境界の充足確認。

---

### M1: Settings 構造体 + Merge トレイト定義

> **DB:** メモリ内完結（不使用）

#### チケット M1-1: Settings 構造体（10サブ設定）

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§A Settings.json 完全スキーマ)
* **依存・関連チケット:** M0-1（先行：crate 構成）、M1-1 → M2（後続：Merge 実装に Settings が必要）、M1-1 → M5（後続：router が settings を受け取る）、M1-1 → M6（後続：ConfigResolver が Settings を扱う）
* **対象不変条件 / 規範:** §A Settings 構造体の全フィールドとデフォルト値
* **実装の背景と目的:** 5層設定解決の最終出力型として機能する `Settings` 構造体を定義する。全フィールドは `#[serde(default)]` でオプショナルとし、JSONからの deserialize と CLI引数からの上書きの両方をサポートする。`config_file` フィールドのみ `#[serde(skip)]` とし、-f フラグで指定された設定ファイルパスを保持する（シリアライズ対象外）。
* **実装スコープ:**
  - `Settings` 構造体（`#[derive(Debug, Clone, Serialize, Deserialize)]`）:
    - `runtime: RuntimeSettings` — 実行バックエンド設定
    - `ui: UiSettings` — 表示設定
    - `retry: RetrySettings` — リトライ設定
    - `resume: ResumeSettings` — 再開設定
    - `report: ReportSettings` — レポート設定
    - `paths: PathSettings` — パス設定
    - `install: InstallSettings` — インストール設定
    - `quality: QualitySettings` — 品質ゲート設定
    - `deviation: DeviationSettings` — 乖離検出設定
    - `config_file: Option<PathBuf>` — `#[serde(skip)]`
  - 各サブ設定の構造体定義（フィールドは親RFCの Appendix A に準拠。現時点では最小限のフィールドで開始し、必要に応じて拡張可能）
    - `RuntimeSettings { pub backend: String }`
    - `UiSettings { pub display_mode: String, pub color_enabled: bool }`
    - `RetrySettings { pub max_retries: u32, pub base_delay_ms: u64 }`
    - `ResumeSettings { pub enabled: bool, pub session_dir: PathBuf }`
    - `ReportSettings { pub output_format: String, pub verbose: bool }`
    - `PathSettings { pub workspace_root: PathBuf, pub config_file: Option<PathBuf> }`
    - `InstallSettings { pub conflict_policy: ConflictPolicy, pub target_dir: PathBuf }`
    - `QualitySettings { pub gates: Vec<String>, pub fail_fast: bool }`
    - `DeviationSettings { pub max_deviation_pct: f64, pub strict_mode: bool }`
  - `Settings::defaults()` — ビルトインデフォルト値を返す関連関数
  - `Settings::from_cli(&Cli)` — CLI引数から部分設定を構築する関数（Cli 型は parser.rs で定義, M4 完了まで `[::STUB::]` で仮置き）
* **テストコードによる検証:**
  1. `Settings::defaults()` が全フィールドに意味のあるデフォルト値を設定すること
  2. `serde_json::to_string(&settings)` → `serde_json::from_str()` のラウンドトリップ
  3. `config_file` フィールドが JSON のシリアライズ対象外であること
  4. 各サブ設定のデフォルト値が期待通りであること
  5. `Settings::from_cli` が最小限の CLI 情報から `Settings` を構築できること
* **計装方法・観測対象:** ユニットテストの全パス。serde ラウンドトリップの検証。

#### チケット M1-2: Merge トレイト定義

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§3 設定解決 — Merge trait)
* **依存・関連チケット:** M1-1（先行：Settings 構造体）、M1-2 → M2（後続：Merge 実装）
* **対象不変条件 / 規範:** Merge トレイトのシグネチャと契約
* **実装の背景と目的:** `Merge` トレイトは設定の階層的マージを抽象化する。`Some(T)` のフィールドのみ上書きし、`None` は無視するセマンティクスを持つ。このトレイトにより、ConfigResolver は任意の設定レイヤを順次マージできる。トレイトを導入することで、テスト時にモック設定とのマージも可能になる。
* **実装スコープ:**
  - `pub trait Merge` の定義:
    ```rust
    pub trait Merge {
        fn merge(&mut self, other: &Self) -> Result<(), ConfigError>;
    }
    ```
  - トレイトの契約をドキュメントコメントで明記：
    - `other` の `Some(T)` フィールドのみが `self` を上書きする
    - `other` の `None` フィールドは `self` に影響を与えない
    - マージ不能な競合が発生した場合は `ConfigError` を返す
    - デフォルト実装は提供しない（実装ごとにセマンティクスが異なるため）
* **テストコードによる検証:**
  1. トレイトが `Settings` に対して実装可能であること（コンパイル時検証）
  2. トレイト境界 `fn resolve<T: Merge>(...)` がコンパイル可能であること
  3. トレイトの Object Safety は不要（静的ディスパッチのみ使用）
* **計装方法・観測対象:** コンパイル通過。トレイト境界の充足確認。

---

## Phase 2: 純粋変換ロジック（Layer 1）

> **外部依存:** clap (derive) — マクロ展開のみ、実行時I/Oなし

### M2: Merge::merge() 実装（Settings）

> **DB:** メモリ内完結

#### チケット M2-1: Merge for Settings 実装（全サブ設定のフィールド上書きロジック）

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§3 設定解決 — impl Merge for Settings)
* **依存・関連チケット:** M1-1（先行：Settings 構造体）、M1-2（先行：Merge トレイト定義）、M2-1 → M6（後続：ConfigResolver が merge を使用）
* **対象不変条件 / 規範:** §3：Some(T) のフィールドのみ上書き、None は無視
* **実装の背景と目的:** Settings の全サブ設定フィールドに対してマージロジックを実装する。各サブ設定の全フィールドについて、「`other` 側がデフォルト値と異なる場合のみ上書き」または「`Option<T>` で `Some` の場合のみ上書き」のパターンを適用する。これにより5層の優先順位（defaults < global < project < -f < flags）を実現する。マージ失敗は原則として起こらないが、`UnknownKey` エラーの検出機構は残す（将来のスキーマ拡張に対応するため）。
* **実装スコープ:**
  - `impl Merge for Settings`:
    ```rust
    impl Merge for Settings {
        fn merge(&mut self, other: &Self) -> Result<(), ConfigError> {
            // 各サブ設定のフィールドを順次マージ
            self.runtime.merge(&other.runtime)?;
            self.ui.merge(&other.ui)?;
            self.retry.merge(&other.retry)?;
            self.resume.merge(&other.resume)?;
            self.report.merge(&other.report)?;
            self.paths.merge(&other.paths)?;
            self.install.merge(&other.install)?;
            self.quality.merge(&other.quality)?;
            self.deviation.merge(&other.deviation)?;
            // config_file は CLI からの指定のみを優先、merge 対象外
            if other.config_file.is_some() {
                self.config_file.clone_from(&other.config_file);
            }
            Ok(())
        }
    }
    ```
  - 各サブ設定への `Merge` 実装（RuntimeSettings, UiSettings, RetrySettings, ResumeSettings, ReportSettings, PathSettings, InstallSettings, QualitySettings, DeviationSettings）
  - 各フィールドのマージパターン:
    - `String` 型: `other` がデフォルト値と異なる場合のみ上書き
    - `PathBuf` 型: `other` がデフォルト値と異なる場合のみ上書き
    - `u32`/`u64`/`f64` 型: `other` がデフォルト値と異なる場合のみ上書き
    - `bool` 型: `other` が `true` の場合のみ上書き（暗黙のデフォルトは `false`）
    - `Vec<T>` 型: `other` が空でない場合のみ置き換え
    - `Option<T>` 型: `other` が `Some` の場合のみ上書き
* **テストコードによる検証:**
  1. 同一設定のマージ（`a.merge(&a)`）が不変性を保つこと
  2. デフォルト設定 + CLI設定 のマージで CLI が優先されること
  3. 部分設定（一部フィールドのみ指定）のマージで未指定フィールドが保持されること
  4. 空の `other` でマージしても `self` が変化しないこと
  5. 全フィールドがマージ対象であること（カバレッジ確認）
  6. マージ後に `UnknownKey` エラーが発生しないこと（既知のキーのみ）
* **計装方法・観測対象:** ユニットテスト全パス。5層マージの優先順位に関する代数的性質（結合性は満たさないが、冪等性は一部満たす）の確認。

---

### M3: 互換レイヤ（compat.rs）

> **DB:** メモリ内完結

#### チケット M3-1: CompatCommand 列挙型定義（9種のレガシーコマンド）

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§5 互換レイヤ — CompatCommand enum)
* **依存・関連チケット:** M0-1（先行：lib.rs モジュール宣言）、M3-1 → M3-2（先行：Translate 関数が CompatCommand を使用）
* **対象不変条件 / 規範:** §5 CompatCommand の9バリアント完全性
* **実装の背景と目的:** 既存の Node.js スクリプト（`node .claude/scripts/...`）の引数形式をそのまま受け入れる互換コマンドを定義する。`conver cmd <legacy-command> [args...]` の形で呼び出されることを想定し、各レガシーコマンドの引数を型付けられた構造体として定義する。互換レイヤにより、既存のワークフローを中断することなく Rust 版への移行が可能になる。
* **実装スコープ:**
  - `CompatCommand` 列挙型（§5 定義通り9バリアント）:
    - `GrillMeForRfc(CompatGrillArgs)` — `/grill-me-for-rfc` 相当
    - `GrillMeToSplitRfcAsTree(CompatTreeArgs)` — `/grill-me-to-split-rfc-as-tree` 相当
    - `FormulateTickets(CompatFormulateArgs)` — `/formulate-tickets` 相当
    - `MakeTicket(CompatTicketArgs)` — `/make-ticket` 相当
    - `PlanTicket(CompatIdArgs)` — `/plan-ticket` 相当
    - `StartTicket(CompatIdArgs)` — `/start-ticket` 相当
    - `ReviewTicket(CompatIdArgs)` — `/review-ticket` 相当
    - `ResolveTicket(CompatIdArgs)` — `/resolve-ticket` 相当
    - `FindOmissions(CompatTreeArgs)` — `/find-omissions-for-next-rfc` 相当
  - 引数構造体:
    - `CompatGrillArgs { research: PathBuf, output: PathBuf }`
    - `CompatTreeArgs { rfc: PathBuf }`
    - `CompatFormulateArgs { rfc_node: PathBuf }`
    - `CompatTicketArgs { title: String, rfc_node: String }`
    - `CompatIdArgs { ticket_id: String }`
  - `clap::Subcommand` derive でサブコマンドとしてパース可能にする
* **テストコードによる検証:**
  1. 全9バリアントが clap でパース可能であること（各バリアントの最少引数パース）
  2. 必須引数がない場合はエラーになること
  3. 不明なバリアントは clap のエラーになること
* **計装方法・観測対象:** clap のパーステスト全パス。

#### チケット M3-2: translate() 関数 — CompatCommand → WorkflowRequest 変換

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§5 互換レイヤ — translate 関数)
* **依存・関連チケット:** M3-1（先行：CompatCommand 定義）、M0-2（先行：CompatError 定義）、M3-2 → M5（後続：router が translate を呼ぶ際の経路）
* **対象不変条件 / 規範:** §5 translate() の全バリアント完全マッチ
* **実装の背景と目的:** 9種の CompatCommand をそれぞれ対応する WorkflowRequest に変換する純粋関数。`CompatCommand::GrillMeForRfc(args)` → `WorkflowRequest::GrillRfc(GrillRfcRequest{...})` のように、レガシーコマンドの引数構造を canonical なリクエストにマッピングする。変換不能な場合は `CompatError` を返す。この関数は I/O を行わない純粋変換であり、単体テストで完全に検証可能。
* **実装スコープ:**
  - `pub fn translate(cmd: CompatCommand) -> Result<WorkflowRequest, CompatError>`
  - 全9バリアントのマッチングと変換（§5 定義通り）
  - `CompatCommand::MakeTicket` の `depends_on` は `vec![]` で直指定（レガシー互換）
* **テストコードによる検証:**
  1. 全9バリアントが `Ok(WorkflowRequest)` に変換可能であること
  2. 各変換後の `WorkflowRequest` が元の引数を正しく保持していること
  3. すべてのバリアントが網羅されていること（非網羅的マッチのコンパイルエラー確認）
* **計装方法・観測対象:** ユニットテスト全パス。全バリアントの網羅的テスト。

---

### M4: パーサー層（parser.rs）

> **DB:** メモリ内完結

#### チケット M4-1: Cli + Command トップレベルパーサー

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§2.1 トップレベル)
* **依存・関連チケット:** M0-1（先行：lib.rs モジュール宣言）、M4-1 → M4-2（先行：RfcCommand 等のサブコマンドが必要）、M4-1 → M5（後続：router が Command を使用）
* **対象不変条件 / 規範:** §2.1 Cli 構造体 + Command 列挙型の完全性（7バリアント）
* **実装の背景と目的:** CLI エントリポイントのパーサー層。clap の `#[derive(Parser)]` と `#[derive(Subcommand)]` でコマンドライン引数を型付けられた Rust の値に変換する。`Cli` 構造体はトップレベルの `#[command]` 属性を持ち、`Command` 列挙型は7種のサブコマンドを保持する。すべてのサブコマンドは `--help` で完全に文書化される。
* **実装スコープ:**
  - `Cli` 構造体（`#[derive(Parser)]`）:
    ```rust
    #[derive(Parser)]
    #[command(name = "conver", version, about = "決定論的 Rust オーケストレータ")]
    pub struct Cli {
        #[command(subcommand)]
        pub command: Command,
    }
    ```
  - `Command` 列挙型（`#[derive(Subcommand)]`）:
    - `Init(InitArgs)` — `--into` フラグ必須
    - `Rfc(RfcCommand)` — 5サブコマンド（M4-2）
    - `Ticket(TicketCommand)` — 7サブコマンド（M4-3）
    - `Malfeasance(MalfeasanceCommand)` — 4サブコマンド（M4-4）
    - `Quality(QualityCommand)` — 1サブコマンド（M4-5）
    - `Runtime(RuntimeCommand)` — 3サブコマンド（M4-5）
    - `Cmd(CompatCommand)` — `#[command(hide = true)]` でヘルプ非表示（M3-1）
  - `InitArgs { pub into: PathBuf }` 構造体
* **テストコードによる検証:**
  1. `conver --help` 相当のパースが全サブコマンドを表示すること
  2. `conver init --into /tmp/test` が `Command::Init(InitArgs{..})` にパースされること
  3. 引数なしの `conver` がエラーになること
  4. 不明なサブコマンドが clap のエラーになること
  5. 各サブコマンドの `--help` が表示可能であること
* **計装方法・観測対象:** clap のパーステスト（`try_parse_from` を使用）全パス。

#### チケット M4-2: RfcCommand サブコマンド定義（5種）

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§2.2 RFC サブコマンド)
* **依存・関連チケット:** M4-1（先行：Command が RfcCommand をフィールドに持つ）、M4-2 → M5（後続：router が RfcCommand をマッチ）
* **対象不変条件 / 規範:** §2.2 RfcCommand の5バリアント完全性
* **実装スコープ:**
  - `RfcCommand` 列挙型（`#[derive(clap::Subcommand)]`）:
    - `Grill { research: PathBuf(#[arg(long)]), output: PathBuf(#[arg(long)]), runtime: String(#[arg(long, default_value = "claude-code")]), display: String(#[arg(long, default_value = "ColorizedCLI")]) }`
    - `Status { rfc_dir: PathBuf(#[arg(long, default_value = ".")]) }`
    - `ChecklistGenerate { rfc_dir: PathBuf(#[arg(long, default_value = ".")]) }`
    - `TreeSplit { rfc: PathBuf(#[arg(long)]) }`
    - `Omissions { rfc: PathBuf(#[arg(long)]) }`
* **テストコードによる検証:**
  1. 全5バリアントがパース可能であること
  2. `Grill` の必須引数 `--research`, `--output` が欠落している場合はエラー
  3. `TreeSplit` の必須引数 `--rfc` が欠落している場合はエラー
  4. `Status` の省略可能引数 `--rfc-dir` のデフォルト値が `"."` であること
  5. `Grill` の `--runtime` デフォルト値が `"claude-code"` であること
* **計装方法・観測対象:** clap パーステスト全パス。

#### チケット M4-3: TicketCommand サブコマンド定義（7種）

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§2.3 チケットサブコマンド)
* **依存・関連チケット:** M4-1（先行：Command が TicketCommand をフィールドに持つ）
* **対象不変条件 / 規範:** §2.3 TicketCommand の7バリアント完全性
* **実装スコープ:**
  - `TicketCommand` 列挙型（`#[derive(clap::Subcommand)]`）:
    - `Create { title: String(#[arg(long)]), rfc_node: String(#[arg(long)]), depends_on: Vec<String>(#[arg(long, value_delimiter = ',')]) }`
    - `Plan { ticket_id: String }` — 位置引数
    - `Start { ticket_id: String }` — 位置引数
    - `Review { ticket_id: String }` — 位置引数
    - `Resolve { ticket_id: String }` — 位置引数
    - `List { status: String(#[arg(long, default_value = "all")]), rfc_node: Option<String>(#[arg(long)]) }`
    - `Formulate { rfc_node: PathBuf(#[arg(long)]) }`
* **テストコードによる検証:**
  1. 全7バリアントがパース可能であること
  2. `Create` の `--title`, `--rfc-node` 必須引数欠落でエラー
  3. `Plan` の位置引数 `ticket_id` 欠落でエラー
  4. `List --status open` のパース成功確認
  5. `Create --depends-on M0-1,M0-2` のカンマ区切り複数値パース確認
* **計装方法・観測対象:** clap パーステスト全パス。

#### チケット M4-4: MalfeasanceCommand サブコマンド定義（4種）

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§2.4 Malfeasance サブコマンド)
* **依存・関連チケット:** M4-1（先行：Command が MalfeasanceCommand をフィールドに持つ）
* **対象不変条件 / 規範:** §2.4 MalfeasanceCommand の4バリアント完全性
* **実装スコープ:**
  - `MalfeasanceCommand` 列挙型:
    - `Create { description: String(#[arg(long)]), rfc_node: Option<String>(#[arg(long)]), ticket: Option<String>(#[arg(long)]) }`
    - `Resolve { malfeasance_id: String }` — 位置引数
    - `List { status: String(#[arg(long, default_value = "open")]) }`
    - `Scan` — 追加引数なし
* **テストコードによる検証:**
  1. 全4バリアントがパース可能であること
  2. `Create --description "test"` のパース成功
  3. `Resolve MAL-001` のパース成功
  4. `List --status open` / `List`（デフォルト）の両方がパース可能
  5. `Scan` に余分な引数を与えるとエラー
* **計装方法・観測対象:** clap パーステスト全パス。

#### チケット M4-5: QualityCommand + RuntimeCommand サブコマンド定義

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§2.5 その他のサブコマンド)
* **依存・関連チケット:** M4-1（先行：Command が両コマンドをフィールドに持つ）
* **対象不変条件 / 規範:** §2.5 QualityCommand（1バリアント）+ RuntimeCommand（3バリアント）の完全性
* **実装スコープ:**
  - `QualityCommand` 列挙型:
    - `Run { gate: String(#[arg(long, default_value = "all")]) }`
  - `RuntimeCommand` 列挙型:
    - `Start { request: String(#[arg(long)]) }`
    - `Stop { run_id: String }` — 位置引数
    - `Status { run_id: String }` — 位置引数
* **テストコードによる検証:**
  1. QualityCommand のパース成功確認
  2. RuntimeCommand 全3バリアントのパース成功確認
  3. `RuntimeCommand::Stop` の位置引数欠落でエラー
* **計装方法・観測対象:** clap パーステスト全パス。

---

### M5: ルーティング層（router.rs）

> **DB:** メモリ内完結（controller 呼び出しは mock で代用）

#### チケット M5-1: route() 関数 — Command → WorkflowRequest 変換 + 実行

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§4 ルーティング)
* **依存・関連チケット:** M4-1（先行：Command 定義）、M0-2（先行：RoutingError）、M3-2（先行：compat::translate）、M5-1 → 結合テスト M10（後続）
* **対象不変条件 / 規範:** §4：全 Command バリアントが WorkflowRequest に変換可能
* **実装の背景と目的:** パース済みの `Command` を `WorkflowRequest` に変換し、`conver-core` の `WorkflowController` に渡す。この関数は Command → WorkflowRequest のマッピングテーブルとして機能し、新たなコマンドが追加された際はここにマッピングを追加する。`Command::Cmd`（互換コマンド）は `crate::compat::translate()` を呼び出してから実行する。`Command::Init` は main.rs で特別処理されるため、ここではマッチしない（到達不能の場合はパニックでなくエラーを返す設計としておく）。
* **実装スコープ:**
  - `pub fn route(command: Command, controller: &mut dyn WorkflowController, settings: Settings) -> Result<(), RoutingError>`
  - 全 Command バリアントのマッチング（§4 定義通り）
  - 各バリアントから対応する WorkflowRequest への変換
  - controller.execute(request) の呼び出し
  - エラーの RoutingError へのラップ
* **テストコードによる検証:**
  1. 全 Command バリアントが `Ok(())` を返すこと（MockController 使用）
  2. 各 WorkflowRequest が元の Command 引数を正しく保持していること
  3. controller がエラーを返した場合に `RoutingError` に変換されること
  4. 互換コマンド（Command::Cmd）のルーティングが正常に動作すること
* **計装方法・観測対象:** MockController を使用したユニットテスト全パス。全バリアントの網羅的テスト。

---

## Phase 3: ファイルI/O 導入（Layer 2）

> **外部依存:** std::fs, dirs, serde_json（ファイル読み込み）

### M6: ConfigResolver — 5層設定解決

> **DB:** ファイルI/O を使用（実設定ファイルから読み込み）

#### チケット M6-1: ConfigResolver::load_file() — 単一設定ファイル読み込み

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§3 設定解決 — ConfigResolver::load_file)
* **依存・関連チケット:** M1-1（先行：Settings + serde）、M0-2（先行：ConfigError）、M6-1 → M6-2（後続：load_global/load_project が load_file を呼ぶ）
* **対象不変条件 / 規範:** §3 load_file: ファイル読み込み + JSONパース
* **実装の背景と目的:** 任意のパスから JSON 設定ファイルを読み込み、`Settings` 構造体に deserialize する。ファイルが存在しない場合、JSON フォーマットが不正な場合、および不明なキーが含まれる場合のエラー処理を定義する。この関数は5層マージの層2〜4（global, project, -f）で使用される共通基盤である。
* **実装スコープ:**
  - `fn load_file(path: &Path) -> Result<Settings, ConfigError>`:
    - `std::fs::read_to_string(path)` — ファイル読み込み
    - `serde_json::from_str(&content)` — JSONパース
    - エラーマッピング: `std::io::Error` → `ConfigError::Io`, `serde_json::Error` → `ConfigError::Parse`
    - 不明キーの検出: serde の `#[serde(deny_unknown_fields)]` または明示的なバリデーション
* **テストコードによる検証:**
  1. 有効な設定ファイルの読み込みが成功すること
  2. 存在しないファイルの読み込みで `ConfigError::Io` が返ること
  3. 不正なJSONで `ConfigError::Parse` が返ること
  4. 不明なキーを含むJSONで `ConfigError::UnknownKey` が返ること（または serde の deny_unknown_fields でエラー）
  5. 空のオブジェクト `{}` が全フィールドデフォルト値で成功すること
* **計装方法・観測対象:** 一時ファイルを使用したユニットテスト。`tempfile` crate を使用して隔離されたファイルI/Oをテスト。

#### チケット M6-2: ConfigResolver::load_global() + load_project() — 設定ファイル探索

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§3 設定解決 — load_global, load_project)
* **依存・関連チケット:** M6-1（先行：load_file）、M6-2 → M6-3（後続：resolve が両者を呼ぶ）
* **対象不変条件 / 規範:** §3：load_global (dirs::config_dir 使用), load_project (ancestors 遡上)
* **実装の背景と目的:** 2つの設定ファイル探索戦略を実装する。`load_global()` は OS 標準の設定ディレクトリ（Linux: `~/.config/conver/settings.json`, macOS: `~/Library/Application Support/conver/settings.json`）を `dirs::config_dir()` 経由で解決する。`load_project()` はカレントディレクトリからルートまで遡り、`.conver/settings.json` を探索する。両方ともファイルが存在しない場合はエラーにせず `Settings::defaults()` を返す（寛容なフォールバック）。
* **実装スコープ:**
  - `fn load_global() -> Result<Settings, ConfigError>`:
    - `dirs::config_dir()` → `conver/settings.json` のパス構築
    - ファイルが存在しない → `Ok(Settings::defaults())`
    - ファイルが存在する → `load_file(path)` を呼ぶ
  - `fn load_project() -> Result<Settings, ConfigError>`:
    - `std::env::current_dir()` から `.ancestors()` で遡上
    - 各ディレクトリで `.conver/settings.json` の存在確認
    - 発見 → `load_file(path)` を呼ぶ
    - 未発見（ルート到達） → `Ok(Settings::defaults())`
* **テストコードによる検証:**
  1. 一時ディレクトリに `.conver/settings.json` を作成し、`load_project()` がそれを発見すること（chdir 不要のテスト設計）
  2. 設定ファイルがない場合にデフォルト設定が返ること
  3. グローバル設定パスが `dirs::config_dir()` からの相対パスであること（パス構築のみの確認、実際のファイル有無は環境依存）
  4. 複数階層の `.conver/` がある場合、最もカレントに近いものが優先されること
* **計装方法・観測対象:** 一時ファイルとchdirを使用しない隔離テスト。パス解決のロジック検証。

#### チケット M6-3: ConfigResolver::resolve() — 5層マージ統合

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§3 設定解決 — ConfigResolver::resolve)
* **依存・関連チケット:** M6-1（先行：load_file）、M6-2（先行：load_global/load_project）、M2-1（先行：Merge::merge）、M6-3 → M8（後続：main.rs が resolve を呼ぶ）
* **対象不変条件 / 規範:** §3：defaults < global < project < -f < flags の優先順位
* **実装の背景と目的:** 5層の設定マージを統合する公開API。1→5の順にマージを重ね、最終的な `Settings` を返す。CLIフラグ（層5）が最優先で、ビルトインデフォルト（層1）が最低優先。この関数が設定解決層のエントリポイントであり、main.rs から呼び出される。
* **実装スコープ:**
  - `impl ConfigResolver`:
    ```rust
    pub struct ConfigResolver;
    
    impl ConfigResolver {
        pub fn resolve(cli_settings: Settings) -> Result<Settings, ConfigError> {
            let mut settings = Settings::defaults();             // 層1
            settings.merge(&Self::load_global()?)?;              // 層2
            settings.merge(&Self::load_project()?)?;             // 層3
            if let Some(f) = &cli_settings.paths.config_file {
                settings.merge(&Self::load_file(f)?)?;           // 層4
            }
            settings.merge(&cli_settings);                       // 層5
            Ok(settings)
        }
    }
    ```
* **テストコードによる検証:**
  1. 全5層の優先順位が正しいこと（下層→上層の順に上書きされる）
  2. -f 設定ファイルの指定がない場合（`config_file: None`）、層4がスキップされること
  3. 空のCLI設定（`Settings::defaults()`）で resolve してもエラーにならないこと
  4. 全層が同一設定値の場合、最終結果がその値になること（不変性）
  5. load_project がファイルを見つけられなくても全体が成功すること
* **計装方法・観測対象:** 一時ファイルを利用した統合テスト。各層の優先順位の検証。

---

### M7: InitRunner — 埋め込みアセット展開

> **DB:** ファイルI/O を使用（アセット書き出し + マニフェスト生成）

#### チケット M7-1: InitRunner::run() — アセット展開 + マニフェスト生成

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§6 Init コマンド)
* **依存・関連チケット:** M0-1（先行：EmbeddedAsset, AssetKind）、M0-2（先行：InitError）、M7-1 → M8（後続：main.rs で Init コマンド時に呼び出し）
* **対象不変条件 / 規範:** §6：ConflictPolicy に従ったファイル展開、マニフェスト書き出し
* **実装の背景と目的:** ビルド時にバイナリに埋め込まれたスラッシュコマンド定義（9種類のMarkdownファイル）を対象プロジェクトの `.claude/commands/` に展開する。競合が発生した場合のポリシー（3種）を実装し、展開後は `.claude/manifest.json` にマニフェストを書き出す。アセットの SHA-256 ハッシュも埋め込み、改ざん検出を可能にする。
* **実装スコープ:**
  - `InitRunner` 構造体＋`run()` メソッド:
    ```rust
    impl InitRunner {
        pub fn run(target_path: &Path, conflict_policy: &ConflictPolicy) -> Result<Manifest, InitError>
    }
    ```
  - `ConflictPolicy` 列挙型:
    - `PreserveAndSuffix` — 競合ファイルを `.bak` にリネームしてから新規作成
    - `OverwriteIfForced` — 上書き（force フラグ時のみ使用）
    - `RejectAndReport` — 競合がある場合はエラー（`InitError::Conflict`）
  - `embedded_assets()` -> `Vec<EmbeddedAsset>`: 9種のスラッシュコマンド定義（§9 ファイル一覧）
    - 各アセットの `include_bytes!` による埋め込み
    - 各アセットの SHA-256 ハッシュ計算（`sha2::Sha256`）
  - アセット展開ループ:
    - 各アセットの相対パスを target_path に結合
    - 競合ポリシーに従った処理
    - `create_dir_all` + `write` でファイル作成
  - マニフェスト（`Manifest`）の生成と書き出し（`target_path/.claude/manifest.json`）
    - `ManifestAsset` のリスト（logical_name, relative_path, sha256, asset_kind, version, compatible_runtimes, dependencies）
* **テストコードによる検証:**
  1. `InitRunner::run()` が全アセットを正しく展開すること
  2. 展開されたファイルの内容が `include_bytes!` の元データと一致すること
  3. マニフェストファイル（`.claude/manifest.json`）が正しく書き出されること
  4. `ConflictPolicy::RejectAndReport` で競合時に `InitError::Conflict` が返ること
  5. `ConflictPolicy::PreserveAndSuffix` で既存ファイルが `.bak` にリネームされること
  6. 空の target_path でもエラーにならず、新しいディレクトリが作成されること
  7. 展開された各ファイルの SHA-256 がマニフェストに記録された値と一致すること
* **計装方法・観測対象:** `tempfile::tempdir()` を使用した隔離テスト。展開された全アセットの内容検証。マニフェストJSONの構造検証。

---

## Phase 4: エントリポイント + 統合（Layer 3-4）

> **外部依存:** conver-core (WorkflowController, WorkflowRequest), conver-storage (FileBackend)

### M8: エントリポイント統合（main.rs）

> **DB:** ファイルI/O を使用

#### チケット M8-1: main() — エントリポイント + Init 特別処理 + Controller初期化

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (§8 エントリポイント)
* **依存・関連チケット:** M4-1（先行：Cli パース）、M6-3（先行：ConfigResolver::resolve）、M7-1（先行：InitRunner）、M5-1（先行：route）、M8-1 → M9（後続：受入テスト）、M8-1 → M10（後続：結合テスト）
* **対象不変条件 / 規範:** §8：main 関数の全5ステップの順序
* **実装の背景と目的:** CLI バイナリのエントリポイント。以下の5ステップを順次実行する：
  1. CLI パース（clap::Parser::parse）
  2. 設定解決（ConfigResolver::resolve）
  3. コントローラ初期化（FileBackend + WorkflowControllerImpl）
  4. Init コマンドの特別処理（他のコマンドと独立して実行可能）
  5. ルーティングと実行（route）

  Init コマンドは Controller を必要としないため、他のコマンドより先に特別処理する。これにより、未初期化のプロジェクトでも conver init が実行可能になる。
* **実装スコープ:**
  - `main.rs` の完全実装:
    ```rust
    fn main() -> ExitCode {
        // 1. CLI パース
        let cli = Cli::parse();
        
        // 2. 設定解決（5層マージ）
        let cli_settings = Settings::from_cli(&cli);
        let settings = ConfigResolver::resolve(cli_settings)
            .unwrap_or_else(|e| { eprintln!("設定エラー: {e}"); process::exit(1); });
        
        // 3. コントローラ初期化
        let backend = FileBackend::new(&settings.paths.workspace_root);
        let mut controller = WorkflowControllerImpl::new(backend, settings);
        
        // 4. Init コマンドは特別処理
        if let Command::Init(args) = &cli.command {
            return match InitRunner::run(&args.into, &controller.settings.install.conflict_policy) {
                Ok(manifest) => { println!("{}個のアセットを展開しました", manifest.assets.len()); ExitCode::SUCCESS }
                Err(e) => { eprintln!("初期化エラー: {e}"); ExitCode::FAILURE }
            };
        }
        
        // 5. ルーティングと実行
        match route(cli.command, &mut controller, settings) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => { eprintln!("エラー: {e}"); ExitCode::FAILURE }
        }
    }
    ```
  - `conver-core` の `WorkflowControllerImpl` が未実装の場合のスタブ対応:
    - 最小限の `WorkflowControllerImpl` スタブを `[::STUB::]` マーカー付きで提供（M8-1 の一部として許容）
    - スタブは常に `Ok(())` を返す（すべてのルーティングを成功させる）
* **テストコードによる検証:**
  1. `conver init --into /tmp/test` が InitRunner を呼び出すこと
  2. 設定解決エラー時に `ExitCode::FAILURE` が返ること
  3. Init 以外のコマンドで route() が呼び出されること
  4. route() のエラー時に `ExitCode::FAILURE` が返ること
  5. `--help` フラグでヘルプが表示されること（clap のデフォルト動作）
* **計装方法・観測対象:** `assert_cmd` を使用したバイナリテスト。`cargo run --bin conver` の実行結果検証。

---

### M9: 受入テストバイナリ（tests/test-run.rs）

> **DB:** メモリ内完結（CLIパース + MockController で検証）

#### チケット M9-1: test-run.rs — RFC_001 完了条件確認バイナリ

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (Appendix D 受入テスト)
* **依存・関連チケット:** M8-1（先行：main.rs 統合完了）、M9-1 → 完了条件 §C の全項目確認
* **対象不変条件 / 規範:** §C（完了条件1-7）、Appendix D（受入テスト仕様）
* **実装の背景と目的:** `cargo run --bin test-run -p conver-cli` で実行する独立した受入テストバイナリ。ユニットテストとは独立して RFC_001 の完了条件を人間可読な形式で出力する。このバイナリは CI パイプラインやリリースゲートで使用し、本RFCの実装完了を宣言するための客観的根拠を提供する。
* **実装スコープ:**
  - `crates/conver/rfc-001-cli/tests/test-run.rs`:
    - 全18種のコマンドパーステスト（clap の `try_parse_from` を使用し、実際のバイナリ実行は不要）
    - 5層設定マージの検証（各層の優先順位をプログラムで確認）
    - 互換レイヤ9種の変換検証
    - 全テストの PASS/FAIL を集計し、最終行に RFC_001 判定を出力
    - 出力形式:
      ```
      === RFC_001 受入テスト ===
      
        [TEST] Command: Init
          -> PASS: パース成功
        [TEST] Command: Grill
          -> PASS: パース成功
        ...
      
      --- Settings Merge ---
        [TEST] 5-layer merge (defaults < global < project < -f < flags)
          -> PASS: 優先順位確認済み
      
      --- Compat Layer ---
        [TEST] Compat: grill-me-for-rfc
          -> PASS: 互換変換成功
        ...
      
      ==============================
        Total: 18 passed, 0 failed
        RFC_001 Acceptance: PASS
      ==============================
      ```
* **テストコードによる検証:**
  1. 全18種のコマンド文字列が clap パース可能であること
  2. 設定マージの優先順位が正しいこと
  3. 互換レイヤ全9種が変換可能であること
  4. 最終行の PASS/FAIL 判定が正しいこと（1つでも FAIL があれば FAIL）
* **計装方法・観測対象:** `cargo run --bin test-run -p conver-cli` の実行。終了コードは常に 0（情報提供バイナリのため）。出力内容の目視確認または CI でのパース。

---

### M10: 結合テスト（tests/cli_integration.rs）

> **DB:** `assert_cmd` でバイナリ実行

#### チケット M10-1: cli_integration.rs — 結合テストスイート

* **参照設計書:** crates/conver/rfc-001-cli/RFC_001.md (結合テスト — tests/cli_integration.rs)
* **依存・関連チケット:** M8-1（先行：main.rs 統合完了）、M9-1（先行：受入テスト完了の確認後）
* **対象不変条件 / 規範:** 結合テスト仕様（§テスト > 結合テスト）
* **実装の背景と目的:** 実際のバイナリを実行してCLIの動作をエンドツーエンドで検証する。`assert_cmd` crate で `conver` バイナリを起動し、終了コードと標準出力/エラー出力を確認する。ユニットテストでカバーできない「実際のプロセスとしての挙動」（シグナルハンドリング、終了コード、標準エラー出力）を検証する。
* **実装スコープ:**
  - `crates/conver/rfc-001-cli/tests/cli_integration.rs`:
    ```rust
    use assert_cmd::Command;
    
    #[test]
    fn cli_help_succeeds() { /* conver --help → success */ }
    
    #[test]
    fn cli_rfc_help_succeeds() { /* conver rfc --help → success */ }
    
    #[test]
    fn cli_ticket_help_succeeds() { /* conver ticket --help → success */ }
    
    #[test]
    fn cli_unknown_subcommand_fails() { /* conver unknown-command → failure */ }
    ```
  - 追加の結合テスト:
    - `conver version` または `conver --version` がバージョン文字列を返すこと
    - `conver init --into <tmpdir>` が成功すること（ディレクトリ作成 + マニフェスト書き出し）
    - 不明な `--flag` が failure になること
* **テストコードによる検証:**
  1. `conver --help` が全サブコマンドを表示し、終了コード 0 で成功すること
  2. `conver rfc --help` が RFC サブコマンド一覧を表示すること
  3. `conver ticket --help` がチケット管理サブコマンド一覧を表示すること
  4. 不明なサブコマンドで終了コード非0 かつ標準エラー出力にエラーメッセージが出ること
  5. Cargo.toml に `assert_cmd` を dev-dependencies として追加すること
* **計装方法・観測対象:** `cargo test -p conver-cli` 全パス。結合テストが実際のバイナリを実行できることの確認。

---

## 実装順序サマリー

```text
Phase 1: 型定義基盤 (Layer 0)
  M0-1 → M0-2 → M1-1 → M1-2
  ↕                              ← M0-2 と M1 は並行可能
Phase 2: 純粋変換ロジック (Layer 1)
  M2-1 → M3-1 → M3-2 → M4-1 → M4-2 → M4-3 → M4-4 → M4-5 → M5-1
  ↑                            ↑
  M2-1, M3, M4 は並行可能        M3-2 は M5-1 の前提
Phase 3: ファイルI/O (Layer 2)
  M6-1 → M6-2 → M6-3 → M7-1
  ↑                            ← M6 と M7 は並行可能だが依存関係チェーン内は逐次
Phase 4: 統合 (Layer 3-4)
  M8-1 → M9-1 → M10-1
```

### クリティカルパス

最短実装ルート: `M0-1 → M1-1 → M1-2 → M2-1 → M4-1 → M5-1 → M8-1 → M10-1`

このパス上のチケットが遅延すると全体が遅延する。M3（互換レイヤ）、M6（ConfigResolver）、M7（InitRunner）はこのパスと並行して実装可能。

### フェーズ分割概要（Phase 1〜4）

```text
Phase 1 ──── M0 ── M1 ──── 型定義（外部依存ゼロ）
Phase 2 ──── M2 ── M3 ── M4 ── M5 ─ 純粋変換（clap derive のみ）
Phase 3 ──── M6 ── M7 ──────── ファイルI/O（std::fs の隔離テスト）
Phase 4 ──── M8 ── M9 ── M10 ── 統合・結合
```

---

## 完了条件との対応（RFC §C）

| 完了条件 | 検証チケット | 検証方法 |
|---------|-------------|---------|
| 1. 全Command → WorkflowRequest 変換可能 | M5-1 | ユニットテスト（MockController） |
| 2. 5層設定マージが正しく動作 | M6-3 | ユニットテスト（一時ファイル） |
| 3. `conver --help` が全サブコマンド表示 | M10-1 | 結合テスト（assert_cmd） |
| 4. `conver init` がアセット展開 + マニフェスト | M7-1, M8-1 | ユニットテスト + 結合テスト |
| 5. `conver cmd <legacy>` 互換動作 | M3-2, M10-1 | ユニットテスト + 結合テスト |
| 6. 親RFCと矛盾しない | M9-1 | 受入テスト |
| 7. `cargo test -p conver-cli` 全パス | M9-1, M10-1 | 全テスト実行 |

---

## チケット一覧（全18チケット）

| ID | タイトル | マイルストーン | フェーズ | 依存 | 並行可能 |
|----|---------|-------------|---------|------|---------|
| M0-1 | Crate構成 + lib.rs（モジュール宣言 + EmbeddedAsset + AssetKind） | M0 | Phase 1 | — | — |
| M0-2 | エラー型定義（ConfigError, RoutingError, InitError, CompatError） | M0 | Phase 1 | M0-1 | — |
| M1-1 | Settings構造体（10サブ設定） | M1 | Phase 1 | M0-1 | — |
| M1-2 | Mergeトレイト定義 | M1 | Phase 1 | M1-1 | — |
| M2-1 | Merge for Settings実装（全サブ設定フィールド上書き） | M2 | Phase 2 | M1-1, M1-2 | M3, M4 |
| M3-1 | CompatCommand列挙型定義（9種） | M3 | Phase 2 | M0-1 | M2, M4 |
| M3-2 | translate()関数（CompatCommand → WorkflowRequest） | M3 | Phase 2 | M3-1, M0-2 | — |
| M4-1 | Cli + Commandトップレベルパーサー | M4 | Phase 2 | M0-1 | M2, M3 |
| M4-2 | RfcCommandサブコマンド定義（5種） | M4 | Phase 2 | M4-1 | M4-3, M4-4, M4-5 |
| M4-3 | TicketCommandサブコマンド定義（7種） | M4 | Phase 2 | M4-1 | M4-2, M4-4, M4-5 |
| M4-4 | MalfeasanceCommandサブコマンド定義（4種） | M4 | Phase 2 | M4-1 | M4-2, M4-3, M4-5 |
| M4-5 | QualityCommand + RuntimeCommandサブコマンド定義 | M4 | Phase 2 | M4-1 | M4-2, M4-3, M4-4 |
| M5-1 | route()関数（Command → WorkflowRequest + 実行） | M5 | Phase 2 | M4-1, M0-2, M3-2 | M6, M7 |
| M6-1 | ConfigResolver::load_file() | M6 | Phase 3 | M1-1, M0-2 | M5 |
| M6-2 | ConfigResolver::load_global() + load_project() | M6 | Phase 3 | M6-1 | — |
| M6-3 | ConfigResolver::resolve() — 5層マージ統合 | M6 | Phase 3 | M6-2, M2-1, M6-1 | — |
| M7-1 | InitRunner::run() — アセット展開 + マニフェスト生成 | M7 | Phase 3 | M0-1, M0-2 | M6 |
| M8-1 | main() — エントリポイント + Init特別処理 | M8 | Phase 4 | M4-1, M6-3, M7-1, M5-1 | — |
| M9-1 | test-run.rs — RFC_001完了条件確認バイナリ | M9 | Phase 4 | M8-1 | — |
| M10-1 | cli_integration.rs — 結合テストスイート | M10 | Phase 4 | M8-1 | M9-1 |
