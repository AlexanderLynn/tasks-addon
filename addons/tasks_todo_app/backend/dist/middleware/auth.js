import { getDb } from '../db/connection.js';
export async function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-api-key'];
    if (!apiKey) {
        res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'API key required' }
        });
        return;
    }
    try {
        const db = await getDb();
        const user = db.prepare('SELECT id, api_key FROM users WHERE api_key = ?').get(apiKey);
        if (!user) {
            res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Invalid API key' }
            });
            return;
        }
        req.userId = user.id;
        req.apiKey = apiKey;
        next();
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Authentication failed' }
        });
    }
}
export async function optionalAuth(req, res, next) {
    const apiKey = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-api-key'];
    if (apiKey) {
        try {
            const db = await getDb();
            const user = db.prepare('SELECT id, api_key FROM users WHERE api_key = ?').get(apiKey);
            if (user) {
                req.userId = user.id;
                req.apiKey = apiKey;
            }
        }
        catch (error) {
            // Ignore auth errors for optional auth
        }
    }
    next();
}
