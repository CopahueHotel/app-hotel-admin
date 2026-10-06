CREATE TABLE `auth_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_attempts_created` ON `auth_attempts` (`created`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`password_version` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_expires` ON `auth_sessions` (`expires`);
--> statement-breakpoint
CREATE TRIGGER auth_attempt_limit BEFORE INSERT ON auth_attempts
WHEN (SELECT COUNT(*) FROM auth_attempts WHERE created>NEW.created-900)>=20
BEGIN SELECT RAISE(ABORT, 'AUTH_RATE_LIMIT'); END;
