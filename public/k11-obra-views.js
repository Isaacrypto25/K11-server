/**
 * K11 OBRA — VIEWS (Templates HTML)
 * ════════════════════════════════════════════════════════════════
 * Views do módulo K11 OBRA — totalmente integradas ao ecossistema
 * visual do K11 OMNI ELITE (global.css, variáveis CSS corretas).
 *
 * Views:
 *   obraHome()             → Dashboard de obras do usuário
 *   obraDetalhe()          → Detalhe de obra: fases, alertas, estoque
 *   obraEstoque()          → Inventário do canteiro
 *   obraPedidos()          → Pedidos Obramax
 *   obraNovaObra()         → Formulário de criação
 *   obraMateriaisFase()    → Materiais de uma fase
 *
 * Depende de: k11-config.js, k11-utils.js, OBRA (namespace global)
 */
'use strict';

const ObraViews = {

    // ── HOME: LISTA DE OBRAS ─────────────────────────────────
    obraHome() {
        const projetos = OBRA.state.projetos || [];
        const loading  = OBRA.state.loading;

        if (loading) {
            return `
            <div class="op-card" style="margin-bottom:10px">
                ${_sk('40%',10)} ${_sk('100%',48,6)} ${_sk('70%')}
            </div>
            <div class="op-card">${_sk('50%',10)} ${_sk('100%',72)}</div>`;
        }

        const totalObras      = projetos.length;
        const obrasAtivas     = projetos.filter(p => p.status === 'active').length;
        const totalGasto      = projetos.reduce((a, p) => a + (p.total_spent || 0), 0);
        const alertasCriticos = (OBRA.state.alertasGlobais || []).filter(a => a.severity === 'critical' && !a.resolved).length;

        return `
        <div class="op-card" style="margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                <div>
                    <div class="label" style="color:var(--primary);margin-bottom:4px">🏗️ K11 OBRA</div>
                    <div style="font-size:20px;font-weight:900;color:var(--text-main);letter-spacing:-.4px">Minhas Obras</div>
                </div>
                <button class="btn-action pos-tag" onclick="OBRA.actions.abrirNovaObra()"
                        style="background:var(--primary);color:#000;font-weight:800;font-size:12px;padding:10px 18px;border-radius:var(--radius-full)">
                    + NOVA OBRA
                </button>
            </div>

            <div class="kpi-row" style="grid-template-columns:repeat(4,1fr);gap:8px">
                ${_kpi(totalObras,   'OBRAS',       'var(--text-soft)')}
                ${_kpi(obrasAtivas,  'ATIVAS',       'var(--success)', obrasAtivas > 0)}
                ${_kpi(alertasCriticos, 'ALERTAS',  alertasCriticos > 0 ? 'var(--danger)' : 'var(--text-muted)', alertasCriticos > 0)}
                <div class="kpi-btn" style="flex-direction:column;align-items:center">
                    <div style="font-size:14px;font-weight:900;color:var(--primary);font-family:var(--font-mono)">R$${_fmt(totalGasto)}</div>
                    <div class="label-sm" style="margin-top:4px">GASTO TOTAL</div>
                </div>
            </div>
        </div>

        ${projetos.length === 0 ? _emptyObras() : projetos.map(p => _cardObra(p)).join('')}`;
    },

    // ── DETALHE DA OBRA ──────────────────────────────────────
    obraDetalhe() {
        const p       = OBRA.state.projetoAtivo;
        const fases   = OBRA.state.fases   || [];
        const alertas = OBRA.state.alertas || [];

        if (!p) return `<div class="op-card"><p class="txt-muted" style="text-align:center;padding:20px">Nenhuma obra selecionada.</p></div>`;

        const inicio  = _fmtData(p.start_date);
        const fim     = _fmtData(p.predicted_end_date);
        const pct     = Math.min(100, p.progress_pct || 0);
        const pctCor  = pct >= 80 ? 'var(--success)' : pct >= 40 ? 'var(--primary)' : 'var(--warning)';

        return `
        <div class="op-card" style="margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
                <button class="pos-tag" style="font-size:11px;background:rgba(255,255,255,.05);color:var(--text-muted)"
                        onclick="APP.view('obraHome')">← Obras</button>
                <div class="label" style="flex:1;text-align:center">OBRA</div>
                <button class="pos-tag" style="font-size:11px;background:rgba(239,68,68,.1);color:var(--danger);border:1px solid rgba(239,68,68,.3)"
                        onclick="OBRA.actions.excluirObra('${p.id}')">Excluir</button>
            </div>

            <div style="font-size:18px;font-weight:900;color:var(--text-main);letter-spacing:-.4px;margin-bottom:4px">${_esc(p.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">📍 ${_esc(p.address)}</div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
                ${_infoBox('Início',    inicio, '📅')}
                ${_infoBox('Término',   fim,    '🏁')}
                ${_infoBox('Área',      p.area_m2 ? p.area_m2 + ' m²' : '—', '📐')}
                ${_infoBox('Orçamento', 'R$' + _fmt(p.budget || 0), '💰')}
            </div>

            <div style="margin-bottom:6px">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                    <span style="font-size:10px;font-weight:800;letter-spacing:1px;color:var(--text-muted);text-transform:uppercase">Progresso geral</span>
                    <span style="font-size:12px;font-weight:900;color:${pctCor};font-family:var(--font-mono)">${pct}%</span>
                </div>
                <div style="height:6px;background:var(--border-mid);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${pctCor};border-radius:3px;transition:width .8s cubic-bezier(.16,1,.3,1)"></div>
                </div>
            </div>
        </div>

        ${alertas.length > 0 ? _secaoAlertas(alertas) : ''}

        <div class="op-card" style="margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                <div class="label" style="color:var(--primary)">Fases da Obra</div>
                <button class="pos-tag" style="font-size:11px" onclick="OBRA.actions.adicionarFase()">+ Fase</button>
            </div>
            ${fases.length === 0
                ? `<p style="text-align:center;color:var(--text-muted);font-size:12px;padding:16px 0">Nenhuma fase cadastrada.</p>`
                : fases.map(f => _cardFase(f)).join('')}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <button class="op-card" style="border:none;cursor:pointer;text-align:center;padding:16px"
                    onclick="APP.view('obraEstoque')">
                <div style="font-size:22px;margin-bottom:6px">📦</div>
                <div style="font-size:12px;font-weight:800;color:var(--text-main)">Estoque</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${OBRA.state.estoqueCount || 0} itens</div>
            </button>
            <button class="op-card" style="border:none;cursor:pointer;text-align:center;padding:16px"
                    onclick="APP.view('obraPedidos')">
                <div style="font-size:22px;margin-bottom:6px">🛒</div>
                <div style="font-size:12px;font-weight:800;color:var(--text-main)">Pedidos</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${OBRA.state.pedidosCount || 0} pedidos</div>
            </button>
        </div>

        <button class="op-card" style="width:100%;border:none;cursor:pointer;padding:14px;display:flex;align-items:center;gap:10px;margin-bottom:8px;border-color:rgba(255,140,0,.3);background:rgba(255,140,0,.04)"
                onclick="K11OrcamentoIA.open(OBRA.state.projetoAtivo?.id)">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(255,140,0,.12);border:1px solid rgba(255,140,0,.35);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⚡</div>
            <div style="flex:1;text-align:left">
                <div style="font-size:13px;font-weight:900;color:var(--primary)">Orçamento Instantâneo com IA</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Foto, PDF, texto → orçamento completo em segundos</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>

        <button class="op-card" style="width:100%;border:none;cursor:pointer;padding:14px;display:flex;align-items:center;gap:10px;margin-bottom:10px"
                onclick="OBRA.actions.analisarAtrasos()">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);display:flex;align-items:center;justify-content:center;font-size:16px">🧠</div>
            <div style="flex:1;text-align:left">
                <div style="font-size:13px;font-weight:800;color:var(--text-main)">Analisar Cronograma com IA</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Detectar riscos e prever atrasos</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>`;
    },

    // ── ESTOQUE ──────────────────────────────────────────────
    obraEstoque() {
        const p       = OBRA.state.projetoAtivo;
        const estoque = OBRA.state.estoque || [];
        return `
        <div class="op-card" style="margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
                <button class="pos-tag" style="font-size:11px;background:rgba(255,255,255,.05);color:var(--text-muted)"
                        onclick="APP.view('obraDetalhe')">← ${p ? _esc(p.name) : 'Obra'}</button>
                <div class="label" style="flex:1;text-align:center">ESTOQUE</div>
            </div>
            ${estoque.length === 0
                ? `<div style="text-align:center;padding:32px 0">
                       <div style="font-size:36px;margin-bottom:10px">📦</div>
                       <div style="font-size:13px;color:var(--text-muted)">Nenhum item no estoque.</div>
                   </div>`
                : estoque.map(item => `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
                    <div style="width:36px;height:36px;border-radius:10px;background:var(--primary-dim);border:1px solid var(--primary-glow);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:var(--primary);font-family:var(--font-mono);flex-shrink:0">${(item.sku||'—').slice(-3)}</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:12px;font-weight:700;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(item.name || item.sku_obramax || item.sku || '—')}</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${item.quantity || 0} ${item.unit || 'un'}</div>
                    </div>
                    <button class="pos-tag" style="font-size:10px;padding:5px 10px" onclick="OBRA.actions.registrarConsumo('${item.sku||item.id}')">Consumir</button>
                </div>`).join('')}
        </div>`;
    },

    // ── PEDIDOS ──────────────────────────────────────────────
    obraPedidos() {
        const p       = OBRA.state.projetoAtivo;
        const pedidos = OBRA.state.pedidos || [];
        return `
        <div class="op-card" style="margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
                <button class="pos-tag" style="font-size:11px;background:rgba(255,255,255,.05);color:var(--text-muted)"
                        onclick="APP.view('obraDetalhe')">← ${p ? _esc(p.name) : 'Obra'}</button>
                <div class="label" style="flex:1;text-align:center">PEDIDOS</div>
                <button class="pos-tag" style="font-size:11px" onclick="OBRA.actions.novoPedido()">+ Novo</button>
            </div>
            ${pedidos.length === 0
                ? `<div style="text-align:center;padding:32px 0">
                       <div style="font-size:36px;margin-bottom:10px">🛒</div>
                       <div style="font-size:13px;color:var(--text-muted)">Nenhum pedido realizado.</div>
                       <button class="btn-action pos-tag" style="margin-top:12px" onclick="OBRA.actions.novoPedido()">Fazer primeiro pedido</button>
                   </div>`
                : pedidos.map(ped => `
                <div style="padding:12px;border-radius:var(--radius-md);border:1px solid var(--border);background:rgba(255,255,255,.02);margin-bottom:8px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <span style="font-size:12px;font-weight:800;color:var(--text-main);font-family:var(--font-mono)">${_esc(ped.order_number || ped.id)}</span>
                        <span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:var(--radius-full);${_statusPedido(ped.status)}">${ped.status || 'pending'}</span>
                    </div>
                    <div style="font-size:11px;color:var(--text-muted)">Total: <span style="color:var(--primary);font-weight:700">R$${_fmt(ped.total_amount||0)}</span> · ${_fmtData(ped.created_at)}</div>
                </div>`).join('')}
        </div>`;
    },

    // ── FORMULÁRIO NOVA OBRA ─────────────────────────────────
    obraNovaObra() {
        const hoje = new Date().toISOString().split('T')[0];
        return `
        <div class="op-card" style="margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
                <button class="pos-tag" style="font-size:11px;background:rgba(255,255,255,.05);color:var(--text-muted)"
                        onclick="APP.view('obraHome')">← Voltar</button>
                <div class="label" style="flex:1;text-align:center">NOVA OBRA</div>
            </div>

            <div style="display:flex;flex-direction:column;gap:14px">

                <div>
                    <div class="label-sm" style="margin-bottom:6px">NOME DA OBRA *</div>
                    <input id="obra-nome" type="text" class="k11-input" placeholder="Ex: Casa Térrea - Zona Sul"
                           style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);border-radius:var(--radius-md);
                                  background:var(--card-bg);color:var(--text-main);font-size:13px;font-family:var(--font-ui)"/>
                </div>

                <div>
                    <div class="label-sm" style="margin-bottom:6px">ENDEREÇO *</div>
                    <input id="obra-endereco" type="text" class="k11-input" placeholder="Rua, número, bairro, cidade"
                           style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);border-radius:var(--radius-md);
                                  background:var(--card-bg);color:var(--text-main);font-size:13px;font-family:var(--font-ui)"/>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    <div>
                        <div class="label-sm" style="margin-bottom:6px">DATA DE INÍCIO *</div>
                        <input id="obra-inicio" type="date" class="k11-input" value="${hoje}"
                               style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);border-radius:var(--radius-md);
                                      background:var(--card-bg);color:var(--text-main);font-size:13px"/>
                    </div>
                    <div>
                        <div class="label-sm" style="margin-bottom:6px">PREVISÃO TÉRMINO *</div>
                        <input id="obra-fim" type="date" class="k11-input"
                               style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);border-radius:var(--radius-md);
                                      background:var(--card-bg);color:var(--text-main);font-size:13px"/>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    <div>
                        <div class="label-sm" style="margin-bottom:6px">ÁREA (M²)</div>
                        <input id="obra-area" type="number" class="k11-input" placeholder="150"
                               style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);border-radius:var(--radius-md);
                                      background:var(--card-bg);color:var(--text-main);font-size:13px"/>
                    </div>
                    <div>
                        <div class="label-sm" style="margin-bottom:6px">ORÇAMENTO (R$)</div>
                        <input id="obra-orcamento" type="number" class="k11-input" placeholder="50000"
                               style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);border-radius:var(--radius-md);
                                      background:var(--card-bg);color:var(--text-main);font-size:13px"/>
                    </div>
                </div>

                <button id="btn-criar-obra" class="btn-action pos-tag"
                        style="margin-top:6px;padding:14px;width:100%;font-size:13px;font-weight:900;
                               background:var(--primary);color:#000;border-radius:var(--radius-full)"
                        onclick="OBRA.actions.salvarNovaObra()">
                    🔧 CRIAR OBRA
                </button>

            </div>
        </div>`;
    },

    // ── MATERIAIS DE UMA FASE ────────────────────────────────
    obraMateriaisFase(faseId, faseNome) {
        const materiais = OBRA.state.materiaisFase || [];
        return `
        <div class="op-card" style="margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
                <button class="pos-tag" style="font-size:11px;background:rgba(255,255,255,.05);color:var(--text-muted)"
                        onclick="APP.view('obraDetalhe')">← ${_esc(faseNome || 'Fase')}</button>
                <div class="label" style="flex:1;text-align:center">MATERIAIS</div>
            </div>

            ${materiais.length === 0
                ? `<p style="text-align:center;color:var(--text-muted);font-size:12px;padding:16px 0">Nenhum material nesta fase.</p>`
                : materiais.map(m => {
                    const consumido = m.quantity_consumed || 0;
                    const estimado  = m.quantity_estimated || 0;
                    const pct       = estimado > 0 ? Math.min(100, Math.round(consumido / estimado * 100)) : 0;
                    const cor       = pct >= 100 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)';
                    return `
                    <div style="padding:10px 0;border-bottom:1px solid var(--border)">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                            <span style="font-size:12px;font-weight:700;color:var(--text-main)">${_esc(m.name || m.sku_obramax || '—')}</span>
                            <span style="font-size:11px;font-weight:900;color:${cor};font-family:var(--font-mono)">${pct}%</span>
                        </div>
                        <div style="height:4px;background:var(--border-mid);border-radius:2px;margin-bottom:6px;overflow:hidden">
                            <div style="height:100%;width:${pct}%;background:${cor};border-radius:2px"></div>
                        </div>
                        <div style="font-size:10px;color:var(--text-muted)">
                            ${consumido} / ${estimado} ${m.unit || 'un'}
                            ${m.unit_price > 0 ? ` · R$${_fmt(m.unit_price * estimado)}` : ''}
                        </div>
                    </div>`;
                }).join('')}

            <button class="btn-action pos-tag" style="margin-top:14px;width:100%;font-size:12px"
                    onclick="OBRA.actions.pedirMateriais('${faseId}')">
                🛒 Pedir Materiais
            </button>
        </div>`;
    },
};

