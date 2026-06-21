import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection.js';
import { createUserInputSchema, loginInputSchema, userPublicSchema, } from '../shared/schemas/index.js';
import { validateBody } from '../middleware/validation.js';
import { authenticateApiKey } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';
const router = Router();
function formatUser(row) {
    return userPublicSchema.parse({
        id: row.id,
        name: row.name,
        email: row.email,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
}
function authResponse(user, apiKey) {
    return { user, apiKey };
}
// POST /api/users - Create a new user (no auth required)
router.post('/', validateBody(createUserInputSchema), async (req, res) => {
    const input = req.body;
    const db = await getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(input.email);
    if (existing) {
        throw new AppError('EMAIL_EXISTS', 'Email already exists', 400);
    }
    const userId = uuidv4();
    const apiKey = uuidv4() + uuidv4().replace(/-/g, '');
    const passwordHash = await hashPassword(input.password);
    const now = new Date().toISOString();
    db.prepare('INSERT INTO users (id, name, email, api_key, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, input.name, input.email, apiKey, passwordHash, now, now);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    res.json({
        success: true,
        data: authResponse(formatUser(user), apiKey),
    });
});
// POST /api/users/login - Sign in with email and password
router.post('/login', validateBody(loginInputSchema), async (req, res) => {
    const input = req.body;
    const db = await getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(input.email);
    if (!user?.password_hash) {
        throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    const valid = await verifyPassword(input.password, user.password_hash);
    if (!valid) {
        throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    res.json({
        success: true,
        data: authResponse(formatUser(user), user.api_key),
    });
});
// GET /api/users/me - Get current user (requires auth)
router.get('/me', authenticateApiKey, async (req, res) => {
    const db = await getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user) {
        throw new AppError('NOT_FOUND', 'User not found', 404);
    }
    res.json({
        success: true,
        data: { user: formatUser(user) },
    });
});
// GET /api/users/me/api-key - Retrieve API key for MCP and Home Assistant (requires auth)
router.get('/me/api-key', authenticateApiKey, async (req, res) => {
    const db = await getDb();
    const user = db.prepare('SELECT api_key FROM users WHERE id = ?').get(req.userId);
    if (!user) {
        throw new AppError('NOT_FOUND', 'User not found', 404);
    }
    res.json({
        success: true,
        data: { apiKey: user.api_key },
    });
});
export { router as usersRouter };
