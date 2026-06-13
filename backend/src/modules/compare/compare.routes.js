import { compareHandler } from './compare.controller.js';

export async function compareRoutes(fastify, options) {
  fastify.get('/compare', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          a: { type: 'string', description: 'First DeSO area identifier' },
          b: { type: 'string', description: 'Second DeSO area identifier' }
        },
        required: ['a', 'b']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            comparison: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  deso_id: { type: 'string' },
                  scores: {
                    type: 'object',
                    properties: {
                      overall: { type: 'integer' },
                      transport: { type: 'integer' },
                      schools: { type: 'integer' },
                      safety: { type: 'integer' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, compareHandler);
}