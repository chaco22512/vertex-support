# SIM Customer Support Bot — 構築仕様書 v1.5

作成日: 2026-07-08 / v1.4→v1.5 の変更（ブランド刷新）: サービス名を **Vertex Support → SIM Point Support**、運営元を **Vertex Digital Marketing → SIM Point** に全面変更。ロゴを新SIM Pointロゴ（`assets/image.avif`→webp/png、S/Pマークを正方形に切り出し）に差し替え。ブランドカラーをレッド系からオレンジ系へ（--brand-orange #E89828 / --accent #C2410C[白文字AA] / --accent-soft #FDECE0 / --bubble-customer #FFF3E6）。旧Vertexレッド（#FF1616/#C81010）は全廃。本番URLを vertex-* → simpoint-*（Cloudflare Workers/Pages）へ移行。内部パッケージ名 @vertex/* とgitリポジトリ名は変更対象外（将来の任意タスク）。
v1.3→v1.4 の変更: 納品ドキュメント要件（第11章）を新設。非エンジニアのCSスタッフ向け「運用ルールブック」とテスト手順書を必須納品物に追加。
v1.2→v1.3 の変更: 顧客チャットを「カテゴリ選択ファースト」のガイドフローに変更（第6章全面改訂）。カテゴリ定義 menu_categories.json を追加。AIプロンプトのカテゴリスコープ化（4.1）、conversations.topic_category 追加。
本書は実装担当（Claude Code 等）にそのまま渡すことを想定した仕様書である。不明点は実装前に発注者へ確認すること。

---

## 1. プロダクト概要

外国人向けSIMカード販売会社のカスタマーサポートを半自動化するWebアプリケーション。

- 顧客は自社Webチャット（Phase 1）で問い合わせる。AIがサポートマニュアル（DB化済み）に基づき顧客の言語で即時回答する
- AIが回答できない/してはいけない内容はエスカレーションし、Slack通知を受けたローカルスタッフが24時間以内に返信する
- adminはナレッジ（ルール・手数料）の編集、問い合わせ管理、スタッフ管理を行う
- 問い合わせ規模: 約10件/日。設計は簡素さと無料枠運用を最優先する

対応言語: 英語 / インドネシア語 (Bahasa) / タガログ語 / ネパール語 / ベトナム語。UIの固定文言は5言語、AI回答は顧客の入力言語に自動追従。

### Phase 1 スコープ
1. 顧客向けWebチャット（1ページ）
2. AI回答パイプライン（Gemini API 無料枠）
3. エスカレーション（Slack通知 + 顧客連絡先収集 + メール通知）
4. admin画面（Inbox / 会話詳細・返信 / ナレッジ管理 / 承認待ちキュー / スタッフ管理 / 変更履歴）

### Phase 1 非スコープ（Phase 2 以降）
- WhatsApp / LINE / Messenger 接続（DB・APIはチャネル追加前提で設計。conversations.channel 参照）
- Slackスレッドからの直接返信
- 月額プラン料金の回答（恒久的にAI回答禁止。外部価格表は取り込まない）
- 分析ダッシュボードの高度化

---

## 2. 技術スタック（すべて無料枠）

| レイヤー | 採用技術 | 備考 |
|---|---|---|
| 顧客チャット | Preact または vanilla JS + Vite、Cloudflare Pages | 軽量最優先（第5章の性能予算参照） |
| admin | React + Vite、Cloudflare Pages | 同一リポジトリ内 /chat, /admin |
| API | Cloudflare Workers（Hono 推奨） | REST。Render 無料枠でも代替可 |
| DB / 認証 | Supabase（Postgres + Auth + RLS） | admin/staffのみAuth。顧客は匿名セッション |
| LLM | Gemini API 無料枠（gemini-2.5-flash 系） | 実装時に最新の無料枠モデル名を確認 |
| スタッフ通知 | Slack Incoming Webhook | チャンネル: #cs-escalation（仮） |
| 顧客メール通知 | Resend 無料枠 | 送信元ドメインは発注者に確認 |

