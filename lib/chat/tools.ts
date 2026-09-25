import type { ToolDef } from "../llm/types";
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
    "Record a question that the knowledge does not answer, so the team can add the answer. Call it every time the answer is not in <knowledge>, then tell the visitor plainly you don't have that information and offer to connect them with the team.",
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
    "Show up to 3 short follow-up questions as tappable chips, in the visitor's language and script. Only questions the knowledge can answer. Max 40 characters each.",
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

/** Tools whose results don't need the model to speak again once it has already answered. */
export const TERMINAL_TOOLS = new Set(["suggest_followups", "report_unanswered"]);

/** Tools for a plan. Growth adds order lookup and callback booking. */
export function toolsForPlan(plan: Plan): ToolDef[] {
  const base = [TOOL_CAPTURE_LEAD, TOOL_HANDOFF, TOOL_REPORT_UNANSWERED, TOOL_SUGGEST_FOLLOWUPS];
  return plan === "growth" ? [...base, TOOL_LOOKUP_ORDER, TOOL_REQUEST_CALLBACK] : base;
}
