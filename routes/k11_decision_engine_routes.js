'use strict';

/**
 * K11 OMNI ELITE — Decision Engine (rotas HTTP)
 * Camada fina que liga os endpoints documentados no cabeçalho do server.js
 * às funções já implementadas em ./k11_decision_engine.js (que não é um Router).
 */

const express        = require('express');
const router         = express.Router();
const decisionEngine = require('./k11_decision_engine');

// GET /api/decision/stream — SSE: ciclos de decisão
router.get('/stream', (req, res) => {
  decisionEngine.addSSEClient(res);
});

// GET /api/decision/state — snapshot JSON atual
router.get('/state', (req, res) => {
  res.json(decisionEngine.getState());
});

// GET /api/decision/health/:pdvId — health score de um PDV
router.get('/health/:pdvId', (req, res) => {
  const score = decisionEngine.getHealthScore(req.params.pdvId);
  if (!score) {
    return res.status(404).json({ error: `Nenhum health score calculado ainda para o PDV ${req.params.pdvId}.` });
  }
  res.json(score);
});

// GET /api/decision/forecast/:prodId — forecast de demanda por produto
router.get('/forecast/:prodId', (req, res) => {
  const forecast = decisionEngine.getForecast(req.params.prodId);
  if (!forecast) {
    return res.status(404).json({ error: `Nenhum forecast calculado ainda para o produto ${req.params.prodId}.` });
  }
  res.json(forecast);
});

// POST /api/decision/run-cycle — força ciclo completo
router.post('/run-cycle', async (req, res) => {
  try {
    await decisionEngine.runFullCycle();
    res.json({ ok: true, state: decisionEngine.getState() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
