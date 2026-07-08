/**
 * Customer display label for the Inbox and conversation header.
 * Priority (spec): name → contact (email / phone) → short session id (e.g. #4F2A).
 */
export interface CustomerFields {
  customer_name?: string;
  contact_email?: string;
  contact_whatsapp?: string;
  short_id?: string;
  id?: string;
}

export function customerLabel(c: CustomerFields): string {
  const name = c.customer_name?.trim();
  if (name) return name;
  const contact = c.contact_email?.trim() || c.contact_whatsapp?.trim();
  if (contact) return contact;
  if (c.short_id) return c.short_id;
  return c.id ? `#${c.id.replace(/[^0-9a-f]/gi, '').slice(0, 4).toUpperCase()}` : '—';
}

/** The contact line (email/phone) for the conversation header, or empty. */
export function contactLine(c: CustomerFields): string {
  return c.contact_email?.trim() || c.contact_whatsapp?.trim() || '';
}
