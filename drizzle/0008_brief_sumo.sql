CREATE TABLE `supplier_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier` text NOT NULL,
	`source_key` text,
	`original_date` text,
	`date` text,
	`deadline` text,
	`status` text NOT NULL,
	`expense` text,
	`observation` text NOT NULL,
	`responsible` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`supplier`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_delivery_source` ON `supplier_deliveries` (`source_key`);--> statement-breakpoint
CREATE INDEX `idx_delivery_date` ON `supplier_deliveries` (`date`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`contact` text NOT NULL,
	`active` integer NOT NULL,
	`responsible` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `menu_actuals` (
	`id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`dishes` text NOT NULL,
	`alternatives` text NOT NULL,
	`conditions` text NOT NULL,
	`observation` text NOT NULL,
	`planned_snapshot` text NOT NULL,
	`responsible` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`plan`) REFERENCES `menu_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_actual_menu_plan` ON `menu_actuals` (`plan`);--> statement-breakpoint
CREATE TABLE `menu_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`service` text NOT NULL,
	`dishes` text NOT NULL,
	`alternatives` text NOT NULL,
	`conditions` text NOT NULL,
	`observation` text NOT NULL,
	`status` text NOT NULL,
	`responsible` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_menu_day_service` ON `menu_plans` (`date`,`service`);--> statement-breakpoint
