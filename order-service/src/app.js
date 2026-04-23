const express = require('express');
const ordersRouter = require('./routes/orders');

const app = express();

app.use(express.json());
app.use('/orders', ordersRouter);

app.get('/health', (req, res) => {
  // Kubernetes liveness + readiness probes hit this
  res.json({ status: 'ok', service: 'order-service' });
});

module.exports = app;
