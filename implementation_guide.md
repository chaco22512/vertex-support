# Claude Code 実装ガイド — SIM Point Support Bot

このガイドの通りに準備し、最後の「キックオフプロンプト」をClaude Codeに貼り付ければ実装が始まります。

---

## 1. 事前準備チェックリスト（Claude Code起動前に人間がやること）

### アカウント・キー取得
- [ ] **GitHub**: 空のプライベートリポジトリを作成（例: `vertex-support-bot`）
- [ ] **Supabase**: 新規プロジェクト作成 → 控える: Project URL / anon key / service_role key（Settings > API）
- [ ] **Gemini API**: Google AI Studio (aistudio.google.com) でAPIキー発行（無料）
- [ ] **Slack**: 通知用チャンネル（例 #cs-escalation）を作成し、Incoming Webhook URLを発行
- [ ] **Resend**: アカウント作成しAPIキー発行（送信元ドメイン認証は後日でも可。テスト中はResendのテストドメインでOK）
- [ ] **Cloudflare**: アカウント作成（Pages/Workersデプロイ用。ローカル開発が終わってからでも可）

### 決めておくこと
- [ ] サービス表示名（仕様書では仮に "SIM Point Support"）
- [ ] 顧客通知メールの送信元アドレス

### ローカル環境
- [ ] Node.js 18以上 / git / Claude Code最新版（`claude update` 実行。Sonnet 5利用にはv2.1.197以降が必要）

---

## 2. リポジトリの初期セットアップ（Claude Code起動前）

リポジトリ直下に以下を配置してからClaude Codeを起動する:

```
vertex-support-bot/
├── CLAUDE.md                      ← 下記3をコピー
├── docs/
│   ├── build_spec_v1_4.md         ← 仕様書（唯一の正）
│   └── needs_review.md
├── data/
│   ├── kb_rules_import.json
│   └── menu_categories.json
├── assets/
│   ├── logo-mark.svg
│   └── logo-horizontal.webp
└── .env.example                   ← 下記の内容で作成
```

`.env.example`（実際のキーは `.env` に書き、`.gitignore` 対象にする）:
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
SLACK_WEBHOOK_URL=
RESEND_API_KEY=
ADMIN_BASE_URL=http://localhost:5174
```

---

## 3. CLAUDE.md（リポジトリ直下に置く。Claude Codeが毎回読む指示書）

```markdown
# Project: SIM Point Support Bot

## Source of truth
- docs/build_spec_v1_4.md がこのプロジェクトの唯一の仕様。実装判断に迷ったら必ずここに戻る。
- 仕様と矛盾する実装をしない。仕様が不明瞭・実装不能な場合は、勝手に解釈せず人間に質問する。

## Hard rules（違反禁止）
1. APIキー・シークレットをコードやフロントエンドに埋め込まない。環境変数のみ。.env はコミットしない。
2. 月額プラン料金・COD価格・割引額をAIが回答するコードパスを作らない（仕様4.2）。
3. kb_rules の status='pending_review' / audience='internal' のルールをAIプロンプトに含めない。
4. AI draft機能は返信欄への挿入のみ。無編集の自動送信を可能にする実装をしない（仕様7.3）。
5. DBの破壊的マイグレーション・データ削除の前に必ず人間に確認する。

## Conventions
- TypeScript strict。API: Hono on Cloudflare Workers。DB: Supabase。
- フロント: /apps/chat（Preact, 性能予算150KB厳守）と /apps/admin（React）。
- デザインは仕様5章のトークンをCSS変数として実装し、ハードコードした色を書かない。
- 各マイルストーン完了時に: テスト実行 → 仕様の該当受け入れ基準を自己チェック → コミット（conventional commits）→ 人間に完了報告と次の確認事項を提示。

## Testing
- AIパイプライン（プロンプト構築・JSONパース・エスカレ判定・PIIマスキング）はユニットテスト必須。
- Gemini呼び出しはモック可能な設計にする。
```

---

## 4. キックオフプロンプト（Claude Codeに貼り付ける最初の指示）

推奨起動: `claude --model opusplan`（計画=Opus、実装=Sonnetの自動切替）

```
docs/build_spec_v1_4.md を読み込んでください。これから仕様書に基づいて実装を進めます。
CLAUDE.md のルールを厳守してください。

以下のマイルストーン順で進めます。各マイルストーンの開始前にplan modeで実装計画を提示し、
私の承認を得てから実装してください。完了時は受け入れ基準の該当項目を自己チェックして報告してください。

M0: プロジェクト骨格 — monorepo構成、TypeScript/lint設定、.env読み込み、Supabaseクライアント
M1: DB — 仕様3章のスキーマをSupabaseマイグレーションとして作成、RLSポリシー、
    scripts/import_kb.ts で data/kb_rules_import.json を投入（42件はpending_review）
M2: AIパイプライン — 仕様4章。プロンプト構築（カテゴリスコープ）、Gemini呼び出し、
    JSON出力パース、PIIマスキング、エスカレ判定。ユニットテスト込み
M3: チャットAPI — 仕様9章の /api/conversations 系エンドポイント一式（Workers/Hono）
M4: 顧客チャットUI — 仕様5〜6章。ガイドフロー（言語選択→カテゴリ→定型質問→AI回答→
    Solved/Still need help→エスカレカード）。data/menu_categories.json を使用。性能予算150KB
M5: admin — 仕様7章。ログイン、Inbox、会話詳細（Translate/AI draft/下書き保存）、
    ナレッジ管理、Review queue、スタッフ管理、変更履歴
M6: 通知 — Slack Webhook、Resendメール、Cron期限リマインダー（仕様8章）
M7: ドキュメント — 仕様11章の CS Staff Rulebook と Test Guide（スクリーンショット箇所は
    プレースホルダーで作成し、デプロイ後に差し替え）
M8: デプロイ — Cloudflare Pages/Workers、環境変数設定、受け入れ基準1〜23の通しテスト

まず M0 の計画から始めてください。現在の環境変数は .env に設定済みです。
```

---

## 5. 進行中の運用ヒント

- **1マイルストーン=1セッションを目安に**。長くなったら `/compact` で文脈を整理
- 計画に納得できない時は承認せず修正指示。実装後の手戻りより計画段階の議論が安い
- M2（AIパイプライン）とM5（admin）が最難所。品質が不安なら `/model opus` に切り替えて実施
- 各マイルストーン後に `git push` させ、GitHubで差分を眺める習慣を（全部読む必要はなく、Hard rules違反がないかだけ確認）
- 仕様の解釈で議論になったら、この仕様書を作った会話（Claude / Fable）に持ち帰って裁定させる

## 6. 完了の定義
受け入れ基準1〜24（仕様10章・11.3章）がすべてパスし、docs/ に Rulebook と Test Guide が揃った状態。
その後、CSスタッフへのテスト配布（Test Guideに従う）へ進む。
