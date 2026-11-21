alter table account_groups add column platform text check(platform in('openai','openai_api','xai','claude','gemini'));
create function guard_group_platform() returns trigger language plpgsql as $$
declare selected text; provider text;
begin
 if tg_table_name='account_groups' then
  if new.platform is not null and exists(select 1 from account_group_accounts m join provider_accounts a on a.id=m.provider_account_id where m.account_group_id=new.id and a.provider_kind<>new.platform) then raise exception 'group platform conflicts with existing accounts' using errcode='23514'; end if;
 elsif tg_table_name='account_group_accounts' then
  select platform into selected from account_groups where id=new.account_group_id for share;
  select provider_kind into provider from provider_accounts where id=new.provider_account_id;
  if selected is not null and selected<>provider then raise exception 'account platform does not match group' using errcode='23514'; end if;
 elsif exists(select 1 from account_group_accounts m join account_groups g on g.id=m.account_group_id where m.provider_account_id=new.id and g.platform is not null and g.platform<>new.provider_kind) then raise exception 'account platform does not match group' using errcode='23514';
 end if;
 return new;
end $$;
create trigger group_platform_guard before update of platform on account_groups for each row execute function guard_group_platform();
create trigger group_member_platform_guard before insert or update on account_group_accounts for each row execute function guard_group_platform();
create trigger account_group_platform_guard before update of provider_kind on provider_accounts for each row execute function guard_group_platform();
