// Shared Zod validation schemas
// Used by backend, MCP server, and frontend

import { z } from 'zod';

export const scheduleRuleSchema = z.object({
  type: z.enum(['once', 'daily', 'weekly', 'monthly', 'custom']),
  daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
  dayOfMonth: z.array(z.number().min(1).max(31)).optional(),
  interval: z.number().positive().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endDate: z.string().datetime().optional(),
  timezone: z.string(),
});

export const userPublicSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const userSchema = userPublicSchema.extend({
  apiKey: z.string().min(32),
});

export const createUserInputSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const listSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  type: z.enum(['personal', 'shared']),
  ownerId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().nonnegative(),
});

export const createListInputSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['personal', 'shared']),
});

export const updateListInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  version: z.number().int().nonnegative(),
});

export const listMemberSchema = z.object({
  id: z.string().uuid(),
  listId: z.string().uuid(),
  userId: z.string().uuid(),
  permission: z.enum(['view', 'edit', 'admin']),
  joinedAt: z.string().datetime(),
});

export const itemSchema = z.object({
  id: z.string().uuid(),
  listId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  type: z.enum(['habit', 'chore', 'task']),
  status: z.enum(['active', 'archived', 'deleted']),
  schedule: scheduleRuleSchema,
  assignedTo: z.string().uuid().nullable().optional(),
  sharedWith: z.array(z.string().uuid()).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  nextDueAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().nonnegative(),
});

export const createItemInputSchema = z.object({
  listId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  type: z.enum(['habit', 'chore', 'task']),
  schedule: scheduleRuleSchema,
  assignedTo: z.string().uuid().optional(),
  sharedWith: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string()).optional(),
});

export const updateItemInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  type: z.enum(['habit', 'chore', 'task']).optional(),
  status: z.enum(['active', 'archived', 'deleted']).optional(),
  schedule: scheduleRuleSchema.optional(),
  assignedTo: z.string().uuid().optional(),
  sharedWith: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string()).optional(),
  version: z.number().int().nonnegative(),
});

export const completeItemInputSchema = z.object({
  completedAt: z.string().datetime().optional(),
});

export const undoCompletionInputSchema = z.object({
  completionId: z.string().uuid().optional(),
});

export const completionSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  userId: z.string().uuid(),
  completedAt: z.string().datetime(),
  scheduledFor: z.string().datetime(),
  undone: z.boolean(),
  undoneAt: z.string().datetime().optional(),
  undoneBy: z.string().uuid().optional(),
});

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  entityType: z.enum(['item', 'list', 'completion', 'member']),
  entityId: z.string().uuid(),
  action: z.enum(['create', 'update', 'delete', 'complete', 'undo']),
  userId: z.string().uuid(),
  changes: z.record(z.object({
    old: z.any(),
    new: z.any(),
  })),
  createdAt: z.string().datetime(),
});

export const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.any().optional(),
    }).optional(),
  });
