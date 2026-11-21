//! Base and optional user-group scopes share atomic transitions. Every key uses the same Redis hash slot.

pub(super) const ADMIT: &str = r#"
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local ttl = tonumber(ARGV[2])
if now + ttl > tonumber(ARGV[3]) then return 3 end
local active = 0
local counted = 0
for scope = 1, #KEYS / 2 do
  local a = scope * 2 - 1
  redis.call('ZREMRANGEBYSCORE', KEYS[a], '-inf', now)
  redis.call('ZREMRANGEBYSCORE', KEYS[a + 1], '-inf', now - 60000)
  if redis.call('ZSCORE', KEYS[a], ARGV[1]) then active = active + 1 end
  if redis.call('ZSCORE', KEYS[a + 1], ARGV[1]) then counted = counted + 1 end
end
if active == #KEYS / 2 then return 0 end
if active > 0 or counted > 0 then return 4 end
for scope = 1, #KEYS / 2 do
  local a = scope * 2 - 1
  local limit = scope * 2 + 3
  if redis.call('ZCARD', KEYS[a + 1]) >= tonumber(ARGV[limit + 1]) then return 1 end
end
if tonumber(ARGV[4]) == 0 then return 2 end
for scope = 1, #KEYS / 2 do
  if redis.call('ZCARD', KEYS[scope * 2 - 1]) >= tonumber(ARGV[scope * 2 + 3]) then return 2 end
end
for scope = 1, #KEYS / 2 do
  local a = scope * 2 - 1
  redis.call('ZADD', KEYS[a], now + ttl, ARGV[1])
  redis.call('ZADD', KEYS[a + 1], now, ARGV[1])
  local tail = redis.call('ZRANGE', KEYS[a], -1, -1, 'WITHSCORES')
  local expiry = math.max(120000, tonumber(tail[2]) - now + 60000)
  if redis.call('PTTL', KEYS[a]) < expiry then redis.call('PEXPIRE', KEYS[a], expiry) end
  if redis.call('PTTL', KEYS[a + 1]) < 120000 then redis.call('PEXPIRE', KEYS[a + 1], 120000) end
end
return 0
"#;

pub(super) const RENEW: &str = r#"
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local ttl = tonumber(ARGV[2])
if now + ttl > tonumber(ARGV[3]) then return 0 end
for scope = 1, #KEYS / 2 do
  local expires = tonumber(redis.call('ZSCORE', KEYS[scope * 2 - 1], ARGV[1]) or '0')
  if expires <= now then return 0 end
end
for scope = 1, #KEYS / 2 do
  local key = KEYS[scope * 2 - 1]
  redis.call('ZADD', key, 'XX', now + ttl, ARGV[1])
  if redis.call('PTTL', key) < ttl + 60000 then redis.call('PEXPIRE', key, ttl + 60000) end
end
return 1
"#;

pub(super) const RELEASE: &str = r#"
local removed = 0
for scope = 1, #KEYS / 2 do
  removed = removed + redis.call('ZREM', KEYS[scope * 2 - 1], ARGV[1])
end
return removed
"#;

pub(super) const RESTORE: &str = r#"
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local recent_count = tonumber(ARGV[1])
local cursor = 2
for i = 1, recent_count do
  if tonumber(ARGV[cursor + 1]) > now then return {-1, 0, 0} end
  cursor = cursor + 2
end
local running_count = tonumber(ARGV[cursor])
local running_cursor = cursor + 1
local recent = 0
local running = 0
for scope = 1, #KEYS / 2 do
  local a = scope * 2 - 1
  redis.call('ZREMRANGEBYSCORE', KEYS[a], '-inf', now)
  redis.call('ZREMRANGEBYSCORE', KEYS[a + 1], '-inf', now - 60000)
  cursor = 2
  for i = 1, recent_count do
    local started = tonumber(ARGV[cursor + 1])
    if started > now - 60000 then
      local inserted = redis.call('ZADD', KEYS[a + 1], 'NX', started, ARGV[cursor])
      if scope == 4 then recent = recent + inserted end
    end
    cursor = cursor + 2
  end
  cursor = running_cursor
  for i = 1, running_count do
    local expires = tonumber(ARGV[cursor + 1])
    if expires > now then
      local inserted = redis.call('ZADD', KEYS[a], 'NX', expires, ARGV[cursor])
      if scope == 4 then running = running + inserted end
    end
    cursor = cursor + 2
  end
  local tail = redis.call('ZRANGE', KEYS[a], -1, -1, 'WITHSCORES')
  local expiry = 120000
  if #tail == 2 then expiry = math.max(expiry, tonumber(tail[2]) - now + 60000) end
  if redis.call('PTTL', KEYS[a]) < expiry then redis.call('PEXPIRE', KEYS[a], expiry) end
  if redis.call('PTTL', KEYS[a + 1]) < 120000 then redis.call('PEXPIRE', KEYS[a + 1], 120000) end
end
return {0, recent, running}
"#;

pub(super) const CLEAR: &str = r#"
local active = redis.call('ZRANGE', KEYS[7], 0, 1023)
local requests = redis.call('ZRANGE', KEYS[8], 0, 1023)
for scope = 1, #KEYS / 2 do
  for _, id in ipairs(active) do redis.call('ZREM', KEYS[scope * 2 - 1], id) end
  for _, id in ipairs(requests) do redis.call('ZREM', KEYS[scope * 2], id) end
end
return #active + #requests
"#;
