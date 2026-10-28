// server/backup_phase3.mjs
// Takes a verified snapshot backup of zencafe_db before Phase 3 changes

import fs from 'fs'
import path from 'path'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const pool = new pg.Pool({
  host: process.env.PGHOST || process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.PGPORT || process.env.DB_PORT || 55432),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'zencafe_db',
  user: process.env.PGUSER || process.env.DB_USER || 'zencafe_app',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
  ssl: false,
})

async function run() {
  console.log('=== ZEN CAFÉ — PHASE 3 DATABASE BACKUP ===\n')

  const dbInfo = await pool.query('SELECT current_database() as db, current_user as u')
  const { db, u } = dbInfo.rows[0]
  console.log(`Connected to: ${db} as ${u}`)

  if (db !== 'zencafe_db') {
    throw new Error(`CRITICAL: Connected to ${db} instead of zencafe_db!`)
  }

  const tablesRes = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `)
  const tableNames = tablesRes.rows.map(r => r.table_name)
  console.log(`Found ${tableNames.length} tables to backup:`, tableNames)

  const backupData = {
    database: db,
    user: u,
    timestamp: new Date().toISOString(),
    tables: {},
  }

  for (const table of tableNames) {
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table])

    const rows = await pool.query(`SELECT * FROM public.${table}`)

    backupData.tables[table] = {
      columnCount: cols.rows.length,
      columns: cols.rows,
      rowCount: rows.rows.length,
      rows: rows.rows,
    }
    console.log(`  - Backed up public.${table}: ${cols.rows.length} columns, ${rows.rows.length} rows`)
  }

  const backupDir = path.resolve('backups')
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const backupFile = path.join(backupDir, 'zencafe_phase3_pre_migration_backup.json')
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf-8')

  console.log(`\n✅ Backup successfully created at: ${backupFile}`)
  console.log(`   File size: ${(fs.statSync(backupFile).size / 1024).toFixed(2)} KB`)

  // Verify backup can be read
  const parsed = JSON.parse(fs.readFileSync(backupFile, 'utf-8'))
  if (Object.keys(parsed.tables).length !== tableNames.length) {
    throw new Error('Backup verification failed: table count mismatch')
  }
  console.log('✅ Backup verified successfully.')
}

run()
  .catch(err => {
    console.error('Backup failed:', err)
    process.exit(1)
  })
  .finally(() => pool.end())
