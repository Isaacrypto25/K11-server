/**
 * SCHEDULE INTELLIGENCE
 * Arquivo: K11-server/routes/schedule-intelligence.js
 * Cronograma inteligente + previsão com IA
 */

const express = require('express');
const router = express.Router();
const logger = require('../services/logger');
const datastore = require('../services/datastore');
function getSupabase() { return datastore.supabase || null; }
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Templates de fases padrão
const PHASE_TEMPLATES = {
  fundacao: {
    name: 'Fundação',
    duration_days: 20,
    materials: [
      { sku: 'CIM001', quantity_per_m2: 1.5 },
      { sku: 'ARE001', quantity_per_m2: 0.8 },
      { sku: 'BRI001', quantity_per_m2: 0.4 }
    ]
  },
  estrutura: {
    name: 'Estrutura',
    duration_days: 30,
    materials: [
      { sku: 'CIM001', quantity_per_m2: 2.0 }
    ]
  },
  alvenaria: {
    name: 'Alvenaria',
    duration_days: 45,
    materials: [
      { sku: 'BRI001', quantity_per_m2: 1.2 },
      { sku: 'ARE001', quantity_per_m2: 1.0 }
    ]
  },
  reboco: {
    name: 'Reboco',
    duration_days: 30,
    materials: [
      { sku: 'CIM001', quantity_per_m2: 1.2 },
      { sku: 'ARE001', quantity_per_m2: 1.5 },
      { sku: 'REB001', quantity_per_m2: 0.5 }
    ]
  },
  pintura: {
    name: 'Pintura',
    duration_days: 15,
    materials: []
  }
};

