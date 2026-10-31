import { D } from './money.js';
export function receiveWAC(pool, quantity, value) {
  pool.quantity = pool.quantity.plus(quantity);
  pool.value = pool.value.plus(value);
}
export function issueWAC(pool, quantity) {
  const q = D(quantity);
  const value = q.eq(pool.quantity) ? pool.value : pool.value.mul(q).div(pool.quantity);
  pool.quantity = pool.quantity.minus(q);
  pool.value = pool.value.minus(value);
  return [{ quantity: q, value }];
}
