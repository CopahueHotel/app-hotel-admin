CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`created` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`guest` text NOT NULL,
	`phone` text NOT NULL,
	`room` integer NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`pax` integer NOT NULL,
	`regime` text NOT NULL,
	`meal` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`note` text NOT NULL,
	FOREIGN KEY (`room`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cash_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`account` text NOT NULL,
	`amount` integer NOT NULL,
	`area` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_closes` (
	`date` text PRIMARY KEY NOT NULL,
	`expected` integer NOT NULL,
	`counted` integer NOT NULL,
	`note` text NOT NULL,
	`actor` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`due` text NOT NULL,
	`supplier` text NOT NULL,
	`label` text NOT NULL,
	`area` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meal_overrides` (
	`booking` text NOT NULL,
	`date` text NOT NULL,
	`meal` text NOT NULL,
	PRIMARY KEY(`booking`, `date`),
	FOREIGN KEY (`booking`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`minimum` real NOT NULL,
	`price` integer NOT NULL,
	`location` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` integer PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`state` text DEFAULT 'Limpia' NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`booking` text,
	`customer` text NOT NULL,
	`label` text NOT NULL,
	`qty` real NOT NULL,
	`amount` integer NOT NULL,
	`kind` text NOT NULL,
	`product` text,
	`account` text,
	FOREIGN KEY (`booking`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `room_nights` (
	`room` integer NOT NULL,
	`date` text NOT NULL,
	`booking` text NOT NULL,
	PRIMARY KEY(`room`, `date`),
	FOREIGN KEY (`room`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`product` text NOT NULL,
	`qty` real NOT NULL,
	`reason` text NOT NULL,
	`ref` text NOT NULL,
	FOREIGN KEY (`product`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TRIGGER stock_nonnegative BEFORE INSERT ON stock_movements WHEN NEW.qty + COALESCE((SELECT SUM(qty) FROM stock_movements WHERE product=NEW.product),0) < -0.00001 BEGIN SELECT RAISE(ABORT, 'Stock insuficiente'); END;
--> statement-breakpoint
CREATE TRIGGER payment_limit BEFORE INSERT ON cash_movements WHEN NEW.kind='Cobro' AND NEW.amount+COALESCE((SELECT SUM(amount) FROM cash_movements WHERE ref=NEW.ref AND kind='Cobro'),0) > (SELECT amount FROM bookings WHERE id=NEW.ref)+COALESCE((SELECT SUM(amount) FROM sales WHERE booking=NEW.ref),0) BEGIN SELECT RAISE(ABORT, 'El cobro supera el saldo pendiente'); END;
--> statement-breakpoint
CREATE TRIGGER supplier_payment_limit BEFORE INSERT ON cash_movements WHEN NEW.kind='Pago' AND -NEW.amount-COALESCE((SELECT SUM(amount) FROM cash_movements WHERE ref=NEW.ref AND kind='Pago'),0) > (SELECT amount FROM expenses WHERE id=NEW.ref) BEGIN SELECT RAISE(ABORT, 'El pago supera lo adeudado'); END;
