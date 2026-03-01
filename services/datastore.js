/**
 * K11 OMNI ELITE — DATA STORE SERVICE (Supabase)
 * ════════════════════════════════════════════════
 * Substituição do datastore.js original.
 * Agora lê/escreve no Supabase em vez de arquivos JSON locais.
 *
 * Variáveis de ambiente necessárias no Railway:
 * SUPABASE_URL        = https://xxx.supabase.co
 * SUPABASE_KEY        = sua service_role key
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

const CACHE_TTL_MS = 300_000; // 5 min de cache em memória
const PAGE_SIZE    = 5_000;   // Supabase suporta até 5000 com service_role key

// ── MAPEAMENTO: nome do dataset → tabela no Supabase ─────────
const DATASETS = {
    produtos:       'produtos',
    pdv:            'pdv',
    pdvAnterior:    'pdv_anterior',
    pdvmesquita:    'pdv_mesquita',
    pdvjacarepagua: 'pdv_jacarepagua',
    pdvbenfica:     'pdv_benfica',
    movimento:      'movimento',
    fornecedor:     'fornecedor',
    tarefas:        'tarefas',
};

// ── MAPEAMENTO REVERSO: colunas Supabase → campos originais ───
// Permite que o frontend continue usando os nomes originais dos JSONs
const COLUMN_MAP = {
    produtos: (row) => ({
        'Pessoa autorizada a dispor': row.pessoa_autorizada,
        'Tipo de depósito':           row.tipo_deposito,
        'Posição no depósito':        row.posicao_deposito,
        'Produto':                    row.produto,
        'Descrição produto':          row.descricao_produto,
        'Lote':                       row.lote,
        'Data EM':                    row.data_em,
        'Qtd.disponível UMA':         row.qtd_disponivel_uma,
        'Qtd.UMA':                    row.qtd_uma,
        'Unidade med.altern.':        row.unidade_med,
        'Qtd.disponível UMB':         row.qtd_disponivel_umb,
        'Quantidade':                 row.quantidade,
        'UM básica':                  row.um_basica,
        'Tipo de estoque':            row.tipo_estoque,
        'Denom.tipo estoque':         row.denom_tipo_estoque,
        'Moeda':                      row.moeda,
        'Valor total':                Number(row.valor_total),
        'Número de UCs':              row.numero_ucs,
        'Corr.pos.dep.':              row.corr_pos_dep,
        'Col.posição depósito':       row.col_posicao_deposito,
        'Nível pos.dep.':             row.nivel_pos_dep,
        _id: row.id,
    }),

    pdv: _mapPdv,
    pdv_anterior: _mapPdv,
    pdv_benfica: _mapPdv,
    pdv_mesquita: _mapPdv,
    pdv_jacarepagua: (row) => ({
        ..._mapPdv(row),
        'Denominação da seção': row.denominacao_secao,
    }),

    movimento: (row) => ({
        'Ordem de depósito':              row.ordem_deposito,
        'Produto':                        row.produto,
        'Lote':                           row.lote,
        'Qtd.prev.orig.UMA':              Number(row.qtd_prev_orig),
        'Unidade med.altern.':            row.unidade_med,
        'Data da confirmação':            row.data_confirmacao,
        'Hora da confirmação':            row.hora_confirmacao,
        'Confirmado por':                 row.confirmado_por,
        'PD origem':                      row.pd_origem,
        'PD destino':                     row.pd_destino,
        'Tipo proc.depósito':             row.tipo_proc_deposito,
        'Data de criação':                row.data_criacao,
        'Status da tarefa de depósito':   row.status_tarefa,
        'Descrição produto':              row.descricao_produto,
        'Tipo depós.destino':             row.tipo_deposito_destino,
        'Tarefa de depósito':             row.tarefa_deposito,
        'Autor':                          row.autor,
        'Peso de carga':                  Number(row.peso_carga),
        _id: row.id,
    }),

    fornecedor: (row) => ({
        'FIELD1':                      row.numero_pedido,
        'AGENDAMENTOS POR FORNECEDOR': row.numero_nf,
        'FIELD3':                      row.codigo_produto,
        'FIELD4':                      row.produto,
        'FIELD5':                      row.qtde_agendada,
        'FIELD6':                      row.qtde_confirmada_nf,
        'FIELD7':                      row.data_inicio,
        'FIELD8':                      row.data_fim,
        'FIELD9':                      row.id_agendamento,
        'FIELD10':                     row.local_entrega,
        'FIELD11':                     row.doca_entrega,
        'FIELD12':                     row.fornecedor_nome,
        _id: row.id,
    }),

    tarefas: (row) => ({
        id:   row.id,
        task: row.task,
        done: row.done,
        _id:  row.id,
    }),
};

function _mapPdv(row) {
    return {
        'Loja':                               row.loja,
        'Data de lançamento do cupom fiscal': row.data_lancamento,
        'Hora registro':                      row.hora_registro,
        'Nº do produto':                      row.nr_produto,
        'Texto breve material':               row.texto_breve_material,
        'Denominação da subseção':            row.denominacao_subsecao,
        'Quantidade vendida':                 Number(row.quantidade_vendida),
        'Quantidade disponibilizada':         Number(row.quantidade_disponibilizada),
        'Totalmente disponibilizado':         row.totalmente_disponibilizado,
        _id: row.id,
    };
}

// ─────────────────────────────────────────────────────────────

class DataStore {
    constructor() {
        this._cache  = new Map();
        this._reads  = 0;
        this._writes = 0;
        this._errors = 0;
        this.supabase = null; // Inicializa vazio

        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_KEY;

        if (!url || !key) {
            logger.warn('DATASTORE', '⚠ SUPABASE_URL ou SUPABASE_KEY não configurados!');
        } else {
            try {
                // O .trim() remove espaços vazios ou quebras de linha que causam crash no Railway
                this.supabase = createClient(url.trim(), key.trim());
                logger.info('DATASTORE', 'DataStore Supabase inicializado com sucesso', {
                    url: url.trim(),
                    datasets: Object.keys(DATASETS).length,
                });
            } catch (error) {
                logger.error('DATASTORE', 'Erro fatal ao instanciar cliente Supabase', { error: error.message });
            }
        }
    }

    // ── LEITURA ───────────────────────────────────────────────

    async get(name, { bustCache = false } = {}) {
        const table    = DATASETS[name] || name;
        const cacheKey = table;
        const mapper   = COLUMN_MAP[table] || COLUMN_MAP[name] || (r => r);

        // Cache hit
        if (!bustCache && this._cache.has(cacheKey)) {
            const cached = this._cache.get(cacheKey);
            if (Date.now() - cached.ts < CACHE_TTL_MS) {
                logger.debug('DATASTORE', `Cache HIT: ${table}`);
                return cached.data;
            }
        }

        if (!this.supabase) {
            logger.error('DATASTORE', `Supabase não inicializado. Não é possível ler ${table}.`);
            return [];
        }

        try {
            // Supabase tem limite de 1000 por request — usa paginação
            const rows = await this._fetchAll(table);
            this._reads++;

            // Converte de volta para o formato original esperado pelo frontend
            const result = rows.map(mapper);

            this._cache.set(cacheKey, { data: result, ts: Date.now() });
            logger.debug('DATASTORE', `Lido do Supabase: ${table}`, { rows: result.length });
            return result;

        } catch (err) {
            this._errors++;
            logger.error('DATASTORE', `Falha ao ler ${table}`, { error: err.message });
            return [];
        }
    }

    // Colunas mínimas por tabela — reduz payload drasticamente
    _getColumns(table) {
        const pdvCols = 'id,loja,data_lancamento,hora_registro,nr_produto,texto_breve_material,denominacao_subsecao,quantidade_vendida,quantidade_disponibilizada,totalmente_disponibilizado';
        const map = {
            pdv:            pdvCols,
            pdv_anterior:   pdvCols,
            pdv_benfica:    pdvCols,
            pdv_mesquita:   pdvCols,
            pdv_jacarepagua: pdvCols + ',denominacao_secao',
        };
        return map[table] || '*';
    }

    // Paginação automática para tabelas grandes
    async _fetchAll(table) {
        const PAGE = PAGE_SIZE;
        let all    = [];
        let from   = 0;
        const cols = this._getColumns(table);

        while (true) {
            const { data, error } = await this.supabase
                .from(table)
                .select(cols)
                .range(from, from + PAGE - 1)
                .order('id', { ascending: true });

            if (error) throw new Error(error.message);
            if (!data || data.length === 0) break;

            all = all.concat(data);
            if (data.length < PAGE) break;
            from += PAGE;
        }

        return all;
    }

    async getAll() {
        const keys    = Object.keys(DATASETS);
        const results = await Promise.all(keys.map(k => this.get(k)));
        const map     = {};
        keys.forEach((k, i) => { map[k] = results[i]; });
        logger.info('DATASTORE', 'Todos os datasets carregados do Supabase', {
            totals: Object.fromEntries(keys.map((k, i) => [k, results[i].length]))
        });
        return map;
    }

    // ── ESCRITA ───────────────────────────────────────────────

    async set(name, data) {
        const table = DATASETS[name] || name;

        if (!this.supabase) {
            logger.error('DATASTORE', `Supabase não inicializado. Não é possível escrever em ${table}.`);
            return false;
        }

        try {
            // Limpa e reinseere
            await this.supabase.from(table).delete().neq('id', 0);
            if (data.length > 0) {
                const { error } = await this.supabase.from(table).insert(data);
                if (error) throw new Error(error.message);
            }
            this._writes++;
            this._cache.delete(table);
            logger.info('DATASTORE', `Escrito no Supabase: ${table}`, { rows: data.length });
            return true;
        } catch (err) {
            this._errors++;
            logger.error('DATASTORE', `Falha ao escrever ${table}`, { error: err.message });
            return false;
        }
    }

    async updateItem(name, id, patch) {
        const table = DATASETS[name] || name;

        if (!this.supabase) {
            logger.error('DATASTORE', `Supabase não inicializado. Não é possível atualizar em ${table}.`);
            return null;
        }

        try {
            const { data, error } = await this.supabase
                .from(table)
                .update({ ...patch, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();

            if (error) throw new Error(error.message);

            this._cache.delete(table);
            this._writes++;

            const mapper = COLUMN_MAP[table] || COLUMN_MAP[name] || (r => r);
            return mapper(data);

        } catch (err) {
            this._errors++;
            logger.error('DATASTORE', `Falha ao atualizar ${table}/${id}`, { error: err.message });
            return null;
        }
    }

    clearCache() {
        this._cache.clear();
        logger.info('DATASTORE', 'Cache invalidado');
    }

    // Pré-aquece o cache em background — chamado no startup do server.js
    warmup() {
        logger.info('DATASTORE', 'Iniciando warmup do cache em background...');
        this.getAll()
            .then(() => logger.info('DATASTORE', '✅ Cache aquecido com sucesso'))
            .catch(err => logger.error('DATASTORE', 'Falha no warmup:', { error: err.message }));
    }

    getStats() {
        return {
            reads:     this._reads,
            writes:    this._writes,
            errors:    this._errors,
            cacheSize: this._cache.size,
            cacheTTL:  CACHE_TTL_MS,
            source:    'supabase',
            url:       process.env.SUPABASE_URL ? process.env.SUPABASE_URL.trim() : 'não configurado',
            datasets:  Object.keys(DATASETS),
        };
    }

    // Mantém compatibilidade com rota /api/data/files
    listFiles() {
        return Object.entries(DATASETS).map(([name, table]) => ({
            name:    `${name}.json`,
            table,
            loaded:  this._cache.has(table),
            source:  'supabase',
        }));
    }
}

module.exports = new DataStore();
// Patch já aplicado acima via sed