// ── HELPERS INTERNOS ─────────────────────────────────────────
function _sk(w, h = 16, r = 4) {
    return `<div class="skeleton" style="width:${w};height:${h}px;border-radius:${r}px;margin-bottom:8px"></div>`;
}
function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _fmt(v) {
    if (!v && v !== 0) return '0';
    if (v >= 1000000) return (v/1000000).toFixed(1) + 'M';
    if (v >= 1000) return (v/1000).toFixed(1) + 'k';
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function _fmtData(d) {
    if (!d) return '—';
    return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'2-digit' });
}
function _kpi(val, label, color = 'var(--text-main)', pulse = false) {
    return `<div class="kpi-btn" style="flex-direction:column;align-items:center${pulse?' animation:critPulse 2s infinite':''}">
        <div style="font-size:22px;font-weight:900;color:${color};font-family:var(--font-mono);line-height:1">${val}</div>
        <div class="label-sm" style="margin-top:4px">${label}</div>
    </div>`;
}
function _infoBox(label, val, icon) {
    return `<div style="padding:10px 12px;border-radius:var(--radius-md);border:1px solid var(--border);background:rgba(255,255,255,.02)">
        <div style="font-size:10px;color:var(--text-muted);font-weight:700;letter-spacing:.8px;text-transform:uppercase;margin-bottom:4px">${icon} ${label}</div>
        <div style="font-size:13px;font-weight:800;color:var(--text-main)">${val}</div>
    </div>`;
}
function _statusPedido(status) {
    const m = { pending:'background:rgba(245,158,11,.12);color:var(--warning);border:1px solid rgba(245,158,11,.3)', delivered:'background:rgba(16,185,129,.12);color:var(--success);border:1px solid rgba(16,185,129,.3)', cancelled:'background:rgba(239,68,68,.12);color:var(--danger);border:1px solid rgba(239,68,68,.3)' };
    return m[status] || m.pending;
}
function _cardObra(p) {
    const pct    = Math.min(100, p.progress_pct || 0);
    const pctCor = pct >= 80 ? 'var(--success)' : pct >= 40 ? 'var(--primary)' : 'var(--warning)';
    const status = { active:'var(--success)', paused:'var(--warning)', completed:'var(--text-muted)', cancelled:'var(--danger)' };
    const stCor  = status[p.status] || 'var(--text-muted)';
    return `
    <div class="op-card" style="margin-bottom:8px;cursor:pointer;transition:border-color .2s"
         onclick="OBRA.actions.selecionarProjeto('${p.id}')"
         onmouseover="this.style.borderColor='var(--border-bright)'" onmouseout="this.style.borderColor=''">
        <div style="display:flex;align-items:flex-start;gap:12px">
            <div style="width:42px;height:42px;border-radius:var(--radius-md);background:var(--primary-dim);border:1px solid var(--primary-glow);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🏗️</div>
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
                    <div style="font-size:14px;font-weight:800;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%">${_esc(p.name)}</div>
                    <span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:var(--radius-full);border:1px solid;color:${stCor};border-color:${stCor};background:transparent;flex-shrink:0">${(p.status||'active').toUpperCase()}</span>
                </div>
                <div style="font-size:10px;color:var(--text-muted);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📍 ${_esc(p.address)}</div>
                <div style="display:flex;align-items:center;gap:8px">
                    <div style="flex:1;height:4px;background:var(--border-mid);border-radius:2px;overflow:hidden">
                        <div style="height:100%;width:${pct}%;background:${pctCor};border-radius:2px"></div>
                    </div>
                    <span style="font-size:10px;font-weight:800;color:${pctCor};font-family:var(--font-mono);flex-shrink:0">${pct}%</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:6px">
                    <span style="font-size:10px;color:var(--text-muted)">${_fmtData(p.start_date)} → ${_fmtData(p.predicted_end_date)}</span>
                    ${p.budget ? `<span style="font-size:10px;color:var(--text-muted)">R$${_fmt(p.budget)}</span>` : ''}
                </div>
            </div>
        </div>
    </div>`;
}
function _cardFase(f) {
    const pct    = Math.min(100, f.progress_percent || 0);
    const pctCor = pct >= 100 ? 'var(--success)' : pct > 0 ? 'var(--primary)' : 'var(--text-muted)';
    const stMap  = { completed:'✅', in_progress:'🔄', pending:'⏳' };
    return `
    <div style="padding:10px 12px;border-radius:var(--radius-md);border:1px solid var(--border);background:rgba(255,255,255,.02);margin-bottom:6px;cursor:pointer"
         onclick="OBRA.actions.verMateriaisFase('${f.id}','${_esc(f.name)}')">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:12px;font-weight:800;color:var(--text-main)">${stMap[f.status]||'⏳'} ${_esc(f.name)}</span>
            <span style="font-size:11px;font-weight:900;color:${pctCor};font-family:var(--font-mono)">${pct}%</span>
        </div>
        <div style="height:4px;background:var(--border-mid);border-radius:2px;overflow:hidden;margin-bottom:6px">
            <div style="height:100%;width:${pct}%;background:${pctCor};border-radius:2px;transition:width .6s ease"></div>
        </div>
        <div style="display:flex;justify-content:space-between">
            <span style="font-size:10px;color:var(--text-muted)">${_fmtData(f.start_date)} → ${_fmtData(f.predicted_end_date)}</span>
            <span style="font-size:10px;color:var(--text-muted)">${f.estimated_days||0} dias</span>
        </div>
    </div>`;
}
function _secaoAlertas(alertas) {
    return `
    <div class="op-card" style="margin-bottom:10px;border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.03)">
        <div class="label" style="color:var(--danger);margin-bottom:10px">⚠️ Alertas (${alertas.length})</div>
        ${alertas.slice(0,3).map(a => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(239,68,68,.12)">
            <div style="width:8px;height:8px;border-radius:50%;margin-top:4px;flex-shrink:0;
                        background:${a.severity==='critical'?'var(--danger)':a.severity==='high'?'var(--warning)':'var(--text-muted)'}"></div>
            <div style="flex:1;font-size:11px;color:var(--text-soft)">${_esc(a.message)}</div>
            <button style="font-size:9px;padding:3px 8px;border-radius:var(--radius-full);background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--danger);cursor:pointer;flex-shrink:0"
                    onclick="OBRA.actions.resolverAlerta('${a.id}')">Resolver</button>
        </div>`).join('')}
    </div>`;
}
function _emptyObras() {
    return `
    <div class="op-card" style="text-align:center;padding:40px 24px">
        <div style="font-size:48px;margin-bottom:12px">🏗️</div>
        <div style="font-size:16px;font-weight:800;color:var(--text-main);margin-bottom:8px">Nenhuma obra cadastrada</div>
        <div style="font-size:12px;color:var(--text-muted);line-height:1.6;margin-bottom:20px">
            Cadastre sua obra e tenha controle completo de materiais,<br>cronograma e pedidos integrados à Obramax.
        </div>
        <button class="btn-action pos-tag" style="background:var(--primary);color:#000;font-weight:900;font-size:13px;padding:13px 28px;border-radius:var(--radius-full)"
                onclick="OBRA.actions.abrirNovaObra()">
            🔧 CRIAR PRIMEIRA OBRA
        </button>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// K11 CLIENTE — CHAT + FOTOS
