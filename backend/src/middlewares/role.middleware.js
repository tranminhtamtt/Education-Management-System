const { errorResponse } = require('../utils/formatResponse');

/**
 * Middleware kiểm tra vai trò người dùng (ADMIN, TEACHER, STUDENT)
 * @param  {...string} allowedRoles Các vai trò được phép truy cập
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return errorResponse(
        res,
        `Bạn không có quyền thực hiện chức năng này. Yêu cầu quyền: [${allowedRoles.join(', ')}]`,
        403
      );
    }
    next();
  };
};

module.exports = authorizeRoles;
