const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { errorResponse } = require('../utils/formatResponse');

const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, 'Chưa xác thực. Vui lòng đăng nhập để tiếp tục.', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ems_super_secret_jwt_key_2026_fpt');
    let dbUser = decoded.id ? await prisma.user.findUnique({ where: { id: decoded.id } }) : null;
    if (!dbUser && decoded.email) {
      dbUser = await prisma.user.findUnique({ where: { email: decoded.email } });
    }
    if (!dbUser) {
      return errorResponse(res, 'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.', 401);
    }

    req.user = {
      id: dbUser.id,
      code: dbUser.code,
      email: dbUser.email,
      fullName: dbUser.fullName,
      role: dbUser.role
    };
    next();
  } catch (error) {
    return errorResponse(res, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 403);
  }
};

module.exports = authenticateJWT;