### セキュリティ原則
- APIキー（Gemini/Resend/Slack）は Workers 環境変数のみ。クライアントに一切出さない
- 顧客入力はLLM送信前にPIIマスキング（電話番号・メール・ICCID等10桁以上の数字列をプレースホルダー化。マスク前原文のDB保存は可）
- チャットAPIはセッショントークン必須 + レート制限（同一セッション 10req/分）
- admin APIは Supabase Auth JWT 必須。RLSで staff ロールは kb_rules 書き込み不可

---

## 3. データモデル（Supabase / Postgres）

```sql
create type audience_t as enum ('customer','internal');
create type rule_status_t as enum ('active','pending_review','disabled');
create type channel_t as enum ('webchat','whatsapp','line','messenger');
create type conv_status_t as enum ('ai_handling','escalated','staff_replied','resolved','closed');
create type sender_t as enum ('customer','ai','staff','system');
create type role_t as enum ('admin','staff');

create table kb_rules (
  id            text primary key,          -- 'R001' 形式。インポートデータのIDを維持
  category      text not null,
  subcategory   text default '',
  rule_text     text not null,
  date_updated  date,
  fee_amounts_jpy integer[] default '{}',
  links         text[] default '{}',
  audience      audience_t not null,
  ai_can_answer boolean not null,
  requires_fee_disclaimer boolean not null default false,
  status        rule_status_t not null default 'active',
  review_reason text default '',
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);

create table kb_change_log (
  id serial primary key,
  rule_id text not null references kb_rules(id),
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  before jsonb not null,
  after  jsonb not null
);

create table staff (
  id uuid primary key references auth.users(id),
  name text not null,
  email text not null,
  role role_t not null default 'staff',
  languages text[] not null default '{en}',   -- 'en','id','tl','ne','vi'
  channels channel_t[] not null default '{webchat}',
  slack_member_id text default '',
  is_active boolean not null default true
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  channel channel_t not null default 'webchat',
  session_token text unique not null,
  language text not null default 'en',
  status conv_status_t not null default 'ai_handling',
  source_tag text default '',
  topic_category text default '',             -- 顧客が選択したメニューカテゴリid（menu_categories.json）
  contact_email text default '',
  contact_whatsapp text default '',
  assigned_staff uuid references staff(id),
  escalated_at timestamptz,
  reply_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id serial primary key,
  conversation_id uuid not null references conversations(id),
  sender sender_t not null,
  staff_id uuid references staff(id),
  body text not null,
  ai_meta jsonb,   -- AI回答時: {escalate, reason, rule_ids, model}
  created_at timestamptz not null default now()
);

create table reply_drafts (   -- adminの返信下書き自動保存用
  conversation_id uuid primary key references conversations(id),
  staff_id uuid not null references staff(id),
  body text not null default '',
  updated_at timestamptz not null default now()
);
```

### 初期データ投入
- `kb_rules_import.json`（同梱、695件）をインポート
- `needs_review = true` の42件は `status = 'pending_review'`（AIプロンプトに含めない）、それ以外は `status = 'active'`
- インポートスクリプト `scripts/import_kb.ts`（idでupsert、再実行可能）

---

## 4. AI回答パイプライン

### 4.1 プロンプト構築（リクエストごと）★v1.3変更: カテゴリスコープ化
1. conversations.topic_category を参照し、`menu_categories.json` の kb_categories に該当する `kb_rules`（status='active' AND audience='customer'）を取得する。topic_category が 'others' または未設定の場合は全カテゴリを取得（約550件でも3万トークン弱なので許容）。スコープ化により該当カテゴリでは精度が上がり、トークンも減る
2. カテゴリごとに整形してシステムプロンプトへ。各ルールは `[R123] rule_text (fees: ¥4,000) (link: URL)` 形式
3. 会話履歴（当該conversationの直近20メッセージ）をmessages配列で渡す

