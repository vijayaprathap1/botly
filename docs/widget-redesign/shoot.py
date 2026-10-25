"""
Screenshot harness for the widget redesign (week 1).

Serves a plain host page with the built widget (public/widget.js + public/widget-fonts) and
MOCKS the four widget API calls (/api/widget/config, /api/chat SSE, /api/widget/lead,
/api/widget/history) so every state is deterministic. The real flow (real API, scripted LLM)
is covered by tests/e2e/widget.spec.ts; this file is only for pictures.

  npm run build:widget
  python docs/widget-redesign/shoot.py            # after shots
  python docs/widget-redesign/shoot.py --before /path/to/main/widget.js   # before shots

Needs: pip install playwright pillow; Chrome at /usr/bin/google-chrome.
All businesses here are fictional EXAMPLEs.
"""
import argparse, functools, http.server, io, json, os, shutil, socketserver, sys, tempfile, threading
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "shots"

# ── fictional brands ─────────────────────────────────────────────────────────
BRANDS = {
    # no colour set → Botly saffron default
    "default": dict(business="Ananya Handlooms", assistantName="Meera", primaryColor="", avatarUrl=None),
    # non-default brand colour + logo image
    "teal": dict(business="Sunrise Dental Clinic", assistantName="Asha", primaryColor="#0E7490", avatarUrl="https://logo.example/sunrise.png"),
    # a pale brand: text on it must flip to dark ink
    "pale": dict(business="Kumar Electricals", assistantName="Ravi", primaryColor="#FDE047", avatarUrl=None),
}

def config(brand="default", **over):
    b = BRANDS[brand]
    c = {
        "enabled": True, "test": False, "business": b["business"], "assistantName": b["assistantName"],
        "avatarUrl": b["avatarUrl"], "primaryColor": b["primaryColor"], "position": "right", "theme": "auto",
        "showPoweredBy": True,
        "greeting": f"Vanakkam! I'm {b['assistantName']} from {b['business']}. Ask me about sarees, delivery, returns or blouse stitching."
        if brand == "default" else f"Hi! I'm {b['assistantName']} from {b['business']}. How can I help?",
        "nudge": "Questions about sizes, delivery or returns?",
        "suggestions": ["Is cash on delivery available?", "How long does delivery take?", "What is your return policy?"],
        "isOpen": True, "privacyUrl": "https://example.com/privacy",
        "fallbackContact": {"phone": "+91 98765 43210", "whatsapp": "+91 98765 43210", "email": "hello@shop.example"},
        "quotaExceeded": False,
    }
    c.update(over)
    return c

EN_Q = "Is cash on delivery available?"
EN_A = "Yes. **Cash on delivery (COD)** is available across India for orders up to ₹10,000.\n\n- Delivery in Tamil Nadu: 2–4 days\n- Rest of India: 5–7 days"
# TODO: native check pending (Tamil sample question and answer)
TA_Q = "பிளவுஸ் தைக்க எவ்வளவு? COD இருக்கா?"
# TODO: native check pending
TA_A = "பிளவுஸ் தைக்க ₹650, 5 வேலை நாட்கள் ஆகும். இந்தியா முழுவதும் COD உண்டு."
# TODO: native check pending (Hindi sample question and answer)
HI_Q = "डिलीवरी में कितने दिन लगेंगे?"
# TODO: native check pending
HI_A = "तमिलनाडु में 2–4 दिन, बाकी भारत में 5–7 दिन। ₹1,999 से ऊपर के ऑर्डर पर शिपिंग फ्री है।"

def sse(*events):
    return "".join(f"event: {e}\ndata: {json.dumps(d, ensure_ascii=False)}\n\n" for e, d in events)

def answer(text, follow=None):
    ev = [("meta", {"conversationId": "c_demo"})]
    ev += [("delta", {"text": text})]
    if follow: ev.append(("suggestions", {"questions": follow}))
    ev.append(("done", {"conversationId": "c_demo", "messageId": "m1"}))
    return sse(*ev)

def logo_png():
    img = Image.new("RGB", (88, 88), "#E0F2FE")
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    d.ellipse((22, 14, 66, 58), fill="#0E7490")
    d.rectangle((30, 50, 40, 76), fill="#0E7490"); d.rectangle((48, 50, 58, 76), fill="#0E7490")
    b = io.BytesIO(); img.save(b, "PNG"); return b.getvalue()

