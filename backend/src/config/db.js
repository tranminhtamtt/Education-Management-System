const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

/**
 * Kết nối MongoDB Atlas (hoặc replica set cục bộ khi kiểm thử).
 * Multi-document transaction yêu cầu replica set — Atlas luôn đáp ứng.
 */
async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri && process.env.NODE_ENV === 'development') {
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    uri = replSet.getUri('ems_db');
    process.env._USING_IN_MEMORY_MONGO = '1';
    console.log('⚡ Khởi chạy MongoDB Replica Set nội bộ (Development Fallback)...');
  }
  if (!uri) throw new Error('Thiếu biến môi trường MONGODB_URI (chuỗi kết nối MongoDB Atlas)');
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || undefined,
    serverSelectionTimeoutMS: 15000
  });
  // Đảm bảo collection + index tồn tại trước khi dùng trong transaction.
  const models = require('../models');
  await Promise.all(Object.values(models).filter(m => m.modelName).map(m => m.createCollection().then(() => m.createIndexes())));

  // Khởi động không được xóa/seed dữ liệu. Chỉ seed bằng lệnh riêng có sao lưu.
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

/**
 * Chạy `work(session)` trong một transaction MongoDB.
 * withTransaction tự retry khi gặp TransientTransactionError / WriteConflict
 * (tương đương retry P2034 trước đây).
 */
async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * "Khóa dòng" trong transaction: ghi một trường version vào document để mọi
 * transaction đồng thời chạm cùng document sẽ WriteConflict và được retry.
 * Thay thế cho SELECT ... FOR UPDATE của MySQL.
 */
async function lockDoc(Model, filter, session) {
  return Model.findOneAndUpdate(filter, { $inc: { lockVersion: 1 } }, { new: true, session });
}

module.exports = { mongoose, connectDB, disconnectDB, withTransaction, lockDoc };

