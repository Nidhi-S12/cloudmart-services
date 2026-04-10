const express = require('express');
const { v4: uuidv4 } = require('uuid');
const redis = require('../redis');
const { publishEvent } = require('../kafka');

const router = express.Router();

// Orders are stored in Redis as: order:<id> → JSON string
// Customer index stored as: customer:<email>:orders → list of order IDs
// TTL of 24 hours — orders are transient here, not the source of truth
const ORDER_TTL_SECONDS = 60 * 60 * 24;

router.post('/', async (req, res, next) => {
  try {
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

    const customerKey = `customer:${customerId}:orders`;

    // Write to Redis, add to customer index, and publish to Kafka in parallel
    await Promise.all([
      redis.set(`order:${order.id}`, JSON.stringify(order), 'EX', ORDER_TTL_SECONDS),
      redis.lpush(customerKey, order.id).then(() => redis.expire(customerKey, ORDER_TTL_SECONDS)),
      publishEvent('order.created', order.id, order),
    ]);

    console.log(`Order created: ${order.id}`);
    return res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

// Get all orders for a customer
router.get('/', async (req, res, next) => {
  try {
    const { customer } = req.query;
    if (!customer) {
      return res.status(400).json({ error: 'customer query param required' });
    }

    const orderIds = await redis.lrange(`customer:${customer}:orders`, 0, -1);
    if (!orderIds.length) return res.json([]);

    const pipeline = redis.pipeline();
    orderIds.forEach((id) => pipeline.get(`order:${id}`));
    const results = await pipeline.exec();

    const orders = results
      .map(([err, raw]) => (err || !raw ? null : JSON.parse(raw)))
      .filter(Boolean);

    return res.json(orders);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const raw = await redis.get(`order:${req.params.id}`);

    if (!raw) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json(JSON.parse(raw));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
