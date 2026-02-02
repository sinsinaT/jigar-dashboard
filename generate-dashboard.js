#!/usr/bin/env node
/**
 * Dynamic Kanban Dashboard Generator
 * Reads tasks.json and generates index.html
 */

const fs = require('fs');
const path = require('path');

const TASKS_FILE = path.join(__dirname, 'tasks.json');
const OUTPUT_FILE = path.join(__dirname, 'index.html');

// Read tasks.json
let data;
try {
  data = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
} catch (e) {
  console.error('Error reading tasks.json:', e.message);
  process.exit(1);
}

const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

// Generate task HTML for a column
function generateTasks(tasks) {
  if (!tasks || tasks.length === 0) return '<div class="task empty">No tasks</div>';
  
  return tasks.map(task => {
    const notes = task.notes ? `<div class="task-notes">${task.notes}</div>` : '';
    const priority = task.priority === 'high' ? ' priority-high' : '';
    return `
        <div class="task${priority}">
          <div class="task-title">${task.title}</div>
          ${notes}
          <div class="task-meta">Added ${task.created}</div>
        </div>`;
  }).join('\n');
}

// Generate project cards
function generateProjects(projects) {
  if (!projects || projects.length === 0) return '';
  
  return projects.map(p => `
        <div class="project-card ${p.status === 'paused' ? 'paused' : ''}">
          <div class="project-icon">${p.icon}</div>
          <div class="project-name">${p.name}</div>
          <div class="project-path">${p.path}</div>
          <div class="project-desc">${p.description}</div>
          ${p.status === 'paused' ? '<div class="project-status">⏸️ Paused</div>' : ''}
        </div>`).join('\n');
}

// Count tasks
const counts = {
  ideas: data.columns.find(c => c.id === 'ideas')?.tasks?.length || 0,
  todo: data.columns.find(c => c.id === 'todo')?.tasks?.length || 0,
  inprogress: data.columns.find(c => c.id === 'inprogress')?.tasks?.length || 0,
  done: data.columns.find(c => c.id === 'done')?.tasks?.length || 0
};

const projectCount = data.projects?.length || 0;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🦞 Clawdbot Dashboard - Sina</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
      min-height: 100vh;
      color: #fff;
      padding: 20px;
    }
    header {
      text-align: center;
      margin-bottom: 30px;
      padding: 20px;
      background: rgba(255,255,255,0.03);
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    header h1 { font-size: 1.8rem; margin-bottom: 5px; }
    header p { color: #888; font-size: 0.9rem; }
    .live-badge { 
      display: inline-block;
      background: #6bcb77;
      color: #000;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.7rem;
      margin-left: 10px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    .dashboard { max-width: 1400px; margin: 0 auto; }
    .section { margin-bottom: 30px; }
    .section-title {
      font-size: 1.2rem;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-title span { font-size: 1.4rem; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .stat-value { font-size: 2rem; font-weight: 700; color: #4a9eff; }
    .stat-label { font-size: 0.8rem; color: #888; margin-top: 5px; }
    .board { display: flex; gap: 20px; overflow-x: auto; padding-bottom: 10px; }
    .column {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 15px;
      min-width: 280px;
      flex: 1;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .column-header {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
    }
    .task-count {
      background: rgba(255,255,255,0.1);
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.8rem;
    }
    .task {
      background: rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
      border-left: 3px solid #888;
      transition: all 0.2s;
    }
    .task:hover { background: rgba(255,255,255,0.12); transform: translateX(3px); }
    .task-title { font-size: 0.9rem; margin-bottom: 4px; font-weight: 500; }
    .task-notes { font-size: 0.8rem; color: #aaa; margin-bottom: 4px; }
    .task-meta { font-size: 0.75rem; color: #666; }
    .task.priority-high { border-left-color: #ff6b6b; }
    .task.empty { color: #555; font-style: italic; border-left-color: transparent; }
    .column[data-id="ideas"] .task { border-left-color: #9b59b6; }
    .column[data-id="todo"] .task { border-left-color: #ffd93d; }
    .column[data-id="inprogress"] .task { border-left-color: #6bcb77; }
    .column[data-id="done"] .task { border-left-color: #4a9eff; }
    .column[data-id="inprogress"] .task.priority-high { border-left-color: #ff6b6b; }
    .projects-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 15px;
    }
    .project-card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 20px;
      border: 1px solid rgba(255,255,255,0.1);
      transition: all 0.2s;
    }
    .project-card:hover {
      background: rgba(255,255,255,0.08);
      transform: translateY(-3px);
      border-color: rgba(74, 158, 255, 0.3);
    }
    .project-card.paused { opacity: 0.6; }
    .project-icon { font-size: 2rem; margin-bottom: 10px; }
    .project-name { font-size: 1.1rem; font-weight: 600; margin-bottom: 5px; }
    .project-path { font-size: 0.7rem; color: #555; font-family: monospace; margin-bottom: 10px; word-break: break-all; }
    .project-desc { font-size: 0.85rem; color: #aaa; }
    .project-status { font-size: 0.75rem; color: #888; margin-top: 8px; }
    footer {
      text-align: center;
      margin-top: 40px;
      padding: 20px;
      color: #555;
      font-size: 0.8rem;
    }
    @media (max-width: 768px) {
      .board { flex-direction: column; }
      .column { min-width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <h1>🦞 Clawdbot Dashboard <span class="live-badge">● LIVE</span></h1>
    <p>Sina's AI Assistant • Last updated: ${timestamp}</p>
  </header>
  
  <div class="dashboard">
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${projectCount}</div>
        <div class="stat-label">Active Projects</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${counts.inprogress}</div>
        <div class="stat-label">In Progress</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${counts.todo}</div>
        <div class="stat-label">To Do</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #6bcb77;">●</div>
        <div class="stat-label">Clawdbot Online</div>
      </div>
    </div>
    
    <div class="section">
      <div class="section-title"><span>📋</span> Task Board</div>
      <div class="board">
        <div class="column" data-id="ideas">
          <div class="column-header">
            <span>💡 Ideas</span>
            <span class="task-count">${counts.ideas}</span>
          </div>
          ${generateTasks(data.columns.find(c => c.id === 'ideas')?.tasks)}
        </div>
        
        <div class="column" data-id="todo">
          <div class="column-header">
            <span>📋 To Do</span>
            <span class="task-count">${counts.todo}</span>
          </div>
          ${generateTasks(data.columns.find(c => c.id === 'todo')?.tasks)}
        </div>
        
        <div class="column" data-id="inprogress">
          <div class="column-header">
            <span>🔄 In Progress</span>
            <span class="task-count">${counts.inprogress}</span>
          </div>
          ${generateTasks(data.columns.find(c => c.id === 'inprogress')?.tasks)}
        </div>
        
        <div class="column" data-id="done">
          <div class="column-header">
            <span>✅ Done</span>
            <span class="task-count">${counts.done}</span>
          </div>
          ${generateTasks(data.columns.find(c => c.id === 'done')?.tasks)}
        </div>
      </div>
    </div>
    
    <div class="section">
      <div class="section-title"><span>📁</span> Projects</div>
      <div class="projects-grid">
        ${generateProjects(data.projects)}
      </div>
    </div>
  </div>
  
  <footer>
    <p>🦞 Clawdbot Dashboard • Data from tasks.json</p>
    <p>Tell me "add task: [title]" or "update dashboard" in Telegram</p>
  </footer>
</body>
</html>`;

fs.writeFileSync(OUTPUT_FILE, html);
console.log(`Dashboard generated at ${timestamp}`);
