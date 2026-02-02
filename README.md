# 🤓 Jigar Dashboard

A personal productivity dashboard for Clawdbot/Jigar AI assistant.

## Features

- **📋 Kanban Board** - Task management with drag-and-drop (To Do → In Progress → Done → Archive)
- **📁 Document Viewer** - Browse and edit workspace markdown files
- **⏰ Cron Jobs** - View all scheduled jobs with next/last run times
- **📜 Activity Log** - Track assistant activity (coming soon)

## Screenshots

The dashboard provides a clean, dark-themed interface for managing:
- Tasks with priorities (High/Medium/Low)
- Status changes via click-to-edit modal
- Real-time sync with backend

## Installation

```bash
cd jigar-dashboard
npm install  # No dependencies needed actually
node server.js
```

Dashboard runs at `http://localhost:18800`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tasks` | GET | Get all tasks |
| `/api/tasks` | POST | Save tasks |
| `/api/docs` | GET | List markdown files |
| `/api/file?path=` | GET | Read file content |
| `/api/file` | POST | Save file content |
| `/api/cron-jobs` | GET | Get cron jobs from JSON |
| `/api/status` | GET | Get bot status |
| `/api/note` | POST | Send note/command |

## File Structure

```
jigar-dashboard/
├── index.html              # Redirect to jigar-dashboard.html
├── jigar-dashboard.html    # Main dashboard (single HTML file with CSS/JS)
├── server.js               # Node.js backend
├── jigar-tasks.json        # Tasks data
├── cron-jobs.json          # Cron jobs data (synced by Clawdbot)
├── jigar-status.json       # Bot status
└── README.md
```

## Integration with Clawdbot

This dashboard is designed to work with [Clawdbot](https://github.com/clawdbot/clawdbot). 
The `cron-jobs.json` file is automatically synced by Clawdbot during heartbeat checks.

## License

MIT

---

Built with 🦞 by Jigar for Sina
