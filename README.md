# K11 OMNI ELITE — Guia de Deploy e Setup

```
╔═══════════════════════════════════════════════════╗
║      K11 OMNI ELITE · AI Stack v3 · v2.0.0        ║
║      Node.js · Express · Supabase · Claude AI     ║
╚═══════════════════════════════════════════════════╝
```

## 📋 Pré-requisitos

| Serviço | Obrigatório | Link |
|---------|-------------|------|
| Node.js ≥ 18 | ✅ | nodejs.org |
| Supabase (projeto criado) | ✅ | supabase.com |
| Anthropic API Key | ✅ | console.anthropic.com |
| Groq API Key | Recomendado | console.groq.com |
| Gmail App Password | Para registro de usuários | myaccount.google.com |

---

## 🚀 Setup em 5 passos

### 1. Clone e instale

```bash
cd K11-server
npm install
```

### 2. Configure o .env

Copie o template e preencha:

```bash
cp env .env
```

Campos obrigatórios:
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJhb...            ← anon key (para auth pública)
SUPABASE_SERVICE_KEY=eyJhb...    ← service_role key (para o backend)
SUPABASE_JWT_SECRET=...          ← JWT secret do projeto
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=<string longa aleatória>
```

### 3. Crie o schema no Supabase

No Supabase → SQL Editor → cole e execute o arquivo inteiro:

```
docs/schema.sql
```

### 4. Crie os usuários iniciais

```bash
python3 k11-create-users.py --seed
```

Para criar um usuário específico:
```bash
python3 k11-create-users.py --ldap 73001234 --nome "João Silva" --email "jsilva@obramax.com.br" --pin 12345678 --role operacional --loja "Tijuca"
```

### 5. Inicie o servidor

```bash
# Produção
npm start

# Desenvolvimento (com hot-reload)
npm run dev
```

Acesse: `http://localhost:3000`

---

## 🚂 Deploy Railway

1. **Crie um novo projeto** em railway.app
2. **Conecte o repositório** Git
3. **Adicione as variáveis de ambiente** em Settings → Variables (use o template do `.env`)
4. **Defina o comando de start**: já configurado no `Procfile` e `railway.json`
5. **Deploy** → Railway detecta Node.js automaticamente

> O Railway injeta `PORT` automaticamente. O servidor já usa `process.env.PORT`.

---

## 📁 Estrutura de arquivos

```
K11-server/
├── server.js                    ← Entry point principal
├── package.json
├── Procfile                     ← Railway/Heroku start command
├── railway.json                 ← Config Railway
├── .env                         ← Variáveis de ambiente (NÃO commitar)
├── env                          ← Template do .env
├── k11-create-users.py          ← Provisionamento de usuários
│
├── middleware/
│   ├── server-auth.js           ← JWT + PBKDF2 auth
│   ├── server-register.js       ← Cadastro com email de confirmação
│   ├── k11-cliente-auth.js      ← Auth do portal do cliente
│   ├── k11-auth-ui.js           ← UI de login (também em public/)
│   └── request-tracker.js       ← Métricas de requisições
│
├── routes/
│   ├── data.js                  ← CRUD de datasets
│   ├── system.js                ← Status, logs, SSE
│   ├── ai.js                    ← AI routes legacy
│   ├── k11-cliente-routes.js    ← Portal do cliente
│   ├── k11_supervisor_backend.js← Supervisor com Groq
│   ├── k11_ai_core.js           ← AI Core v3 (Claude)
│   ├── k11_pdv_domination_engine.js
│   ├── k11_price_intelligence.js
│   ├── k11_decision_engine.js   ← Health scores + forecasts
│   └── skills-missions.js       ← Sistema de habilidades e missões
│
├── services/
│   ├── logger.js                ← Logger com SSE + buffer
│   ├── datastore.js             ← Supabase + cache
│   └── ai-supervisor.js         ← Análise de saúde (Groq)
│
├── public/                      ← Frontend estático
│   ├── index.html               ← Login (portal de entrada)
│   ├── dashboard.html           ← Dashboard principal
│   ├── k11-config.js            ← ⭐ Configs globais (K11Auth, K11_SERVER_URL)
│   ├── k11-utils.js             ← ⭐ Utilitários (esc, debounce, brl...)
│   ├── k11-auth-ui.js           ← UI de login completa
│   ├── k11-skill-system.js      ← ⭐ Sistema de arquétipos e XP
│   ├── k11-mission-engine.js    ← ⭐ Marketplace de missões
│   ├── k11-app.js               ← Bootstrap e navegação
│   ├── k11-ui.js                ← Componentes de UI
│   ├── k11-processors.js        ← Processadores de dados
│   ├── k11-actions-.js          ← Handlers de ações (nome histórico)
│   ├── k11-actions-v2.js        ← Alias limpo do actions
│   ├── k11-actions-extras-v5.js ← Ações extras
│   ├── k11-brain-auxiliar.js    ← Brain auxiliar
│   ├── k11-data-inject.js       ← Injeção de dados do servidor
│   ├── k11-live-panel.js        ← Painel em tempo real (SSE)
│   ├── k11-float-ai.js          ← Widget flutuante de IA
│   ├── k11-voice-id.js          ← Reconhecimento de voz
│   ├── k11-key-voice.js         ← Gerenciamento de chave de voz
│   ├── k11-menu-expandable.js   ← Menu expansível
│   ├── k11-modal-regional.js    ← Modal regional
│   ├── k11-onboarding-modal.js  ← Onboarding
│   ├── k11-user-profile.js      ← UI do perfil de habilidades
│   ├── k11-orcamento-ia.js      ← Widget de orçamento IA
│   ├── global.css               ← Design system CSS
│   ├── k11-skill-styles.css     ← Estilos do skill system
│   ├── manifest.json            ← PWA manifest
│   ├── favicon.png
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       └── apple-touch-icon.png
│
└── docs/
    ├── schema.sql               ← ⭐ Migrations completas do Supabase
    ├── ARCHITECTURE.md
    ├── INTEGRATION_GUIDE.md
    └── ...
```

