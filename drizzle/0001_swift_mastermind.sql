CREATE INDEX `idx_bookings_start` ON `bookings` (`start`);--> statement-breakpoint
CREATE INDEX `idx_cash_ref_kind` ON `cash_movements` (`ref`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_cash_date` ON `cash_movements` (`date`);--> statement-breakpoint
CREATE INDEX `idx_sales_booking_date` ON `sales` (`booking`,`date`);--> statement-breakpoint
CREATE INDEX `idx_stock_product` ON `stock_movements` (`product`);