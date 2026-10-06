CREATE TABLE `booking_guests` (
	`id` text PRIMARY KEY NOT NULL,
	`booking` text NOT NULL,
	`position` integer NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`restrictions` text DEFAULT '' NOT NULL,
	`preferences` text DEFAULT '' NOT NULL,
	`observation` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`booking`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`guest` text,
	`customer` text NOT NULL,
	`date` text NOT NULL,
	`service` text NOT NULL,
	`qty` integer NOT NULL,
	`observation` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Pendiente' NOT NULL,
	`responsible` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`guest`) REFERENCES `booking_guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meal_services` (
	`guest` text NOT NULL,
	`date` text NOT NULL,
	`service` text NOT NULL,
	`sale` text NOT NULL,
	PRIMARY KEY(`guest`, `date`, `service`),
	FOREIGN KEY (`guest`) REFERENCES `booking_guests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meal_suspensions` (
	`guest` text NOT NULL,
	`date` text NOT NULL,
	`service` text NOT NULL,
	`active` integer NOT NULL,
	`reason` text NOT NULL,
	`observation` text DEFAULT '' NOT NULL,
	`responsible` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`guest`, `date`, `service`),
	FOREIGN KEY (`guest`) REFERENCES `booking_guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_guest_position ON booking_guests(booking,position);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_person_meal_plan ON meal_plans(guest,date,service) WHERE guest IS NOT NULL AND status<>'Cancelada';
--> statement-breakpoint
INSERT INTO booking_guests(id,booking,position) SELECT id||':person:1',id,1 FROM bookings;
--> statement-breakpoint
INSERT INTO booking_guests(id,booking,position) SELECT id||':person:2',id,2 FROM bookings WHERE pax=2;
--> statement-breakpoint
CREATE TRIGGER guests_create AFTER INSERT ON bookings BEGIN
 INSERT INTO booking_guests(id,booking,position) VALUES(NEW.id||':person:1',NEW.id,1);
 INSERT INTO booking_guests(id,booking,position) SELECT NEW.id||':person:2',NEW.id,2 WHERE NEW.pax=2;
END;
--> statement-breakpoint
CREATE TRIGGER guests_expand AFTER UPDATE OF pax ON bookings WHEN NEW.pax>OLD.pax BEGIN
 INSERT OR IGNORE INTO booking_guests(id,booking,position) VALUES(NEW.id||':person:2',NEW.id,2);
END;
--> statement-breakpoint
CREATE TRIGGER guest_profile_version BEFORE UPDATE ON booking_guests BEGIN
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.booking<>OLD.booking OR NEW.position<>OLD.position OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking AND status IN ('Confirmada','Alojado') AND pax>=NEW.position) THEN RAISE(ABORT,'HOT_BOOKING_CLOSED') END;
END;
--> statement-breakpoint
CREATE TRIGGER attendance_booking_edit BEFORE UPDATE ON bookings BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM booking_guests g WHERE g.booking=OLD.id AND g.position>NEW.pax AND (g.name<>'' OR g.restrictions<>'' OR g.preferences<>'' OR g.observation<>'' OR EXISTS(SELECT 1 FROM meal_suspensions WHERE guest=g.id) OR EXISTS(SELECT 1 FROM meal_plans WHERE guest=g.id))) THEN RAISE(ABORT,'HOT_CONSUMPTIONS') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM meal_suspensions s JOIN booking_guests g ON g.id=s.guest WHERE g.booking=OLD.id AND (s.date<NEW.start OR s.date>NEW.end)) OR EXISTS(SELECT 1 FROM meal_plans p JOIN booking_guests g ON g.id=p.guest WHERE g.booking=OLD.id AND p.status<>'Cancelada' AND (p.date<NEW.start OR p.date>NEW.end)) THEN RAISE(ABORT,'HOT_CONSUMPTIONS') END;
END;
--> statement-breakpoint
CREATE TRIGGER suspension_insert BEFORE INSERT ON meal_suspensions BEGIN
 SELECT CASE WHEN NEW.service NOT IN ('Desayuno','Almuerzo','Cena') OR NEW.active NOT IN (0,1) OR date(NEW.date,'+0 days') IS NOT NEW.date OR length(trim(NEW.reason))=0 OR length(trim(NEW.responsible))=0 OR NOT EXISTS(SELECT 1 FROM booking_guests g JOIN bookings b ON b.id=g.booking WHERE g.id=NEW.guest AND g.position<=b.pax AND b.status IN ('Confirmada','Alojado') AND b.start<=NEW.date AND NEW.date<=b.end) THEN RAISE(ABORT,'HOT_MEAL_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM daily_closes WHERE date>=NEW.date) THEN RAISE(ABORT,'Ese dia ya esta cerrado') END;
 SELECT CASE WHEN NEW.active=1 AND (EXISTS(SELECT 1 FROM meal_services WHERE guest=NEW.guest AND date=NEW.date AND service=NEW.service) OR EXISTS(SELECT 1 FROM meal_plans WHERE guest=NEW.guest AND date=NEW.date AND service=NEW.service AND status='Servido') OR EXISTS(SELECT 1 FROM sales s JOIN booking_guests g ON g.booking=s.booking WHERE g.id=NEW.guest AND s.kind='Incluida' AND s.date=NEW.date AND (s.service=NEW.service OR s.service IS NULL) AND NOT EXISTS(SELECT 1 FROM meal_services WHERE sale=s.id))) THEN RAISE(ABORT,'HOT_MEAL_SERVED') END;
END;
--> statement-breakpoint
CREATE TRIGGER suspension_update BEFORE UPDATE ON meal_suspensions BEGIN
 SELECT CASE WHEN NEW.guest<>OLD.guest OR NEW.date<>OLD.date OR NEW.service<>OLD.service OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NEW.active NOT IN (0,1) OR length(trim(NEW.reason))=0 OR length(trim(NEW.responsible))=0 OR NOT EXISTS(SELECT 1 FROM booking_guests g JOIN bookings b ON b.id=g.booking WHERE g.id=NEW.guest AND g.position<=b.pax AND b.status IN ('Confirmada','Alojado')) THEN RAISE(ABORT,'HOT_MEAL_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM daily_closes WHERE date>=NEW.date) THEN RAISE(ABORT,'Ese dia ya esta cerrado') END;
 SELECT CASE WHEN NEW.active=1 AND (EXISTS(SELECT 1 FROM meal_services WHERE guest=NEW.guest AND date=NEW.date AND service=NEW.service) OR EXISTS(SELECT 1 FROM meal_plans WHERE guest=NEW.guest AND date=NEW.date AND service=NEW.service AND status='Servido')) THEN RAISE(ABORT,'HOT_MEAL_SERVED') END;
END;
--> statement-breakpoint
CREATE TRIGGER included_suspension_limit BEFORE INSERT ON sales WHEN NEW.kind='Incluida' BEGIN
 SELECT CASE WHEN NEW.qty+COALESCE((SELECT SUM(qty) FROM sales WHERE booking=NEW.booking AND date=NEW.date AND kind='Incluida' AND (service=NEW.service OR service IS NULL OR (NEW.service<>'Desayuno' AND service<>'Desayuno' AND (SELECT regime FROM bookings WHERE id=NEW.booking)='MP'))),0)>(SELECT pax FROM bookings WHERE id=NEW.booking)-COALESCE((SELECT COUNT(*) FROM meal_suspensions s JOIN booking_guests g ON g.id=s.guest WHERE g.booking=NEW.booking AND g.position<=(SELECT pax FROM bookings WHERE id=NEW.booking) AND s.date=NEW.date AND s.service=NEW.service AND s.active=1),0) THEN RAISE(ABORT,'HOT_MEAL_SUSPENDED') END;
END;
--> statement-breakpoint
CREATE TRIGGER service_person_validate BEFORE INSERT ON meal_services BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM sales s JOIN booking_guests g ON g.booking=s.booking WHERE g.id=NEW.guest AND s.id<>NEW.sale AND s.kind='Incluida' AND s.date=NEW.date AND (s.service=NEW.service OR s.service IS NULL) AND NOT EXISTS(SELECT 1 FROM meal_services WHERE sale=s.id)) THEN RAISE(ABORT,'HOT_MEAL_LEGACY') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sales s JOIN booking_guests g ON g.booking=s.booking JOIN bookings b ON b.id=g.booking WHERE s.id=NEW.sale AND g.id=NEW.guest AND g.position<=b.pax AND s.kind='Incluida' AND s.date=NEW.date AND s.service=NEW.service AND b.status IN ('Confirmada','Alojado')) THEN RAISE(ABORT,'HOT_MEAL_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM meal_suspensions WHERE guest=NEW.guest AND date=NEW.date AND service=NEW.service AND active=1) THEN RAISE(ABORT,'HOT_MEAL_SUSPENDED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM meal_services m JOIN booking_guests g ON g.id=m.guest JOIN bookings b ON b.id=g.booking WHERE m.guest=NEW.guest AND m.date=NEW.date AND b.regime='MP' AND m.service<>'Desayuno' AND NEW.service<>'Desayuno') THEN RAISE(ABORT,'HOT_MEAL_SERVED') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM meal_services WHERE sale=NEW.sale)>=(SELECT qty FROM sales WHERE id=NEW.sale) THEN RAISE(ABORT,'HOT_MEAL_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER mp_plan_insert BEFORE INSERT ON meal_overrides BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM meal_plans p JOIN booking_guests g ON g.id=p.guest WHERE g.booking=NEW.booking AND p.date=NEW.date AND p.service=NEW.meal AND p.status<>'Cancelada') THEN RAISE(ABORT,'HOT_MEAL_PLAN_CONFLICT') END;
END;
--> statement-breakpoint
CREATE TRIGGER mp_plan_update BEFORE UPDATE ON meal_overrides BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM meal_plans p JOIN booking_guests g ON g.id=p.guest WHERE g.booking=NEW.booking AND p.date=NEW.date AND p.service=NEW.meal AND p.status<>'Cancelada') THEN RAISE(ABORT,'HOT_MEAL_PLAN_CONFLICT') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_meal_plan_conflict BEFORE UPDATE OF regime,meal,end ON bookings BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM meal_plans p JOIN booking_guests g ON g.id=p.guest WHERE g.booking=OLD.id AND p.status<>'Cancelada' AND p.date<NEW.end AND (p.service='Desayuno' OR NEW.regime='PC' OR NEW.regime='MP' AND p.service=COALESCE((SELECT meal FROM meal_overrides WHERE booking=OLD.id AND date=p.date),NEW.meal))) THEN RAISE(ABORT,'HOT_MEAL_PLAN_CONFLICT') END;
END;
--> statement-breakpoint
CREATE TRIGGER plan_insert BEFORE INSERT ON meal_plans BEGIN
 SELECT CASE WHEN date(NEW.date,'+0 days') IS NOT NEW.date OR NEW.service NOT IN ('Desayuno','Almuerzo','Cena') OR NEW.qty<1 OR NEW.qty>500 OR NEW.qty<>CAST(NEW.qty AS INTEGER) OR NEW.status<>'Pendiente' OR length(trim(NEW.customer))=0 OR length(trim(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_MEAL_INVALID') END;
 SELECT CASE WHEN NEW.guest IS NOT NULL AND NOT EXISTS(SELECT 1 FROM booking_guests g JOIN bookings b ON b.id=g.booking WHERE g.id=NEW.guest AND g.position<=b.pax AND b.status IN ('Confirmada','Alojado') AND b.start<=NEW.date AND NEW.date<=b.end AND NEW.qty=1 AND NOT (NEW.date<b.end AND (NEW.service='Desayuno' OR b.regime='PC' OR b.regime='MP' AND NEW.service=COALESCE((SELECT meal FROM meal_overrides WHERE booking=b.id AND date=NEW.date),b.meal)))) THEN RAISE(ABORT,'HOT_MEAL_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM daily_closes WHERE date>=NEW.date) THEN RAISE(ABORT,'Ese dia ya esta cerrado') END;
END;
--> statement-breakpoint
CREATE TRIGGER plan_update BEFORE UPDATE ON meal_plans BEGIN
 SELECT CASE WHEN NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.guest IS NOT OLD.guest OR NEW.customer<>OLD.customer OR NEW.date<>OLD.date OR NEW.service<>OLD.service OR NEW.qty<>OLD.qty OR OLD.status<>'Pendiente' OR NEW.status NOT IN ('Servido','Cancelada') OR length(trim(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_MEAL_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM daily_closes WHERE date>=NEW.date) THEN RAISE(ABORT,'Ese dia ya esta cerrado') END;
 SELECT CASE WHEN NEW.status='Servido' AND NEW.guest IS NOT NULL AND (EXISTS(SELECT 1 FROM meal_suspensions WHERE guest=NEW.guest AND date=NEW.date AND service=NEW.service AND active=1) OR NOT EXISTS(SELECT 1 FROM booking_guests g JOIN bookings b ON b.id=g.booking WHERE g.id=NEW.guest AND g.position<=b.pax AND b.status IN ('Confirmada','Alojado'))) THEN RAISE(ABORT,'HOT_MEAL_SUSPENDED') END;
END;
