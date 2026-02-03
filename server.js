// server.js - Simple Express server for clean routes (ESM)
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { initTelegramBot } from './telegram-bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Detect environment
const IS_FLYIO = process.env.FLY_APP_NAME !== undefined;
const DATA_DIR = IS_FLYIO ? '/data' : path.join(__dirname, 'public/data');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes - Import và mount API handlers
async function setupAPIRoutes() {
  const apiFiles = [
    // Keys management
    { path: '/api/keys/create', file: './api/keys/create.js' },
    { path: '/api/keys/delete', file: './api/keys/delete.js' },
    { path: '/api/keys/list', file: './api/keys/list.js' },
    { path: '/api/keys/verify', file: './api/keys/verify.js' },
    // Payment
    { path: '/api/check-order', file: './api/check-order.js' },
    { path: '/api/buy-vpn', file: './api/buy-vpn.js' },
    // Admin (optional)
    { path: '/api/upload', file: './api/upload.js' },
    { path: '/api/sync-ipa', file: './api/sync-ipa.js' },
    // Auth
    { path: '/api/auth/login', file: './api/auth/login.js' },
    { path: '/api/auth/verify', file: './api/auth/verify.js' },
  ];

  for (const route of apiFiles) {
    try {
      const module = await import(route.file);
      app.all(route.path, (req, res) => module.default(req, res));
      console.log(`✅ Loaded API: ${route.path}`);
    } catch (error) {
      console.warn(`⚠️  Failed to load ${route.path}:`, error.message);
    }
  }
}

// Start server
async function startServer() {
  // Setup API routes FIRST
  await setupAPIRoutes();
  
  // Then setup other routes
  setupDataRoutes();
  setupPageRoutes();
  setup404Handler();
  
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Environment: ${IS_FLYIO ? 'Fly.io' : 'Local/Vercel'}`);
    console.log(`Data directory: ${DATA_DIR}`);
  });
}

// Separate function for data file endpoints
function setupDataRoutes() {
  // API endpoints to serve data files
  app.get('/data/:filename', async (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(DATA_DIR, filename);
      
      const data = await fs.readFile(filePath, 'utf-8');
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    } catch (error) {
      console.error('Error reading file:', error);
      res.status(404).json({ error: 'File not found', details: error.message });
    }
  });

  // Also serve pages/data files
  app.get('/pages/data/:filename', async (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(DATA_DIR, filename);
      
      const data = await fs.readFile(filePath, 'utf-8');
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    } catch (error) {
      console.error('Error reading file:', error);
      res.status(404).json({ error: 'File not found', details: error.message });
    }
  });
}

// Setup page routes
function setupPageRoutes() {
  // Route mapping: map clean URLs to HTML files
  const routeMap = {
    '/': 'index.html',
    '/admin': 'pages/admin.html',
    '/cert': 'pages/cert.html',
    '/conf': 'pages/conf.html',
    '/dylib': 'pages/dylib.html',
    // '/home': 'pages/home.html',
    '/ipa': 'pages/ipa.html',
    '/signipa': 'signipa.html',
    '/proxy': 'proxy.html',
    '/payment': 'payment.html',
  };

  Object.entries(routeMap).forEach(([route, file]) => {
    app.get(route, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', file));
    });
  });

  // Serve static files from public - AFTER API routes
  app.use(express.static(path.join(__dirname, 'public')));
}

// Setup 404 handler
function setup404Handler() {
  // Fallback for 404 - chỉ cho non-API routes
  app.use((req, res) => {
    // Nếu là API request, trả JSON error
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ success: false, error: 'API endpoint not found' });
    } else {
      // Nếu là page request, trả index.html
      res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });

  // Start Telegram Bot
  initTelegramBot();

  // 🤖 AUTO SYNC IPA - Chạy định kỳ mỗi 6 giờ
  startAutoSyncIPA();
}

// Auto Sync IPA Function
function startAutoSyncIPA() {
  const SYNC_INTERVAL = 6 * 60 * 60 * 1000; // 6 giờ (ms)
  const APPTESTER_URL = process.env.APPTESTER_URL;

  if (!APPTESTER_URL) {
    console.log('⚠️  APPTESTER_URL not configured, auto-sync disabled');
    return;
  }

  console.log(`✅ Auto-Sync IPA enabled (Every 6 hours)`);

  // Chạy ngay lần đầu khi server start (sau 30s để đảm bảo server đã ready)
  setTimeout(() => {
    runSyncIPA();
  }, 30000);

  // Sau đó chạy định kỳ mỗi 6 giờ
  setInterval(() => {
    runSyncIPA();
  }, SYNC_INTERVAL);
}

// Function thực thi sync
async function runSyncIPA() {
  try {
    console.log('🔄 [AUTO-SYNC] Starting IPA sync...', new Date().toISOString());
    
    const syncModule = await import('./api/sync-ipa.js');
    
    // Tạo mock request/response object
    const mockReq = {
      method: 'POST',
      headers: {},
      body: {
        syncHours: 24, // Sync apps từ 24h gần nhất
        botSync: true   // Bypass auth check
      }
    };

    const mockRes = {
      statusCode: 200,
      headers: {},
      setHeader: function(key, value) {
        this.headers[key] = value;
      },
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        if (this.statusCode === 200) {
          console.log(`✅ [AUTO-SYNC] Success: ${data.message || 'Synced'}`);
        } else {
          console.error(`❌ [AUTO-SYNC] Failed:`, data);
        }
        return this;
      },
      end: function() {
        return this;
      }
    };

    await syncModule.default(mockReq, mockRes);
  } catch (error) {
    console.error('❌ [AUTO-SYNC] Error:', error.message);
  }
}

startServer();
