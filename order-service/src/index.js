const app = require('./app');
const { connectProducer, disconnectProducer } = require('./kafka');

const PORT = process.env.PORT || 3001;

async function start() {
  // Connect Kafka producer before accepting traffic
  await connectProducer();

  const server = app.listen(PORT, () => {
    console.log(`order-service running on port ${PORT}`);
  });

  // Graceful shutdown — finish in-flight requests before disconnecting
  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectProducer();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM')); // sent by Kubernetes when stopping a pod
  process.on('SIGINT', () => shutdown('SIGINT'));   // sent by Ctrl+C locally
}

start().catch((err) => {
  console.error('Failed to start order-service:', err);
  process.exit(1);
});
