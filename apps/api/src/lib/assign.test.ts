import { describe, expect, it } from 'vitest';
import { FakeSupabase } from '../testing/fakeSupabase';
import { pickAssignee } from './assign';

describe('pickAssignee (§8)', () => {
  it('returns null when no active staff speaks the language', () => {
    const db = new FakeSupabase();
    db.tables.staff.push({ id: 's1', slack_member_id: 'U1', languages: ['en'], is_active: true });
    return expect(pickAssignee(db.asClient(), 'vi')).resolves.toBeNull();
  });

  it('skips inactive staff', async () => {
    const db = new FakeSupabase();
    db.tables.staff.push({ id: 's1', slack_member_id: 'U1', languages: ['vi'], is_active: false });
    expect(await pickAssignee(db.asClient(), 'vi')).toBeNull();
  });

  it('picks the matching-language staff with the fewest open conversations', async () => {
    const db = new FakeSupabase();
    db.tables.staff.push(
      { id: 's1', slack_member_id: 'U1', languages: ['vi', 'en'], is_active: true },
      { id: 's2', slack_member_id: 'U2', languages: ['vi'], is_active: true },
    );
    // s1 already handles two open cases; s2 handles one → s2 wins.
    db.tables.conversations.push(
      { id: 'a', status: 'escalated', assigned_staff: 's1' },
      { id: 'b', status: 'staff_replied', assigned_staff: 's1' },
      { id: 'c', status: 'escalated', assigned_staff: 's2' },
    );
    const picked = await pickAssignee(db.asClient(), 'vi');
    expect(picked?.id).toBe('s2');
    expect(picked?.slackMemberId).toBe('U2');
  });
});
