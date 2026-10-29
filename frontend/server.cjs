const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

// Serves the APA 2 build and proxies /api to its server API.
// Run with: node --env-file=.env.production server.cjs

const app = express();
const PORT = Number(process.env.PORT) || 4326;
const DIST_DIR = process.env.DIST_DIR || 'dist';
const BACKEND_HOST = process.env.BACKEND_HOST || 'dutyoutsideapi.apa2-eva.com';
const BACKEND_PROTO = process.env.BACKEND_PROTO || 'https';
const transport = BACKEND_PROTO === 'http' ? http : https;

app.use('/api', (req, res) => {
  const proxyReq = transport.request(
    {
      hostname: BACKEND_HOST,
      port: process.env.BACKEND_PORT || (BACKEND_PROTO === 'http' ? 80 : 443),
      protocol: `${BACKEND_PROTO}:`,
      family: 4,
      path: req.originalUrl,
      method: req.method,
      headers: {
        ...req.headers,
        host: BACKEND_HOST,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Backend unavailable' });
    }
  });

  req.pipe(proxyReq);
});

app.use(express.static(path.join(__dirname, DIST_DIR)));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, DIST_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${DIST_DIR}] running on http://0.0.0.0:${PORT}`);
  console.log(`API proxy -> ${BACKEND_PROTO}://${BACKEND_HOST}`);
});
