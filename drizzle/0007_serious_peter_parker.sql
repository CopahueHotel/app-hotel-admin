CREATE TABLE `beverage_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`opened_at` text NOT NULL,
	`responsible` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `beverage_corrections` (
	`dispatch` text PRIMARY KEY NOT NULL,
	`sale` text NOT NULL,
	`date` text NOT NULL,
	`reason` text NOT NULL,
	`responsible` text NOT NULL,
	`observation` text NOT NULL,
	FOREIGN KEY (`dispatch`) REFERENCES `beverage_dispatches`(`sale`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `beverage_dispatches` (
	`sale` text PRIMARY KEY NOT NULL,
	`time` text NOT NULL,
	`destination` text NOT NULL,
	`table_account` text,
	`mode` text NOT NULL,
	`price` integer NOT NULL,
	`reason` text NOT NULL,
	`responsible` text NOT NULL,
	`observation` text NOT NULL,
	FOREIGN KEY (`sale`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`table_account`) REFERENCES `beverage_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `beverage_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`dispatch` text NOT NULL,
	`date` text NOT NULL,
	`qty` real NOT NULL,
	`reason` text NOT NULL,
	`responsible` text NOT NULL,
	`observation` text NOT NULL,
	FOREIGN KEY (`dispatch`) REFERENCES `beverage_dispatches`(`sale`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `beverage_settlements` (
	`table_account` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`method` text NOT NULL,
	`account` text,
	`booking` text,
	`responsible` text NOT NULL,
	`observation` text NOT NULL,
	FOREIGN KEY (`table_account`) REFERENCES `beverage_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `beverage_transfers` (
	`dispatch` text PRIMARY KEY NOT NULL,
	`sale` text NOT NULL,
	FOREIGN KEY (`dispatch`) REFERENCES `beverage_dispatches`(`sale`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_beverage_transfer_sale` ON `beverage_transfers` (`sale`);--> statement-breakpoint
CREATE TABLE `purchase_documents` (
	`expense` text PRIMARY KEY NOT NULL,
	`invoice` text NOT NULL,
	`type` text NOT NULL,
	`responsible` text NOT NULL,
	`observation` text NOT NULL,
	FOREIGN KEY (`expense`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchase_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`expense` text NOT NULL,
	`product` text NOT NULL,
	`category` text NOT NULL,
	`qty` real NOT NULL,
	`cost` integer NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`expense`) REFERENCES `purchase_documents`(`expense`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_lines_expense` ON `purchase_lines` (`expense`);--> statement-breakpoint
CREATE TABLE `purchase_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`line` text NOT NULL,
	`date` text NOT NULL,
	`qty` real NOT NULL,
	`responsible` text NOT NULL,
	`observation` text NOT NULL,
	FOREIGN KEY (`line`) REFERENCES `purchase_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `supplier_payment_details` (
	`cash` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`responsible` text NOT NULL,
	FOREIGN KEY (`cash`) REFERENCES `cash_movements`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER beverage_dispatch_valid BEFORE INSERT ON beverage_dispatches BEGIN
 SELECT CASE WHEN LENGTH(TRIM(NEW.responsible))=0 OR NEW.destination NOT IN ('Mesa','Estadía','Cortesía','Interno') OR NEW.mode NOT IN ('Pendiente','Inmediato','Estadía','Sin cobro') OR NEW.price<0 OR NEW.price<>CAST(NEW.price AS INTEGER) THEN RAISE(ABORT,'HOT_DISPATCH_INVALID') END;
 SELECT CASE WHEN (NEW.destination='Mesa' AND NEW.table_account IS NULL) OR (NEW.destination<>'Mesa' AND NEW.table_account IS NOT NULL) OR EXISTS(SELECT 1 FROM beverage_settlements WHERE table_account=NEW.table_account) THEN RAISE(ABORT,'HOT_TABLE_CLOSED') END;
 SELECT CASE WHEN NEW.mode='Pendiente' AND (NEW.table_account IS NULL OR (SELECT booking FROM sales WHERE id=NEW.sale) IS NOT NULL) THEN RAISE(ABORT,'HOT_DISPATCH_INVALID') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sales s JOIN products p ON p.id=s.product WHERE s.id=NEW.sale AND p.category='Bebidas' AND s.qty>0 AND (p.unit<>'un' OR s.qty=CAST(s.qty AS INTEGER)) AND s.amount=ROUND(NEW.price*s.qty) AND ((NEW.mode='Inmediato' AND s.account IN ('Efectivo','Banco','Billetera')) OR (NEW.mode<>'Inmediato' AND s.account IS NULL)) AND (NEW.mode<>'Estadía' OR s.booking IS NOT NULL) AND (NEW.destination<>'Estadía' OR s.booking IS NOT NULL)) THEN RAISE(ABORT,'HOT_DISPATCH_INVALID') END;
 SELECT CASE WHEN (NEW.destination IN ('Cortesía','Interno') AND (NEW.mode<>'Sin cobro' OR NEW.price<>0 OR LENGTH(TRIM(NEW.reason))=0)) OR (NEW.destination NOT IN ('Cortesía','Interno') AND (NEW.mode='Sin cobro' OR NEW.price<=0)) THEN RAISE(ABORT,'HOT_DISPATCH_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER beverage_settle_valid BEFORE INSERT ON beverage_settlements BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM daily_closes WHERE date>=NEW.date) THEN RAISE(ABORT,'Ese dia ya esta cerrado') END;
 SELECT CASE WHEN LENGTH(TRIM(NEW.responsible))=0 OR (NEW.method='Cobro' AND (NEW.account NOT IN ('Efectivo','Banco','Billetera') OR NEW.account IS NULL OR NEW.booking IS NOT NULL)) OR (NEW.method='Estadía' AND (NEW.account IS NOT NULL OR NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking AND status IN ('Confirmada','Alojado') AND start<=NEW.date AND end>=NEW.date))) OR NEW.method NOT IN ('Cobro','Estadía') THEN RAISE(ABORT,'HOT_SETTLE_INVALID') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM beverage_dispatches d JOIN sales s ON s.id=d.sale WHERE d.table_account=NEW.table_account AND s.date>NEW.date) THEN RAISE(ABORT,'HOT_SETTLE_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER beverage_return_valid BEFORE INSERT ON beverage_returns BEGIN
 SELECT CASE WHEN NEW.qty<=0 OR LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.responsible))=0 OR NOT EXISTS(SELECT 1 FROM sales s JOIN beverage_dispatches d ON d.sale=s.id JOIN products p ON p.id=s.product WHERE s.id=NEW.dispatch AND NEW.date>=s.date AND (p.unit<>'un' OR NEW.qty=CAST(NEW.qty AS INTEGER))) OR NEW.qty+COALESCE((SELECT SUM(qty) FROM beverage_returns WHERE dispatch=NEW.dispatch),0)>(SELECT qty FROM sales WHERE id=NEW.dispatch)+0.000001 THEN RAISE(ABORT,'HOT_RETURN_LIMIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER beverage_return_stock AFTER INSERT ON beverage_returns BEGIN
 INSERT INTO stock_movements(id,date,product,qty,reason,ref) SELECT 'return:'||NEW.id,NEW.date,product,NEW.qty,'Devolucion fisica de bebida',NEW.dispatch FROM sales WHERE id=NEW.dispatch;
END;
--> statement-breakpoint
CREATE TRIGGER beverage_correction_valid BEFORE INSERT ON beverage_corrections BEGIN
 SELECT CASE WHEN LENGTH(TRIM(NEW.reason))=0 OR LENGTH(TRIM(NEW.responsible))=0 OR NOT EXISTS(SELECT 1 FROM beverage_dispatches WHERE sale=NEW.dispatch) OR EXISTS(SELECT 1 FROM sales s WHERE s.id=NEW.dispatch AND (s.date>NEW.date OR EXISTS(SELECT 1 FROM daily_closes WHERE date>=s.date) OR s.account IS NOT NULL OR EXISTS(SELECT 1 FROM cash_movements WHERE (ref=s.id AND kind='Venta') OR (ref=s.booking AND kind='Cobro')))) OR EXISTS(SELECT 1 FROM beverage_transfers WHERE dispatch=NEW.dispatch) OR EXISTS(SELECT 1 FROM beverage_dispatches d JOIN beverage_settlements t ON t.table_account=d.table_account WHERE d.sale=NEW.dispatch) THEN RAISE(ABORT,'HOT_BEVERAGE_REGULARIZE') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sales original JOIN sales correction ON correction.id=NEW.sale WHERE original.id=NEW.dispatch AND correction.booking IS original.booking AND correction.amount=-original.amount AND correction.qty=0 AND correction.product IS NULL AND correction.account IS NULL AND correction.date=NEW.date AND correction.kind='Corrección bebida') THEN RAISE(ABORT,'HOT_DISPATCH_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER beverage_transfer_valid BEFORE INSERT ON beverage_transfers BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM beverage_dispatches d JOIN beverage_settlements t ON t.table_account=d.table_account JOIN sales original ON original.id=d.sale JOIN sales charge ON charge.id=NEW.sale WHERE d.sale=NEW.dispatch AND d.mode='Pendiente' AND t.method='Estadía' AND charge.booking=t.booking AND charge.date=t.date AND charge.amount=original.amount AND charge.qty=0 AND charge.product IS NULL AND charge.account IS NULL AND charge.kind='Cargo de bebida' AND NOT EXISTS(SELECT 1 FROM beverage_corrections WHERE dispatch=d.sale)) THEN RAISE(ABORT,'HOT_SETTLE_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER beverage_cash_valid BEFORE INSERT ON cash_movements WHEN NEW.kind='Venta' AND EXISTS(SELECT 1 FROM beverage_dispatches WHERE sale=NEW.ref) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM beverage_dispatches d JOIN sales s ON s.id=d.sale WHERE s.id=NEW.ref AND s.amount=NEW.amount AND NOT EXISTS(SELECT 1 FROM cash_movements WHERE ref=NEW.ref AND kind='Venta') AND NOT EXISTS(SELECT 1 FROM beverage_corrections WHERE dispatch=NEW.ref) AND ((d.mode='Inmediato' AND s.account=NEW.account AND s.date=NEW.date) OR (d.mode='Pendiente' AND EXISTS(SELECT 1 FROM beverage_settlements t WHERE t.table_account=d.table_account AND t.method='Cobro' AND t.date=NEW.date AND t.account=NEW.account)))) THEN RAISE(ABORT,'HOT_SETTLE_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER purchase_document_valid BEFORE INSERT ON purchase_documents BEGIN
 SELECT CASE WHEN NEW.type NOT IN ('Productos','Servicio','Administrativo') OR LENGTH(TRIM(NEW.responsible))=0 OR NOT EXISTS(SELECT 1 FROM expenses WHERE id=NEW.expense AND amount>0 AND amount=CAST(amount AS INTEGER) AND (due='' OR date(due,'+0 days') IS due)) THEN RAISE(ABORT,'HOT_PURCHASE_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER purchase_line_valid BEFORE INSERT ON purchase_lines BEGIN
 SELECT CASE WHEN NEW.qty<=0 OR NEW.cost<=0 OR NEW.cost<>CAST(NEW.cost AS INTEGER) OR NEW.amount<=0 OR NEW.amount<>ROUND(NEW.cost*NEW.qty) OR NOT EXISTS(SELECT 1 FROM purchase_documents WHERE expense=NEW.expense AND type='Productos') OR NOT EXISTS(SELECT 1 FROM products p WHERE p.id=NEW.product AND (p.category=NEW.category OR (p.category='Limpieza y amenities' AND NEW.category IN ('Limpieza','Amenities'))) AND (p.unit<>'un' OR NEW.qty=CAST(NEW.qty AS INTEGER))) OR EXISTS(SELECT 1 FROM audit_log WHERE action='purchaseDocument' AND json_extract(detail,'$.after.expense')=NEW.expense) THEN RAISE(ABORT,'HOT_PURCHASE_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER purchase_receipt_valid BEFORE INSERT ON purchase_receipts BEGIN
 SELECT CASE WHEN NEW.qty<=0 OR LENGTH(TRIM(NEW.responsible))=0 OR NOT EXISTS(SELECT 1 FROM purchase_lines l JOIN expenses e ON e.id=l.expense JOIN products p ON p.id=l.product WHERE l.id=NEW.line AND NEW.date>=e.date AND (p.unit<>'un' OR NEW.qty=CAST(NEW.qty AS INTEGER))) OR NEW.qty+COALESCE((SELECT SUM(qty) FROM purchase_receipts WHERE line=NEW.line),0)>(SELECT qty FROM purchase_lines WHERE id=NEW.line)+0.000001 THEN RAISE(ABORT,'HOT_RECEIPT_LIMIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER purchase_receipt_stock AFTER INSERT ON purchase_receipts BEGIN
 INSERT INTO stock_movements(id,date,product,qty,reason,ref) SELECT 'receipt:'||NEW.id,NEW.date,product,NEW.qty,'Recepcion de compra',expense FROM purchase_lines WHERE id=NEW.line;
END;
--> statement-breakpoint
CREATE TRIGGER supplier_payment_detail_valid BEFORE INSERT ON supplier_payment_details WHEN LENGTH(TRIM(NEW.responsible))=0 OR NOT EXISTS(SELECT 1 FROM cash_movements WHERE id=NEW.cash AND kind='Pago' AND amount<0) BEGIN SELECT RAISE(ABORT,'HOT_PURCHASE_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER supply_batch_complete BEFORE INSERT ON audit_log BEGIN
 SELECT CASE WHEN NEW.action='beverageSettle' AND EXISTS(SELECT 1 FROM beverage_dispatches d JOIN sales s ON s.id=d.sale JOIN beverage_settlements t ON t.table_account=d.table_account WHERE d.table_account=json_extract(NEW.detail,'$.input.tableAccount') AND d.mode='Pendiente' AND NOT EXISTS(SELECT 1 FROM beverage_corrections WHERE dispatch=d.sale) AND ((t.method='Cobro' AND NOT EXISTS(SELECT 1 FROM cash_movements WHERE ref=s.id AND kind='Venta' AND amount=s.amount AND date=t.date AND account=t.account)) OR (t.method='Estadía' AND NOT EXISTS(SELECT 1 FROM beverage_transfers WHERE dispatch=d.sale)))) THEN RAISE(ABORT,'HOT_TABLE_CHANGED') END;
 SELECT CASE WHEN NEW.action='purchaseDocument' AND EXISTS(SELECT 1 FROM purchase_documents d JOIN expenses e ON e.id=d.expense WHERE e.id=json_extract(NEW.detail,'$.after.expense') AND d.type='Productos' AND e.amount<>COALESCE((SELECT SUM(amount) FROM purchase_lines WHERE expense=e.id),0)) THEN RAISE(ABORT,'HOT_PURCHASE_INVALID') END;
END;

--> statement-breakpoint
CREATE TRIGGER beverage_accounts_update_history BEFORE UPDATE ON beverage_accounts BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER beverage_accounts_delete_history BEFORE DELETE ON beverage_accounts BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER beverage_dispatches_update_history BEFORE UPDATE ON beverage_dispatches BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER beverage_dispatches_delete_history BEFORE DELETE ON beverage_dispatches BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER beverage_settlements_update_history BEFORE UPDATE ON beverage_settlements BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER beverage_settlements_delete_history BEFORE DELETE ON beverage_settlements BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER beverage_transfers_update_history BEFORE UPDATE ON beverage_transfers BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER beverage_transfers_delete_history BEFORE DELETE ON beverage_transfers BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER beverage_returns_update_history BEFORE UPDATE ON beverage_returns BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER beverage_returns_delete_history BEFORE DELETE ON beverage_returns BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER beverage_corrections_update_history BEFORE UPDATE ON beverage_corrections BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER beverage_corrections_delete_history BEFORE DELETE ON beverage_corrections BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER purchase_documents_update_history BEFORE UPDATE ON purchase_documents BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER purchase_documents_delete_history BEFORE DELETE ON purchase_documents BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER purchase_lines_update_history BEFORE UPDATE ON purchase_lines BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER purchase_lines_delete_history BEFORE DELETE ON purchase_lines BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER purchase_receipts_update_history BEFORE UPDATE ON purchase_receipts BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER purchase_receipts_delete_history BEFORE DELETE ON purchase_receipts BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER supplier_payment_details_update_history BEFORE UPDATE ON supplier_payment_details BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER supplier_payment_details_delete_history BEFORE DELETE ON supplier_payment_details BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
