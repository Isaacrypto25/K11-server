/**
 * OBRAMAX API — K11 OMNI ELITE
 * Rotas: projetos, produtos, estoque, pedidos, alertas, inventário
 */
'use strict';
const crypto = require('crypto');

const express = require('express');
const router  = express.Router();
const logger  = require('../services/logger');

// Supabase via datastore (expõe this.supabase)
const datastore = require('../services/datastore');
function getSupabase() { return datastore.supabase || null; }

// ── PRODUTOS MOCK ─────────────────────────────────────────────
const MOCK_PRODUCTS = [
    { sku: 'CIM001', name: 'Cimento Portland 50kg',  category: 'cimento',    price: 35.90,  stock: 500, delivery_days: 1 },
    { sku: 'ARE001', name: 'Areia Média 1m³',        category: 'agregados',  price: 120.00, stock: 200, delivery_days: 2 },
    { sku: 'BRI001', name: 'Tijolo Comum 1mil',      category: 'alvenaria',  price: 890.00, stock: 50,  delivery_days: 3 },
    { sku: 'CAL001', name: 'Cal Hidratada 20kg',     category: 'acabamento', price: 45.00,  stock: 300, delivery_days: 1 },
    { sku: 'REB001', name: 'Reboco Pronto 20kg',     category: 'acabamento', price: 55.00,  stock: 150, delivery_days: 2 },
    { sku: 'FER001', name: 'Ferro CA-50 10mm 12m',   category: 'estrutura',  price: 58.00,  stock: 300, delivery_days: 1 },
    { sku: 'TIJ002', name: 'Tijolo Cerâmico 9 furos',category: 'alvenaria',  price: 0.89,   stock: 5000,delivery_days: 2 },
    { sku: 'TIN001', name: 'Tinta Acrílica 18L',     category: 'acabamento', price: 189.00, stock: 80,  delivery_days: 1 },
];

// ── STORE LOCAL (fallback sem Supabase) ──────────────────────
const _store = {
    projects: [],
    alerts:   [],
    inventory: [],
    orders:   [],
};

// ─────────────────────────────────────────────────────────────
// PROJETOS (OBRAS)
// ─────────────────────────────────────────────────────────────