### 4.2 システムプロンプト要件（英語で記述）
必ず含める指示:
- You are a customer support agent for a SIM card company serving foreign residents in Japan
- Answer ONLY based on the rules provided below. Never invent rules, fees, or procedures
- Reply in the customer's language (the language of their latest message)
- NEVER state monthly plan prices, COD prices, or discount amounts. If asked, escalate
- Fixed fees listed in the rules MAY be quoted, but ALWAYS append: "Final amount will be confirmed by our staff."（顧客の言語で）
- NEVER mention internal systems, staff names, Slack, Kintone, AR, or internal links
- When a rule has a tutorial link, include the link in your answer
- Keep answers short: 2-4 sentences per point, plain words, no jargon. Break steps into a numbered list
- If about: billing disputes, refunds in progress, account-specific status, complaints, cancellation execution, or anything not covered by rules → escalate
- 出力は必ず次のJSONのみ:

```json
{
  "answer": "顧客向け回答文（顧客の言語）",
  "escalate": false,
  "reason": "none | price_question | not_in_manual | account_specific | complaint | other",
  "rule_ids": ["R045", "R102"],
  "detected_language": "en"
}
```

- `escalate: true` でも `answer` に「スタッフが24時間以内に回答します」の旨を顧客の言語で入れる
- JSONパース失敗は1回リトライ、それでも失敗なら escalate にフォールバック

### 4.3 引用トレーサビリティ
`rule_ids` を `messages.ai_meta` に保存。admin会話詳細で「AIの回答根拠ルール」を表示（誤答時のナレッジ修正を高速化）。

### 4.4 補助利用（adminのUX機能で再利用）
同じGemini呼び出し基盤を、adminの (a) 顧客メッセージの機械翻訳表示、(b) スタッフ返信のAIドラフト生成、に再利用する（第7.3章）。

---

## 5. UX・デザイン要件（顧客・admin共通）★v1.1新設

### 5.0 設計思想
2種類のユーザーを明確に分けて設計する。

- 顧客: 日本在住の外国人。多くが廉価Android・従量制の限られたデータ通信・第二言語での読み書き。SIMが使えず不安な状態でアクセスすることが多い。→ **軽い・速い・平易・安心感**
- スタッフ/admin: 1日10件を素早く捌きたい。複数言語の顧客に対応するが全言語は読めない。→ **最短クリック・キーボード操作・翻訳補助**

「使いやすさ」は装飾ではなく、上記2ペルソナの摩擦を削ることと定義する。

### 5.1 ブランディング（★v1.5改訂: SIM Point へリブランド）
サービス名（表示名）: **SIM Point Support**。運営元表記: SIM Point。

ブランドアセット（同梱、リポジトリ /assets に配置）:
- `logo-mark.png` — ロゴマーク（横長ロゴから S/P マーク部分を正方形に切り出したラスター、128x128 透過PNG）。用途: チャットヘッダー、AI/スタッフのアバター、favicon、admin左上
- `logo-horizontal.webp` / `logo-horizontal.png` — 横長ロゴ（SIM Point）。用途: adminログイン画面、メールテンプレートのヘッダー。原本は `image.avif`
- favicon は `logo-mark.png`、apple-touch は `apple-touch-icon.png`（180px）

ブランドカラー（ロゴから抽出した正式値）:
- Brand Orange: **#E89828**（ロゴ原色。ロゴ・アイデンティティ表現用）
- Brand Yellow: **#FFCF00**（差し色。使用は小面積に限定）
- Wordmark Black: #111111

**使用上の必須ルール**: ブランドオレンジの使用箇所は「ヘッダーのロゴ」「主要ボタン（暗色化した --accent）」「選択状態」に限定する。旧Vertexレッドは全廃。エラー/警告表示は必ずアイコン+文言を伴わせ、色だけで意味を伝えない。danger（赤）は --accent（オレンジ）と隣接させず、両者が明確に区別できること。背景を単色で塗る全画面バナー等は禁止。

