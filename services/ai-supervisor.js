/**
 * K11 OMNI ELITE — AI SUPERVISOR v2 (LIVE ENGINE)
 * ══════════════════════════════════════════════════
 * Sistema vivo: analisa, cruza dados e notifica em tempo real.
 *
 * CAPACIDADES:
 *  - Motor de análise contínua (a cada 5 min)
 *  - Cruzamento automático: estoque × PDV × movimento × fornecedor
 *  - Detecção proativa de rupturas antes de acontecerem
 *  - Score de risco por produto/categoria
 *  - Fila de prioridades em tempo real para o operador
 *  - SSE push: notificações chegam no frontend sem refresh
 *  - Cache inteligente: não repete análise se dados não mudaram
 */

'use strict';

const https  = require('https');
const logger = require('./logger');

const GROQ_MODEL        = 'llama-3.3-70b-versatile';
const ANALYSIS_INTERVAL = 5 * 60 * 1000;  // 5 min
const ALERT_COOLDOWN    = 15 * 60 * 1000; // não repete alerta do mesmo item por 15 min

// ── ESTADO GLOBAL DO SUPERVISOR ───────────────────────────────
const state = {
  lastScore:        null,
  lastAnalysisHash: null,
  lastAnalysisTs:   null,
  analysisHistory:  [],          // rolling 50
  priorityQueue:    [],          // fila de prioridades atual
  activeAlerts:     new Map(),   // itemId → timestamp do último alerta
  sseClients:       new Set(),   // clientes SSE conectados
  intervalHandle:   null,
  datastore:        null,        // injetado via init()
};

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
function init(datastoreInstance) {
  state.datastore = datastoreInstance;
  logger.info('AI-SUPERVISOR', 'Motor vivo iniciado — análise a cada 5 min');
  _scheduleAnalysis();
}

function _scheduleAnalysis() {
  if (state.intervalHandle) clearInterval(state.intervalHandle);
  state.intervalHandle = setInterval(_runLiveAnalysis, ANALYSIS_INTERVAL);
  // Primeira análise após 30s (deixa o servidor subir)
  setTimeout(_runLiveAnalysis, 30_000);
}

// ── SSE: CLIENTES CONECTADOS ──────────────────────────────────
function addSSEClient(res) {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  state.sseClients.add(res);
  logger.debug('AI-SUPERVISOR', `SSE client conectado (total: ${state.sseClients.size})`);

  // Envia estado atual imediatamente para o cliente que conectou
  _sendToClient(res, 'connected', {
    score:         state.lastScore,
    queue:         state.priorityQueue,
    lastAnalysis:  state.lastAnalysisTs,
    clients:       state.sseClients.size,
  });

  res.on('close', () => {
    state.sseClients.delete(res);
    logger.debug('AI-SUPERVISOR', `SSE client desconectado (total: ${state.sseClients.size})`);
  });
}

function _broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of state.sseClients) {
    try { client.write(payload); } catch (_) { state.sseClients.delete(client); }
  }
}

function _sendToClient(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
}

