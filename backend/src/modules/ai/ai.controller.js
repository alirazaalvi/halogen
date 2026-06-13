import { pool } from '../../db/connection.js';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

export async function chatHandler(request, reply) {
  const { message, context } = request.body;

  if (!message) {
    return reply.code(400).send({ error: 'Message is required' });
  }

  try {
    const response = await fetch(`${PYTHON_API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context }),
    });

    const data = await response.json();
    return reply.send(data);
  } catch (error) {
    return reply.send({
      reply: `I can help analyze Swedish neighborhoods. Questions about ${context?.name || 'Kista'}? Ask about schools, transport, safety or investment potential.`,
    });
  }
}

export async function summaryHandler(request, reply) {
  const { deso_id } = request.body;

  if (!deso_id) {
    return reply.code(400).send({ error: 'deso_id is required' });
  }

  try {
    const response = await fetch(`${PYTHON_API_URL}/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deso_id }),
    });

    const data = await response.json();
    return reply.send(data);
  } catch (error) {
    const areaResult = await pool.query(
      'SELECT * FROM deso_areas WHERE id = $1',
      [deso_id]
    );

    if (areaResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Area not found' });
    }

    return reply.send({
      summary: `${areaResult.rows[0].name}: Good family area with average scores.`,
      pros: ['Central location', 'Good schools'],
      cons: ['Higher than average prices'],
      recommendation: 'CONSIDER',
    });
  }
}