/**
 * K11 OBRAMAX — ROTAS DO PORTAL DO CLIENTE
 * ═══════════════════════════════════════════════════════════════
 * Rotas exclusivas para clientes autenticados (role: 'cliente')
 * 
 * GET  /api/cliente/dashboard          → resumo geral do cliente
 * GET  /api/cliente/obras              → obras do cliente
 * POST /api/cliente/obras              → criar obra
 * GET  /api/cliente/obras/:id          → detalhe de uma obra
 * GET  /api/cliente/obras/:id/timeline → fases da obra
 * GET  /api/cliente/obras/:id/materiais → consumo de materiais
 * GET  /api/cliente/carrinho           → carrinho do cliente
 * POST /api/cliente/carrinho           → adicionar item
 * PUT  /api/cliente/carrinho/:sku      → atualizar qtd
 * DELETE /api/cliente/carrinho/:sku   → remover item
 * POST /api/cliente/pedidos            → finalizar pedido
 * GET  /api/cliente/pedidos            → listar pedidos
 * GET  /api/cliente/pedidos/:id        → detalhe do pedido
 * GET  /api/cliente/notificacoes       → notificações do cliente
 * POST /api/cliente/notificacoes/lidas → marcar como lidas
 * GET  /api/cliente/orcamentos         → orçamentos do cliente
 * GET  /api/cliente/produtos           → catálogo (com preços de cliente)
 * GET  /api/cliente/perfil             → dados do perfil
 * PUT  /api/cliente/perfil             → atualizar perfil
 * GET  /api/cliente/financeiro         → resumo financeiro das obras
 * POST /api/cliente/avaliacao          → avaliar entrega/serviço
 */

'use strict';

const express  = require('express');
const crypto   = require('crypto');
const router   = express.Router();
const datastore = require('../services/datastore');
const logger    = require('../services/logger');

