import { searchController } from './search.controller.js';

export async function searchRoutes(fastify, options) {
  fastify.get('/search', {
    schema: {
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
    }
  }, searchController);
}