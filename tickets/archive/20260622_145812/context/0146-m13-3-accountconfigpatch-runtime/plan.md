# #146 実装計画

## 要件
reactor.rs:179 UpdateAccountConfig スタブを解決。

## 変更ファイル
| ファイル | 種別 | 内容 |
|---------|------|------|
| config.rs | 修正 | AccountConfig::apply_patch 実装 |
| state.rs | 修正 | AccountEntry::apply_patch 追加 |
| reactor.rs | 修正 | UpdateAccountConfig ハンドラ実装 |

## 実装手順
1. config.rs: apply_patch (各 Some フィールドを反映)
2. state.rs: apply_patch (委譲)
3. reactor.rs: ハンドラ書き換え + [::STUB::] 除去
4. 検証
