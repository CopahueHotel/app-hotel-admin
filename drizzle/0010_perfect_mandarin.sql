CREATE TABLE `password_resets` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`user_version` integer NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_password_resets_user` ON `password_resets` (`user_id`);--> statement-breakpoint
CREATE TABLE `recovery_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject_hash` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_recovery_attempts_created` ON `recovery_attempts` (`created`);
--> statement-breakpoint
CREATE TRIGGER recovery_rate_limit BEFORE INSERT ON recovery_attempts BEGIN
 SELECT CASE WHEN NEW.kind NOT IN ('request','confirm') OR
 (SELECT COUNT(*) FROM recovery_attempts WHERE kind=NEW.kind AND created>NEW.created-900)>=20 OR
 (SELECT COUNT(*) FROM recovery_attempts WHERE kind=NEW.kind AND subject_hash=NEW.subject_hash AND created>NEW.created-900)>=3
 THEN RAISE(ABORT,'RECOVERY_RATE_LIMIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER recovery_user_changed AFTER UPDATE ON users BEGIN
 DELETE FROM password_resets WHERE user_id=NEW.id;
END;
