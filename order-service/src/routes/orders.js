const express = require('express');
const { v4: uuidv4 } = require('uuid');
const redis = require('../redis');
const { publishEvent } = require('../kafka');

const router = express.Router();

// Orders are stored in Redis as: order:<id> → JSON string
// TTL of 24 hours — orders are transient here, not the source of truth
const ORDER_TTL_SECONDS = 60 * 60 * 24;

// POST /orders — create a new order
router.post('/', async (req, res) => {
  const { customerId, items } = req.body;

  if (!customerId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'customerId and items are required' });
  }

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const order = {
    id: uuidv4(),
    customerId,
    items,
    total: parseFloat(total.toFixed(2)),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  // Save to Redis with TTL
  await redis.set(`order:${order.id}`, JSON.stringify(order), 'EX', ORDER_TTL_SECONDS);

  // Publish event to Kafka — downstream services react to this
  await publishEvent('order.created', order.id, order);

  console.log(`Order created: ${order.id}`);
  return res.status(201).json(order);
});

// GET /orders/:id — fetch an order from Redis
router.get('/:id', async (req, res) => {
  const raw = await redis.get(`order:${req.params.id}`);

  if (!raw) {
    return res.status(404).json({ error: 'Order not found' });
  }

  return res.json(JSON.parse(raw));
});

module.exports = router;
