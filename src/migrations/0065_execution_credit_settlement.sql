-- Credit receipts capture the balance immediately after that credit. Clear
-- payable usage at commit, after the receipt has been validated and recorded.
drop trigger zz_commerce_credit_settlement on wallet_ledger_entries;
create constraint trigger zz_commerce_credit_settlement after insert on wallet_ledger_entries
 deferrable initially deferred for each row execute function commerce_credit_settlement();

create or replace function guard_execution_ledger() returns trigger language plpgsql as $$
begin
 if new.entry_kind='execution_usage' then
  if not exists(select 1 from commerce_execution_charges where id=new.source_id
   and tenant_id=new.tenant_id and amount_usd=new.amount_usd and state='wallet') then
   raise exception 'execution debit requires matching charge evidence';
  end if;
 elsif new.direction='debit' and exists(select 1 from commerce_execution_charges
  where tenant_id=new.tenant_id and state='pending') then
  raise exception 'payable execution usage must be settled first';
 end if;
 return new;
end $$;
