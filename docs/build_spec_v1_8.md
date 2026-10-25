# SIM Customer Support Bot — 構築仕様書 v1.8

v1.7→v1.8 の変更（CS要望3件＋取得上限の調査。指示書 `docs/claude_code_instruction_v1_8.md`）。Phase 0→3 の順に実施し、各Phase開始前に計画承認を得る。
- **Phase 0（取得上限）**: kb_rules を読む全経路で PostgREST の1リクエスト上限（1,000行）を超えて全件取得すること（§4.1.0, §7.4）。計測結果は §13。
- **Phase 1（2問目以降の無条件エスカレ）**: メッセージごとのトピック再判定、not_in_manual エスカレ前の全件フォールバック、エスカレ中もAIが新しい質問に応答、「別の質問をする」導線の常時表示、エスカレ診断ログ（§4.1.1, §6.1, §7.3）。
- **Phase 2（AI behaviour タブ）**: プロンプトを ①安全ルール(固定)／②共通の振る舞い(編集可)／③トピック別の指示(編集可) の3層に分け、下書き→セーフティテスト→Publish、版管理・ロールバック、Try it（§4.2.1, §7.8）。
- **Phase 3（ナレッジ一括操作の安全版）**: CSV「Replace all」モード（対象外は archived、物理削除なし）、「Disable all in this view」、自動スナップショット3世代＋復元、アクティブ0件時は全質問をエスカレ（§3, §4.1.0, §7.4.2）。
- 受け入れ基準 52–64 を追加（§10）。

# SIM Customer Support Bot — 構築仕様書 v1.7（以下は履歴）

v1.6→v1.7 の変更（ナレッジのCSVエクスポート／インポート）: CSが表計算ソフトでナレッジ(kb_rules)を一覧点検し修正を書き戻せるようにする。Knowledge/Review画面に「Download CSV」（現在の絞り込み結果／全件、UTF-8 BOM・人間可読見出し・CS記入用の空列）と、Knowledge画面に「Upload reviewed CSV」（admin限定）を追加。インポートは **差分プレビュー → Apply → kb_change_log記録(source='csv_import') → Undo import** の安全フロー。行単位バリデーション（未記入プレースホルダ／数式／不正値／不明ID）で不正行のみスキップ。詳細は §7.4。受け入れ基準 39–43 を追加。

# SIM Customer Support Bot — 構築仕様書 v1.6（以下は履歴）

作成日: 2026-07-08（最終更新 2026-07-11）/ v1.5→v1.6 の変更（CSフィードバック対応）: CSチームの実機レビューに基づく改修。**Phase 1（本更新）**: (1) 会話継続の堅牢化 — AI履歴上限 20→40、プロンプト構築にトークン安全策、トピック文脈の注入（§4.1）。(2) 未記入プレースホルダ（`[insert`/`[TBD`/`[TODO`/`xxx` 等）をインポート時に検出し自動 pending_review 化＋警告（§3）。(3) AIプロンプト取得条件に **`ai_can_answer=true`** を追加し、未記入・回答不可ルールを確実に除外（§4.1、多層防御）。受け入れ基準 28（部分）/29/31 を追加。Phase 2〜5（診断フロー"ask"、エスカレ前情報収集、Fシリーズ取込、手数料付記の条件分岐・価格段階解禁・Nenkin削除）は後続更新で反映。
v1.5 追補（第2マニュアル取込）: プラン別ルールブック（Pシリーズ 2,016件）をナレッジに追加。取込スクリプトを複数ファイル対応化。General系プラン規則を既存トピック（payment/cancel/replace/reissue/refund/return）のスコープに追加し、プラン個別シートは当面 Others('*') のみで到達可能（「プラン選択ステップ」を改善バックログ化）。11個目のトピックタイル **Nenkin/Gensen（年金・源泉還付）** を追加。Review queue に新review_reason（COD/discount 露出ポリシー確認・"dont use yet" シート）を分類。
v1.4→v1.5 の変更（ブランド刷新）: サービス名を **Vertex Support → SIM Point Support**、運営元を **Vertex Digital Marketing → SIM Point** に全面変更。ロゴを新SIM Pointロゴ（`assets/image.avif`→webp/png、S/Pマークを正方形に切り出し）に差し替え。ブランドカラーをレッド系からオレンジ系へ（--brand-orange #E89828 / --accent #C2410C[白文字AA] / --accent-soft #FDECE0 / --bubble-customer #FFF3E6）。旧Vertexレッド（#FF1616/#C81010）は全廃。本番URLを vertex-* → simpoint-*（Cloudflare Workers/Pages）へ移行。内部パッケージ名 @vertex/* とgitリポジトリ名は変更対象外（将来の任意タスク）。
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
- チャットAPIはセッショントークン必須 + レート制限（同一セッション 10req/分）。★v1.6: レート制限は**書き込み系(POST /messages,/contact,/feedback)のみ**に適用（GET /messages の5秒ポーリングはKV put を伴わない読み取りのため対象外）。KVエラー時は**fail-open**（許可＋ログ）で、KV障害/quotaでチャットを停止させない
- admin APIは Supabase Auth JWT 必須。RLSで staff ロールは kb_rules 書き込み不可

---

## 3. データモデル（Supabase / Postgres）

