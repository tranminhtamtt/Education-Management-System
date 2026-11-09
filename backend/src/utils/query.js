// Tiện ích truy vấn dùng chung cho Mongoose.

// Tương đương `contains` của Prisma (MySQL collation không phân biệt hoa thường).
const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const like = q => ({ $regex: escapeRegex(q), $options: 'i' });

// Chuyển document (đã populate) sang object thuần, bỏ _id/__v.
const plain = doc => (doc && typeof doc.toJSON === 'function' ? doc.toJSON() : doc);
const plainAll = docs => docs.map(plain);

const httpError = (message, status = 400) => Object.assign(new Error(message), { status });

module.exports = { escapeRegex, like, plain, plainAll, httpError };

