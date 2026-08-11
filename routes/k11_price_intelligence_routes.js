'use strict';

/**
 * K11 OMNI ELITE — Price Intelligence (rotas HTTP)
 * Camada fina que liga os endpoints documentados no cabeçalho do server.js
 * às funções já implementadas em ./k11_price_intelligence.js (que não é um Router).
 */

const express    = require('express');
const router     = express.Router();
const priceIntel = require('./k11_price_intelligence');

// GET /api/price-intel/stream — SSE: atualizações de preço
router.get('/stream', (req, res) => {
  priceIntel.addSSEClient(res);
});

// GET /api/price-intel/state — snapshot JSON atual
router.get('/state', (req, res) => {
  res.json(priceIntel.getState());
});

// POST /api/price-intel/scan-all — força scan geral
router.post('/scan-all', (req, res) => {
  priceIntel.forceFullScan();
  res.json({ ok: true, message: 'Scan disparado. Acompanhe via GET /state ou /stream.' });
});

// GET /api/price-intel/history/:prodId — histórico de preços por produto
router.get('/history/:prodId', (req, res) => {
  res.json({ productId: req.params.prodId, history: priceIntel.getPriceHistory(req.params.prodId) });
});

module.exports = router;
