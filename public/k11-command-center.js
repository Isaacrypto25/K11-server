/**
 * K11 OMNI ELITE — COMMAND CENTER v8
 * Painel de personalização radical do Dashboard
 * Temas, KPIs customizáveis, visualizações inovadoras
 */
'use strict';

const K11CommandCenter = (() => {

  // ── KPI REGISTRY ─────────────────────────────────────────────
  // Todos os KPIs disponíveis no sistema K11
  const KPI_REGISTRY = {
    // Inventário
    valTotal:     { label:'Valor do Inventário',    icon:'revenue',   color:'#FF8C00', group:'inventario', fmt:'currency', desc:'Valor total dos produtos em estoque' },
    valCritico:   { label:'Valor em Zona Crítica',  icon:'rupture',   color:'#F59E0B', group:'inventario', fmt:'currency', desc:'Produtos com PKL baixo' },
    valRuptura:   { label:'Valor em Ruptura',        icon:'rupture',   color:'#EF4444', group:'inventario', fmt:'currency', desc:'Produtos com estoque zero' },
    pctVerde:     { label:'% Saudável (PKL)',        icon:'checklist', color:'#10B981', group:'inventario', fmt:'pct',      desc:'Percentual de produtos no verde' },
    pctAmarelo:   { label:'% Crítico (PKL)',         icon:'lightning', color:'#F59E0B', group:'inventario', fmt:'pct',      desc:'Percentual de produtos no amarelo' },
    pctVermelho:  { label:'% Ruptura (PKL)',         icon:'rupture',   color:'#EF4444', group:'inventario', fmt:'pct',      desc:'Percentual de produtos no vermelho' },
    // Vendas
    checklist:    { label:'Tarefas Concluídas',      icon:'checklist', color:'#10B981', group:'operacional', fmt:'pct',    desc:'% de tarefas finalizadas' },
    gargalos:     { label:'Gargalos Ativos',         icon:'lightning', color:'#EF4444', group:'operacional', fmt:'number', desc:'Unidades de capacidade em espera' },
    acoes:        { label:'Ações Prioritárias',      icon:'mission',   color:'#F59E0B', group:'operacional', fmt:'number', desc:'Plano de ação do dia' },
    inconsist:    { label:'Inconsistências',         icon:'rupture',   color:'#ef4444', group:'operacional', fmt:'number', desc:'SKUs vendidos sem estoque' },
    // Benchmark
    bmMesquita:   { label:'Score Mesquita',          icon:'benchmark', color:'#60a5fa', group:'benchmark', fmt:'score',   desc:'Score do PDV Mesquita' },
    bmJacare:     { label:'Score Jacarepaguá',       icon:'benchmark', color:'#a78bfa', group:'benchmark', fmt:'score',   desc:'Score do PDV Jacarepaguá' },
    bmBenfica:    { label:'Score Benfica',           icon:'benchmark', color:'#f472b6', group:'benchmark', fmt:'score',   desc:'Score do PDV Benfica' },
    bmHidraul:    { label:'Score Hidráulica',        icon:'benchmark', color:'#34d399', group:'benchmark', fmt:'score',   desc:'Score do PDV Hidráulica' },
    // Tendências
    topGain:      { label:'Top Produto ↑',           icon:'trending',  color:'#10B981', group:'tendencias', fmt:'text',   desc:'Produto com maior ganho de posição' },
    topDrop:      { label:'Top Produto ↓',           icon:'trending',  color:'#EF4444', group:'tendencias', fmt:'text',   desc:'Produto com maior queda de posição' },
    // Equipe
    equipeOnline: { label:'Equipe Online',           icon:'users',     color:'#a78bfa', group:'equipe', fmt:'number',    desc:'Colaboradores ativos no turno' },
  };

  const KPI_GROUPS = {
    inventario:  { label:'📦 Inventário',    color:'#FF8C00' },
    operacional: { label:'⚡ Operacional',   color:'#F59E0B' },
    benchmark:   { label:'📊 Benchmark',     color:'#60a5fa' },
    tendencias:  { label:'📈 Tendências',    color:'#10B981' },
    equipe:      { label:'👥 Equipe',         color:'#a78bfa' },
  };

  // Default layout (5 KPIs)
  const DEFAULT_LAYOUT = ['valTotal','checklist','gargalos','acoes','valRuptura'];

  let _state = {
    open: false,
    activeLayout: [],
    tabActive: 'temas',
  };

  let _initialized = false;

  // ── INIT ─────────────────────────────────────────────────────
  function init() {
    if (_initialized) return;
    _initialized = true;
    _loadLayout();
    _injectCSS();
    _injectHTML();
    _bindEvents();
    console.log('[K11CommandCenter] ✅ Iniciado');
  }

  function _loadLayout() {
    try {
      const saved = JSON.parse(localStorage.getItem('k11_cc_layout') || 'null');
      _state.activeLayout = (Array.isArray(saved) && saved.length > 0) ? saved : [...DEFAULT_LAYOUT];
    } catch { _state.activeLayout = [...DEFAULT_LAYOUT]; }
  }

  // ── KPI DATA RESOLVER ─────────────────────────────────────────
  // Lê os dados reais do APP.db e APP.rankings
  function resolveKPI(kpiId) {
    if (typeof APP === 'undefined' || !APP.db) return '—';
    const db = APP.db, r = APP.rankings;
    const st = r?.pieStats;
    const b  = r?.benchmarking;
    const bi = r?.bi;

    const map = {
      valTotal:    () => { const v = db.produtos?.reduce((a,p)=>a+p.valTotal,0)||0; return 'R$' + _fmt(v); },
      valCritico:  () => 'R$' + _fmt(r?.meta?.valTotalYellow||0),
      valRuptura:  () => 'R$' + _fmt(r?.meta?.valTotalRed||0),
      pctVerde:    () => { const p=st?.total?Math.round(((st.total-st.red-st.yellow)/st.total)*100):0; return p+'%'; },
      pctAmarelo:  () => { const p=st?.total?Math.round((st.yellow/st.total)*100):0; return p+'%'; },
      pctVermelho: () => { const p=st?.total?Math.round((st.red/st.total)*100):0; return p+'%'; },
      checklist:   () => { const t=db.tarefas; if(!t?.length)return '—'; return Math.round((t.filter(x=>x.done).length/t.length)*100)+'%'; },
      gargalos:    () => String(db.ucGlobal?.length||0),
      acoes:       () => String(APP._gerarAcoesPrioritarias?.()?.length||0),
      inconsist:   () => String(r?.meta?.inconsistentes?.length||0),
      bmMesquita:  () => b?.mesquita != null ? b.mesquita+'%' : '—',
      bmJacare:    () => b?.jacarepagua != null ? b.jacarepagua+'%' : '—',
      bmBenfica:   () => b?.benfica != null ? b.benfica+'%' : '—',
      bmHidraul:   () => b?.hidraulica != null ? b.hidraulica+'%' : '—',
      topGain:     () => { const g=bi?.skus?.filter(x=>x.diff>0)[0]||r?.growth?.[0]; return g ? _short(g.desc||g.produto,12) : '—'; },
      topDrop:     () => { const g=bi?.skus?.filter(x=>x.diff<0)[0]||r?.decline?.[0]; return g ? _short(g.desc||g.produto,12) : '—'; },
      equipeOnline:() => '3',
    };
    return map[kpiId] ? map[kpiId]() : '—';
  }

  function _fmt(v) { return v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'k' : String(Math.round(v)); }
  function _short(s, max) { return String(s||'').substring(0, max) + (s?.length > max ? '…' : ''); }

  // ── RENDER DASHBOARD KPIs ─────────────────────────────────────
  function renderDashKPIs() {
    const container = document.getElementById('k11-cc-kpi-row');
    if (!container) return;
    container.innerHTML = _state.activeLayout.map((kpiId, i) => {
      const def  = KPI_REGISTRY[kpiId];
      if (!def) return '';
      const val  = resolveKPI(kpiId);
      const html = (typeof K11SVGIcons !== 'undefined')
        ? K11SVGIcons.kpiCard({ id: kpiId, icon: def.icon, value: val, label: def.label, color: def.color })
        : `<div class="kpi-btn" data-kpi-id="${kpiId}" style="--kpi-color:${def.color}">${val}<br><small>${def.label}</small></div>`;
      return `<div style="animation-delay:${i*60}ms">${html}</div>`;
    }).join('');

    // Start value animations
    setTimeout(() => {
      if (typeof APP !== 'undefined') {
        _state.activeLayout.forEach(kpiId => {
          const el = document.getElementById(`${kpiId}-val`);
          if (!el) return;
          const raw = APP.db?.produtos?.reduce((a,p)=>a+p.valTotal,0)||0;
          if (kpiId === 'valTotal' && raw > 0) APP.actions?.animateValue?.(`${kpiId}-val`, 0, raw, 1200);
        });
      }
    }, 200);
  }

  // ── PANEL HTML ────────────────────────────────────────────────
  function _injectHTML() {
    if (document.getElementById('k11-cc-overlay')) return;
    const themes = typeof K11ThemeEngine !== 'undefined' ? K11ThemeEngine.getAll() : {};

    const themeSwatches = Object.entries(themes).map(([id, t]) => `
      <button class="k11-cc-theme-swatch" data-theme-id="${id}"
        onclick="K11CommandCenter.applyTheme('${id}')"
        style="--sw-color:${t.primary}">
        <div class="swatch-preview">
          <div class="sp-bg" style="background:${t.bg}">
            <div class="sp-bar" style="background:${t.primary}"></div>
            <div class="sp-card" style="background:${t.card};border-color:${t.border}"></div>
          </div>
        </div>
        <div class="swatch-name">${t.emoji} ${t.name}</div>
      </button>`).join('');

    const kpiGroups = Object.entries(KPI_GROUPS).map(([gid, g]) => `
      <div class="k11-cc-kpi-group">
        <div class="kpi-group-title">${g.label}</div>
        <div class="kpi-group-items">
          ${Object.entries(KPI_REGISTRY).filter(([,d])=>d.group===gid).map(([kid, d]) => `
            <div class="k11-cc-kpi-item" data-kpi-id="${kid}"
              onclick="K11CommandCenter.toggleKPI('${kid}')"
              style="--item-color:${d.color}">
              <div class="kpi-item-check" id="kpi-check-${kid}">
                ${_state.activeLayout.includes(kid) ? '✓' : ''}
              </div>
              <div class="kpi-item-ico">
                ${typeof K11SVGIcons !== 'undefined' ? K11SVGIcons.icons[d.icon]?.(20, false) || '' : ''}
              </div>
              <div class="kpi-item-info">
                <div class="kpi-item-label">${d.label}</div>
                <div class="kpi-item-desc">${d.desc}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('');

    const el = document.createElement('div');
    el.id = 'k11-cc-overlay';
    el.innerHTML = `
      <div id="k11-cc-panel">
        <div class="cc-handle" onclick="K11CommandCenter.close()"></div>
        <div class="cc-header">
          <div class="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" class="k11-ico-pulse">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="var(--primary)" stroke-width="2" fill="var(--primary)" fill-opacity=".2"/>
            </svg>
            COMMAND CENTER
          </div>
          <button class="cc-close" onclick="K11CommandCenter.close()">✕</button>
        </div>

        <!-- TABS -->
        <div class="cc-tabs">
          <button class="cc-tab active" data-tab="temas"   onclick="K11CommandCenter.setTab('temas')">🎨 Temas</button>
          <button class="cc-tab"        data-tab="kpis"    onclick="K11CommandCenter.setTab('kpis')">📊 KPIs</button>
          <button class="cc-tab"        data-tab="layout"  onclick="K11CommandCenter.setTab('layout')">⚡ Layout</button>
        </div>

        <!-- TAB: TEMAS -->
        <div class="cc-tab-content" id="cc-tab-temas">
          <div class="cc-section-label">SELECIONAR TEMA</div>
          <div class="cc-themes-grid">${themeSwatches}</div>
          <div class="cc-section-label" style="margin-top:20px">FUNDO 3D</div>
          <div class="cc-toggle-row">
            <div class="cc-toggle-info">
              <div class="cc-toggle-title">Fundo Three.js ativo</div>
              <div class="cc-toggle-sub">Partículas e geometrias animadas</div>
            </div>
            <button class="cc-toggle-sw on" id="cc-bg-toggle" onclick="K11CommandCenter.toggleBG(this)"></button>
          </div>
          <div class="cc-toggle-row">
            <div class="cc-toggle-info">
              <div class="cc-toggle-title">Ícones Animados</div>
              <div class="cc-toggle-sub">SVG com animações ativas</div>
            </div>
            <button class="cc-toggle-sw on" id="cc-anim-toggle" onclick="this.classList.toggle('on')"></button>
          </div>
        </div>

        <!-- TAB: KPIs -->
        <div class="cc-tab-content hidden" id="cc-tab-kpis">
          <div class="cc-section-label">KPIs NO DASHBOARD <span class="cc-badge" id="cc-kpi-count">${_state.activeLayout.length}/8</span></div>
          <div class="cc-kpi-order" id="cc-kpi-order">
            ${_state.activeLayout.map((kid,i) => {
              const d = KPI_REGISTRY[kid];
              return d ? `<div class="cc-kpi-active-item" data-order="${i}" data-kpi="${kid}">
                <span class="material-symbols-outlined" style="font-size:14px;color:var(--text-faint)">drag_handle</span>
                <div style="width:16px;height:16px;flex-shrink:0">${typeof K11SVGIcons !== 'undefined' ? K11SVGIcons.icons[d.icon]?.(16,false)||'' : ''}</div>
                <span style="flex:1;font-size:11px;font-weight:700;color:var(--text-soft)">${d.label}</span>
                <button onclick="K11CommandCenter.removeKPI('${kid}')" style="border:none;background:none;color:var(--danger);cursor:pointer;font-size:13px">✕</button>
              </div>` : '';
            }).join('')}
          </div>
          <div class="cc-section-label" style="margin-top:14px">ADICIONAR KPIs</div>
          <div class="cc-kpi-all" id="cc-kpi-all">${kpiGroups}</div>
        </div>

        <!-- TAB: LAYOUT -->
        <div class="cc-tab-content hidden" id="cc-tab-layout">
          <div class="cc-section-label">GRID DO DASHBOARD</div>
          <div class="cc-grid-options">
            ${[['2','2 colunas','grid_view'],['3','3 colunas','grid_on'],['4','4 colunas','apps']].map(([v,l,ic]) => `
              <button class="cc-grid-btn ${v==='2'?'active':''}" data-cols="${v}" onclick="K11CommandCenter.setGrid('${v}',this)">
                <span class="material-symbols-outlined">${ic}</span>
                <span>${l}</span>
              </button>`).join('')}
          </div>
          <div class="cc-section-label" style="margin-top:16px">DENSIDADE</div>
          <div class="cc-grid-options">
            ${[['compact','Compacto'],['normal','Normal'],['spacious','Espaçoso']].map(([v,l]) => `
              <button class="cc-grid-btn ${v==='normal'?'active':''}" data-density="${v}" onclick="K11CommandCenter.setDensity('${v}',this)">
                <span style="font-size:10px;font-weight:800">${l.toUpperCase()}</span>
              </button>`).join('')}
          </div>
          <div class="cc-section-label" style="margin-top:16px">RESET</div>
          <button class="cc-reset-btn" onclick="K11CommandCenter.reset()">
            <span class="material-symbols-outlined" style="font-size:14px">restart_alt</span>
            Restaurar Padrões
          </button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
  }

  // ── CONTROL FUNCTIONS ────────────────────────────────────────
  function open() {
    _state.open = true;
    const el = document.getElementById('k11-cc-overlay');
    if (!el) { _injectHTML(); setTimeout(() => open(), 50); return; }
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
    _refreshKPIChecks();
  }

  function close() {
    _state.open = false;
    document.getElementById('k11-cc-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  function setTab(tab) {
    _state.tabActive = tab;
    document.querySelectorAll('.cc-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.cc-tab-content').forEach(c => c.classList.toggle('hidden', !c.id.endsWith(tab)));
  }

  function applyTheme(id) {
    if (typeof K11ThemeEngine !== 'undefined') K11ThemeEngine.apply(id);
  }

  function toggleBG(btn) {
    btn.classList.toggle('on');
    const canvas = document.getElementById('k11-threejs-canvas');
    if (canvas) canvas.style.opacity = btn.classList.contains('on') ? '1' : '0';
  }

  function toggleKPI(kid) {
    const idx = _state.activeLayout.indexOf(kid);
    if (idx >= 0) {
      _state.activeLayout.splice(idx, 1);
    } else {
      if (_state.activeLayout.length >= 8) {
        if (typeof APP !== 'undefined') APP.ui?.toast('Máximo de 8 KPIs atingido', 'warning');
        return;
      }
      _state.activeLayout.push(kid);
    }
    _refreshKPIChecks();
    _saveLayout();
    renderDashKPIs();
    _updateActiveList();
  }

  function removeKPI(kid) {
    _state.activeLayout = _state.activeLayout.filter(k => k !== kid);
    _saveLayout();
    renderDashKPIs();
    _refreshKPIChecks();
    _updateActiveList();
  }

  function _updateActiveList() {
    const container = document.getElementById('cc-kpi-order');
    const counter   = document.getElementById('cc-kpi-count');
    if (counter) counter.textContent = `${_state.activeLayout.length}/8`;
    if (!container) return;
    container.innerHTML = _state.activeLayout.map((kid, i) => {
      const d = KPI_REGISTRY[kid];
      return d ? `<div class="cc-kpi-active-item" data-order="${i}" data-kpi="${kid}">
        <span class="material-symbols-outlined" style="font-size:14px;color:var(--text-faint)">drag_handle</span>
        <div style="width:16px;height:16px;flex-shrink:0">${typeof K11SVGIcons !== 'undefined' ? K11SVGIcons.icons[d.icon]?.(16,false)||'' : ''}</div>
        <span style="flex:1;font-size:11px;font-weight:700;color:var(--text-soft)">${d.label}</span>
        <button onclick="K11CommandCenter.removeKPI('${kid}')" style="border:none;background:none;color:var(--danger);cursor:pointer;font-size:13px">✕</button>
      </div>` : '';
    }).join('');
  }

  function _refreshKPIChecks() {
    Object.keys(KPI_REGISTRY).forEach(kid => {
      const el = document.getElementById(`kpi-check-${kid}`);
      if (!el) return;
      el.textContent = _state.activeLayout.includes(kid) ? '✓' : '';
      el.closest('.k11-cc-kpi-item')?.classList.toggle('active', _state.activeLayout.includes(kid));
    });
  }

  function setGrid(cols, btn) {
    document.querySelectorAll('[data-cols]').forEach(b => b.classList.toggle('active', b === btn));
    const row = document.getElementById('k11-cc-kpi-row');
    if (row) row.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    try { localStorage.setItem('k11_cc_grid', cols); } catch {}
  }

  function setDensity(v, btn) {
    document.querySelectorAll('[data-density]').forEach(b => b.classList.toggle('active', b === btn));
    const row = document.getElementById('k11-cc-kpi-row');
    if (!row) return;
    const gaps = { compact:'6px', normal:'10px', spacious:'16px' };
    row.style.gap = gaps[v] || '10px';
    try { localStorage.setItem('k11_cc_density', v); } catch {}
  }

  function reset() {
    if (!confirm('Restaurar layout padrão?')) return;
    _state.activeLayout = [...DEFAULT_LAYOUT];
    _saveLayout();
    renderDashKPIs();
    _refreshKPIChecks();
    _updateActiveList();
    if (typeof K11ThemeEngine !== 'undefined') K11ThemeEngine.apply('obsidian');
    if (typeof APP !== 'undefined') APP.ui?.toast('Layout restaurado ✓', 'success');
  }

  function _saveLayout() {
    try { localStorage.setItem('k11_cc_layout', JSON.stringify(_state.activeLayout)); } catch {}
  }

  function _bindEvents() {
    // Live update KPI values every 30s
    setInterval(() => {
      if (!_state.open) renderDashKPIs();
    }, 30000);
    // Update on data change
    window.addEventListener('estoque:atualizado', () => {
      setTimeout(renderDashKPIs, 400);
    });
  }

  // ── CSS ───────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('k11-cc-css')) return;
    const s = document.createElement('style');
    s.id = 'k11-cc-css';
    s.textContent = `
/* ── COMMAND CENTER ── */
#k11-cc-overlay {
  display:none; position:fixed; inset:0;
  background:rgba(0,0,0,.7); backdrop-filter:blur(8px);
  z-index:2500; align-items:flex-end; justify-content:center;
}
#k11-cc-overlay.open { display:flex; }

#k11-cc-panel {
  background:var(--card-bg);
  border:1px solid var(--border-mid);
  border-radius:24px 24px 0 0;
  width:100%; max-width:500px; max-height:92vh;
  overflow:hidden; display:flex; flex-direction:column;
  transform:translateY(100%);
  transition:transform .38s cubic-bezier(.16,1,.3,1);
  box-shadow:0 -20px 80px rgba(0,0,0,.8);
}
#k11-cc-overlay.open #k11-cc-panel { transform:translateY(0); }

.cc-handle {
  width:36px; height:4px; border-radius:2px;
  background:rgba(255,255,255,.12); margin:12px auto 0;
  cursor:pointer;
}
.cc-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 20px 8px;
}
.cc-title {
  display:flex; align-items:center; gap:8px;
  font-size:13px; font-weight:900; letter-spacing:1px;
  color:var(--primary); text-transform:uppercase;
}
.cc-close {
  width:28px; height:28px; border-radius:50%;
  border:1px solid var(--border-mid); background:rgba(255,255,255,.04);
  color:var(--text-muted); cursor:pointer; font-size:12px;
  display:flex; align-items:center; justify-content:center;
}
.cc-close:hover { color:var(--text-main); }

/* TABS */
.cc-tabs { display:flex; gap:4px; padding:0 16px 12px; }
.cc-tab {
  flex:1; padding:7px; border-radius:10px; font-size:10px; font-weight:800;
  text-transform:uppercase; letter-spacing:.8px; cursor:pointer;
  border:1px solid var(--border); background:transparent;
  color:var(--text-muted); transition:all .15s;
  font-family:var(--font-ui,'Inter',sans-serif);
}
.cc-tab.active {
  background:rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.1);
  border-color:rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.35);
  color:var(--primary);
}

