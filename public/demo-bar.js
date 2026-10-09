/*
 * Botly demo page helper. This and widget.js are the only scripts allowed to run on a
 * demo page (the page's Content-Security-Policy blocks everything else).
 *  - shows the "Preview made by Botly" bar, in its own shadow root so the copied site's
 *    CSS can't restyle or hide it;
 *  - stops forms and shop/login links from doing anything;
 *  - makes in-page "#section" links scroll (the page's <base> points at the real site).
 */
(function () {
  "use strict";
  var host = document.getElementById("botly-demo-bar");
  if (!host || host.shadowRoot) return;
  var business = host.getAttribute("data-business") || "this business";
  var cta = host.getAttribute("data-cta") || "/";
  var BAR = 40;
  var key = "botly-demo-bar:" + location.pathname;
  var dismissed = false;
  try { dismissed = sessionStorage.getItem(key) === "1"; } catch (e) {}

  var set = function (el, props) { for (var k in props) el.style.setProperty(k, props[k], "important"); };
  set(host, { all: "initial", position: "fixed", top: "0", left: "0", right: "0", "z-index": "2147483646", display: "block" });
  var root = host.attachShadow({ mode: "open" });
  var style = document.createElement("style");
  style.textContent =
    ":host{all:initial}" +
    ".bar{box-sizing:border-box;display:flex;align-items:center;gap:10px;min-height:" + BAR + "px;padding:6px 12px;background:#0f172a;color:#e2e8f0;" +
    "font:500 13px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;box-shadow:0 1px 0 rgba(255,255,255,.08),0 4px 16px rgba(0,0,0,.25)}" +
    ".mark{flex:none;width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#6366f1,#4338ca);color:#fff;font-weight:800;font-size:12px;line-height:22px;text-align:center}" +
    ".text{flex:1;min-width:0}.text b{color:#fff;font-weight:700}.dim{color:#94a3b8}" +
    "a.cta{flex:none;background:#fff;color:#0f172a;text-decoration:none;font-weight:700;font-size:12.5px;padding:6px 12px;border-radius:8px;white-space:nowrap}" +
    "a.cta:hover{background:#e2e8f0}" +
    "button{flex:none;all:unset;cursor:pointer;width:28px;height:28px;border-radius:6px;color:#94a3b8;font-size:18px;line-height:28px;text-align:center}" +
    "button:hover{background:rgba(255,255,255,.1);color:#fff}button:focus-visible,a.cta:focus-visible{outline:2px solid #818cf8;outline-offset:2px}" +
    ".pill{position:fixed;left:12px;bottom:12px;background:#0f172a;color:#e2e8f0;font:600 11.5px/1 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;padding:7px 10px;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,.25);opacity:.92}" +
    "@media (max-width:560px){.dim{display:none}.bar{gap:8px;padding:6px 10px;font-size:12.5px}}";
  root.appendChild(style);

  // Their fixed or sticky header would sit under the bar: move it (and the page) down while the bar shows.
  var shifted = [];
  function offsetPage(on) {
    document.documentElement.style.setProperty("margin-top", on ? BAR + "px" : "", on ? "important" : "");
    if (!on) {
      for (var i = 0; i < shifted.length; i++) shifted[i].style.top = shifted[i].__botlyTop || "";
      shifted = [];
      return;
    }
    var all = document.body ? document.body.querySelectorAll("header, nav, div, section") : [];
    for (var j = 0; j < all.length && j < 600; j++) {
      var el = all[j];
      if (el.id === "botly-demo-bar" || el.id === "botly-widget") continue;
      var cs = getComputedStyle(el);
      if ((cs.position === "fixed" || cs.position === "sticky") && parseFloat(cs.top) <= 1 && el.getBoundingClientRect().height < 220) {
        el.__botlyTop = el.style.top;
        el.style.setProperty("top", BAR + "px", "important");
        shifted.push(el);
      }
    }
  }

  function render() {
    while (root.childNodes.length > 1) root.removeChild(root.lastChild);
    if (dismissed) {
      // The notice never fully goes away: a small label stays so the page can't pass for the real site.
      var pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = "Preview by Botly · not the official website";
      root.appendChild(pill);
      set(host, { top: "auto", bottom: "0", right: "auto" });
      offsetPage(false);
      return;
    }
    var bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("role", "note");
    var mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = "B";
    var text = document.createElement("span");
    text.className = "text";
    var b = document.createElement("b");
    b.textContent = "Preview made by Botly for " + business + ". ";
    var dim = document.createElement("span");
    dim.className = "dim";
    dim.textContent = "Not the official website. Try the chat in the corner.";
    text.appendChild(b);
    text.appendChild(dim);
    var link = document.createElement("a");
    link.className = "cta";
    link.href = cta;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Get this on your site";
    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Hide this bar");
    close.textContent = "×";
    close.addEventListener("click", function () {
      dismissed = true;
      try { sessionStorage.setItem(key, "1"); } catch (e) {}
      render();
    });
    bar.appendChild(mark);
    bar.appendChild(text);
    bar.appendChild(link);
    bar.appendChild(close);
    root.appendChild(bar);
    offsetPage(true);
  }
  render();

  // Nothing on a preview submits or signs in.
  document.addEventListener("submit", function (e) { e.preventDefault(); e.stopPropagation(); }, true);
  document.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== document.body && el.nodeType === 1) {
      if (el.hasAttribute && el.hasAttribute("data-botly-demo-disabled")) { e.preventDefault(); return; }
      var hash = el.getAttribute && el.getAttribute("data-botly-demo-hash");
      if (hash) {
        e.preventDefault();
        var target = hash.length > 1 ? document.getElementById(hash.slice(1)) || document.getElementsByName(hash.slice(1))[0] : null;
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (el.tagName === "BUTTON" && el.type === "submit") { e.preventDefault(); return; }
      el = el.parentNode;
    }
  }, true);
})();
