import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getDb } from '../db/connection.js';
import { calculateNextDueDate, validateSchedule } from '../services/schedule.service.js';
import { logAudit, calculateChanges } from '../services/audit.service.js';
import { v4 as uuidv4 } from 'uuid';

// MCP Server setup
const server = new Server(
  {
    name: 'habit-tracker-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_items',
        description: 'List all items with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string', description: 'Filter by list ID' },
            type: { type: 'string', enum: ['habit', 'chore', 'task'], description: 'Filter by item type' },
            status: { type: 'string', enum: ['active', 'archived', 'deleted'], description: 'Filter by status' },
            assignedTo: { type: 'string', description: 'Filter by assigned user ID' },
            limit: { type: 'number', description: 'Maximum number of results' },
            offset: { type: 'number', description: 'Offset for pagination' }
          }
        }
      },
      {
        name: 'get_item',
        description: 'Get a single item by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Item ID' }
          },
          required: ['id']
        }
      },
      {
        name: 'create_item',
        description: 'Create a new habit, chore, or task',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string', description: 'List ID' },
            title: { type: 'string', description: 'Item title' },
            description: { type: 'string', description: 'Item description' },
            type: { type: 'string', enum: ['habit', 'chore', 'task'], description: 'Item type' },
            schedule: { type: 'object', description: 'Schedule rule' },
            assignedTo: { type: 'string', description: 'Assigned user ID' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags for grouping' },
            sharedWith: { type: 'array', items: { type: 'string' }, description: 'User IDs to share with' }
          },
          required: ['listId', 'title', 'type', 'schedule']
        }
      },
      {
        name: 'update_item',
        description: 'Update an existing item',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Item ID' },
            title: { type: 'string', description: 'Item title' },
            description: { type: 'string', description: 'Item description' },
            type: { type: 'string', enum: ['habit', 'chore', 'task'], description: 'Item type' },
            status: { type: 'string', enum: ['active', 'archived', 'deleted'], description: 'Item status' },
            schedule: { type: 'object', description: 'Schedule rule' },
            assignedTo: { type: 'string', description: 'Assigned user ID' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags for grouping' },
            sharedWith: { type: 'array', items: { type: 'string' }, description: 'User IDs to share with' },
            version: { type: 'number', description: 'Current version for optimistic concurrency' }
          },
          required: ['id']
        }
      },
      {
        name: 'complete_item',
        description: 'Mark an item as complete',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'Item ID' },
            completedAt: { type: 'string', description: 'Completion time (ISO 8601), defaults to now' }
          },
          required: ['itemId']
        }
      },
      {
        name: 'undo_completion',
        description: 'Undo the last completion for an item',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'Item ID' },
            completionId: { type: 'string', description: 'Specific completion ID to undo (optional, defaults to last)' }
          },
          required: ['itemId']
        }
      },
      {
        name: 'list_lists',
        description: 'Get all lists accessible to the user',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['personal', 'shared'], description: 'Filter by list type' }
          }
        }
      },
      {
        name: 'create_list',
        description: 'Create a new list',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'List name' },
            type: { type: 'string', enum: ['personal', 'shared'], description: 'List type' }
          },
          required: ['name', 'type']
        }
      },
      {
        name: 'delete_item',
        description: 'Delete an item (soft delete)',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Item ID' }
          },
          required: ['id']
        }
      },
      {
        name: 'list_completions',
        description: 'Get completion history for an item',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'Item ID' },
            userId: { type: 'string', description: 'Filter by user ID' },
            undone: { type: 'boolean', description: 'Include/exclude undone completions' },
            limit: { type: 'number', description: 'Maximum number of results' }
          },
          required: ['itemId']
        }
      },
      {
        name: 'get_next_due',
        description: 'Calculate the next due date for an item',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'Item ID' }
          },
          required: ['itemId']
        }
      },
      {
        name: 'search_items',
        description: 'Search items by title, description, or tags',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            listId: { type: 'string', description: 'Filter by list ID' },
            limit: { type: 'number', description: 'Maximum number of results' }
          },
          required: ['query']
        }
      },
      {
        name: 'share_list',
        description: 'Share a list with another user',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string', description: 'List ID' },
            userId: { type: 'string', description: 'User ID to share with' },
            permission: { type: 'string', enum: ['view', 'edit', 'admin'], description: 'Permission level' }
          },
          required: ['listId', 'userId', 'permission']
        }
      },
      {
        name: 'set_permissions',
        description: 'Update permissions for a list member',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string', description: 'List ID' },
            userId: { type: 'string', description: 'User ID' },
            permission: { type: 'string', enum: ['view', 'edit', 'admin'], description: 'New permission level' }
          },
          required: ['listId', 'userId', 'permission']
        }
      },
      {
        name: 'remove_list_member',
        description: 'Remove a member from a list',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string', description: 'List ID' },
            userId: { type: 'string', description: 'User ID to remove' }
          },
          required: ['listId', 'userId']
        }
      }
    ]
  };
});

