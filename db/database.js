require('dotenv').config();
const { Pool } = require('pg');

const isLocal = (process.env.DATABASE_URL || '').includes('localhost');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 5,
});

module.exports = pool;
