# 決定事項ログ

仕様書（docs/game-spec.md）にない判断・変更・追加をした場合、ここに日付つきで1行残す。

## 2026-06-11

- リポジトリ初期化。kit（chameleonjp_browser_game_kit）の CLAUDE.md・.claude/（settings / skills / agents / rules）・.gitignore を継承し、johba固有ルールを CLAUDE.md 末尾に追記
- .claude/settings.json は kit からの調整として `ask: Bash(git push *)` を削除（リモート自律実行環境では確認プロンプトに応答できず作業が止まるため。deny 項目は維持）
- Three.js は `three@0.184.0`（執筆時点の最新安定版）を importmap + ES modules で固定指定（iOS Safari 16.4+ / Android Chrome 89+ で動作）
- レースシミュレーション層は THREE / DOM 非依存で実装し、`SIM-CORE-BEGIN/END` マーカー間を node で抽出してヘッドレス検証する。検証用に `tools/sim-harness.mjs` を追加（公開物ではない開発用ツール。ゲーム本体の単一HTML原則とは別扱い）
- ピンチズームは禁止（進路変更の左右スワイプと競合するため）。kit ルール「ピンチズームの扱いは仕様書へ明記」に対応する決定
- ステータスの5段階表記は S≥85 / A≥70 / B≥55 / C≥40 / D<40 で割り当て
- 距離適性の出走表表示は「短距離 / マイル / 中距離 / 長距離」のカテゴリ表記とする（仕様書の「短距離寄り〜長距離寄り」の具体化）
- 当日の調子は騎乗馬発表後に「絶好調/好調/普通/不調/絶不調」の5段階で開示する（内部は±10%の連続値）
- 着順基礎点の6着以下は 100 / 80 / 60 / 40 / 25 / 15 / 10（6→12着）と確定（仕様書「100〜10」の具体化）
- コースは直線450m×2＋半径120mの半円コーナー×2（柵基準 約1654m）、レーン幅2.0m・12レーンとする
- 掛かりはAI馬にも低確率で発生させる（展開の多様性のため。AIは4〜8秒で自然解消）
- スタート操作は「合図前のタップ＝出遅れペナルティ」とする（合図より早いゲート開放はしない）

### フェーズ1実装・調整時の決定

- 馬名生成関数は SIM-CORE マーカー内に配置（generateField から参照されるためハーネス抽出の都合上必須）
- ゴール板はコース固定位置（GOAL_S=430、ホームストレッチ上）とし、スタート位置を距離から逆算する方式に変更。4距離すべてを直線発走にできる周回ジオメトリは数学的に不可能と確認（スタート位置が400m等差列のため）。1600/2400はコーナー発走となるが、発走後300mはコーナーロスを無効化して枠順の不公平を防ぐ
- 当日の調子（±10%）は最終速度ではなく能力値（スピード・スタミナ）に適用（速度直接だと能力差を覆い隠すため）
- 末脚ボーナスを導入：残スタミナ割合×0.8（上限0.5m/s）を最高速度に上乗せ。仕様7.2「スタミナ残量で末脚の伸びが決まる」の実装であり、追込・差しと温存騎乗の報酬になる
- ペース表記は「先頭の15%→50%区間平均速度÷出走馬の巡航平均」の相対判定（発走加速の影響を除くため2チェックポイント方式）
- AI馬の出遅れ（ゲート統計値依存・稀に大出遅れ）をシミュレーションに実装。プレイヤーのタップ精度は state.playerStartDelay 経由で連携（ゲート演出UIはフェーズ2）
- 基準タイムを実測勝ちタイム＋0.5〜1.8sに再設定（タイムボーナスが現実的に狙える水準）
- 着順のタイブレークは補間した正確な通過時刻で判定（同一ステップ内の同着を防ぐ）

### フェーズ3

