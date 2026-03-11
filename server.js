/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║          K11 OMNI ELITE — BACKEND SERVER v4.0                  ║
 * ║          AI Stack v4 — Tokens Otimizados + Cross-Brand         ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * Stack: Node.js · Express · SQLite · Supabase · Groq AI
 *
 * v4.0 — Novidades:
 *   • GET  /api/ai/v3/alerts       → lista alertas proativos + unreadCount
 *   • POST /api/ai/v3/alerts/read  → zera contador de alertas não-lidos
 *   • ai_core v4: timeout 15s, max_tokens 450, contexto ≤400 tokens
 *
 * Endpoints completos:
 * GET  /health
 * GET  /api/status
 * POST /api/auth/login
 * POST /api/auth/register
 * POST /api/auth/confirm-pin
 * POST /api/auth/resend-pin
 * POST /api/auth/refresh
 * POST /api/auth/logout
 * POST /api/auth/forgot-password
 * POST /api/auth/reset-password
 * GET  /api/data/all
 * GET  /api/data/:dataset
 * PUT  /api/data/:dataset/:id
 * GET  /api/system/status
 * GET  /api/system/logs
 * GET  /api/system/stream
 * POST /api/system/log
 * GET  /api/supervisor/stream
 * POST /api/supervisor/chat
 * GET  /api/supervisor/status
 * POST /api/ai/v3/chat
 * POST /api/ai/v3/strategy
 * POST /api/ai/v3/anomaly
 * GET  /api/ai/v3/stream
 * GET  /api/ai/v3/proactive
 * GET  /api/ai/v3/alerts         ← [v4]
 * POST /api/ai/v3/alerts/read    ← [v4]
 * GET  /api/ai/v3/memory/:pdvId
 * GET  /api/price-intel/stream
 * GET  /api/price-intel/state
 * POST /api/price-intel/scan-all
 * GET  /api/price-intel/history/:productId
 * GET  /api/decision/stream
 * GET  /api/decision/state
 * GET  /api/decision/health/:pdvId
 * GET  /api/decision/forecast/:productId
 * POST /api/decision/run-cycle
 */

'use strict';

require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const path        = require('path');
const os          = require('os');

// ── SERVIÇOS ──────────────────────────────────────────────────
const logger         = require('./services/logger');
const datastore      = require('./services/datastore');
const supervisor_svc = require('./services/ai-supervisor');

// ── MIDDLEWARE E AUTH ─────────────────────────────────────────
const auth           = require('./middleware/server-auth');
const register       = require('./middleware/server-register');
const requestTracker = require('./middleware/request-tracker');

// ── ROTAS INTERNAS ────────────────────────────────────────────
const dataRoutes   = require('./routes/data');
const systemRoutes = require('./routes/system');
const aiRoutes     = require('./routes/ai');

// ── AI STACK v4 ───────────────────────────────────────────────
const supervisor     = require('./routes/k11_supervisor_backend');
const pdvDomination  = require('./routes/k11_pdv_domination_engine');
const aiCore         = require('./routes/k11_ai_core');          // v4
const priceIntel     = require('./routes/k11_price_intelligence');
const decisionEngine = require('./routes/k11_decision_engine');

// ── ESTADO: contagem de alertas não-lidos por sessão ─────────
// Mapa userId → unreadCount (reseta ao chamar /alerts/read)
const alertsUnread = new Map();

// ─────────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3000', 10);

logger.info('BOOT', '════════════════════════════════════════');
logger.info('BOOT', '  K11 OMNI ELITE SERVER v4.0 — AI Stack v4');
logger.info('BOOT', '════════════════════════════════════════');
logger.info('BOOT', `Node.js ${process.version} | PID ${process.pid}`);
logger.info('BOOT', `Plataforma: ${os.platform()} ${os.arch()}`);

// ── SEGURANÇA ─────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy:     false,
    crossOriginEmbedderPolicy: false,
}));

app.use(cors({
    origin: (origin, cb) => {
        if (!origin ||
            origin.includes('localhost') ||
            origin.includes('127.0.0.1') ||
            origin.includes('railway.app') ||
            origin.includes('file://')) {
            return cb(null, true);
        }
        cb(null, true);
    },
    credentials: true,
    methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-K11-Token'],
}));

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── RATE LIMITING ─────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max:      parseInt(process.env.RATE_LIMIT_MAX       || '120',   10),
    standardHeaders: true,
    legacyHeaders:   false,
    handler: (req, res) => {
        logger.warn('RATE-LIMIT', `Limite excedido`, { ip: req.ip, path: req.path });
        res.status(429).json({ ok: false, error: 'Muitas requisições. Tente em 1 minuto.' });
    },
});
app.use('/api', limiter);

