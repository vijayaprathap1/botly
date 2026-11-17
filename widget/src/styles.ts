/**
 * All widget CSS lives inside the Shadow DOM: host page styles can't reach it and it can't leak out.
 *
 * Design system (v2, 2026-11-17). One brand colour in, everything else derived:
 *   type   11.5 / 13 / 14 / 15 (body) / 16.5 (title) / 26 (hero); line-height 1.25 headings, 1.55 body
 *   weight 400 body · 500 meta · 600 labels/buttons · 700 titles (Indic faces top out at 600)
 *   space  4px grid: 4 8 12 16 20 24 32
 *   radius 8 (inner) · 12 (fields, rows) · 16 (cards) · 20 (bubbles) · 24 (panel) · pill
 *   edges  hairlines are ink at 8–10% alpha, never solid grey, so they sit right on any brand
 *   depth  e1 (resting), e2 (cards, chips on hover), e3 (panel: three stacked soft shadows)
 *   motion spring for things that appear, quick ease-in for things that leave; all of it off
 *          under prefers-reduced-motion
 * The brand variables (--p, --on-p, --p-text, --p-tint, --p-line) are set from JS by themeVars().
 */
export const CSS = `
:host{all:initial}
[hidden]{display:none!important}
*,*::before,*::after{box-sizing:border-box}
.bl{--p:#C2410C;--on-p:#FFFFFF;--p-text:#C2410C;--p-tint:#F9ECE7;--p-line:#E7B39D;
  --bg:#F3F4F7;--paper:#FFFFFF;--ink:#14161B;--ink2:#5B6070;--ink3:#80859A;
  --line:color-mix(in srgb,var(--ink) 9%,transparent);--line2:color-mix(in srgb,var(--ink) 14%,transparent);
  --leaf:#0F766E;--leaf-t:#D7F0EA;--mari-t:#FFF1D6;--err:#B42318;--err-t:#FDE7E4;--focus:var(--p-text);--online:#22C55E;
  --e1:0 1px 2px rgba(16,24,40,.05);
  --e2:0 1px 2px rgba(16,24,40,.04),0 4px 12px -2px rgba(16,24,40,.08);
  --e3:0 0 0 1px rgba(16,24,40,.06),0 4px 8px -2px rgba(16,24,40,.06),0 24px 60px -12px rgba(16,24,40,.28);
  --spring:cubic-bezier(.22,1.28,.36,1);--out:cubic-bezier(.4,0,1,1);--ease:cubic-bezier(.2,.8,.2,1);
  --font:"Botly Jakarta","Botly Tamil","Botly Deva",system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Tamil","Noto Sans Devanagari",sans-serif;
  font-family:var(--font);font-size:15px;line-height:1.55;color:var(--ink);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-align:left;
  font-weight:400;font-style:normal;text-transform:none;letter-spacing:0;direction:ltr;font-feature-settings:"ss01","cv11"}
.bl.dark{--bg:#24262D;--paper:#16171C;--ink:#F2F3F5;--ink2:#B1B5C0;--ink3:#8D92A0;
  --line:color-mix(in srgb,var(--ink) 10%,transparent);--line2:color-mix(in srgb,var(--ink) 16%,transparent);
  --leaf:#5EEAD4;--leaf-t:#123B36;--mari-t:#3D3015;--err:#FCA5A5;--err-t:#4A1D1A;--online:#4ADE80;
  --e1:0 1px 2px rgba(0,0,0,.4);--e2:0 4px 14px -4px rgba(0,0,0,.6);--e3:0 0 0 1px rgba(255,255,255,.07),0 24px 64px -12px rgba(0,0,0,.8)}
button,input,textarea,select{font:inherit;color:inherit;margin:0;letter-spacing:inherit}
button{cursor:pointer;background:none;border:0;padding:0;text-align:inherit;-webkit-tap-highlight-color:transparent}
h2,h3,p{margin:0;font:inherit}
svg{flex:none}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
[lang="ta"]{font-family:"Botly Tamil",var(--font);line-height:1.75}
[lang="hi"]{font-family:"Botly Deva",var(--font);line-height:1.75}
[lang="ta"] strong,[lang="hi"] strong{font-weight:600}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* Avatar: the bot's image, or the business initial */
.logo{width:40px;height:40px;flex:none;border-radius:50%;background:#FFFFFF;color:#14161B;
  display:grid;place-items:center;font-weight:700;font-size:16px;line-height:1;overflow:hidden;box-shadow:0 0 0 1px rgba(16,24,40,.08)}
.logo img{width:100%;height:100%;object-fit:cover;display:block}
.av{width:28px;height:28px;font-size:12px;background:var(--p);color:var(--on-p);box-shadow:none;align-self:flex-end;margin-bottom:22px}
.hav{position:relative;flex:none;display:grid}
.hav.on::after{content:"";position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;background:var(--online);box-shadow:0 0 0 2.5px var(--p)}

/* Launcher: a pill "Ask {name}" that morphs into a round button with a chevron */
.launcher{position:fixed;bottom:24px;display:inline-flex;align-items:center;gap:10px;height:56px;max-width:calc(100vw - 32px);
  padding:0 20px 0 6px;border-radius:999px;background:var(--p);color:var(--on-p);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif;font-weight:600;font-size:15.5px;line-height:1.2;letter-spacing:-.005em;
  box-shadow:0 0 0 1px color-mix(in srgb,var(--p) 70%,#000),0 8px 24px -6px color-mix(in srgb,var(--p) 50%,rgba(0,0,0,.45)),inset 0 1px 0 rgba(255,255,255,.18);
  transition:transform .35s var(--spring),box-shadow .2s;animation:pop .5s var(--spring) both}
@media (hover:hover){.launcher:hover{transform:translateY(-2px)}}
.launcher:active{transform:scale(.95);transition-duration:.1s}
.launcher:focus-visible{outline:3px solid var(--p);outline-offset:3px}
.launcher .logo{width:44px;height:44px;font-size:17px;box-shadow:none}
.launcher .ll{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.launcher .li-close{display:none}
.launcher svg{width:24px;height:24px}
.open .launcher{width:56px;padding:0;justify-content:center}
.open .launcher .ll,.open .launcher .logo{display:none}
.open .launcher .li-close{display:flex;animation:spinIn .4s var(--spring) both}
.right .launcher{right:24px}.left .launcher{left:24px}
@keyframes pop{0%{opacity:0;transform:translateY(12px) scale(.85)}100%{opacity:1;transform:none}}
@keyframes spinIn{from{opacity:0;transform:rotate(-120deg) scale(.5)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}

/* Nudge */
.nudge{position:fixed;bottom:92px;width:320px;max-width:calc(100vw - 32px);background:var(--paper);color:var(--ink);
  border-radius:20px;box-shadow:var(--e3);padding:16px;animation:rise .45s var(--spring) both;cursor:pointer;transform-origin:bottom right}
.right .nudge{right:24px}.left .nudge{left:24px;transform-origin:bottom left}
.nudge .nt{display:flex;gap:12px;align-items:flex-start;padding-right:32px}
.nudge .logo{width:36px;height:36px;font-size:14px;background:var(--p);color:var(--on-p);box-shadow:none}
.nudge b{display:block;font-size:13px;font-weight:600;color:var(--ink2);line-height:1.3}
.nudge .nx{font-weight:500;font-size:15px;line-height:1.45;margin-top:2px}
.nudge .x{position:absolute;top:6px;right:6px;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:var(--ink3);transition:background .15s,color .15s}
@media (hover:hover){.nudge .x:hover{background:var(--bg);color:var(--ink)}}
.nudge .x svg{width:16px;height:16px}
.nudge .chips{padding:12px 0 0;margin:0;justify-content:flex-start}

/* Panel */
.panel{position:fixed;bottom:92px;width:392px;height:min(640px,calc(100vh - 116px));background:var(--paper);color:var(--ink);
  border-radius:24px;box-shadow:var(--e3);display:flex;flex-direction:column;overflow:hidden;isolation:isolate;
  animation:panelIn .5s var(--spring) backwards;transform-origin:bottom right}
.panel:focus{outline:none}
.panel.closing{animation:panelOut .16s var(--out) both;pointer-events:none}
.left .panel{transform-origin:bottom left}
.right .panel{right:24px}.left .panel{left:24px}
.full .panel{inset:0;width:100%;height:100%;border-radius:0;box-shadow:none;animation:none}
.full .panel .close{display:none}
@keyframes panelIn{from{opacity:0;transform:translateY(14px) scale(.94)}60%{opacity:1}to{opacity:1;transform:none}}
@keyframes panelOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(10px) scale(.96)}}

/* Header: tall branded home header that folds into a compact bar once the chat starts */
.head{flex:none;position:relative;z-index:1;color:var(--on-p);background:var(--p);
  background:radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,var(--p) 88%,#fff) 0%,var(--p) 45%,color-mix(in srgb,var(--p) 78%,#000) 100%);
  padding:12px 8px 12px 16px;transition:padding .45s var(--ease);box-shadow:0 1px 0 color-mix(in srgb,var(--p) 70%,#000)}
.head :focus-visible{outline-color:var(--on-p)}
.bar{display:flex;align-items:center;gap:12px;min-height:44px}
.who{flex:1;min-width:0}
.who h2{font-weight:700;font-size:16px;line-height:1.25;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who .status{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;line-height:1.3;opacity:.88;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who .status span{overflow:hidden;text-overflow:ellipsis}
.dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
.hav.on ~ .who .dot{display:none}
.dot.off{background:transparent;box-shadow:inset 0 0 0 1.5px currentColor}
.close{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;color:var(--on-p);flex:none;opacity:.9;transition:background .15s,opacity .15s,transform .2s var(--spring)}
@media (hover:hover){.close:hover{background:color-mix(in srgb,var(--on-p) 14%,transparent);opacity:1}}
.close:active{transform:scale(.9)}
.close svg{width:18px;height:18px}
.hero{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .45s var(--ease),opacity .2s}
.hero > div{overflow:hidden;min-height:0;padding-right:16px}
.hero .hi{font-weight:700;font-size:26px;line-height:1.2;letter-spacing:-.022em;padding-top:24px;text-wrap:balance}
.hero .sub{font-size:15px;line-height:1.5;opacity:.86;margin-top:8px;text-wrap:pretty}
.home .head{padding:16px 8px 56px 24px;box-shadow:none}
.home .hero{grid-template-rows:1fr;opacity:1}
.home .hero .hi{animation:rise .55s var(--spring) .06s backwards}
.home .hero .sub{animation:rise .55s var(--spring) .12s backwards}
.home .head .logo{width:44px;height:44px}

/* Banners (offline, closed, limit) */
.banner{display:flex;gap:10px;align-items:flex-start;padding:10px 16px;font-size:13px;font-weight:500;line-height:1.45;
  border-bottom:1px solid var(--line);background:var(--mari-t);color:var(--ink);flex:none}
.banner.net{background:var(--ink);color:var(--paper);border-color:transparent}
.banner svg{width:16px;height:16px;margin-top:2px}
.home .banner:not([hidden]) ~ .msgs{margin-top:0;padding-top:16px}

/* Messages */
.msgs{flex:1;overflow-y:auto;padding:20px 16px 12px;display:flex;flex-direction:column;gap:16px;overscroll-behavior:contain;background:var(--paper);scrollbar-width:thin;scrollbar-color:var(--line2) transparent;
  -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%);
  transition:margin .45s var(--ease)}
.msgs:focus-visible{outline-offset:-2px}
.row{display:flex;flex-direction:column;gap:4px;max-width:84%;animation:msgIn .45s var(--spring) both}
.row.old,.row.old .chip{animation:none}
@keyframes msgIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.row.user{align-self:flex-end;align-items:flex-end;animation-name:msgInR;transform-origin:bottom right}
@keyframes msgInR{from{opacity:0;transform:translate(10px,8px) scale(.96)}to{opacity:1;transform:none}}
.row.bot{align-self:flex-start;flex-direction:row;align-items:flex-end;gap:8px;transform-origin:bottom left}
.col{display:flex;flex-direction:column;gap:4px;min-width:0}
.row.cardrow{max-width:100%;align-self:stretch;display:block}
.row.event{align-self:center;max-width:92%}
.bubble{padding:10px 14px;border-radius:20px;overflow-wrap:anywhere;word-break:break-word;font-size:15px;line-height:1.55;letter-spacing:-.003em}
.bot .bubble{background:var(--bg);color:var(--ink);border-bottom-left-radius:6px}
.user .bubble{background:var(--p);color:var(--on-p);border-bottom-right-radius:6px;white-space:pre-wrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}
.event .bubble{background:transparent;color:var(--ink2);font-size:13px;font-weight:500;text-align:center;padding:2px 8px}
/* Grouping: consecutive messages from one side sit closer, share one avatar and one time */
.row.bot:has(+ .row.bot:not(.cardrow)){margin-bottom:-12px}
.row.bot:has(+ .row.bot:not(.cardrow)) .av{visibility:hidden}
.row.bot:has(+ .row.bot:not(.cardrow):not(.typing-row)) .time{display:none}
.row.bot:has(+ .row.bot:not(.cardrow)) .bubble{border-bottom-left-radius:20px}
.row.bot + .row.bot:not(.cardrow) .bubble{border-top-left-radius:6px}
.row.user:has(+ .row.user){margin-bottom:-12px}
.row.user:has(+ .row.user:not(:has(.errline))) > .time{display:none}
.row.user + .row.user .bubble{border-top-right-radius:6px}
/* Markdown typography */
.bubble p{margin:0}
.bubble p+p,.bubble p+ul,.bubble p+ol,.bubble ul+p,.bubble ol+p,.bubble ul+ul,.bubble ol+ol{margin-top:8px}
.bubble ul,.bubble ol{margin:4px 0 0;padding-left:20px}
.bubble li{margin:4px 0;padding-left:2px}
.bubble li::marker{color:var(--ink3)}
.bubble ol li::marker{font-weight:600;font-variant-numeric:tabular-nums}
.bubble a{color:inherit;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;text-decoration-color:color-mix(in srgb,currentColor 45%,transparent);transition:text-decoration-color .15s}
.bubble a:hover{text-decoration-color:currentColor}
.bot .bubble a{color:var(--p-text);font-weight:600}
.bubble strong{font-weight:650}
.bubble em{font-style:italic}
.streaming > p:last-child::after,.streaming > :is(ul,ol):last-child > li:last-child::after{content:"";display:inline-block;width:6px;height:6px;margin-left:6px;border-radius:50%;vertical-align:1px;background:var(--p-text);animation:blink 1.1s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:.25;transform:scale(.75)}50%{opacity:1;transform:none}}
.time{font-size:11.5px;font-weight:500;line-height:1.3;color:var(--ink3);padding:0 6px;font-variant-numeric:tabular-nums}

/* Send error */
.errline{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;font-size:13px;font-weight:500;color:var(--err)}
.retry{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid color-mix(in srgb,var(--err) 40%,transparent);background:var(--err-t);color:var(--err);font-weight:600;font-size:13.5px}
.retry:disabled{opacity:.5;cursor:default}

/* Typing indicator: three dots in a bubble, before the first word arrives */
.typing{display:inline-flex;align-items:center;gap:5px;padding:0 16px;height:42px}
.typing i{width:6px;height:6px;border-radius:50%;background:var(--ink3);animation:wave 1.25s infinite ease-in-out}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
.typing-row .av{margin-bottom:0}
@keyframes wave{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}

/* Suggested questions: a card of rows on the home screen, quick-reply pills under a finished reply */
.chips{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;flex:none;max-width:100%;margin-top:-6px;padding-left:36px}
.chips:empty{display:none}
.chips-h{display:none}
.chip{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:7px 14px;border-radius:999px;border:1px solid var(--p-line);background:var(--paper);color:var(--p-text);
  font-weight:600;font-size:14px;line-height:1.35;text-align:left;box-shadow:var(--e1);
  transition:background .15s,border-color .15s,transform .25s var(--spring),box-shadow .15s;animation:chipIn .45s var(--spring) both}
.chips.after .chip{animation-delay:calc(var(--i,0) * 70ms + 120ms)}
@keyframes chipIn{from{opacity:0;transform:translateY(6px) scale(.94)}to{opacity:1;transform:none}}
.chip svg{display:none;width:16px;height:16px;margin-left:auto;color:var(--ink3);transition:transform .2s var(--ease),color .15s}
@media (hover:hover){.chip:hover{background:var(--p-tint);border-color:var(--p-text);transform:translateY(-1px);box-shadow:var(--e2)}}
.chip:active{transform:scale(.96);transition-duration:.08s}
@media (pointer:coarse){.chip{min-height:44px}}
.home .msgs{margin-top:-40px;padding-top:2px;background:transparent;position:relative;z-index:2;-webkit-mask-image:none;mask-image:none}
.home .row.bot:first-child{max-width:100%;align-self:stretch}
.home .row.bot:first-child .av{display:none}
.home .row.bot:first-child .col{flex:1}
.home .row.bot:first-child .bubble{background:var(--paper);border-radius:16px;box-shadow:var(--e2),0 0 0 1px var(--line);padding:16px 20px;font-size:15px;line-height:1.55}
.home .row.bot:first-child .time{display:none}
.home .chips{flex-direction:column;flex-wrap:nowrap;gap:2px;margin-top:-4px;background:var(--paper);border-radius:16px;box-shadow:var(--e2),0 0 0 1px var(--line);padding:8px;justify-content:flex-start;animation:msgIn .5s var(--spring) .08s both}
.home .chips-h{display:block;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink3);padding:8px 12px 6px}
.home .chip{width:100%;border:0;border-radius:12px;min-height:44px;padding:10px 12px;color:var(--ink);font-weight:500;font-size:14.5px;box-shadow:none;animation:none}
.home .chip svg{display:block}
@media (hover:hover){.home .chip:hover{background:var(--bg);transform:none;box-shadow:none}.home .chip:hover svg{transform:translateX(3px);color:var(--p-text)}}

/* Cards */
.card{background:var(--paper);border-radius:16px;padding:16px;width:100%;box-shadow:var(--e2),0 0 0 1px var(--line);animation:msgIn .45s var(--spring) both}
.card h3{font-weight:700;font-size:16px;line-height:1.3;letter-spacing:-.01em;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.card .note{font-size:13.5px;color:var(--ink2);margin-top:4px;line-height:1.5}
.card .fine{font-size:12.5px;color:var(--ink3);margin-top:12px;line-height:1.45}
.card label{display:block;font-size:13px;font-weight:600;margin:12px 0 6px;color:var(--ink)}
.card label span{font-weight:500;color:var(--ink3)}
.card select,.card input,.card textarea{display:block;width:100%;min-height:44px;border:1px solid var(--line2);background:var(--paper);color:var(--ink);border-radius:12px;padding:10px 12px;font-size:16px;box-shadow:var(--e1);transition:border-color .15s,box-shadow .15s}
.card select:focus-visible,.card input:focus-visible,.card textarea:focus-visible{border-color:var(--p-text);outline:0;box-shadow:0 0 0 3px var(--p-tint)}
.card textarea{resize:vertical;min-height:64px}
.card .hint{font-size:12.5px;color:var(--ink3);margin-top:4px}
.card .err{font-size:13px;font-weight:500;color:var(--err);margin-top:8px}
.card .err:empty{display:none}
.kv{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--line);font-size:14px}
.kv:first-of-type{border-top:0}
.kv span{color:var(--ink2)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:10px 16px;border-radius:12px;border:0;
  background:var(--p);color:var(--on-p);font-weight:600;font-size:15px;width:100%;margin-top:16px;text-decoration:none;
  box-shadow:var(--e1),inset 0 1px 0 rgba(255,255,255,.16);transition:transform .2s var(--spring),filter .15s}
@media (hover:hover){.btn:hover{filter:brightness(1.07)}}
.btn:active{transform:scale(.98);transition-duration:.08s}
.btn[disabled]{opacity:.6;cursor:default}
.btn svg{width:18px;height:18px}
.btn.wa{background:#0F766E;color:#FFFFFF}
.btn.ghost{background:var(--paper);color:var(--ink);box-shadow:var(--e1),0 0 0 1px var(--line2)}
.btns{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btns.one{grid-template-columns:1fr}
.link{display:inline-flex;align-items:center;min-height:44px;padding:0 4px;font-weight:600;font-size:14px;color:var(--p-text);text-decoration:underline;text-underline-offset:3px;margin-top:4px}
.mail{display:inline-flex;align-items:center;min-height:44px;font-size:14px;font-weight:500;color:var(--ink);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;background:var(--leaf-t);color:var(--leaf);white-space:nowrap}
.pill.warm{background:var(--mari-t);color:var(--ink)}
.ok{display:flex;gap:12px;align-items:flex-start}
.tick{flex:none;width:32px;height:32px;border-radius:50%;background:var(--leaf-t);color:var(--leaf);display:grid;place-items:center;animation:pop .5s var(--spring) .1s both}
.tick svg{width:16px;height:16px}
.tick.warm{background:var(--mari-t);color:var(--ink)}
.summary{margin-top:12px;background:var(--bg);border-radius:12px;padding:8px 12px;font-size:14px}
.summary div{display:flex;justify-content:space-between;gap:12px;padding:4px 0}
.summary span{color:var(--ink2)}
.summary b{font-weight:600;text-align:right;overflow-wrap:anywhere}
.track{margin-top:12px}

/* Appointment booking: home entry, then one card that steps service → day/time → details → done */
.bk-row{max-width:100%;align-self:stretch}
.bk-entry{display:flex;align-items:center;gap:12px;width:100%;min-height:64px;padding:12px 14px;border-radius:16px;background:var(--paper);
  box-shadow:var(--e2),0 0 0 1px var(--line);text-align:left;animation:msgIn .5s var(--spring) .04s both;transition:box-shadow .2s,transform .25s var(--spring)}
.bk-entry svg{flex:none;width:18px;height:18px;color:var(--ink3);transition:transform .2s var(--ease),color .15s}
@media (hover:hover){.bk-entry:hover{box-shadow:var(--e2),0 0 0 1.5px var(--p-line);transform:translateY(-1px)}.bk-entry:hover .bk-et + span svg{transform:translateX(3px);color:var(--p-text)}}
.bk-entry:active{transform:scale(.985)}
.bk-et{flex:1;display:flex;flex-direction:column;min-width:0;text-align:left}
.bk-et b{font-weight:650;font-size:15px;line-height:1.3}
.bk-et small{font-size:13px;color:var(--ink2);line-height:1.4}
.bk-ic{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--p-tint);color:var(--p-text)}
.bk-ic svg{width:20px;height:20px;color:inherit}
.bk{padding:16px 16px 18px}
.bk-head{display:flex;align-items:center;gap:12px}
.bk-ht{min-width:0}
.bk-ht .note{margin-top:1px}
.bk-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:14px 0 4px}
.bk-steps i{height:4px;border-radius:999px;background:var(--line2);transition:background .3s var(--ease)}
.bk-steps i.on{background:var(--p)}
.bk-body{animation:fadeIn .25s var(--ease) both}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.bk-svcs{display:grid;gap:8px;margin-top:12px}
.bk-svc{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:12px 14px;border-radius:12px;background:var(--paper);box-shadow:inset 0 0 0 1px var(--line2);text-align:left;transition:box-shadow .15s,background .15s}
.bk-svc svg{flex:none;width:18px;height:18px;color:var(--ink3)}
@media (hover:hover){.bk-svc:hover{background:var(--p-tint);box-shadow:inset 0 0 0 1.5px var(--p-line)}}
.bk-svc-t{flex:1;display:flex;flex-direction:column;gap:1px;min-width:0}
.bk-svc-t b{font-weight:600;font-size:15px;line-height:1.35}
.bk-svc-t small,.bk-pick small{font-size:13px;color:var(--ink2)}
.bk-svc-t .bk-desc{color:var(--ink3);font-size:12.5px}
.bk-pick{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding:8px 12px;border-radius:12px;background:var(--bg)}
.bk-pick span{display:flex;flex-direction:column;min-width:0}
.bk-pick b{font-weight:600;font-size:14px}
.bk-pick .link{margin:0;min-height:36px}
.bk-days{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;margin:12px -16px 0;padding:2px 16px 6px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.bk-days::-webkit-scrollbar{display:none}
.bk-day{flex:none;width:56px;min-height:72px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;scroll-snap-align:center;
  box-shadow:inset 0 0 0 1px var(--line2);background:var(--paper);transition:background .15s,box-shadow .15s,transform .25s var(--spring)}
.bk-day small{font-size:11.5px;font-weight:600;color:var(--ink3);text-transform:uppercase;letter-spacing:.03em;line-height:1.2}
.bk-day b{font-size:19px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}
.bk-day.on{background:var(--p);color:var(--on-p);box-shadow:var(--e2)}
.bk-day.on small{color:inherit;opacity:.85}
.bk-day:disabled{opacity:.38;cursor:default;background:transparent}
.bk-day:disabled b{text-decoration:line-through;text-decoration-thickness:1.5px}
@media (hover:hover){.bk-day:not(:disabled):not(.on):hover{box-shadow:inset 0 0 0 1.5px var(--p-line);background:var(--p-tint)}}
.bk-day:not(:disabled):active{transform:scale(.95)}
.bk-times{min-height:96px}
.bk-g{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink3);margin:14px 0 8px}
.bk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.bk-slot{min-height:44px;text-align:center;white-space:nowrap;border-radius:12px;font-weight:600;font-size:14px;color:var(--p-text);background:var(--paper);box-shadow:inset 0 0 0 1px var(--p-line);
  font-variant-numeric:tabular-nums;animation:chipIn .4s var(--spring) both;animation-delay:calc(var(--i,0) * 25ms);transition:background .15s,color .15s,transform .25s var(--spring)}
@media (hover:hover){.bk-slot:hover{background:var(--p);color:var(--on-p)}}
.bk-slot:active{transform:scale(.95)}
.bk-empty{font-size:14px;color:var(--ink2);margin:16px 0 4px;text-align:center}
.bk-skel{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}
.bk-skel i{height:44px;border-radius:12px;background:linear-gradient(90deg,var(--bg) 0%,color-mix(in srgb,var(--bg) 40%,var(--paper)) 50%,var(--bg) 100%);background-size:200% 100%;animation:shimmer 1.2s linear infinite}
@keyframes shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.bk-form .bk-sum{margin-top:12px}
.bk-form .link{display:inline-flex;gap:2px;margin:2px 0 0 -4px;min-height:40px;font-size:13.5px}
.bk-form .link svg{width:16px;height:16px}
.acts{display:flex;align-items:center;gap:0;min-width:0}
.acts .human{white-space:nowrap;padding:0 10px 0 8px}
.human.book svg{color:var(--p-text)}

/* Footer + composer */
.foot{position:relative;padding:8px 12px 4px;background:var(--paper);flex:none;box-shadow:0 -1px 0 var(--line)}
.home .foot{box-shadow:none}
.jump{position:absolute;left:50%;top:-52px;width:40px;height:40px;margin-left:-20px;border-radius:50%;background:var(--paper);color:var(--ink);
  display:grid;place-items:center;box-shadow:var(--e2),0 0 0 1px var(--line);animation:rise .35s var(--spring) both;z-index:3}
.jump svg{width:18px;height:18px}
@media (hover:hover){.jump:hover{color:var(--p-text)}}
.composer{position:relative;display:flex;align-items:flex-end;gap:4px;border-radius:24px;padding:4px 4px 4px 16px;background:var(--bg);
  box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .2s,background .2s}
.composer:focus-within{background:var(--paper);box-shadow:inset 0 0 0 1.5px var(--p-line),0 0 0 4px var(--p-tint)}
.composer textarea{flex:1;min-width:0;resize:none;border:0;background:transparent;color:var(--ink);padding:10px 0;max-height:132px;min-height:44px;font-size:16px;line-height:1.5;outline:none;scrollbar-width:thin}
.composer textarea::placeholder{color:var(--ink3);opacity:1;transition:color .2s}
.composer textarea[disabled]{cursor:not-allowed}
.send,.mic{position:relative;width:40px;height:40px;margin:2px 0;border-radius:50%;display:grid;place-items:center;flex:none;
  transition:transform .3s var(--spring),background .2s,color .2s,opacity .2s}
.send{background:var(--p);color:var(--on-p);box-shadow:var(--e1),inset 0 1px 0 rgba(255,255,255,.16);margin-right:2px}
.send:not([disabled]){animation:sendIn .35s var(--spring)}
@keyframes sendIn{from{transform:scale(.6) rotate(-30deg)}to{transform:none}}
@media (hover:hover){.send:not([disabled]):hover{transform:translateY(-1px) scale(1.05)}.mic:not([disabled]):hover{background:var(--line);color:var(--ink)}}
.send:not([disabled]):active,.mic:not([disabled]):active{transform:scale(.9);transition-duration:.08s}
.send[disabled]{background:transparent;color:var(--ink3);box-shadow:none;opacity:.6;cursor:default}
.send svg{width:18px;height:18px}
.busy .send{background:var(--p);color:var(--on-p);opacity:1}
.busy .send svg{opacity:0}
.busy .send::after{content:"";position:absolute;width:16px;height:16px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
/* Voice */
.mic{color:var(--ink2);isolation:isolate}
.mic svg{width:20px;height:20px}
.mic[disabled]{opacity:.4;cursor:default}
.mic-stop{display:none}
.mic-stop svg{width:14px;height:14px}
.listening .mic{background:var(--err);color:#FFFFFF}
.listening .mic > span:first-child svg{display:none}
.listening .mic-stop{display:grid}
.listening .mic::before{content:"";position:absolute;inset:0;border-radius:50%;background:var(--err);z-index:-1;animation:ring 1.4s ease-out infinite}
@keyframes ring{0%{transform:scale(1);opacity:.45}100%{transform:scale(1.8);opacity:0}}
.wave{display:none;align-items:center;gap:3px;height:44px;margin-right:4px}
.wave i{width:3px;height:14px;border-radius:2px;background:var(--err);animation:eq 1s ease-in-out infinite;transform-origin:center}
.wave i:nth-child(2){animation-delay:-.2s}.wave i:nth-child(3){animation-delay:-.45s}.wave i:nth-child(4){animation-delay:-.1s}.wave i:nth-child(5){animation-delay:-.6s}
@keyframes eq{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}
.listening .wave{display:inline-flex}
.composer.listening{background:var(--paper);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--err) 55%,transparent),0 0 0 4px color-mix(in srgb,var(--err) 12%,transparent)}
.listening textarea::placeholder{color:var(--err)}
.vmsg{font-size:12.5px;font-weight:500;color:var(--err);padding:6px 8px 0;line-height:1.4}
.vmsg:empty{display:none}
.count{font-size:12px;font-weight:500;color:var(--ink3);text-align:right;margin-top:4px;padding:0 8px;font-variant-numeric:tabular-nums}
.count:empty{display:none}
.count.queued{color:var(--p-text);text-align:left}
.composer.queued{box-shadow:inset 0 0 0 1.5px var(--p-line)}
.composer.queued .send{opacity:.6}
.meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px}
.human{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px 0 8px;border-radius:999px;font-weight:600;font-size:13px;color:var(--ink2);transition:background .15s,color .15s}
.human svg{width:16px;height:16px;color:var(--leaf)}
@media (hover:hover){.human:hover{background:var(--bg);color:var(--ink)}}
.by{display:flex;align-items:center;font-size:12px;font-weight:500;color:var(--ink3);white-space:nowrap}
.by a{color:var(--ink3);display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 4px;text-decoration:underline;text-underline-offset:2px;text-decoration-color:var(--line2)}
@media (hover:hover){.by a:hover{color:var(--ink)}}

@media (max-width:640px){
  .launcher{bottom:16px}
  .right .launcher{right:16px}.left .launcher{left:16px}
  .nudge{bottom:84px}
  .right .nudge{right:16px}.left .nudge{left:16px}
  .panel{inset:0 0 auto 0;top:0;bottom:auto;width:100%;height:var(--vh,100dvh);max-height:none;border-radius:0;box-shadow:none;animation:sheetIn .45s var(--spring) backwards}
  .panel.closing{animation:sheetOut .2s var(--out) both}
  .right .panel,.left .panel{right:0;left:0}
  .head{padding-top:calc(12px + env(safe-area-inset-top))}
  .home .head{padding-top:calc(16px + env(safe-area-inset-top));padding-left:20px}
  .hero .hi{font-size:24px;padding-top:20px}
  .foot{padding-bottom:calc(4px + env(safe-area-inset-bottom))}
  .open .launcher,.open .nudge{display:none}
  .row{max-width:88%}
}
@keyframes sheetIn{from{opacity:.6;transform:translateY(48px)}to{opacity:1;transform:none}}
@keyframes sheetOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(48px)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
