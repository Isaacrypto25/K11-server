/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║          K11 OMNI ELITE — BACKEND SERVER v2.0.0               ║
 * ║          AI Stack v3 — Integração Completa                    ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * Stack: Node.js · Express · SQLite · Supabase · Groq AI
 *
 * Módulos integrados:
 *   supervisor          → k11_supervisor_backend    (fallback / rotas legacy)
 *   pdvDomination       → k11_pdv_domination_engine (motor de ações agressivas)
 *   aiCore              → k11_ai_core               (cérebro central v3)
 *   priceIntel          → k11_price_intelligence    (scraping + Groq preços)
 *   decisionEngine      → k11_decision_engine       (health score / forecast / POs)
 *
 * Endpoints:
 * GET  /health                          → status rápido (sem auth)
 * GET  /api/status                      → status público básico
 * GET  /api/data/all                    → todos os datasets
 * GET  /api/data/:dataset               → dataset específico
 * PUT  /api/data/:dataset/:id           → atualiza item
 * GET  /api/system/status               → métricas completas do servidor
 * GET  /api/system/logs                 → logs recentes
 * GET  /api/system/stream               → SSE: stream de logs em tempo real
 * POST /api/system/log                  → injeta log do front-end
 * GET  /api/ai/health                   → análise IA do sistema (legacy)
 * POST /api/ai/chat                     → chat com supervisor de IA (legacy)
 * GET  /api/ai/score                    → health score atual (legacy)
 *
 * [NOVOS — AI Core v3]
 * POST /api/ai/v3/chat                  → chat com memória + CoT
 * POST /api/ai/v3/strategy              → estratégia completa por PDV
 * POST /api/ai/v3/anomaly               → análise de anomalia pontual
 * GET  /api/ai/v3/stream                → SSE: alertas proativos em tempo real
 * GET  /api/ai/v3/proactive             → fila de alertas proativos
 * GET  /api/ai/v3/memory/:pdvId         → memória acumulada de um PDV
 *
 * [NOVOS — Price Intelligence]
 * GET  /api/price-intel/stream          → SSE: atualizações de preço
 * GET  /api/price-intel/state           → snapshot JSON atual
 * POST /api/price-intel/scan-all        → forçar scan geral
 * GET  /api/price-intel/history/:prodId → histórico de preços por produto
 *
 * [NOVOS — Decision Engine]
 * GET  /api/decision/stream             → SSE: ciclos de decisão
 * GET  /api/decision/state              → snapshot JSON atual
 * GET  /api/decision/health/:pdvId      → health score de um PDV
 * GET  /api/decision/forecast/:prodId   → forecast de demanda por produto
 * POST /api/decision/run-cycle          → forçar ciclo completo
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
const supervisor_svc = require('./services/ai-supervisor'); // serviço interno original

// ── MIDDLEWARE E AUTH ─────────────────────────────────────────
const auth           = require('./middleware/server-auth');
const register       = require('./middleware/server-register');
const requestTracker = require('./middleware/request-tracker');

// ── ROTAS INTERNAS ────────────────────────────────────────────
const dataRoutes   = require('./routes/data');
const systemRoutes = require('./routes/system');
const aiRoutes     = require('./routes/ai');

// ── AI STACK v3 — NOVOS MÓDULOS ───────────────────────────────
const supervisor     = require('./routes/k11_supervisor_backend');
const pdvDomination  = require('./routes/k11_pdv_domination_engine');
const aiCore         = require('./routes/k11_ai_core');
const priceIntel     = require('./routes/k11_price_intelligence');
const decisionEngine = require('./routes/k11_decision_engine');

// ─────────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3000', 10);

logger.info('BOOT', '════════════════════════════════════════');
logger.info('BOOT', '  K11 OMNI ELITE SERVER v2.0 — AI Stack v3');
logger.info('BOOT', '════════════════════════════════════════');
logger.info('BOOT', `Node.js ${process.version} | PID ${process.pid}`);
logger.info('BOOT', `Plataforma: ${os.platform()} ${os.arch()}`);

