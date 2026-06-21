// Database schema SQL

export const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Lists table
CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('personal', 'shared')),
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

-- List members table
CREATE TABLE IF NOT EXISTS list_members (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permission TEXT NOT NULL CHECK(permission IN ('view', 'edit', 'admin')),
  joined_at TEXT NOT NULL,
  FOREIGN KEY (list_id) REFERENCES lists(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(list_id, user_id)
);

-- Items table
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('habit', 'chore', 'task')),
  status TEXT NOT NULL CHECK(status IN ('active', 'archived', 'deleted')),
  schedule TEXT NOT NULL,
  assigned_to TEXT,
  shared_with TEXT,
  tags TEXT,
  next_due_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (list_id) REFERENCES lists(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

-- Completions table
CREATE TABLE IF NOT EXISTS completions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  undone INTEGER NOT NULL DEFAULT 0,
  undone_at TEXT,
  undone_by TEXT,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (undone_by) REFERENCES users(id)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id TEXT NOT NULL,
  changes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_items_list_id ON items(list_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_next_due ON items(next_due_at);
CREATE INDEX IF NOT EXISTS idx_items_tags ON items(tags);
CREATE INDEX IF NOT EXISTS idx_completions_item_id ON completions(item_id);
CREATE INDEX IF NOT EXISTS idx_completions_user_id ON completions(user_id);
CREATE INDEX IF NOT EXISTS idx_completions_completed_at ON completions(completed_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
`;

export const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    sql: schema,
  },
  {
    version: 2,
    name: 'add_user_password_hash',
    sql: 'ALTER TABLE users ADD COLUMN password_hash TEXT;',
  },
];
