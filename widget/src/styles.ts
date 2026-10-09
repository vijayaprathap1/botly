/** All widget CSS lives inside the Shadow DOM: host page styles can't reach it and it can't leak out. */
export const CSS = `
:host{all:initial}
[hidden]{display:none!important}
*,*::before,*::after{box-sizing:border-box}
.bl{--bg:#fff;--surface:#f8fafc;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--bubble:#f1f5f9;--card:#fff;--err:#b91c1c;
  --shadow:0 1px 2px rgba(15,23,42,.06),0 1px 1px rgba(15,23,42,.04);
  font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans","Noto Sans Tamil","Noto Sans Devanagari",sans-serif;
  font-size:15px;line-height:1.5;color:var(--fg);-webkit-font-smoothing:antialiased;text-align:left;letter-spacing:-.005em;
  font-weight:400;font-style:normal;text-transform:none;direction:ltr}
.bl.dark{--bg:#0b1120;--surface:#0f172a;--fg:#f1f5f9;--muted:#94a3b8;--line:#1e293b;--bubble:#1e293b;--card:#111a2e;--err:#fca5a5;
  --shadow:0 1px 2px rgba(0,0,0,.4)}
button,input,textarea,select{font:inherit;color:inherit;margin:0}
button{cursor:pointer;background:none;border:0;padding:0;text-align:inherit}
:focus-visible{outline:2px solid var(--p);outline-offset:2px}
.bl.dark :focus-visible{outline-color:#93c5fd}

/* Launcher */
.launcher{position:fixed;bottom:20px;width:60px;height:60px;border-radius:50%;background:var(--p);color:var(--on-p);
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 10px 30px -6px rgba(15,23,42,.35),0 4px 10px -4px rgba(15,23,42,.25);
  transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s;animation:rise .35s cubic-bezier(.2,.8,.2,1)}
.launcher:hover{transform:translateY(-2px) scale(1.04)}
.launcher:active{transform:scale(.96)}
.launcher .li{position:absolute;display:flex;transition:transform .25s cubic-bezier(.2,.8,.2,1),opacity .2s}
.launcher svg{width:28px;height:28px}
.launcher .li-close{opacity:0;transform:rotate(-90deg) scale(.6)}
.open .launcher .li-chat{opacity:0;transform:rotate(90deg) scale(.6)}
.open .launcher .li-close{opacity:1;transform:none}
.launcher.intro::after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 0 var(--p);animation:ring 2s ease-out 3}
@keyframes ring{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--p) 55%,transparent)}100%{box-shadow:0 0 0 16px transparent}}
@keyframes rise{from{opacity:0;transform:translateY(12px) scale(.9)}to{opacity:1;transform:none}}
.right .launcher{right:20px}.left .launcher{left:20px}

/* Nudge */
.nudge{position:fixed;bottom:92px;max-width:270px;background:var(--bg);color:var(--fg);border:1px solid var(--line);
  border-radius:16px;padding:12px 38px 12px 14px;box-shadow:0 12px 32px -8px rgba(15,23,42,.25);animation:pop .3s cubic-bezier(.2,.8,.2,1);cursor:pointer;font-size:14.5px}
.right .nudge{right:20px;border-bottom-right-radius:6px}.left .nudge{left:20px;border-bottom-left-radius:6px}
.nudge .x{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.nudge .x:hover{background:var(--bubble)}

/* Panel */
.panel{position:fixed;bottom:92px;width:392px;height:min(660px,calc(100vh - 120px));background:var(--bg);color:var(--fg);
  border-radius:20px;box-shadow:0 24px 64px -12px rgba(15,23,42,.35),0 0 0 1px rgba(15,23,42,.06);display:flex;flex-direction:column;overflow:hidden;
  animation:panelIn .28s cubic-bezier(.2,.8,.2,1);transform-origin:bottom right}
.left .panel{transform-origin:bottom left}
.bl.dark .panel{box-shadow:0 24px 64px -12px rgba(0,0,0,.7),0 0 0 1px #1e293b}
.right .panel{right:20px}.left .panel{left:20px}
.full .panel{inset:0;width:100%;height:100%;border-radius:0;box-shadow:none;animation:none}
.full .panel .close{display:none}
@keyframes panelIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* Header */
.head{display:flex;align-items:center;gap:12px;padding:14px 12px 14px 16px;color:var(--on-p);
  background:var(--p);background:linear-gradient(135deg,var(--p),color-mix(in srgb,var(--p) 78%,#000));position:relative}
.avatar-wrap{position:relative;flex:none}
.avatar{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-weight:650;font-size:16px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
.avatar img{width:100%;height:100%;object-fit:cover}
.online{position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px color-mix(in srgb,var(--p) 85%,#000)}
.who{flex:1;min-width:0}
.who b{display:block;font-size:15.5px;font-weight:650;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who .status{display:block;font-size:12.5px;opacity:.88;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:18px}
.who .status.is-typing::after{content:"";display:inline-block;width:18px;text-align:left;animation:ellipsis 1.2s steps(4,end) infinite}
@keyframes ellipsis{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
.close{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--on-p);transition:background .15s}
.close:hover{background:rgba(255,255,255,.18)}

/* Messages */
.msgs{flex:1;overflow-y:auto;padding:18px 14px 8px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain;background:var(--surface);scroll-behavior:smooth}
.msgs::-webkit-scrollbar{width:8px}.msgs::-webkit-scrollbar-thumb{background:var(--line);border-radius:8px}
.row{display:flex;flex-direction:column;max-width:85%;animation:msgIn .28s cubic-bezier(.2,.8,.2,1) both}
@keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.row.user{align-self:flex-end;align-items:flex-end}
.row.bot{align-self:flex-start}
.row.event{align-self:center;max-width:92%}
.bubble{padding:10px 14px;border-radius:18px;white-space:normal;overflow-wrap:anywhere;word-break:break-word;font-size:14.5px}
.bot .bubble{background:var(--bg);border:1px solid var(--line);border-bottom-left-radius:6px;box-shadow:var(--shadow)}
.bl.dark .bot .bubble{background:var(--bubble);border-color:transparent}
.user .bubble{background:var(--p);color:var(--on-p);border-bottom-right-radius:6px;white-space:pre-wrap;box-shadow:0 1px 2px rgba(15,23,42,.12)}
.event .bubble{background:transparent;color:var(--muted);font-size:12.5px;text-align:center;padding:2px 8px;border:0}
.bubble p{margin:0}.bubble p+p,.bubble p+ul,.bubble p+ol,.bubble ul+p,.bubble ol+p{margin-top:8px}
.bubble ul,.bubble ol{margin:6px 0 0;padding-left:20px}
.bubble li{margin:2px 0}
.bubble li::marker{color:var(--muted)}
.bubble a{color:inherit;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
.bot .bubble a{color:var(--p)}
.bl.dark .bot .bubble a{color:inherit}
.bubble strong{font-weight:650}
.streaming > :last-child::after{content:"";display:inline-block;width:2px;height:1em;margin-left:2px;vertical-align:-2px;background:currentColor;opacity:.6;animation:caret .9s steps(2,start) infinite}
@keyframes caret{to{visibility:hidden}}
.time{font-size:11px;color:var(--muted);margin-top:4px;padding:0 6px;opacity:.85}
.retry{font-size:12.5px;color:var(--err);margin-top:4px;text-decoration:underline}

/* Typing indicator */
.typing{display:inline-flex;align-items:center;gap:5px;padding:14px 16px}
.typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:bounce 1.2s infinite ease-in-out}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes bounce{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-5px);opacity:.9}}

/* Suggestion chips */
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:8px 14px 10px;background:var(--surface)}
.chips:empty{display:none}
.chip{border:1px solid color-mix(in srgb,var(--p) 30%,var(--line));background:var(--bg);color:var(--fg);border-radius:999px;padding:7px 13px;font-size:13px;line-height:1.3;
  transition:border-color .15s,background .15s,transform .15s;animation:msgIn .3s cubic-bezier(.2,.8,.2,1) both}
.chip:hover{border-color:var(--p);background:color-mix(in srgb,var(--p) 7%,var(--bg));transform:translateY(-1px)}

/* Cards */
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;width:100%;max-width:310px;box-shadow:var(--shadow);animation:msgIn .28s cubic-bezier(.2,.8,.2,1) both}
.card h4{margin:0 0 8px;font-size:14.5px;font-weight:650}
.card label{display:block;font-size:12.5px;font-weight:500;color:var(--muted);margin:10px 0 4px}
.card select,.card input,.card textarea{display:block;width:100%;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:10px;padding:9px 11px;font-size:15px;transition:border-color .15s,box-shadow .15s}
.card select:focus,.card input:focus,.card textarea:focus{outline:none;border-color:var(--p);box-shadow:0 0 0 3px color-mix(in srgb,var(--p) 18%,transparent)}
.kv{display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:14px}.kv span{color:var(--muted)}.kv a{color:inherit;text-decoration:underline}
.card textarea{resize:vertical;min-height:56px}
.card .hint{font-size:12px;color:var(--muted);margin-top:4px}
.card .err{font-size:13px;color:var(--err);margin-top:6px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--p);color:var(--on-p);border-radius:12px;padding:10px 14px;font-weight:600;margin-top:12px;width:100%;transition:filter .15s,transform .1s}
.btn:hover{filter:brightness(1.06)}.btn:active{transform:scale(.99)}
.btn[disabled]{opacity:.6;cursor:default}
.ok{display:flex;gap:10px;align-items:flex-start}
.ok .tick{flex:none;width:24px;height:24px;border-radius:50%;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;animation:tick .35s cubic-bezier(.2,.8,.2,1.4)}
@keyframes tick{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}
.contact a,.contact span{user-select:text;-webkit-user-select:text}
.contact div{margin-top:4px}
.contact a{color:inherit;text-decoration:underline}

/* Footer + composer */
.foot{border-top:1px solid var(--line);padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:var(--bg)}
.actions{display:flex;justify-content:center;margin-bottom:8px}
.human{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted);padding:5px 12px;border-radius:999px;border:1px solid var(--line);transition:color .15s,border-color .15s,background .15s}
.human:hover{color:var(--fg);border-color:var(--p);background:color-mix(in srgb,var(--p) 6%,var(--bg))}
.composer{display:flex;align-items:flex-end;gap:6px;border:1px solid var(--line);background:var(--bg);border-radius:24px;padding:5px 5px 5px 14px;transition:border-color .15s,box-shadow .15s}
.composer:focus-within{border-color:var(--p);box-shadow:0 0 0 3px color-mix(in srgb,var(--p) 16%,transparent)}
.composer textarea{flex:1;min-width:0;resize:none;border:0;background:transparent;color:var(--fg);padding:8px 0;max-height:120px;min-height:36px;font-size:16px;line-height:1.35;outline:none}
.composer textarea::placeholder{color:var(--muted);opacity:.85}
.send{position:relative;width:38px;height:38px;border-radius:50%;background:var(--p);color:var(--on-p);display:flex;align-items:center;justify-content:center;flex:none;transition:transform .15s,opacity .15s}
.send:not([disabled]):hover{transform:scale(1.06)}
.send[disabled]{opacity:.4;cursor:default}
.bl.dark .send[disabled]{opacity:.5}
.send svg{width:18px;height:18px;transition:opacity .15s}
.busy .send{opacity:1}
.busy .send svg{opacity:0}
.busy .send::after{content:"";position:absolute;width:16px;height:16px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.count{font-size:11.5px;color:var(--muted);text-align:right;margin-top:3px}
.count:empty{display:none}
.meta{display:flex;justify-content:center;gap:10px;font-size:11px;color:var(--muted);margin-top:8px;opacity:.9}
.meta a{color:var(--muted);text-decoration:underline;text-underline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:640px){
  .panel{inset:0 0 auto 0;top:0;bottom:auto;width:100%;height:var(--vh,100dvh);max-height:none;border-radius:0;box-shadow:none;animation:sheetIn .3s cubic-bezier(.2,.8,.2,1)}
  .right .panel,.left .panel{right:0;left:0}
  .head{padding-top:calc(14px + env(safe-area-inset-top))}
  .open .launcher,.open .nudge{display:none}
  .row{max-width:88%}
}
@keyframes sheetIn{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
