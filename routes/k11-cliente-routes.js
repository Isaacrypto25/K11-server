'use strict';

/**
 * K11 OMNI ELITE — Portal do Cliente Routes (k11-cliente-routes)
 * Requer: auth.requireAuth + auth.requireCliente
 *
 * GET  /api/cliente/obras          → obras do cliente logado
 * GET  /api/cliente/obras/:id      → detalhe da obra
 * GET  /api/cliente/orcamentos/:id → orçamentos da obra
 * GET  /api/cliente/chat/:obra_id  → mensagens da obra
 * POST /api/cliente/chat           → enviar mensagem
 * GET  /api/cliente/perfil         → perfil do cliente
 * PUT  /api/cliente/perfil         → atualizar perfil
 * GET  /api/cliente/notificacoes   → notificações
 */

const express   = require('express');
const router    = express.Router();
const datastore = require('../services/datastore');
const logger    = require('../services/logger');
const crypto    = require('crypto');

function _sb()  { return datastore.supabase; }
function _now() { return new Date().toISOString(); }
function _uuid(){ return crypto.randomUUID(); }

// ── GET /api/cliente/obras ────────────────────────────────────
router.get('/obras', async (req, res) => {
    try {
        const email = req.user?.email || req.user?.re;
        const sb = _sb();

        if (sb) {
            const { data, error } = await sb
                .from('obras')
                .select('id,name,address,status,progress_pct,start_date,predicted_end_date,budget,total_spent,created_at')
                .eq('cliente_email', email)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return res.json({ ok: true, data: data || [] });
        }

        return res.json({ ok: true, data: [] });
    } catch (e) {
        logger.error('CLIENTE', `obras: ${e.message}`);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── GET /api/cliente/obras/:id ───────────────────────────────
router.get('/obras/:id', async (req, res) => {
    try {
        const sb = _sb();
        if (sb) {
            const { data, error } = await sb.from('obras').select('*').eq('id', req.params.id).single();
            if (error || !data) return res.status(404).json({ ok: false, error: 'Obra não encontrada.' });
            return res.json({ ok: true, data });
        }
        return res.status(404).json({ ok: false, error: 'Obra não encontrada.' });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── GET /api/cliente/orcamentos/:obra_id ─────────────────────
router.get('/orcamentos/:obra_id', async (req, res) => {
    try {
        const sb = _sb();
        if (sb) {
            const { data, error } = await sb
                .from('orcamentos_ia')
                .select('id,total,created_at,dados')
                .eq('obra_id', req.params.obra_id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return res.json({ ok: true, data: data || [] });
        }
        return res.json({ ok: true, data: [] });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── GET /api/cliente/chat/:obra_id ───────────────────────────
router.get('/chat/:obra_id', async (req, res) => {
    try {
        const sb = _sb();
        if (sb) {
            const { data, error } = await sb
                .from('obra_mensagens')
                .select('*')
                .eq('obra_id', req.params.obra_id)
                .order('created_at', { ascending: true })
                .limit(100);
            if (error) throw error;
            return res.json({ ok: true, data: data || [] });
        }
        return res.json({ ok: true, data: [] });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── POST /api/cliente/chat ───────────────────────────────────
router.post('/chat', async (req, res) => {
    try {
        const { obra_id, mensagem } = req.body;
        if (!obra_id || !mensagem) return res.status(400).json({ ok: false, error: 'obra_id e mensagem obrigatórios.' });

        const user = req.user;
        const msg  = {
            obra_id,
            autor_email: user?.email,
            autor_nome:  user?.nome || user?.email,
            lado:        'cliente',
            mensagem:    mensagem.trim(),
            created_at:  _now(),
        };

        const sb = _sb();
        if (sb) {
            const { data, error } = await sb.from('obra_mensagens').insert(msg).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, data });
        }
        return res.status(201).json({ ok: true, data: { id: _uuid(), ...msg } });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── GET /api/cliente/perfil ──────────────────────────────────
router.get('/perfil', async (req, res) => {
    try {
        const email = req.user?.email;
        const sb    = _sb();
        if (sb) {
            const { data, error } = await sb.from('k11_clientes').select('id,nome,email,telefone,cpf,created_at,ativo').eq('email', email).single();
            if (error) throw error;
            return res.json({ ok: true, data });
        }
        return res.json({ ok: true, data: req.user });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── PUT /api/cliente/perfil ──────────────────────────────────
router.put('/perfil', async (req, res) => {
    try {
        const email   = req.user?.email;
        const allowed = ['nome', 'telefone'];
        const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
        updates.updated_at = _now();

        const sb = _sb();
        if (sb) {
            const { data, error } = await sb.from('k11_clientes').update(updates).eq('email', email).select().single();
            if (error) throw error;
            return res.json({ ok: true, data });
        }
        return res.json({ ok: true, data: { ...req.user, ...updates } });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── GET /api/cliente/notificacoes ────────────────────────────
router.get('/notificacoes', async (req, res) => {
    try {
        const email = req.user?.email;
        const sb    = _sb();
        if (sb) {
            const { data, error } = await sb
                .from('k11_notificacoes')
                .select('*')
                .eq('destinatario_email', email)
                .eq('lida', false)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            return res.json({ ok: true, data: data || [] });
        }
        return res.json({ ok: true, data: [] });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
