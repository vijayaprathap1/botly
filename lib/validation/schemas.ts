import { z } from "zod";

export const publicKey = z.string().trim().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/);
export const visitorId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "invalid visitor id");
const optionalText = (max: number) => z.string().max(max).nullish();

export const identitySchema = z
  .object({ name: z.string().max(80).optional(), phone: z.string().max(40).optional(), email: z.string().max(200).optional() })
  .nullish();

export const chatRequestSchema = z.object({
  key: publicKey,
  visitorId,
  conversationId: z.string().uuid().nullish(),
  message: z.string().trim().min(1, "Message is empty").max(1000, "Message is too long (1,000 characters max)"),
  pageUrl: optionalText(2000),
  pageTitle: optionalText(500),
  testToken: optionalText(200),
  identity: identitySchema,
  debug: z.boolean().optional(),
});

export const leadRequestSchema = z.object({
  key: publicKey,
  visitorId,
  conversationId: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(5).max(40),
  email: z.string().trim().max(200).nullish(),
  need: z.string().trim().max(500).nullish(),
  type: z.enum(["purchase", "human", "bulk", "callback", "other"]).default("human"),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  preferredSlot: z.string().trim().max(40).nullish(),
  pageUrl: optionalText(2000),
  pageTitle: optionalText(500),
  testToken: optionalText(200),
});

export const configQuerySchema = z.object({ key: publicKey, testToken: optionalText(200) });

export const historyQuerySchema = z.object({
  key: publicKey,
  visitorId,
  conversationId: z.string().uuid(),
  testToken: optionalText(200),
});