// ── SEGURANÇA ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy:     false,
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
  max:      parseInt(process.env.RATE_LIMIT_MAX       || '120', 10),
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req, res) => {
    logger.warn('RATE-LIMIT', `Limite excedido`, { ip: req.ip, path: req.path });
    res.status(429).json({ ok: false, error: 'Muitas requisições. Tente em 1 minuto.' });
  },
});
app.use('/api', limiter);

// ── MORGAN (HTTP LOG) ─────────────────────────────────────────
app.use(morgan((tokens, req, res) => {
  const status = tokens.status(req, res);
  const ms     = tokens['response-time'](req, res);
  const method = tokens.method(req, res);
  const url    = tokens.url(req, res);
  if (url?.includes('/stream')) return null; // não loga SSE keepalives
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'debug';
  logger[level]('HTTP', `${method} ${url} → ${status} (${ms}ms)`);
  return null;
}));

// ── REQUEST TRACKER ───────────────────────────────────────────
app.use(requestTracker);


// ─────────────────────────────────────────────────────────────
// ROTAS DE AUTENTICAÇÃO E REGISTRO
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
// PORTAL DO CLIENTE — AUTH INLINE (sem require externo)
// POST /api/auth/cliente/login
// POST /api/auth/cliente/register
// POST /api/auth/cliente/forgot
// POST /api/auth/cliente/reset
// ─────────────────────────────────────────────────────────────
(function registerClienteRoutes(app, auth, logger, datastore) {
    const crypto = require('crypto');
    const ITER = 310_000, KLEN = 32, DIG = 'sha256';

    function _hashSenha(s) {
        const salt = crypto.randomBytes(32).toString('hex');
        const dk   = crypto.pbkdf2Sync(s, salt, ITER, KLEN, DIG);
        return `pbkdf2$${salt}$${dk.toString('hex')}`;
    }
    function _verifySenha(s, stored) {
        try {
            const [,salt,exp] = stored.split('$');
            const dk  = crypto.pbkdf2Sync(s, salt, ITER, KLEN, DIG);
            const buf = Buffer.from(exp, 'hex');
            return dk.length === buf.length && crypto.timingSafeEqual(dk, buf);
        } catch { return false; }
    }
    function _getSupabase() { return datastore.supabase || null; }

    // ── POST /api/auth/cliente/login ──────────────────────────
    app.post('/api/auth/cliente/login', async (req, res) => {
        const { email, senha } = req.body || {};
        if (!email || !senha)
            return res.status(400).json({ ok: false, error: 'Email/LDAP e senha obrigatórios.' });

        const sb = _getSupabase();
        if (!sb) {
            const token = auth.signJWT({ re: email, nome: email, role: 'cliente' });
            return res.json({ ok: true, token, user: { nome: email, role: 'cliente', email } });
        }

        // Atalho super: LDAP 8 dígitos + PIN
        if (/^\d{8}$/.test(email.trim())) {
            try {
                const { data: su } = await sb.from('k11_users')
                    .select('ldap, nome, role, pin_hash, ativo')
                    .eq('ldap', email.trim()).eq('role', 'super').single();
                if (su && su.ativo) {
                    const ok = auth.verifyPin(senha, su.pin_hash || '');
                    if (ok) {
                        const token = auth.signJWT({ re: su.ldap, nome: su.nome, role: 'super' });
                        logger.info('CLIENTE-AUTH', `Super LDAP no portal cliente: ${su.ldap}`);
                        return res.json({ ok: true, token, user: { nome: su.nome, role: 'super', email: su.ldap } });
                    }
                    return res.status(401).json({ ok: false, error: 'LDAP ou senha incorretos.' });
                }
            } catch (_) {}
        }

        // Login normal por email
        try {
            const { data: user, error } = await sb.from('k11_clientes')
                .select('id, nome, email, senha_hash, ativo')
                .eq('email', email.toLowerCase().trim()).single();
            if (error || !user) return res.status(401).json({ ok: false, error: 'Email ou senha incorretos.' });
            if (!user.ativo)    return res.status(401).json({ ok: false, error: 'Conta desativada.' });
            if (!_verifySenha(senha, user.senha_hash)) return res.status(401).json({ ok: false, error: 'Email ou senha incorretos.' });
            const token = auth.signJWT({ re: user.email, nome: user.nome, role: 'cliente' });
            sb.from('k11_clientes').update({ ultimo_login: new Date().toISOString() }).eq('id', user.id).then(()=>{}).catch(()=>{});
            return res.json({ ok: true, token, user: { nome: user.nome, role: 'cliente', email: user.email } });
        } catch (err) {
            logger.error('CLIENTE-AUTH', err.message);
            return res.status(500).json({ ok: false, error: 'Erro interno.' });
        }
    });

    // ── POST /api/auth/cliente/register ──────────────────────
    app.post('/api/auth/cliente/register', async (req, res) => {
        const { nome, email, senha } = req.body || {};
        if (!nome || !email || !senha) return res.status(400).json({ ok: false, error: 'Nome, email e senha obrigatórios.' });
        if (nome.trim().length < 3)    return res.status(400).json({ ok: false, field: 'nome',  error: 'Nome muito curto.' });
        if (!email.includes('@'))      return res.status(400).json({ ok: false, field: 'email', error: 'Email inválido.' });
        if (senha.length < 6)          return res.status(400).json({ ok: false, field: 'senha', error: 'Senha: mín. 6 caracteres.' });

        const sb = _getSupabase();
        if (!sb) {
            const token = auth.signJWT({ re: email, nome: nome.trim(), role: 'cliente' });
            return res.status(201).json({ ok: true, token, user: { nome: nome.trim(), role: 'cliente', email } });
        }
        try {
            const { data: ex } = await sb.from('k11_clientes').select('id').eq('email', email.toLowerCase().trim()).single();
            if (ex) return res.status(409).json({ ok: false, field: 'email', error: 'Email já cadastrado.' });
            const { data: novo, error } = await sb.from('k11_clientes')
                .insert({ nome: nome.trim(), email: email.toLowerCase().trim(), senha_hash: _hashSenha(senha), ativo: true })
                .select('id, nome, email').single();
            if (error) throw error;
            const token = auth.signJWT({ re: novo.email, nome: novo.nome, role: 'cliente' });
            logger.info('CLIENTE-AUTH', `Cadastro: ${novo.email}`);
            return res.status(201).json({ ok: true, token, user: { nome: novo.nome, role: 'cliente', email: novo.email } });
        } catch (err) {
            logger.error('CLIENTE-AUTH', err.message);
            return res.status(500).json({ ok: false, error: 'Erro ao cadastrar.' });
        }
    });

    // ── POST /api/auth/cliente/forgot ─────────────────────────
    app.post('/api/auth/cliente/forgot', async (req, res) => {
        const { email } = req.body || {};
        if (!email) return res.status(400).json({ ok: false, error: 'Email obrigatório.' });
        const MSG = 'Se o email estiver cadastrado, você receberá as instruções.';
        const sb  = _getSupabase();
        if (!sb) return res.json({ ok: true, message: MSG });
        try {
            const { data: user } = await sb.from('k11_clientes').select('id, email').eq('email', email.toLowerCase().trim()).single();
            if (user) {
                const token     = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date(Date.now() + 3600000).toISOString();
                await sb.from('k11_cliente_resets').upsert({ email: user.email, token, expires_at: expiresAt });
                logger.info('CLIENTE-AUTH', `Reset solicitado: ${user.email}`);
            }
        } catch (_) {}
        return res.json({ ok: true, message: MSG });
    });

    // ── POST /api/auth/cliente/reset ──────────────────────────
    app.post('/api/auth/cliente/reset', async (req, res) => {
        const { email, token, nova_senha } = req.body || {};
        if (!email || !token || !nova_senha) return res.status(400).json({ ok: false, error: 'Campos obrigatórios.' });
        if (nova_senha.length < 6)           return res.status(400).json({ ok: false, error: 'Senha: mín. 6 caracteres.' });
        const sb = _getSupabase();
        if (!sb) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
        try {
            const { data: r } = await sb.from('k11_cliente_resets').select('*')
                .eq('email', email.toLowerCase().trim()).eq('token', token).single();
            if (!r || new Date(r.expires_at) < new Date())
                return res.status(400).json({ ok: false, error: 'Token inválido ou expirado.' });
            await sb.from('k11_clientes').update({ senha_hash: _hashSenha(nova_senha) }).eq('email', email.toLowerCase().trim());
            await sb.from('k11_cliente_resets').delete().eq('email', email.toLowerCase().trim());
            return res.json({ ok: true, message: 'Senha redefinida com sucesso.' });
        } catch (err) {
            logger.error('CLIENTE-AUTH', err.message);
            return res.status(500).json({ ok: false, error: 'Erro interno.' });
        }
    });

    logger.info('BOOT', '✓ Portal do Cliente — rotas registradas');
})(app, auth, logger, datastore);



