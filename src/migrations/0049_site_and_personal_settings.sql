-- Independent site identity and personal images; credential generations stay unchanged.
create table site_settings (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 1 check (revision > 0),
  name text not null default 'Ovload Gateway',
  subtitle text not null default '',
  support text not null default '',
  endpoint text not null default '',
  logo_png bytea,
  logo_width integer,
  logo_height integer,
  updated_at timestamptz not null default clock_timestamp(),
  constraint site_settings_name_ck check (
    char_length(name) between 1 and 80 and name = btrim(name) and name !~ '[[:cntrl:]]'
  ),
  constraint site_settings_subtitle_ck check (
    char_length(subtitle) <= 160 and subtitle !~ '[[:cntrl:]]'
  ),
  constraint site_settings_support_ck check (
    char_length(support) <= 500 and support !~ '[[:cntrl:]]'
  ),
  constraint site_settings_endpoint_ck check (
    char_length(endpoint) <= 500 and endpoint !~ '[[:cntrl:][:space:]]'
  ),
  constraint site_settings_logo_ck check (
    (logo_png is null and logo_width is null and logo_height is null)
    or (logo_png is not null and logo_width is not null and logo_height is not null
      and octet_length(logo_png) between 1 and 307200
      and logo_width between 1 and 256 and logo_height between 1 and 256)
  )
);

insert into site_settings (singleton) values (true);

create table identity_profile_avatars (
  owner_id uuid primary key,
  tenant_id uuid,
  user_id uuid,
  principal_id uuid references identity_management_principals(id) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  image_png bytea,
  width integer,
  height integer,
  updated_at timestamptz not null default clock_timestamp(),
  constraint identity_profile_avatars_customer_fk foreign key (tenant_id, user_id)
    references identity_users(tenant_id, id) on delete restrict,
  constraint identity_profile_avatars_owner_ck check (
    (tenant_id is not null and user_id is not null and principal_id is null and owner_id = user_id)
    or (tenant_id is null and user_id is null and principal_id is not null and owner_id = principal_id)
  ),
  constraint identity_profile_avatars_image_ck check (
    (image_png is null and width is null and height is null)
    or (image_png is not null and width is not null and height is not null
      and octet_length(image_png) between 1 and 307200
      and width between 1 and 256 and height between 1 and 256)
  )
);
