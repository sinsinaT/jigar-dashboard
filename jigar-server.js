#!/usr/bin/env node
/**
 * 🤓 Jigar Dashboard v3 - Sidebar + Docs Editor + Cron Scheduler
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const url = require('url');

const PORT = process.env.JIGAR_PORT || 18800;
const WORKSPACE = process.env.JIGAR_WORKSPACE || '/root/claw';
const TASKS_FILE = path.join(WORKSPACE, 'kanban/jigar-tasks.json');

// Worker state
let workerState = {
  isWorking: false,
  currentTask: null,
  lastActivity: new Date().toISOString()
};

// Initialize tasks
function initTasks() {
  let tasks = { todo: [], progress: [], done: [], archive: [], ideas: [] };
  if (fs.existsSync(TASKS_FILE)) {
    try {
      tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
      if (!tasks.ideas) tasks.ideas = [];
    } catch (e) {}
  }
  return tasks;
}

function saveTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

// Scan and group markdown files by project
function scanMarkdownFiles() {
  const docs = [];
  const ignoreDirs = ['node_modules', '.git', 'venv', '__pycache__', '.cache'];
  
  function scan(dir, depth = 0) {
    if (depth > 4) return;
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (ignoreDirs.includes(item)) continue;
        const fullPath = path.join(dir, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scan(fullPath, depth + 1);
          } else if (item.endsWith('.md')) {
            const relativePath = path.relative(WORKSPACE, fullPath);
            const content = fs.readFileSync(fullPath, 'utf8');
            const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim() || item;
            
            // Determine project/group
            const parts = relativePath.split('/');
            let project = 'Root';
            if (parts.length > 1) {
              if (parts[0] === 'projects') project = parts[1] || 'projects';
              else if (parts[0] === 'memory') project = '📝 Memory';
              else if (parts[0] === 'ai-trends') project = '🤖 AI Trends';
              else if (parts[0] === 'nightly-builds') project = '🌙 Nightly Builds';
              else if (parts[0] === 'ml-mastery') project = '🧠 ML Mastery';
              else project = parts[0];
            }
            
            docs.push({
              name: item,
              path: relativePath,
              fullPath,
              title: firstLine.substring(0, 60),
              size: stat.size,
              modified: stat.mtime.toISOString(),
              preview: content.substring(0, 200).replace(/\n/g, ' '),
              project
            });
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
  
  scan(WORKSPACE);
  
  // Group by project
  const grouped = {};
  docs.forEach(doc => {
    if (!grouped[doc.project]) grouped[doc.project] = [];
    grouped[doc.project].push(doc);
  });
  
  // Sort each group by modified date
  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => new Date(b.modified) - new Date(a.modified));
  });
  
  return grouped;
}

// Get file content for editing
function getFileContent(filePath) {
  const fullPath = path.join(WORKSPACE, filePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch (e) {
    return null;
  }
}

// Save file content
function saveFileContent(filePath, content) {
  const fullPath = path.join(WORKSPACE, filePath);
  try {
    fs.writeFileSync(fullPath, content);
    return true;
  } catch (e) {
    return false;
  }
}

// Get cron jobs from cached file
function getCronJobs() {
  const cronFile = path.join(WORKSPACE, 'kanban/cron-jobs.json');
  try {
    if (fs.existsSync(cronFile)) {
      return JSON.parse(fs.readFileSync(cronFile, 'utf8'));
    }
  } catch (e) {}
  return { jobs: [] };
}

// Get worker status
function getWorkerStatus() {
  try {
    const result = execSync('pgrep -f "claude" 2>/dev/null || echo ""', { encoding: 'utf8' });
    workerState.isWorking = result.trim().length > 0;
    workerState.lastActivity = new Date().toISOString();
  } catch (e) {
    workerState.isWorking = false;
  }
  return workerState;
}

// HTML Dashboard
function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🤓 Jigar Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
      color: #e4e4e4;
      min-height: 100vh;
      display: flex;
    }
    
    /* Sidebar */
    .sidebar {
      width: 240px;
      background: rgba(0,0,0,0.4);
      border-right: 1px solid rgba(255,255,255,0.1);
      display: flex;
      flex-direction: column;
      height: 100vh;
      position: fixed;
    }
    .sidebar-header {
      padding: 1.25rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .sidebar-header h1 {
      font-size: 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.3rem 0.6rem;
      background: rgba(0,0,0,0.3);
      border-radius: 12px;
      font-size: 0.75rem;
      margin-top: 0.75rem;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    .status-dot.working { background: #4ade80; }
    .status-dot.idle { background: #fbbf24; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .nav-menu {
      flex: 1;
      padding: 1rem 0;
      overflow-y: auto;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1.25rem;
      color: #9ca3af;
      cursor: pointer;
      transition: all 0.2s;
      border-left: 3px solid transparent;
    }
    .nav-item:hover { background: rgba(255,255,255,0.05); color: #e4e4e4; }
    .nav-item.active {
      background: rgba(59,130,246,0.1);
      color: #3b82f6;
      border-left-color: #3b82f6;
    }
    .nav-icon { font-size: 1.1rem; }
    
    /* Main Content */
    .main {
      flex: 1;
      margin-left: 240px;
      padding: 1.5rem 2rem;
      overflow-y: auto;
      height: 100vh;
    }
    .page-header {
      margin-bottom: 1.5rem;
    }
    .page-title {
      font-size: 1.5rem;
      font-weight: 600;
    }
    .page-subtitle {
      color: #6b7280;
      font-size: 0.9rem;
      margin-top: 0.25rem;
    }
    
    /* Kanban Board */
    .board {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 1rem;
      min-height: calc(100vh - 150px);
    }
    .column {
      background: rgba(0,0,0,0.2);
      border-radius: 12px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
    }
    .column-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid rgba(255,255,255,0.1);
    }
    .column-title { font-weight: 600; font-size: 0.9rem; }
    .column-count {
      background: rgba(255,255,255,0.1);
      padding: 0.2rem 0.5rem;
      border-radius: 10px;
      font-size: 0.75rem;
    }
    .tasks {
      flex: 1;
      overflow-y: auto;
    }
    .task {
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
      padding: 0.75rem;
      margin-bottom: 0.5rem;
      cursor: pointer;
      transition: all 0.2s;
      border-left: 3px solid transparent;
    }
    .task:hover { background: rgba(255,255,255,0.1); transform: translateX(2px); }
    .task.priority-high { border-left-color: #ef4444; }
    .task.priority-medium { border-left-color: #f59e0b; }
    .task.priority-low { border-left-color: #22c55e; }
    .task-title { font-weight: 500; font-size: 0.9rem; margin-bottom: 0.25rem; }
    .task-notes { font-size: 0.8rem; color: #9ca3af; }
    .task-meta { font-size: 0.7rem; color: #6b7280; margin-top: 0.5rem; }
    .add-task {
      width: 100%;
      padding: 0.5rem;
      background: rgba(255,255,255,0.03);
      border: 1px dashed rgba(255,255,255,0.15);
      border-radius: 8px;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 0.5rem;
    }
    .add-task:hover { background: rgba(255,255,255,0.08); color: #9ca3af; }
    
    /* Docs View */
    .docs-container {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 1.5rem;
      height: calc(100vh - 150px);
    }
    .docs-sidebar {
      background: rgba(0,0,0,0.2);
      border-radius: 12px;
      padding: 1rem;
      overflow-y: auto;
    }
    .project-group {
      margin-bottom: 1rem;
    }
    .project-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      color: #9ca3af;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      border-radius: 6px;
    }
    .project-header:hover { background: rgba(255,255,255,0.05); }
    .project-files {
      padding-left: 1rem;
    }
    .doc-item {
      padding: 0.5rem 0.75rem;
      color: #9ca3af;
      font-size: 0.85rem;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.15s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .doc-item:hover { background: rgba(255,255,255,0.05); color: #e4e4e4; }
    .doc-item.active { background: rgba(59,130,246,0.2); color: #3b82f6; }
    
    .docs-editor {
      background: rgba(0,0,0,0.2);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .editor-header {
      padding: 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .editor-title { font-weight: 600; }
    .editor-path { font-size: 0.75rem; color: #6b7280; font-family: monospace; }
    .editor-actions { display: flex; gap: 0.5rem; }
    .editor-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .editor-textarea {
      flex: 1;
      width: 100%;
      padding: 1rem;
      background: transparent;
      border: none;
      color: #e4e4e4;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9rem;
      line-height: 1.6;
      resize: none;
    }
    .editor-textarea:focus { outline: none; }
    .editor-preview {
      flex: 1;
      padding: 1rem;
      overflow-y: auto;
      line-height: 1.6;
    }
    .editor-tabs {
      display: flex;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .editor-tab {
      padding: 0.5rem 1rem;
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      border-bottom: 2px solid transparent;
    }
    .editor-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; }
    
    /* Cron View */
    .cron-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .cron-card {
      background: rgba(0,0,0,0.2);
      border-radius: 12px;
      padding: 1.25rem;
      border-left: 4px solid #3b82f6;
    }
    .cron-card.disabled { opacity: 0.5; border-left-color: #6b7280; }
    .cron-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }
    .cron-name { font-weight: 600; font-size: 1rem; }
    .cron-schedule {
      font-family: monospace;
      background: rgba(255,255,255,0.1);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .cron-details { font-size: 0.85rem; color: #9ca3af; margin-bottom: 0.75rem; }
    .cron-meta {
      display: flex;
      gap: 1.5rem;
      font-size: 0.8rem;
      color: #6b7280;
    }
    .cron-meta span { display: flex; align-items: center; gap: 0.3rem; }
    .cron-status {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .cron-status.ok { background: rgba(34,197,94,0.2); color: #22c55e; }
    .cron-status.error { background: rgba(239,68,68,0.2); color: #ef4444; }
    .cron-status.pending { background: rgba(251,191,36,0.2); color: #fbbf24; }
    
    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }
    .modal-overlay.active { display: flex; }
    .modal {
      background: #1e293b;
      border-radius: 16px;
      padding: 1.5rem;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .modal-close {
      background: none;
      border: none;
      color: #9ca3af;
      font-size: 1.5rem;
      cursor: pointer;
    }
    .form-group { margin-bottom: 1rem; }
    .form-group label { display: block; margin-bottom: 0.5rem; color: #9ca3af; font-size: 0.9rem; }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%;
      padding: 0.75rem;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: white;
      font-size: 0.95rem;
    }
    .form-group textarea { min-height: 80px; resize: vertical; }
    .form-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      margin-top: 1.25rem;
    }
    .btn {
      padding: 0.6rem 1.25rem;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: all 0.2s;
    }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-secondary { background: rgba(255,255,255,0.1); color: #9ca3af; }
    .btn-success { background: #22c55e; color: white; }
    
    .hidden { display: none !important; }
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <!-- Sidebar -->
  <div class="sidebar">
    <div class="sidebar-header">
      <h1>🤓 Jigar</h1>
      <div class="status-badge">
        <div class="status-dot" id="statusDot"></div>
        <span id="statusText">Checking...</span>
      </div>
    </div>
    <nav class="nav-menu">
      <div class="nav-item active" data-view="board">
        <span class="nav-icon">📋</span>
        <span>Kanban Board</span>
      </div>
      <div class="nav-item" data-view="docs">
        <span class="nav-icon">📄</span>
        <span>Documents</span>
      </div>
      <div class="nav-item" data-view="cron">
        <span class="nav-icon">⏰</span>
        <span>Cron Scheduler</span>
      </div>
    </nav>
  </div>
  
  <!-- Main Content -->
  <div class="main">
    <!-- Kanban View -->
    <div id="boardView">
      <div class="page-header">
        <h2 class="page-title">Kanban Board</h2>
        <p class="page-subtitle">Drag tasks between columns or click to edit</p>
      </div>
      <div class="board">
        <div class="column" data-column="ideas">
          <div class="column-header">
            <span class="column-title">💡 Ideas</span>
            <span class="column-count" id="count-ideas">0</span>
          </div>
          <div class="tasks" id="tasks-ideas"></div>
          <button class="add-task" onclick="openAddModal('ideas')">+ Add Idea</button>
        </div>
        <div class="column" data-column="todo">
          <div class="column-header">
            <span class="column-title">📋 To Do</span>
            <span class="column-count" id="count-todo">0</span>
          </div>
          <div class="tasks" id="tasks-todo"></div>
          <button class="add-task" onclick="openAddModal('todo')">+ Add Task</button>
        </div>
        <div class="column" data-column="progress">
          <div class="column-header">
            <span class="column-title">🔄 In Progress</span>
            <span class="column-count" id="count-progress">0</span>
          </div>
          <div class="tasks" id="tasks-progress"></div>
          <button class="add-task" onclick="openAddModal('progress')">+ Add</button>
        </div>
        <div class="column" data-column="done">
          <div class="column-header">
            <span class="column-title">✅ Done</span>
            <span class="column-count" id="count-done">0</span>
          </div>
          <div class="tasks" id="tasks-done"></div>
        </div>
        <div class="column" data-column="archive">
          <div class="column-header">
            <span class="column-title">📦 Archive</span>
            <span class="column-count" id="count-archive">0</span>
          </div>
          <div class="tasks" id="tasks-archive"></div>
        </div>
      </div>
    </div>
    
    <!-- Docs View -->
    <div id="docsView" class="hidden">
      <div class="page-header">
        <h2 class="page-title">Documents</h2>
        <p class="page-subtitle">Browse and edit project markdown files</p>
      </div>
      <div class="docs-container">
        <div class="docs-sidebar" id="docsSidebar"></div>
        <div class="docs-editor">
          <div class="editor-header">
            <div>
              <div class="editor-title" id="editorTitle">Select a document</div>
              <div class="editor-path" id="editorPath"></div>
            </div>
            <div class="editor-actions">
              <button class="btn btn-success" id="saveDocBtn" onclick="saveDocument()" style="display:none">💾 Save</button>
            </div>
          </div>
          <div class="editor-tabs">
            <button class="editor-tab active" data-mode="edit" onclick="setEditorMode('edit')">Edit</button>
            <button class="editor-tab" data-mode="preview" onclick="setEditorMode('preview')">Preview</button>
          </div>
          <div class="editor-content">
            <textarea class="editor-textarea" id="editorTextarea" placeholder="Select a document from the sidebar..."></textarea>
            <div class="editor-preview hidden" id="editorPreview"></div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Cron View -->
    <div id="cronView" class="hidden">
      <div class="page-header">
        <h2 class="page-title">Cron Scheduler</h2>
        <p class="page-subtitle">Automated tasks and scheduled jobs</p>
      </div>
      <div class="cron-list" id="cronList"></div>
    </div>
  </div>
  
  <!-- Task Modal -->
  <div class="modal-overlay" id="taskModal">
    <div class="modal">
      <div class="modal-header">
        <h2 id="modalTitle">Add Task</h2>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <form id="taskForm">
        <input type="hidden" id="taskId">
        <input type="hidden" id="taskColumn">
        <div class="form-group">
          <label>Title</label>
          <input type="text" id="taskTitle" required>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea id="taskNotes"></textarea>
        </div>
        <div class="form-group">
          <label>Priority</label>
          <select id="taskPriority">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div class="form-group" id="moveGroup" style="display:none;">
          <label>Move to</label>
          <select id="taskMove">
            <option value="">Keep in current column</option>
            <option value="ideas">💡 Ideas</option>
            <option value="todo">📋 To Do</option>
            <option value="progress">🔄 In Progress</option>
            <option value="done">✅ Done</option>
            <option value="archive">📦 Archive</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-danger" id="deleteBtn" style="display:none;" onclick="deleteTask()">Delete</button>
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    let tasks = { ideas: [], todo: [], progress: [], done: [], archive: [] };
    let docs = {};
    let cronJobs = [];
    let editingTask = null;
    let currentDoc = null;
    let docModified = false;
    
    // Fetch tasks
    async function fetchTasks() {
      const res = await fetch('/api/tasks');
      tasks = await res.json();
      renderTasks();
    }
    
    // Fetch docs
    async function fetchDocs() {
      const res = await fetch('/api/docs');
      docs = await res.json();
      renderDocsSidebar();
    }
    
    // Fetch cron jobs
    async function fetchCron() {
      const res = await fetch('/api/cron');
      const data = await res.json();
      cronJobs = data.jobs || [];
      renderCron();
    }
    
    // Render tasks
    function renderTasks() {
      ['ideas', 'todo', 'progress', 'done', 'archive'].forEach(col => {
        const container = document.getElementById('tasks-' + col);
        const count = document.getElementById('count-' + col);
        const list = tasks[col] || [];
        count.textContent = list.length;
        container.innerHTML = list.map(task => 
          '<div class="task priority-' + (task.priority || 'medium') + '" onclick="openEditModal(\\'' + col + '\\', \\'' + task.id + '\\')">' +
            '<div class="task-title">' + escapeHtml(task.title) + '</div>' +
            (task.notes ? '<div class="task-notes">' + escapeHtml(task.notes).substring(0, 80) + '</div>' : '') +
            '<div class="task-meta">' + task.created + '</div>' +
          '</div>'
        ).join('');
      });
    }
    
    // Render docs sidebar
    function renderDocsSidebar() {
      const container = document.getElementById('docsSidebar');
      const projectOrder = ['Root', '📝 Memory', '🤖 AI Trends', '🌙 Nightly Builds', '🧠 ML Mastery'];
      const sortedProjects = Object.keys(docs).sort((a, b) => {
        const ai = projectOrder.indexOf(a);
        const bi = projectOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      });
      
      container.innerHTML = sortedProjects.map(project => {
        const files = docs[project];
        const icon = project.match(/^[\\u{1F300}-\\u{1F9FF}]/u)?.[0] || '📁';
        const name = project.replace(/^[\\u{1F300}-\\u{1F9FF}]\\s*/u, '');
        return '<div class="project-group">' +
          '<div class="project-header">' +
            '<span>' + icon + '</span>' +
            '<span>' + escapeHtml(name) + ' (' + files.length + ')</span>' +
          '</div>' +
          '<div class="project-files">' +
            files.map(f => '<div class="doc-item" data-path="' + f.path + '" onclick="loadDocument(\\'' + f.path + '\\')">' + escapeHtml(f.name) + '</div>').join('') +
          '</div>' +
        '</div>';
      }).join('');
    }
    
    // Load document for editing
    async function loadDocument(docPath) {
      if (docModified && !confirm('Discard unsaved changes?')) return;
      
      const res = await fetch('/api/doc?path=' + encodeURIComponent(docPath));
      const data = await res.json();
      
      currentDoc = docPath;
      docModified = false;
      
      document.getElementById('editorTitle').textContent = data.name;
      document.getElementById('editorPath').textContent = data.path;
      document.getElementById('editorTextarea').value = data.content;
      document.getElementById('saveDocBtn').style.display = 'inline-block';
      
      // Highlight active doc
      document.querySelectorAll('.doc-item').forEach(el => {
        el.classList.toggle('active', el.dataset.path === docPath);
      });
      
      setEditorMode('edit');
    }
    
    // Save document
    async function saveDocument() {
      if (!currentDoc) return;
      
      const content = document.getElementById('editorTextarea').value;
      const res = await fetch('/api/doc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentDoc, content })
      });
      
      if (res.ok) {
        docModified = false;
        alert('Saved!');
        fetchDocs();
      } else {
        alert('Save failed');
      }
    }
    
    // Editor mode switch
    function setEditorMode(mode) {
      document.querySelectorAll('.editor-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
      document.getElementById('editorTextarea').classList.toggle('hidden', mode !== 'edit');
      document.getElementById('editorPreview').classList.toggle('hidden', mode !== 'preview');
      
      if (mode === 'preview') {
        const content = document.getElementById('editorTextarea').value;
        document.getElementById('editorPreview').innerHTML = renderMarkdown(content);
      }
    }
    
    // Simple markdown renderer
    function renderMarkdown(text) {
      return escapeHtml(text)
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/\\n/g, '<br>');
    }
    
    // Render cron jobs
    function renderCron() {
      const container = document.getElementById('cronList');
      if (cronJobs.length === 0) {
        container.innerHTML = '<div class="empty-state">No cron jobs found</div>';
        return;
      }
      
      container.innerHTML = cronJobs.map(job => {
        const nextRun = job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toLocaleString() : 'Not scheduled';
        const lastRun = job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toLocaleString() : 'Never';
        const status = job.state?.lastStatus || 'pending';
        const duration = job.state?.lastDurationMs ? (job.state.lastDurationMs / 1000).toFixed(1) + 's' : '-';
        
        return '<div class="cron-card' + (job.enabled ? '' : ' disabled') + '">' +
          '<div class="cron-header">' +
            '<span class="cron-name">' + escapeHtml(job.name || job.id) + '</span>' +
            '<span class="cron-schedule">' + escapeHtml(job.schedule?.expr || '?') + '</span>' +
          '</div>' +
          '<div class="cron-details">' + escapeHtml((job.payload?.message || '').substring(0, 150)) + '...</div>' +
          '<div class="cron-meta">' +
            '<span>⏰ Next: ' + nextRun + '</span>' +
            '<span>📅 Last: ' + lastRun + '</span>' +
            '<span>⏱️ ' + duration + '</span>' +
            '<span class="cron-status ' + status + '">' + status.toUpperCase() + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        const view = item.dataset.view;
        document.getElementById('boardView').classList.toggle('hidden', view !== 'board');
        document.getElementById('docsView').classList.toggle('hidden', view !== 'docs');
        document.getElementById('cronView').classList.toggle('hidden', view !== 'cron');
        
        if (view === 'docs') fetchDocs();
        if (view === 'cron') fetchCron();
      });
    });
    
    // Task modal functions
    function openAddModal(column) {
      document.getElementById('modalTitle').textContent = 'Add Task';
      document.getElementById('taskId').value = '';
      document.getElementById('taskColumn').value = column;
      document.getElementById('taskTitle').value = '';
      document.getElementById('taskNotes').value = '';
      document.getElementById('taskPriority').value = 'medium';
      document.getElementById('moveGroup').style.display = 'none';
      document.getElementById('deleteBtn').style.display = 'none';
      document.getElementById('taskModal').classList.add('active');
    }
    
    function openEditModal(column, taskId) {
      const task = tasks[column].find(t => String(t.id) === String(taskId));
      if (!task) return;
      editingTask = { column, task };
      
      document.getElementById('modalTitle').textContent = 'Edit Task';
      document.getElementById('taskId').value = task.id;
      document.getElementById('taskColumn').value = column;
      document.getElementById('taskTitle').value = task.title;
      document.getElementById('taskNotes').value = task.notes || '';
      document.getElementById('taskPriority').value = task.priority || 'medium';
      document.getElementById('taskMove').value = '';
      document.getElementById('moveGroup').style.display = 'block';
      document.getElementById('deleteBtn').style.display = 'inline-block';
      document.getElementById('taskModal').classList.add('active');
    }
    
    function closeModal() {
      document.getElementById('taskModal').classList.remove('active');
      editingTask = null;
    }
    
    // Save task
    document.getElementById('taskForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('taskId').value;
      const column = document.getElementById('taskColumn').value;
      const moveTo = document.getElementById('taskMove').value;
      
      const taskData = {
        title: document.getElementById('taskTitle').value,
        notes: document.getElementById('taskNotes').value,
        priority: document.getElementById('taskPriority').value
      };
      
      if (id) {
        await fetch('/api/tasks/' + column + '/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...taskData, moveTo: moveTo || undefined })
        });
      } else {
        await fetch('/api/tasks/' + column, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskData)
        });
      }
      
      closeModal();
      fetchTasks();
    });
    
    async function deleteTask() {
      if (!editingTask) return;
      if (!confirm('Delete this task?')) return;
      
      await fetch('/api/tasks/' + editingTask.column + '/' + editingTask.task.id, { method: 'DELETE' });
      closeModal();
      fetchTasks();
    }
    
    // Status polling
    async function updateStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        
        if (data.isWorking) {
          dot.className = 'status-dot working';
          text.textContent = 'Working...';
        } else {
          dot.className = 'status-dot idle';
          text.textContent = 'Idle';
        }
      } catch (e) {}
    }
    
    // Track doc modifications
    document.getElementById('editorTextarea').addEventListener('input', () => {
      docModified = true;
    });
    
    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    
    // Click outside modal
    document.getElementById('taskModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) closeModal();
    });
    
    // Init
    fetchTasks();
    updateStatus();
    setInterval(updateStatus, 5000);
  </script>
</body>
</html>`;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Routes
  if (pathname === '/' || pathname === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getDashboardHTML());
  }
  else if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getWorkerStatus()));
  }
  else if (pathname === '/api/tasks' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(initTasks()));
  }
  else if (pathname === '/api/docs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(scanMarkdownFiles()));
  }
  else if (pathname === '/api/doc' && req.method === 'GET') {
    const docPath = parsedUrl.query.path;
    const content = getFileContent(docPath);
    if (content !== null) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: path.basename(docPath),
        path: docPath,
        content
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File not found' }));
    }
  }
  else if (pathname === '/api/doc' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (saveFileContent(data.path, data.content)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Save failed' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }
  else if (pathname === '/api/cron' && req.method === 'GET') {
    const jobs = getCronJobs();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(jobs));
  }
  else if (pathname.match(/^\/api\/tasks\/(\w+)$/) && req.method === 'POST') {
    const column = pathname.split('/').pop();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const tasks = initTasks();
        if (!tasks[column]) tasks[column] = [];
        
        const newTask = {
          id: Date.now(),
          title: data.title,
          notes: data.notes || '',
          priority: data.priority || 'medium',
          created: new Date().toISOString().split('T')[0]
        };
        
        tasks[column].push(newTask);
        saveTasks(tasks);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newTask));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }
  else if (pathname.match(/^\/api\/tasks\/(\w+)\/([\d.]+)$/) && req.method === 'PUT') {
    const parts = pathname.split('/');
    const column = parts[3];
    const taskId = parts[4];
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const tasks = initTasks();
        
        const taskIndex = tasks[column]?.findIndex(t => String(t.id) === taskId);
        if (taskIndex === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Task not found' }));
          return;
        }
        
        const task = tasks[column][taskIndex];
        task.title = data.title || task.title;
        task.notes = data.notes !== undefined ? data.notes : task.notes;
        task.priority = data.priority || task.priority;
        
        if (data.moveTo && data.moveTo !== column) {
          tasks[column].splice(taskIndex, 1);
          if (!tasks[data.moveTo]) tasks[data.moveTo] = [];
          tasks[data.moveTo].push(task);
        }
        
        saveTasks(tasks);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(task));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }
  else if (pathname.match(/^\/api\/tasks\/(\w+)\/([\d.]+)$/) && req.method === 'DELETE') {
    const parts = pathname.split('/');
    const column = parts[3];
    const taskId = parts[4];
    
    const tasks = initTasks();
    const taskIndex = tasks[column]?.findIndex(t => String(t.id) === taskId);
    
    if (taskIndex > -1) {
      tasks[column].splice(taskIndex, 1);
      saveTasks(tasks);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  }
  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('🤓 Jigar Dashboard running at http://localhost:' + PORT);
  console.log('Workspace: ' + WORKSPACE);
  console.log('Tasks file: ' + TASKS_FILE);
});