CREATE TABLE `staff_events` (
	`id` text PRIMARY KEY NOT NULL,
	`employee` text NOT NULL,
	`kind` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`status` text NOT NULL,
	`attendance` text NOT NULL,
	`actual_start` text,
	`actual_end` text,
	`conflict_ack` integer NOT NULL,
	`observation` text NOT NULL,
	`responsible` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`employee`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_staff_employee_period` ON `staff_events` (`employee`,`start`,`end`);--> statement-breakpoint
CREATE TABLE `staff_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`employee` text NOT NULL,
	`event` text,
	`date` text NOT NULL,
	`author` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`followup` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`employee`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event`) REFERENCES `staff_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text NOT NULL,
	`rubros` text NOT NULL,
	`observation` text NOT NULL,
	`frequency` text NOT NULL,
	`schedule` text NOT NULL,
	`lead_days` integer,
	`responsible` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER suppliers_version BEFORE UPDATE ON suppliers WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version+1 BEGIN SELECT RAISE(ABORT,'HOT_VERSION'); END;

--> statement-breakpoint
CREATE TRIGGER suppliers_history BEFORE DELETE ON suppliers BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER supplier_deliveries_version BEFORE UPDATE ON supplier_deliveries WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version+1 BEGIN SELECT RAISE(ABORT,'HOT_VERSION'); END;

--> statement-breakpoint
CREATE TRIGGER supplier_deliveries_history BEFORE DELETE ON supplier_deliveries BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER menu_plans_version BEFORE UPDATE ON menu_plans WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version+1 BEGIN SELECT RAISE(ABORT,'HOT_VERSION'); END;

--> statement-breakpoint
CREATE TRIGGER menu_plans_history BEFORE DELETE ON menu_plans BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER menu_actuals_version BEFORE UPDATE ON menu_actuals WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version+1 BEGIN SELECT RAISE(ABORT,'HOT_VERSION'); END;

--> statement-breakpoint
CREATE TRIGGER menu_actuals_history BEFORE DELETE ON menu_actuals BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER employees_version BEFORE UPDATE ON employees WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version+1 BEGIN SELECT RAISE(ABORT,'HOT_VERSION'); END;

--> statement-breakpoint
CREATE TRIGGER employees_history BEFORE DELETE ON employees BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER staff_events_version BEFORE UPDATE ON staff_events WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version+1 BEGIN SELECT RAISE(ABORT,'HOT_VERSION'); END;

--> statement-breakpoint
CREATE TRIGGER staff_events_history BEFORE DELETE ON staff_events BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER staff_reports_version BEFORE UPDATE ON staff_reports WHEN NEW.id<>OLD.id OR NEW.version<>OLD.version+1 BEGIN SELECT RAISE(ABORT,'HOT_VERSION'); END;

--> statement-breakpoint
CREATE TRIGGER staff_reports_history BEFORE DELETE ON staff_reports BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER suppliers_valid_insert BEFORE INSERT ON suppliers BEGIN
 SELECT CASE WHEN LENGTH(TRIM(NEW.name))=0 OR LENGTH(TRIM(NEW.responsible))=0 OR NOT json_valid(NEW.rubros) OR json_array_length(NEW.rubros)<1 OR NOT json_valid(NEW.schedule) OR NEW.frequency NOT IN ('Sin frecuencia','Semanal','Cada N días','Fechas puntuales') OR (NEW.lead_days IS NOT NULL AND (NEW.lead_days<0 OR NEW.lead_days>365 OR NEW.lead_days<>CAST(NEW.lead_days AS INTEGER))) THEN RAISE(ABORT,'HOT_PLANNING_INVALID') END;
 END;

--> statement-breakpoint
CREATE TRIGGER deliveries_valid_insert BEFORE INSERT ON supplier_deliveries BEGIN
 SELECT CASE WHEN LENGTH(TRIM(NEW.responsible))=0 OR NEW.status NOT IN ('Prevista','Confirmada','Realizada','Reprogramada','Cancelada') OR (NEW.date IS NOT NULL AND date(NEW.date,'+0 days') IS NOT NEW.date) OR (NEW.deadline IS NOT NULL AND (date(NEW.deadline,'+0 days') IS NOT NEW.deadline OR (NEW.date IS NOT NULL AND NEW.deadline>NEW.date))) OR (NEW.date IS NULL AND NEW.status IN ('Confirmada','Realizada','Reprogramada')) OR (NEW.status='Reprogramada' AND LENGTH(TRIM(NEW.observation))=0) THEN RAISE(ABORT,'HOT_PLANNING_INVALID') END;
 END;

--> statement-breakpoint
CREATE TRIGGER menus_valid_insert BEFORE INSERT ON menu_plans WHEN date(NEW.date,'+0 days') IS NOT NEW.date OR NEW.service NOT IN ('Desayuno','Almuerzo','Cena') OR NEW.status NOT IN ('Borrador','Confirmado') OR NEW.id<>NEW.date||':'||NEW.service OR LENGTH(TRIM(NEW.dishes))=0 OR LENGTH(TRIM(NEW.responsible))=0 BEGIN SELECT RAISE(ABORT,'HOT_PLANNING_INVALID'); END;

--> statement-breakpoint
CREATE TRIGGER menu_actual_valid_insert BEFORE INSERT ON menu_actuals WHEN LENGTH(TRIM(NEW.dishes))=0 OR LENGTH(TRIM(NEW.responsible))=0 OR LENGTH(TRIM(NEW.observation))=0 OR NOT json_valid(NEW.planned_snapshot) OR json_extract(NEW.planned_snapshot,'$.id')<>NEW.plan BEGIN SELECT RAISE(ABORT,'HOT_PLANNING_INVALID'); END;

--> statement-breakpoint
CREATE TRIGGER employee_valid_insert BEFORE INSERT ON employees WHEN LENGTH(TRIM(NEW.name))=0 OR LENGTH(TRIM(NEW.role))=0 OR LENGTH(TRIM(NEW.responsible))=0 OR NEW.active NOT IN (0,1) BEGIN SELECT RAISE(ABORT,'HOT_PLANNING_INVALID'); END;

--> statement-breakpoint
CREATE TRIGGER staff_event_valid_insert BEFORE INSERT ON staff_events BEGIN
 SELECT CASE WHEN LENGTH(TRIM(NEW.responsible))=0 OR NEW.start>=NEW.end OR LENGTH(NEW.start)<>16 OR LENGTH(NEW.end)<>16 OR datetime(NEW.start) IS NULL OR datetime(NEW.end) IS NULL OR date(substr(NEW.start,1,10),'+0 days') IS NOT substr(NEW.start,1,10) OR date(substr(NEW.end,1,10),'+0 days') IS NOT substr(NEW.end,1,10) OR julianday(NEW.end)-julianday(NEW.start)>366 OR (NEW.kind='Turno' AND julianday(NEW.end)-julianday(NEW.start)>1) OR NEW.kind NOT IN ('Turno','Franco','Vacaciones','Otra ausencia') OR NEW.status NOT IN ('Programado','Cancelado') OR NEW.attendance NOT IN ('Sin registrar','Asistencia registrada','Ausente') OR NEW.conflict_ack NOT IN (0,1) THEN RAISE(ABORT,'HOT_PLANNING_INVALID') END;
 SELECT CASE WHEN (NEW.attendance='Asistencia registrada' AND (NEW.kind<>'Turno' OR NEW.status='Cancelado' OR NEW.actual_start IS NULL OR NEW.actual_end IS NULL OR datetime(NEW.actual_start) IS NULL OR datetime(NEW.actual_end) IS NULL OR NEW.actual_start>=NEW.actual_end OR julianday(NEW.actual_end)-julianday(NEW.actual_start)>1)) OR (NEW.attendance<>'Asistencia registrada' AND (NEW.actual_start IS NOT NULL OR NEW.actual_end IS NOT NULL)) OR (NEW.attendance='Ausente' AND NEW.kind<>'Turno') THEN RAISE(ABORT,'HOT_PLANNING_INVALID') END;
 END;

--> statement-breakpoint
CREATE TRIGGER staff_report_valid_insert BEFORE INSERT ON staff_reports BEGIN
 SELECT CASE WHEN date(NEW.date,'+0 days') IS NOT NEW.date OR LENGTH(TRIM(NEW.author))=0 OR LENGTH(TRIM(NEW.description))=0 OR NEW.type NOT IN ('Tarea','Novedad','Incidencia','Seguimiento') OR NEW.status NOT IN ('Pendiente','Resuelto') OR (NEW.status='Resuelto' AND LENGTH(TRIM(NEW.followup))=0) OR (NEW.event IS NOT NULL AND NOT EXISTS(SELECT 1 FROM staff_events WHERE id=NEW.event AND employee=NEW.employee)) THEN RAISE(ABORT,'HOT_PLANNING_INVALID') END;
 END;

--> statement-breakpoint
CREATE TRIGGER suppliers_valid_update BEFORE UPDATE ON suppliers BEGIN
 SELECT CASE WHEN LENGTH(TRIM(NEW.name))=0 OR LENGTH(TRIM(NEW.responsible))=0 OR NOT json_valid(NEW.rubros) OR json_array_length(NEW.rubros)<1 OR NOT json_valid(NEW.schedule) OR NEW.frequency NOT IN ('Sin frecuencia','Semanal','Cada N días','Fechas puntuales') OR (NEW.lead_days IS NOT NULL AND (NEW.lead_days<0 OR NEW.lead_days>365 OR NEW.lead_days<>CAST(NEW.lead_days AS INTEGER))) THEN RAISE(ABORT,'HOT_PLANNING_INVALID') END;
 END;

--> statement-breakpoint
CREATE TRIGGER deliveries_valid_update BEFORE UPDATE ON supplier_deliveries BEGIN
 SELECT CASE WHEN LENGTH(TRIM(NEW.responsible))=0 OR NEW.status NOT IN ('Prevista','Confirmada','Realizada','Reprogramada','Cancelada') OR (NEW.date IS NOT NULL AND date(NEW.date,'+0 days') IS NOT NEW.date) OR (NEW.deadline IS NOT NULL AND (NEW.date IS NULL OR date(NEW.deadline,'+0 days') IS NOT NEW.deadline OR NEW.deadline>NEW.date)) OR (NEW.date IS NULL AND NEW.status IN ('Confirmada','Realizada','Reprogramada')) OR (NEW.status='Reprogramada' AND LENGTH(TRIM(NEW.observation))=0) THEN RAISE(ABORT,'HOT_PLANNING_INVALID') END;
 END;

--> statement-breakpoint
CREATE TRIGGER menus_valid_update BEFORE UPDATE ON menu_plans WHEN date(NEW.date,'+0 days') IS NOT NEW.date OR NEW.service NOT IN ('Desayuno','Almuerzo','Cena') OR NEW.status NOT IN ('Borrador','Confirmado') OR NEW.id<>NEW.date||':'||NEW.service OR LENGTH(TRIM(NEW.dishes))=0 OR LENGTH(TRIM(NEW.responsible))=0 BEGIN SELECT RAISE(ABORT,'HOT_PLANNING_INVALID'); END;

--> statement-breakpoint
CREATE TRIGGER menu_actual_valid_update BEFORE UPDATE ON menu_actuals WHEN LENGTH(TRIM(NEW.dishes))=0 OR LENGTH(TRIM(NEW.responsible))=0 OR LENGTH(TRIM(NEW.observation))=0 OR NOT json_valid(NEW.planned_snapshot) OR json_extract(NEW.planned_snapshot,'$.id')<>NEW.plan BEGIN SELECT RAISE(ABORT,'HOT_PLANNING_INVALID'); END;

--> statement-breakpoint
CREATE TRIGGER employee_valid_update BEFORE UPDATE ON employees WHEN LENGTH(TRIM(NEW.name))=0 OR LENGTH(TRIM(NEW.role))=0 OR LENGTH(TRIM(NEW.responsible))=0 OR NEW.active NOT IN (0,1) BEGIN SELECT RAISE(ABORT,'HOT_PLANNING_INVALID'); END;

--> statement-breakpoint
CREATE TRIGGER staff_event_valid_update BEFORE UPDATE ON staff_events BEGIN
 SELECT CASE WHEN LENGTH(TRIM(NEW.responsible))=0 OR NEW.start>=NEW.end OR LENGTH(NEW.start)<>16 OR LENGTH(NEW.end)<>16 OR datetime(NEW.start) IS NULL OR datetime(NEW.end) IS NULL OR date(substr(NEW.start,1,10),'+0 days') IS NOT substr(NEW.start,1,10) OR date(substr(NEW.end,1,10),'+0 days') IS NOT substr(NEW.end,1,10) OR julianday(NEW.end)-julianday(NEW.start)>366 OR (NEW.kind='Turno' AND julianday(NEW.end)-julianday(NEW.start)>1) OR NEW.kind NOT IN ('Turno','Franco','Vacaciones','Otra ausencia') OR NEW.status NOT IN ('Programado','Cancelado') OR NEW.attendance NOT IN ('Sin registrar','Asistencia registrada','Ausente') OR NEW.conflict_ack NOT IN (0,1) THEN RAISE(ABORT,'HOT_PLANNING_INVALID') END;
 SELECT CASE WHEN (NEW.attendance='Asistencia registrada' AND (NEW.kind<>'Turno' OR NEW.status='Cancelado' OR NEW.actual_start IS NULL OR NEW.actual_end IS NULL OR datetime(NEW.actual_start) IS NULL OR datetime(NEW.actual_end) IS NULL OR NEW.actual_start>=NEW.actual_end OR julianday(NEW.actual_end)-julianday(NEW.actual_start)>1)) OR (NEW.attendance<>'Asistencia registrada' AND (NEW.actual_start IS NOT NULL OR NEW.actual_end IS NOT NULL)) OR (NEW.attendance='Ausente' AND NEW.kind<>'Turno') THEN RAISE(ABORT,'HOT_PLANNING_INVALID') END;
 END;

--> statement-breakpoint
CREATE TRIGGER staff_report_valid_update BEFORE UPDATE ON staff_reports BEGIN
 SELECT CASE WHEN date(NEW.date,'+0 days') IS NOT NEW.date OR LENGTH(TRIM(NEW.author))=0 OR LENGTH(TRIM(NEW.description))=0 OR NEW.type NOT IN ('Tarea','Novedad','Incidencia','Seguimiento') OR NEW.status NOT IN ('Pendiente','Resuelto') OR (NEW.status='Resuelto' AND LENGTH(TRIM(NEW.followup))=0) OR (NEW.event IS NOT NULL AND NOT EXISTS(SELECT 1 FROM staff_events WHERE id=NEW.event AND employee=NEW.employee)) THEN RAISE(ABORT,'HOT_PLANNING_INVALID') END;
 END;

--> statement-breakpoint
CREATE TRIGGER delivery_edit_history BEFORE UPDATE ON supplier_deliveries BEGIN
 SELECT CASE WHEN OLD.status IN ('Realizada','Cancelada') THEN RAISE(ABORT,'HOT_DELIVERY_TERMINAL') END;
 SELECT CASE WHEN NEW.supplier<>OLD.supplier OR NEW.source_key IS NOT OLD.source_key OR NEW.original_date IS NOT OLD.original_date OR (OLD.date IS NOT NULL AND NEW.date IS NOT OLD.date AND NEW.status NOT IN ('Reprogramada','Cancelada')) THEN RAISE(ABORT,'HOT_PLANNING_INVALID') END;
 END;

--> statement-breakpoint
CREATE TRIGGER actual_menu_history BEFORE UPDATE ON menu_actuals WHEN NEW.plan<>OLD.plan OR NEW.planned_snapshot<>OLD.planned_snapshot BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER staff_active_insert BEFORE INSERT ON staff_events WHEN NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee AND active=1) BEGIN SELECT RAISE(ABORT,'HOT_EMPLOYEE_INACTIVE'); END;

