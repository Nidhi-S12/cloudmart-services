const express = require('express');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Service URLs — injected via env vars in Kubernetes
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:8000';
const ORDER_SERVICE_URL   = process.env.ORDER_SERVICE_URL   || 'http://localhost:3001';

// Request logging — logs every request with method, path, status, response time
// "dev" format: GET /api/products 200 4.321 ms
app.use(morgan('dev'));

// pathRewrite strips the /api prefix before forwarding
// e.g. GET /api/products → GET /products on product-service
function makeProxy(target, prefix, serviceName) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: { [`^/api/${prefix}`]: `/${prefix}` },
    on: {
      error: (err, _req, res) => {
        console.error(`Proxy error (${serviceName}):`, err.message);
        res.status(502).json({ error: `${serviceName} unavailable` });
      },
    },
  });
}

app.use('/api/products', makeProxy(PRODUCT_SERVICE_URL, 'products', 'product-service'));
app.use('/api/orders',   makeProxy(ORDER_SERVICE_URL,   'orders',   'order-service'));

// Health check — Kubernetes probes hit this
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// Catch-all for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

const server = app.listen(PORT, () => {
  console.log(`api-gateway running on port ${PORT}`);
  console.log(`  /api/products → ${PRODUCT_SERVICE_URL}`);
  console.log(`  /api/orders   → ${ORDER_SERVICE_URL}`);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
