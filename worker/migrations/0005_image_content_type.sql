-- Existing local JPEG images retain their type. New Images-processed uploads use WebP.
ALTER TABLE team_images ADD COLUMN content_type TEXT NOT NULL DEFAULT 'image/jpeg'
  CHECK(content_type IN ('image/jpeg','image/webp'));
