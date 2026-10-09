-- Regimenes vigentes; conserva reservas, tarifas y precios historicos sin recalcular.
DROP TRIGGER rate_insert;
--> statement-breakpoint
CREATE TRIGGER rate_insert BEFORE INSERT ON room_rates BEGIN
 SELECT CASE WHEN NEW.start>NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.type NOT IN ('Single','Doble') OR NEW.regime NOT IN ('Sin desayuno','Desayuno','MP') OR LENGTH(TRIM(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_RATE_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_rates WHERE type=NEW.type AND regime=NEW.regime AND start<=NEW.end AND end>=NEW.start) THEN RAISE(ABORT,'HOT_RATE_OVERLAP') END;
END;
--> statement-breakpoint
DROP TRIGGER rate_update;
--> statement-breakpoint
CREATE TRIGGER rate_update BEFORE UPDATE ON room_rates BEGIN
 SELECT CASE WHEN NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NEW.start>NEW.end OR date(NEW.start,'+0 days') IS NOT NEW.start OR date(NEW.end,'+0 days') IS NOT NEW.end OR NEW.amount<0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.type NOT IN ('Single','Doble') OR (NEW.regime NOT IN ('Sin desayuno','Desayuno','MP','PC') OR NEW.regime='PC' AND OLD.regime<>'PC') OR LENGTH(TRIM(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_RATE_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM room_rates WHERE id<>OLD.id AND type=NEW.type AND regime=NEW.regime AND start<=NEW.end AND end>=NEW.start) THEN RAISE(ABORT,'HOT_RATE_OVERLAP') END;
END;
--> statement-breakpoint
DROP TRIGGER included_meal_limit;
--> statement-breakpoint
CREATE TRIGGER included_meal_limit BEFORE INSERT ON sales WHEN NEW.kind='Incluida' BEGIN
 SELECT CASE WHEN NEW.service IS NULL OR NEW.service NOT IN ('Desayuno','Almuerzo','Cena') OR NEW.qty<=0 OR NEW.qty<>CAST(NEW.qty AS INTEGER) OR NEW.amount<>0 OR NEW.product IS NOT NULL OR NEW.account IS NOT NULL
 THEN RAISE(ABORT, 'Comida incluida invalida') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id=NEW.booking AND b.status IN ('Confirmada','Alojado') AND b.start<=NEW.date AND NEW.date<b.end
 AND ((NEW.service='Desayuno' AND b.regime IN ('Desayuno','MP','PC')) OR b.regime='PC' OR (b.regime='MP' AND NEW.service=COALESCE((SELECT meal FROM meal_overrides WHERE booking=b.id AND date=NEW.date),b.meal))))
 THEN RAISE(ABORT, 'Esa comida no esta incluida en la estadia') END;
 -- Legacy included meals without a recognizable label consume the quota conservatively.
 SELECT CASE WHEN NEW.qty+COALESCE((SELECT SUM(s.qty) FROM sales s WHERE s.booking=NEW.booking AND s.date=NEW.date AND s.kind='Incluida'
 AND (s.service IS NULL OR s.service=NEW.service OR (NEW.service<>'Desayuno' AND s.service<>'Desayuno' AND (SELECT regime FROM bookings WHERE id=NEW.booking)='MP'))),0)>(SELECT pax FROM bookings WHERE id=NEW.booking)
 THEN RAISE(ABORT, 'La cantidad supera las comidas incluidas para ese dia') END;
END;
--> statement-breakpoint
DROP TRIGGER booking_meal_plan_conflict;
--> statement-breakpoint
CREATE TRIGGER booking_meal_plan_conflict BEFORE UPDATE OF regime,meal,end ON bookings BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM meal_plans p JOIN booking_guests g ON g.id=p.guest WHERE g.booking=OLD.id AND p.status<>'Cancelada' AND p.date<NEW.end AND ((p.service='Desayuno' AND NEW.regime IN ('Desayuno','MP','PC')) OR NEW.regime='PC' OR NEW.regime='MP' AND p.service=COALESCE((SELECT meal FROM meal_overrides WHERE booking=OLD.id AND date=p.date),NEW.meal))) THEN RAISE(ABORT,'HOT_MEAL_PLAN_CONFLICT') END;
END;
--> statement-breakpoint
DROP TRIGGER plan_insert;
--> statement-breakpoint
CREATE TRIGGER plan_insert BEFORE INSERT ON meal_plans BEGIN
 SELECT CASE WHEN date(NEW.date,'+0 days') IS NOT NEW.date OR NEW.service NOT IN ('Desayuno','Almuerzo','Cena') OR NEW.qty<1 OR NEW.qty>500 OR NEW.qty<>CAST(NEW.qty AS INTEGER) OR NEW.status<>'Pendiente' OR length(trim(NEW.customer))=0 OR length(trim(NEW.responsible))=0 THEN RAISE(ABORT,'HOT_MEAL_INVALID') END;
 SELECT CASE WHEN NEW.guest IS NOT NULL AND NOT EXISTS(SELECT 1 FROM booking_guests g JOIN bookings b ON b.id=g.booking WHERE g.id=NEW.guest AND g.position<=b.pax AND b.status IN ('Confirmada','Alojado') AND b.start<=NEW.date AND NEW.date<=b.end AND NEW.qty=1 AND NOT (NEW.date<b.end AND ((NEW.service='Desayuno' AND b.regime IN ('Desayuno','MP','PC')) OR b.regime='PC' OR b.regime='MP' AND NEW.service=COALESCE((SELECT meal FROM meal_overrides WHERE booking=b.id AND date=NEW.date),b.meal)))) THEN RAISE(ABORT,'HOT_MEAL_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM daily_closes WHERE date>=NEW.date) THEN RAISE(ABORT,'Ese dia ya esta cerrado') END;
END;
