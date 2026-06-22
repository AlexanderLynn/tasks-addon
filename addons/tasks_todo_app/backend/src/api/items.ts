import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection.js';
import { createItemInputSchema, updateItemInputSchema, itemSchema, completeItemInputSchema, undoCompletionInputSchema } from '../shared/schemas/index.js';
import { validateBody } from '../middleware/validation.js';
import { AuthRequest, authenticateApiKey } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import { logAudit } from '../services/audit.service.js';
import { calculateNextDueDate } from '../services/schedule.service.js';

const router = Router();

// GET /api/items - Get all items (requires auth)
router.get('/', authenticateApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { listId, type, status, assignedTo, limit = '50', offset = '0' } = req.query;
    const db = await getDb();

    let query = 'SELECT * FROM items WHERE status != ?';
    const params: any[] = ['deleted'];

    if (listId) {
      query += ' AND list_id = ?';
      params.push(listId);
    }
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (assignedTo) {
      query += ' AND assigned_to = ?';
      params.push(assignedTo);
    }

    query += ' ORDER BY next_due_at ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));

    const items = db.prepare(query).all(...params) as any[];
    
    // Transform snake_case to camelCase and parse JSON fields for schema validation
    const transformedItems = items.map(item => ({
      id: item.id,
      listId: item.list_id,
      title: item.title,
      description: item.description,
      type: item.type,
      status: item.status,
      schedule: JSON.parse(item.schedule),
      assignedTo: item.assigned_to,
      sharedWith: item.shared_with ? JSON.parse(item.shared_with) : undefined,
      tags: item.tags ? JSON.parse(item.tags) : undefined,
      nextDueAt: item.next_due_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      version: item.version
    }));
    const total = db.prepare('SELECT COUNT(*) as count FROM items WHERE status != ?').get('deleted') as { count: number };

    res.json({
      success: true,
      data: { items: transformedItems, total: total.count }
    });
  } catch (error: any) {
    throw error;
  }
});

// GET /api/items/:id - Get single item (requires auth)
router.get('/:id', authenticateApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!item) {
      throw new AppError('NOT_FOUND', 'Item not found', 404);
    }

    // Check if user has access via list ownership or sharing
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(item.list_id);
    const sharedWith = item.shared_with ? JSON.parse(item.shared_with as string) : [];
    if (!list || (list.owner_id !== req.userId && !sharedWith.includes(req.userId!))) {
      throw new AppError('FORBIDDEN', 'Access denied', 403);
    }

    const completions = db.prepare('SELECT * FROM completions WHERE item_id = ? ORDER BY completed_at DESC').all(id);

    // Transform snake_case to camelCase and parse JSON fields for schema validation
    const transformedItem = {
      id: item.id,
      listId: item.list_id,
      title: item.title,
      description: item.description,
      type: item.type,
      status: item.status,
      schedule: JSON.parse(item.schedule as string),
      assignedTo: item.assigned_to,
      sharedWith: item.shared_with ? JSON.parse(item.shared_with as string) : undefined,
      tags: item.tags ? JSON.parse(item.tags as string) : undefined,
      nextDueAt: item.next_due_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      version: item.version
    };

    res.json({
      success: true,
      data: { item: transformedItem, completions, nextDueAt: item.next_due_at }
    });
  } catch (error: any) {
    throw error;
  }
});

