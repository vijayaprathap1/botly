"""
Screenshot harness for appointment booking in the widget (mocked API, fictional clinic).

Serves a plain host page with the built widget and MOCKS /api/widget/config (booking on),
/api/widget/booking (GET times, POST booking) and /api/chat (an AI reply that opens the
booking card). Nothing touches a real server or the live quota.

  npm run build:widget
  python docs/appointment-booking/shoot.py --out /tmp/booking-shots

Needs: pip install playwright pillow; Chrome at /usr/bin/google-chrome.
"""
import argparse, datetime as dt, functools, http.server, json, shutil, socketserver, sys, tempfile, threading
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
TODAY = dt.date(2026, 11, 17)  # a Tuesday

CONFIG = {
    "enabled": True, "test": False, "business": "Sri Sai Clinic", "assistantName": "Asha", "avatarUrl": None,
    "primaryColor": "#0E7490", "position": "right", "theme": "auto", "showPoweredBy": True,
    "greeting": "Hi! I'm Asha from Sri Sai Clinic. Ask me about timings, fees or book a consultation.",
    "nudge": "Need an appointment?",
    "suggestions": ["What are the clinic timings?", "What is the consultation fee?", "Do you do home visits?"],
    "isOpen": True, "privacyUrl": "https://example.com/privacy",
    "fallbackContact": {"phone": "+91 98765 43210", "whatsapp": "+91 98765 43210", "email": "hello@clinic.example"},
    "quotaExceeded": False,
    "booking": {"title": "Book an appointment"},
}
SERVICES = [
    {"id": "svc1", "name": "General consultation", "description": "Fever, cough, BP or sugar check", "duration": 20, "price": 400},
    {"id": "svc2", "name": "Follow-up visit", "description": "Within 7 days of your last visit", "duration": 15, "price": 0},
    {"id": "svc3", "name": "Full body check-up", "description": "Blood tests and a doctor review", "duration": 60, "price": 1800},
]
TAKEN = {"10:20", "11:00", "11:20", "15:00", "17:40"}

