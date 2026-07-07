import { z } from 'zod';
import { ESCALATION_REASONS } from '@vertex/ai';

export const createConversationSchema = z.object({
  language: z.string().min(2).max(8).optional(),
  source_tag: z.string().max(64).optional(),
  topic_category: z.string().max(64).optional(),
});

export const postMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

const reasonSchema = z.enum(ESCALATION_REASONS);

export const contactSchema = z
  .object({
    email: z.string().email().max(320).optional(),
    whatsapp: z.string().min(3).max(32).optional(),
    reason: reasonSchema.optional(),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.whatsapp), {
    message: 'email or whatsapp is required',
  });

export const feedbackSchema = z.object({
  type: z.enum(['solved', 'still_need_help']),
  reason: reasonSchema.optional(),
});

// --- admin (§7) ---
export const patchConversationSchema = z
  .object({
    status: z.enum(['ai_handling', 'escalated', 'staff_replied', 'resolved', 'closed']).optional(),
    assigned_staff: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.assigned_staff !== undefined, {
    message: 'nothing to update',
  });

export const replySchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const translateSchema = z.object({ text: z.string().trim().min(1).max(4000) });
export const draftBodySchema = z.object({ body: z.string().max(4000) });

const feeArray = z.array(z.number().int().nonnegative()).max(20);
export const createRuleSchema = z.object({
  category: z.string().min(1).max(120),
  subcategory: z.string().max(120).optional(),
  rule_text: z.string().min(1).max(4000),
  fee_amounts_jpy: feeArray.optional(),
  links: z.array(z.string().url()).max(20).optional(),
  audience: z.enum(['customer', 'internal']),
  ai_can_answer: z.boolean(),
  requires_fee_disclaimer: z.boolean().optional(),
  status: z.enum(['active', 'pending_review', 'disabled']).optional(),
});
export const updateRuleSchema = z.object({
  category: z.string().min(1).max(120).optional(),
  subcategory: z.string().max(120).optional(),
  rule_text: z.string().min(1).max(4000).optional(),
  fee_amounts_jpy: feeArray.optional(),
  links: z.array(z.string().url()).max(20).optional(),
  audience: z.enum(['customer', 'internal']).optional(),
  ai_can_answer: z.boolean().optional(),
  requires_fee_disclaimer: z.boolean().optional(),
  status: z.enum(['active', 'pending_review', 'disabled']).optional(),
  review_reason: z.string().max(400).optional(),
});
export const approveRulesSchema = z.object({ ids: z.array(z.string()).min(1).max(100) });
export const splitRuleSchema = z.object({
  customer_text: z.string().min(1).max(4000),
  internal_text: z.string().min(1).max(4000),
});

export const createStaffSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(320),
  role: z.enum(['admin', 'staff']).optional(),
  languages: z.array(z.string().min(2).max(8)).optional(),
  channels: z.array(z.enum(['webchat', 'whatsapp', 'line', 'messenger'])).optional(),
  slack_member_id: z.string().max(64).optional(),
});
export const updateStaffSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(['admin', 'staff']).optional(),
  languages: z.array(z.string().min(2).max(8)).optional(),
  channels: z.array(z.enum(['webchat', 'whatsapp', 'line', 'messenger'])).optional(),
  slack_member_id: z.string().max(64).optional(),
  is_active: z.boolean().optional(),
});
