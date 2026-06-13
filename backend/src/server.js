import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import dotenv from 'dotenv';
import { searchRoutes } from './modules/search/search.routes.js';
import { neighborhoodRoutes } from './modules/neighborhoods/neighborhood.routes.js';
import { investmentRoutes } from './modules/investment/investment.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { ingestRoutes } from './modules/ingest/ingest.routes.js';
import { compareRoutes } from './modules/compare/compare.routes.js';

dotenv.config();

const server = Fastify({
  logger: true,
});

await server.register(cors, {
  origin: true,
});

await server.register(swagger, {
  openapi: {
    info: {
      title: 'Swedish Neighborhood Intelligence API',
      description: 'Backend API for neighborhood intelligence and property analysis',
      version: '1.0.0',
    },
  },
});

await server.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
});

server.register(searchRoutes, { prefix: '/api' });
server.register(neighborhoodRoutes, { prefix: '/api' });
server.register(investmentRoutes, { prefix: '/api/investment' });
server.register(aiRoutes, { prefix: '/api/ai' });
server.register(ingestRoutes, { prefix: '/internal/ingest' });
server.register(compareRoutes, { prefix: '/api' });

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on http://localhost:${port}`);
    console.log(`API Docs available at http://localhost:${port}/docs`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();