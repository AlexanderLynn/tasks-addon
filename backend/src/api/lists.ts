import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection.js';
import { createListInputSchema, updateListInputSchema, listSchema } from '../shared/schemas/index.js';
import { validateBody } from '../middleware/validation.js';
import { AuthRequest, authenticateApiKey } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import { logAudit } from '../services/audit.service.js';
import { z } from 'zod';

const router = Router();

const memberInputSchema = z.object({
  userId: z.string().uuid(),
  permission: z.enum(['view', 'edit', 'admin']),
});

const permissionInputSchema = z.object({
  permission: z.enum(['view', 'edit', 'admin']),
});

function transformMember(member: any) {
  return {
    id: member.id,
    listId: member.list_id,
    userId: member.user_id,
    permission: member.permission,
    joinedAt: member.joined_at,
  };
}

async function requireListAdmin(listId: string, userId: string) {
  const db = await getDb();
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(listId) as any;

  if (!list) {
    throw new AppError('NOT_FOUND', 'List not found', 404);
  }

  if (list.owner_id === userId) {
    return { db, list };
  }

  const member = db.prepare(
    'SELECT * FROM list_members WHERE list_id = ? AND user_id = ? AND permission = ?'
  ).get(listId, userId, 'admin');

  if (!member) {
    throw new AppError('FORBIDDEN', 'Admin permission required', 403);
  }

  return { db, list };
}

// GET /api/lists - Get all lists (requires auth)
router.get('/', authenticateApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const db = await getDb();
    const lists = db.prepare('SELECT * FROM lists WHERE owner_id = ?').all(req.userId!) as any[];
    
    // Transform snake_case to camelCase for schema validation
    const transformedLists = lists.map(list => ({
      id: list.id,
      name: list.name,
      type: list.type,
      ownerId: list.owner_id,
      createdAt: list.created_at,
      updatedAt: list.updated_at,
      version: list.version
    }));
    
    // Get members for each list
    const members: Record<string, any[]> = {};
    for (const list of lists) {
      const listMembers = db.prepare('SELECT * FROM list_members WHERE list_id = ?').all(list.id);
      members[list.id] = listMembers;
    }

    res.json({
      success: true,
      data: { lists: transformedLists, members }
    });
  } catch (error: any) {
    throw error;
  }
});

// GET /api/lists/:id - Get single list (requires auth)
router.get('/:id', authenticateApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
    if (!list) {
      throw new AppError('NOT_FOUND', 'List not found', 404);
    }

    // Check if user has access
    if (list.owner_id !== req.userId) {
      const member = db.prepare('SELECT * FROM list_members WHERE list_id = ? AND user_id = ?').get(id, req.userId!);
      if (!member) {
        throw new AppError('FORBIDDEN', 'Access denied', 403);
      }
    }

    const items = db.prepare('SELECT * FROM items WHERE list_id = ?').all(id);
    const members = db.prepare('SELECT * FROM list_members WHERE list_id = ?').all(id);

    // Transform snake_case to camelCase for schema validation
    const transformedList = {
      id: list.id,
      name: list.name,
      type: list.type,
      ownerId: list.owner_id,
      createdAt: list.created_at,
      updatedAt: list.updated_at,
      version: list.version
    };

    res.json({
      success: true,
      data: { list: transformedList, items, members }
    });
  } catch (error: any) {
    throw error;
  }
});

