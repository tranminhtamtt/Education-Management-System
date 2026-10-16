const jwt = require('jsonwebtoken');
const { errorResponse } = require('../utils/formatResponse');

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, 'Chưa xác thực. Vui lòng đăng nhập để tiếp tục.', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ems_super_secret_jwt_key_2026_fpt');
    req.user = decoded; // { id, code, email, role }
    next();
  } catch (error) {
    return errorResponse(res, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 403);
  }
};

module.exports = authenticateJWT;
