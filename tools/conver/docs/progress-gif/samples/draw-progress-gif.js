#!/usr/bin/env node
/*
 * draw-progress-gif.js  (zero dependencies, CJS/ESM neutral: no require/import)
 * Usage: node draw-progress-gif.js -t <workspace> [--no-open] [--no-gif] [--no-source-scan]
 *                                   [--frames N] [--fps N] [--auto-download] [--dry-run]
 * Writes <target>/progress-gif/YYYYMMDDhhmmss.{html,gif}. Workspace is read-only.
 * Exit: 0 ok / 2 not a completed conver workspace / 3 render failure / 1 usage.
 */
'use strict';

/* ======================= PURE ENGINE (runs in Node and in the browser) ======================= */
function makeEngine() {
  const STAGES = ['educe','explain','grill','smooth','graphify','boundify','split','make','plan','start','review','resolve','consolidate','find','crystalize','drill'];
  const WEIGHT = [3,3,6,3,6,6,6,6,6,14,8,6,3,6,6,4];
  const ACT    = [0,0,0,0,1,1,1,2,2,2,2,3,3,3,3,3];
  const ACOL   = [[111,211,199],[180,156,255],[255,140,70],[242,217,160],[255,46,77]];
  const W = 640, H = 360, ND_TARGET = 110;
  const BG = [6,8,12];

  /* ---------- 5x7 bitmap font (rows are 5-bit masks; lowercase drawn as uppercase) ---------- */
  const FONT = {
    'A':[14,17,17,31,17,17,17],'B':[30,17,17,30,17,17,30],'C':[14,17,16,16,16,17,14],'D':[30,17,17,17,17,17,30],
    'E':[31,16,16,30,16,16,31],'F':[31,16,16,30,16,16,16],'G':[14,17,16,23,17,17,15],'H':[17,17,17,31,17,17,17],
    'I':[14,4,4,4,4,4,14],'J':[7,2,2,2,2,18,12],'K':[17,18,20,24,20,18,17],'L':[16,16,16,16,16,16,31],
    'M':[17,27,21,21,17,17,17],'N':[17,17,25,21,19,17,17],'O':[14,17,17,17,17,17,14],'P':[30,17,17,30,16,16,16],
    'Q':[14,17,17,17,21,18,13],'R':[30,17,17,30,20,18,17],'S':[15,16,16,14,1,1,30],'T':[31,4,4,4,4,4,4],
    'U':[17,17,17,17,17,17,14],'V':[17,17,17,17,17,10,4],'W':[17,17,17,21,21,21,10],'X':[17,17,10,4,10,17,17],
    'Y':[17,17,17,10,4,4,4],'Z':[31,1,2,4,8,16,31],
    '0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],'3':[31,2,4,2,1,17,14],
    '4':[2,6,10,18,31,2,2],'5':[31,16,30,1,1,17,14],'6':[6,8,16,30,17,17,14],'7':[31,1,2,4,8,8,8],
    '8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,2,12],
    '/':[1,1,2,4,8,16,16],':':[0,4,0,0,0,4,0],'-':[0,0,0,31,0,0,0],'%':[24,25,2,4,8,19,3],'.':[0,0,0,0,0,12,12],' ':[0,0,0,0,0,0,0]
  };

  /* ---------- palette (<=256 entries) + 15-bit nearest LUT ---------- */
  const PAL = [];
  PAL.push(BG.slice());
  for (let k = 1; k < 24; k++) { const g = Math.round(k * 255 / 23); PAL.push([g, g, g]); }
  for (let g = 8; g <= 128; g += 8) PAL.push([Math.round(g * 0.8), Math.round(g * 0.9), g]);
  for (const c of ACOL) {
    for (let k = 1; k <= 24; k++) PAL.push([Math.round(c[0]*k/24), Math.round(c[1]*k/24), Math.round(c[2]*k/24)]);
    for (let k = 1; k <= 10; k++) PAL.push([Math.round(c[0]+(255-c[0])*k/11), Math.round(c[1]+(255-c[1])*k/11), Math.round(c[2]+(255-c[2])*k/11)]);
  }
  while (PAL.length < 256) PAL.push([255, 255, 255]);
  const LUT = new Uint8Array(32768);
  for (let i = 0; i < 32768; i++) {
    const r = ((i >> 10) & 31) * 8 + 4, g = ((i >> 5) & 31) * 8 + 4, b = (i & 31) * 8 + 4;
    let best = 0, bd = 1e9;
    for (let p = 0; p < PAL.length; p++) {
      const dr = PAL[p][0]-r, dg = PAL[p][1]-g, db = PAL[p][2]-b, d = dr*dr*2 + dg*dg*4 + db*db*3;
      if (d < bd) { bd = d; best = p; }
    }
    LUT[i] = best;
  }

  /* ---------- timeline -> frames ---------- */
  function buildFrames(model, F, holdStart, holdEnd) {
    const N = model.packages.length, S = 16;
    const ev = model.events.map((e, i) => Object.assign({ seq: i }, e));
    const endT = []; for (let p = 0; p < N; p++) endT.push(new Array(S).fill(0));
    const byStage = []; for (let s = 0; s < S; s++) byStage.push([]);
    ev.forEach(e => { if (e.pkg >= 0) byStage[e.stage].push(e); });
    for (let s = 0; s < S; s++) {
      for (const e of byStage[s]) {
        if (s >= 1 && s <= 6 && s !== 3) {
          let prev = 0; for (let q = s - 1; q >= 1; q--) { if (q !== 3 && endT[e.pkg][q] > 0) { prev = endT[e.pkg][q]; break; } }
          if (e.t < prev) e.t = prev;
        }
        if (e.t > endT[e.pkg][s]) endT[e.pkg][s] = e.t;
      }
    }
    ev.sort((a, b) => a.t - b.t || a.stage - b.stage || a.pkg - b.pkg || a.seq - b.seq);
    const cntS = new Array(S).fill(0); ev.forEach(e => cntS[e.stage]++);
    const cw = []; let tw = 0;
    for (const e of ev) { tw += (1 + Math.log(1 + cntS[e.stage])) / cntS[e.stage]; cw.push(tw); }
    const frames = [], pi = new Float32Array(N * S);
    let ptr = 0;
    const span = Math.max(1, F - 1 - holdStart - holdEnd);
    for (let f = 0; f < F; f++) {
      const u = Math.min(1, Math.max(0, (f - holdStart) / span));
      const target = u * tw;
      const active = new Set(); let rootPulse = false, lastStage = -1;
      let np = ptr;
      if (u >= 1) np = ev.length; else while (np < ev.length && cw[np] <= target) np++;
      for (let i = ptr; i < np; i++) {
        const e = ev[i];
        if (e.pkg < 0) { for (let p = 0; p < N; p++) pi[p*S+e.stage] = Math.min(1, pi[p*S+e.stage] + e.inc); rootPulse = true; active.add(-1 * 100 - e.stage); }
        else { pi[e.pkg*S+e.stage] = Math.min(1, pi[e.pkg*S+e.stage] + e.inc); active.add(e.pkg * S + e.stage); }
        lastStage = e.stage;
      }
      ptr = np;
      const cur = ptr > 0 ? ev[ptr - 1] : ev[0];
      frames.push({ ptr, t: cur ? cur.t : 0, prec: cur ? cur.prec : 'ms', stage: ptr > 0 ? lastStage >= 0 ? lastStage : frames.length ? frames[frames.length-1].stage : -1 : -1,
        active: Array.from(active), rootPulse, pi: Float32Array.from(pi) });
    }
    return frames;
  }

  /* ---------- layout ---------- */
  const FX = 12, FY = 48, FW = 420, FH = 300;
  function layout(N) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(N * FW / FH))), rows = Math.ceil(N / cols);
    const cell = Math.min(FW / cols, FH / rows);
    const ox = FX + (FW - cell * cols) / 2, oy = FY + (FH - cell * rows) / 2;
    const cs = [];
    for (let i = 0; i < N; i++) cs.push([ox + (i % cols + 0.5) * cell, oy + (Math.floor(i / cols) + 0.5) * cell]);
    return { cs, R: cell * 0.40 };
  }
  const SW = WEIGHT.reduce((a, b) => a + b, 0);
  const CNT = WEIGHT.map(w => Math.max(2, Math.round(w / SW * ND_TARGET)));
  const START = []; { let a = 0; for (const c of CNT) { START.push(a); a += c; } }
  const ND = CNT.reduce((a, b) => a + b, 0);
  const STG_OF = []; for (let s = 0; s < 16; s++) for (let i = 0; i < CNT[s]; i++) STG_OF.push([s, i]);

  /* ---------- raster primitives (RGB buffer) ---------- */
  function fillBg(buf) { for (let i = 0; i < buf.length; i += 3) { buf[i] = BG[0]; buf[i+1] = BG[1]; buf[i+2] = BG[2]; } }
  function blendPx(buf, x, y, c, a) {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const o = (y * W + x) * 3;
    buf[o] += (c[0] - buf[o]) * a; buf[o+1] += (c[1] - buf[o+1]) * a; buf[o+2] += (c[2] - buf[o+2]) * a;
  }
  function addPx(buf, x, y, c, a) {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const o = (y * W + x) * 3;
    buf[o] = Math.min(255, buf[o] + c[0] * a); buf[o+1] = Math.min(255, buf[o+1] + c[1] * a); buf[o+2] = Math.min(255, buf[o+2] + c[2] * a);
  }
  function disc(buf, cx, cy, r, c, a) {
    const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1), y0 = Math.floor(cy - r - 1), y1 = Math.ceil(cy + r + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy), cov = Math.min(1, Math.max(0, r + 0.5 - d));
      if (cov > 0) blendPx(buf, x, y, c, cov * a);
    }
  }
  function ring(buf, cx, cy, r, c, a) {
    const x0 = Math.floor(cx - r - 2), x1 = Math.ceil(cx + r + 2), y0 = Math.floor(cy - r - 2), y1 = Math.ceil(cy + r + 2);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r), cov = Math.min(1, Math.max(0, 1.1 - d));
      if (cov > 0) blendPx(buf, x, y, c, cov * a);
    }
  }
  function glow(buf, cx, cy, r, c, a) {
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d < 1) { const k = (1 - d) * (1 - d); addPx(buf, x, y, c, a * k); }
    }
  }
  function rect(buf, x, y, w, h, c, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) blendPx(buf, (x + i) | 0, (y + j) | 0, c, a); }
  function text(buf, str, x, y, sc, c, a) {
    str = String(str).toUpperCase();
    for (let k = 0; k < str.length; k++) {
      const g = FONT[str[k]] || FONT[' '];
      for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (g[r] & (16 >> b)) rect(buf, x + k * 6 * sc + b * sc, y + r * sc, sc, sc, c, a);
    }
  }
  const p2 = n => (n < 10 ? '0' : '') + n;
  function fmtDate(t, prec) {
    const d = new Date(t);
    return p2(d.getMonth() + 1) + '/' + p2(d.getDate()) + ' ' + (prec === 'day' ? '--:--' : p2(d.getHours()) + ':' + p2(d.getMinutes()));
  }
  function dens(pi, p) { let a = 0; for (let s = 0; s < 16; s++) a += WEIGHT[s] * pi[p * 16 + s]; return a / SW; }

  /* ---------- frame renderer ---------- */
  function render(buf, model, fr, k) {
    const N = model.packages.length, L = layout(N), pi = fr.pi, act = new Set(fr.active);
    fillBg(buf);
    const white = [255, 255, 255], gray = [150, 160, 175];
    text(buf, fmtDate(fr.t, fr.prec), 12, 14, 3, white, 0.92);
    if (fr.stage >= 0) text(buf, STAGES[fr.stage], 232, 14, 3, ACOL[ACT[fr.stage]], 1);
    let gd = 0; for (let p = 0; p < N; p++) gd += dens(pi, p); gd /= Math.max(1, N);
    text(buf, Math.round(gd * 100) + '%', 622 - 6 * 3 * (Math.round(gd * 100) + '%').length, 14, 3, gray, 0.8);
    const pulse = 0.5 + 0.5 * Math.sin(k * 0.9);
    for (let p = 0; p < N; p++) {
      const cx = L.cs[p][0], cy = L.cs[p][1], R = L.R, d = dens(pi, p);
      let top = -1; for (let s = 15; s >= 0; s--) if (pi[p*16+s] > 0.001) { top = s; break; }
      const hue = ACOL[top >= 0 ? ACT[top] : 0];
      if (d > 0.01) glow(buf, cx, cy, R * 1.25, hue, 0.04 + 0.34 * d * d + 0.10 * d);
      ring(buf, cx, cy, R * 1.05, [60, 70, 85], 0.55);
      const rc = R * (1 - 0.30 * d);
      for (let j = 0; j < ND; j++) {
        const s = STG_OF[j][0], idx = STG_OF[j][1];
        const ang = j * 2.39996323, rr = Math.sqrt((j + 0.5) / ND) * rc;
        const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
        const lit = Math.min(1, Math.max(0, pi[p*16+s] * CNT[s] - idx));
        const flash = act.has(p * 16 + s) || act.has(-100 - s);
        if (lit <= 0) { disc(buf, x, y, 0.9, [34, 42, 54], 0.9); continue; }
        const c = ACOL[ACT[s]], mix = 0.25 + 0.35 * d + (flash ? 0.45 : 0);
        const col = [c[0] + (255 - c[0]) * mix * 0.6, c[1] + (255 - c[1]) * mix * 0.6, c[2] + (255 - c[2]) * mix * 0.6];
        disc(buf, x, y, 1.15 + 0.55 * lit + (flash ? 0.7 : 0), col, 0.55 + 0.45 * lit);
      }
      let hit = false; for (let s = 0; s < 16; s++) if (act.has(p * 16 + s)) hit = true;
      if (hit) ring(buf, cx, cy, R * 1.16, white, 0.55 + 0.4 * pulse);
    }
    for (let s = 0; s < 16; s++) {
      const y = 52 + s * 19, c = ACOL[ACT[s]];
      let g = 0; for (let p = 0; p < N; p++) g += pi[p * 16 + s]; g /= Math.max(1, N);
      let on = false; for (let p = -1; p < N; p++) if (act.has(p < 0 ? -100 - s : p * 16 + s)) on = true;
      const cur = fr.stage === s;
      if (cur || on) rect(buf, 444, y - 3, 188, 18, c, cur ? 0.22 : 0.12);
      text(buf, STAGES[s], 448, y, 2, c, cur || on ? 1 : 0.62);
      rect(buf, 586, y + 3, 42, 6, [40, 48, 60], 1);
      rect(buf, 586, y + 3, Math.round(42 * g), 6, c, cur || on ? 1 : 0.8);
    }
  }
  function quantize(buf, out) {
    for (let i = 0, j = 0; i < buf.length; i += 3, j++) {
      const r = buf[i] > 255 ? 255 : buf[i], g = buf[i+1] > 255 ? 255 : buf[i+1], b = buf[i+2] > 255 ? 255 : buf[i+2];
      out[j] = LUT[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
    }
  }
  function toRGBA(buf, rgba) { for (let i = 0, j = 0; i < buf.length; i += 3, j += 4) { rgba[j] = buf[i]; rgba[j+1] = buf[i+1]; rgba[j+2] = buf[i+2]; rgba[j+3] = 255; } }

  /* ---------- GIF89a encoder (global palette, bbox-delta frames, infinite loop) ---------- */
  const TABLE = new Int32Array(4096 * 256);
  function lzw(pix, out) {
    const CLEAR = 256, EOI = 257; let next = 258, size = 9, cur = 0, nb = 0;
    const emit = (code) => { cur |= code << nb; nb += size; while (nb >= 8) { out.push(cur & 255); cur >>= 8; nb -= 8; } };
    TABLE.fill(0); emit(CLEAR);
    let prefix = pix[0];
    for (let i = 1; i < pix.length; i++) {
      const c = pix[i], key = prefix * 256 + c, code = TABLE[key];
      if (code) { prefix = code; continue; }
      emit(prefix);
      if (next === 4096) { emit(CLEAR); next = 258; size = 9; TABLE.fill(0); }
      else { if (next >= (1 << size)) size++; TABLE[key] = next++; }
      prefix = c;
    }
    emit(prefix); emit(EOI);
    if (nb > 0) out.push(cur & 255);
  }
  function encodeGif(frameCount, delayCs, getIdx) {
    const o = [];
    const w16 = v => { o.push(v & 255, (v >> 8) & 255); };
    'GIF89a'.split('').forEach(ch => o.push(ch.charCodeAt(0)));
    w16(W); w16(H); o.push(0xF7, 0, 0);
    for (let i = 0; i < 256; i++) o.push(PAL[i][0], PAL[i][1], PAL[i][2]);
    o.push(0x21, 0xFF, 11); 'NETSCAPE2.0'.split('').forEach(ch => o.push(ch.charCodeAt(0))); o.push(3, 1, 0, 0, 0);
    let prev = null;
    for (let k = 0; k < frameCount; k++) {
      const idx = getIdx(k);
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      if (!prev) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
      else for (let y = 0; y < H; y++) { const row = y * W; for (let x = 0; x < W; x++) if (idx[row + x] !== prev[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, pix = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) pix[y * bw + x] = idx[(y0 + y) * W + x0 + x];
      o.push(0x21, 0xF9, 4, 0x04); w16(delayCs); o.push(0, 0);
      o.push(0x2C); w16(x0); w16(y0); w16(bw); w16(bh); o.push(0);
      o.push(8);
      const data = []; lzw(pix, data);
      for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); o.push(n); for (let j = 0; j < n; j++) o.push(data[i + j]); }
      o.push(0);
      prev = Uint8Array.from(idx);
    }
    o.push(0x3B);
    return Uint8Array.from(o);
  }
  return { STAGES, W, H, buildFrames, render, quantize, toRGBA, encodeGif, fmtDate };
}

