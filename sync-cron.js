#!/usr/bin/env node
/**
 * Sync cron jobs from Clawdbot gateway to dashboard
 * Run periodically or on dashboard start
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CRON_FILE = '/root/claw/kanban/cron-jobs.json';
const GATEWAY_URL = 'http://localhost:18789';
const TOKEN = 'cfff86ce0deb155df14cd2f95abfcb343b5ef2834ded0cb6';

async function syncCronJobs() {
  try {
    // Fetch from gateway API
    const cmd = `curl -s -H "Authorization: Bearer ${TOKEN}" "${GATEWAY_URL}/api/cron/jobs"`;
    const result = execSync(cmd, { encoding: 'utf8', timeout: 10000 });
    
    const data = JSON.parse(result);
    if (data.jobs && Array.isArray(data.jobs)) {
      // Write to file
      fs.writeFileSync(CRON_FILE, JSON.stringify(data, null, 2));
      console.log(`✅ Synced ${data.jobs.length} cron jobs to ${CRON_FILE}`);
      return true;
    }
  } catch (e) {
    console.error('❌ Sync failed:', e.message);
  }
  return false;
}

// Run sync
syncCronJobs();
