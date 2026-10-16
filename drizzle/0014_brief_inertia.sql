CREATE TABLE `booking_room_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`booking` text NOT NULL,
	`date` text NOT NULL,
	`from_room` integer NOT NULL,
	`to_room` integer NOT NULL,
	`mode` text NOT NULL,
	`reason` text NOT NULL,
	`observation` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	`created` text NOT NULL,
	`version` integer NOT NULL,
	FOREIGN KEY (`booking`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_room`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_room`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_room_move_booking` ON `booking_room_moves` (`booking`,`created`);--> statement-breakpoint
CREATE TABLE `booking_room_plans` (
	`booking` text PRIMARY KEY NOT NULL,
	`segments` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`booking`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
INSERT INTO booking_room_plans(booking,segments,version) SELECT id,json_array(json_object('room',room,'start',start,'end',end)),0 FROM bookings;
--> statement-breakpoint
DROP TRIGGER booking_valid_insert;
--> statement-breakpoint
CREATE TRIGGER booking_valid_insert BEFORE INSERT ON bookings BEGIN
 SELECT CASE WHEN NEW.start>=NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR julianday(NEW.end)-julianday(NEW.start)>365 OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.pax NOT IN (1,2) OR NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND (type<>'Single' OR NEW.pax=1)) THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
 SELECT CASE WHEN NEW.status NOT IN ('Confirmada','Alojado','Finalizada','Cancelada') THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
 
 SELECT CASE WHEN NEW.status<>'Cancelada'  AND (
 EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND state='Fuera de servicio') OR EXISTS(SELECT 1 FROM room_blocks WHERE active=1 AND room=NEW.room AND start<NEW.end AND end>NEW.start) OR EXISTS(SELECT 1 FROM room_nights WHERE booking<>NEW.id AND room=NEW.room AND date>=NEW.start AND date<NEW.end)) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
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
 SELECT CASE WHEN NEW.status='Finalizada' AND NEW.amount+COALESCE((SELECT SUM(amount) FROM sales WHERE booking=OLD.id AND account IS NULL),0)>COALESCE((SELECT SUM(amount) FROM cash_movements WHERE ref=OLD.id AND kind='Cobro'),0) THEN RAISE(ABORT,'HOT_BALANCE_PENDING') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM sales WHERE booking=OLD.id AND (date<NEW.start OR date>NEW.end OR (kind='Incluida' AND (date=NEW.end OR NEW.pax<>OLD.pax OR NEW.regime<>OLD.regime OR NEW.meal<>OLD.meal)))) OR EXISTS(SELECT 1 FROM meal_overrides WHERE booking=OLD.id AND (date<NEW.start OR date>=NEW.end OR NEW.regime<>'MP')) THEN RAISE(ABORT,'HOT_CONSUMPTIONS') END;
 SELECT CASE WHEN NEW.status<>'Cancelada' AND (NEW.room<>OLD.room OR NEW.start<>OLD.start OR NEW.end<>OLD.end) AND (
 EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND state='Fuera de servicio') OR EXISTS(SELECT 1 FROM room_blocks WHERE active=1 AND room=NEW.room AND start<NEW.end AND end>NEW.start) OR EXISTS(SELECT 1 FROM room_nights WHERE booking<>NEW.id AND room=NEW.room AND date>=NEW.start AND date<NEW.end)) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
 SELECT CASE WHEN (NEW.room<>OLD.room OR NEW.start<>OLD.start OR NEW.end<>OLD.end) AND EXISTS(SELECT 1 FROM booking_room_plans WHERE booking=OLD.id AND json_array_length(segments)>1) THEN RAISE(ABORT,'HOT_SPLIT_EDIT') END;
 SELECT CASE WHEN NEW.pax>1 AND NEW.room=OLD.room AND NEW.start=OLD.start AND NEW.end=OLD.end AND EXISTS(SELECT 1 FROM booking_room_plans p,json_each(p.segments) j JOIN rooms r ON r.id=json_extract(j.value,'$.room') WHERE p.booking=OLD.id AND r.type='Single') THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
END;
--> statement-breakpoint
DROP TRIGGER block_valid_insert;
--> statement-breakpoint
CREATE TRIGGER block_valid_insert BEFORE INSERT ON room_blocks WHEN NEW.active=1 BEGIN
 SELECT CASE WHEN NEW.start>=NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR julianday(NEW.end)-julianday(NEW.start)>365 OR LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_BLOCK_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_nights WHERE room=NEW.room AND date>=NEW.start AND date<NEW.end) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_blocks WHERE id<>NEW.id AND active=1 AND room=NEW.room AND start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
