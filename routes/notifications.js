'use strict';

/**
 * K11 OMNI ELITE — Notifications Routes
 * ═══════════════════════════════════════
 * POST /api/notifications/subscribe     → salva subscription de push
 * POST /api/notifications/send          → envia push (admin)
 * GET  /api/notifications/stream        → SSE para clientes
 * POST /api/notifications/mark-read/:id → marca como lida
 * GET  /api/notifications/mine          → notificações do usuário
 */

const express   = require('express');
const router    = express.Router();
const datastore = require('../services/datastore');
const logger    = require('../services/logger');
const crypto    = require('crypto');

function _sb()   { return datastore.supabase; }
function _now()  { return new Date().toISOString(); }
function _uuid() { return crypto.randomUUID(); }

// SSE clients por usuário: { userId → Set<res> }
const _sseByUser = new Map();

function _broadcastToUser(userId, event, data) {
    const clients = _sseByUser.get(userId);
    if (!clients?.size) return;
    const payload = `data: ${JSON.stringify({ event, data, ts: _now() })}\n\n`;
    for (const res of clients) {
        try { res.write(payload); }
        catch (_) { clients.delete(res); }
    }
}

// Exportado para uso interno (e.g. quando obra muda de fase)
function notify(userId, { type, title, message, link, role = 'operacional' }) {
    const notif = {
        id:                 _uuid(),
        destinatario_ldap:  role !== 'cliente' ? userId : null,
        destinatario_email: role === 'cliente' ? userId : null,
        tipo:               type,
        titulo:             title,
        mensagem:           message,
        link:               link || null,
        lida:               false,
        created_at:         _now(),
    };

    // Persiste no Supabase
    const sb = _sb();
    if (sb) {
        sb.from('k11_notificacoes').insert(notif).catch(() => {});
    }

    // Envia via SSE imediatamente
    _broadcastToUser(userId, 'notification', notif);

    return notif;
}

// ── GET /api/notifications/stream ─────────────────────────────
router.get('/stream', (req, res) => {
    const userId = req.user?.re || req.user?.email;
    if (!userId) return res.status(401).end();

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    if (!_sseByUser.has(userId)) _sseByUser.set(userId, new Set());
    _sseByUser.get(userId).add(res);

    // Envia notificações não lidas imediatamente
    const sb = _sb();
    if (sb) {
        const col = req.user?.role === 'cliente' ? 'destinatario_email' : 'destinatario_ldap';
        sb.from('k11_notificacoes')
          .select('*').eq(col, userId).eq('lida', false)
          .order('created_at', { ascending: false }).limit(10)
          .then(({ data }) => {
              if (data?.length) {
                  res.write(`data: ${JSON.stringify({ event: 'pending', data: data, ts: _now() })}\n\n`);
              }
          }).catch(() => {});
    }

    // Keepalive
    const ka = setInterval(() => {
        try { res.write(': keepalive\n\n'); }
        catch (_) { clearInterval(ka); _sseByUser.get(userId)?.delete(res); }
    }, 25000);

    res.on('close', () => {
        clearInterval(ka);
        _sseByUser.get(userId)?.delete(res);
    });
});

// ── GET /api/notifications/mine ────────────────────────────────
router.get('/mine', async (req, res) => {
    try {
        const sb  = _sb();
        const uid = req.user?.re || req.user?.email;
        const col = req.user?.role === 'cliente' ? 'destinatario_email' : 'destinatario_ldap';
        if (!sb) return res.json({ ok: true, data: [] });
        const { data, error } = await sb
            .from('k11_notificacoes').select('*')
            .eq(col, uid).order('created_at', { ascending: false }).limit(30);
        if (error) throw error;
        res.json({ ok: true, data: data || [] });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── POST /api/notifications/mark-read/:id ─────────────────────
router.post('/mark-read/:id', async (req, res) => {
    try {
        const sb = _sb();
        if (sb) {
            await sb.from('k11_notificacoes')
                .update({ lida: true }).eq('id', req.params.id);
        }
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── POST /api/notifications/subscribe (push) ──────────────────
router.post('/subscribe', async (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription?.endpoint) return res.status(400).json({ ok: false, error: 'subscription inválida' });
        const uid = req.user?.re || req.user?.email;
        const sb  = _sb();
        if (sb) {
            await sb.from('push_subscriptions').upsert({
                user_id:      uid,
                endpoint:     subscription.endpoint,
                keys:         JSON.stringify(subscription.keys || {}),
                updated_at:   _now(),
            }, { onConflict: 'endpoint' });
        }
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── POST /api/notifications/send (interno/admin) ──────────────
router.post('/send', async (req, res) => {
    try {
        const { userId, type, title, message, link, role } = req.body;
        if (!userId || !title) return res.status(400).json({ ok: false, error: 'userId e title obrigatórios' });
        const notif = notify(userId, { type, title, message, link, role });
        res.json({ ok: true, data: notif });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router._broadcastToUser = _broadcastToUser;
router.notify           = notify;

module.exports = router;