// POST /api/items - Create item (requires auth)
router.post('/', authenticateApiKey, validateBody(createItemInputSchema), async (req: AuthRequest, res: Response) => {
  try {
    const input = req.body;
    const db = await getDb();

    // Check if user has access to the list
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(input.listId);
    if (!list || list.owner_id !== req.userId) {
      throw new AppError('FORBIDDEN', 'Access denied to list', 403);
    }

    const itemId = uuidv4();
    const now = new Date().toISOString();
    
    // Calculate next due date using scheduling service
    const nextDueAt = calculateNextDueDate(input.schedule);

    db.prepare(
      `INSERT INTO items (id, list_id, title, description, type, status, schedule, assigned_to, shared_with, tags, next_due_at, created_at, updated_at, version) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      itemId,
      input.listId,
      input.title,
      input.description || null,
      input.type,
      'active',
      JSON.stringify(input.schedule),
      input.assignedTo || null,
      input.sharedWith ? JSON.stringify(input.sharedWith) : null,
      input.tags ? JSON.stringify(input.tags) : null,
      nextDueAt.toISOString(),
      now,
      now,
      0
    );

    // Log audit
    await logAudit({
      entityType: 'item',
      entityId: itemId,
      action: 'create',
      userId: req.userId!,
      changes: {}
    });

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as any;
    
    // Transform snake_case to camelCase and parse JSON fields for schema validation
    const transformedItem = {
      id: item.id,
      listId: item.list_id,
      title: item.title,
      description: item.description,
      type: item.type,
      status: item.status,
      schedule: JSON.parse(item.schedule as string),
      assignedTo: item.assigned_to,
      sharedWith: item.shared_with ? JSON.parse(item.shared_with as string) : undefined,
      tags: item.tags ? JSON.parse(item.tags as string) : undefined,
      nextDueAt: item.next_due_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      version: item.version
    };
    const parsedItem = itemSchema.parse(transformedItem);

    res.json({
      success: true,
      data: { item: parsedItem, nextDueAt: nextDueAt.toISOString() }
    });
  } catch (error: any) {
    throw error;
  }
});

// PUT /api/items/:id - Update item (requires auth)
router.put('/:id', authenticateApiKey, validateBody(updateItemInputSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const input = req.body;
    const db = await getDb();

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Item not found', 404);
    }

    // Check if user has access
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(existing.list_id);
    if (!list || list.owner_id !== req.userId) {
      throw new AppError('FORBIDDEN', 'Access denied', 403);
    }

    // Version check for optimistic concurrency
    if (existing.version !== input.version) {
      throw new AppError('CONFLICT', 'Version conflict', 409);
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];

    if (input.title !== undefined) {
      updates.push('title = ?');
      values.push(input.title);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description);
    }
    if (input.type !== undefined) {
      updates.push('type = ?');
      values.push(input.type);
    }
    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
    }
    if (input.schedule !== undefined) {
      updates.push('schedule = ?');
      values.push(JSON.stringify(input.schedule));
      // Recalculate next due date if schedule changed
      const nextDueAt = calculateNextDueDate(input.schedule);
      updates.push('next_due_at = ?');
      values.push(nextDueAt.toISOString());
    }
    if (input.assignedTo !== undefined) {
      updates.push('assigned_to = ?');
      values.push(input.assignedTo);
    }
    if (input.sharedWith !== undefined) {
      updates.push('shared_with = ?');
      values.push(JSON.stringify(input.sharedWith));
    }
    if (input.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(input.tags));
    }

    updates.push('updated_at = ?');
    values.push(now);
    updates.push('version = version + 1');
    values.push(id);

    db.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Log audit
    await logAudit({
      entityType: 'item',
      entityId: id,
      action: 'update',
      userId: req.userId!,
      changes: {}
    });

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as any;
    
    // Transform snake_case to camelCase and parse JSON fields for schema validation
    const transformedItem = {
      id: item.id,
      listId: item.list_id,
      title: item.title,
      description: item.description,
      type: item.type,
      status: item.status,
      schedule: JSON.parse(item.schedule as string),
      assignedTo: item.assigned_to,
      sharedWith: item.shared_with ? JSON.parse(item.shared_with as string) : undefined,
      tags: item.tags ? JSON.parse(item.tags as string) : undefined,
      nextDueAt: item.next_due_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      version: item.version
    };
    const parsedItem = itemSchema.parse(transformedItem);

    res.json({
      success: true,
      data: { item: parsedItem, nextDueAt: item.next_due_at }
    });
  } catch (error: any) {
    throw error;
  }
});

// DELETE /api/items/:id - Delete item (soft delete, requires auth)
router.delete('/:id', authenticateApiKey, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Item not found', 404);
    }

    // Check if user has access
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(existing.list_id);
    if (!list || list.owner_id !== req.userId) {
      throw new AppError('FORBIDDEN', 'Access denied', 403);
    }

    db.prepare('UPDATE items SET status = ?, updated_at = ? WHERE id = ?').run('deleted', new Date().toISOString(), id);

    // Log audit
    await logAudit({
      entityType: 'item',
      entityId: id,
      action: 'delete',
      userId: req.userId!,
      changes: {}
    });

    res.json({
      success: true,
      data: { itemId: id }
    });
  } catch (error: any) {
    throw error;
  }
});

// POST /api/items/:id/complete - Complete item (requires auth)
router.post('/:id/complete', authenticateApiKey, validateBody(completeItemInputSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const input = req.body;
    const db = await getDb();

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!item) {
      throw new AppError('NOT_FOUND', 'Item not found', 404);
    }

    // Check if user has access
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(item.list_id);
    const sharedWith = item.shared_with ? JSON.parse(item.shared_with as string) : [];
    if (!list || (list.owner_id !== req.userId && !sharedWith.includes(req.userId!))) {
      throw new AppError('FORBIDDEN', 'Access denied', 403);
    }

    const userId = req.userId!;
    const completedAt = input.completedAt || new Date().toISOString();
    const scheduledFor = item.next_due_at;

    const completionId = uuidv4();
    db.prepare(
      'INSERT INTO completions (id, item_id, user_id, completed_at, scheduled_for, undone) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(completionId, id, userId, completedAt, scheduledFor, 0);

    // Calculate next due date using scheduling service
    const schedule = JSON.parse(item.schedule as string);
    const nextDueAt = calculateNextDueDate(schedule, new Date(completedAt));

    // Update item's next due date
    db.prepare('UPDATE items SET next_due_at = ? WHERE id = ?').run(nextDueAt.toISOString(), id);

    // Log audit
    await logAudit({
      entityType: 'completion',
      entityId: completionId,
      action: 'complete',
      userId: userId,
      changes: {}
    });

    const completion = db.prepare('SELECT * FROM completions WHERE id = ?').get(completionId);

    res.json({
      success: true,
      data: { completion, nextDueAt: nextDueAt.toISOString() }
    });
  } catch (error: any) {
    throw error;
  }
});

// POST /api/items/:id/undo - Undo completion (requires auth)
router.post('/:id/undo', authenticateApiKey, validateBody(undoCompletionInputSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const input = req.body;
    const db = await getDb();

    // Get last completion or specific completion
    let completion;
    if (input.completionId) {
      completion = db.prepare('SELECT * FROM completions WHERE id = ?').get(input.completionId);
    } else {
      completion = db.prepare('SELECT * FROM completions WHERE item_id = ? AND undone = 0 ORDER BY completed_at DESC LIMIT 1').get(id);
    }

    if (!completion) {
      throw new AppError('NOT_FOUND', 'Completion not found', 404);
    }

    // Check if user has access
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!item) {
      throw new AppError('NOT_FOUND', 'Item not found', 404);
    }
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(item.list_id);
    const sharedWith = item.shared_with ? JSON.parse(item.shared_with as string) : [];
    if (!list || (list.owner_id !== req.userId && !sharedWith.includes(req.userId!))) {
      throw new AppError('FORBIDDEN', 'Access denied', 403);
    }

    const userId = req.userId!;
    const undoneAt = new Date().toISOString();

    db.prepare('UPDATE completions SET undone = 1, undone_at = ?, undone_by = ? WHERE id = ?').run(undoneAt, userId, completion.id);

    // Recalculate next due date - revert to original scheduled time
    const nextDueAt = completion.scheduled_for as string || new Date().toISOString();
    db.prepare('UPDATE items SET next_due_at = ? WHERE id = ?').run(nextDueAt, id);

    // Log audit
    await logAudit({
      entityType: 'completion',
      entityId: completion.id as string,
      action: 'undo',
      userId: userId,
      changes: {}
    });

    const updatedCompletion = db.prepare('SELECT * FROM completions WHERE id = ?').get(completion.id);

    res.json({
      success: true,
      data: { completion: updatedCompletion, nextDueAt }
    });
  } catch (error: any) {
    throw error;
  }
});

export { router as itemsRouter };