### 5.1.1 デザイントークン（両画面共通。CSS変数で実装）
| トークン | 値 | 用途 |
|---|---|---|
| --bg | #FAFAF8 | ページ背景 |
| --surface | #FFFFFF | カード・バブル |
| --ink | #1E262C | 本文テキスト |
| --ink-muted | #6B7680 | 補助テキスト |
| --brand-orange | #E89828 | ロゴ・アイデンティティのみ |
| --accent | #C2410C | 主要ボタン・リンク・選択状態（白文字とのコントラストAA確保のためブランドレッドを暗色化した実用色） |
| --accent-soft | #FDECE0 | 選択ピル背景・ホバー |
| --brand-yellow | #FFCF00 | 小面積の差し色（未読バー、"Answered by AI"ドット等） |
| --bubble-customer | #FFF3E6 | 顧客バブル背景（ブランドイエローの淡色。赤系を避け警告感を回避） |
| --success / --warning / --danger | #2E7D32 / #B26A00 / #C62828 | ステータスバッジ（背景は各10%淡色。dangerは--accentと隣接させない） |
| --radius | 12px（バブル16px、入力・ボタン10px） | |
| spacing | 4pxグリッド（4/8/12/16/24/32） | |
| 影 | 原則なし。ヘッダー等に 0 1px 0 rgba(0,0,0,.06) のみ | フラット基調 |

### 5.2 タイポグラフィ（重要・多言語要件）
- フォント: **Noto Sans**（Latin/Vietnamese）+ **Noto Sans Devanagari**（ネパール語）。`font-family: 'Noto Sans','Noto Sans Devanagari',system-ui,sans-serif`
- ネパール語のデバナーガリ文字とベトナム語のダイアクリティカルマークが崩れずに表示されることを必須要件とする（受け入れ基準14）
- サイズ: チャット本文16px / 補助13px / adminテーブル13-14px。太さは400と600の2種のみ
- 各メッセージ要素に `lang` 属性を付与（スクリーンリーダー・フォント選択のため）

### 5.3 性能予算（顧客チャットのみ厳格）
- 初期ロード合計 **150KB(gzip) 以下**、3G相当で操作可能まで **2秒以内**、Lighthouse Mobile Performance **90以上**
- 達成手段: Preact/vanilla、フォントは subset + `font-display: swap`、画像なし（アイコンはインラインSVG）
- adminは通常のReactでよい（社内利用のため予算は緩い）

### 5.4 状態デザイン（全画面で必須実装）
すべての非同期UIに4状態を用意する: **読み込み中 / 空 / エラー / 成功**。
- 読み込み: スピナーではなくスケルトン（admin一覧）、チャットはタイピングインジケーター（3点アニメーション）
- 空: 行動への招待文言を添える（例 Inbox空: "All caught up — no inquiries waiting."）
- エラー: 何が起きたか+どうすればよいかを平易に。再試行ボタンを必ず付ける。生のエラーコードは出さない
- 通信断（顧客チャット）: 画面上部に細いバナー "You're offline. We'll reconnect automatically." 復帰時に自動再送

### 5.5 マイクロコピー原則
- 動詞で始める・機能をそのまま名乗る（"Send" "Save fee" "Approve rule"）。同じ操作は全フローで同じ名前
- 顧客向けは中学英語レベルの平易さ。専門語（APN等）には1行の説明を添える
- エラーは謝罪せず、原因と次の行動を示す
- 感嘆符・絵文字の乱用禁止（顧客チャットのAI回答も同様。システムプロンプトに反映）

### 5.6 アクセシビリティ（品質フロア）
- コントラストWCAG AA以上、タッチターゲット最小44px、フォーカスリング可視、`prefers-reduced-motion` 尊重
- キーボードのみでadminの主要フロー（Inbox閲覧→返信送信）が完結すること

---

## 6. 顧客向けWebチャット仕様（/chat）★v1.3全面改訂: ガイドフロー型

