-- Review M6: wallet balance must never go negative, even under concurrent
-- admin debits. Application code now uses guarded conditional decrements;
-- this constraint is the database-level backstop.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_wallet_balance_non_negative" CHECK ("walletBalanceThb" >= 0);
