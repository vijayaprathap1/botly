"use client";
import { useState } from "react";
import { updateBotSettings, type ActionState } from "@/app/app/actions";
import { SubmitButton, useFormAction } from "@/components/client";
import { Card, Field, inputClass, Notice } from "@/components/ui";
import { DAYS } from "@/lib/hours";
import type { BotWithOrg } from "@/lib/types";
import { readableTextOn } from "@/widget/src/color";

const DAY_LABEL = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" } as const;

export function SettingsForm({ bot, isAdmin = true }: { bot: BotWithOrg; isAdmin?: boolean }) {
  const [state, action, actionPending] = useFormAction<ActionState>(updateBotSettings.bind(null, bot.id), null);
  const [color, setColor] = useState(bot.branding.primary_color);
  const [name, setName] = useState(bot.branding.assistant_name);
  const [theme, setTheme] = useState(bot.branding.theme);
  const [position, setPosition] = useState(bot.branding.position);
  const [greeting, setGreeting] = useState(bot.greeting);
  const dark = theme === "dark";
  const validColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#4f46e5";

  return (
    <form onSubmit={action} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-4">
        <Card title="Assistant">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bot name (internal)" htmlFor="name">
              <input id="name" name="name" defaultValue={bot.name} className={inputClass} />
            </Field>
            <Field label="Assistant name" htmlFor="assistant_name">
              <input id="assistant_name" name="assistant_name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Greeting" htmlFor="greeting">
                <textarea id="greeting" name="greeting" rows={2} value={greeting} onChange={(e) => setGreeting(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Nudge after 8 seconds (optional)" htmlFor="nudge" hint="Shown once per visit next to the chat bubble.">
                <input id="nudge" name="nudge" defaultValue={bot.nudge ?? ""} className={inputClass} placeholder="Hi! Questions about sizes, delivery or returns?" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Tone of voice" htmlFor="tone">
                <textarea id="tone" name="tone" rows={2} defaultValue={bot.tone} className={inputClass} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Suggested questions (one per line, max 4)" htmlFor="suggested_questions">
                <textarea id="suggested_questions" name="suggested_questions" rows={4} defaultValue={bot.suggested_questions.join("\n")} className={inputClass} />
              </Field>
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Languages</legend>
              <div className="flex gap-4 text-sm">
                {[["en", "English"], ["ta", "Tamil"], ["hi", "Hindi"]].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5">
                    <input type="checkbox" name="languages" value={v} defaultChecked={bot.languages.includes(v!)} /> {l}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Card>

        <Card title="Look">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary colour" htmlFor="primary_color">
              <div className="flex gap-2">
                <input type="color" aria-label="Pick colour" value={validColor} onChange={(e) => setColor(e.target.value)} className="h-10 w-12 rounded border border-zinc-300" />
                <input id="primary_color" name="primary_color" value={color} onChange={(e) => setColor(e.target.value)} className={inputClass} />
              </div>
            </Field>
            <Field label="Avatar image URL (https, optional)" htmlFor="avatar_url">
              <input id="avatar_url" name="avatar_url" type="url" defaultValue={bot.branding.avatar_url ?? ""} className={inputClass} />
            </Field>
            <Field label="Position" htmlFor="position">
              <select id="position" name="position" value={position} onChange={(e) => setPosition(e.target.value as "left" | "right")} className={inputClass}>
                <option value="right">Bottom right</option>
                <option value="left">Bottom left</option>
              </select>
            </Field>
            <Field label="Theme" htmlFor="theme">
              <select id="theme" name="theme" value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark" | "auto")} className={inputClass}>
                <option value="auto">Auto (follows visitor)</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="show_powered_by" defaultChecked={bot.branding.show_powered_by} disabled={!isAdmin && bot.org.plan !== "growth"} /> Show &quot;Powered by Botly&quot;{!isAdmin && bot.org.plan !== "growth" ? " (can be hidden on Growth)" : ""}
            </label>
            <Field label="Privacy notice URL" htmlFor="privacy_url" hint="Linked in the widget footer. Leave empty to use Botly's default notice.">
              <input id="privacy_url" name="privacy_url" type="url" defaultValue={bot.privacy_url ?? ""} className={inputClass} />
            </Field>
          </div>
        </Card>

        <Card title="Hours, domains and notifications">
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Business hours ({bot.org.timezone})</legend>
              <p className="mb-2 text-xs text-zinc-500">e.g. 10:00-19:00 or 10:00-13:00, 16:00-20:00. Empty = closed.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {DAYS.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm">
                    <span className="w-24 text-zinc-600">{DAY_LABEL[d]}</span>
                    <input name={`hours_${d}`} defaultValue={(bot.business_hours[d] ?? []).map(([a, b]) => `${a}-${b}`).join(", ")} className={inputClass} />
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Allowed domains (one per line)" htmlFor="allowed_origins" hint="example.com (also www), https://shop.example.com, *.myshopify.com. To test locally add the page’s exact address, e.g. http://127.0.0.1:5500 (VS Code Live Server) or http://localhost:3000.">
              <textarea id="allowed_origins" name="allowed_origins" rows={4} defaultValue={bot.allowed_origins.join("\n")} className={inputClass} />
            </Field>
            <div className="grid gap-4">
              <Field label="Lead emails (one per line)" htmlFor="notify_emails">
                <textarea id="notify_emails" name="notify_emails" rows={2} defaultValue={bot.notify_emails.join("\n")} className={inputClass} />
              </Field>
              <Field label="Lead WhatsApp numbers (one per line)" htmlFor="notify_whatsapp">
                <textarea id="notify_whatsapp" name="notify_whatsapp" rows={2} defaultValue={bot.notify_whatsapp.join("\n")} className={inputClass} />
              </Field>
            </div>
            <fieldset className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
              <legend className="mb-1 text-sm font-medium">Fallback contact (shown when chat is unavailable)</legend>
              <input name="fallback_phone" aria-label="Fallback phone" placeholder="Phone" defaultValue={bot.fallback_contact.phone ?? ""} className={inputClass} />
              <input name="fallback_whatsapp" aria-label="Fallback WhatsApp" placeholder="WhatsApp" defaultValue={bot.fallback_contact.whatsapp ?? ""} className={inputClass} />
              <input name="fallback_email" aria-label="Fallback email" placeholder="Email" defaultValue={bot.fallback_contact.email ?? ""} className={inputClass} />
            </fieldset>
          </div>
        </Card>

        {!isAdmin ? (
          <Card title="Assistant on or off">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={bot.active} /> Active. Untick to hide the chat from your website straight away.
            </label>
          </Card>
        ) : null}
        <Card title="Plan, quota and model" className={isAdmin ? "" : "hidden"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan" htmlFor="plan">
              <select id="plan" name="plan" defaultValue={bot.org.plan} className={inputClass}>
                <option value="trial">Free trial</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
              </select>
            </Field>
            <Field label="Monthly conversations (plan)" htmlFor="org_quota">
              <input id="org_quota" name="org_quota" type="number" min={0} defaultValue={bot.org.monthly_conversation_quota} className={inputClass} />
            </Field>
            <Field label="Quota override for this bot (optional)" htmlFor="bot_quota">
              <input id="bot_quota" name="bot_quota" type="number" min={0} defaultValue={bot.monthly_conversation_quota ?? ""} className={inputClass} />
            </Field>
            <Field label="Model" htmlFor="model">
              <input id="model" name="model" defaultValue={bot.model} className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="active" defaultChecked={bot.active} disabled={!isAdmin} /> Active. Untick to switch the widget off on the client&apos;s site (it disappears quietly).
            </label>
          </div>
        </Card>
        {state?.error ? <Notice tone="red">{state.error}</Notice> : state?.message ? <Notice tone="green">{state.message}</Notice> : null}
        <div>
          <SubmitButton pending={actionPending}>Save settings</SubmitButton>
        </div>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card title="Preview">
          <div className={`relative h-96 overflow-hidden rounded-lg ${dark ? "bg-zinc-800" : "bg-zinc-100"}`}>
            <div className={`absolute bottom-16 w-64 overflow-hidden rounded-xl shadow-lg ${position === "left" ? "left-3" : "right-3"} ${dark ? "bg-zinc-900 text-white" : "bg-white text-zinc-900"}`}>
              <div className="px-3 py-2 text-sm font-semibold" style={{ background: validColor, color: readableTextOn(validColor) }}>
                {name || "Assistant"} · {bot.org.name}
                <div className="text-xs font-normal opacity-90">Replies instantly</div>
              </div>
              <div className="p-3 text-sm">
                <div className={`rounded-2xl rounded-bl-sm px-3 py-2 ${dark ? "bg-zinc-800" : "bg-zinc-100"}`}>{greeting || "Hi!"}</div>
                <div className="mt-2 ml-auto w-fit rounded-2xl rounded-br-sm px-3 py-2" style={{ background: validColor, color: readableTextOn(validColor) }}>
                  Is COD available?
                </div>
              </div>
            </div>
            <div className={`absolute bottom-3 flex h-11 w-11 items-center justify-center rounded-full shadow-lg ${position === "left" ? "left-3" : "right-3"}`} style={{ background: validColor, color: readableTextOn(validColor) }} aria-hidden>
              💬
            </div>
          </div>
        </Card>
      </div>
    </form>
  );
}
