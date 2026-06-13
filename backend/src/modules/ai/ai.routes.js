import { chatHandler, summaryHandler } from './ai.controller.js';

export async function aiRoutes(fastify, options) {
  fastify.post('/chat', {
    schema: {
      body: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Chat message' },
          context: { type: 'object' }
        },
        required: ['message']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            reply: { type: 'string' }
          }
        }
      }
    }
  }, chatHandler);

  fastify.post('/summary', {
    schema: {
      body: {
        type: 'object',
        properties: {
          deso_id: { type: 'string', description: 'DeSO area identifier' }
        },
        required: ['deso_id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } },
            recommendation: { type: 'string' }
          }
        }
      }
    }
  }, summaryHandler);
}