CREATE TABLE `booking_terms` (
	`booking` text PRIMARY KEY NOT NULL,
	`base_amount` integer NOT NULL,
	`tariff_total` integer,
	`discount_amount` integer DEFAULT 0 NOT NULL,
	`discount_type` text DEFAULT 'Ninguno' NOT NULL,
	`discount_value` integer DEFAULT 0 NOT NULL,
	`price_mode` text DEFAULT 'Historico' NOT NULL,
	`snapshot` text DEFAULT '[]' NOT NULL,
	`payment_condition` text DEFAULT 'Sin especificar' NOT NULL,
	`benefit` text DEFAULT 'Habitual' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`responsible` text DEFAULT '' NOT NULL,
	`observation` text DEFAULT '' NOT NULL,
	`barter_agreement` text DEFAULT '' NOT NULL,
	`barter_status` text DEFAULT 'No corresponde' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`booking`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `room_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`regime` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`amount` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`responsible` text NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rates_period` ON `room_rates` (`type`,`regime`,`start`,`end`);--> statement-breakpoint
CREATE TABLE `room_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`room` integer NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`reason` text NOT NULL,
	`responsible` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`room`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_blocks_room_period` ON `room_blocks` (`room`,`start`,`end`);
--> statement-breakpoint
INSERT INTO booking_terms (booking,base_amount) SELECT id,amount FROM bookings;
--> statement-breakpoint
CREATE TRIGGER rate_insert BEFORE INSERT ON room_rates BEGIN
 SELECT CASE WHEN NEW.start>NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.type NOT IN ('Single','Doble') OR NEW.regime NOT IN ('Desayuno','MP','PC') OR LENGTH(TRIM(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_RATE_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_rates WHERE type=NEW.type AND regime=NEW.regime AND start<=NEW.end AND end>=NEW.start) THEN RAISE(ABORT,'HOT_RATE_OVERLAP') END;
END;
--> statement-breakpoint
CREATE TRIGGER rate_update BEFORE UPDATE ON room_rates BEGIN
 SELECT CASE WHEN NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NEW.start>NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.type NOT IN ('Single','Doble') OR NEW.regime NOT IN ('Desayuno','MP','PC') OR LENGTH(TRIM(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_RATE_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_rates WHERE id<>OLD.id AND type=NEW.type AND regime=NEW.regime AND start<=NEW.end AND end>=NEW.start) THEN RAISE(ABORT,'HOT_RATE_OVERLAP') END;
END;
--> statement-breakpoint
CREATE TRIGGER terms_version BEFORE UPDATE ON booking_terms WHEN NEW.version<>OLD.version+1 BEGIN SELECT RAISE(ABORT,'HOT_VERSION'); END;
--> statement-breakpoint
CREATE TRIGGER terms_valid_insert BEFORE INSERT ON booking_terms BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM booking_terms WHERE booking=NEW.booking) AND NEW.version NOT IN (0,1) THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NEW.base_amount<0 OR NEW.discount_amount<0 OR NEW.discount_amount>NEW.base_amount OR NEW.base_amount<>CAST(NEW.base_amount AS INTEGER) OR NEW.discount_amount<>CAST(NEW.discount_amount AS INTEGER) OR NOT json_valid(NEW.snapshot) THEN RAISE(ABORT,'HOT_PRICE_INVALID') END;
 SELECT CASE WHEN NEW.benefit NOT IN ('Habitual','Descuento','Amigo','Canje','Cortesía') OR (NEW.benefit='Cortesía' AND NEW.discount_amount<>NEW.base_amount) OR (NEW.benefit='Habitual' AND NEW.discount_amount<>0) OR (NEW.benefit='Descuento' AND NEW.discount_amount=0) THEN RAISE(ABORT,'HOT_PRICE_INVALID') END;
 SELECT CASE WHEN (NEW.benefit<>'Habitual' OR NEW.price_mode='Acordado' OR NEW.discount_amount>0) AND (LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.responsible))=0) THEN RAISE(ABORT,'HOT_SPECIAL_REASON') END;
 SELECT CASE WHEN NEW.benefit='Canje' AND (LENGTH(TRIM(NEW.barter_agreement))=0 OR NEW.barter_status NOT IN ('Pendiente','Parcial','Cumplido')) THEN RAISE(ABORT,'HOT_BARTER_INVALID') END;
 
 SELECT CASE WHEN NEW.price_mode='Tarifa' AND NOT EXISTS(SELECT 1 FROM booking_terms t WHERE t.booking=NEW.booking AND t.snapshot=NEW.snapshot) AND EXISTS(SELECT 1 FROM json_each(NEW.snapshot) j WHERE NOT EXISTS(SELECT 1 FROM room_rates r WHERE r.id=json_extract(j.value,'$.rate') AND r.version=json_extract(j.value,'$.version') AND r.amount=json_extract(j.value,'$.amount') AND r.type=json_extract(j.value,'$.type') AND r.regime=json_extract(j.value,'$.regime') AND r.start<=json_extract(j.value,'$.date') AND r.end>=json_extract(j.value,'$.date'))) THEN RAISE(ABORT,'HOT_RATE_CHANGED') END;
