/**
 * K11 OMNI ELITE — AUTH ROUTES (Railway)
 * ════════════════════════════════════════
 * Versão 2 — usuários armazenados no Supabase (tabela k11_users)
 *
 * ── VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Railway Variables) ─────
 *   JWT_SECRET    → string longa aleatória (já gerada)
 *   SUPABASE_URL  → já existe no seu Railway
 *   SUPABASE_KEY  → já existe no seu Railway
 *
 * ── DEPENDÊNCIAS (já no seu package.json) ─────────────────────
 *   bcryptjs, @supabase/supabase-js
 *
 * ── COMO INTEGRAR NO SEU server.js ───────────────────────────
 *   const auth = require('./server-auth');
 *   app.post('/api/auth/login',   auth.loginHandler);
 *   app.post('/api/auth/refresh', auth.requireAuth, auth.refreshHandler);
 *   app.post('/api/auth/logout',  auth.requireAuth, auth.logoutHandler);
 *   // Proteger rotas existentes:
 *   app.get('/api/data/all', auth.requireAuth, seuHandlerAtual);
 */

'use strict';

const crypto  = require('crypto');
// PBKDF2 nativo do Node — sem dependência de bcryptjs
const { createClient } = require('@supabase/supabase-js');

// ── PBKDF2-SHA256 — mesmo algoritmo do k11-create-users.py ───
const PBKDF2_ITERATIONS = 310_000;
const PBKDF2_KEYLEN     = 32;
const PBKDF2_DIGEST     = 'sha256';

function hashPin(pin) {
    const salt = crypto.randomBytes(32).toString('hex');
    const dk   = crypto.pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
    return `pbkdf2${salt}${dk.toString('hex')}`;
}

function verifyPin(pin, storedHash) {
    try {
        const parts = storedHash.split('$');
        if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;
        const salt     = parts[1];
        const expected = Buffer.from(parts[2], 'hex');
        const dk       = crypto.pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
        return crypto.timingSafeEqual(dk, expected);
    } catch { return false; }
}

// ── Cliente Supabase (reutiliza o existente se já tiver no servidor) ──
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_KEY
        );
    }
    return _supabase;
}

// ═══════════════════════════════════════════════════════════
// JWT — HMAC-SHA256 sem dependências externas
// ═══════════════════════════════════════════════════════════

function signJWT(payload, expiresInSeconds = 28800) { // 8h padrão
    const secret  = process.env.JWT_SECRET;
    const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp     = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const body    = Buffer.from(JSON.stringify({
        ...payload,
        exp,
        iat: Math.floor(Date.now() / 1000),
    })).toString('base64url');
    const sig = crypto
        .createHmac('sha256', secret)
        .update(`${header}.${body}`)
        .digest('base64url');
    return `${header}.${body}.${sig}`;
}

function verifyJWT(token) {
    try {
        const secret = process.env.JWT_SECRET;
        const [header, body, sig] = token.split('.');
        const expected = crypto
            .createHmac('sha256', secret)
            .update(`${header}.${body}`)
            .digest('base64url');

        const sigBuf = Buffer.from(sig,      'base64url');
        const expBuf = Buffer.from(expected, 'base64url');
        if (sigBuf.length !== expBuf.length) return null;
        if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        if (payload.exp < Math.floor(Date.now() / 1000)) return null;

        return payload;
    } catch {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE — protege qualquer rota Express
// ═══════════════════════════════════════════════════════════

function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ ok: false, error: 'Token não fornecido.' });
    }

    if (!process.env.JWT_SECRET) {
        console.error('[AUTH] JWT_SECRET não configurado no Railway Variables!');
        return res.status(500).json({ ok: false, error: 'Servidor mal configurado.' });
    }

    const payload = verifyJWT(token);
    if (!payload) {
        return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
    }

    req.user = payload; // { re, nome, role, exp, iat }
    next();
}

// ═══════════════════════════════════════════════════════════
// ROTA: POST /api/auth/login
// ═══════════════════════════════════════════════════════════

async function loginHandler(req, res) {
    const { re, pin } = req.body || {};

    if (!re || !pin) {
        return res.status(400).json({ ok: false, error: 'RE e PIN são obrigatórios.' });
    }

    try {
        const supabase = getSupabase();

        // Busca usuário ativo no Supabase
        const { data: usuario, error } = await supabase
            .from('k11_users')
            .select('re, nome, role, pin_hash, ativo')
            .eq('re', String(re).trim())
            .eq('ativo', true)
            .single();

        // Hash fictício garante tempo constante mesmo quando usuário não existe
        // (evita enumerar quais REs existem por diferença de tempo de resposta)
        const pinValido = usuario?.pin_hash
            ? verifyPin(String(pin).trim(), usuario.pin_hash)
            : false;

        if (error || !usuario || !pinValido) {
            return res.status(401).json({ ok: false, error: 'RE ou PIN incorreto.' });
        }

        if (!process.env.JWT_SECRET) {
            console.error('[AUTH] JWT_SECRET não configurado!');
            return res.status(500).json({ ok: false, error: 'Servidor mal configurado.' });
        }

        // Gera JWT com 8h de validade
        const token = signJWT({
            re:   usuario.re,
            nome: usuario.nome,
            role: usuario.role,
        });

        // Atualiza último login (fire and forget — não bloqueia a resposta)
        supabase
            .from('k11_users')
            .update({ ultimo_login: new Date().toISOString() })
            .eq('re', usuario.re)
            .then(() => {}).catch(() => {});

        // Registra no audit_log (fire and forget)
        supabase
            .from('audit_log')
            .insert({
                re:     usuario.re,
                role:   usuario.role,
                action: 'LOGIN',
                ip:     req.ip || req.headers['x-forwarded-for'] || 'desconhecido',
                meta:   { user_agent: req.headers['user-agent'] },
            })
            .then(() => {}).catch(() => {});

        return res.json({
            ok:   true,
            token,
            user: {
                nome: usuario.nome,
                role: usuario.role,
            },
        });

    } catch (err) {
        console.error('[AUTH] Erro no login:', err.message);
        return res.status(500).json({ ok: false, error: 'Erro interno do servidor.' });
    }
}

// ═══════════════════════════════════════════════════════════
// ROTA: POST /api/auth/refresh
// ═══════════════════════════════════════════════════════════

function refreshHandler(req, res) {
    const { re, nome, role } = req.user; // injetado pelo requireAuth
    const newToken = signJWT({ re, nome, role });
    return res.json({ ok: true, token: newToken });
}

// ═══════════════════════════════════════════════════════════
// ROTA: POST /api/auth/logout
// ═══════════════════════════════════════════════════════════

async function logoutHandler(req, res) {
    if (req.user) {
        getSupabase()
            .from('audit_log')
            .insert({
                re:     req.user.re,
                role:   req.user.role,
                action: 'LOGOUT',
                ip:     req.ip || 'desconhecido',
            })
            .then(() => {}).catch(() => {});
    }
    return res.json({ ok: true });
}

module.exports = {
    requireAuth,
    loginHandler,
    refreshHandler,
    logoutHandler,
    verifyJWT,
    signJWT,
};
