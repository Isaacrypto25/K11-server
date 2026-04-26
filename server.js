/**
 * âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
 * â          K11 OMNI ELITE â BACKEND SERVER v2.0.1               â
 * â          AI Stack v3 â IntegraÃ§Ã£o Completa                    â
 * âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
 *
 * Stack: Node.js Â· Express Â· SQLite Â· Supabase Â· Groq AI
 *
 * MÃ³dulos integrados:
 *   supervisor          â k11_supervisor_backend    (fallback / rotas legacy)
 *   pdvDomination       â k11_pdv_domination_engine (motor de aÃ§Ãµes agressivas)
 *   aiCore              â k11_ai_core               (cÃ©rebro central v3)
 *   priceIntel          â k11_price_intelligence    (scraping + Groq preÃ§os)
 *   decisionEngine      â k11_decision_engine       (health score / forecast / POs)
 *
 * Endpoints:
 * GET  /health                          â status rÃ¡pido (sem auth)
 * GET  /api/auth/status                 â status de autenticaÃ§Ã£o (NOVO - FIX)
 * GET  /api/status                      â status pÃºblico bÃ¡sico
 * GET  /api/data/all                    â todos os datasets
 * GET  /api/data/:dataset               â dataset especÃ­fico
 * PUT  /api/data/:dataset/:id           â atualiza item
 * GET  /api/system/status               â mÃ©tricas completas do servidor
 * GET  /api/system/logs                 â logs recentes
 * GET  /api/system/stream               â SSE: stream de logs em tempo real
 * POST /api/system/log                  â injeta log do front-end
 * GET  /api/ai/health                   â anÃ¡lise IA do sistema (legacy)
 * POST /api/ai/chat                     â chat com supervisor de IA (legacy)
 * GET  /api/ai/score                    â health score atual (legacy)
 *
 * [NOVOS â AI Core v3]
 * POST /api/ai/v3/chat                  â chat com memÃ³ria + CoT
 * POST /api/ai/v3/strategy              â estratÃ©gia completa por PDV
 * POST /api/ai/v3/anomaly               â anÃ¡lise de anomalia pontual
 * GET  /api/ai/v3/stream                â SSE: alertas proativos em tempo real
 * GET  /api/ai/v3/proactive             â fila de alertas proativos
 * GET  /api/ai/v3/memory/:pdvId         â memÃ³ria acumulada de um PDV
 *
 * [NOVOS â Price Intelligence]
 * GET  /api/price-intel/stream          â SSE: atualizaÃ§Ãµes de preÃ§o
 * GET  /api/price-intel/state           â snapshot JSON atual
 * POST /api/price-intel/scan-all        â forÃ§ar scan geral
 * GET  /api/price-intel/history/:prodId â histÃ³rico de preÃ§os por produto
 *
 * [NOVOS â Decision Engine]
 * GET  /api/decision/stream             â SSE: ciclos de decisÃ£o
 * GET  /api/decision/state              â snapshot JSON atual
 * GET  /api/decision/health/:pdvId      â health score de um PDV
 * GET  /api/decision/forecast/:prodId   â forecast de demanda por produto
 * POST /api/decision/run-cycle          â forÃ§ar ciclo completo
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

// ââ SERVIÃOS ââââââââââââââââââââââââââââââââââââââââââââââââââ
const logger         = require('./services/logger');
const datastore      = require('./services/datastore');
const supervisor_svc = require('./services/ai-supervisor');

// ââ MIDDLEWARE E AUTH âââââââââââââââââââââââââââââââââââââââââ
const auth       = require('./middleware/server-auth');
const register   = require('./middleware/server-register');
const clientAuth = require('./middleware/k11-cliente-auth');
const authUI     = require('./middleware/k11-auth-ui');
const auditLog   = require('./middleware/audit-log');
const requestTracker = require('./middleware/request-tracker');

// ââ ROUTES ââââââââââââââââââââââââââââââââââââââââââââââââââ
const supervisorBackend = require('./routes/k11_supervisor_backend');
const aiCore            = require('./routes/k11_ai_core');
const pdvDomination     = require('./routes/k11_pdv_domination_engine');
const priceIntel        = require('./routes/k11_price_intelligence');
const decisionEngine    = require('./routes/k11_decision_engine');
const obramax           = require('./routes/obramax-api');
const skillsMissions    = require('./routes/skills-missions');
const orcamentoApproval = require('./routes/orcamento-approval');
const clienteRoutes     = require('./routes/k11-cliente-routes');
const clienteAuthRoutes = require('./routes/k11-cliente-auth');
const obrasRoutes       = require('./routes/k11-obras-routes');
const notifRoutes       = require('./routes/k11-notif-routes');
const npsRoutes         = require('./routes/k11-nps-routes');
const webhookRoutes     = require('./routes/k11-webhook-routes');
const photoRoutes       = require('./routes/k11-foto-routes');
const reportRoutes      = require('./routes/k11-relatorio-routes');
const scheduleRoutes    = require('./routes/k11-schedule-routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ââ GLOBAL STATE ââââââââââââââââââââââââââââââââââââââââââââ
let systemStartTime = Date.now();
let serverRestarts = 0;
let lastAuthCheck = Date.now();

// ââ MIDDLEWARE CHAIN âââââââââââââââââââââââââââââââââââââââââ
app.use(compression());
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ââ RATE LIMITING ââââââââââââââââââââââââââââââââââââââââââ
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/' // Skip health checks
});
app.use(limiter);

// ââ AUDIT & REQUEST TRACKING ââââââââââââââââââââââââââââââ
app.use(requestTracker);
app.use(auditLog);

// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// â           PUBLIC ENDPOINTS (sem autenticaÃ§Ã£o)
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * GET /health
 * Health check bÃ¡sico (usado por load balancers)
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'K11-OMNI-ELITE',
    uptime: Date.now() - systemStartTime,
    restarts: serverRestarts,
    timestamp: new Date().toISOString(),
    version: '2.0.1'
  });
});

/**
 * GET /api/auth/status
 * NOVO FIX: Endpoint que estava faltando
 * Verifica se o servidor de autenticaÃ§Ã£o estÃ¡ operacional
 */
