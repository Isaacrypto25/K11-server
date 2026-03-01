/**
 * K11 OMNI ELITE — REGISTER ROUTES (Railway)
 * ════════════════════════════════════════════
 * Rotas de auto-cadastro com validação Obramax + email de confirmação.
 *
 * ── VARIÁVEL DE AMBIENTE NECESSÁRIA (Railway Variables) ───────
 *   RESEND_API_KEY  → re_xxxxxxxxxxxx  (console.resend.com)
 *
 * ── COMO INTEGRAR NO SEU server.js ───────────────────────────
 *   const register = require('./server-register');
 *   app.post('/api/auth/register',       register.registerHandler);
 *   app.post('/api/auth/confirm-pin',    register.confirmPinHandler);
 *   app.post('/api/auth/resend-pin',     register.resendPinHandler);
 *
 * Depende de: server-auth.js (para signJWT e hashPin/verifyPin)
 */

'use strict';

const crypto = require('crypto');
const https  = require('https');
const { createClient } = require('@supabase/supabase-js');
const { signJWT, hashPin } = require('./server-auth');

// ── Supabase ──────────────────────────────────────────────────
let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
    );
    return _supabase;
}

// ═══════════════════════════════════════════════════════════
// VALIDAÇÕES — regras de negócio Obramax
// ═══════════════════════════════════════════════════════════

function validateLdap(ldap) {
    const s = String(ldap || '').trim();
    if (!/^\d{8}$/.test(s))         return 'LDAP deve ter exatamente 8 dígitos.';
    if (!s.startsWith('7300'))       return 'LDAP deve começar com 7300.';
    return null;
}

function validateEmail(email, nome) {
    const s = String(email || '').trim().toLowerCase();
    if (!s.endsWith('@obramax.com'))  return 'Email deve ser @obramax.com.';
    const local = s.split('@')[0];
    if (!local)                       return 'Email inválido.';
    // Primeira letra do email deve ser a primeira letra do primeiro nome
    const primeiraLetraNome  = String(nome || '').trim().toLowerCase()[0];
    const primeiraLetraEmail = local[0];
    if (!primeiraLetraNome)           return 'Informe o nome antes do email.';
    if (primeiraLetraEmail !== primeiraLetraNome)
        return `Email deve começar com a inicial do seu nome (${primeiraLetraNome}...).`;
    return null;
}

function validatePassword(senha) {
    if (!senha || senha.length < 6)   return 'Senha deve ter pelo menos 6 caracteres.';
    return null;
}

function validateNome(nome) {
    const s = String(nome || '').trim();
    if (s.split(' ').filter(Boolean).length < 2)
        return 'Informe nome e sobrenome.';
    return null;
}

// ═══════════════════════════════════════════════════════════
// EMAIL via Resend API
// ═══════════════════════════════════════════════════════════

