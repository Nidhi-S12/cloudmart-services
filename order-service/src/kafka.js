const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  // Retry config — same reason as Redis: k8s startup ordering
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

const producer = kafka.producer();

async function connectProducer() {
  await producer.connect();
  console.log('Kafka: producer connected');
}

// Publish a message to a Kafka topic
// key = order ID — ensures all events for the same order go to the same partition
// (partition ordering guarantee — important for event sequencing)
async function publishEvent(topic, key, payload) {
  await producer.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(payload),
      },
    ],
  });
}

async function disconnectProducer() {
  await producer.disconnect();
}

module.exports = { connectProducer, publishEvent, disconnectProducer };
