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

const ALLOWED_DATASETS = ['tarefas', 'pdvs', 'produtos', 'usuarios', 'vendas', 'estoque', 'alertas', 'logs_acoes'];

// GET /api/data/all
router.get('/all', async (req, res) => {
    try {
        const result = {};
        for (const ds of ALLOWED_DATASETS) {
            result[ds] = await datastore.readDataset(ds);
        }
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