function sb() { return datastore.supabase || null; }
function uuid() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function fmtBrl(v) { return (v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }

// ────────────────────────────────────────────────────────────
// CATÁLOGO — lido do Supabase (tabela: produtos)
// Cache de 5 minutos para os 1982 SKUs reais
// ────────────────────────────────────────────────────────────

let _catalogoCache   = [];
let _catalogoCacheTs = 0;
const CATALOGO_TTL   = 5 * 60 * 1000; // 5 min

// ── MOTOR DE CLASSIFICAÇÃO INTELIGENTE ──────────────────────
// Classifica cada produto em secao + subSecao baseado no nome.
// Ordem importa: regras mais específicas primeiro.
const SECOES = [
  {
    key: 'hidraulica', label: 'Hidráulica', icon: '💧',
    subSecoes: [
      { key: 'evacuacao',   label: 'Evacuação / Esgoto',  icon: '🚽',
        rx: /esgot|evacua|fossa|sifão|sifao|vaso|bacia|caixa sifonada|ralo|grelha|tubo pvc e|\bde 100\b|desgordur/i },
      { key: 'agua_fria',   label: 'Água Fria',            icon: '🚿',
        rx: /agua fria|água fria|registro|torneira|tubo pvc bb|ppr|polipropileno|conexão ppr|cap ppr|tê ppr|joelho ppr|luva ppr|redução ppr|\bbb\b|soldável|soldavel|pressão|pressao/i },
      { key: 'aquecimento', label: 'Aquecimento',          icon: '🔥',
        rx: /aquec|boiler|chuveiro|ducha|agua quente|água quente|termostato|solar|coletor/i },
      { key: 'piscina',     label: 'Piscinas',              icon: '🏊',
        rx: /piscina|bomba d.?água|bomba d.?agua|filtro piscina|skimmer|cloro|hipoclorito|algicida|válvula piscina/i },
      { key: 'reservatorio',label: 'Reservatórios / Caixas',icon: '🛢️',
        rx: /caixa d.?agua|caixa d.?água|reservat|cisterna|polietileno|fibra.*agua|tanque/i },
      { key: 'geral_hidra', label: 'Conexões e Tubos',      icon: '🔩',
        rx: /tubo|conexão|conexao|joelho|cotovelo|\btê\b|\bte\b|luva|redução|reducao|flange|pvc.*agua|vedação|vedacao|teflon|veda/i },
    ],
    rxSecao: /tubo|pvc|conexão|conexao|joelho|cotovelo|luva|redução|reducao|\btê\b|\bte\b|registro|torneira|válvula|valvula|bomba|hidr[aá]ul|água|agua|esgot|fossa|ralo|chuveiro|piscina|caixa.*agua|boiler|aquec|ppr|soldável|soldavel/i,
  },
  {
    key: 'eletrica', label: 'Elétrica', icon: '⚡',
    subSecoes: [
      { key: 'fios',        label: 'Fios e Cabos',          icon: '🔌',
        rx: /fio|cabo|condutor|flexível|flexivel|rígido|rigido|coaxial|pp\b|nmd/i },
      { key: 'eletrodutos', label: 'Eletrodutos / Conduítes',icon: '📏',
        rx: /eletroduto|conduíte|conduítes|conduite|corrugado|flexível.*elétrico|pvc.*elétrico/i },
      { key: 'quadros',     label: 'Quadros e Disjuntores',  icon: '🔋',
        rx: /disjuntor|quadro.*distribui|qgbt|dps|dr\b|interruptor diferencial|borne|barramento/i },
      { key: 'tomadas',     label: 'Tomadas e Interruptores',icon: '🔦',
        rx: /tomada|interruptor|espelho|placa.*elétric|módulo.*elétric|bipolar|tripolar|2p\+t|nbr.*14136/i },
      { key: 'iluminacao',  label: 'Iluminação',             icon: '💡',
        rx: /lâmpada|lampada|led|refletor|luminária|luminaria|spot|plafon|lustre|pendente|mangueira led|fita led/i },
      { key: 'geral_elet',  label: 'Acessórios Elétricos',   icon: '🔧',
        rx: /conector|terminal|abraçadeira|abracadeira|canaleta|régua|regleta|caixa.*elétric|parafuso.*elétric/i },
    ],
    rxSecao: /fio|cabo|condutor|elétric|eletric|eletroduto|disjuntor|tomada|interruptor|quadro|lâmpada|lampada|led|luminária|luminaria|bitola|conduíte|conduite|espelho.*elétric|módulo.*elétric/i,
  },
  {
    key: 'alvenaria', label: 'Alvenaria', icon: '🧱',
    subSecoes: [
      { key: 'tijolos',     label: 'Tijolos e Blocos',       icon: '🧱',
        rx: /tijolo|bloco.*cerâmic|bloco.*ceramico|bloco.*concreto|bloco.*cimento|tijolinho|vedação.*cerâm/i },
      { key: 'cimento',     label: 'Cimento e Argamassa',    icon: '🏗️',
        rx: /cimento|argamassa|reboco|chapisco|emboço|emboco|massa.*corrida|massa.*assentar/i },
      { key: 'areia',       label: 'Areias e Agregados',     icon: '⛏️',
        rx: /areia|brita|pedrisco|rachão|pedra.*britada|pó de pedra|pe de pedra|seixo/i },
      { key: 'cal',         label: 'Cal e Produtos Especiais',icon: '🫧',
        rx: /cal |calda|hidratada|pasta de cal|cal CH/i },
      { key: 'lajota',      label: 'Lajes e Estruturas',     icon: '🏢',
        rx: /lajota|laje|tavela|elemento.*laje|treliça|treliça|tavela|forro.*laje/i },
    ],
    rxSecao: /tijolo|bloco|cimento|argamassa|areia|brita|cal |reboco|chapisco|lajota|laje|pedrisco|agregado/i,
  },
  {
    key: 'estrutura', label: 'Estrutura e Ferro', icon: '🔩',
    subSecoes: [
      { key: 'ferragem',    label: 'Ferragens / Aço',        icon: '🔩',
        rx: /ferro|aço|aco|ca-50|ca-60|ca50|ca60|tela|barra.*aço|vergalhão|vergalhao|fio.*aco/i },
      { key: 'forma',       label: 'Fôrmas e Escoramentos',  icon: '🪵',
        rx: /forma|fôrma|escor|punção|madeira.*estrut|compensado.*forma/i },
      { key: 'concreto',    label: 'Concreto e Aditivos',    icon: '🏗️',
        rx: /concreto|aditivo|impermeabilizante.*concreto|plastificante|acelerador|retardador/i },
      { key: 'parafusos',   label: 'Parafusos e Fixadores',  icon: '🔧',
        rx: /parafuso|bucha|prego|grampo|chumbador|ancora|âncora|pino.*fixação|fixador/i },
    ],
    rxSecao: /ferro|aço|aco|vergalhão|vergalhao|tela.*solda|estrutura|concreto|fôrma|forma.*concreto|parafuso|prego|bucha|chumbador/i,
  },
  {
    key: 'cobertura', label: 'Cobertura e Telhado', icon: '🏠',
    subSecoes: [
      { key: 'telhas',      label: 'Telhas',                 icon: '🏠',
        rx: /telha|cumbreira|rufo|cumeeira/i },
      { key: 'impermeab',   label: 'Impermeabilização',      icon: '🛡️',
        rx: /impermeab|manta|asfaltica|asfáltica|betume|emulsão|emulsao|vedacit|vedaquim|manta.*geotêxt/i },
      { key: 'calha',       label: 'Calhas e Rufos',         icon: '🌧️',
        rx: /calha|rufo|condutor.*agua|condutor.*água|platibanda|pingadeira/i },
      { key: 'forro',       label: 'Forros',                 icon: '📋',
        rx: /forro|pvc.*forro|gesso.*forro|drywall|gesso.*plac|placa.*gesso|tabica|fascia/i },
    ],
    rxSecao: /telha|impermeab|manta|cobertura|calha|rufo|forro|drywall|gesso.*plac|platibanda/i,
  },
  {
    key: 'revestimento', label: 'Revestimentos e Pisos', icon: '🪟',
    subSecoes: [
      { key: 'pisos',       label: 'Pisos',                  icon: '⬜',
        rx: /piso|porcelanato|cerâmica.*piso|ceramica.*piso|laminado|vinílico|vinilico|parquet|ladrilho|granito.*piso|mármore.*piso/i },
      { key: 'paredes',     label: 'Revestimento de Paredes', icon: '🟫',
        rx: /azulejo|cerâmica.*parede|ceramica.*parede|revestimento.*parede|pastilha|pedra.*parede|porcelanato.*parede/i },
      { key: 'argamassa_rev',label: 'Argamassas de Assentamento',icon: '🪣',
        rx: /argamassa.*assentar|argamassa.*colante|rejunte|rejuntar|ac1|ac2|ac3|acii|aciii/i },
      { key: 'rodape',      label: 'Rodapés e Soleiras',     icon: '📐',
        rx: /rodapé|rodape|soleira|peitoril/i },
    ],
    rxSecao: /piso|azulejo|cerâmica|ceramica|porcelanato|revestiment|rejunt|argamassa.*colant|ladrilho|laminado|granito|mármore|mármore|rodapé|rodape/i,
  },
  {
    key: 'pintura', label: 'Pintura e Acabamento', icon: '🎨',
    subSecoes: [
      { key: 'tintas',      label: 'Tintas',                 icon: '🎨',
        rx: /tinta|esmalte|verniz|primer|selador|massa.*parede|massa.*corrida|massa.*textura/i },
      { key: 'lixa',        label: 'Lixas e Preparação',     icon: '🪚',
        rx: /lixa|massa.*acab|preparação.*superficie|preparacao|fundex|zarcão|zarcao/i },
      { key: 'acessorios_pint',label:'Pincéis e Rolos',      icon: '🖌️',
        rx: /pincel|rolo.*pintura|bandeja.*pintura|espátula|espatula|broxa/i },
    ],
    rxSecao: /tinta|esmalte|verniz|lixa|pincel|rolo.*pint|massa.*corrida|selador|primer|pintura/i,
  },
  {
    key: 'esquadrias', label: 'Esquadrias e Vidros', icon: '🚪',
    subSecoes: [
      { key: 'portas',      label: 'Portas',                 icon: '🚪',
        rx: /porta|batente|marco.*porta|alizares/i },
      { key: 'janelas',     label: 'Janelas',                icon: '🪟',
        rx: /janela|basculante|guilhotina|veneziana|maxim-ar|maximar/i },
      { key: 'ferragens_esq',label:'Ferragens para Esquadrias',icon:'🗝️',
        rx: /dobradiça|dobradica|fechadura|maçaneta|macaneta|trinco|pivô|pivo|ferrolho/i },
      { key: 'vidros',      label: 'Vidros e Acrílicos',     icon: '🪟',
        rx: /vidro|acrílico|acrilico|policarbonato|blindex|temperado/i },
    ],
    rxSecao: /porta|janela|esquadria|dobradiça|dobradica|fechadura|maçaneta|macaneta|vidro|acrílico|acrilico/i,
  },
  {
    key: 'epi_seguranca', label: 'EPI e Segurança', icon: '🦺',
    subSecoes: [
      { key: 'epi',         label: 'EPIs',                   icon: '⛑️',
        rx: /capacete|luva|óculos.*segurança|oculos.*seguranca|protetor.*auricular|botina|bota.*segurança|colete|cinto.*segurança/i },
      { key: 'sinalizacao', label: 'Sinalização',            icon: '⚠️',
        rx: /sinaliz|cone|fita.*balizamento|fita.*zebrada|placa.*advertência|placa.*advertencia/i },
    ],
    rxSecao: /epi|capacete|luva|equipamento.*proteção|proteção.*individ|segurança.*obra|cinto.*segurança/i,
  },
  {
    key: 'ferramentas', label: 'Ferramentas e Equipamentos', icon: '🔨',
    subSecoes: [
      { key: 'manuais',     label: 'Ferramentas Manuais',    icon: '🔨',
        rx: /martelo|chave.*fenda|chave.*boca|alicate|serrote|enxada|pá|colher.*pedreiro|desempenadeira|talhadeira/i },
      { key: 'eletricas',   label: 'Ferramentas Elétricas',  icon: '🔌',
        rx: /furadeira|parafusadeira|lixadeira|esmerilhadeira|serra.*mármore|serra.*mármore|betoneira|compactador/i },
      { key: 'acessorios_fer',label:'Acessórios para Ferramentas',icon:'🪛',
        rx: /broca|disco.*corte|disco.*lixa|disco.*polimento|fixação.*ferramenta|bit\b|ponteira/i },
    ],
    rxSecao: /ferramenta|martelo|furadeira|betoneira|alicate|serrote|broca|disco.*corte|compactador|esmeril/i,
  },
];

// Retorna { secao, subSecao, icon, subIcon } baseado no nome do produto
function _classificarProduto(nome) {
  const n = (nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  for (const secao of SECOES) {
    if (secao.rxSecao.test(n)) {
      for (const sub of secao.subSecoes) {
        if (sub.rx.test(n)) {
          return {
            secao:    secao.key,
            secaoLabel: secao.label,
            secaoIcon:  secao.icon,
            subSecao:   sub.key,
            subSecaoLabel: sub.label,
            subSecaoIcon:  sub.icon,
          };
        }
      }
      // Caiu na seção mas não na subseção → subseção "Geral"
      return {
        secao:    secao.key,
        secaoLabel: secao.label,
        secaoIcon:  secao.icon,
        subSecao:   'geral_' + secao.key,
        subSecaoLabel: 'Geral ' + secao.label,
        subSecaoIcon:  secao.icon,
      };
    }
  }
  // Produto não classificado
  return {
    secao:    'outros',
    secaoLabel: 'Outros Materiais',
    secaoIcon:  '📦',
    subSecao:   'outros',
    subSecaoLabel: 'Outros',
    subSecaoIcon:  '📦',
  };
}

// Converte uma linha da tabela `produtos` para o formato do catálogo do cliente
function _rowToProd(row) {
  const qtd   = Number(row.quantidade)        || Number(row.qtd_disponivel_uma) || 1;
  const total = Number(row.valor_total)        || 0;
  const price = qtd > 0 ? parseFloat((total / qtd).toFixed(2)) : 0;
  const stock = Number(row.qtd_disponivel_uma) || Number(row.quantidade) || 0;
  const unit  = (row.unidade_med || row.um_basica || 'un').trim();
  const nome  = (row.descricao_produto || row.produto || '').trim();

  const classif = _classificarProduto(nome);

  return {
    sku:          String(row.produto || row.id).trim(),
    name:         nome,
    // legado — mantém cat para compat. com código antigo
    cat:          classif.secaoLabel,
    // campos novos de hierarquia
    secao:        classif.secao,
    secaoLabel:   classif.secaoLabel,
    secaoIcon:    classif.secaoIcon,
    subSecao:     classif.subSecao,
    subSecaoLabel:classif.subSecaoLabel,
    subSecaoIcon: classif.subSecaoIcon,
    price,
    stock,
    unit,
    icon:         classif.subSecaoIcon,
    prazo:        2,
    desc:         nome,
    _posicao:     row.posicao_deposito || null,
    _lote:        row.lote             || null,
  };
}

// Carrega (ou retorna do cache) todos os produtos do Supabase
async function _getCatalogo() {
  if (_catalogoCache.length > 0 && (Date.now() - _catalogoCacheTs) < CATALOGO_TTL) {
    return _catalogoCache;
  }

  const db = sb();
  if (!db) {
    logger.warn('CLIENTE-PRODUTOS', 'Supabase não disponível — catálogo vazio');
    return _catalogoCache; // devolve o último cache, mesmo expirado
  }

  try {
    // Lê todos os produtos com paginação automática (1982 SKUs)
    const PAGE = 1000;
    let all = [], from = 0;
    while (true) {
      const { data, error } = await db
        .from('produtos')
        .select('produto, descricao_produto, qtd_disponivel_uma, quantidade, unidade_med, um_basica, valor_total, tipo_deposito, denom_tipo_estoque, posicao_deposito, lote, id')
        .range(from, from + PAGE - 1)
        .order('descricao_produto', { ascending: true });

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // Filtra linhas sem produto e converte
    _catalogoCache = all
      .filter(r => r.produto || r.descricao_produto)
      .map(_rowToProd)
      // Remove duplicatas de SKU (mantém o de maior estoque)
      .reduce((acc, p) => {
        const existing = acc.find(x => x.sku === p.sku);
        if (!existing) { acc.push(p); }
        else if (p.stock > existing.stock) { Object.assign(existing, p); }
        return acc;
      }, []);

    _catalogoCacheTs = Date.now();
    logger.info('CLIENTE-PRODUTOS', `Catálogo carregado: ${_catalogoCache.length} SKUs`);
    return _catalogoCache;

  } catch (e) {
    logger.error('CLIENTE-PRODUTOS', `Erro ao carregar catálogo: ${e.message}`);
    return _catalogoCache; // devolve último cache em caso de erro
  }
}

// Busca um produto por SKU (usa o cache)
async function _getProdBySku(sku) {
  const catalogo = await _getCatalogo();
  return catalogo.find(p => p.sku === sku) || null;
}

// Loja de carrinhos e pedidos em memória (fallback sem Supabase)
const _carrinhos = new Map(); // email → [{sku, qty}]
const _pedidos   = [];
const _notifs    = new Map(); // email → [{...}]

function getCarrinho(email) { return _carrinhos.get(email) || []; }
function setCarrinho(email, itens) { _carrinhos.set(email, itens); }

// ────────────────────────────────────────────────────────────
// DASHBOARD DO CLIENTE
// ────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const email = req.user?.re;
  try {
    let obras = [], pedidos_count = 0;
    const db = sb();
    if (db) {
      const { data: o } = await db.from('obras').select('id,name,status,progress_pct,predicted_end_date').eq('usuario_ldap', email);
      obras = o || [];
      const { count } = await db.from('cliente_pedidos').select('id', { count:'exact', head:true }).eq('cliente_email', email);
      pedidos_count = count || 0;
    } else {
      pedidos_count = _pedidos.filter(p => p.cliente_email === email).length;
    }

    const carrinho = getCarrinho(email);
    const cat = _catalogoCache; // usa cache já carregado — não bloqueia o dashboard
    const cart_total = carrinho.reduce((acc, item) => {
      const prod = cat.find(p => p.sku === item.sku);
      return acc + (prod?.price || 0) * item.qty;
    }, 0);

    res.json({
      ok: true,
      data: {
        obras_total:    obras.length,
        obras_ativas:   obras.filter(o => o.status === 'active').length,
        carrinho_itens: carrinho.reduce((a, i) => a + i.qty, 0),
        carrinho_total: cart_total,
        pedidos_total:  pedidos_count,
        obras,
      }
    });
  } catch(e) {
    logger.error('CLIENTE-ROUTES', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ────────────────────────────────────────────────────────────
// OBRAS DO CLIENTE
// ────────────────────────────────────────────────────────────
router.get('/obras', async (req, res) => {
  const email = req.user?.re;
  try {
    const db = sb();
    if (db) {
      const { data, error } = await db.from('obras').select('*').eq('usuario_ldap', email).order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ ok: true, data: data || [] });
    }
    res.json({ ok: true, data: [] });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/obras', async (req, res) => {
  const email = req.user?.re;
  const { name, address, start_date, predicted_end_date, budget, area_m2, description, tipo } = req.body;
  if (!name || !address || !start_date || !predicted_end_date)
    return res.status(400).json({ ok: false, error: 'Campos obrigatórios: name, address, start_date, predicted_end_date' });
  try {
    const projeto = {
      name: name.trim(),
      address: address.trim(),
      start_date,
      predicted_end_date,
      budget:      parseFloat(budget) || 0,
      area_m2:     parseFloat(area_m2) || null,
      description: description || '',
      tipo:        tipo || 'residencial',
      usuario_ldap: email,
      status:      'active',
      progress_pct: 0,
      total_spent:  0,
    };
    const db = sb();
    if (db) {
      const { data, error } = await db.from('obras').insert(projeto).select().single();
      if (error) throw error;
      logger.info('CLIENTE-OBRAS', `Nova obra criada: ${data.name} por ${email}`);
      // Criar notificação de boas-vindas para a obra
      await _criarNotif(db, email, {
        tipo: 'obra_criada',
        titulo: `Obra "${name}" criada!`,
        mensagem: `Sua obra foi registrada. Nossa equipe entrará em contato em breve.`,
        cor: 'green',
      });
      return res.status(201).json({ ok: true, data });
    }
    res.status(201).json({ ok: true, data: { id: uuid(), ...projeto, created_at: now() } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/obras/:id', async (req, res) => {
  const email = req.user?.re;
  try {
    const db = sb();
    if (db) {
      const { data, error } = await db.from('obras').select('*').eq('id', req.params.id).eq('usuario_ldap', email).single();
      if (error || !data) return res.status(404).json({ ok: false, error: 'Obra não encontrada.' });
      return res.json({ ok: true, data });
    }
    res.status(404).json({ ok: false, error: 'Obra não encontrada.' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/obras/:id/timeline', async (req, res) => {
  // Retorna fases e progresso da obra
  const fases_default = [
    { ordem:1,  nome:'Fundação e terraplanagem', dur_dias:14, prog:0, status:'pending' },
    { ordem:2,  nome:'Estrutura (pilares e vigas)', dur_dias:21, prog:0, status:'pending' },
    { ordem:3,  nome:'Alvenaria e fechamentos', dur_dias:28, prog:0, status:'pending' },
    { ordem:4,  nome:'Cobertura e telhado', dur_dias:14, prog:0, status:'pending' },
    { ordem:5,  nome:'Instalações elétricas', dur_dias:21, prog:0, status:'pending' },
    { ordem:6,  nome:'Instalações hidráulicas', dur_dias:14, prog:0, status:'pending' },
    { ordem:7,  nome:'Revestimentos internos', dur_dias:28, prog:0, status:'pending' },
    { ordem:8,  nome:'Pintura e acabamentos', dur_dias:21, prog:0, status:'pending' },
    { ordem:9,  nome:'Piso e pisos externos', dur_dias:14, prog:0, status:'pending' },
    { ordem:10, nome:'Vistoria e entrega', dur_dias:7,  prog:0, status:'pending' },
  ];
  try {
    const db = sb();
    if (db) {
      const { data } = await db.from('obra_fases').select('*').eq('obra_id', req.params.id).order('ordem');
      return res.json({ ok: true, data: data?.length ? data : fases_default });
    }
    res.json({ ok: true, data: fases_default });
  } catch(e) { res.json({ ok: true, data: fases_default }); }
});

router.get('/obras/:id/materiais', async (req, res) => {
  try {
    const db = sb();
    if (db) {
      const { data } = await db.from('obra_inventory').select('*').eq('project_id', req.params.id).order('created_at', { ascending: false });
      return res.json({ ok: true, data: data || [] });
    }
    res.json({ ok: true, data: [] });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ────────────────────────────────────────────────────────────
// CATÁLOGO DE PRODUTOS
// ────────────────────────────────────────────────────────────
router.get('/produtos', async (req, res) => {
  try {
    const { secao, subSecao, q, page = 1, limit = 50 } = req.query;
    const catalogo = await _getCatalogo();

    let prods = catalogo.filter(p => p.stock > 0);

    // Filtros hierárquicos
    if (secao && secao !== 'todos') prods = prods.filter(p => p.secao === secao);
    if (subSecao)                   prods = prods.filter(p => p.subSecao === subSecao);

    // Busca textual
    if (q) {
      const s = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      prods = prods.filter(p => {
        const n = (p.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        return n.includes(s) || p.sku.toLowerCase().includes(s);
      });
    }

    // Paginação
    const total = prods.length;
    const pg    = parseInt(page);
    const lim   = parseInt(limit);
    const items = prods.slice((pg - 1) * lim, pg * lim);

    // Construir árvore de seções para o menu lateral
    const secoesMap = {};
    catalogo.filter(p => p.stock > 0).forEach(p => {
      if (!secoesMap[p.secao]) {
        secoesMap[p.secao] = {
          key: p.secao, label: p.secaoLabel, icon: p.secaoIcon,
          total: 0, subSecoes: {},
        };
      }
      secoesMap[p.secao].total++;
      const ss = secoesMap[p.secao].subSecoes;
      if (!ss[p.subSecao]) {
        ss[p.subSecao] = { key: p.subSecao, label: p.subSecaoLabel, icon: p.subSecaoIcon, total: 0 };
      }
      ss[p.subSecao].total++;
    });

    // Ordena seções por total desc, depois subseções
    const secoes = Object.values(secoesMap)
      .sort((a, b) => b.total - a.total)
      .map(s => ({
        ...s,
        subSecoes: Object.values(s.subSecoes).sort((a, b) => b.total - a.total),
      }));

    // legado: cats flat para compat.
    const cats = ['Todos', ...secoes.map(s => s.label)];

    res.json({ ok: true, data: items, total, secoes, cats, page: pg, pages: Math.ceil(total / lim) });
  } catch (e) {
    logger.error('CLIENTE-PRODUTOS', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/produtos/:sku', async (req, res) => {
  try {
    const prod = await _getProdBySku(req.params.sku);
    if (!prod) return res.status(404).json({ ok: false, error: 'Produto não encontrado.' });

    const catalogo   = await _getCatalogo();
    const relacionados = catalogo
      .filter(p => p.cat === prod.cat && p.sku !== prod.sku && p.stock > 0)
      .slice(0, 4);

    res.json({ ok: true, data: prod, relacionados });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Rota extra: invalida o cache do catálogo (para operacional usar após atualizar estoque)
router.post('/produtos/refresh-cache', async (req, res) => {
  _catalogoCacheTs = 0;
  await _getCatalogo();
  res.json({ ok: true, total: _catalogoCache.length, message: 'Cache do catálogo atualizado.' });
});

// ────────────────────────────────────────────────────────────
// CARRINHO
// ────────────────────────────────────────────────────────────
router.get('/carrinho', async (req, res) => {
  const email = req.user?.re;
  try {
    const db = sb();
    let itens = [];
    if (db) {
      const { data } = await db.from('cliente_carrinho').select('*').eq('cliente_email', email);
      itens = data || [];
    } else {
      itens = getCarrinho(email);
    }
    // Enriquecer com dados do produto
    const enriched = itens.map(i => {
      const p = _catalogoCache.find(c => c.sku === i.sku);
      return { ...i, produto: p || null, subtotal: (p?.price || 0) * i.qty };
    }).filter(i => i.produto);

    const total = enriched.reduce((a, i) => a + i.subtotal, 0);
    const frete = total >= 500 ? 0 : 89.90;
    res.json({ ok: true, data: enriched, total, frete, total_com_frete: total + frete });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/carrinho', async (req, res) => {
  const email = req.user?.re;
  const { sku, qty = 1 } = req.body;
  if (!sku) return res.status(400).json({ ok: false, error: 'SKU obrigatório.' });
  // Garante que o catálogo está carregado antes de validar o SKU
  const catalogo = await _getCatalogo();
  const prod = catalogo.find(p => p.sku === sku);
  if (!prod) return res.status(404).json({ ok: false, error: 'Produto não encontrado.' });
  const q = Math.max(1, parseInt(qty));

  try {
    const db = sb();
    if (db) {
      const { data: existing } = await db.from('cliente_carrinho').select('id,qty').eq('cliente_email', email).eq('sku', sku).single();
      if (existing) {
        await db.from('cliente_carrinho').update({ qty: q, updated_at: now() }).eq('id', existing.id);
      } else {
        await db.from('cliente_carrinho').insert({ cliente_email: email, sku, qty: q, created_at: now() });
      }
    } else {
      const carrinho = getCarrinho(email);
      const idx = carrinho.findIndex(i => i.sku === sku);
      if (idx >= 0) carrinho[idx].qty = q; else carrinho.push({ sku, qty: q });
      setCarrinho(email, carrinho);
    }
    res.json({ ok: true, message: `${prod.name} adicionado ao carrinho.`, sku, qty: q });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/carrinho/:sku', async (req, res) => {
  const email = req.user?.re;
  const { qty } = req.body;
  const q = Math.max(0, parseInt(qty));
  try {
    const db = sb();
    if (q === 0) {
      if (db) await db.from('cliente_carrinho').delete().eq('cliente_email', email).eq('sku', req.params.sku);
      else {
        const c = getCarrinho(email);
        setCarrinho(email, c.filter(i => i.sku !== req.params.sku));
      }
      return res.json({ ok: true, message: 'Item removido.' });
    }
    if (db) await db.from('cliente_carrinho').update({ qty: q }).eq('cliente_email', email).eq('sku', req.params.sku);
    else {
      const c = getCarrinho(email);
      const idx = c.findIndex(i => i.sku === req.params.sku);
      if (idx >= 0) c[idx].qty = q;
      setCarrinho(email, c);
    }
    res.json({ ok: true, qty: q });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/carrinho/:sku', async (req, res) => {
  const email = req.user?.re;
  try {
    const db = sb();
    if (db) await db.from('cliente_carrinho').delete().eq('cliente_email', email).eq('sku', req.params.sku);
    else {
      const c = getCarrinho(email);
      setCarrinho(email, c.filter(i => i.sku !== req.params.sku));
    }
    res.json({ ok: true, message: 'Item removido.' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ────────────────────────────────────────────────────────────
// PEDIDOS
// ────────────────────────────────────────────────────────────
router.post('/pedidos', async (req, res) => {
  const email = req.user?.re;
  const { obra_id, endereco_entrega, observacoes } = req.body;

  try {
    const db = sb();
    // Buscar carrinho
    let itens = [];
    if (db) {
      const { data } = await db.from('cliente_carrinho').select('*').eq('cliente_email', email);
      itens = data || [];
    } else {
      itens = getCarrinho(email);
    }

    if (itens.length === 0) return res.status(400).json({ ok: false, error: 'Carrinho vazio.' });

    // Garante catálogo atualizado antes de montar o pedido
    const catalogo = await _getCatalogo();

    // Montar itens com preços reais do Supabase
    const itensPedido = itens.map(i => {
      const p = catalogo.find(c => c.sku === i.sku);
      return { sku: i.sku, name: p?.name || i.sku, qty: i.qty, price_unit: p?.price || 0, subtotal: (p?.price || 0) * i.qty };
    });

    const subtotal = itensPedido.reduce((a, i) => a + i.subtotal, 0);
    const frete    = subtotal >= 500 ? 0 : 89.90;
    const total    = subtotal + frete;

    const pedido = {
      id:               `PED-${Date.now()}`,
      cliente_email:    email,
      cliente_nome:     req.user?.nome || email,
      obra_id:          obra_id || null,
      itens:            itensPedido,
      subtotal,
      frete,
      total,
      status:           'pending',
      endereco_entrega: endereco_entrega || '',
      observacoes:      observacoes || '',
      created_at:       now(),
      previsao_entrega: _calcPrazo(itensPedido),
    };

    if (db) {
      const { data, error } = await db.from('cliente_pedidos').insert(pedido).select().single();
      if (error) throw error;
      // Limpar carrinho
      await db.from('cliente_carrinho').delete().eq('cliente_email', email);
      // Notificação
      await _criarNotif(db, email, {
        tipo: 'pedido_criado',
        titulo: `Pedido ${pedido.id} recebido!`,
        mensagem: `${itensPedido.length} item(s) · Total: ${fmtBrl(total)}. Você receberá atualizações sobre a entrega.`,
        cor: 'orange',
      });
      return res.status(201).json({ ok: true, data });
    }

    _pedidos.push(pedido);
    setCarrinho(email, []);
    res.status(201).json({ ok: true, data: pedido });
  } catch(e) {
    logger.error('CLIENTE-PEDIDOS', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/pedidos', async (req, res) => {
  const email = req.user?.re;
  try {
    const db = sb();
    if (db) {
      const { data, error } = await db.from('cliente_pedidos').select('*').eq('cliente_email', email).order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ ok: true, data: data || [] });
    }
    res.json({ ok: true, data: _pedidos.filter(p => p.cliente_email === email) });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/pedidos/:id', async (req, res) => {
  const email = req.user?.re;
  try {
    const db = sb();
    if (db) {
      const { data, error } = await db.from('cliente_pedidos').select('*').eq('id', req.params.id).eq('cliente_email', email).single();
      if (error || !data) return res.status(404).json({ ok: false, error: 'Pedido não encontrado.' });
      return res.json({ ok: true, data });
    }
    const p = _pedidos.find(x => x.id === req.params.id && x.cliente_email === email);
    if (!p) return res.status(404).json({ ok: false, error: 'Pedido não encontrado.' });
    res.json({ ok: true, data: p });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ────────────────────────────────────────────────────────────
// NOTIFICAÇÕES
// ────────────────────────────────────────────────────────────
router.get('/notificacoes', async (req, res) => {
  const email = req.user?.re;
  try {
    const db = sb();
    if (db) {
      const { data } = await db.from('cliente_notificacoes').select('*').eq('cliente_email', email).order('created_at', { ascending: false }).limit(50);
      return res.json({ ok: true, data: data || [], nao_lidas: (data||[]).filter(n => !n.lida).length });
    }
    const notifs = _notifs.get(email) || _defaultNotifs(email);
    res.json({ ok: true, data: notifs, nao_lidas: notifs.filter(n => !n.lida).length });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/notificacoes/lidas', async (req, res) => {
  const email = req.user?.re;
  try {
    const db = sb();
    if (db) {
      await db.from('cliente_notificacoes').update({ lida: true }).eq('cliente_email', email).eq('lida', false);
    } else {
      const notifs = _notifs.get(email) || [];
      notifs.forEach(n => n.lida = true);
      _notifs.set(email, notifs);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ────────────────────────────────────────────────────────────
// ORÇAMENTOS DO CLIENTE
// ────────────────────────────────────────────────────────────
router.get('/orcamentos', async (req, res) => {
  const email = req.user?.re;
  try {
    const db = sb();
    if (db) {
      const { data } = await db.from('orcamentos_cliente').select('*').eq('cliente_email', email).order('created_at', { ascending: false }).limit(20);
      return res.json({ ok: true, data: data || [] });
    }
    res.json({ ok: true, data: [] });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ────────────────────────────────────────────────────────────
// PERFIL
// ────────────────────────────────────────────────────────────
router.get('/perfil', async (req, res) => {
  const email = req.user?.re;
  try {
    const db = sb();
    if (db) {
      const { data } = await db.from('k11_clientes').select('id,nome,email,telefone,cpf,endereco,created_at,ultimo_login').eq('email', email).single();
      return res.json({ ok: true, data: data || { email, nome: req.user?.nome } });
    }
    res.json({ ok: true, data: { email, nome: req.user?.nome || email } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/perfil', async (req, res) => {
  const email = req.user?.re;
  const { nome, telefone, cpf, endereco } = req.body;
  try {
    const db = sb();
    if (db) {
      const updates = {};
      if (nome)     updates.nome     = nome.trim();
      if (telefone) updates.telefone = telefone.trim();
      if (cpf)      updates.cpf      = cpf.trim();
      if (endereco) updates.endereco = endereco.trim();
      updates.updated_at = now();
      const { data, error } = await db.from('k11_clientes').update(updates).eq('email', email).select().single();
      if (error) throw error;
      return res.json({ ok: true, data });
    }
    res.json({ ok: true, data: { email, nome, telefone, cpf, endereco } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ────────────────────────────────────────────────────────────
// FINANCEIRO
// ────────────────────────────────────────────────────────────
router.get('/financeiro', async (req, res) => {
  const email = req.user?.re;
  try {
    const db = sb();
    let obras = [], pedidos_data = [];
    if (db) {
      const { data: o } = await db.from('obras').select('id,name,budget,total_spent,status').eq('usuario_ldap', email);
      obras = o || [];
      const { data: p } = await db.from('cliente_pedidos').select('total,status,created_at').eq('cliente_email', email);
      pedidos_data = p || [];
    } else {
      pedidos_data = _pedidos.filter(p => p.cliente_email === email);
    }

    const total_investido = pedidos_data.reduce((a, p) => a + (p.total || 0), 0);
    const total_orcamento = obras.reduce((a, o) => a + (o.budget || 0), 0);
    const total_gasto     = obras.reduce((a, o) => a + (o.total_spent || 0), 0);

    res.json({
      ok: true,
      data: {
        total_investido,
        total_orcamento,
        total_gasto,
        saldo_disponivel: total_orcamento - total_gasto,
        pedidos_mes: pedidos_data.filter(p => new Date(p.created_at) > new Date(Date.now() - 30*24*60*60*1000)).length,
        obras_financeiro: obras.map(o => ({
          ...o,
          percentual_gasto: o.budget > 0 ? Math.round((o.total_spent / o.budget) * 100) : 0,
        })),
      }
    });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ────────────────────────────────────────────────────────────
// AVALIAÇÃO
// ────────────────────────────────────────────────────────────
router.post('/avaliacao', async (req, res) => {
  const email = req.user?.re;
  const { pedido_id, nota, comentario, tipo = 'entrega' } = req.body;
  if (!pedido_id || !nota) return res.status(400).json({ ok: false, error: 'pedido_id e nota obrigatórios.' });
  try {
    const avaliacao = { id: uuid(), cliente_email: email, pedido_id, nota: parseInt(nota), comentario: comentario || '', tipo, created_at: now() };
    const db = sb();
    if (db) {
      await db.from('avaliacoes_cliente').insert(avaliacao);
    }
    logger.info('CLIENTE-AVALIACAO', `Avaliação ${nota}★ de ${email} para pedido ${pedido_id}`);
    res.json({ ok: true, message: 'Avaliação registrada. Obrigado!' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ────────────────────────────────────────────────────────────
function _calcPrazo(itens) {
  const maxPrazo = Math.max(...itens.map(i => {
    const p = _catalogoCache.find(c => c.sku === i.sku);
    return p?.prazo || 3;
  }));
  const data = new Date();
  data.setDate(data.getDate() + maxPrazo + 1);
  return data.toISOString().split('T')[0];
}

async function _criarNotif(db, email, { tipo, titulo, mensagem, cor }) {
  try {
    if (db) {
      await db.from('cliente_notificacoes').insert({ id: uuid(), cliente_email: email, tipo, titulo, mensagem, cor: cor || 'blue', lida: false, created_at: now() });
    }
  } catch(_) {}
}

function _defaultNotifs(email) {
  return [
    { id:'n1', titulo:'Bem-vindo ao Portal Obramax!', mensagem:'Sua conta foi criada. Explore o catálogo e gerencie suas obras.', cor:'orange', lida:false, created_at:now() },
    { id:'n2', titulo:'Catálogo atualizado', mensagem:'33 produtos disponíveis com entrega rápida para sua obra.', cor:'blue', lida:true, created_at:now() },
  ];
}

module.exports = router;