def day_slots(date: dt.date, duration: int):
    if date.weekday() == 6: return []
    out = []
    for a, b in ((10 * 60, 13 * 60), (17 * 60, 20 * 60)):
        m = a
        while m + duration <= b:
            t = f"{m // 60:02d}:{m % 60:02d}"
            if t not in TAKEN and not (date == TODAY and m < 12 * 60):
                start = dt.datetime(date.year, date.month, date.day, m // 60, m % 60) - dt.timedelta(hours=5, minutes=30)
                out.append({"start": start.strftime("%Y-%m-%dT%H:%M:00.000Z"), "t": t, "left": 1})
            m += 20
    return out

def slots_body(q, manual=False, email="optional"):
    svc = next((s for s in SERVICES if s["id"] == (q.get("service") or ["svc1"])[0]), SERVICES[0])
    days = [TODAY + dt.timedelta(days=i) for i in range(21)]
    want = (q.get("date") or [None])[0]
    date = want or (TODAY + dt.timedelta(days=1)).isoformat()
    d = dt.date.fromisoformat(date)
    return {
        "ok": True, "title": "Book an appointment", "timezone": "Asia/Kolkata",
        "confirmation": "manual" if manual else "auto", "collectEmail": email,
        "instructions": "Please arrive 10 minutes early and bring any old reports.",
        "cancellationPolicy": "To change or cancel, call us at least 2 hours before.",
        "services": SERVICES, "service": svc["id"],
        "days": [{"date": x.isoformat(), "n": len(day_slots(x, svc["duration"]))} for x in days],
        "date": date, "slots": day_slots(d, svc["duration"]),
    }

def sse(*events):
    return "".join(f"event: {e}\ndata: {json.dumps(d, ensure_ascii=False)}\n\n" for e, d in events)

HOST = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EXAMPLE clinic</title><style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#10324a;background:#f2f8fb}
header{display:flex;justify-content:space-between;align-items:center;padding:18px 32px;border-bottom:1px solid #d6e7ef;background:#fff}
header b{font-size:22px}nav a{margin-left:22px;color:#10324a;text-decoration:none}
.hero{padding:56px 32px;max-width:720px}.hero h1{font-size:44px;line-height:1.1;margin:0 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px;padding:0 32px 60px}
.grid div{height:220px;border-radius:12px;background:linear-gradient(135deg,#0e7490,#7dd3fc)}
@media(max-width:640px){nav{display:none}.hero h1{font-size:32px}.hero{padding:32px 20px}.grid{padding:0 20px 40px}}
</style></head><body><header><b>EXAMPLE clinic</b><nav><a href="#">Doctors</a><a href="#">Timings</a><a href="#">Contact</a></nav></header>
<section class="hero"><h1>Family doctor, open six days a week</h1><p>EXAMPLE host page for Botly booking screenshots. Not a real clinic.</p></section>
<section class="grid"><div></div><div></div><div></div></section>
<script src="/widget.js" data-key="pk_example" async></script></body></html>"""

W = "#botly-widget"

def compress(path: Path):
    im = Image.open(path).convert("RGB")
    im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=str(ROOT / "docs/appointment-booking/shots")); ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    site = Path(tempfile.mkdtemp())
    shutil.copy(ROOT / "public/widget.js", site / "widget.js")
    if (ROOT / "public/widget-fonts").exists(): shutil.copytree(ROOT / "public/widget-fonts", site / "widget-fonts")
    (site / "index.html").write_text(HOST)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(site)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"

    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path="/usr/bin/google-chrome")
        def page(vp, manual=False, chat=None, scheme="light"):
            mobile = vp == "390"
            ctx = browser.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1440, "height": 900},
                                      device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile,
                                      color_scheme=scheme, locale="en-IN", timezone_id="Asia/Kolkata", reduced_motion="reduce")
            ctx.route("**/api/widget/config*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(CONFIG)))
            ctx.route("**/api/widget/history*", lambda r: r.fulfill(status=200, content_type="application/json", body='{"messages":[]}'))
            def booking(r):
                if r.request.method == "GET":
                    q = parse_qs(urlparse(r.request.url).query)
                    return r.fulfill(status=200, content_type="application/json", body=json.dumps(slots_body(q, manual)))
                b = json.loads(r.request.post_data or "{}")
                start = dt.datetime.strptime(b["start"][:16], "%Y-%m-%dT%H:%M") + dt.timedelta(hours=5, minutes=30)
                svc = next(s for s in SERVICES if s["id"] == b["serviceId"])
                when = start.strftime("%a, %-d %b, ") + (start.strftime("%-I:%M %p").replace(":00", "").lower())
                r.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True, "booking": {
                    "id": "a1", "status": "pending" if manual else "confirmed", "service": svc["name"], "start": b["start"], "when": when,
                    "duration": svc["duration"], "name": b["name"], "phone": "+91 98765 43210"},
                    "instructions": "Please arrive 10 minutes early and bring any old reports."}))
            ctx.route("**/api/widget/booking*", booking)
            replies = list(chat or [])
            ctx.route("**/api/chat", lambda r: r.fulfill(status=200, content_type="text/event-stream", body=replies.pop(0) if replies else sse(("done", {}))))
            p = ctx.new_page(); p.goto(f"{base}/index.html"); p.locator(f"{W} .launcher").wait_for()
            return ctx, p
        def snap(p, name, vp, full_panel=False):
            p.wait_for_timeout(350)
            path = out / f"widget-{name}-{vp}.png"
            if vp == "1440": p.screenshot(path=str(path), clip={"x": 1440 - 560, "y": 900 - 820, "width": 560, "height": 820})
            else: p.screenshot(path=str(path))
            compress(path); print("  ", path)
        def open_(p): p.locator(f"{W} .launcher").click(); p.locator(f"{W} .panel").wait_for()
        def to_service(p): open_(p); p.locator(f"{W} .bk-entry").click(); p.locator(f"{W} .bk-svc").first.wait_for()
        def to_time(p): to_service(p); p.locator(f"{W} .bk-svc").first.click(); p.locator(f"{W} .bk-slot").first.wait_for()
        def to_details(p):
            to_time(p); p.locator(f"{W} .bk-slot").nth(2).click(); f = p.locator(f"{W} form.bk-form"); f.wait_for()
            f.get_by_label("Your name").fill("Priya Raman"); f.get_by_label("Phone number").fill("98765 43210")
            f.get_by_label("Notes").fill("Fever since two days")
            p.locator(f"{W} .bk-head").last.scroll_into_view_if_needed(); p.evaluate("0")
        def to_done(p):
            to_details(p); p.locator(f"{W} form.bk-form button[type=submit]").click(); p.get_by_text("You're booked!").or_(p.get_by_text("Request sent")).first.wait_for()
        ai = sse(("meta", {"conversationId": "c_demo"}), ("tool_card", {"type": "booking", "service": "svc1", "date": "2026-11-18"}),
                 ("delta", {"text": "Yes, Dr. Kumar has free times tomorrow from **10 am**. Pick the time that suits you."}),
                 ("done", {"conversationId": "c_demo", "messageId": "m1"}))
        def ai_card(p):
            open_(p); t = p.locator(f"{W} .composer textarea"); t.fill("Is the doctor free tomorrow morning?"); t.press("Enter")
            p.locator(f"{W} .bk-slot").first.wait_for()
        shots = {
            "home": (lambda p: open_(p), {}),
            "service": (to_service, {}),
            "time": (to_time, {}),
            "details": (to_details, {}),
            "done": (to_done, {}),
            "done-manual": (to_done, {"manual": True}),
            "ai-card": (ai_card, {"chat": [ai]}),
            "time-dark": (to_time, {"scheme": "dark"}),
        }
        for name, (steps, kw) in shots.items():
            if args.only and name not in args.only: continue
            for vp in ("1440", "390"):
                ctx, p = page(vp, **kw)
                try:
                    steps(p); snap(p, name, vp)
                except Exception as e:
                    print("FAILED", name, vp, e, file=sys.stderr); p.screenshot(path=str(out / f"FAILED-{name}-{vp}.png"))
                ctx.close()
        browser.close()
    httpd.shutdown()

if __name__ == "__main__":
    main()
