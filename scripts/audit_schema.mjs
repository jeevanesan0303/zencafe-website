import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '55432', 10),
  user: process.env.DB_USER || 'zencafe_app',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'zencafe_db'
});

async function run() {
  const client = await pool.connect();
  const dbRes = await client.query('SELECT current_database(), current_user;');
  console.log('Connected to:', dbRes.rows[0]);
  
  const tables = ['bookings', 'booking_blocks', 'admin_notifications', 'notification_outbox'];
  for (const t of tables) {
    console.log('\n======================================================');
    console.log('TABLE: ' + t);
    console.log('======================================================');
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [t]);
    console.log('Columns:');
    console.table(cols.rows);

    const fks = await client.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1;
    `, [t]);
    console.log('Foreign Keys:');
    console.table(fks.rows);

    const cks = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND conrelid = ('public.' || $1)::regclass;
    `, [t]);
    console.log('All Constraints:');
    console.table(cks.rows);
  }

  // Also check if public.customers exists or public.users exists
  const existingTables = await client.query(`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
  `);
  console.log('\nAll tables in public schema:', existingTables.rows.map(r => r.table_name));

  client.release();
  await pool.end();
}

run().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
