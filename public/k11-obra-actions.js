/**
 * K11 OBRA — ACTIONS
 * ════════════════════════════════════
 * Namespace global OBRA — estado + actions + API calls.
 *
 * Depende de: k11-config.js (K11_SERVER_URL, K11Auth)
 */

'use strict';

const OBRA = {

    // ── ESTADO ────────────────────────────────────────────────
    state: {
        projetos:        [],
        projetoAtivo:    null,
        fases:           [],
        alertas:         [],
        alertasGlobais:  [],
        estoque:         [],
        pedidos:         [],
        materiaisFase:   [],
        estoqueCount:    0,
        pedidosCount:    0,
        loading:         false,
    },

    // ── INICIALIZAÇÃO ─────────────────────────────────────────
    async init() {
        // Registrar views no objeto Views do APP principal
        Object.assign(Views, ObraViews);
        // Registrar views no APP.views
        Views.obraHome         = () => ObraViews.obraHome();
        Views.obraDetalhe      = () => ObraViews.obraDetalhe();
        Views.obraEstoque      = () => ObraViews.obraEstoque();
        Views.obraPedidos      = () => ObraViews.obraPedidos();
        Views.obraNovaObra     = () => ObraViews.obraNovaObra();
        Views.obraMateriaisFase = (p) => ObraViews.obraMateriaisFase(p?.faseId, p?.faseNome);

        await OBRA.actions.carregarProjetos();
    },

    // ── ACTIONS ───────────────────────────────────────────────
    actions: {

        // ── GET ──────────────────────────────────────────────
        async carregarProjetos() {
            OBRA.state.loading = true;
            APP.view('obraHome');
            try {
                const res = await OBRA._fetch('/api/obramax/projects');
                OBRA.state.projetos = res.data || [];
            } catch (e) {
                APP.ui.toast('Erro ao carregar obras', 'danger');
            } finally {
                OBRA.state.loading = false;
                APP.view('obraHome');
            }
        },

        async selecionarProjeto(id) {
            const p = OBRA.state.projetos.find(x => x.id === id);
            if (!p) return;
            OBRA.state.projetoAtivo = p;
            OBRA.state.fases        = [];
            OBRA.state.alertas      = [];
            APP.view('obraDetalhe');

            // Carrega dados em paralelo
            try {
                const [fasesRes, alertasRes, estoqueRes, pedidosRes] = await Promise.allSettled([
                    OBRA._fetch(`/api/schedule/phases/${id}`),
                    OBRA._fetch(`/api/obramax/alerts/${id}`),
                    OBRA._fetch(`/api/obramax/inventory/${id}`),
                    OBRA._fetch(`/api/obramax/orders?project_id=${id}`),
                ]);

                if (fasesRes.status === 'fulfilled')   OBRA.state.fases  = fasesRes.value.data || [];
                if (alertasRes.status === 'fulfilled')  OBRA.state.alertas = alertasRes.value.data || [];
                if (estoqueRes.status === 'fulfilled') {
                    OBRA.state.estoque      = estoqueRes.value.data || [];
                    OBRA.state.estoqueCount = OBRA.state.estoque.length;
                }
                if (pedidosRes.status === 'fulfilled') {
                    OBRA.state.pedidos      = pedidosRes.value.data || [];
                    OBRA.state.pedidosCount = OBRA.state.pedidos.length;
                }

                APP.view('obraDetalhe');
            } catch (e) {
                console.error('[K11 OBRA] Erro ao carregar detalhe:', e);
            }
        },

        async verMateriaisFase(faseId, faseNome) {
            try {
                const res = await OBRA._fetch(`/api/schedule/${faseId}/materials`);
                OBRA.state.materiaisFase = res.data || [];
                APP.view('obraMateriaisFase', { faseId, faseNome });
            } catch (e) {
                APP.ui.toast('Erro ao carregar materiais', 'danger');
            }
        },

        // ── CRIAR OBRA ────────────────────────────────────────
        abrirNovaObra() {
            APP.view('obraNovaObra');
        },

        async salvarNovaObra() {
            const nome      = document.getElementById('obra-nome')?.value?.trim();
            const endereco  = document.getElementById('obra-endereco')?.value?.trim();
            const inicio    = document.getElementById('obra-inicio')?.value;
            const fim       = document.getElementById('obra-fim')?.value;
            const area      = parseFloat(document.getElementById('obra-area')?.value) || null;
            const orcamento = parseFloat(document.getElementById('obra-orcamento')?.value) || 0;

            if (!nome || !endereco || !inicio || !fim) {
                APP.ui.toast('Preencha todos os campos obrigatórios', 'danger');
                return;
            }
            if (new Date(fim) <= new Date(inicio)) {
                APP.ui.toast('A data de término deve ser após o início', 'danger');
                return;
            }

            const btn = document.getElementById('btn-criar-obra');
            try {
                if (btn) { btn.textContent = '⏳ Criando...'; btn.disabled = true; }

                const res = await OBRA._fetch('/api/obramax/projects', 'POST', {
                    name: nome, address: endereco,
                    start_date: inicio, predicted_end_date: fim,
                    budget: orcamento, area_m2: area,
                });

                if ((res.success || res.ok) && res.data) {
                    OBRA.state.projetos.unshift(res.data);
                    APP.ui.toast('Obra criada com sucesso! 🏗️', 'success');
                    await OBRA.actions.selecionarProjeto(res.data.id);
                } else {
                    throw new Error(res.error || 'Resposta inválida do servidor');
                }
            } catch (e) {
                APP.ui.toast('Erro ao criar obra: ' + e.message, 'danger');
                if (btn) { btn.textContent = '🔧 CRIAR OBRA'; btn.disabled = false; }
            }
        },

        // ── FASES ─────────────────────────────────────────────
        async analisarAtrasos() {
            const p = OBRA.state.projetoAtivo;
            if (!p) return;
            APP.ui.toast('Analisando cronograma com IA...', 'info');
            try {
                const res = await OBRA._fetch('/api/schedule/predict-delays', 'POST', { project_id: p.id });
                if (res.success && res.analysis) {
                    const a = res.analysis;
                    const rlMap = { low:'✅ Baixo', medium:'⚠️ Médio', high:'🔴 Alto', critical:'🚨 Crítico' };
                    const msg = `Risco: ${rlMap[a.risk_level]||a.risk_level}. ${a.recommendations?.[0]||'Cronograma em ordem.'}`;
                    APP.ui.toast(msg, a.risk_level === 'low' ? 'success' : 'danger');
                    if (res.alerts_created > 0) {
                        await OBRA.actions.selecionarProjeto(p.id);
                    }
                }
            } catch (e) {
                APP.ui.toast('Erro na análise de IA: ' + e.message, 'danger');
            }
        },

        adicionarFase() {
            const p = OBRA.state.projetoAtivo;
            if (!p) return;

            const overlay = document.getElementById('modal-overlay');
            if (!overlay) return;

            const faseOpts = [
                { id: 'fundacao', label: 'Fundação', dias: 20 },
                { id: 'estrutura', label: 'Estrutura', dias: 30 },
                { id: 'alvenaria', label: 'Alvenaria', dias: 45 },
                { id: 'reboco', label: 'Reboco', dias: 30 },
                { id: 'pintura', label: 'Pintura', dias: 15 },
            ];

            overlay.innerHTML = `
                <div class="modal-box" style="max-width:320px">
                    <div class="label" style="color:var(--primary);margin-bottom:14px">ADICIONAR FASE</div>
                    <div style="display:flex;flex-direction:column;gap:12px">
                        <div>
                            <div class="label-sm" style="margin-bottom:6px">TIPO DE FASE</div>
                            <select id="fase-tipo" style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);
                                    border-radius:var(--radius-md);background:var(--card-bg);color:var(--text-main);font-size:13px;font-family:var(--font-ui)">
                                ${faseOpts.map(f => `<option value="${f.id}">${f.label} (~${f.dias} dias)</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <div class="label-sm" style="margin-bottom:6px">DATA DE INÍCIO</div>
                            <input id="fase-inicio" type="date" value="${new Date().toISOString().split('T')[0]}"
                                   style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);
                                          border-radius:var(--radius-md);background:var(--card-bg);color:var(--text-main);font-size:13px"/>
                        </div>
                        <div style="display:flex;gap:8px;margin-top:4px">
                            <button class="pos-tag" style="flex:1;background:rgba(255,255,255,.05);color:var(--text-muted)"
                                    onclick="document.getElementById('modal-overlay').classList.remove('active')">
                                Cancelar
                            </button>
                            <button class="pos-tag btn-action" style="flex:1;background:var(--primary);color:#000;font-weight:800"
                                    onclick="OBRA.actions._confirmarFase()">
                                Criar Fase
                            </button>
                        </div>
                    </div>
                </div>`;
            overlay.classList.add('active');
        },

        async _confirmarFase() {
            const tipo   = document.getElementById('fase-tipo')?.value;
            const inicio = document.getElementById('fase-inicio')?.value;
            const p      = OBRA.state.projetoAtivo;

            document.getElementById('modal-overlay')?.classList.remove('active');

            try {
                const res = await OBRA._fetch('/api/schedule/phases', 'POST', {
                    project_id: p.id, phase_type: tipo,
                    start_date: inicio, area_m2: p.area_m2 || 100,
                });
                if (res.success) {
                    APP.ui.toast(`${res.phase?.name} criada!`, 'success');
                    await OBRA.actions.selecionarProjeto(p.id);
                }
            } catch (e) {
                APP.ui.toast('Erro ao criar fase', 'danger');
            }
        },

        atualizarProgresso(faseId, progressoAtual) {
            const overlay = document.getElementById('modal-overlay');
            if (!overlay) return;

            overlay.innerHTML = `
                <div class="modal-box" style="max-width:280px">
                    <div class="label" style="margin-bottom:12px">ATUALIZAR PROGRESSO</div>
                    <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">
                        Progresso atual: <strong>${progressoAtual}%</strong>
                    </div>
                    <input id="novo-progresso" type="range" min="0" max="100"
                           value="${progressoAtual}" style="width:100%;margin-bottom:8px"
                           oninput="document.getElementById('prog-val').textContent=this.value+'%'"/>
                    <div id="prog-val" style="text-align:center;font-size:18px;font-weight:700;
                                               color:var(--primary);margin-bottom:16px">
                        ${progressoAtual}%
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="pos-tag" style="flex:1;background:rgba(255,255,255,.05);color:var(--text-muted)"
                                onclick="document.getElementById('modal-overlay').classList.remove('active')">
                            Cancelar
                        </button>
                        <button class="pos-tag btn-action" style="flex:1"
                                onclick="OBRA.actions._salvarProgresso('${faseId}')">
                            Salvar
                        </button>
                    </div>
                </div>`;
            overlay.classList.add('active');
        },

        async _salvarProgresso(faseId) {
            const pct = parseInt(document.getElementById('novo-progresso')?.value || '0');
            document.getElementById('modal-overlay')?.classList.remove('active');
            try {
                await OBRA._fetch(`/api/schedule/${faseId}/update-progress`, 'POST', { progress_percent: pct });
                APP.ui.toast('Progresso atualizado!', 'success');
                await OBRA.actions.selecionarProjeto(OBRA.state.projetoAtivo.id);
            } catch (e) {
                APP.ui.toast('Erro ao atualizar progresso', 'danger');
            }
        },

        // ── IA ────────────────────────────────────────────────
        async verificarAtrasos() {
            const p = OBRA.state.projetoAtivo;
            if (!p) return;
            APP.ui.toast('🤖 IA analisando cronograma...', 'info');
            try {
                const res = await OBRA._fetch('/api/schedule/predict-delays', 'POST', { project_id: p.id });
                if (res.success) {
                    const nivel = { low: '🟢 Baixo', medium: '🟡 Médio', high: '🔴 Alto', critical: '🚨 Crítico' };
                    APP.ui.toast(`Risco: ${nivel[res.analysis?.risk_level] || res.analysis?.risk_level}`, 'info');
                    await OBRA.actions.selecionarProjeto(p.id);
                }
            } catch (e) {
                APP.ui.toast('Erro na análise de IA', 'danger');
            }
        },

        // ── ESTOQUE DO CANTEIRO ───────────────────────────────
        registrarEntradaEstoque() {
            const overlay = document.getElementById('modal-overlay');
            if (!overlay) return;

            overlay.innerHTML = `
                <div class="modal-box" style="max-width:320px">
                    <div class="label" style="margin-bottom:12px">ENTRADA NO CANTEIRO</div>
                    <div style="display:flex;flex-direction:column;gap:10px">
                        <div>
                            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">SKU / CÓDIGO</div>
                            <input id="inv-sku" type="text" placeholder="Ex: CIM001"
                                   style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);
                                          border-radius:var(--radius-md);background:var(--card-bg);color:var(--text-main);font-size:13px"/>
                        </div>
                        <div>
                            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">DESCRIÇÃO</div>
                            <input id="inv-nome" type="text" placeholder="Nome do material"
                                   style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);
                                          border-radius:var(--radius-md);background:var(--card-bg);color:var(--text-main);font-size:13px"/>
                        </div>
                        <div>
                            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">QUANTIDADE</div>
                            <input id="inv-qtd" type="number" placeholder="0" min="0"
                                   style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);
                                          border-radius:var(--radius-md);background:var(--card-bg);color:var(--text-main);font-size:13px"/>
                        </div>
                        <div>
                            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">OBSERVAÇÃO</div>
                            <input id="inv-obs" type="text" placeholder="Opcional"
                                   style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);
                                          border-radius:var(--radius-md);background:var(--card-bg);color:var(--text-main);font-size:13px"/>
                        </div>
                        <div style="display:flex;gap:8px;margin-top:4px">
                            <button class="pos-tag" style="flex:1;background:rgba(255,255,255,.05);color:var(--text-muted)"
                                    onclick="document.getElementById('modal-overlay').classList.remove('active')">
                                Cancelar
                            </button>
                            <button class="pos-tag btn-action" style="flex:1"
                                    onclick="OBRA.actions._confirmarEntrada()">
                                Registrar
                            </button>
                        </div>
                    </div>
                </div>`;
            overlay.classList.add('active');
        },

        async _confirmarEntrada() {
            const sku   = document.getElementById('inv-sku')?.value?.trim();
            const nome  = document.getElementById('inv-nome')?.value?.trim();
            const qtd   = parseFloat(document.getElementById('inv-qtd')?.value) || 0;
            const obs   = document.getElementById('inv-obs')?.value?.trim();
            const p     = OBRA.state.projetoAtivo;

            if (!sku || qtd <= 0) {
                APP.ui.toast('SKU e quantidade são obrigatórios', 'danger');
                return;
            }
            document.getElementById('modal-overlay')?.classList.remove('active');

            try {
                await OBRA._fetch('/api/obramax/inventory', 'POST', {
                    project_id: p.id, sku, name: nome || sku,
                    quantity_in: qtd, notes: obs,
                });
                APP.ui.toast('Entrada registrada!', 'success');
                await OBRA.actions.selecionarProjeto(p.id);
                APP.view('obraEstoque');
            } catch (e) {
                APP.ui.toast('Erro ao registrar entrada', 'danger');
            }
        },

        registrarConsumo(sku, nome, saldoAtual) {
            const itemId = sku;
            const overlay = document.getElementById('modal-overlay');
            if (!overlay) return;

            overlay.innerHTML = `
                <div class="modal-box" style="max-width:280px">
                    <div class="label" style="margin-bottom:8px">REGISTRAR CONSUMO</div>
                    <div style="font-size:13px;color:var(--text-main);margin-bottom:4px">${esc(nome)}</div>
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">
                        Saldo atual: <strong>${saldoAtual}</strong>
                    </div>
                    <input id="consumo-qtd" type="number" placeholder="Qtd consumida" min="0.1" step="0.1"
                           style="width:100%;padding:11px 14px;border:1px solid var(--border-mid);
                                  border-radius:var(--radius-md);background:var(--card-bg);color:var(--text-main);font-size:13px;
                                  margin-bottom:12px"/>
                    <div style="display:flex;gap:8px">
                        <button class="pos-tag" style="flex:1;background:rgba(255,255,255,.05);color:var(--text-muted)"
                                onclick="document.getElementById('modal-overlay').classList.remove('active')">
                            Cancelar
                        </button>
                        <button class="pos-tag btn-action" style="flex:1"
                                onclick="OBRA.actions._confirmarConsumo('${itemId}')">
                            Confirmar
                        </button>
                    </div>
                </div>`;
            overlay.classList.add('active');
        },

        async _confirmarConsumo(itemId) {
            const qtd = parseFloat(document.getElementById('consumo-qtd')?.value) || 0;
            if (qtd <= 0) { APP.ui.toast('Informe a quantidade', 'danger'); return; }
            document.getElementById('modal-overlay')?.classList.remove('active');
            try {
                const p = OBRA.state.projetoAtivo;
                await OBRA._fetch(`/api/obramax/inventory/${p?.id}/consume`, 'POST', { sku: itemId, quantity: qtd });
                APP.ui.toast('Consumo registrado!', 'success');
                await OBRA.actions.selecionarProjeto(OBRA.state.projetoAtivo.id);
                APP.view('obraEstoque');
            } catch (e) {
                APP.ui.toast('Erro ao registrar consumo', 'danger');
            }
        },

        // ── ALERTAS ───────────────────────────────────────────
        async resolverAlerta(alertaId) {
            try {
                await OBRA._fetch(`/api/obramax/alerts/${alertaId}/resolve`, 'POST');
                OBRA.state.alertas = OBRA.state.alertas.filter(a => a.id !== alertaId);
                APP.view('obraDetalhe');
                APP.ui.toast('Alerta resolvido', 'success');
            } catch (e) {
                APP.ui.toast('Erro ao resolver alerta', 'danger');
            }
        },

        // ── PEDIDOS ───────────────────────────────────────────
        async excluirObra(id) {
            if (!confirm('Excluir esta obra? Esta ação não pode ser desfeita.')) return;
            try {
                await OBRA._fetch('/api/obramax/projects/' + id, 'DELETE');
                OBRA.state.projetos = OBRA.state.projetos.filter(p => p.id !== id);
                OBRA.state.projetoAtivo = null;
                APP.ui.toast('Obra excluída.', 'success');
                APP.view('obraHome');
            } catch (e) {
                APP.ui.toast('Erro ao excluir obra: ' + e.message, 'danger');
            }
        },

        novoPedido() {
            // Abre catálogo de produtos dentro do contexto da obra atual
            const obraId   = OBRA.state.projetoAtivo?.id;
            const obraNome = OBRA.state.projetoAtivo?.name;

            // Inicializa o estado do catálogo voltado para essa obra
            if (window._K11CAT) {
                window._K11CAT.loaded       = false;
                window._K11CAT.secaoAtiva   = null;
                window._K11CAT.subSecaoAtiva = null;
                window._K11CAT.busca        = '';
            }

            // Exibe modal de confirmação se houver obra ativa
            if (obraId) {
                APP.ui.toast(`🛒 Catálogo aberto para "${obraNome}"`, 'success');
            }

            // Navega para o catálogo do portal do cliente
            APP.view('clienteCatalogo');
        },

        verPedido(pedidoId) {
            if (!pedidoId) return;
            const ped = (OBRA.state.pedidos || []).find(p => p.id === pedidoId || p.order_number === pedidoId);
            if (!ped) {
                APP.ui.toast('Pedido não encontrado.', 'error');
                return;
            }

            // Monta modal com detalhe do pedido
            const itens  = Array.isArray(ped.itens) ? ped.itens : [];
            const total  = ped.total_amount || ped.total || 0;
            const status = ped.status || 'pending';
            const statusLabels = {
                pending:   { txt: 'Aguardando',   cor: 'var(--warning)' },
                confirmed: { txt: 'Confirmado',   cor: 'var(--primary)' },
                shipped:   { txt: 'Em trânsito',  cor: 'var(--primary)' },
                delivered: { txt: 'Entregue',     cor: 'var(--success)' },
                cancelled: { txt: 'Cancelado',    cor: 'var(--danger)'  },
            };
            const st = statusLabels[status] || { txt: status, cor: 'var(--text-muted)' };

            const conteudo = `
            <div style="padding:16px;max-height:75vh;overflow-y:auto">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                    <div>
                        <div style="font-size:14px;font-weight:900;color:var(--text-main);font-family:var(--font-mono)">${ped.order_number || ped.id}</div>
                        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${new Date(ped.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</div>
                    </div>
                    <span style="font-size:11px;font-weight:800;padding:4px 10px;border-radius:var(--radius-full);background:rgba(0,0,0,.1);color:${st.cor}">${st.txt}</span>
                </div>

                ${itens.length > 0 ? `
                <div style="margin-bottom:14px">
                    <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">ITENS DO PEDIDO</div>
                    ${itens.map(i => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                        <div style="flex:1;min-width:0">
                            <div style="font-size:12px;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${i.name || i.sku || '—'}</div>
                            <div style="font-size:10px;color:var(--text-muted)">${i.sku||''} · Qtd: ${i.qty||i.quantity||1} ${i.unit||'un'}</div>
                        </div>
                        <div style="font-size:12px;font-weight:700;color:var(--primary);flex-shrink:0;margin-left:10px">
                            R$ ${((i.subtotal||0)||(( i.price_unit||i.price||0)*(i.qty||1))).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                        </div>
                    </div>`).join('')}
                </div>` : `<div style="font-size:12px;color:var(--text-muted);padding:12px 0">Sem detalhes de itens.</div>`}

                <div style="background:var(--primary-dim);border:1px solid var(--border-glow);border-radius:var(--radius-md);padding:12px">
                    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800">
                        <span style="color:var(--text-soft)">Total do pedido</span>
                        <span style="color:var(--primary)">R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                    </div>
                    ${ped.endereco_entrega ? `<div style="font-size:10px;color:var(--text-muted);margin-top:6px">📍 ${ped.endereco_entrega}</div>` : ''}
                    ${ped.previsao_entrega ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px">🚚 Previsão: ${new Date(ped.previsao_entrega+'T00:00:00').toLocaleDateString('pt-BR')}</div>` : ''}
                </div>
            </div>
            <div style="padding:0 16px 16px;display:flex;gap:8px">
                <button onclick="document.getElementById('k11-modal').style.display='none'"
                    style="flex:1;padding:11px;border:1px solid var(--border-mid);border-radius:var(--radius-md);background:transparent;color:var(--text-soft);font-size:12px;font-weight:700;cursor:pointer">
                    Fechar
                </button>
            </div>`;

            // Usa o modal global do K11 se disponível
            const modal = document.getElementById('k11-modal');
            if (modal) {
                modal.innerHTML = `
                <div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center" onclick="if(event.target===this)this.style.display='none'">
                    <div style="width:100%;max-width:480px;background:var(--bg);border-radius:var(--radius-md) var(--radius-md) 0 0;overflow:hidden;animation:slideUp .2s ease">
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid var(--border)">
                            <div style="font-size:13px;font-weight:900;color:var(--text-main)">Detalhes do Pedido</div>
                            <button onclick="this.closest('[style*=fixed]').style.display='none'" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer">✕</button>
                        </div>
                        ${conteudo}
                    </div>
                </div>`;
                modal.style.display = 'block';
            } else {
                APP.ui.toast(`Pedido ${ped.order_number || ped.id} — Total: R$ ${total.toFixed(2)}`, 'info');
            }
        },

        async pedirMateriais(faseId) {
            // Abre catálogo filtrado para materiais de construção
            if (window._K11CAT) {
                window._K11CAT.loaded        = false;
                window._K11CAT.secaoAtiva    = null;
                window._K11CAT.subSecaoAtiva = null;
                window._K11CAT.busca         = '';
            }
            APP.ui.toast('📦 Abrindo catálogo para solicitar materiais...', 'info');
            setTimeout(() => APP.view('clienteCatalogo'), 400);
        },
    },

    // ── HELPER HTTP ───────────────────────────────────────────
    async _fetch(path, method = 'GET', body = null) {
        const token = K11Auth.getToken();
        const opts  = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        };
        if (body) opts.body = JSON.stringify(body);

        const res = await fetch(K11_SERVER_URL + path, opts);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    },
};