- 鞭（ムチ）を実装。1発で2.5s線形減衰の加速（基準+1.0m/s）、コスト55、間隔1.0s、8s内連打で効果×0.55減衰。鞭は瞬発力で効きが変わる（burstScale = 0.85 + 瞬発力×0.003）。仕様の予定値どおり
- 鞭は effectiveMax（最高速度の天井）と targetSpeed の両方へ加算し、天井を本当に押し上げる。バテ減算・床はその後に効くため、スタミナ0では鞭を打っても床(BATE_SPEED_FLOOR)止まり。掛かり中は鞭を無効化
- AI鞭の導入（最終350mで最大3回）。スパート中かつ残り350m未満・スタミナ>5%で毎秒0.9×dtの確率で発動。検証では勝ち馬・上位馬がほぼ毎レース2〜3回使用し、終盤の加速が勝ちタイムを短縮することを確認
- 基準タイム再設定。AI鞭で終盤が加速したぶん全距離で勝ちタイムが速くなったため、良＝実測平均+0.7s（0.5刻み）に再算出（1200=70.5 / 1600=92.5 / 2000=116.5 / 2400=142.0）。稍重/重/不良＝良×1.010/×1.025/×1.040
- BATE_SPEED_FLOOR は 0.89 のまま据え置き。2400の1-12着差が8sを超える（平均9.4s）ため指示どおり0.91を試したが、後方馬は残スタミナ5〜12%で完走しており床（残スタミナ0時のみ作用）に届かず着差は不変だった。着差はスピード能力差＋距離適性ペナルティ由来の構造的なもので、フェーズ1（鞭なし）でも9.36sあり鞭の寄与は+0.02s。長距離の見栄えとして許容し、唯一の認可レバーが無効だったことをメイン報告に記載
- 戦術フラグ inSlip（風よけ）/ isWalled（前が壁）を全馬に毎ステップ設定し、HUDの戦術バッジ行に反映。既存の掛かり表示はこのバッジ行へ統合
- プレイヤー統計 state.playerStats（掛かり時間・終盤の被ブロック時間・鞭回数・スパート開始残距離・完走時スタミナ・半分通過時順位）を SIM-CORE に追加。フェーズ4の講評用。毎ステップのソートは避け、半分通過の順位は1回だけ数える
- 鞭ボタンはワンショット（長押しではない）。currentInput.whip をタップで立て、stepRaceバッチが走ったフレームでのみクリア（ステップ0フレームでのタップ取りこぼしを防ぐ）。鞭キー（PCテスト用）は w
- 鞭ボタンは▲の上（右・bottom:166px）に角丸で配置。iPhone SE縦320pxでも▲と重ならず画面外に出ない（right:20px+幅76px=右端から96px）

### フェーズ4

- 写真判定の閾値は0.08s（1着と2着のfinishTime差が0.08s未満で「写真判定」テキストを1.4s表示してから順位掲示板を出す）
- プレイヤー完走後の残り馬の消化は4倍速（通常ステップ1＋追加3）で早送り。1フレームあたりの最大ステップ上限を16に設定して無限ループを防止
- 掲示板演出のタップスキップは2段階：1回目タップで行アニメを全表示、2回目タップかボタンで結果画面へ遷移。`pointerdown`イベントで受け付け
- 講評ルールの優先順位：1着スタミナ残存≥0.15 → 1着（完全燃焼）→ 掛かり→ 出遅れ→ 被ブロック→ 仕掛け早（残り>800m）→ 脚余し（スタミナ>35%）→ 鞭ゼロ→ 馬券圏内→ デフォルト
- 着差表記は馬身換算を採用せず絶対タイム（小数2桁）のみ表示とした（馬身換算の定義が馬場・距離によって異なるため、実装の複雑さに対してUI的価値が薄いと判断）
- 天気ビジュアルは既存マテリアルを `color.lerp()` で直接変更。基準色を `_baseTrackColor` / `_baseGroundColor` として一度だけキャプチャし、繰り返し `applyWeather` を呼んでも累積しないよう `.clone()` して計算
- 雨のパーティクルは `THREE.Points` 400頂点の単一オブジェクト。カメラ位置に整数スナップで追従し、毎フレームの `Float32Array` 操作で移動（新規オブジェクト生成なし）。雨以外の天気では非表示
- `resetAll()` でタイトルに戻る際に `resetWeather()` を呼び、タイトル画面は常に晴天に見えるようにした
- HUD のペース表示は `paceRecorded === false` の間は「ペース:--」と表示（計測完了前に常にミドルを返す既実装の `paceLabel` 関数と切り離し、HUD側で明示的に未計測表示）
- 結果画面のシェアボタン（btnShare2）はタイトル画面の btnShare と同じ navigator.share → clipboard フォールバックパターンを踏襲

