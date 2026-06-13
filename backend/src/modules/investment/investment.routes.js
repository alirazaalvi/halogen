import { investmentAnalysisHandler } from './investment.controller.js';

export async function investmentRoutes(fastify, options) {
  fastify.post('/analyze', {
    schema: {
      body: {
        type: 'object',
        properties: {
          price: { type: 'integer', description: 'Property price in SEK' },
          area: { type: 'integer', description: 'Living area in sqm' },
          fee: { type: 'integer', description: 'Monthly fee in SEK' },
          deso_id: { type: 'string', description: 'DeSO area identifier' }
        },
        required: ['price', 'area', 'fee', 'deso_id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            metrics: {
              type: 'object',
              properties: {
                pricePerSqm: { type: 'integer' },
                avgPricePerSqm: { type: 'integer' },
                marketPosition: { type: 'string' },
                affordability: { type: 'string' },
                riskScore: { type: 'integer' },
                housingScore: { type: 'integer' }
              }
            },
            commute: {
              type: 'object',
              properties: {
                train: { type: 'integer' },
                car: { type: 'integer' },
                bike: { type: 'integer' },
                score: { type: 'integer' }
              }
            },
            familyScore: { type: 'integer' }
          }
        }
      }
    }
  }, investmentAnalysisHandler);
}