END;
--> statement-breakpoint
DROP TRIGGER block_valid_update;
--> statement-breakpoint
CREATE TRIGGER block_valid_update BEFORE UPDATE ON room_blocks WHEN NEW.active=1 BEGIN
 SELECT CASE WHEN NEW.start>=NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR julianday(NEW.end)-julianday(NEW.start)>365 OR LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_BLOCK_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_nights WHERE room=NEW.room AND date>=NEW.start AND date<NEW.end) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_blocks WHERE id<>NEW.id AND active=1 AND room=NEW.room AND start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER room_plan_insert BEFORE INSERT ON booking_room_plans BEGIN
 SELECT CASE WHEN NEW.version<>0 OR NEW.segments<>(SELECT json_array(json_object('room',room,'start',start,'end',end)) FROM bookings WHERE id=NEW.booking) THEN RAISE(ABORT,'HOT_ROOM_PLAN') END;
END;
--> statement-breakpoint
CREATE TRIGGER room_plan_update BEFORE UPDATE ON booking_room_plans BEGIN
 SELECT CASE WHEN NEW.booking<>OLD.booking OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking AND status IN ('Confirmada','Alojado')) THEN RAISE(ABORT,'HOT_BOOKING_CLOSED') END;
 SELECT CASE WHEN NOT json_valid(NEW.segments) THEN RAISE(ABORT,'HOT_ROOM_PLAN') END;
 SELECT CASE WHEN json_type(NEW.segments)<>'array' OR json_array_length(NEW.segments)<1 OR json_array_length(NEW.segments)>365 THEN RAISE(ABORT,'HOT_ROOM_PLAN') END;
 SELECT CASE WHEN json_extract(NEW.segments,'$[0].start') IS NOT (SELECT start FROM bookings WHERE id=NEW.booking) OR json_extract(NEW.segments,'$[#-1].end') IS NOT (SELECT end FROM bookings WHERE id=NEW.booking) THEN RAISE(ABORT,'HOT_ROOM_PLAN') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.segments) j WHERE json_type(j.value,'$.room') IS NOT 'integer' OR json_type(j.value,'$.start') IS NOT 'text' OR json_type(j.value,'$.end') IS NOT 'text' OR date(json_extract(j.value,'$.start'),'+0 days') IS NOT json_extract(j.value,'$.start') OR date(json_extract(j.value,'$.end'),'+0 days') IS NOT json_extract(j.value,'$.end') OR json_extract(j.value,'$.start')>=json_extract(j.value,'$.end') OR (CAST(j.key AS INTEGER)>0 AND json_extract(j.value,'$.start') IS NOT json_extract(NEW.segments,'$['||(CAST(j.key AS INTEGER)-1)||'].end')) OR NOT EXISTS(SELECT 1 FROM rooms r JOIN bookings b ON b.id=NEW.booking WHERE r.id=json_extract(j.value,'$.room') AND (r.type<>'Single' OR b.pax=1))) THEN RAISE(ABORT,'HOT_ROOM_PLAN') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.segments) j JOIN rooms r ON r.id=json_extract(j.value,'$.room') WHERE (r.state='Fuera de servicio' AND (SELECT count(*) FROM room_nights n WHERE n.booking=NEW.booking AND n.room=r.id AND n.date>=json_extract(j.value,'$.start') AND n.date<json_extract(j.value,'$.end'))<julianday(json_extract(j.value,'$.end'))-julianday(json_extract(j.value,'$.start'))) OR EXISTS(SELECT 1 FROM room_blocks x WHERE x.active=1 AND x.room=r.id AND x.start<json_extract(j.value,'$.end') AND x.end>json_extract(j.value,'$.start')) OR EXISTS(SELECT 1 FROM room_nights n WHERE n.booking<>NEW.booking AND n.room=r.id AND n.date>=json_extract(j.value,'$.start') AND n.date<json_extract(j.value,'$.end'))) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER room_plan_preserve BEFORE DELETE ON booking_room_plans BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER room_plan_slots_insert AFTER INSERT ON booking_room_plans BEGIN INSERT INTO room_nights(room,date,booking)
 SELECT json_extract(j.value,'$.room'),date(b.start,'+'||n.value||' days'),NEW.booking
 FROM bookings b,json_each(NEW.segments) j,json_each('['||(WITH RECURSIVE days(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM days WHERE x+1<(SELECT julianday(end)-julianday(start) FROM bookings WHERE id=NEW.booking)) SELECT group_concat(x) FROM days)||']') n
 WHERE b.id=NEW.booking AND b.status<>'Cancelada' AND date(b.start,'+'||n.value||' days')>=json_extract(j.value,'$.start') AND date(b.start,'+'||n.value||' days')<json_extract(j.value,'$.end'); END;