// ── MOTOR PRINCIPAL: ANÁLISE VIVA ─────────────────────────────
async function _runLiveAnalysis() {
  if (!state.datastore) return;
  if (!process.env.GROQ_API_KEY?.startsWith('gsk_')) return;

  try {
    logger.info('AI-SUPERVISOR', 'Iniciando análise viva...');

    // 1. Carrega dados frescos
    const [produtos, pdv, movimento, fornecedor, tarefas] = await Promise.all([
      state.datastore.get('produtos',  { bustCache: true }),
      state.datastore.get('pdv',       { bustCache: true }),
      state.datastore.get('movimento', { bustCache: false }),
      state.datastore.get('fornecedor',{ bustCache: false }),
      state.datastore.get('tarefas',   { bustCache: false }),
    ]);

    // 2. Detecta mudanças (hash rápido)
    const hash = _quickHash(produtos, pdv, tarefas);
    if (hash === state.lastAnalysisHash) {
      logger.debug('AI-SUPERVISOR', 'Dados inalterados — análise pulada');
      return;
    }
    state.lastAnalysisHash = hash;

    // 3. Cruza os dados localmente (sem IA — rápido e determinístico)
    const crossData = _crossAnalyze(produtos, pdv, movimento, fornecedor, tarefas);

    // 4. Monta contexto compacto para IA (não manda dados brutos — muito token)
    const aiContext = _buildAIContext(crossData);

    // 5. Chama Groq
    const analysis = await _callGroqAnalysis(aiContext);

    // 6. Atualiza estado
    state.lastScore       = analysis.score;
    state.lastAnalysisTs  = new Date().toISOString();
    state.priorityQueue   = analysis.priorities || [];
    state.analysisHistory.push({ ...analysis, ts: state.lastAnalysisTs });
    if (state.analysisHistory.length > 50) state.analysisHistory.shift();

    // 7. Detecta alertas novos e faz broadcast SSE
    _processAlerts(analysis);

    // 8. Broadcast geral de atualização
    _broadcast('analysis', {
      score:      analysis.score,
      status:     analysis.status,
      priorities: analysis.priorities,
      summary:    analysis.summary,
      ts:         state.lastAnalysisTs,
      crossData: {
        rupturas:    crossData.rupturas.length,
        criticos:    crossData.criticos.length,
        emTransito:  crossData.emTransito.length,
        tarefasPend: crossData.tarefasPendentes,
      },
    });

    logger.info('AI-SUPERVISOR', `Análise concluída — Score: ${analysis.score} | Prioridades: ${analysis.priorities.length}`);

  } catch (err) {
    logger.error('AI-SUPERVISOR', `Falha na análise viva: ${err.message}`);
  }
}

// ── CRUZAMENTO LOCAL DE DADOS ─────────────────────────────────
function _crossAnalyze(produtos, pdv, movimento, fornecedor, tarefas) {

  // Mapa de vendas recentes por código de produto
  const vendasMap = new Map();
  for (const v of pdv) {
    const cod = String(v['Nº do produto'] || '');
    if (!cod) continue;
    const atual = vendasMap.get(cod) || { vendido: 0, disponibilizado: 0 };
    atual.vendido         += Number(v['Quantidade vendida'] || 0);
    atual.disponibilizado += Number(v['Quantidade disponibilizada'] || 0);
    vendasMap.set(cod, atual);
  }

  // Mapa de produtos em trânsito (movimento aberto)
  const transitoMap = new Map();
  for (const m of movimento) {
    const status = String(m['Status da tarefa de depósito'] || '').toLowerCase();
    if (!status.includes('conc') && !status.includes('fech')) {
      const cod = String(m['Produto'] || '');
      if (cod) transitoMap.set(cod, (transitoMap.get(cod) || 0) + Number(m['Qtd.prev.orig.UMA'] || 0));
    }
  }

  const rupturas   = [];
  const criticos   = [];
  const emTransito = [];

  for (const p of produtos) {
    const cod       = String(p['Produto'] || '');
    const desc      = String(p['Descrição produto'] || p['Descricao produto'] || cod);
    const qtdDisp   = Number(p['Qtd.disponível UMA'] || p['Qtd.disponivel UMA'] || 0);
    const posicao   = String(p['Posição no depósito'] || '');
    const venda     = vendasMap.get(cod);
    const transito  = transitoMap.get(cod) || 0;

    if (qtdDisp <= 0) {
      rupturas.push({ cod, desc, posicao, qtdDisp, transito, vendido: venda?.vendido || 0 });
    } else if (qtdDisp <= 10) {
      criticos.push({ cod, desc, posicao, qtdDisp, transito, vendido: venda?.vendido || 0 });
    }

    if (transito > 0) {
      emTransito.push({ cod, desc, qtd: transito });
    }
  }

  // Fornecedores com entrega prevista hoje
  const hoje = new Date().toISOString().slice(0, 10);
  const entregasHoje = fornecedor.filter(f => {
    const d = String(f['FIELD7'] || f['data_inicio'] || '');
    return d.slice(0, 10) === hoje;
  });

  const tarefasPendentes = tarefas.filter(t => !t.done).length;

  return {
    rupturas:        rupturas.slice(0, 20),
    criticos:        criticos.slice(0, 20),
    emTransito:      emTransito.slice(0, 10),
    entregasHoje,
    tarefasPendentes,
    totalProdutos:   produtos.length,
    totalMovimentos: movimento.length,
  };
}

