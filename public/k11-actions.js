/**
 * K11 OMNI ELITE — ACTIONS (Handlers de Interação)
 * ══════════════════════════════════════════════════
 * Funções chamadas diretamente pelo HTML via onclick="APP.actions.xxx()".
 * Modificam estado (APP.db, APP.ui) e geralmente chamam APP.view() para re-renderizar.
 *
 * Depende de: k11-config.js, k11-utils.js, k11-ui.js
 */

'use strict';

const Actions = {

    animateValue(id, start, end, duration) {
        const obj = document.getElementById(id);
        if (!obj) return;
        if (APP.ui._rafIds[id]) cancelAnimationFrame(APP.ui._rafIds[id]);
        let startT = null;
        const step = (t) => {
            if (!startT) startT = t;
            const progress = Math.min((t - startT) / duration, 1);
            const eased    = 1 - Math.pow(1 - progress, 3);
            obj.innerHTML  = brl(eased * (end - start) + start);
            if (progress < 1) { APP.ui._rafIds[id] = requestAnimationFrame(step); }
            else { delete APP.ui._rafIds[id]; }
        };
        APP.ui._rafIds[id] = requestAnimationFrame(step);
    },

    rastrear() {
        const v   = document.getElementById('sk-r')?.value.trim();
        const res = document.getElementById('res-investigar');
        if (!v || !res) return;
        const p    = APP.db.produtos.find(x => x.id === v);
        const movs = APP.db.movimento.filter(m => String(m?.['Produto'] ?? m?.['Nº do produto'] ?? '').trim() === v);
        if (!p) { res.innerHTML = `<div class="op-card centered margin-t-15">SKU NÃO ENCONTRADO</div>`; return; }

        // [NEW] Timeline visual para histórico
        const histHTML = movs.length
            ? [...movs].reverse().slice(0, 15).map((m, i) => `
                <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color)">
                    <div style="display:flex;flex-direction:column;align-items:center;padding-top:3px">
                        <div style="width:8px;height:8px;border-radius:50%;background:${i===0?'var(--primary)':'var(--border-color)'}"></div>
                        ${i<14?`<div style="width:1px;flex:1;background:var(--border-color);margin-top:3px"></div>`:''}
                    </div>
                    <div style="flex:1">
                        <div class="flex-between">
                            <b class="micro-txt">${esc(m['Data de criação']??m.Data??m['Data da confirmação']??'S/D')}</b>
                            <span class="micro-txt txt-primary">${esc(String(m['Quantidade confirmada']??m['Qtd.prev.orig.UMA']??''))} un</span>
                        </div>
                        <div class="micro-txt txt-muted">DE: ${esc(m['Pos.depósito origem']??m['PD origem']??'S/E')} → PARA: ${esc(m['Pos.depósito destino']??m['PD destino']??'S/E')}</div>
                    </div>
                </div>`).join('')
            : '<div class="end-box-clean margin-t-5">Sem movimentos registrados.</div>';

        res.innerHTML = `
            <div class="op-card margin-t-15">
                <b class="mono font-18">${esc(p.id)}</b>
                <div class="label margin-t-5">${esc(p.desc)}</div>
                <div class="label margin-t-15 txt-primary">ESTOQUE ATUAL</div>
                ${p.depositos.map(d => `<div class="end-box-clean mono micro-txt margin-t-5"><span>${esc(d.tipo)} | <b>${esc(d.pos)}</b></span><b>${esc(String(d.q))} un</b></div>`).join('')}
                <div class="label margin-t-15 txt-success">HISTÓRICO DE FLUXO</div>
                ${histHTML}
            </div>`;
    },

    addFila() {
        const s = document.getElementById('sk-in')?.value.trim();
        const q = safeFloat(document.getElementById('qt-in')?.value);
        const p = APP.db.produtos.find(x => x.id === s);
        if (!p) { APP.ui.toast('SKU não encontrado no estoque.', 'danger'); return; }
        if (q <= 0) { APP.ui.toast('Informe uma quantidade válida.', 'danger'); return; }
        APP.db.fila.push({ ...p, qtdSolicitada: q });
        APP._saveFilaToSession();
        APP.ui.toast(`${s} adicionado à fila.`, 'success');
        APP.view('operacional');
    },

    remFila(i) {
        APP.db.fila.splice(i, 1);
        APP._saveFilaToSession();
        APP.view('operacional');
    },

    // [FIX] Modal customizado
    limparFila() {
        showConfirm('Deseja limpar toda a fila de rotas?', () => {
            APP.db.fila = [];
            APP._saveFilaToSession();
            APP.view('operacional');
            APP.ui.toast('Fila limpa.', 'info');
        });
    },

    // [NEW] Exportar fila como texto para clipboard
    exportarFila() {
        if (APP.db.fila.length === 0) { APP.ui.toast('Fila vazia.', 'danger'); return; }
        const linhas = APP.db.fila.map((t, i) =>
            `${i+1}. SKU ${t.id} — ${t.desc.substring(0,30)} | QTD: ${t.qtdSolicitada}un`
        );
        const texto = `FILA K11 OMNI — ${new Date().toLocaleString('pt-BR')}\n${'─'.repeat(50)}\n${linhas.join('\n')}`;
        navigator.clipboard?.writeText(texto).then(() => {
            APP.ui.toast('Fila copiada para clipboard!', 'success');
        }).catch(() => {
            APP.ui.toast('Erro ao copiar. Navegador não suporta.', 'danger');
        });
    },

    toggleTask(id) {
        // Usa servidor se disponível (persiste), senão toggle local
        if (typeof APP.toggleTarefaServer === 'function') {
            APP.toggleTarefaServer(id);
        } else {
            const t = APP.db.tarefas.find(x => x.id === id);
            if (t) { t.done = !t.done; APP.view('detalheTarefas'); }
        }
    },

    toggleSkuMatrix() { APP.ui.skuMatrixAberta = !APP.ui.skuMatrixAberta; APP.view('dash'); },
    setSkuTab(tab)    { APP.ui.skuTab = tab; APP.view('dash'); },

    // ── BI INTELLIGENCE ──────────────────────────────────────────
    setBiTab(tab) {
        APP.ui.biTab = tab;
        APP.view('dash');
    },

    abrirSubsecao(subNome) {
        const bi  = APP.rankings.bi;
        const sub = bi?.subsecoes?.find(s => s.sub === subNome);
        if (!sub) return;

        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;

        const esc_ = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const up   = sub.perc >= 0;
        const cor  = up ? 'var(--success)' : 'var(--danger)';

        const rowSku = (r, sinal) => {
            const c = sinal > 0 ? 'var(--success)' : 'var(--danger)';
            return `<div style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                <b class="mono" style="font-size:10px;color:var(--primary)">${esc_(r.id)}</b>
                <div>
                    <div style="font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">${esc_((r.desc??'').substring(0,28))}</div>
                    ${r.marca&&r.marca!=='N/ID'?`<span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(255,140,0,.1);border:1px solid rgba(255,140,0,.2);color:var(--primary)">${esc_(r.marca)}</span>`:''}
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:12px;font-weight:800;font-family:var(--font-mono);color:${c}">${r.diff>0?'+':''}${esc_(String(r.diff))} un</div>
                    <div style="font-size:9px;color:${c}">${r.perc>0?'+':''}${esc_(String(r.perc))}%</div>
                </div>
            </div>`;
        };

        const growthHTML  = (sub.topGrowth??[]).map(r=>rowSku(r,1)).join('') || '<div class="micro-txt txt-muted" style="padding:8px 0">Nenhum SKU em alta nesta subseção</div>';
        const declineHTML = (sub.topDecline??[]).map(r=>rowSku(r,-1)).join('') || '<div class="micro-txt txt-muted" style="padding:8px 0">Nenhum SKU em queda nesta subseção</div>';

        overlay.innerHTML = `
            <div class="modal-box" style="max-width:420px;width:100%;max-height:88vh;overflow-y:auto;padding:0">

                <!-- Header do modal -->
                <div style="padding:18px 18px 14px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card-bg2);z-index:1">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
                        <div style="flex:1;min-width:0">
                            <div class="label" style="margin-bottom:4px">SUBSEÇÃO</div>
                            <div style="font-size:13px;font-weight:800;line-height:1.3">${esc_(sub.sub)}</div>
                        </div>
                        <button onclick="document.getElementById('modal-overlay').classList.remove('active')"
                            style="flex-shrink:0;background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;padding:2px 4px;line-height:1">✕</button>
                    </div>

                    <!-- KPIs da subseção -->
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px">
                        <div style="padding:8px 10px;border-radius:7px;background:var(--bg);border:1px solid var(--border)">
                            <div class="label" style="margin-bottom:3px">ATUAL</div>
                            <div style="font-size:13px;font-weight:800;font-family:var(--font-mono)">${esc_(String(sub.qAtual))} un</div>
                        </div>
                        <div style="padding:8px 10px;border-radius:7px;background:var(--bg);border:1px solid var(--border)">
                            <div class="label" style="margin-bottom:3px">ANTERIOR</div>
                            <div style="font-size:13px;font-weight:800;font-family:var(--font-mono)">${esc_(String(Math.round(sub.qAnterior)))} un</div>
                        </div>
                        <div style="padding:8px 10px;border-radius:7px;background:var(--bg);border:1px solid ${cor}44">
                            <div class="label" style="margin-bottom:3px">VARIAÇÃO</div>
                            <div style="font-size:13px;font-weight:800;font-family:var(--font-mono);color:${cor}">${up?'+':''}${esc_(String(sub.perc))}%</div>
                        </div>
                    </div>
                </div>

                <!-- Corpo do modal: SKUs Growth -->
                <div style="padding:14px 18px">
                    <div class="label txt-success" style="margin-bottom:8px">▲ TOP ALTAS (${(sub.topGrowth??[]).length} SKUs)</div>
                    ${growthHTML}

                    <div class="label txt-danger" style="margin-top:16px;margin-bottom:8px">▼ TOP QUEDAS (${(sub.topDecline??[]).length} SKUs)</div>
                    ${declineHTML}

                    <!-- Todos os SKUs desta subseção -->
                    <div style="margin-top:16px">
                        <div class="label" style="margin-bottom:8px">TODOS OS SKUS (${(sub.skus??[]).length})</div>
                        ${(sub.skus??[]).slice(0,30).map(r => {
                            const c2 = r.diff>0?'var(--success)':r.diff<0?'var(--danger)':'var(--text-muted)';
                            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
                                <div>
                                    <b class="mono" style="font-size:10px;color:var(--primary)">${esc_(r.id)}</b>
                                    <span style="font-size:9px;color:var(--text-muted);margin-left:6px">${esc_((r.desc??'').substring(0,22))}</span>
                                    ${r.marca&&r.marca!=='N/ID'?`<span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(255,140,0,.08);color:var(--primary);margin-left:4px">${esc_(r.marca)}</span>`:''}
                                </div>
                                <div style="text-align:right;flex-shrink:0;margin-left:8px">
                                    <span style="font-size:11px;font-weight:700;font-family:var(--font-mono);color:${c2}">${r.diff>0?'+':''}${esc_(String(r.diff))} un</span>
                                </div>
                            </div>`;
                        }).join('')}
                        ${(sub.skus??[]).length > 30 ? `<div class="micro-txt txt-muted" style="padding:8px 0;text-align:center">... e mais ${(sub.skus.length-30)} SKUs</div>` : ''}
                    </div>
                </div>
            </div>`;

        overlay.classList.add('active');
        // Fechar clicando fora do box
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
    },

    // [FIX] _acoesState garantido com ??=
    toggleAcao(i) {
        APP.ui._acoesState ??= [];
        const acoes = APP._gerarAcoesPrioritarias();
        const acao  = acoes[i];
        if (!acao) return;
        const idx = APP.ui._acoesState.indexOf(acao.id);
        if (idx === -1) APP.ui._acoesState.push(acao.id);
        else            APP.ui._acoesState.splice(idx, 1);
        APP.view('acoesPrioritarias');
    },

    toggleRanking() { APP.ui.rankingAberto = !APP.ui.rankingAberto; APP.view('dash'); },

    mudarAlvo(l) {
        APP.ui.pdvAlvo = l;
        APP.processarDueloAqua();
        APP.view('projetor');
    },

    setFiltroEstoque(f) { APP.ui.filtroEstoque = f; APP.view('estoque'); },

    // [NEW] Busca no estoque com debounce
    filtrarEstoque: debounce((v) => { APP.ui.buscaEstoque = v; APP.view('estoque'); }, DEBOUNCE_DELAY_MS),
    filtrarDuelo:   debounce((v) => { APP.ui.buscaDuelo   = v; APP.view('projetor'); }, DEBOUNCE_DELAY_MS),

    preencher(id) {
        APP.view('operacional');
        setTimeout(() => {
            const input = document.getElementById('sk-in');
            if (input) { input.value = id; document.getElementById('qt-in')?.focus(); }
        }, 150);
    },

    // [FIX] _chartTooltip ÚNICO — versão completa com diff vs HIDRA
    _chartTooltip(label, val, event) {
        const tip = document.getElementById('chart-tooltip');
        if (!tip) return;
        const hidraVal = APP.rankings.benchmarking.hidraulica;
        const diff = label === 'HIDRÁULICA' ? null : val - hidraVal;
        const diffStr = diff !== null
            ? (diff > 0 ? `<span style="color:#EF4444">+${diff}% vs HIDRA</span>` : `<span style="color:#10B981">${diff}% vs HIDRA</span>`)
            : '<span style="color:var(--primary)">referência da hidráulica</span>';
        tip.innerHTML = `<b>${esc(label)}</b> · ${val}%<br>${diffStr}`;
        tip.style.display = 'block';
        clearTimeout(tip._closeTimer);
        tip._closeTimer = setTimeout(() => { tip.style.display = 'none'; }, 2500);
    },

};
