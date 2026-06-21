# Tasks Todo App - Home Assistant Addon

Home Assistant addon for Tasks Todo App - a scheduling and collaboration app with Node.js backend and MCP server integration.

## Features

- **Full-Featured Task Management**: Create, update, complete, and organize tasks
- **List Organization**: Group tasks by list/project
- **Real-time Sync**: Automatic synchronization with frontend
- **MCP Server Integration**: Model Context Protocol support for AI assistants
- **REST API**: Full API on port 8080 for integrations
- **SQLite Database**: Persistent local storage in `/data` volume
- **Health Checks**: Built-in endpoint monitoring

## Installation

### Via Home Assistant Addon Repository (Recommended)

1. Go to **Settings** → **Add-ons** → **Create Addon** button (bottom right)
2. Click **Repositories**
3. Add repository: `https://github.com/AlexanderLynn/tasks-addon`
4. Click the new repository
5. Click **Tasks Todo App** addon
6. Click **Install**
7. Configure API Key and Timezone in addon options
8. Click **Start**

### Manual Installation

1. Clone this repository
2. Copy to Home Assistant: `cp -r . ~/.homeassistant/addons/tasks_todo_app/`
3. Refresh addons in Home Assistant
4. Find "Tasks Todo App" and install

## Configuration

### Addon Options

| Option | Required | Example | Description |
|--------|----------|---------|-------------|
| `api_key` | Yes | `secret_key_123` | API key for securing requests |
| `timezone` | No | `America/New_York` | Timezone for scheduling (default: UTC) |
| `log_level` | No | `info` | Logging level: debug, info, warning, error |

### Example Configuration

```yaml
api_key: your_secure_api_key_here
timezone: America/New_York
log_level: info
```

## API Endpoints

### Health Check
- `GET /api/health` - Check addon status

### Lists
- `GET /api/lists` - Get all lists
- `POST /api/lists` - Create new list
- `PUT /api/lists/:id` - Update list
- `DELETE /api/lists/:id` - Delete list

### Items
- `GET /api/items` - Get all items (optionally filtered by list)
- `POST /api/items` - Create new item
- `PUT /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item

### Authentication

Include API key in header:
```
Authorization: Bearer YOUR_API_KEY
```

## Ports

- **8080**: REST API (internal only)
- **3000**: Frontend (optional, if enabled)

## Volumes

- `/data` - SQLite database and persistent storage

## Requirements

- Home Assistant OS or supervised Home Assistant
- Minimum 100MB free disk space
- Network connectivity for scheduling features

## Troubleshooting

### Addon fails to start
- Check logs: **Settings** → **Add-ons** → **Tasks Todo App** → **Logs**
- Verify API key is set in addon options
- Restart addon

### API connection timeout
- Ensure addon is running
- Check Home Assistant network settings
- Verify API key in requests

### Database errors
- Check `/data` volume has write permissions
- Free up disk space if nearly full
- Check logs for specific error messages

## Links

- **Main Repository**: https://github.com/AlexanderLynn/tasks
- **Integration (HACS)**: https://github.com/AlexanderLynn/tasks-integration
- **Issues**: https://github.com/AlexanderLynn/tasks/issues

## License

MIT License - See LICENSE file
- **Web Interface**: Access via Home Assistant Ingress (embedded UI)
- **API Access**: Direct HTTP REST API on port 8080
- **MCP Server**: Integration with Claude Desktop (optional)

## Access

- **Web Interface**: Home Assistant → Addons → Tasks Todo App → Open Web UI
- **Direct API**: `http://homeassistant.local:8080` (internal)
- **Websocket**: `ws://homeassistant.local:8080/ws` (for real-time updates)

## Troubleshooting

### Addon won't start
- Check logs: **Settings → Devices & Services → Addons → Tasks Todo App → Logs**
- Ensure API key is set in Configuration
- Check disk space in Home Assistant

### Sensors not showing up
- Integration must be installed in Home Assistant (see below)
- Check integration is enabled: **Settings → Devices & Services → Integrations**
- Restart Home Assistant if needed

### Database errors
- Check `/data/tasks.db` permissions
- Clear cache and restart addon

## Related Integration

This addon requires the **Tasks Todo App Integration** to be installed separately for sensors and services to work in Home Assistant. See [integration instructions](../home-assistant-integration/README.md).
