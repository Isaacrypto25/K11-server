/**
 * K11 SKILL SYSTEM — Mapeamento Arquetípico de Perfis
 * ═════════════════════════════════════════════════════════════════
 * Sistema de "Eneagrama Profissional" que mapeia características,
 * habilidades e afinidades dos usuários para alocação inteligente
 * de missões e tarefas.
 * 
 * v1.0 - Núcleo do ecossistema K11 Omni
 */

'use strict';

const K11SkillSystem = (() => {
    
    // ── ARQUÉTIPOS (Os 4 Eixos Primários) ───────────────────────
    const ARCHETYPES = {
        EXECUTOR: {
            id: 'executor',
            name: 'O Construtor (Execução)',
            icon: '⚡',
            color: '#FF6B6B',
            description: 'Foco em entrega, prazos e volume de tarefas',
            primaryAttributes: ['velocidade', 'resistência', 'consistência'],
            missionTypes: ['sustentacao', 'entrega', 'volume'],
        },
        ANALYST: {
            id: 'analyst',
            name: 'O Estrategista (Análise)',
            icon: '🧠',
            color: '#4ECDC4',
            description: 'Foco em dados, lógica, detecção de erros e otimização',
            primaryAttributes: ['precisão', 'lógica', 'otimização'],
            missionTypes: ['critica', 'analise', 'validacao'],
        },
        DIPLOMAT: {
            id: 'diplomat',
            name: 'O Diplomata (Interpessoal)',
            icon: '🤝',
            color: '#FFE66D',
            description: 'Foco em comunicação, suporte ao cliente e coesão do time',
            primaryAttributes: ['empatia', 'comunicacao', 'lideranca'],
            missionTypes: ['suporte', 'relacionamento', 'mentoria'],
        },
        CREATOR: {
            id: 'creator',
            name: 'O Criativo (Inovação)',
            icon: '💡',
            color: '#95E1D3',
            description: 'Foco em novas soluções, design e melhoria de processos',
            primaryAttributes: ['criatividade', 'inovacao', 'adaptabilidade'],
            missionTypes: ['descoberta', 'inovacao', 'otimizacao'],
        },
    };

    // ── ATRIBUTOS BASE ──────────────────────────────────────────
    const ATTRIBUTES = {
        // Executor
        velocidade: { name: 'Velocidade', category: 'executor', max: 100 },
        resistencia: { name: 'Resistência', category: 'executor', max: 100 },
        consistencia: { name: 'Consistência', category: 'executor', max: 100 },
        
        // Analyst
        precisao: { name: 'Precisão', category: 'analyst', max: 100 },
        logica: { name: 'Lógica', category: 'analyst', max: 100 },
        otimizacao: { name: 'Otimização', category: 'analyst', max: 100 },
        
        // Diplomat
        empatia: { name: 'Empatia', category: 'diplomat', max: 100 },
        comunicacao: { name: 'Comunicação', category: 'diplomat', max: 100 },
        lideranca: { name: 'Liderança', category: 'diplomat', max: 100 },
        
        // Creator
        criatividade: { name: 'Criatividade', category: 'creator', max: 100 },
        inovacao: { name: 'Inovação', category: 'creator', max: 100 },
        adaptabilidade: { name: 'Adaptabilidade', category: 'creator', max: 100 },
    };

    // ── ESTRUTURA DO PERFIL ─────────────────────────────────────
    class UserProfile {
        constructor(userId, initialData = {}) {
            this.userId = userId;
            this.createdAt = new Date();
            
            // Inicializa atributos
            this.attributes = {};
            Object.keys(ATTRIBUTES).forEach(key => {
                this.attributes[key] = initialData[key] || 0;
            });

            // Histórico de ganhos
            this.skillHistory = [];
            
            // XP total
            this.totalXP = initialData.totalXP || 0;
            
            // Nível
            this.level = initialData.level || 1;
            
            // Especializações desbloqueadas
            this.specializations = initialData.specializations || [];
            
            // Badges/Certificações
            this.badges = initialData.badges || [];
        }

        // Calcula o perfil predominante (qual arquétipo o usuário mais se alinha)
        getPrimaryArchetype() {
            const archetypeScores = {};
            
            Object.values(ARCHETYPES).forEach(arch => {
                const score = arch.primaryAttributes.reduce((sum, attr) => {
                    return sum + (this.attributes[attr] || 0);
                }, 0);
                archetypeScores[arch.id] = score;
            });

            const maxArchetype = Object.entries(archetypeScores)
                .sort(([, a], [, b]) => b - a)[0];
            
            return maxArchetype ? ARCHETYPES[maxArchetype[0].toUpperCase()] : null;
        }

        // Obtém todas as arquétipos com seus scores
        getArchetypeScores() {
            const scores = {};
            
            Object.values(ARCHETYPES).forEach(arch => {
                const score = arch.primaryAttributes.reduce((sum, attr) => {
                    return sum + (this.attributes[attr] || 0);
                }, 0) / arch.primaryAttributes.length; // Média
                
                scores[arch.id] = {
                    name: arch.name,
                    score: Math.round(score),
                    color: arch.color,
                    icon: arch.icon,
                };
            });

            return scores;
        }

        // Ganha XP em um atributo
        gainXP(attributeKey, amount) {
            if (!ATTRIBUTES[attributeKey]) {
                console.error(`[K11Skill] Atributo inválido: ${attributeKey}`);
                return;
            }

            const oldValue = this.attributes[attributeKey];
            const newValue = Math.min(
                oldValue + amount,
                ATTRIBUTES[attributeKey].max
            );

            this.attributes[attributeKey] = newValue;
            this.totalXP += amount;

            // Registra no histórico
            this.skillHistory.push({
                timestamp: new Date(),
                attribute: attributeKey,
                amount: amount,
                resultValue: newValue,
                missionId: null, // Será preenchido quando ganho por missão
            });

            // Verifica avanço de nível
            this._checkLevelUp();

            return {
                attribute: attributeKey,
                oldValue,
                newValue,
                gainedXP: amount,
            };
        }

        // Ganha XP por conclusão de missão
        gainXPFromMission(missionId, attributesMap) {
            const gains = [];
            
            Object.entries(attributesMap).forEach(([attr, amount]) => {
                const result = this.gainXP(attr, amount);
                if (result) {
                    this.skillHistory[this.skillHistory.length - 1].missionId = missionId;
                    gains.push(result);
                }
            });

            return gains;
        }

        // Verifica se subiu de nível
        _checkLevelUp() {
            const nextLevelThreshold = this.level * 1000;
            if (this.totalXP >= nextLevelThreshold) {
                this.level += 1;
                this._unlockSpecialization();
                return true;
            }
            return false;
        }

        // Desbloqueia especialização ao subir de nível
        _unlockSpecialization() {
            const archetype = this.getPrimaryArchetype();
            if (!archetype) return;

            const specializationId = `${archetype.id}_level_${this.level}`;
            if (!this.specializations.includes(specializationId)) {
                this.specializations.push(specializationId);
                console.log(`[K11Skill] Nova especialização desbloqueada: ${specializationId}`);
            }
        }

        // Ganha um badge
        earnBadge(badgeId) {
            if (!this.badges.includes(badgeId)) {
                this.badges.push(badgeId);
                return true;
            }
            return false;
        }

        // Retorna o perfil em formato de dados
        toJSON() {
            return {
                userId: this.userId,
                attributes: this.attributes,
                totalXP: this.totalXP,
                level: this.level,
                primaryArchetype: this.getPrimaryArchetype(),
                archetypeScores: this.getArchetypeScores(),
                specializations: this.specializations,
                badges: this.badges,
                createdAt: this.createdAt,
            };
        }
    }

    // ── SISTEMA DE VALIDAÇÃO ────────────────────────────────────
    class SkillValidator {
        constructor() {
            this.validations = new Map();
        }

        // Registra uma validação (mentor validando a habilidade de um aprendiz)
        recordValidation(skillId, validatedBy, profileId) {
            const key = `${profileId}_${skillId}`;
            if (!this.validations.has(key)) {
                this.validations.set(key, []);
            }

            this.validations.get(key).push({
                timestamp: new Date(),
                validatedBy: validatedBy,
                count: (this.validations.get(key).length || 0) + 1,
            });
        }

        // Verifica se uma habilidade foi validada o suficiente
        isValidated(skillId, profileId, requiredValidations = 2) {
            const key = `${profileId}_${skillId}`;
            const validationCount = this.validations.get(key)?.length || 0;
            return validationCount >= requiredValidations;
        }

        // Retorna o histórico de validações
        getValidationHistory(profileId) {
            const history = {};
            for (const [key, validations] of this.validations.entries()) {
                if (key.startsWith(profileId)) {
                    history[key] = validations;
                }
            }
            return history;
        }
    }

    // ── GERAÇÃO DE GRÁFICO RADAR ────────────────────────────────
    const generateRadarData = (profile) => {
        const archetypeScores = profile.getArchetypeScores();
        return Object.entries(archetypeScores).map(([id, data]) => ({
            axis: data.icon + ' ' + data.name.split(' ')[1],
            value: data.score,
            color: data.color,
        }));
    };

    // ── API PÚBLICA ─────────────────────────────────────────────
    return {
        // Classes
        UserProfile,
        SkillValidator,

        // Constantes
        ARCHETYPES,
        ATTRIBUTES,

        // Funções
        generateRadarData,

        // Factory methods
        createProfile: (userId, initialData) => new UserProfile(userId, initialData),
        createValidator: () => new SkillValidator(),

        // Info
        getArchetype: (id) => ARCHETYPES[id.toUpperCase()],
        getAllArchetypes: () => Object.values(ARCHETYPES),
        getAllAttributes: () => ATTRIBUTES,
    };
})();

// Exporta para módulos se disponível
if (typeof module !== 'undefined' && module.exports) {
    module.exports = K11SkillSystem;
}