自由入力ファーストではなく、楽天型の「カテゴリ選択→定型質問→AI回答→解決確認→ダメならエスカレーション」のガイドフローとする。入力欄は最初は表示しない。

### 6.1 フロー定義
1. **言語選択**（初回のみ全画面。5言語をネイティブ表記の大ボタンで。ブラウザ言語から推定した言語を先頭に）
2. **カテゴリ選択**: "What is your question about?" を表示し、`menu_categories.json` の10カテゴリをアイコン付きタイル（2列グリッド）で表示。選択値を conversations.topic_category に保存
3. **カテゴリ別分岐**:
   - 通常カテゴリ（8種）→ そのカテゴリの sub_questions をチップ表示 + "Something else" チップ。sub_question タップで定型質問として送信し、AIがカテゴリスコープのルールで回答。"Something else" タップで入力欄を表示
   - **Plans & prices** → AIを呼ばず、固定メッセージ「料金プランはスタッフがご案内します」（顧客言語）+ エスカレーションカードを即表示（reason: price_question）
   - **Others** → "Please tell us your question." を表示して入力欄を開く。AIは全カテゴリのルールで回答
4. **AI回答後**: "Solved 👍 / Still need help" ボタン + 入力欄を常時表示に切替（フォローアップの自由入力を許可。以降はスコープ維持のままAI回答）
5. **Still need help / エスカレ条件成立** → エスカレーションカード（連絡先1入力）→ 送信で Slack通知。以降は従来通り
6. 会話がresolved/closedになった後の再訪では「New question」ボタンでカテゴリ選択に戻れる（新しいconversationを作成）

### 6.2 画面構成
1. ヘッダー: ロゴマーク(logo-mark.svg, 28px) + SIM Point Support + ステータス表示。言語ピル
2. カテゴリタイル: 44px以上のタッチ領域、アイコン（Tabler、menu_categories.json の icon 指定）+ ラベル。選択済みカテゴリは会話内にシステムメッセージ "Topic: Payment & monthly bill" として残す（スタッフ側でも文脈が分かる）
3. チャット本文・バブル・リンクカード・"Answered by AI"表示は v1.2 と同一（第5章トークン準拠）
4. エスカレーションカード・入力欄仕様も v1.2 と同一

### 6.3 UX挙動（v1.2から維持）
- 楽観的送信 / タイピングインジケーター / 15秒タイムアウト→自動エスカレーション
- session_token による履歴復元、"Our team replied" バナー
- ?src= の source_tag 保存、5秒ポーリング
- locales 5言語（カテゴリラベル・sub_questions の翻訳キーを追加。menu_categories.json は英語マスター）

### 6.4 分析への効用
topic_category が全会話に付くため、admin ダッシュボードで「どのカテゴリの問い合わせが多いか」「カテゴリ別AI解決率」が集計可能になる（Phase 1では Inbox の Category 列表示のみ、集計は Phase 2）。

## 7. admin画面仕様（/admin)

Supabase Auth ログイン必須。UIは英語。ロール: admin（全機能）/ staff（Inbox・返信のみ）。デスクトップ主対象だがレスポンシブ対応（スタッフは外出先でスマホから返信することがある）。

### 7.1 ダッシュボード（トップ）
メトリクスカード4枚: Today's inquiries / Solved by AI（件数と%）/ Waiting for staff / Due within 4h（赤表示）。カードクリックで該当フィルタのInboxへ。

### 7.2 Inbox（デフォルトは「要対応」ビュー）
- デフォルトフィルタ: status=escalated、期限昇順（**開いた瞬間に「今やるべきもの」が最上部**にある状態を正とする）
- 列: Source（チャネル+source_tag）/ **Category**（topic_category）/ Question（先頭40字）/ Lang / Answered by（AI or スタッフ名）/ Status / Due（残り時間、4h未満は赤）
- フィルタ: status / channel / language / assigned to me。全文検索（顧客メッセージ対象）
- キーボードショートカット: j/k 行移動、Enter 開く、e resolve、? ヘルプ表示
- 未読（スタッフ未閲覧のエスカレ案件）は行左に太いアクセント色バー

