create function account_platform(kind text) returns text language sql immutable strict parallel safe as $$
 select case kind when 'openai_api' then 'openai' when 'xai_api' then 'xai' else kind end
$$;
create or replace function guard_group_platform() returns trigger language plpgsql as $$
declare selected text; provider text;
begin
 if tg_table_name='account_groups' then
  if new.platform is not null and exists(select 1 from account_group_accounts m join provider_accounts a on a.id=m.provider_account_id where m.account_group_id=new.id and account_platform(a.provider_kind)<>account_platform(new.platform)) then raise exception 'group platform conflicts with existing accounts' using errcode='23514'; end if;
 elsif tg_table_name='account_group_accounts' then
  select platform into selected from account_groups where id=new.account_group_id for share;
  select provider_kind into provider from provider_accounts where id=new.provider_account_id;
  if selected is not null and account_platform(selected)<>account_platform(provider) then raise exception 'account platform does not match group' using errcode='23514'; end if;
 elsif exists(select 1 from account_group_accounts m join account_groups g on g.id=m.account_group_id where m.provider_account_id=new.id and g.platform is not null and account_platform(g.platform)<>account_platform(new.provider_kind)) then raise exception 'account platform does not match group' using errcode='23514';
 end if;
 return new;
end $$;
update account_groups set platform='openai' where platform='openai_api';
