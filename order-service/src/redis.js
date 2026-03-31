const Redis = require('ioredis');

const client = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  // Retry failed connections — important in k8s where Redis may start after this service
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000); // wait up to 3s between retries
    console.log(`Redis: retrying connection (attempt ${times}), waiting ${delay}ms`);
    return delay;
  },
});

client.on('connect', () => console.log('Redis: connected'));
client.on('error', (err) => console.error('Redis error:', err.message));

module.exports = client;
