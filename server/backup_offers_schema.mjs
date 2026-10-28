// server/backup_offers_schema.mjs
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 55432),
  database: process.env.DB_NAME || 'zencafe_db',
  user: process.env.DB_USER || 'zencafe_app',
  password: process.env.DB_PASSWORD,
  ssl: false,
});

async function run() {
  const dbCheck = await pool.query('SELECT current_database() as db, current_user as u');
  if (dbCheck.rows[0].db !== 'zencafe_db') {
    throw new Error('Target is not zencafe_db!');
  }

  const columns = await pool.query(`
    SELECT column_name, data_type, column_default, is_nullable, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offers'
    ORDER BY ordinal_position
  `);

  const constraints = await pool.query(`
    SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = 'offers'
  `);

  const indexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'offers'
  `);

  const rows = await pool.query('SELECT * FROM public.offers');

  const backupData = {
    database: dbCheck.rows[0].db,
    user: dbCheck.rows[0].u,
    timestamp: new Date().toISOString(),
    table: 'public.offers',
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    rowCount: rows.rows.length,
    rows: rows.rows,
  };

  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filePath = path.join(backupDir, 'zencafe_offers_backup_phase2.json');
  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');

  console.log(`✅ Snapshot saved to: ${filePath}`);
  console.log(`Verified table public.offers: ${columns.rows.length} columns, ${rows.rows.length} rows.`);
}

run()
  .catch(err => {
    console.error('Backup failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
