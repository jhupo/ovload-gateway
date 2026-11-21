alter table identity_lifecycle_challenges
  drop constraint identity_lifecycle_challenge_expiry_ck;
alter table identity_lifecycle_challenges
  add constraint identity_lifecycle_challenge_expiry_ck check (
    expires_at > created_at and
    expires_at <= created_at + case when purpose='registration'
      then interval '168 hours' else interval '20 minutes' end
  );