### 7.3 会話詳細（この画面の速さが製品価値の中心）
- 全メッセージ表示。AIメッセージに根拠 rule_ids チップ（クリックでそのルールの編集ダイアログを直接開く）
- **Translate トグル**: 顧客メッセージの下に英語機械翻訳を薄字表示（Gemini再利用）。スタッフが読めない言語への対応を可能にする必須機能
- 返信欄:
  - **"AI draft" ボタン**: ナレッジ+会話履歴から顧客言語の返信案を生成し返信欄に挿入（そのまま送信不可、スタッフの編集・送信操作を必須とする）
  - 定型文（テンプレート）挿入メニュー: 言語別によく使う挨拶・締め文
  - 下書きは3秒ごとに reply_drafts へ自動保存。リロードしても消えない
  - 送信で (a) messages に sender='staff' 保存、(b) status='staff_replied'、(c) contact_email があれば Resend で通知
- 操作: Resolve / Reassign / Reopen。Resolveは即時実行+5秒間のUndoトースト（確認ダイアログは出さない）

### 7.4 ナレッジ管理
- カテゴリツリー + インクリメンタル全文検索（入力ごとに絞り込み）
- 編集ダイアログ: rule_text、fee_amounts_jpy（数値入力・複数可）、links、audience、ai_can_answer トグル、status。保存ボタン名は "Save rule"
- 保存時 kb_change_log に before/after 記録。ダイアログ内に注記 "Changes apply to AI instantly."
- 新規追加（id 'M001'〜）。破壊的操作は物理削除でなく status='disabled'（Undo可能に）

### 7.5 承認待ちキュー（Review queue）
- pending_review 42件を reason 別タブ（A: 取り消し線除去の確認 / B: internal自動分類の確認）
- 各項目: Approve as-is / Edit & approve / Keep internal / Disable。**複数選択で一括Approve**可
- Bタイプに Split 補助: rule_text を2分割し、片方 customer/active・片方 internal で保存
- キューが0件になったら空状態 "Review queue is clear. AI is using all approved rules." を表示

### 7.6 スタッフ管理（adminのみ）
- 一覧+追加/編集: name, email, role, languages（複数選択）, channels, slack_member_id, is_active
- 追加時に Supabase Auth 招待メール送信

### 7.7 変更履歴
- kb_change_log 一覧（誰が・いつ・どのルールを）。金額変更は before→after を差分ハイライト（旧値打ち消し線+新値強調）

---

## 8. エスカレーション & 通知

### 割り当てロジック
1. escalate 発生 → status='escalated'、escalated_at=now()、reply_due_at=+24h
2. staff から is_active かつ languages に顧客言語を含む者を抽出 → 直近担当件数最少の者に割り当て（不在なら未割り当て）

### Slack通知フォーマット
```
🔔 Escalation — due in 24h
Channel: webchat (src: agent042) | Lang: VI
Q: "Monthly plan price for 30GB?"
AI reason: price_question
Assigned: <@U012ABC>（未割り当て時: @channel）
▶ 会話を開く: https://<admin-url>/conversations/<id>
```
Slackリンク→admin会話詳細は認証後に**直接その会話が開く**こと（ログイン後リダイレクト維持。「Slack通知から返信送信まで3クリック以内」を目標値とする）。

### リマインダー
Workers Cron（毎時）: 期限4時間未満の escalated 会話を ⚠️ 再通知、期限超過は 🚨 毎時通知。

### 顧客メール通知（Resend）
スタッフ返信時のみ。件名・本文は顧客言語テンプレート（5言語）。ヘッダーに logo-horizontal.webp、本文に session_token 付きチャットURL。差出人名: SIM Point Support。

---

## 9. API一覧（Workers）

