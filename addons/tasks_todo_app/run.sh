#!/bin/bash
set -e

# Get options from Home Assistant
API_KEY=$(jq -r '.api_key' /data/options.json)
TIMEZONE=$(jq -r '.timezone' /data/options.json)
ENABLE_MCP=$(jq -r '.enable_mcp_server // false' /data/options.json)
LOG_LEVEL=$(jq -r '.log_level // "info"' /data/options.json)

# Set environment variables
export NODE_ENV=production
export DATABASE_PATH=/data/tasks.db
export API_PORT=8080
export API_HOST=0.0.0.0
export DEFAULT_API_KEY="$API_KEY"
export DEFAULT_TIMEZONE="$TIMEZONE"
export LOG_LEVEL="$LOG_LEVEL"
export ENABLE_MCP_SERVER="$ENABLE_MCP"

# Initialize database if needed
if [ ! -f /data/tasks.db ]; then
    echo "Initializing database..."
    npm run migrate || true
fi

# Start the API server
echo "Starting Tasks Todo App API Server..."
echo "API Key: ${API_KEY:0:10}..."
echo "Timezone: $TIMEZONE"
echo "MCP Server Enabled: $ENABLE_MCP"
echo "Log Level: $LOG_LEVEL"

# Run the application
exec npm start
