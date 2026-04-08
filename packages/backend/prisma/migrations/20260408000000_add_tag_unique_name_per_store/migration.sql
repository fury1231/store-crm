-- Add unique constraint on Tag(storeId, name) — tag names are unique
-- within a store. Two different stores may both have a "VIP" tag,
-- but a single store cannot have two tags named "VIP".
CREATE UNIQUE INDEX "Tag_storeId_name_key" ON "Tag"("storeId", "name");
