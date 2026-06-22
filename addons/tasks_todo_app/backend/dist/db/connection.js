import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'node:fs/promises';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../data/habits.db');
let db = null;
export async function getDb() {
    if (!db) {
        // Ensure data directory exists
        const dataDir = path.dirname(DB_PATH);
        await mkdir(dataDir, { recursive: true });
        db = new DatabaseSync(DB_PATH);
        // Enable WAL mode and foreign keys
        db.exec('PRAGMA journal_mode = WAL');
        db.exec('PRAGMA foreign_keys = ON');
    }
    return db;
}
export async function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}
// Synchronous version for use in contexts where async is not available
export function getDbSync() {
    if (!db) {
        throw new Error('Database not initialized. Call getDb() first.');
    }
    return db;
}
