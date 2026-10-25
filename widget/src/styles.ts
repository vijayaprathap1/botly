/**
 * All widget CSS lives inside the Shadow DOM: host page styles can't reach it and it can't leak out.
 * "Warm local" restyle (docs/widget-redesign): warm paper, ink outlines, sticker shadows and the
 * business's own colour. The brand variables (--p, --on-p, --p-text, --p-tint, --p-line) are set
 * from JS by themeVars() in color.ts; everything else is a fixed token below.
 */
export const CSS = `
:host{all:initial}
[hidden]{display:none!important}
*,*::before,*::after{box-sizing:border-box}
.bl{--p:#C2410C;--on-p:#FFFFFF;--p-text:#C2410C;--p-tint:#F9ECE7;--p-line:#E7B39D;
  --bg:#FFF7EC;--paper:#FFFFFF;--line:#EBD9C3;--ink:#2B1D14;--ink2:#5C4A3D;--edge:#2B1D14;
  --leaf:#0F766E;--leaf-t:#D7F0EA;--mari-t:#FFE7B8;--err:#B42318;--err-t:#FDE7E4;--focus:#2B1D14;
  --soft:0 24px 60px -18px rgba(60,30,10,.35);
  --font:"Botly Jakarta","Botly Tamil","Botly Deva",system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Tamil","Noto Sans Devanagari",sans-serif;
  font-family:var(--font);font-size:15px;line-height:1.5;color:var(--ink);-webkit-font-smoothing:antialiased;text-align:left;
  font-weight:400;font-style:normal;text-transform:none;letter-spacing:0;direction:ltr}
.bl.dark{--bg:#1C130D;--paper:#2B1D14;--line:#4A3628;--ink:#FFF3E3;--ink2:#E2CDB6;--edge:#000000;
  --leaf:#5EEAD4;--leaf-t:#123B36;--mari-t:#4A3510;--err:#FCA5A5;--err-t:#4A1D1A;--focus:#FFF3E3;--soft:0 24px 60px -12px rgba(0,0,0,.7)}
button,input,textarea,select{font:inherit;color:inherit;margin:0;letter-spacing:inherit}
button{cursor:pointer;background:none;border:0;padding:0;text-align:inherit}
h2,h3,p{margin:0;font:inherit}
svg{flex:none}
:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
[lang="ta"]{font-family:"Botly Tamil",var(--font);line-height:1.75}
[lang="hi"]{font-family:"Botly Deva",var(--font);line-height:1.75}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* Logo tile: the bot's image, or the business initial on cream */
.logo{width:44px;height:44px;flex:none;border-radius:14px;background:#FFF7EC;border:2px solid #2B1D14;box-shadow:2px 2px 0 #2B1D14;
  display:grid;place-items:center;font-weight:800;font-size:18px;line-height:1;color:#2B1D14;overflow:hidden}
.logo img{width:100%;height:100%;object-fit:cover;display:block}

/* Launcher: a pill "Ask {name}" that becomes a round close button */
.launcher{position:fixed;bottom:24px;display:inline-flex;align-items:center;gap:10px;min-height:56px;max-width:calc(100vw - 32px);
  padding:6px 20px 6px 6px;border-radius:999px;border:2px solid #2B1D14;background:var(--p);color:var(--on-p);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif;font-weight:800;font-size:16px;line-height:1.2;box-shadow:3px 3px 0 #2B1D14,0 10px 24px -10px rgba(43,29,20,.45);
  transition:transform .15s ease;animation:rise .3s ease both}
@media (hover:hover){.launcher:hover{transform:translateY(-1px)}}
.launcher:active{transform:translate(1px,1px)}
.launcher:focus-visible{outline-color:#2B1D14;outline-offset:4px;box-shadow:3px 3px 0 #2B1D14,0 0 0 9px #FFF7EC}
.launcher .logo{width:42px;height:42px;font-size:17px;box-shadow:none}
.launcher .ll{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.launcher .li-close{display:none}
.launcher svg{width:24px;height:24px}
.open .launcher{width:56px;height:56px;padding:0;justify-content:center}
.open .launcher .li-chat,.open .launcher .ll,.open .launcher .logo{display:none}
.open .launcher .li-close{display:flex}
.right .launcher{right:24px}.left .launcher{left:24px}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

/* Nudge */
.nudge{position:fixed;bottom:96px;width:320px;max-width:calc(100vw - 32px);background:var(--paper);color:var(--ink);border:2px solid var(--edge);
  border-radius:20px 20px 6px 20px;box-shadow:3px 3px 0 var(--edge);padding:14px;animation:rise .3s ease both;cursor:pointer}
.left .nudge{border-radius:20px 20px 20px 6px}
.right .nudge{right:24px}.left .nudge{left:24px}
.nudge .nt{display:flex;gap:10px;align-items:flex-start;padding-right:36px}
.nudge .logo{width:40px;height:40px;font-size:16px;border-radius:12px}
.nudge b{display:block;font-size:13px;font-weight:700;color:var(--ink2)}
.nudge .nx{font-weight:600;font-size:15px;line-height:1.4}
.nudge .x{position:absolute;top:4px;right:4px;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:var(--ink2)}
@media (hover:hover){.nudge .x:hover{background:var(--bg)}}
.nudge .x svg{width:18px;height:18px}
.nudge .chips{padding:10px 0 0;background:none}

/* Panel */
.panel{position:fixed;bottom:96px;width:400px;height:min(660px,calc(100vh - 120px));background:var(--bg);color:var(--ink);
  border:2px solid var(--edge);border-radius:22px;box-shadow:6px 6px 0 var(--edge),var(--soft);display:flex;flex-direction:column;overflow:hidden;
  animation:panelIn .22s ease both;transform-origin:bottom right}
.left .panel{transform-origin:bottom left}
.right .panel{right:24px}.left .panel{left:24px}
.full .panel{inset:0;width:100%;height:100%;border:0;border-radius:0;box-shadow:none;animation:none}
.full .panel .close{display:none}
@keyframes panelIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

/* Header */
.head{display:flex;align-items:center;gap:12px;padding:14px 10px 14px 16px;background:var(--p);color:var(--on-p);flex:none}
.head :focus-visible{outline-color:var(--on-p)}
.who{flex:1;min-width:0}
.who h2{font-weight:800;font-size:18px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who .status{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:18px}
.who .status span{overflow:hidden;text-overflow:ellipsis}
.dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none}
.dot.off{background:transparent;border:2px solid currentColor}
.close{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:var(--on-p);flex:none}
@media (hover:hover){.close:hover{background:color-mix(in srgb,var(--on-p) 14%,transparent)}}
.close svg{width:20px;height:20px}

/* Banners (offline, closed, limit) */
.banner{display:flex;gap:10px;align-items:flex-start;padding:10px 16px;font-size:13.5px;font-weight:600;line-height:1.45;
  border-bottom:1.5px solid var(--line);background:var(--mari-t);color:var(--ink);flex:none}
.banner.net{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.banner svg{width:18px;height:18px;margin-top:1px}

/* Messages */
.msgs{flex:1;overflow-y:auto;padding:18px 16px 8px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain;background:var(--bg);scroll-behavior:smooth;scrollbar-width:thin}
.msgs:focus-visible{outline-offset:-3px}
.row{display:flex;flex-direction:column;gap:4px;max-width:88%;animation:msgIn .22s ease both}
@keyframes msgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.row.user{align-self:flex-end;align-items:flex-end}
.row.bot{align-self:flex-start}
.row.cardrow{max-width:100%;align-self:stretch}
.row.event{align-self:center;max-width:92%}
.bubble{padding:10px 15px;border-radius:20px;overflow-wrap:anywhere;word-break:break-word;font-size:15px}
.bot .bubble{background:var(--paper);border:1.5px solid var(--line);border-bottom-left-radius:6px}
.user .bubble{background:var(--p);color:var(--on-p);border-bottom-right-radius:6px;white-space:pre-wrap}
.event .bubble{background:transparent;color:var(--ink2);font-size:13px;font-weight:600;text-align:center;padding:2px 8px;border:0}
.bubble p{margin:0}.bubble p+p,.bubble p+ul,.bubble p+ol,.bubble ul+p,.bubble ol+p{margin-top:8px}
.bubble ul,.bubble ol{margin:6px 0 0;padding-left:20px}
.bubble li{margin:2px 0}
.bubble li::marker{color:var(--ink2)}
.bubble a{color:inherit;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
.bot .bubble a{color:var(--p-text);font-weight:600}
.bubble strong{font-weight:800}
.streaming > :last-child::after{content:"";display:inline-block;width:2px;height:1em;margin-left:2px;vertical-align:-2px;background:currentColor;opacity:.6;animation:caret .9s steps(2,start) infinite}
@keyframes caret{to{visibility:hidden}}
.time{font-size:12px;font-weight:600;color:var(--ink2);padding:0 6px}

/* Send error */
.errline{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;font-size:13px;font-weight:700;color:var(--err)}
.retry{min-height:44px;padding:0 14px;border-radius:12px;border:1.5px solid var(--err);background:var(--err-t);color:var(--err);font-weight:800;font-size:13.5px}
.retry:disabled{opacity:.5;cursor:default}

/* Typing indicator */
.typing-row{flex-direction:row;align-items:center;gap:10px}
.typing{display:inline-flex;align-items:center;gap:4px;padding:14px 16px}
.typing i{width:7px;height:7px;border-radius:50%;background:var(--ink2);animation:bounce 1.2s infinite ease-in-out}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
.typing-text{font-size:12.5px;font-weight:600;color:var(--ink2)}
@keyframes bounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}

/* Suggestion chips */
.chips{display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px 10px;background:var(--bg);flex:none}
.chips:empty{display:none}
.chip{min-height:44px;padding:8px 16px;border-radius:999px;border:1.5px solid var(--p-line);background:var(--paper);color:var(--p-text);
  font-weight:700;font-size:14.5px;line-height:1.25;text-align:left;transition:background .15s;animation:msgIn .22s ease both}
@media (hover:hover){.chip:hover{background:var(--p-tint)}}

/* Cards */
.card{background:var(--paper);border:2px solid var(--edge);border-radius:18px;padding:16px;width:100%;box-shadow:4px 4px 0 var(--edge);animation:msgIn .22s ease both}
.card h3{font-weight:800;font-size:17px;line-height:1.3;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.card .note{font-size:13.5px;color:var(--ink2);margin-top:4px;line-height:1.45}
.card .fine{font-size:12.5px;color:var(--ink2);margin-top:10px;line-height:1.45}
.card label{display:block;font-size:13.5px;font-weight:700;margin:12px 0 5px;color:var(--ink)}
.card label span{font-weight:600;color:var(--ink2)}
.card select,.card input,.card textarea{display:block;width:100%;min-height:44px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);border-radius:12px;padding:10px 12px;font-size:16px}
.card select:focus-visible,.card input:focus-visible,.card textarea:focus-visible{border-color:var(--ink);outline-offset:1px}
.card textarea{resize:vertical;min-height:64px}
.card .hint{font-size:12.5px;color:var(--ink2);margin-top:4px}
.card .err{font-size:13.5px;font-weight:700;color:var(--err);margin-top:8px}
.card .err:empty{display:none}
.kv{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--line);font-size:14.5px}
.kv:first-of-type{border-top:0}
.kv span{color:var(--ink2)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:10px 16px;border-radius:14px;border:2px solid var(--edge);
  background:var(--p);color:var(--on-p);font-weight:800;font-size:15.5px;width:100%;margin-top:14px;text-decoration:none;box-shadow:0 4px 0 var(--edge);transition:transform .1s}
.btn:active{transform:translateY(2px);box-shadow:0 2px 0 var(--edge)}
.btn[disabled]{opacity:.65;cursor:default}
.btn svg{width:20px;height:20px}
.btn.wa{background:#0F766E;color:#FFFFFF;border-color:#0B4F4A;box-shadow:0 4px 0 #0B4F4A}
.btn.ghost{background:var(--paper);color:var(--ink);border-color:var(--ink);box-shadow:0 4px 0 var(--ink)}
.bl.dark .btn.ghost{box-shadow:0 4px 0 #000}
.btns{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.btns.one{grid-template-columns:1fr}
.link{display:inline-flex;align-items:center;min-height:44px;padding:0 4px;font-weight:700;font-size:14px;color:var(--ink);text-decoration:underline;text-underline-offset:3px;margin-top:2px}
.mail{display:inline-flex;align-items:center;min-height:44px;font-size:14px;font-weight:600;color:var(--ink);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;background:var(--leaf-t);color:var(--leaf);white-space:nowrap}
.pill.warm{background:var(--mari-t);color:var(--ink)}
.ok{display:flex;gap:12px;align-items:flex-start}
.tick{flex:none;width:34px;height:34px;border-radius:50%;background:var(--leaf-t);color:var(--leaf);border:2px solid var(--edge);display:grid;place-items:center}
.tick svg{width:18px;height:18px}
.tick.warm{background:var(--mari-t);color:var(--ink)}
.summary{margin-top:10px;background:var(--bg);border:1.5px dashed var(--line);border-radius:12px;padding:8px 12px;font-size:14px}
.summary div{display:flex;justify-content:space-between;gap:10px;padding:2px 0}
.summary span{color:var(--ink2)}
.summary b{text-align:right;overflow-wrap:anywhere}
.track{margin-top:12px}

/* Footer + composer */
.foot{border-top:1.5px solid var(--line);padding:10px 12px 4px;background:var(--paper);flex:none}
.composer{display:flex;align-items:flex-end;gap:8px;border:1.5px solid var(--line);background:var(--bg);border-radius:16px;padding:4px 4px 4px 14px}
.composer:focus-within{border-color:var(--ink)}
.composer textarea{flex:1;min-width:0;resize:none;border:0;background:transparent;color:var(--ink);padding:11px 0;max-height:120px;min-height:44px;font-size:16px;line-height:1.35;outline:none}
.composer textarea::placeholder{color:var(--ink2);opacity:1}
.composer textarea[disabled]{cursor:not-allowed}
.send{position:relative;width:44px;height:44px;border-radius:12px;border:2px solid var(--edge);background:var(--p);color:var(--on-p);display:grid;place-items:center;flex:none}
.send[disabled]{background:var(--paper);color:var(--ink2);border-color:var(--line);cursor:default}
.send svg{width:20px;height:20px}
.busy .send{background:var(--p);color:var(--on-p);border-color:var(--edge)}
.busy .send svg{opacity:0}
.busy .send::after{content:"";position:absolute;width:16px;height:16px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.count{font-size:12px;font-weight:600;color:var(--ink2);text-align:right;margin-top:3px}
.count:empty{display:none}
.count.queued{color:var(--p);text-align:left}
.composer.queued{border-style:dashed}
.composer.queued .send{opacity:.6}
.meta{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:2px}
.human{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 12px 0 8px;border-radius:12px;font-weight:800;font-size:14px;color:var(--ink)}
.human svg{width:18px;height:18px;color:var(--leaf)}
@media (hover:hover){.human:hover{background:var(--bg)}}
.by{display:flex;align-items:center;font-size:12px;font-weight:600;color:var(--ink2);white-space:nowrap}
.by a{color:var(--ink2);display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 4px;text-decoration:underline;text-underline-offset:2px}

@media (max-width:640px){
  .launcher{bottom:16px}
  .right .launcher{right:16px}.left .launcher{left:16px}
  .nudge{bottom:84px}
  .right .nudge{right:16px}.left .nudge{left:16px}
  .panel{inset:0 0 auto 0;top:0;bottom:auto;width:100%;height:var(--vh,100dvh);max-height:none;border:0;border-radius:0;box-shadow:none}
  .right .panel,.left .panel{right:0;left:0}
  .head{padding-top:calc(12px + env(safe-area-inset-top))}
  .foot{padding-bottom:calc(4px + env(safe-area-inset-bottom))}
  .open .launcher,.open .nudge{display:none}
  .row{max-width:90%}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