.cc-tab-content {
  flex:1; overflow-y:auto; padding:4px 16px 40px;
  scrollbar-width:thin; scrollbar-color:var(--border-mid) transparent;
}
.cc-tab-content.hidden { display:none; }

.cc-section-label {
  font-size:8px; font-weight:900; letter-spacing:2px; text-transform:uppercase;
  color:var(--text-faint); margin:10px 0 8px;
  display:flex; align-items:center; gap:8px;
}
.cc-badge {
  background:rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.12);
  color:var(--primary); border:1px solid rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.25);
  padding:1px 6px; border-radius:20px; font-size:8px;
}

/* THEME SWATCHES */
.cc-themes-grid {
  display:grid; grid-template-columns:repeat(4,1fr); gap:8px;
}
.k11-cc-theme-swatch {
  border-radius:12px; border:2px solid var(--border); background:transparent;
  cursor:pointer; overflow:hidden; transition:all .2s; padding:0;
}
.k11-cc-theme-swatch.active, .k11-cc-theme-swatch:hover {
  border-color:var(--sw-color);
  box-shadow:0 0 14px rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.3);
  transform:scale(1.04);
}
.swatch-preview { height:50px; overflow:hidden; position:relative; }
.sp-bg { width:100%; height:100%; padding:6px; display:flex; flex-direction:column; gap:3px; }
.sp-bar { height:4px; border-radius:2px; width:70%; }
.sp-card { height:16px; border-radius:4px; border:1px solid; }
.swatch-name { font-size:7px; font-weight:800; letter-spacing:.5px; color:var(--text-muted); padding:4px 6px; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* TOGGLE */
.cc-toggle-row {
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 0; border-bottom:1px solid var(--border);
}
.cc-toggle-title { font-size:12px; font-weight:700; color:var(--text-soft); }
.cc-toggle-sub   { font-size:10px; color:var(--text-muted); margin-top:2px; }
.cc-toggle-sw {
  width:42px; height:24px; border-radius:12px; border:none; cursor:pointer;
  background:var(--border-mid); position:relative; transition:background .2s; flex-shrink:0;
}
.cc-toggle-sw.on { background:rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.4); }
.cc-toggle-sw::after {
  content:''; position:absolute; top:4px; left:4px;
  width:16px; height:16px; border-radius:50%; background:#fff;
  transition:transform .2s; transform:translateX(0);
}
.cc-toggle-sw.on::after { transform:translateX(18px); }