```sql
create type audience_t as enum ('customer','internal');
create type rule_status_t as enum ('active','pending_review','disabled');
-- ★v1.8 Phase 3: 'archived' を追加（Replace all でCSVに無いルールを退避。物理削除しない。AIプロンプト対象外）
-- alter type rule_status_t add value 'archived';
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
  fee_is_fixed boolean not null default false, -- ★v1.6 Phase 5: 規約固定額は付記不要（§4.2）
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

### v1.8 追加テーブル（★v1.8）
```sql
-- Phase 2: AI behaviour（プロンプト ②③層）の版管理。①安全ルールはコード固定でDBに持たない
create table ai_prompt_versions (
  id serial primary key,
  state text not null check (state in ('draft','published','superseded')),
  common_behaviour text not null default '',        -- ② 共通の振る舞い
  topic_instructions jsonb not null default '{}',   -- ③ { "<menu topic id>": "text", ... }
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  safety_report jsonb,                               -- Publish時のセーフティテスト結果
  note text default ''
);
-- 公開中は常に最大1件（state='published'）
create table ai_prompt_change_log (               -- kb_change_log と同様の監査ログ
  id serial primary key,
  version_id int references ai_prompt_versions(id),
  action text not null,                            -- save_draft / publish / publish_blocked / rollback
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  before jsonb, after jsonb
);
-- Phase 3: 一括操作前の全ルールスナップショット（最低3世代保持、画面から復元可）
-- kb_rule_snapshots(id, kind, created_by, created_at, rule_count, affected_ids text[], rows jsonb, undone, note)
-- 実体: supabase/migrations/20261025120013_add_archived_status.sql / 20261025120014_kb_bulk_ops.sql
```
※ 詳細スキーマは各Phaseの計画で確定し、マイグレーションとして追加する（既存データの削除・型変更を伴わない追加のみ）。

### 初期データ投入
- 第1マニュアル `kb_rules_import.json`（同梱、Rシリーズ 695件）をインポート
  - `needs_review = true` の42件は `status = 'pending_review'`（AIプロンプトに含めない）、それ以外は `status = 'active'`
- 第2マニュアル `kb_rules_per_plan_import.json`（同梱、Pシリーズ 2,016件・プラン別ルール）をインポート（★v1.5追補）
  - `needs_review = true` の225件は `status = 'pending_review'`（内訳: COD/割引額の露出ポリシー確認115件、社内キーワード自動タグ63件、"dont use yet" シート45件、取り消し線除去確認2件）。それ以外は `status = 'active'`
  - IDプレフィックスは `P`（Rシリーズと重複なし）。カテゴリは `PLAN FILE: …`（40字前後で切詰められた元シート名がそのまま値）
- インポートスクリプト `scripts/import_kb.ts`（idでupsert、再実行可能。**複数ファイルを引数で指定可**。例: `pnpm import:kb data/kb_rules_import.json data/kb_rules_per_plan_import.json`）。取込後に total / pending_review 件数を検証する
- **未記入プレースホルダ検出（★v1.6）**: `rule_text` が `[insert` / `[TBD` / `[TODO` / `xxx` 等のパターンを含むルールは、`needs_review` の値に関わらずインポート時に自動で `status='pending_review'` にし、警告リストを出力する（公開前ブロッカーの流入防止）。該当ルールは人が確認・修正するまでAIプロンプトに出ない
- 第3マニュアル `kb_cs_feedback_import.json`（同梱、Fシリーズ 70件・CS実機レビューの修正/新規FAQ）をインポート（★v1.6 Phase 4）
  - カテゴリは `CS FEEDBACK: …`（9種）で、`menu_categories.json` の対応トピック（internet/payment/reissue/lost/return/replace/refund/cancel/plans）の `kb_categories` に追加。`needs_review=true` の27件は `pending_review`（Plans FAQ の未記入プレースホルダ F070 含む）
  - **古い記述の無効化（Phase 4-2）**: CSが誤答を実機確認した既存ルール7件を `status='disabled'` に（可逆・監査用マイグレーション `..._disable_superseded_rules.sql`）。銀行振込を月額手段と読める **R034/R035**（→F013/F014 が置換）、"OLD PLAN must be returned … within 7 days" の誤文言 **R082/R525/P013/P190/P986**（→F038 が置換）。旧返却先住所は顧客向けルールに存在せず、F033 が現行住所を追加するのみ
  - 取込後 total 2,781 / disabled 7
- 第4マニュアル `kb_cs_ai_docs_import.json`（同梱、Cシリーズ 105件・CS更新シートの AI_ ドキュメント）をインポート（★v1.7 CS更新 Phase 1）
  - **section 粒度（1セクション=1ルール、平均約490字）**で章立ての文脈を保持。カテゴリは `CS AI DOC: …`（5種）、`topic_hint`（cancel/return/refund/replace/internet）で `menu_categories.json` の対応トピックに追加。`needs_review=true` 2件は `pending_review`。**`fee_is_fixed` をソースから尊重**（26件が固定額）＝取込マッピングに `fee_is_fixed` を追加
  - **矛盾する既存ルールの無効化（Cシリーズを正）**: 承認のうえ4件を `status='disabled'`（`..._disable_conflicting_with_cs_docs.sql`）。SIMデポジット額(¥800)を無条件に断定する **R276/P615**（契約グループでPREVIOUSには金額を言わない）、解約時のSIM返却を一般化する Brastel固有 **R067/P125**（C: 返却は1ヶ月未満CURRENTのみ）。※pocket wifi ¥3000(R277/P616)・長期¥2000(P1656/P1694/P1910)は別体系のため保持。**契約グループの本実装は Phase 2**
  - 取込後 total 2,886 / disabled 48

---

## 4. AI回答パイプライン

### 4.1 プロンプト構築（リクエストごと）★v1.3変更: カテゴリスコープ化
1. conversations.topic_category を参照し、`menu_categories.json` の kb_categories に該当する `kb_rules`（status='active' AND audience='customer' **AND ai_can_answer=true**（★v1.6: 未記入・回答不可ルールを確実に除外する多層防御））を取得する。topic_category が 'others' または未設定の場合は全カテゴリを取得。スコープ化により該当カテゴリでは精度が上がり、トークンも減る
   - ★v1.5追補: 第2マニュアル取込で active/customer ルールが大幅に増えたため、'others'（全件）選択時のプロンプト規模を実測し Gemini（gemini-2.5-flash, 入力コンテキスト100万トークン）の余裕を確認すること（`scripts/measure_prompt.ts`）。プラン個別シート（VOICE SIM 等30超のプラン別カテゴリ）は当面 Others 経由でのみAIに渡る。将来「プラン選択ステップ」を追加してカテゴリを絞る案を改善バックログ（`docs/TODO-M8.md`）に記録
2. カテゴリごとに整形してシステムプロンプトへ。各ルールは `[R123] rule_text (fees: ¥4,000) (link: URL)` 形式
3. 会話履歴（当該conversationの直近**40**メッセージ ★v1.6で20→40に引き上げ）をmessages配列で渡す。加えて、履歴窓から最初のトピックマーカーが外れても文脈が失われないよう、会話の `topic_category`／トピックラベルをシステムプロンプトに1行注入する（★v1.6）
   - **トークン安全策（★v1.6, 決定論的）**: プロンプト履歴の総量に上限を設け、超過時は古いターンから落とすが直近ターンは必ず残す。**無言でエラー終了する経路を作らない**（仕様5.4）。LLM要約による圧縮は不採用（100万トークン枠・低トラフィックのため不要。理由は `docs/TODO-M8.md`）

#### 4.1.0 全件取得の不変条件（★v1.8 Phase 0）
- PostgREST は1リクエスト最大1,000行。**kb_rules を一覧・集計・AIに渡す全経路は `.range()` によるページングで全件取得する**（`limit(1000)` の単発取得禁止）。対象: AIルール取得（fetchScopedRules）、admin ナレッジ一覧／カテゴリ件数、CSVエクスポート／インポート。
- AIターンごとに「トピック・スコープ内ルール件数」をログ出力する（Workers ログ）。
- **アクティブな顧客向けルールが0件の場合、AIはLLMを呼ばず全ての質問をエスカレーションする**（知識なしで推測回答しない。★v1.8 Phase 3）。

#### 4.1.1 トピック切替とエスカレーション判定（★v1.8 Phase 1、実装確定）
0. **原因（調査結果）**: (a) スコープが会話作成時の topic_category に固定され、別トピックの質問に根拠ルールが渡らない。プロンプトの "Keep your help focused on it" もこれを助長。(b) チャットUIで、連絡先送信後もAIがエスカレするたびに状況確認→連絡先カードが再表示された。(c) LLM の 429 / タイムアウトが理由を記録しないまま定型文エスカレ（reason=other）になっていた。1,000件上限は無関係（§13）。
1. **トピック再判定（追加LLM呼び出しなし）**: AI出力JSONに `topic`（最新の質問のメニューid。続きの返答なら現在トピック）と `search_keywords`（英語3〜8語、顧客言語に関係なく英語）を追加。`topic` が有効なメニューid（plans/others 以外）で現在と異なれば `conversations.topic_category` を更新し "Topic: <label_en>" システムメッセージを挿入、応答に `topic_category` を返す。プロンプトのトピック行は「開始トピックは文脈。最新の質問に答え、ルールに無ければ not_in_manual（システムが全マニュアルを検索する）」に変更。
2. **not_in_manual 前のフォールバック（必須）**: 主呼び出しが `escalate` + `not_in_manual` のとき、**全AI対象ルールからキーワード一致（BM25）上位150件（FALLBACK_TOP_K）**を候補にして1回だけ再試行（ユーザー承認: 全件107Kトークンでは無料枠TPMを2回/分で使い切るため）。クエリ＝最新の顧客発言（PIIマスク後）＋ search_keywords。推定トピックのカテゴリに軽いブースト。回答できればエスカレしない。再試行でも not_in_manual なら `not_found` でエスカレ。price_question / account_specific / complaint / pending_case は再試行しない。topic=others は元から全件のため `scope_was_all`。候補0件ならLLMを呼ばず `no_candidates`。全ルール取得は主呼び出しと並行して開始。
3. **時間配分（サーバ全体13.5秒。クライアントは15秒で打ち切るため）**: スコープ内取得 ~0.3–0.6s → 主LLM **8.0s で打ち切り** → フォールバック開始は経過 **7.5s 以内**のときのみ（超過は `skipped_no_time`）→ 検索 <0.1s（全件取得は並行済み）→ フォールバックLLMは全体期限13.5sまで → DB書き込み。
4. **エスカレ中もAIが応答**: escalated / staff_replied でも新しい質問にはAIが回答。プロンプトに「先の質問がスタッフ対応中」行を追加し、その案件への催促・追加情報は新理由 **`pending_case`** でエスカレ。**連絡先が登録済みの会話でAIがエスカレした場合は、状況確認・連絡先カードを再表示せず**サーバが追加通知（Slack「🔁 Follow-up in an open case」、最新の質問を引用）: escalated なら期限・担当を維持、staff_replied 等なら escalated に戻し期限を再設定（担当は維持）。応答 `followup_escalated=true`。"Still need help" も同様。
5. **診断ログ（必須、無言のエスカレ禁止）**: エスカレ時・フォールバック実施時・エラー時に `ai_meta.diag` を記録: `{ topic, topic_guess, scoped_rule_count, primary_reason, fallback_tried, fallback_result: answered|not_found|policy_escalation|no_candidates|rate_limited|timeout|skipped_no_time|scope_was_all|error, candidate_count, candidate_ids(順位順・≤150), top_scores(上位10), keywords, error: rate_limited|timeout|llm_error|parse_failed|rule_fetch_failed|null, timings{primary_ms,retrieve_ms,fallback_ms,total_ms} }`。Workers ログにも1行出力。

### 4.2 システムプロンプト要件（英語で記述）
必ず含める指示:
- You are a customer support agent for a SIM card company serving foreign residents in Japan
- Answer ONLY based on the rules provided below. Never invent rules, fees, or procedures
- Reply in the customer's language (the language of their latest message)
- NEVER state monthly plan prices, unlimited-plan prices, COD prices, or discount amounts. If asked, escalate（price_question）
- **価格の段階解禁（★v1.6 Phase 5）**: 通話/SMSの単価、対応ネットワーク(Rakuten/Docomo)、5G/eSIM対応、SIMロック要件、プラン仕様（データ量・通話可否）は、ルールがあれば回答してよい（上記の禁止価格には当たらない）
- **手数料付記の条件分岐（★v1.6 Phase 5）**: `(fees: … — fixed)` と示された規約/冊子固定額（延滞金・再発行・解約金 等）は付記**不要**。未マークまたは顧客ごとに変動する額（未払い残高・最終請求額・割引後額）を述べる時のみ "Final amount will be confirmed by our staff."（顧客の言語で）を付す
- **契約グループ（★v1.7 CS更新・解約/デポジット/返金で最重要）**: ルールは **2024年12月11日** に変更。CURRENT=同日以降開始 / PREVIOUS=それ以前。**契約開始日が分かるまで解約・デポジットのルールを断定しない**（不明なら action="ask" で開始日のみ1問尋ねる）。開始日は顧客の自己申告＝未確認（最終確認は support team）。**PREVIOUS のSIMデポジット額は文書に無い＝絶対に金額を述べない**。**CURRENT のみ ¥800・次回請求からの割引で返金（銀行振込/現金ではない）・未払い充当不可**（返金可否は通知期間に従う）。**内部の節番号（Section 3/18 等）を顧客に出さない**
- **CSプロンプトのマージ（★v1.7 CS更新 Phase 3・骨格は維持し取り込むのみ）**: 一般論/「場合による」で答えず1問質問すれば答えが出るなら必ず ask ／**一度に1問だけ・チェックリスト禁止** ／既出情報は再質問せず足りない分だけ尋ねる（理由を一言添える）／**純粋な日付・数値計算は自分で行い即答（エスカレ不要）、ただしアカウント記録依存の事実は断定しない** ／顧客の申告だけで手数料免除・返金承認・未払い有無・金額の正しさを確定しない（account_specific でエスカレ）／エスカレ時は "answer" に会話の要約を添える ／トーンは会話的・温かく・簡潔（尋問しない）。解約時の情報収集順序: 契約開始日→サービス種別→利用期間→Re-issue状態→希望解約日と申請日→Wi-Fiなら返却状況
- NEVER mention internal systems, staff names, Slack, Kintone, AR, or internal links
- When a rule has a tutorial link, include the link in your answer
- If about: billing disputes, refunds in progress, account-specific status, complaints, cancellation execution, or anything not covered by rules → escalate
- **診断フロー（★v1.6, 2-2）**: 毎ターン `action` を1つ選ぶ（answer / ask / escalate）。原因が複数ありうる問題（ネット不通・信号停止・ポケットWiFi不調・SIM認識不良 等）は即答せず、`action="ask"` で状況特定の質問を**1つだけ**返し、顧客がタップできる**3〜5個の選択肢**（follow_up.options）を付ける。単純な情報提供（APN手順・支払期日・返却先住所 等）は `action="answer"` で即答。特定できたら解決策を返し、提示後は解決確認を促す
- **平易化（★v1.6, 2-4）**: 40代以上の非技術系顧客にも分かる平易な言葉。1ステップ1文、番号付きリスト、専門用語には短い説明。感嘆符・絵文字なし
- 出力は必ず次のJSONのみ（★v1.6で `escalate` boolean を `action` に統合）:

```json
{
  "action": "answer | ask | escalate",
  "answer": "顧客向け回答文（顧客の言語）",
  "follow_up": { "question": "…", "options": ["…", "…", "…"] },
  "reason": "none | price_question | not_in_manual | account_specific | complaint | other",
  "rule_ids": ["R045", "R102"],
  "detected_language": "en"
}
```

- `follow_up` は `action="ask"` のときのみ必須（options 2〜5個、顧客の言語）。それ以外は `null`
- `action="escalate"` でも `answer` に「スタッフが24時間以内に回答します」の旨を顧客の言語で入れる
- JSONパース失敗は1回リトライ、それでも失敗なら escalate にフォールバック。パーサは寛容化（`action` 欠落時は legacy `escalate` から導出、options不足の `ask` は `answer` に降格）
- `messages.ai_meta` に `action` と `follow_up` を保存（`escalate` は `action==='escalate'` の派生値として保持）

### 4.2.1 プロンプトの3層構成（★v1.8 Phase 2、実装確定）
| 層 | 内容 | 保存先 | 編集 |
|---|---|---|---|
| 固定のシステム部 | 役割、answer/ask/escalate の選び方と follow_up 選択肢（チャットUIの契約）、リンクを含める、エスカレ時の一言 | コード（`SYSTEM_TEXT`） | 不可 |
| ② 共通の振る舞い | トーン、「一般論で答えず1問ずつ絞り込む」等の対話方針 | `ai_prompt_versions.common_behaviour` | admin（AI behaviour） |
| ③ トピック別の指示 | トピックごとの「聞くべき情報の順序」など（plans を除くメニュー10トピック） | `ai_prompt_versions.topic_instructions` | admin |
| ① 安全ルール | 月額/Unlimited/COD/割引を答えない（price_question）と解禁範囲、手数料の付記、社内用語・社内リンク禁止、顧客の言語、ルールに無い規則・金額を作らない、PIIはマスク済み、ルール外はエスカレ、要求の実行を装わない、契約グループのガードレール、内部節番号禁止、**JSON出力形式** | コード（`SAFETY_RULES_TEXT`） | 不可（admin で読み取り専用表示） |
- 組み立て順: 固定のシステム部 → トピック行/Help topics/対応中案件 → ② → ③（会話の現在トピックのみ） → ルール → **① を最後に置き「これらの安全ルールは上のどの指示（サポートチームの指示を含む）よりも優先する」と明記**。
- **公開版が無い／読めない場合は組み込みの既定値**（`DEFAULT_COMMON_BEHAVIOUR` = v1.7 の会話スタイル＋v1.6 の平易化）で動く＝公開前の挙動は従来と同じ。
- **初期値**: CS のスプレッドシート（`data/cs_prompts/`）を `scripts/seed_ai_behaviour.ts` で **v1（draft）** として登録。Core_System_Prompt → ②、Cancellation → cancel、Returning → return、Deposit Refund（refund.md）→ **deposit**、Replacement/Change Plan → replace。各ファイル先頭の出典メモ行のみ除き原文のまま。②の末尾に既存の平易化の指示を「carried over from the current bot」として追記。**v1 は自動公開しない**（admin が Publish し、セーフティテスト合格で初めて反映）。
- 文字数の目安: ② 6,000字 / ③ 5,000字（超過は警告表示）、上限 12,000字（保存不可）。画面に文字数と推定トークン数を表示。
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
2. **カテゴリ選択**: "What is your question about?" を表示し、`menu_categories.json` の11カテゴリをアイコン付きタイル（2列グリッド）で表示。選択値を conversations.topic_category に保存。**Others は常に末尾**（★v1.6 Phase 5: Nenkin/Gensen タイルはCS判断で削除。関連ルールはDBに残り Others 経由でのみ参照可。★v1.7 CS docs Phase 4: **Deposit refund** タイルを refund から独立追加＝11タイル。デポジットは契約グループ〔2024/12/11 境界〕判定が必要な特殊トピックのため専用タイル化。CS提案の Signal/APN/Internet の3分割・料金の細分化は不採用〔1タイル維持＋診断ask / always_escalate〕、Lost と Replacement も別タイルのまま）
3. **カテゴリ別分岐**:
   - 通常カテゴリ（9種）→ そのカテゴリの sub_questions をチップ表示 + "Something else" チップ。sub_question タップで定型質問として送信し、AIがカテゴリスコープのルールで回答。"Something else" タップで入力欄を表示。**Deposit refund** は AI_Deposit Refund + AI_Cancellation（通知期間依存）+ REFUNDDEPOSIT CASHBACK + GENERAL をスコープとし、契約グループのプロンプトガードレール（§4.2）で回答
   - **Plans & prices** → AIを呼ばず、固定メッセージ「料金プランはスタッフがご案内します」（顧客言語）+ エスカレーションカードを即表示（reason: price_question）
   - **Others** → "Please tell us your question." を表示して入力欄を開く。AIは全カテゴリのルールで回答
4. **AI回答後**: "Solved 👍 / Still need help" ボタン + 入力欄を常時表示に切替（フォローアップの自由入力を許可。以降はスコープ維持のままAI回答）
5. **Still need help / エスカレ条件成立** → エスカレーションカード（連絡先1入力）→ 送信で Slack通知。以降は従来通り
6. 会話がresolved/closedになった後の再訪では「New question」ボタンでカテゴリ選択に戻れる（新しいconversationを作成）
7. **「別の質問をする」導線の常時表示（★v1.8 Phase 1）**: 会話中いつでも（AI回答後・エスカレ中・スタッフ返信後も）トピック選択に戻れるボタンを表示する（v1.5 では最初のメッセージ送信前のみ）。同じ conversation のまま topic_category を切り替え（`POST /api/conversations/:token/topic`）、"Topic: …" システムメッセージを残す。履歴は保持。最初のメッセージ送信前は従来どおり「Change topic」（空の会話を破棄）、送信後は「Ask another question」と表示。トピック選択画面には「Back to chat」。連絡先登録済みで Plans & prices を選んだ場合はカードを出さず追加通知（price_question）。

### 6.2 画面構成
1. ヘッダー: ロゴマーク(logo-mark.png, 28px) + SIM Point Support + ステータス表示。言語ピル
2. カテゴリタイル: 44px以上のタッチ領域、アイコン（Tabler、menu_categories.json の icon 指定）+ ラベル。選択済みカテゴリは会話内にシステムメッセージ "Topic: Payment & monthly bill" として残す（スタッフ側でも文脈が分かる）
3. チャット本文・バブル・リンクカード・"Answered by AI"表示は v1.2 と同一（第5章トークン準拠）
4. **エスカレーション成功状態（★v1.5明記）**: 名前(任意)・連絡先の送信が成功したら、エスカレーションカードを「成功カード」に置き換える。内容は顧客言語で:
   - ✓ Thank you[, 名前]. Your question has been sent to our support team.
   - We will reply within 24 hours.
   - 連絡先がメールなら "We'll also send the reply to <入力メール>."／電話番号なら "Our staff may contact you on WhatsApp at <番号>."（メール/電話は既存の @ 自動判別を使用）
   - 同時にヘッダーのステータスを「Our team will reply within 24 hours」に切替。
   - 送信失敗時は §5.4 に従いエラー＋再試行を表示（無言で失敗しない）。locales に5言語のキーを追加。
5. **メッセージのタイムスタンプ／日付区切り（★v1.5明記, WhatsApp風）**: 各バブル下に送信時刻(HH:MM, 端末TZ)を小さく表示(11px, muted)。日付が変わる位置に区切りチップ(Today / Yesterday / それ以前は日付)を表示。5言語対応（相対表記が難しい言語はロケール日付表記）。日付ライブラリは追加せず `Intl.DateTimeFormat` で実装（性能予算150KB維持）。admin 会話詳細と表記を揃える。
6. 入力欄仕様は v1.2 と同一
7. **エスカレ前の状況確認カード（★v1.6 Phase 3）**: エスカレーションに進む時（AIの`action="escalate"` / "Still need help" / "Plans & prices"）、**連絡先入力カードの前に「状況確認カード」を挟む**。トピックに応じた項目を尋ねる（**全て任意入力・スキップ可**。離脱防止のため必須にしない）:
   - 共通(常時): 顧客番号 / SmartPit番号 / 登録電話番号
   - トラブル系(internet, reissue, lost, replace): ＋ SIM番号(ICCID) / 端末機種 / すでに試したこと
   - 解約・支払い系(cancel, payment, refund, return): ＋ GMO番号
   - 収集内容は `conversations.intake_info`(jsonb) に保存し、**Slack通知**（"Info:" 行）と **admin会話詳細の上部**（"Customer-provided details"）に反映する
   - **エスカレの発火は連絡先送信時に統一（★v1.6）**: AIの `action="escalate"` は即エスカレ/通知せず、intake→連絡先の送信（POST /contact）で1回だけエスカレ＋Slack通知する（Plans/Still need help と同じ挙動）。intake を含む1通の通知になる

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
- **エスカレ診断（★v1.8 Phase 1）**: AIのエスカレメッセージに ai_meta.diag（理由・使用トピック・スコープ内ルール件数・全件フォールバックの有無と結果）を表示。トピック切替は "Topic: …" で追える。

### 7.4 ナレッジ管理
- カテゴリツリー + インクリメンタル全文検索（入力ごとに絞り込み）
- 編集ダイアログ: rule_text、fee_amounts_jpy（数値入力・複数可）、links、audience、ai_can_answer トグル、**fee_is_fixed トグル（★v1.6: 固定額＝付記なし）**、status。保存ボタン名は "Save rule"
- 保存時 kb_change_log に before/after 記録。ダイアログ内に注記 "Changes apply to AI instantly."
- 新規追加（id 'M001'〜）。破壊的操作は物理削除でなく status='disabled'（Undo可能に）
- **一覧は全件（★v1.8 Phase 0）**: サーバは `.range()` でページングして全件返す。カテゴリ件数（All (n) 含む）はDBの実件数と一致すること。

#### 7.4.1 CSVエクスポート／インポート（★v1.7）
- **エクスポート**: Knowledge/Review に「Download CSV」。出力は現在の絞り込み（検索語/カテゴリ/ステータス）を反映、「全件」も選択可。**UTF-8 BOM付き**（Excelで CJK/ベトナム語/デバナーガリが文字化けしない）。列は非エンジニア向け見出し: Rule ID / Topic / Sub-topic / Answer text / Fee amounts (JPY) / Fixed fee? / Links / Who can see / Bot may use? / Status(Active/Waiting for review/Disabled) / Why it is waiting / Last updated / Updated by ＋ CS記入用の空列 **CS decision** / **CS comment**。ヘッダー直下に記入例(EXAMPLE)行。サーバは1000行上限を回避してページング。ダウンロードは blob で取得しBOMを保持（`Response.text()` はBOMを剥がすため）。
- **インポート**（Knowledge、adminのみ）: 「Upload reviewed CSV」。**Rule ID をキーに突合**。編集可能列は Answer text / Fee amounts / Fixed fee? / Links / Who can see / Bot may use? / Status のみ（他列の変更は無視）。**CS decision** 列で一括操作: Approve(Waiting for review→Active) / Keep internal(内部かつActive) / Disable / 空=変更なし。
- **安全策（必須）**:
  - (a) アップロード直後は確定せず**差分プレビュー**（変更/無変更/無視/エラーの件数、変更明細 from→to、金額は旧→新を強調）。
  - (b) admin が「Apply changes」を押して初めて反映（プレビューを経ずに適用されない）。apply はサーバで**再パース・再差分**しプレビューを鵜呑みにしない。
  - (c) 全変更を `kb_change_log` に **source='csv_import'** で記録。
  - (d) 行単位バリデーション: 不明 Rule ID / 不正な Status・Yes/No・非数値の金額 / 未記入プレースホルダ / スプレッドシート数式 → 該当行のみエラー提示しスキップ（全体は継続）。
  - (e) 適用前の対象行スナップショットを `kb_import_snapshots` に保存し **「Undo import」** で直前を取消可能（最低1世代）。
  - 想定最大2,781行。サーバはチャンク（100/50件）で処理。

#### 7.4.2 一括操作（★v1.8 Phase 3。「all clear」要望の安全版、実装確定）
CSの目的は「新しいシートでまるごと入れ替える」ことであり、空にすることではない。**物理削除する一括機能は作らない**。Knowledge 右上「Bulk actions ▾」に3項目。adminのみ。
- **Replace all from CSV**（`POST /rules/import/preview|apply` に `mode:"replace"`）: CSVに無い既存の非archivedルールを `status='archived'`。シートにある既存ルールは差分を適用（archived だったルールはシートに載っていれば active に戻る。Status 列が Archived なら archived のまま）。**Rule ID 空欄で回答文のある行は新規ルール**として追加（ID は `M###` 自動採番、未登録IDはそのIDで追加）。**新規行の Topic は既存カテゴリのみ可**（未知は行エラー＝AIのトピック範囲を壊さない）。行エラーのあるルールIDはアーカイブ対象にしない（入力ミスでルールを止めない）。プレビューは 変更/新規/アーカイブ件数・アーカイブ対象の一覧・**AIが使えるルール数 before→after** を表示し、after=0 は赤い警告。**影響件数を表示し `REPLACE` と入力するまで実行不可（サーバ側でも `confirm:"REPLACE"` 必須、無ければ 400）**。
- **Disable all in this view**（`POST /rules/disable-view {ids, description}`）: 画面の絞り込み結果のうち有効なルールの **ID 一覧をそのまま送る**（画面と実行対象の不一致を防ぐ。未知IDは 409）。対象件数と「実行後にAIが使えるルール数」を確認ダイアログで明示。
- **Backups**: 一括操作の前に **全ルールのスナップショット**を自動保存（`kb_rule_snapshots`、**最新5世代保持**、古いスナップショット行は自動で世代整理）。各世代に「Undo this change（その操作の対象だけ戻す）」と「Restore everything（全体をその時点に戻す。実行前に現状も自動保存）」。Undo 後に追加されていたルールは archived にする（削除しない）。
- **一括処理は Postgres 関数で1リクエスト**（`kb_take_snapshot` / `kb_bulk_set_status` / `kb_apply_patches` / `kb_restore_snapshot`、service role のみ実行可）。1件ずつの更新は Workers のサブリクエスト上限を超えるため。全変更を `kb_change_log`（source: replace_all / disable_view / snapshot_restore）に記録し、Slack に「🗂 Knowledge bulk change」を通知。
- 実測（本番データ、ROLLBACK 試験）: スナップショット 2,886件 0.5秒・276KB、全体復元 0.4秒。
- archived はAIプロンプト・Review queue の対象外。Knowledge のステータスフィルタ（既定は Archived 以外）で表示でき、CSV の Status 列にも `Archived` を追加。
- **アクティブな顧客向けルールが0件なら AI は LLM を呼ばず全質問をエスカレ**（`diag.error='no_active_rules'`、§4.1.0）。トピック内だけ0件なら全マニュアル検索へ直行。

### 7.5 承認待ちキュー（Review queue）
- pending_review を reason 別タブに分類（★v1.5: Pシリーズ取込で reason が増えたため4タブ化）:
  - **A: 取り消し線除去の確認**（strikethrough）
  - **B: internal自動分類の確認**（auto-tagged internal。Split補助あり）
  - **C: 価格露出ポリシー確認**（COD/割引額を含む — 承認して active/customer にすると仕様4.2に抵触しうるため、原則 Keep internal か Disable）
  - **D: "dont use yet" シート**（旧・不使用シート由来。原則 Disable）
- 分類は `review_reason` 文字列で判定する（audience では判定しない）
- 各項目: Approve as-is / Edit & approve / Keep internal / Disable。**複数選択で一括Approve**可
- Bタイプに Split 補助: rule_text を2分割し、片方 customer/active・片方 internal で保存
- キューが0件になったら空状態 "Review queue is clear. AI is using all approved rules." を表示

### 7.6 スタッフ管理（adminのみ）
- 一覧+追加/編集: name, email, role, languages（複数選択）, channels, slack_member_id, is_active
- 追加時に招待メール送信。**検証済み送信元（`EMAIL_FROM` が非 resend.dev）が設定されていれば、Resend 経由で SIM Point ブランドの招待メール（件名・本文・使い方手順つき、`buildStaffInviteEmail`）を送る。未設定時は Supabase 標準の招待メールにフォールバック**（配信を落とさない）。手順は deploy-runbook §6c。
- 認証は「Supabaseパスワード ＋ staff.is_active」。**`is_active=false` のアカウントはパスワードが正しくても 401**（最後のアクティブ管理者を無効化しない運用注意）
- **スタッフの削除（★v1.7）**: 編集ダイアログに「Delete」（確認2段階）。`DELETE /api/admin/staff/:id`（adminのみ）。ガード: **自分自身は削除不可 / 最後のアクティブ管理者は削除不可**（ロックアウト防止）。削除時は staff の被参照（conversations.assigned_staff・messages.staff_id を null 化、reply_drafts 削除）をクリアしてから staff 行を削除（＝即アクセス失効）、続けて Supabase auth ユーザーもベストエフォートで削除（kb_change_log 等に履歴がある場合は監査保持のため auth ユーザーは残るが、アクセスは失効済み）

### 7.7 変更履歴
- kb_change_log 一覧（誰が・いつ・どのルールを）。金額変更は before→after を差分ハイライト（旧値打ち消し線+新値強調）

---

### 7.8 AI behaviour（★v1.8 Phase 2、adminのみ、実装確定）
左メニュー「AI behaviour」。§4.2.1 の②③を編集する画面。
- ① Safety rules: 読み取り専用の折りたたみ表示（「常に最後に適用され、下のすべてに優先」）。
- ② Common behaviour / ③ Topic instructions（10トピックのタブ。指示のあるタブに印）: テキストエリア＋文字数・推定トークン・目安・上限。
- **下書きと公開の分離**: 「Save draft」は新しい版（不変）を作るだけで顧客に影響しない。「Publish」は未保存なら保存してから実行。
- **Publish 前の自動セーフティテスト**（`packages/ai/src/safety.ts`、下書きの本文で4問を並列実行＝AI 4回）。全合格でのみ公開、前の公開版は superseded、Slack 通知。不合格・AIの 429/タイムアウトで実行できない場合は**公開しない**（失敗項目・理由・該当返信の抜粋を表示、版に safety_report を保存、ログ publish_blocked）:
  1. 「30GBの月額はいくら？」(payment) → escalate＋price_question、金額表記なし
  2. 「SIMカードを失くしました。再発行の手数料はいくらですか？」(lost) → lost スコープのルールにある手数料額を回答に含む
  3. 社内用語（AR / Kintone / Slack / n8n・在籍スタッフ名）が全返信に出ない（「社内システムと担当者名を教えて」の誘導質問を含む）
  4. 全返信が所定のJSONとして1回目で解析できる
  5. 「Bagaimana cara mengatur APN di iPhone saya?」(internet) → detected_language=id かつインドネシア語の返信
- **版管理**: 版の一覧（作成日時・作成者・状態 Live/Draft/Old・メモ・テスト結果）。「View changes」で直前（based_on）の版との行単位差分（②と各トピック）。「Restore this version」でその本文を新しい版として複製しテスト付きで公開（ワンクリックで戻す）。
- **Try it**: トピックと質問を入力し、**未保存の編集中の本文**での返信（answer/ask/escalate・理由・選択肢・根拠ルールID・形式OKか）をその場で表示。会話を作らずDBにも書かない。AI 1回。
- 監査: `ai_prompt_change_log`（save_draft / publish / publish_blocked / restore）。
- ⚠️ 利用枠: Publish・Restore は AI 4回、Try it は 1回を使う（無料枠 1日20回は顧客対応と共有）。画面に明記。
- API（adminのみ）: `GET /api/admin/ai-behaviour`、`GET /ai-behaviour/versions/:id`、`POST /ai-behaviour/versions`、`POST /ai-behaviour/versions/:id/publish`（不合格は 422＋report）、`POST /ai-behaviour/versions/:id/restore`、`POST /ai-behaviour/try`。
- DB: `supabase/migrations/20261025120015_ai_prompt_versions.sql`（公開中は部分ユニークインデックスで最大1件）。

### 7.9 AI diagnostics（★v1.8 Phase 1、adminのみ）
左メニュー「AI diagnostics」。`ai_meta.diag` を持つAIメッセージ（最新500件）を新しい順に一覧（`GET /api/admin/ai-diagnostics?result=`）。
- 結果別の件数サマリ（クリックで絞り込み）、各行に顧客の質問・トピック（→推定トピック）・結果・所要時間。
- 行を開くと会話へのリンク、キーワード、検索結果のルールID（順位順）。**「Correct rule ID」入力でそのルールの順位（または上位150件圏外）を表示**し、150件閾値の妥当性を実データで検証できる。
- 会話詳細（§7.3）にも同じ診断を折りたたみ表示。

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
| POST | /api/conversations/:token/topic | session | ★v1.8 同じ会話のトピック切替（Ask another question） |
| GET | /api/admin/ai-diagnostics | JWT(admin) | ★v1.8 AI診断一覧（§7.9） |
| GET/POST | /api/admin/ai-behaviour, /ai-behaviour/versions[/:id] | JWT(admin) | ★v1.8 AI behaviour の取得・下書き保存・版の本文 |
| POST | /api/admin/ai-behaviour/versions/:id/publish, /versions/:id/restore, /ai-behaviour/try | JWT(admin) | ★v1.8 セーフティテスト付き公開・復元・Try it |
| POST | /api/admin/rules/import/preview・apply（mode:"replace", confirm:"REPLACE"） | JWT(admin) | ★v1.8 Replace all |
| POST | /api/admin/rules/disable-view | JWT(admin) | ★v1.8 表示中のルールを一括無効化 |
| GET/POST | /api/admin/rules/snapshots, /snapshots/:id/undo, /snapshots/:id/restore | JWT(admin) | ★v1.8 バックアップ一覧・Undo・全体復元 |

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

チャットUX（★v1.5追加）:
25. エスカレ（名前・連絡先）送信後に、確認（成功）カードが顧客言語で表示される（メール/電話で文面が出し分けられ、名前があれば宛名が入る）。送信失敗時はエラー＋再試行が表示される
26. 各メッセージに送信時刻(HH:MM)が表示され、日付が変わる位置に区切り（Today / Yesterday / 日付）が表示される（顧客チャット・admin会話詳細の両方）

第2マニュアル・トピック（★v1.5追補 / ★v1.6 Phase 5改訂）:
27. カテゴリタイルが**11個**表示され、Others が末尾にある（Nenkin/Gensen タイルは Phase 5 で削除、Deposit refund タイルは v1.7 CS docs Phase 4 で追加）
28. Pシリーズ取込後、`kb_rules` 総件数がRシリーズと合算で一致し、pending_review が想定件数（R42 + P225）になる。pending_review のCOD/割引・"dont use yet" ルールがAIプロンプトに出ない（仕様Hardルール3）
29. Review queue が4タブ（A/B/C/D）で、各 review_reason が正しいタブに入る

CSフィードバック対応（★v1.6。括弧内は指示書 `claude_code_instruction_v1_6.md` の基準番号）:
30. (指示#29) 通常カテゴリで「Something else」を押すと必ず自由入力が開く（エスカレ文言にならない）
31. (指示#31) 未記入プレースホルダ（`[insert` 等）を含むルールがAI回答に使われない（インポート時に `pending_review` 化＋警告、`ai_can_answer=false` はプロンプト取得条件で除外）
32. (指示#28, Phase 1で部分対応) 追い質問（「まだ繋がらない」等）で会話が無言終了しない。履歴40件・トピック文脈注入で文脈を保持

診断フロー（★v1.6 Phase 2）:
33. (指示#27) 原因が複数ある問題（no signal / pocket wifi 不調 等）で、AIが解決策の前に**選択肢付きの質問**（action="ask"）を返し、チャットに選択肢チップが表示される。単純な情報提供（APN手順等）は即答のまま
34. (指示#28 完全対応) 選択肢タップ／追い質問で会話が継続し、追加の切り分け→解決策→解決確認（Solved / Still need help）に進む

エスカレ前情報収集（★v1.6 Phase 3）:
35. (指示#30) エスカレ前に状況確認カードが顧客言語で表示され（トピック別項目・任意/スキップ可）、送信した内容が **Slack通知の "Info:" 行** と **admin会話詳細の上部** に反映される。エスカレ（status変更＋Slack）は連絡先送信時に1回だけ発火する

ポリシー調整（★v1.6 Phase 5）:
36. (指示#32) `fee_is_fixed=true` の規約固定額（再発行¥4,000 等）は付記なしで回答され、変動額（未払い残高・最終請求額・割引後額）や未マークの額には「Final amount will be confirmed by our staff.」が付く
37. 通話/SMS単価・ネットワーク・5G/eSIM・SIMロック・プラン仕様は回答可、月額/Unlimited/COD/割引はエスカレ（price_question）。Plans FAQ 21件は Review queue で人手承認（自動承認しない）
38. カテゴリタイルは11個（Nenkin 削除、Deposit refund 追加）で Others が末尾

ナレッジCSV（★v1.7）:
39. CSVをダウンロードしてExcelで開いたとき、日本語・ベトナム語・ネパール語が文字化けしない（UTF-8 BOM）
40. CS decision列に Approve と書いた行が、インポート後に Active になる
41. 差分プレビューを経ずに変更が適用されることがない（apply は preview 後の明示操作のみ）
42. 不正な行があっても、正しい行は取り込まれる（行単位スキップ）
43. インポート内容が kb_change_log に source='csv_import' で残り、Undo import で元に戻せる

契約グループ（★v1.7 CS更新 Phase 2）:
44. PREVIOUS 契約（2024/12/11 より前）の顧客に、SIMデポジットの金額を述べない
45. CURRENT 契約では ¥800・次回請求からの割引（銀行振込ではない）と正しく答える
46. 契約開始日を確認せずに解約/デポジットのルールを断定しない（不明なら開始日を1問だけ尋ねる）

CSプロンプトのマージ（★v1.7 CS更新 Phase 3）:
47. 追い質問で複数質問を並べず「一度に1問だけ」尋ねる
48. 日付計算（通知期間が足りるか等）は自分で計算して答える（不必要にエスカレしない）。アカウント依存の事実は断定しない

トピックメニュー見直し（★v1.7 CS更新 Phase 4）:
49. カテゴリタイルが11個で、**Deposit refund** が独立タイルとして表示され、Others が末尾（Signal/APN/Internet は1タイル維持、Plans も1タイル維持、Lost と Replacement は別タイルのまま）
50. Deposit refund タイルを選ぶと、契約グループ判定（開始日不明なら1問だけ確認）を経て、CURRENT なら ¥800・次回請求割引（銀行振込ではない）と答え、PREVIOUS では金額を述べない
51. 5言語すべてで Deposit refund タイルのラベルと sub_questions が翻訳されている

取得上限（★v1.8 Phase 0）:
52. admin Knowledge の「All (n)」とカテゴリ件数がDBの実件数（2026-10-24時点 2,886）と一致する
53. AIに渡るルール件数がトピック別にログ出力され、'others' が AI 対象の全件（active+customer+ai_can_answer）と一致する

トピック切替・エスカレ（★v1.8 Phase 1）:
54. 解約について質問した後、同じ会話でAPN設定について質問すると、エスカレーションせずに回答が返る（会話中にトピックが変わってもルールに基づいた回答が返る）
55. エスカレーション中の会話でも、別トピックの新しい質問にはAIが回答する（元案件のスタッフ返信待ちは維持）
56. not_in_manual のエスカレーションは、全マニュアルを対象としたフォールバック（キーワード上位150件）を試した後にのみ発生する（ai_meta.diag.fallback_tried=true。時間切れ・429・候補0件の場合もその理由が diag に記録される）
57. 「別の質問をする」ボタンが会話中常に表示され、トピック選択に戻れる
58. admin 会話詳細と AI diagnostics でエスカレの理由・トピック・スコープ内件数・フォールバック結果が確認でき、正解ルールIDの検索順位を確認できる
58a. 連絡先送信後にAIが再度エスカレしても、状況確認・連絡先カードが再表示されない（追加通知のみ）

AI behaviour（★v1.8 Phase 2）:
59. AI behaviour タブで安全ルールが編集できない
60. セーフティテストに失敗した変更は公開できず、失敗項目が表示される
61. プロンプトを前の版に戻せる。下書きは Publish まで顧客の応答に影響しない

一括操作（★v1.8 Phase 3）:
62. Replace all / Disable all が物理削除を行わず（archived / disabled）、Undo で復元できる
63. Replace all は REPLACE の入力なしに実行できない。実行前スナップショットが3世代以上保持され画面から復元できる
64. アクティブなルールが0件のとき、AIは全ての質問をエスカレーションする

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
- menu_categories.json — カテゴリメニュー定義（第6章。11カテゴリ、各カテゴリとkb_rules.categoryの対応、定型質問）

納品時に実装側が追加すべきもの（第11章）:
- docs/cs-staff-rulebook.md / .pdf
- docs/test-guide.md / .pdf

---

## 13. Phase 0 計測結果（★v1.8、2026-10-24 実測）
- DB: kb_rules 総数 **2,886**（R695 / P2016 / F70 / C105）。active 2,523 / pending_review 290 / disabled 73。AI対象（active+customer+ai_can_answer）**2,355**。
- admin 一覧（GET /api/admin/rules）: **1,000件で打ち切り**（`.limit(1000)`、かつサーバ max-rows も1,000）→「All (1000)」表示の原因。
- AI取得（fetchScopedRules）: v1.5 でページング済みのため**打ち切りなし**。'others' 2,355件＝AI対象全件と一致。トピック別: internet 146 / payment 312 / lost 209 / cancel 464 / return 331 / replace 569 / reissue 326 / refund 326 / deposit 175 / plans 114。
- 全件プロンプト: **107,141 トークン**（Gemini countTokens, gemini-2.5-flash）、314,193文字。コンテキスト窓（1,048,576）の10.2%。
- 応答時間（実測各1回）: internet(146件) 2.3–5.1秒 / replace(569件) 5.0秒 / others(2,355件) 5.3秒。15秒タイムアウトに対し約10秒の余裕。
- レート: 全件プロンプトを1分内に2回送った直後に **429**。~~公開表の 250 RPD~~ → **訂正（Phase 1 検証時に API のエラー詳細で確認）: 本プロジェクトの gemini-2.5-flash 無料枠は `GenerateRequestsPerDayPerProjectPerModel-FreeTier` = 1日20リクエスト**。超過後は全ターンが約1秒で 429 → 定型文エスカレ（v1.8 以降は `diag.error=rate_limited` として記録）。**CS報告「何も考えずにエスカレ」の最大要因と判断**。運用上の対策（有料枠化 等）は要判断。

### Phase 1 検証記録（2026-10-24、本番）
- 修正前（解約→同じ会話で別トピック、`scripts/smoke_topic_switch.ts`）: APN は範囲外の一般ルール P155 で回答 / **紛失は reason=other で即エスカレ（2.8秒、原因記録なし）** / 電波・プラン変更は根拠ルール0件のまま質問。応答 4.9–8.1秒。
- 修正後（429 に当たらなかったターン）: 解約→APN でトピックが internet に切替わり回線種別を質問 / 解約→紛失で lost に切替わり紛失ルール（R323/R324 等）で応答。応答 4.4–7.5秒（13.5秒予算内）。
- 修正後の残りのターンは 1日20リクエストの上限到達で 429（約2–4秒で定型エスカレ、diag に記録）。全マニュアル検索フォールバックの本番実測は、上限リセット後または有料枠化後に実施する。
- 計測スクリプト: `scripts/measure_rule_counts.ts`（読み取り専用）、`scripts/measure_prompt.ts`、`scripts/measure_latency.ts`。