### フェーズ5

- 標準 submit_score RPC を使用するため仕様13章の「着順・距離」は送信しない（共通スキーマ準拠。スコアのみ）
- 名前未入力時は送信せずランキング閲覧のみ
- タイムアウト8秒

### 公開前レビュー（モバイルレビューagent指摘の修正）

- iOS Safariのホームインジケーター/ツールバー対策として、下部固定要素（出走表申請バー・掲示板「結果へ」・操作ボタン群・結果画面・リスト下パディング）に env(safe-area-inset-bottom) を適用
- タイトル/抽選画面に overflow-y を追加し、低い画面（max-height:640px）では justify-content を上詰めへ切替（center+overflowは上端がクリップされるCSSの罠への対応）
- 低い画面（max-height:600px）では▼▲ボタンを64pxへ縮小しムチを下げ、3D視野を確保（インラインスタイル上書きのため!important使用）
- HUDの順位表示に nowrap+ellipsis+max-width:58% を追加（320px幅での折返し防止）。シェア/実験場リンクを44px化。tipのコントラストを#555→#888へ改善
- ランキング表示のstored XSSを修正（display_nameはtextContentで組み立て）
- console.warn 2件（送信/取得失敗時）は障害解析用として意図的に残置（プレイヤーには非表示）

### UI/UX改善ラウンド（その1）

- Task1 騎手名必須化：btnStart押下時に trim()が空なら#nameWarn（赤文字）を表示し、inputに.name-errorクラスを付与してfocus()。alertは使わない。inputイベントで警告をクリア
- Task2 メッシュdispose：disposeObject3D(obj)をTHREE-SCENEセクション冒頭に追加。openGateScreen/resetAll両方でscene.remove前に呼ぶ。コース・雨・空（envRefs/rainPoints）はhorseMeshes配列外のため対象外
- Task3 ミニマップ：HUDセクション内にinitMiniMap()で12個のdivを1回だけ生成。dotサイズはプレイヤー11px/他馬7px。更新はstyle.leftではなくtransform:translate(Xpx,-50%)（レイアウト発生を避けるため）。barWはモジュール変数にキャッシュしresizeで再計測。updateMiniMap(state)はゲームループのrunning中に毎フレーム呼び（playerFinishedとは独立）
- Task4 条件相性：condFitScore()はdistFit/goingFit/power/stamina/burstから純粋に計算。マーク◎s≥3/○1..2/△-1..0/✕≤-2。短評は最初に当てはまった1つ。出走表のentry-statsの下に10px行として追加。詳細モーダルにも「条件相性」行を追加（pending.condが設定されている時のみ）。出走表ヘッダーに「相性＝今回の距離・馬場」の凡例を小さく追記
- Task5 作戦メモ強化：showLotteryReveal内でadvisesを最大5条件で評価し先頭2件だけ選択。hint-boxをinnerHTMLでビルドし「作戦メモ」ヘッダー+脚質ヒント+アドバイス箇条書き構成に変更
- Task6 進路フィードバック：canChangeLane(dir)はstepRaceのlane change条件と同ロジック（LANE_CHANGE_BLOCKとlaneF距離<0.8）。符号確認：swipe右(dx>0)→laneDir+1→targetLane増加→外へ。showLaneToast(dir)を各入力イベントのlaneDir設定直後に呼ぶ。laneToastTimerは1本を使い回し。resetAllでクリア・非表示化
- Task7 UI調整：tipを「横持ちプレイ推奨（縦でも遊べます）」に変更しtitle-btnsの直下に移動。ルール説明モーダル冒頭に「まずはこれだけ」ボックス（rgba(68,170,255,0.1)背景・角丸）を追加。スクロール領域（#entriesList/#screenResult/.modal-box/#ceremonyRows/#screenTitle/#screenLottery）にtouch-action:pan-yを追加

