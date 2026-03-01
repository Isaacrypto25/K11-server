/**
 * K11 OMNI ELITE — INTEGRAÇÃO NO server.js
 * ══════════════════════════════════════════
 * Cole estas linhas no seu server.js existente no Railway.
 * Adicione no topo (requires) e depois as rotas.
 */

// ── 1. ADICIONAR NO TOPO DO server.js (junto aos outros requires) ──────

const auth     = require('./server-auth');
const register = require('./server-register');


// ── 2. ADICIONAR AS ROTAS (antes das rotas existentes) ─────────────────

// Auth — login, refresh, logout
app.post('/api/auth/login',   auth.loginHandler);
app.post('/api/auth/refresh', auth.requireAuth, auth.refreshHandler);
app.post('/api/auth/logout',  auth.requireAuth, auth.logoutHandler);

// Registro — cadastro com email de confirmação
app.post('/api/auth/register',    register.registerHandler);
app.post('/api/auth/confirm-pin', register.confirmPinHandler);
app.post('/api/auth/resend-pin',  register.resendPinHandler);


// ── 3. PROTEGER AS ROTAS EXISTENTES ────────────────────────────────────
// Adicione auth.requireAuth como middleware em cada rota de dados.
// Exemplo — mude isto:
//   app.get('/api/data/all', async (req, res) => { ... });
// Para isto:
//   app.get('/api/data/all', auth.requireAuth, async (req, res) => { ... });

// Rotas que devem ser protegidas:
//   GET  /api/data/all
//   POST /api/data/tarefas/:id/toggle
//   POST /api/system/log
//   (todas as outras rotas de dados)


// ── 4. VARIÁVEIS DE AMBIENTE — adicionar no Railway Variables ───────────
//
//   JWT_SECRET     →  c6c6e96d7e027874f5cbf46c9733c1304418ab402b36a6189b8918f14b37dd4e623e98de05ae0ba849cb6122f17ba7ecdecf2220effd1a6e095f33dc5462940b
//   RESEND_API_KEY →  re_xxxxxxxxxxxx  (obter em resend.com → API Keys)
//
//   SUPABASE_URL e SUPABASE_KEY já existem — não precisa mudar.
