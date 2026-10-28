import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
})

async function run() {
  const client = await pool.connect()
  try {
    const tableInfo = await client.query(`
      SELECT c.relname, r.rolname AS owner, c.relacl
      FROM pg_class c
      JOIN pg_roles r ON r.oid = c.relowner
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'admin_sessions';
    `)
    console.log('Table Info:', tableInfo.rows)

    const cols = await client.query(`
      SELECT attname, format_type(atttypid, atttypmod) AS data_type, attnotnull, atthasdef
      FROM pg_attribute
      WHERE attrelid = 'public.admin_sessions'::regclass AND attnum > 0 AND NOT attisdropped
      ORDER BY attnum;
    `)
    console.log('\nColumns from pg_attribute:')
    console.table(cols.rows)

    const privs = await client.query(`
      SELECT grantee, privilege_type, is_grantable
      FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name = 'admin_sessions';
    `)
    console.log('\nTable privileges:')
    console.table(privs.rows)

    const defaultVals = await client.query(`
      SELECT d.adnum, a.attname, pg_get_expr(d.adbin, d.adrelid) AS default_expr
      FROM pg_attrdef d
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
      WHERE d.adrelid = 'public.admin_sessions'::regclass;
    `)
    console.log('\nDefault expressions:')
    console.table(defaultVals.rows)

    const constraints = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.admin_sessions'::regclass;
    `)
    console.log('\nConstraints:')
    console.table(constraints.rows)

    const allTables = await client.query(`
      SELECT c.relname, r.rolname AS owner, 
             has_table_privilege('zencafe_app', c.oid, 'SELECT') as can_select, 
             has_table_privilege('zencafe_app', c.oid, 'INSERT') as can_insert,
             has_table_privilege('zencafe_app', c.oid, 'UPDATE') as can_update,
             has_table_privilege('zencafe_app', c.oid, 'DELETE') as can_delete
      FROM pg_class c
      JOIN pg_roles r ON r.oid = c.relowner
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `)
    console.log('\nAll tables privileges for zencafe_app:')
    console.table(allTables.rows)

  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(console.error)
