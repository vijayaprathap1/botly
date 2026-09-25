import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderLeadEmail, ResendNotifier, sendEmail } from "@/lib/notify/email";
import { WhatsAppCloudNotifier } from "@/lib/notify/whatsapp";
import type { LeadNotice } from "@/lib/notify/types";

const calls: { url: string; auth: string; body: any }[] = [];
let server: http.Server;
let base = "";
let failNext = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      calls.push({ url: req.url!, auth: String(req.headers.authorization), body: JSON.parse(b || "{}") });
      if (failNext-- > 0) return void res.writeHead(500).end("boom");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(req.url!.includes("messages") ? { messages: [{ id: "wamid.1" }] } : { id: "em_1" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    RESEND_API_KEY: "re_test_key_123456", RESEND_API_URL: base,
    WHATSAPP_ACCESS_TOKEN: "EAAtest", WHATSAPP_PHONE_NUMBER_ID: "12345", WHATSAPP_API_URL: base,
  });
});
afterAll(() => server.close());

const notice: LeadNotice = {
  kind: "new_lead", businessName: "Ananya <Handlooms>", botName: "Web",
  lead: { name: "Priya", phone: "+919790011223", phoneDisplay: "+91 97900 11223", email: null, need: "25 sarees", type: "bulk" },
  summary: "Bulk wedding order", transcriptUrl: "https://app/x", whatsappUrl: "https://wa.me/919790011223",
};

describe("notifiers", () => {
  it("email escapes HTML and includes the lead", () => {
    const m = renderLeadEmail(notice);
    expect(m.html).toContain("Ananya &lt;Handlooms&gt;");
    expect(m.text).toContain("Phone: +91 97900 11223");
  });

  it("Resend request shape", async () => {
    const r = await new ResendNotifier().send("owner@x.in", notice);
    expect(r.providerId).toBe("em_1");
    const c = calls.at(-1)!;
    expect(c.url).toBe("/emails");
    expect(c.auth).toBe("Bearer re_test_key_123456");
    expect(c.body.to).toEqual(["owner@x.in"]);
  });

  it("WhatsApp Cloud API sends the new_lead template with 4 variables", async () => {
    const r = await new WhatsAppCloudNotifier().send("+91 98765 43210", notice);
    expect(r.providerId).toBe("wamid.1");
    const c = calls.at(-1)!;
    expect(c.url).toBe("/12345/messages");
    expect(c.body).toMatchObject({ messaging_product: "whatsapp", to: "919876543210", type: "template", template: { name: "new_lead", language: { code: "en" } } });
    expect(c.body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(["Ananya <Handlooms>", "Priya", "+91 97900 11223", "25 sarees"]);
  });

  it("sendEmail retries server errors", async () => {
    failNext = 1;
    const r = await sendEmail({ to: "a@b.in", subject: "s", html: "h", text: "t" });
    expect(r.sent).toBe(true);
  }, 10_000);
});
