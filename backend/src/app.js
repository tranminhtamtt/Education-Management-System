const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const usersCoursesRouter = require('./modules/users-courses');
const classesSchedulesRouter = require('./modules/classes-schedules');
const attendanceAssignmentsRouter = require('./modules/attendance-assignments');
const gradesTuitionRouter = require('./modules/grades-tuition');
const notificationsAnalyticsRouter = require('./modules/notifications-analytics');
const curriculumRouter = require('./modules/curriculum');
const teacherRouter = require('./modules/teacher');

const { connectDB, mongoose } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Static folder cho uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    database: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED',
    timestamp: new Date().toISOString(),
    service: 'EMS Backend API (Education Management System)',
    author: 'EMS Team'
  });
});

// Đăng ký 5 Cụm API Endpoints chuẩn hóa (/api/v1)
app.use('/api/v1', require('./modules/student'));
app.use('/api/v1', usersCoursesRouter);
app.use('/api/v1', teacherRouter);
app.use('/api/v1', require('./modules/accountant'));
app.use('/api/v1', classesSchedulesRouter);
app.use('/api/v1', attendanceAssignmentsRouter);
app.use('/api/v1', gradesTuitionRouter);
app.use('/api/v1', notificationsAnalyticsRouter);
app.use('/api/v1', curriculumRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Không tìm thấy endpoint: ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Lỗi máy chủ nội bộ',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

if (process.env.NODE_ENV !== 'test') {
  connectDB()
    .then(() => {
      console.log(`🍃 Connected to MongoDB (database: ${mongoose.connection.name})`);
      app.listen(PORT, () => {
        console.log(`🚀 EMS Backend Server running on port ${PORT}`);
        console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
        console.log(`📚 Base API: http://localhost:${PORT}/api/v1`);
      });
    })
    .catch((err) => {
      console.error('❌ Không kết nối được MongoDB:', err.message);
      process.exit(1);
    });
}

module.exports = app;
