/**
 * All widget CSS lives inside the Shadow DOM: host page styles can't reach it and it can't leak out.
 * Messenger redesign (2026-11-17): a calm, neutral messenger in the business's own colour, with a
 * branded home screen that folds into a compact header once the chat starts. Inspired by the
 * patterns used by Intercom, LiveChat and Tidio (home header + cards, grouped bubbles with an
 * avatar, three-dot typing, quick-reply chips, pill composer), not copied from them.
 * The brand variables (--p, --on-p, --p-text, --p-tint, --p-line) are set from JS by themeVars()
 * in color.ts; everything else is a fixed token below.
 */
export const CSS = `
:host{all:initial}
[hidden]{display:none!important}
*,*::before,*::after{box-sizing:border-box}
.bl{--p:#C2410C;--on-p:#FFFFFF;--p-text:#C2410C;--p-tint:#F9ECE7;--p-line:#E7B39D;
  --bg:#F3F4F7;--paper:#FFFFFF;--line:#E4E6EB;--ink:#16181D;--ink2:#5B6070;--edge:#16181D;
  --leaf:#0F766E;--leaf-t:#D7F0EA;--mari-t:#FFF1D6;--err:#B42318;--err-t:#FDE7E4;--focus:#16181D;--online:#16A34A;
  --sh1:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08);
  --sh2:0 4px 14px -4px rgba(16,24,40,.14),0 2px 4px -2px rgba(16,24,40,.06);
  --soft:0 24px 64px -12px rgba(16,24,40,.28),0 8px 24px -8px rgba(16,24,40,.12);
  --ease:cubic-bezier(.2,.9,.25,1);
  --font:"Botly Jakarta","Botly Tamil","Botly Deva",system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Tamil","Noto Sans Devanagari",sans-serif;
  font-family:var(--font);font-size:15px;line-height:1.5;color:var(--ink);-webkit-font-smoothing:antialiased;text-align:left;
  font-weight:400;font-style:normal;text-transform:none;letter-spacing:0;direction:ltr}
.bl.dark{--bg:#262830;--paper:#17181D;--line:#33363F;--ink:#F3F4F6;--ink2:#B0B4BF;--edge:#000000;
  --leaf:#5EEAD4;--leaf-t:#123B36;--mari-t:#3D3015;--err:#FCA5A5;--err-t:#4A1D1A;--focus:#F3F4F6;--online:#4ADE80;
  --sh1:0 1px 2px rgba(0,0,0,.4);--sh2:0 4px 14px -4px rgba(0,0,0,.6);--soft:0 24px 64px -12px rgba(0,0,0,.75)}
button,input,textarea,select{font:inherit;color:inherit;margin:0;letter-spacing:inherit}
button{cursor:pointer;background:none;border:0;padding:0;text-align:inherit}
h2,h3,p{margin:0;font:inherit}
svg{flex:none}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
[lang="ta"]{font-family:"Botly Tamil",var(--font);line-height:1.75}
[lang="hi"]{font-family:"Botly Deva",var(--font);line-height:1.75}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* Logo tile: the bot's image, or the business initial */
.logo{width:40px;height:40px;flex:none;border-radius:50%;background:#FFFFFF;color:#16181D;box-shadow:0 0 0 2px color-mix(in srgb,var(--on-p) 35%,transparent);
  display:grid;place-items:center;font-weight:800;font-size:17px;line-height:1;overflow:hidden}
.logo img{width:100%;height:100%;object-fit:cover;display:block}
.av{width:28px;height:28px;font-size:12.5px;box-shadow:none;background:var(--p);color:var(--on-p);align-self:flex-end;margin-bottom:22px}

/* Launcher: a pill "Ask {name}" that morphs into a round button with a chevron */
.launcher{position:fixed;bottom:24px;display:inline-flex;align-items:center;gap:10px;height:60px;max-width:calc(100vw - 32px);
  padding:0 22px 0 8px;border-radius:999px;background:var(--p);color:var(--on-p);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif;font-weight:700;font-size:16px;line-height:1.2;
  box-shadow:0 10px 28px -8px color-mix(in srgb,var(--p) 55%,rgba(0,0,0,.5)),0 2px 6px rgba(16,24,40,.18);
  transition:transform .2s var(--ease),box-shadow .2s,padding .25s var(--ease),width .25s var(--ease);animation:pop .45s var(--ease) both}
@media (hover:hover){.launcher:hover{transform:translateY(-2px) scale(1.02)}}
.launcher:active{transform:scale(.96)}
.launcher:focus-visible{outline:3px solid var(--p);outline-offset:3px}
.launcher .logo{width:44px;height:44px;font-size:17px}
.launcher .ll{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.launcher .li-close{display:none}
.launcher svg{width:26px;height:26px}
.open .launcher{width:60px;padding:0;justify-content:center}
.open .launcher .ll,.open .launcher .logo{display:none}
.open .launcher .li-close{display:flex;animation:spinIn .3s var(--ease) both}
.right .launcher{right:24px}.left .launcher{left:24px}
@keyframes pop{0%{opacity:0;transform:translateY(16px) scale(.8)}100%{opacity:1;transform:none}}
@keyframes spinIn{from{opacity:0;transform:rotate(-90deg) scale(.6)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

/* Nudge: a small message card above the launcher */
.nudge{position:fixed;bottom:100px;width:320px;max-width:calc(100vw - 32px);background:var(--paper);color:var(--ink);border:1px solid var(--line);
  border-radius:18px;box-shadow:var(--soft);padding:14px;animation:rise .35s var(--ease) both;cursor:pointer}
.right .nudge{right:24px}.left .nudge{left:24px}
.nudge .nt{display:flex;gap:10px;align-items:flex-start;padding-right:36px}
.nudge .logo{width:36px;height:36px;font-size:15px;background:var(--p);color:var(--on-p);box-shadow:none}
.nudge b{display:block;font-size:13px;font-weight:700;color:var(--ink2)}
.nudge .nx{font-weight:500;font-size:15px;line-height:1.45}
.nudge .x{position:absolute;top:4px;right:4px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:var(--ink2)}
@media (hover:hover){.nudge .x:hover{background:var(--bg)}}
.nudge .x svg{width:16px;height:16px}
.nudge .chips{padding:10px 0 0;margin:0;justify-content:flex-start}

/* Panel */
.panel{position:fixed;bottom:100px;width:400px;height:min(640px,calc(100vh - 128px));background:var(--paper);color:var(--ink);
  border-radius:24px;box-shadow:var(--soft);display:flex;flex-direction:column;overflow:hidden;
  animation:panelIn .32s var(--ease) backwards;transform-origin:bottom right}
.bl.dark .panel{border:1px solid var(--line)}
.panel.closing{animation:panelOut .18s ease-in both;pointer-events:none}
.left .panel{transform-origin:bottom left}
.right .panel{right:24px}.left .panel{left:24px}
.full .panel{inset:0;width:100%;height:100%;border:0;border-radius:0;box-shadow:none;animation:none}
.full .panel .close{display:none}
@keyframes panelIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}
@keyframes panelOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(12px) scale(.97)}}

/* Header: tall branded home header that folds into a compact bar once the chat starts */
.head{flex:none;position:relative;color:var(--on-p);background:var(--p);
  background:linear-gradient(150deg,var(--p) 0%,color-mix(in srgb,var(--p) 80%,#000) 100%);padding:12px 8px 12px 16px;
  transition:padding .3s var(--ease)}
.head :focus-visible{outline-color:var(--on-p)}
.bar{display:flex;align-items:center;gap:12px}
.who{flex:1;min-width:0}
.who h2{font-weight:700;font-size:16.5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who .status{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;opacity:.92;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:18px}
.who .status span{overflow:hidden;text-overflow:ellipsis}
.dot{position:relative;width:8px;height:8px;border-radius:50%;background:var(--online);box-shadow:0 0 0 2px color-mix(in srgb,var(--on-p) 70%,transparent);flex:none}
.dot::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--online);animation:ping 2s ease-out infinite}
.dot.off{background:transparent;box-shadow:inset 0 0 0 2px currentColor}
.dot.off::after{display:none}
@keyframes ping{0%{transform:scale(1);opacity:.7}80%,100%{transform:scale(2.6);opacity:0}}
.close{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:var(--on-p);flex:none;transition:background .15s}
@media (hover:hover){.close:hover{background:color-mix(in srgb,var(--on-p) 16%,transparent)}}
.close svg{width:20px;height:20px}
.hero{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .32s var(--ease),opacity .2s}
.hero > div{overflow:hidden;min-height:0;padding-right:14px}
.hero .hi{font-weight:800;font-size:26px;line-height:1.2;letter-spacing:-.01em;padding-top:22px}
.hero .sub{font-size:15px;line-height:1.45;opacity:.9;margin-top:6px;padding-bottom:2px}
.home .head{padding:18px 8px 52px 22px}
.home .hero{grid-template-rows:1fr;opacity:1}
.home .head .logo{width:44px;height:44px}

/* Banners (offline, closed, limit) */
.banner{display:flex;gap:10px;align-items:flex-start;padding:10px 16px;font-size:13.5px;font-weight:500;line-height:1.45;
  border-bottom:1px solid var(--line);background:var(--mari-t);color:var(--ink);flex:none}
.banner.net{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.banner svg{width:18px;height:18px;margin-top:1px}
.home .banner:not([hidden]) ~ .msgs{margin-top:0;padding-top:16px}

/* Messages */
.msgs{flex:1;overflow-y:auto;padding:16px 14px 10px;display:flex;flex-direction:column;gap:14px;overscroll-behavior:contain;background:var(--paper);scroll-behavior:smooth;scrollbar-width:thin;
  transition:margin .32s var(--ease)}
.msgs:focus-visible{outline-offset:-2px}
.row{display:flex;flex-direction:column;gap:4px;max-width:86%;animation:msgIn .3s var(--ease) both}
@keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.row.user{align-self:flex-end;align-items:flex-end;animation-name:msgInR}
@keyframes msgInR{from{opacity:0;transform:translate(8px,6px)}to{opacity:1;transform:none}}
.row.bot{align-self:flex-start;flex-direction:row;align-items:flex-end;gap:8px}
.col{display:flex;flex-direction:column;gap:4px;min-width:0}
.row.cardrow{max-width:100%;align-self:stretch;display:block}
.row.event{align-self:center;max-width:92%}
.bubble{padding:10px 14px;border-radius:18px;overflow-wrap:anywhere;word-break:break-word;font-size:15px;line-height:1.55}
.bot .bubble{background:var(--bg);color:var(--ink);border-bottom-left-radius:6px}
.user .bubble{background:var(--p);color:var(--on-p);border-bottom-right-radius:6px;white-space:pre-wrap}
.event .bubble{background:transparent;color:var(--ink2);font-size:13px;font-weight:500;text-align:center;padding:2px 8px}
/* Grouping: consecutive messages from the same side sit closer, share one avatar and one time */
.row.bot:has(+ .row.bot:not(.cardrow)){margin-bottom:-10px}
.row.bot:has(+ .row.bot:not(.cardrow)) .av{visibility:hidden}
.row.bot:has(+ .row.bot:not(.cardrow):not(.typing-row)) .time{display:none}
.row.bot:has(+ .row.bot:not(.cardrow)) .bubble{border-bottom-left-radius:18px}
.row.bot + .row.bot:not(.cardrow) .bubble{border-top-left-radius:6px}
.row.user:has(+ .row.user){margin-bottom:-10px}
.row.user:has(+ .row.user:not(:has(.errline))) > .time{display:none}
.row.user + .row.user .bubble{border-top-right-radius:6px}
.bubble p{margin:0}.bubble p+p,.bubble p+ul,.bubble p+ol,.bubble ul+p,.bubble ol+p{margin-top:8px}
.bubble ul,.bubble ol{margin:6px 0 0;padding-left:20px}
.bubble li{margin:3px 0}
.bubble li::marker{color:var(--ink2)}
.bubble a{color:inherit;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
.bot .bubble a{color:var(--p-text);font-weight:600}
.bubble strong{font-weight:700}
.streaming > :last-child::after{content:"";display:inline-block;width:7px;height:7px;margin-left:5px;border-radius:50%;vertical-align:1px;background:var(--p);animation:blink 1s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:none}}
.time{font-size:11.5px;font-weight:500;color:var(--ink2);padding:0 6px}

/* Send error */
.errline{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;font-size:13px;font-weight:600;color:var(--err)}
.retry{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--err);background:var(--err-t);color:var(--err);font-weight:700;font-size:13.5px}
.retry:disabled{opacity:.5;cursor:default}

/* Typing indicator: three dots in a bubble, before the first word arrives */
.typing{display:inline-flex;align-items:center;gap:5px;padding:14px 16px;min-height:44px}
.typing i{width:7px;height:7px;border-radius:50%;background:var(--ink2);animation:wave 1.3s infinite ease-in-out}
.typing i:nth-child(2){animation-delay:.16s}.typing i:nth-child(3){animation-delay:.32s}
.typing-row .av{margin-bottom:0}
@keyframes wave{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-5px);opacity:1}}

/* Suggested questions: a card of rows on the home screen, quick-reply pills in the chat */
.chips{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;flex:none;max-width:100%;margin-top:-4px}
.chips:empty{display:none}
.chips-h{display:none}
.chip{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:8px 14px;border-radius:999px;border:1px solid var(--p-line);background:var(--paper);color:var(--p-text);
  font-weight:600;font-size:14px;line-height:1.3;text-align:left;transition:background .15s,transform .15s,border-color .15s;animation:msgIn .3s var(--ease) both}
.chip svg{display:none;width:18px;height:18px;margin-left:auto;color:var(--p-text)}
@media (hover:hover){.chip:hover{background:var(--p-tint);border-color:var(--p-text)}}
.chip:active{transform:scale(.97)}
@media (pointer:coarse){.chip{min-height:44px}}
.home .msgs{margin-top:-40px;padding-top:0;background:transparent;position:relative}
.home .row.bot:first-child{max-width:100%;align-self:stretch}
.home .row.bot:first-child .av{display:none}
.home .row.bot:first-child .col{flex:1}
.home .row.bot:first-child .bubble{background:var(--paper);border-radius:18px;box-shadow:var(--sh2);border:1px solid var(--line);padding:16px 18px;font-size:15px}
.home .row.bot:first-child .time{display:none}
.home .chips{flex-direction:column;flex-wrap:nowrap;gap:0;margin-top:0;background:var(--paper);border:1px solid var(--line);border-radius:18px;box-shadow:var(--sh2);padding:6px;justify-content:flex-start}
.home .chips-h{display:block;font-size:13px;font-weight:700;color:var(--ink2);padding:10px 12px 6px}
.home .chip{width:100%;border:0;border-radius:12px;min-height:48px;padding:10px 12px;color:var(--ink);font-weight:600;font-size:14.5px}
.home .chip svg{display:block}
@media (hover:hover){.home .chip:hover{background:var(--bg)}}
.home .chip + .chip{box-shadow:0 -1px 0 var(--line)}
.home .chip:hover + .chip,.home .chip:hover{box-shadow:none}

/* Cards */
.card{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:16px;width:100%;box-shadow:var(--sh2);animation:msgIn .3s var(--ease) both}
.card h3{font-weight:700;font-size:16.5px;line-height:1.3;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.card .note{font-size:13.5px;color:var(--ink2);margin-top:4px;line-height:1.45}
.card .fine{font-size:12.5px;color:var(--ink2);margin-top:10px;line-height:1.45}
.card label{display:block;font-size:13.5px;font-weight:600;margin:12px 0 5px;color:var(--ink)}
.card label span{font-weight:500;color:var(--ink2)}
.card select,.card input,.card textarea{display:block;width:100%;min-height:44px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:12px;padding:10px 12px;font-size:16px;transition:border-color .15s,box-shadow .15s}
.card select:focus-visible,.card input:focus-visible,.card textarea:focus-visible{border-color:var(--p-text);outline:0;box-shadow:0 0 0 3px var(--p-tint)}
.card textarea{resize:vertical;min-height:64px}
.card .hint{font-size:12.5px;color:var(--ink2);margin-top:4px}
.card .err{font-size:13.5px;font-weight:600;color:var(--err);margin-top:8px}
.card .err:empty{display:none}
.kv{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--line);font-size:14.5px}
.kv:first-of-type{border-top:0}
.kv span{color:var(--ink2)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:10px 16px;border-radius:14px;border:0;
  background:var(--p);color:var(--on-p);font-weight:700;font-size:15px;width:100%;margin-top:14px;text-decoration:none;box-shadow:var(--sh1);transition:transform .1s,filter .15s}
@media (hover:hover){.btn:hover{filter:brightness(1.06)}}
.btn:active{transform:scale(.98)}
.btn[disabled]{opacity:.65;cursor:default}
.btn svg{width:20px;height:20px}
.btn.wa{background:#0F766E;color:#FFFFFF}
.btn.ghost{background:var(--paper);color:var(--ink);border:1px solid var(--line)}
.btns{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.btns.one{grid-template-columns:1fr}
.link{display:inline-flex;align-items:center;min-height:44px;padding:0 4px;font-weight:600;font-size:14px;color:var(--p-text);text-decoration:underline;text-underline-offset:3px;margin-top:2px}
.mail{display:inline-flex;align-items:center;min-height:44px;font-size:14px;font-weight:500;color:var(--ink);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;background:var(--leaf-t);color:var(--leaf);white-space:nowrap}
.pill.warm{background:var(--mari-t);color:var(--ink)}
.ok{display:flex;gap:12px;align-items:flex-start}
.tick{flex:none;width:34px;height:34px;border-radius:50%;background:var(--leaf-t);color:var(--leaf);display:grid;place-items:center}
.tick svg{width:18px;height:18px}
.tick.warm{background:var(--mari-t);color:var(--ink)}
.summary{margin-top:10px;background:var(--bg);border-radius:12px;padding:8px 12px;font-size:14px}
.summary div{display:flex;justify-content:space-between;gap:10px;padding:2px 0}
.summary span{color:var(--ink2)}
.summary b{text-align:right;overflow-wrap:anywhere}
.track{margin-top:12px}

/* Footer + composer */
.foot{padding:8px 12px 2px;background:var(--paper);flex:none;border-top:1px solid var(--line)}
.home .foot{border-top-color:transparent}
.composer{display:flex;align-items:flex-end;gap:8px;border:1px solid var(--line);background:var(--bg);border-radius:24px;padding:4px 4px 4px 16px;transition:border-color .15s,box-shadow .15s,background .15s}
.composer:focus-within{border-color:var(--p-line);background:var(--paper);box-shadow:0 0 0 3px var(--p-tint)}
.composer textarea{flex:1;min-width:0;resize:none;border:0;background:transparent;color:var(--ink);padding:10px 0;max-height:120px;min-height:44px;font-size:16px;line-height:1.5;outline:none}
.composer textarea::placeholder{color:var(--ink2);opacity:1}
.composer textarea[disabled]{cursor:not-allowed}
.send{position:relative;width:40px;height:40px;margin:2px;border-radius:50%;background:var(--p);color:var(--on-p);display:grid;place-items:center;flex:none;
  transition:transform .2s var(--ease),background .15s,color .15s,opacity .15s}
.send:not([disabled]){animation:sendIn .25s var(--ease)}
@keyframes sendIn{from{transform:scale(.7)}to{transform:none}}
@media (hover:hover){.send:not([disabled]):hover{transform:scale(1.06)}}
.send:not([disabled]):active{transform:scale(.92)}
.send[disabled]{background:transparent;color:var(--ink2);opacity:.55;cursor:default}
.send svg{width:20px;height:20px}
.busy .send{background:var(--p);color:var(--on-p);opacity:1}
.busy .send svg{opacity:0}
.busy .send::after{content:"";position:absolute;width:16px;height:16px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.count{font-size:12px;font-weight:500;color:var(--ink2);text-align:right;margin-top:3px;padding:0 8px}
.count:empty{display:none}
.count.queued{color:var(--p-text);text-align:left}
.composer.queued{border-style:dashed}
.composer.queued .send{opacity:.6}
.meta{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:2px}
.human{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 12px 0 8px;border-radius:999px;font-weight:600;font-size:13.5px;color:var(--ink);transition:background .15s}
.human svg{width:18px;height:18px;color:var(--leaf)}
@media (hover:hover){.human:hover{background:var(--bg)}}
.by{display:flex;align-items:center;font-size:12px;font-weight:500;color:var(--ink2);white-space:nowrap}
.by a{color:var(--ink2);display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 4px;text-decoration:underline;text-underline-offset:2px}

@media (max-width:640px){
  .launcher{bottom:16px;height:56px}
  .open .launcher{width:56px}
  .right .launcher{right:16px}.left .launcher{left:16px}
  .nudge{bottom:84px}
  .right .nudge{right:16px}.left .nudge{left:16px}
  .panel{inset:0 0 auto 0;top:0;bottom:auto;width:100%;height:var(--vh,100dvh);max-height:none;border:0;border-radius:0;box-shadow:none;animation-name:sheetIn}
  .panel.closing{animation-name:sheetOut}
  .right .panel,.left .panel{right:0;left:0}
  .head{padding-top:calc(12px + env(safe-area-inset-top))}
  .home .head{padding-top:calc(16px + env(safe-area-inset-top))}
  .hero .hi{font-size:24px;padding-top:18px}
  .foot{padding-bottom:calc(2px + env(safe-area-inset-bottom))}
  .open .launcher,.open .nudge{display:none}
  .row{max-width:90%}
}
@keyframes sheetIn{from{opacity:.4;transform:translateY(40px)}to{opacity:1;transform:none}}
@keyframes sheetOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(40px)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