// POST /api/lists - Create list (requires auth)
router.post('/', authenticateApiKey, validateBody(createListInputSchema), async (req: AuthRequest, res: Response) => {
  try {
    const input = req.body;
    const db = await getDb();

    const ownerId = req.userId!;
    const listId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO lists (id, name, type, owner_id, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(listId, input.name, input.type, ownerId, now, now, 0);

    // Add owner as admin member
    const memberId = uuidv4();
    db.prepare(
      'INSERT INTO list_members (id, list_id, user_id, permission, joined_at) VALUES (?, ?, ?, ?, ?)'
    ).run(memberId, listId, ownerId, 'admin', now);

    // Log audit
    await logAudit({
      entityType: 'list',
      entityId: listId,
      action: 'create',
      userId: ownerId,
      changes: {}
    });

    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(listId) as any;
    
    // Transform snake_case to camelCase for schema validation
    const transformedList = {
      id: list.id,
      name: list.name,
      type: list.type,
      ownerId: list.owner_id,
      createdAt: list.created_at,
      updatedAt: list.updated_at,
      version: list.version
    };
    const parsedList = listSchema.parse(transformedList);

    res.json({
      success: true,
      data: { list: parsedList }
    });
  } catch (error: any) {
    throw error;
  }
});

// PUT /api/lists/:id - Update list (requires auth)
router.put('/:id', authenticateApiKey, validateBody(updateListInputSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const input = req.body;
    const db = await getDb();

    const existing = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError('NOT_FOUND', 'List not found', 404);
    }

    // Check if user is owner
    if (existing.owner_id !== req.userId) {
      throw new AppError('FORBIDDEN', 'Only owner can update list', 403);
    }

    // Version check for optimistic concurrency
    if (existing.version !== input.version) {
      throw new AppError('CONFLICT', 'Version conflict', 409);
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];

    if (input.name) {
      updates.push('name = ?');
      values.push(input.name);
    }

    updates.push('updated_at = ?');
    values.push(now);
    updates.push('version = version + 1');
    values.push(id);

    db.prepare(`UPDATE lists SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Log audit
    await logAudit({
      entityType: 'list',
      entityId: id,
      action: 'update',
      userId: req.userId!,
      changes: { name: { old: existing.name, new: input.name } }
    });

    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id) as any;
    
    // Transform snake_case to camelCase for schema validation
    const transformedList = {
      id: list.id,
      name: list.name,
      type: list.type,
      ownerId: list.owner_id,
      createdAt: list.created_at,
      updatedAt: list.updated_at,
      version: list.version
    };
    const parsedList = listSchema.parse(transformedList);

    res.json({
      success: true,
      data: { list: parsedList }
    });
  } catch (error: any) {
    throw error;
  }
});

// DELETE /api/lists/:id - Delete list (requires auth)
router.delete('/:id', authenticateApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const existing = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError('NOT_FOUND', 'List not found', 404);
    }

    // Check if user is owner
    if (existing.owner_id !== req.userId) {
      throw new AppError('FORBIDDEN', 'Only owner can delete list', 403);
    }

    db.prepare('DELETE FROM list_members WHERE list_id = ?').run(id);
    db.prepare('DELETE FROM items WHERE list_id = ?').run(id);
    db.prepare('DELETE FROM lists WHERE id = ?').run(id);

    // Log audit
    await logAudit({
      entityType: 'list',
      entityId: id,
      action: 'delete',
      userId: req.userId!,
      changes: {}
    });

    res.json({
      success: true,
      data: { listId: id }
    });
  } catch (error: any) {
    throw error;
  }
});

// POST /api/lists/:id/members - Share a list with another user (requires admin)
router.post('/:id/members', authenticateApiKey, validateBody(memberInputSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, permission } = req.body;
    const { db } = await requireListAdmin(id, req.userId!);

    const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!targetUser) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }

    const existingMember = db.prepare('SELECT * FROM list_members WHERE list_id = ? AND user_id = ?').get(id, userId);
    if (existingMember) {
      throw new AppError('CONFLICT', 'User is already a member of this list', 409);
    }

    const memberId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO list_members (id, list_id, user_id, permission, joined_at) VALUES (?, ?, ?, ?, ?)'
    ).run(memberId, id, userId, permission, now);

    await logAudit({
      entityType: 'member',
      entityId: memberId,
      action: 'create',
      userId: req.userId!,
      changes: {}
    });

    const member = db.prepare('SELECT * FROM list_members WHERE id = ?').get(memberId);
    res.json({
      success: true,
      data: { member: transformMember(member) }
    });
  } catch (error: any) {
    throw error;
  }
});

// PUT /api/lists/:id/members/:userId - Update member permissions (requires admin)
router.put('/:id/members/:userId', authenticateApiKey, validateBody(permissionInputSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id, userId } = req.params;
    const { permission } = req.body;
    const { db } = await requireListAdmin(id, req.userId!);

    const member = db.prepare('SELECT * FROM list_members WHERE list_id = ? AND user_id = ?').get(id, userId) as any;
    if (!member) {
      throw new AppError('NOT_FOUND', 'Member not found', 404);
    }

    db.prepare('UPDATE list_members SET permission = ? WHERE list_id = ? AND user_id = ?').run(permission, id, userId);

    await logAudit({
      entityType: 'member',
      entityId: member.id,
      action: 'update',
      userId: req.userId!,
      changes: { permission: { old: member.permission, new: permission } }
    });

    const updatedMember = db.prepare('SELECT * FROM list_members WHERE id = ?').get(member.id);
    res.json({
      success: true,
      data: { member: transformMember(updatedMember) }
    });
  } catch (error: any) {
    throw error;
  }
});

// DELETE /api/lists/:id/members/:userId - Remove a member (requires admin)
router.delete('/:id/members/:userId', authenticateApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { id, userId } = req.params;
    const { db, list } = await requireListAdmin(id, req.userId!);

    if (list.owner_id === userId) {
      throw new AppError('BAD_REQUEST', 'List owner cannot be removed', 400);
    }

    const member = db.prepare('SELECT * FROM list_members WHERE list_id = ? AND user_id = ?').get(id, userId) as any;
    if (!member) {
      throw new AppError('NOT_FOUND', 'Member not found', 404);
    }

    db.prepare('DELETE FROM list_members WHERE id = ?').run(member.id);

    await logAudit({
      entityType: 'member',
      entityId: member.id,
      action: 'delete',
      userId: req.userId!,
      changes: {}
    });

    res.json({
      success: true,
      data: { memberId: member.id }
    });
  } catch (error: any) {
    throw error;
  }
});

export { router as listsRouter };
