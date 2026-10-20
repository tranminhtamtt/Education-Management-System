/**
 * Khởi tạo dữ liệu cho role ACCOUNTANT trên DB đang dùng chung (KHÔNG xóa dữ liệu cũ).
 * Chạy được nhiều lần (idempotent):  npm run prisma:setup-accountant
 *
 * 1. Tạo tài khoản Kế toán ACC001 (ketoan@fpt.edu.vn / 123456) nếu chưa có.
 * 2. Đồng bộ lịch sử thu: hóa đơn nào đã có paid_amount > 0 nhưng chưa có bản ghi
 *    tuition_payments (dữ liệu tạo trước khi có bảng này) -> tạo 1 phiếu thu tương ứng,
 *    để báo cáo doanh thu theo tháng và phiếu thu hiển thị đúng.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // 1. Tài khoản Kế toán
  let accountant = await prisma.user.findFirst({
    where: { OR: [{ code: 'ACC001' }, { email: 'ketoan@fpt.edu.vn' }] }
  });

  if (accountant) {
    console.log(`✔ Đã có tài khoản Kế toán: ${accountant.code} (${accountant.email})`);
  } else {
    accountant = await prisma.user.create({
      data: {
        code: 'ACC001',
        email: 'ketoan@fpt.edu.vn',
        passwordHash: await bcrypt.hash('123456', 10),
        fullName: 'Phòng Kế toán - Tài chính',
        role: 'ACCOUNTANT',
        phone: '02473005599',
        status: 'ACTIVE'
      }
    });
    console.log('✔ Đã tạo tài khoản Kế toán: ketoan@fpt.edu.vn / 123456');
  }

  // 2. Đồng bộ lịch sử thu cho hóa đơn cũ
  const invoices = await prisma.tuitionInvoice.findMany({
    where: { paidAmount: { gt: 0 }, payments: { none: {} } }
  });

  for (const inv of invoices) {
    const paidAt = inv.paidAt || inv.createdAt || new Date();
    const created = await prisma.tuitionPayment.create({
      data: {
        invoiceId: inv.id,
        receiptNo: `TMP-${inv.id}-${Date.now()}`,
        amount: inv.paidAmount,
        method: 'BANK_TRANSFER',
        note: 'Đồng bộ từ dữ liệu cũ',
        collectedById: accountant.id,
        paidAt
      }
    });
    const ym = `${paidAt.getFullYear()}${String(paidAt.getMonth() + 1).padStart(2, '0')}`;
    await prisma.tuitionPayment.update({
      where: { id: created.id },
      data: { receiptNo: `PT-${ym}-${String(created.id).padStart(5, '0')}` }
    });
  }
  console.log(`✔ Đồng bộ lịch sử thu: ${invoices.length} hóa đơn cũ`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
