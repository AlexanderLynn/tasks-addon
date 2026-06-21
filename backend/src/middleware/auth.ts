import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/connection.js';

export interface AuthRequest extends Request {
  userId?: string;
  apiKey?: string;
}

export async function authenticateApiKey(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'API key required' }
    });
    return;
  }

  try {
    const db = await getDb();
    const user = db.prepare('SELECT id, api_key FROM users WHERE api_key = ?').get(apiKey) as { id: string; api_key: string } | undefined;

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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Authentication failed' }
    });
  }
}

export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-api-key'] as string;

  if (apiKey) {
    try {
      const db = await getDb();
      const user = db.prepare('SELECT id, api_key FROM users WHERE api_key = ?').get(apiKey) as { id: string; api_key: string } | undefined;

      if (user) {
        req.userId = user.id;
        req.apiKey = apiKey;
      }
    } catch (error) {
      // Ignore auth errors for optional auth
    }
  }

  next();
}
