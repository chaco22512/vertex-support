# Project: Vertex Support Bot

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
