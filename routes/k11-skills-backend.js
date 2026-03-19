/**
 * K11 SKILL SYSTEM ROUTES — Backend API
 * ═════════════════════════════════════════════════════════════════
 * Endpoints para gerenciar perfis, habilidades e XP
 * 
 * Requer: express, pg (ou client Supabase)
 */

'use strict';

const express = require('express');
const router = express.Router();

// Middleware de autenticação (JWT)
const authMiddleware = require('../middleware/server-auth');

// ── SERVIÇO DE PERFIS ────────────────────────────────────────────
// Este serviço interage com o banco de dados
class ProfileService {
    constructor(dbClient) {
        this.db = dbClient;
    }

    /**
     * Cria um novo perfil de usuário
     */
    async createProfile(userId, initialAttributes) {
        try {
            const query = `
                INSERT INTO user_profiles 
                (user_id, attributes, primary_archetype, archetype_scores, created_at, updated_at)
                VALUES ($1, $2, $3, $4, NOW(), NOW())
                RETURNING *;
            `;

            const attributes = initialAttributes || {
                velocidade: 25,
                resistencia: 25,
                consistencia: 25,
                precisao: 25,
                logica: 25,
                otimizacao: 25,
                empatia: 25,
                comunicacao: 25,
                lideranca: 25,
                criatividade: 25,
                inovacao: 25,
                adaptabilidade: 25,
            };

            const scores = this._calculateArchetypeScores(attributes);

            const result = await this.db.query(query, [
                userId,
                JSON.stringify(attributes),
                scores.primary,
                JSON.stringify(scores.all)
            ]);

            return result.rows[0];
        } catch (error) {
            console.error('[ProfileService] Create error:', error);
            throw error;
        }
    }