app.get('/api/auth/status', (req, res) => {
  lastAuthCheck = Date.now();
  res.status(200).json({
    status: 'active',
    service: 'authentication',
    ready: true,
    uptime: Date.now() - systemStartTime,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/status
 * Status pÃºblico bÃ¡sico do sistema
 */
app.get('/api/status', (req, res) => {
  res.status(200).json({
    status: 'operational',
    server: 'K11-OMNI-ELITE',
    uptime: Math.floor((Date.now() - systemStartTime) / 1000),
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /
 * Dashboard principal com UI de login
 * CORRIGIDO: Renderiza HTML correto sem loop infinito
 */
app.get('/', (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    const dashboard = authUI.renderDashboard();
    res.send(dashboard);
  } catch (err) {
    console.error('[Dashboard Error]', err);
    res.status(500).send('<html><body><h1>Erro ao carregar dashboard</h1></body></html>');
  }
});

// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// â           AUTHENTICATION ROUTES
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.post('/api/auth/login', (req, res) => {
  try {
    register.handleLogin(req, res);
  } catch (err) {
    res.status(500).json({ error: 'Login error', message: err.message });
  }
});

app.post('/api/auth/register', (req, res) => {
  try {
    register.handleRegister(req, res);
  } catch (err) {
    res.status(500).json({ error: 'Register error', message: err.message });
  }
});

app.post('/api/auth/login/cliente', (req, res) => {
  try {
    clientAuth.handleClientLogin(req, res);
  } catch (err) {
    res.status(500).json({ error: 'Client login error', message: err.message });
  }
});

app.post('/api/auth/register/cliente', (req, res) => {
  try {
    clientAuth.handleClientRegister(req, res);
  } catch (err) {
    res.status(500).json({ error: 'Client register error', message: err.message });
  }
});

// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// â           PROTECTED ROUTES (com autenticaÃ§Ã£o)
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.use('/api/supervisor', auth.authMiddleware, supervisorBackend);
app.use('/api/ai', auth.authMiddleware, aiCore);
app.use('/api/pdv', auth.authMiddleware, pdvDomination);
app.use('/api/price-intel', auth.authMiddleware, priceIntel);
app.use('/api/decision', auth.authMiddleware, decisionEngine);
app.use('/api/obramax', auth.authMiddleware, obramax);
app.use('/api/skills', auth.authMiddleware, skillsMissions);
app.use('/api/orcamento', auth.authMiddleware, orcamentoApproval);
app.use('/api/relatorio', auth.authMiddleware, reportRoutes);
app.use('/api/schedule', auth.authMiddleware, scheduleRoutes);

// ââ CLIENT PORTAL ROUTES (com clientAuthMiddleware) ââ
app.use('/api/cliente', clientAuth.clientAuthMiddleware, clienteRoutes);
app.use('/api/obras', clientAuth.clientAuthMiddleware, obrasRoutes);
app.use('/api/cliente-auth', clientAuthRoutes);

// ââ SEMI-PUBLIC ROUTES âââââââââââââââââââââââââââââââââââ
app.use('/api/notif', notifRoutes);
app.use('/api/nps', npsRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/foto', photoRoutes);

// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// â           DATA ROUTES (legacy support)
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.get('/api/data/all', auth.authMiddleware, async (req, res) => {
  try {
    const data = await datastore.getAll();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/data/:dataset', auth.authMiddleware, async (req, res) => {
  try {
    const data = await datastore.get(req.params.dataset);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/data/:dataset/:id', auth.authMiddleware, async (req, res) => {
  try {
    const updated = await datastore.update(req.params.dataset, req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// â           SYSTEM ROUTES
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.get('/api/system/status', auth.authMiddleware, (req, res) => {
  const uptime = Date.now() - systemStartTime;
  const memUsage = process.memoryUsage();
  
  res.json({
    service: 'K11-OMNI-ELITE',
    version: '2.0.1',
    status: 'operational',
    uptime: uptime,
    uptime_hours: Math.floor(uptime / 3600000),
    restarts: serverRestarts,
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
    },
    platform: process.platform,
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/system/logs', auth.authMiddleware, (req, res) => {
  try {
    const logs = logger.getLogs(req.query.limit || 50);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/system/stream', auth.authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const interval = setInterval(() => {
    const logs = logger.getLogs(10);
    res.write(`data: ${JSON.stringify(logs)}\n\n`);
  }, 5000);
  
  req.on('close', () => clearInterval(interval));
});

app.post('/api/system/log', (req, res) => {
  try {
    const { level, message, context } = req.body;
    logger.log(level || 'info', message, context);
    res.json({ logged: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// â           ERROR HANDLING
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    error: message,
    path: req.path,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// â           SERVER STARTUP
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const server = app.listen(PORT, () => {
  const timestamp = new Date().toISOString();
  console.log(`
╔════════════════════════════════════════════════════╗
║   K11 OMNI ELITE v2.0.1                           ║
║   Backend Server Running                          ║
╠════════════════════════════════════════════════════╣
║   Port: ${PORT}                                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}                       ║
║   Timestamp: ${timestamp}                     ║
║   Uptime: ${Math.floor((Date.now() - systemStartTime) / 1000)}s                                         ║
╚════════════════════════════════════════════════════╝
  `);
  
  serverRestarts++;
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Shutting down gracefully...');
  server.close(() => {
    console.log('[Server] Closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[SIGINT] Shutting down...');
  process.exit(0);
});

// Unhandled Rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

module.exports = app;
