// server/inspect_offers_db.mjs
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
  console.log('=== ZEN CAFÉ — INSPECTING OFFERS DATABASE ===\n');

  // Verify database name and user
  const dbCheck = await pool.query('SELECT current_database() as db, current_user as u');
  console.log(`Connected to: ${dbCheck.rows[0].db} as ${dbCheck.rows[0].u}`);

  if (dbCheck.rows[0].db !== 'zencafe_db') {
    throw new Error(`CRITICAL: Connected to ${dbCheck.rows[0].db}, expected zencafe_db!`);
  }

  // Check if public.offers exists
  const tableCheck = await pool.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'offers'
  `);
  
  if (tableCheck.rows.length === 0) {
    console.log('Table public.offers DOES NOT EXIST in zencafe_db.');
  } else {
    console.log('Table public.offers EXISTS.');

    // Inspect columns
    const columnsCheck = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'offers'
      ORDER BY ordinal_position
    `);
    console.log('\nColumns in public.offers:');
    console.table(columnsCheck.rows);

    // Inspect constraints (primary keys, foreign keys, unique)
    const constraintsCheck = await pool.query(`
      SELECT tc.constraint_name, tc.constraint_type, kcu.column_name,
             ccu.table_name AS foreign_table_name,
             ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = 'offers'
    `);
    console.log('\nConstraints in public.offers:');
    console.table(constraintsCheck.rows);

    // Inspect indexes
    const indexesCheck = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'offers'
    `);
    console.log('\nIndexes in public.offers:');
    console.table(indexesCheck.rows);

    // Count rows
    const countCheck = await pool.query('SELECT count(*) as count FROM public.offers');
    console.log(`\nCurrent row count in public.offers: ${countCheck.rows[0].count}`);
  }

  // Also check if any other offer-related tables exist
  const allTables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log('\nAll tables in public schema of zencafe_db:');
  console.log(allTables.rows.map(r => r.table_name).join(', '));
}

run()
  .catch(err => {
    console.error('Inspection failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
