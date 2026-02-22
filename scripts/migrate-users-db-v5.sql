-- Migration v5: Add status_detail column for granular segmentation progress
-- Stores JSON progress object during segmentation, polled by the frontend.
-- Cleared to NULL when segmentation finishes.

ALTER TABLE translation_jobs ADD COLUMN status_detail TEXT;
