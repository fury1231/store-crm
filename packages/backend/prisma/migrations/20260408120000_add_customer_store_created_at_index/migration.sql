-- Composite index on Customer(storeId, createdAt DESC) to accelerate
-- date-range filters scoped to a store. Matches the default list
-- `ORDER BY createdAt DESC` so the planner can read straight from the
-- index without an extra sort.
CREATE INDEX "Customer_storeId_createdAt_idx" ON "Customer"("storeId", "createdAt" DESC);
