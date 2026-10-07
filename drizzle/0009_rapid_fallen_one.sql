CREATE TABLE `access_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_hash` text NOT NULL,
	`revision` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `access_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`permissions` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`roles` text NOT NULL,
	`password_hash` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_email` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `audit_log` ADD `actor_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `operation_requests` ADD `user_id` text REFERENCES users(id);
--> statement-breakpoint
INSERT INTO access_state VALUES (1,0);
--> statement-breakpoint
INSERT INTO roles (id,name,permissions,version) VALUES ('superadmin','Superadministrador','["panel.view","reservations.view","reservations.create","reservations.edit","reservations.cancel","reservations.export","reservations.balance","reservations.price","reservations.discount","reservations.special","reservations.charge","reservations.collect","rooms.view","rooms.edit","rooms.create","rooms.cancel","rooms.export","tariffs.view","tariffs.create","tariffs.edit","tariffs.export","restaurant.view","restaurant.create","restaurant.edit","restaurant.cancel","restaurant.special","restaurant.export","restaurant.prices","restaurant.price","restaurant.collect","restaurant.charge","meals.view","meals.create","meals.edit","meals.export","menu.view","menu.create","menu.edit","menu.export","stock.view","stock.create","stock.edit","stock.export","stock.waste","stock.adjust","stock.configure","purchases.view","purchases.create","purchases.receive","purchases.export","purchases.financial","purchases.pay","suppliers.view","suppliers.create","suppliers.edit","suppliers.cancel","suppliers.export","cash.view","cash.create","cash.close","cash.export","personnel.view","personnel.create","personnel.edit","personnel.cancel","personnel.export","personnel.reports","personnel.special","reports.view","reports.export","settings.view","settings.configure","users.view","users.configure"]',0);
--> statement-breakpoint
INSERT INTO roles (id,name,permissions,version) VALUES ('administration','Administración','["cash.view","cash.create","cash.close","cash.export","purchases.view","purchases.create","purchases.receive","purchases.export","purchases.financial","purchases.pay","suppliers.view","suppliers.create","suppliers.edit","suppliers.cancel","suppliers.export","reports.view","reports.export","panel.view","reservations.view","reservations.balance","reservations.collect","restaurant.view","restaurant.prices","restaurant.edit","restaurant.collect"]',0);
--> statement-breakpoint
INSERT INTO roles (id,name,permissions,version) VALUES ('manager','Gerente','["panel.view","reservations.view","reservations.create","reservations.edit","reservations.cancel","reservations.export","reservations.balance","reservations.price","reservations.discount","reservations.special","reservations.charge","reservations.collect","rooms.view","rooms.edit","rooms.create","rooms.cancel","rooms.export","tariffs.view","tariffs.create","tariffs.edit","tariffs.export","restaurant.view","restaurant.create","restaurant.edit","restaurant.cancel","restaurant.special","restaurant.export","restaurant.prices","restaurant.price","restaurant.collect","restaurant.charge","meals.view","meals.create","meals.edit","meals.export","menu.view","menu.create","menu.edit","menu.export","stock.view","stock.create","stock.edit","stock.export","stock.waste","stock.adjust","stock.configure","purchases.view","purchases.create","purchases.receive","purchases.export","purchases.financial","purchases.pay","suppliers.view","suppliers.create","suppliers.edit","suppliers.cancel","suppliers.export","cash.view","cash.close","cash.export","personnel.view","personnel.create","personnel.edit","personnel.cancel","personnel.export","personnel.reports","personnel.special","reports.view","reports.export"]',0);
--> statement-breakpoint
INSERT INTO roles (id,name,permissions,version) VALUES ('reception','Recepción','["reservations.view","reservations.create","reservations.edit","reservations.cancel","reservations.export","reservations.balance","meals.view","meals.create","meals.edit","meals.export","rooms.view","rooms.edit","tariffs.view","restaurant.view","restaurant.prices","panel.view"]',0);
--> statement-breakpoint
INSERT INTO roles (id,name,permissions,version) VALUES ('restaurant','Restaurante','["restaurant.view","restaurant.create","restaurant.edit","restaurant.export","restaurant.prices","meals.view","meals.create","meals.edit","meals.export","menu.view","panel.view"]',0);
--> statement-breakpoint
INSERT INTO roles (id,name,permissions,version) VALUES ('supply','Stock / Abastecimiento','["stock.view","stock.create","stock.edit","stock.export","stock.waste","stock.adjust","stock.configure","purchases.view","purchases.receive","purchases.export","suppliers.view","suppliers.create","suppliers.edit","suppliers.cancel","suppliers.export","panel.view"]',0);
--> statement-breakpoint
INSERT INTO roles (id,name,permissions,version) VALUES ('kitchen','Cocina','["menu.view","menu.create","menu.edit","menu.export","meals.view","meals.create","meals.edit","meals.export","restaurant.view","stock.view","panel.view"]',0);
--> statement-breakpoint
INSERT INTO roles (id,name,permissions,version) VALUES ('partner','Socio / Consulta','["panel.view","reservations.view","reservations.balance","rooms.view","tariffs.view","restaurant.view","restaurant.prices","menu.view","meals.view","stock.view","purchases.view","purchases.financial","suppliers.view","cash.view","reports.view"]',0);
--> statement-breakpoint
CREATE TRIGGER access_check_current BEFORE INSERT ON access_checks BEGIN
 SELECT CASE WHEN NEW.revision<>(SELECT revision FROM access_state WHERE id=1) OR NOT EXISTS (SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=NEW.user_id AND u.active=1 AND s.token_hash=NEW.session_hash AND s.expires>unixepoch()) THEN RAISE(ABORT,'HOT_ACCESS_CHANGED') END;
END;
--> statement-breakpoint
CREATE TRIGGER user_valid_insert BEFORE INSERT ON users BEGIN
 SELECT CASE WHEN trim(NEW.name)='' OR NEW.email<>lower(trim(NEW.email)) OR NEW.active NOT IN(0,1) OR NOT json_valid(NEW.roles) OR json_type(NEW.roles)<>'array' OR json_array_length(NEW.roles)=0 OR EXISTS(SELECT 1 FROM json_each(NEW.roles) j WHERE j.type<>'text' OR NOT EXISTS(SELECT 1 FROM roles r WHERE r.id=j.value)) OR NEW.password_hash NOT GLOB 'pbkdf2-sha256:600000:*' THEN RAISE(ABORT,'HOT_USER_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER user_valid_update BEFORE UPDATE ON users BEGIN
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN trim(NEW.name)='' OR NEW.email<>lower(trim(NEW.email)) OR NEW.active NOT IN(0,1) OR NOT json_valid(NEW.roles) OR json_type(NEW.roles)<>'array' OR json_array_length(NEW.roles)=0 OR EXISTS(SELECT 1 FROM json_each(NEW.roles) j WHERE j.type<>'text' OR NOT EXISTS(SELECT 1 FROM roles r WHERE r.id=j.value)) THEN RAISE(ABORT,'HOT_USER_INVALID') END;
 SELECT CASE WHEN OLD.active=1 AND EXISTS(SELECT 1 FROM json_each(OLD.roles) WHERE value='superadmin') AND (NEW.active=0 OR NOT EXISTS(SELECT 1 FROM json_each(NEW.roles) WHERE value='superadmin')) AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id<>OLD.id AND u.active=1 AND EXISTS(SELECT 1 FROM json_each(u.roles) WHERE value='superadmin')) THEN RAISE(ABORT,'HOT_LAST_SUPERADMIN') END;
END;
--> statement-breakpoint
CREATE TRIGGER user_preserve BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER role_preserve BEFORE DELETE ON roles BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER role_valid_update BEFORE UPDATE ON roles BEGIN
 SELECT CASE WHEN OLD.id='superadmin' THEN RAISE(ABORT,'HOT_SUPERADMIN_FIXED') END;
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.name<>OLD.name OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NOT json_valid(NEW.permissions) OR json_type(NEW.permissions)<>'array' OR EXISTS(SELECT 1 FROM json_each(NEW.permissions) WHERE value LIKE 'users.%') THEN RAISE(ABORT,'HOT_ROLE_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER user_access_insert AFTER INSERT ON users BEGIN UPDATE access_state SET revision=revision+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER user_access_update AFTER UPDATE ON users BEGIN
 UPDATE access_state SET revision=revision+1 WHERE id=1;
 DELETE FROM auth_sessions WHERE user_id=NEW.id AND (NEW.active=0 OR NEW.password_hash<>OLD.password_hash);
END;
--> statement-breakpoint
CREATE TRIGGER role_access_update AFTER UPDATE ON roles BEGIN UPDATE access_state SET revision=revision+1 WHERE id=1; END;