/* ======================= NODE SIDE: acceptance, discovery, events ======================= */
const fs = process.getBuiltinModule('fs');
const path = process.getBuiltinModule('path');
const os = process.getBuiltinModule('os');
const cp = process.getBuiltinModule('child_process');

const warnings = [];
const warn = m => { if (!warnings.includes(m)) warnings.push(m); };
const expand = p => (typeof p === 'string' && (p === '~' || p.startsWith('~/'))) ? path.join(os.homedir(), p.slice(1)) : p;
const J = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const T = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } };
const ex = p => { try { return fs.existsSync(p); } catch (e) { return false; } };
const mt = p => { try { return fs.statSync(p).mtimeMs; } catch (e) { return null; } };
const ls = d => { try { return fs.readdirSync(d); } catch (e) { return []; } };
const DECOY = /(\.delta\.json$|\.bak|\.p22-ja\.bak$)/;

function parseT(s) {
  if (typeof s !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return { t: new Date(y, m - 1, d).getTime(), prec: 'day' }; }
  const t = Date.parse(s); return isNaN(t) ? null : { t, prec: 'ms' };
}
function stampT(s) { // YYYYMMDDhhmmss (local)
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s); if (!m) return null;
  return { t: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(), prec: 'ms' };
}
function runIdT(id) {
  if (typeof id !== 'string') return null; const head = id.split('-')[0]; let ms = null;
  if (/^\d{19,}$/.test(head)) ms = Number(head.slice(0, 13)); else if (/^\d{13}$/.test(head)) ms = Number(head);
  if (ms === null || Math.abs(ms - Date.now()) > 2 * 365 * 864e5) return null; return { t: ms, prec: 'ms' };
}
const mtT = p => { const m = mt(p); return m === null ? null : { t: m, prec: 'ms', mtime: true }; };
function pick(dir, canon, suffix) {
  if (ex(path.join(dir, canon))) return path.join(dir, canon);
  const c = ls(dir).filter(n => suffix.test(n) && !DECOY.test(n));
  if (c.length === 1) return path.join(dir, c[0]);
  if (c.length > 1) warn('ambiguous ' + suffix + ' in ' + dir + ' (ignored)');
  return null;
}
const sha = p => { try { return process.getBuiltinModule('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (e) { return null; } };

function fail(code, msg) { process.stderr.write('ERROR: ' + msg + '\n'); process.exit(code); }

function validate(root) {
  const tp = path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), ap = path.join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
  for (const [p, n] of [[tp, 'WORKSPACIFY-TREE-MANIFEST.json'], [ap, 'WORKSPACIFY-ALLOCATE-MANIFEST.json']]) {
    if (!ex(p)) {
      let anc = path.dirname(root), hint = '';
      for (let i = 0; i < 6 && anc !== path.dirname(anc); i++, anc = path.dirname(anc)) if (ex(path.join(anc, n))) { hint = ' ' + n + ' exists in ancestor ' + anc + ' (likely the workspace root).'; break; }
      fail(2, 'missing ' + n + ' in ' + root + '. Run /workspacify-tree then /workspacify-allocate in this directory first.' + hint);
    }
  }
  const tree = J(tp), alloc = J(ap);
  if (!tree) fail(2, 'WORKSPACIFY-TREE-MANIFEST.json is not valid JSON');
  if (!alloc) fail(2, 'WORKSPACIFY-ALLOCATE-MANIFEST.json is not valid JSON');
  if (tree.artifact_kind !== 'workspacify-tree-manifest') fail(2, 'tree artifact_kind is "' + tree.artifact_kind + '"');
  if (alloc.artifact_kind !== 'workspacify-allocate-manifest') fail(2, 'allocate artifact_kind is "' + alloc.artifact_kind + '"');
  if (tree.status !== 'COMPLETE') fail(2, 'tree status is "' + tree.status + '" (need COMPLETE)');
  if (alloc.status !== 'COMPLETE' || alloc.completion_decision !== 'COMPLETE') fail(2, 'allocate status/completion_decision is "' + alloc.status + '"/"' + alloc.completion_decision + '" (need COMPLETE/COMPLETE)');
  if (alloc.semantic_review && alloc.semantic_review.status !== 'APPROVED') fail(2, 'allocate semantic_review.status is "' + alloc.semantic_review.status + '" (need APPROVED)');
  if (!alloc.semantic_review) warn('allocate has no semantic_review (older manifest)');
  const h1 = alloc.input_tree_manifest && alloc.input_tree_manifest.hash, h2 = tree.integrity && tree.integrity.manifest_hash;
  if (!h1 || h1 !== h2) fail(2, 'hash chain mismatch: allocate.input_tree_manifest.hash=' + h1 + ' tree.integrity.manifest_hash=' + h2);
  const s1 = alloc.input_tree_manifest.spec && alloc.input_tree_manifest.spec.sha256, s2 = tree.input && tree.input.source_hash;
  if (s1 && s2 && s1 !== s2) fail(2, 'spec hash mismatch: ' + s1 + ' vs ' + s2);
  const pk = tree.workspace && tree.workspace.packages;
  if (!Array.isArray(pk) || !pk.length) fail(2, 'tree.workspace.packages is empty');
  return { tree, alloc };
}

function packagesOf(root, tree, alloc) {
  const seen = new Set(), pk = [];
  for (const p of tree.workspace.packages) {
    if (seen.has(p.id)) { warn('duplicate package id ' + p.id + ' ignored'); continue; }
    seen.add(p.id); pk.push({ id: p.id, name: p.name || p.id, path: p.path, dir: path.resolve(root, expand(p.path || '.')), layer: p.layer });
  }
  const serial = alloc.implementation_order && alloc.implementation_order.serial;
  if (Array.isArray(serial)) {
    const rank = new Map(serial.map((x, i) => [String((x && (x.package || x.id)) || x), i]));
    pk.sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e6) - (rank.has(b.id) ? rank.get(b.id) : 1e6));
  }
  return pk;
}