// ── MORGAN ────────────────────────────────────────────────────
app.use(morgan((tokens, req, res) => {
    const status = tokens.status(req, res);
    const ms     = tokens['response-time'](req, res);
    const method = tokens.method(req, res);
    const url    = tokens.url(req, res);
    if (url?.includes('/stream')) return null;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'debug';
    logger[level]('HTTP', `${method} ${url} → ${status} (${ms}ms)`);
    return null;
}));

app.use(requestTracker);

// ─────────────────────────────────────────────────────────────
// AUTENTICAÇÃO E REGISTRO
// ─────────────────────────────────────────────────────────────
app.post('/api/auth/login',           auth.loginHandler);
app.post('/api/auth/register',        register.registerHandler);
app.post('/api/auth/confirm-pin',     register.confirmPinHandler);
app.post('/api/auth/resend-pin',      register.resendPinHandler);
app.post('/api/auth/refresh',         auth.requireAuth, auth.refreshHandler);
app.post('/api/auth/logout',          auth.requireAuth, auth.logoutHandler);
app.post('/api/auth/forgot-password', register.forgotPasswordHandler);
app.post('/api/auth/reset-password',  register.resetPasswordHandler);

// ─────────────────────────────────────────────────────────────
// ROTAS PÚBLICAS
// ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '4.0.0', ts: new Date().toISOString() });
});

app.get('/api/status', (req, res) => {
    res.json({
        ok:      true,
        system:  'K11 OMNI ELITE',
        version: '4.0.0',
        stack:   'AI Stack v4',
        uptime:  Math.floor(process.uptime()),
        env:     process.env.NODE_ENV || 'development',
        modules: {
            supervisor:     true,
            pdvDomination:  true,
            aiCore:         true,
            priceIntel:     true,
            decisionEngine: true,
        },
    });
});

// ─────────────────────────────────────────────────────────────
// ROTAS PROTEGIDAS — INTERNAS
// ─────────────────────────────────────────────────────────────
app.use('/api/data',   auth.requireAuth, dataRoutes);
app.use('/api/system', auth.requireAuth, systemRoutes);
app.use('/api/ai',     auth.requireAuth, aiRoutes);

// ─────────────────────────────────────────────────────────────
// SUPERVISOR LEGACY
// ─────────────────────────────────────────────────────────────
app.get('/api/supervisor/stream', auth.requireAuth, (req, res) => {
    supervisor.addSSEClient(res);
});

app.post('/api/supervisor/chat', auth.requireAuth, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'message required' });
        const result = await supervisor.chat(message);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/supervisor/status', auth.requireAuth, (req, res) => {
    res.json({ ok: true, data: supervisor.getState ? supervisor.getState() : {} });
});

// ─────────────────────────────────────────────────────────────
// AI CORE v4
// ─────────────────────────────────────────────────────────────

