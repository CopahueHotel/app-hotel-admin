CREATE TABLE `group_prices` (
	`group_id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`value` integer NOT NULL,
	`person_nights` integer NOT NULL,
	`total` integer NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `reservation_groups`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE VIEW group_accounts AS SELECT g.id,(SELECT COALESCE(SUM(b.amount),0) FROM bookings b JOIN group_bookings l ON l.booking=b.id WHERE l.group_id=g.id AND l.active=1 AND b.status<>'Cancelada')+(SELECT COALESCE(SUM(s.amount),0) FROM sales s JOIN group_bookings l ON l.booking=s.booking WHERE l.group_id=g.id AND l.active=1 AND s.account IS NULL)-(SELECT COALESCE(SUM(c.amount),0) FROM cash_movements c WHERE c.kind='Cobro' AND (c.ref=g.id OR c.ref IN (SELECT booking FROM group_bookings WHERE group_id=g.id AND active=1))) balance FROM reservation_groups g;
--> statement-breakpoint
DROP TRIGGER rate_insert;
--> statement-breakpoint
CREATE TRIGGER rate_insert BEFORE INSERT ON room_rates BEGIN
 SELECT CASE WHEN NEW.start>NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.type NOT IN ('Single','Doble') OR NEW.regime NOT IN ('Sin desayuno','Desayuno','MP','PC') OR LENGTH(TRIM(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_RATE_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_rates WHERE type=NEW.type AND regime=NEW.regime AND start<=NEW.end AND end>=NEW.start) THEN RAISE(ABORT,'HOT_RATE_OVERLAP') END;
END;
--> statement-breakpoint
DROP TRIGGER rate_update;
--> statement-breakpoint
CREATE TRIGGER rate_update BEFORE UPDATE ON room_rates BEGIN
 SELECT CASE WHEN NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NEW.start>NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.type NOT IN ('Single','Doble') OR (NEW.regime NOT IN ('Sin desayuno','Desayuno','MP','PC')) OR LENGTH(TRIM(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_RATE_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_rates WHERE id<>OLD.id AND type=NEW.type AND regime=NEW.regime AND start<=NEW.end AND end>=NEW.start) THEN RAISE(ABORT,'HOT_RATE_OVERLAP') END;
END;
--> statement-breakpoint
DROP TRIGGER payment_limit;
--> statement-breakpoint
CREATE TRIGGER payment_limit BEFORE INSERT ON cash_movements WHEN NEW.kind='Cobro' BEGIN
 SELECT CASE WHEN NEW.amount<=0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) THEN RAISE(ABORT,'HOT_GROUP_MONEY') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM reservation_groups WHERE id=NEW.ref) AND NEW.amount>(SELECT balance FROM group_accounts WHERE id=NEW.ref) THEN RAISE(ABORT,'El cobro supera el saldo pendiente') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE id=NEW.ref) AND NEW.amount+COALESCE((SELECT SUM(amount) FROM cash_movements WHERE ref=NEW.ref AND kind='Cobro'),0)>(SELECT amount FROM bookings WHERE id=NEW.ref)+COALESCE((SELECT SUM(amount) FROM sales WHERE booking=NEW.ref AND account IS NULL),0) THEN RAISE(ABORT,'El cobro supera el saldo pendiente') END;
END;
--> statement-breakpoint
DROP TRIGGER booking_cash_active;
--> statement-breakpoint
CREATE TRIGGER booking_cash_active BEFORE INSERT ON cash_movements WHEN NEW.kind='Cobro' BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM group_bookings WHERE booking=NEW.ref AND active=1) THEN RAISE(ABORT,'HOT_GROUP_ACCOUNT') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.ref AND status IN ('Confirmada','Alojado')) AND NOT EXISTS(SELECT 1 FROM group_bookings l JOIN bookings b ON b.id=l.booking WHERE l.group_id=NEW.ref AND l.active=1 AND b.status IN ('Confirmada','Alojado')) THEN RAISE(ABORT,'HOT_BOOKING_CLOSED') END;
END;
--> statement-breakpoint
DROP TRIGGER booking_valid_update;
--> statement-breakpoint
CREATE TRIGGER booking_valid_update BEFORE UPDATE ON bookings BEGIN
 SELECT CASE WHEN NEW.start>=NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR julianday(NEW.end)-julianday(NEW.start)>365 OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.pax NOT IN (1,2) OR NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND (type<>'Single' OR NEW.pax=1)) THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
 SELECT CASE WHEN NEW.status NOT IN ('Confirmada','Alojado','Finalizada','Cancelada') THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
 SELECT CASE WHEN OLD.status IN ('Cancelada','Finalizada') THEN RAISE(ABORT,'HOT_BOOKING_CLOSED') END;
 SELECT CASE WHEN NEW.status='Cancelada' AND (EXISTS(SELECT 1 FROM sales WHERE booking=OLD.id) OR EXISTS(SELECT 1 FROM cash_movements WHERE ref=OLD.id)) THEN RAISE(ABORT,'HOT_REGULARIZATION') END;
 SELECT CASE WHEN NEW.amount+COALESCE((SELECT SUM(amount) FROM sales WHERE booking=OLD.id AND account IS NULL),0)<COALESCE((SELECT SUM(amount) FROM cash_movements WHERE ref=OLD.id AND kind='Cobro'),0) THEN RAISE(ABORT,'HOT_PRICE_PAID') END;
 SELECT CASE WHEN NEW.status='Finalizada' AND EXISTS(SELECT 1 FROM group_bookings l JOIN group_accounts a ON a.id=l.group_id WHERE l.booking=OLD.id AND l.active=1 AND a.balance>0) THEN RAISE(ABORT,'HOT_BALANCE_PENDING') END;
 SELECT CASE WHEN NEW.status='Finalizada' AND NOT EXISTS(SELECT 1 FROM group_bookings WHERE booking=OLD.id AND active=1) AND NEW.amount+COALESCE((SELECT SUM(amount) FROM sales WHERE booking=OLD.id AND account IS NULL),0)>COALESCE((SELECT SUM(amount) FROM cash_movements WHERE ref=OLD.id AND kind='Cobro'),0) THEN RAISE(ABORT,'HOT_BALANCE_PENDING') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM sales WHERE booking=OLD.id AND (date<NEW.start OR date>NEW.end OR (kind='Incluida' AND (date=NEW.end OR NEW.pax<>OLD.pax OR NEW.regime<>OLD.regime OR NEW.meal<>OLD.meal)))) OR EXISTS(SELECT 1 FROM meal_overrides WHERE booking=OLD.id AND (date<NEW.start OR date>=NEW.end OR NEW.regime<>'MP')) THEN RAISE(ABORT,'HOT_CONSUMPTIONS') END;
 SELECT CASE WHEN NEW.status<>'Cancelada' AND (NEW.room<>OLD.room OR NEW.start<>OLD.start OR NEW.end<>OLD.end) AND (
 EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND state='Fuera de servicio') OR EXISTS(SELECT 1 FROM room_blocks WHERE active=1 AND room=NEW.room AND start<NEW.end AND end>NEW.start) OR EXISTS(SELECT 1 FROM room_nights WHERE booking<>NEW.id AND room=NEW.room AND date>=NEW.start AND date<NEW.end)) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
 SELECT CASE WHEN (NEW.room<>OLD.room OR NEW.start<>OLD.start OR NEW.end<>OLD.end) AND EXISTS(SELECT 1 FROM booking_room_plans WHERE booking=OLD.id AND json_array_length(segments)>1) THEN RAISE(ABORT,'HOT_SPLIT_EDIT') END;
 SELECT CASE WHEN NEW.pax>1 AND NEW.room=OLD.room AND NEW.start=OLD.start AND NEW.end=OLD.end AND EXISTS(SELECT 1 FROM booking_room_plans p,json_each(p.segments) j JOIN rooms r ON r.id=json_extract(j.value,'$.room') WHERE p.booking=OLD.id AND r.type='Single') THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER group_price_valid BEFORE INSERT ON group_prices BEGIN
 SELECT CASE WHEN NEW.mode NOT IN ('Persona/noche','Total') OR NEW.value<=0 OR NEW.value<>CAST(NEW.value AS INTEGER) OR NEW.total<=0 OR NEW.total>10000000000 OR NEW.total<>CAST(NEW.total AS INTEGER) OR LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.actor))=0 OR NEW.person_nights<>(SELECT COALESCE(SUM(b.pax*(julianday(b.end)-julianday(b.start))),0) FROM bookings b JOIN group_bookings l ON l.booking=b.id WHERE l.group_id=NEW.group_id AND l.active=1) OR NEW.total<>(SELECT COALESCE(SUM(b.amount),0) FROM bookings b JOIN group_bookings l ON l.booking=b.id WHERE l.group_id=NEW.group_id AND l.active=1) OR (NEW.mode='Total' AND NEW.value<>NEW.total) OR (NEW.mode='Persona/noche' AND NEW.value*NEW.person_nights<>NEW.total) THEN RAISE(ABORT,'HOT_GROUP_MONEY') END;
END;
--> statement-breakpoint
CREATE TRIGGER group_price_update BEFORE UPDATE ON group_prices BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER group_price_delete BEFORE DELETE ON group_prices BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER group_locked_member_update BEFORE UPDATE ON group_bookings WHEN (EXISTS(SELECT 1 FROM group_prices WHERE group_id=OLD.group_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE ref=OLD.group_id AND kind='Cobro')) AND (NEW.group_id<>OLD.group_id OR NEW.active<>OLD.active) BEGIN SELECT RAISE(ABORT,'HOT_GROUP_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER group_locked_member_insert BEFORE INSERT ON group_bookings WHEN EXISTS(SELECT 1 FROM group_prices WHERE group_id=NEW.group_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE ref=NEW.group_id AND kind='Cobro') BEGIN SELECT RAISE(ABORT,'HOT_GROUP_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER group_locked_member_delete BEFORE DELETE ON group_bookings WHEN EXISTS(SELECT 1 FROM group_prices WHERE group_id=OLD.group_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE ref=OLD.group_id AND kind='Cobro') BEGIN SELECT RAISE(ABORT,'HOT_GROUP_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER group_contract_booking BEFORE UPDATE ON bookings WHEN (NEW.amount<>OLD.amount OR NEW.start<>OLD.start OR NEW.end<>OLD.end OR NEW.pax<>OLD.pax OR NEW.regime<>OLD.regime OR NEW.status='Cancelada') AND EXISTS(SELECT 1 FROM group_bookings l WHERE l.booking=OLD.id AND l.active=1 AND (EXISTS(SELECT 1 FROM group_prices WHERE group_id=l.group_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE ref=l.group_id AND kind='Cobro'))) BEGIN SELECT RAISE(ABORT,'HOT_GROUP_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER group_paid_correction BEFORE INSERT ON sales WHEN NEW.amount<0 AND EXISTS(SELECT 1 FROM group_bookings l JOIN cash_movements c ON c.ref=l.group_id AND c.kind='Cobro' WHERE l.booking=NEW.booking AND l.active=1) BEGIN SELECT RAISE(ABORT,'HOT_GROUP_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER group_payment_update BEFORE UPDATE ON cash_movements WHEN OLD.kind='Cobro' AND EXISTS(SELECT 1 FROM reservation_groups WHERE id=OLD.ref) BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER group_payment_delete BEFORE DELETE ON cash_movements WHEN OLD.kind='Cobro' AND EXISTS(SELECT 1 FROM reservation_groups WHERE id=OLD.ref) BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
