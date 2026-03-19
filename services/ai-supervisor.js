'use strict';

/**
 * K11 OMNI ELITE — AI Supervisor Service (interno)
 * Usa Groq (fallback para análise simples) para avaliar saúde do servidor
 * Expõe: analyzeHealth(snapshot) → { score, status, recommendations }
 */

let _groq = null;

function _getGroq() {
    if (_groq) return _groq;
    const key = process.env.GROQ_API_KEY;
    if (!key?.startsWith('gsk_')) return null;
    try {
        const Groq = require('groq-sdk');
        _groq = new Groq({ apiKey: key });
        return _groq;
    } catch (_) {
        return null;
    }
}

/**
 * Analisa saúde do servidor
 * @param {object} snapshot - { uptime, logStats, datastoreStats, requestStats }
 * @returns {{ score: number, status: string, recommendations: string[] }}
 */
async function analyzeHealth(snapshot) {
    const groq = _getGroq();

    // Análise local como fallback
    let score = 100;
    const recommendations = [];

    const errors = snapshot?.logStats?.error   || 0;
    const crits  = snapshot?.logStats?.critical || 0;
    const total  = snapshot?.logStats?.total    || 1;

    const errorRate = (errors + crits * 2) / total;

    if (errorRate > 0.1)  { score -= 30; recommendations.push('Taxa de erros elevada. Verifique os logs críticos.'); }
    if (errors > 50)      { score -= 20; recommendations.push(`${errors} erros registrados. Investigue as causas.`); }
    if (crits > 0)        { score -= 40; recommendations.push(`${crits} erros críticos detectados. Ação imediata recomendada.`); }
    if (snapshot?.uptime < 60000) { score -= 10; recommendations.push('Servidor reiniciado recentemente.'); }

    score = Math.max(0, Math.min(100, score));

    if (!groq) {
        return {
            score,
            status: score >= 80 ? 'healthy' : score >= 60 ? 'degraded' : 'critical',
            recommendations: recommendations.length ? recommendations : ['Sistema operando normalmente.'],
            source: 'local',
        };
    }

    try {
        const prompt = `Você é o supervisor de IA do K11 OMNI ELITE.
Analise este snapshot de saúde do servidor e retorne JSON:
${JSON.stringify(snapshot, null, 2)}

Retorne APENAS JSON: { "score": 0-100, "status": "healthy|degraded|critical", "recommendations": ["..."] }`;

        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
            temperature: 0.3,
        });

        const text = completion.choices[0]?.message?.content || '{}';
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            return { ...parsed, source: 'groq' };
        }
    } catch (_) {}

    return { score, status: score >= 80 ? 'healthy' : score >= 60 ? 'degraded' : 'critical', recommendations, source: 'local' };
}

module.exports = { analyzeHealth };
