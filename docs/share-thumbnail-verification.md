# ジョーバ 固定SNS画像とX共有

## 変更と保存範囲
- `assets/social-card.png`: 1200×630、195993 bytes、SHA-256 `ca1628d4b966986e7e53224c2c3b31a8ddb8d42e75290211453cef4e43fdfc5e`。
- 実ゲームの馬/競馬場/実カメラの描画を、通常の匿名開始操作で取得。描画や採点を改変せず、紹介用HTMLで「ジョーバ / JOHBA / 騎手視点3D競馬」とゲームルールに沿った説明を重ねた固定画像。名前、個別記録、テストスコア、開発HUDを画像に含めない。
- 原素材/構成画像の取得元: commit `c1acee3f75aef76fb4dd9f64802cead3eac3c30e`、[CI 41410612472](https://github.com/chameleonjp-lab/johba/actions/runs/41410612472)、artifact `13125731152`。素材1枚の取得はChromium。WebKitの素材取得のみ重複を避けて除外し、共有の可視受入は両engineで行う。
- OG/Twitterは同じ固定画像を参照。15言語のホーム/今回の結果の共有文末を `#ジョーバ #ゲーム制作` に統一。日本語正式名・既存URL・今回の順位/距離/スコアを保持。
- ホーム/結果に通常コピー専用ボタンは元から無い。`commonShareCopy` はXを開けない時だけのコピーdialogであり、残す。

## 検査
- `npm test`: 既存57＋画像共有3＋可視geometry等8。画像共有は未実装時3失敗→実装後3成功、可視geometryは旧判定で部分clip等3失敗→修正後6成功、全68成功。
- 新テストは15言語×ホーム/結果の正確な2tag、X加重280以内、固定PNG寸法、公開ステージへの全byte一致を検査。
- `tests/share-visible.spec.mjs`: 15言語縦＋ja/en/de横、Chromium/WebKitで36ケース。各画面の黒白X表示、44px、祖先非表示/透明でないこと、文字切れ、viewport内の全rectとoverflow祖先による部分clip、中心の押下対象、touch一回→intent一回、実本文一致、今回の点数保持を検査。代表24画面をartifactへ保存し実見する。
- 新capture/可視テストは全外部通信をroute.fulfill/abortで封鎖し、SW/WSも遮断。既Threeの固定npm実体のみローカルから返す。スコア送信はしない。
- カメラ安定は実追従目標との距離を3回連続観測。旧game pageを閉じた後、別pageで紹介構図を作るため、元描画loopのDOMを壊さない。
- 実機のiPhone Safari受入や、X本番カードのキャッシュ更新は未確認。画像先行CI成功を新製品差分の最終CI成功と読み替えない。

## 適用順と制約
1. このDraftの現在headで検査・レビューし、本人が既定公開用branch `claude/eager-wozniak-1oe5zz` へマージする。
2. 現在の正式/登録URLは `https://chameleonjp.codeberg.page/johba/`。GitHub PRのマージだけでCodebergへ同じ内容が届くとは断定しない。Codeberg側の実配信、または別途承認された移行の確認が必要。公開・登録切替をこのPRでは実行しない。
3. 実際の正式URLでHTML/PNGを静的確認してからXのカードを確認する。個人のX投稿は本人が確定する。
4. 戻す場合はこのPR差分をrevertし、最後に正常な公開版を既存手順で扱う。スコア/名前/音/言語の保存を消去しない。

検証workflowは既公開refだけをPages upload/deploy対象として明示し、非公開refの検証を本番concurrencyから分離する。検証用一時push対象は最終Draft前に復元する。公開設定や権限は変更しない。

実WebKit画像で言語選択欄が白地白文字になる既存不具合を確認したため、この欄だけ明示的な白背景/濃色文字へ統一する。native選択UI・矢印・言語値・保存/イベントは維持。15言語でcomputed色/実値と代表言語欄PNGを確認する。

結果の着順列は英独語のPlace/Platz末尾が馬番chipに重なる実不具合を修正。着順の非縮小幅を確保し、馬名列を残り幅内で折り返す。既存の順位値/並び/馬名/タイムは不変更。全15言語12頭・2桁順位についてtext Rangeとセル/隣列の非交差を検査し、英独語では旧24px列を隔離ページ内で再現したmutationが不具合を検出することも確認する。
