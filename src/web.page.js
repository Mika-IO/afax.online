// The AFAX web control panel — a single self-contained page (no build, no deps).
// Served by web.js to authenticated sessions (cookie auth). The embedded client
// script avoids backticks and ${...} so it can live safely in this template literal.
// Performance notes: token streaming is batched through requestAnimationFrame,
// markdown is rendered once on completion (not per token), and autoscroll only
// engages when the user is already near the bottom.
export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AFAX — Control Panel</title>
<style>
  :root {
    --bg:#0a0b0e; --side:#0b0c10; --panel:#15171d; --panel2:#1a1d24; --raise:#1e222a;
    --line:#23272f; --line2:#2d323b; --ink:#edeff3; --dim:#8c93a0; --faint:#5b626e;
    --orange:#ff8a3d; --orange2:#ff6a2b; --green:#42c178; --red:#f0564a; --blue:#5aa9ff;
    --r:14px; --r2:11px;
    --shadow:0 10px 34px -8px rgba(0,0,0,.55);
    --ring:0 0 0 3px rgba(255,138,61,.16);
  }
  * { box-sizing:border-box; }
  html, body { height:100%; }
  body {
    margin:0; color:var(--ink); overflow:hidden;
    font:14.5px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,Inter,Helvetica,Arial,sans-serif;
    letter-spacing:-.1px;
    background:
      radial-gradient(1100px 600px at 100% -15%, rgba(255,138,61,.10), transparent 55%),
      radial-gradient(800px 600px at -15% 120%, rgba(90,169,255,.05), transparent 55%),
      var(--bg);
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  }
  code, pre, .mono { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  ::selection { background:rgba(255,138,61,.3); }
  ::-webkit-scrollbar { width:11px; height:11px; }
  ::-webkit-scrollbar-thumb { background:#262b33; border-radius:9px; border:3px solid transparent; background-clip:padding-box; }
  ::-webkit-scrollbar-thumb:hover { background:#363c46; background-clip:padding-box; }
  a { color:var(--blue); text-decoration:none; } a:hover { text-decoration:underline; }
  svg { display:block; }

  .app { display:grid; grid-template-columns:250px 1fr; height:100vh; }

  /* sidebar */
  .side { display:flex; flex-direction:column; background:linear-gradient(180deg,var(--side),#08090b); border-right:1px solid var(--line); padding:18px 14px; }
  .brand { display:flex; align-items:center; gap:10px; padding:6px 8px 20px; font-weight:800; font-size:18px; letter-spacing:.3px; }
  .brand .blocks { color:var(--orange); text-shadow:0 0 20px rgba(255,138,61,.55); letter-spacing:2px; }
  .side nav { display:flex; flex-direction:column; gap:3px; }
  .side nav button { display:flex; align-items:center; gap:11px; width:100%; text-align:left; background:none; border:0; color:var(--dim); padding:10px 12px; border-radius:11px; cursor:pointer; font:inherit; font-weight:550; transition:background .15s,color .15s; }
  .side nav button svg { width:17px; height:17px; opacity:.85; flex:0 0 auto; }
  .side nav button:hover { color:var(--ink); background:rgba(255,255,255,.035); }
  .side nav button.active { color:#fff; background:linear-gradient(90deg,rgba(255,138,61,.2),rgba(255,138,61,.03)); box-shadow:inset 2px 0 0 var(--orange); }
  .side nav button.active svg { opacity:1; color:var(--orange); }
  .side .spacer { flex:1; }
  .status { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 13px; font-size:12.5px; }
  .status .s-name { font-weight:700; }
  .status .s-meta { color:var(--dim); margin-top:2px; font-family:ui-monospace,monospace; font-size:11.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .status .s-badge { display:inline-flex; align-items:center; gap:5px; margin-top:9px; font-size:11px; padding:3px 10px; border-radius:20px; border:1px solid var(--line2); color:var(--dim); }
  .status .s-badge::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--faint); }
  .status .s-badge.on { color:var(--green); border-color:rgba(66,193,120,.4); background:rgba(66,193,120,.08); }
  .status .s-badge.on::before { background:var(--green); box-shadow:0 0 8px var(--green); }
  .ws { margin-bottom:10px; }
  .ws select { width:100%; margin:0 0 6px; padding:8px 10px; font-size:12.5px; }
  .ws button { width:100%; font-size:12px; padding:7px; }
  .tcol { margin-bottom:14px; }
  .tcol h4 { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--faint); margin:0 0 8px; }
  .titem { display:flex; align-items:center; gap:11px; background:var(--panel); border:1px solid var(--line); border-radius:11px; padding:11px 13px; margin-bottom:7px; }
  .titem .tdot { width:18px; height:18px; border-radius:50%; border:2px solid var(--line2); cursor:pointer; flex:0 0 auto; }
  .titem.doing .tdot { border-color:#febc2e; background:radial-gradient(circle at 50% 50%, #febc2e 0 45%, transparent 46%); }
  .titem.done .tdot { border-color:var(--green); background:var(--green); }
  .titem .ttitle { flex:1; }
  .titem.done .ttitle { color:var(--dim); text-decoration:line-through; }
  .titem .tdel { background:none; border:0; color:var(--faint); cursor:pointer; font-size:16px; }
  .titem .tdel:hover { color:var(--red); }

  /* main */
  main { height:100vh; overflow:hidden; display:flex; flex-direction:column; }
  section { padding:26px 32px; overflow-y:auto; flex:1; animation:fade .22s ease; contain:layout style; }
  section[hidden] { display:none !important; }
  section#chat:not([hidden]) { display:flex; flex-direction:column; padding-bottom:20px; overflow:hidden; }
  @keyframes fade { from { opacity:0; transform:translateY(4px);} to { opacity:1; transform:none; } }
  .head { margin-bottom:20px; }
  .head h2 { margin:0; font-size:20px; font-weight:750; letter-spacing:-.4px; }
  .head p { margin:4px 0 0; color:var(--dim); font-size:13px; }

  h3 { margin:0 0 14px; font-size:11.5px; text-transform:uppercase; letter-spacing:1.3px; color:var(--faint); font-weight:650; }
  .card { background:linear-gradient(180deg,var(--panel),#111319); border:1px solid var(--line); border-radius:var(--r); padding:18px 20px; margin-bottom:14px; box-shadow:var(--shadow); contain:layout style; }
  .muted { color:var(--dim); }
  .row { display:flex; gap:10px; align-items:center; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 22px; }

  label { display:block; margin:9px 0; color:var(--dim); font-size:12px; font-weight:550; }
  input, select, textarea { width:100%; margin-top:5px; padding:9px 12px; background:#0a0b0e; border:1px solid var(--line2); color:var(--ink); border-radius:9px; font:inherit; font-size:13px; transition:border-color .15s,box-shadow .15s; }
  input:focus, select:focus, textarea:focus { outline:none; border-color:var(--orange); box-shadow:var(--ring); }
  textarea { min-height:90px; resize:vertical; font-family:ui-monospace,monospace; font-size:12.5px; }
  select { cursor:pointer; }

  .btn { display:inline-flex; align-items:center; gap:7px; font:inherit; cursor:pointer; border-radius:10px; transition:transform .12s,filter .15s,background .15s,border-color .15s,color .15s; }
  .btn:active { transform:translateY(1px); }
  .act { background:linear-gradient(180deg,var(--orange),var(--orange2)); color:#23120a; border:0; padding:10px 18px; font-weight:700; box-shadow:0 6px 18px -4px rgba(255,106,43,.45); }
  .act:hover { filter:brightness(1.07); }
  .ghost { background:rgba(255,255,255,.025); border:1px solid var(--line2); color:var(--dim); padding:8px 13px; }
  .ghost:hover { color:var(--ink); border-color:#3a414c; background:rgba(255,255,255,.05); }
  .icon { padding:8px; background:rgba(255,255,255,.025); border:1px solid var(--line2); color:var(--dim); }
  .icon:hover { color:var(--ink); border-color:#3a414c; }
  button:disabled { opacity:.4; cursor:default; transform:none !important; filter:none !important; }
  label.dirty input, label.dirty select { border-color:var(--orange); box-shadow:var(--ring); }

  /* chat */
  #log { display:flex; flex-direction:column; gap:20px; flex:1; overflow-y:auto; padding:8px 2px 14px; scroll-behavior:auto; overflow-anchor:none; }
  .bubble { display:flex; gap:13px; max-width:780px; animation:rise .24s cubic-bezier(.2,.7,.3,1); }
  @keyframes rise { from { opacity:0; transform:translateY(7px);} to { opacity:1; transform:none; } }
  .bubble.user { align-self:flex-end; max-width:78%; }
  .bubble.user .txt { background:linear-gradient(180deg,#222b38,#1a212b); border:1px solid var(--line2); padding:10px 15px; border-radius:15px 15px 5px 15px; white-space:pre-wrap; word-break:break-word; }
  .bubble.assistant .avatar { flex:0 0 30px; height:30px; border-radius:50%; display:grid; place-items:center; background:radial-gradient(circle at 35% 30%,var(--orange),var(--orange2)); color:#1a0f06; box-shadow:0 0 18px rgba(255,138,61,.45); margin-top:1px; }
  .bubble.assistant .avatar svg { width:15px; height:15px; }
  .bubble.assistant .content { min-width:0; flex:1; }
  .bubble.assistant .say { white-space:pre-wrap; word-break:break-word; }
  .bubble.assistant .say b { color:#fff; }
  .bubble.assistant .say code { background:#0c0e12; border:1px solid var(--line); padding:1px 5px; border-radius:5px; font-size:12.5px; color:#ffcba3; }
  .bubble.assistant .say pre.cb { background:#0b0c0f; border:1px solid var(--line); border-radius:10px; padding:11px 13px; overflow-x:auto; font-size:12.5px; margin:8px 0; white-space:pre; }
  .bubble.assistant.thinking .say::after { content:"▍"; color:var(--orange); margin-left:1px; animation:blink 1.05s steps(2) infinite; }
  @keyframes blink { 50% { opacity:0; } }
  .steps { margin-top:11px; display:flex; flex-direction:column; gap:8px; }
  .cmd { background:#0b0c0f; border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .cmd code { display:block; padding:7px 12px; color:var(--orange); font-size:12px; background:rgba(255,138,61,.06); border-bottom:1px solid var(--line); }
  .cmd pre { margin:0; padding:9px 12px; color:var(--dim); font-size:12px; white-space:pre-wrap; word-break:break-word; overflow-x:auto; max-height:260px; }
  .tools { margin-top:8px; display:flex; align-items:center; gap:12px; }
  .meter { color:var(--faint); font-size:11px; font-family:ui-monospace,monospace; }
  .copy { background:none; border:0; color:var(--faint); cursor:pointer; font:inherit; font-size:11.5px; display:inline-flex; align-items:center; gap:5px; padding:0; transition:color .15s; }
  .copy:hover { color:var(--ink); }
  .copy svg { width:13px; height:13px; }

  .pills { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:16px; }
  .pill { background:var(--panel); border:1px solid var(--line2); color:var(--dim); padding:6px 13px; border-radius:20px; cursor:pointer; font-size:12.5px; transition:.15s; }
  .pill:hover { color:var(--ink); border-color:#3a414c; transform:translateY(-1px); }
  .pill.on { color:#23120a; background:linear-gradient(180deg,var(--orange),var(--orange2)); border-color:transparent; font-weight:650; }

  .composer { display:flex; gap:9px; align-items:flex-end; margin-top:14px; background:var(--panel); border:1px solid var(--line2); border-radius:16px; padding:8px 8px 8px 8px; box-shadow:var(--shadow); transition:border-color .15s,box-shadow .15s; }
  .composer:focus-within { border-color:var(--orange); box-shadow:var(--ring); }
  .composer textarea { flex:1; border:0; background:none; margin:0; padding:9px 10px; resize:none; min-height:24px; max-height:160px; font-family:inherit; font-size:14.5px; line-height:1.5; }
  .composer textarea:focus { outline:none; box-shadow:none; }
  .send { width:38px; height:38px; padding:0; justify-content:center; flex:0 0 auto; }
  .send svg { width:17px; height:17px; }

  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  th, td { text-align:left; padding:8px 11px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--faint); font-weight:650; text-transform:uppercase; font-size:10.5px; letter-spacing:.6px; position:sticky; top:0; background:var(--panel); }
  tr:hover td { background:rgba(255,255,255,.018); }
  td pre { margin:0; white-space:pre-wrap; word-break:break-word; max-width:560px; color:var(--ink); font-size:12px; }
  .del { width:26px; height:26px; padding:0; justify-content:center; border-radius:7px; }

  .stat { background:#0c0e12; border:1px solid var(--line); border-radius:12px; padding:15px 17px; }
  .stat .lbl { color:var(--faint); font-size:11px; text-transform:uppercase; letter-spacing:1px; }
  .stat .big { font-size:27px; font-weight:800; letter-spacing:-.6px; margin:3px 0 1px; }
  .bar { height:12px; background:#0b0b0d; border-radius:8px; overflow:hidden; border:1px solid var(--line); margin-top:14px; }
  .bar > i { display:block; height:100%; background:linear-gradient(90deg,var(--green),#74e6a3); transition:width .5s cubic-bezier(.2,.7,.3,1); }

  .empty { text-align:center; color:var(--faint); padding:48px 20px; }
  .empty svg { width:40px; height:40px; margin:0 auto 12px; opacity:.5; }

  .skel { background:linear-gradient(90deg,#15171d 25%,#1d212a 37%,#15171d 63%); background-size:400% 100%; animation:sh 1.3s ease infinite; border-radius:8px; height:14px; margin:9px 0; }
  @keyframes sh { from { background-position:100% 0; } to { background-position:0 0; } }

  #toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(14px); background:#1c1f26; border:1px solid var(--line2); color:var(--ink); padding:11px 18px; border-radius:12px; box-shadow:var(--shadow); opacity:0; transition:opacity .25s,transform .25s; pointer-events:none; font-size:13px; z-index:50; }
  #toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
  #toast.err { border-color:rgba(240,86,74,.5); }

  kbd { background:#0c0e12; border:1px solid var(--line2); border-bottom-width:2px; border-radius:5px; padding:1px 6px; font-size:11px; font-family:ui-monospace,monospace; color:var(--dim); }

  @media (max-width:840px){
    .app { grid-template-columns:1fr; }
    .side { flex-direction:row; align-items:center; height:auto; padding:9px 12px; overflow-x:auto; }
    .side nav { flex-direction:row; }
    .brand { padding:0 10px 0 4px; }
    .side .spacer, .status { display:none; }
    main { height:calc(100vh - 56px); }
    section { padding:20px; }
  }
</style>
</head>
<body>
<div class="app">
  <aside class="side">
    <div class="brand"><span class="blocks">&#9648;&#9648;&#9648;</span> AFAX</div>
    <nav>
      <button data-tab="chat" class="active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Chat</button>
      <button data-tab="tasks"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Tasks</button>
      <button data-tab="content"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg> Content</button>
      <button data-tab="integrations"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg> Integrations</button>
      <button data-tab="database"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> Database</button>
      <button data-tab="usage"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Usage</button>
    </nav>
    <div class="spacer"></div>
    <div class="ws" id="wsBox"></div>
    <div class="status" id="sub"><div class="skel" style="width:70%"></div><div class="skel" style="width:50%"></div></div>
  </aside>

  <main>
    <section id="chat">
      <div class="head"><h2>Chat</h2><p>Talk to your company in natural language — I run the commands.</p></div>
      <div class="pills" id="pills"></div>
      <div id="log"></div>
      <div class="composer">
        <textarea id="msg" rows="1" placeholder="Message your company…  (Enter to send, Shift+Enter for newline)" autocomplete="off"></textarea>
        <button class="btn icon" id="resetBtn" title="Reset conversation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
        <button class="btn act send" id="sendBtn" title="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg></button>
      </div>
    </section>

    <section id="tasks" hidden>
      <div class="head"><h2>Tasks</h2><p>The company work board — click the dot to move todo → doing → done.</p></div>
      <div class="card"><div class="row"><input id="taskIn" placeholder="New task…  e.g. Draft Q3 outreach sequence" style="margin-top:0"><button class="btn act" id="taskAdd">Add</button></div></div>
      <div id="taskBoard"></div>
    </section>

    <section id="content" hidden>
      <div class="head"><h2>Content</h2><p>Everything generated — carousels, memes, posters, reels and copy.</p></div>
      <div id="contentList"></div>
    </section>

    <section id="integrations" hidden>
      <div class="head"><h2>Integrations</h2><p>Paste any key — I detect the service, save it and test it. Or fill a card. Secrets stay on the server.</p></div>
      <div class="card">
        <h3>Smart connect</h3>
        <div class="row">
          <input id="pasteIn" type="password" placeholder="Paste an API key / token / webhook URL…" style="margin-top:0">
          <button class="btn act" id="pasteBtn">Detect &amp; connect</button>
        </div>
      </div>
      <div id="cards"></div>
      <details style="margin-top:6px">
        <summary class="muted" style="cursor:pointer;padding:8px 2px">Advanced — every setting</summary>
        <div class="row" style="justify-content:flex-end;margin:8px 0"><button class="btn act" id="saveCfg">Save changes</button></div>
        <div id="cfg"></div>
      </details>
    </section>

    <section id="database" hidden>
      <div class="head"><h2>Database</h2><p>Browse, search, add and delete records across every collection.</p></div>
      <div class="pills" id="collections"></div>
      <p class="muted" id="dbHint">Pick a collection above.</p>
      <div class="card" id="addCard" hidden>
        <h3>Add record to <span id="addName"></span></h3>
        <textarea id="addJson" placeholder='{"email":"a@b.com","name":"Acme"}'></textarea>
        <div style="margin-top:10px;"><button class="btn act" id="addBtn">Add record</button></div>
      </div>
      <div class="card" id="dataCard" hidden>
        <div class="row" style="margin-bottom:14px;">
          <input id="dbSearch" placeholder="Search records…" style="max-width:300px; margin-top:0;">
          <span class="muted" id="dbCount"></span>
          <span style="flex:1"></span>
          <button class="btn ghost" id="dbRefresh">Refresh</button>
        </div>
        <div id="tableWrap"></div>
        <div class="row" id="pager" hidden style="margin-top:16px; justify-content:flex-end;">
          <button class="btn ghost" id="pgPrev">&#8592; Prev</button>
          <span class="muted" id="pgInfo"></span>
          <button class="btn ghost" id="pgNext">Next &#8594;</button>
        </div>
      </div>
    </section>

    <section id="usage" hidden>
      <div class="head"><h2>Usage &amp; budget</h2><p>Token spend per call, metered live. Cap it to stay in control.</p></div>
      <div class="card" id="usageCard"></div>
      <div class="card">
        <h3>Monthly budget — USD (0 = unlimited)</h3>
        <div class="row"><input id="budgetInput" type="number" step="1" style="max-width:170px;"><button class="btn act" id="budgetBtn">Set budget</button></div>
      </div>
      <div class="card"><h3>Recent calls</h3><div id="recent"></div></div>
    </section>
  </main>
</div>
<div id="toast"></div>

<script>
var STATE = null;
var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

// Auth is an HttpOnly cookie set at login; same-origin fetch sends it automatically.
// A 401 means the session expired — bounce to the login screen.
function api(path, opts){
  opts = opts || {}; opts.credentials = "same-origin";
  opts.headers = Object.assign({ "content-type": "application/json" }, opts.headers || {});
  return fetch(path, opts).then(function(r){ if(r.status === 401){ location.href = "/"; throw new Error("unauthorized"); } return r; });
}
function j(path, opts){ return api(path, opts).then(function(r){ return r.json(); }).catch(function(e){ if(String(e.message) !== "unauthorized") toast("Network error", true); throw e; }); }
function esc(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function el(id){ return document.getElementById(id); }
function toast(m, err){ var t = el("toast"); t.textContent = m; t.className = err ? "show err" : "show"; clearTimeout(toast._t); toast._t = setTimeout(function(){ t.className = ""; }, 1900); }

// lightweight markdown (escape first, then format) — rendered once per message
function mdfmt(t){
  t = esc(t);
  t = t.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, function(m, c){ return '<pre class="cb">' + c.replace(/^\\n/, "") + "</pre>"; });
  t = t.replace(/\`([^\`]+)\`/g, "<code>$1</code>");
  t = t.replace(/\\*\\*([^*]+)\\*\\*/g, "<b>$1</b>");
  t = t.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return t;
}

// ---- tabs ----
var TABS = ["chat","tasks","content","integrations","database","usage"];
document.querySelectorAll(".side nav button").forEach(function(b){ b.onclick = function(){ showTab(b.dataset.tab); }; });
function showTab(name){
  TABS.forEach(function(t){ el(t).hidden = (t !== name); });
  document.querySelectorAll(".side nav button").forEach(function(b){ b.classList.toggle("active", b.dataset.tab === name); });
  try { localStorage.setItem("afax_tab", name); } catch(e){}
  if(name === "chat") el("msg").focus();
  if(name === "tasks") loadTasks();
  if(name === "content") loadContent();
  if(name === "integrations"){ loadIntegrations(); loadConfig(); }
  if(name === "database") loadCollections();
  if(name === "usage") loadUsage();
}

// ---- workspaces (companies) ----
function loadWorkspaces(){
  j("/api/workspaces").then(function(d){
    var ws = d.workspaces || [];
    var opts = ws.map(function(w){ return '<option value="' + esc(w.slug) + '"' + (w.active ? " selected" : "") + ">" + esc(w.name) + "</option>"; }).join("");
    el("wsBox").innerHTML = '<select id="wsSel">' + opts + '</select><button class="btn ghost" id="wsNew">+ New company</button>';
    el("wsSel").onchange = function(){
      api("/api/workspaces/use", { method:"POST", body: JSON.stringify({ slug: el("wsSel").value }) }).then(function(){ location.reload(); });
    };
    el("wsNew").onclick = function(){
      var name = prompt("New company name:"); if(!name) return;
      api("/api/workspaces", { method:"POST", body: JSON.stringify({ name: name }) }).then(function(){ location.reload(); });
    };
  });
}

// ---- content (previews of generated assets) ----
function loadContent(){
  j("/api/content").then(function(d){
    var items = d.items || [];
    if(!items.length){ el("contentList").innerHTML = '<p class="muted">Nothing yet. In Chat: ask me to make a carousel, poster or reel.</p>'; return; }
    el("contentList").innerHTML = items.map(function(it){
      var media = (it.files || []).map(function(f){
        var u = "/api/asset?path=" + encodeURIComponent(f);
        var ext = f.split(".").pop().toLowerCase();
        if(["png","jpg","jpeg","webp","gif"].indexOf(ext) >= 0)
          return '<a href="' + u + '" target="_blank"><img src="' + u + '" loading="lazy" style="width:118px;height:148px;object-fit:cover;border-radius:9px;border:1px solid var(--line)"></a>';
        if(["mp4","webm"].indexOf(ext) >= 0)
          return '<video src="' + u + '" controls preload="metadata" style="width:170px;border-radius:9px;border:1px solid var(--line)"></video>';
        if(ext === "txt")
          return '<a class="muted" href="' + u + '" target="_blank" style="font-size:12px;align-self:center">' + esc(f.split("/").pop()) + " &#8599;</a>";
        return "";
      }).join("");
      var body = (!media && it.body) ? '<pre style="white-space:pre-wrap;font-size:12.5px;color:var(--ink);margin-top:10px;max-height:300px;overflow:auto">' + esc(it.body.slice(0, 1400)) + "</pre>" : "";
      return '<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">' + esc(it.format) + " &middot; " + esc((it.topic || "").slice(0, 64)) + '</h3><span class="muted" style="font-size:11px">' + esc((it.createdAt || "").slice(0, 10)) + "</span></div>" +
        (media ? '<div class="row" style="flex-wrap:wrap;gap:10px;margin-top:12px">' + media + "</div>" : "") + body + "</div>";
    }).join("");
  });
}

// ---- tasks ----
var TSTATUS = { todo:"doing", doing:"done", done:"todo" };
function loadTasks(){
  j("/api/data/tasks?limit=200").then(function(d){
    var rows = (d.records || []);
    var groups = { todo:[], doing:[], done:[] };
    rows.forEach(function(t){ (groups[t.status] || groups.todo).push(t); });
    var col = function(key, label){
      var items = groups[key].map(function(t){
        return '<div class="titem ' + key + '"><div class="tdot" data-adv="' + esc(t.id) + '" title="advance"></div>' +
          '<div class="ttitle">' + esc(t.title) + '</div><button class="tdel" data-del="' + esc(t.id) + '">&#215;</button></div>';
      }).join("");
      return '<div class="tcol"><h4>' + label + " (" + groups[key].length + ")</h4>" + (items || '<p class="muted" style="font-size:12px">empty</p>') + "</div>";
    };
    el("taskBoard").innerHTML = col("doing","Doing") + col("todo","To do") + col("done","Done");
    document.querySelectorAll("#taskBoard [data-adv]").forEach(function(b){ b.onclick = function(){ advTask(b.dataset.adv, rows); }; });
    document.querySelectorAll("#taskBoard [data-del]").forEach(function(b){ b.onclick = function(){ api("/api/data/tasks/" + b.dataset.del, { method:"DELETE" }).then(loadTasks); }; });
  });
}
function advTask(id, rows){
  var t = rows.find(function(x){ return x.id === id; }); if(!t) return;
  api("/api/data/tasks/" + id, { method:"PUT", body: JSON.stringify({ status: TSTATUS[t.status] || "doing" }) }).then(loadTasks);
}
el("taskAdd").onclick = function(){
  var v = el("taskIn").value.trim(); if(!v) return;
  api("/api/data/tasks", { method:"POST", body: JSON.stringify({ title: v, status:"todo" }) }).then(function(){ el("taskIn").value = ""; loadTasks(); });
};
el("taskIn").addEventListener("keydown", function(e){ if(e.key === "Enter") el("taskAdd").click(); });

// ---- state ----
function loadState(){
  return j("/api/state").then(function(s){
    STATE = s;
    el("sub").innerHTML =
      '<div class="s-name">' + esc(s.business.name || s.workspace) + "</div>" +
      '<div class="s-meta">' + esc(s.provider) + "/" + esc(s.model) + "</div>" +
      '<div class="s-badge ' + (s.live ? "on" : "") + '">' + (s.live ? "live" : "dry-run") + "</div>";
    if(!s.hasLLM){ el("msg").placeholder = "No LLM configured — set a provider key in Integrations."; }
  });
}

// ---- chat ----
var SUGGEST = ["how are we doing?", "find 10 leads and draft outreach", "what is AFAX?", "show usage"];
function renderPills(){ el("pills").innerHTML = SUGGEST.map(function(s){ return '<span class="pill" data-q="' + esc(s) + '">' + esc(s) + "</span>"; }).join("");
  document.querySelectorAll("#pills .pill").forEach(function(p){ p.onclick = function(){ el("msg").value = p.dataset.q; autosize(); send(); }; }); }

function addBubble(role, text){
  var d = document.createElement("div");
  d.className = "bubble " + role;
  if(role === "assistant"){
    d.innerHTML = '<div class="avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v4M3 5h4M6 17v4M4 19h4"/><path d="M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5z"/></svg></div>' +
      '<div class="content"><div class="say"></div><div class="steps"></div><div class="tools" hidden></div></div>';
    d.querySelector(".say").textContent = text;
  } else {
    d.innerHTML = '<div class="txt"></div>';
    d.querySelector(".txt").textContent = text;
  }
  el("log").appendChild(d);
  scrollLog(true);
  return d;
}
function nearBottom(){ var l = el("log"); return (l.scrollHeight - l.scrollTop - l.clientHeight) < 90; }
function scrollLog(force){ var l = el("log"); if(force || nearBottom()) l.scrollTop = l.scrollHeight; }
function setBusy(b){ el("sendBtn").disabled = b; if(!b){ el("msg").focus(); } }
function autosize(){ var m = el("msg"); m.style.height = "auto"; m.style.height = Math.min(m.scrollHeight, 160) + "px"; }

// rAF-batched streaming render — avoids reflow on every token
var _raf = 0, _pendEl = null, _pendText = "";
function queueSay(sayEl, text){ _pendEl = sayEl; _pendText = text; if(!_raf) _raf = requestAnimationFrame(flushSay); }
function flushSay(){ _raf = 0; if(_pendEl){ _pendEl.textContent = _pendText; scrollLog(); } }

function send(){
  var input = el("msg");
  var text = input.value.trim();
  if(!text) return;
  input.value = ""; autosize();
  setBusy(true);
  addBubble("user", text);
  var bubble = addBubble("assistant", "");
  bubble.classList.add("thinking");
  var sayEl = bubble.querySelector(".say");
  var stepsEl = bubble.querySelector(".steps");
  api("/api/chat", { method:"POST", body: JSON.stringify({ text: text }) }).then(function(res){
    var reader = res.body.getReader();
    var dec = new TextDecoder();
    var buf = "";
    function pump(){
      return reader.read().then(function(r){
        if(r.done){ finish(bubble, sayEl); return; }
        buf += dec.decode(r.value, { stream:true });
        var idx;
        while((idx = buf.indexOf("\\n\\n")) >= 0){
          var line = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if(line.indexOf("data: ") !== 0) continue;
          var ev; try { ev = JSON.parse(line.slice(6)); } catch(e){ continue; }
          handleEv(ev, bubble, sayEl, stepsEl);
        }
        return pump();
      });
    }
    return pump();
  }).catch(function(e){ finish(bubble, sayEl); sayEl.textContent = "Connection error: " + e.message; });
}
function finish(bubble, sayEl){ if(_raf){ cancelAnimationFrame(_raf); _raf = 0; } bubble.classList.remove("thinking"); setBusy(false); loadState(); }

function handleEv(ev, bubble, sayEl, stepsEl){
  if(ev.type === "token"){ bubble.classList.add("thinking"); queueSay(sayEl, ev.say); }
  else if(ev.type === "say"){
    if(_raf){ cancelAnimationFrame(_raf); _raf = 0; }
    bubble.classList.remove("thinking");
    var txt = ev.text || sayEl.textContent;
    sayEl.innerHTML = mdfmt(txt);
    var tools = bubble.querySelector(".tools");
    tools.hidden = false;
    tools.innerHTML = '<button class="copy">' + ICON_COPY + 'Copy</button>' + (ev.usage ? '<span class="meter">' + esc(fmtUsage(ev.usage)) + "</span>" : "");
    tools.querySelector(".copy").onclick = function(){ navigator.clipboard.writeText(txt).then(function(){ toast("Copied"); }); };
    scrollLog();
  }
  else if(ev.type === "command"){
    var d = document.createElement("div"); d.className = "cmd";
    d.innerHTML = "<code>" + esc(ev.cmd) + "</code><pre>" + esc(ev.out || "") + "</pre>";
    stepsEl.appendChild(d); scrollLog();
  }
  else if(ev.type === "error"){ bubble.classList.remove("thinking"); sayEl.textContent = "\\u26a0 " + ev.message; }
}
function fmtUsage(u){ var t = (u.input || 0) + (u.output || 0); return (t >= 1000 ? (t/1000).toFixed(1) + "k" : t) + " tokens"; }

el("sendBtn").onclick = send;
el("msg").addEventListener("input", autosize);
el("msg").addEventListener("keydown", function(e){ if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); send(); } });
el("resetBtn").onclick = function(){ api("/api/chat/reset", { method:"POST" }).then(function(){ el("log").innerHTML = ""; toast("Conversation reset"); el("msg").focus(); }); };

// ---- integrations / config ----
var MASK = "__AFAX_SECRET_SET__";
var GROUP_NAMES = {
  general:"General", budget:"Budget", business:"Business profile",
  "providers.anthropic":"Anthropic", "providers.openai":"OpenAI (compatible)", "providers.ollama":"Ollama (local)",
  "integrations.email":"Email", "integrations.meta":"Meta · FB / IG / WhatsApp", "integrations.telegram":"Telegram",
  "integrations.slack":"Slack", "integrations.discord":"Discord", "integrations.leads":"Leads · Hunter / Apollo",
  "integrations.media":"Media · images", "integrations.deploy":"Deploy · SSH", "integrations.stripe":"Stripe", "integrations.server":"Inbound server"
};
function friendlyGroup(g){ return GROUP_NAMES[g] || g.replace(/\\./g, " › "); }
function loadConfig(){
  el("cfg").innerHTML = '<div class="card"><div class="skel" style="width:30%"></div><div class="skel"></div><div class="skel" style="width:80%"></div></div>';
  j("/api/config").then(function(d){
    var groups = []; var map = {};
    d.fields.forEach(function(f){
      var parts = f.path.split(".");
      var g = parts.length === 1 ? "general" : parts.slice(0, -1).join(".");
      if(!map[g]){ map[g] = []; groups.push(g); }
      map[g].push(f);
    });
    var html = "";
    groups.forEach(function(g){
      html += '<div class="card"><h3>' + esc(friendlyGroup(g)) + "</h3><div class=grid>";
      map[g].forEach(function(f){ html += fieldHtml(f, f.path.split(".").pop()); });
      html += "</div></div>";
    });
    el("cfg").innerHTML = html;
    document.querySelectorAll("#cfg [data-path]").forEach(function(e){
      var mark = function(){ e.parentNode.classList.toggle("dirty", e.value !== e.dataset.orig); };
      e.addEventListener("input", mark); e.addEventListener("change", mark);
    });
  });
}
function fieldHtml(f, label){
  var path = esc(f.path);
  if(typeof f.value === "boolean"){
    return '<label>' + esc(label) + '<select data-path="' + path + '" data-orig="' + f.value + '"><option value="true"' + (f.value?" selected":"") + ">true</option><option value=\\"false\\"" + (!f.value?" selected":"") + ">false</option></select></label>";
  }
  var secret = f.value === MASK;
  var val = secret ? "" : esc(f.value == null ? "" : f.value);
  var ph = secret ? "set — leave blank to keep" : "";
  var type = (secret || /key|secret|token|pass/i.test(label)) ? "password" : "text";
  return '<label>' + esc(label) + '<input type="' + type + '" data-path="' + path + '" data-orig="' + val + '" value="' + val + '" placeholder="' + ph + '"></label>';
}
el("saveCfg").onclick = function(){
  var els = document.querySelectorAll("#cfg [data-path]");
  var changes = [];
  els.forEach(function(e){ if(e.value !== e.dataset.orig) changes.push({ path: e.dataset.path, value: e.value }); });
  if(!changes.length){ toast("No changes"); return; }
  Promise.all(changes.map(function(ch){ return api("/api/config", { method:"POST", body: JSON.stringify(ch) }); })).then(function(){ toast("Saved " + changes.length + " field(s)"); loadState(); loadConfig(); });
};

// ---- integrations: smart connect + per-service cards ----
function loadIntegrations(){
  j("/api/integrations").then(function(d){
    el("cards").innerHTML = (d.integrations || []).map(function(it){
      var badge = it.connected
        ? '<span style="color:var(--green);font-size:12px">&#9679; connected</span>'
        : '<span class="muted" style="font-size:12px">&#9675; not set</span>';
      var fields = it.fields.map(function(f){
        var ph = f.set ? "set — leave blank to keep" : (f.placeholder || "");
        var type = f.secret ? "password" : "text";
        return '<label>' + esc(f.label) + '<input type="' + type + '" data-path="' + esc(f.path) + '" placeholder="' + esc(ph) + '"></label>';
      }).join("");
      var oauthBtn = "";
      if(it.oauth && it.oauth.supported){
        if(it.oauth.ready) oauthBtn = '<a class="btn act" href="/api/oauth/' + it.key + '/start">Connect with ' + esc((it.oauth.label || it.label).split(" ")[0]) + ' &#8599;</a>';
        else oauthBtn = '<span class="muted" style="font-size:11px">One-click available — set the OAuth app creds</span>';
      }
      return '<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">' + esc(it.label) + '</h3>' + badge + '</div>' +
        '<div class=grid>' + fields + '</div>' +
        '<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">' + oauthBtn +
        '<button class="btn act" data-save="' + it.key + '">Save</button>' +
        '<button class="btn ghost" data-test="' + it.key + '">Test</button>' +
        '<span style="flex:1"></span><a class="muted" style="font-size:12px" href="' + esc(it.get) + '" target="_blank" rel="noopener">Get key &#8599;</a></div></div>';
    }).join("");
    document.querySelectorAll("#cards [data-save]").forEach(function(b){ b.onclick = function(){ saveCard(b); }; });
    document.querySelectorAll("#cards [data-test]").forEach(function(b){ b.onclick = function(){ testInteg(b.dataset.test); }; });
  });
}
function saveCard(btn){
  var card = btn.closest(".card");
  var changes = [];
  card.querySelectorAll("[data-path]").forEach(function(e){ if(e.value.trim() !== "") changes.push({ path: e.dataset.path, value: e.value.trim() }); });
  if(!changes.length){ toast("Nothing to save"); return; }
  Promise.all(changes.map(function(ch){ return api("/api/config", { method:"POST", body: JSON.stringify(ch) }); })).then(function(){ toast("Saved"); loadIntegrations(); loadState(); });
}
function testInteg(key){
  toast("Testing " + key + "…");
  j("/api/integrations/test", { method:"POST", body: JSON.stringify({ key: key }) }).then(function(r){ toast((r.ok ? "\\u2713 " : "\\u2717 ") + key + " — " + (r.msg || ""), !r.ok); });
}
el("pasteBtn").onclick = function(){
  var v = el("pasteIn").value.trim(); if(!v) return;
  j("/api/integrations/paste", { method:"POST", body: JSON.stringify({ secret: v }) }).then(function(r){
    if(!r.ok){ toast(r.error || "Not recognized", true); return; }
    el("pasteIn").value = "";
    toast(r.label + (r.test && r.test.ok ? " connected \\u2713" : " saved — test: " + ((r.test && r.test.msg) || "?")));
    loadIntegrations(); loadState();
  });
};

// ---- database ----
var CUR = null, PAGE = 0, PSIZE = 25, QUERY = "", TOTAL = 0;
function loadCollections(){
  if(!STATE) return;
  el("collections").innerHTML = STATE.collections.map(function(c){ return '<span class="pill" data-c="' + c + '">' + c + "</span>"; }).join("");
  document.querySelectorAll("#collections .pill").forEach(function(p){ p.onclick = function(){ selectCollection(p.dataset.c); }; });
}
function selectCollection(name){
  CUR = name; PAGE = 0; QUERY = ""; el("dbSearch").value = "";
  document.querySelectorAll("#collections .pill").forEach(function(p){ p.classList.toggle("on", p.dataset.c === name); });
  el("dbHint").hidden = true;
  el("addCard").hidden = false; el("addName").textContent = name;
  el("dataCard").hidden = false;
  loadRecords();
}
function loadRecords(){
  if(!CUR) return;
  var qs = "?limit=" + PSIZE + "&offset=" + (PAGE * PSIZE) + (QUERY ? "&q=" + encodeURIComponent(QUERY) : "");
  j("/api/data/" + CUR + qs).then(function(d){
    var rows = d.records || []; TOTAL = d.total || 0;
    el("dbCount").textContent = TOTAL + " record" + (TOTAL === 1 ? "" : "s") + (QUERY ? " matching" : "");
    if(!rows.length){ el("tableWrap").innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>' + (QUERY ? "No matches." : "Empty collection.") + "</div>"; el("pager").hidden = true; return; }
    var cols = Object.keys(rows[0]).filter(function(k){ return k !== "id"; }).slice(0, 6);
    var html = "<table><tr><th></th>" + cols.map(function(k){ return "<th>" + esc(k) + "</th>"; }).join("") + "</tr>";
    rows.forEach(function(r){
      html += "<tr><td><button class='btn icon del' data-del='" + esc(r.id) + "' title='Delete'>&#215;</button></td>";
      cols.forEach(function(k){ var v = r[k]; html += "<td><pre>" + esc(typeof v === "object" ? JSON.stringify(v) : v) + "</pre></td>"; });
      html += "</tr>";
    });
    html += "</table>";
    el("tableWrap").innerHTML = html;
    document.querySelectorAll("#tableWrap [data-del]").forEach(function(b){ b.onclick = function(){ delRecord(b.dataset.del); }; });
    var pages = Math.max(1, Math.ceil(TOTAL / PSIZE));
    el("pager").hidden = pages <= 1;
    el("pgInfo").textContent = "Page " + (PAGE + 1) + " of " + pages;
    el("pgPrev").disabled = PAGE <= 0;
    el("pgNext").disabled = PAGE >= pages - 1;
  });
}
function delRecord(id){
  if(!confirm("Delete record " + id + "?")) return;
  api("/api/data/" + CUR + "/" + id, { method:"DELETE" }).then(function(){ toast("Deleted"); loadRecords(); });
}
el("addBtn").onclick = function(){
  var raw = el("addJson").value.trim(); if(!raw) return;
  var obj; try { obj = JSON.parse(raw); } catch(e){ toast("Invalid JSON", true); return; }
  api("/api/data/" + CUR, { method:"POST", body: JSON.stringify(obj) }).then(function(){ el("addJson").value = ""; toast("Added"); PAGE = 0; loadRecords(); });
};
el("dbRefresh").onclick = function(){ loadRecords(); };
el("pgPrev").onclick = function(){ if(PAGE > 0){ PAGE--; loadRecords(); } };
el("pgNext").onclick = function(){ PAGE++; loadRecords(); };
var dbT;
el("dbSearch").addEventListener("input", function(){ clearTimeout(dbT); dbT = setTimeout(function(){ QUERY = el("dbSearch").value.trim(); PAGE = 0; loadRecords(); }, 220); });

// ---- usage ----
function loadUsage(){
  j("/api/usage").then(function(u){
    var b = u.budget;
    var pct = b.monthly > 0 ? Math.min(100, Math.round((b.spent / b.monthly) * 100)) : 0;
    var bar = b.monthly > 0 ? '<div class="bar"><i style="width:' + pct + '%;' + (pct >= 80 ? "background:linear-gradient(90deg,var(--red),#ff8a7a);" : "") + '"></i></div><p class=muted style="margin:9px 0 0">' + money(b.spent) + " / " + money(b.monthly) + " (" + pct + "%)</p>" : '<p class="muted" style="margin-top:12px">No budget set — spend is unlimited.</p>';
    el("usageCard").innerHTML =
      "<h3>Spend</h3><div class=grid>" +
      stat("This month", u.month.calls + " calls", money(u.month.cost)) +
      stat("All time", u.all.calls + " calls", money(u.all.cost)) +
      "</div>" + bar;
    el("budgetInput").value = b.monthly || 0;
    var rows = u.recent || [];
    el("recent").innerHTML = rows.length ? ("<table><tr><th>when</th><th>model</th><th>in</th><th>out</th><th>cost</th></tr>" + rows.map(function(r){
      return "<tr><td>" + esc((r.createdAt||"").slice(0,16).replace("T"," ")) + "</td><td>" + esc(r.model) + "</td><td>" + (r.input||0) + "</td><td>" + (r.output||0) + "</td><td>" + money(r.cost||0) + "</td></tr>";
    }).join("") + "</table>") : '<p class="muted">No calls yet.</p>';
  });
}
function stat(label, a, b){ return '<div class="stat"><div class="lbl">' + esc(label) + '</div><div class="big">' + esc(b) + '</div><div class="muted">' + esc(a) + "</div></div>"; }
function money(n){ n = Number(n) || 0; return "$" + (n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)); }
el("budgetBtn").onclick = function(){
  api("/api/config", { method:"POST", body: JSON.stringify({ path:"budget.monthly", value: el("budgetInput").value }) }).then(function(){ toast("Budget updated"); loadUsage(); loadState(); });
};

// ---- boot ----
var oauthResult = new URLSearchParams(location.search).get("oauth");
if(oauthResult){
  try { history.replaceState({}, "", "/"); } catch(e){}
}
loadState().then(function(){
  renderPills();
  loadWorkspaces();
  el("msg").focus();
  if(oauthResult){ showTab("integrations"); toast(oauthResult === "ok" ? "Integration connected \\u2713" : "OAuth " + oauthResult, oauthResult !== "ok"); }
  else {
    var t; try { t = localStorage.getItem("afax_tab"); } catch(e){}
    if(t && t !== "chat" && TABS.indexOf(t) >= 0) showTab(t);
  }
});
</script>
</body>
</html>`;