// ─────────────────────────────────────────────────────────────
// ROTAS PÚBLICAS (sem auth)
// ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.get('/api/status', (req, res) => {
  res.json({
    ok:      true,
    system:  'K11 OMNI ELITE',
    version: '2.0.0',
    stack:   'AI Stack v3',
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
// ROTAS PROTEGIDAS — INTERNAS (Exigem Bearer token)
// ─────────────────────────────────────────────────────────────
app.use('/api/data',   auth.requireAuth, dataRoutes);
app.use('/api/system', auth.requireAuth, systemRoutes);
app.use('/api/ai',     auth.requireAuth, aiRoutes);


// ─────────────────────────────────────────────────────────────
// ROTAS — SUPERVISOR LEGACY (k11_supervisor_backend)
// Mantidas para retrocompatibilidade com o frontend existente
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
// ROTAS — AI CORE v3 (k11_ai_core)
// Chat com memória, CoT, análise proativa, SSE
// ─────────────────────────────────────────────────────────────

// Chat inteligente com memória + CoT
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

// Geração de estratégia completa por PDV
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
  aiCore.addSSEClient(res);
});

// Fila de alertas proativos pendentes
app.get('/api/ai/v3/proactive', auth.requireAuth, (req, res) => {
  res.json({ ok: true, alerts: aiCore.getProactiveAlerts() });
});