END;
--> statement-breakpoint
CREATE TRIGGER terms_valid_update BEFORE UPDATE ON booking_terms BEGIN
 SELECT CASE WHEN NEW.base_amount<0 OR NEW.discount_amount<0 OR NEW.discount_amount>NEW.base_amount OR NEW.base_amount<>CAST(NEW.base_amount AS INTEGER) OR NEW.discount_amount<>CAST(NEW.discount_amount AS INTEGER) OR NOT json_valid(NEW.snapshot) THEN RAISE(ABORT,'HOT_PRICE_INVALID') END;
 SELECT CASE WHEN NEW.benefit NOT IN ('Habitual','Descuento','Amigo','Canje','Cortesía') OR (NEW.benefit='Cortesía' AND NEW.discount_amount<>NEW.base_amount) OR (NEW.benefit='Habitual' AND NEW.discount_amount<>0) OR (NEW.benefit='Descuento' AND NEW.discount_amount=0) THEN RAISE(ABORT,'HOT_PRICE_INVALID') END;
 SELECT CASE WHEN (NEW.benefit<>'Habitual' OR NEW.price_mode='Acordado' OR NEW.discount_amount>0) AND (LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.responsible))=0) THEN RAISE(ABORT,'HOT_SPECIAL_REASON') END;
 SELECT CASE WHEN NEW.benefit='Canje' AND (LENGTH(TRIM(NEW.barter_agreement))=0 OR NEW.barter_status NOT IN ('Pendiente','Parcial','Cumplido')) THEN RAISE(ABORT,'HOT_BARTER_INVALID') END;
 SELECT CASE WHEN OLD.benefit='Canje' AND NEW.benefit<>'Canje' THEN RAISE(ABORT,'HOT_BARTER_INVALID') END;
 SELECT CASE WHEN NEW.price_mode='Tarifa' AND NEW.snapshot<>OLD.snapshot AND EXISTS(SELECT 1 FROM json_each(NEW.snapshot) j WHERE NOT EXISTS(SELECT 1 FROM room_rates r WHERE r.id=json_extract(j.value,'$.rate') AND r.version=json_extract(j.value,'$.version') AND r.amount=json_extract(j.value,'$.amount') AND r.type=json_extract(j.value,'$.type') AND r.regime=json_extract(j.value,'$.regime') AND r.start<=json_extract(j.value,'$.date') AND r.end>=json_extract(j.value,'$.date'))) THEN RAISE(ABORT,'HOT_RATE_CHANGED') END;
