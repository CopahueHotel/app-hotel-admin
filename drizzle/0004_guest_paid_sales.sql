-- Paid guest sales remain linked to their booking for history, but do not
-- increase its outstanding balance. Existing charges have a NULL account.
DROP TRIGGER payment_limit;
--> statement-breakpoint
CREATE TRIGGER payment_limit BEFORE INSERT ON cash_movements
WHEN NEW.kind='Cobro'
AND NEW.amount+COALESCE((SELECT SUM(amount) FROM cash_movements WHERE ref=NEW.ref AND kind='Cobro'),0)
> (SELECT amount FROM bookings WHERE id=NEW.ref)
  +COALESCE((SELECT SUM(amount) FROM sales WHERE booking=NEW.ref AND account IS NULL),0)
BEGIN SELECT RAISE(ABORT, 'El cobro supera el saldo pendiente'); END;
