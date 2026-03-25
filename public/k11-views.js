/**
 * K11 OMNI ELITE — VIEWS v2.0
 * ════════════════════════════
 * Renderizadores melhorados: Chart.js, comparação de períodos, skeletons específicos.
 */

'use strict';

let _chartjs = null;
async function _getChart() {
    if (_chartjs) return _chartjs;
    if (typeof Chart !== 'undefined') { _chartjs = Chart; return _chartjs; }
    return new Promise(resolve => {
        if (document.querySelector('[src*="chart.js"]')) {
            const wait = setInterval(() => { if(typeof Chart !== 'undefined'){clearInterval(wait);_chartjs=Chart;resolve(Chart);} }, 100);
            return;
        }
        const s = document.createElement('script');
        s.src   = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
        s.onload  = () => { _chartjs = Chart; resolve(_chartjs); };
        s.onerror = () => resolve(null);
        document.head.appendChild(s);
    });
}

async function _renderChart(canvasId, config) {
    const C = await _getChart();
    if (!C) return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const existing = C.getChart(canvas);
    if (existing) existing.destroy();
    new C(canvas, config);
}

function _comparePeriod(current, previous) {
    if (previous == null || previous === 0) return null;
    const delta = ((current - previous) / Math.abs(previous)) * 100;
    return {
        delta: parseFloat(delta.toFixed(1)),
        up:    delta >= 0,
        arrow: delta >= 0 ? '▲' : '▼',
        color: delta >= 0 ? 'var(--success)' : 'var(--danger)',
        label: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs anterior`,
    };
}

function _kpiCard(label, value, prev, color, fmt) {
    const cmp = _comparePeriod(parseFloat(value) || 0, prev != null ? parseFloat(prev) : null);
    const display = fmt ? fmt(value) : value;
    return `<div class="op-card" style="text-align:center">
        <div class="label">${label}</div>
        <div class="mono font-28" style="color:${color || 'var(--text-main)'}">${display}</div>
        ${cmp ? `<div class="micro-txt" style="color:${cmp.color}">${cmp.arrow} ${cmp.label}</div>` : ''}
    </div>`;
}

function _skeletonCards(n, tall) {
    const h = tall ? '88px' : '64px';
    return Array.from({length:n}, () =>
        `<div style="background:var(--card-bg);border-radius:var(--radius-lg);padding:16px;border:1px solid var(--border);height:${h};animation:k11Pulse 1.4s infinite"></div>`
    ).join('');
}

const Views = {

    _skeleton() {
        return `<style>@keyframes k11Pulse{0%,100%{opacity:.4}50%{opacity:.8}}</style>
        <div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">${_skeletonCards(4)}</div>
        <div style="padding:0 16px;display:flex;flex-direction:column;gap:10px">${_skeletonCards(2,true)}</div>`;
    },

    dash() {
        const db   = APP.db;
        const rk   = APP.rankings;
        const pie  = rk.pieStats  || { red: 0, yellow: 0, green: 0, total: 1 };
        const meta = rk.meta      || {};
        const bench= rk.benchmarking || {};
        const prev = APP.db.pdvAnterior || [];
        const prevRed    = prev.filter ? prev.filter(p => (p.categoriaCor||p.status) === 'red').length : 0;
        const prevYellow = prev.filter ? prev.filter(p => (p.categoriaCor||p.status) === 'yellow').length : 0;
        const prevGreen  = prev.filter ? prev.filter(p => (p.categoriaCor||p.status) === 'green').length : 0;
        const pctRed    = ((pie.red    / Math.max(1, pie.total)) * 100).toFixed(1);
        const pctYellow = ((pie.yellow / Math.max(1, pie.total)) * 100).toFixed(1);
        const pctGreen  = ((pie.green  / Math.max(1, pie.total)) * 100).toFixed(1);
        const metaColor = parseFloat(meta.lossGap) > 5 ? 'var(--danger)' : parseFloat(meta.lossGap) > 2 ? 'var(--warning)' : 'var(--success)';
        const topAcoes  = rk.topLeverage || {};
        setTimeout(() => {
            _renderChart('dash-health-chart', { type:'doughnut', data:{ labels:['Ruptura','Atenção','Saudável'], datasets:[{ data:[pie.red,pie.yellow,pie.green], backgroundColor:['#EF4444','#F59E0B','#10B981'], borderWidth:0, hoverOffset:4 }] }, options:{ cutout:'72%', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, animation:{ duration:600 } } });
            const bv = ['hidraulica','mesquita','jacarepagua','benfica','loja'].map(k => bench[k]||0);
            if (bv.some(v=>v>0)) _renderChart('dash-bench-spark', { type:'bar', data:{ labels:['HIDRA','MESQ','JACA','BENF','LOJA'], datasets:[{ data:bv, backgroundColor:bv.map((_,i)=>i===4?'rgba(255,140,0,.4)':'rgba(96,165,250,.2)'), borderColor:bv.map((_,i)=>i===4?'#FF8C00':'#60A5FA'), borderWidth:1, borderRadius:4 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{ display:false }, ticks:{ color:'#5A6480', font:{ size:9 } } }, y:{ display:false } }, animation:{ duration:600 } } });
        }, 80);
        return `<div style="padding:16px;display:flex;flex-direction:column;gap:12px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                ${_kpiCard('RUPTURA',  pie.red,   prevRed,   'var(--danger)')}
                ${_kpiCard('ATENÇÃO',  pie.yellow,prevYellow,'var(--warning)')}
                ${_kpiCard('SAUDÁVEL', pie.green, prevGreen, 'var(--success)')}
                ${_kpiCard('TOTAL',    pie.total, null,      null)}
            </div>
            <div style="display:grid;grid-template-columns:80px 1fr;gap:12px;align-items:center">
                <div style="position:relative;width:80px;height:80px">
                    <canvas id="dash-health-chart" width="80" height="80"></canvas>
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
                        <span class="mono" style="font-size:15px;font-weight:700;color:var(--success)">${pctGreen}%</span>
                    </div>
                </div>
                <div><div class="label margin-b-6">BENCHMARK</div><div style="height:60px"><canvas id="dash-bench-spark"></canvas></div></div>
            </div>
            <div class="op-card" style="padding:14px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px"><div class="label">SAÚDE DO PORTFÓLIO</div><span class="micro-txt txt-muted">${pie.total} SKUs</span></div>
                <div style="height:10px;border-radius:5px;overflow:hidden;background:var(--border);display:flex">
                    <div style="width:${pctRed}%;background:var(--danger);transition:width .7s"></div>
                    <div style="width:${pctYellow}%;background:var(--warning);transition:width .7s .1s"></div>
                    <div style="width:${pctGreen}%;background:var(--success);transition:width .7s .2s"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:6px">
                    <span class="micro-txt" style="color:var(--danger)">● Ruptura ${pctRed}%</span>
                    <span class="micro-txt" style="color:var(--warning)">● Atenção ${pctYellow}%</span>
                    <span class="micro-txt" style="color:var(--success)">● OK ${pctGreen}%</span>
                </div>
            </div>
            <div class="op-card" style="border-left:3px solid ${metaColor}">
                <div class="label">PERDA DE META ESTIMADA</div>
                <div class="mono font-24" style="color:${metaColor};margin:6px 0">${meta.lossGap ?? '—'}%</div>
                <div class="micro-txt txt-muted">Itens em ruptura representam perda potencial</div>
            </div>
            ${topAcoes.desc ? `<div class="op-card" style="border-left:3px solid var(--primary)"><div class="label">🎯 MAIOR ALAVANCAGEM</div><div style="margin-top:8px;font-weight:700;font-size:14px">${esc(topAcoes.desc)}</div><div class="micro-txt txt-muted margin-t-5">Potencial: <b style="color:var(--primary)">${brl(topAcoes.vMinha||0)}</b></div></div>` : ''}
            ${db.tarefas.filter(t=>!t.done).length > 0 ? `<div class="op-card" onclick="APP.view('detalheTarefas')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center"><div><div class="label">TAREFAS PENDENTES</div><div class="micro-txt txt-muted margin-t-3">Toque para ver</div></div><span class="mono font-24" style="color:var(--warning)">${db.tarefas.filter(t=>!t.done).length}</span></div>` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <button class="pos-tag btn-action" onclick="APP.view('estoque')">📦 Estoque</button>
                <button class="pos-tag btn-action" onclick="APP.view('operacional')">⚙️ Operacional</button>
                <button class="pos-tag btn-action" onclick="APP.view('projetor')">📊 Projetor</button>
                <button class="pos-tag btn-action" onclick="APP.view('acoesPrioritarias')">🎯 Ações</button>
            </div>
        </div>`;
    },

    operacional() {
        const fila = APP.db.fila || [];
        return `<div style="padding:16px;display:flex;flex-direction:column;gap:12px">
            <div class="op-card"><div class="label margin-b-10">CONSULTA DE SKU</div>
                <div style="display:flex;gap:8px">
                    <input id="sk-in" class="op-input" placeholder="SKU / Cód. produto" style="flex:1" oninput="Actions.rastrear&&Actions.rastrear()">
                    <input id="qt-in" class="op-input" type="number" placeholder="Qtd" style="width:70px" min="1">
                </div>
                <button class="pos-tag btn-action margin-t-10" style="width:100%" onclick="Actions.adicionarFila&&Actions.adicionarFila()">+ ADICIONAR À FILA</button>
                <div id="res-investigar" class="margin-t-10"></div>
            </div>
            <div class="op-card">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                    <div class="label">FILA DE REPOSIÇÃO</div><span class="mono" style="color:var(--primary)">${fila.length} itens</span>
                </div>
                ${fila.length === 0 ? '<div class="micro-txt txt-muted centered">Fila vazia</div>' : fila.map((item,i) => `<div class="end-box-clean margin-t-5" style="display:flex;justify-content:space-between;align-items:center"><div><span class="mono">${esc(item.id)}</span><div class="micro-txt txt-muted">${truncate(item.desc||'',30)} · ${item.qtdSolicitada||1} un</div></div><button class="pos-tag" style="background:var(--danger-dim);color:var(--danger);padding:4px 10px" onclick="Actions.removerFila&&Actions.removerFila(${i})">✕</button></div>`).join('')}
                ${fila.length > 0 ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><button class="pos-tag btn-action" onclick="Actions.exportarFila&&Actions.exportarFila()">📋 Exportar</button><button class="pos-tag" style="background:var(--danger-dim);color:var(--danger)" onclick="if(confirm('Limpar?')){APP.db.fila=[];APP.view('operacional')}">🗑 Limpar</button></div>` : ''}
            </div>
        </div>`;
    },

    estoque() {
        const filtro = APP.ui.filtroEstoque || 'ruptura';
        const busca  = (APP.ui.buscaEstoque || '').toLowerCase();
        const todos  = APP.db.produtos || [];
        let prods    = filtro === 'ruptura' ? todos.filter(p=>p.categoriaCor==='red') : filtro === 'atencao' ? todos.filter(p=>p.categoriaCor==='yellow') : filtro === 'saudavel' ? todos.filter(p=>p.categoriaCor==='green') : todos;
        if (busca) prods = prods.filter(p => p.id?.toLowerCase().includes(busca) || p.desc?.toLowerCase().includes(busca));
        const tabs = [{id:'ruptura',label:'Ruptura',color:'var(--danger)',count:todos.filter(p=>p.categoriaCor==='red').length},{id:'atencao',label:'Atenção',color:'var(--warning)',count:todos.filter(p=>p.categoriaCor==='yellow').length},{id:'saudavel',label:'Saudável',color:'var(--success)',count:todos.filter(p=>p.categoriaCor==='green').length},{id:'todos',label:'Todos',color:'var(--text-soft)',count:todos.length}];
        setTimeout(() => _renderChart('estoque-dist', {type:'bar',data:{labels:['Rup.','Ate.','OK'],datasets:[{data:[todos.filter(p=>p.categoriaCor==='red').length,todos.filter(p=>p.categoriaCor==='yellow').length,todos.filter(p=>p.categoriaCor==='green').length],backgroundColor:['#EF444466','#F59E0B66','#10B98166'],borderColor:['#EF4444','#F59E0B','#10B981'],borderWidth:1,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#5A6480',font:{size:9}}},y:{display:false}},animation:{duration:400}}}), 60);
        return `<div style="padding:16px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;gap:10px;align-items:center">
                <div style="width:70px;height:40px;flex-shrink:0"><canvas id="estoque-dist"></canvas></div>
                <div style="display:flex;gap:5px;overflow-x:auto;flex:1">${tabs.map(t=>`<button class="pos-tag ${filtro===t.id?'btn-action':''}" style="${filtro===t.id?'':'background:var(--card-bg);color:var(--text-soft)'}font-size:11px" onclick="Actions.setFiltroEstoque&&Actions.setFiltroEstoque('${t.id}')"><span style="color:${t.color}">●</span> ${t.label} <b>${t.count}</b></button>`).join('')}</div>
            </div>
            <input class="op-input" placeholder="🔍 Buscar SKU ou descrição…" value="${esc(APP.ui.buscaEstoque||'')}" oninput="Actions.filtrarEstoque&&Actions.filtrarEstoque(this.value)">
            <div style="display:flex;flex-direction:column;gap:6px">
                ${prods.length===0 ? '<div class="op-card micro-txt txt-muted centered">Nenhum produto</div>' : prods.slice(0,80).map(p=>{const cor=p.categoriaCor==='red'?'var(--danger)':p.categoriaCor==='yellow'?'var(--warning)':'var(--success)';const pkl=p.pkl??0;const tot=p.total??0;const pct=tot>0?Math.min(100,(pkl/tot)*100):0;return `<div class="op-card" style="border-left:3px solid ${cor};cursor:pointer;padding:10px 12px" onclick="Actions.preencher&&Actions.preencher('${esc(p.id)}')"><div style="display:flex;justify-content:space-between"><div style="flex:1;min-width:0"><span class="mono" style="font-size:13px;font-weight:700">${esc(p.id)}</span><div class="micro-txt txt-muted" style="margin-top:2px">${truncate(p.desc||'',42)}</div></div><div style="text-align:right;margin-left:8px"><div class="mono" style="font-size:13px;color:${cor}">PKL:${pkl}</div><div class="micro-txt txt-muted">Tot:${tot}</div></div></div><div style="height:3px;border-radius:2px;background:var(--border);margin-top:6px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${cor}"></div></div></div>`;}).join('')}
                ${prods.length>80?`<div class="micro-txt txt-muted centered">+${prods.length-80} — use busca</div>`:''}
            </div>
        </div>`;
    },

    projetor() {
        const bench = APP.rankings.benchmarking || {};
        const busca = (APP.ui.buscaDuelo||'').toLowerCase();
        let duelos  = APP.rankings.duelos || [];
        if (busca) duelos = duelos.filter(d=>d.desc?.toLowerCase().includes(busca)||d.id?.toLowerCase().includes(busca));
        const lojas = [{key:'hidraulica',label:'HIDRA',ref:true},{key:'mesquita',label:'MESQ'},{key:'jacarepagua',label:'JACA'},{key:'benfica',label:'BENF'},{key:'loja',label:'LOJA',hl:true}];
        setTimeout(() => {
            const data = lojas.map(l=>bench[l.key]||0);
            _renderChart('bench-chart',{type:'bar',data:{labels:lojas.map(l=>l.label),datasets:[{data,backgroundColor:data.map((_,i)=>lojas[i].hl?'rgba(255,140,0,.4)':lojas[i].ref?'rgba(96,165,250,.3)':'rgba(90,100,128,.15)'),borderColor:data.map((_,i)=>lojas[i].hl?'#FF8C00':lojas[i].ref?'#60A5FA':'#5A6480'),borderWidth:1,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.parsed.y+'%'}}},scales:{x:{grid:{display:false},ticks:{color:'#5A6480',font:{size:10}}},y:{grid:{color:'rgba(90,100,128,.15)'},ticks:{color:'#5A6480',font:{size:10},callback:v=>v+'%'},min:0,max:120}},animation:{duration:600}}});
        }, 80);
        return `<div style="padding:16px;display:flex;flex-direction:column;gap:12px">
            <div class="op-card"><div class="label margin-b-10">BENCHMARK POR LOJA</div><div style="height:140px"><canvas id="bench-chart"></canvas></div></div>
            <input class="op-input" placeholder="🔍 Buscar SKU nos duelos…" value="${esc(APP.ui.buscaDuelo||'')}" oninput="Actions.filtrarDuelo&&Actions.filtrarDuelo(this.value)">
            <div style="display:flex;flex-direction:column;gap:6px">${duelos.length===0?'<div class="op-card micro-txt txt-muted centered">Nenhum duelo</div>':duelos.slice(0,50).map(d=>{const gap=d.gapAbsoluto??0;const cor=gap>0?'var(--success)':'var(--danger)';return `<div class="op-card" style="padding:10px 12px"><div style="display:flex;justify-content:space-between;align-items:center"><div style="flex:1;min-width:0"><span class="mono" style="font-size:12px;font-weight:700">${esc(d.id)}</span><div class="micro-txt txt-muted">${truncate(d.desc||'',35)}</div></div><span class="mono" style="color:${cor};font-size:13px">${gap>0?'+':''}${gap}%</span></div><div style="height:3px;background:var(--border);border-radius:2px;margin-top:6px;overflow:hidden"><div style="width:${Math.min(100,Math.abs(gap))}%;height:100%;background:${cor}"></div></div></div>`;}).join('')}</div>
        </div>`;
    },

    detalheTarefas() {
        const tarefas = APP.db.tarefas || [];
        const pend    = tarefas.filter(t=>!t.done);
        const done    = tarefas.filter(t=>t.done);
        return `<div style="padding:16px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;justify-content:space-between;align-items:center"><div class="label">TAREFAS (${pend.length} pendentes)</div><button class="pos-tag" onclick="APP.view('dash')" style="font-size:11px">← VOLTAR</button></div>
            ${pend.map(t=>`<div class="op-card" style="display:flex;align-items:flex-start;gap:12px"><button onclick="Actions.toggleTarefa&&Actions.toggleTarefa(${t.id})" style="background:none;border:2px solid var(--border-bright);border-radius:50%;width:22px;height:22px;min-width:22px;cursor:pointer;margin-top:2px;padding:0"></button><div style="flex:1"><div style="font-size:13px;line-height:1.5">${esc(t.task||t.titulo||'Sem descrição')}</div>${t.prazo?`<div class="micro-txt" style="color:var(--warning);margin-top:3px">⏰ ${formatDate(t.prazo)}</div>`:''}</div></div>`).join('')}
            ${done.length>0?`<div class="label margin-t-10" style="color:var(--text-muted)">CONCLUÍDAS (${done.length})</div>${done.map(t=>`<div class="op-card" style="opacity:.5;display:flex;align-items:center;gap:12px"><div style="width:22px;height:22px;min-width:22px;border-radius:50%;background:var(--success);display:flex;align-items:center;justify-content:center;font-size:11px">✓</div><div class="micro-txt" style="text-decoration:line-through">${esc(t.task||t.titulo||'')}</div></div>`).join('')}`:''}
        </div>`;
    },

    acoesPrioritarias() {
        const acoes = APP._gerarAcoesPrioritarias ? APP._gerarAcoesPrioritarias() : [];
        const total = acoes.reduce((s,a)=>s+(a.valor||0),0);
        return `<div style="padding:16px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;justify-content:space-between;align-items:center"><div class="label">🎯 AÇÕES PRIORITÁRIAS</div><button class="pos-tag" onclick="APP.view('dash')" style="font-size:11px">← VOLTAR</button></div>
            ${total>0?`<div class="op-card" style="border-left:3px solid var(--primary)"><div class="micro-txt txt-muted">Potencial total</div><div class="mono" style="font-size:20px;color:var(--primary);margin-top:4px">${brl(total)}</div></div>`:''}
            ${acoes.length===0?'<div class="op-card micro-txt txt-muted centered">Carregue os dados primeiro</div>':acoes.slice(0,20).map((a,i)=>`<div class="op-card" style="border-left:3px solid var(--primary)"><div style="display:flex;justify-content:space-between"><div style="flex:1"><div style="font-size:13px;font-weight:700">${i+1}. ${esc(a.sku||a.id||'—')}</div><div class="micro-txt txt-muted margin-t-3">${truncate(a.desc||a.descricao||'',50)}</div></div>${a.valor?`<div class="mono" style="color:var(--primary);margin-left:8px">${brl(a.valor)}</div>`:''}</div>${a.acao?`<div class="micro-txt margin-t-5" style="color:var(--accent-blue)">→ ${esc(a.acao)}</div>`:''}</div>`).join('')}
        </div>`;
    },

    obraHome() {
        setTimeout(() => { if(typeof OBRA!=='undefined') OBRA.renderHome(); }, 50);
        return `<div style="padding:16px;display:flex;flex-direction:column;gap:12px">
            <div class="label">🏗️ K11 OBRA</div>
            <div id="obra-home-content"><div style="text-align:center;padding:32px 0"><div style="font-size:24px;margin-bottom:8px">🏗️</div><div class="micro-txt txt-muted">Carregando obras...</div></div></div>
        </div>`;
    },
};
