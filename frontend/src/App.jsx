import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';

import { AuthProvider } from './context/AuthContext';
import MainLayout from './layouts/MainLayout';

import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';

// Cụm 1: Quản trị Hồ sơ & Môn học
import StudentsPage from './pages/users-courses/StudentsPage';
import TeachersPage from './pages/users-courses/TeachersPage';
import CoursesPage from './pages/users-courses/CoursesPage';

// Cụm 2: Tổ chức Lớp học & Thời khóa biểu
import ClassesPage from './pages/classes-schedules/ClassesPage';
import SchedulePage from './pages/classes-schedules/SchedulePage';

// Cụm 3: Vận hành Lớp học
import AttendancePage from './pages/attendance-assignments/AttendancePage';
import AssignmentsPage from './pages/attendance-assignments/AssignmentsPage';

// Cụm 4: Khảo thí & Tài chính
import GradesPage from './pages/grades-tuition/GradesPage';
import TuitionPage from './pages/grades-tuition/TuitionPage';
import TuitionReportPage from './pages/grades-tuition/TuitionReportPage';

// Cụm 5: Tương tác, Đơn từ & Báo cáo
import RequestsPage from './pages/notifications-analytics/RequestsPage';
import NotificationsPage from './pages/notifications-analytics/NotificationsPage';

// Cổng Học viên (BF-STU-1 → BF-STU-10)
import { useAuth } from './context/AuthContext';
import StudentDashboardPage from './pages/student/StudentDashboardPage';
import StudentAttendancePage from './pages/student/StudentAttendancePage';
import StudentAssignmentsPage from './pages/student/StudentAssignmentsPage';
import StudentGradesPage from './pages/student/StudentGradesPage';

// Chọn màn hình theo vai trò: STUDENT dùng cổng học viên, các vai trò khác giữ màn hình quản trị
const RoleSwitch = ({ student, other }) => {
  const { user } = useAuth();
  return user?.role === 'STUDENT' ? student : other;
};

const App = () => {
  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#F26F21',
          colorPrimaryHover: '#FA8C16',
          borderRadius: 8,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        }
      }}
    >
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<RoleSwitch student={<StudentDashboardPage />} other={<DashboardPage />} />} />

              {/* Cụm 1 */}
              <Route path="students" element={<StudentsPage />} />
              <Route path="teachers" element={<TeachersPage />} />
              <Route path="courses" element={<CoursesPage />} />

              {/* Cụm 2 */}
              <Route path="classes" element={<ClassesPage />} />
              <Route path="schedule" element={<SchedulePage />} />

              {/* Cụm 3 */}
              <Route path="attendance" element={<RoleSwitch student={<StudentAttendancePage />} other={<AttendancePage />} />} />
              <Route path="assignments" element={<RoleSwitch student={<StudentAssignmentsPage />} other={<AssignmentsPage />} />} />

              {/* Cụm 4 */}
              <Route path="grades" element={<RoleSwitch student={<StudentGradesPage />} other={<GradesPage />} />} />
              <Route path="tuition" element={<TuitionPage />} />
              <Route path="tuition-report" element={<TuitionReportPage />} />

              {/* Cụm 5 */}
              <Route path="requests" element={<RequestsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  );
};

export default App;
