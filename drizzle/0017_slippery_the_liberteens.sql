CREATE TABLE `booking_extra_beds` (
	`booking` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`value` integer NOT NULL,
	`total` integer NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`booking`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED
);

--> statement-breakpoint
DROP TRIGGER booking_valid_insert;

--> statement-breakpoint
CREATE TRIGGER booking_valid_insert BEFORE INSERT ON bookings BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM booking_extra_beds WHERE booking=NEW.id AND mode='Noche' AND total<>value*(julianday(NEW.end)-julianday(NEW.start))) THEN RAISE(ABORT,'HOT_EXTRA_BED_INVALID') END;
 SELECT CASE WHEN NEW.pax=3 AND NOT EXISTS(SELECT 1 FROM booking_extra_beds WHERE booking=NEW.id) OR EXISTS(SELECT 1 FROM booking_extra_beds WHERE booking=NEW.id) AND EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND type='Single') THEN RAISE(ABORT,'HOT_EXTRA_BED_REQUIRED') END;
 SELECT CASE WHEN NEW.start>=NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR julianday(NEW.end)-julianday(NEW.start)>365 OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.pax NOT IN (1,2,3) OR NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND (type<>'Single' OR NEW.pax=1)) THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
 SELECT CASE WHEN NEW.status NOT IN ('Confirmada','Alojado','Finalizada','Cancelada') THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
 
 SELECT CASE WHEN NEW.status<>'Cancelada'  AND (
 EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND state='Fuera de servicio') OR EXISTS(SELECT 1 FROM room_blocks WHERE active=1 AND room=NEW.room AND start<NEW.end AND end>NEW.start) OR EXISTS(SELECT 1 FROM room_nights WHERE booking<>NEW.id AND room=NEW.room AND date>=NEW.start AND date<NEW.end)) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
END;

--> statement-breakpoint
DROP TRIGGER booking_valid_update;

--> statement-breakpoint
CREATE TRIGGER booking_valid_update BEFORE UPDATE ON bookings BEGIN
 SELECT CASE WHEN NEW.pax=3 AND NOT EXISTS(SELECT 1 FROM booking_extra_beds WHERE booking=NEW.id) OR EXISTS(SELECT 1 FROM booking_extra_beds WHERE booking=NEW.id) AND EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND type='Single') THEN RAISE(ABORT,'HOT_EXTRA_BED_REQUIRED') END;
 SELECT CASE WHEN NEW.start>=NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR julianday(NEW.end)-julianday(NEW.start)>365 OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.pax NOT IN (1,2,3) OR NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room AND (type<>'Single' OR NEW.pax=1)) THEN RAISE(ABORT,'HOT_BOOKING_INVALID') END;
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
DROP TRIGGER room_plan_update;

--> statement-breakpoint
CREATE TRIGGER room_plan_update BEFORE UPDATE ON booking_room_plans BEGIN
 SELECT CASE WHEN NEW.booking<>OLD.booking OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking AND status IN ('Confirmada','Alojado')) THEN RAISE(ABORT,'HOT_BOOKING_CLOSED') END;
 SELECT CASE WHEN NOT json_valid(NEW.segments) THEN RAISE(ABORT,'HOT_ROOM_PLAN') END;
 SELECT CASE WHEN json_type(NEW.segments)<>'array' OR json_array_length(NEW.segments)<1 OR json_array_length(NEW.segments)>365 THEN RAISE(ABORT,'HOT_ROOM_PLAN') END;
 SELECT CASE WHEN json_extract(NEW.segments,'$[0].start') IS NOT (SELECT start FROM bookings WHERE id=NEW.booking) OR json_extract(NEW.segments,'$[#-1].end') IS NOT (SELECT end FROM bookings WHERE id=NEW.booking) THEN RAISE(ABORT,'HOT_ROOM_PLAN') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.segments) j WHERE json_type(j.value,'$.room') IS NOT 'integer' OR json_type(j.value,'$.start') IS NOT 'text' OR json_type(j.value,'$.end') IS NOT 'text' OR date(json_extract(j.value,'$.start'),'+0 days') IS NOT json_extract(j.value,'$.start') OR date(json_extract(j.value,'$.end'),'+0 days') IS NOT json_extract(j.value,'$.end') OR json_extract(j.value,'$.start')>=json_extract(j.value,'$.end') OR (CAST(j.key AS INTEGER)>0 AND json_extract(j.value,'$.start') IS NOT json_extract(NEW.segments,'$['||(CAST(j.key AS INTEGER)-1)||'].end')) OR NOT EXISTS(SELECT 1 FROM rooms r JOIN bookings b ON b.id=NEW.booking WHERE r.id=json_extract(j.value,'$.room') AND (r.type<>'Single' OR b.pax=1 AND NOT EXISTS(SELECT 1 FROM booking_extra_beds WHERE booking=b.id)))) THEN RAISE(ABORT,'HOT_ROOM_PLAN') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.segments) j JOIN rooms r ON r.id=json_extract(j.value,'$.room') WHERE (r.state='Fuera de servicio' AND (SELECT count(*) FROM room_nights n WHERE n.booking=NEW.booking AND n.room=r.id AND n.date>=json_extract(j.value,'$.start') AND n.date<json_extract(j.value,'$.end'))<julianday(json_extract(j.value,'$.end'))-julianday(json_extract(j.value,'$.start'))) OR EXISTS(SELECT 1 FROM room_blocks x WHERE x.active=1 AND x.room=r.id AND x.start<json_extract(j.value,'$.end') AND x.end>json_extract(j.value,'$.start')) OR EXISTS(SELECT 1 FROM room_nights n WHERE n.booking<>NEW.booking AND n.room=r.id AND n.date>=json_extract(j.value,'$.start') AND n.date<json_extract(j.value,'$.end'))) THEN RAISE(ABORT,'HOT_UNAVAILABLE') END;
