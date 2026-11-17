import type { ToolDef } from "../llm/types";
import { hasGrowthTools } from "../plans";
import type { Plan } from "../types";

const leadTypes = ["purchase", "human", "bulk", "callback", "other"];

export const TOOL_CAPTURE_LEAD: ToolDef = {
  name: "capture_lead",
  description:
    "Save a sales lead and notify the business owner by email/WhatsApp. Call ONLY after the visitor has actually typed their name and phone number in this conversation (or they are listed under 'Known so far'). Never invent or guess details. If you only have some details, ask for the missing one instead of calling this.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Visitor's name exactly as they gave it." },
      phone: { type: "string", description: "Phone number exactly as the visitor typed it." },
      email: { type: "string", description: "Email, only if the visitor gave one." },
      need: { type: "string", description: "One line: what they want (product, quantity, occasion...). In English." },
      type: { type: "string", enum: leadTypes, description: "purchase, bulk (bulk/custom order), human, callback or other." },
    },
    required: ["name", "phone", "need", "type"],
  },
};

export const TOOL_HANDOFF: ToolDef = {
  name: "handoff_to_human",
  description:
    "Hand the conversation to the business team: the visitor asked for a person, is unhappy, or needs something only a human can do. If the visitor has given name and phone, include them and the handoff completes. If not, call it without them: the widget shows a short contact form to the visitor.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Why a human is needed, in English, one line." },
      summary: { type: "string", description: "Two short lines in English for the owner: what the visitor wants and any key details." },
      name: { type: "string", description: "Only if the visitor gave it." },
      phone: { type: "string", description: "Only if the visitor gave it." },
      email: { type: "string", description: "Only if the visitor gave it." },
    },
    required: ["reason", "summary"],
  },
};

export const TOOL_REPORT_UNANSWERED: ToolDef = {
  name: "report_unanswered",
  description:
    "Record a question the knowledge does not answer, so the team can add the answer. Call it every time the answer is not in <knowledge>, then tell the visitor plainly you don't have that information. If they asked for a discount, coupon or offer that is not written in the knowledge, say you can't confirm any discount or coupon code. Never imply a code exists and never say the team can provide one.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The visitor's question, rewritten as a short standalone question in English." },
      language: { type: "string", description: "Language the visitor used: en, ta, hi, hinglish, tanglish or other." },
    },
    required: ["question", "language"],
  },
};

export const TOOL_SUGGEST_FOLLOWUPS: ToolDef = {
  name: "suggest_followups",
  description:
    "Show up to 3 short follow-up questions as tappable chips, in the visitor's language and script. Only questions the knowledge can answer. Max 40 characters each. Call it only after you have written your answer text in this same reply, never on its own.",
  input_schema: {
    type: "object",
    properties: { questions: { type: "array", items: { type: "string" }, maxItems: 3 } },
    required: ["questions"],
  },
};

export const TOOL_LOOKUP_ORDER: ToolDef = {
  name: "lookup_order",
  description:
    "Growth plan. Look up the status of the visitor's order in the store. Call ONLY when you have BOTH the order number and the phone number or email used on that order, as the visitor typed them. Returns status, carrier, tracking link and expected date only. If it says not found, tell the visitor you couldn't match those details and offer the team.",
  input_schema: {
    type: "object",
    properties: {
      order_number: { type: "string", description: "Order number as the visitor typed it, e.g. #1042." },
      phone_or_email: { type: "string", description: "Phone number or email the visitor says they used for the order." },
    },
    required: ["order_number", "phone_or_email"],
  },
};

export const TOOL_REQUEST_CALLBACK: ToolDef = {
  name: "request_callback",
  description:
    "Growth plan. Book a callback or appointment request. If you don't yet have name, phone, preferred date and time slot from the visitor, call it with what you have: the widget shows a short booking form. Never invent details.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      phone: { type: "string" },
      preferred_date: { type: "string", description: "YYYY-MM-DD, resolved from what the visitor said (e.g. 'tomorrow') using the current date." },
      preferred_slot: { type: "string", description: "e.g. morning, afternoon, evening, or a time like 4 pm." },
      need: { type: "string", description: "One line in English: what the callback or appointment is about." },
    },
    required: ["need"],
  },
};

export const TOOL_SHOW_BOOKING: ToolDef = {
  name: "show_booking",
  description:
    "Online appointment booking is switched on for this business. Call it when the visitor wants to book, asks for an appointment, or asks which days or times are free. It opens the booking card in the chat, where the visitor picks the service, date and time and enters their own details, and it returns the real free times. Quote only times from its result. Never say an appointment is booked or confirmed yourself, and never ask for name or phone in the chat for a booking: the card collects them.",
  input_schema: {
    type: "object",
    properties: {
      service: { type: "string", description: "The service the visitor named, in English, if any (e.g. consultation, haircut, trial class)." },
      date: { type: "string", description: "YYYY-MM-DD if the visitor asked about a specific day, resolved from what they said using the current date." },
    },
    required: [],
  },
};

/** Tools whose results don't need the model to speak again once it has already answered. */
export const TERMINAL_TOOLS = new Set(["suggest_followups", "report_unanswered"]);

/**
 * Tools for a plan. Growth and Pro add order lookup and callback booking. When appointment
 * booking is switched on (Starter and up), show_booking replaces request_callback, so the
 * model has one clear way to book.
 */
export function toolsForPlan(plan: Plan, opts: { booking?: boolean } = {}): ToolDef[] {
  const base = [TOOL_CAPTURE_LEAD, TOOL_HANDOFF, TOOL_REPORT_UNANSWERED, TOOL_SUGGEST_FOLLOWUPS];
  const growth = hasGrowthTools(plan) ? [TOOL_LOOKUP_ORDER, ...(opts.booking ? [] : [TOOL_REQUEST_CALLBACK])] : [];
  return [...base, ...growth, ...(opts.booking ? [TOOL_SHOW_BOOKING] : [])];
}

/** Every tool name (used to strip tool calls a model wrote as text). */
export const ALL_TOOL_NAMES = [TOOL_CAPTURE_LEAD, TOOL_HANDOFF, TOOL_REPORT_UNANSWERED, TOOL_SUGGEST_FOLLOWUPS, TOOL_LOOKUP_ORDER, TOOL_REQUEST_CALLBACK, TOOL_SHOW_BOOKING].map((t) => t.name);
