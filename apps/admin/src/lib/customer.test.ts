import { describe, expect, it } from 'vitest';
import { customerLabel, contactLine } from './customer';

describe('customerLabel (Inbox / detail priority)', () => {
  it('prefers the name', () => {
    expect(customerLabel({ customer_name: 'Aiko', contact_email: 'a@b.com', short_id: '#4F2A' })).toBe('Aiko');
  });
  it('falls back to email, then phone', () => {
    expect(customerLabel({ contact_email: 'a@b.com', short_id: '#4F2A' })).toBe('a@b.com');
    expect(customerLabel({ contact_whatsapp: '+8190', short_id: '#4F2A' })).toBe('+8190');
  });
  it('falls back to the short id, then derives one from the uuid', () => {
    expect(customerLabel({ short_id: '#4F2A' })).toBe('#4F2A');
    expect(customerLabel({ id: '4f2ab9c0-1234' })).toBe('#4F2A');
    expect(customerLabel({})).toBe('—');
  });
});

describe('contactLine', () => {
  it('returns email or phone, else empty', () => {
    expect(contactLine({ contact_email: 'a@b.com' })).toBe('a@b.com');
    expect(contactLine({ contact_whatsapp: '+8190' })).toBe('+8190');
    expect(contactLine({ customer_name: 'Aiko' })).toBe('');
  });
});
