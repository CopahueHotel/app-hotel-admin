CREATE TABLE `booking_clients` (
	`booking` text PRIMARY KEY NOT NULL,
	`customer` text NOT NULL,
	`inquiry` text,
	FOREIGN KEY (`booking`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inquiry`) REFERENCES `customer_inquiries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inquiry_booking` ON `booking_clients` (`inquiry`);--> statement-breakpoint
CREATE INDEX `idx_booking_customer` ON `booking_clients` (`customer`);--> statement-breakpoint
CREATE TABLE `customer_inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`customer` text NOT NULL,
	`date` text NOT NULL,
	`channel` text NOT NULL,
	`start` text DEFAULT '' NOT NULL,
	`end` text DEFAULT '' NOT NULL,
	`pax` integer,
	`status` text DEFAULT 'Nueva consulta' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`followup` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`created_by` text,
	`updated_by` text,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`customer`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inquiry_customer` ON `customer_inquiries` (`customer`);--> statement-breakpoint
CREATE INDEX `idx_inquiry_followup` ON `customer_inquiries` (`followup`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email_key` text DEFAULT '' NOT NULL,
	`phone_key` text DEFAULT '' NOT NULL,
	`locality` text DEFAULT '' NOT NULL,
	`province` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT 'Otro' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`consent` text DEFAULT 'Sin información' NOT NULL,
	`consent_date` text DEFAULT '' NOT NULL,
	`consent_source` text DEFAULT '' NOT NULL,
	`consent_by` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`created_by` text,
	`updated_by` text,
	`legacy` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_customer_email` ON `customers` (`email_key`);--> statement-breakpoint
CREATE INDEX `idx_customer_phone` ON `customers` (`phone_key`);
--> statement-breakpoint
-- One independent legacy contact per reservation: never infer a shared identity.
WITH RECURSIVE phone_digits(id,phone,pos,digits) AS (
 SELECT id,phone,1,'' FROM bookings
 UNION ALL
 SELECT id,phone,pos+1,digits||CASE WHEN substr(phone,pos,1) GLOB '[0-9]' THEN substr(phone,pos,1) ELSE '' END FROM phone_digits WHERE pos<=length(phone)
)
INSERT INTO customers (id,name,phone,phone_key,origin,created,updated,legacy)
SELECT 'legacy:'||b.id,b.guest,b.phone,CASE WHEN substr(trim(b.phone),1,2)='00' THEN substr(d.digits,3) ELSE d.digits END,
 CASE WHEN b.source IN ('Web','WhatsApp','Redes','Booking','Recomendación') THEN b.source ELSE 'Otro' END,
 strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),1
FROM bookings b JOIN phone_digits d ON d.id=b.id AND d.pos=length(d.phone)+1;
--> statement-breakpoint
INSERT INTO booking_clients (booking,customer) SELECT id,'legacy:'||id FROM bookings;
--> statement-breakpoint
CREATE TRIGGER customer_version BEFORE UPDATE ON customers BEGIN
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.created<>OLD.created OR NEW.created_by IS NOT OLD.created_by OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
END;
--> statement-breakpoint
CREATE TRIGGER customer_valid_insert BEFORE INSERT ON customers BEGIN
 SELECT CASE WHEN trim(NEW.name)='' OR NEW.email_key<>lower(trim(NEW.email)) OR NEW.origin NOT IN ('Web','WhatsApp','Redes','Booking','Recomendación','Otro') OR NEW.consent NOT IN ('Sin información','Autorizado','Rechazado','Revocado') THEN RAISE(ABORT,'HOT_CUSTOMER_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER customer_valid_update BEFORE UPDATE ON customers BEGIN
 SELECT CASE WHEN trim(NEW.name)='' OR NEW.email_key<>lower(trim(NEW.email)) OR NEW.origin NOT IN ('Web','WhatsApp','Redes','Booking','Recomendación','Otro') OR NEW.consent NOT IN ('Sin información','Autorizado','Rechazado','Revocado') THEN RAISE(ABORT,'HOT_CUSTOMER_INVALID') END;
 SELECT CASE WHEN NEW.consent<>OLD.consent AND (date(NEW.consent_date,'+0 days') IS NOT NEW.consent_date OR trim(NEW.consent_source)='' OR trim(NEW.consent_by)='') THEN RAISE(ABORT,'HOT_CUSTOMER_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER customer_history BEFORE DELETE ON customers BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER inquiry_history BEFORE DELETE ON customer_inquiries BEGIN SELECT RAISE(ABORT,'HOT_HISTORY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER inquiry_valid_insert BEFORE INSERT ON customer_inquiries BEGIN
 SELECT CASE WHEN date(NEW.date,'+0 days') IS NOT NEW.date OR NEW.status NOT IN ('Nueva consulta','Presupuesto enviado','Pendiente de respuesta','Pendiente de seña','Cerrada sin reserva') OR NEW.channel NOT IN ('Web','WhatsApp','Redes','Booking','Recomendación','Otro') OR (NEW.pax IS NOT NULL AND (NEW.pax<1 OR NEW.pax>500)) OR (NEW.start<>'' AND date(NEW.start,'+0 days') IS NOT NEW.start) OR (NEW.end<>'' AND date(NEW.end,'+0 days') IS NOT NEW.end) OR (NEW.start<>'' AND NEW.end<>'' AND NEW.start>=NEW.end) OR (NEW.followup<>'' AND date(NEW.followup,'+0 days') IS NOT NEW.followup) THEN RAISE(ABORT,'HOT_INQUIRY_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER inquiry_valid_update BEFORE UPDATE ON customer_inquiries BEGIN
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.customer<>OLD.customer OR NEW.created<>OLD.created OR NEW.created_by IS NOT OLD.created_by OR NEW.version<>OLD.version+1 THEN RAISE(ABORT,'HOT_VERSION') END;
 SELECT CASE WHEN OLD.status='Convertida en reserva' OR NEW.status NOT IN ('Nueva consulta','Presupuesto enviado','Pendiente de respuesta','Pendiente de seña','Convertida en reserva','Cerrada sin reserva') OR date(NEW.date,'+0 days') IS NOT NEW.date OR NEW.channel NOT IN ('Web','WhatsApp','Redes','Booking','Recomendación','Otro') OR (NEW.pax IS NOT NULL AND (NEW.pax<1 OR NEW.pax>500)) OR (NEW.start<>'' AND date(NEW.start,'+0 days') IS NOT NEW.start) OR (NEW.end<>'' AND date(NEW.end,'+0 days') IS NOT NEW.end) OR (NEW.start<>'' AND NEW.end<>'' AND NEW.start>=NEW.end) OR (NEW.followup<>'' AND date(NEW.followup,'+0 days') IS NOT NEW.followup) THEN RAISE(ABORT,'HOT_INQUIRY_INVALID') END;
 SELECT CASE WHEN NEW.status='Convertida en reserva' AND NOT EXISTS(SELECT 1 FROM booking_clients WHERE inquiry=NEW.id AND customer=NEW.customer) THEN RAISE(ABORT,'HOT_INQUIRY_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_client_match BEFORE INSERT ON booking_clients BEGIN
 SELECT CASE WHEN NEW.inquiry IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customer_inquiries WHERE id=NEW.inquiry AND customer=NEW.customer AND status NOT IN ('Convertida en reserva','Cerrada sin reserva')) THEN RAISE(ABORT,'HOT_INQUIRY_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_client_preserve BEFORE UPDATE ON booking_clients BEGIN
 SELECT CASE WHEN NEW.booking<>OLD.booking OR NEW.inquiry IS NOT OLD.inquiry OR (OLD.inquiry IS NOT NULL AND NEW.customer<>OLD.customer) THEN RAISE(ABORT,'HOT_INQUIRY_INVALID') END;
END;
--> statement-breakpoint
UPDATE roles SET permissions=json_insert(permissions,'$[#]','customers.view','$[#]','customers.lookup','$[#]','customers.create','$[#]','customers.edit','$[#]','customers.notes','$[#]','customers.consent','$[#]','customers.export'),version=version+1 WHERE id='manager' AND version=0;
--> statement-breakpoint
UPDATE roles SET permissions=json_insert(permissions,'$[#]','customers.view','$[#]','customers.lookup','$[#]','customers.create','$[#]','customers.edit','$[#]','customers.notes','$[#]','customers.consent'),version=version+1 WHERE id='reception' AND version=0;
