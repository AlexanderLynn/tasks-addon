#!/usr/bin/env node
/**
 * HTTP-based MCP Server Entry Point
 * Runs an HTTP server for MCP protocol using simple HTTP POST/GET
 */

import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getDb } from './db/connection.js';

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
        description: 'Undo a completion',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'Item ID' },
            completionId: { type: 'string', description: 'Specific completion ID to undo (optional)' }
          },
          required: ['itemId']
        }
      },
      {
        name: 'list_lists',
        description: 'List all lists',
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
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const db = await getDb();

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
        const { v4: uuidv4 } = await import('uuid');
        const itemId = uuidv4();
        const now = new Date().toISOString();
        const nextDueAt = now; // TODO: Implement proper scheduling logic

        db.prepare(
          `INSERT INTO items (id, list_id, title, description, type, status, schedule, assigned_to, shared_with, tags, next_due_at, created_at, updated_at, version) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        return {
          content: [{ type: 'text', text: JSON.stringify({ item, nextDueAt }, null, 2) }]
        };
      }

      case 'complete_item': {
        const { itemId, completedAt } = args as any;
        const { v4: uuidv4 } = await import('uuid');
        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        if (!item) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Item not found' }, null, 2) }],
            isError: true
          };
        }

        const userId = 'user-123'; // TODO: Get from authentication
        const completed = completedAt || new Date().toISOString();
        const scheduledFor = item.next_due_at;
        const completionId = uuidv4();

        db.prepare(
          'INSERT INTO completions (id, item_id, user_id, completed_at, scheduled_for, undone) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(completionId, itemId, userId, completed, scheduledFor, 0);

        const nextDueAt = new Date().toISOString(); // TODO: Implement proper scheduling logic
        db.prepare('UPDATE items SET next_due_at = ? WHERE id = ?').run(nextDueAt, itemId);

        const completion = db.prepare('SELECT * FROM completions WHERE id = ?').get(completionId);
        return {
          content: [{ type: 'text', text: JSON.stringify({ completion, nextDueAt }, null, 2) }]
        };
      }

      case 'undo_completion': {
        const { itemId, completionId } = args as any;
        const { v4: uuidv4 } = await import('uuid');
        
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

        const userId = 'user-123'; // TODO: Get from authentication
        const undoneAt = new Date().toISOString();

        db.prepare('UPDATE completions SET undone = 1, undone_at = ?, undone_by = ? WHERE id = ?').run(undoneAt, userId, completion.id);

        const nextDueAt = completion.scheduled_for;
        db.prepare('UPDATE items SET next_due_at = ? WHERE id = ?').run(nextDueAt, itemId);

        const updatedCompletion = db.prepare('SELECT * FROM completions WHERE id = ?').get(completion.id);
        return {
          content: [{ type: 'text', text: JSON.stringify({ completion: updatedCompletion, nextDueAt }, null, 2) }]
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
        const { v4: uuidv4 } = await import('uuid');
        const ownerId = 'user-123'; // TODO: Get from authentication
        const listId = uuidv4();
        const now = new Date().toISOString();

        db.prepare(
          'INSERT INTO lists (id, name, type, owner_id, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(listId, name, type, ownerId, now, now, 0);

        const memberId = uuidv4();
        db.prepare(
          'INSERT INTO list_members (id, list_id, user_id, permission, joined_at) VALUES (?, ?, ?, ?, ?)'
        ).run(memberId, listId, ownerId, 'admin', now);

        const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(listId);
        return {
          content: [{ type: 'text', text: JSON.stringify({ list }, null, 2) }]
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

// Express app for HTTP-based MCP server
const app = express();
app.use(cors());
app.use(express.json());

const MCP_PORT = process.env.MCP_PORT || 3000;

// MCP protocol endpoint
app.post('/mcp', async (req, res) => {
  try {
    const { jsonrpc, method, params, id } = req.body;
    
    if (method === 'tools/list') {
      // Call the handler directly
      const response = {
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
            description: 'Undo a completion',
            inputSchema: {
              type: 'object',
              properties: {
                itemId: { type: 'string', description: 'Item ID' },
                completionId: { type: 'string', description: 'Specific completion ID to undo (optional)' }
              },
              required: ['itemId']
            }
          },
          {
            name: 'list_lists',
            description: 'List all lists',
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
          }
        ]
      };
      return res.json({
        jsonrpc: '2.0',
        id,
        result: response
      });
    }
    
    if (method === 'tools/call') {
      const { name, arguments: args } = params as any;
      const db = await getDb();
      
      try {
        switch (name) {
          case 'list_items': {
            const { listId, type, status, assignedTo, limit = 50, offset = 0 } = args as any;
            let query = 'SELECT * FROM items WHERE status != ?';
            const queryParams: any[] = ['deleted'];

            if (listId) {
              query += ' AND list_id = ?';
              queryParams.push(listId);
            }
            if (type) {
              query += ' AND type = ?';
              queryParams.push(type);
            }
            if (status) {
              query += ' AND status = ?';
              queryParams.push(status);
            }
            if (assignedTo) {
              query += ' AND assigned_to = ?';
              queryParams.push(assignedTo);
            }

            query += ' ORDER BY next_due_at ASC LIMIT ? OFFSET ?';
            queryParams.push(limit, offset);

            const items = db.prepare(query).all(...queryParams);
            const total = db.prepare('SELECT COUNT(*) as count FROM items WHERE status != ?').get('deleted') as { count: number };

            return res.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ items, total: total.count }, null, 2) }]
              }
            });
          }

          case 'get_item': {
            const { id } = args as any;
            const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
            if (!item) {
              return res.json({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{ type: 'text', text: JSON.stringify({ error: 'Item not found' }, null, 2) }],
                  isError: true
                }
              });
            }
            const completions = db.prepare('SELECT * FROM completions WHERE item_id = ? ORDER BY completed_at DESC').all(id);
            return res.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ item, completions, nextDueAt: item.next_due_at }, null, 2) }]
              }
            });
          }

          case 'create_item': {
            const { listId, title, description, type, schedule, assignedTo, tags, sharedWith } = args as any;
            const { v4: uuidv4 } = await import('uuid');
            const itemId = uuidv4();
            const now = new Date().toISOString();
            const nextDueAt = now;

            db.prepare(
              `INSERT INTO items (id, list_id, title, description, type, status, schedule, assigned_to, shared_with, tags, next_due_at, created_at, updated_at, version) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

            const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
            return res.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ item, nextDueAt }, null, 2) }]
              }
            });
          }

          case 'list_lists': {
            const { type } = args as any;
            let query = 'SELECT * FROM lists';
            const queryParams: any[] = [];

            if (type) {
              query += ' WHERE type = ?';
              queryParams.push(type);
            }

            const lists = db.prepare(query).all(...queryParams);
            
            const members: Record<string, any[]> = {};
            for (const list of lists) {
              const listMembers = db.prepare('SELECT * FROM list_members WHERE list_id = ?').all(list.id as string);
              members[list.id as string] = listMembers;
            }

            return res.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ lists, members }, null, 2) }]
              }
            });
          }

          case 'create_list': {
            const { name, type } = args as any;
            const { v4: uuidv4 } = await import('uuid');
            const ownerId = 'user-123';
            const listId = uuidv4();
            const now = new Date().toISOString();

            db.prepare(
              'INSERT INTO lists (id, name, type, owner_id, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(listId, name, type, ownerId, now, now, 0);

            const memberId = uuidv4();
            db.prepare(
              'INSERT INTO list_members (id, list_id, user_id, permission, joined_at) VALUES (?, ?, ?, ?, ?)'
            ).run(memberId, listId, ownerId, 'admin', now);

            const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(listId);
            return res.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ list }, null, 2) }]
              }
            });
          }

          default:
            return res.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ error: 'Unknown tool' }, null, 2) }],
                isError: true
              }
            });
        }
      } catch (error: any) {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }, null, 2) }],
            isError: true
          }
        });
      }
    }
    
    res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' }
    });
  } catch (error: any) {
    res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: { code: -32603, message: error.message }
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start HTTP server
app.listen(MCP_PORT, () => {
  console.error(`Habit Tracker MCP HTTP server running on port ${MCP_PORT}`);
  console.error(`MCP endpoint: http://localhost:${MCP_PORT}/mcp`);
  console.error(`Health check: http://localhost:${MCP_PORT}/health`);
});
