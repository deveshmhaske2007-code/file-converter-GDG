/**
 * PixelForge Studio — Node.js Server
 * Zero-dependency, ultra-fast static & SPA server built with native Node.js APIs.
 *
 * Usage:
 *   node server.js
 *   npm start
 *
 * Default Port: 3000 (or via PORT environment variable, e.g. PORT=8080 node server.js)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

// --- Server Configuration ---
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname);

// --- MIME Types Dictionary ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
};

// Known SPA paths that should serve index.html
const SPA_ROUTES = new Set([
  '/',
  '/converter',
  '/image-to-pdf',
  '/jpg-to-png',
  '/webp-to-jpg',
  '/how-it-works',
  '/privacy',
]);

/**
 * Main HTTP Request Handler
 */
const server = http.createServer((req, res) => {
  const startTime = Date.now();
  const parsedUrl = url.parse(req.url);
  const pathname = decodeURIComponent(parsedUrl.pathname || '/');

  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection: 1', 'mode=block');

  // Health check endpoint
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      service: 'PixelForge Studio Server',
    }));
    logRequest(req, res, startTime);
    return;
  }

  // App information endpoint
  if (pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      name: 'PixelForge Studio',
      architecture: '100% Client-Side Processing (Zero Server Ingestion)',
      supportedInputFormats: ['jpg', 'png', 'webp', 'gif', 'svg', 'bmp'],
      supportedOutputFormats: ['pdf', 'png', 'jpg', 'webp'],
      privacy: 'Files never leave user browser memory',
    }));
    logRequest(req, res, startTime);
    return;
  }

  // Determine file path to serve
  let targetFile = pathname;

  // SPA Route handling: if root or known route, serve index.html
  if (SPA_ROUTES.has(pathname) || !path.extname(pathname)) {
    targetFile = '/index.html';
  }

  // Prevent directory traversal attacks
  const safePath = path.normalize(targetFile).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  // Check if file exists and serve
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If requested file doesn't exist, fall back to index.html for SPA client-side routing
      const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
      fs.stat(fallbackPath, (fbErr, fbStats) => {
        if (fbErr || !fbStats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found: PixelForge Studio index.html is missing.');
          logRequest(req, res, startTime);
          return;
        }
        serveFile(req, res, fallbackPath, fbStats, startTime);
      });
      return;
    }

    serveFile(req, res, filePath, stats, startTime);
  });
});

/**
 * Stream & serve file with optional GZIP compression and caching headers
 */
function serveFile(req, res, filePath, stats, startTime) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const isCompressible = /^(text\/|application\/javascript|application\/json)/.test(contentType);

  const acceptEncoding = req.headers['accept-encoding'] || '';
  const headers = {
    'Content-Type': contentType,
  };

  // Static asset caching headers
  if (ext === '.html') {
    headers['Cache-Control'] = 'no-cache';
  } else {
    headers['Cache-Control'] = 'public, max-age=86400'; // 1 day
  }

  const rawStream = fs.createReadStream(filePath);

  // Compress with Gzip if client supports it and file is text/code
  if (isCompressible && acceptEncoding.includes('gzip')) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    rawStream.pipe(zlib.createGzip()).pipe(res);
  } else if (isCompressible && acceptEncoding.includes('deflate')) {
    headers['Content-Encoding'] = 'deflate';
    res.writeHead(200, headers);
    rawStream.pipe(zlib.createDeflate()).pipe(res);
  } else {
    headers['Content-Length'] = stats.size;
    res.writeHead(200, headers);
    rawStream.pipe(res);
  }

  res.on('finish', () => {
    logRequest(req, res, startTime);
  });
}

/**
 * Clean, colored request logging in terminal
 */
function logRequest(req, res, startTime) {
  const duration = Date.now() - startTime;
  const status = res.statusCode;
  const color = status >= 400 ? '\x1b[31m' : status >= 300 ? '\x1b[33m' : '\x1b[32m';
  const reset = '\x1b[0m';
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} -> ${color}${status}${reset} (${duration}ms)`);
}

// --- Start Server ---
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('\x1b[35m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[35m║\x1b[0m   \x1b[1m\x1b[36mPixelForge Studio — Client-Side Image & PDF Server\x1b[0m         \x1b[35m║\x1b[0m');
  console.log('\x1b[35m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
  console.log('');
  console.log(`  \x1b[32m✔\x1b[0m  Local:    \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`  \x1b[32m✔\x1b[0m  Network:  \x1b[36mhttp://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}\x1b[0m`);
  console.log(`  \x1b[32m✔\x1b[0m  Engine:   100% In-Browser RAM Execution (Zero Cloud Leaks)`);
  console.log('');
  console.log('  Press \x1b[1mCtrl+C\x1b[0m to stop the server.');
  console.log('');
});

// --- Graceful Shutdown ---
function shutdown() {
  console.log('\nGracefully shutting down PixelForge Studio server...');
  server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
