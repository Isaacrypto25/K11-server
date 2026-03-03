/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║          K11 OMNI ELITE — BACKEND SERVER v1.1.0               ║
 * ║          A alma do projeto. Tudo passa por aqui.              ║
 * ║                                                               ║
 * ║  ✅ COM FRONTEND MONITORING INTEGRADO                         ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * Stack: Node.js · Express · SQLite · Groq AI
 *
 * Endpoints:
 * GET  /health                  → status rápido (sem auth)
 * GET  /api/status              → status público básico
 * GET  /api/data/all            → todos os datasets
 * GET  /api/data/:dataset       → dataset específico
 * PUT  /api/data/:dataset/:id   → atualiza item
 * GET  /api/system/status       → métricas completas do servidor
 * GET  /api/system/logs         → logs recentes
 * GET  /api/system/stream       → SSE: stream de logs em tempo real
 * POST /api/system/log          → injeta log do front-end
 * GET  /api/ai/health           → análise IA do sistema
 * POST /api/ai/chat             → chat com supervisor de IA
 * GET  /api/ai/score            → health score atual
 * GET  /api/ai/stream           → SSE: alertas e prioridades em tempo real
 * POST /api/ai/force-analysis   → força análise imediata
 * GET  /api/ai/state            → estado atual do supervisor
 * 
 * ✅ NOVO:
 * POST /api/supervisor/frontend-ping    → heartbeat do frontend
 * GET  /api/supervisor/frontend-health  → saúde do frontend
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const os = require('os');

// ── SERVIÇOS ──────────────────────────────────────────────────
const logger = require('./services/logger');
const datastore = require('./services/datastore');
const supervisor = require('./services/ai-supervisor');

// ── MIDDLEWARE E AUTH ─────────────────────────────────────────
const auth = require('./middleware/server-auth');
const register = require('./middleware/server-register');
const requestTracker = require('./middleware/request-tracker');

// ── ROTAS ─────────────────────────────────────────────────────
const dataRoutes = require('./routes/data');
const systemRoutes = require('./routes/system');
const aiRoutes = require('./routes/ai');

// ─────────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3000', 10);

logger.info('BOOT', '════════════════════════════════════════');
logger.info('BOOT', '  K11 OMNI ELITE SERVER — INICIANDO     ');
logger.info('BOOT', '════════════════════════════════════════');
logger.info('BOOT', `Node.js ${process.version} | PID ${process.pid}`);
logger.info('BOOT', `Plataforma: ${os.platform()} ${os.arch()}`);

// ── SEGURANÇA ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS — permite front-end local + Railway
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-K11-Token'],
}));

// ── PERFORMANCE ───────────────────────────────────────────────
app.use(compression());

// ── BODY PARSING ──────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── RATE LIMITING ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '120', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('RATE-LIMIT', `Limite excedido`, { ip: req.ip, path: req.path });
    res.status(429).json({ ok: false, error: 'Muitas requisições. Tente em 1 minuto.' });
  },
});
app.use('/api', limiter);

// ── MORGAN (HTTP LOG) ─────────────────────────────────────────
app.use(morgan((tokens, req, res) => {
  const status = tokens.status(req, res);
  const ms = tokens['response-time'](req, res);
  const method = tokens.method(req, res);
  const url = tokens.url(req, res);
  // Não loga SSE keepalives (system stream e ai stream)
  if (url?.includes('/api/system/stream') || url?.includes('/api/ai/stream')) return null;
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'debug';
  logger[level]('HTTP', `${method} ${url} → ${status} (${ms}ms)`);
  return null;
}));

// ── REQUEST TRACKER ───────────────────────────────────────────
app.use(requestTracker);


// ─────────────────────────────────────────────────────────────
// ROTAS DE AUTENTICAÇÃO E REGISTRO
// ─────────────────────────────────────────────────────────────
app.post('/api/auth/login',       auth.loginHandler);
app.post('/api/auth/register',    register.registerHandler);
app.post('/api/auth/confirm-pin', register.confirmPinHandler);
app.post('/api/auth/resend-pin',  register.resendPinHandler);

app.post('/api/auth/refresh',         auth.requireAuth, auth.refreshHandler);
app.post('/api/auth/logout',          auth.requireAuth, auth.logoutHandler);
app.post('/api/auth/forgot-password', register.forgotPasswordHandler);
app.post('/api/auth/reset-password',  register.resetPasswordHandler);


// ─────────────────────────────────────────────────────────────
// ROTAS PÚBLICAS (Sem auth)
// ─────────────────────────────────────────────────────────────
// Healthcheck mínimo para Railway/Render/UptimeRobot
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Status público básico
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    system: 'K11 OMNI ELITE',
    version: '1.1.0',
    uptime: Math.floor(process.uptime()),
    env: process.env.NODE_ENV || 'development',
  });
});


// ─────────────────────────────────────────────────────────────
// LIVE ENGINE — ROTAS DO SUPERVISOR
// Devem ficar ANTES do router genérico app.use('/api/ai', aiRoutes)
// para que tenham prioridade de matching.
// ─────────────────────────────────────────────────────────────

