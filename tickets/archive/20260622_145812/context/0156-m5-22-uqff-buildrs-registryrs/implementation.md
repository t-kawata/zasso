# M5-2.2: UQFF モデル読み込み対応 — 実装サマリ

## 変更したファイル

### crates/ggufrs/build.rs
- MODEL_FILES に Gemma4 E2B/E4B のダウンロード URL を追加（Qwen3.5 エントリは維持）
- サブディレクトリ（gemma4-e2b-uqff/ 等）の自動作成に対応（create_dir_all を各ファイルの親ディレクトリに適用）
- ダウンロード失敗時にビルドをブロックしないよう assert! → 警告 + bool 返却に変更
- ファイル不在時の存在確認を assert! → cargo:warning に緩和

### crates/ggufrs/src/registry.rs
- インポート追加: UqffMultimodalModelBuilder（mistralrs v0.8.1 の UQFF 用ビルダー）
- build_model_with_gguf() 関数抽出（get() の責務整理）
- build_model_with_uqff() 関数追加（UqffMultimodalModelBuilder を使用）
- model_name_to_uqff_repo() ヘルパー追加（モデル名 → HF リポジトリ名）
- get() に拡張子分岐ロジック追加（.gguf → GGUF, .uqff → UQFF, 不明 → エラー）
- テスト 6 ケース追加（UQFF 分岐、未知拡張子、GGUF 維持、リポジトリ名マッピング x3）

### 発見事項
- mistralrs v0.8.1 には UqffVisionModelBuilder は存在せず、代わりに UqffMultimodalModelBuilder を使用
- UqffSource 列挙型は存在せず、uqff_file: Vec<PathBuf> で直接ファイルパスを指定
- UqffMultimodalModelBuilder::build() は anyhow::Result<Model> を返す（GgufModelBuilder と異なる）

## 検証結果
- cargo clippy -- -D warnings: clean
- cargo test: 174 tests passed（既存168 + 新規6）, 0 failed
- cargo fmt: clean