// Chat otimizado (1 chamada, contexto ≤400 tokens)
app.post('/api/ai/v3/chat', auth.requireAuth, async (req, res) => {
    try {
        const { message, pdvId, pdvData, mode } = req.body;
        if (!message) return res.status(400).json({ error: 'message required' });
        const response = await aiCore.chat(message, {
            pdvId,
            userId:  req.user?.id,
            pdvData: pdvData || null,
            mode:    mode    || 'auto',
        });
        res.json({ ok: true, ...response });
    } catch (err) {
        logger.error('AI-CORE', `Erro no chat: ${err.message}`);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Estratégia completa por PDV
app.post('/api/ai/v3/strategy', auth.requireAuth, async (req, res) => {
    try {
        const { pdvData, depth } = req.body;
        const result = await aiCore.generateStrategy(pdvData, { depth: depth || 'full' });
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Análise de anomalia pontual
app.post('/api/ai/v3/anomaly', auth.requireAuth, async (req, res) => {
    try {
        const { pdvId, pdvName, metric, currentValue, expectedValue, unit } = req.body;
        const result = await aiCore.analyzeAnomaly(pdvId, pdvName, metric, currentValue, expectedValue, unit);
        res.json({ ok: true, data: result });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// SSE — alertas proativos em tempo real
app.get('/api/ai/v3/stream', auth.requireAuth, (req, res) => {
    const userId = req.user?.id;
    // Incrementa contador de não-lidos quando novo cliente conecta com alertas pendentes
    if (aiCore.getProactiveAlerts().length > 0 && userId) {
        const existing = alertsUnread.get(userId) || 0;
        if (existing === 0) alertsUnread.set(userId, aiCore.getProactiveAlerts().length);
    }
    aiCore.addSSEClient(res);
});

// Fila de alertas proativos pendentes
app.get('/api/ai/v3/proactive', auth.requireAuth, (req, res) => {
    res.json({ ok: true, alerts: aiCore.getProactiveAlerts() });
});

// [v4] Lista alertas com contagem de não-lidos
app.get('/api/ai/v3/alerts', auth.requireAuth, (req, res) => {
    const userId     = req.user?.id;
    const alerts     = aiCore.getProactiveAlerts();
    const unreadCount = alertsUnread.get(userId) || 0;
    res.json({ ok: true, alerts, unreadCount });
});

// [v4] Zera contador de alertas não-lidos para o usuário
app.post('/api/ai/v3/alerts/read', auth.requireAuth, (req, res) => {
    const userId = req.user?.id;
    if (userId) alertsUnread.set(userId, 0);
    res.json({ ok: true });
});

// Memória acumulada de um PDV
app.get('/api/ai/v3/memory/:pdvId', auth.requireAuth, (req, res) => {
    res.json({ ok: true, data: aiCore.getMemory(req.params.pdvId) });
});

// ─────────────────────────────────────────────────────────────
// PRICE INTELLIGENCE
// ─────────────────────────────────────────────────────────────
app.get('/api/price-intel/stream', auth.requireAuth, (req, res) => {
    priceIntel.addSSEClient(res);
});

app.get('/api/price-intel/state', auth.requireAuth, (req, res) => {
    res.json({ ok: true, data: priceIntel.getState() });
});

app.post('/api/price-intel/scan-all', auth.requireAuth, (req, res) => {
    priceIntel.forceFullScan();
    res.json({ ok: true, message: 'Scan iniciado em background' });
});

app.get('/api/price-intel/history/:productId', auth.requireAuth, (req, res) => {
    res.json({ ok: true, data: priceIntel.getPriceHistory(req.params.productId) });
});

// ─────────────────────────────────────────────────────────────
// DECISION ENGINE
// ─────────────────────────────────────────────────────────────
app.get('/api/decision/stream', auth.requireAuth, (req, res) => {
    decisionEngine.addSSEClient(res);
});

app.get('/api/decision/state', auth.requireAuth, (req, res) => {
    res.json({ ok: true, data: decisionEngine.getState() });
});

app.get('/api/decision/health/:pdvId', auth.requireAuth, (req, res) => {
    res.json({ ok: true, data: decisionEngine.getHealthScore(req.params.pdvId) });
});

app.get('/api/decision/forecast/:productId', auth.requireAuth, (req, res) => {
    res.json({ ok: true, data: decisionEngine.getForecast(req.params.productId) });
});

app.post('/api/decision/run-cycle', auth.requireAuth, (req, res) => {
    decisionEngine.runFullCycle();
    res.json({ ok: true, message: 'Ciclo iniciado em background' });
});

// ─────────────────────────────────────────────────────────────
// ESTÁTICOS E 404
// ─────────────────────────────────────────────────────────────
app.use(express.static('public'));

app.use((req, res) => {
    logger.warn('HTTP', `404: ${req.method} ${req.path}`);
    res.status(404).json({
        ok:    false,
        error: 'Rota não encontrada',
        path:  req.path,
        routes: [
            'GET  /health',
            'GET  /api/status',
            'POST /api/auth/login',
            'POST /api/auth/register',
            'GET  /api/data/all',
            'GET  /api/system/status',
            'GET  /api/supervisor/stream',
            'POST /api/supervisor/chat',
            'POST /api/ai/v3/chat',
            'POST /api/ai/v3/strategy',
            'POST /api/ai/v3/anomaly',
            'GET  /api/ai/v3/stream',
            'GET  /api/ai/v3/proactive',
            'GET  /api/ai/v3/alerts',
            'POST /api/ai/v3/alerts/read',
            'GET  /api/ai/v3/memory/:pdvId',
            'GET  /api/price-intel/stream',
            'GET  /api/price-intel/state',
            'POST /api/price-intel/scan-all',
            'GET  /api/price-intel/history/:productId',
            'GET  /api/decision/stream',
            'GET  /api/decision/state',
            'GET  /api/decision/health/:pdvId',
            'GET  /api/decision/forecast/:productId',
            'POST /api/decision/run-cycle',
        ],
    });
});

// ── ERROR HANDLER GLOBAL ─────────────────────────────────────
app.use((err, req, res, next) => {
    logger.critical('SERVER', `Erro não tratado: ${err.message}`, {
        stack: err.stack?.split('\n').slice(0, 4),
        path:  req.path,
    });
    res.status(500).json({ ok: false, error: 'Erro interno do servidor' });
});

// ─────────────────────────────────────────────────────────────
// STARTUP
// ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', async () => {
    logger.info('BOOT', `Servidor online na porta ${PORT}`);
    logger.info('BOOT', `Local:   http://localhost:${PORT}`);
    logger.info('BOOT', `Network: http://${_getLocalIP()}:${PORT}`);
    logger.info('BOOT', `Health:  http://localhost:${PORT}/health`);
    logger.info('BOOT', '────────────────────────────────────────');

    if (typeof datastore.warmup === 'function') datastore.warmup();

    const supabaseClient = datastore.supabase || datastore.getSupabase?.() || datastore.client || null;

    try {
        supervisor.init(datastore, supabaseClient, logger);
        logger.info('BOOT', '✓ Supervisor legacy pronto');
    } catch (e) {
        logger.warn('BOOT', `Supervisor legacy: ${e.message}`);
    }

    try {
        const pdvId   = process.env.DEFAULT_PDV_ID   || 'pdv_01';
        const pdvName = process.env.DEFAULT_PDV_NAME || 'PDV Principal';
        pdvDomination.init(datastore, supabaseClient, logger, pdvId, pdvName, priceIntel);
        logger.info('BOOT', `✓ PDV Domination pronto (${pdvName})`);
    } catch (e) {
        logger.warn('BOOT', `PDV Domination: ${e.message}`);
    }

    try {
        priceIntel.init(datastore, supabaseClient, logger, {
            scanIntervalMs:         30 * 60 * 1000,
            maxProductsPerScan:     10,
            priceAlertThresholdPct: 10,
        });
        logger.info('BOOT', '✓ Price Intelligence pronto');
    } catch (e) {
        logger.warn('BOOT', `Price Intelligence: ${e.message}`);
    }

    try {
        decisionEngine.init(datastore, supabaseClient, logger, {
            cycleIntervalMs:      60 * 60 * 1000,
            safetyStockDays:      5,
            forecastHorizonDays:  14,
            autoReplenishEnabled: true,
        });
        logger.info('BOOT', '✓ Decision Engine pronto');
    } catch (e) {
        logger.warn('BOOT', `Decision Engine: ${e.message}`);
    }

    // AI Core v4 — análise proativa a cada 10 min
    try {
        aiCore.init(supabaseClient, logger, {
            analysisIntervalMs: 10 * 60 * 1000, // [v4] era 15 min
        });
        logger.info('BOOT', '✓ AI Core v4 pronto');
    } catch (e) {
        logger.warn('BOOT', `AI Core: ${e.message}`);
    }

    // Contexto cruzado injetado no AI Core após 5s
    setTimeout(() => {
        try {
            aiCore.injectContext('priceIntel',     priceIntel.getState());
            aiCore.injectContext('decisionEngine', decisionEngine.getState());
            logger.info('BOOT', '✓ Contexto cruzado injetado no AI Core v4');
        } catch (_) {}
    }, 5000);

    // Sincroniza contexto a cada 10 min
    setInterval(() => {
        try {
            aiCore.injectContext('priceIntel',     priceIntel.getState());
            aiCore.injectContext('decisionEngine', decisionEngine.getState());
        } catch (_) {}
    }, 10 * 60 * 1000);

    // Health check inicial
    if (process.env.GROQ_API_KEY?.startsWith('gsk_')) {
        logger.info('BOOT', 'Executando análise inicial de saúde...');
        setTimeout(async () => {
            try {
                const snap = {
                    uptime:         process.uptime() * 1000,
                    logStats:       typeof logger.getStats === 'function' ? logger.getStats() : {},
                    datastoreStats: typeof datastore.getStats === 'function' ? datastore.getStats() : {},
                    requestStats:   typeof requestTracker.getStats === 'function' ? requestTracker.getStats() : {},
                };
                const check = await supervisor_svc.analyzeHealth(snap);
                logger.info('AI-SUPERVISOR', `Score inicial: ${check.score}/100 — ${check.status}`);
            } catch (_) {}
        }, 3000);
    } else {
        logger.warn('BOOT', 'GROQ_API_KEY não configurada — supervisor interno desativado');
    }

    logger.info('BOOT', '════════════════════════════════════════');
    logger.info('BOOT', '  ✓ K11 OMNI ELITE v4.0 — AI Stack v4 PRONTO');
    logger.info('BOOT', '════════════════════════════════════════');
});

// ── GRACEFUL SHUTDOWN ─────────────────────────────────────────
function shutdown(signal) {
    logger.warn('BOOT', `Sinal ${signal} recebido. Encerrando...`);
    server.close(() => {
        logger.info('BOOT', 'Servidor encerrado com sucesso.');
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    logger.critical('PROCESS', `uncaughtException: ${err.message}`, {
        stack: err.stack?.split('\n').slice(0, 5),
    });
});

process.on('unhandledRejection', (reason) => {
    logger.error('PROCESS', `unhandledRejection: ${String(reason)}`);
});

// ── HELPER ────────────────────────────────────────────────────
function _getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.values(interfaces)) {
        for (const iface of name) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

module.exports = app;