// SSE: EventSource não suporta headers customizados — token vem como ?token= na query
app.get('/api/ai/stream', (req, res) => {
  const t = req.query.token;
  if (t && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${t}`;
  }
  auth.requireAuth(req, res, () => supervisor.addSSEClient(res));
});

// Força análise imediata (ex: após upload de dados ou pull-to-refresh)
app.post('/api/ai/force-analysis', auth.requireAuth, async (req, res) => {
  try {
    const result = await supervisor.forceAnalysis();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error('AI-ROUTE', `force-analysis falhou: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Estado atual do supervisor (diagnóstico)
app.get('/api/ai/state', auth.requireAuth, (req, res) => {
  res.json({ ok: true, ...supervisor.getState() });
});

// ✅ NOVO: FRONTEND HEALTH MONITORING
// Frontend envia heartbeat a cada 5 segundos
app.post('/api/supervisor/frontend-ping', auth.requireAuth, (req, res) => {
  const { clientId, appInitialized, k11LiveStarted, readyState, errors } = req.body;
  
  // Registra o ping no supervisor
  if (typeof supervisor.registerFrontendPing === 'function') {
    supervisor.registerFrontendPing(clientId, {
      status: 'online',
      appInitialized,
      k11LiveStarted,
      readyState,
      errors,
    });
  }
  
  res.json({
    ok: true,
    message: 'Ping recebido',
    timestamp: Date.now(),
  });
});

// ✅ NOVO: Ver saúde do frontend
app.get('/api/supervisor/frontend-health', auth.requireAuth, (req, res) => {
  if (typeof supervisor.getState === 'function') {
    const state = supervisor.getState();
    res.json({
      ok: true,
      frontendHealth: state.frontendHealth || {},
      suggestedAction: state.frontendHealth?.healthyClients === 0 
        ? 'Todos os clientes offline ou não inicializados!' 
        : null,
    });
  } else {
    res.json({ ok: true, frontendHealth: {} });
  }
});


// ─────────────────────────────────────────────────────────────
// ROTAS PROTEGIDAS (Exigem Header: Authorization: Bearer <token>)
// ─────────────────────────────────────────────────────────────
app.use('/api/data',   auth.requireAuth, dataRoutes);
app.use('/api/system', auth.requireAuth, systemRoutes);
app.use('/api/ai',     auth.requireAuth, aiRoutes);


// ─────────────────────────────────────────────────────────────
// ARQUIVOS ESTÁTICOS E 404
// ─────────────────────────────────────────────────────────────
app.use(express.static('public'));

app.use((req, res) => {
  logger.warn('HTTP', `404: ${req.method} ${req.path}`);
  res.status(404).json({
    ok: false,
    error: 'Rota não encontrada',
    path: req.path,
    routes: [
      'GET  /health',
      'GET  /api/status',
      'GET  /api/data/all',
      'GET  /api/system/status',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET  /api/ai/health',
      'POST /api/ai/chat',
      'GET  /api/ai/stream',
      'POST /api/ai/force-analysis',
      'GET  /api/ai/state',
      'POST /api/supervisor/frontend-ping',
      'GET  /api/supervisor/frontend-health',
    ],
  });
});

// ── ERROR HANDLER GLOBAL ─────────────────────────────────────
app.use((err, req, res, next) => {
  logger.critical('SERVER', `Erro não tratado: ${err.message}`, {
    stack: err.stack?.split('\n').slice(0, 4),
    path: req.path,
  });
  res.status(500).json({ ok: false, error: 'Erro interno do servidor' });
});

// ─────────────────────────────────────────────────────────────
// STARTUP
// ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', async () => {
  logger.info('BOOT', `Servidor online na porta ${PORT}`);
  logger.info('BOOT', `Local:    http://localhost:${PORT}`);
  logger.info('BOOT', `Network:  http://${_getLocalIP()}:${PORT}`);
  logger.info('BOOT', `Health:   http://localhost:${PORT}/health`);
  logger.info('BOOT', `Status:   http://localhost:${PORT}/api/status`);
  logger.info('BOOT', '────────────────────────────────────────');

  // Pré-carrega todos os datasets na inicialização
  logger.info('BOOT', 'Carregando datasets...');
  const all = await datastore.getAll();
  const totals = Object.entries(all)
    .map(([k, v]) => `${k}:${v.length}`)
    .join(' | ');
  logger.info('BOOT', `Datasets carregados → ${totals}`);

  // Inicializa o supervisor (motor vivo — analisa a cada 5min via setInterval)
  // Chamada única aqui no startup — NÃO duplicar em outro lugar do arquivo
  supervisor.init(datastore);

  logger.info('BOOT', '✅ Frontend monitoring ATIVO');
  logger.info('BOOT', '✓ K11 OMNI ELITE SERVER PRONTO');
});

// ── GRACEFUL SHUTDOWN ─────────────────────────────────────────
function shutdown(signal) {
  logger.warn('BOOT', `Sinal ${signal} recebido. Encerrando servidor...`);
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
  // Não encerra em uncaughtException para manter o servidor vivo
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
