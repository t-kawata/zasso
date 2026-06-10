// build.rs が OUT_DIR に生成した定数ファイル（EDITION_SLUG, OS_TYPE）を取り込む
include!(concat!(env!("OUT_DIR"), "/generated_constants.rs"));

/// editions.json をコンパイル時にバイナリに埋め込む（`crate::consts::edition` から参照される）
pub(crate) const EDITIONS_JSON: &str = include_str!("../../../editions.json");

mod edition;
// 再公開する型・関数が現時点で外部から未参照のため lint を抑止する
#[allow(unused_imports)]
pub use edition::current_edition;
/// setup() フックから参照されるため未使用警告を抑止しない
pub(crate) use edition::ensure_edition_data_dir;
#[allow(unused_imports)]
pub use edition::EditionConfig;
#[allow(unused_imports)]
pub(crate) use edition::{edition_home, init_edition_home};

pub(crate) mod settings;
/// settings.rs の BIFROST_PORT を consts 直下に再公開する
pub(crate) use settings::BIFROST_PORT;
