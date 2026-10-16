CREATE TABLE `group_bookings` (
	`booking` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`booking`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `reservation_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_group_members` ON `group_bookings` (`group_id`,`active`);--> statement-breakpoint
CREATE TABLE `reservation_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`customer` text NOT NULL,
	`pax` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`customer`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER group_valid_insert BEFORE INSERT ON reservation_groups BEGIN
 SELECT CASE WHEN trim(NEW.name)='' OR NEW.pax<1 OR NEW.pax>1000 OR NEW.version<>0 THEN RAISE(ABORT,'HOT_GROUP_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER group_valid_update BEFORE UPDATE ON reservation_groups BEGIN
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.created<>OLD.created OR NEW.created_by<>OLD.created_by OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN trim(NEW.name)='' OR NEW.pax<1 OR NEW.pax>1000 THEN RAISE(ABORT,'HOT_GROUP_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER group_preserve BEFORE DELETE ON reservation_groups BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER group_member_insert BEFORE INSERT ON group_bookings BEGIN
 SELECT CASE WHEN NEW.active<>1 THEN RAISE(ABORT,'HOT_GROUP_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER group_member_update BEFORE UPDATE ON group_bookings BEGIN
 SELECT CASE WHEN NEW.booking<>OLD.booking OR NEW.active NOT IN(0,1) OR (OLD.active=1 AND NEW.group_id<>OLD.group_id) THEN RAISE(ABORT,'HOT_GROUP_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER group_member_preserve BEFORE DELETE ON group_bookings BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
