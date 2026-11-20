CREATE TABLE `purchase_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`expense` text NOT NULL,
	`cash` text,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`digest` text NOT NULL,
	`content` text NOT NULL,
	`created` text NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	FOREIGN KEY (`expense`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash`) REFERENCES `cash_movements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_attachment_expense` ON `purchase_attachments` (`expense`);--> statement-breakpoint
CREATE TABLE `purchase_edit_guards` (
	`expense` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	FOREIGN KEY (`expense`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchase_versions` (
	`expense` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	FOREIGN KEY (`expense`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TRIGGER purchase_edit_begin BEFORE INSERT ON purchase_edit_guards BEGIN
 SELECT CASE WHEN NEW.version<>COALESCE((SELECT version FROM purchase_versions WHERE expense=NEW.expense),0) THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM purchase_documents WHERE expense=NEW.expense) THEN RAISE(ABORT,'HOT_PURCHASE_EDIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER purchase_edit_version AFTER INSERT ON purchase_edit_guards BEGIN
 INSERT INTO purchase_versions VALUES (NEW.expense,NEW.version+1) ON CONFLICT(expense) DO UPDATE SET version=excluded.version;
END;
--> statement-breakpoint
CREATE TRIGGER purchase_edit_finish BEFORE DELETE ON purchase_edit_guards BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM expenses e JOIN purchase_documents d ON d.expense=e.id WHERE e.id=OLD.expense AND (e.amount<COALESCE((SELECT SUM(-amount) FROM cash_movements WHERE kind='Pago' AND ref=e.id),0) OR (d.type='Productos' AND (e.amount<>COALESCE((SELECT SUM(amount) FROM purchase_lines WHERE expense=e.id),0) OR NOT EXISTS(SELECT 1 FROM purchase_lines WHERE expense=e.id))) OR (d.type<>'Productos' AND EXISTS(SELECT 1 FROM purchase_lines WHERE expense=e.id)))) THEN RAISE(ABORT,'HOT_PURCHASE_EDIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER expense_edit_valid BEFORE UPDATE ON expenses BEGIN
 SELECT CASE WHEN NEW.id<>OLD.id OR NOT EXISTS(SELECT 1 FROM purchase_edit_guards WHERE expense=OLD.id) THEN RAISE(ABORT,'HOT_HISTORY_IMMUTABLE') END;
 SELECT CASE WHEN NEW.amount<=0 OR NEW.amount<>CAST(NEW.amount AS INTEGER) OR NEW.amount>10000000000 OR length(trim(NEW.supplier))=0 OR length(trim(NEW.label))=0 OR NEW.area NOT IN ('Hotel','Restaurante','Compartido') OR NEW.kind NOT IN ('Fijo','Variable') OR date(NEW.date,'+0 days') IS NOT NEW.date OR (NEW.due<>'' AND date(NEW.due,'+0 days') IS NOT NEW.due) THEN RAISE(ABORT,'HOT_PURCHASE_INVALID') END;
 SELECT CASE WHEN NEW.amount<COALESCE((SELECT SUM(-amount) FROM cash_movements WHERE kind='Pago' AND ref=OLD.id),0) OR EXISTS(SELECT 1 FROM cash_movements WHERE kind='Pago' AND ref=OLD.id AND (date<NEW.date OR NEW.area<>OLD.area)) OR EXISTS(SELECT 1 FROM purchase_receipts r JOIN purchase_lines l ON l.id=r.line WHERE l.expense=OLD.id AND r.date<NEW.date) THEN RAISE(ABORT,'HOT_PURCHASE_EDIT') END;
 SELECT CASE WHEN (NEW.date<>OLD.date OR NEW.amount<>OLD.amount OR NEW.supplier<>OLD.supplier OR NEW.label<>OLD.label OR NEW.area<>OLD.area OR NEW.kind<>OLD.kind OR NEW.category<>OLD.category) AND EXISTS(SELECT 1 FROM daily_closes WHERE date>=OLD.date OR date>=NEW.date) THEN RAISE(ABORT,'HOT_PURCHASE_EDIT') END;
END;
--> statement-breakpoint
DROP TRIGGER purchase_documents_update_history;
--> statement-breakpoint
CREATE TRIGGER purchase_documents_update_history BEFORE UPDATE ON purchase_documents BEGIN
 SELECT CASE WHEN NEW.expense<>OLD.expense OR NEW.responsible<>OLD.responsible OR NOT EXISTS(SELECT 1 FROM purchase_edit_guards WHERE expense=OLD.expense) THEN RAISE(ABORT,'HOT_HISTORY_IMMUTABLE') END;
 SELECT CASE WHEN NEW.type NOT IN ('Productos','Servicio','Administrativo') OR (NEW.type<>OLD.type AND (EXISTS(SELECT 1 FROM daily_closes c JOIN expenses e ON e.id=OLD.expense WHERE c.date>=e.date) OR EXISTS(SELECT 1 FROM purchase_receipts r JOIN purchase_lines l ON l.id=r.line WHERE l.expense=OLD.expense))) THEN RAISE(ABORT,'HOT_PURCHASE_EDIT') END;
END;
--> statement-breakpoint
DROP TRIGGER purchase_lines_update_history;
--> statement-breakpoint
CREATE TRIGGER purchase_lines_update_history BEFORE UPDATE ON purchase_lines BEGIN
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.expense<>OLD.expense OR NOT EXISTS(SELECT 1 FROM purchase_edit_guards WHERE expense=OLD.expense) THEN RAISE(ABORT,'HOT_HISTORY_IMMUTABLE') END;
 SELECT CASE WHEN NEW.qty<=0 OR NEW.qty>100000 OR abs(NEW.qty*1000-round(NEW.qty*1000))>0.000001 OR NEW.cost<=0 OR NEW.cost<>CAST(NEW.cost AS INTEGER) OR NEW.amount<=0 OR NEW.amount<>ROUND(NEW.qty*NEW.cost) OR NOT EXISTS(SELECT 1 FROM products p WHERE p.id=NEW.product AND (p.category=NEW.category OR (p.category='Limpieza y amenities' AND NEW.category IN ('Limpieza','Amenities'))) AND (p.unit<>'un' OR NEW.qty=CAST(NEW.qty AS INTEGER))) THEN RAISE(ABORT,'HOT_PURCHASE_INVALID') END;
 SELECT CASE WHEN NEW.qty+0.000001<COALESCE((SELECT SUM(qty) FROM purchase_receipts WHERE line=OLD.id),0) OR (NEW.product<>OLD.product AND EXISTS(SELECT 1 FROM purchase_receipts WHERE line=OLD.id)) OR ((NEW.product<>OLD.product OR NEW.category<>OLD.category OR NEW.qty<>OLD.qty OR NEW.cost<>OLD.cost OR NEW.amount<>OLD.amount) AND EXISTS(SELECT 1 FROM daily_closes c JOIN expenses e ON e.id=OLD.expense WHERE c.date>=e.date)) THEN RAISE(ABORT,'HOT_PURCHASE_EDIT') END;
END;
--> statement-breakpoint
DROP TRIGGER purchase_lines_delete_history;
--> statement-breakpoint
CREATE TRIGGER purchase_lines_delete_history BEFORE DELETE ON purchase_lines BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM purchase_edit_guards WHERE expense=OLD.expense) OR EXISTS(SELECT 1 FROM purchase_receipts WHERE line=OLD.id) OR EXISTS(SELECT 1 FROM daily_closes c JOIN expenses e ON e.id=OLD.expense WHERE c.date>=e.date) THEN RAISE(ABORT,'HOT_PURCHASE_EDIT') END;
END;
--> statement-breakpoint
DROP TRIGGER purchase_line_valid;
--> statement-breakpoint
CREATE TRIGGER purchase_line_valid BEFORE INSERT ON purchase_lines BEGIN
 SELECT CASE WHEN NEW.qty<=0 OR NEW.qty>100000 OR abs(NEW.qty*1000-round(NEW.qty*1000))>0.000001 OR NEW.cost<=0 OR NEW.cost<>CAST(NEW.cost AS INTEGER) OR NEW.amount<=0 OR NEW.amount<>ROUND(NEW.cost*NEW.qty) OR NOT EXISTS(SELECT 1 FROM purchase_documents WHERE expense=NEW.expense AND type='Productos') OR NOT EXISTS(SELECT 1 FROM products p WHERE p.id=NEW.product AND (p.category=NEW.category OR (p.category='Limpieza y amenities' AND NEW.category IN ('Limpieza','Amenities'))) AND (p.unit<>'un' OR NEW.qty=CAST(NEW.qty AS INTEGER))) OR (EXISTS(SELECT 1 FROM audit_log WHERE action='purchaseDocument' AND json_extract(detail,'$.after.expense')=NEW.expense) AND NOT EXISTS(SELECT 1 FROM purchase_edit_guards WHERE expense=NEW.expense)) OR EXISTS(SELECT 1 FROM daily_closes c JOIN expenses e ON e.id=NEW.expense WHERE c.date>=e.date) THEN RAISE(ABORT,'HOT_PURCHASE_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER purchase_attachment_valid BEFORE INSERT ON purchase_attachments BEGIN
 SELECT CASE WHEN NEW.size<=0 OR NEW.size>1048576 OR NEW.mime NOT IN ('application/pdf','image/jpeg','image/png','image/webp') OR length(NEW.content)<>4*((NEW.size+2)/3) OR length(NEW.digest)<>64 OR length(trim(NEW.name))=0 OR length(trim(NEW.actor))=0 OR (NEW.cash IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cash_movements WHERE id=NEW.cash AND ref=NEW.expense AND kind='Pago')) OR (SELECT count(*) FROM purchase_attachments WHERE expense=NEW.expense)>=20 THEN RAISE(ABORT,'HOT_ATTACHMENT_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER purchase_attachment_immutable_update BEFORE UPDATE ON purchase_attachments BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER purchase_attachment_immutable_delete BEFORE DELETE ON purchase_attachments BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
UPDATE roles SET permissions=json_insert(permissions,'$[#]','purchases.edit'),version=version+1 WHERE id IN ('administration','manager') AND EXISTS(SELECT 1 FROM json_each(permissions) WHERE value='purchases.create') AND NOT EXISTS(SELECT 1 FROM json_each(permissions) WHERE value='purchases.edit');