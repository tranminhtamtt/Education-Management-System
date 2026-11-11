function tuitionDateRange(from, to) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const isDate = value => {
    if (typeof value !== 'string' || !datePattern.test(value)) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!isDate(from) || !isDate(to) || from > to) return null;
  return {
    $gte: new Date(`${from}T00:00:00+07:00`),
    $lte: new Date(`${to}T23:59:59.999+07:00`)
  };
}

module.exports = tuitionDateRange;
