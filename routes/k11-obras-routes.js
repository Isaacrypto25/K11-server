/**
 * K11 OMNI — BACKEND ROTAS DE OBRAS
 * ═════════════════════════════════════════════════════════════════
 * Adicione estas rotas ao seu server.js ou routes file
 */

'use strict';

const express = require('express');
const router = express.Router();

// Middleware de autenticação
const authMiddleware = require('../middleware/server-auth');

// ── CRIAR OBRA ───────────────────────────────────────────────────
router.post('/obras', authMiddleware, async (req, res) => {
    try {
        const { nome, endereco, data_inicio, data_fim, area, orcamento, descricao, usuario_ldap } = req.body;

        // Validar campos obrigatórios
        if (!nome || !endereco || !data_inicio || !data_fim) {
            return res.status(400).json({
                success: false,
                message: 'Campos obrigatórios faltando: nome, endereco, data_inicio, data_fim'
            });
        }

        console.log('[K11 Obras API] Creating work:', { nome, usuario_ldap });

        // Criar obra no banco de dados
        const obraData = {
            id: 'obra_' + Date.now(),
            nome,
            endereco,
            data_inicio,
            data_fim,
            area: parseFloat(area) || 0,
            orcamento: parseFloat(orcamento) || 0,
            descricao: descricao || '',
            usuario_ldap,
            status: 'Em Progresso',
            created_at: new Date(),
            updated_at: new Date()
        };

        // Salvar no banco (exemplo com PostgreSQL)
        // const query = `
        //   INSERT INTO obras (id, nome, endereco, data_inicio, data_fim, area, orcamento, descricao, usuario_ldap, status, created_at, updated_at)
        //   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        //   RETURNING *;
        // `;
        // const result = await db.query(query, [obraData.id, ...]);

        return res.status(201).json({
            success: true,
            message: 'Obra criada com sucesso',
            obra: obraData
        });
    } catch (error) {
        console.error('[K11 Obras API] Create error:', error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao criar obra: ' + error.message
        });
    }
});

// ── LISTAR OBRAS DO USUÁRIO ──────────────────────────────────────
router.get('/obras/user/:ldap', authMiddleware, async (req, res) => {
    try {
        const { ldap } = req.params;

        console.log('[K11 Obras API] Fetching works for user:', ldap);

        // Buscar obras do usuário no banco
        // const query = `
        //   SELECT * FROM obras 
        //   WHERE usuario_ldap = $1
        //   ORDER BY created_at DESC;
        // `;
        // const result = await db.query(query, [ldap]);

        // Mock response
        const obras = [
            {
                id: 'obra_001',
                nome: 'Casa Térrea - Zona Sul',
                endereco: 'Rua das Flores, 123, Rio de Janeiro',
                data_inicio: '2025-03-01',
                data_fim: '2025-06-01',
                area: 120,
                orcamento: 150000,
                status: 'Em Progresso',
                progresso: 45
            }
        ];

        return res.json(obras);
    } catch (error) {
        console.error('[K11 Obras API] Fetch error:', error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao buscar obras'
        });
    }
});

// ── OBTER OBRA ───────────────────────────────────────────────────
router.get('/obras/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[K11 Obras API] Fetching work:', id);

        // Buscar obra específica
        // const query = 'SELECT * FROM obras WHERE id = $1;';
        // const result = await db.query(query, [id]);

        return res.json({
            id,
            nome: 'Casa Térrea - Zona Sul',
            endereco: 'Rua das Flores, 123',
            data_inicio: '2025-03-01',
            data_fim: '2025-06-01'
        });
    } catch (error) {
        console.error('[K11 Obras API] Get error:', error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao buscar obra'
        });
    }
});

// ── ATUALIZAR OBRA ───────────────────────────────────────────────
router.put('/obras/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, endereco, data_inicio, data_fim, area, orcamento, descricao, status } = req.body;

        console.log('[K11 Obras API] Updating work:', id);

        // Atualizar obra no banco
        // const query = `
        //   UPDATE obras 
        //   SET nome = $1, endereco = $2, ... 
        //   WHERE id = $3
        //   RETURNING *;
        // `;

        return res.json({
            success: true,
            message: 'Obra atualizada com sucesso'
        });
    } catch (error) {
        console.error('[K11 Obras API] Update error:', error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao atualizar obra'
        });
    }
});

// ── DELETAR OBRA ────────────────────────────────────────────────
router.delete('/obras/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[K11 Obras API] Deleting work:', id);

        // Deletar obra do banco
        // const query = 'DELETE FROM obras WHERE id = $1;';
        // await db.query(query, [id]);

        return res.json({
            success: true,
            message: 'Obra deletada com sucesso'
        });
    } catch (error) {
        console.error('[K11 Obras API] Delete error:', error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao deletar obra'
        });
    }
});

// ── LOGIN ────────────────────────────────────────────────────────
router.post('/auth/login', async (req, res) => {
    try {
        const { ldap, password } = req.body;

        console.log('[K11 Auth API] Login attempt:', ldap);

        // Validar contra LDAP ou banco
        // Em produção, integrar com serviço LDAP
        
        if (!ldap || !password) {
            return res.status(400).json({
                success: false,
                message: 'LDAP e senha são obrigatórios'
            });
        }

        // Mock validation
        const token = 'token_' + ldap + '_' + Date.now();

        return res.json({
            success: true,
            token,
            user: {
                id: ldap,
                ldap
            }
        });
    } catch (error) {
        console.error('[K11 Auth API] Login error:', error);
        return res.status(500).json({
            success: false,
            message: 'Erro ao fazer login'
        });
    }
});

module.exports = router;

// ════════════════════════════════════════════════════════════════

/**
 * COMO INTEGRAR ESTAS ROTAS NO SERVER.JS:
 * 
 * const expressobraRoutes = require('./routes/k11-obras-routes');
 * app.use('/api', obrasRoutes);
 * 
 * Agora as rotas estarão disponíveis em:
 * - POST   /api/obras                  (criar obra)
 * - GET    /api/obras/user/:ldap       (listar obras do usuário)
 * - GET    /api/obras/:id              (obter obra específica)
 * - PUT    /api/obras/:id              (atualizar obra)
 * - DELETE /api/obras/:id              (deletar obra)
 * - POST   /api/auth/login             (fazer login)
 */
