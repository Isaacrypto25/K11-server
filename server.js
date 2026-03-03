/**
 * K11 OMNI ELITE — SERVER (Railway)
 * ════════════════════════════════════════════════════════════════
 * Express.js server com:
 * - Auth (JWT)
 * - Data routes (Supabase)
 * - System monitoring
 * - AI Supervisor
 * - Frontend Health Monitoring
 * - Proper error handling
 */

'use strict';

require('dotenv').config();

const express          = require('express');
const cors             = require('cors');
const helmet           = require('helmet');
const compression      = require('compression');
const morgan           = require('morgan');

// ── SERVICES ──────────────────────────────────────────────────
const logger           = require('./services/logger');
const datastore        = require('./services/datastore');
const supervisor       = require('./services/ai-supervisor');
const requestTracker   = require('./middleware/request-tracker');
const auth             = require('./routes/server-auth');

// ── CREATE APP ────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

// ── SECURITY ──────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: [
        'https://web-production-8c4b.up.railway.app',
        'http://localhost:3000',
        'http://localhost:5500',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── BODY PARSING ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── COMPRESSION ───────────────────────────────────────────────
app.use(compression());

// ── LOGGING ───────────────────────────────────────────────────
app.use(morgan('combined'));
app.use(requestTracker);

// ════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        ok: true,
        status: 'ALIVE',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// ── ROOT ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        ok: true,
        message: 'K11 OMNI ELITE Server',
        version: '1.0.0',
        documentation: '/api/docs',
    });
});

// ── AUTH ROUTES ───────────────────────────────────────────────
app.post('/api/auth/login', auth.loginHandler);
app.post('/api/auth/refresh', auth.requireAuth, auth.refreshHandler);
app.post('/api/auth/logout', auth.requireAuth, auth.logoutHandler);

// ── DATA ROUTES ───────────────────────────────────────────────
app.get('/api/data/all', auth.requireAuth, async (req, res) => {
    try {
        const data = await datastore.getAll();
        res.json({
            ok: true,
            data,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.error('ROUTES/DATA', 'Erro ao carregar todos os dados', { error: err.message });
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/data/:dataset', auth.requireAuth, async (req, res) => {
    const { dataset } = req.params;
    const bustCache = req.query.refresh === '1';
    
    try {
        const data = await datastore.get(dataset, { bustCache });
        res.json({
            ok: true,
            dataset,
            count: Array.isArray(data) ? data.length : 0,
            data,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.error('ROUTES/DATA', `Erro ao carregar ${dataset}`, { error: err.message });
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/data/tarefas/:id/toggle', auth.requireAuth, async (req, res) => {
    const { id } = req.params;
    
    try {
        const tarefas = await datastore.get('tarefas', { bustCache: true });
        const tarefa = tarefas.find(t => String(t.id) === String(id));
        
        if (!tarefa) {
            return res.status(404).json({ ok: false, error: 'Tarefa não encontrada' });
        }
        
        const updated = await datastore.updateItem('tarefas', id, { done: !tarefa.done });
        res.json({ ok: true, tarefa: updated });
        
    } catch (err) {
        logger.error('ROUTES/DATA', `Erro no toggle tarefa ${id}`, { error: err.message });
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── SYSTEM ROUTES ─────────────────────────────────────────────
app.get('/api/system/status', (req, res) => {
    const mem = process.memoryUsage();
    const os = require('os');
    
    res.json({
        ok: true,
        system: 'K11 OMNI ELITE',
        version: '1.0.0',
        uptime: {
            seconds: Math.floor(process.uptime()),
            ms: process.uptime() * 1000,
        },
        memory: {
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
            rssMB: Math.round(mem.rss / 1024 / 1024),
        },
        cpu: {
            cores: os.cpus().length,
            loadAvg: os.loadavg(),
        },
        requests: requestTracker.getStats(),
        logs: logger.getStats(),
        datastore: datastore.getStats(),
        timestamp: new Date().toISOString(),
    });
});

app.get('/api/system/logs', (req, res) => {
    const { level, module, limit = 200 } = req.query;
    const logs = logger.getLogs({
        level: level || undefined,
        module: module || undefined,
        limit: parseInt(limit, 10),
    });
    res.json({ ok: true, count: logs.length, logs });
});

app.post('/api/system/log', (req, res) => {
    const { level = 'info', module = 'FRONTEND', message, meta } = req.body || {};
    
    if (!message) {
        return res.status(400).json({ ok: false, error: 'message é obrigatório' });
    }
    
    const validLevels = ['debug', 'info', 'warn', 'error', 'critical'];
    const safeLevel = validLevels.includes(level) ? level : 'info';
    
    logger[safeLevel](String(module).slice(0, 20), String(message).slice(0, 500), meta || null);
    res.json({ ok: true });
});

// ── AI SUPERVISOR ROUTES ──────────────────────────────────────
app.get('/api/ai/health', async (req, res) => {
    try {
        const state = supervisor.getState();
        res.json({ ok: true, state });
    } catch (err) {
        logger.error('ROUTES/AI', 'Erro no health check', { error: err.message });
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/supervisor/frontend-ping', auth.requireAuth, (req, res) => {
    const { clientId, appInitialized, k11LiveStarted, readyState, errors } = req.body;
    
    supervisor.registerFrontendPing(clientId, {
        status: 'online',
        appInitialized,
        k11LiveStarted,
        readyState,
        errors,
    });
    
    res.json({
        ok: true,
        message: 'Ping recebido',
        timestamp: Date.now(),
    });
});

app.get('/api/supervisor/frontend-health', auth.requireAuth, (req, res) => {
    const health = supervisor.getState().frontendHealth;
    res.json({
        ok: true,
        ...health,
    });
});

// ════════════════════════════════════════════════════════════════
// ERROR HANDLERS
// ════════════════════════════════════════════════════════════════

// 404
app.use((req, res) => {
    res.status(404).json({
        ok: false,
        error: 'Rota não encontrada',
        path: req.path,
    });
});

// General error
app.use((err, req, res, next) => {
    logger.error('SERVER', 'Erro não tratado', {
        message: err.message,
        stack: err.stack?.split('\n')[0],
        path: req.path,
    });
    
    res.status(err.status || 500).json({
        ok: false,
        error: err.message || 'Erro interno do servidor',
    });
});

// ════════════════════════════════════════════════════════════════
// STARTUP
// ════════════════════════════════════════════════════════════════

// Initialize services
supervisor.init(datastore);

// Start server
const server = app.listen(PORT, () => {
    logger.info('BOOT', `🚀 K11 OMNI ELITE Server iniciado na porta ${PORT}`, {
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        url: `http://localhost:${PORT}`,
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.warn('BOOT', 'Sinal SIGTERM recebido. Encerrando servidor...');
    server.close(() => {
        logger.info('BOOT', 'Servidor encerrado com sucesso.');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.warn('BOOT', 'Sinal SIGINT recebido. Encerrando servidor...');
    server.close(() => {
        logger.info('BOOT', 'Servidor encerrado com sucesso.');
        process.exit(0);
    });
});

// Uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.critical('UNCAUGHT', 'Exceção não capturada', {
        message: err.message,
        stack: err.stack?.split('\n')[0],
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.critical('UNCAUGHT', 'Promise rejection não tratada', {
        reason: String(reason),
    });
});

module.exports = app;
