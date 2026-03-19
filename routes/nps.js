'use strict';

/**
 * K11 OMNI ELITE — NPS & Feedback
 * ═════════════════════════════════
 * Coleta NPS do cliente quando uma fase é concluída.
 * 
 * POST /api/nps/responder       → cliente registra resposta
 * GET  /api/nps/obra/:obraId    → NPS médio da obra
 * GET  /api/nps/summary         → relatório consolidado (operacional)
 */

const express   = require('express');
const router    = express.Router();
const crypto    = require('crypto');
const datastore = require('../services/datastore');
const logger    = require('../services/logger');

function _sb()   { return datastore.supabase; }
function _now()  { return new Date().toISOString(); }
function _uuid() { return crypto.randomUUID(); }

// ── POST /api/nps/responder ──────────────────────────────────────
router.post('/responder', async (req, res) => {
    try {
        const { obra_id, fase_id, nota, comentario } = req.body;
        if (!obra_id || nota == null) {
            return res.status(400).json({ ok: false, error: 'obra_id e nota são obrigatórios' });
        }
        if (nota < 0 || nota > 10) {
            return res.status(400).json({ ok: false, error: 'nota deve ser entre 0 e 10' });
        }

        const categoria = nota >= 9 ? 'promotor' : nota >= 7 ? 'neutro' : 'detrator';
        const resposta  = {
            id:             _uuid(),
            obra_id,
            fase_id:        fase_id || null,
            cliente_email:  req.user?.email,
            nota:           parseInt(nota),
            comentario:     comentario?.trim() || null,
            categoria,
            created_at:     _now(),
        };

        const sb = _sb();
        if (sb) {
            const { data, error } = await sb.from('nps_respostas').insert(resposta).select().single();
            if (error) throw error;
            logger.info('NPS', `Nota ${nota} (${categoria}) para obra ${obra_id}`);
            return res.status(201).json({ ok: true, data, categoria });
        }
        res.status(201).json({ ok: true, data: resposta, categoria });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── GET /api/nps/obra/:obraId ─────────────────────────────────────
router.get('/obra/:obraId', async (req, res) => {
    try {
        const sb = _sb();
        if (!sb) return res.json({ ok: true, data: null });

        const { data, error } = await sb
            .from('nps_respostas')
            .select('nota, categoria, comentario, created_at, fase_id')
            .eq('obra_id', req.params.obraId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!data?.length) return res.json({ ok: true, data: { nps: null, respostas: [] } });

        const promotores = data.filter(r => r.categoria === 'promotor').length;
        const detratores = data.filter(r => r.categoria === 'detrator').length;
        const total      = data.length;
        const nps        = Math.round(((promotores - detratores) / total) * 100);
        const media      = Math.round(data.reduce((s, r) => s + r.nota, 0) / total * 10) / 10;

        res.json({
            ok: true,
            data: {
                nps, media, total,
                promotores, neutros: data.filter(r => r.categoria === 'neutro').length, detratores,
                respostas: data,
            },
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── GET /api/nps/summary ──────────────────────────────────────────
router.get('/summary', async (req, res) => {
    try {
        const sb = _sb();
        if (!sb) return res.json({ ok: true, data: [] });

        const { data, error } = await sb
            .from('nps_respostas')
            .select('obra_id, nota, categoria, created_at')
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;

        // Agrupa por obra
        const byObra = {};
        (data || []).forEach(r => {
            if (!byObra[r.obra_id]) byObra[r.obra_id] = [];
            byObra[r.obra_id].push(r);
        });

        const summary = Object.entries(byObra).map(([obraId, resps]) => {
            const prom = resps.filter(r => r.categoria === 'promotor').length;
            const detr = resps.filter(r => r.categoria === 'detrator').length;
            const nps  = Math.round(((prom - detr) / resps.length) * 100);
            const med  = Math.round(resps.reduce((s,r)=>s+r.nota,0) / resps.length * 10) / 10;
            return { obraId, nps, media: med, total: resps.length };
        }).sort((a, b) => b.nps - a.nps);

        res.json({ ok: true, data: summary });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Trigger automático quando fase é concluída ────────────────────
// Chamado internamente (server.js hook no POST /api/schedule/:id/update-progress)
async function triggerNPSAfterPhase(obraId, faseId, clienteEmail) {
    if (!clienteEmail) return;
    try {
        const notifRouter = require('./notifications');
        if (notifRouter.notify) {
            notifRouter.notify(clienteEmail, {
                type:    'nps',
                title:   '⭐ Avalie esta etapa da obra',
                message: 'Uma nova fase foi concluída! Nos conte como foi sua experiência.',
                link:    `/dashboard.html?view=nps&obra=${obraId}&fase=${faseId}`,
                role:    'cliente',
            });
        }
    } catch (_) {}
}

module.exports = { router, triggerNPSAfterPhase };
