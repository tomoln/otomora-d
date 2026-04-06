'use strict';

const { ipcRenderer } = require('electron');
const fs = require('fs');

// ═════════════════════════════════════════════════════════════════════════════
// GLSL
// ═════════════════════════════════════════════════════════════════════════════

const VERT_SRC = `#version 300 es
out vec2 vUV;
void main(){
  // bit trick: 4 vertices cover a full-screen quad in TRIANGLE_STRIP order
  float x = float(gl_VertexID >> 1) * 2.0 - 1.0;
  float y = float(gl_VertexID &  1) * 2.0 - 1.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
  vUV = vec2(x, y) * 0.5 + 0.5;
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in  vec2 vUV;
out vec4 fragColor;

uniform vec2  u_res;
uniform float u_time;
uniform float u_f0;   // normalized 0-1  (pitch)
uniform float u_rms;  // normalized 0-1  (loudness)
uniform float u_sc;   // normalized 0-1  (spectral centroid / brightness)
uniform float u_zcr;  // normalized 0-1  (noisiness)
uniform int   u_mode; // 0=fluid 1=glitch 2=text_matrix
uniform sampler2D u_tex;

// ── Simplex 3D noise (Stefan Gustavson) ──────────────────────────────────────
vec3 _m289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 _m289v4(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 _perm(vec4 x){return _m289v4(((x*34.)+1.)*x);}
vec4 _tis(vec4 r){return 1.79284291-0.85373472*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=_m289v3(i);
  vec4 p=_perm(_perm(_perm(
    i.z+vec4(0.,i1.z,i2.z,1.))
   +i.y+vec4(0.,i1.y,i2.y,1.))
   +i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;
  vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=_tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

// ── HSL → RGB ─────────────────────────────────────────────────────────────────
vec3 hsl(float h, float s, float l){
  vec3 r=clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);
  return l+s*(r-.5)*(1.-abs(2.*l-1.));
}

// ─────────────────────────────────────────────────────────────────────────────
void main(){
  vec2 uv = vUV;
  vec2 st = uv*2.-1.;
  st.x *= u_res.x/u_res.y;

  // f0 → hue: low=blue(0.62) high=orange(0.08) — Complementary pair is +0.5
  float hue  = mix(0.62, 0.08, u_f0);
  float comp = fract(hue + 0.5);

  vec3 col = vec3(0.0);

  // ── MODE 0: FLUID ─────────────────────────────────────────────────────────
  if(u_mode == 0){
    float spd = 0.22 + u_rms * 1.1;
    float scl = 1.5  + u_sc  * 1.2;

    float n1 = snoise(vec3(st*scl,              u_time*spd));
    float n2 = snoise(vec3(st*scl*0.55+vec2(5.1,1.8), u_time*spd*0.65));
    float n3 = snoise(vec3(st*scl*0.28+vec2(-2.3,7.6), u_time*spd*0.42));
    float n  = n1*0.5 + n2*0.34 + n3*0.16;

    // Analogous: two hues close together, blend across noise field
    float h1 = hue + n*0.13;
    float h2 = hue + 0.07 + n*0.09;
    float sat = 0.78 + u_sc*0.18;
    float lum = clamp(0.18 + u_rms*0.42 + n*0.1, 0.0, 0.78);
    col = mix(hsl(h1,sat,lum), hsl(h2,sat,lum*0.88), smoothstep(-0.25,0.25,n));

    // Complementary glow at center, RMS-driven
    float d    = length(st);
    float glow = u_rms * 0.75 * exp(-d * 2.2);
    col += hsl(comp, 1.0, 0.68) * glow;

    // Vortex warp from f0
    float ang   = atan(st.y, st.x) + u_f0 * u_time * 0.25;
    float vortex = snoise(vec3(cos(ang)*d*2., sin(ang)*d*2., u_time*0.18)) * 0.12;
    col += hsl(hue+0.06, 0.9, lum+0.25) * max(vortex,0.0) * u_rms;

  // ── MODE 1: GLITCH ────────────────────────────────────────────────────────
  }else if(u_mode == 1){
    vec2 guv = uv;

    // Horizontal tear bands (ZCR-driven intensity)
    float bandY  = floor(guv.y * 22.0) / 22.0;
    float bRnd   = fract(sin(bandY*127.1 + floor(u_time*9.0)*91.3) * 43758.5);
    float tearAmt = u_zcr * 0.07 * step(0.55, bRnd);
    guv.x = clamp(guv.x + tearAmt * sin(u_time*220.0 + bandY*42.0), 0.0, 1.0);

    // Per-scanline jitter
    float sRnd = fract(sin(floor(uv.y*u_res.y)*91.7 + floor(u_time*28.)*17.) * 43758.5);
    guv.x = clamp(guv.x + u_zcr*0.028*(sRnd*2.-1.)*step(0.88,sRnd), 0.0, 1.0);

    // Dark noise background
    float n = snoise(vec3(guv*2.2, u_time*0.38));
    vec3 base = hsl(hue + n*0.04, 0.88, 0.07 + u_rms*0.22 + n*0.04);

    // RGB channel split from text-matrix texture (glitched text substrate)
    float sp = u_zcr*0.032 + u_rms*0.008;
    float rCh = texture(u_tex, clamp(guv+vec2( sp, 0.0),0.,1.)).r;
    float gCh = texture(u_tex, guv).g;
    float bCh = texture(u_tex, clamp(guv+vec2(-sp, 0.0),0.,1.)).b;
    float texL = (rCh+gCh+bCh)/3.0;
    vec3 texC  = vec3(rCh,gCh,bCh) * hsl(hue, 0.95, 0.72) * 2.0;
    col = base + texC * texL * 1.4;

    // Block corruption (branch-free)
    float bx = floor(uv.x*11.)/11.;
    float by = floor(uv.y* 7.)/ 7.;
    float blkR = fract(sin(bx*37.+by*91.+floor(u_time*4.)*17.) * 43758.5);
    float corrupt = step(1.0 - u_zcr*0.45, blkR);
    col = mix(col, hsl(hue+blkR*0.35, 1., 0.68)*corrupt, corrupt*0.38);

    // Scanline overlay
    col -= sin(uv.y*u_res.y*3.14159)*0.055;

    // ZCR flash (Complementary colour)
    float flash = smoothstep(0.32, 0.72, u_zcr);
    col = mix(col, hsl(comp,1.,0.78)*flash, flash*0.42);

  // ── MODE 2: TEXT MATRIX ───────────────────────────────────────────────────
  }else{
    // Canvas Y origin is top; UV.y=0 is screen bottom → sample with flipped Y
    vec4 tx = texture(u_tex, vec2(uv.x, 1.0 - uv.y));
    float glyph = tx.r;

    // Dark animated background
    float n = snoise(vec3(st*1.4, u_time*0.18))*0.5+0.5;
    vec3 bg = hsl(hue, 0.88, 0.02 + n*0.03);

    // Glyph colour: f0-hue, rms-driven brightness
    float bright = 0.3 + u_rms*0.7;
    vec3 gc = hsl(hue, 0.95, bright*glyph);

    // Leading-edge highlight (brightest chars → near-white / comp colour)
    float lead = smoothstep(0.72, 1.0, glyph);
    gc = mix(gc, vec3(0.78,1.0,0.83)*bright, lead);
    gc = mix(gc, hsl(comp,1.,0.9), lead * smoothstep(0.45,1.0,u_rms));

    col = bg + gc;
    col -= sin(uv.y*u_res.y*3.14159)*0.038;
  }

  // Vignette
  float vig = smoothstep(1.5, 0.45, length((uv-0.5)*vec2(u_res.x/u_res.y, 1.0))*1.15);
  col *= vig;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ═════════════════════════════════════════════════════════════════════════════
// State
// ═════════════════════════════════════════════════════════════════════════════

let audioCtx    = null;
let sourceNode  = null;
let audioBuffer = null;
let playStart   = 0;   // audioCtx.currentTime when play began
let pauseOffset = 0;   // playback position to resume from
let playing     = false;

let wordList = [];   // parsed JSON array
let allMoras = [];   // flat sorted mora array

let gl, program, vao, uLocs = {};
let textCanvas, textCtx, textTex;
let currentMode = 0;

// Text-matrix grid
const COLS = 24, ROWS = 32, TEX = 512;
let cells = [];            // [{char, brightness}]
let scrollTimer = 0;
const SCROLL_SEC = 0.11;

// Current audio params
let params = { f0: 0, rms: 0, sc: 0, zcr: 0 };
let prevMoraIdx = -1;
let prevWordIdx = -1;

// ═════════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  const paths = await ipcRenderer.invoke('get-asset-paths', '001');

  // JSON
  wordList = JSON.parse(fs.readFileSync(paths.jsonPath, 'utf8'));
  allMoras = wordList.flatMap(w => w.moras.map(m => ({ ...m, wordText: w.word })));
  allMoras.sort((a, b) => a.start - b.start);

  // Audio
  audioCtx = new AudioContext();
  const wavBytes = fs.readFileSync(paths.audioPath);
  const ab = wavBytes.buffer.slice(wavBytes.byteOffset, wavBytes.byteOffset + wavBytes.byteLength);
  audioBuffer = await audioCtx.decodeAudioData(ab);

  // WebGL + Text matrix
  initGL();
  initMatrix();
  setupUI();

  document.getElementById('status').style.display = 'none';
  document.getElementById('btn-play').disabled = false;

  requestAnimationFrame(loop);
}

// ═════════════════════════════════════════════════════════════════════════════
// Audio
// ═════════════════════════════════════════════════════════════════════════════

function playAudio() {
  if (playing) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(audioCtx.destination);
  playStart = audioCtx.currentTime - pauseOffset;
  sourceNode.start(0, pauseOffset);
  sourceNode.onended = () => { if (playing) stopAudio(true); };
  playing = true;
  document.getElementById('btn-play').textContent = '■ Stop';
}

function stopAudio(ended = false) {
  if (!playing) return;
  if (!ended) {
    pauseOffset = audioCtx.currentTime - playStart;
    try { sourceNode.stop(); } catch (_) {}
  } else {
    pauseOffset = 0;
    prevMoraIdx = prevWordIdx = -1;
    params = { f0: 0, rms: 0, sc: 0, zcr: 0 };
    document.getElementById('info-mora').textContent = '';
    document.getElementById('info-word').textContent = '';
  }
  playing = false;
  document.getElementById('btn-play').textContent = '▶ Play';
}

function playbackTime() {
  return playing ? (audioCtx.currentTime - playStart) : pauseOffset;
}

// ═════════════════════════════════════════════════════════════════════════════
// JSON → param sync
// ═════════════════════════════════════════════════════════════════════════════

function syncParams(t) {
  // Binary search: find last mora whose start ≤ t
  let lo = 0, hi = allMoras.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (allMoras[mid].start <= t) { found = mid; lo = mid + 1; }
    else hi = mid - 1;
  }

  if (found >= 0 && t < allMoras[found].end) {
    const m = allMoras[found];
    if (found !== prevMoraIdx) {
      prevMoraIdx = found;
      document.getElementById('info-mora').textContent = m.text;
      addCharToMatrix(m.text);
    }
    params.f0  = Math.min(m.f0               / 300,   1);
    params.rms = Math.min(m.rms              / 0.25,  1);
    params.sc  = Math.min(m.spectral_centroid / 10000, 1);
    params.zcr = Math.min(m.zcr              / 0.45,  1);
  } else {
    params.rms *= 0.88;
    params.zcr *= 0.78;
  }

  // Word tracking
  for (let i = 0; i < wordList.length; i++) {
    const w = wordList[i];
    if (t >= w.start && t <= w.end) {
      if (i !== prevWordIdx) {
        prevWordIdx = i;
        document.getElementById('info-word').textContent = w.word;
      }
      break;
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// WebGL
// ═════════════════════════════════════════════════════════════════════════════

function initGL() {
  const canvas = document.getElementById('canvas');
  gl = canvas.getContext('webgl2');
  if (!gl) { alert('WebGL2 未サポート'); return; }

  const vs = compileShader(gl.VERTEX_SHADER,   VERT_SRC);
  const fs = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Link error: ' + gl.getProgramInfoLog(program));
  }

  vao = gl.createVertexArray();
  gl.useProgram(program);

  for (const n of ['u_time','u_res','u_f0','u_rms','u_sc','u_zcr','u_mode','u_tex']) {
    uLocs[n] = gl.getUniformLocation(program, n);
  }
  gl.uniform1i(uLocs.u_tex, 0);

  onResize();
  window.addEventListener('resize', onResize);
}

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s));
  }
  return s;
}

function onResize() {
  const canvas = document.getElementById('canvas');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(program);
  gl.uniform2f(uLocs.u_res, canvas.width, canvas.height);
}

// ═════════════════════════════════════════════════════════════════════════════
// Text Matrix
// ═════════════════════════════════════════════════════════════════════════════

function initMatrix() {
  cells = Array.from({ length: COLS * ROWS }, () => ({ char: '', brightness: 0 }));

  textCanvas = document.createElement('canvas');
  textCanvas.width = textCanvas.height = TEX;
  textCtx = textCanvas.getContext('2d');

  textTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  uploadMatrix(); // blank initial upload
}

function addCharToMatrix(text) {
  // Place the new character at the top of a random column
  const col = Math.floor(Math.random() * COLS);
  cells[col] = { char: text, brightness: 1.0 };
}

function updateMatrixScroll(dt) {
  scrollTimer += dt;
  if (scrollTimer < SCROLL_SEC) return;
  scrollTimer -= SCROLL_SEC;

  // Shift cells down one row
  for (let r = ROWS - 1; r > 0; r--) {
    for (let c = 0; c < COLS; c++) {
      const src = cells[(r - 1) * COLS + c];
      cells[r * COLS + c] = { char: src.char, brightness: src.brightness * 0.80 };
    }
  }
  for (let c = 0; c < COLS; c++) {
    cells[c] = { char: '', brightness: 0 };
  }
}

function uploadMatrix() {
  const cellPx   = TEX / COLS;
  const fontSize = Math.floor(cellPx * 0.74);

  textCtx.clearRect(0, 0, TEX, TEX);
  textCtx.fillStyle = '#000';
  textCtx.fillRect(0, 0, TEX, TEX);
  textCtx.textAlign    = 'center';
  textCtx.textBaseline = 'middle';
  textCtx.font = `bold ${fontSize}px "MS Gothic","Yu Gothic",monospace`;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = cells[r * COLS + c];
      if (!cell.char || cell.brightness < 0.012) continue;
      textCtx.fillStyle = `rgba(255,255,255,${cell.brightness.toFixed(3)})`;
      textCtx.fillText(cell.char, c * cellPx + cellPx / 2, r * cellPx + cellPx / 2);
    }
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
}

// ═════════════════════════════════════════════════════════════════════════════
// Render loop
// ═════════════════════════════════════════════════════════════════════════════

let lastNow = 0;

function loop(now) {
  requestAnimationFrame(loop);

  const dt = Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;

  const t = playbackTime();
  if (playing) syncParams(t);

  updateMatrixScroll(dt);
  uploadMatrix();

  gl.useProgram(program);
  gl.uniform1f(uLocs.u_time, now / 1000);
  gl.uniform1f(uLocs.u_f0,   params.f0);
  gl.uniform1f(uLocs.u_rms,  params.rms);
  gl.uniform1f(uLocs.u_sc,   params.sc);
  gl.uniform1f(uLocs.u_zcr,  params.zcr);
  gl.uniform1i(uLocs.u_mode, currentMode);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Progress bar + time display
  if (audioBuffer) {
    const dur = audioBuffer.duration;
    document.getElementById('progress-inner').style.width = `${Math.min(t / dur * 100, 100)}%`;
    document.getElementById('info-time').textContent = `${t.toFixed(1)}s / ${dur.toFixed(1)}s`;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// UI
// ═════════════════════════════════════════════════════════════════════════════

function setupUI() {
  document.getElementById('btn-play').addEventListener('click', () => {
    playing ? stopAudio() : playAudio();
  });

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMode = parseInt(btn.dataset.mode, 10);
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Start
// ═════════════════════════════════════════════════════════════════════════════

main().catch(err => {
  document.getElementById('status').textContent = 'Error: ' + err.message;
  console.error(err);
});
