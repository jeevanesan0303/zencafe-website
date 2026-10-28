import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

async function inspect() {
  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: false,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log('Connected successfully to database:', process.env.PGDATABASE);

    // List all tables in public schema
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('\n--- PUBLIC TABLES ---');
    console.log(tables.rows.map(r => r.table_name));

    // Columns in products and categories
    const cols = await client.query(`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name IN ('products', 'categories')
      ORDER BY table_name, ordinal_position;
    `);
    console.log('\n--- COLUMNS (products, categories) ---');
    console.table(cols.rows);

    // Foreign Keys
    const fks = await client.query(`
      SELECT 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule,
        rc.update_rule
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu 
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu 
        ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
    `);
    console.log('\n--- FOREIGN KEYS ---');
    console.table(fks.rows);

    // Primary Keys / Unique constraints
    const pks = await client.query(`
      SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public' AND tc.table_name IN ('products', 'categories');
    `);
    console.log('\n--- CONSTRAINTS ---');
    console.table(pks.rows);

    // Categories data
    const cats = await client.query(`SELECT * FROM public.categories ORDER BY id ASC;`);
    console.log('\n--- EXISTING CATEGORIES ROWS ---');
    console.log(JSON.stringify(cats.rows, null, 2));

    // Foreign keys pointing to products or categories
    const refs = await client.query(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu 
        ON tc.constraint_name = kcu.constraint_name 
      JOIN information_schema.constraint_column_usage AS ccu 
        ON ccu.constraint_name = tc.constraint_name 
      WHERE ccu.table_name IN ('products', 'categories') AND tc.table_schema = 'public';
    `);
    console.log('\n--- TABLES REFERENCING PRODUCTS OR CATEGORIES ---');
    console.table(refs.rows);

    // Products count
    const prodCount = await client.query(`SELECT COUNT(*) FROM public.products;`);
    console.log('\n--- EXISTING PRODUCTS COUNT ---', prodCount.rows[0].count);

  } catch (err) {
    console.error('Inspection failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

inspect();
