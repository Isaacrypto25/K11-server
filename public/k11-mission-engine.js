/**
 * K11 MISSION ENGINE — Marketplace Dinâmico de Tarefas
 * ═════════════════════════════════════════════════════════════════
 * Sistema de distribuição inteligente de missões baseado em
 * perfis de habilidades, requisitos de nível e afinidade arquetípica.
 * 
 * v1.0 - Núcleo do ecossistema K11 Omni
 */

'use strict';

const K11MissionEngine = (() => {

    // ── TIPOS DE MISSÃO ─────────────────────────────────────────
    const MISSION_TYPES = {
        // Sustentação
        SUSTENTACAO: {
            id: 'sustentacao',
            name: 'Missão de Sustentação',
            icon: '⚙️',
            baseXPReward: 100,
            targetArchetype: 'executor',
            riskLevel: 'baixo',
            description: 'Tarefas de manutenção e operação contínua do sistema',
        },
        
        // Descoberta
        DESCOBERTA: {
            id: 'descoberta',
            name: 'Missão de Descoberta',
            icon: '🔍',
            baseXPReward: 250,
            targetArchetype: 'creator',
            riskLevel: 'medio',
            description: 'Exploração de novas soluções e melhorias de processo',
        },
        
        // Crítica
        CRITICA: {
            id: 'critica',
            name: 'Missão Crítica',
            icon: '⚠️',
            baseXPReward: 500,
            targetArchetype: 'analyst',
            riskLevel: 'alto',
            description: 'Tarefas que exigem alta precisão e análise',
            minLevel: 3,
        },
        
        // Suporte
        SUPORTE: {
            id: 'suporte',
            name: 'Missão de Suporte',
            icon: '🤝',
            baseXPReward: 150,
            targetArchetype: 'diplomat',
            riskLevel: 'baixo',
            description: 'Assistência ao cliente e suporte interno',
        },

        // Mentoria
        MENTORIA: {
            id: 'mentoria',
            name: 'Missão de Mentoria',
            icon: '👨‍🏫',
            baseXPReward: 200,
            targetArchetype: 'diplomat',
            riskLevel: 'medio',
            description: 'Ensinar outros usuários com nível inferior',
            minLevel: 5,
        },
    };

    // ── REQUISITOS DE MISSÃO ────────────────────────────────────
    class MissionRequirements {
        constructor(config = {}) {
            this.minLevel = config.minLevel || 1;
            this.requiredAttributes = config.requiredAttributes || {};
            this.targetArchetype = config.targetArchetype;
            this.mandatorySpecializations = config.mandatorySpecializations || [];
            this.maxTeamSize = config.maxTeamSize || 1;
            this.deadlineDays = config.deadlineDays || 7;
        }

        // Verifica se um usuário atende aos requisitos
        validate(userProfile) {
            // Verifica nível
            if (userProfile.level < this.minLevel) {
                return {
                    isValid: false,
                    reason: `Nível insuficiente. Requerido: ${this.minLevel}, Seu nível: ${userProfile.level}`,
                };
            }

            // Verifica atributos
            for (const [attr, requiredValue] of Object.entries(this.requiredAttributes)) {
                const userValue = userProfile.attributes[attr] || 0;
                if (userValue < requiredValue) {
                    return {
                        isValid: false,
                        reason: `Atributo ${attr} insuficiente. Requerido: ${requiredValue}, Seu valor: ${userValue}`,
                    };
                }
            }

            // Verifica especializações
            for (const spec of this.mandatorySpecializations) {
                if (!userProfile.specializations.includes(spec)) {
                    return {
                        isValid: false,
                        reason: `Especialização faltando: ${spec}`,
                    };
                }
            }

            return { isValid: true };
        }

        // Calcula a afinidade (quanto melhor o perfil, mais afinidade)
        calculateAffinity(userProfile) {
            let affinityScore = 50; // Base 50%

            // Bônus de nível
            affinityScore += (userProfile.level - this.minLevel) * 5;

            // Bônus por atributos excedentes
            let excedentXP = 0;
            for (const [attr, required] of Object.entries(this.requiredAttributes)) {
                const userValue = userProfile.attributes[attr] || 0;
                excedentXP += Math.max(0, userValue - required);
            }
            affinityScore += Math.min(excedentXP / 5, 20); // Max 20 pontos

            // Bônus por arquétipo alinhado
            if (this.targetArchetype) {
                const primaryArch = userProfile.getPrimaryArchetype();
                if (primaryArch?.id === this.targetArchetype) {
                    affinityScore += 15;
                }
            }

            return Math.min(affinityScore, 100); // Cap em 100
        }

        toJSON() {
            return {
                minLevel: this.minLevel,
                requiredAttributes: this.requiredAttributes,
                targetArchetype: this.targetArchetype,
                mandatorySpecializations: this.mandatorySpecializations,
                maxTeamSize: this.maxTeamSize,
                deadlineDays: this.deadlineDays,
            };
        }
    }

    // ── ESTRUTURA DA MISSÃO ─────────────────────────────────────
    class Mission {
        constructor(missionConfig) {
            this.id = missionConfig.id || `mission_${Date.now()}`;
            this.title = missionConfig.title;
            this.description = missionConfig.description;
            this.type = missionConfig.type; // MISSION_TYPES
            this.requirements = new MissionRequirements(missionConfig.requirements);
            
            this.createdAt = new Date();
            this.deadline = new Date(Date.now() + this.requirements.deadlineDays * 24 * 60 * 60 * 1000);
            
            // Status: draft, published, in_progress, completed, cancelled
            this.status = 'draft';
            
            // Recompensas
            this.baseXPReward = missionConfig.baseXPReward || this.type.baseXPReward;
            this.xpMultiplier = missionConfig.xpMultiplier || 1.0; // Pode ser ajustado por urgência
            this.bonusReward = missionConfig.bonusReward || null;
            
            // Participantes
            this.assignedUsers = [];
            this.maxParticipants = this.requirements.maxTeamSize;
            
            // Mentoria
            this.mentorId = missionConfig.mentorId || null;
            this.isMentorshipMission = missionConfig.isMentorshipMission || false;
            
            // Compartimento (área de negócio)
            this.compartment = missionConfig.compartment || 'geral';
        }

        // Publica a missão para seleção
        publish() {
            this.status = 'published';
            this.publishedAt = new Date();
        }

        // Verifica afinidade de um usuário para esta missão
        checkAffinity(userProfile) {
            const validation = this.requirements.validate(userProfile);
            if (!validation.isValid) {
                return {
                    canAccept: false,
                    affinity: 0,
                    reason: validation.reason,
                };
            }

            const affinity = this.requirements.calculateAffinity(userProfile);
            return {
                canAccept: true,
                affinity: affinity,
                reason: `Afinidade: ${affinity}%`,
            };
        }

        // Adiciona um usuário à missão
        assignUser(userId, mentorId = null) {
            if (this.assignedUsers.length >= this.maxParticipants) {
                return { success: false, reason: 'Missão cheia' };
            }

            if (this.assignedUsers.find(u => u.userId === userId)) {
                return { success: false, reason: 'Usuário já atribuído' };
            }

            this.assignedUsers.push({
                userId,
                assignedAt: new Date(),
                mentorId: mentorId,
                status: 'in_progress',
                completedAt: null,
            });

            return { success: true };
        }

        // Marca a missão como completa para um usuário
        completeForUser(userId, feedback = {}) {
            const assignment = this.assignedUsers.find(u => u.userId === userId);
            if (!assignment) {
                return { success: false, reason: 'Usuário não atribuído' };
            }

            assignment.status = 'completed';
            assignment.completedAt = new Date();
            assignment.feedback = feedback;

            // Verifica se todos completaram
            if (this.assignedUsers.every(u => u.status === 'completed')) {
                this.status = 'completed';
            }

            return { success: true };
        }

        // Calcula XP com base em fatores
        calculateFinalXP(userProfile) {
            let finalXP = this.baseXPReward * this.xpMultiplier;

            // Bônus por nivel excedente (aprendiz com mentor)
            if (this.isMentorshipMission && this.mentorId) {
                finalXP *= 0.75; // Reduz XP do aprendiz
                finalXP *= 1.25; // Mas aumenta o do mentor no futuro
            }

            // Bônus por entrega antecipada
            const daysLeft = (this.deadline - new Date()) / (24 * 60 * 60 * 1000);
            if (daysLeft > this.requirements.deadlineDays * 0.5) {
                finalXP *= 1.15;
            }

            return Math.round(finalXP);
        }

        toJSON() {
            return {
                id: this.id,
                title: this.title,
                description: this.description,
                type: this.type.id,
                requirements: this.requirements.toJSON(),
                status: this.status,
                baseXPReward: this.baseXPReward,
                xpMultiplier: this.xpMultiplier,
                deadline: this.deadline,
                assignedUsers: this.assignedUsers,
                mentorId: this.mentorId,
                isMentorshipMission: this.isMentorshipMission,
                compartment: this.compartment,
            };
        }
    }

    // ── MARKETPLACE DE MISSÕES ──────────────────────────────────
    class MissionMarketplace {
        constructor() {
            this.missions = new Map();
            this.userMatches = new Map(); // Recomendações por usuário
        }

        // Adiciona uma nova missão
        addMission(missionConfig) {
            const mission = new Mission(missionConfig);
            this.missions.set(mission.id, mission);
            return mission;
        }

        // Publica uma missão
        publishMission(missionId) {
            const mission = this.missions.get(missionId);
            if (mission) {
                mission.publish();
                this._updateMatchesForMission(missionId);
                return true;
            }
            return false;
        }

        // Encontra as melhores missões para um usuário
        findBestMissions(userProfile, limit = 5) {
            const matches = [];

            for (const mission of this.missions.values()) {
                if (mission.status !== 'published') continue;

                const affinity = mission.checkAffinity(userProfile);
                if (affinity.canAccept) {
                    matches.push({
                        mission,
                        affinity: affinity.affinity,
                    });
                }
            }

            // Ordena por afinidade decrescente
            matches.sort((a, b) => b.affinity - a.affinity);

            return matches.slice(0, limit).map(m => ({
                ...m.mission.toJSON(),
                affinityScore: m.affinity,
            }));
        }

        // Recomenda um mentor para aprendiz
        findMentorForNovice(novaUserProfile) {
            if (novaUserProfile.level >= 5) {
                return null; // Não é mais novato
            }

            const potentialMentors = [];

            // Procura usuários que completaram muitas missões
            // Esta é uma simplificação - em produção, seria baseado em dados
            // de usuários do sistema

            return potentialMentors;
        }

        // Atualiza recomendações ao publicar uma missão
        _updateMatchesForMission(missionId) {
            // Em produção, isso consultaria o banco de dados
            // e atualizaria recomendações para todos os usuários
        }

        // Obtém estatísticas do marketplace
        getStats() {
            const published = Array.from(this.missions.values()).filter(m => m.status === 'published').length;
            const completed = Array.from(this.missions.values()).filter(m => m.status === 'completed').length;
            const inProgress = Array.from(this.missions.values()).filter(m => m.status === 'in_progress').length;

            return {
                total: this.missions.size,
                published,
                completed,
                inProgress,
                drafted: this.missions.size - published,
            };
        }
    }

    // ── API PÚBLICA ─────────────────────────────────────────────
    return {
        // Classes
        Mission,
        MissionRequirements,
        MissionMarketplace,

        // Constantes
        MISSION_TYPES,

        // Factory methods
        createMission: (config) => new Mission(config),
        createMarketplace: () => new MissionMarketplace(),

        // Info
        getMissionType: (id) => MISSION_TYPES[id.toUpperCase()],
        getAllMissionTypes: () => Object.values(MISSION_TYPES),
    };
})();

// Exporta para módulos se disponível
if (typeof module !== 'undefined' && module.exports) {
    module.exports = K11MissionEngine;
}
