/**
 * K11 OMNI ELITE — AUTH PORTAL DO CLIENTE
 * ════════════════════════════════════════
 * Endpoints:
 *   POST /api/auth/cliente/login     — login com email + senha
 *   POST /api/auth/cliente/register  — cadastro de novo cliente
 *   POST /api/auth/cliente/forgot    — recuperação de senha
 *   POST /api/auth/cliente/reset     — redefinir senha com token
 */
'use strict';

const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const path     = require('path');

const { signJWT, verifyPin, hashPin } = require(path.join(__dirname, '../middleware/server-auth.js'));
const datastore = require('../services/datastore');
const logger    = require('../services/logger');

function getSupabase() { return datastore.supabase || null; }

// ── PBKDF2 helper (mesmo algoritmo do sistema principal) ──────
const ITER = 310_000, KLEN = 32, DIG = 'sha256';
function _hashSenha(senha) {
    const salt = crypto.randomBytes(32).toString('hex');
    const dk   = crypto.pbkdf2Sync(senha, salt, ITER, KLEN, DIG);
    return `pbkdf2$${salt}$${dk.toString('hex')}`;
}
function _verifySenha(senha, stored) {
    try {
        const [, salt, exp] = stored.split('$');
        const dk  = crypto.pbkdf2Sync(senha, salt, ITER, KLEN, DIG);
        const buf = Buffer.from(exp, 'hex');
        if (dk.length !== buf.length) return false;
        return crypto.timingSafeEqual(dk, buf);
    } catch { return false; }
}