END;
--> statement-breakpoint
CREATE TRIGGER block_valid_insert BEFORE INSERT ON room_blocks WHEN NEW.active=1 BEGIN
 SELECT CASE WHEN NEW.start>=NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR julianday(NEW.end)-julianday(NEW.start)>365 OR LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_BLOCK_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_nights WHERE room=NEW.room AND date>=NEW.start AND date<NEW.end) OR EXISTS(SELECT 1 FROM bookings WHERE room=NEW.room AND status<>'Cancelada' AND start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_blocks WHERE id<>NEW.id AND active=1 AND room=NEW.room AND start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER block_valid_update BEFORE UPDATE ON room_blocks WHEN NEW.active=1 BEGIN
 SELECT CASE WHEN NEW.start>=NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR julianday(NEW.end)-julianday(NEW.start)>365 OR LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_BLOCK_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_nights WHERE room=NEW.room AND date>=NEW.start AND date<NEW.end) OR EXISTS(SELECT 1 FROM bookings WHERE room=NEW.room AND status<>'Cancelada' AND start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_blocks WHERE id<>NEW.id AND active=1 AND room=NEW.room AND start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_valid_insert BEFORE INSERT ON bookings BEGIN
 SELECT CASE WHEN NEW.start>=NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR julianday(NEW.end)-julianday(NEW.start)>365 OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.pax NOT IN (1,2) OR NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND (type<>'Single' OR NEW.pax=1)) THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
 SELECT CASE WHEN NEW.status NOT IN ('Confirmada','Alojado','Finalizada','Cancelada') THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
 
 SELECT CASE WHEN NEW.status<>'Cancelada'  AND (
 EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND state='Fuera de servicio') OR EXISTS(SELECT 1 FROM room_blocks WHERE active=1 AND room=NEW.room AND start<NEW.end AND end>NEW.start) OR EXISTS(SELECT 1 FROM room_nights WHERE booking<>NEW.id AND room=NEW.room AND date>=NEW.start AND date<NEW.end) OR EXISTS(SELECT 1 FROM bookings WHERE id<>NEW.id AND status<>'Cancelada' AND room=NEW.room AND start<NEW.end AND end>NEW.start)) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_valid_update BEFORE UPDATE ON bookings BEGIN
 SELECT CASE WHEN NEW.start>=NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR julianday(NEW.end)-julianday(NEW.start)>365 OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.pax NOT IN (1,2) OR NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND (type<>'Single' OR NEW.pax=1)) THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
 SELECT CASE WHEN NEW.status NOT IN ('Confirmada','Alojado','Finalizada','Cancelada') THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
 SELECT CASE WHEN OLD.status IN ('Cancelada','Finalizada') THEN RAISE(ABORT,'HOT_BOOKING_CLOSED') END;
 SELECT CASE WHEN NEW.status='Cancelada' AND (EXISTS(SELECT 1 FROM sales WHERE booking=OLD.id) OR EXISTS(SELECT 1 FROM cash_movements WHERE ref=OLD.id)) THEN RAISE(ABORT,'HOT_REGULARIZATION') END;
 SELECT CASE WHEN NEW.amount+COALESCE((SELECT SUM(amount) FROM sales WHERE booking=OLD.id AND account IS NULL),0)<COALESCE((SELECT SUM(amount) FROM cash_movements WHERE ref=OLD.id AND kind='Cobro'),0) THEN RAISE(ABORT,'HOT_PRICE_PAID') END;
 SELECT CASE WHEN NEW.status='Finalizada' AND NEW.amount+COALESCE((SELECT SUM(amount) FROM sales WHERE booking=OLD.id AND account IS NULL),0)>COALESCE((SELECT SUM(amount) FROM cash_movements WHERE ref=OLD.id AND kind='Cobro'),0) THEN RAISE(ABORT,'HOT_BALANCE_PENDING') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM sales WHERE booking=OLD.id AND (date<NEW.start OR date>NEW.end OR (kind='Incluida' AND (date=NEW.end OR NEW.pax<>OLD.pax OR NEW.regime<>OLD.regime OR NEW.meal<>OLD.meal)))) OR EXISTS(SELECT 1 FROM meal_overrides WHERE booking=OLD.id AND (date<NEW.start OR date>=NEW.end OR NEW.regime<>'MP')) THEN RAISE(ABORT,'HOT_CONSUMPTIONS') END;
 SELECT CASE WHEN NEW.status<>'Cancelada' AND (NEW.room<>OLD.room OR NEW.start<>OLD.start OR NEW.end<>OLD.end OR NEW.status<>OLD.status) AND (
 EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND state='Fuera de servicio') OR EXISTS(SELECT 1 FROM room_blocks WHERE active=1 AND room=NEW.room AND start<NEW.end AND end>NEW.start) OR EXISTS(SELECT 1 FROM room_nights WHERE booking<>NEW.id AND room=NEW.room AND date>=NEW.start AND date<NEW.end) OR EXISTS(SELECT 1 FROM bookings WHERE id<>NEW.id AND status<>'Cancelada' AND room=NEW.room AND start<NEW.end AND end>NEW.start)) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_slots_0 AFTER INSERT ON bookings BEGIN
 
 INSERT INTO room_nights (room,date,booking)
 SELECT NEW.room,date(NEW.start,'+' || value || ' days'),NEW.id FROM json_each('[' || (WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x+1<julianday(NEW.end)-julianday(NEW.start)) SELECT group_concat(x) FROM n) || ']') WHERE NEW.status<>'Cancelada';
END;
--> statement-breakpoint
CREATE TRIGGER booking_slots_1 AFTER UPDATE OF room,start,end,status ON bookings BEGIN
 DELETE FROM room_nights WHERE booking=NEW.id;
 INSERT INTO room_nights (room,date,booking)
 SELECT NEW.room,date(NEW.start,'+' || value || ' days'),NEW.id FROM json_each('[' || (WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x+1<julianday(NEW.end)-julianday(NEW.start)) SELECT group_concat(x) FROM n) || ']') WHERE NEW.status<>'Cancelada';
END;
--> statement-breakpoint
CREATE TRIGGER room_night_valid BEFORE INSERT ON room_nights BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking AND room=NEW.room AND start<=NEW.date AND end>NEW.date AND status<>'Cancelada') OR EXISTS(SELECT 1 FROM room_blocks WHERE active=1 AND room=NEW.room AND start<=NEW.date AND end>NEW.date) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER room_maintenance BEFORE UPDATE OF state ON rooms WHEN NEW.state='Fuera de servicio' AND OLD.state<>'Fuera de servicio' AND EXISTS(SELECT 1 FROM bookings WHERE room=NEW.id AND status IN ('Confirmada','Alojado')) BEGIN SELECT RAISE(ABORT,'HOT_UNAVAILABLE'); END;
--> statement-breakpoint
CREATE TRIGGER booking_sales_active BEFORE INSERT ON sales WHEN NEW.booking IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking AND status IN ('Confirmada','Alojado')) BEGIN SELECT RAISE(ABORT,'HOT_BOOKING_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER booking_cash_active BEFORE INSERT ON cash_movements WHEN NEW.kind='Cobro' AND NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.ref AND status IN ('Confirmada','Alojado')) BEGIN SELECT RAISE(ABORT,'HOT_BOOKING_CLOSED'); END;