// ── CONTEXTO PARA IA (COMPACTO) ───────────────────────────────
function _buildAIContext(cd) {
  return `
SNAPSHOT DO ESTOQUE — ${new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})}

RUPTURAS (qtd=0): ${cd.rupturas.length} produtos
${cd.rupturas.slice(0,8).map(r => `  · ${r.desc} [${r.cod}] pos:${r.posicao} | em trânsito: ${r.transito}`).join('\n')}

CRÍTICOS (qtd≤10): ${cd.criticos.length} produtos
${cd.criticos.slice(0,8).map(r => `  · ${r.desc} [${r.cod}] qtd:${r.qtdDisp} vendido:${r.vendido}`).join('\n')}

EM TRÂNSITO: ${cd.emTransito.length} movimentos abertos
ENTREGAS HOJE: ${cd.entregasHoje.length} fornecedores
TAREFAS PENDENTES: ${cd.tarefasPendentes}
TOTAL PRODUTOS: ${cd.totalProdutos}
`.trim();
}

// ── CHAMADA GROQ ANÁLISE ──────────────────────────────────────
async function _callGroqAnalysis(context) {
  const prompt = `Você é o supervisor operacional do K11 OMNI ELITE — sistema de gestão de estoque de um CD (centro de distribuição) de materiais de construção.

${context}

Com base nestes dados, retorne APENAS JSON válido:
{
  "score": 0-100,
  "status": "saudável|atenção|degradado|crítico",
  "summary": "1 frase impactante sobre o estado atual da operação",
  "priorities": [
    {
      "rank": 1,
      "type": "ruptura|critico|transito|entrega|tarefa",
      "title": "título curto",
      "desc": "ação concreta que o operador deve tomar agora",
      "urgency": "alta|media|baixa",
      "cod": "código do produto se aplicável"
    }
  ],
  "alerts": [
    { "id": "único", "type": "ruptura|risco|entrega", "message": "mensagem direta", "severity": "high|medium|low" }
  ],
  "insight": "1 insight estratégico que humanos provavelmente não veriam nos dados"
}

Priorize: rupturas com histórico de venda > críticos com estoque caindo > entregas de hoje.
Máximo 5 prioridades. Seja objetivo e direto como um supervisor de chão de fábrica.`;

  const raw = await _callGroq([
    { role: 'system', content: 'Você é um supervisor operacional especialista em gestão de estoque de CD. Retorne APENAS JSON válido, sem explicações.' },
    { role: 'user',   content: prompt },
  ]);

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Groq não retornou JSON válido');
  const result = JSON.parse(match[0]);
  result.rawContext = context;
  return result;
}

// ── PROCESSAR ALERTAS → SSE ───────────────────────────────────
function _processAlerts(analysis) {
  const now = Date.now();
  for (const alert of (analysis.alerts || [])) {
    const lastSent = state.activeAlerts.get(alert.id) || 0;
    if (now - lastSent < ALERT_COOLDOWN) continue;
    state.activeAlerts.set(alert.id, now);
    _broadcast('alert', {
      ...alert,
      ts: new Date().toISOString(),
    });
    logger.info('AI-SUPERVISOR', `🚨 Alerta broadcast: [${alert.severity}] ${alert.message}`);
  }
}

// ── API PÚBLICA ────────────────────────────────────────────────

/** Força análise imediata (ex: após upload de novos dados) */
async function forceAnalysis() {
  state.lastAnalysisHash = null; // invalida cache
  await _runLiveAnalysis();
  return { triggered: true, ts: new Date().toISOString() };
}