// ─────────────────────────────────────────────────────────────
// POST /api/auth/cliente/login
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { email, senha } = req.body || {};

    if (!email || !senha)
        return res.status(400).json({ ok: false, error: 'Email e senha obrigatórios.' });

    const sb = getSupabase();
    if (!sb) {
        // Modo demo sem Supabase — aceita qualquer credencial válida
        logger.warn('CLIENTE-AUTH', 'Supabase não configurado — modo demo');
        const token = signJWT({ re: email, nome: email.split('@')[0], role: 'cliente' });
        return res.json({ ok: true, token, user: { nome: email.split('@')[0], role: 'cliente', email } });
    }

    try {
        const { data: user, error } = await sb
            .from('k11_clientes')
            .select('id, nome, email, senha_hash, ativo')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (error || !user)
            return res.status(401).json({ ok: false, error: 'Email ou senha incorretos.' });

        if (!user.ativo)
            return res.status(401).json({ ok: false, error: 'Conta desativada. Entre em contato com o suporte.' });

        if (!_verifySenha(senha, user.senha_hash))
            return res.status(401).json({ ok: false, error: 'Email ou senha incorretos.' });

        const token = signJWT({ re: user.email, nome: user.nome, role: 'cliente' }, 28800);

        // Atualizar último login
        sb.from('k11_clientes').update({ ultimo_login: new Date().toISOString() }).eq('id', user.id).then(() => {}).catch(() => {});

        logger.info('CLIENTE-AUTH', `Login: ${user.email}`);
        return res.json({ ok: true, token, user: { nome: user.nome, role: 'cliente', email: user.email } });

    } catch (err) {
        logger.error('CLIENTE-AUTH', `Login error: ${err.message}`);
        return res.status(500).json({ ok: false, error: 'Erro interno. Tente novamente.' });
    }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/cliente/register
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
    const { nome, email, senha } = req.body || {};

    if (!nome || !email || !senha)
        return res.status(400).json({ ok: false, error: 'Nome, email e senha são obrigatórios.' });

    if (nome.trim().length < 3)
        return res.status(400).json({ ok: false, field: 'nome', error: 'Nome muito curto (mínimo 3 caracteres).' });

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email))
        return res.status(400).json({ ok: false, field: 'email', error: 'Email inválido.' });

    if (senha.length < 6)
        return res.status(400).json({ ok: false, field: 'senha', error: 'Senha deve ter no mínimo 6 caracteres.' });

    const sb = getSupabase();
    if (!sb) {
        // Modo demo
        const token = signJWT({ re: email, nome: nome.trim(), role: 'cliente' });
        return res.json({ ok: true, token, user: { nome: nome.trim(), role: 'cliente', email } });
    }

    try {
        // Verificar se email já existe
        const { data: existing } = await sb
            .from('k11_clientes')
            .select('id')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (existing)
            return res.status(409).json({ ok: false, field: 'email', error: 'Este email já está cadastrado.' });

        const senha_hash = _hashSenha(senha);
        const { data: novo, error } = await sb
            .from('k11_clientes')
            .insert({
                nome:       nome.trim(),
                email:      email.toLowerCase().trim(),
                senha_hash,
                ativo:      true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .select('id, nome, email')
            .single();

        if (error) throw error;

        const token = signJWT({ re: novo.email, nome: novo.nome, role: 'cliente' }, 28800);
        logger.info('CLIENTE-AUTH', `Cadastro: ${novo.email}`);
        return res.status(201).json({ ok: true, token, user: { nome: novo.nome, role: 'cliente', email: novo.email } });

    } catch (err) {
        logger.error('CLIENTE-AUTH', `Register error: ${err.message}`);
        return res.status(500).json({ ok: false, error: 'Erro ao cadastrar. Tente novamente.' });
    }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/cliente/forgot
// ─────────────────────────────────────────────────────────────
router.post('/forgot', async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, error: 'Email obrigatório.' });

    const sb = getSupabase();
    if (!sb)
        return res.json({ ok: true, message: 'Se o email estiver cadastrado, você receberá as instruções.' });

    try {
        const { data: user } = await sb
            .from('k11_clientes')
            .select('id, nome, email')
            .eq('email', email.toLowerCase().trim())
            .single();

        // Sempre retorna sucesso (não revela se o email existe)
        if (!user) {
            return res.json({ ok: true, message: 'Se o email estiver cadastrado, você receberá as instruções.' });
        }

        // Gerar token de reset (válido por 1h)
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt  = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        await sb.from('k11_cliente_resets').upsert({
            email:      user.email,
            token:      resetToken,
            expires_at: expiresAt,
        });

        // TODO: enviar email com link de reset
        // Por ora, o token fica no banco e pode ser testado via /api/auth/cliente/reset
        logger.info('CLIENTE-AUTH', `Password reset solicitado: ${user.email}`);

        return res.json({ ok: true, message: 'Se o email estiver cadastrado, você receberá as instruções de recuperação em breve.' });

    } catch (err) {
        logger.error('CLIENTE-AUTH', `Forgot error: ${err.message}`);
        return res.status(500).json({ ok: false, error: 'Erro interno. Tente novamente.' });
    }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/cliente/reset
// ─────────────────────────────────────────────────────────────
router.post('/reset', async (req, res) => {
    const { email, token, nova_senha } = req.body || {};
    if (!email || !token || !nova_senha)
        return res.status(400).json({ ok: false, error: 'Email, token e nova senha obrigatórios.' });

    if (nova_senha.length < 6)
        return res.status(400).json({ ok: false, error: 'Nova senha deve ter no mínimo 6 caracteres.' });

    const sb = getSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    try {
        const { data: reset, error } = await sb
            .from('k11_cliente_resets')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .eq('token', token)
            .single();

        if (error || !reset)
            return res.status(400).json({ ok: false, error: 'Token inválido ou expirado.' });

        if (new Date(reset.expires_at) < new Date())
            return res.status(400).json({ ok: false, error: 'Token expirado. Solicite uma nova recuperação.' });

        const senha_hash = _hashSenha(nova_senha);
        await sb.from('k11_clientes').update({ senha_hash, updated_at: new Date().toISOString() }).eq('email', email.toLowerCase().trim());
        await sb.from('k11_cliente_resets').delete().eq('email', email.toLowerCase().trim());

        logger.info('CLIENTE-AUTH', `Senha redefinida: ${email}`);
        return res.json({ ok: true, message: 'Senha redefinida com sucesso.' });

    } catch (err) {
        logger.error('CLIENTE-AUTH', `Reset error: ${err.message}`);
        return res.status(500).json({ ok: false, error: 'Erro interno.' });
    }
});

module.exports = router;
