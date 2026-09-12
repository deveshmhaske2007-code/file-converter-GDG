/**
 * PixelForge Studio — Node.js Server
 * Zero-dependency static & SPA server using native Node.js APIs.
 *
 * Render-compatible:
 * - Uses process.env.PORT
 * - Listens on 0.0.0.0
 * - SPA fallback support
 * - GZIP/Deflate compression
 * - Security headers
 * - Health check endpoint
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

// ============================================================
// SERVER CONFIGURATION
// ============================================================

const PORT = Number(process.env.PORT) || 3000;

// Render requires the application to listen on 0.0.0.0
const HOST = '0.0.0.0';

// The folder containing index.html and all static files
const PUBLIC_DIR = path.resolve(__dirname);

// ============================================================
// MIME TYPES
// ============================================================

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
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
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
};

// ============================================================
// SPA ROUTES
// ============================================================

const SPA_ROUTES = new Set([
  '/',
  '/converter',
  '/image-to-pdf',
  '/jpg-to-png',
  '/webp-to-jpg',
  '/how-it-works',
  '/privacy',
]);

// ============================================================
// CREATE HTTP SERVER
// ============================================================

const server = http.createServer((req, res) => {
  const startTime = Date.now();

  try {
    const parsedUrl = url.parse(req.url || '/');

    let pathname;

    try {
      pathname = decodeURIComponent(parsedUrl.pathname || '/');
    } catch {
      sendError(res, 400, 'Bad Request');
      return;
    }

    // --------------------------------------------------------
    // Security Headers
    // --------------------------------------------------------

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // Correct header syntax
    res.setHeader('X-XSS-Protection', '1; mode=block');

    res.setHeader(
      'Referrer-Policy',
      'strict-origin-when-cross-origin'
    );

    // --------------------------------------------------------
    // Health Check
    // --------------------------------------------------------

    if (pathname === '/api/health') {
      const response = {
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        service: 'PixelForge Studio Server',
      };

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
      });

      res.end(JSON.stringify(response));

      logRequest(req, res, startTime);
      return;
    }

    // --------------------------------------------------------
    // App Information
    // --------------------------------------------------------

    if (pathname === '/api/info') {
      const response = {
        name: 'PixelForge Studio',
        architecture:
          '100% Client-Side Processing (Zero Server Ingestion)',
        supportedInputFormats: [
          'jpg',
          'png',
          'webp',
          'gif',
          'svg',
          'bmp',
        ],
        supportedOutputFormats: [
          'pdf',
          'png',
          'jpg',
          'webp',
        ],
        privacy:
          'Files never leave user browser memory',
      };

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
      });

      res.end(JSON.stringify(response));

      logRequest(req, res, startTime);
      return;
    }

    // --------------------------------------------------------
    // Only allow GET / HEAD for static files
    // --------------------------------------------------------

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Allow': 'GET, HEAD',
      });

      res.end('405 Method Not Allowed');

      logRequest(req, res, startTime);
      return;
    }

    // --------------------------------------------------------
    // Determine Requested File
    // --------------------------------------------------------

    let targetFile = pathname;

    // SPA routes should serve index.html
    if (
      SPA_ROUTES.has(pathname) ||
      !path.extname(pathname)
    ) {
      targetFile = '/index.html';
    }

    // --------------------------------------------------------
    // Prevent Directory Traversal
    // --------------------------------------------------------

    const normalizedPath = path
      .normalize(targetFile)
      .replace(/^(\.\.[/\\])+/, '');

    const filePath = path.join(
      PUBLIC_DIR,
      normalizedPath
    );

    // Make absolutely sure the file remains inside PUBLIC_DIR
    const relativePath = path.relative(
      PUBLIC_DIR,
      filePath
    );

    if (
      relativePath.startsWith('..') ||
      path.isAbsolute(relativePath)
    ) {
      sendError(res, 403, 'Forbidden');
      return;
    }

    // --------------------------------------------------------
    // Check File
    // --------------------------------------------------------

    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) {
        serveFile(
          req,
          res,
          filePath,
          stats,
          startTime
        );
        return;
      }

      // ------------------------------------------------------
      // SPA Fallback
      // ------------------------------------------------------

      const fallbackPath = path.join(
        PUBLIC_DIR,
        'index.html'
      );

      fs.stat(fallbackPath, (fallbackErr, fallbackStats) => {
        if (
          fallbackErr ||
          !fallbackStats.isFile()
        ) {
          sendError(
            res,
            404,
            '404 Not Found: index.html is missing.'
          );
          return;
        }

        serveFile(
          req,
          res,
          fallbackPath,
          fallbackStats,
          startTime
        );
      });
    });
  } catch (error) {
    console.error('Request error:', error);

    if (!res.headersSent) {
      sendError(res, 500, 'Internal Server Error');
    }
  }
});

// ============================================================
// SERVE STATIC FILE
// ============================================================

function serveFile(
  req,
  res,
  filePath,
  stats,
  startTime
) {
  const ext = path
    .extname(filePath)
    .toLowerCase();

  const contentType =
    MIME_TYPES[ext] ||
    'application/octet-stream';

  const isCompressible =
    /^(text\/|application\/(javascript|json|xml))/.test(
      contentType
    );

  const acceptEncoding =
    req.headers['accept-encoding'] || '';

  const headers = {
    'Content-Type': contentType,
  };

  // ----------------------------------------------------------
  // Cache Headers
  // ----------------------------------------------------------

  if (ext === '.html') {
    headers['Cache-Control'] = 'no-cache';
  } else {
    headers['Cache-Control'] =
      'public, max-age=86400';
  }

  // HEAD requests don't send a body
  if (req.method === 'HEAD') {
    headers['Content-Length'] = stats.size;

    res.writeHead(200, headers);
    res.end();

    logRequest(req, res, startTime);
    return;
  }

  // ----------------------------------------------------------
  // GZIP
  // ----------------------------------------------------------

  if (
    isCompressible &&
    acceptEncoding.includes('gzip')
  ) {
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';

    res.writeHead(200, headers);

    const rawStream =
      fs.createReadStream(filePath);

    rawStream
      .pipe(zlib.createGzip())
      .pipe(res);

    rawStream.on('error', (error) => {
      console.error(
        'File read error:',
        error
      );

      if (!res.headersSent) {
        sendError(
          res,
          500,
          'Internal Server Error'
        );
      } else {
        res.destroy();
      }
    });

    res.on('finish', () => {
      logRequest(req, res, startTime);
    });

    return;
  }

  // ----------------------------------------------------------
  // DEFLATE
  // ----------------------------------------------------------

  if (
    isCompressible &&
    acceptEncoding.includes('deflate')
  ) {
    headers['Content-Encoding'] = 'deflate';
    headers['Vary'] = 'Accept-Encoding';

    res.writeHead(200, headers);

    const rawStream =
      fs.createReadStream(filePath);

    rawStream
      .pipe(zlib.createDeflate())
      .pipe(res);

    rawStream.on('error', (error) => {
      console.error(
        'File read error:',
        error
      );

      res.destroy();
    });

    res.on('finish', () => {
      logRequest(req, res, startTime);
    });

    return;
  }

  // ----------------------------------------------------------
  // Normal Response
  // ----------------------------------------------------------

  headers['Content-Length'] = stats.size;

  res.writeHead(200, headers);

  const rawStream =
    fs.createReadStream(filePath);

  rawStream.pipe(res);

  rawStream.on('error', (error) => {
    console.error(
      'File read error:',
      error
    );

    res.destroy();
  });

  res.on('finish', () => {
    logRequest(req, res, startTime);
  });
}

// ============================================================
// ERROR RESPONSE
// ============================================================

function sendError(
  res,
  statusCode,
  message
) {
  if (res.headersSent) {
    res.destroy();
    return;
  }

  res.writeHead(statusCode, {
    'Content-Type':
      'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
  });

  res.end(message);
}

// ============================================================
// REQUEST LOGGING
// ============================================================

function logRequest(
  req,
  res,
  startTime
) {
  const duration =
    Date.now() - startTime;

  const status =
    res.statusCode;

  const color =
    status >= 500
      ? '\x1b[31m'
      : status >= 400
      ? '\x1b[31m'
      : status >= 300
      ? '\x1b[33m'
      : '\x1b[32m';

  const reset = '\x1b[0m';

  console.log(
    `[${new Date().toISOString()}] ` +
    `${req.method} ${req.url} -> ` +
    `${color}${status}${reset} ` +
    `(${duration}ms)`
  );
}

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, HOST, () => {
  console.log('');
  console.log(
    '\x1b[35m╔══════════════════════════════════════════════════════════════╗\x1b[0m'
  );
  console.log(
    '\x1b[35m║\x1b[0m   \x1b[1m\x1b[36mPixelForge Studio — Client-Side Image & PDF Server\x1b[0m   \x1b[35m║\x1b[0m'
  );
  console.log(
    '\x1b[35m╚══════════════════════════════════════════════════════════════╝\x1b[0m'
  );

  console.log('');
  console.log(
    `  \x1b[32m✔\x1b[0m  Port:     \x1b[36m${PORT}\x1b[0m`
  );

  console.log(
    `  \x1b[32m✔\x1b[0m  Host:     \x1b[36m${HOST}\x1b[0m`
  );

  console.log(
    `  \x1b[32m✔\x1b[0m  Health:   \x1b[36m/api/health\x1b[0m`
  );

  console.log(
    `  \x1b[32m✔\x1b[0m  Engine:   \x1b[36m100% In-Browser Processing\x1b[0m`
  );

  console.log('');
  console.log(
    '  Server is ready to receive requests.'
  );
  console.log('');
});

// ============================================================
// ERROR HANDLING
// ============================================================

server.on('error', (error) => {
  console.error(
    'Server error:',
    error
  );

  process.exit(1);
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

function shutdown(signal) {
  console.log(
    `\nReceived ${signal}. Shutting down...`
  );

  server.close(() => {
    console.log(
      'PixelForge Studio server stopped.'
    );

    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error(
      'Forced shutdown after timeout.'
    );

    process.exit(1);
  }, 10000).unref();
}

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);
