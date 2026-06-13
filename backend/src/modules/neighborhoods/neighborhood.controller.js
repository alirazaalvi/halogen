import { pool } from '../../db/connection.js';
import { ScoringEngine } from '../../lib/scoring/engine.js';

const scoringEngine = new ScoringEngine();

export async function getNeighborhoodHandler(request, reply) {
  const { deso_id } = request.params;

  const areaResult = await pool.query(
    'SELECT * FROM deso_areas WHERE id = $1',
    [deso_id]
  );

  if (areaResult.rows.length === 0) {
    return reply.code(404).send({ error: 'Area not found' });
  }

  const area = areaResult.rows[0];

  const scoreResult = await pool.query(
    'SELECT * FROM neighborhood_scores WHERE deso_id = $1',
    [deso_id]
  );

  const scores = scoreResult.rows[0] || { overall_score: 0 };

  return reply.send({
    area: {
      id: area.id,
      name: area.name,
      municipality: area.municipality_id,
      population: area.population,
      coordinates: {
        lat: area.centroid?.y,
        lng: area.centroid?.x,
      },
    },
    scores: {
      overall: scores.overall_score,
      demographics: scores.demographics_score,
      housing: scores.housing_market_score,
      transport: scores.transport_score,
      schools: scores.schools_score,
      safety: scores.safety_score,
      green: scores.green_areas_score,
      growth: scores.future_growth_score,
    },
  });
}

export async function getNeighborhoodScoreHandler(request, reply) {
  const { deso_id } = request.params;

  const result = await pool.query(
    'SELECT * FROM neighborhood_scores WHERE deso_id = $1',
    [deso_id]
  );

  if (result.rows.length === 0) {
    return reply.code(404).send({ error: 'Area not found' });
  }

  const scores = result.rows[0];
  return reply.send({
    score: scores.overall_score,
    transport: scores.transport_score,
    schools: scores.schools_score,
    safety: scores.safety_score,
    housing: scores.housing_market_score,
    green: scores.green_areas_score,
    growth: scores.future_growth_score,
  });
}