// Helper function to get user ID from API key (simplified for now)
async function getUserIdFromApiKey(apiKey?: string): Promise<string> {
  // TODO: Implement proper API key validation
  // For now, return a default user ID
  return 'user-123';
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const db = await getDb();
  const userId = await getUserIdFromApiKey(args?.apiKey as string | undefined);

  try {
    switch (name) {
      case 'list_items': {
        const { listId, type, status, assignedTo, limit = 50, offset = 0 } = args as any;
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
        params.push(limit, offset);

        const items = db.prepare(query).all(...params);
        const total = db.prepare('SELECT COUNT(*) as count FROM items WHERE status != ?').get('deleted') as { count: number };

        return {
          content: [{ type: 'text', text: JSON.stringify({ items, total: total.count }, null, 2) }]
        };
      }

      case 'get_item': {
        const { id } = args as any;
        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
        if (!item) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Item not found' }, null, 2) }],
            isError: true
          };
        }
        const completions = db.prepare('SELECT * FROM completions WHERE item_id = ? ORDER BY completed_at DESC').all(id);
        return {
          content: [{ type: 'text', text: JSON.stringify({ item, completions, nextDueAt: item.next_due_at }, null, 2) }]
        };
      }

      case 'create_item': {
        const { listId, title, description, type, schedule, assignedTo, tags, sharedWith } = args as any;
        const itemId = uuidv4();
        const now = new Date().toISOString();

        // Validate schedule
        const scheduleValidation = validateSchedule(schedule);
        if (!scheduleValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: scheduleValidation.error }, null, 2) }],
            isError: true
          };
        }

        // Calculate next due date
        const nextDueDate = calculateNextDueDate(schedule);
        const nextDueAt = nextDueDate.toISOString();

        db.prepare(
          `INSERT INTO items (id, list_id, title, description, type, status, schedule, assigned_to, shared_with, tags, next_due_at, created_at, updated_at, version) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          itemId,
          listId,
          title,
          description || null,
          type,
          'active',
          JSON.stringify(schedule),
          assignedTo || null,
          sharedWith ? JSON.stringify(sharedWith) : null,
          tags ? JSON.stringify(tags) : null,
          nextDueAt,
          now,
          now,
          0
        );

        // Log audit
        await logAudit({
          entityType: 'item',
          entityId: itemId,
          action: 'create',
          userId,
          changes: {}
        });

        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        return {
          content: [{ type: 'text', text: JSON.stringify({ item, nextDueAt }, null, 2) }]
        };
      }

      case 'update_item': {
        const { id, title, description, type, status, schedule, assignedTo, tags, sharedWith, version } = args as any;
        
        const existingItem = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
        if (!existingItem) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Item not found' }, null, 2) }],
            isError: true
          };
        }

        // Check version for optimistic concurrency
        if (version !== undefined && existingItem.version !== version) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Version conflict' }, null, 2) }],
            isError: true
          };
        }

        const updates: any[] = [];
        const values: any[] = [];
        const now = new Date().toISOString();

        if (title !== undefined) {
          updates.push('title = ?');
          values.push(title);
        }
        if (description !== undefined) {
          updates.push('description = ?');
          values.push(description);
        }
        if (type !== undefined) {
          updates.push('type = ?');
          values.push(type);
        }
        if (status !== undefined) {
          updates.push('status = ?');
          values.push(status);
        }
        if (schedule !== undefined) {
          const scheduleValidation = validateSchedule(schedule);
          if (!scheduleValidation.valid) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: scheduleValidation.error }, null, 2) }],
              isError: true
            };
          }
          updates.push('schedule = ?');
          values.push(JSON.stringify(schedule));
          
          // Recalculate next due date if schedule changed
          const nextDueDate = calculateNextDueDate(schedule);
          updates.push('next_due_at = ?');
          values.push(nextDueDate.toISOString());
        }
        if (assignedTo !== undefined) {
          updates.push('assigned_to = ?');
          values.push(assignedTo);
        }
        if (tags !== undefined) {
          updates.push('tags = ?');
          values.push(JSON.stringify(tags));
        }
        if (sharedWith !== undefined) {
          updates.push('shared_with = ?');
          values.push(JSON.stringify(sharedWith));
        }

        updates.push('updated_at = ?');
        values.push(now);
        updates.push('version = version + 1');
        values.push(id);

        if (updates.length > 0) {
          db.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }

        // Log audit
        const updatedItem = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
        if (!updatedItem) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Failed to update item' }, null, 2) }],
            isError: true
          };
        }
        await logAudit({
          entityType: 'item',
          entityId: id,
          action: 'update',
          userId,
          changes: calculateChanges(existingItem, updatedItem)
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({ item: updatedItem, nextDueAt: updatedItem.next_due_at }, null, 2) }]
        };
      }

      case 'delete_item': {
        const { id } = args as any;
        
        const existingItem = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
        if (!existingItem) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Item not found' }, null, 2) }],
            isError: true
          };
        }

        const now = new Date().toISOString();
        db.prepare('UPDATE items SET status = ?, updated_at = ? WHERE id = ?').run('deleted', now, id);

        // Log audit
        await logAudit({
          entityType: 'item',
          entityId: id,
          action: 'delete',
          userId,
          changes: {}
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, itemId: id }, null, 2) }]
        };
      }

      case 'complete_item': {
        const { itemId, completedAt } = args as any;
        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        if (!item) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Item not found' }, null, 2) }],
            isError: true
          };
        }

        const completed = completedAt || new Date().toISOString();
        const scheduledFor = item.next_due_at;
        const completionId = uuidv4();

        db.prepare(
          'INSERT INTO completions (id, item_id, user_id, completed_at, scheduled_for, undone) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(completionId, itemId, userId, completed, scheduledFor, 0);

        // Calculate next due date based on schedule
        const schedule = JSON.parse(item.schedule as string);
        const nextDueDate = calculateNextDueDate(schedule, new Date(completed));
        const nextDueAt = nextDueDate.toISOString();
        
        db.prepare('UPDATE items SET next_due_at = ?, updated_at = ? WHERE id = ?').run(nextDueAt, new Date().toISOString(), itemId);

        // Log audit
        await logAudit({
          entityType: 'completion',
          entityId: completionId,
          action: 'complete',
          userId,
          changes: {}
        });

        const completion = db.prepare('SELECT * FROM completions WHERE id = ?').get(completionId);
        return {
          content: [{ type: 'text', text: JSON.stringify({ completion, nextDueAt }, null, 2) }]
        };
      }

      case 'undo_completion': {
        const { itemId, completionId } = args as any;
        
        let completion;
        if (completionId) {
          completion = db.prepare('SELECT * FROM completions WHERE id = ?').get(completionId);
        } else {
          completion = db.prepare('SELECT * FROM completions WHERE item_id = ? AND undone = 0 ORDER BY completed_at DESC LIMIT 1').get(itemId);
        }

        if (!completion) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Completion not found' }, null, 2) }],
            isError: true
          };
        }

        const undoneAt = new Date().toISOString();

        db.prepare('UPDATE completions SET undone = 1, undone_at = ?, undone_by = ? WHERE id = ?').run(undoneAt, userId, completion.id as string);

        const nextDueAt = completion.scheduled_for;
        db.prepare('UPDATE items SET next_due_at = ?, updated_at = ? WHERE id = ?').run(nextDueAt, new Date().toISOString(), itemId);

        // Log audit
        await logAudit({
          entityType: 'completion',
          entityId: completion.id as string,
          action: 'undo',
          userId,
          changes: {}
        });

        const updatedCompletion = db.prepare('SELECT * FROM completions WHERE id = ?').get(completion.id as string);
        return {
          content: [{ type: 'text', text: JSON.stringify({ completion: updatedCompletion, nextDueAt }, null, 2) }]
        };
      }

      case 'list_completions': {
        const { itemId, userId: filterUserId, undone, limit = 50 } = args as any;
        let query = 'SELECT * FROM completions WHERE item_id = ?';
        const params: any[] = [itemId];

        if (filterUserId) {
          query += ' AND user_id = ?';
          params.push(filterUserId);
        }
        if (undone !== undefined) {
          query += ' AND undone = ?';
          params.push(undone ? 1 : 0);
        }

        query += ' ORDER BY completed_at DESC LIMIT ?';
        params.push(limit);

        const completions = db.prepare(query).all(...params);
        const total = db.prepare('SELECT COUNT(*) as count FROM completions WHERE item_id = ?').get(itemId) as { count: number };

        return {
          content: [{ type: 'text', text: JSON.stringify({ completions, total: total.count }, null, 2) }]
        };
      }

      case 'get_next_due': {
        const { itemId } = args as any;
        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        if (!item) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Item not found' }, null, 2) }],
            isError: true
          };
        }

        const schedule = JSON.parse(item.schedule as string);
        const lastCompletion = db.prepare('SELECT * FROM completions WHERE item_id = ? AND undone = 0 ORDER BY completed_at DESC LIMIT 1').get(itemId);
        const lastCompletedDate = lastCompletion && lastCompletion.completed_at ? new Date(lastCompletion.completed_at as string) : undefined;
        
        const nextDueDate = calculateNextDueDate(schedule, lastCompletedDate);
        
        return {
          content: [{ type: 'text', text: JSON.stringify({ itemId, nextDueAt: nextDueDate.toISOString(), scheduledFor: item.next_due_at }, null, 2) }]
        };
      }

      case 'search_items': {
        const { query, listId, limit = 50 } = args as any;
        const searchPattern = `%${query}%`;
        let sql = 'SELECT * FROM items WHERE status != ? AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)';
        const params: any[] = ['deleted', searchPattern, searchPattern, searchPattern];

        if (listId) {
          sql += ' AND list_id = ?';
          params.push(listId);
        }

        sql += ' ORDER BY next_due_at ASC LIMIT ?';
        params.push(limit);

        const items = db.prepare(sql).all(...params);
        
        return {
          content: [{ type: 'text', text: JSON.stringify({ items, total: items.length }, null, 2) }]
        };
      }

      case 'list_lists': {
        const { type } = args as any;
        let query = 'SELECT * FROM lists';
        const params: any[] = [];

        if (type) {
          query += ' WHERE type = ?';
          params.push(type);
        }

        const lists = db.prepare(query).all(...params);
        
        const members: Record<string, any[]> = {};
        for (const list of lists) {
          const listMembers = db.prepare('SELECT * FROM list_members WHERE list_id = ?').all(list.id as string);
          members[list.id as string] = listMembers;
        }

        return {
          content: [{ type: 'text', text: JSON.stringify({ lists, members }, null, 2) }]
        };
      }

      case 'create_list': {
        const { name, type } = args as any;
        const listId = uuidv4();
        const now = new Date().toISOString();

        db.prepare(
          'INSERT INTO lists (id, name, type, owner_id, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(listId, name, type, userId, now, now, 0);

        const memberId = uuidv4();
        db.prepare(
          'INSERT INTO list_members (id, list_id, user_id, permission, joined_at) VALUES (?, ?, ?, ?, ?)'
        ).run(memberId, listId, userId, 'admin', now);

        // Log audit
        await logAudit({
          entityType: 'list',
          entityId: listId,
          action: 'create',
          userId,
          changes: {}
        });

        const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(listId);
        return {
          content: [{ type: 'text', text: JSON.stringify({ list }, null, 2) }]
        };
      }

      case 'share_list': {
        const { listId, userId: targetUserId, permission } = args as any;
        
        const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(listId);
        if (!list) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'List not found' }, null, 2) }],
            isError: true
          };
        }

        // Check if user is already a member
        const existingMember = db.prepare('SELECT * FROM list_members WHERE list_id = ? AND user_id = ?').get(listId, targetUserId);
        if (existingMember) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'User is already a member of this list' }, null, 2) }],
            isError: true
          };
        }

        const memberId = uuidv4();
        const now = new Date().toISOString();

        db.prepare(
          'INSERT INTO list_members (id, list_id, user_id, permission, joined_at) VALUES (?, ?, ?, ?, ?)'
        ).run(memberId, listId, targetUserId, permission, now);

        // Log audit
        await logAudit({
          entityType: 'member',
          entityId: memberId,
          action: 'create',
          userId,
          changes: {}
        });

        const member = db.prepare('SELECT * FROM list_members WHERE id = ?').get(memberId);
        return {
          content: [{ type: 'text', text: JSON.stringify({ member }, null, 2) }]
        };
      }

      case 'set_permissions': {
        const { listId, userId: targetUserId, permission } = args as any;
        
        const member = db.prepare('SELECT * FROM list_members WHERE list_id = ? AND user_id = ?').get(listId, targetUserId);
        if (!member) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Member not found' }, null, 2) }],
            isError: true
          };
        }

        const oldPermission = member.permission;
        db.prepare('UPDATE list_members SET permission = ? WHERE list_id = ? AND user_id = ?').run(permission, listId, targetUserId);

        // Log audit
        await logAudit({
          entityType: 'member',
          entityId: member.id as string,
          action: 'update',
          userId,
          changes: { permission: { old: oldPermission, new: permission } }
        });

        const updatedMember = db.prepare('SELECT * FROM list_members WHERE id = ?').get(member.id);
        return {
          content: [{ type: 'text', text: JSON.stringify({ member: updatedMember }, null, 2) }]
        };
      }

      case 'remove_list_member': {
        const { listId, userId: targetUserId } = args as any;

        const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(listId);
        if (!list) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'List not found' }, null, 2) }],
            isError: true
          };
        }

        if (list.owner_id === targetUserId) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'List owner cannot be removed' }, null, 2) }],
            isError: true
          };
        }

        const member = db.prepare('SELECT * FROM list_members WHERE list_id = ? AND user_id = ?').get(listId, targetUserId);
        if (!member) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Member not found' }, null, 2) }],
            isError: true
          };
        }

        db.prepare('DELETE FROM list_members WHERE id = ?').run(member.id);

        await logAudit({
          entityType: 'member',
          entityId: member.id as string,
          action: 'delete',
          userId,
          changes: {}
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, memberId: member.id }, null, 2) }]
        };
      }

      default:
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Unknown tool' }, null, 2) }],
          isError: true
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: error.message }, null, 2) }],
      isError: true
    };
  }
});

// Start MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Habit Tracker MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
