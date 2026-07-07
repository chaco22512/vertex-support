import { useState } from 'react';
import type { KbRule } from '@vertex/shared';
import { api } from '../lib/api';
import { Dialog } from './Dialog';

type Draft = {
  rule_text: string;
  fee_amounts_jpy: number[];
  links: string[];
  audience: 'customer' | 'internal';
  ai_can_answer: boolean;
  status: 'active' | 'pending_review' | 'disabled';
};

function toDraft(rule: KbRule): Draft {
  return {
    rule_text: rule.rule_text,
    fee_amounts_jpy: rule.fee_amounts_jpy ?? [],
    links: rule.links ?? [],
    audience: rule.audience,
    ai_can_answer: rule.ai_can_answer,
    status: rule.status,
  };
}

/**
 * Edit dialog for a knowledge rule (§7.4). Save writes a before/after change-log
 * entry server-side. "Changes apply to AI instantly." Destructive = status
 * 'disabled', never a physical delete.
 */
export function RuleDialog({
  rule,
  onClose,
  onSaved,
}: {
  rule: KbRule;
  onClose: () => void;
  onSaved: (updated: KbRule) => void;
}) {
  const [draft, setDraft] = useState<Draft>(toDraft(rule));
  const [feeText, setFeeText] = useState((rule.fee_amounts_jpy ?? []).join(', '));
  const [linksText, setLinksText] = useState((rule.links ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const fee_amounts_jpy = feeText
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const links = linksText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const { rule: updated } = await api.updateRule(rule.id, {
        rule_text: draft.rule_text,
        fee_amounts_jpy,
        links,
        audience: draft.audience,
        ai_can_answer: draft.ai_can_answer,
        status: draft.status,
      });
      onSaved(updated);
    } catch {
      setError('Could not save. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Edit rule ${rule.id}`} onClose={onClose}>
      <div className="field">
        <label htmlFor="rule-text">Rule text</label>
        <textarea
          id="rule-text"
          rows={5}
          value={draft.rule_text}
          onChange={(e) => setDraft({ ...draft, rule_text: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="rule-fee">Fee amounts (JPY, comma-separated)</label>
        <input
          id="rule-fee"
          type="text"
          value={feeText}
          onChange={(e) => setFeeText(e.target.value)}
          placeholder="e.g. 3000, 4000"
        />
      </div>
      <div className="field">
        <label htmlFor="rule-links">Links (one per line)</label>
        <textarea
          id="rule-links"
          rows={2}
          value={linksText}
          onChange={(e) => setLinksText(e.target.value)}
        />
      </div>
      <div className="row wrap">
        <div className="field">
          <label htmlFor="rule-audience">Audience</label>
          <select
            id="rule-audience"
            value={draft.audience}
            onChange={(e) => setDraft({ ...draft, audience: e.target.value as Draft['audience'] })}
          >
            <option value="customer">Customer</option>
            <option value="internal">Internal</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="rule-status">Status</label>
          <select
            id="rule-status"
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft['status'] })}
          >
            <option value="active">Active</option>
            <option value="pending_review">Pending review</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <label className="row" style={{ alignSelf: 'flex-end' }}>
          <input
            type="checkbox"
            checked={draft.ai_can_answer}
            onChange={(e) => setDraft({ ...draft, ai_can_answer: e.target.checked })}
          />
          AI can answer
        </label>
      </div>

      <p className="muted" style={{ margin: 0 }}>
        Changes apply to AI instantly.
      </p>
      {error ? (
        <div className="state error" style={{ padding: 0 }} role="alert">
          {error}
        </div>
      ) : null}
      <div className="dialog-actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save rule'}
        </button>
      </div>
    </Dialog>
  );
}
