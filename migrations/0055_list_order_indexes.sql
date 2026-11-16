-- The cellar, the wishlist and a wine's prices, read a page at a time in the
-- order they are shown (Q-03.1).
--
-- Each list is paged with a cursor, newest or most wanted first, and each
-- sorted the whole Space's rows in a temporary B-tree before it could hand
-- back the first page: the indexes it had matched its filters, not its order.
-- `query-plans.test.ts` found them and now keeps them in order.

-- Bottles: ORDER BY acquired_at DESC, id DESC, read backwards.
CREATE INDEX idx_bottles_space_acquired
  ON bottles (space_id, acquired_at, id);

-- The wishlist: active items first, then priority, newest change, id — the
-- same expression the list sorts and pages by.
CREATE INDEX idx_wishlist_space_order
  ON wishlist_items (
    space_id,
    (CASE state WHEN 'active' THEN 1 ELSE 0 END),
    priority,
    updated_at,
    id
  );

-- A wine's prices: ORDER BY observed_at DESC, id DESC. The index had `id`
-- ascending under a descending date, so every run of equal dates was sorted
-- again; with both ascending it is simply read backwards.
DROP INDEX idx_prices_space_wine_observed;
CREATE INDEX idx_prices_space_wine_observed
  ON price_observations (space_id, wine_id, observed_at, id);