// POST /api/obramax/projects — criar obra
router.post('/projects', async (req, res) => {
    try {
        const { name, address, start_date, predicted_end_date, budget, area_m2, description } = req.body;
        const usuario_ldap = req.user?.re || req.user?.ldap || 'desconhecido';

        if (!name || !address || !start_date || !predicted_end_date) {
            return res.status(400).json({ ok: false, error: 'Campos obrigatórios: name, address, start_date, predicted_end_date' });
        }

        const project = {
            id: crypto.randomUUID(),
            name:               name.trim(),
            address:            address.trim(),
            start_date,
            predicted_end_date,
            budget:             parseFloat(budget)  || 0,
            area_m2:            parseFloat(area_m2) || null,
            description:        description || '',
            usuario_ldap,
            status:             'active',
            progress_pct:       0,
            total_spent:        0,
            created_at:         new Date().toISOString(),
            updated_at:         new Date().toISOString(),
        };

        const sb = getSupabase();
        if (sb) {
            const { data, error } = await sb.from('obras').insert(project).select().single();
            if (error) throw error;
            logger.info('OBRAMAX', `Obra criada: ${data.name} (${data.id})`);
            return res.status(201).json({ success: true, ok: true, data });
        }

        // fallback sem Supabase
        _store.projects.push(project);
        logger.info('OBRAMAX', `Obra criada (local): ${project.name}`);
        return res.status(201).json({ success: true, ok: true, data: project });

    } catch (error) {
        logger.error('OBRAMAX_PROJECTS', error.message);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// GET /api/obramax/projects — listar obras do usuário autenticado
router.get('/projects', async (req, res) => {
    try {
        const usuario_ldap = req.user?.re || req.user?.ldap;
        const sb = getSupabase();

        if (sb) {
            const { data, error } = await sb
                .from('obras')
                .select('*')
                .eq('usuario_ldap', usuario_ldap)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return res.json({ success: true, ok: true, data: data || [] });
        }

        const obras = _store.projects.filter(p => p.usuario_ldap === usuario_ldap);
        return res.json({ success: true, ok: true, data: obras });

    } catch (error) {
        logger.error('OBRAMAX_PROJECTS', error.message);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// GET /api/obramax/projects/:id — detalhe de uma obra
router.get('/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sb = getSupabase();

        if (sb) {
            const { data, error } = await sb.from('obras').select('*').eq('id', id).single();
            if (error) throw error;
            if (!data) return res.status(404).json({ ok: false, error: 'Obra não encontrada' });
            return res.json({ ok: true, data });
        }

        const obra = _store.projects.find(p => p.id === id);
        if (!obra) return res.status(404).json({ ok: false, error: 'Obra não encontrada' });
        return res.json({ ok: true, data: obra });

    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// PUT /api/obramax/projects/:id — atualizar obra
router.put('/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updated_at: new Date().toISOString() };
        delete updates.id;
        delete updates.usuario_ldap;

        const sb = getSupabase();
        if (sb) {
            const { data, error } = await sb.from('obras').update(updates).eq('id', id).select().single();
            if (error) throw error;
            return res.json({ ok: true, data });
        }

        const idx = _store.projects.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({ ok: false, error: 'Obra não encontrada' });
        _store.projects[idx] = { ..._store.projects[idx], ...updates };
        return res.json({ ok: true, data: _store.projects[idx] });

    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// DELETE /api/obramax/projects/:id — remover obra
router.delete('/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sb = getSupabase();

        if (sb) {
            const { error } = await sb.from('obras').delete().eq('id', id);
            if (error) throw error;
            return res.json({ ok: true, message: 'Obra removida' });
        }

        _store.projects = _store.projects.filter(p => p.id !== id);
        return res.json({ ok: true, message: 'Obra removida' });

    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────
// ALERTAS
// ─────────────────────────────────────────────────────────────

// GET /api/obramax/alerts/:project_id
router.get('/alerts/:project_id', async (req, res) => {
    try {
        const { project_id } = req.params;
        const sb = getSupabase();

        if (sb) {
            const { data, error } = await sb
                .from('obra_alerts')
                .select('*')
                .eq('project_id', project_id)
                .eq('resolved', false)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return res.json({ success: true, ok: true, data: data || [] });
        }

        const alerts = _store.alerts.filter(a => a.project_id === project_id && !a.resolved);
        return res.json({ success: true, ok: true, data: alerts });

    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// POST /api/obramax/alerts/:alertId/resolve
router.post('/alerts/:alertId/resolve', async (req, res) => {
    try {
        const { alertId } = req.params;
        const sb = getSupabase();

        if (sb) {
            const { error } = await sb.from('obra_alerts').update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', alertId);
            if (error) throw error;
            return res.json({ ok: true, message: 'Alerta resolvido' });
        }

        const a = _store.alerts.find(x => x.id === alertId);
        if (a) { a.resolved = true; a.resolved_at = new Date().toISOString(); }
        return res.json({ ok: true, message: 'Alerta resolvido' });

    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────
// INVENTÁRIO
// ─────────────────────────────────────────────────────────────

// GET /api/obramax/inventory/:project_id
router.get('/inventory/:project_id', async (req, res) => {
    try {
        const { project_id } = req.params;
        const sb = getSupabase();

        if (sb) {
            const { data, error } = await sb
                .from('obra_inventory')
                .select('*')
                .eq('project_id', project_id)
                .order('updated_at', { ascending: false });
            if (error) throw error;
            return res.json({ success: true, ok: true, data: data || [] });
        }

        const items = _store.inventory.filter(i => i.project_id === project_id);
        return res.json({ success: true, ok: true, data: items });

    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// POST /api/obramax/inventory/:project_id/consume
router.post('/inventory/:project_id/consume', async (req, res) => {
    try {
        const { project_id } = req.params;
        const { sku, quantity, notes } = req.body;

        if (!sku || !quantity) return res.status(400).json({ ok: false, error: 'sku e quantity obrigatórios' });

        const entry = {
            id: crypto.randomUUID(),
            project_id,
            sku,
            quantity:   parseFloat(quantity),
            type:       'consumo',
            notes:      notes || '',
            created_at: new Date().toISOString(),
        };

        const sb = getSupabase();
        if (sb) {
            const { data, error } = await sb.from('obra_inventory').insert(entry).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, data });
        }

        _store.inventory.push(entry);
        return res.status(201).json({ ok: true, data: entry });

    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────
// PRODUTOS
// ─────────────────────────────────────────────────────────────

// GET /api/obramax/products
router.get('/products', (req, res) => {
    try {
        const { category, search, limit = 50, offset = 0 } = req.query;
        let filtered = [...MOCK_PRODUCTS];
        if (category) filtered = filtered.filter(p => p.category === category);
        if (search)   filtered = filtered.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
        const paginated = filtered.slice(Number(offset), Number(offset) + Number(limit));
        res.json({ success: true, data: paginated, total: filtered.length });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// GET /api/obramax/stock/:sku
router.get('/stock/:sku', (req, res) => {
    const product = MOCK_PRODUCTS.find(p => p.sku === req.params.sku);
    if (!product) return res.status(404).json({ ok: false, error: 'Produto não encontrado' });
    res.json({ sku: product.sku, name: product.name, available: product.stock, price: product.price, delivery_days: product.delivery_days, last_updated: new Date() });
});

// POST /api/obramax/stock/bulk
router.post('/stock/bulk', (req, res) => {
    const { skus } = req.body;
    if (!Array.isArray(skus) || !skus.length) return res.status(400).json({ ok: false, error: 'Array de SKUs requerido' });
    const stocks = skus.map(sku => { const p = MOCK_PRODUCTS.find(x => x.sku === sku); return { sku, available: p?.stock || 0, price: p?.price || null, found: !!p }; });
    res.json({ ok: true, data: stocks, total: skus.length });
});

// ─────────────────────────────────────────────────────────────
// PEDIDOS
// ─────────────────────────────────────────────────────────────

// POST /api/obramax/orders
router.post('/orders', async (req, res) => {
    try {
        const { project_id, items, delivery_address, delivery_cep } = req.body;
        if (!project_id || !Array.isArray(items) || !items.length) {
            return res.status(400).json({ ok: false, error: 'project_id e items obrigatórios' });
        }

        let total = 0;
        const order_items = [];
        for (const item of items) {
            const p = MOCK_PRODUCTS.find(x => x.sku === item.sku);
            if (!p) return res.status(400).json({ ok: false, error: `SKU não encontrado: ${item.sku}` });
            const sub = p.price * item.quantity;
            total += sub;
            order_items.push({ sku: item.sku, name: p.name, quantity: item.quantity, unit_price: p.price, subtotal: sub });
        }

        const order = {
            id: crypto.randomUUID(),
            project_id,
            order_number: `ORD-${Date.now()}`,
            items:        order_items,
            total_amount: total,
            delivery_address: delivery_address || 'A definir',
            delivery_cep:     delivery_cep     || '00000-000',
            status:       'pending',
            created_at:   new Date().toISOString(),
            estimated_delivery: new Date(Date.now() + 2*24*60*60*1000).toISOString(),
        };

        const sb = getSupabase();
        if (sb) {
            const { data, error } = await sb.from('orders_obramax').insert(order).select().single();
            if (error) throw error;
            logger.info('OBRAMAX', `Pedido criado: ${data.order_number}`);
            return res.status(201).json({ success: true, ok: true, ...data });
        }

        _store.orders.push(order);
        return res.status(201).json({ success: true, ok: true, ...order });

    } catch (error) {
        logger.error('OBRAMAX_ORDER', error.message);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// GET /api/obramax/orders
router.get('/orders', async (req, res) => {
    try {
        const { project_id } = req.query;
        const sb = getSupabase();

        if (sb) {
            let q = sb.from('orders_obramax').select('*').order('created_at', { ascending: false });
            if (project_id) q = q.eq('project_id', project_id);
            const { data, error } = await q;
            if (error) throw error;
            return res.json({ success: true, ok: true, data: data || [] });
        }

        const orders = project_id ? _store.orders.filter(o => o.project_id === project_id) : _store.orders;
        return res.json({ success: true, ok: true, data: orders });

    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// GET /api/obramax/orders/:order_id
router.get('/orders/:order_id', async (req, res) => {
    try {
        const { order_id } = req.params;
        const sb = getSupabase();

        if (sb) {
            const { data, error } = await sb.from('orders_obramax').select('*').eq('id', order_id).single();
            if (error) throw error;
            if (!data) return res.status(404).json({ ok: false, error: 'Pedido não encontrado' });
            return res.json({ ok: true, data });
        }

        const o = _store.orders.find(x => x.id === order_id);
        if (!o) return res.status(404).json({ ok: false, error: 'Pedido não encontrado' });
        return res.json({ ok: true, data: o });

    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// POST /api/obramax/sync-stock
router.post('/sync-stock', (req, res) => {
    MOCK_PRODUCTS.forEach(p => { p.stock = Math.max(0, p.stock + Math.floor(Math.random() * 20 - 10)); });
    res.json({ success: true, message: 'Estoque sincronizado', products_updated: MOCK_PRODUCTS.length });
});

module.exports = router;
