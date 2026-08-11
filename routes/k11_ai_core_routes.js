'use strict';

/**
 * K11 OMNI ELITE — AI Core v3 (rotas HTTP)
 * Camada fina que liga os endpoints documentados no cabeçalho do server.js
 * às funções já implementadas em ./k11_ai_core.js (que não é um Router).
 */

const express = require('express');
const router  = express.Router();
const aiCore  = require('./k11_ai_core');

// POST /api/ai/v3/chat — chat com memória + CoT
router.post('/v3/chat', async (req, res) => {
  try {
    const { message, pdvId, userId, pdvData, mode } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: 'Campo "message" é obrigatório.' });
    }
    const result = await aiCore.chat(message, { pdvId, userId, pdvData, mode });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/v3/strategy — estratégia completa por PDV
router.post('/v3/strategy', async (req, res) => {
  try {
    const { pdvData, depth } = req.body || {};
    if (!pdvData) {
      return res.status(400).json({ error: 'Campo "pdvData" é obrigatório.' });
    }
    const result = await aiCore.generateStrategy(pdvData, { depth });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/v3/anomaly — análise de anomalia pontual
router.post('/v3/anomaly', async (req, res) => {
  try {
    const { pdvId, pdvName, metric, currentValue, expectedValue, unit } = req.body || {};
    if (!pdvId || !metric || currentValue === undefined || expectedValue === undefined) {
      return res.status(400).json({
        error: 'Campos obrigatórios: pdvId, metric, currentValue, expectedValue.',
      });
    }
    const result = await aiCore.analyzeAnomaly(pdvId, pdvName, metric, currentValue, expectedValue, unit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/v3/stream — SSE: alertas proativos em tempo real
router.get('/v3/stream', (req, res) => {
  aiCore.addSSEClient(res);
});

// GET /api/ai/v3/proactive — fila de alertas proativos
router.get('/v3/proactive', (req, res) => {
  res.json({ alerts: aiCore.getProactiveAlerts() });
});

// GET /api/ai/v3/memory/:pdvId — memória acumulada de um PDV
router.get('/v3/memory/:pdvId', async (req, res) => {
  try {
    const memory = await aiCore.loadMemoryAsync(req.params.pdvId);
    res.json({ pdvId: req.params.pdvId, memory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
