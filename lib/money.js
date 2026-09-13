// Transaction.amount is native currency. Aggregate only after applying the
// stored book rate; a VND row must never be converted a second time.
export function amountInVnd(amount, currency = 'VND', fxRate) {
  if (amount == null || amount === '' || typeof amount === 'boolean' || (currency && currency !== 'VND' && typeof fxRate === 'boolean')) {
    throw new RangeError('Không thể quy đổi tiền: thiếu số tiền hoặc tỷ giá ghi sổ hợp lệ.');
  }
  const value = Number(amount);
  const rate = !currency || currency === 'VND' ? 1 : Number(fxRate);
  if (!Number.isFinite(value) || !Number.isFinite(rate) || rate <= 0) {
    throw new RangeError('Không thể quy đổi tiền: số tiền hoặc tỷ giá ghi sổ không hợp lệ.');
  }
  return Math.round(value * rate);
}

export const transactionAmountVnd = transaction => amountInVnd(transaction.amount, transaction.currency || 'VND', transaction.fxRate);
