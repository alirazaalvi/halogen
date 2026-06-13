import {
  scbIngestHandler,
  braIngestHandler,
  trafiklabIngestHandler,
  smhiIngestHandler,
} from './ingest.controller.js';

export async function ingestRoutes(fastify, options) {
  fastify.post('/scb', {
    schema: {
      response: { 200: { type: 'object', properties: { status: { type: 'string' } } } }
    }
  }, scbIngestHandler);

  fastify.post('/bra', {
    schema: {
      response: { 200: { type: 'object', properties: { status: { type: 'string' } } } }
    }
  }, braIngestHandler);

  fastify.post('/trafiklab', {
    schema: {
      response: { 200: { type: 'object', properties: { status: { type: 'string' } } } }
    }
  }, trafiklabIngestHandler);

  fastify.post('/smhi', {
    schema: {
      response: { 200: { type: 'object', properties: { status: { type: 'string' } } } }
    }
  }, smhiIngestHandler);
}