CREATE TABLE `cash_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`movements` text NOT NULL,
	`usd_cents` integer NOT NULL,
	`rate` integer NOT NULL,
	`change_ars` integer NOT NULL,
	`actor` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usd_closes` (
	`date` text PRIMARY KEY NOT NULL,
	`expected` integer NOT NULL,
	`counted` integer NOT NULL,
	`note` text NOT NULL,
	FOREIGN KEY (`date`) REFERENCES `daily_closes`(`date`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER cash_receipt_validate BEFORE INSERT ON cash_receipts BEGIN
 SELECT CASE WHEN json_valid(NEW.movements)=0 THEN RAISE(ABORT,'HOT_USD_INVALID') END;
 SELECT CASE WHEN json_type(NEW.movements)<>'array' OR json_array_length(NEW.movements)<1 OR json_array_length(NEW.movements)>1000 OR (SELECT COUNT(DISTINCT value) FROM json_each(NEW.movements))<>json_array_length(NEW.movements) OR EXISTS(SELECT 1 FROM json_each(NEW.movements) WHERE type<>'text') THEN RAISE(ABORT,'HOT_USD_INVALID') END;
 SELECT CASE WHEN NEW.usd_cents<>CAST(NEW.usd_cents AS INTEGER) OR NEW.usd_cents<=0 OR NEW.usd_cents>100000000 OR NEW.rate<>CAST(NEW.rate AS INTEGER) OR NEW.rate<=0 OR NEW.rate>10000000000 OR NEW.change_ars<>CAST(NEW.change_ars AS INTEGER) OR NEW.change_ars<0 OR LENGTH(TRIM(NEW.actor))=0 OR date(NEW.date,'+0 days') IS NOT NEW.date THEN RAISE(ABORT,'HOT_USD_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM daily_closes WHERE date>=NEW.date) THEN RAISE(ABORT,'Ese dia ya esta cerrado') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.movements) j WHERE NOT EXISTS(SELECT 1 FROM cash_movements c WHERE c.id=j.value AND c.account='Efectivo' AND c.date=NEW.date AND c.kind IN ('Cobro','Venta') AND c.amount>0)) OR EXISTS(SELECT 1 FROM cash_receipts r,json_each(r.movements) old,json_each(NEW.movements) current WHERE old.value=current.value) THEN RAISE(ABORT,'HOT_USD_INVALID') END;
 SELECT CASE WHEN (NEW.usd_cents*NEW.rate+5000)/10000>10000000000 OR (SELECT SUM(c.amount) FROM cash_movements c JOIN json_each(NEW.movements) j ON j.value=c.id)<>(NEW.usd_cents*NEW.rate+5000)/10000-NEW.change_ars THEN RAISE(ABORT,'HOT_USD_INVALID') END;
 SELECT CASE WHEN NEW.change_ars>0 AND NEW.change_ars>(SELECT COALESCE(SUM(c.amount),0) FROM cash_movements c WHERE c.account='Efectivo' AND c.date<=NEW.date AND c.id NOT IN (SELECT value FROM json_each(NEW.movements)) AND NOT EXISTS(SELECT 1 FROM cash_receipts r,json_each(r.movements) j WHERE j.value=c.id))-(SELECT COALESCE(SUM(change_ars),0) FROM cash_receipts WHERE date<=NEW.date) THEN RAISE(ABORT,'HOT_USD_CHANGE') END;
END;
--> statement-breakpoint
CREATE TRIGGER cash_receipt_update BEFORE UPDATE ON cash_receipts BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER cash_receipt_delete BEFORE DELETE ON cash_receipts BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER usd_cash_update BEFORE UPDATE ON cash_movements WHEN EXISTS(SELECT 1 FROM cash_receipts r,json_each(r.movements) j WHERE j.value=OLD.id) BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER usd_cash_delete BEFORE DELETE ON cash_movements WHEN EXISTS(SELECT 1 FROM cash_receipts r,json_each(r.movements) j WHERE j.value=OLD.id) BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
DROP TRIGGER close_validate;
--> statement-breakpoint
CREATE TRIGGER close_validate BEFORE INSERT ON daily_closes BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM daily_closes WHERE date>=NEW.date) THEN RAISE(ABORT,'La fecha debe ser posterior al ultimo cierre') END;
 SELECT CASE WHEN NEW.expected<>(SELECT COALESCE(SUM(amount),0) FROM cash_movements c WHERE account='Efectivo' AND date<=NEW.date AND NOT EXISTS(SELECT 1 FROM cash_receipts r,json_each(r.movements) j WHERE j.value=c.id))-(SELECT COALESCE(SUM(change_ars),0) FROM cash_receipts WHERE date<=NEW.date) THEN RAISE(ABORT,'El efectivo cambio. Intenta nuevamente') END;
 SELECT CASE WHEN NEW.counted<>NEW.expected AND LENGTH(TRIM(NEW.note))=0 THEN RAISE(ABORT,'Explica la diferencia de caja') END;
END;
--> statement-breakpoint
CREATE TRIGGER usd_close_validate BEFORE INSERT ON usd_closes BEGIN
 SELECT CASE WHEN NEW.date<>(SELECT MAX(date) FROM daily_closes) OR NEW.expected<>CAST(NEW.expected AS INTEGER) OR NEW.counted<>CAST(NEW.counted AS INTEGER) OR NEW.counted<0 OR NEW.expected<>(SELECT COALESCE(SUM(usd_cents),0) FROM cash_receipts WHERE date<=NEW.date)+(SELECT COALESCE(SUM(counted-expected),0) FROM usd_closes WHERE date<NEW.date) THEN RAISE(ABORT,'HOT_USD_CLOSE') END;
 SELECT CASE WHEN NEW.counted<>NEW.expected AND LENGTH(TRIM(NEW.note))=0 THEN RAISE(ABORT,'Explica la diferencia de caja') END;
END;
--> statement-breakpoint
CREATE TRIGGER usd_close_update BEFORE UPDATE ON usd_closes BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER usd_close_delete BEFORE DELETE ON usd_closes BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