const SKIP = new Set(['node_modules', '.git', 'target', 'dist', 'archive', 'progress-gif', 'vendor', '.claude', 'fixtures']);
const CODE = /\.(rs|go|ts|tsx|js|jsx|cjs|mjs|vue|py|java|kt|swift|c|cpp|h|hpp|rb|php|cs)$/;
const STUB = /^\s*\/\/\s*\[::STUB::\]\s+(P[A-Z0-9]+-\d+|MUST\s+RESOLVE):\s*\S/;
function scanStubs(dir, others) {
  let n = 0;
  (function walk(d) {
    for (const name of ls(d)) {
      if (name.startsWith('.') || SKIP.has(name)) continue;
      const full = path.join(d, name); let st; try { st = fs.lstatSync(full); } catch (e) { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { if (others.has(full)) continue; walk(full); }
      else if (CODE.test(name) && st.size < 2e6) { const t = T(full); if (t) for (const line of t.split('\n')) if (STUB.test(line)) n++; }
    }
  })(dir);
  return n;
}

function build(root, tree, alloc, opts) {
  const pk = packagesOf(root, tree, alloc), events = [];
  const add = (stage, pkg, tp, inc) => { if (!tp || !(inc > 0)) return; events.push({ t: tp.t, prec: tp.prec, stage, pkg, inc }); };
  const dirs = new Set(pk.map(p => p.dir));

  // root: educe
  const seqs = ls(root).filter(n => /-sequences\.json$/.test(n) && !DECOY.test(n));
  const est = J(path.join(root, 'educe-sequences', 'status.json'));
  if (seqs.length !== 1) warn('root *-sequences.json count is ' + seqs.length + ' (educe not drawn)');
  else if (est && Array.isArray(est.phases)) {
    const done = est.phases.filter(p => p.status === 'done').length / 18;
    add(0, -1, parseT(est.generationStartedAt), 0.02);
    add(0, -1, mtT(path.join(root, seqs[0])), Math.max(0, done - 0.02));
  }
  // root: smooth
  const sst = J(path.join(root, 'smooth-sequences', 'status.json')), cert = J(path.join(root, 'smooth-sequences', 'COMPLETION-CERTIFICATE.json'));
  if (sst) {
    const v = sst.verdict || {}, pass = v.exitCode === 0 && v.findings === 0 && v.blocked === 0 && (v.readings || 0) === 0 && (v.withheld || 0) === 0;
    let frac = 0;
    if (cert && cert.obligations && cert.obligations.total > 0) frac = cert.obligations.closed / cert.obligations.total;
    else if (pass) frac = 1;
    if (!pass) frac = Math.min(frac, 0.9);
    add(3, -1, parseT(sst.measuredAt) || mtT(path.join(root, 'smooth-sequences', 'status.json')), frac);
  }

  pk.forEach((p, i) => {
    const d = p.dir, others = new Set([...dirs].filter(x => x !== d && x.startsWith(d + path.sep)));
    // explain
    const info = path.join(d, 'INFO-RFC-SEED.md'), exp = path.join(d, 'EXPLAIN-RFC-SEED.md');
    if (ex(info)) add(1, i, mtT(info), 0.35);
    if (ex(exp)) {
      let secs = 0; const m = /<!-- explain-seed:facts\s*([\s\S]*?)-->/.exec(T(exp) || '');
      if (m) { try { secs = Object.keys(JSON.parse(m[1]).sections || {}).length; } catch (e) { warn('bad facts block: ' + p.id); } }
      add(1, i, mtT(exp), 0.35 + 0.3 * Math.min(1, secs / 7));
    }
    // grill
    const dt = J(path.join(d, 'DesignTree.json')), gs = J(path.join(d, 'Status.json'));
    if (dt && Array.isArray(dt.nodes)) {
      const nodes = []; (function w(a) { for (const n of a) { nodes.push(n); if (Array.isArray(n.children)) w(n.children); } })(dt.nodes);
      const fallback = parseT(dt.updatedAt) || mtT(path.join(d, 'DesignTree.json'));
      for (const n of nodes) if (n.status === 'resolved') {
        let best = null; for (const q of n.questions || []) { const x = parseT(q.resolvedAt); if (x && (!best || x.t > best.t)) best = x; }
        add(2, i, best || fallback, 0.9 / nodes.length);
      }
      if (gs && gs.state === 'DONE') add(2, i, parseT(gs.completedAt) || parseT(gs.updatedAt) || fallback, 0.1);
    }
    // graphify / boundify / split
    const gp = pick(d, 'RFC-GRAPH.json', /-GRAPH\.json$/), gst = pick(d, 'RFC-GRAPHIFY-Status.json', /-GRAPHIFY-Status\.json$/);
    const stepFrac = (st, keys) => st && st.steps ? keys.filter(k => st.steps[k] === 'done').length / keys.length : 0;
    if (gp) { const st = J(gst || ''); add(4, i, (st && runIdT(st.runId)) || mtT(gp), Math.max(0.25, stepFrac(st, ['0','1','2','3','4','5']))); }
    const dp = pick(d, 'RFC-Dirs-Tree.json', /-Dirs-Tree\.json$/), dst = pick(d, 'RFC-BOUNDIFY-Status.json', /-BOUNDIFY-Status\.json$/);
    if (dp) { const doc = J(dp), st = J(dst || ''); add(5, i, parseT(doc && doc.generatedAt) || (st && runIdT(st.runId)) || mtT(dp), Math.max(0.25, stepFrac(st, ['0','1','2','3']))); }
    const tp = path.join(d, 'Tickets.json'), sp = pick(d, 'RFC-SPLIT-Status.json', /-SPLIT-Status\.json$/);
    if (p.path === '.' ) { /* root package: Tickets.json is legitimate */ }
    const tdoc = ex(tp) ? J(tp) : null;
    if (tdoc) {
      const st = J(sp || ''), keys = ['0-1','0-2','1','2','3','4-1','4-2','5-1','5-2','5-3','6'];
      add(6, i, (st && runIdT(st.runId)) || parseT(tdoc.metadata && tdoc.metadata.generatedAt) || mtT(tp), st ? (st.steps && st.steps['6'] === 'done' ? 1 : Math.max(0.25, stepFrac(st, keys))) : 0.25);
      const tk = []; for (const ph of tdoc.phases || []) for (const t of ph.tickets || []) tk.push(t);
      const rank = s => ({ made: 1, planned: 2, done: 3, remanded: 3, reviewed: 4 })[s] || (/^R[1-9]\d*$/.test(s || '') ? 4 : 0);
      const base = parseT(tdoc.metadata && tdoc.metadata.generatedAt) || mtT(tp), n = tk.length;
      for (const t of tk) {
        const r = rank(t.status), c = parseT(t.created_at) || base, u = parseT(t.updated_at) || c, s0 = parseT(t.startedAt), e0 = parseT(t.completedAt);
        if (r >= 1) add(7, i, c, 1 / n);
        if (r >= 2) add(8, i, r === 2 ? u : (s0 || c), 1 / n);
        if (r >= 3) add(9, i, s0 || u, 1 / n);
        if (r >= 4) add(10, i, e0 || u, 1 / n);
      }
      // resolve
      const mf = J(path.join(d, 'Malfeasance.json')), recs = (mf && mf.records) || [];
      const unresolved = opts.sourceScan ? scanStubs(d, others) : 0, total = recs.length + unresolved;
      for (const r of recs) if (r.status === 'resolved' || r.status === 'false_positive') add(11, i, parseT(r.resolved_at) || parseT(r.detected_at), 1 / total);
      // consolidate / find
      const mdir = path.join(d, 'manifests'), mans = ls(mdir).map(n => /^CONSOLIDATED-MANIFEST-(\d{14})\.json$/.exec(n)).filter(Boolean);
      const oms = [...ls(d), ...ls(path.join(d, 'omissions')).map(n => 'omissions/' + n)].map(n => /(?:^|\/)OMISSIONS-(\d{14})\.json$/.exec(n)).filter(Boolean).map(m => stampT(m[1])).filter(Boolean).sort((a, b) => a.t - b.t);
      let cons = 0;
      for (const m of mans) { add(12, i, stampT(m[1]), 0.5 / mans.length); cons = 0.5; }
      if (oms.length) { add(12, i, oms[0], 1 - cons); const pending = tk.some(t => t.status === 'remanded' || t.forNextRound); const f = pending ? 0.5 : 1; for (const o of oms) add(13, i, o, f / oms.length); }
    }
    // crystalize
    const cs = J(path.join(d, 'CRYSTALIZE-Status.json'));
    if (cs) {
      const steps = cs.steps ? Object.values(cs.steps).filter(v => v === 'done').length / 4 : 0, g = cs.grill || {};
      const nodes = (g.toc && g.toc.nodes) || [], secs = g.sections || [];
      const toc = nodes.length ? nodes.filter(n => n.status === 'confirmed').length / nodes.length : 0;
      const sec = secs.length ? secs.filter(s => s.state === 'complete' || s.state === 'residue').length / secs.length : 0;
      add(14, i, mtT(path.join(d, 'CRYSTALIZE-Status.json')), 0.5 * steps + 0.3 * toc + 0.2 * sec);
    }
    // drill
    const ds = J(path.join(d, 'drills', 'Status.json')), ddt = J(path.join(d, 'drills', 'DesignTree.json'));
    if (ds) {
      const m = /^1-(\d+)$/.exec(String(ds.currentStep || '')), frac = ds.state === 'DONE' ? 1 : m ? Math.min(1, Number(m[1]) / 12) : 0;
      const rs = []; if (ddt) (function w(a) { for (const n of a || []) { if (n.status === 'resolved') { let b = null; for (const q of n.questions || []) { const x = parseT(q.resolvedAt); if (x && (!b || x.t > b.t)) b = x; } rs.push(b); } w(n.children); } })(ddt.nodes);
      const fb = parseT(ds.updatedAt) || mtT(path.join(d, 'drills', 'Status.json'));
      if (rs.length) for (const r of rs) add(15, i, r || fb, frac / rs.length); else add(15, i, fb, frac);
    }
  });
  return { packages: pk.map(p => ({ id: p.id, name: p.name, path: p.path })), events };
}

/* ======================= CLI ======================= */
function parseArgs(a) {
  const o = { open: true, gif: true, sourceScan: true, frames: 120, fps: 10, auto: false, dry: false, target: null };
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x === '-t' || x === '--target') o.target = a[++i];
    else if (x === '--no-open') o.open = false; else if (x === '--no-gif') o.gif = false;
    else if (x === '--no-source-scan') o.sourceScan = false; else if (x === '--auto-download') o.auto = true;
    else if (x === '--dry-run') o.dry = true; else if (x === '--frames') o.frames = Math.max(20, Number(a[++i]) | 0);
    else if (x === '--fps') o.fps = Math.max(1, Math.min(25, Number(a[++i]) | 0));
    else fail(1, 'unknown argument ' + x + '\nusage: node draw-progress-gif.js -t <workspace> [--no-open] [--no-gif] [--no-source-scan] [--frames N] [--fps N] [--auto-download] [--dry-run]');
  }
  if (!o.target) fail(1, 'usage: node draw-progress-gif.js -t <workspace>');
  return o;
}
function stampNow(d) { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }

