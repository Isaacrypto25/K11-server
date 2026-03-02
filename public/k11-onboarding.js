/**
 * K11 OMNI ELITE — Onboarding
 * ════════════════════════════
 * Exibe 3 slides na PRIMEIRA vez que o usuário chega no dashboard.
 * Usa localStorage para não repetir.
 *
 * USO: adicionar no dashboard.html antes de </body>:
 *   <script src="k11-onboarding.js"></script>
 */

'use strict';

(function () {
  const STORAGE_KEY = 'k11_onboarding_done';

  // Só exibe na primeira vez
  if (localStorage.getItem(STORAGE_KEY)) return;

  // ── SLIDES ────────────────────────────────────────────────────
  const SLIDES = [
    {
      tag: '01 / OPERAÇÕES',
      title: 'Tudo que você precisa, <span style="color:var(--ob-orange)">em um só lugar</span>',
      desc: 'Estoque em tempo real, fila de coleta, recebimento e rastreio de produtos — tudo sincronizado com o servidor Railway.',
      icon: `<svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="8" y="8" width="22" height="22" rx="6" fill="rgba(255,140,0,.15)" stroke="rgba(255,140,0,.4)" stroke-width="1.5"/>
        <rect x="34" y="8" width="22" height="22" rx="6" fill="rgba(0,255,136,.1)" stroke="rgba(0,255,136,.3)" stroke-width="1.5"/>
        <rect x="8" y="34" width="22" height="22" rx="6" fill="rgba(0,212,255,.1)" stroke="rgba(0,212,255,.3)" stroke-width="1.5"/>
        <rect x="34" y="34" width="22" height="22" rx="6" fill="rgba(176,111,255,.1)" stroke="rgba(176,111,255,.3)" stroke-width="1.5"/>
        <text x="19" y="24" font-size="10" text-anchor="middle" fill="#ff8c00">📦</text>
        <text x="45" y="24" font-size="10" text-anchor="middle" fill="#00ff88">📊</text>
        <text x="19" y="50" font-size="10" text-anchor="middle" fill="#00d4ff">🚚</text>
        <text x="45" y="50" font-size="10" text-anchor="middle" fill="#b06fff">🔍</text>
      </svg>`,
      chips: ['ESTOQUE', 'COLETA', 'RECEBIMENTO', 'RASTREIO'],
      color: 'var(--ob-orange)',
    },
    {
      tag: '02 / INTELIGÊNCIA',
      title: 'IA e Voz <span style="color:var(--ob-green)">integrados</span> ao seu fluxo',
      desc: 'Assistente de voz com Groq AI, Float AI para análises contextuais e supervisor automático de saúde do sistema.',
      icon: `<svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="22" fill="rgba(0,255,136,.06)" stroke="rgba(0,255,136,.2)" stroke-width="1.5"/>
        <circle cx="32" cy="32" r="14" fill="rgba(0,255,136,.08)" stroke="rgba(0,255,136,.25)" stroke-width="1.5"/>
        <circle cx="32" cy="32" r="6" fill="rgba(0,255,136,.3)"/>
        <line x1="32" y1="6" x2="32" y2="14" stroke="rgba(0,255,136,.4)" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="32" y1="50" x2="32" y2="58" stroke="rgba(0,255,136,.4)" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="6" y1="32" x2="14" y2="32" stroke="rgba(0,255,136,.4)" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="50" y1="32" x2="58" y2="32" stroke="rgba(0,255,136,.4)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`,
      chips: ['GROQ AI', 'VOICE', 'FLOAT AI', 'SUPERVISOR'],
      color: 'var(--ob-green)',
    },
    {
      tag: '03 / MODOS',
      title: 'LITE ou ULTRA — <span style="color:var(--ob-blue)">você escolhe</span>',
      desc: 'Modo ULTRA para gestores com visão completa. Modo LITE para operadores focados em coleta e estoque. Troque a qualquer hora pelo ícone no topo.',
      icon: `<svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="6" y="14" width="24" height="36" rx="5" fill="rgba(0,212,255,.08)" stroke="rgba(0,212,255,.3)" stroke-width="1.5"/>
        <rect x="34" y="14" width="24" height="36" rx="5" fill="rgba(255,140,0,.08)" stroke="rgba(255,140,0,.3)" stroke-width="1.5"/>
        <text x="18" y="30" font-size="8" text-anchor="middle" fill="#00d4ff" font-family="monospace" font-weight="700">⚡</text>
        <text x="18" y="40" font-size="6" text-anchor="middle" fill="rgba(0,212,255,.6)" font-family="monospace">LITE</text>
        <text x="46" y="30" font-size="8" text-anchor="middle" fill="#ff8c00" font-family="monospace" font-weight="700">🧠</text>
        <text x="46" y="40" font-size="6" text-anchor="middle" fill="rgba(255,140,0,.6)" font-family="monospace">ULTRA</text>
        <path d="M30 32 L34 32" stroke="rgba(255,255,255,.2)" stroke-width="1.5" stroke-dasharray="2 2"/>
      </svg>`,
      chips: ['⚡ LITE', '🧠 ULTRA', 'TOGGLE', 'SESSÃO'],
      color: 'var(--ob-blue)',
    },
  ];

  // ── CSS ────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --ob-bg:     #060810;
      --ob-bg2:    #0c0f1e;
      --ob-bg3:    #111628;
      --ob-orange: #ff8c00;
      --ob-green:  #00ff88;
      --ob-blue:   #00d4ff;
      --ob-muted:  #4a5068;
      --ob-white:  #e8edf5;
      --ob-border: rgba(255,255,255,0.07);
    }

    #k11-onboarding-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: var(--ob-bg);
      display: flex;
      flex-direction: column;
      font-family: 'Syne', sans-serif;
      overflow: hidden;
      touch-action: pan-y;
    }

    /* grid background */
    #k11-onboarding-overlay::before {
      content: '';
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(0,255,136,0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,255,136,0.025) 1px, transparent 1px);
      background-size: 36px 36px;
      pointer-events: none;
    }

    .ob-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 52px 24px 0;
      position: relative; z-index: 1;
    }

    .ob-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1px;
      color: var(--ob-white);
    }

    .ob-logo-hex {
      width: 32px; height: 32px;
      background: rgba(255,140,0,.15);
      border: 1px solid rgba(255,140,0,.35);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 900;
      color: var(--ob-orange);
      font-family: 'Space Mono', monospace;
    }

    .ob-skip {
      background: none;
      border: 1px solid var(--ob-border);
      color: var(--ob-muted);
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      letter-spacing: 2px;
      padding: 6px 14px;
      border-radius: 20px;
      cursor: pointer;
      transition: color .2s, border-color .2s;
    }
    .ob-skip:hover { color: var(--ob-white); border-color: rgba(255,255,255,.2); }

    /* SLIDES TRACK */
    .ob-track-wrap {
      flex: 1;
      overflow: hidden;
      position: relative; z-index: 1;
    }

    .ob-track {
      display: flex;
      height: 100%;
      transition: transform .4s cubic-bezier(.4,0,.2,1);
      will-change: transform;
    }

    .ob-slide {
      min-width: 100%;
      padding: 32px 28px 20px;
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .ob-tag {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      letter-spacing: 3px;
      color: var(--ob-muted);
      margin-bottom: 16px;
    }

    .ob-title {
      font-size: clamp(22px, 6vw, 30px);
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -.5px;
      color: var(--ob-white);
      margin-bottom: 14px;
    }

    .ob-desc {
      font-size: 13px;
      color: var(--ob-muted);
      line-height: 1.7;
      font-family: 'Space Mono', monospace;
      margin-bottom: 32px;
    }

    .ob-visual {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
    }

    .ob-icon-wrap {
      width: 120px; height: 120px;
      background: var(--ob-bg2);
      border: 1px solid var(--ob-border);
      border-radius: 28px;
      display: flex; align-items: center; justify-content: center;
      position: relative;
    }
    .ob-icon-wrap::before {
      content: '';
      position: absolute; inset: 0;
      border-radius: 28px;
      background: radial-gradient(circle at 50% 0%, rgba(255,255,255,.04), transparent 70%);
    }

    .ob-chips {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }

    .ob-chip {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      letter-spacing: 2px;
      padding: 5px 12px;
      border-radius: 20px;
      border: 1px solid;
      background: transparent;
      transition: transform .15s;
    }
    .ob-chip:hover { transform: translateY(-1px); }

    /* BOTTOM */
    .ob-bottom {
      padding: 20px 28px 40px;
      position: relative; z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 20px;
      align-items: center;
    }

    /* DOTS */
    .ob-dots {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .ob-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--ob-muted);
      transition: all .3s;
      cursor: pointer;
    }
    .ob-dot.active {
      width: 20px;
      border-radius: 3px;
    }

    /* CTA BUTTON */
    .ob-btn {
      width: 100%;
      padding: 16px;
      border-radius: 14px;
      border: none;
      font-family: 'Syne', sans-serif;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 2px;
      cursor: pointer;
      transition: opacity .2s, transform .15s;
    }
    .ob-btn:active { transform: scale(.98); opacity: .9; }

    .ob-btn-next {
      background: var(--ob-bg2);
      color: var(--ob-white);
      border: 1px solid var(--ob-border);
    }

    .ob-btn-start {
      background: linear-gradient(135deg, var(--ob-orange), #e67e00);
      color: #000;
      box-shadow: 0 8px 32px rgba(255,140,0,.3);
      display: none;
    }

    /* PROGRESS BAR */
    .ob-progress {
      position: absolute;
      top: 0; left: 0;
      height: 2px;
      background: var(--ob-orange);
      transition: width .4s ease;
      border-radius: 0 1px 1px 0;
    }

    /* ANIMATE IN */
    @keyframes ob-fadein {
      from { opacity: 0; transform: scale(.96); }
      to   { opacity: 1; transform: scale(1); }
    }
    #k11-onboarding-overlay { animation: ob-fadein .35s ease both; }

    @keyframes ob-fadeout {
      to { opacity: 0; transform: scale(1.03); }
    }
    #k11-onboarding-overlay.closing { animation: ob-fadeout .3s ease forwards; }
  `;
  document.head.appendChild(style);

  // ── BUILD HTML ────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'k11-onboarding-overlay';

  // Header
  overlay.innerHTML = `
    <div class="ob-progress" id="ob-progress" style="width:33%"></div>
    <div class="ob-header">
      <div class="ob-logo">
        <div class="ob-logo-hex">K</div>
        K11 OMNI
      </div>
      <button class="ob-skip" id="ob-skip">PULAR</button>
    </div>

    <div class="ob-track-wrap">
      <div class="ob-track" id="ob-track">
        ${SLIDES.map((s, i) => `
          <div class="ob-slide">
            <div class="ob-tag">${s.tag}</div>
            <div class="ob-title">${s.title}</div>
            <div class="ob-desc">${s.desc}</div>
            <div class="ob-visual">
              <div class="ob-icon-wrap">${s.icon}</div>
              <div class="ob-chips">
                ${s.chips.map(c => `<span class="ob-chip" style="color:${s.color};border-color:${s.color}33">${c}</span>`).join('')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="ob-bottom">
      <div class="ob-dots" id="ob-dots">
        ${SLIDES.map((_, i) => `<div class="ob-dot ${i === 0 ? 'active' : ''}" data-i="${i}"></div>`).join('')}
      </div>
      <button class="ob-btn ob-btn-next" id="ob-btn-next">PRÓXIMO →</button>
      <button class="ob-btn ob-btn-start" id="ob-btn-start">⚡ INICIAR K11 OMNI</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // ── LOGIC ─────────────────────────────────────────────────────
  let current = 0;
  const track    = document.getElementById('ob-track');
  const dots     = document.querySelectorAll('.ob-dot');
  const btnNext  = document.getElementById('ob-btn-next');
  const btnStart = document.getElementById('ob-btn-start');
  const btnSkip  = document.getElementById('ob-skip');
  const progress = document.getElementById('ob-progress');

  // dot colors per slide
  const dotColors = ['var(--ob-orange)', 'var(--ob-green)', 'var(--ob-blue)'];

  function goTo(n) {
    current = Math.max(0, Math.min(n, SLIDES.length - 1));
    track.style.transform = `translateX(-${current * 100}%)`;

    dots.forEach((d, i) => {
      d.classList.toggle('active', i === current);
      d.style.background = i === current ? dotColors[current] : '';
    });

    progress.style.width = `${((current + 1) / SLIDES.length) * 100}%`;
    progress.style.background = dotColors[current];

    const isLast = current === SLIDES.length - 1;
    btnNext.style.display  = isLast ? 'none'  : 'block';
    btnStart.style.display = isLast ? 'block' : 'none';
  }

  function close() {
    localStorage.setItem(STORAGE_KEY, '1');
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 320);
  }

  btnNext.addEventListener('click', () => goTo(current + 1));
  btnStart.addEventListener('click', close);
  btnSkip.addEventListener('click', close);
  dots.forEach(d => d.addEventListener('click', () => goTo(+d.dataset.i)));

  // Swipe support
  let startX = 0;
  overlay.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) dx < 0 ? goTo(current + 1) : goTo(current - 1);
  }, { passive: true });

  // Init
  goTo(0);

})();