--> statement-breakpoint
CREATE TRIGGER staff_active_edit BEFORE UPDATE OF employee,start,end ON staff_events WHEN (NEW.employee<>OLD.employee OR NEW.start<>OLD.start OR NEW.end<>OLD.end) AND NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee AND active=1) BEGIN SELECT RAISE(ABORT,'HOT_EMPLOYEE_INACTIVE'); END;

--> statement-breakpoint
CREATE TRIGGER staff_overlap_insert BEFORE INSERT ON staff_events WHEN NEW.status<>'Cancelado' AND EXISTS(SELECT 1 FROM staff_events e WHERE e.id<>NEW.id AND e.employee=NEW.employee AND e.status<>'Cancelado' AND e.start<NEW.end AND e.end>NEW.start) AND (NEW.conflict_ack<>1 OR LENGTH(TRIM(NEW.observation))=0) BEGIN SELECT RAISE(ABORT,'HOT_STAFF_CONFLICT'); END;

--> statement-breakpoint
CREATE TRIGGER staff_overlap_update BEFORE UPDATE OF employee,start,end,status,conflict_ack ON staff_events WHEN NEW.status<>'Cancelado' AND EXISTS(SELECT 1 FROM staff_events e WHERE e.id<>NEW.id AND e.employee=NEW.employee AND e.status<>'Cancelado' AND e.start<NEW.end AND e.end>NEW.start) AND (NEW.conflict_ack<>1 OR LENGTH(TRIM(NEW.observation))=0) BEGIN SELECT RAISE(ABORT,'HOT_STAFF_CONFLICT'); END;