| Method | Path | 認証 | 用途 |
|---|---|---|---|
| POST | /api/conversations | なし | セッション作成（language, source_tag） |
| POST | /api/conversations/:token/messages | session | 顧客発言→AI回答/エスカレ処理を同期実行 |
| GET | /api/conversations/:token/messages | session | 履歴/新着取得（ポーリング） |
| POST | /api/conversations/:token/contact | session | エスカレ時の連絡先登録 |
| POST | /api/conversations/:token/feedback | session | Solved / Still need help |
| GET/PATCH | /api/admin/conversations… | JWT | Inbox・詳細・返信・状態変更 |
| POST | /api/admin/conversations/:id/translate | JWT | 顧客メッセージの英訳（7.3） |
| POST | /api/admin/conversations/:id/ai-draft | JWT | 返信AIドラフト生成（7.3） |
| PUT | /api/admin/conversations/:id/draft | JWT | 下書き自動保存 |
| GET/POST/PATCH | /api/admin/rules… | JWT(admin) | ナレッジCRUD・承認キュー・Split |
| GET/POST/PATCH | /api/admin/staff… | JWT(admin) | スタッフ管理 |
| GET | /api/admin/changelog | JWT | 変更履歴 |

---

## 10. 受け入れ基準（実装後に必ず手動確認）

機能:
1. インドネシア語で「APNの設定方法」→ インドネシア語で回答+チュートリアルのリンクカード表示
2. 「30GBの月額はいくら？」→ 金額を出さずエスカレーション。Slackに reason: price_question 通知
3. 「SIMを失くした」→ 紛失手数料を提示しつつ "Final amount will be confirmed by our staff" 相当が顧客言語で付く
4. adminで再発行手数料 4,000→4,500 変更 → 直後の質問に新金額で回答、変更履歴に記録
5. 回答に AR・Kintone・Slack 等の社内用語・社内リンクが出ない（pending_review 42件が未使用であること含む）
6. スタッフ返信 → 顧客チャットに表示+登録メールに通知。再訪時に "Our team replied" バナー
7. staff ロールでナレッジ編集・スタッフ管理に到達不可
8. 連続大量送信でレート制限が働く

UX（v1.1追加）:
9. 顧客チャット: Lighthouse Mobile Performance 90以上、初期ロード150KB以下
10. 送信は楽観的表示、AI応答中はタイピングインジケーター、15秒タイムアウトで自動エスカレーション
11. 機内モードで送信→オフラインバナー表示、復帰で自動再送
12. admin Inbox をキーボードのみ（j/k/Enter/e）で操作し返信送信まで完結できる
13. Slack通知リンク→（ログイン済みなら）3クリック以内で返信送信できる
14. ネパール語（デバナーガリ）とベトナム語の文字が顧客チャット・admin両方で正しく描画される
15. 会話詳細の Translate トグルで顧客メッセージの英訳が表示される
16. "AI draft" は返信欄への挿入のみで、編集なしの自動送信ができないこと
17. Resolve 実行後5秒間 Undo が機能する
18. ロゴマークがチャットヘッダー・アバター・faviconに表示され、主要ボタンが --accent（#C2410C）で統一されている。エラー表示と主要ボタンが並ぶ画面（送信失敗時等）でも両者が区別できる

ガイドフロー（v1.3追加）:
19. 初回アクセスで入力欄が表示されず、言語選択→カテゴリ選択の順に進む
20. "Lost SIM or device" 選択→ "I lost my SIM card" タップ → 紛失手数料ルールに基づく回答（LOST ITEM RULES 由来のルールIDが ai_meta に記録される）
21. "Plans & prices" 選択 → AIを呼ばずにエスカレーションカードが即表示され、Slack通知の reason が price_question になる
22. "Others" 選択で自由入力が開き、全カテゴリのルールで回答される
23. admin Inbox に Category 列が表示され、会話詳細に "Topic: …" のシステムメッセージが残る

