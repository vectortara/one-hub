-- KEYS[1] as counter_key      "{global-rpm}:counter"
-- KEYS[2] as lastmin_key      "{global-rpm}:lastmin"
-- ARGV[1] as now              当前时间戳

local now = tonumber(ARGV[1])
local current_minute = now - (now % 60)

-- 先读取 counter（TokenLimiter 风格）
local request_count = redis.call("get", KEYS[1])
if request_count == false then
    request_count = 0
else
    request_count = tonumber(request_count)
end

-- 判断分钟边界
local last_minute = redis.call("get", KEYS[2])

if last_minute == false then
    request_count = 1
    redis.call("setex", KEYS[2], 120, current_minute)
else
    last_minute = tonumber(last_minute)
    if current_minute > last_minute then
        request_count = 1
        redis.call("setex", KEYS[2], 120, current_minute)
    else
        request_count = request_count + 1
    end
end

redis.call("setex", KEYS[1], 120, request_count)
return request_count
