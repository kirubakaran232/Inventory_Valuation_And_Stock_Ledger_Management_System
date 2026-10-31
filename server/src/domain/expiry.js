// UTC is the business timezone. Expiry date is the first unusable day.
export function dueExpiryDates(pools, cutoff) {
  return [
    ...new Set(
      [...pools.values()].flatMap((pool) =>
        pool.physical
          .map((batch) => batch.expiryDate)
          .filter((date) => date && `${date}T00:00:00.000Z` <= cutoff),
      ),
    ),
  ].sort();
}
