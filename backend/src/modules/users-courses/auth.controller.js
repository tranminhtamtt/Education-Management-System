const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, nextIds } = require('../../models');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

const register = async (req, res) => {
  const { fullName, email, password } = req.body || {};
  const name = typeof fullName === 'string' ? fullName.trim() : '';
  const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!name || name.length > 100 || address.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return errorResponse(res, 'Vui lòng nhập họ tên và email hợp lệ.', 400);
  }
  if (typeof password !== 'string' || password.trim().length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return errorResponse(res, 'Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte.', 400);
  }

  try {
    if (await User.exists({ email: address }).collation({ locale: 'en', strength: 2 })) {
      return errorResponse(res, 'Email đã được đăng ký.', 409);
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date()));
    let code;
    do {
      const sequence = await nextIds(`student_registration_${year}`);
      code = `HV${year}${String(sequence).padStart(4, '0')}`;
    } while (await User.exists({ code }));

    const user = await User.create({
      code, email: address, fullName: name, passwordHash, role: 'STUDENT', status: 'ACTIVE',
      studentProfile: { enrollmentYear: year }
    });
    return successResponse(res, { id: user.id, code, email: address, fullName: name, role: user.role },
      'Đăng ký tài khoản học viên thành công.', 201);
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.email) return errorResponse(res, 'Email đã được đăng ký.', 409);
    if (error.code === 11000) return errorResponse(res, 'Mã học viên vừa được sử dụng. Vui lòng đăng ký lại.', 409);
    console.error('Student registration failed:', error.name);
    return errorResponse(res, 'Đã xảy ra lỗi khi đăng ký tài khoản.', 500);
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, 'Vui lòng nhập đầy đủ email và mật khẩu.', 400);
    }

    const trimmed = String(email).trim();
    const user = await User.findOne({
      $or: [{ email: trimmed }, { code: trimmed }]
    }).select('+passwordHash');

    if (!user) {
      return errorResponse(res, 'Tài khoản không tồn tại trên hệ thống.', 401);
    }

    if (user.status !== 'ACTIVE') {
      return errorResponse(res, 'Tài khoản đang bị khóa hoặc chưa kích hoạt.', 403);
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return errorResponse(res, 'Mật khẩu không chính xác.', 401);
    }

    // Tạo JWT Token
    const payload = {
      id: user.id,
      code: user.code,
      email: user.email,
      role: user.role,
      fullName: user.fullName
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'ems_super_secret_jwt_key_2026_fpt',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    return successResponse(
      res,
      {
        token,
        user: {
          id: user.id,
          code: user.code,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          avatar: user.avatar,
          profile: user.studentProfile || user.teacherProfile || null
        }
      },
      'Đăng nhập thành công'
    );
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(res, 'Đã xảy ra lỗi máy chủ trong quá trình đăng nhập.', 500);
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.id })
      .select('id code email fullName role phone avatar status studentProfile teacherProfile');

    if (!user) {
      return errorResponse(res, 'Không tìm thấy thông tin người dùng.', 404);
    }

    const data = user.toJSON();
    return successResponse(res, { ...data, studentProfile: data.studentProfile || null, teacherProfile: data.teacherProfile || null }, 'Lấy thông tin người dùng thành công');
  } catch (error) {
    return errorResponse(res, 'Lỗi lấy thông tin cá nhân.', 500);
  }
};

module.exports = {
  register,
  login,
  getMe
};
