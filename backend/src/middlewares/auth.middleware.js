const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { errorResponse } = require('../utils/formatResponse');

const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, 'Chưa xác thực. Vui lòng đăng nhập để tiếp tục.', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ems_super_secret_jwt_key_2026_fpt');
    if (decoded.email) {
      let dbUser = decoded.id ? await User.findOne({ id: decoded.id }).lean() : null;
      if (!dbUser) {
        dbUser = await User.findOne({ email: decoded.email }).lean();
      }
      if (dbUser) {
        if (dbUser.status !== 'ACTIVE') return errorResponse(res, 'Tài khoản đã bị khóa.', 403);
        req.user = {
          id: dbUser.id,
          code: dbUser.code,
          email: dbUser.email,
          fullName: dbUser.fullName,
          role: dbUser.role
        };
        return next();
      }
      return errorResponse(res, 'Tài khoản không còn tồn tại.', 403);
    }
    req.user = decoded; // { id, code, email, role }
    next();
  } catch (error) {
    return errorResponse(res, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 403);
  }
};

module.exports = authenticateJWT;
