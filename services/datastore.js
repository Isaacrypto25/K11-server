'use strict';

/**
 * K11 OMNI ELITE — Datastore Service
 * Gerencia conexão Supabase + cache em memória
 * Expõe: datastore.supabase, datastore.warmup(), datastore.getStats()
 */

const { createClient } = require('@supabase/supabase-js');

let _supabase = null;
let _initialized = false;

const _cache = {};
const _stats = { reads: 0, writes: 0, cacheHits: 0, errors: 0 };

function _initSupabase() {
    if (_supabase) return _supabase;
    const url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '').trim();
    if (!url || !key || url.includes('seu-projeto')) return null;
    try {
        _supabase = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        return _supabase;
    } catch (e) {
        console.error('[DATASTORE] Falha ao inicializar Supabase:', e.message);
        return null;
    }
}

/** Lê um dataset pelo nome (com cache de 60s) */
async function readDataset(name, ttl = 60) {
    const cached = _cache[name];
    if (cached && (Date.now() - cached.ts < ttl * 1000)) {
        _stats.cacheHits++;
        return cached.data;
    }
    _stats.reads++;
    const sb = _initSupabase();
    if (!sb) return _cache[name]?.data || [];
    try {
        const { data, error } = await sb.from(name).select('*').limit(500);
        if (error) throw error;
        _cache[name] = { data: data || [], ts: Date.now() };
        return data || [];
    } catch (e) {
        _stats.errors++;
        return _cache[name]?.data || [];
    }
}

/** Invalida cache de um dataset */
function invalidate(name) {
    delete _cache[name];
}

/** Aquece o cache com datasets principais */
async function warmup() {
    const DATASETS = ['tarefas', 'pdvs', 'produtos', 'k11_users'];
    for (const ds of DATASETS) {
        try { await readDataset(ds); } catch (_) {}
    }
}

const datastore = {
    get supabase() { return _initSupabase(); },
    getSupabase: () => _initSupabase(),
    readDataset,
    invalidate,
    warmup,
    getStats: () => ({ ..._stats }),
    cache: _cache,
};

module.exports = datastore;
