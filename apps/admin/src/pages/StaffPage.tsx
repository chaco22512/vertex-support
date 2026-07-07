import { useCallback, useEffect, useState } from 'react';
import type { Channel, LanguageCode, Role, Staff } from '@vertex/shared';
import { api } from '../lib/api';
import { languageName } from '../lib/categories';
import { EmptyState, ErrorState, TableSkeleton } from '../components/states';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';

type Load = 'loading' | 'ready' | 'error';

const LANGS: LanguageCode[] = ['en', 'id', 'tl', 'ne', 'vi'];
const CHANNELS: Channel[] = ['webchat', 'whatsapp', 'line', 'messenger'];

export function StaffPage() {
  const toast = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [editing, setEditing] = useState<Staff | null>(null);
  const [adding, setAdding] = useState(false);

  const fetchStaff = useCallback(async () => {
    setLoad('loading');
    try {
      const { staff } = await api.listStaff();
      setStaff(staff);
      setLoad('ready');
    } catch {
      setLoad('error');
    }
  }, []);

  useEffect(() => {
    void fetchStaff();
  }, [fetchStaff]);

  return (
    <>
      <div className="page-head">
        <h1>Staff</h1>
        <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
          Add staff
        </button>
      </div>

      {load === 'loading' ? (
        <TableSkeleton cols={5} />
      ) : load === 'error' ? (
        <ErrorState onRetry={() => void fetchStaff()} />
      ) : staff.length === 0 ? (
        <EmptyState title="No staff yet." hint="Add your first teammate to start assigning conversations." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Languages</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} onClick={() => setEditing(s)}>
                  <td>{s.name}</td>
                  <td>{s.email}</td>
                  <td style={{ textTransform: 'capitalize' }}>{s.role}</td>
                  <td>{(s.languages ?? []).map((l) => l.toUpperCase()).join(', ')}</td>
                  <td>{s.is_active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <AddStaffDialog
          onClose={() => setAdding(false)}
          onAdded={(s) => {
            setStaff((list) => [...list, s]);
            setAdding(false);
            toast.show({ message: `Invitation sent to ${s.email}.` });
          }}
        />
      ) : null}
      {editing ? (
        <EditStaffDialog
          staff={editing}
          onClose={() => setEditing(null)}
          onSaved={(s) => {
            setStaff((list) => list.map((x) => (x.id === s.id ? s : x)));
            setEditing(null);
            toast.show({ message: `${s.name} updated.` });
          }}
        />
      ) : null}
    </>
  );
}

function MultiSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: T[];
  value: T[];
  onChange: (next: T[]) => void;
  render: (o: T) => string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row wrap">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <label key={o} className="chip" style={{ cursor: 'pointer', color: on ? 'var(--accent)' : 'var(--ink-muted)' }}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
                style={{ marginRight: 4 }}
              />
              {render(o)}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function AddStaffDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (s: Staff) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [languages, setLanguages] = useState<LanguageCode[]>(['en']);
  const [channels, setChannels] = useState<Channel[]>(['webchat']);
  const [slack, setSlack] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { staff } = await api.createStaff({
        name: name.trim(),
        email: email.trim(),
        role,
        languages,
        channels,
        slack_member_id: slack.trim(),
      });
      onAdded(staff);
    } catch {
      setError('Could not add staff. The invite may have failed.');
      setBusy(false);
    }
  }

  return (
    <Dialog title="Add staff" onClose={onClose}>
      <p className="muted" style={{ margin: 0 }}>
        An invitation email is sent so they can set a password.
      </p>
      <div className="field">
        <label htmlFor="s-name">Name</label>
        <input id="s-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="s-email">Email</label>
        <input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="s-role">Role</label>
        <select id="s-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <MultiSelect label="Languages" options={LANGS} value={languages} onChange={setLanguages} render={(l) => languageName(l)} />
      <MultiSelect label="Channels" options={CHANNELS} value={channels} onChange={setChannels} render={(c) => c} />
      <div className="field">
        <label htmlFor="s-slack">Slack member ID</label>
        <input id="s-slack" type="text" value={slack} onChange={(e) => setSlack(e.target.value)} />
      </div>
      {error ? (
        <div className="state error" style={{ padding: 0 }} role="alert">
          {error}
        </div>
      ) : null}
      <div className="dialog-actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </Dialog>
  );
}

function EditStaffDialog({
  staff,
  onClose,
  onSaved,
}: {
  staff: Staff;
  onClose: () => void;
  onSaved: (s: Staff) => void;
}) {
  const [name, setName] = useState(staff.name);
  const [role, setRole] = useState<Role>(staff.role);
  const [languages, setLanguages] = useState<LanguageCode[]>(staff.languages ?? []);
  const [channels, setChannels] = useState<Channel[]>(staff.channels ?? []);
  const [slack, setSlack] = useState(staff.slack_member_id ?? '');
  const [isActive, setIsActive] = useState(staff.is_active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { staff: updated } = await api.updateStaff(staff.id, {
        name: name.trim(),
        role,
        languages,
        channels,
        slack_member_id: slack.trim(),
        is_active: isActive,
      });
      onSaved(updated);
    } catch {
      setError('Could not save changes. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Edit ${staff.name}`} onClose={onClose}>
      <div className="field">
        <label htmlFor="e-name">Name</label>
        <input id="e-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Email</label>
        <input type="email" value={staff.email} disabled />
      </div>
      <div className="field">
        <label htmlFor="e-role">Role</label>
        <select id="e-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <MultiSelect label="Languages" options={LANGS} value={languages} onChange={setLanguages} render={(l) => languageName(l)} />
      <MultiSelect label="Channels" options={CHANNELS} value={channels} onChange={setChannels} render={(c) => c} />
      <div className="field">
        <label htmlFor="e-slack">Slack member ID</label>
        <input id="e-slack" type="text" value={slack} onChange={(e) => setSlack(e.target.value)} />
      </div>
      <label className="row">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active (receives assignments)
      </label>
      {error ? (
        <div className="state error" style={{ padding: 0 }} role="alert">
          {error}
        </div>
      ) : null}
      <div className="dialog-actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Dialog>
  );
}