/* KPI ITEMS */
.kpi-group-title {
  font-size:9px; font-weight:900; letter-spacing:1.5px; text-transform:uppercase;
  color:var(--text-muted); padding:8px 0 4px;
}
.kpi-group-items { display:flex; flex-direction:column; gap:4px; margin-bottom:10px; }
.k11-cc-kpi-item {
  display:flex; align-items:center; gap:8px; padding:9px 10px;
  border-radius:10px; border:1px solid var(--border);
  background:rgba(255,255,255,.02); cursor:pointer; transition:all .15s;
}
.k11-cc-kpi-item:hover { background:rgba(255,255,255,.04); border-color:var(--border-mid); }
.k11-cc-kpi-item.active {
  background:rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.06);
  border-color:var(--item-color);
}
.kpi-item-check {
  width:18px; height:18px; border-radius:4px; border:1px solid var(--border-mid);
  display:flex; align-items:center; justify-content:center;
  font-size:10px; color:var(--primary); flex-shrink:0; transition:all .15s;
}
.k11-cc-kpi-item.active .kpi-item-check { background:var(--item-color); border-color:var(--item-color); color:#000; }
.kpi-item-ico { flex-shrink:0; }
.kpi-item-label { font-size:11px; font-weight:700; color:var(--text-soft); }
.kpi-item-desc  { font-size:9px; color:var(--text-muted); margin-top:1px; }

.cc-kpi-active-item {
  display:flex; align-items:center; gap:8px; padding:8px 10px;
  border-radius:8px; border:1px solid var(--border);
  background:rgba(255,255,255,.02); margin-bottom:4px;
}

/* GRID OPTIONS */
.cc-grid-options { display:flex; gap:6px; }
.cc-grid-btn {
  flex:1; padding:8px; border-radius:10px; border:1px solid var(--border);
  background:transparent; color:var(--text-muted); cursor:pointer;
  display:flex; flex-direction:column; align-items:center; gap:4px;
  font-size:10px; font-weight:700; transition:all .15s;
  font-family:var(--font-ui,'Inter',sans-serif);
}
.cc-grid-btn span { font-size:18px; }
.cc-grid-btn.active {
  background:rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.1);
  border-color:rgba(var(--glow-r,255),var(--glow-g,140),var(--glow-b,0),.35);
  color:var(--primary);
}

.cc-reset-btn {
  width:100%; padding:11px; border-radius:10px; border:1px solid var(--border);
  background:rgba(239,68,68,.06); color:var(--danger); cursor:pointer;
  font-size:11px; font-weight:800; letter-spacing:.5px;
  display:flex; align-items:center; justify-content:center; gap:6px;
  margin-top:6px; font-family:var(--font-ui,'Inter',sans-serif);
}

/* ── KPI GRID ROW ── */
#k11-cc-kpi-row {
  display:grid; grid-template-columns:repeat(2,1fr); gap:10px;
  margin:12px 0;
}
@media(min-width:400px) { #k11-cc-kpi-row { grid-template-columns:repeat(3,1fr); } }
@media(min-width:500px) { #k11-cc-kpi-row { grid-template-columns:repeat(4,1fr); } }
`;
    document.head.appendChild(s);
  }

  return { init, open, close, setTab, applyTheme, toggleBG, toggleKPI, removeKPI, setGrid, setDensity, reset, renderDashKPIs, resolveKPI };
})();

window.K11CommandCenter = K11CommandCenter;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', K11CommandCenter.init);
else setTimeout(K11CommandCenter.init, 80);
