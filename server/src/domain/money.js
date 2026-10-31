import Decimal from 'decimal.js';
export const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const D = (value) => new Money(value);
export const sum = (values) => values.reduce((total, value) => total.plus(value), D(0));