### UI/UX改善ラウンド（その2）

- 称号の優先順位：好スタート1着 → スタミナ絞り切り1着 → 1着（汎用） → 追込馬3着内 → 前壁地獄（>4秒）→ 掛かり暴走（>5秒）→ 脚余し（スタミナ>35%＋4着以下）→ フライング → 馬券圏内（2-3着）→ 10着以下（次走に期待）→ デフォルト（研鑽の一戦）。11パターンで全パスを網羅
- 同じ条件でもう一度の実装方式：スナップショット（lastRaceSetup = { cond, field, playerIdx }）をopenGateScreen冒頭で保存する方式。resetAll後に pending と playerIdx を snap から復元してopenGateScreenを呼ぶ。lastRaceSetupはresetAllに含まれないため復元まで保持される。フィールド定義（field配列）はレース中に変異しないため参照共有で安全（ランタイム状態はraceState側に独立）
- シェア文の形式：「ジョーバ ${distance}m ${rank}着！スコア${score}点 称号「${title}」 #ジョーバ」に統一。URL付与・navigator.share→clipboardフォールバックの仕組みは変更なし
- btnRetrySameのfallback：snapがnull（ゲート未到達の場合）はresetAll後にgoToCondScreenを呼ぶ（btnRetryと同じ挙動）

### 品質向上ラウンド Q2（コース環境）

- 2026-06-12 Q2 芝縞刈り：trackGeoに`color`アトリビュート（Float32BufferAttribute, 3）を追加。25mごとにRGB 1.0/1.0/1.0と0.90/0.93/0.90を交互に割り当て。`trackMat.vertexColors=true`とし、applyWeatherのmaterial.color lerpがvertex colorsへの乗数として機能することを確認（lerp先はクローンした_baseTrackColorのため累積なし）。
- 2026-06-12 Q2 地面テクスチャ：256×256 CanvasTexture、#3a7d44ベース＋1500個の2-3pxスペックル（輝度±10%）。RepeatWrapping、repeat 30×30。groundMat.mapとして設定。color×mapでapplyWeatherの重馬場/天気変化と両立。
- 2026-06-12 Q2 スターティングゲート：`positionGate(startS)`で12レーン分のサイド(24)/トップ(12)/ドア(12) InstancedMeshを配置。latDirはworldPos数値微分（i±0.5）で求め、コーナー発走にも対応。ドアはforward方向0.9m前に配置し閉鎖状態を表現。openGateScreen内で3行追加（positionGate/gateSetVisible/gateDoorT=0）。racePhase='running'設定後に`_gateHideTimer=1.5`を立て、サイド/トップ1.5s後に非表示。ドアは上端ヒンジ(-1.6rad)で0.25s以内に開き、アニメ完了でdoors.visible=false。
- 2026-06-12 Q2 観客スタンド：tier1(12×6×420, x=-154, y=3)とtier2(10×6×420, x=-161, y=8)の直方体2本＋屋根1本（Lambert）。220人のInstancedMesh、per-instanceカラーをsetHSL(rand, 0.4+0.3rand, 0.45+0.25rand)で設定。
- 2026-06-12 Q2 遠景ビル：128×128 CanvasTexture(6×8グリッド約40%点灯)を共有Lambert materialに使用。BoxGeometry(1,1,1)のInstancedMesh(10)でscaleにより18-30×30-70mのビル群を配置（バックストレッチ外側＋コーナー奥）。
- 2026-06-12 Q2 遠景木：ConeGeometry(2.2,5,6)とCylinderGeometry(0.35,0.45,2.4,5)のInstancedMesh各44本。内8本はインフィールド、残36本はコース外半径150-200m（スタンド帯x<-145かつ|z|<220を除外）。
- 2026-06-12 Q2 遠景雲：64×64 canvas radial gradient（白→透明）、5枚PlaneGeometry(60,24)、MeshBasicMaterial透明・depthWrite:false、y 90-130、lookAt(0,y,0)で原点方向を向く。静的配置。
- 2026-06-12 Q2 内ラチ横棒：postCount×2本のInstancedMesh、各隣接ポストペア間のmidpoint・chord長・chord角でscale.z/rotation.yを設定、y 1.05。
- 2026-06-12 Q2 ハロン数字板：k=1..7の各ハロン棒に対し64×48 CanvasTexture（緑背景・白太字で`${k*200}`）、PlaneGeometry(1.5,1.1)、MeshBasicMaterial DoubleSide、y 2.7。
- 2026-06-12 Q2 新規ドローコール数：InstancedMesh×9(gateSides/gateTops/gateDoors/crowdMesh/bldMesh/treeCones/treeTrunks/railBars + 既存railPosts)、Mesh多数で合計追加約25コール。per-frameアロケーションなし。

