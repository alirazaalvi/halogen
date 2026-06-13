import { pool } from '../../db/connection.js';

export async function compareHandler(request, reply) {
  const { a, b } = request.query;

  if (!a || !b) {
    return reply.code(400).send({ error: 'Both area IDs required' });
  }

  const result = await pool.query(
    `SELECT n.* FROM neighborhood_scores n 
     WHERE n.deso_id IN ($1, $2)`,
    [a, b]
  );

  if (result.rows.length < 2) {
    return reply.code(404).send({ error: 'One or both areas not found' });
  }

  const scoresA = result.rows.find(r => r.deso_id === a);
  const scoresB = result.rows.find(r => r.deso_id === b);

  return reply.send({
    comparison: [
      {
        deso_id: a,
        scores: {
          overall: scoresA.overall_score,
          transport: scoresA.transport_score,
          schools: scoresA.schools_score,
          safety: scoresA.safety_score,
        },
      },
      {
        deso_id: b,
        scores: {
          overall: scoresB.overall_score,
          transport: scoresB.transport_score,
          schools: scoresB.schools_score,
          safety: scoresB.safety_score,
        },
      },
    ],
  });
}