    /**
     * Obtém um perfil existente
     */
    async getProfile(userId) {
        try {
            const query = `
                SELECT * FROM user_profiles 
                WHERE user_id = $1;
            `;

            const result = await this.db.query(query, [userId]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('[ProfileService] Get error:', error);
            throw error;
        }
    }

    /**
     * Atualiza XP de um atributo
     */
    async addXP(userId, attributeKey, amount, missionId = null) {
        try {
            const profile = await this.getProfile(userId);
            if (!profile) {
                throw new Error('Profile not found');
            }

            const attributes = profile.attributes || {};
            const oldValue = attributes[attributeKey] || 0;
            const newValue = Math.min(oldValue + amount, 100);
            const gainedXP = newValue - oldValue;

            // Atualiza atributo
            attributes[attributeKey] = newValue;
            const newTotalXP = (profile.total_xp || 0) + gainedXP;
            const newLevel = Math.floor(newTotalXP / 1000) + 1;

            // Recalcula scores dos arquetipos
            const scores = this._calculateArchetypeScores(attributes);

            // Verifica especializações desbloqueadas
            const specializations = profile.specializations || [];
            const newSpecializations = this._checkSpecializationUnlock(
                specializations,
                newLevel,
                scores.primary
            );

            // Atualiza no banco
            const updateQuery = `
                UPDATE user_profiles 
                SET 
                    attributes = $2,
                    total_xp = $3,
                    level = $4,
                    primary_archetype = $5,
                    archetype_scores = $6,
                    specializations = $7,
                    updated_at = NOW()
                WHERE user_id = $1
                RETURNING *;
            `;

            const result = await this.db.query(updateQuery, [
                userId,
                JSON.stringify(attributes),
                newTotalXP,
                newLevel,
                scores.primary,
                JSON.stringify(scores.all),
                newSpecializations
            ]);

            // Registra no xp_log (auditoria)
            await this._logXP(userId, attributeKey, gainedXP, missionId);

            return {
                success: true,
                profile: result.rows[0],
                gain: {
                    attribute: attributeKey,
                    amount: gainedXP,
                    oldValue,
                    newValue,
                    levelUp: newLevel > profile.level
                }
            };
        } catch (error) {
            console.error('[ProfileService] AddXP error:', error);
            throw error;
        }
    }

    /**
     * Registra ganho de XP na auditoria
     */
    async _logXP(userId, attribute, amount, missionId) {
        try {
            const query = `
                INSERT INTO xp_log 
                (user_id, mission_id, attribute, amount, created_at)
                VALUES ($1, $2, $3, $4, NOW());
            `;

            await this.db.query(query, [userId, missionId, attribute, amount]);
        } catch (error) {
            console.error('[ProfileService] Log error:', error);
        }
    }

    /**
     * Calcula scores dos arquetipos
     */
    _calculateArchetypeScores(attributes) {
        const EXECUTOR_ATTRS = ['velocidade', 'resistencia', 'consistencia'];
        const ANALYST_ATTRS = ['precisao', 'logica', 'otimizacao'];
        const DIPLOMAT_ATTRS = ['empatia', 'comunicacao', 'lideranca'];
        const CREATOR_ATTRS = ['criatividade', 'inovacao', 'adaptabilidade'];

        const executorScore = EXECUTOR_ATTRS.reduce((sum, attr) => 
            sum + (attributes[attr] || 0), 0) / EXECUTOR_ATTRS.length;
        const analystScore = ANALYST_ATTRS.reduce((sum, attr) => 
            sum + (attributes[attr] || 0), 0) / ANALYST_ATTRS.length;
        const diplomatScore = DIPLOMAT_ATTRS.reduce((sum, attr) => 
            sum + (attributes[attr] || 0), 0) / DIPLOMAT_ATTRS.length;
        const creatorScore = CREATOR_ATTRS.reduce((sum, attr) => 
            sum + (attributes[attr] || 0), 0) / CREATOR_ATTRS.length;

        const scores = {
            executor: Math.round(executorScore),
            analyst: Math.round(analystScore),
            diplomat: Math.round(diplomatScore),
            creator: Math.round(creatorScore),
        };

        // Arquétipo primário é o com maior score
        const primary = Object.entries(scores).sort(([,a], [,b]) => b - a)[0][0];

        return { all: scores, primary };
    }

    /**
     * Verifica novas especializações desbloqueadas
     */
    _checkSpecializationUnlock(current, level, archetype) {
        const new_spec = `${archetype}_level_${level}`;
        if (!current.includes(new_spec)) {
            current.push(new_spec);
        }
        return current;
    }

    /**
     * Obtém histórico de XP de um usuário
     */
    async getXPHistory(userId, limit = 50) {
        try {
            const query = `
                SELECT * FROM xp_log 
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2;
            `;

            const result = await this.db.query(query, [userId, limit]);
            return result.rows;
        } catch (error) {
            console.error('[ProfileService] History error:', error);
            throw error;
        }
    }

    /**
     * Ganha badge/certificação
     */
    async earnBadge(userId, badgeId) {
        try {
            const query = `
                UPDATE user_profiles 
                SET badges = array_append(badges, $2)
                WHERE user_id = $1 AND NOT badges @> ARRAY[$2]
                RETURNING *;
            `;

            const result = await this.db.query(query, [userId, badgeId]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('[ProfileService] Badge error:', error);
            throw error;
        }
    }
}

// ── ROTAS ───────────────────────────────────────────────────────

// Inicializar service (supondo pool de conexão do Supabase)
const initProfileService = (dbClient) => {
    return new ProfileService(dbClient);
};

/**
 * GET /api/skills/profile/:userId
 * Retorna o perfil completo do usuário
 */
router.get('/profile/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const service = initProfileService(req.db);

        const profile = await service.getProfile(userId);

        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json({
            userId: profile.user_id,
            level: profile.level,
            totalXP: profile.total_xp,
            attributes: profile.attributes,
            primaryArchetype: profile.primary_archetype,
            archetypeScores: profile.archetype_scores,
            specializations: profile.specializations,
            badges: profile.badges,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
        });
    } catch (error) {
        console.error('[Routes] Profile error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/skills/profile/:userId
 * Cria um novo perfil
 */
router.post('/profile/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { attributes } = req.body;
        const service = initProfileService(req.db);

        const profile = await service.createProfile(userId, attributes);

        res.status(201).json({
            message: 'Profile created successfully',
            profile: {
                userId: profile.user_id,
                level: profile.level,
                totalXP: profile.total_xp,
                attributes: profile.attributes,
            }
        });
    } catch (error) {
        console.error('[Routes] Create profile error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/skills/profile/:userId/xp
 * Adiciona XP a um atributo
 */
router.post('/profile/:userId/xp', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { attribute, amount, missionId } = req.body;

        if (!attribute || !amount) {
            return res.status(400).json({ error: 'attribute and amount required' });
        }

        const service = initProfileService(req.db);
        const result = await service.addXP(userId, attribute, amount, missionId);

        res.json(result);
    } catch (error) {
        console.error('[Routes] AddXP error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/skills/profile/:userId/history
 * Retorna o histórico de ganhos de XP
 */
router.get('/profile/:userId/history', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const service = initProfileService(req.db);

        const history = await service.getXPHistory(userId, limit);

        res.json({
            userId,
            count: history.length,
            history
        });
    } catch (error) {
        console.error('[Routes] History error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/skills/profile/:userId/badge
 * Concede um badge ao usuário
 */
router.post('/profile/:userId/badge', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { badgeId } = req.body;

        if (!badgeId) {
            return res.status(400).json({ error: 'badgeId required' });
        }

        const service = initProfileService(req.db);
        const profile = await service.earnBadge(userId, badgeId);

        res.json({
            message: 'Badge earned',
            badges: profile?.badges || []
        });
    } catch (error) {
        console.error('[Routes] Badge error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/skills/archetypes
 * Retorna informações sobre os 4 arquetipos
 */
router.get('/archetypes', (req, res) => {
    const archetypes = {
        executor: {
            id: 'executor',
            name: 'O Construtor (Execução)',
            icon: '⚡',
            color: '#FF6B6B',
            attributes: ['velocidade', 'resistencia', 'consistencia']
        },
        analyst: {
            id: 'analyst',
            name: 'O Estrategista (Análise)',
            icon: '🧠',
            color: '#4ECDC4',
            attributes: ['precisao', 'logica', 'otimizacao']
        },
        diplomat: {
            id: 'diplomat',
            name: 'O Diplomata (Interpessoal)',
            icon: '🤝',
            color: '#FFE66D',
            attributes: ['empatia', 'comunicacao', 'lideranca']
        },
        creator: {
            id: 'creator',
            name: 'O Criativo (Inovação)',
            icon: '💡',
            color: '#95E1D3',
            attributes: ['criatividade', 'inovacao', 'adaptabilidade']
        }
    };

    res.json(archetypes);
});

/**
 * GET /api/skills/attributes
 * Retorna todos os 12 atributos
 */
router.get('/attributes', (req, res) => {
    const attributes = {
        velocidade: { name: 'Velocidade', category: 'executor', max: 100 },
        resistencia: { name: 'Resistência', category: 'executor', max: 100 },
        consistencia: { name: 'Consistência', category: 'executor', max: 100 },
        precisao: { name: 'Precisão', category: 'analyst', max: 100 },
        logica: { name: 'Lógica', category: 'analyst', max: 100 },
        otimizacao: { name: 'Otimização', category: 'analyst', max: 100 },
        empatia: { name: 'Empatia', category: 'diplomat', max: 100 },
        comunicacao: { name: 'Comunicação', category: 'diplomat', max: 100 },
        lideranca: { name: 'Liderança', category: 'diplomat', max: 100 },
        criatividade: { name: 'Criatividade', category: 'creator', max: 100 },
        inovacao: { name: 'Inovação', category: 'creator', max: 100 },
        adaptabilidade: { name: 'Adaptabilidade', category: 'creator', max: 100 },
    };

    res.json(attributes);
});

module.exports = { router, ProfileService, initProfileService };
