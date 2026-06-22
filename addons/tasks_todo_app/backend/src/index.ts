import express from 'express';
import cors from 'cors';
import { runMigrations } from './db/migrate.js';
import { apiRouter } from './api/index.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';

const app = express();
const API_PORT = process.env.API_PORT || 8080;
const MCP_ENABLED = process.env.MCP_ENABLED === 'true';

// Middleware
app.use(cors());
app.use(express.json());

// Run migrations and start server
async function startServer() {
  await runMigrations();

  // API routes
  app.use('/api', apiRouter);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Start API server
  app.listen(API_PORT, () => {
    console.log(`Habit Tracker API server running on port ${API_PORT}`);
  });

  // Start MCP server if enabled
  if (MCP_ENABLED) {
    import('./mcp/index.js').then(() => {
      console.log('MCP server started');
    }).catch((error) => {
      console.error('Failed to start MCP server:', error);
    });
  }
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
