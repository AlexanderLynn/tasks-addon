// Shared TypeScript types for Habit & Chore Tracker
// Used by backend, MCP server, and frontend

export interface User {
  id: string;
  name: string;
  email: string;
  apiKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface List {
  id: string;
  name: string;
  type: 'personal' | 'shared';
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface ListMember {
  id: string;
  listId: string;
  userId: string;
  permission: 'view' | 'edit' | 'admin';
  joinedAt: Date;
}

export interface ScheduleRule {
  type: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
  daysOfWeek?: number[];
  dayOfMonth?: number[];
  interval?: number;
  time?: string;
  endDate?: Date;
  timezone: string;
}

export interface Item {
  id: string;
  listId: string;
  title: string;
  description?: string;
  type: 'habit' | 'chore' | 'task';
  status: 'active' | 'archived' | 'deleted';
  schedule: ScheduleRule;
  assignedTo?: string;
  sharedWith?: string[];
  tags?: string[];
  nextDueAt: Date;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface Completion {
  id: string;
  itemId: string;
  userId: string;
  completedAt: Date;
  scheduledFor: Date;
  undone: boolean;
  undoneAt?: Date;
  undoneBy?: string;
}

export interface AuditLog {
  id: string;
  entityType: 'item' | 'list' | 'completion' | 'member';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'complete' | 'undo';
  userId: string;
  changes: Record<string, { old: any; new: any }>;
  createdAt: Date;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}

// Create/Update types
export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateListInput {
  name: string;
  type: 'personal' | 'shared';
}

export interface UpdateListInput {
  name?: string;
  version: number;
}

export interface CreateItemInput {
  listId: string;
  title: string;
  description?: string;
  type: 'habit' | 'chore' | 'task';
  schedule: ScheduleRule;
  assignedTo?: string;
  sharedWith?: string[];
  tags?: string[];
}

export interface UpdateItemInput {
  title?: string;
  description?: string;
  type?: 'habit' | 'chore' | 'task';
  status?: 'active' | 'archived' | 'deleted';
  schedule?: ScheduleRule;
  assignedTo?: string;
  sharedWith?: string[];
  tags?: string[];
  version: number;
}

export interface CompleteItemInput {
  completedAt?: string;
}

export interface UndoCompletionInput {
  completionId?: string;
}
