-- Apply once to an existing database before deploying the encrypted password feature.
ALTER TABLE app_user ADD COLUMN password_encrypted TEXT NULL AFTER password_hash;
