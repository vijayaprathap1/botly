import { requireSession } from "@/lib/auth";
import { localDate } from "@/lib/booking/slots";
import { defaultSettings, type AppointmentRow, type BookingServiceRow, type BookingSettingsRow, type DateOverrideRow } from "@/lib/booking/types";
import { getBot } from "@/lib/dashboard";
import { hasBooking } from "@/lib/plans";
import { supabaseServer } from "@/lib/supabase/server";
import { AppointmentsView, BookingNotice, BookingTabs, ServicesView, SettingsView, VIEWS, type View } from "./booking-views";

export default async function BookingPage({ params, searchParams }: { params: Promise<{ botId: string }>; searchParams: Promise<{ tab?: string; view?: string }> }) {
  const { botId } = await params;
  const sp = await searchParams;
  await requireSession();
  const bot = await getBot(botId);
  const db = await supabaseServer();
  const tab = sp.tab === "settings" || sp.tab === "services" ? sp.tab : "appointments";
  const view: View = sp.view && sp.view in VIEWS ? (sp.view as View) : "upcoming";
  const nowIso = new Date().toISOString();

  const settingsRes = await db.from("booking_settings").select("*").eq("bot_id", bot.id).maybeSingle();
  const notMigrated = !!settingsRes.error && /does not exist|schema cache/i.test(settingsRes.error.message);
  const settings = (settingsRes.data as BookingSettingsRow | null) ?? defaultSettings(bot.id, bot.org.timezone);
  const canBook = hasBooking(bot.org.plan);
  const base = `/app/bots/${bot.id}/booking`;
  const tz = settings.timezone;

  let body: React.ReactNode = null;
  if (tab === "appointments") {
    let q = db.from("appointments").select("*").eq("bot_id", bot.id);
    if (view === "upcoming") q = q.in("status", ["pending", "confirmed"]).gte("end_at", nowIso).order("start_at", { ascending: true });
    else if (view === "pending") q = q.eq("status", "pending").gte("end_at", nowIso).order("start_at", { ascending: true });
    else if (view === "past") q = q.in("status", ["pending", "confirmed", "completed"]).lt("end_at", nowIso).order("start_at", { ascending: false });
    else q = q.eq("status", "cancelled").order("start_at", { ascending: false });
    const [{ data }, counts] = await Promise.all([
      q.limit(300),
      db.from("appointments").select("start_at,status").eq("bot_id", bot.id).in("status", ["pending", "confirmed"]).gte("end_at", nowIso).limit(2000),
    ]);
    body = <AppointmentsView botId={bot.id} view={view} tz={tz} nowIso={nowIso} org={bot.org.name} base={base} rows={(data ?? []) as AppointmentRow[]} active={(counts.data ?? []) as Pick<AppointmentRow, "start_at" | "status">[]} />;
  } else if (tab === "settings") {
    const { data } = await db.from("booking_date_overrides").select("*").eq("bot_id", bot.id).gte("date", localDate(new Date(), tz)).order("date").limit(100);
    body = <SettingsView botId={bot.id} settings={settings} canBook={canBook} exists={!!settingsRes.data} overrides={(data ?? []) as DateOverrideRow[]} />;
  } else {
    const { data } = await db.from("booking_services").select("*").eq("bot_id", bot.id).order("sort").order("created_at");
    body = <ServicesView botId={bot.id} settings={settings} services={(data ?? []) as BookingServiceRow[]} />;
  }

  return (
    <div className="grid gap-4">
      <BookingNotice notMigrated={notMigrated} canBook={canBook} enabled={settings.enabled} base={base} />
      <BookingTabs base={base} tab={tab} />
      {body}
    </div>
  );
}
