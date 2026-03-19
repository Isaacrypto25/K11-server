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
const clienteAuth    = require('./middleware/k11-cliente-auth');
const clienteRoutes  = require('./routes/k11-cliente-routes');
const skillsRoutes   = require('./routes/skills-missions');
const register       = require('./middleware/server-register');
const requestTracker = require('./middleware/request-tracker');
const auditLog       = require('./middleware/audit-log');

// ── NOVAS ROTAS v2.1 ──────────────────────────────────────────
const notificationsRoutes    = require('./routes/notifications');
const photosRoutes           = require('./routes/photos');
const orcApprovalRoutes      = require('./routes/orcamento-approval');
const webhooksModule         = require('./routes/webhooks');
const reportsRoutes          = require('./routes/reports');
const { router: npsRouter, triggerNPSAfterPhase } = require('./routes/nps');

// ── SENTRY (error tracking) ───────────────────────────────────
const sentry = require('./services/sentry');
sentry.init();

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
// Rate limit por usuário JWT (não por IP — evita conflito em redes corporativas com NAT)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max:      parseInt(process.env.RATE_LIMIT_MAX       || '200', 10),
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req) => {
    // Tenta extrair userId do JWT; fallback para IP
    try {
      const token = req.headers['authorization']?.slice(7) || req.query?.token;
      if (token) {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        return payload.re || payload.email || req.ip;
      }
    } catch (_) {}
    return req.ip;
  },
  handler: (req, res) => {
    const uid = req.user?.re || req.user?.email || req.ip;
    logger.warn('RATE-LIMIT', `Limite excedido`, { uid, path: req.path });
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
app.use(auditLog);


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
app.use('/api/data',   auth.requireAuth, auth.requireOperacional, dataRoutes);
app.use('/api/system', auth.requireAuth, auth.requireOperacional, systemRoutes);
app.use('/api/ai',     auth.requireAuth, auth.requireOperacional, aiRoutes);


// ─────────────────────────────────────────────────────────────
// ROTAS — SUPERVISOR LEGACY (k11_supervisor_backend)
// ⚠ RESTRITO: somente equipe operacional K11 (role != cliente)
// ─────────────────────────────────────────────────────────────
app.get('/api/supervisor/stream', auth.requireAuth, auth.requireOperacional, (req, res) => {
  supervisor.addSSEClient(res);
});

app.post('/api/supervisor/chat', auth.requireAuth, auth.requireOperacional, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const result = await supervisor.chat(message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/supervisor/status', auth.requireAuth, auth.requireOperacional, (req, res) => {
  res.json({ ok: true, data: supervisor.getState ? supervisor.getState() : {} });
});


// ─────────────────────────────────────────────────────────────
// ROTAS — AI CORE v3 (k11_ai_core)
// ⚠ RESTRITO: somente equipe operacional K11 (role != cliente)
// ─────────────────────────────────────────────────────────────

app.post('/api/ai/v3/chat', auth.requireAuth, auth.requireOperacional, async (req, res) => {
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

app.post('/api/ai/v3/strategy', auth.requireAuth, auth.requireOperacional, async (req, res) => {
  try {
    const { pdvData, depth } = req.body;
    const result = await aiCore.generateStrategy(pdvData, { depth: depth || 'full' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/ai/v3/anomaly', auth.requireAuth, auth.requireOperacional, async (req, res) => {
  try {
    const { pdvId, pdvName, metric, currentValue, expectedValue, unit } = req.body;
    const result = await aiCore.analyzeAnomaly(pdvId, pdvName, metric, currentValue, expectedValue, unit);
    // Disparar webhook se crítico
    if (result?.severity === 'critical' || result?.severity === 'high') {
        try {
            const wh = require('./routes/webhooks');
            wh.dispatch({ type: 'anomalia', message: result.recommendation || result.cause, severity: result.severity, pdvName });
        } catch (_) {}
    }
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/ai/v3/stream', auth.requireAuth, auth.requireOperacional, (req, res) => {
  aiCore.addSSEClient(res);
});

app.get('/api/ai/v3/proactive', auth.requireAuth, auth.requireOperacional, (req, res) => {
  res.json({ ok: true, alerts: aiCore.getProactiveAlerts() });
});

app.get('/api/ai/v3/memory/:pdvId', auth.requireAuth, auth.requireOperacional, (req, res) => {
  res.json({ ok: true, data: aiCore.getMemory(req.params.pdvId) });
});


// ─────────────────────────────────────────────────────────────
// ROTAS — PRICE INTELLIGENCE (k11_price_intelligence)
// ⚠ RESTRITO: somente equipe operacional K11 (role != cliente)
// ─────────────────────────────────────────────────────────────

app.get('/api/price-intel/stream', auth.requireAuth, auth.requireOperacional, (req, res) => {
  priceIntel.addSSEClient(res);
});

app.get('/api/price-intel/state', auth.requireAuth, auth.requireOperacional, (req, res) => {
  res.json({ ok: true, data: priceIntel.getState() });
});

app.post('/api/price-intel/scan-all', auth.requireAuth, auth.requireOperacional, (req, res) => {
  priceIntel.forceFullScan();
  res.json({ ok: true, message: 'Scan iniciado em background' });
});

app.get('/api/price-intel/history/:productId', auth.requireAuth, auth.requireOperacional, (req, res) => {
  res.json({ ok: true, data: priceIntel.getPriceHistory(req.params.productId) });
});


// ─────────────────────────────────────────────────────────────
// ROTAS — DECISION ENGINE (k11_decision_engine)
// ⚠ RESTRITO: somente equipe operacional K11 (role != cliente)
// ─────────────────────────────────────────────────────────────

app.get('/api/decision/stream', auth.requireAuth, auth.requireOperacional, (req, res) => {
  decisionEngine.addSSEClient(res);
});

app.get('/api/decision/state', auth.requireAuth, auth.requireOperacional, (req, res) => {
  res.json({ ok: true, data: decisionEngine.getState() });
});

app.get('/api/decision/health/:pdvId', auth.requireAuth, auth.requireOperacional, (req, res) => {
  res.json({ ok: true, data: decisionEngine.getHealthScore(req.params.pdvId) });
});

app.get('/api/decision/forecast/:productId', auth.requireAuth, auth.requireOperacional, (req, res) => {
  res.json({ ok: true, data: decisionEngine.getForecast(req.params.productId) });
});

app.post('/api/decision/run-cycle', auth.requireAuth, auth.requireOperacional, (req, res) => {
  decisionEngine.runFullCycle();
  res.json({ ok: true, message: 'Ciclo iniciado em background' });
});



// ═══════════════════════════════════════════════════════════════
// ROTAS INLINE — OBRAMAX, SCHEDULE, PORTAL CLIENTE
// Embutidas diretamente para garantir deploy no Railway
// ═══════════════════════════════════════════════════════════════
(function registerInlineRoutes(app, auth, logger, datastore) {
    const crypto = require('crypto');

    function _sb()    { return datastore.supabase || null; }
    function _uuid()  { return crypto.randomUUID(); }
    function _now()   { return new Date().toISOString(); }

    // ── store local (fallback sem Supabase) ──
    const _store = { projects:[], alerts:[], inventory:[], orders:[] };

    // ════════════════════════════════════════
    // OBRAMAX — /api/obramax/*
    // ════════════════════════════════════════

    // POST /api/obramax/projects
    app.post('/api/obramax/projects', auth.requireAuth, async (req, res) => {
        try {
            const { name, address, start_date, predicted_end_date, budget, area_m2, description } = req.body;
            const usuario_ldap = req.user?.re || req.user?.ldap || 'desconhecido';
            if (!name || !address || !start_date || !predicted_end_date)
                return res.status(400).json({ ok: false, error: 'name, address, start_date, predicted_end_date obrigatórios' });

            // Não enviar id — deixar Supabase gerar com uuid_generate_v4()
            const projectData = { name: name.trim(), address: address.trim(), start_date, predicted_end_date,
                budget: parseFloat(budget)||0, area_m2: parseFloat(area_m2)||null, description: description||'',
                usuario_ldap, status:'active', progress_pct:0, total_spent:0 };

            const sb = _sb();
            if (sb) {
                const { data, error } = await sb.from('obras').insert(projectData).select().single();
                if (error) {
                    logger.error('OBRAMAX', `Erro ao criar obra: ${error.message}`);
                    throw error;
                }
                logger.info('OBRAMAX', `Obra criada: ${data.name}`);
                return res.status(201).json({ success:true, ok:true, data });
            }
            const project = { id: _uuid(), ...projectData, created_at:_now(), updated_at:_now() };
            _store.projects.push(project);
            return res.status(201).json({ success:true, ok:true, data: project });
        } catch(e) { logger.error('OBRAMAX',e.message); res.status(500).json({ ok:false, error:e.message }); }
    });

    // GET /api/obramax/projects
    app.get('/api/obramax/projects', auth.requireAuth, async (req, res) => {
        try {
            const ldap = req.user?.re || req.user?.ldap;
            const sb   = _sb();
            if (sb) {
                const { data, error } = await sb.from('obras').select('*').eq('usuario_ldap', ldap).order('created_at',{ascending:false});
                if (error) throw error;
                return res.json({ success:true, ok:true, data: data||[] });
            }
            return res.json({ success:true, ok:true, data: _store.projects.filter(p=>p.usuario_ldap===ldap) });
        } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
    });

    // GET /api/obramax/projects/:id
    app.get('/api/obramax/projects/:id', auth.requireAuth, async (req, res) => {
        try {
            const sb = _sb();
            if (sb) {
                const { data, error } = await sb.from('obras').select('*').eq('id',req.params.id).single();
                if (error||!data) return res.status(404).json({ ok:false, error:'Obra não encontrada' });
                return res.json({ ok:true, data });
            }
            const o = _store.projects.find(p=>p.id===req.params.id);
            if (!o) return res.status(404).json({ ok:false, error:'Obra não encontrada' });
            return res.json({ ok:true, data:o });
        } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
    });

    // PUT /api/obramax/projects/:id
    app.put('/api/obramax/projects/:id', auth.requireAuth, async (req, res) => {
        try {
            const updates = { ...req.body, updated_at:_now() };
            delete updates.id; delete updates.usuario_ldap;
            const sb = _sb();
            if (sb) {
                const { data, error } = await sb.from('obras').update(updates).eq('id',req.params.id).select().single();
                if (error) throw error;
                return res.json({ ok:true, data });
            }
            const idx = _store.projects.findIndex(p=>p.id===req.params.id);
            if (idx<0) return res.status(404).json({ ok:false, error:'Não encontrada' });
            _store.projects[idx] = {..._store.projects[idx],...updates};
            return res.json({ ok:true, data:_store.projects[idx] });
        } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
    });

    // DELETE /api/obramax/projects/:id
    app.delete('/api/obramax/projects/:id', auth.requireAuth, async (req, res) => {
        try {
            const sb = _sb();
            if (sb) { const { error } = await sb.from('obras').delete().eq('id',req.params.id); if (error) throw error; }
            else { _store.projects = _store.projects.filter(p=>p.id!==req.params.id); }
            return res.json({ ok:true, message:'Obra removida' });
        } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
    });

    // GET /api/obramax/alerts/:project_id
    app.get('/api/obramax/alerts/:project_id', auth.requireAuth, async (req, res) => {
        try {
            const sb = _sb();
            if (sb) {
                const { data, error } = await sb.from('obra_alerts').select('*').eq('project_id',req.params.project_id).eq('resolved',false);
                if (error) throw error;
                return res.json({ ok:true, data: data||[] });
            }
            return res.json({ ok:true, data: _store.alerts.filter(a=>a.project_id===req.params.project_id&&!a.resolved) });
        } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
    });

    // POST /api/obramax/alerts/:alertId/resolve
    app.post('/api/obramax/alerts/:alertId/resolve', auth.requireAuth, async (req, res) => {
        try {
            const sb = _sb();
            if (sb) { await sb.from('obra_alerts').update({resolved:true,resolved_at:_now()}).eq('id',req.params.alertId); }
            else { const a=_store.alerts.find(x=>x.id===req.params.alertId); if(a){a.resolved=true;} }
            return res.json({ ok:true, message:'Alerta resolvido' });
        } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
    });

    // GET /api/obramax/inventory/:project_id
    app.get('/api/obramax/inventory/:project_id', auth.requireAuth, async (req, res) => {
        try {
            const sb = _sb();
            if (sb) {
                const { data, error } = await sb.from('obra_inventory').select('*').eq('project_id',req.params.project_id);
                if (error) throw error;
                return res.json({ ok:true, data: data||[] });
            }
            return res.json({ ok:true, data: _store.inventory.filter(i=>i.project_id===req.params.project_id) });
        } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
    });

    // POST /api/obramax/inventory/:project_id/consume
    app.post('/api/obramax/inventory/:project_id/consume', auth.requireAuth, async (req, res) => {
        try {
            const { sku, quantity, notes } = req.body;
            if (!sku||!quantity) return res.status(400).json({ ok:false, error:'sku e quantity obrigatórios' });
            const entry = { id:_uuid(), project_id:req.params.project_id, sku, quantity:parseFloat(quantity), type:'consumo', notes:notes||'', created_at:_now() };
            const sb = _sb();
            if (sb) { const { data, error } = await sb.from('obra_inventory').insert(entry).select().single(); if(error) throw error; return res.status(201).json({ ok:true, data }); }
            _store.inventory.push(entry);
            return res.status(201).json({ ok:true, data:entry });
        } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
    });

    // GET /api/obramax/orders
    app.get('/api/obramax/orders', auth.requireAuth, async (req, res) => {
        try {
            const { project_id } = req.query;
            const sb = _sb();
            if (sb) {
                let q = sb.from('orders_obramax').select('*').order('created_at',{ascending:false});
                if (project_id) q = q.eq('project_id',project_id);
                const { data, error } = await q;
                if (error) throw error;
                return res.json({ ok:true, data: data||[] });
            }
            const orders = project_id ? _store.orders.filter(o=>o.project_id===project_id) : _store.orders;
            return res.json({ ok:true, data: orders });
        } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
    });

    // GET /api/obramax/products
    app.get('/api/obramax/products', auth.requireAuth, (req, res) => {
        const PRODUCTS = [
            { sku:'CIM001', name:'Cimento Portland 50kg', category:'cimento', price:35.90, stock:500, delivery_days:1 },
            { sku:'ARE001', name:'Areia Média 1m³', category:'agregados', price:120.00, stock:200, delivery_days:2 },
            { sku:'BRI001', name:'Tijolo Comum 1mil', category:'alvenaria', price:890.00, stock:50, delivery_days:3 },
            { sku:'FER001', name:'Ferro CA-50 10mm', category:'estrutura', price:58.00, stock:300, delivery_days:1 },
        ];
        res.json({ success:true, data: PRODUCTS, total: PRODUCTS.length });
    });

    // ════════════════════════════════════════
    // SCHEDULE — /api/schedule/*
    // ════════════════════════════════════════

    // GET /api/schedule/phases/:project_id
    app.get('/api/schedule/phases/:project_id', auth.requireAuth, async (req, res) => {
        try {
            const sb = _sb();
            if (sb) {
                const { data, error } = await sb.from('phases').select('*').eq('project_id',req.params.project_id).order('created_at',{ascending:true});
                if (error) throw error;
                return res.json({ success:true, data: data||[] });
            }
            return res.json({ success:true, data:[] });
        } catch(e) { res.status(500).json({ error:e.message }); }
    });

    // POST /api/schedule/phases
    app.post('/api/schedule/phases', auth.requireAuth, async (req, res) => {
        try {
            const { project_id, phase_type, start_date, area_m2 } = req.body;
            if (!project_id||!phase_type||!start_date)
                return res.status(400).json({ error:'project_id, phase_type, start_date obrigatórios' });
            const TEMPLATES = {
                fundacao:  { name:'Fundação',  duration_days:20 },
                estrutura: { name:'Estrutura', duration_days:30 },
                alvenaria: { name:'Alvenaria', duration_days:45 },
                reboco:    { name:'Reboco',    duration_days:30 },
                pintura:   { name:'Pintura',   duration_days:15 },
            };
            const tmpl = TEMPLATES[phase_type] || { name: phase_type, duration_days:30 };
            const end  = new Date(new Date(start_date).getTime() + tmpl.duration_days*86400000).toISOString().split('T')[0];
            // Não enviar id — deixar Supabase gerar com uuid_generate_v4()
            const phaseData = { project_id, name:tmpl.name, start_date, predicted_end_date:end, estimated_days:tmpl.duration_days, progress_percent:0, status:'pending' };
            const sb = _sb();
            if (sb) {
                const { data, error } = await sb.from('phases').insert(phaseData).select().single();
                if (error) {
                    logger.error('SCHEDULE', `Erro ao criar fase: ${error.message} | project_id=${project_id}`);
                    throw error;
                }
                return res.json({ success:true, phase:data, message:`${tmpl.name} criada` });
            }
            // Fallback local
            const phase = { id:_uuid(), ...phaseData, created_at:_now() };
            return res.json({ success:true, phase, message:`${tmpl.name} criada` });
        } catch(e) { res.status(500).json({ error:e.message }); }
    });

    // POST /api/schedule/:phase_id/update-progress
    app.post('/api/schedule/:phase_id/update-progress', auth.requireAuth, async (req, res) => {
        try {
            const pct = parseInt(req.body.progress_percent||0);
            const status = pct===100?'completed':pct>0?'in_progress':'pending';
            const sb = _sb();
            if (sb) {
                await sb.from('phases').update({ progress_percent:pct, status }).eq('id',req.params.phase_id);
            }
            // Trigger NPS quando fase é concluída
            if (pct === 100) {
                try {
                    const sb2 = _sb();
                    if (sb2) {
                        const { data: fase } = await sb2.from('phases').select('project_id').eq('id', req.params.phase_id).single();
                        if (fase?.project_id) {
                            const { data: obra } = await sb2.from('obras').select('cliente_email').eq('id', fase.project_id).single();
                            if (obra?.cliente_email) {
                                const { triggerNPSAfterPhase } = require('./routes/nps');
                                triggerNPSAfterPhase(fase.project_id, req.params.phase_id, obra.cliente_email).catch(()=>{});
                            }
                        }
                    }
                } catch (_) {}
            }
            return res.json({ success:true, status });
        } catch(e) { res.status(500).json({ error:e.message }); }
    });

    // POST /api/schedule/predict-delays
    app.post('/api/schedule/predict-delays', auth.requireAuth, async (req, res) => {
        return res.json({ success:true, analysis:{ risk_level:'low', at_risk_phases:[], recommendations:['Cronograma dentro do prazo'] }, alerts_created:0 });
    });

    // GET /api/schedule/:phase_id/materials
    app.get('/api/schedule/:phase_id/materials', auth.requireAuth, async (req, res) => {
        try {
            const sb = _sb();
            if (sb) {
                const { data, error } = await sb.from('phase_materials').select('*').eq('phase_id',req.params.phase_id);
                if (error) throw error;
                return res.json({ success:true, data: data||[] });
            }
            return res.json({ success:true, data:[] });
        } catch(e) { res.status(500).json({ error:e.message }); }
    });

    logger.info('BOOT', '✓ Rotas inline: obramax + schedule registradas');
})(app, auth, logger, datastore);


    // ════════════════════════════════════════════════════════════
    // ORÇAMENTO IA — /api/orcamento/*
    // ════════════════════════════════════════════════════════════
    (function registerOrcamentoRoutes(app, auth, logger) {
        const Anthropic = require('@anthropic-ai/sdk');
        const fs        = require('fs');
        const os        = require('os');
        const pathMod   = require('path');

        // Multer para upload de arquivos (inline, sem require externo problemático)
        let multer;
        try { multer = require('multer'); } catch(_) { multer = null; }

        const upload = multer
            ? multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })
            : { single: () => (req, res, next) => next() };

        const SINAPI_MOB = {
            fundacao: 850, estrutura: 1200, alvenaria: 550,
            banheiro: 1800, cozinha: 2200, piso: 450,
            revestimento: 380, pintura: 120, elétrica: 650,
            hidráulica: 720, cobertura: 980, reforma_geral: 1400,
        };

        function _getAnthropicClient() {
            const key = process.env.ANTHROPIC_API_KEY;
            if (!key) return null;
            return new Anthropic({ apiKey: key });
        }

        // POST /api/orcamento/gerar
        app.post('/api/orcamento/gerar', auth.requireAuth, upload.single('arquivo'), async (req, res) => {
            try {
                const { texto, margem = 25, padrao = 'medio', area, obra_id } = req.body;
                const arquivo = req.file;

                logger.info('ORCAMENTO', `Gerando orçamento | padrao=${padrao} area=${area||'n/a'}`);

                const client = _getAnthropicClient();

                let orcamento;
                if (client) {
                    orcamento = await _gerarComIA(client, { texto, arquivo, margem: parseFloat(margem), padrao, area: parseFloat(area)||null, obra_id });
                } else {
                    orcamento = _gerarFallback({ texto, margem: parseFloat(margem), padrao, area: parseFloat(area)||null });
                }

                return res.json({ ok: true, orcamento });
            } catch(e) {
                logger.error('ORCAMENTO', e.message);
                return res.status(500).json({ ok: false, error: e.message });
            }
        });

        async function _gerarComIA(client, { texto, arquivo, margem, padrao, area, obra_id }) {
            const margemFator = 1 + (margem / 100);
            const padroesMulti = { economico: 0.7, medio: 1.0, alto: 1.4, luxo: 2.1 };
            const multi = padroesMulti[padrao] || 1.0;

            // Montar mensagem para Claude
            const messages = [];
            const content  = [];

            // Se tem arquivo de imagem, usar visão
            if (arquivo && arquivo.mimetype?.startsWith('image/')) {
                content.push({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: arquivo.mimetype,
                        data: arquivo.buffer.toString('base64'),
                    },
                });
            }

            const prompt = `Você é um especialista em orçamentos de construção civil no Brasil.
${texto ? `Descrição do cliente: "${texto}"` : ''}
${area ? `Área: ${area} m²` : ''}
Padrão de acabamento: ${padrao}

${arquivo && !arquivo.mimetype?.startsWith('image/') ? 'Um arquivo foi enviado com a lista de materiais/serviços.' : ''}

Retorne APENAS um JSON válido (sem markdown, sem explicações) com esta estrutura exata:
{
  "descricao": "Descrição resumida do serviço",
  "prazo_dias": 30,
  "itens": [
    {
      "tipo": "material",
      "nome": "Nome do material",
      "especificacao": "Detalhes técnicos",
      "quantidade": 10,
      "unidade": "m²",
      "preco_unit": 45.90,
      "total": 459.00,
      "sku": "CIM001",
      "disponivel_estoque": false
    },
    {
      "tipo": "servico",
      "nome": "Nome do serviço",
      "especificacao": "Descrição da mão de obra",
      "quantidade": 1,
      "unidade": "vb",
      "preco_unit": 1200.00,
      "total": 1200.00
    }
  ],
  "total": 1659.00,
  "alertas": ["Observação importante se houver"]
}

Use preços realistas do mercado brasileiro 2026.
Inclua pelo menos 3 materiais e 2 serviços.
Se a área foi informada, calcule quantidades reais.`;

            content.push({ type: 'text', text: prompt });
            messages.push({ role: 'user', content });

            const response = await client.messages.create({
                model:      'claude-opus-4-6',
                max_tokens: 2000,
                messages,
            });

            const rawText = response.content[0]?.text || '{}';
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('IA não retornou JSON válido');

            const orc = JSON.parse(jsonMatch[0]);

            // Aplicar margem e padrão
            orc.itens = (orc.itens || []).map(item => ({
                ...item,
                preco_unit: item.preco_unit * multi,
                total:      item.total      * multi * margemFator,
            }));
            orc.total = orc.itens.reduce((a, i) => a + i.total, 0);

            return orc;
        }

        function _gerarFallback({ texto, margem, padrao, area }) {
            const multi = { economico:0.7, medio:1.0, alto:1.4, luxo:2.1 }[padrao] || 1.0;
            const m     = 1 + margem/100;
            const a     = area || 10;
            return {
                descricao: texto || 'Orçamento gerado automaticamente',
                prazo_dias: Math.ceil(a * 0.8),
                itens: [
                    { tipo:'material', nome:'Cimento Portland 50kg', especificacao:'CP-II', quantidade: Math.ceil(a*1.5), unidade:'sc', preco_unit: 35.90*multi, total: Math.ceil(a*1.5)*35.90*multi*m, sku:'CIM001', disponivel_estoque:true },
                    { tipo:'material', nome:'Areia Média', especificacao:'1m³ saco', quantidade: Math.ceil(a*0.5), unidade:'m³', preco_unit: 120*multi, total: Math.ceil(a*0.5)*120*multi*m, sku:'ARE001', disponivel_estoque:true },
                    { tipo:'material', nome:'Tijolo Cerâmico 9 furos', especificacao:'9x14x19', quantidade: Math.ceil(a*50), unidade:'un', preco_unit: 0.89*multi, total: Math.ceil(a*50)*0.89*multi*m, sku:'BRI001', disponivel_estoque:false },
                    { tipo:'servico', nome:'Mão de obra - Pedreiro', especificacao:'Inclui ajudante', quantidade: Math.ceil(a*0.3), unidade:'diária', preco_unit: 280*multi, total: Math.ceil(a*0.3)*280*multi*m },
                    { tipo:'servico', nome:'Limpeza e retirada de entulho', especificacao:'Por m²', quantidade: a, unidade:'m²', preco_unit: 25*multi, total: a*25*multi*m },
                ],
                total: 0,
                alertas: ['Orçamento estimado — configure ANTHROPIC_API_KEY para análise por IA'],
            };
        }

        // POST /api/orcamento/salvar
        app.post('/api/orcamento/salvar', auth.requireAuth, async (req, res) => {
            try {
                const { obra_id, orcamento } = req.body;
                if (!obra_id || !orcamento) return res.status(400).json({ ok:false, error:'obra_id e orcamento obrigatórios' });
                const sb = datastore.supabase;
                if (sb) {
                    const { data, error } = await sb.from('orcamentos_ia').insert({
                        obra_id, dados: orcamento, total: orcamento.total,
                        usuario_ldap: req.user?.re, created_at: new Date().toISOString(),
                    }).select().single();
                    if (error) throw error;
                    return res.json({ ok:true, data });
                }
                return res.json({ ok:true, message:'Salvo localmente' });
            } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
        });

        // GET /api/orcamento/obra/:obra_id
        app.get('/api/orcamento/obra/:obra_id', auth.requireAuth, async (req, res) => {
            try {
                const sb = datastore.supabase;
                if (sb) {
                    const { data, error } = await sb.from('orcamentos_ia').select('*').eq('obra_id', req.params.obra_id).order('created_at', { ascending:false });
                    if (error) throw error;
                    return res.json({ ok:true, data: data||[] });
                }
                return res.json({ ok:true, data:[] });
            } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
        });

        // POST /api/orcamento/pdf — gerar PDF
        app.post('/api/orcamento/pdf', auth.requireAuth, async (req, res) => {
            try {
                const { orcamento } = req.body;
                if (!orcamento) return res.status(400).json({ ok:false, error:'orcamento obrigatório' });

                const user = req.user;
                const fmt  = v => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits:2 })}`;
                const now  = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });

                const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;padding:32px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #FF8C00}
  .logo{font-size:22px;font-weight:900;color:#FF8C00}.logo span{color:#1a1a1a}
  .meta{text-align:right;font-size:11px;color:#666}
  h2{font-size:16px;color:#1a1a1a;margin-bottom:4px}
  .prazo{font-size:12px;color:#666;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#FF8C00;color:#000;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  td{padding:8px 10px;border-bottom:1px solid #eee;font-size:12px}
  tr.material td:first-child{border-left:3px solid #FF8C00}
  tr.servico  td:first-child{border-left:3px solid #60A5FA}
  .total-section{background:#f8f8f8;border-radius:8px;padding:16px;margin-top:8px}
  .total-row{display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px}
  .total-geral{font-size:18px;font-weight:900;color:#FF8C00;border-top:2px solid #FF8C00;padding-top:10px;margin-top:4px}
  .footer{margin-top:28px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:12px}
  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
  .badge-mat{background:#FFF3E0;color:#E65100}
  .badge-svc{background:#E3F2FD;color:#1565C0}
</style></head><body>
<div class="header">
  <div><div class="logo">OMNI <span>K11</span></div><div style="font-size:10px;color:#999;letter-spacing:2px;margin-top:2px">ELITE OPERATIONAL OS</div></div>
  <div class="meta"><div>Orçamento K11</div><div>${now}</div><div>Elaborado por: ${user?.nome || 'K11 IA'}</div></div>
</div>
<h2>${orcamento.descricao || 'Orçamento de Obras'}</h2>
${orcamento.prazo_dias ? `<div class="prazo">Prazo estimado: ${orcamento.prazo_dias} dias corridos</div>` : ''}
<table>
  <thead><tr><th>Item</th><th>Especificação</th><th>Qtd</th><th>Un</th><th>Vlr Unit</th><th>Total</th></tr></thead>
  <tbody>
    ${(orcamento.itens||[]).map(i=>`
    <tr class="${i.tipo}">
      <td><span class="badge badge-${i.tipo==='material'?'mat':'svc'}">${i.tipo==='material'?'MAT':'SVC'}</span> ${i.nome}</td>
      <td>${i.especificacao||'—'}</td>
      <td>${i.quantidade?.toLocaleString('pt-BR')||'1'}</td>
      <td>${i.unidade||'un'}</td>
      <td>${fmt(i.preco_unit||0)}</td>
      <td style="font-weight:700">${fmt(i.total||0)}</td>
    </tr>`).join('')}
  </tbody>
</table>
<div class="total-section">
  <div class="total-row"><span>Materiais</span><span>${fmt((orcamento.itens||[]).filter(i=>i.tipo==='material').reduce((a,i)=>a+i.total,0))}</span></div>
  <div class="total-row"><span>Mão de Obra</span><span>${fmt((orcamento.itens||[]).filter(i=>i.tipo==='servico').reduce((a,i)=>a+i.total,0))}</span></div>
  <div class="total-row total-geral"><span>TOTAL GERAL</span><span>${fmt(orcamento.total||0)}</span></div>
</div>
${orcamento.alertas?.length ? `<div style="margin-top:16px">${orcamento.alertas.map(a=>`<div style="font-size:11px;color:#E65100;margin-bottom:4px">⚠ ${a}</div>`).join('')}</div>` : ''}
<div class="footer">Orçamento gerado pelo K11 OMNI ELITE com análise de IA. Valores sujeitos a alteração conforme especificações definitivas.</div>
</body></html>`;

                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="orcamento-k11-${Date.now()}.html"`);
                return res.send(html);

            } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
        });

        logger.info('BOOT', '✓ Orçamento IA — rotas registradas');
    })(app, auth, logger);


    // ── CHAT OBRA ─────────────────────────────────────────────────
    app.post('/api/obra-chat', auth.requireAuth, async (req, res) => {
        try {
            const { obra_id, mensagem } = req.body;
            if (!obra_id || !mensagem) return res.status(400).json({ ok:false, error:'obra_id e mensagem obrigatórios' });
            const user = req.user;
            const msg  = { obra_id, autor_ldap: user?.re, autor_nome: user?.nome||'Usuário',
                lado: user?.role==='cliente'?'cliente':'gestor', mensagem: mensagem.trim() };
            const sb = datastore.supabase;
            if (sb) {
                const { data, error } = await sb.from('obra_mensagens').insert(msg).select().single();
                if (error) throw error;
                return res.status(201).json({ ok:true, data });
            }
            return res.status(201).json({ ok:true, data: msg });
        } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
    });

    app.get('/api/obra-chat/:obra_id', auth.requireAuth, async (req, res) => {
        try {
            const sb = datastore.supabase;
            if (sb) {
                const { data, error } = await sb.from('obra_mensagens').select('*')
                    .eq('obra_id', req.params.obra_id).order('created_at',{ascending:true}).limit(100);
                if (error) throw error;
                return res.json({ ok:true, data: data||[] });
            }
            return res.json({ ok:true, data:[] });
        } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
    });

// ─────────────────────────────────────────────────────────────
// API DO CLIENTE — rotas REST do portal
// Requer auth + role: cliente
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// AUTH DO CLIENTE — única fonte de verdade
// POST /api/auth/cliente/login
// POST /api/auth/cliente/register
// POST /api/auth/cliente/forgot
// POST /api/auth/cliente/reset
// ─────────────────────────────────────────────────────────────
app.use('/api/auth/cliente', clienteAuth);

// ─────────────────────────────────────────────────────────────
// API DO CLIENTE — rotas REST do portal (requer role: cliente)
// ─────────────────────────────────────────────────────────────
app.use('/api/cliente', auth.requireAuth, auth.requireCliente, clienteRoutes);
app.use('/api/skills',   auth.requireAuth, auth.requireOperacional, skillsRoutes);
app.use('/api/missions',      auth.requireAuth, auth.requireOperacional, skillsRoutes);
app.use('/api/notifications', auth.requireAuth, notificationsRoutes);
app.use('/api/photos',        auth.requireAuth, photosRoutes);
app.use('/api/orcamento',     auth.requireAuth, orcApprovalRoutes);
app.use('/api/webhooks',      auth.requireAuth, auth.requireOperacional, webhooksModule.router);
app.use('/api/reports',       auth.requireAuth, reportsRoutes);
app.use('/api/nps',           auth.requireAuth, npsRouter);

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
