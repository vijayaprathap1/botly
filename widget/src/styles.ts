/** All widget CSS lives inside the Shadow DOM: host page styles can't reach it and it can't leak out. */
export const CSS = `
:host{all:initial}
[hidden]{display:none!important}
*,*::before,*::after{box-sizing:border-box}
.bl{--bg:#fff;--fg:#111827;--muted:#4b5563;--line:#e5e7eb;--bubble:#f3f4f6;--card:#f9fafb;--err:#b91c1c;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans","Noto Sans Tamil","Noto Sans Devanagari",sans-serif;
  font-size:15px;line-height:1.45;color:var(--fg);-webkit-font-smoothing:antialiased;text-align:left;letter-spacing:normal;
  font-weight:400;font-style:normal;text-transform:none;direction:ltr}
.bl.dark{--bg:#111827;--fg:#f9fafb;--muted:#d1d5db;--line:#374151;--bubble:#1f2937;--card:#1f2937;--err:#fca5a5}
button,input,textarea{font:inherit;color:inherit;margin:0}
button{cursor:pointer;background:none;border:0;padding:0;text-align:inherit}
:focus-visible{outline:3px solid var(--p);outline-offset:2px}
.bl.dark :focus-visible{outline-color:#93c5fd}
.launcher{position:fixed;bottom:20px;width:60px;height:60px;border-radius:50%;background:var(--p);color:var(--on-p);
  display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,0,0,.22);transition:transform .15s ease}
.launcher:hover{transform:scale(1.05)}
.launcher svg{width:28px;height:28px}
.right .launcher{right:20px}.left .launcher{left:20px}
.nudge{position:fixed;bottom:92px;max-width:260px;background:var(--bg);color:var(--fg);border:1px solid var(--line);
  border-radius:14px;padding:12px 36px 12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.14);animation:pop .2s ease-out;cursor:pointer}
.right .nudge{right:20px}.left .nudge{left:20px}
.nudge .x{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.panel{position:fixed;bottom:92px;width:380px;height:min(640px,calc(100vh - 120px));background:var(--bg);color:var(--fg);
  border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;
  border:1px solid var(--line);animation:pop .18s ease-out}
.right .panel{right:20px}.left .panel{left:20px}
.full .panel{inset:0;width:100%;height:100%;border-radius:0;border:0;box-shadow:none;animation:none}
.full .panel .close{display:none}
@keyframes pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.head{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;background:var(--p);color:var(--on-p)}
.avatar{width:38px;height:38px;border-radius:50%;flex:none;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-weight:600;overflow:hidden}
.avatar img{width:100%;height:100%;object-fit:cover}
.who{flex:1;min-width:0}
.who b{display:block;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who span{display:block;font-size:12.5px;opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.close{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--on-p)}
.close:hover{background:rgba(127,127,127,.2)}
.msgs{flex:1;overflow-y:auto;padding:14px 12px 6px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
.row{display:flex;flex-direction:column;max-width:86%}
.row.user{align-self:flex-end;align-items:flex-end}
.row.bot{align-self:flex-start}
.row.event{align-self:center;max-width:92%}
.bubble{padding:9px 12px;border-radius:16px;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
.bot .bubble{background:var(--bubble);border-bottom-left-radius:4px}
.user .bubble{background:var(--p);color:var(--on-p);border-bottom-right-radius:4px;white-space:pre-wrap}
.event .bubble{background:transparent;color:var(--muted);font-size:13px;text-align:center;padding:2px 8px}
.bubble p{margin:0}.bubble p+p,.bubble p+ul,.bubble p+ol,.bubble ul+p,.bubble ol+p{margin-top:6px}
.bubble ul,.bubble ol{margin:4px 0 0;padding-left:20px}
.bubble a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.bubble strong{font-weight:650}
.time{font-size:11.5px;color:var(--muted);margin-top:3px;padding:0 4px}
.retry{font-size:12.5px;color:var(--err);margin-top:4px;text-decoration:underline}
.typing{display:inline-flex;gap:4px;padding:12px 14px}
.typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);opacity:.5;animation:blink 1.2s infinite}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes blink{0%,80%,100%{opacity:.25}40%{opacity:.9}}
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:4px 12px 8px}
.chip{border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:999px;padding:6px 12px;font-size:13.5px}
.chip:hover{border-color:var(--p)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;width:100%;max-width:300px}
.card h4{margin:0 0 8px;font-size:14.5px;font-weight:600}
.card label{display:block;font-size:13px;color:var(--muted);margin:8px 0 3px}
.card select{display:block;width:100%;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:8px;padding:8px 10px;font:inherit}
.kv{display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:14px}.kv span{color:var(--muted)}.kv a{color:inherit;text-decoration:underline}
.card input,.card textarea{display:block;width:100%;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:8px;padding:8px 10px;font-size:15px}
.card textarea{resize:vertical;min-height:54px}
.card .hint{font-size:12px;color:var(--muted);margin-top:3px}
.card .err{font-size:13px;color:var(--err);margin-top:6px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--p);color:var(--on-p);border-radius:10px;padding:9px 14px;font-weight:600;margin-top:10px;width:100%}
.btn[disabled]{opacity:.6;cursor:default}
.ok{display:flex;gap:8px;align-items:flex-start}
.ok .tick{flex:none;width:22px;height:22px;border-radius:50%;background:#15803d;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px}
.contact a,.contact span{user-select:text;-webkit-user-select:text}
.contact div{margin-top:4px}
.contact a{color:inherit;text-decoration:underline}
.foot{border-top:1px solid var(--line);padding:8px 10px calc(8px + env(safe-area-inset-bottom))}
.human{display:block;width:100%;text-align:center;font-size:13.5px;font-weight:600;color:var(--fg);padding:6px;border-radius:8px;margin-bottom:6px;border:1px solid var(--line)}
.human:hover{border-color:var(--p)}
.composer{display:flex;align-items:flex-end;gap:8px}
.composer textarea{flex:1;resize:none;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:12px;padding:9px 12px;max-height:120px;min-height:42px;font-size:16px;line-height:1.35}
.send{width:42px;height:42px;border-radius:50%;background:var(--p);color:var(--on-p);display:flex;align-items:center;justify-content:center;flex:none}
.send[disabled]{opacity:.5;cursor:default}
.send svg{width:20px;height:20px}
.count{font-size:11.5px;color:var(--muted);text-align:right;margin-top:2px}
.meta{display:flex;justify-content:center;gap:10px;font-size:11.5px;color:var(--muted);margin-top:6px}
.meta a{color:var(--muted);text-decoration:underline}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:640px){
  .panel{inset:auto 0 0 0;width:100%;height:var(--vh,100dvh);max-height:none;border-radius:0;border:0;bottom:0}
  .right .panel,.left .panel{right:0;left:0}
  .head{padding-top:calc(12px + env(safe-area-inset-top))}
  .open .launcher,.open .nudge{display:none}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;
