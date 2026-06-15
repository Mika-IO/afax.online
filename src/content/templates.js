// Premium HTML/CSS templates rendered to PNG/MP4 via headless Chromium. Real
// gradients, glow, glass, grain and web fonts — what makes assets look premium
// instead of flat. One shell, several piece types.

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">';

const GRAIN =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter>" +
  "<rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/></svg>";

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Shared shell: gradient + glow + grain + the brand's colors as CSS vars.
function shell(w, h, body, css, brand, { animate = false } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--accent:${brand.accent};--accent2:${brand.accent2};--bg:${brand.bg};--ink:${brand.ink};--dim:${brand.dim}}
html,body{width:${w}px;height:${h}px;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:var(--ink)}
.stage{position:relative;width:${w}px;height:${h}px;background:
  radial-gradient(120% 80% at 100% 0%, color-mix(in srgb,var(--accent) 26%, transparent), transparent 60%),
  radial-gradient(120% 90% at 0% 100%, color-mix(in srgb,var(--accent2) 18%, transparent), transparent 55%),
  var(--bg);overflow:hidden}
.glow{position:absolute;width:60%;height:40%;border-radius:50%;filter:blur(90px);
  background:radial-gradient(circle,var(--accent),transparent 70%);opacity:.5;top:-8%;right:-10%${animate ? ';animation:float 6s ease-in-out infinite alternate' : ''}}
.grain{position:absolute;inset:0;background-image:url("${GRAIN}");background-size:180px;opacity:.05;mix-blend-mode:overlay;pointer-events:none;z-index:9}
.disp{font-family:"Space Grotesk",Inter,sans-serif}
.handle{position:absolute;left:64px;bottom:56px;color:var(--dim);font-size:30px;font-weight:600;letter-spacing:.5px}
.mark{position:absolute;right:64px;bottom:56px;color:var(--accent);font-weight:800;letter-spacing:3px;font-size:26px}
@keyframes float{to{transform:translate(-30px,30px) scale(1.1)}}
@keyframes rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes grad{to{filter:hue-rotate(18deg)}}
${animate ? '.stage{animation:grad 7s ease-in-out infinite alternate}.a1{animation:rise .8s ease both}.a2{animation:rise .8s .2s ease both}.a3{animation:rise .8s .4s ease both}' : ''}
${css}
</style></head><body><div class="stage"><div class="glow"></div>${body}<div class="grain"></div></div></body></html>`;
}

// ---- carousel ---------------------------------------------------------------
export function carousel(spec, brand) {
  const slides = spec.slides || [];
  let n = 0;
  return slides.map((s, i) => {
    const dots = slides.map((_, k) => `<i style="width:10px;height:10px;border-radius:50%;background:${k === i ? 'var(--accent)' : 'rgba(255,255,255,.2)'}"></i>`).join('');
    const dotsBar = `<div style="position:absolute;left:64px;top:56px;display:flex;gap:8px">${dots}</div>`;
    if (s.kind === 'cover' || i === 0 && !s.kind) {
      return shell(brand._w, brand._h,
        `${dotsBar}
         <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 64px">
           <div class="disp" style="font-size:84px;font-weight:700;line-height:1.05;letter-spacing:-1.5px">${esc(s.title)}</div>
           ${s.body ? `<div style="margin-top:26px;font-size:34px;line-height:1.4;color:var(--dim);max-width:84%">${esc(s.body)}</div>` : ''}
           <div style="margin-top:40px;color:var(--accent);font-weight:600;font-size:28px">${esc(brand.t.swipe)} →</div>
         </div>
         <div class="handle">${esc(brand.handle)}</div><div class="mark">${esc(brand.name)}</div>`,
        '', brand);
    }
    n += 1;
    return shell(brand._w, brand._h,
      `${dotsBar}
       <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 64px">
         <div class="disp" style="font-size:120px;font-weight:700;color:var(--accent);line-height:1">${String(n).padStart(2, '0')}</div>
         <div class="disp" style="margin-top:14px;font-size:64px;font-weight:700;line-height:1.1;letter-spacing:-1px">${esc(s.title)}</div>
         ${s.body ? `<div style="margin-top:24px;font-size:36px;line-height:1.45;color:var(--dim)">${esc(s.body)}</div>` : ''}
       </div>
       <div class="handle">${esc(brand.handle)}</div><div class="mark">${esc(brand.name)}</div>`,
      '', brand);
  });
}

// ---- meme / statement -------------------------------------------------------
export function meme(spec, brand) {
  const body = `
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 90px;text-align:center">
      <div class="disp" style="font-size:96px;font-weight:700;line-height:1.1;letter-spacing:-1.5px">${esc(spec.text || spec.title || '')}</div>
    </div>
    ${spec.sub ? `<div style="position:absolute;left:0;right:0;bottom:150px;text-align:center;color:var(--dim);font-size:34px">${esc(spec.sub)}</div>` : ''}
    <div class="handle">${esc(brand.handle)}</div><div class="mark">${esc(brand.name)}</div>`;
  return shell(brand._w, brand._h, body, '', brand);
}

// ---- poster -----------------------------------------------------------------
export function poster(spec, brand, opts = {}) {
  const body = `
    <div class="${opts.animate ? '' : ''}" style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 72px">
      ${spec.eyebrow ? `<div class="${opts.animate ? 'a1' : ''}" style="color:var(--accent);font-weight:700;letter-spacing:3px;text-transform:uppercase;font-size:28px">${esc(spec.eyebrow)}</div>` : ''}
      <div class="disp ${opts.animate ? 'a2' : ''}" style="margin-top:18px;font-size:104px;font-weight:700;line-height:1.04;letter-spacing:-2px">${esc(spec.title || '')}</div>
      ${spec.subtitle ? `<div class="${opts.animate ? 'a3' : ''}" style="margin-top:30px;font-size:38px;line-height:1.4;color:var(--dim);max-width:88%">${esc(spec.subtitle)}</div>` : ''}
      ${spec.cta ? `<div class="${opts.animate ? 'a3' : ''}" style="margin-top:48px"><span style="display:inline-block;background:linear-gradient(180deg,var(--accent),var(--accent2));color:#23120a;font-weight:800;font-size:34px;padding:18px 36px;border-radius:16px">${esc(spec.cta)}</span></div>` : ''}
    </div>
    <div class="handle">${esc(brand.handle)}</div><div class="mark">${esc(brand.name)}</div>`;
  return shell(brand._w, brand._h, body, '', brand, { animate: !!opts.animate });
}

// ---- motion (animated poster for video) -------------------------------------
export function motion(spec, brand) {
  return poster(spec, brand, { animate: true });
}
