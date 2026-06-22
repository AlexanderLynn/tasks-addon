import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection.js';
/**
 * Log an action to the audit trail
 */
export async function logAudit(entry) {
    try {
        const db = await getDb();
        const id = uuidv4();
        const now = new Date().toISOString();
        db.prepare('INSERT INTO audit_log (id, entity_type, entity_id, action, user_id, changes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, entry.entityType, entry.entityId, entry.action, entry.userId, JSON.stringify(entry.changes), now);
    }
    catch (error) {
        console.error('Failed to log audit entry:', error);
        // Don't throw - audit logging failures shouldn't break the main operation
    }
}
/**
 * Get audit history for an entity
 */
export async function getAuditHistory(entityType, entityId, limit = 50) {
    try {
        const db = await getDb();
        const entries = db.prepare('SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT ?').all(entityType, entityId, limit);
        return entries.map((entry) => ({
            ...entry,
            changes: JSON.parse(entry.changes)
        }));
    }
    catch (error) {
        console.error('Failed to get audit history:', error);
        return [];
    }
}
/**
 * Calculate changes between old and new values
 */
export function calculateChanges(oldValue, newValue) {
    const changes = {};
    if (!oldValue || !newValue) {
        return changes;
    }
    const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
    for (const key of allKeys) {
        if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) {
            changes[key] = {
                old: oldValue[key],
                new: newValue[key]
            };
        }
    }
    return changes;
}