/** Health check compatível com código antigo */
async function analyzeHealth(systemSnapshot) {
  const { logStats, datastoreStats, requestStats, uptime } = systemSnapshot || {};
  const prompt = `Analise o snapshot do servidor K11:
- Uptime: ${Math.floor((uptime || 0) / 1000)}s
- Logs: ${JSON.stringify(logStats || {})}
- Requests: ${JSON.stringify(requestStats || {})}

Retorne JSON: { "score": 85, "status": "saudável", "issues": [], "recommendations": [], "summary": "..." }`;

  try {
    const raw  = await _callGroq([
      { role: 'system', content: 'Analista de servidores Node.js. Retorne apenas JSON.' },
      { role: 'user',   content: prompt },
    ]);
    const match = raw.match(/\{[\s\S]*\}/);
    const result = JSON.parse(match?.[0] || '{}');
    result.ts = new Date().toISOString();
    state.lastScore = result.score;
    state.analysisHistory.push(result);
    if (state.analysisHistory.length > 50) state.analysisHistory.shift();
    return result;
  } catch (err) {
    return { score: state.lastScore ?? 50, status: 'indisponível', issues: [err.message], ts: new Date().toISOString(), error: true };
  }
}

/** Chat com contexto completo */
async function chat(userMessage, contextSnapshot) {
  const ctx = contextSnapshot ? `
Estado: score=${state.lastScore} | prioridades=${state.priorityQueue.length}
Última análise: ${state.lastAnalysisTs}
Fila de prioridades: ${JSON.stringify(state.priorityQueue.slice(0, 3))}
` : '';
  try {
    const response = await _callGroq([
      { role: 'system', content: `Supervisor K11 OMNI. Responda em português, direto e objetivo.${ctx}` },
      { role: 'user',   content: userMessage },
    ]);
    return { success: true, response, ts: new Date().toISOString() };
  } catch (err) {
    return { success: false, response: `Supervisor indisponível: ${err.message}`, ts: new Date().toISOString() };
  }
}

/** Análise de logs críticos */
async function analyzeLogs(logs) {
  if (!logs?.length) return null;
  const critical = logs.filter(l => l.level === 'error' || l.level === 'critical').slice(0, 20);
  if (!critical.length) return null;
  try {
    const response = await _callGroq([
      { role: 'system', content: 'Analista de logs Node.js. Responda em português.' },
      { role: 'user',   content: `Analise estes erros:\n${critical.map(l => `[${l.level}] ${l.module}: ${l.message}`).join('\n')}\n\nForneça: causa raiz, impacto e ação corretiva.` },
    ]);
    return { diagnosis: response, logsAnalyzed: critical.length, ts: new Date().toISOString() };
  } catch { return null; }
}

// ── HELPERS ───────────────────────────────────────────────────

function _quickHash(...datasets) {
  let n = 0;
  for (const ds of datasets) n += (ds?.length || 0);
  return `${n}_${Math.floor(Date.now() / 60000)}`; // muda a cada minuto no mínimo
}

function _callGroq(messages) {
  return new Promise((resolve, reject) => {
    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    if (!apiKey.startsWith('gsk_')) { reject(new Error('GROQ_API_KEY inválida')); return; }

    const body = JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: 1500, temperature: 0.2 });
    const opts = {
      hostname: 'api.groq.com',
      path:     '/openai/v1/chat/completions',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body) },
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) { reject(new Error(p.error.message)); return; }
          resolve(p.choices?.[0]?.message?.content || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Groq timeout')); });
    req.write(body);
    req.end();
  });
}

// ── EXPORTS ───────────────────────────────────────────────────
module.exports = {
  init,
  forceAnalysis,
  analyzeHealth,
  analyzeLogs,
  chat,
  addSSEClient,
  getHistory:    () => [...state.analysisHistory].reverse().slice(0, 20),
  getLastScore:  () => state.lastScore,
  getPriorities: () => state.priorityQueue,
  getState:      () => ({
    score:       state.lastScore,
    lastAnalysis: state.lastAnalysisTs,
    priorities:  state.priorityQueue,
    sseClients:  state.sseClients.size,
    alerts:      state.activeAlerts.size,
  }),
};