// Memória acumulada de um PDV
app.get('/api/ai/v3/memory/:pdvId', auth.requireAuth, (req, res) => {
  res.json({ ok: true, data: aiCore.getMemory(req.params.pdvId) });
});


// ─────────────────────────────────────────────────────────────
// ROTAS — PRICE INTELLIGENCE (k11_price_intelligence)
// Scraping MercadoLivre + Google + análise Groq
// ─────────────────────────────────────────────────────────────

// SSE — atualizações de preço em tempo real
app.get('/api/price-intel/stream', auth.requireAuth, (req, res) => {
  priceIntel.addSSEClient(res);
});

// Snapshot JSON atual
app.get('/api/price-intel/state', auth.requireAuth, (req, res) => {
  res.json({ ok: true, data: priceIntel.getState() });
});

// Forçar scan geral imediato
app.post('/api/price-intel/scan-all', auth.requireAuth, (req, res) => {
  priceIntel.forceFullScan();
  res.json({ ok: true, message: 'Scan iniciado em background' });
});

// Histórico de preços por produto
app.get('/api/price-intel/history/:productId', auth.requireAuth, (req, res) => {
  res.json({ ok: true, data: priceIntel.getPriceHistory(req.params.productId) });
});


// ─────────────────────────────────────────────────────────────
// ROTAS — DECISION ENGINE (k11_decision_engine)
// Health Score, Demand Forecast, Auto Replenishment
// ─────────────────────────────────────────────────────────────

// SSE — ciclos de decisão em tempo real
app.get('/api/decision/stream', auth.requireAuth, (req, res) => {
  decisionEngine.addSSEClient(res);
});

// Snapshot JSON atual
app.get('/api/decision/state', auth.requireAuth, (req, res) => {
  res.json({ ok: true, data: decisionEngine.getState() });
});

// Health score de um PDV específico
app.get('/api/decision/health/:pdvId', auth.requireAuth, (req, res) => {
  res.json({ ok: true, data: decisionEngine.getHealthScore(req.params.pdvId) });
});

// Forecast de demanda por produto
app.get('/api/decision/forecast/:productId', auth.requireAuth, (req, res) => {
  res.json({ ok: true, data: decisionEngine.getForecast(req.params.productId) });
});

