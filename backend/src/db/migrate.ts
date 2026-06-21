import { getDb } from '../db/connection.js';
import { migrations } from './schema.js';

export async function runMigrations(): Promise<void> {
  const db = await getDb();

  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  // Get current migration version
  const result = db.prepare('SELECT MAX(version) as version FROM migrations').get() as { version: number | null } | undefined;
  const currentVersion = result?.version || 0;

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`Running migration: ${migration.name} (version ${migration.version})`);
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)'
      ).run(migration.version, migration.name, new Date().toISOString());
      console.log(`Migration ${migration.name} completed`);
    }
  }

  console.log('All migrations completed');
}

// Run migrations if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch(console.error);
}