## 11. 納品ドキュメント要件（★v1.4新設）

実装完了時、コードに加えて以下のドキュメントを納品すること。**読者は非エンジニアのカスタマーサポートスタッフ**（テスト参加者）である。技術用語（API、DB、JWT等）を使わず、スクリーンショット中心・英語で作成する。Markdown と PDF の両形式で `/docs` に格納する。

### 11.1 CS Staff Rulebook（運用ルールブック）— 必須
テスト開始時にスタッフへ「このルールで動くAIボットです」と渡す文書。目次は以下を必須とする:

1. **What this bot is** — 1ページ概要。何をするボットか、顧客から見た体験（ガイドフローのスクリーンショット付き）
2. **What the AI answers / never answers** — AIが回答するもの（マニュアル記載ルール、固定手数料+"最終金額はスタッフ確認"付記）と、絶対に回答しないもの（月額プラン料金、COD、割引額、口座・請求の個別状況、クレーム）。この線引きは第4.2章のシステムプロンプトと完全一致させること
3. **When you get called（エスカレーションのルール）** — Slack通知が来る条件、24時間以内返信のSLA、割り当てロジック（言語マッチ）、期限リマインダーの意味（⚠️/🚨）
4. **How to reply（admin画面の使い方）** — ログイン、Inboxの見方、Translateトグル、AI draftボタン（必ず編集してから送信すること）、Resolve/Undo。各手順スクリーンショット付き
5. **How to edit rules and fees（admin権限者向け）** — ナレッジ編集、金額変更が即座にAIに反映されること、変更履歴、Review queueの42件の処理方法（Approve / Edit / Keep internal / Split）
6. **Do & Don't** — 例: Do「AIの誤答を見つけたら該当ルールIDをメモして報告」/ Don't「AI draftを無編集で送らない」「顧客に社内用語（AR、Kintone）を使わない」
7. **FAQ for staff** — 想定質問10件以上（例: AIが間違えたらどうする？ 顧客が日本語で聞いてきたら？ 期限に間に合わないときは？）

### 11.2 Test Guide（テスト手順書）— 必須
非エンジニアが実施できるテスト計画。以下を含むこと:
- テストシナリオ表: 第10章の受け入れ基準1〜23を、非エンジニア向けの手順文に翻訳したもの（「チャットを開く→Lost SIM or deviceを押す→…→期待結果: 手数料と"Final amount…"の文言が出る」形式）。各行にチェックボックスと結果記入欄
- 多言語テストの分担指示（各言語ネイティブのスタッフが自分の言語で最低5シナリオ実施）
- **不具合・誤答の報告テンプレート**: 日時 / 会話URL / 質問文 / AIの回答 / 期待した回答 / （分かれば）根拠ルールID。報告先チャンネル: #cs-bot-feedback（仮）
- テスト期間の運用ルール: テスト中は本番顧客に公開しない（URLは限定共有）、テストデータの見分け方（source_tag='test'）

### 11.3 品質基準
- ルールブックを読んだスタッフが、開発者に質問せずに「エスカレ対応1件の返信」と「手数料1件の変更」を完了できること（受け入れ基準24として検収する）
- 第10章に追加: **24. 非エンジニアのスタッフ1名がRulebookのみを頼りに、テスト用エスカレ案件への返信と、ナレッジの金額変更を完了できる**

## 12. 同梱ファイル
- kb_rules_import.json / kb_rules_import.csv — 初期ナレッジ695件（42件は pending_review 指定）
- needs_review.md — 承認待ち42件（Review queue の初期内容と一致すること）
- assets/logo-mark.svg / assets/logo-horizontal.webp — ブランドアセット（第5.1章）
- menu_categories.json — カテゴリメニュー定義（第6章。10カテゴリ、各カテゴリとkb_rules.categoryの対応、定型質問）

納品時に実装側が追加すべきもの（第11章）:
- docs/cs-staff-rulebook.md / .pdf
- docs/test-guide.md / .pdf
