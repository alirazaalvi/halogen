import { z } from 'zod';
import { pool } from '../../db/connection.js';

const searchSchema = z.object({
  q: z.string().min(1),
});

export async function searchController(request, reply) {
  const params = searchSchema.parse(request.query);
  const { q } = params;

  const result = await pool.query(
    `SELECT a.id, a.name, a.centroid, m.name as municipality
     FROM deso_areas a
     JOIN municipalities m ON a.municipality_id = m.id
     WHERE a.name ILIKE $1 OR m.name ILIKE $1
     LIMIT 10`,
    [`%${q}%`]
  );

  return reply.send({
    results: result.rows.map(row => ({
      deso_id: row.id,
      name: row.name,
      municipality: row.municipality,
      lat: row.centroid?.y,
      lng: row.centroid?.x,
    })),
  });
}

export const searchSchema_forDocs = {
  querystring: {
    type: 'object',
    properties: {
      q: { type: 'string', description: 'Search query for address or neighborhood' }
    },
    required: ['q']
  },
  response: {
    200: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              deso_id: { type: 'string' },
              name: { type: 'string' },
              municipality: { type: 'string' },
              lat: { type: 'number' },
              lng: { type: 'number' }
            }
          }
        }
      }
    }
  }
};