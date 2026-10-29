-- Existing and new accounts must set a personal password before using the portal.
ALTER TABLE app_user
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active;
