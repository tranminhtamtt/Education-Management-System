const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../../models');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

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

const register = async (req, res) => {
  try {
    const { fullName, email, password, phone, gender, dob, address, enrollmentYear } = req.body;

    if (!fullName || !email || !password) {
      return errorResponse(res, 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu.', 400);
    }

    if (String(password).length < 6) {
      return errorResponse(res, 'Mật khẩu phải có độ dài tối thiểu 6 ký tự.', 400);
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: trimmedEmail });
    if (existing) {
      return errorResponse(res, 'Email này đã tồn tại trên hệ thống.', 400);
    }

    const year = enrollmentYear ? parseInt(enrollmentYear) : new Date().getFullYear();
    const count = await User.countDocuments({ role: 'STUDENT' });
    const code = `HE${String(year).slice(-2)}${String(count + 1).padStart(4, '0')}`;

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      code,
      fullName: String(fullName).trim(),
      email: trimmedEmail,
      passwordHash,
      role: 'STUDENT',
      phone: phone ? String(phone).trim() : null,
      status: 'ACTIVE',
      studentProfile: {
        dob: dob ? new Date(dob) : null,
        gender: gender || 'MALE',
        address: address ? String(address).trim() : null,
        enrollmentYear: year
      }
    });

    const payload = {
      id: newUser.id,
      code: newUser.code,
      email: newUser.email,
      role: newUser.role,
      fullName: newUser.fullName
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
          id: newUser.id,
          code: newUser.code,
          email: newUser.email,
          fullName: newUser.fullName,
          role: newUser.role,
          avatar: newUser.avatar,
          profile: newUser.studentProfile
        }
      },
      'Đăng ký tài khoản học viên thành công',
      201
    );
  } catch (error) {
    console.error('Register error:', error);
    return errorResponse(res, 'Lỗi máy chủ khi đăng ký tài khoản.', 500);
  }
};

module.exports = {
  login,
  register,
  getMe
};

