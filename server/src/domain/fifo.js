import { D, Money } from './money.js';
export function receiveFIFO(pool, quantity, value) {
  pool.layers.push({ quantity: D(quantity), value: D(value) });
}
export function issueFIFO(pool, quantity) {
  let left = D(quantity);
  const allocations = [];
  for (const layer of pool.layers) {
    if (left.isZero()) break;
    const q = Money.min(left, layer.quantity);
    const value = q.eq(layer.quantity) ? layer.value : layer.value.mul(q).div(layer.quantity);
    allocations.push({ quantity: q, value });
    layer.quantity = layer.quantity.minus(q);
    layer.value = layer.value.minus(value);
    left = left.minus(q);
  }
  pool.layers = pool.layers.filter((layer) => layer.quantity.gt(0));
  return allocations;
}
