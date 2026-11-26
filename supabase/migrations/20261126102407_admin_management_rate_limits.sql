-- Bound authenticated Admin Edge Function traffic without IP-based or password lockouts.
CREATE TABLE public.admin_management_rate_limits (
  actor_user_id uuid NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('read', 'mutation')),
  window_started_at timestamptz NOT NULL,
  request_count smallint NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY (actor_user_id, bucket)
);

CREATE INDEX admin_management_rate_limits_window_idx
  ON public.admin_management_rate_limits (window_started_at);

ALTER TABLE public.admin_management_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_management_rate_limits_service_role
  ON public.admin_management_rate_limits
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
REVOKE ALL ON TABLE public.admin_management_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_management_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_admin_management_rate_limit(
  p_actor_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_window_started_at timestamptz;
  v_request_count smallint;
BEGIN
  IF p_actor_user_id IS NULL
     OR p_bucket NOT IN ('read', 'mutation')
     OR p_limit NOT BETWEEN 1 AND 60
     OR p_window_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'Invalid admin rate-limit arguments';
  END IF;

  v_window := make_interval(secs => p_window_seconds);

  -- Keep only recent actor/bucket state. One saturated row exists per actor and bucket.
  DELETE FROM public.admin_management_rate_limits AS stale
  WHERE stale.window_started_at < v_now - interval '24 hours';

  INSERT INTO public.admin_management_rate_limits AS current_window
    (actor_user_id, bucket, window_started_at, request_count)
  VALUES (p_actor_user_id, p_bucket, v_now, 1)
  ON CONFLICT (actor_user_id, bucket) DO UPDATE
    SET window_started_at = CASE
          WHEN current_window.window_started_at <= v_now - v_window THEN v_now
          ELSE current_window.window_started_at
        END,
        request_count = CASE
          WHEN current_window.window_started_at <= v_now - v_window THEN 1
          ELSE LEAST(current_window.request_count + 1, p_limit + 1)::smallint
        END
  RETURNING current_window.window_started_at, current_window.request_count
    INTO v_window_started_at, v_request_count;

  IF v_request_count <= p_limit THEN
    RETURN QUERY SELECT true, 0;
  ELSE
    RETURN QUERY SELECT false, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_window_started_at + v_window - v_now)))::integer);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_admin_management_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_admin_management_rate_limit(uuid, text, integer, integer) TO service_role;
