/**
 * K11 OMNI ELITE — THEME ENGINE v8
 * Sistema de temas radicais + Three.js background + SVG icons animados
 */
'use strict';

const K11ThemeEngine = (() => {

  // ── TEMAS ──────────────────────────────────────────────────────
  const THEMES = {
    obsidian: {
      name:'OBSIDIAN ELITE', emoji:'⚫',
      bg:'#05060c', bg2:'#08090f', card:'#0c0e18', cardHover:'#0f1120',
      primary:'#FF8C00', primaryRgb:'255,140,0',
      accent:'#6366f1', accentRgb:'99,102,241',
      success:'#10B981', danger:'#EF4444', warning:'#F59E0B', info:'#60a5fa',
      border:'#191c2e', borderMid:'#222540', borderBright:'#2d3155',
      text:'#EDF0F7', textSoft:'#B0B8CC', textMuted:'#5A6480', textFaint:'#3A4060',
      glowR:255, glowG:140, glowB:0,
      threeColor1:'#FF8C00', threeColor2:'#6366f1', threeColor3:'#10B981',
      bgGradient:'radial-gradient(ellipse 120% 55% at 50% -8%,rgba(255,140,0,.06) 0%,transparent 65%)',
    },
    neon_storm: {
      name:'NEON STORM', emoji:'⚡',
      bg:'#040210', bg2:'#060318', card:'#080422', cardHover:'#0a0628',
      primary:'#a855f7', primaryRgb:'168,85,247',
      accent:'#ec4899', accentRgb:'236,72,153',
      success:'#22c55e', danger:'#f43f5e', warning:'#eab308', info:'#38bdf8',
      border:'#1a0a2e', borderMid:'#2d1250', borderBright:'#441a72',
      text:'#f5e6ff', textSoft:'#d8b4fe', textMuted:'#7c3aed', textFaint:'#4c1d95',
      glowR:168, glowG:85, glowB:247,
      threeColor1:'#a855f7', threeColor2:'#ec4899', threeColor3:'#38bdf8',
      bgGradient:'radial-gradient(ellipse 120% 55% at 50% -8%,rgba(168,85,247,.08) 0%,transparent 65%)',
    },
    arctic_matrix: {
      name:'ARCTIC MATRIX', emoji:'🌊',
      bg:'#010d1a', bg2:'#011424', card:'#011e35', cardHover:'#022848',
      primary:'#00d4ff', primaryRgb:'0,212,255',
      accent:'#0ea5e9', accentRgb:'14,165,233',
      success:'#00ffd0', danger:'#ff4466', warning:'#ffcc00', info:'#38bdf8',
      border:'#032040', borderMid:'#043060', borderBright:'#054880',
      text:'#e0f8ff', textSoft:'#7dd3fc', textMuted:'#0369a1', textFaint:'#0c4a6e',
      glowR:0, glowG:212, glowB:255,
      threeColor1:'#00d4ff', threeColor2:'#0ea5e9', threeColor3:'#00ffd0',
      bgGradient:'radial-gradient(ellipse 120% 55% at 50% -8%,rgba(0,212,255,.07) 0%,transparent 65%)',
    },
    inferno: {
      name:'INFERNO', emoji:'🔥',
      bg:'#0e0401', bg2:'#150601', card:'#1c0802', cardHover:'#230a02',
      primary:'#ff4500', primaryRgb:'255,69,0',
      accent:'#ff8c00', accentRgb:'255,140,0',
      success:'#76c442', danger:'#ff1a1a', warning:'#ffaa00', info:'#ff6633',
      border:'#2a0d00', borderMid:'#3d1400', borderBright:'#5a1e00',
      text:'#fff1e6', textSoft:'#ffbb88', textMuted:'#cc4400', textFaint:'#8b2500',
      glowR:255, glowG:69, glowB:0,
      threeColor1:'#ff4500', threeColor2:'#ff8c00', threeColor3:'#ffaa00',
      bgGradient:'radial-gradient(ellipse 120% 55% at 50% -8%,rgba(255,69,0,.08) 0%,transparent 65%)',
    },
    ghost_ops: {
      name:'GHOST OPS', emoji:'👻',
      bg:'#08080a', bg2:'#0a0a0e', card:'#111115', cardHover:'#151519',
      primary:'#e2e8f0', primaryRgb:'226,232,240',
      accent:'#94a3b8', accentRgb:'148,163,184',
      success:'#4ade80', danger:'#f87171', warning:'#fbbf24', info:'#818cf8',
      border:'#1e1e24', borderMid:'#2a2a33', borderBright:'#3a3a46',
      text:'#f8fafc', textSoft:'#cbd5e1', textMuted:'#64748b', textFaint:'#334155',
      glowR:226, glowG:232, glowB:240,
      threeColor1:'#e2e8f0', threeColor2:'#94a3b8', threeColor3:'#64748b',
      bgGradient:'radial-gradient(ellipse 120% 55% at 50% -8%,rgba(226,232,240,.04) 0%,transparent 65%)',
    },
    biosystem: {
      name:'BIOSYSTEM', emoji:'🧬',
      bg:'#010a04', bg2:'#011206', card:'#011a08', cardHover:'#02250c',
      primary:'#00ff88', primaryRgb:'0,255,136',
      accent:'#00cc66', accentRgb:'0,204,102',
      success:'#00ff88', danger:'#ff3366', warning:'#ffee00', info:'#00ffdd',
      border:'#003311', borderMid:'#005522', borderBright:'#007733',
      text:'#e6ffe6', textSoft:'#88ffaa', textMuted:'#006622', textFaint:'#003311',
      glowR:0, glowG:255, glowB:136,
      threeColor1:'#00ff88', threeColor2:'#00cc66', threeColor3:'#00ffdd',
      bgGradient:'radial-gradient(ellipse 120% 55% at 50% -8%,rgba(0,255,136,.06) 0%,transparent 65%)',
    },
    solar_flare: {
      name:'SOLAR FLARE', emoji:'☀️',
      bg:'#0c0900', bg2:'#140d00', card:'#1c1200', cardHover:'#241600',
      primary:'#ffd700', primaryRgb:'255,215,0',
      accent:'#ff6b00', accentRgb:'255,107,0',
      success:'#86efac', danger:'#f87171', warning:'#ffd700', info:'#93c5fd',
      border:'#2a1f00', borderMid:'#3d2d00', borderBright:'#564000',
      text:'#fffbeb', textSoft:'#fde68a', textMuted:'#b45309', textFaint:'#78350f',
      glowR:255, glowG:215, glowB:0,
      threeColor1:'#ffd700', threeColor2:'#ff6b00', threeColor3:'#ffaa00',
      bgGradient:'radial-gradient(ellipse 120% 55% at 50% -8%,rgba(255,215,0,.07) 0%,transparent 65%)',
    },
    royal_dark: {
      name:'ROYAL DARK', emoji:'👑',
      bg:'#06040e', bg2:'#09061a', card:'#0e0a24', cardHover:'#130e2e',
      primary:'#7c3aed', primaryRgb:'124,58,237',
      accent:'#2563eb', accentRgb:'37,99,235',
      success:'#10b981', danger:'#ef4444', warning:'#f59e0b', info:'#3b82f6',
      border:'#1e1040', borderMid:'#2d1870', borderBright:'#3d22a0',
      text:'#ede9fe', textSoft:'#c4b5fd', textMuted:'#6d28d9', textFaint:'#4c1d95',
      glowR:124, glowG:58, glowB:237,
      threeColor1:'#7c3aed', threeColor2:'#2563eb', threeColor3:'#a78bfa',
      bgGradient:'radial-gradient(ellipse 120% 55% at 50% -8%,rgba(124,58,237,.08) 0%,transparent 65%)',
    },
  };

  let _current = 'obsidian';
  let _threeEngine = null;

  // ── APPLY THEME ────────────────────────────────────────────────
  function apply(id) {
    const t = THEMES[id] || THEMES.obsidian;
    _current = id;

    const r = document.documentElement.style;
    r.setProperty('--bg',            t.bg);
    r.setProperty('--bg2',           t.bg2);
    r.setProperty('--bg3',           t.bg2);
    r.setProperty('--card-bg',       t.card);
    r.setProperty('--card-bg2',      t.cardHover);
    r.setProperty('--card-surface',  t.cardHover);
    r.setProperty('--primary',       t.primary);
    r.setProperty('--primary-rgb',   t.primaryRgb);
    r.setProperty('--primary-dim',   `rgba(${t.primaryRgb},0.12)`);
    r.setProperty('--primary-glow',  `rgba(${t.primaryRgb},0.35)`);
    r.setProperty('--accent',        t.accent);
    r.setProperty('--accent-dim',    `rgba(${t.accentRgb},0.12)`);
    r.setProperty('--accent-glow',   `rgba(${t.accentRgb},0.25)`);
    r.setProperty('--success',       t.success);
    r.setProperty('--danger',        t.danger);
    r.setProperty('--warning',       t.warning);
    r.setProperty('--info',          t.info || t.accent);
    r.setProperty('--border',        t.border);
    r.setProperty('--border-mid',    t.borderMid);
    r.setProperty('--border-bright', t.borderBright);
    r.setProperty('--border-color',  t.border);
    r.setProperty('--text-main',     t.text);
    r.setProperty('--text-soft',     t.textSoft);
    r.setProperty('--text-muted',    t.textMuted);
    r.setProperty('--text-faint',    t.textFaint);
    r.setProperty('--text',          t.text);
    r.setProperty('--glow-r',        t.glowR);
    r.setProperty('--glow-g',        t.glowG);
    r.setProperty('--glow-b',        t.glowB);

    document.body.style.backgroundColor = t.bg;
    document.body.style.backgroundImage = t.bgGradient;

    // theme-color meta
    const mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute('content', t.bg);

    // Update Three.js colors
    if (_threeEngine) _threeEngine.setColors(t.threeColor1, t.threeColor2, t.threeColor3);

    // Persist
    try { localStorage.setItem('k11_theme_v8', id); } catch {}

    // Update active swatches
    document.querySelectorAll('[data-theme-id]').forEach(el => {
      el.classList.toggle('active', el.dataset.themeId === id);
    });

    console.log(`[K11Theme] Applied: ${t.name}`);
  }

  function load() {
    const saved = localStorage.getItem('k11_theme_v8') || 'obsidian';
    apply(THEMES[saved] ? saved : 'obsidian');
  }

  function current() { return _current; }
  function getTheme(id) { return THEMES[id]; }
  function getAll() { return THEMES; }
  function registerThreeEngine(eng) { _threeEngine = eng; }

  return { apply, load, current, getTheme, getAll, registerThreeEngine, THEMES };
})();

window.K11ThemeEngine = K11ThemeEngine;
