'use strict';

/**
 * K11 OMNI ELITE — Orçamento Approval Workflow
 * ══════════════════════════════════════════════
 * Fluxo completo de aprovação de orçamentos:
 *   draft → sent → approved | rejected | negotiating
 *
 * POST /api/orcamento/:id/send      → gestor envia ao cliente
 * POST /api/orcamento/:id/approve   → cliente aprova
 * POST /api/orcamento/:id/reject    → cliente rejeita com motivo
 * POST /api/orcamento/:id/negotiate → cliente propõe ajuste
 * POST /api/orcamento/:id/counter   → gestor envia contraproposta
 * GET  /api/orcamento/:id/status    → status atual + histórico
 */

const express   = require('express');
const router    = express.Router();
const crypto    = require('crypto');
const datastore = require('../services/datastore');
const logger    = require('../services/logger');

function _sb()   { return datastore.supabase; }
function _now()  { return new Date().toISOString(); }
function _uuid() { return crypto.randomUUID(); }

const VALID_TRANSITIONS = {
    draft:       ['sent'],
    sent:        ['approved', 'rejected', 'negotiating'],
    negotiating: ['approved', 'rejected', 'sent'],
    approved:    [],
    rejected:    ['sent'],  // pode reenviar revisão
};

async function _getOrcamento(id) {
    const sb = _sb();
    if (!sb) return null;
    const { data } = await sb.from('orcamentos_ia').select('*').eq('id', id).single();
    return data;
}

async function _appendHistory(sb, id, action, actor, message) {
    const { data: orc } = await sb.from('orcamentos_ia').select('approval_history').eq('id', id).single();
    const history = orc?.approval_history || [];
    history.push({ action, actor, message: message || null, ts: _now() });
    await sb.from('orcamentos_ia').update({ approval_history: history, updated_at: _now() }).eq('id', id);
}

