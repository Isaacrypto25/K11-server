'use strict';

/**
 * K11 OMNI ELITE — Webhooks de Alertas
 * ══════════════════════════════════════
 * Envia alertas críticos via WhatsApp Business API e Microsoft Teams.
 * 
 * Variáveis de ambiente:
 *   WHATSAPP_TOKEN        → Bearer token do WhatsApp Business Cloud API
 *   WHATSAPP_PHONE_ID     → Phone Number ID do remetente
 *   WHATSAPP_TO           → Número(s) destino separados por vírgula (e.g. "5521999999999")
 *   TEAMS_WEBHOOK_URL     → Incoming Webhook URL do Teams (Settings > Connectors)
 *   SLACK_WEBHOOK_URL     → Slack Incoming Webhook URL
 *   ALERT_THRESHOLD_SCORE → Score mínimo para disparar alerta (default: 40)
 *
 * POST /api/webhooks/test        → testa todos os canais
 * POST /api/webhooks/alert       → envia alerta manual
 * GET  /api/webhooks/status      → status dos canais configurados
 */

const express   = require('express');
const router    = express.Router();
const https     = require('https');
const logger    = require('../services/logger');

// ── HELPERS HTTP ────────────────────────────────────────────────
function _post(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload  = JSON.stringify(body);
        const urlObj   = new URL(url);
        const options  = {
            hostname: urlObj.hostname,
            path:     urlObj.pathname + urlObj.search,
            method:   'POST',
            headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
            timeout:  8000,
        };
        const req = https.request(options, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end',  () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(payload);
        req.end();
    });
}

// ── WHATSAPP BUSINESS CLOUD API ──────────────────────────────────
async function sendWhatsApp(text, to = null) {
    const token   = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    if (!token || !phoneId) return { ok: false, error: 'WhatsApp não configurado' };

    const recipients = (to || process.env.WHATSAPP_TO || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!recipients.length) return { ok: false, error: 'WHATSAPP_TO não configurado' };

    const results = [];
    for (const number of recipients) {
        try {
            const res = await _post(
                `https://graph.facebook.com/v19.0/${phoneId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to:      number,
                    type:    'text',
                    text:    { body: text },
                },
                { Authorization: `Bearer ${token}` }
            );
            results.push({ number, status: res.status, ok: res.status === 200 });
        } catch (e) {
            results.push({ number, ok: false, error: e.message });
        }
    }
    const allOk = results.every(r => r.ok);
    return { ok: allOk, results };
}

// ── MICROSOFT TEAMS ──────────────────────────────────────────────
async function sendTeams(title, text, color = '#FF8C00', facts = []) {
    const url = process.env.TEAMS_WEBHOOK_URL;
    if (!url) return { ok: false, error: 'Teams não configurado' };

    try {
        const body = {
            '@type':    'MessageCard',
            '@context': 'http://schema.org/extensions',
            themeColor: color.replace('#', ''),
            summary:    title,
            sections:   [{
                activityTitle:   `**${title}**`,
                activityText:    text,
                facts:           facts.map(f => ({ name: f.label, value: f.value })),
                markdown:        true,
            }],
        };
        const res = await _post(url, body);
        return { ok: res.status === 200, status: res.status };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ── SLACK ────────────────────────────────────────────────────────
async function sendSlack(text, emoji = '🔔', color = '#FF8C00') {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) return { ok: false, error: 'Slack não configurado' };

    try {
        const body = {
            attachments: [{
                color,
                blocks: [
                    { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *K11 OMNI ELITE*\n${text}` } },
                    { type: 'context', elements: [{ type: 'mrkdwn', text: `_${new Date().toLocaleString('pt-BR')}_` }] },
                ],
            }],
        };
        const res = await _post(url, body);
        return { ok: res.status === 200, status: res.status };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ── DISPATCH: envia por todos os canais configurados ─────────────
async function dispatch(alert) {
    const threshold = parseInt(process.env.ALERT_THRESHOLD_SCORE || '40');
    const { type, message, severity, score, pdvName } = alert;

    // Só dispara para alertas acima do threshold de severidade
    const severityMap = { critical: 0, high: 25, medium: 60, low: 90 };
    if ((severityMap[severity] || 50) > threshold) return { skipped: true };

    const emoji = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : '🟡';
    const title = `${emoji} K11 OMNI — ${type?.toUpperCase() || 'ALERTA'}`;
    const text  = `${message}${pdvName ? `\nPDV: ${pdvName}` : ''}${score != null ? `\nScore: ${score}/100` : ''}`;
    const color = severity === 'critical' ? '#EF4444' : severity === 'high' ? '#F59E0B' : '#FF8C00';

    const results = await Promise.allSettled([
        sendWhatsApp(`${title}\n${text}`),
        sendTeams(title, text, color, [
            pdvName ? { label: 'PDV', value: pdvName } : null,
            score != null ? { label: 'Score', value: `${score}/100` } : null,
            { label: 'Horário', value: new Date().toLocaleString('pt-BR') },
        ].filter(Boolean)),
        sendSlack(text, emoji, color),
    ]);

    const channels = ['whatsapp', 'teams', 'slack'].map((ch, i) => ({
        channel: ch,
        ...( results[i].status === 'fulfilled' ? results[i].value : { ok: false, error: results[i].reason?.message }),
    }));

    logger.info('WEBHOOKS', `Alerta enviado: ${type}`, channels.map(c => `${c.channel}:${c.ok ? '✅' : '❌'}`).join(', '));
    return { channels };
}

// ── ROTAS ────────────────────────────────────────────────────────

// GET /api/webhooks/status
router.get('/status', (req, res) => {
    res.json({
        ok: true,
        channels: {
            whatsapp: { configured: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TO) },
            teams:    { configured: !!process.env.TEAMS_WEBHOOK_URL },
            slack:    { configured: !!process.env.SLACK_WEBHOOK_URL },
        },
        threshold: parseInt(process.env.ALERT_THRESHOLD_SCORE || '40'),
    });
});

// POST /api/webhooks/test
router.post('/test', async (req, res) => {
    const result = await dispatch({
        type:     'test',
        message:  '✅ Teste de conectividade K11 OMNI ELITE — canais de alerta funcionando.',
        severity: 'high',
        pdvName:  'PDV de Teste',
        score:    75,
    });
    res.json({ ok: true, result });
});

// POST /api/webhooks/alert
router.post('/alert', async (req, res) => {
    const { type, message, severity, pdvName, score } = req.body;
    if (!message) return res.status(400).json({ ok: false, error: 'message obrigatório' });
    const result = await dispatch({ type: type || 'manual', message, severity: severity || 'high', pdvName, score });
    res.json({ ok: true, result });
});

module.exports = { router, dispatch, sendWhatsApp, sendTeams, sendSlack };
