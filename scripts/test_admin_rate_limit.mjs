import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const functionSource = await readFile(resolve(root, 'supabase/functions/admin-management/index.ts'), 'utf8');
const migration = await readFile(resolve(root, 'supabase/migrations/20261126102407_admin_management_rate_limits.sql'), 'utf8');

const authenticateIndex = functionSource.indexOf('const { actor, error: authError } = await authenticate(');
const throttleIndex = functionSource.indexOf('const rateLimitResponse = await enforceAdminRequestLimit(');
const operationIndex = functionSource.indexOf("if (request.method === 'GET') {", throttleIndex);
assert.ok(authenticateIndex >= 0 && authenticateIndex < throttleIndex, 'administrator authentication and permission checks must precede throttling');
assert.ok(throttleIndex > authenticateIndex && throttleIndex < operationIndex, 'throttle must run before any endpoint operation');
assert.match(functionSource, /p_actor_user_id:\s*actor\.id/, 'the bucket key must be the verified actor ID');
assert.match(functionSource, /p_limit:\s*isMutation \? 10 : 60/);
assert.match(functionSource, /p_window_seconds:\s*60/);
assert.match(functionSource, /jsonResponse\(request, 429[\s\S]*?'Retry-After': String\(retryAfter\)/, 'limit responses must be 429 with Retry-After');
assert.match(functionSource, /Administrator request limits could not be checked/, 'a limiter outage must fail closed rather than bypassing the limit');
assert.match(functionSource, /Too many administrator requests\. Please wait before trying again\./, 'the response must not reveal account existence or details');
assert.doesNotMatch(functionSource, /Sb-Forwarded-For|x-forwarded-for|CF-Connecting-IP|console\.(?:log|error)/i, 'the endpoint must not use shared-IP buckets or log secrets');

assert.match(migration, /PRIMARY KEY \(actor_user_id, bucket\)/, 'each actor has one row per request class');
assert.match(migration, /p_limit NOT BETWEEN 1 AND 60/, 'server-side caps must be bounded');
assert.match(migration, /p_window_seconds NOT BETWEEN 1 AND 3600/, 'windows must be bounded');
assert.match(migration, /LEAST\(current_window\.request_count \+ 1, p_limit \+ 1\)/, 'request counts must saturate and never grow without bound');
assert.match(migration, /window_started_at < v_now - interval '24 hours'/, 'stale actor state must be purged');
assert.match(migration, /ALTER TABLE public\.admin_management_rate_limits ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON TABLE public\.admin_management_rate_limits FROM PUBLIC, anon, authenticated/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.consume_admin_management_rate_limit[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.consume_admin_management_rate_limit[\s\S]*TO service_role/);
assert.match(migration, /SET search_path = pg_catalog, public/);

console.log('PASS: admin-management limits apply after verified authorization, are per actor, bounded, generic and fail closed');
