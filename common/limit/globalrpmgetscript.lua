-- KEYS[1] as counter_key
-- KEYS[2] as lastmin_key
-- ARGV[1] as now

local now = tonumber(ARGV[1])
local current_minute = now - (now % 60)

local last_minute = redis.call("get", KEYS[2])
if last_minute == false or tonumber(last_minute) < current_minute then
    return 0
end

local count = redis.call("get", KEYS[1])
return count == false and 0 or tonumber(count)
