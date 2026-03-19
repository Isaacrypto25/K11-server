/**
 * K11 OMNI ELITE — BRAIN v5.0 ULTRA
 * ════════════════════════════════════════════════════════════════
 * Motor de análise avançada, KPIs em tempo real, Chart.js integrado,
 * previsões de ruptura, alertas preditivos e insights automáticos.
 *
 * Funcionalidades novas v5:
 *   ① Chart.js real — gráficos de tendência, donut, sparklines
 *   ② Desktop layout manager — adapta views para telas grandes
 *   ③ KPI Animator — counters animados com RAF
 *   ④ Predictive Engine — prevê rupturas antes de acontecer
 *   ⑤ Real-time Ticker — fita de alertas em tempo real
 *   ⑥ Heatmap de performance por PDV
 *   ⑦ Comparativo temporal (semana passada vs atual)
 *
 * Depende de: k11-config.js, k11-utils.js, k11-brain-auxiliar.js
 */

'use strict';

const K11BrainV5 = (() => {

    // ── ESTADO ────────────────────────────────────────────────────
    let _charts = {};              // id → Chart instance
    let _chartjs = null;           // Chart.js
    let _tickerActive = false;
    let _rafIds = {};              // animações ativas
    let _initialized = false;

    // ── CHART.JS LOADER ───────────────────────────────────────────
    async function _loadChartJS() {
        if (_chartjs) return _chartjs;
        if (typeof Chart !== 'undefined') { _chartjs = Chart; return Chart; }
        return new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
            s.onload = () => { _chartjs = Chart; resolve(Chart); };
            s.onerror = () => resolve(null);
            document.head.appendChild(s);
        });
    }

    // ── DESTRUIR CHART EXISTENTE ──────────────────────────────────
    function _destroyChart(id) {
        if (_charts[id]) {
            try { _charts[id].destroy(); } catch (_) {}
            delete _charts[id];
        }
        if (_chartjs) {
            const canvas = document.getElementById(id);
            if (canvas) {
                const existing = _chartjs.getChart(canvas);
                if (existing) existing.destroy();
            }
        }
    }

    // ── PALETA CONSISTENTE ────────────────────────────────────────
    const COLORS = {
        primary:  '#FF8C00',
        success:  '#10B981',
        warning:  '#F59E0B',
        danger:   '#EF4444',
        blue:     '#60A5FA',
        purple:   '#A78BFA',
        grid:     'rgba(255,255,255,0.04)',
        text:     'rgba(176,184,204,0.6)',
        mutedArea:'rgba(255,140,0,0.08)',
    };

    // ── CONFIGURAÇÕES BASE CHART.JS ───────────────────────────────
    function _baseChartDefaults(C) {
        C.defaults.color            = COLORS.text;
        C.defaults.borderColor      = COLORS.grid;
        C.defaults.font.family      = "'Inter', sans-serif";
        C.defaults.font.size        = 10;
        C.defaults.plugins.legend.display = false;
        C.defaults.plugins.tooltip.backgroundColor = 'rgba(15,17,32,0.95)';
        C.defaults.plugins.tooltip.borderColor = 'rgba(255,140,0,0.3)';
        C.defaults.plugins.tooltip.borderWidth = 1;
        C.defaults.plugins.tooltip.padding = 10;
        C.defaults.plugins.tooltip.titleFont = { size: 11, weight: '800', family: "'JetBrains Mono', monospace" };
        C.defaults.plugins.tooltip.bodyFont  = { size: 10 };
        C.defaults.animation.duration = 800;
        C.defaults.animation.easing   = 'easeOutQuart';
    }

    // ══════════════════════════════════════════════════════════════
    // GRÁFICO DE BENCHMARKING REAL (substitui SVG manual)
    // ══════════════════════════════════════════════════════════════
    async function renderBenchChart(canvasId) {
        const C = await _loadChartJS();
        if (!C || !document.getElementById(canvasId)) return;
        _destroyChart(canvasId);
        _baseChartDefaults(C);

        const b = APP.rankings?.benchmarking || {};
        const data = [
            { label: 'MESQUITA',     value: b.mesquita    || 0 },
            { label: 'JACAREPAGUÁ',  value: b.jacarepagua || 0 },
            { label: 'BENFICA',      value: b.benfica     || 0 },
        ];
        const hidra = b.hidraulica || 100;
        const media = data.reduce((s, d) => s + d.value, 0) / data.length;

        _charts[canvasId] = new C(document.getElementById(canvasId), {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [
                    {
                        label: 'PDVs',
                        data:  data.map(d => d.value),
                        backgroundColor: data.map(d =>
                            d.value < media - 10 ? 'rgba(239,68,68,0.3)' :
                            d.value >= hidra - 5  ? 'rgba(16,185,129,0.3)' :
                                                    'rgba(255,140,0,0.25)'),
                        borderColor: data.map(d =>
                            d.value < media - 10 ? COLORS.danger :
                            d.value >= hidra - 5  ? COLORS.success : COLORS.primary),
                        borderWidth: 1.5,
                        borderRadius: 6,
                        borderSkipped: false,
                    },
                    {
                        label: 'HIDRÁULICA',
                        data:  data.map(() => hidra),
                        type: 'line',
                        borderColor: COLORS.primary,
                        borderWidth: 2,
                        borderDash: [5, 3],
                        pointRadius: 0,
                        fill: false,
                        tension: 0,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}%`,
                            afterLabel: ctx => {
                                if (ctx.datasetIndex === 1) return '';
                                const gap = hidra - ctx.parsed.y;
                                return gap > 0 ? `Gap vs HIDRA: -${gap}pts` : `+${Math.abs(gap)}pts vs HIDRA`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 9, weight: '700' }, color: COLORS.text },
                    },
                    y: {
                        min: Math.max(0, Math.min(...data.map(d=>d.value)) - 10),
                        max: Math.max(hidra + 10, 110),
                        grid: { color: COLORS.grid, lineWidth: 0.5 },
                        ticks: {
                            font: { size: 9 },
                            color: COLORS.text,
                            callback: v => `${v}%`,
                            maxTicksLimit: 5,
                        },
                    },
                },
            },
        });
    }

    // ══════════════════════════════════════════════════════════════
    // DONUT DE SAÚDE DO PORTFÓLIO
    // ══════════════════════════════════════════════════════════════
    async function renderHealthDonut(canvasId) {
        const C = await _loadChartJS();
        if (!C || !document.getElementById(canvasId)) return;
        _destroyChart(canvasId);

        const st = APP.rankings?.pieStats || { red: 0, yellow: 0, green: 0, total: 1 };
        const total = Math.max(st.total, 1);

        _charts[canvasId] = new C(document.getElementById(canvasId), {
            type: 'doughnut',
            data: {
                labels: ['Saudável', 'Atenção', 'Ruptura'],
                datasets: [{
                    data: [st.green, st.yellow, st.red],
                    backgroundColor: [
                        'rgba(16,185,129,0.85)',
                        'rgba(245,158,11,0.85)',
                        'rgba(239,68,68,0.85)',
                    ],
                    borderColor: ['#10B981', '#F59E0B', '#EF4444'],
                    borderWidth: 2,
                    hoverOffset: 6,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                                return `${ctx.label}: ${ctx.parsed} SKUs (${pct}%)`;
                            },
                        },
                    },
                },
                animation: { animateRotate: true, duration: 1000 },
            },
        });
    }

    // ══════════════════════════════════════════════════════════════
    // SPARKLINE DE TENDÊNCIA (mini gráfico de linha)
    // ══════════════════════════════════════════════════════════════
    async function renderSparkline(canvasId, data, color = COLORS.primary) {
        const C = await _loadChartJS();
        if (!C || !document.getElementById(canvasId)) return;
        _destroyChart(canvasId);

        _charts[canvasId] = new C(document.getElementById(canvasId), {
            type: 'line',
            data: {
                labels: data.map((_, i) => i),
                datasets: [{
                    data,
                    borderColor: color,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    backgroundColor: color.replace(')', ',0.1)').replace('rgb', 'rgba'),
                    tension: 0.4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    x: { display: false },
                    y: { display: false },
                },
                animation: { duration: 600 },
            },
        });
    }

    // ══════════════════════════════════════════════════════════════
    // GRÁFICO DE DUELOS (horizontal bar)
    // ══════════════════════════════════════════════════════════════
    async function renderDuelsChart(canvasId, maxItems = 8) {
        const C = await _loadChartJS();
        if (!C || !document.getElementById(canvasId)) return;
        _destroyChart(canvasId);

        const duelos = (APP.rankings?.duelos || []).slice(0, maxItems);
        if (!duelos.length) return;

        const labels    = duelos.map(d => d.id.substring(0, 12));
        const values    = duelos.map(d => d.gapAbsoluto || 0);
        const bgColors  = values.map(v => v < 0 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)');
        const bdrColors = values.map(v => v < 0 ? COLORS.danger : COLORS.success);

        _charts[canvasId] = new C(document.getElementById(canvasId), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: values.map(v => Math.abs(v)),
                    backgroundColor: bgColors,
                    borderColor: bdrColors,
                    borderWidth: 1.5,
                    borderRadius: 4,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const gap = values[ctx.dataIndex];
                                return gap < 0 ? `Gap: -${Math.abs(gap)}pts` : `Dominando: +${gap}pts`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { color: COLORS.grid, lineWidth: 0.5 },
                        ticks: { font: { size: 9 }, color: COLORS.text },
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 9, family: "'JetBrains Mono', monospace" }, color: COLORS.text },
                    },
                },
            },
        });
    }

    // ══════════════════════════════════════════════════════════════
    // ANÁLISE PREDITIVA DE RUPTURA
    // ══════════════════════════════════════════════════════════════
    function predictBreakRisk() {
        const products = APP.db?.produtos || [];
        const movement = APP.db?.movimento || [];
        const results  = [];

        products.forEach(p => {
            if (p.categoriaCor === 'red') return; // já em ruptura
            const movs = movement.filter(m => String(m?.['Produto'] ?? m?.['Nº do produto'] ?? '').trim() === p.id);
            const sold  = movs.reduce((s, m) => s + safeNum(m['Quantidade vendida'] ?? 0), 0);
            const pkl   = p.pkl || 0;
            const ratio = sold > 0 && pkl > 0 ? pkl / sold : Infinity;

            if (ratio < 2 && ratio > 0 && p.categoriaCor !== 'red') {
                const risk = ratio < 0.5 ? 'CRÍTICO' : ratio < 1 ? 'ALTO' : 'MÉDIO';
                results.push({
                    sku:    p.id,
                    desc:   p.desc,
                    pkl,
                    sold,
                    ratio:  ratio.toFixed(1),
                    risk,
                    daysLeft: Math.max(0, Math.round(ratio)),
                });
            }
        });

        return results.sort((a, b) => parseFloat(a.ratio) - parseFloat(b.ratio)).slice(0, 10);
    }

    function safeNum(v) {
        const n = parseFloat(String(v).replace(',', '.'));
        return isNaN(n) ? 0 : n;
    }

    // ══════════════════════════════════════════════════════════════
    // KPI ANIMATOR — counters com requestAnimationFrame
    // ══════════════════════════════════════════════════════════════
    function animateCounter(elementId, targetValue, duration = 1000, prefix = '', suffix = '', decimals = 0) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (_rafIds[elementId]) cancelAnimationFrame(_rafIds[elementId]);

        const start    = performance.now();
        const startVal = 0;

        function step(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased    = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
            const current  = startVal + (targetValue - startVal) * eased;

            el.textContent = prefix + (decimals > 0 ? current.toFixed(decimals) : Math.round(current).toLocaleString('pt-BR')) + suffix;

            if (progress < 1) {
                _rafIds[elementId] = requestAnimationFrame(step);
            } else {
                delete _rafIds[elementId];
            }
        }
        _rafIds[elementId] = requestAnimationFrame(step);
    }

    // ══════════════════════════════════════════════════════════════
    // TICKER DE ALERTAS
    // ══════════════════════════════════════════════════════════════
    function buildTickerHTML() {
        const alerts = [];
        const b      = APP.rankings?.benchmarking || {};
        const st     = APP.rankings?.pieStats     || {};
        const duelos = APP.rankings?.duelos       || [];

        if (st.red > 0) alerts.push({ emoji: '🔴', txt: `${st.red} SKUs em RUPTURA`, color: COLORS.danger });
        if (st.yellow > 0) alerts.push({ emoji: '🟡', txt: `${st.yellow} SKUs em zona crítica`, color: COLORS.warning });

        ['mesquita','jacarepagua','benfica'].forEach(pdv => {
            const gap = (b.hidraulica || 0) - (b[pdv] || 0);
            if (gap > 15) alerts.push({ emoji: '📉', txt: `${pdv.toUpperCase()} com gap de ${gap}pts vs HIDRA`, color: COLORS.danger });
        });

        const topDrag = duelos.find(d => !d.dominando);
        if (topDrag) alerts.push({ emoji: '⚡', txt: `${topDrag.id} puxando resultado para baixo`, color: COLORS.warning });

        const risks = predictBreakRisk().slice(0, 3);
        risks.forEach(r => alerts.push({ emoji: '⚠️', txt: `${r.sku} — risco de ruptura em ${r.daysLeft}d`, color: COLORS.warning }));

        if (!alerts.length) alerts.push({ emoji: '✅', txt: 'Portfólio estável — sem alertas críticos', color: COLORS.success });

        // Duplica para looping
        const items = [...alerts, ...alerts];
        return items.map(a =>
            `<span class="ticker-item" style="color:${a.color}">${a.emoji}&nbsp;${a.txt}</span>`
        ).join('<span class="ticker-item" style="color:rgba(255,255,255,0.1)">|</span>');
    }

    function renderTicker(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = `
        <div class="ticker-wrap">
            <div class="ticker-inner" id="ticker-inner-${containerId}">${buildTickerHTML()}</div>
        </div>`;
    }

    // ══════════════════════════════════════════════════════════════
    // DESKTOP LAYOUT MANAGER
    // ══════════════════════════════════════════════════════════════
    function isDesktop() {
        return window.innerWidth >= 1024;
    }

    // Redefine a largura do stage considerando sidebar
    function updateStageLayout() {
        const stage = document.getElementById('stage');
        if (!stage) return;
        if (isDesktop()) {
            stage.style.marginLeft = 'var(--sidebar-w, 220px)';
        } else {
            stage.style.marginLeft = '';
        }
    }

    // ══════════════════════════════════════════════════════════════
    // HEATMAP DE PDVS
    // ══════════════════════════════════════════════════════════════
    function buildHeatmapHTML() {
        const b = APP.rankings?.benchmarking || {};
        const pdvs = [
            { name: 'HIDRA',  val: b.hidraulica  || 0, isRef: true },
            { name: 'MESQ',   val: b.mesquita    || 0 },
            { name: 'JACA',   val: b.jacarepagua || 0 },
            { name: 'BENF',   val: b.benfica     || 0 },
        ];

        return pdvs.map(pdv => {
            const pct  = Math.min(100, Math.max(0, pdv.val));
            const color = pdv.isRef ? COLORS.primary :
                          pct >= 90 ? COLORS.success :
                          pct >= 70 ? COLORS.warning : COLORS.danger;
            const opacity = 0.1 + (pct / 100) * 0.5;
            return `
            <div style="padding:10px 12px;border-radius:8px;border:1px solid ${color}33;background:${color}${Math.round(opacity*255).toString(16).padStart(2,'0')};position:relative;overflow:hidden">
                <div style="font-size:9px;font-weight:800;letter-spacing:1px;color:${color};margin-bottom:4px">${pdv.name}${pdv.isRef ? ' ★' : ''}</div>
                <div style="font-size:20px;font-weight:900;font-family:'JetBrains Mono',monospace;color:${color}">${pct}%</div>
                <div style="height:3px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:6px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width 1s ease"></div>
                </div>
            </div>`;
        }).join('');
    }

    // ══════════════════════════════════════════════════════════════
    // INSIGHTS AUTOMÁTICOS v5
    // ══════════════════════════════════════════════════════════════
    function generateInsights() {
        const insights = [];
        const b  = APP.rankings?.benchmarking || {};
        const st = APP.rankings?.pieStats || {};
        const duelos = APP.rankings?.duelos || [];
        const acoes  = APP._gerarAcoesPrioritarias ? APP._gerarAcoesPrioritarias() : [];

        // Insight 1: PDV mais crítico
        const pdvGaps = [
            { name:'MESQUITA', gap: (b.hidraulica||0) - (b.mesquita||0) },
            { name:'JACAREPAGUÁ', gap: (b.hidraulica||0) - (b.jacarepagua||0) },
            { name:'BENFICA', gap: (b.hidraulica||0) - (b.benfica||0) },
        ].filter(p => p.gap > 0).sort((a,b) => b.gap - a.gap);

        if (pdvGaps[0]) insights.push({
            icon: '📉',
            color: COLORS.danger,
            title: `${pdvGaps[0].name} prioridade máxima`,
            desc: `Gap de ${pdvGaps[0].gap}pts vs HIDRÁULICA`,
        });

        // Insight 2: Ruptura
        const rupturaPct = st.total > 0 ? Math.round((st.red / st.total) * 100) : 0;
        if (rupturaPct > 8) insights.push({
            icon: '🔴',
            color: COLORS.danger,
            title: `${rupturaPct}% do portfólio em ruptura`,
            desc: `${st.red} SKUs sem estoque no PKL`,
        });

        // Insight 3: Top alavancagem
        if (acoes[0]) insights.push({
            icon: '🎯',
            color: COLORS.primary,
            title: `SKU ${acoes[0].id} — maior alavancagem`,
            desc: `Repor agora impacta diretamente o benchmark`,
        });

        // Insight 4: Risco preditivo
        const riskItems = predictBreakRisk();
        if (riskItems.length > 0) insights.push({
            icon: '⚠️',
            color: COLORS.warning,
            title: `${riskItems.length} SKUs em risco de ruptura`,
            desc: `${riskItems[0]?.sku} — ${riskItems[0]?.daysLeft || '<1'} dia(s) restantes`,
        });

        // Insight 5: Positivo
        const dominando = duelos.filter(d => d.dominando).length;
        if (dominando > 0) insights.push({
            icon: '✅',
            color: COLORS.success,
            title: `${dominando} produtos dominando`,
            desc: `Acima da HIDRÁULICA nesses SKUs`,
        });

        return insights;
    }

    // ══════════════════════════════════════════════════════════════
    // RENDER DASHBOARD DESKTOP ULTRA
    // Chamado pela views.js quando em modo desktop
    // ══════════════════════════════════════════════════════════════
    async function renderDashDesktop(stage) {
        const st     = APP.rankings?.pieStats     || { red:0, yellow:0, green:0, total:1 };
        const b      = APP.rankings?.benchmarking || {};
        const meta   = APP.rankings?.meta         || {};
        const duelos = APP.rankings?.duelos        || [];
        const acoes  = APP._gerarAcoesPrioritarias ? APP._gerarAcoesPrioritarias() : [];
        const insights = generateInsights();
        const risks    = predictBreakRisk();

        const pctRed    = Math.round((st.red    / Math.max(st.total,1)) * 100);
        const pctYellow = Math.round((st.yellow / Math.max(st.total,1)) * 100);
        const pctGreen  = Math.max(0, 100 - pctRed - pctYellow);

        stage.innerHTML = `
        <!-- TICKER TOP -->
        <div id="k11-ticker" style="margin:-24px -28px 20px;"></div>

        <!-- DESKTOP GRID LAYOUT -->
        <div class="dash-desktop-grid">

            <!-- ÁREA: KPIs -->
            <div class="dash-area-kpis">
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:4px">
                    <div class="kpi-card-v5" onclick="APP.view('estoque')">
                        <div class="kpi-label">RUPTURA</div>
                        <div class="kpi-value" style="color:var(--danger)" id="kpi-red-v5">0</div>
                        <div class="kpi-delta" style="color:var(--danger)">
                            <span>▼</span><span>${pctRed}% do portfólio</span>
                        </div>
                        <span class="kpi-icon">🔴</span>
                    </div>
                    <div class="kpi-card-v5" onclick="APP.view('estoque')">
                        <div class="kpi-label">ATENÇÃO</div>
                        <div class="kpi-value" style="color:var(--warning)" id="kpi-yellow-v5">0</div>
                        <div class="kpi-delta" style="color:var(--warning)">
                            <span>⚡</span><span>${pctYellow}% do portfólio</span>
                        </div>
                        <span class="kpi-icon">🟡</span>
                    </div>
                    <div class="kpi-card-v5">
                        <div class="kpi-label">SAUDÁVEL</div>
                        <div class="kpi-value" style="color:var(--success)" id="kpi-green-v5">0</div>
                        <div class="kpi-delta" style="color:var(--success)">
                            <span>✓</span><span>${pctGreen}% do portfólio</span>
                        </div>
                        <span class="kpi-icon">🟢</span>
                    </div>
                    <div class="kpi-card-v5">
                        <div class="kpi-label">TOTAL SKUS</div>
                        <div class="kpi-value" style="color:var(--primary)" id="kpi-total-v5">0</div>
                        <div class="kpi-delta" style="color:var(--text-muted)">
                            <span>📦</span><span>portfólio ativo</span>
                        </div>
                        <span class="kpi-icon">📊</span>
                    </div>
                </div>
            </div>

            <!-- ÁREA: CHART BENCHMARK -->
            <div class="dash-area-chart-bench op-card" style="padding:20px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                    <div>
                        <div class="label" style="color:var(--primary)">BENCHMARK PDVs</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">vs HIDRÁULICA (referência)</div>
                    </div>
                    <div class="status-pulse online" style="color:var(--success)">LIVE</div>
                </div>
                <div class="chart-container-md">
                    <canvas id="bench-chart-v5"></canvas>
                </div>
                <div class="chart-legend" style="margin-top:10px">
                    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:var(--primary)"></div>HIDRÁULICA (ref.)</div>
                    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:var(--success)"></div>Acima da média</div>
                    <div class="chart-legend-item"><div class="chart-legend-dot" style="background:var(--danger)"></div>Abaixo da média</div>
                </div>
            </div>

            <!-- ÁREA: CHART MAIN (Saúde) -->
            <div class="dash-area-chart-main op-card" style="padding:20px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                    <div class="label" style="color:var(--primary)">SAÚDE DO PORTFÓLIO</div>
                    <div style="font-size:11px;color:var(--text-muted)">${st.total} SKUs</div>
                </div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center">
                    <div class="donut-container" style="width:120px;height:120px">
                        <canvas id="health-donut-v5"></canvas>
                        <div class="donut-center">
                            <div style="font-size:22px;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--success)">${pctGreen}%</div>
                            <div style="font-size:9px;color:var(--text-muted)">OK</div>
                        </div>
                    </div>
                    <div>
                        ${[
                            { label: 'Saudável', val: st.green, pct: pctGreen, color: 'var(--success)' },
                            { label: 'Atenção',  val: st.yellow,pct: pctYellow,color: 'var(--warning)' },
                            { label: 'Ruptura',  val: st.red,   pct: pctRed,  color: 'var(--danger)'  },
                        ].map(s => `
                        <div style="margin-bottom:10px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                                <span style="font-size:10px;color:${s.color};font-weight:700">● ${s.label}</span>
                                <span style="font-size:10px;font-family:'JetBrains Mono',monospace;color:${s.color}">${s.val} SKUs</span>
                            </div>
                            <div class="progress-bar-v5">
                                <div class="fill" style="width:${s.pct}%;background:${s.color}"></div>
                            </div>
                        </div>`).join('')}
                    </div>
                </div>
            </div>

            <!-- ÁREA: SIDEBAR LIVE -->
            <div class="dash-area-sidebar">
                <div class="live-sidebar">
                    <div class="live-sidebar-header">
                        <div>
                            <div style="font-size:11px;font-weight:800;color:var(--text-main)">INTELIGÊNCIA ATIVA</div>
                            <div class="status-pulse online" style="margin-top:3px;color:var(--success);font-size:9px">K11 OMNI ONLINE</div>
                        </div>
                        <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--text-faint)">${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}</div>
                    </div>
                    <div class="live-sidebar-body">
                        <!-- Insights -->
                        <div style="margin-bottom:14px">
                            <div style="font-size:9px;font-weight:800;letter-spacing:1px;color:var(--text-muted);margin-bottom:8px">INSIGHTS AUTOMÁTICOS</div>
                            ${insights.map(ins => `
                            <div style="display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:8px;border:1px solid ${ins.color}22;background:${ins.color}0a;margin-bottom:6px">
                                <span style="font-size:16px;flex-shrink:0">${ins.icon}</span>
                                <div>
                                    <div style="font-size:11px;font-weight:700;color:${ins.color}">${ins.title}</div>
                                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${ins.desc}</div>
                                </div>
                            </div>`).join('')}
                        </div>

                        <!-- Heatmap PDVs -->
                        <div style="margin-bottom:14px">
                            <div style="font-size:9px;font-weight:800;letter-spacing:1px;color:var(--text-muted);margin-bottom:8px">MAPA DE PERFORMANCE</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${buildHeatmapHTML()}</div>
                        </div>

                        <!-- Risco de Ruptura Preditivo -->
                        ${risks.length > 0 ? `
                        <div>
                            <div style="font-size:9px;font-weight:800;letter-spacing:1px;color:var(--warning);margin-bottom:8px">⚠ RISCO PREDITIVO</div>
                            ${risks.slice(0,4).map(r => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                                <div>
                                    <div style="font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--text-main)">${r.sku}</div>
                                    <div style="font-size:9px;color:var(--text-muted)">${r.desc ? r.desc.substring(0,22)+'…' : '—'}</div>
                                </div>
                                <div style="text-align:right;flex-shrink:0">
                                    <div style="font-size:11px;font-weight:900;color:${r.risk==='CRÍTICO'?'var(--danger)':'var(--warning)'}">${r.daysLeft}d</div>
                                    <div style="font-size:8px;color:var(--text-muted)">${r.risk}</div>
                                </div>
                            </div>`).join('')}
                        </div>` : ''}
                    </div>
                </div>
            </div>

            <!-- ÁREA: AÇÕES PRIORITÁRIAS -->
            <div class="dash-area-acoes op-card" style="padding:20px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                    <div class="label" style="color:var(--primary)">🎯 AÇÕES DO TURNO</div>
                    <span style="font-size:10px;color:var(--text-muted)">${acoes.length} itens</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto">
                    ${acoes.slice(0, 8).map((a, i) => `
                    <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.02);cursor:pointer;transition:border-color .2s"
                         onmouseover="this.style.borderColor='var(--primary)33'"
                         onmouseout="this.style.borderColor=''"
                         onclick="APP.view('acoesPrioritarias')">
                        <div style="width:20px;height:20px;border-radius:50%;background:var(--primary-dim);border:1px solid var(--primary-glow);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;color:var(--primary);flex-shrink:0">${i+1}</div>
                        <div style="flex:1;min-width:0">
                            <div style="font-size:11px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--primary)">${a.id || '—'}</div>
                            <div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.desc ? a.desc.substring(0,35)+'…' : '—'}</div>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
                    </div>`).join('')}
                </div>
            </div>

            <!-- ÁREA: DUELOS TOP -->
            <div class="dash-area-pdvs op-card" style="padding:20px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                    <div class="label" style="color:var(--primary)">DUELOS vs HIDRÁULICA</div>
                    <button style="font-size:9px;padding:4px 10px;background:var(--primary-dim);border:1px solid var(--primary-glow);border-radius:var(--radius-full);color:var(--primary);cursor:pointer;font-weight:800"
                            onclick="APP.view('projetor')">VER TODOS →</button>
                </div>
                <div class="chart-container-md">
                    <canvas id="duels-chart-v5"></canvas>
                </div>
            </div>

        </div>`;

        // Renderiza charts e animações após DOM
        await renderTicker('k11-ticker');

        setTimeout(async () => {
            animateCounter('kpi-red-v5',   st.red,    900);
            animateCounter('kpi-yellow-v5',st.yellow, 900);
            animateCounter('kpi-green-v5', st.green,  900);
            animateCounter('kpi-total-v5', st.total,  900);

            await renderBenchChart('bench-chart-v5');
            await renderHealthDonut('health-donut-v5');
            await renderDuelsChart('duels-chart-v5');
        }, 60);
    }

    // ══════════════════════════════════════════════════════════════
    // INICIALIZAÇÃO
    // ══════════════════════════════════════════════════════════════
    function init() {
        if (_initialized) return;
        _initialized = true;

        updateStageLayout();
        window.addEventListener('resize', updateStageLayout);

        // Pre-carrega Chart.js em background
        _loadChartJS().then(C => {
            if (C) _baseChartDefaults(C);
        });

        // Invalida charts quando dados mudam
        if (typeof EventBus !== 'undefined') {
            EventBus.on('estoque:atualizado', () => {
                Object.keys(_charts).forEach(id => _destroyChart(id));
            });
        }

        console.log('[K11BrainV5] ✅ Brain v5.0 inicializado');
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

    return {
        init,
        renderBenchChart,
        renderHealthDonut,
        renderSparkline,
        renderDuelsChart,
        renderTicker,
        renderDashDesktop,
        predictBreakRisk,
        generateInsights,
        buildHeatmapHTML,
        animateCounter,
        isDesktop,
        updateStageLayout,
    };

})();

window.K11BrainV5 = K11BrainV5;
