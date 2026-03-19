'use strict';

/**
 * K11 OMNI ELITE — Data Routes
 * GET  /api/data/all         → todos os datasets
 * GET  /api/data/:dataset    → dataset específico
 * PUT  /api/data/:dataset/:id → atualiza item
 */

const express   = require('express');
const router    = express.Router();
const datastore = require('../services/datastore');
const logger    = require('../services/logger');

// [FIX 5] Mapa de chave frontend → nome real da tabela no Supabase.
// Antes: ALLOWED_DATASETS retornava nomes de tabela diretamente (pdvs, pdv_anterior…)
// causando mismatch com o que k11-app.js espera (pdv, pdvAnterior, pdvmesquita…),
// resultando em allData truthy mas com todos os campos undefined → crash no init().
const DATASET_MAP = {
    produtos:       'produtos',
    auditoria:      'auditoria',
    movimento:      'movimento',
    pdv:            'pdvs',
    pdvAnterior:    'pdv_anterior',
    tarefas:        'tarefas',
    pdvmesquita:    'pdv_mesquita',
    pdvjacarepagua: 'pdv_jacarepagua',
    pdvbenfica:     'pdv_benfica',
    fornecedor:     'fornecedor',
};

// Lista de tabelas permitidas para GET /:dataset e PUT /:dataset/:id
const ALLOWED_DATASETS = [...new Set(Object.values(DATASET_MAP))];

// GET /api/data/all
router.get('/all', async (req, res) => {
    try {
        const result = {};
        // Busca em paralelo e expõe com as chaves que o frontend espera
        await Promise.all(
            Object.entries(DATASET_MAP).map(async ([frontendKey, tableName]) => {
                result[frontendKey] = await datastore.readDataset(tableName);
            })
        );
        res.json({ ok: true, data: result, ts: new Date().toISOString() });
    } catch (e) {
        logger.error('DATA', `Erro ao buscar todos os datasets: ${e.message}`);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/data/:dataset
router.get('/:dataset', async (req, res) => {
    const { dataset } = req.params;
    if (!ALLOWED_DATASETS.includes(dataset)) {
        return res.status(404).json({ ok: false, error: `Dataset "${dataset}" não encontrado.` });
    }
    try {
        const data = await datastore.readDataset(dataset);
        res.json({ ok: true, dataset, data, count: data.length });
    } catch (e) {
        logger.error('DATA', `Erro ao buscar ${dataset}: ${e.message}`);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// PUT /api/data/:dataset/:id
router.put('/:dataset/:id', async (req, res) => {
    const { dataset, id } = req.params;
    if (!ALLOWED_DATASETS.includes(dataset)) {
        return res.status(404).json({ ok: false, error: `Dataset "${dataset}" não encontrado.` });
    }
    try {
        const updates = { ...req.body, updated_at: new Date().toISOString() };
        delete updates.id;

        const sb = datastore.supabase;
        if (sb) {
            const { data, error } = await sb.from(dataset).update(updates).eq('id', id).select().single();
            if (error) throw error;
            datastore.invalidate(dataset);
            logger.info('DATA', `Atualizado: ${dataset}/${id}`);
            return res.json({ ok: true, data });
        }

        res.json({ ok: true, message: 'Atualizado localmente (sem Supabase)' });
    } catch (e) {
        logger.error('DATA', `Erro ao atualizar ${dataset}/${id}: ${e.message}`);
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
