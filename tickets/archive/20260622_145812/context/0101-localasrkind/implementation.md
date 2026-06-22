# 実装サマリ: LocalAsrKind 列挙型の定義 (M2-1 / #101)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/types.rs` | EDIT | LocalAsrKind enum 追加（SttEngine 直後） |

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check | ✅ 成功 |
| derive 属性 (Debug, Clone, Copy, PartialEq, Eq) | ✅ 確認 |
| voiput::LocalAsrKind アクセス | ✅ pub use types::* 経由で公開 |
| quality checks | ✅ 新規 issue なし（2件のhardcoded portは既存コード） |

## 次工程
M2-2 (SttEngine::Local) に進み、SttEngine に Local バリアントを追加する。
