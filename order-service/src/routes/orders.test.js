const request = require('supertest');

// Mock Redis and Kafka before requiring the app — routes/orders.js pulls
// these at module load time, so the mocks need to be registered first
jest.mock('../redis', () => {
  const pipeline = {
    get: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };
  return {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn(),
    lpush: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    lrange: jest.fn(),
    pipeline: jest.fn(() => pipeline),
    __pipeline: pipeline,
  };
});

jest.mock('../kafka', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
  connectProducer: jest.fn().mockResolvedValue(undefined),
  disconnectProducer: jest.fn().mockResolvedValue(undefined),
}));

const redis = require('../redis');
const { publishEvent } = require('../kafka');
const app = require('../app');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /orders', () => {
  it('returns 400 when customerId is missing', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ items: [{ productId: 1, price: 10, quantity: 2 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 400 when items is empty', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ customerId: 'a@b.com', items: [] });
    expect(res.status).toBe(400);
  });

  it('creates an order, computes total, and publishes to Kafka', async () => {
    const res = await request(app)
      .post('/orders')
      .send({
        customerId: 'a@b.com',
        items: [
          { productId: 1, price: 10, quantity: 2 },
          { productId: 2, price: 5, quantity: 3 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      customerId: 'a@b.com',
      total: 35,
      status: 'pending',
    });
    expect(res.body.id).toBeDefined();

    // Verify side effects
    expect(redis.set).toHaveBeenCalledWith(
      `order:${res.body.id}`,
      expect.any(String),
      'EX',
      expect.any(Number),
    );
    expect(redis.lpush).toHaveBeenCalledWith('customer:a@b.com:orders', res.body.id);
    expect(publishEvent).toHaveBeenCalledWith('order.created', res.body.id, expect.any(Object));
  });
});

describe('GET /orders?customer=', () => {
  it('returns 400 when customer query param is missing', async () => {
    const res = await request(app).get('/orders');
    expect(res.status).toBe(400);
  });

  it('returns empty array when customer has no orders', async () => {
    redis.lrange.mockResolvedValue([]);
    const res = await request(app).get('/orders?customer=nobody@x.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns the customer\'s orders', async () => {
    redis.lrange.mockResolvedValue(['id-1', 'id-2']);
    redis.__pipeline.exec.mockResolvedValue([
      [null, JSON.stringify({ id: 'id-1', total: 10 })],
      [null, JSON.stringify({ id: 'id-2', total: 20 })],
    ]);

    const res = await request(app).get('/orders?customer=a@b.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 'id-1', total: 10 },
      { id: 'id-2', total: 20 },
    ]);
  });
});

describe('GET /orders/:id', () => {
  it('returns 404 when order is not found', async () => {
    redis.get.mockResolvedValue(null);
    const res = await request(app).get('/orders/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('returns the order when found', async () => {
    const order = { id: 'abc', total: 42, status: 'pending' };
    redis.get.mockResolvedValue(JSON.stringify(order));
    const res = await request(app).get('/orders/abc');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(order);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
