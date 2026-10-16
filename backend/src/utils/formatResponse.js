/**
 * Chuẩn hóa phản hồi JSON theo chuẩn /api/v1 của hệ thống EMS
 */
const successResponse = (res, data = {}, message = 'Thao tác thành công', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

const errorResponse = (res, message = 'Có lỗi xảy ra', statusCode = 400, errors = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors
  });
};

module.exports = {
  successResponse,
  errorResponse
};
