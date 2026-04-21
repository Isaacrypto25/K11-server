/**
 * K11 OMNI ELITE — SVG ANIMATED ICONS v8
 * Ícones SVG com gradientes, animações e estados interativos
 */
'use strict';

const K11SVGIcons = (() => {

  let _uid = 0;
  const id = () => `k11i${++_uid}`;

  // ── ICON FACTORY ──────────────────────────────────────────────
  const icons = {

    revenue(size=32, animated=true) {
      const g = id();
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" class="${animated?'k11-ico-float':''}">
        <defs>
          <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--primary)"/>
            <stop offset="100%" stop-color="var(--warning)"/>
          </linearGradient>
          <filter id="${g}f"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx="16" cy="16" r="14" stroke="url(#${g})" stroke-width="1.5" fill="none" opacity=".2">
          ${animated?`<animate attributeName="r" values="14;15;14" dur="2.5s" repeatCount="indefinite"/>`:''}
        </circle>
        <circle cx="16" cy="16" r="11" stroke="url(#${g})" stroke-width="1" fill="none" opacity=".35"/>
        <path d="M16 8v16M13 11.5C13 9.8 14.4 8.5 16 8.5s3 1.3 3 3S17.6 14 16 14s-3 1.3-3 2.5S14.4 23.5 16 23.5" stroke="url(#${g})" stroke-width="2" stroke-linecap="round" filter="url(#${g}f)">
          ${animated?`<animate attributeName="stroke-opacity" values=".7;1;.7" dur="1.8s" repeatCount="indefinite"/>`:''}
        </path>
      </svg>`;
    },

    trending(size=32, animated=true) {
      const g = id();
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" class="${animated?'k11-ico-pulse':''}">
        <defs>
          <linearGradient id="${g}" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stop-color="var(--success)"/>
            <stop offset="100%" stop-color="var(--primary)"/>
          </linearGradient>
        </defs>
        <polyline points="4,22 10,14 16,18 22,8 28,10" stroke="url(#${g})" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${animated?`<animate attributeName="stroke-dasharray" values="0 80;80 0" dur="1.5s" fill="freeze"/>`:''}
        </polyline>
        <polyline points="22,8 28,8 28,14" stroke="url(#${g})" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="28" cy="10" r="3" fill="var(--success)" opacity=".8">
          ${animated?`<animate attributeName="r" values="2;4;2" dur="1.5s" repeatCount="indefinite"/>`:''}
        </circle>
      </svg>`;
    },

    warehouse(size=32, animated=true) {
      const g = id();
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" class="${animated?'k11-ico-float':''}">
        <defs>
          <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--info, #60a5fa)"/>
            <stop offset="100%" stop-color="var(--primary)"/>
          </linearGradient>
        </defs>
        <path d="M4 14L16 6l12 8v14H4V14z" stroke="url(#${g})" stroke-width="1.8" fill="none" stroke-linejoin="round"/>
        <rect x="11" y="20" width="10" height="8" stroke="url(#${g})" stroke-width="1.5" fill="none" rx="1">
          ${animated?`<animate attributeName="height" values="8;9;8" dur="2s" repeatCount="indefinite"/>`:''}
        </rect>
        <path d="M16 6v4M8 18h4M20 18h4" stroke="url(#${g})" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`;
    },

    rupture(size=32, animated=true) {
      const g = id();
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" class="${animated?'k11-ico-shake':''}">
        <defs>
          <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--danger)"/>
            <stop offset="100%" stop-color="var(--warning)"/>
          </linearGradient>
        </defs>
        <path d="M16 4L3 27h26L16 4z" stroke="url(#${g})" stroke-width="2" fill="none" stroke-linejoin="round">
          ${animated?`<animate attributeName="stroke-width" values="2;2.8;2" dur="1.2s" repeatCount="indefinite"/>`:''}
        </path>
        <line x1="16" y1="13" x2="16" y2="20" stroke="url(#${g})" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="16" cy="23.5" r="1.5" fill="var(--danger)">
          ${animated?`<animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite"/>`:''}
        </circle>
      </svg>`;
    },

    mission(size=32, animated=true) {
      const g = id();
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" class="${animated?'k11-ico-pulse':''}">
        <defs>
          <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--warning)"/>
            <stop offset="100%" stop-color="var(--primary)"/>
          </linearGradient>
        </defs>
        <polygon points="16,4 20,12 29,12 22,18 25,27 16,22 7,27 10,18 3,12 12,12" stroke="url(#${g})" stroke-width="1.8" fill="none" stroke-linejoin="round">
          ${animated?`<animate attributeName="stroke-width" values="1.8;2.5;1.8" dur="2s" repeatCount="indefinite"/>`:''}
        </polygon>
        <polygon points="16,8 18.5,13.5 25,13.5 20,17 22,23 16,19.5 10,23 12,17 7,13.5 13.5,13.5" fill="url(#${g})" opacity=".3"/>
      </svg>`;
    },

    checklist(size=32, animated=true) {
      const g = id();
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" class="${animated?'k11-ico-float':''}">
        <defs>
          <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--success)"/>
            <stop offset="100%" stop-color="var(--primary)"/>
          </linearGradient>
        </defs>
        <rect x="5" y="5" width="22" height="22" rx="3" stroke="url(#${g})" stroke-width="1.8" fill="none">
          ${animated?`<animate attributeName="rx" values="3;5;3" dur="2s" repeatCount="indefinite"/>`:''}
        </rect>
        <path d="M10 16l4 4 8-8" stroke="url(#${g})" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${animated?`<animate attributeName="stroke-dasharray" values="0 24;24 0" dur="0.8s" fill="freeze"/>`:''}
        </path>
      </svg>`;
    },

    users(size=32, animated=true) {
      const g = id();
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" class="${animated?'k11-ico-float':''}">
        <defs>
          <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--accent, #a78bfa)"/>
            <stop offset="100%" stop-color="var(--primary)"/>
          </linearGradient>
        </defs>
        <circle cx="12" cy="10" r="4" stroke="url(#${g})" stroke-width="1.8" fill="none"/>
        <path d="M4 26v-2a8 8 0 0116 0v2" stroke="url(#${g})" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="24" cy="9" r="3" stroke="url(#${g})" stroke-width="1.5" fill="none" opacity=".7"/>
        <path d="M28 25v-1a5 5 0 00-3-4.6" stroke="url(#${g})" stroke-width="1.5" stroke-linecap="round" opacity=".7">
          ${animated?`<animate attributeName="opacity" values=".7;1;.7" dur="2s" repeatCount="indefinite"/>`:''}
        </path>
      </svg>`;
    },

    lightning(size=32, animated=true) {
      const g = id();
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" class="${animated?'k11-ico-pulse':''}">
        <defs>
          <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--warning)"/>
            <stop offset="100%" stop-color="var(--primary)"/>
          </linearGradient>
        </defs>
        <path d="M20 4L8 18h9l-5 10 14-14h-9L20 4z" stroke="url(#${g})" stroke-width="2" fill="url(#${g})" fill-opacity=".2" stroke-linejoin="round">
          ${animated?`<animate attributeName="fill-opacity" values=".2;.4;.2" dur="1.5s" repeatCount="indefinite"/>`:''}
        </path>
      </svg>`;
    },

    benchmark(size=32, animated=true) {
      const g = id(); const g2 = id();
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" class="${animated?'k11-ico-float':''}">
        <defs>
          <linearGradient id="${g}" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stop-color="var(--primary)" stop-opacity=".4"/>
            <stop offset="100%" stop-color="var(--primary)"/>
          </linearGradient>
          <linearGradient id="${g2}" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stop-color="var(--success)" stop-opacity=".4"/>
            <stop offset="100%" stop-color="var(--success)"/>
          </linearGradient>
        </defs>
        <rect x="4" y="18" width="5" height="10" fill="url(#${g})" rx="1">
          ${animated?`<animate attributeName="height" values="10;12;10" dur="2s" repeatCount="indefinite"/><animate attributeName="y" values="18;16;18" dur="2s" repeatCount="indefinite"/>`:''}
        </rect>
        <rect x="11" y="12" width="5" height="16" fill="url(#${g2})" rx="1">
          ${animated?`<animate attributeName="height" values="16;18;16" dur="2.4s" repeatCount="indefinite"/><animate attributeName="y" values="12;10;12" dur="2.4s" repeatCount="indefinite"/>`:''}
        </rect>
        <rect x="18" y="8" width="5" height="20" fill="url(#${g})" rx="1">
          ${animated?`<animate attributeName="height" values="20;22;20" dur="1.8s" repeatCount="indefinite"/><animate attributeName="y" values="8;6;8" dur="1.8s" repeatCount="indefinite"/>`:''}
        </rect>
        <rect x="25" y="14" width="3" height="14" fill="url(#${g2})" rx="1" opacity=".7"/>
      </svg>`;
    },
  };

  // ── ANIMATED KPI CARD ─────────────────────────────────────────
  function kpiCard(opts) {
    // opts: { id, icon, value, label, delta, deltaPositive, color, onClick, sublabel }
    const {
      id: kId = 'kpi',
      icon = 'revenue',
      value = '—',
      label = 'KPI',
      delta = '',
      deltaPositive = true,
      color = 'var(--primary)',
      onClick = '',
      sublabel = '',
      size = 'md',
    } = opts;

    const iconHTML = icons[icon] ? icons[icon](size === 'lg' ? 36 : 28, true) : icons.lightning(28, true);
    const deltaHTML = delta ? `<span class="kpi-delta ${deltaPositive ? 'up' : 'dn'}">${deltaPositive ? '▲' : '▼'} ${delta}</span>` : '';

    return `
      <div class="kpi-card kpi-card--${size}" data-kpi-id="${kId}" onclick="${onClick}" style="--kpi-color:${color}">
        <div class="kpi-card__glow"></div>
        <div class="kpi-card__icon">${iconHTML}</div>
        <div class="kpi-card__body">
          <div class="kpi-card__value" id="${kId}-val">${value}</div>
          ${sublabel ? `<div class="kpi-card__sublabel">${sublabel}</div>` : ''}
          <div class="kpi-card__label">${label}</div>
          ${deltaHTML}
        </div>
        <div class="kpi-card__corner-line"></div>
      </div>`;
  }

  // ── CSS ANIMATIONS ────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('k11-icons-css')) return;
    const s = document.createElement('style');
    s.id = 'k11-icons-css';
    s.textContent = `
@keyframes k11-ico-float {0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes k11-ico-pulse {0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
@keyframes k11-ico-shake {0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
@keyframes k11-ico-spin  {to{transform:rotate(360deg)}}
@keyframes k11-card-in   {from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
@keyframes k11-glow-pulse{0%,100%{opacity:.3}50%{opacity:.7}}

.k11-ico-float  {animation:k11-ico-float 3s ease-in-out infinite}
.k11-ico-pulse  {animation:k11-ico-pulse 2s ease-in-out infinite}
.k11-ico-shake  {animation:k11-ico-shake 2s ease-in-out infinite}
.k11-ico-spin   {animation:k11-ico-spin  8s linear infinite}

/* ── KPI CARDS v8 ── */
.kpi-card {
  position:relative; border-radius:16px; padding:14px 12px;
  background:var(--card-bg); border:1px solid var(--border);
  cursor:pointer; overflow:hidden;
  animation:k11-card-in .4s ease forwards;
  transition:transform .25s cubic-bezier(.16,1,.3,1), box-shadow .25s, border-color .25s;
  display:flex; flex-direction:column; align-items:center; text-align:center; gap:6px;
}
.kpi-card::before {
  content:''; position:absolute; inset:0;
  background:linear-gradient(135deg,rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.04),transparent 60%);
  pointer-events:none;
}
.kpi-card:hover {
  transform:translateY(-5px) scale(1.02);
  border-color:var(--kpi-color,var(--primary));
  box-shadow:0 12px 40px rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.2),
             inset 0 1px rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.15);
}
.kpi-card:active {transform:scale(.98);}

.kpi-card__glow {
  position:absolute; width:80px; height:80px; border-radius:50%;
  background:radial-gradient(circle,rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.15),transparent 70%);
  top:-20px; right:-20px; pointer-events:none;
  animation:k11-glow-pulse 3s ease infinite;
}
.kpi-card__icon  {flex-shrink:0; display:flex; align-items:center; justify-content:center;}
.kpi-card__body  {flex:1; min-width:0; width:100%;}
.kpi-card__value {font-family:var(--font-mono,'JetBrains Mono',monospace); font-size:20px; font-weight:900; color:var(--kpi-color,var(--primary)); line-height:1;}
.kpi-card__label {font-size:8px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase; color:rgba(255,255,255,.3); margin-top:3px;}
.kpi-card__sublabel {font-size:9px; color:var(--text-muted); margin-top:1px;}
.kpi-card__corner-line {
  position:absolute; bottom:0; left:0; right:0; height:2px;
  background:linear-gradient(90deg,transparent,var(--kpi-color,var(--primary)),transparent);
  opacity:.4;
}
.kpi-delta { font-size:9px; font-weight:800; display:block; margin-top:3px; }
.kpi-delta.up { color:var(--success); }
.kpi-delta.dn { color:var(--danger); }

.kpi-card--lg .kpi-card__value { font-size:28px; }
.kpi-card--sm .kpi-card__value { font-size:16px; }
`;
    document.head.appendChild(s);
  }

  return { icons, kpiCard, injectCSS };
})();

window.K11SVGIcons = K11SVGIcons;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', K11SVGIcons.injectCSS);
else K11SVGIcons.injectCSS();
