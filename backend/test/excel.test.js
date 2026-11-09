const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const xlsx = require('xlsx');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret';

const { startMongo, stopMongo, resetMongo } = require('./helpers/mongo');
const app = require('../src/app');
const M = require('../src/models');

let server, base;
before(async () => {
  await startMongo();
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await stopMongo();
});

const token = (role, id = 1) => 'Bearer ' + jwt.sign({ id, role }, process.env.JWT_SECRET);

test('UC1.3: Excel template download and export endpoints', async () => {
  await resetMongo();
  await M.User.create([
    { id: 1, code: 'ADM001', email: 'admin@fpt.edu.vn', passwordHash: 'h', fullName: 'Admin', role: 'ADMIN' },
    { id: 2, code: 'STU2026001', email: 'sv1@fpt.edu.vn', passwordHash: 'h', fullName: 'Nguyen Van A', role: 'STUDENT', studentProfile: { gender: 'MALE', enrollmentYear: 2026 } }
  ]);

  // Template download
  const resTemplate = await fetch(base + '/students/template-excel', {
    headers: { Authorization: token('ADMIN') }
  });
  assert.equal(resTemplate.status, 200);
  assert.ok(resTemplate.headers.get('content-type').includes('spreadsheetml'));
  const templateBuf = Buffer.from(await resTemplate.arrayBuffer());
  const wbTemplate = xlsx.read(templateBuf);
  assert.ok(wbTemplate.SheetNames.includes('Mau_Hoc_Vien'));

  // Template alias
  const resTemplateAlias = await fetch(base + '/students/import/template', {
    headers: { Authorization: token('ADMIN') }
  });
  assert.equal(resTemplateAlias.status, 200);

  // Export excel
  const resExport = await fetch(base + '/students/export-excel', {
    headers: { Authorization: token('ADMIN') }
  });
  assert.equal(resExport.status, 200);
  assert.ok(resExport.headers.get('content-type').includes('spreadsheetml'));
  const exportBuf = Buffer.from(await resExport.arrayBuffer());
  const wbExport = xlsx.read(exportBuf);
  const data = xlsx.utils.sheet_to_json(wbExport.Sheets['Danh_Sach_Hoc_Vien']);
  assert.equal(data.length, 1);
  assert.equal(data[0]['Mã học viên'], 'STU2026001');
  assert.equal(data[0]['Họ và tên'], 'Nguyen Van A');
});

test('UC1.3: Excel student import endpoint adds students to MongoDB', async () => {
  await resetMongo();
  await M.User.create([
    { id: 1, code: 'ADM001', email: 'admin@fpt.edu.vn', passwordHash: 'h', fullName: 'Admin', role: 'ADMIN' }
  ]);

  const studentsToImport = [
    {
      'Họ và tên': 'Hoang Van C',
      'Email': 'chv@fpt.edu.vn',
      'Số điện thoại': '0988776655',
      'Giới tính (Nam/Nữ)': 'Nam',
      'Ngày sinh (YYYY-MM-DD)': '2004-06-18',
      'Khóa tuyển sinh': 2026,
      'Địa chỉ': 'Ha Noi'
    },
    {
      'Họ và tên': 'Le Thi D',
      'Email': 'dlt@fpt.edu.vn',
      'Số điện thoại': '0988776656',
      'Giới tính (Nam/Nữ)': 'Nữ',
      'Ngày sinh (YYYY-MM-DD)': '2004-09-25',
      'Khóa tuyển sinh': 2026,
      'Địa chỉ': 'Da Nang'
    }
  ];

  const ws = xlsx.utils.json_to_sheet(studentsToImport);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Mau_Hoc_Vien');
  const excelBuf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Use FormData via native fetch (Node 18+)
  const blob = new Blob([excelBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const formData = new FormData();
  formData.append('file', blob, 'test_students.xlsx');

  const resImport = await fetch(base + '/students/import-excel', {
    method: 'POST',
    headers: { Authorization: token('ADMIN') },
    body: formData
  });

  assert.equal(resImport.status, 200);
  const body = await resImport.json();
  assert.equal(body.success, true);
  assert.equal(body.data.createdCount, 2);

  const importedStudents = await M.User.find({ role: 'STUDENT' }).sort({ id: 1 });
  assert.equal(importedStudents.length, 2);
  assert.equal(importedStudents[0].fullName, 'Hoang Van C');
  assert.equal(importedStudents[0].studentProfile.gender, 'MALE');
  assert.equal(importedStudents[1].fullName, 'Le Thi D');
  assert.equal(importedStudents[1].studentProfile.gender, 'FEMALE');
});
