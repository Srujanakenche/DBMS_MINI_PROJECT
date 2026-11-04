import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

// Helper to load .env.local or .env variables manually without extra dependencies
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}

loadEnv();

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('ERROR: Neither DIRECT_URL nor DATABASE_URL is set in environment or .env.local.');
  process.exit(1);
}

// Mask password for logging
const maskedUrl = connectionString.replace(/:([^:@]+)@/, ':****@');
console.log(`Connecting to PostgreSQL: ${maskedUrl}`);

const client = new Client({ connectionString });

async function run() {
  try {
    await client.connect();
    console.log('Successfully connected to PostgreSQL.');

    const sqlPath = path.resolve(process.cwd(), 'scripts/init-db.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`SQL initialization file not found at ${sqlPath}`);
    }

    console.log('Reading scripts/init-db.sql...');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing database initialization script...');
    await client.query(sql);
    console.log('Initialization script executed successfully.\n');

    // Verification Step: Confirm all 13 core tables exist
    console.log('============================================================');
    console.log('VERIFYING DATABASE OBJECTS');
    console.log('============================================================');

    const expectedTables = [
      'users',
      'skills',
      'skill_prerequisites',
      'user_skills',
      'learning_goals',
      'goal_required_skills',
      'user_active_goals',
      'resources',
      'resource_skills',
      'resource_prerequisite_skills',
      'learning_paths',
      'learning_path_items',
      'user_resource_progress'
    ];

    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const existingTables = new Set(tablesRes.rows.map(r => r.table_name));
    console.log(`Found ${existingTables.size} base tables in public schema:`);
    
    let allTablesPresent = true;
    for (const tbl of expectedTables) {
      const present = existingTables.has(tbl);
      console.log(`  [${present ? 'OK' : 'MISSING'}] Table: ${tbl}`);
      if (!present) allTablesPresent = false;
    }

    // Verify Views
    const expectedViews = ['v_student_skill_gaps', 'v_learning_path_progress'];
    const viewsRes = await client.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    const existingViews = new Set(viewsRes.rows.map(r => r.table_name));
    console.log('\nViews:');
    for (const v of expectedViews) {
      const present = existingViews.has(v);
      if (!present) allTablesPresent = false;
      console.log(`  [${present ? 'OK' : 'MISSING'}] View: ${v}`);
    }

    // Verify Functions
    const expectedFunctions = [
      'fn_check_skill_prerequisite_cycle',
      'fn_sync_primary_skill_on_resource',
      'fn_prevent_delete_primary_skill',
      'fn_check_primary_skill_coverage_update',
      'fn_complete_resource_in_path'
    ];
    const funcRes = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public'
      ORDER BY routine_name;
    `);
    const existingFuncs = new Set(funcRes.rows.map(r => r.routine_name));
    console.log('\nFunctions & Stored Procedures:');
    for (const fn of expectedFunctions) {
      const present = existingFuncs.has(fn);
      if (!present) allTablesPresent = false;
      console.log(`  [${present ? 'OK' : 'MISSING'}] Routine: ${fn}`);
    }

    // Verify Triggers
    const expectedTriggers = [
      'trg_check_skill_prerequisite_cycle',
      'trg_sync_primary_skill_on_resource',
      'trg_prevent_delete_primary_skill',
      'trg_check_primary_skill_coverage_update'
    ];
    const trgRes = await client.query(`
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY trigger_name;
    `);
    const existingTriggers = new Set(trgRes.rows.map(r => r.trigger_name));
    console.log('\nTriggers:');
    for (const trg of expectedTriggers) {
      const present = existingTriggers.has(trg);
      if (!present) allTablesPresent = false;
      console.log(`  [${present ? 'OK' : 'MISSING'}] Trigger: ${trg}`);
    }

    console.log('============================================================');
    if (allTablesPresent) {
      console.log('RESULT: ALL 13 CORE TABLES AND ADVANCED OBJECTS VERIFIED.');
    } else {
      console.error('RESULT: ONE OR MORE REQUIRED DATABASE OBJECTS ARE MISSING.');
      process.exit(1);
    }
  } catch (err) {
    console.error('\nSQL / Connection Error:');
    console.error(err.message);
    if (err.code) console.error(`Error Code: ${err.code}`);
    if (err.detail) console.error(`Detail: ${err.detail}`);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

run();
