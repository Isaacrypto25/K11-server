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
    
    // ── NOVO: COMPARAÇÃO TEMPORAL (Atual vs Anterior) ─────────────────
    
    // ── NOVO: MOSTRAR MODAL DE SELEÇÃO DE MARCAS PARA COMPARAÇÃO ─────
    showComparacaoModal(dueloIdx) {
        const bi = APP.rankings.bi;
        const duelo = bi?.marcas?.[dueloIdx];
        if (!duelo) return;

        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;

        const esc_ = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        overlay.innerHTML = `
        <div style="padding:20px;border-radius:12px;background:var(--card-bg);border:1px solid var(--border);max-width:500px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h2 style="margin:0;font-size:16px;color:var(--primary)">Comparar Marcas</h2>
                <button onclick="document.getElementById('modal-overlay').classList.remove('active')" style="padding:4px 8px;border:none;background:var(--danger);color:white;border-radius:4px;cursor:pointer;font-size:12px">✕</button>
            </div>

            <div style="font-size:11px;color:var(--text-muted);margin-bottom:16px">${esc_(duelo.base)}</div>

            <div style="margin-bottom:16px">
                <label style="display:block;font-size:10px;color:var(--text-muted);margin-bottom:4px">MARCA 1</label>
                <select id="marca1-select" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:11px">
                    ${duelo.marcas.map((m, idx) => `<option value="${idx}">${esc_(m.marca)}</option>`).join('')}
                </select>
            </div>

            <div style="margin-bottom:16px">
                <label style="display:block;font-size:10px;color:var(--text-muted);margin-bottom:4px">MARCA 2</label>
                <select id="marca2-select" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:11px">
                    ${duelo.marcas.map((m, idx) => `<option value="${idx}" ${idx === 1 ? 'selected' : ''}>${esc_(m.marca)}</option>`).join('')}
                </select>
            </div>

            <button onclick="(() => {
                const m1 = parseInt(document.getElementById('marca1-select').value);
                const m2 = parseInt(document.getElementById('marca2-select').value);
                if (m1 === m2) { alert('Selecione marcas diferentes'); return; }
                document.getElementById('modal-overlay').classList.remove('active');
                setTimeout(() => APP.actions.abrirComparacaoTemporal(${dueloIdx}, m1, m2), 200);
            })()"
                style="width:100%;padding:10px;background:var(--primary);color:white;border:none;border-radius:4px;font-weight:700;cursor:pointer;font-size:11px">
                🔄 COMPARAR
            </button>
        </div>`;

        overlay.classList.add('active');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
    },

    abrirComparacaoTemporal(dueloIdx, marca1Idx, marca2Idx) {
        const bi = APP.rankings.bi;
        const duelo = bi?.marcas?.[dueloIdx];
        if (!duelo || !duelo.marcas[marca1Idx] || !duelo.marcas[marca2Idx]) return;

        const marca1Atual = duelo.marcas[marca1Idx];
        const marca1Anterior = { qAnterior: marca1Atual.qAnterior, marca: marca1Atual.marca };
        const marca2Atual = duelo.marcas[marca2Idx];
        const marca2Anterior = { qAnterior: marca2Atual.qAnterior, marca: marca2Atual.marca };

        const comp = bi.analisarComparacao(marca1Atual, marca1Anterior, marca2Atual, marca2Anterior);
        if (!comp) return;

        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;

        const esc_ = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        overlay.innerHTML = `
        <div style="padding:20px;border-radius:12px;background:var(--card-bg);border:1px solid var(--border);max-width:900px;max-height:90vh;overflow-y:auto">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h2 style="margin:0;font-size:18px;color:var(--primary)">📊 COMPARAÇÃO TEMPORAL</h2>
                <button onclick="document.getElementById('modal-overlay').classList.remove('active')" style="padding:8px 12px;border:none;background:var(--danger);color:white;border-radius:6px;cursor:pointer">✕</button>
            </div>

            <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">${esc_(duelo.base)}</div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px">
                <!-- COLUNA 1: MARCA 1 (ATUAL) -->
                <div style="padding:16px;border-radius:8px;background:rgba(255,140,0,.08);border:1px solid rgba(255,140,0,.2)">
                    <div style="font-size:14px;font-weight:900;color:var(--primary);margin-bottom:12px">👑 ${esc_(comp.marca1)}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">ATUAL</div>
                    <div style="font-size:20px;font-weight:900;font-family:var(--font-mono);color:#F3F4F6">${comp.atual.m1} un</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:8px">Anterior: ${comp.anterior.m1} un</div>
                </div>

                <!-- COLUNA 2: DIFERENÇA -->
                <div style="padding:16px;border-radius:8px;background:rgba(100,100,100,.08);border:1px solid var(--border)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">DIFERENÇA ATUAL</div>
                    <div style="font-size:24px;font-weight:900;font-family:var(--font-mono);color:${comp.atual.m1 > comp.atual.m2 ? 'var(--success)' : 'var(--danger)'}">${comp.atual.m1 > comp.atual.m2 ? '+' : ''}${comp.atual.diff} un</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:8px">${comp.atual.melhor}</div>
                </div>

                <!-- COLUNA 3: MARCA 2 (ATUAL) -->
                <div style="padding:16px;border-radius:8px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2)">
                    <div style="font-size:14px;font-weight:900;color:#3B82F6;margin-bottom:12px">🔵 ${esc_(comp.marca2)}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">ATUAL</div>
                    <div style="font-size:20px;font-weight:900;font-family:var(--font-mono);color:#F3F4F6">${comp.atual.m2} un</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:8px">Anterior: ${comp.anterior.m2} un</div>
                </div>
            </div>

            <!-- VARIAÇÕES -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
                <div style="padding:16px;border-radius:8px;background:var(--bg);border:1px solid var(--border)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">VARIAÇÃO ${esc_(comp.marca1)}</div>
                    <div style="display:flex;align-items:baseline;gap:8px">
                        <span style="font-size:20px;font-weight:900;font-family:var(--font-mono);color:${comp.variacao.m1_abs > 0 ? 'var(--success)' : 'var(--danger)'}">${comp.variacao.m1_abs > 0 ? '+' : ''}${comp.variacao.m1_abs}</span>
                        <span style="font-size:14px;color:${comp.variacao.m1_abs > 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700">${comp.variacao.m1_abs > 0 ? '+' : ''}${comp.variacao.m1_perc}%</span>
                    </div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:8px">${comp.trend.m1}</div>
                </div>

                <div style="padding:16px;border-radius:8px;background:var(--bg);border:1px solid var(--border)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">VARIAÇÃO ${esc_(comp.marca2)}</div>
                    <div style="display:flex;align-items:baseline;gap:8px">
                        <span style="font-size:20px;font-weight:900;font-family:var(--font-mono);color:${comp.variacao.m2_abs > 0 ? 'var(--success)' : 'var(--danger)'}">${comp.variacao.m2_abs > 0 ? '+' : ''}${comp.variacao.m2_abs}</span>
                        <span style="font-size:14px;color:${comp.variacao.m2_abs > 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700">${comp.variacao.m2_abs > 0 ? '+' : ''}${comp.variacao.m2_perc}%</span>
                    </div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:8px">${comp.trend.m2}</div>
                </div>
            </div>

            <!-- STATUS -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
                <div style="padding:12px;border-radius:8px;background:var(--bg);border:1px solid var(--border);text-align:center">
                    <div style="font-size:12px;color:var(--text-muted)">STATUS</div>
                    <div style="font-size:14px;font-weight:900;color:${comp.status.m1 === 'GANHANDO' ? 'var(--success)' : comp.status.m1 === 'PERDENDO' ? 'var(--danger)' : 'var(--text-muted)'};margin-top:4px">${comp.status.m1}</div>
                </div>
                <div style="padding:12px;border-radius:8px;background:var(--bg);border:1px solid var(--border);text-align:center">
                    <div style="font-size:12px;color:var(--text-muted)">STATUS</div>
                    <div style="font-size:14px;font-weight:900;color:${comp.status.m2 === 'GANHANDO' ? 'var(--success)' : comp.status.m2 === 'PERDENDO' ? 'var(--danger)' : 'var(--text-muted)'};margin-top:4px">${comp.status.m2}</div>
                </div>
            </div>

            <!-- VENCEDOR -->
            <div style="padding:16px;border-radius:8px;background:linear-gradient(135deg,rgba(255,140,0,.2),rgba(255,140,0,.05));border:1px solid rgba(255,140,0,.3);text-align:center">
                <div style="font-size:14px;font-weight:900;color:var(--primary)">⭐ MELHOR PERFORMANCE</div>
                <div style="font-size:18px;font-weight:900;color:var(--primary);margin-top:8px">${comp.variacao.vencedor}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Maior variação absoluta</div>
            </div>

            <button onclick="document.getElementById('modal-overlay').classList.remove('active')" style="width:100%;padding:12px;margin-top:20px;border:none;background:var(--primary);color:white;border-radius:6px;font-weight:700;cursor:pointer">FECHAR</button>
        </div>`;

        overlay.classList.add('active');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
    },

    setBiTab(tab) {
        APP.ui.biTab = tab;
        APP.view('dash');
    },

    filtrarMarcas: debounce((v) => {
        APP.ui.buscaMarcas = v;
        APP.view('dash');
    }, 280),

    setFiltroMarcaSub(sub) {
        APP.ui.filtroMarcaSub = sub;
        APP.view('dash');
    },

    // ── MODAL DETALHES DE MARCA ───────────────────────────────────
    // Abre modal com gráficos SVG e KPIs para um duelo específico.
    // dueloIdx é o índice no array filtrado atual da view — por isso
    // recalculamos com os mesmos filtros para garantir consistência.
    abrirDetalhesMarca(dueloIdxFiltrado, subFiltro, buscaRaw) {
        const bi     = APP.rankings.bi;
        const todos  = bi?.marcas ?? [];
        const skuIdx = bi?.skuParaDuelo ?? new Map();

        // Recalcula filtro igual à view
        const busca = String(buscaRaw ?? '').trim().toUpperCase();
        const sub   = String(subFiltro ?? '');
        let duelos   = todos;

        if (busca.length >= 3) {
            const idxPorSku = [];
            skuIdx.forEach((indices, skuId) => {
                if (skuId.toUpperCase().includes(busca)) indices.forEach(i => idxPorSku.push(i));
            });
            if (idxPorSku.length) {
                duelos = [...new Set(idxPorSku)].map(i => todos[i]).filter(Boolean);
            } else {
                duelos = todos.filter(d =>
                    d.base.toUpperCase().includes(busca) ||
                    d.marcas.some(m => m.marca.toUpperCase().includes(busca))
                );
            }
        }
        if (sub) duelos = duelos.filter(d => d.sub === sub);

        const d = duelos[dueloIdxFiltrado];
        if (!d) return;

        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;

        const esc_ = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const CORES = ['#FF8C00','#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B'];
        const total  = d.totalVol || 1;
        const up     = d.totalPerc >= 0;
        const corTot = up ? '#10B981' : '#EF4444';

        // ── GRÁFICO DE BARRAS HORIZONTAIS (share de volume) ─────────
        const maxQ = Math.max(...d.marcas.map(m => m.qAtual), 1);
        const barrasHTML = d.marcas.map((m, i) => {
            const cor     = CORES[i] ?? '#666';
            const pct     = Math.round((m.qAtual / maxQ) * 100);
            const share   = Math.round((m.qAtual / total) * 100);
            const up_m    = m.diff > 0;
            const corVar  = up_m ? '#10B981' : m.diff < 0 ? '#EF4444' : '#6B7280';
            return `
            <div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <div style="display:flex;align-items:center;gap:6px">
                        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cor};flex-shrink:0"></span>
                        <span style="font-size:11px;font-weight:800;color:#F3F4F6">${esc_(m.marca)}</span>
                        ${i===0?'<span style="font-size:8px;padding:1px 5px;border-radius:10px;background:rgba(255,140,0,.15);color:#FF8C00;font-weight:700">LÍDER</span>':''}
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${cor}">${share}%</span>
                        <span style="font-size:10px;font-weight:700;color:${corVar}">${m.diff>0?'+':''}${esc_(String(m.diff))} un</span>
                    </div>
                </div>
                <div style="height:8px;border-radius:4px;background:#1A1D2E;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${cor};border-radius:4px;transition:width .6s ease"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:3px">
                    <span style="font-size:9px;color:#6B7280">${m.qAtual} un atual · ${Math.round(m.qAnterior)} un ant.</span>
                    <span style="font-size:9px;color:${corVar};font-weight:700">${m.perc>0?'+':''}${esc_(String(m.perc))}% vs período ant.</span>
                </div>
            </div>`;
        }).join('');

        // ── GRÁFICO RADAR / PIZZA (share em SVG) ────────────────────
        // Mini donut SVG mostrando share de mercado
        const R = 42, CX = 54, CY = 54, espessura = 16;
        const circunf = 2 * Math.PI * R;
        let acumAngle = -Math.PI / 2; // começa no topo
        const fatias = d.marcas.slice(0,4).map((m, i) => {
            const angulo = (m.qAtual / total) * 2 * Math.PI;
            const x1 = CX + R * Math.cos(acumAngle);
            const y1 = CY + R * Math.sin(acumAngle);
            acumAngle += angulo;
            const x2 = CX + R * Math.cos(acumAngle);
            const y2 = CY + R * Math.sin(acumAngle);
            const large = angulo > Math.PI ? 1 : 0;
            const cor   = CORES[i] ?? '#555';
            // SVG arc path para anel
            const r_inner = R - espessura;
            const xi1 = CX + r_inner * Math.cos(acumAngle - angulo);
            const yi1 = CY + r_inner * Math.sin(acumAngle - angulo);
            const xi2 = CX + r_inner * Math.cos(acumAngle);
            const yi2 = CY + r_inner * Math.sin(acumAngle);
            if (angulo < 0.01) return '';
            return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} L${xi2.toFixed(1)},${yi2.toFixed(1)} A${r_inner},${r_inner} 0 ${large},0 ${xi1.toFixed(1)},${yi1.toFixed(1)} Z" fill="${cor}" opacity="0.92"/>`;
        }).join('');

        const donutSVG = `
        <svg viewBox="0 0 108 108" width="108" height="108" style="flex-shrink:0">
            <circle cx="${CX}" cy="${CY}" r="${R}" fill="#111320" stroke="#1A1D2E" stroke-width="1"/>
            ${fatias}
            <circle cx="${CX}" cy="${CY}" r="${R - espessura - 1}" fill="#111320"/>
            <text x="${CX}" y="${CY - 5}" text-anchor="middle" fill="#9CA3AF" font-size="7" font-family="Inter,sans-serif">TOTAL</text>
            <text x="${CX}" y="${CY + 7}" text-anchor="middle" fill="#F3F4F6" font-size="10" font-weight="700" font-family="'JetBrains Mono',monospace">${d.totalVol}</text>
            <text x="${CX}" y="${CY + 18}" text-anchor="middle" fill="${corTot}" font-size="8" font-weight="700" font-family="'JetBrains Mono',monospace">${up?'+':''}${esc_(String(d.totalPerc))}%</text>
        </svg>`;

        // ── LEGENDA DO DONUT ─────────────────────────────────────────
        const legendaHTML = d.marcas.slice(0,4).map((m,i) => {
            const share = Math.round((m.qAtual/total)*100);
            const cor   = CORES[i] ?? '#555';
            return `<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
                <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${cor};flex-shrink:0"></span>
                <span style="font-size:10px;color:#D1D5DB;font-weight:700">${esc_(m.marca)}</span>
                <span style="font-size:10px;color:#6B7280;margin-left:auto">${share}%</span>
            </div>`;
        }).join('');

        // ── SKUs de cada marca ───────────────────────────────────────
        const skusHTML = d.marcas.slice(0,4).map((m, i) => {
            const cor = CORES[i] ?? '#555';
            if (!m.skus?.length) return '';
            return `<div style="margin-bottom:10px">
                <div style="font-size:10px;font-weight:800;color:${cor};margin-bottom:5px">${esc_(m.marca)}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px">
                    ${(m.skuItems ?? []).slice(0,8).map(sk => {
                        const up_k = sk.diff > 0;
                        const ck   = up_k ? '#10B981' : sk.diff < 0 ? '#EF4444' : '#6B7280';
                        return `<div style="padding:4px 8px;border-radius:5px;background:#0D0F18;border:1px solid #1A1D2E;min-width:0">
                            <div style="font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;color:#F3F4F6">${esc_(sk.id)}</div>
                            <div style="font-size:8px;color:#6B7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px">${esc_((sk.desc??'').substring(0,18))}</div>
                            <div style="font-size:8px;color:${ck};font-weight:700;margin-top:1px">${sk.diff>0?'+':''}${esc_(String(sk.diff))} un</div>
                        </div>`;
                    }).join('')}
                    ${(m.skuItems?.length??0) > 8 ? `<div style="padding:4px 8px;border-radius:5px;background:#0D0F18;border:1px solid #1A1D2E;font-size:9px;color:#6B7280;display:flex;align-items:center">+${m.skuItems.length-8} SKUs</div>` : ''}
                </div>
            </div>`;
        }).join('');

        overlay.innerHTML = `
        <div class="modal-box" style="max-width:460px;width:100%;max-height:90vh;overflow-y:auto;padding:0;background:#111320;border:1px solid #232642">

            <!-- Header -->
            <div style="padding:16px 18px 14px;border-bottom:1px solid #1A1D2E;position:sticky;top:0;background:#111320;z-index:1">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div style="flex:1;min-width:0">
                        <div style="font-size:9px;font-weight:800;color:#6B7280;letter-spacing:1.5px;margin-bottom:4px">DUELO DE MARCAS</div>
                        <div style="font-size:13px;font-weight:900;color:#F3F4F6;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc_(d.base.substring(0,40))}</div>
                        <div style="font-size:10px;color:#6B7280;margin-top:3px">${esc_(d.sub)}</div>
                    </div>
                    <button onclick="document.getElementById('modal-overlay').classList.remove('active')"
                        style="flex-shrink:0;background:none;border:none;color:#6B7280;font-size:20px;cursor:pointer;padding:2px 4px;line-height:1;margin-left:8px">✕</button>
                </div>

                <!-- KPIs do duelo -->
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">
                    ${[
                        ['VOLUME ATUAL', d.totalVol + ' un', '#F3F4F6'],
                        ['VARIAÇÃO', (up?'+':'') + d.totalPerc + '%', corTot],
                        ['MARCAS', d.marcas.length + ' marcas', '#A78BFA'],
                    ].map(([lbl, val, cor]) => `
                    <div style="padding:8px 10px;border-radius:7px;background:#0D0F18;border:1px solid #1A1D2E">
                        <div style="font-size:8px;font-weight:800;color:#6B7280;letter-spacing:.8px;margin-bottom:3px">${lbl}</div>
                        <div style="font-size:13px;font-weight:900;font-family:'JetBrains Mono',monospace;color:${cor}">${val}</div>
                    </div>`).join('')}
                </div>
            </div>

            <!-- Donut + legenda -->
            <div style="padding:16px 18px;border-bottom:1px solid #1A1D2E">
                <div style="font-size:9px;font-weight:800;color:#6B7280;letter-spacing:1px;margin-bottom:12px">SHARE DE MERCADO</div>
                <div style="display:flex;gap:16px;align-items:center">
                    ${donutSVG}
                    <div style="flex:1">${legendaHTML}</div>
                </div>
            </div>

            <!-- Barras de performance -->
            <div style="padding:16px 18px;border-bottom:1px solid #1A1D2E">
                <div style="font-size:9px;font-weight:800;color:#6B7280;letter-spacing:1px;margin-bottom:12px">PERFORMANCE POR MARCA</div>
                ${barrasHTML}
            </div>

            <!-- SKUs detalhados -->
            <div style="padding:16px 18px">
                <div style="font-size:9px;font-weight:800;color:#6B7280;letter-spacing:1px;margin-bottom:12px">SKUs ENVOLVIDOS</div>
                ${skusHTML || '<div style="font-size:11px;color:#6B7280">Sem SKUs detalhados</div>'}
            </div>
        </div>`;

        overlay.classList.add('active');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
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