---

## 🔑 Endpoints principais

### Públicos (sem auth)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check rápido |
| GET | `/api/status` | Status do sistema |
| POST | `/api/auth/login` | Login colaborador |
| POST | `/api/auth/register` | Cadastro |
| POST | `/api/auth/cliente/login` | Login cliente |

### Protegidos (Bearer token)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/ai/v3/chat` | Chat com AI Core v3 |
| GET | `/api/ai/v3/stream` | SSE alertas proativos |
| GET | `/api/decision/state` | Estado do Decision Engine |
| GET | `/api/price-intel/state` | Preços monitorados |
| POST | `/api/obramax/projects` | Criar obra |
| POST | `/api/orcamento/gerar` | Gerar orçamento com IA |

### Portal do cliente
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/cliente/obras` | Obras do cliente |
| GET | `/api/cliente/chat/:obra_id` | Chat da obra |

---

## 🧠 Ordem de carregamento dos scripts (frontend)

```
k11-config.js      ← base: K11Auth, K11_SERVER_URL, brl()
k11-utils.js       ← esc(), debounce(), DEBOUNCE_DELAY_MS, TOAST_DURATION_MS
k11-skill-system.js
k11-mission-engine.js
k11-processors.js
k11-ui.js
k11-brain-auxiliar.js
k11-data-inject.js
k11-actions-.js
k11-actions-extras-v5.js
k11-menu-expandable.js
k11-modal-regional.js
k11-onboarding-modal.js
k11-user-profile.js
k11-orcamento-ia.js
k11-live-panel.js
k11-float-ai.js
k11-voice-id.js
k11-key-voice.js
k11-app.js         ← inicializa APP e chama APP.init()
```

---

## 🐛 Troubleshooting

**Servidor não inicia — "Cannot find module './services/logger'"**
→ Rode `npm install` na pasta `K11-server/`

**401 em todas as rotas**
→ Configure `JWT_SECRET` no `.env` (string longa aleatória)

**Supabase: "relation does not exist"**
→ Execute `docs/schema.sql` no SQL Editor do Supabase

**Usuário não consegue fazer login**
→ Rode `python3 k11-create-users.py --seed` para criar os usuários iniciais

**k11-config.js "K11_SERVER_URL is not defined"**
→ `k11-config.js` deve ser o **primeiro** script carregado no HTML

---

## 🔐 Segurança

- Senhas/PINs nunca trafegam em texto claro — apenas hashes PBKDF2-SHA256
- JWT assinado com HS256 — expiração padrão 8h
- Rate limiting: 120 req/min por IP nas rotas `/api/*`
- CORS configurado: apenas localhost, Railway e origens definidas em `CORS_ORIGIN`
- Helmet habilitado com CSP flexível para assets externos
- RLS habilitado no Supabase — backend usa `service_role` que bypassa RLS