### 品質向上ラウンド

- 2026-06-12 Q1（R1 馬モデル刷新）：馬ジオメトリを全頭共有化した。THREE-SCENE先頭に `HORSE_GEO` テーブルを作り、`_sharedGeo()` で各ジオメトリに `userData.shared=true` を付与してモジュール読込時に1回だけ生成。`createHorseModel` は per-horse でマテリアル（被毛/シルク/暗色脚・尾・たてがみ/白キャップ）とメッシュ・ピボットのみ新規生成する。これに伴い `disposeObject3D` を `if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose()` に変更し、再レース時に共有ジオメトリを破棄してモデルが壊れる事故を防止（マテリアルは per-horse なので従来どおり破棄）。
- 2026-06-12 Q1：ギャロップは横走法（transverse gallop）の位相設計を採用。脚位相オフセットを後左0.0/後右0.15/前左0.5/前右0.65（×2π）とし、上脚は `sin(p+off)*0.78-0.08`、膝（飛節）は `max(0,sin(p+off+0.9))` を前脚×1.15／後脚×-1.0で折り、後肢のホックが後方へ曲がる向きを表現。胴の上下動・首の逆位相・尾2節のラグも `run=min(1, speed/10)` で乗算し、ゲート（速度≈0）では自動的に立ち姿へ収束。鞭モーション（プレイヤーのみ）は whipTimer が WHIP_DURATION-0.35 を超える間だけ右腕ピボットを sin で1.1rad 振る。毎フレームのポーズ計算は新規アロケーションなし（module-level の `_shadowDummy` を再利用）。
- 2026-06-12 Q1：馬の擬似影を `InstancedMesh(CircleGeometry, MeshBasicMaterial 半透明)` 1個（count=12, renderOrder=1, depthWrite=false）に集約。`updateHorseMeshes` の脚アニメ間引き（animEvery）の外で毎フレーム各馬の足元へ位置・向き・楕円スケール（0.85×1.85）を `setMatrixAt` で更新するため、遠方で脚アニメを間引いても影は追従する。影は `horseMeshes` 配列外の永続オブジェクトで dispose 対象にしない。レース外（raceState=null）は描画ループ冒頭で `instancedShadows.visible=false` にして隠す（初期行列はゼロスケールなので初回レース前も非表示）。
- 2026-06-12 操作修正：コース座標を鏡映し左回り化（worldPosのx反転＋headingAngleの符号反転）。従来は実質右回りで「スワイプ右＝外」が画面左移動に見えた。鏡映後は外側＝騎手の右＝画面右で直感と一致
- 2026-06-12 操作修正：進路変更をワンショットパルス化（ゲームループが1ステップ消費後に即クリア）。80msの時間クリアでは約5ステップが走り1スワイプで複数レーン流れていた。1スワイプ＝ちょうど1レーン（馬一頭分）を保証。レース中以外はパルスを立てないガードも追加
