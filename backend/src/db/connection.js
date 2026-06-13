import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/neighborhood_intelligence',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export { pool };