'use strict';

/**
 * K11 OMNI ELITE — AI Routes (legacy v1)
 * GET  /api/ai/health  → análise IA do sistema
 * POST /api/ai/chat    → chat com supervisor
 * GET  /api/ai/score   → health score atual
 */

const express    = require('express');
const router     = express.Router();
const logger     = require('../services/logger');
const supervisor = require('../services/ai-supervisor');
const datastore  = require('../services/datastore');

// Cache do último score
let _lastScore = { score: 100, status: 'healthy', ts: null };

// GET /api/ai/health
router.get('/health', async (req, res) => {
    try {
        const snap = {
            uptime:         process.uptime() * 1000,
            logStats:       logger.getStats(),
            datastoreStats: datastore.getStats(),
        };
        const result = await supervisor.analyzeHealth(snap);
        _lastScore = { ...result, ts: new Date().toISOString() };
        res.json({ ok: true, ...result });
    } catch (e) {
        logger.error('AI-LEGACY', `health: ${e.message}`);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    // Redireciona para análise simples via supervisor
    try {
        const snap = { uptime: process.uptime() * 1000, logStats: logger.getStats(), userMessage: message };
        const result = await supervisor.analyzeHealth(snap);
        res.json({ ok: true, reply: result.recommendations?.join(' ') || 'Sistema operando normalmente.', ...result });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/ai/score
router.get('/score', (req, res) => {
    res.json({ ok: true, ..._lastScore });
});

module.exports = router;