// POST /api/schedule/phases - Criar fase com materiais
router.post('/phases', async (req, res) => {
  try {
    const { project_id, phase_type, start_date, area_m2 } = req.body;

    if (!project_id || !phase_type || !start_date || !area_m2) {
      return res.status(400).json({ error: 'Campos obrigatórios: project_id, phase_type, start_date, area_m2' });
    }

    const template = PHASE_TEMPLATES[phase_type];
    if (!template) {
      return res.status(400).json({ error: `Tipo de fase inválido: ${phase_type}` });
    }

    // Calcular data de término
    const startDate = new Date(start_date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + template.duration_days);

    // Criar fase
    const { data: phase, error: phaseError } = await getSupabase()
      .from('phases')
      .insert({
        project_id,
        name: template.name,
        start_date,
        predicted_end_date: endDate.toISOString().split('T')[0],
        estimated_days: template.duration_days,
        status: 'pending'
      })
      .select()
      .single();

    if (phaseError) throw phaseError;

    // Inserir materiais
    const suggestedMaterials = [];
    for (const material of template.materials) {
      const quantity = material.quantity_per_m2 * area_m2;
      
      const { error: matError } = await getSupabase()
        .from('phase_materials')
        .insert({
          phase_id: phase.id,
          sku_obramax: material.sku,
          quantity_estimated: quantity,
          unit_price: 0 // Será preenchido por sincronização
        });

      if (!matError) {
        suggestedMaterials.push({
          sku: material.sku,
          quantity: quantity.toFixed(2)
        });
      }
    }

    logger.info('SCHEDULE', `Fase criada: ${phase.name} (${phase.id})`);

    res.json({
      success: true,
      phase: {
        id: phase.id,
        name: phase.name,
        start_date: phase.start_date,
        predicted_end_date: phase.predicted_end_date
      },
      suggested_materials: suggestedMaterials,
      message: `${template.name} criada com ${suggestedMaterials.length} materiais`
    });
  } catch (error) {
    logger.error('SCHEDULE_CREATE', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/schedule/phases/:project_id - Listar fases
router.get('/phases/:project_id', async (req, res) => {
  try {
    const { project_id } = req.params;

    const { data: phases, error } = await getSupabase()
      .from('phases')
      .select('*')
      .eq('project_id', project_id)
      .order('start_date', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data: phases,
      total: phases.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/schedule/:phase_id/materials - Materiais de uma fase
router.get('/:phase_id/materials', async (req, res) => {
  try {
    const { phase_id } = req.params;

    const { data: materials, error } = await getSupabase()
      .from('phase_materials')
      .select('*')
      .eq('phase_id', phase_id);

    if (error) throw error;

    res.json({
      success: true,
      data: materials,
      total: materials.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/schedule/predict-delays - IA previne atrasos
router.post('/predict-delays', async (req, res) => {
  try {
    const { project_id } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id requerido' });
    }

    // Buscar projeto e fases
    const { data: project, error: projError } = await getSupabase()
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single();

    if (projError) throw projError;

    const { data: phases, error: phasesError } = await getSupabase()
      .from('phases')
      .select('*')
      .eq('project_id', project_id);

    if (phasesError) throw phasesError;

    // Montar contexto para IA
    const phaseInfo = phases
      .map(p => `${p.name}: ${p.start_date} a ${p.predicted_end_date} (${p.estimated_days} dias)`)
      .join('\n');

    // Chamar Claude para análise
    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Você é expert em cronogramas de obra. Analise:

PROJETO: ${project.name}
DATA ATUAL: ${new Date().toISOString().split('T')[0]}

CRONOGRAMA:
${phaseInfo}

Identifique (JSON):
{
  "risk_level": "low|medium|high|critical",
  "at_risk_phases": ["fase com risco"],
  "critical_materials": [{"sku": "SKU", "buy_days": 3}],
  "recommendations": ["ação"]
}`
        }
      ]
    });

    let analysis = {
      risk_level: 'medium',
      at_risk_phases: [],
      critical_materials: [],
      recommendations: []
    };

    try {
      const content = message.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      logger.warn('PREDICT', 'Não foi possível parsear resposta IA');
    }

    // Criar alertas
    for (const material of analysis.critical_materials) {
      await getSupabase().from('ai_alerts').insert({
        project_id,
        alert_type: 'stock_critical',
        message: `Material crítico: ${material.sku} (comprar em ${material.buy_days} dias)`,
        severity: material.buy_days <= 3 ? 'critical' : 'high',
        data: material,
        resolved: false
      });
    }

    logger.info('PREDICT', `${analysis.at_risk_phases.length} fases com risco`);

    res.json({
      success: true,
      analysis,
      alerts_created: analysis.critical_materials.length
    });
  } catch (error) {
    logger.error('PREDICT_DELAYS', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/schedule/:phase_id/update-progress - Atualizar progresso
router.post('/:phase_id/update-progress', async (req, res) => {
  try {
    const { phase_id } = req.params;
    const { progress_percent } = req.body;

    if (progress_percent === undefined || progress_percent < 0 || progress_percent > 100) {
      return res.status(400).json({ error: 'progress_percent deve estar entre 0 e 100' });
    }

    const { data: phase, error } = await getSupabase()
      .from('phases')
      .update({ progress_percent })
      .eq('id', phase_id)
      .select()
      .single();

    if (error) throw error;

    // Determinar status
    let status = 'pending';
    if (progress_percent > 0) status = 'in_progress';
    if (progress_percent === 100) status = 'completed';

    await getSupabase()
      .from('phases')
      .update({ status })
      .eq('id', phase_id);

    res.json({
      success: true,
      phase: phase,
      status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/schedule/simulate-timeline - Simular atraso/adianto
router.post('/simulate-timeline', async (req, res) => {
  try {
    const { project_id, days_delay } = req.body;

    if (!project_id || typeof days_delay !== 'number') {
      return res.status(400).json({ error: 'project_id e days_delay requeridos' });
    }

    const { data: phases, error } = await getSupabase()
      .from('phases')
      .select('*')
      .eq('project_id', project_id);

    if (error) throw error;

    const updated = phases.map(phase => {
      const newEndDate = new Date(phase.predicted_end_date);
      newEndDate.setDate(newEndDate.getDate() + days_delay);
      
      return {
        ...phase,
        new_predicted_end: newEndDate.toISOString().split('T')[0],
        delay_days: days_delay
      };
    });

    res.json({
      success: true,
      simulation: updated,
      new_project_end: new Date(
        new Date(phases[phases.length - 1].predicted_end_date).getTime() + days_delay * 24 * 60 * 60 * 1000
      ).toISOString().split('T')[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