HOST_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EXAMPLE shop</title><style>
body{margin:0;font:16px/1.5 Georgia,serif;color:#33261c;background:#fbf6ef}
header{display:flex;justify-content:space-between;align-items:center;padding:18px 32px;border-bottom:1px solid #e8dccb;background:#fff}
header b{font-size:22px}nav a{margin-left:22px;color:#33261c;text-decoration:none}
.hero{padding:56px 32px;max-width:720px}.hero h1{font-size:44px;line-height:1.1;margin:0 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px;padding:0 32px 60px}
.grid div{height:260px;border-radius:10px;background:linear-gradient(135deg,#8c2f39,#d9a441)}
.grid div:nth-child(2){background:linear-gradient(135deg,#1f5f5b,#c9b27c)}.grid div:nth-child(3){background:linear-gradient(135deg,#4b2e83,#e07a5f)}
.tag{position:fixed;left:12px;bottom:10px;font:12px system-ui;color:#7a6a5c}
@media(max-width:640px){nav{display:none}.hero h1{font-size:32px}.hero{padding:32px 20px}.grid{padding:0 20px 40px}}
</style></head><body><header><b>EXAMPLE store</b><nav><a href="#">Sarees</a><a href="#">Blouses</a><a href="#">Contact</a></nav></header>
<section class="hero"><h1>Handwoven silk, made to order</h1><p>EXAMPLE host page for the Botly widget screenshots. Nothing here is a real business.</p></section>
<section class="grid"><div></div><div></div><div></div><div></div></section>
<script src="/WIDGET" data-key="pk_example" async></script></body></html>"""

def serve(site: Path):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=str(site))
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

def compress(path: Path):
    im = Image.open(path).convert("RGB")
    im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)

class Shooter:
    def __init__(self, pw, base, widget, out: Path):
        self.browser = pw.chromium.launch(executable_path="/usr/bin/google-chrome")
        self.base, self.widget, self.out = base, widget, out
        out.mkdir(parents=True, exist_ok=True)

    def page(self, viewport, scheme, cfg, chat=None, lead_ok=True):
        mobile = viewport == "390"
        ctx = self.browser.new_context(
            viewport={"width": 390, "height": 844} if mobile else {"width": 1440, "height": 900},
            device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile,
            color_scheme=scheme, locale="en-IN", timezone_id="Asia/Kolkata", reduced_motion="reduce",
        )
        replies = list(chat or [])
        ctx.route("**/api/widget/config*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(cfg)))
        ctx.route("**/api/widget/history*", lambda r: r.fulfill(status=200, content_type="application/json", body='{"messages":[]}'))
        ctx.route("**/api/widget/lead", lambda r: r.fulfill(status=200, content_type="application/json",
                  body=json.dumps({"ok": True, "conversationId": "c_demo"} if lead_ok else {"ok": False, "error": "Couldn't send. Please try again."})))
        def chat_route(r):
            body = replies.pop(0) if replies else answer("OK.")
            if body == "ABORT": return r.abort()
            r.fulfill(status=200, content_type="text/event-stream", body=body)
        ctx.route("**/api/chat", chat_route)
        ctx.route("https://logo.example/**", lambda r: r.fulfill(status=200, content_type="image/png", body=logo_png()))
        p = ctx.new_page()
        p.goto(f"{self.base}/index-{self.widget}.html")
        p.locator("#botly-widget .launcher").wait_for()
        return ctx, p

    def snap(self, p, name, viewport):
        p.wait_for_timeout(250)
        p.evaluate("document.fonts && document.fonts.ready")
        path = self.out / f"{name}-{viewport}.png"
        if viewport == "1440":
            # Desktop: crop to the widget corner (the rest is the host page) to keep files small.
            p.screenshot(path=str(path), clip={"x": 1440 - 560, "y": 900 - 820, "width": 560, "height": 820})
        else:
            p.screenshot(path=str(path))
        compress(path)
        print("  ", path.relative_to(ROOT))

W = "#botly-widget"

def open_(p): p.locator(f"{W} .launcher").click(); p.locator(f"{W} .panel").wait_for()
def say(p, text):
    p.locator(f"{W} .composer textarea").fill(text); p.locator(f"{W} .composer textarea").press("Enter")
    p.wait_for_timeout(300)

def scenarios(after: bool):
    """name → (config, chat replies, steps(p))."""
    s = {}
    s["launcher"] = (config(), [], lambda p: None)
    s["open"] = (config(), [], open_)
    s["answer-en"] = (config(), [answer(EN_A, ["How long does delivery take?", "What is your return policy?"])], lambda p: (open_(p), say(p, EN_Q)))
    def handoff(p):
        open_(p); say(p, "Can I talk to someone about a custom border colour?")
        p.get_by_role("button", name="Talk to a person").click(); p.wait_for_timeout(200)
    s["handoff"] = (config(), [answer("Sure. A person at the shop can help with custom work.")], handoff)
    def saved(p):
        open_(p); say(p, "I need 10 sarees for my sister's wedding. Any bulk price?")
        p.get_by_role("button", name="Talk to a person").click()
        more = p.get_by_role("button", name="Or leave your number and they'll call you")
        if more.count(): more.click()
        f = p.locator(f"{W} form.card").last
        f.get_by_label("Your name").fill("Priya"); f.get_by_label("Phone number").fill("98765 43210")
        f.get_by_label("What do you need? (optional)").fill("10 sarees for a wedding")
        f.locator("button[type=submit]").click(); p.wait_for_timeout(300)
    s["lead-saved"] = (config(), [answer("For 10 or more sarees the team gives a custom quote, so let me get them for you.")], saved)
    s["error"] = (config(), ["ABORT"], lambda p: (open_(p), say(p, "Do you have Kanchipuram silk in green?")))
    if after:
        s["answer-ta"] = (config(), [answer(TA_A)], lambda p: (open_(p), say(p, TA_Q)))
        s["answer-hi"] = (config(), [answer(HI_A)], lambda p: (open_(p), say(p, HI_Q)))
        def offline(p):
            open_(p); say(p, EN_Q); p.context.set_offline(True); p.wait_for_timeout(200)
        s["offline"] = (config(), [answer(EN_A)], offline)
        s["limit"] = (config(quotaExceeded=True), [], open_)
        order = sse(("meta", {"conversationId": "c_demo"}), ("delta", {"text": "Found it. Here's the latest:"}),
                    ("tool_card", {"type": "order_status", "orderNumber": "#1042", "status": "In transit", "carrier": "Delhivery",
                                   "trackingUrl": "https://track.example/DL1", "expectedDate": "2026-10-29"}),
                    ("done", {"conversationId": "c_demo", "messageId": "m2"}))
        s["order"] = (config(), [order], lambda p: (open_(p), say(p, "Where is order #1042? Phone 9790011223")))
        s["closed"] = (config(isOpen=False), [], open_)
        s["brand-teal"] = (config("teal"), [answer("Yes, we're open on Sunday from **10 am to 2 pm**. Walk-ins are welcome; booking is faster.", ["Book a cleaning", "Do you take insurance?"])],
                           lambda p: (open_(p), say(p, "Are you open on Sunday?")))
        s["brand-teal-launcher"] = (config("teal"), [], lambda p: None)
        s["brand-pale"] = (config("pale"), [answer("Yes, we repair ceiling fans at home. A visit is **₹299**, parts extra.", ["Book a visit", "Do you sell LED bulbs?"])],
                           lambda p: (open_(p), say(p, "Do you repair fans?")))
    return s

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", help="old widget.js to shoot as 'before'")
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    site = Path(tempfile.mkdtemp())
    shutil.copy(ROOT / "public/widget.js", site / "widget-after.js")
    shutil.copytree(ROOT / "public/widget-fonts", site / "widget-fonts")
    (site / "index-after.html").write_text(HOST_PAGE.replace("/WIDGET", "/widget-after.js"))
    if a.before:
        shutil.copy(a.before, site / "widget-before.js")
        (site / "index-before.html").write_text(HOST_PAGE.replace("/WIDGET", "/widget-before.js"))
    httpd = serve(site)
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    with sync_playwright() as pw:
        runs = [("before", False)] if a.before else [("after", True)]
        for which, after in runs:
            sh = Shooter(pw, base, which, OUT / which)
            for name, (cfg, chat, steps) in scenarios(after).items():
                if a.only and name not in a.only: continue
                schemes = ["light", "dark"] if after else ["light"]
                for vp in ["1440", "390"]:
                    for scheme in schemes:
                        ctx, p = sh.page(vp, scheme, cfg, chat)
                        try:
                            steps(p)
                            sh.snap(p, f"{name}-{scheme}", vp)
                        finally:
                            ctx.close()
    httpd.shutdown()

if __name__ == "__main__":
    main()
