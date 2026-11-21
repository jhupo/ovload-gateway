-- Both execution billing and explicit reservation billing use the same owner-scoped reporting contract.
create view commerce_request_settlements as
 select operation_id,tenant_id,user_id,model_key_id,state,settled_usd from billing_reservations
 union all
 select request_id,tenant_id,user_id,key_id,
  case when state='pending' then 'reconciliation_required' else 'settled' end,amount_usd
 from commerce_execution_charges c
 where not exists(select 1 from billing_reservations r where r.operation_id=c.request_id);