function sendConfirmationEmail(email, nome, pin) {
    return new Promise((resolve, reject) => {
        const primeiroNome = nome.split(' ')[0];
        const body = JSON.stringify({
            from:    'K11 OMNI <noreply@obramax.com>',
            to:      [email],
            subject: `${pin} é seu código de confirmação — K11 OMNI`,
            html: `
<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#090A0F;font-family:'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="420" cellpadding="0" cellspacing="0"
             style="background:#14171F;border-radius:16px;border:1px solid #2D3748;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#FF8C00,#E06000);padding:28px 32px;">
            <div style="font-size:11px;font-weight:800;letter-spacing:3px;color:#000;text-transform:uppercase;">
              K11 OMNI ELITE
            </div>
            <div style="font-size:22px;font-weight:900;color:#000;margin-top:4px;">
              Confirme seu cadastro
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="color:#9CA3AF;font-size:14px;margin:0 0 8px;">
              Olá, <strong style="color:#F3F4F6;">${primeiroNome}</strong>
            </p>
            <p style="color:#9CA3AF;font-size:14px;margin:0 0 28px;line-height:1.6;">
              Use o código abaixo para confirmar seu cadastro no K11 OMNI.
              Ele expira em <strong style="color:#F3F4F6;">15 minutos</strong>.
            </p>
            <!-- PIN Box -->
            <div style="background:#090A0F;border:2px solid #FF8C00;border-radius:12px;
                        padding:24px;text-align:center;margin-bottom:28px;">
              <div style="font-size:11px;letter-spacing:3px;color:#9CA3AF;margin-bottom:8px;">
                CÓDIGO DE CONFIRMAÇÃO
              </div>
              <div style="font-size:42px;font-weight:900;letter-spacing:12px;
                          color:#FF8C00;font-family:monospace;">
                ${pin}
              </div>
            </div>
            <p style="color:#6B7280;font-size:12px;margin:0;line-height:1.6;">
              Se você não solicitou este cadastro, ignore este email.<br>
              Nenhuma ação é necessária.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #2D3748;">
            <p style="color:#4B5563;font-size:11px;margin:0;text-align:center;">
              K11 OMNI ELITE · Obramax · Duque de Caxias, RJ
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
        });

        const options = {
            hostname: 'api.resend.com',
            path:     '/emails',
            method:   'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type':  'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(true);
                } else {
                    console.error('[RESEND] Erro:', res.statusCode, data);
                    reject(new Error(`Resend HTTP ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ═══════════════════════════════════════════════════════════
// ROTA: POST /api/auth/register
// Etapa 1 — valida dados, salva pendente, envia email
// ═══════════════════════════════════════════════════════════

async function registerHandler(req, res) {
    const { ldap, nome, email, senha } = req.body || {};

    // Validações
    const erroLdap  = validateLdap(ldap);
    if (erroLdap)  return res.status(400).json({ ok: false, field: 'ldap',  error: erroLdap });

    const erroNome  = validateNome(nome);
    if (erroNome)  return res.status(400).json({ ok: false, field: 'nome',  error: erroNome });

    const erroEmail = validateEmail(email, nome);
    if (erroEmail) return res.status(400).json({ ok: false, field: 'email', error: erroEmail });

    const erroSenha = validatePassword(senha);
    if (erroSenha) return res.status(400).json({ ok: false, field: 'senha', error: erroSenha });

    const supabase = getSupabase();

    try {
        // Verifica se LDAP já existe em k11_users
        const { data: existe } = await supabase
            .from('k11_users')
            .select('ldap')
            .eq('ldap', ldap.trim())
            .maybeSingle();

        if (existe) {
            return res.status(409).json({ ok: false, field: 'ldap', error: 'LDAP já cadastrado.' });
        }

        // Verifica email já existe
        const { data: emailExiste } = await supabase
            .from('k11_users')
            .select('email')
            .eq('email', email.trim().toLowerCase())
            .maybeSingle();

        if (emailExiste) {
            return res.status(409).json({ ok: false, field: 'email', error: 'Email já cadastrado.' });
        }

        // Limpa registros pendentes antigos do mesmo LDAP/email
        await supabase
            .from('pending_registrations')
            .delete()
            .or(`ldap.eq.${ldap.trim()},email.eq.${email.trim().toLowerCase()}`);

        // Gera PIN de 6 dígitos
        const confirmPin = String(crypto.randomInt(100000, 999999));

        // Hash da senha
        const pin_hash = hashPin(senha);

        // Salva registro pendente (expira em 15 min)
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const { error: insertError } = await supabase
            .from('pending_registrations')
            .insert({
                ldap:        ldap.trim(),
                nome:        nome.trim(),
                email:       email.trim().toLowerCase(),
                pin_hash,
                confirm_pin: confirmPin,
                expires_at:  expiresAt,
            });

        if (insertError) throw new Error(insertError.message);

        // Envia email
        await sendConfirmationEmail(email.trim(), nome.trim(), confirmPin);

        // Registra no audit_log
        supabase.from('audit_log').insert({
            action: 'REGISTER_REQUESTED',
            meta:   { ldap: ldap.trim(), email: email.trim().toLowerCase() },
            ip:     req.ip || 'desconhecido',
        }).then(() => {}).catch(() => {});

        return res.json({
            ok:    true,
            email: email.trim().toLowerCase(),
            msg:   'Código enviado para seu email. Válido por 15 minutos.',
        });

    } catch (err) {
        console.error('[REGISTER]', err.message);

        if (err.message?.includes('Resend')) {
            return res.status(502).json({ ok: false, error: 'Falha ao enviar email. Verifique o endereço.' });
        }

        return res.status(500).json({ ok: false, error: 'Erro interno. Tente novamente.' });
    }
}

// ═══════════════════════════════════════════════════════════
// ROTA: POST /api/auth/confirm-pin
// Etapa 2 — valida PIN, cria usuário, retorna JWT
// ═══════════════════════════════════════════════════════════

async function confirmPinHandler(req, res) {
    const { ldap, pin } = req.body || {};

    if (!ldap || !pin) {
        return res.status(400).json({ ok: false, error: 'LDAP e PIN são obrigatórios.' });
    }

    const supabase = getSupabase();

    try {
        const { data: pending, error } = await supabase
            .from('pending_registrations')
            .select('*')
            .eq('ldap', String(ldap).trim())
            .maybeSingle();

        if (error || !pending) {
            return res.status(404).json({ ok: false, error: 'Cadastro não encontrado. Refaça o registro.' });
        }

        // Verifica expiração
        if (new Date(pending.expires_at) < new Date()) {
            await supabase.from('pending_registrations').delete().eq('ldap', pending.ldap);
            return res.status(410).json({ ok: false, error: 'Código expirado. Faça um novo cadastro.' });
        }

        // Limite de tentativas
        if (pending.tentativas >= 5) {
            await supabase.from('pending_registrations').delete().eq('ldap', pending.ldap);
            return res.status(429).json({ ok: false, error: 'Muitas tentativas. Faça um novo cadastro.' });
        }

        // Valida PIN
        if (String(pin).trim() !== String(pending.confirm_pin)) {
            // Incrementa tentativas
            await supabase
                .from('pending_registrations')
                .update({ tentativas: pending.tentativas + 1 })
                .eq('ldap', pending.ldap);

            const restantes = 4 - pending.tentativas;
            return res.status(401).json({
                ok:    false,
                error: `Código incorreto. ${restantes} tentativa(s) restante(s).`,
            });
        }

        // PIN correto — cria usuário em k11_users
        const { error: createError } = await supabase
            .from('k11_users')
            .insert({
                ldap:         pending.ldap,
                nome:         pending.nome,
                email:        pending.email,
                pin_hash:     pending.pin_hash,
                role:         'op',
                ativo:        true,
                ultimo_login: new Date().toISOString(),
            });

        if (createError) throw new Error(createError.message);

        // Remove registro pendente
        await supabase.from('pending_registrations').delete().eq('ldap', pending.ldap);

        // Gera JWT
        const token = signJWT({
            re:   pending.ldap,
            nome: pending.nome,
            role: 'op',
        });

        // Audit log
        supabase.from('audit_log').insert({
            re:     pending.ldap,
            role:   'op',
            action: 'REGISTER_CONFIRMED',
            ip:     req.ip || 'desconhecido',
            meta:   { email: pending.email },
        }).then(() => {}).catch(() => {});

        return res.json({
            ok:    true,
            token,
            user: {
                nome: pending.nome,
                role: 'op',
            },
            msg: 'Cadastro confirmado! Bem-vindo ao K11 OMNI.',
        });

    } catch (err) {
        console.error('[CONFIRM-PIN]', err.message);
        return res.status(500).json({ ok: false, error: 'Erro interno. Tente novamente.' });
    }
}

// ═══════════════════════════════════════════════════════════
// ROTA: POST /api/auth/resend-pin
// Reenvia PIN para o mesmo email (throttle: 1 min)
// ═══════════════════════════════════════════════════════════

async function resendPinHandler(req, res) {
    const { ldap } = req.body || {};
    if (!ldap) return res.status(400).json({ ok: false, error: 'LDAP obrigatório.' });

    const supabase = getSupabase();

    const { data: pending } = await supabase
        .from('pending_registrations')
        .select('*')
        .eq('ldap', String(ldap).trim())
        .maybeSingle();

    if (!pending) {
        return res.status(404).json({ ok: false, error: 'Cadastro não encontrado.' });
    }

    // Throttle: não reenvia se foi criado há menos de 1 minuto
    const criado = new Date(pending.criado_em);
    if (Date.now() - criado.getTime() < 60_000) {
        return res.status(429).json({ ok: false, error: 'Aguarde 1 minuto para reenviar.' });
    }

    // Gera novo PIN e atualiza
    const newPin    = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabase
        .from('pending_registrations')
        .update({ confirm_pin: newPin, expires_at: expiresAt, tentativas: 0, criado_em: new Date().toISOString() })
        .eq('ldap', pending.ldap);

    try {
        await sendConfirmationEmail(pending.email, pending.nome, newPin);
        return res.json({ ok: true, msg: 'Novo código enviado.' });
    } catch {
        return res.status(502).json({ ok: false, error: 'Falha ao enviar email.' });
    }
}

module.exports = { registerHandler, confirmPinHandler, resendPinHandler };