END;

--> statement-breakpoint
DROP TRIGGER guests_create;

--> statement-breakpoint
CREATE TRIGGER guests_create AFTER INSERT ON bookings BEGIN
 INSERT OR IGNORE INTO booking_guests(id,booking,position) SELECT NEW.id||':person:'||value,NEW.id,value FROM json_each('[1,2,3]') WHERE value<=NEW.pax;
END;

--> statement-breakpoint
DROP TRIGGER guests_expand;

--> statement-breakpoint
CREATE TRIGGER guests_expand AFTER UPDATE OF pax ON bookings WHEN NEW.pax>OLD.pax BEGIN
 INSERT OR IGNORE INTO booking_guests(id,booking,position) SELECT NEW.id||':person:'||value,NEW.id,value FROM json_each('[1,2,3]') WHERE value<=NEW.pax;
END;

--> statement-breakpoint
CREATE TRIGGER extra_bed_insert BEFORE INSERT ON booking_extra_beds BEGIN
 SELECT CASE WHEN NEW.mode NOT IN ('Noche','Total') OR NEW.value<0 OR NEW.value<>CAST(NEW.value AS INTEGER) OR NEW.value>10000000000 OR NEW.total<0 OR NEW.total<>CAST(NEW.total AS INTEGER) OR NEW.total>10000000000 OR NEW.mode='Total' AND NEW.total<>NEW.value OR LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.actor))=0 OR NEW.version<>0 THEN RAISE(ABORT,'HOT_EXTRA_BED_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking AND status IN ('Cancelada','Finalizada')) OR EXISTS(SELECT 1 FROM group_bookings g WHERE g.booking=NEW.booking AND g.active=1 AND (EXISTS(SELECT 1 FROM group_prices WHERE group_id=g.group_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE ref=g.group_id AND kind='Cobro'))) THEN RAISE(ABORT,'HOT_GROUP_LOCKED') END;
END;

--> statement-breakpoint
CREATE TRIGGER extra_bed_update BEFORE UPDATE ON booking_extra_beds BEGIN
 SELECT CASE WHEN NEW.booking<>OLD.booking OR NEW.created<>OLD.created OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NEW.mode NOT IN ('Noche','Total') OR NEW.value<0 OR NEW.value<>CAST(NEW.value AS INTEGER) OR NEW.value>10000000000 OR NEW.total<0 OR NEW.total<>CAST(NEW.total AS INTEGER) OR NEW.total>10000000000 OR NEW.mode='Total' AND NEW.total<>NEW.value OR LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.actor))=0 THEN RAISE(ABORT,'HOT_EXTRA_BED_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking AND status IN ('Cancelada','Finalizada')) OR EXISTS(SELECT 1 FROM group_bookings g WHERE g.booking=NEW.booking AND g.active=1 AND (EXISTS(SELECT 1 FROM group_prices WHERE group_id=g.group_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE ref=g.group_id AND kind='Cobro'))) THEN RAISE(ABORT,'HOT_GROUP_LOCKED') END;
END;

--> statement-breakpoint
CREATE TRIGGER extra_bed_delete BEFORE DELETE ON booking_extra_beds WHEN EXISTS(SELECT 1 FROM bookings WHERE id=OLD.booking AND (pax>2 OR status IN ('Cancelada','Finalizada'))) OR EXISTS(SELECT 1 FROM group_bookings g WHERE g.booking=OLD.booking AND g.active=1 AND (EXISTS(SELECT 1 FROM group_prices WHERE group_id=g.group_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE ref=g.group_id AND kind='Cobro'))) BEGIN SELECT RAISE(ABORT,'HOT_EXTRA_BED_REQUIRED'); END;

--> statement-breakpoint
DROP TRIGGER group_price_valid;

--> statement-breakpoint
CREATE TRIGGER group_price_valid BEFORE INSERT ON group_prices BEGIN
 SELECT CASE WHEN NEW.mode NOT IN ('Persona/noche','Total') OR NEW.value<=0 OR NEW.value<>CAST(NEW.value AS INTEGER) OR NEW.total<=0 OR NEW.total>10000000000 OR NEW.total<>CAST(NEW.total AS INTEGER) OR LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.actor))=0 OR NEW.person_nights<>(SELECT COALESCE(SUM(b.pax*(julianday(b.end)-julianday(b.start))),0) FROM bookings b JOIN group_bookings l ON l.booking=b.id WHERE l.group_id=NEW.group_id AND l.active=1) OR NEW.total<>(SELECT COALESCE(SUM(b.amount),0) FROM bookings b JOIN group_bookings l ON l.booking=b.id WHERE l.group_id=NEW.group_id AND l.active=1) OR (NEW.mode='Total' AND NEW.value+(SELECT COALESCE(SUM(e.total),0) FROM booking_extra_beds e JOIN group_bookings l ON l.booking=e.booking WHERE l.group_id=NEW.group_id AND l.active=1)<>NEW.total) OR (NEW.mode='Persona/noche' AND NEW.value*NEW.person_nights+(SELECT COALESCE(SUM(e.total),0) FROM booking_extra_beds e JOIN group_bookings l ON l.booking=e.booking WHERE l.group_id=NEW.group_id AND l.active=1)<>NEW.total) THEN RAISE(ABORT,'HOT_GROUP_MONEY') END;
END;
