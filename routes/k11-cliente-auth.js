/**
 * K11 OMNI ELITE — AUTH PORTAL DO CLIENTE v1.0
 * ════════════════════════════════════════════════
 * POST /api/auth/cliente/login     — email + senha
 * POST /api/auth/cliente/register  — cadastro
 * POST /api/auth/cliente/forgot    — recuperação de senha
 * POST /api/auth/cliente/reset     — redefine senha com token
 */
'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const path    = require('path');

// Reutiliza signJWT do módulo de auth principal
const { signJWT, verifyPin } = require(path.join(__dirname, '../middleware/server-auth.js'));
const datastore   = require('../services/datastore');
const logger      = require('../services/logger');

function getSupabase() { return datastore.supabase || null; }

// ── HASH DE SENHA (PBKDF2-SHA256) ────────────────────────────
const ITER = 310_000, KLEN = 32, DIG = 'sha256';

function _hash(senha) {
    const salt = crypto.randomBytes(32).toString('hex');
    const dk   = crypto.pbkdf2Sync(senha, salt, ITER, KLEN, DIG);
    return `pbkdf2$${salt}$${dk.toString('hex')}`;
}

function _verify(senha, stored) {
    try {
        const [, salt, exp] = stored.split('$');
        const dk  = crypto.pbkdf2Sync(senha, salt, ITER, KLEN, DIG);
        const buf = Buffer.from(exp, 'hex');
        return dk.length === buf.length && crypto.timingSafeEqual(dk, buf);
    } catch { return false; }
}

// ── POST /login ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { email, senha } = req.body || {};
    if (!email || !senha)
        return res.status(400).json({ ok: false, error: 'Email e senha obrigatórios.' });

    const sb = getSupabase();
    if (!sb) {
        // Modo demo: aceita qualquer credencial
        logger.warn('CLIENTE-AUTH', 'Supabase ausente — modo demo');
        const token = signJWT({ re: email, nome: email.split('@')[0], role: 'cliente' });
        return res.json({ ok: true, token, user: { nome: email.split('@')[0], role: 'cliente', email } });
    }

    // ── Atalho super: LDAP 8 dígitos + PIN → acessa o portal do cliente ──
    // Usuários com role=super podem usar LDAP+PIN no portal do cliente.
    // O token emitido terá role=super, dando acesso irrestrito.
    if (/^\d{8}$/.test(email.trim())) {
        try {
            const { data: superUser, error } = await sb
                .from('k11_users')
                .select('ldap, nome, role, pin_hash, ativo')
                .eq('ldap', email.trim())
                .eq('role', 'super')
                .single();

            if (!error && superUser && superUser.ativo) {
                if (verifyPin(senha, superUser.pin_hash || '')) {
                    const token = signJWT({ re: superUser.ldap, nome: superUser.nome, role: 'super' });
                    logger.info('CLIENTE-AUTH', `Super LDAP login no portal cliente: ${superUser.ldap}`);
                    return res.json({
                        ok: true, token,
                        user: { nome: superUser.nome, role: 'super', email: superUser.ldap }
                    });
                }
                // PIN errado mas LDAP existe como super — não revelar
                return res.status(401).json({ ok: false, error: 'LDAP ou senha incorretos.' });
            }
        } catch (_) {}
        // Se não encontrou como super, cai no fluxo normal de email
    }

    // ── Acesso universal: LDAP com role=super pode logar em qualquer portal ──
    // Aceita tanto o LDAP direto quanto o email interno (ldap@k11.internal)
    const isLdapFormat = /^\d{8}$/.test(email.trim()) || email.includes('@k11.internal');
    if (isLdapFormat) {
        const ldap = email.includes('@') ? email.split('@')[0].replace(/\D/g,'') : email.trim();
        try {
            const { data: superUser, error } = await sb
                .from('k11_users')
                .select('ldap, nome, role, pin_hash, ativo')
                .eq('ldap', ldap)
                .eq('role', 'super')
                .single();
            if (!error && superUser && superUser.ativo) {
                // Verifica senha via pin_hash do sistema principal
                if (_verify(senha, superUser.pin_hash || '')) {
                    const token = signJWT({ re: superUser.ldap, nome: superUser.nome, role: 'cliente' });
                    logger.info('CLIENTE-AUTH', `Super login via LDAP: \${superUser.ldap}`);
                    return res.json({ ok: true, token, user: { nome: superUser.nome, role: 'cliente', email: `\${superUser.ldap}@k11.internal` } });
                }
            }
        } catch (_) {}
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
            return res.status(401).json({ ok: false, error: 'Conta desativada. Contate o suporte.' });
        if (!_verify(senha, user.senha_hash))
            return res.status(401).json({ ok: false, error: 'Email ou senha incorretos.' });

        const token = signJWT({ re: user.email, nome: user.nome, role: 'cliente' });
        sb.from('k11_clientes').update({ ultimo_login: new Date().toISOString() }).eq('id', user.id).then(() => {}).catch(() => {});
        logger.info('CLIENTE-AUTH', `Login: ${user.email}`);
        return res.json({ ok: true, token, user: { nome: user.nome, role: 'cliente', email: user.email } });
    } catch (err) {
        logger.error('CLIENTE-AUTH', err.message);
        return res.status(500).json({ ok: false, error: 'Erro interno. Tente novamente.' });
    }
});