--> statement-breakpoint
CREATE TRIGGER room_plan_slots_update AFTER UPDATE ON booking_room_plans BEGIN DELETE FROM room_nights WHERE booking=NEW.booking; INSERT INTO room_nights(room,date,booking)
 SELECT json_extract(j.value,'$.room'),date(b.start,'+'||n.value||' days'),NEW.booking
 FROM bookings b,json_each(NEW.segments) j,json_each('['||(WITH RECURSIVE days(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM days WHERE x+1<(SELECT julianday(end)-julianday(start) FROM bookings WHERE id=NEW.booking)) SELECT group_concat(x) FROM days)||']') n
 WHERE b.id=NEW.booking AND b.status<>'Cancelada' AND date(b.start,'+'||n.value||' days')>=json_extract(j.value,'$.start') AND date(b.start,'+'||n.value||' days')<json_extract(j.value,'$.end'); END;
--> statement-breakpoint
DROP TRIGGER booking_slots_0;
--> statement-breakpoint
CREATE TRIGGER booking_slots_0 AFTER INSERT ON bookings BEGIN INSERT INTO booking_room_plans(booking,segments,version) VALUES(NEW.id,json_array(json_object('room',NEW.room,'start',NEW.start,'end',NEW.end)),0); END;
--> statement-breakpoint
DROP TRIGGER booking_slots_1;
--> statement-breakpoint
CREATE TRIGGER booking_slots_1 AFTER UPDATE OF room,start,end ON bookings WHEN (NEW.room<>OLD.room OR NEW.start<>OLD.start OR NEW.end<>OLD.end) AND NOT EXISTS(SELECT 1 FROM booking_room_plans WHERE booking=NEW.id AND segments=json_array(json_object('room',NEW.room,'start',NEW.start,'end',NEW.end))) BEGIN UPDATE booking_room_plans SET segments=json_array(json_object('room',NEW.room,'start',NEW.start,'end',NEW.end)),version=version+1 WHERE booking=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER booking_slots_cancel AFTER UPDATE OF status ON bookings WHEN NEW.status='Cancelada' BEGIN DELETE FROM room_nights WHERE booking=NEW.id; END;
--> statement-breakpoint
DROP TRIGGER room_night_valid;
--> statement-breakpoint
CREATE TRIGGER room_night_valid BEFORE INSERT ON room_nights BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM booking_room_plans p JOIN bookings b ON b.id=p.booking,json_each(p.segments) j WHERE b.id=NEW.booking AND b.status<>'Cancelada' AND json_extract(j.value,'$.room')=NEW.room AND json_extract(j.value,'$.start')<=NEW.date AND json_extract(j.value,'$.end')>NEW.date) OR EXISTS(SELECT 1 FROM room_blocks WHERE active=1 AND room=NEW.room AND start<=NEW.date AND end>NEW.date) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
END;
--> statement-breakpoint
DROP TRIGGER room_maintenance;
--> statement-breakpoint
CREATE TRIGGER room_maintenance BEFORE UPDATE OF state ON rooms WHEN NEW.state='Fuera de servicio' AND OLD.state<>'Fuera de servicio' AND EXISTS(SELECT 1 FROM room_nights n JOIN bookings b ON b.id=n.booking WHERE n.room=NEW.id AND b.status IN ('Confirmada','Alojado') AND (n.date>=date('now','-3 hours') OR b.status='Alojado' AND n.date=(SELECT max(date) FROM room_nights WHERE booking=b.id))) BEGIN SELECT RAISE(ABORT,'HOT_UNAVAILABLE'); END;
--> statement-breakpoint
CREATE TRIGGER room_move_valid BEFORE INSERT ON booking_room_moves BEGIN
 SELECT CASE WHEN NEW.mode NOT IN ('Completa','Traslado') OR trim(NEW.reason)='' OR trim(NEW.actor)='' OR NEW.from_room=NEW.to_room OR date(NEW.date,'+0 days') IS NOT NEW.date THEN RAISE(ABORT,'HOT_ROOM_PLAN') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM booking_room_plans p JOIN bookings b ON b.id=p.booking,json_each(p.segments) j WHERE p.booking=NEW.booking AND p.version=NEW.version+1 AND json_extract(j.value,'$.room')=NEW.to_room AND json_extract(j.value,'$.start')=NEW.date AND json_extract(j.value,'$.end')=b.end AND ((NEW.mode='Completa' AND b.status='Confirmada' AND NEW.date=b.start AND json_array_length(p.segments)=1) OR (NEW.mode='Traslado' AND b.status='Alojado' AND b.start<=NEW.date AND NEW.date<b.end AND NEW.date<=date('now','-3 hours')))) THEN RAISE(ABORT,'HOT_ROOM_PLAN') END;
 SELECT CASE WHEN NEW.mode='Traslado' AND EXISTS(SELECT 1 FROM booking_room_moves WHERE booking=NEW.booking AND mode='Traslado' AND date>NEW.date) THEN RAISE(ABORT,'HOT_ROOM_DATE') END;
END;
--> statement-breakpoint
CREATE TRIGGER room_move_preserve_update BEFORE UPDATE ON booking_room_moves BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER room_move_preserve_delete BEFORE DELETE ON booking_room_moves BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