// Forçar ciclo completo imediato
app.post('/api/decision/run-cycle', auth.requireAuth, (req, res) => {
  decisionEngine.runFullCycle();
  res.json({ ok: true, message: 'Ciclo iniciado em background' });
});


// ─────────────────────────────────────────────────────────────
// ARQUIVOS ESTÁTICOS E 404
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
  logger.info('BOOT', `Status:  http://localhost:${PORT}/api/status`);
  logger.info('BOOT', '────────────────────────────────────────');

  // ── Aquece cache em background ─────────────────────────────
  logger.info('BOOT', 'Aquecendo cache em background...');
  if (typeof datastore.warmup === 'function') datastore.warmup();

  // ── Supabase client exposto pelo datastore ─────────────────
  const supabaseClient = datastore.supabase || datastore.getSupabase?.() || datastore.client || null;

  // ── Supervisor legacy ──────────────────────────────────────
  try {
    supervisor.init(datastore, supabaseClient, logger);
    logger.info('BOOT', '✓ Supervisor legacy pronto');
  } catch (e) {
    logger.warn('BOOT', `Supervisor legacy: ${e.message}`);
  }

  // ── PDV Domination Engine ──────────────────────────────────
  // ⚠️  Substitua DEFAULT_PDV_ID / DEFAULT_PDV_NAME no .env ou aqui diretamente
  try {
    const pdvId   = process.env.DEFAULT_PDV_ID   || 'pdv_01';
    const pdvName = process.env.DEFAULT_PDV_NAME || 'PDV Principal';
    pdvDomination.init(datastore, supabaseClient, logger, pdvId, pdvName, priceIntel);
    logger.info('BOOT', `✓ PDV Domination pronto (${pdvName})`);
  } catch (e) {
    logger.warn('BOOT', `PDV Domination: ${e.message}`);
  }

  // ── Price Intelligence ─────────────────────────────────────
  try {
    priceIntel.init(datastore, supabaseClient, logger, {
      scanIntervalMs:         30 * 60 * 1000,  // scan a cada 30 min
      maxProductsPerScan:     10,
      priceAlertThresholdPct: 10,              // alerta se diff > 10%
    });
    logger.info('BOOT', '✓ Price Intelligence pronto');
  } catch (e) {
    logger.warn('BOOT', `Price Intelligence: ${e.message}`);
  }

  // ── Decision Engine ────────────────────────────────────────
  try {
    decisionEngine.init(datastore, supabaseClient, logger, {
      cycleIntervalMs:      60 * 60 * 1000,    // ciclo a cada 1h
      safetyStockDays:      5,
      forecastHorizonDays:  14,
      autoReplenishEnabled: true,
    });
    logger.info('BOOT', '✓ Decision Engine pronto');
  } catch (e) {
    logger.warn('BOOT', `Decision Engine: ${e.message}`);
  }

  // ── AI Core — por último (usa contexto dos outros módulos) ─
  try {
    aiCore.init(supabaseClient, logger, {
      analysisIntervalMs: 15 * 60 * 1000,      // análise proativa a cada 15min
    });
    logger.info('BOOT', '✓ AI Core v3 pronto');
  } catch (e) {
    logger.warn('BOOT', `AI Core: ${e.message}`);
  }

  // ── Wire: contexto cruzado injetado no AI Core (após 5s) ──
  setTimeout(() => {
    try {
      aiCore.injectContext('priceIntel',     priceIntel.getState());
      aiCore.injectContext('decisionEngine', decisionEngine.getState());
      logger.info('BOOT', '✓ Contexto cruzado injetado no AI Core');
    } catch (_) {}
  }, 5000);

  // ── Sincronização de contexto a cada 10 min ────────────────
  setInterval(() => {
    try {
      aiCore.injectContext('priceIntel',     priceIntel.getState());
      aiCore.injectContext('decisionEngine', decisionEngine.getState());
    } catch (_) {}
  }, 10 * 60 * 1000);

  // ── Health check interno (serviço ai-supervisor original) ──
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
  logger.info('BOOT', '  ✓ K11 OMNI ELITE v2.0 — AI Stack v3 PRONTO');
  logger.info('BOOT', '════════════════════════════════════════');
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