// ── POST /register ────────────────────────────────────────────
router.post('/register', async (req, res) => {
    const { nome, email, senha } = req.body || {};
    if (!nome || !email || !senha)
        return res.status(400).json({ ok: false, error: 'Nome, email e senha são obrigatórios.' });
    if (nome.trim().length < 3)
        return res.status(400).json({ ok: false, field: 'nome', error: 'Nome muito curto (mín. 3 caracteres).' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ ok: false, field: 'email', error: 'Email inválido.' });
    if (senha.length < 6)
        return res.status(400).json({ ok: false, field: 'senha', error: 'Senha: mínimo 6 caracteres.' });

    const sb = getSupabase();
    if (!sb) {
        const token = signJWT({ re: email, nome: nome.trim(), role: 'cliente' });
        return res.status(201).json({ ok: true, token, user: { nome: nome.trim(), role: 'cliente', email } });
    }

    try {
        const { data: existing } = await sb
            .from('k11_clientes').select('id').eq('email', email.toLowerCase().trim()).single();
        if (existing)
            return res.status(409).json({ ok: false, field: 'email', error: 'Este email já está cadastrado.' });

        const { data: novo, error } = await sb
            .from('k11_clientes')
            .insert({ nome: nome.trim(), email: email.toLowerCase().trim(), senha_hash: _hash(senha), ativo: true })
            .select('id, nome, email').single();
        if (error) throw error;

        const token = signJWT({ re: novo.email, nome: novo.nome, role: 'cliente' });
        logger.info('CLIENTE-AUTH', `Cadastro: ${novo.email}`);
        return res.status(201).json({ ok: true, token, user: { nome: novo.nome, role: 'cliente', email: novo.email } });
    } catch (err) {
        logger.error('CLIENTE-AUTH', err.message);
        return res.status(500).json({ ok: false, error: 'Erro ao cadastrar. Tente novamente.' });
    }
});

// ── POST /forgot ──────────────────────────────────────────────
router.post('/forgot', async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, error: 'Email obrigatório.' });

    const MSG = 'Se o email estiver cadastrado, você receberá as instruções em breve.';
    const sb  = getSupabase();
    if (!sb) return res.json({ ok: true, message: MSG });

    try {
        const { data: user } = await sb
            .from('k11_clientes').select('id, email').eq('email', email.toLowerCase().trim()).single();
        if (user) {
            const token     = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            await sb.from('k11_cliente_resets').upsert({ email: user.email, token, expires_at: expiresAt });
            logger.info('CLIENTE-AUTH', `Reset solicitado: ${user.email}`);
        }
        return res.json({ ok: true, message: MSG });
    } catch (err) {
        logger.error('CLIENTE-AUTH', err.message);
        return res.json({ ok: true, message: MSG }); // Sempre sucesso visível
    }
});

// ── POST /reset ───────────────────────────────────────────────
router.post('/reset', async (req, res) => {
    const { email, token, nova_senha } = req.body || {};
    if (!email || !token || !nova_senha)
        return res.status(400).json({ ok: false, error: 'Email, token e nova senha obrigatórios.' });
    if (nova_senha.length < 6)
        return res.status(400).json({ ok: false, error: 'Senha deve ter no mínimo 6 caracteres.' });

    const sb = getSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });

    try {
        const { data: reset } = await sb
            .from('k11_cliente_resets').select('*')
            .eq('email', email.toLowerCase().trim()).eq('token', token).single();

        if (!reset || new Date(reset.expires_at) < new Date())
            return res.status(400).json({ ok: false, error: 'Token inválido ou expirado.' });

        await sb.from('k11_clientes').update({ senha_hash: _hash(nova_senha), updated_at: new Date().toISOString() }).eq('email', email.toLowerCase().trim());
        await sb.from('k11_cliente_resets').delete().eq('email', email.toLowerCase().trim());
        logger.info('CLIENTE-AUTH', `Senha redefinida: ${email}`);
        return res.json({ ok: true, message: 'Senha redefinida com sucesso.' });
    } catch (err) {
        logger.error('CLIENTE-AUTH', err.message);
        return res.status(500).json({ ok: false, error: 'Erro interno.' });
    }
});

module.exports = router;
