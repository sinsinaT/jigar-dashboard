const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 18800;
const WORKSPACE = '/root/claw';
const TASKS_FILE = path.join(__dirname, 'jigar-tasks.json');

// Initialize tasks file
if (!fs.existsSync(TASKS_FILE)) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify({
    todo: [],
    progress: [],
    done: [],
    archive: []
  }, null, 2));
}

// Bot status (would be updated by Clawdbot)
let botStatus = {
  isWorking: false,
  currentTask: null,
  lastActivity: new Date().toISOString()
};

// Status file for Clawdbot integration
const STATUS_FILE = path.join(__dirname, 'jigar-status.json');

function updateStatus(working, task = null) {
  botStatus.isWorking = working;
  botStatus.currentTask = task;
  botStatus.lastActivity = new Date().toISOString();
  fs.writeFileSync(STATUS_FILE, JSON.stringify(botStatus, null, 2));
}

// Get all markdown files organized by directory
function getDocsList() {
  const docs = [];
  const groups = {
    'Projects': [],
    'Memory': [],
    'Config': [],
    'Other': []
  };
  
  function scanDir(dir, relativePath = '') {
    try {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const fullPath = path.join(dir, file);
        const relPath = path.join(relativePath, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'venv') {
          scanDir(fullPath, relPath);
        } else if (file.endsWith('.md')) {
          const fileInfo = { name: file, path: relPath };
          
          if (relPath.includes('project') || relPath.includes('digital-hub')) {
            groups['Projects'].push(fileInfo);
          } else if (relPath.includes('memory')) {
            groups['Memory'].push(fileInfo);
          } else if (['TOOLS.md', 'USER.md', 'AGENTS.md', 'SOUL.md', 'MEMORY.md'].includes(file)) {
            groups['Config'].push(fileInfo);
          } else {
            groups['Other'].push(fileInfo);
          }
        }
      });
    } catch (e) {
      console.error('Error scanning:', dir, e.message);
    }
  }
  
  scanDir(WORKSPACE);
  
  // Convert to array format
  Object.keys(groups).forEach(group => {
    if (groups[group].length > 0) {
      docs.push({ group, files: groups[group].slice(0, 20) }); // Limit per group
    }
  });
  
  return docs;
}

// Simple router
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Serve dashboard
  if (pathname === '/' || pathname === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'jigar-dashboard.html'), 'utf8');
    res.writeHead(200, { 
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(html);
    return;
  }
  
  // API: Get tasks
  if (pathname === '/api/tasks' && req.method === 'GET') {
    try {
      const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tasks));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  
  // API: Save tasks
  if (pathname === '/api/tasks' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const tasks = JSON.parse(body);
        fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // API: Get docs list
  if (pathname === '/api/docs' && req.method === 'GET') {
    try {
      const docs = getDocsList();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(docs));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  
  // API: Get file content
  if (pathname === '/api/file' && req.method === 'GET') {
    const filePath = parsedUrl.query.path;
    if (!filePath) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing path parameter');
      return;
    }
    
    try {
      const fullPath = path.join(WORKSPACE, filePath);
      // Security: ensure path is within workspace
      if (!fullPath.startsWith(WORKSPACE)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access denied');
        return;
      }
      
      const content = fs.readFileSync(fullPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(content);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found: ' + e.message);
    }
    return;
  }
  
  // API: Save file content
  if (pathname === '/api/file' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { path: filePath, content } = JSON.parse(body);
        const fullPath = path.join(WORKSPACE, filePath);
        
        // Security: ensure path is within workspace
        if (!fullPath.startsWith(WORKSPACE)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Access denied' }));
          return;
        }
        
        fs.writeFileSync(fullPath, content, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // API: Send note/command
  if (pathname === '/api/note' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { note } = JSON.parse(body);
        console.log('Note received:', note);
        
        // Here you could integrate with Clawdbot/Telegram
        // For now, just log it
        const notesLog = path.join(__dirname, 'jigar-notes.log');
        fs.appendFileSync(notesLog, `${new Date().toISOString()} | ${note}\n`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Note received' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // API: Get bot status
  if (pathname === '/api/status' && req.method === 'GET') {
    try {
      if (fs.existsSync(STATUS_FILE)) {
        botStatus = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(botStatus));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(botStatus));
    }
    return;
  }
  
  // API: Update bot status
  if (pathname === '/api/status' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { working, task } = JSON.parse(body);
        updateStatus(working, task);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // API: Video callback from kie.ai
  if (pathname === '/api/video-callback' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const callback = JSON.parse(body);
        console.log('Video callback received:', JSON.stringify(callback, null, 2));
        
        // Save callback to file
        const callbackFile = path.join(__dirname, 'video-callbacks.json');
        let callbacks = [];
        if (fs.existsSync(callbackFile)) {
          callbacks = JSON.parse(fs.readFileSync(callbackFile, 'utf8'));
        }
        callbacks.push({
          timestamp: new Date().toISOString(),
          data: callback
        });
        fs.writeFileSync(callbackFile, JSON.stringify(callbacks, null, 2));
        
        // If successful, download and save the video
        if (callback.code === 200 && callback.data?.info?.resultUrls?.[0]) {
          const videoUrl = callback.data.info.resultUrls[0];
          console.log('Downloading video from:', videoUrl);
          const https = require('https');
          const videoPath = path.join('/root/claw/media', `video-${callback.data.taskId}.mp4`);
          const file = fs.createWriteStream(videoPath);
          https.get(videoUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              console.log('Video saved to:', videoPath);
            });
          });
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error('Callback error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // API: Get video callbacks
  if (pathname === '/api/video-callbacks' && req.method === 'GET') {
    const callbackFile = path.join(__dirname, 'video-callbacks.json');
    if (fs.existsSync(callbackFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.readFileSync(callbackFile, 'utf8'));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }
  
  // API: Get cron jobs
  if (pathname === '/api/cron-jobs' && req.method === 'GET') {
    const cronFile = path.join(__dirname, 'cron-jobs.json');
    if (fs.existsSync(cronFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.readFileSync(cronFile, 'utf8'));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jobs: [], lastUpdated: null }));
    }
    return;
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🤓 Jigar Dashboard running at http://localhost:${PORT}`);
  console.log(`   Workspace: ${WORKSPACE}`);
  console.log(`   Tasks file: ${TASKS_FILE}`);
});

// Initialize status
updateStatus(false);
