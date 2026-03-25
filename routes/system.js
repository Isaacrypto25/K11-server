'use strict';

/**
 * K11 OMNI ELITE — System Routes
 * GET  /api/system/status  → métricas completas
 * GET  /api/system/logs    → logs recentes
 * GET  /api/system/stream  → SSE: stream de logs em tempo real
 * POST /api/system/log     → injeta log do front-end
 */

const express   = require('express');
const router    = express.Router();
const os        = require('os');
const logger    = require('../services/logger');
const datastore = require('../services/datastore');

// GET /api/system/status
router.get('/status', (req, res) => {
    const mem = process.memoryUsage();
    const cpus = os.cpus();
    res.json({
        ok: true,
        system: {
            uptime:    process.uptime(),
            platform:  os.platform(),
            arch:      os.arch(),
            nodeVersion: process.version,
            pid:       process.pid,
            hostname:  os.hostname(),
        },
        memory: {
            heapUsed:  Math.round(mem.heapUsed  / 1024 / 1024) + 'MB',
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
            rss:       Math.round(mem.rss       / 1024 / 1024) + 'MB',
            external:  Math.round(mem.external  / 1024 / 1024) + 'MB',
        },
        cpu: {
            model: cpus[0]?.model || 'unknown',
            cores: cpus.length,
            loadAvg: os.loadavg(),
        },
        logs:      logger.getStats(),
        datastore: datastore.getStats(),
        env:       process.env.NODE_ENV || 'development',
        ts:        new Date().toISOString(),
    });
});

// GET /api/system/logs
router.get('/logs', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '100'), 500);
    const level = req.query.level;
    let logs = logger.getLogs(limit);
    if (level) logs = logs.filter(l => l.level === level);
    res.json({ ok: true, logs, count: logs.length });
});

// GET /api/system/stream — SSE
router.get('/stream', (req, res) => {
    logger.addSSEClient(res);
});

// POST /api/system/log — injeta log do front-end
router.post('/log', (req, res) => {
    const { level = 'info', module = 'FRONTEND', message, meta } = req.body;
    const allowed = ['debug', 'info', 'warn', 'error'];
    if (!allowed.includes(level)) return res.status(400).json({ ok: false, error: 'Nível inválido.' });
    if (!message) return res.status(400).json({ ok: false, error: 'message obrigatório.' });
    logger[level](`[CLIENT] ${module}`, message, meta);
    res.json({ ok: true });
});

module.exports = router;
