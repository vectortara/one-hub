-- KEYS[1] as counter_key    "{tpm-counter:{userId}}:counter"
-- KEYS[2] as lastmin_key    "{tpm-counter:{userId}}:lastmin"
-- ARGV[1] as now
-- ARGV[2] as tokens

local now = tonumber(ARGV[1])
local tokens = tonumber(ARGV[2])
local current_minute = now - (now % 60)

local request_count = redis.call("get", KEYS[1])
if request_count == false then
    request_count = 0
else
    request_count = tonumber(request_count)
end

local last_minute = redis.call("get", KEYS[2])

if last_minute == false then
    request_count = tokens
    redis.call("setex", KEYS[2], 120, current_minute)
else
    last_minute = tonumber(last_minute)
    if current_minute > last_minute then
        request_count = tokens
        redis.call("setex", KEYS[2], 120, current_minute)
    else
        request_count = request_count + tokens
    end
end

redis.call("setex", KEYS[1], 120, request_count)
return request_count
