'use strict';

/**
 * K11 OMNI ELITE — PDV Domination Engine (rotas HTTP)
 * Camada fina que liga endpoints a ./k11_pdv_domination_engine.js (que não é um Router).
 * NOTA: este módulo não estava documentado no cabeçalho do server.js — os nomes de rota
 * abaixo seguem o mesmo padrão stream/state/ação usado nos outros motores (decision,
 * price-intel). Ajuste se a convenção pretendida for outra.
 */

const express        = require('express');
const router         = express.Router();
const pdvDomination  = require('./k11_pdv_domination_engine');

// GET /api/pdv/stream — SSE: ações de domínio em tempo real
router.get('/stream', (req, res) => {
  pdvDomination.addSSEClient(res);
});

// GET /api/pdv/state — snapshot JSON atual
router.get('/state', (req, res) => {
  res.json(pdvDomination.getState());
});

// POST /api/pdv/action — executa uma ação agressiva de PDV
router.post('/action', async (req, res) => {
  try {
    const { action, payload } = req.body || {};
    if (!action) {
      return res.status(400).json({ error: 'Campo "action" é obrigatório.' });
    }
    const result = await pdvDomination.runAction(action, payload || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
