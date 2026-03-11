/**
 * K11 OMNI ELITE — VIEWS v4.0
 * ════════════════════════════════════════
 * MELHORIAS v4.0:
 *   ✅ Estoque com projeção de ruptura (dias de cobertura + data estimada)
 *   ✅ Inteligência de Marcas: cross-brand comparison funcional
 *   ✅ Design atualizado: numerador em notificações, badges numerais
 *   ✅ IA conversa inline em cada seção relevante
 *   ✅ Visual moderno — layout denso e informacional
 */

'use strict';

const Views = {

    _skeleton() {
        const sk = (w, h = 18) => `<div class="skeleton" style="width:${w};height:${h}px;border-radius:6px;margin-bottom:8px;"></div>`;
        return `
            <div class="op-card">${sk('55%', 10)} ${sk('100%', 52)} ${sk('80%')} ${sk('90%')}</div>
            <div class="op-card margin-t-12">${sk('45%', 10)} ${sk('100%', 110)}</div>
            <div class="kpi-row margin-t-12">
                <div class="kpi-btn">${sk('60px', 64)}</div>
                <div class="kpi-btn">${sk('60px', 64)}</div>
                <div class="kpi-btn">${sk('60px', 64)}</div>
            </div>`;
    },

    // ══════════════════════════════════════════════════════════════════
    // DASHBOARD — Central de Comando
    // ══════════════════════════════════════════════════════════════════
    dash() {
        const vT          = APP.db.produtos.reduce((a, b) => a + b.valTotal, 0);
        const percT       = APP.db.tarefas.length > 0
            ? Math.round((APP.db.tarefas.filter(t => t.done).length / APP.db.tarefas.length) * 100) : 0;
        const totalUC     = APP.db.ucGlobal.length;
        const vYellow     = APP.rankings.meta.valTotalYellow;
        const vRed        = APP.rankings.meta.valTotalRed;
        const st          = APP.rankings.pieStats;
        const pRed        = Math.round((st.red    / st.total) * 100);
        const pYellow     = Math.round((st.yellow / st.total) * 100);
        const pGreen      = 100 - pRed - pYellow;
        const b           = APP.rankings.benchmarking;
        const inconsCount = APP.rankings.meta.inconsistentes.length;
        const proxRuptura = APP.rankings.topRupturaProxima ?? [];
        const mediaGeral  = Math.round((b.mesquita + b.jacarepagua + b.benfica) / 3);
        const deltaHidra  = b.hidraulica - mediaGeral;
        const acoesPrio   = APP._gerarAcoesPrioritarias();

        const pdvsSorted = [
            { name: 'MESQUITA',    key: 'mesquita',    val: b.mesquita,    gap: 100 - b.mesquita },
            { name: 'JACAREPAGUÁ', key: 'jacarepagua', val: b.jacarepagua, gap: 100 - b.jacarepagua },
            { name: 'BENFICA',     key: 'benfica',     val: b.benfica,     gap: 100 - b.benfica },
        ].sort((a, z) => z.gap - a.gap);
        const worstPDV  = pdvsSorted[0];
        const topDrag   = APP.rankings.duelos[0];
        const pieGradient = `conic-gradient(var(--success) 0% ${pGreen}%, var(--warning) ${pGreen}% ${pGreen + pYellow}%, var(--danger) ${pGreen + pYellow}% 100%)`;

        setTimeout(() => {
            APP.actions.animateValue('val-inv',    0, vT,      ANIM_DURATION_MS);
            APP.actions.animateValue('val-ganhos', 0, vYellow, ANIM_DURATION_MS);
            APP.actions.animateValue('val-red',    0, vRed,    ANIM_DURATION_MS);
        }, 50);
        setTimeout(() => {
            const circ = 2 * Math.PI * 30;
            [['arc_ck', percT], ['arc_uc', Math.min(100, Math.round((totalUC/200)*100))], ['arc_ac', Math.min(100, Math.round((acoesPrio.length/10)*100))]].forEach(([id, pct], i) => {
                const el = document.getElementById(id);
                if (el) setTimeout(() => { el.style.strokeDashoffset = circ * (1 - pct / 100); }, i * 120);
            });
        }, 100);

        // ── Alerta de ruptura iminente ───────────────────────────────
        const ruptAlert = proxRuptura.length > 0
            ? `<div class="alert-ruptura-prox" onclick="APP.view('estoque')">
                <span class="alert-ruptura-ico">🔔</span>
                <span><b>${proxRuptura.length} produto${proxRuptura.length>1?'s':''}</b> com ruptura iminente —
                ${proxRuptura[0] ? `${proxRuptura[0].id} em ~${proxRuptura[0].diasCobertura}d` : ''}</span>
                <span class="alert-ruptura-arr">→</span>
               </div>`
            : '';

        return `
            <!-- BANNER AÇÃO IMEDIATA -->
            <div class="op-card card-action-banner" onclick="APP.view('acoesPrioritarias')">
                <div class="banner-inner">
                    <span class="banner-ico">⚡</span>
                    <div class="banner-body">
                        <div class="banner-label">AÇÃO IMEDIATA</div>
                        <div class="banner-text">
                            ${worstPDV ? `${esc(worstPDV.name)} com gap de ${worstPDV.gap}pts` : 'Nenhum gap crítico'}
                            ${topDrag  ? ` · ${esc(topDrag.id)} arrasta resultado` : ''}
                        </div>
                    </div>
                    <span class="badge-num-red">${acoesPrio.length}</span>
                </div>
            </div>

            ${ruptAlert}

            <!-- KPIs CIRCULARES -->
            <div class="kpi-row margin-t-10">
                ${[
                    { id:'arc_ck', val:percT,   label:'TAREFAS',  sub:`${APP.db.tarefas.filter(t=>t.done).length}/${APP.db.tarefas.length}`, col:'var(--success)',  view:'detalheTarefas' },
                    { id:'arc_uc', val:Math.min(100,Math.round((totalUC/200)*100)), label:'GARGALOS', sub:`${totalUC} UCs`,  col:'var(--warning)',  view:'detalheUC' },
                    { id:'arc_ac', val:Math.min(100,Math.round((acoesPrio.length/10)*100)), label:'AÇÕES',    sub:`${acoesPrio.length} itens`, col:'var(--danger)',   view:'acoesPrioritarias' },
                ].map(k => {
                    const circ = 2 * Math.PI * 30;
                    return `<div class="kpi-btn" onclick="APP.view('${k.view}')">
                        <svg width="70" height="70" viewBox="0 0 70 70">
                            <circle cx="35" cy="35" r="30" fill="none" stroke="var(--border-color)" stroke-width="5"/>
                            <circle id="${k.id}" cx="35" cy="35" r="30" fill="none" stroke="${k.col}" stroke-width="5"
                                stroke-linecap="round"
                                stroke-dasharray="${circ}"
                                stroke-dashoffset="${circ}"
                                transform="rotate(-90 35 35)"
                                style="transition:stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)"/>
                            <text x="35" y="32" text-anchor="middle" font-family="monospace" font-size="11" font-weight="800" fill="${k.col}">${k.val}%</text>
                            <text x="35" y="43" text-anchor="middle" font-family="monospace" font-size="7" fill="var(--text-muted)" letter-spacing="0.3">${k.label}</text>
                        </svg>
                        <div class="kpi-sub">${k.sub}</div>
                    </div>`;
                }).join('')}
            </div>

            <!-- SAÚDE PKL -->
            <div class="op-card border-warning margin-t-10">
                <div class="flex-between align-start">
                    <div style="flex:1">
                        <div class="label txt-warning">COMPOSIÇÃO DE SAÚDE PKL</div>
                        <div class="mono font-18" style="margin:5px 0">R$ <span id="val-inv">0</span></div>
                        <div style="display:flex;gap:10px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
                            <div class="micro-txt txt-warning bold-desc">CRÍTICO: R$ <span id="val-ganhos">0</span></div>
                            <div class="micro-txt txt-danger pulse-danger">ZERADOS: R$ <span id="val-red">0</span></div>
                        </div>
                        <div class="chart-legend">
                            <div onclick="APP.view('detalheCriticos','green')"><span class="dot bg-success"></span>${pGreen}% <span class="micro-txt">SAUDÁVEL</span></div>
                            <div onclick="APP.view('detalheCriticos','yellow')" class="bold-desc"><span class="dot bg-warning"></span>${pYellow}% <span class="micro-txt">ZONA CRÍTICA</span></div>
                            <div onclick="APP.view('detalheCriticos','red')"><span class="dot bg-danger"></span>${pRed}% <span class="micro-txt">ZERADOS</span></div>
                        </div>
                        ${inconsCount > 0 ? `<div class="alert-inline alert-danger margin-t-10" onclick="APP.view('detalheInconsistencias')">⚠ ${inconsCount} SKU${inconsCount>1?'s':''} vendidos sem estoque <span class="micro-txt">→ ver</span></div>` : ''}
                    </div>
                    <div class="pie-container" onclick="APP.view('detalheCriticos','yellow')">
                        <div class="pie-chart" style="background:${pieGradient}">
                            <div class="pie-center"><span class="micro-label">SKUS</span><b class="font-18">${st.total}</b></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MAPA DE ATAQUE PDV -->
            <div class="op-card no-pad overflow-hid margin-t-10">
                <div class="intel-header">
                    <span class="label">MAPA DE ATAQUE — PDVs</span>
                    <span class="micro-txt txt-muted">foco de hoje</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border-color)">
                    ${pdvsSorted.map((pdv, i) => {
                        const prio = i + 1;
                        const bCol = prio===1 ? 'var(--danger)' : prio===2 ? 'var(--warning)' : 'var(--success)';
                        const rank = prio===1 ? '🔴' : prio===2 ? '🟡' : '🟢';
                        return `<div style="background:var(--bg);padding:12px 10px;cursor:pointer;${prio===1?'animation:critPulse 2.5s ease infinite':''}" onclick="APP.actions.mudarAlvo('${pdv.key}')">
                            <span class="micro-txt" style="letter-spacing:1px;color:var(--text-muted)">${rank} #${prio}</span>
                            <div class="bold-desc" style="font-size:10px;letter-spacing:0.5px">${esc(pdv.name)}</div>
                            <div style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700;color:${bCol};line-height:1;margin:4px 0 2px">-${pdv.gap}<span style="font-size:10px">pts</span></div>
                            <div style="background:var(--border-color);height:3px;border-radius:2px;overflow:hidden;margin-top:6px">
                                <div style="width:${pdv.val}%;height:100%;background:${bCol};border-radius:2px;transition:width .8s cubic-bezier(.16,1,.3,1)"></div>
                            </div>
                            <div class="micro-txt" style="margin-top:4px;color:var(--text-muted)">${pdv.val}% vs target</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <!-- IA CONSELHEIRA INLINE -->
            <div class="op-card ia-advisor-card margin-t-10">
                <div class="ia-advisor-header">
                    <span class="ia-dot"></span>
                    <span class="ia-label">K11 BRAIN</span>
                    <span class="badge-num-blue" id="ia-alerts-badge">${APP._aiAlertsCount ?? 0}</span>
                </div>
                <div class="ia-advisor-body" id="ia-quick-insight">
                    <div class="ia-thinking">analisando dados...</div>
                </div>
                <div class="ia-advisor-footer">
                    <button class="ia-btn-ask" onclick="APP.view('chat')">PERGUNTAR À IA →</button>
                    <button class="ia-btn-alerts" onclick="APP.view('iaAlertas')">VER ALERTAS</button>
                </div>
            </div>
        `;
    },

    // ══════════════════════════════════════════════════════════════════
    // ESTOQUE v4 — com PROJEÇÃO DE RUPTURA
    // ══════════════════════════════════════════════════════════════════
    estoque() {
        const f     = APP.ui.filtroEstoque;
        const busca = APP.ui.buscaEstoque.toLowerCase();
        const lista = APP.db.produtos
            .filter(p => p.status === f && (!busca || p.id.toLowerCase().includes(busca) || p.desc.toLowerCase().includes(busca)))
            .sort((a, b) => b.scoreCriticidade - a.scoreCriticidade);

        // Resumo rápido de cobertura
        const comProjecao  = lista.filter(p => p.diasCobertura !== null);
        const proxRuptura  = comProjecao.filter(p => p.diasCobertura <= 7).length;
        const mediaCobert  = comProjecao.length > 0
            ? (comProjecao.reduce((s,p) => s + p.diasCobertura, 0) / comProjecao.length).toFixed(1)
            : null;

        return `
            <!-- FILTROS COM BADGES NUMERAIS -->
            <div class="kpi-row">
                <div class="kpi-btn ${f==='ruptura'?'btn-selected-danger':''}" onclick="APP.actions.setFiltroEstoque('ruptura')">
                    RUPTURAS
                    <span class="badge-num ${f==='ruptura'?'badge-num-red-sel':'badge-num-red'}">${APP.rankings.pieStats.red}</span>
                </div>
                <div class="kpi-btn ${f==='abastecimento'?'btn-selected-primary':''}" onclick="APP.actions.setFiltroEstoque('abastecimento')">
                    REPOSIÇÃO
                    <span class="badge-num ${f==='abastecimento'?'badge-num-pri-sel':'badge-num-pri'}">${APP.rankings.pieStats.yellow}</span>
                </div>
            </div>

            <!-- BARRA DE PROJEÇÃO -->
            ${comProjecao.length > 0 ? `
            <div class="estoque-projection-bar margin-t-10">
                <div class="proj-stat ${proxRuptura > 0 ? 'proj-stat-alert' : ''}">
                    <span class="proj-num">${proxRuptura}</span>
                    <span class="proj-label">RUPTURA EM ≤7D</span>
                </div>
                <div class="proj-divider"></div>
                <div class="proj-stat">
                    <span class="proj-num">${mediaCobert ?? '—'}</span>
                    <span class="proj-label">DIAS MÉD. COBERTURA</span>
                </div>
                <div class="proj-divider"></div>
                <div class="proj-stat">
                    <span class="proj-num">${comProjecao.length}</span>
                    <span class="proj-label">COM PROJEÇÃO</span>
                </div>
            </div>` : ''}

            <input type="text" placeholder="BUSCAR SKU OU PRODUTO..." class="op-input margin-t-10"
                oninput="APP.actions.filtrarEstoque(this.value)"
                value="${esc(APP.ui.buscaEstoque)}">

            <div class="margin-b-80 margin-t-10">
                ${lista.map(p => {
                    const cobert = p.diasCobertura;
                    const cobColor = cobert === null ? 'var(--text-muted)'
                        : cobert <= 3 ? 'var(--danger)'
                        : cobert <= 7 ? 'var(--warning)'
                        : 'var(--success)';
                    const cobLabel = cobert === null ? ''
                        : cobert <= 0 ? 'ZERO'
                        : `${cobert}d`;

                    return `<div class="op-card estoque-card" onclick="APP.actions.preencher('${esc(p.id)}')">
                        <div class="estoque-card-header">
                            <b class="mono">${esc(p.id)}</b>
                            <div class="estoque-card-right">
                                ${cobLabel ? `<span class="cobertura-badge" style="color:${cobColor};border-color:${cobColor}40;background:${cobColor}10">${cobLabel}</span>` : ''}
                                <b>${esc(String(p.total))} UN</b>
                            </div>
                        </div>
                        <div class="bold-desc margin-t-5">${esc(p.desc)}</div>
                        ${p.subStatus !== 'ok' ? `<span class="badge-sub">${esc(p.subStatus)}</span>` : ''}
                        ${p.dataRupturaEstimada ? `
                        <div class="ruptura-proj-line">
                            <span class="ruptura-proj-ico">📅</span>
                            <span>Ruptura estimada: <b style="color:${cobColor}">${p.dataRupturaEstimada}</b></span>
                            ${p.mediaVendaDia > 0 ? `<span class="micro-txt txt-muted">média ${p.mediaVendaDia.toFixed(1)}/dia</span>` : ''}
                        </div>` : ''}
                        <div class="depositos-list margin-t-5">
                            ${p.depositos.map(d => `<div class="end-box-mini mono"><span>${esc(d.tipo)} | <b>${esc(d.pos)}</b></span><b>${esc(String(d.q))}</b></div>`).join('')}
                        </div>
                    </div>`;
                }).join('') || '<div class="centered opacity-5 pad-20">Nenhum item encontrado</div>'}
            </div>`;
    },

    // ══════════════════════════════════════════════════════════════════
    // BI — Inteligência de Mercado com CROSS-BRAND
    // ══════════════════════════════════════════════════════════════════
    mercadoIntel() {
        const bi       = APP.rankings.bi;
        const isMock   = bi?.isMock ?? true;

        const tabs = ['sku', 'subsecao', 'marcas', 'crossbrand'];
        const tabLabels = { sku: 'SKU', subsecao: 'SUBSEÇÃO', marcas: 'DUELO', crossbrand: '🆕 CROSS-BRAND' };
        const activeTab = APP.ui.biTab ?? 'sku';

        return `
            <div class="op-card no-pad overflow-hid">
                <div class="intel-header">
                    <span class="label">INTELIGÊNCIA DE MERCADO</span>
                    <div style="display:flex;align-items:center;gap:8px">
                        ${isMock ? '<span class="badge-mock" title="Dados estimados">ESTIMADO</span>' : ''}
                        <span class="micro-txt txt-muted">PDV atual vs anterior</span>
                    </div>
                </div>

                <!-- TABS -->
                <div class="bi-tabs">
                    ${tabs.map(tab => `
                    <div class="bi-tab ${activeTab === tab ? 'bi-tab-active' : ''}"
                         onclick="APP.actions.setBiTab('${tab}')">
                        ${tabLabels[tab]}
                    </div>`).join('')}
                </div>

                <!-- CONTEÚDO -->
                <div class="bi-content">
                    ${activeTab === 'sku'        ? Views._biTabSku(bi)       : ''}
                    ${activeTab === 'subsecao'   ? Views._biTabSub(bi)       : ''}
                    ${activeTab === 'marcas'     ? Views._biTabMarcas(bi)    : ''}
                    ${activeTab === 'crossbrand' ? Views._biTabCross(bi)     : ''}
                </div>
            </div>`;
    },

    _biTabSku(bi) {
        const growth  = bi?.skus?.filter(x=>x.diff>0).slice(0,10) ?? [];
        const decline = bi?.skus?.filter(x=>x.diff<0).slice(0,10) ?? [];
        return `
            <div class="bi-split">
                <div>
                    <div class="bi-section-title txt-success">↑ CRESCENDO</div>
                    ${growth.map(r => `
                    <div class="bi-row">
                        <div class="bi-row-main">
                            <span class="mono txt-muted" style="font-size:10px">${esc(r.id)}</span>
                            ${r.marca && r.marca !== 'N/ID' ? `<span class="brand-badge">${esc(r.marca)}</span>` : ''}
                        </div>
                        <div class="bi-row-desc">${esc(r.desc.substring(0,32))}</div>
                        <div class="bi-row-nums">
                            <span class="txt-success">+${r.diff}</span>
                            <span class="mono">${r.qAtual}</span>
                        </div>
                    </div>`).join('')}
                </div>
                <div>
                    <div class="bi-section-title txt-danger">↓ CAINDO</div>
                    ${decline.map(r => `
                    <div class="bi-row">
                        <div class="bi-row-main">
                            <span class="mono txt-muted" style="font-size:10px">${esc(r.id)}</span>
                            ${r.marca && r.marca !== 'N/ID' ? `<span class="brand-badge">${esc(r.marca)}</span>` : ''}
                        </div>
                        <div class="bi-row-desc">${esc(r.desc.substring(0,32))}</div>
                        <div class="bi-row-nums">
                            <span class="txt-danger">${r.diff}</span>
                            <span class="mono">${r.qAtual}</span>
                        </div>
                    </div>`).join('')}
                </div>
            </div>`;
    },

    _biTabSub(bi) {
        const subs = bi?.subsecoes ?? [];
        return `<div style="padding:0 15px 14px">
            ${subs.slice(0,15).map(s => {
                const up = s.perc >= 0;
                const pct = Math.abs(s.perc);
                return `<div class="sub-row">
                    <div class="sub-row-name">${esc(s.sub.substring(0,30))}</div>
                    <div class="sub-bar-wrap">
                        <div class="sub-bar" style="width:${Math.min(100, pct)}%;background:${up?'var(--success)':'var(--danger)'}"></div>
                    </div>
                    <span class="sub-pct ${up?'txt-success':'txt-danger'}">${up?'+':''}${s.perc.toFixed(1)}%</span>
                    <span class="micro-txt txt-muted">${s.qAtual}un</span>
                </div>`;
            }).join('')}
        </div>`;
    },

    _biTabMarcas(bi) {
        const todos    = bi?.marcas ?? [];
        const skuIdx   = bi?.skuParaDuelo ?? new Map();
        const buscaRaw = (APP.ui.buscaMarcas ?? '').trim().toUpperCase();
        const subFiltro = APP.ui.filtroMarcaSub ?? '';

        const subsDisp = [...new Set(todos.map(d => d.sub))].sort();
        let duelos = todos;
        let skuResolvido = null;

        if (buscaRaw.length >= 3) {
            const idxPorSku = [];
            skuIdx.forEach((indices, skuId) => {
                if (skuId.toUpperCase().includes(buscaRaw)) indices.forEach(i => idxPorSku.push(i));
            });
            if (idxPorSku.length) {
                duelos = [...new Set(idxPorSku)].map(i => todos[i]).filter(Boolean);
                skuResolvido = buscaRaw;
            } else {
                duelos = todos.filter(d =>
                    d.base.toUpperCase().includes(buscaRaw) ||
                    d.marcas.some(m => m.marca.toUpperCase().includes(buscaRaw))
                );
            }
        }
        if (subFiltro) duelos = duelos.filter(d => d.sub === subFiltro);

        const CORES = ['var(--primary)', '#3B82F6', '#8B5CF6', '#EC4899'];

        return `<div>
            <!-- Busca -->
            <div style="padding:10px 15px 0">
                <div style="position:relative;margin-bottom:8px">
                    <input type="text" placeholder="SKU, PRODUTO OU MARCA..."
                        class="op-input" style="width:100%;padding-left:32px;font-size:11px"
                        oninput="APP.actions.filtrarMarcas(this.value)"
                        value="${esc(APP.ui.buscaMarcas ?? '')}">
                    <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--text-muted);pointer-events:none">🔍</span>
                </div>
                <!-- Pills de subseção -->
                <div class="subsecao-pills">
                    <button class="pill ${!subFiltro?'pill-active':''}" onclick="APP.actions.setFiltroMarcaSub('')">TODAS</button>
                    ${subsDisp.slice(0,10).map(s => `
                    <button class="pill ${subFiltro===s?'pill-active':''}" onclick="APP.actions.setFiltroMarcaSub('${esc(s.replace(/'/g,"\\'"))}')">
                        ${esc(s.length>16 ? s.substring(0,14)+'…' : s)}
                    </button>`).join('')}
                </div>
                ${skuResolvido ? `<div class="sku-resolved-banner">SKU <b>${esc(skuResolvido)}</b> em ${duelos.length} duelo${duelos.length!==1?'s':''}</div>` : ''}
            </div>

            <!-- Duelos -->
            <div style="padding:10px 15px 14px;display:flex;flex-direction:column;gap:10px">
                ${!duelos.length
                    ? `<div class="empty-state">${buscaRaw||subFiltro ? 'Nenhum duelo para este filtro' : 'Sem duelos detectados'}</div>`
                    : duelos.slice(0, 20).map((d, di) => {
                        const total = d.totalVol || 1;
                        const up    = d.totalPerc >= 0;
                        return `<div class="duelo-card">
                            <div class="duelo-header">
                                <div class="duelo-title">
                                    <div class="duelo-base">${esc(d.base.substring(0,42))}</div>
                                    <div class="micro-txt txt-muted">${esc(d.sub)} · ${d.totalVol} un</div>
                                </div>
                                <div class="duelo-actions">
                                    <span class="duelo-perc ${up?'txt-success':'txt-danger'}">${up?'+':''}${d.totalPerc}%</span>
                                    <button class="btn-detail" onclick="APP.actions.abrirDetalhesMarca(${di}, '${subFiltro}', '${buscaRaw}')">DETALHES</button>
                                    <button class="btn-compare" onclick="APP.actions.showComparacaoModal(${di})">📊</button>
                                </div>
                            </div>
                            <div class="marcas-bars">
                                ${d.marcas.slice(0,4).map((m, mi) => {
                                    const share  = Math.round((m.qAtual / total) * 100);
                                    const cor    = CORES[mi] ?? 'var(--border-bright)';
                                    const corVar = m.diff > 0 ? 'var(--success)' : m.diff < 0 ? 'var(--danger)' : 'var(--text-muted)';
                                    const hl     = skuResolvido && m.skus.some(s => s.toUpperCase().includes(skuResolvido));
                                    return `<div class="marca-row ${hl?'marca-row-hl':''}">
                                        <div class="marca-name" style="color:${cor}">${mi===0?'👑 ':''}${esc(m.marca)}</div>
                                        <div class="marca-bar-wrap"><div class="marca-bar" style="width:${share}%;background:${cor}"></div></div>
                                        <div class="marca-stats">
                                            <span class="mono">${share}%</span>
                                            <span style="color:${corVar};font-size:9px">${m.diff>0?'+':''}${m.diff}</span>
                                        </div>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>`;
                    }).join('')
                }
                ${duelos.length > 20 ? `<div class="load-more-hint">+${duelos.length-20} duelos. Refine a busca.</div>` : ''}
            </div>
        </div>`;
    },

    // ── Tab CROSS-BRAND — comparar marcas em todo o portfólio ─────────
    _biTabCross(bi) {
        const marcasGlobal = bi?.marcasGlobal ?? [];
        const m1 = APP.ui.crossBrandM1 ?? '';
        const m2 = APP.ui.crossBrandM2 ?? '';

        const comparacao = (m1 && m2 && bi?.compararMarcas)
            ? bi.compararMarcas(m1, m2) : null;

        const TREND_ICO = { acelerando: '↗', desacelerando: '↘', estavel: '→' };
        const TREND_COL = { acelerando: 'var(--success)', desacelerando: 'var(--danger)', estavel: 'var(--text-muted)' };

        return `<div style="padding:12px 15px 20px">
            <div class="cross-brand-title">
                Compare qualquer marca, em qualquer produto
            </div>

            <!-- Seleção de marcas -->
            <div class="cross-brand-selects">
                <div class="cross-brand-select-wrap">
                    <div class="micro-txt txt-muted margin-b-5">MARCA A</div>
                    <select class="op-input" style="width:100%" onchange="APP.actions.setCrossBrandM1(this.value)">
                        <option value="">Selecionar...</option>
                        ${marcasGlobal.map(m => `<option value="${esc(m.marca)}" ${m.marca===m1?'selected':''}>${esc(m.marca)} (${m.qAtual} un)</option>`).join('')}
                    </select>
                </div>
                <div class="cross-vs">VS</div>
                <div class="cross-brand-select-wrap">
                    <div class="micro-txt txt-muted margin-b-5">MARCA B</div>
                    <select class="op-input" style="width:100%" onchange="APP.actions.setCrossBrandM2(this.value)">
                        <option value="">Selecionar...</option>
                        ${marcasGlobal.map(m => `<option value="${esc(m.marca)}" ${m.marca===m2?'selected':''}>${esc(m.marca)} (${m.qAtual} un)</option>`).join('')}
                    </select>
                </div>
            </div>

            ${comparacao ? `
            <!-- RESULTADO DA COMPARAÇÃO -->
            <div class="cross-result margin-t-12">
                <!-- Líder atual -->
                <div class="cross-lider">
                    <span class="micro-txt txt-muted">LÍDER ATUAL</span>
                    <div class="cross-lider-name">👑 ${esc(comparacao.vencedorAtual)}</div>
                    ${comparacao.mudouLider ? '<span class="cross-mudou-lider">⚡ VIRADA DE POSIÇÃO!</span>' : ''}
                </div>

                <!-- Barras de share -->
                <div class="cross-shares">
                    <div class="cross-share-item">
                        <div class="cross-share-label" style="color:var(--primary)">${esc(comparacao.marcaA)}</div>
                        <div class="cross-share-bar-wrap">
                            <div class="cross-share-bar" style="width:${comparacao.shareA}%;background:var(--primary)"></div>
                        </div>
                        <div class="cross-share-pct">${comparacao.shareA}%</div>
                    </div>
                    <div class="cross-share-item">
                        <div class="cross-share-label" style="color:#3B82F6">${esc(comparacao.marcaB)}</div>
                        <div class="cross-share-bar-wrap">
                            <div class="cross-share-bar" style="width:${comparacao.shareB}%;background:#3B82F6"></div>
                        </div>
                        <div class="cross-share-pct">${comparacao.shareB}%</div>
                    </div>
                </div>

                <!-- Métricas lado a lado -->
                <div class="cross-metrics">
                    <div class="cross-metric-col">
                        <div class="cross-metric-header" style="color:var(--primary)">${esc(comparacao.marcaA)}</div>
                        <div class="cross-metric-val">${comparacao.atual.A} <span class="micro-txt">un atual</span></div>
                        <div class="cross-metric-val">${comparacao.anterior.A} <span class="micro-txt">un anterior</span></div>
                        <div class="cross-metric-trend" style="color:${TREND_COL[comparacao.tendenciaA]}">${TREND_ICO[comparacao.tendenciaA]} ${comparacao.percA > 0 ? '+' : ''}${comparacao.percA}%</div>
                        <div class="micro-txt txt-muted">${comparacao.skusA} SKUs</div>
                    </div>
                    <div class="cross-metric-divider"></div>
                    <div class="cross-metric-col">
                        <div class="cross-metric-header" style="color:#3B82F6">${esc(comparacao.marcaB)}</div>
                        <div class="cross-metric-val">${comparacao.atual.B} <span class="micro-txt">un atual</span></div>
                        <div class="cross-metric-val">${comparacao.anterior.B} <span class="micro-txt">un anterior</span></div>
                        <div class="cross-metric-trend" style="color:${TREND_COL[comparacao.tendenciaB]}">${TREND_ICO[comparacao.tendenciaB]} ${comparacao.percB > 0 ? '+' : ''}${comparacao.percB}%</div>
                        <div class="micro-txt txt-muted">${comparacao.skusB} SKUs</div>
                    </div>
                </div>

                <!-- Tendência de mercado -->
                <div class="cross-tendencia-winner">
                    <span class="micro-txt txt-muted">MELHOR TENDÊNCIA:</span>
                    <b style="color:var(--success)">${esc(comparacao.vencedorTendencia)}</b>
                </div>
            </div>` : `
            <div class="empty-state margin-t-20">
                Selecione duas marcas acima para comparar o desempenho<br>
                <span class="micro-txt">Funciona com marcas de produtos diferentes</span>
            </div>`}

            <!-- Ranking global de marcas -->
            <div class="margin-t-20">
                <div class="label margin-b-10">RANKING GLOBAL DE MARCAS</div>
                ${marcasGlobal.slice(0,10).map((m, i) => {
                    const cor = TREND_COL[m.tendencia];
                    const ico = TREND_ICO[m.tendencia];
                    return `<div class="brand-rank-row">
                        <span class="brand-rank-pos">#${i+1}</span>
                        <span class="brand-rank-name">${i===0?'👑 ':''}${esc(m.marca)}</span>
                        <div class="brand-rank-bar-wrap">
                            <div class="brand-rank-bar" style="width:${m.share}%;background:${i===0?'var(--primary)':'var(--border-bright)'}"></div>
                        </div>
                        <span class="brand-rank-share mono">${m.share}%</span>
                        <span style="color:${cor};font-size:10px;width:40px;text-align:right">${ico} ${Math.abs(m.perc).toFixed(0)}%</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    },

    // ══════════════════════════════════════════════════════════════════
    // IA ALERTAS — Central de notificações numerais
    // ══════════════════════════════════════════════════════════════════
    iaAlertas() {
        const alerts = window.K11_ALERTS ?? [];
        return `
            <div class="op-card">
                <div class="flex-between">
                    <span class="label">ALERTAS DA IA</span>
                    <button class="micro-txt txt-muted" onclick="APP.actions.markAlertsRead()">Marcar tudo como lido</button>
                </div>
                ${!alerts.length ? `<div class="empty-state margin-t-20">Nenhum alerta no momento — tudo sob controle ✓</div>` :
                  alerts.slice().reverse().map(a => {
                    const col = a.severity === 'CRITICO' ? 'var(--danger)' : a.severity === 'AVISO' ? 'var(--warning)' : 'var(--text-muted)';
                    const ico = a.severity === 'CRITICO' ? '🔴' : a.severity === 'AVISO' ? '🟡' : '🔵';
                    return `<div class="ia-alert-card" style="border-left-color:${col}">
                        <div class="ia-alert-header">
                            <span>${ico} ${esc(a.title)}</span>
                            <span class="micro-txt txt-muted">${a.ts ? new Date(a.ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''}</span>
                        </div>
                        <div class="ia-alert-body">${esc(a.body)}</div>
                        ${a.action ? `<div class="ia-alert-action">💡 ${esc(a.action)}</div>` : ''}
                    </div>`;
                  }).join('')
                }
            </div>`;
    },

    // Demais views sem alteração estrutural (apenas pequenas melhorias de badge)
    acoesPrioritarias() {
        const acoes = APP._gerarAcoesPrioritarias();
        const done  = acoes.filter(a => a.done).length;
        return `
            <div class="op-card">
                <div class="flex-between">
                    <span class="label">PLANO DE AÇÃO DO DIA</span>
                    <span class="badge-num badge-num-pri">${done}/${acoes.length}</span>
                </div>
                <div style="background:var(--border-color);height:3px;border-radius:2px;overflow:hidden;margin:10px 0 14px">
                    <div style="width:${acoes.length?Math.round((done/acoes.length)*100):0}%;height:100%;background:var(--success);transition:width .6s ease;border-radius:2px"></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px">
                    ${acoes.map((a, i) => {
                        const acol = a.urgencia==='alta' ? 'var(--danger)' : a.urgencia==='media' ? 'var(--warning)' : 'var(--success)';
                        return `<div onclick="APP.actions.toggleAcao(${i})" style="display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-radius:7px;background:var(--bg);border:1px solid var(--border-color);opacity:${a.done?.45:1};cursor:pointer;transition:opacity .2s">
                            <div style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;background:${acol}22;border:1px solid ${acol}55;color:${acol}">${i+1}</div>
                            <div>
                                <div style="font-size:11px;font-weight:600;${a.done?'text-decoration:line-through':''}">${esc(a.desc)}</div>
                                <div class="micro-txt txt-muted" style="margin-top:2px">${esc(a.meta)}</div>
                            </div>
                            <div style="font-size:14px">${a.done ? '✅' : '○'}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    },

    detalheTarefas() {
        const done  = APP.db.tarefas.filter(t => t.done).length;
        const total = APP.db.tarefas.length;
        const pct   = total > 0 ? Math.round((done/total)*100) : 0;
        return `
            <div class="op-card">
                <div class="flex-between">
                    <span class="label">CONFERÊNCIA DE ROTINA</span>
                    <span class="badge-num badge-num-pri">${done}/${total} — ${pct}%</span>
                </div>
                <div style="height:4px;background:var(--border-color);border-radius:2px;overflow:hidden;margin:10px 0">
                    <div style="width:${pct}%;height:100%;background:${pct===100?'var(--success)':'var(--primary)'};border-radius:2px;transition:width .5s"></div>
                </div>
                <div class="margin-t-10">
                    ${APP.db.tarefas.map(t => `<div class="task-line ${t.done?'done':''}">
                        <span>${esc(t.task)}</span>
                        <span class="material-symbols-outlined" onclick="APP.actions.toggleTask(${t.id})">${t.done?'check_box':'check_box_outline_blank'}</span>
                    </div>`).join('')}
                </div>
                <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR</button>
            </div>`;
    },
};
