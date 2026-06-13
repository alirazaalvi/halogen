import { pool } from '../../db/connection.js';
import { ScoringEngine } from '../../lib/scoring/engine.js';

const scoringEngine = new ScoringEngine();

export async function investmentAnalysisHandler(request, reply) {
  const { price, area, fee, deso_id } = request.body;

  if (!price || !area || !deso_id) {
    return reply.code(400).send({ error: 'Missing required fields' });
  }

  const areaResult = await pool.query(
    'SELECT * FROM deso_areas a JOIN neighborhood_scores s ON a.id = s.deso_id WHERE a.id = $1',
    [deso_id]
  );

  if (areaResult.rows.length === 0) {
    return reply.code(404).send({ error: 'Area not found' });
  }

  const areaData = areaResult.rows[0];
  const pricePerSqm = Math.round(price / area);
  
  const avgPricePerSqm = areaData.housing_market_score > 75 ? 65000 : 55000;
  const diff = ((pricePerSqm - avgPricePerSqm) / avgPricePerSqm) * 100;
  const marketPosition = diff > 5 ? 'Above average' : diff < -5 ? 'Below average' : 'Average';

  const affordability = price / areaData.median_income < 7 ? 'Affordable' : 'Premium';

  const riskScore = areaData.future_growth_score >= 85 ? 25 : areaData.future_growth_score >= 70 ? 45 : 65;

  return reply.send({
    metrics: {
      pricePerSqm,
      avgPricePerSqm,
      marketPosition,
      affordability,
      riskScore,
      housingScore: areaData.housing_market_score,
    },
    commute: {
      train: 18,
      car: 21,
      bike: 42,
      score: 89,
    },
    familyScore: areaData.schools_score,
  });
}