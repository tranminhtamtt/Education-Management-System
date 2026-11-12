// Tiện ích kiểm thử: MongoDB replica set chạy trong bộ nhớ (hỗ trợ transaction thật).
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { connectDB, disconnectDB, mongoose } = require('../../src/config/db');

let replSet;
async function startMongo() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replSet.getUri('ems_test');
  await connectDB(uri);
  return uri;
}
async function resetMongo() {
  const models = require('../../src/models');
  await Promise.all(Object.values(models).filter(m => m && m.modelName).map(m => m.deleteMany({})));
}
async function stopMongo() {
  await disconnectDB();
  if (replSet) await replSet.stop();
}
module.exports = { startMongo, resetMongo, stopMongo, mongoose };

