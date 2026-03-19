'use strict';

/**
 * K11 OMNI ELITE — Reports Routes
 * ═══════════════════════════════════
 * Geração de relatórios exportáveis (HTML→PDF, CSV, JSON)
 *
 * GET /api/reports/ruptura          → relatório de ruptura (HTML/PDF)
 * GET /api/reports/benchmarking     → relatório de benchmarking (HTML)
 * GET /api/reports/acoes            → ações prioritárias (CSV)
 * GET /api/reports/obras            → relatório de obras (HTML)
 * GET /api/reports/orcamentos       → histórico de orçamentos (CSV)
 */

const express   = require('express');
const router    = express.Router();
const datastore = require('../services/datastore');
const logger    = require('../services/logger');

function _sb()  { return datastore.supabase; }
function _now() { return new Date().toISOString(); }
function _brl(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function _pct(v){ return Number(v||0).toFixed(1) + '%'; }

const STYLE = `
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;padding:24px;background:#fff}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF8C00}
.logo{font-size:20px;font-weight:900;color:#FF8C00}.logo span{color:#1a1a1a}
.meta{text-align:right;font-size:11px;color:#666}
h2{font-size:15px;margin-bottom:4px}
.subtitle{font-size:11px;color:#888;margin-bottom:16px}
table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px}
th{background:#FF8C00;color:#000;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
td{padding:7px 10px;border-bottom:1px solid #f0f0f0}
tr:nth-child(even) td{background:#fafafa}
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
.red{background:#fee2e2;color:#dc2626}.yellow{background:#fef9c3;color:#ca8a04}.green{background:#dcfce7;color:#16a34a}
.total-box{background:#f8f8f8;padding:14px;border-radius:8px;margin-top:12px;display:flex;gap:24px;flex-wrap:wrap}
.total-item{text-align:center}.total-item .n{font-size:22px;font-weight:900;color:#FF8C00}.total-item .l{font-size:10px;color:#888;margin-top:2px}
.footer{margin-top:24px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:10px}
@media print{body{padding:12px}.header{margin-bottom:16px}}
</style>`;

function _header(title, subtitle, user) {
    const now = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">${STYLE}</head><body>
    <div class="header">
        <div><div class="logo">OMNI <span>K11</span></div><div style="font-size:9px;color:#aaa;letter-spacing:2px;margin-top:2px">ELITE OPERATIONAL OS</div></div>
        <div class="meta"><div style="font-weight:700;font-size:13px">${title}</div><div>${subtitle || ''}</div><div style="margin-top:4px">Gerado em ${now}</div>${user ? `<div>Por: ${user}</div>` : ''}</div>
    </div>`;
}

function _footer() {
    return `<div class="footer">Relatório gerado automaticamente pelo K11 OMNI ELITE. Dados sujeitos a atualização em tempo real.</div></body></html>`;
}

// ── GET /api/reports/ruptura ─────────────────────────────────────
router.get('/ruptura', async (req, res) => {
    const format = req.query.format || 'html';
    const user   = req.user?.nome || req.user?.re || 'Operador';

    try {
        const sb = _sb();
        let produtos = [];
        if (sb) {
            const { data } = await sb.from('produtos')
                .select('sku,nome,estoque_atual,estoque_minimo,preco,categoria')
                .lte('estoque_atual', sb.from('produtos').select('estoque_minimo'))
                .order('estoque_atual', { ascending: true })
                .limit(200);
            produtos = data || [];
        }

        if (format === 'csv') {
            const csv = ['SKU,Nome,Categoria,Estoque Atual,Estoque Mínimo,Preço',
                ...produtos.map(p => `"${p.sku}","${p.nome}","${p.categoria||'—'}",${p.estoque_atual||0},${p.estoque_minimo||0},${p.preco||0}`)
            ].join('\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="ruptura-${Date.now()}.csv"`);
            return res.send('\uFEFF' + csv); // BOM para Excel PT
        }

        // HTML report
        const html = _header('Relatório de Ruptura de Estoque', `${produtos.length} SKUs com estoque abaixo do mínimo`, user) + `
        <h2>SKUs em Ruptura ou Atenção</h2>
        <p class="subtitle">${produtos.length} produto(s) identificado(s)</p>
        ${produtos.length === 0 ? '<p style="color:#888;text-align:center;padding:20px">Nenhuma ruptura identificada</p>' : `
        <table>
            <thead><tr><th>SKU</th><th>Produto</th><th>Categoria</th><th>Estoque Atual</th><th>Mínimo</th><th>Preço Unit.</th><th>Status</th></tr></thead>
            <tbody>
                ${produtos.map(p => {
                    const pct = p.estoque_minimo > 0 ? (p.estoque_atual / p.estoque_minimo) * 100 : 0;
                    const cls = pct === 0 ? 'red' : pct < 50 ? 'yellow' : 'green';
                    const lbl = pct === 0 ? 'RUPTURA' : pct < 50 ? 'CRÍTICO' : 'ATENÇÃO';
                    return `<tr><td><b>${p.sku}</b></td><td>${p.nome}</td><td>${p.categoria||'—'}</td><td><b>${p.estoque_atual||0}</b></td><td>${p.estoque_minimo||0}</td><td>${_brl(p.preco)}</td><td><span class="badge ${cls}">${lbl}</span></td></tr>`;
                }).join('')}
            </tbody>
        </table>`}
        <div class="total-box">
            <div class="total-item"><div class="n">${produtos.filter(p=>!p.estoque_atual||p.estoque_atual===0).length}</div><div class="l">Ruptura Total</div></div>
            <div class="total-item"><div class="n">${produtos.length}</div><div class="l">SKUs Afetados</div></div>
        </div>` + _footer();

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename="ruptura-${Date.now()}.html"`);
        return res.send(html);
    } catch (e) {
        logger.error('REPORTS', `ruptura: ${e.message}`);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── GET /api/reports/obras ───────────────────────────────────────
router.get('/obras', async (req, res) => {
    const user = req.user?.nome || req.user?.re || 'Operador';
    try {
        const sb = _sb();
        let obras = [];
        if (sb) {
            const { data } = await sb.from('obras')
                .select('name,address,status,progress_pct,budget,total_spent,start_date,predicted_end_date,created_at')
                .order('created_at', { ascending: false }).limit(100);
            obras = data || [];
        }

        const html = _header('Relatório de Obras', `${obras.length} obra(s)`, user) + `
        <h2>Obras Cadastradas</h2>
        <p class="subtitle">${obras.length} registro(s)</p>
        <table>
            <thead><tr><th>Obra</th><th>Endereço</th><th>Status</th><th>Progresso</th><th>Orçamento</th><th>Gasto</th><th>Início</th><th>Prazo</th></tr></thead>
            <tbody>
                ${obras.map(o => {
                    const cls = o.status==='completed'?'green':o.status==='cancelled'?'red':'yellow';
                    const lbl = {active:'Ativa',paused:'Pausada',completed:'Concluída',cancelled:'Cancelada'}[o.status]||o.status;
                    const pct = Math.round(o.progress_pct||0);
                    const gastoColor = o.budget > 0 && (o.total_spent/o.budget) > 0.9 ? 'color:#dc2626' : '';
                    return `<tr><td><b>${o.name}</b></td><td style="max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.address||'—'}</td><td><span class="badge ${cls}">${lbl}</span></td><td>${pct}%</td><td>${_brl(o.budget)}</td><td style="${gastoColor}">${_brl(o.total_spent)}</td><td>${o.start_date||'—'}</td><td>${o.predicted_end_date||'—'}</td></tr>`;
                }).join('')}
            </tbody>
        </table>
        <div class="total-box">
            <div class="total-item"><div class="n">${obras.filter(o=>o.status==='active').length}</div><div class="l">Ativas</div></div>
            <div class="total-item"><div class="n">${obras.filter(o=>o.status==='completed').length}</div><div class="l">Concluídas</div></div>
            <div class="total-item"><div class="n" style="color:#FF8C00">${_brl(obras.reduce((s,o)=>s+(o.budget||0),0))}</div><div class="l">Orçamento Total</div></div>
            <div class="total-item"><div class="n">${_brl(obras.reduce((s,o)=>s+(o.total_spent||0),0))}</div><div class="l">Total Gasto</div></div>
        </div>` + _footer();

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename="obras-${Date.now()}.html"`);
        return res.send(html);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── GET /api/reports/orcamentos ──────────────────────────────────
router.get('/orcamentos', async (req, res) => {
    try {
        const sb = _sb();
        let orcs = [];
        if (sb) {
            const { data } = await sb.from('orcamentos_ia')
                .select('id,obra_id,total,status,created_at,usuario_ldap,padrao')
                .order('created_at', { ascending: false }).limit(200);
            orcs = data || [];
        }
        const csv = ['ID,Obra,Total,Status,Padrão,Elaborado Por,Data',
            ...orcs.map(o => `"${o.id}","${o.obra_id||'—'}",${o.total||0},"${o.status||'draft'}","${o.padrao||'medio'}","${o.usuario_ldap||'—'}","${o.created_at?.slice(0,10)||'—'}"`)
        ].join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="orcamentos-${Date.now()}.csv"`);
        return res.send('\uFEFF' + csv);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
