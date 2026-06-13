import { getNeighborhoodHandler, getNeighborhoodScoreHandler } from './neighborhood.controller.js';

export async function neighborhoodRoutes(fastify, options) {
  fastify.get('/neighborhood/:deso_id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          deso_id: { type: 'string', description: 'DeSO area identifier' }
        },
        required: ['deso_id']
      }
    }
  }, getNeighborhoodHandler);

  fastify.get('/neighborhood-score', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          deso_id: { type: 'string', description: 'DeSO area identifier' }
        },
        required: ['deso_id']
      }
    }
  }, getNeighborhoodScoreHandler);
}