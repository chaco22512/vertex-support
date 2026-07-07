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