function htmlDoc(model, o) {
  const data = JSON.stringify({ model, frames: o.frames, fps: o.fps }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>conver progress</title>
<style>body{margin:0;background:#05070a;color:#9aa;font:14px system-ui;display:flex;flex-direction:column;align-items:center;padding:16px}
canvas{width:960px;max-width:96vw;image-rendering:pixelated;background:#05070a}button{margin:10px 6px;padding:8px 18px;background:#1b2430;color:#dfe;border:1px solid #345;border-radius:6px;cursor:pointer;font-size:14px}</style></head><body>
<canvas id="c" width="640" height="360"></canvas>
<div><button id="pp">一時停止</button><button id="dl">GIFをダウンロード</button><span id="msg"></span></div>
<script>
const ENG=(${makeEngine.toString()})();
const D=${data};
const frames=ENG.buildFrames(D.model,D.frames,4,12);
const cv=document.getElementById('c'),cx=cv.getContext('2d'),img=cx.createImageData(ENG.W,ENG.H),buf=new Float32Array(ENG.W*ENG.H*3);
let k=0,play=true,last=0;
function draw(i){ENG.render(buf,D.model,frames[i],i);ENG.toRGBA(buf,img.data);cx.putImageData(img,0,0);}
function loop(ts){if(play&&ts-last>=1000/D.fps){draw(k);k=(k+1)%frames.length;last=ts;}requestAnimationFrame(loop);}
requestAnimationFrame(loop);
document.getElementById('pp').onclick=e=>{play=!play;e.target.textContent=play?'一時停止':'再生';};
async function dl(){const m=document.getElementById('msg');m.textContent=' エンコード中...';await new Promise(r=>setTimeout(r,30));
 const idx=new Uint8Array(ENG.W*ENG.H),b=new Float32Array(ENG.W*ENG.H*3);
 const gif=ENG.encodeGif(frames.length,Math.round(100/D.fps),i=>{ENG.render(b,D.model,frames[i],i);ENG.quantize(b,idx);return idx;});
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([gif],{type:'image/gif'}));a.download=location.pathname.split('/').pop().replace(/\\.html$/,'')+'.gif';a.click();m.textContent=' 完了';}
document.getElementById('dl').onclick=dl;
if(location.hash==='#auto')dl();
</script></body></html>`;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const root = path.resolve(expand(o.target));
  if (!ex(root) || !fs.statSync(root).isDirectory()) fail(2, 'target is not a directory: ' + root);
  const { tree, alloc } = validate(root);
  const model = build(root, tree, alloc, o);
  if (!model.events.length) fail(3, 'no dated events found; nothing to draw');
  const ENG = makeEngine(), frames = ENG.buildFrames(model, o.frames, 4, 12);
  const outDir = path.join(root, 'progress-gif');
  const report = ['# draw-progress-gif', '', 'PASS: ' + root, '- packages: ' + model.packages.length, '- events: ' + model.events.length,
    '- range: ' + ENG.fmtDate(frames[0].t, frames[0].prec) + ' -> ' + ENG.fmtDate(frames[frames.length - 1].t, frames[frames.length - 1].prec)];
  if (o.dry) { process.stdout.write(report.join('\n') + '\n'); return; }
  fs.mkdirSync(outDir, { recursive: true });
  let d = new Date(), base;
  for (let n = 0; n < 10; n++, d = new Date(d.getTime() + 1000)) { base = path.join(outDir, stampNow(d)); if (!ex(base + '.html') && !ex(base + '.gif')) break; }
  const html = base + '.html'; fs.writeFileSync(html + '.tmp', htmlDoc(model, o)); fs.renameSync(html + '.tmp', html);
  report.push('- html: ' + html);
  if (o.gif) {
    try {
      const buf = new Float32Array(ENG.W * ENG.H * 3), idx = new Uint8Array(ENG.W * ENG.H);
      const gif = ENG.encodeGif(frames.length, Math.round(100 / o.fps), i => { ENG.render(buf, model, frames[i], i); ENG.quantize(buf, idx); return idx; });
      fs.writeFileSync(base + '.gif.tmp', gif); fs.renameSync(base + '.gif.tmp', base + '.gif'); report.push('- gif: ' + base + '.gif (' + gif.length + ' bytes, ' + frames.length + ' frames)');
    } catch (e) { fail(3, 'render failed: ' + e.message); }
  }
  if (warnings.length) { report.push('', '## warnings'); warnings.forEach(w => report.push('- ' + w)); }
  process.stdout.write(report.join('\n') + '\n');
  if (o.open) {
    const url = 'file://' + html + (o.auto ? '#auto' : '');
    const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
    try { cp.spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch (e) { warn('could not open browser'); }
  }
}
main();
