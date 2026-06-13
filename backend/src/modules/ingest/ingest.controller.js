import { pool } from '../../db/connection.js';

export async function scbIngestHandler(request, reply) {
  // Mock ingestion - in production would call SCB API
  console.log('SCB ingestion triggered');
  return reply.send({ status: 'ok', message: 'SCB data ingestion scheduled' });
}

export async function braIngestHandler(request, reply) {
  console.log('BRÅ ingestion triggered');
  return reply.send({ status: 'ok', message: 'BRÅ crime data ingestion scheduled' });
}

export async function trafiklabIngestHandler(request, reply) {
  console.log('Trafiklab ingestion triggered');
  return reply.send({ status: 'ok', message: 'Transport data ingestion scheduled' });
}

export async function smhiIngestHandler(request, reply) {
  console.log('SMHI ingestion triggered');
  return reply.send({ status: 'ok', message: 'Environmental data ingestion scheduled' });
}