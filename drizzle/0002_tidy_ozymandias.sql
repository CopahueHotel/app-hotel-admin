CREATE TABLE `operation_requests` (
	`key` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sales` ADD `service` text;
--> statement-breakpoint
UPDATE sales SET service=label WHERE kind='Incluida' AND label IN ('Desayuno','Almuerzo','Cena');
--> statement-breakpoint
CREATE TRIGGER sales_closed_date BEFORE INSERT ON sales
WHEN EXISTS (SELECT 1 FROM daily_closes WHERE date>=NEW.date)
BEGIN SELECT RAISE(ABORT, 'Ese dia ya esta cerrado'); END;
--> statement-breakpoint
CREATE TRIGGER expenses_closed_date BEFORE INSERT ON expenses
WHEN EXISTS (SELECT 1 FROM daily_closes WHERE date>=NEW.date)
BEGIN SELECT RAISE(ABORT, 'Ese dia ya esta cerrado'); END;
--> statement-breakpoint
CREATE TRIGGER stock_movements_closed_date BEFORE INSERT ON stock_movements
WHEN EXISTS (SELECT 1 FROM daily_closes WHERE date>=NEW.date)
BEGIN SELECT RAISE(ABORT, 'Ese dia ya esta cerrado'); END;
--> statement-breakpoint
CREATE TRIGGER cash_closed_date BEFORE INSERT ON cash_movements
WHEN EXISTS (SELECT 1 FROM daily_closes WHERE date>=NEW.date)
AND NOT (NEW.kind='Ajuste de cierre' AND NEW.account='Efectivo' AND NEW.id='close:' || NEW.date
 AND NEW.ref=NEW.date AND EXISTS (SELECT 1 FROM daily_closes WHERE date=NEW.date AND counted-expected=NEW.amount)
 AND NOT EXISTS (SELECT 1 FROM cash_movements WHERE id=NEW.id))
BEGIN SELECT RAISE(ABORT, 'Ese dia ya esta cerrado'); END;
--> statement-breakpoint
CREATE TRIGGER close_validate BEFORE INSERT ON daily_closes BEGIN
 SELECT CASE WHEN EXISTS (SELECT 1 FROM daily_closes WHERE date>=NEW.date)
 THEN RAISE(ABORT, 'La fecha debe ser posterior al ultimo cierre') END;
 SELECT CASE WHEN NEW.expected<>(SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE account='Efectivo' AND date<=NEW.date)
 THEN RAISE(ABORT, 'El efectivo cambio. Intenta nuevamente') END;
 SELECT CASE WHEN NEW.counted<>NEW.expected AND LENGTH(TRIM(NEW.note))=0
 THEN RAISE(ABORT, 'Explica la diferencia de caja') END;
END;
--> statement-breakpoint
CREATE TRIGGER close_adjust AFTER INSERT ON daily_closes WHEN NEW.counted<>NEW.expected BEGIN
 INSERT INTO cash_movements (id,date,account,amount,area,kind,ref,label)
 VALUES ('close:' || NEW.date,NEW.date,'Efectivo',NEW.counted-NEW.expected,'Compartido','Ajuste de cierre',NEW.date,NEW.note);
END;
--> statement-breakpoint
CREATE TRIGGER included_meal_limit BEFORE INSERT ON sales WHEN NEW.kind='Incluida' BEGIN
 SELECT CASE WHEN NEW.service IS NULL OR NEW.service NOT IN ('Desayuno','Almuerzo','Cena') OR NEW.qty<=0 OR NEW.qty<>CAST(NEW.qty AS INTEGER) OR NEW.amount<>0 OR NEW.product IS NOT NULL OR NEW.account IS NOT NULL
 THEN RAISE(ABORT, 'Comida incluida invalida') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id=NEW.booking AND b.status IN ('Confirmada','Alojado') AND b.start<=NEW.date AND NEW.date<b.end
 AND (NEW.service='Desayuno' OR b.regime='PC' OR (b.regime='MP' AND NEW.service=COALESCE((SELECT meal FROM meal_overrides WHERE booking=b.id AND date=NEW.date),b.meal))))
 THEN RAISE(ABORT, 'Esa comida no esta incluida en la estadia') END;
 -- Legacy included meals without a recognizable label consume the quota conservatively.
 SELECT CASE WHEN NEW.qty+COALESCE((SELECT SUM(s.qty) FROM sales s WHERE s.booking=NEW.booking AND s.date=NEW.date AND s.kind='Incluida'
 AND (s.service IS NULL OR s.service=NEW.service OR (NEW.service<>'Desayuno' AND s.service<>'Desayuno' AND (SELECT regime FROM bookings WHERE id=NEW.booking)='MP'))),0)>(SELECT pax FROM bookings WHERE id=NEW.booking)
 THEN RAISE(ABORT, 'La cantidad supera las comidas incluidas para ese dia') END;
END;
--> statement-breakpoint
CREATE TRIGGER meal_choice_insert BEFORE INSERT ON meal_overrides BEGIN
 SELECT CASE WHEN EXISTS (SELECT 1 FROM daily_closes WHERE date>=NEW.date)
 THEN RAISE(ABORT, 'Ese dia ya esta cerrado') END;
 SELECT CASE WHEN NEW.meal NOT IN ('Almuerzo','Cena') OR NOT EXISTS (SELECT 1 FROM bookings WHERE id=NEW.booking AND regime='MP' AND status IN ('Confirmada','Alojado') AND start<=NEW.date AND NEW.date<end)
 THEN RAISE(ABORT, 'Elegi un dia de una estadia activa con media pension') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM sales WHERE booking=NEW.booking AND date=NEW.date AND kind='Incluida' AND (service IS NULL OR (service<>'Desayuno' AND service<>NEW.meal)))
 THEN RAISE(ABORT, 'Ya se sirvio otra comida incluida ese dia') END;
END;
--> statement-breakpoint
CREATE TRIGGER meal_choice_update BEFORE UPDATE ON meal_overrides BEGIN
 SELECT CASE WHEN EXISTS (SELECT 1 FROM daily_closes WHERE date>=NEW.date)
 THEN RAISE(ABORT, 'Ese dia ya esta cerrado') END;
 SELECT CASE WHEN NEW.meal NOT IN ('Almuerzo','Cena') OR NOT EXISTS (SELECT 1 FROM bookings WHERE id=NEW.booking AND regime='MP' AND status IN ('Confirmada','Alojado') AND start<=NEW.date AND NEW.date<end)
 THEN RAISE(ABORT, 'Elegi un dia de una estadia activa con media pension') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM sales WHERE booking=NEW.booking AND date=NEW.date AND kind='Incluida' AND (service IS NULL OR (service<>'Desayuno' AND service<>NEW.meal)))
 THEN RAISE(ABORT, 'Ya se sirvio otra comida incluida ese dia') END;
END;