// ════════════════════════════════════════════════════════════
const K11ClienteChat = (() => {
    let _msgs = [];

    function enviar() {
        const input = document.getElementById('cliente-chat-input');
        const text  = input?.value?.trim();
        if (!text) return;
        input.value = '';

        const user = (() => { try { return JSON.parse(sessionStorage.getItem('k11_user')||'{}'); } catch { return {}; } })();
        const msg  = { texto: text, autor: user.nome || 'Cliente', ts: new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}), lado: 'cliente' };
        _msgs.push(msg);
        _renderMsgs();

        // Enviar ao backend (fire & forget)
        const token = typeof K11Auth !== 'undefined' ? K11Auth.getToken() : null;
        const obraId = typeof OBRA !== 'undefined' ? OBRA.state.projetoAtivo?.id : null;
        if (obraId && token) {
            fetch(`${K11_SERVER_URL}/api/obra-chat`, {
                method: 'POST',
                headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
                body: JSON.stringify({ obra_id: obraId, mensagem: text }),
            }).catch(()=>{});
        }
    }

    function _renderMsgs() {
        const container = document.getElementById('cliente-chat-msgs');
        if (!container) return;
        if (!_msgs.length) {
            container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:12px">Nenhuma mensagem ainda</div>';
            return;
        }
        container.innerHTML = _msgs.map(m => `
        <div style="display:flex;flex-direction:column;align-items:${m.lado==='cliente'?'flex-end':'flex-start'}">
            <div style="max-width:80%;background:${m.lado==='cliente'?'var(--primary)':'rgba(255,255,255,.08)'};color:${m.lado==='cliente'?'#000':'var(--text-main)'};border-radius:${m.lado==='cliente'?'12px 12px 2px 12px':'12px 12px 12px 2px'};padding:8px 12px;font-size:12px;">
                ${m.texto}
            </div>
            <div style="font-size:9px;color:var(--text-muted);margin-top:2px;padding:0 4px">${m.autor} · ${m.ts}</div>
        </div>`).join('');
        container.scrollTop = container.scrollHeight;
    }

    return { enviar, _renderMsgs };
})();
window.K11ClienteChat = K11ClienteChat;

const K11ClienteFotos = (() => {
    async function upload(input) {
        const file = input?.files?.[0];
        if (!file) return;
        const obraId = typeof OBRA !== 'undefined' ? OBRA.state.projetoAtivo?.id : null;
        if (!obraId) { if (typeof APP!=='undefined') APP.ui.toast('Selecione uma obra primeiro','danger'); return; }

        if (typeof APP !== 'undefined') APP.ui.toast('Enviando foto...','info');

        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result;
            // Mostrar preview imediatamente
            const galeria = document.getElementById('cliente-galeria');
            if (galeria) {
                const noneMsg = galeria.querySelector('div[style*="grid-column"]');
                if (noneMsg) noneMsg.remove();
                const img = document.createElement('div');
                img.style.cssText = 'aspect-ratio:1;border-radius:8px;overflow:hidden;background:var(--border-mid)';
                img.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover">`;
                galeria.appendChild(img);
            }
            if (typeof APP !== 'undefined') APP.ui.toast('Foto adicionada ✅','success');
        };
        reader.readAsDataURL(file);
        input.value = '';
    }
    return { upload };
})();
window.K11ClienteFotos = K11ClienteFotos;