// ── POST /api/orcamento/:id/send ──────────────────────────────
router.post('/:id/send', async (req, res) => {
    try {
        const orc = await _getOrcamento(req.params.id);
        if (!orc) return res.status(404).json({ ok: false, error: 'Orçamento não encontrado' });

        const currentStatus = orc.status || 'draft';
        if (!VALID_TRANSITIONS[currentStatus]?.includes('sent')) {
            return res.status(400).json({ ok: false, error: `Não pode enviar orçamento no status "${currentStatus}"` });
        }

        const sb = _sb();
        await sb.from('orcamentos_ia').update({
            status:     'sent',
            sent_at:    _now(),
            sent_by:    req.user?.re,
            updated_at: _now(),
        }).eq('id', req.params.id);

        await _appendHistory(sb, req.params.id, 'sent', req.user?.re || req.user?.nome, req.body.message);

        // Notifica o cliente via notificações (se disponível)
        try {
            const notifRouter = require('./notifications');
            if (orc.cliente_email && notifRouter.notify) {
                notifRouter.notify(orc.cliente_email, {
                    type:    'orcamento',
                    title:   'Novo orçamento disponível',
                    message: `Você recebeu um orçamento de ${orc.total?.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }) || 'R$ —'}. Acesse o portal para aprovar.`,
                    link:    `/dashboard.html?view=orcamentos&id=${req.params.id}`,
                    role:    'cliente',
                });
            }
        } catch (_) {}

        logger.info('ORCAMENTO', `Orçamento ${req.params.id} enviado para aprovação`);
        res.json({ ok: true, status: 'sent' });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── POST /api/orcamento/:id/approve ───────────────────────────
router.post('/:id/approve', async (req, res) => {
    try {
        const orc = await _getOrcamento(req.params.id);
        if (!orc) return res.status(404).json({ ok: false, error: 'Orçamento não encontrado' });

        const currentStatus = orc.status || 'draft';
        if (!VALID_TRANSITIONS[currentStatus]?.includes('approved')) {
            return res.status(400).json({ ok: false, error: `Não pode aprovar orçamento no status "${currentStatus}"` });
        }

        const sb = _sb();
        await sb.from('orcamentos_ia').update({
            status:       'approved',
            approved_at:  _now(),
            approved_by:  req.user?.email || req.user?.re,
            updated_at:   _now(),
        }).eq('id', req.params.id);

        await _appendHistory(sb, req.params.id, 'approved', req.user?.email || 'cliente', req.body.message);

        // Notifica o gestor
        try {
            const notifRouter = require('./notifications');
            if (orc.usuario_ldap && notifRouter.notify) {
                notifRouter.notify(orc.usuario_ldap, {
                    type:    'orcamento',
                    title:   '✅ Orçamento aprovado!',
                    message: `O cliente aprovou o orçamento de ${orc.total?.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }) || 'R$ —'}.`,
                    link:    `/dashboard.html?view=obras&id=${orc.obra_id}`,
                    role:    'operacional',
                });
            }
        } catch (_) {}

        logger.info('ORCAMENTO', `Orçamento ${req.params.id} APROVADO`);
        res.json({ ok: true, status: 'approved' });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── POST /api/orcamento/:id/reject ────────────────────────────
router.post('/:id/reject', async (req, res) => {
    try {
        const { motivo } = req.body;
        if (!motivo) return res.status(400).json({ ok: false, error: 'Informe o motivo da rejeição' });

        const orc = await _getOrcamento(req.params.id);
        if (!orc) return res.status(404).json({ ok: false, error: 'Orçamento não encontrado' });

        const sb = _sb();
        await sb.from('orcamentos_ia').update({
            status:      'rejected',
            rejected_at: _now(),
            rejected_by: req.user?.email || req.user?.re,
            reject_reason: motivo,
            updated_at:  _now(),
        }).eq('id', req.params.id);

        await _appendHistory(sb, req.params.id, 'rejected', req.user?.email || 'cliente', motivo);

        // Notifica o gestor
        try {
            const notifRouter = require('./notifications');
            if (orc.usuario_ldap && notifRouter.notify) {
                notifRouter.notify(orc.usuario_ldap, {
                    type:    'orcamento',
                    title:   '❌ Orçamento rejeitado',
                    message: `Motivo: ${motivo}`,
                    link:    `/dashboard.html?view=obras&id=${orc.obra_id}`,
                    role:    'operacional',
                });
            }
        } catch (_) {}

        res.json({ ok: true, status: 'rejected' });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── POST /api/orcamento/:id/negotiate ─────────────────────────
router.post('/:id/negotiate', async (req, res) => {
    try {
        const { mensagem, valor_proposto } = req.body;
        if (!mensagem) return res.status(400).json({ ok: false, error: 'mensagem obrigatória' });

        const orc = await _getOrcamento(req.params.id);
        if (!orc) return res.status(404).json({ ok: false, error: 'Orçamento não encontrado' });

        const sb = _sb();
        await sb.from('orcamentos_ia').update({
            status:          'negotiating',
            negotiation_msg: mensagem,
            valor_proposto:  valor_proposto || null,
            updated_at:      _now(),
        }).eq('id', req.params.id);

        await _appendHistory(sb, req.params.id, 'negotiate', req.user?.email || 'cliente', mensagem);

        res.json({ ok: true, status: 'negotiating' });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── GET /api/orcamento/:id/status ─────────────────────────────
router.get('/:id/status', async (req, res) => {
    try {
        const orc = await _getOrcamento(req.params.id);
        if (!orc) return res.status(404).json({ ok: false, error: 'Orçamento não encontrado' });

        const allowedNext = VALID_TRANSITIONS[orc.status || 'draft'] || [];
        res.json({
            ok: true,
            data: {
                id:             orc.id,
                status:         orc.status || 'draft',
                total:          orc.total,
                sent_at:        orc.sent_at,
                approved_at:    orc.approved_at,
                rejected_at:    orc.rejected_at,
                reject_reason:  orc.reject_reason,
                valor_proposto: orc.valor_proposto,
                history:        orc.approval_history || [],
                allowedActions: allowedNext,
            },
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