--> statement-breakpoint
CREATE TRIGGER staff_attendance_preserved BEFORE UPDATE ON staff_events WHEN OLD.attendance<>'Sin registrar' AND (NEW.employee<>OLD.employee OR NEW.start<>OLD.start OR NEW.end<>OLD.end OR NEW.kind<>OLD.kind OR NEW.status='Cancelado') BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER staff_report_active BEFORE INSERT ON staff_reports WHEN NOT EXISTS(SELECT 1 FROM employees WHERE id=NEW.employee AND active=1) BEGIN SELECT RAISE(ABORT,'HOT_EMPLOYEE_INACTIVE'); END;

--> statement-breakpoint
CREATE TRIGGER staff_report_history BEFORE UPDATE ON staff_reports WHEN NEW.employee<>OLD.employee OR NEW.event IS NOT OLD.event OR NEW.author<>OLD.author OR NEW.date<>OLD.date OR NEW.type<>OLD.type BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER planning_sources_current BEFORE INSERT ON audit_log BEGIN
 SELECT CASE WHEN NEW.action='deliveryGenerate' AND NOT EXISTS(SELECT 1 FROM suppliers WHERE id=json_extract(NEW.detail,'$.supplierVersion.id') AND version=json_extract(NEW.detail,'$.supplierVersion.version')) THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NEW.action='menuCopy' AND EXISTS(SELECT 1 FROM json_each(NEW.detail,'$.sourceVersions') j WHERE NOT EXISTS(SELECT 1 FROM menu_plans WHERE id=json_extract(j.value,'$.id') AND version=json_extract(j.value,'$.version'))) THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN NEW.action='menuActual' AND json_extract(NEW.detail,'$.planVersion.id') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM menu_plans WHERE id=json_extract(NEW.detail,'$.planVersion.id') AND version=json_extract(NEW.detail,'$.planVersion.version')) THEN RAISE(ABORT,'HOT_VERSION') END;
 END;
