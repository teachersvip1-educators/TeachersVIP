-- The output name usage_count also declares a PL/pgSQL variable. Qualify the
-- table column in RETURNING and SELECT so ordinary Use Deal activations succeed.
CREATE OR REPLACE FUNCTION consume_deal_usage_limit(
  p_deal_id text, p_user_id uuid, p_scope_key text, p_bucket_key text, p_limit_count integer
)
RETURNS TABLE (allowed boolean, usage_count integer)
LANGUAGE plpgsql
AS $$
DECLARE next_count integer;
BEGIN
  INSERT INTO deal_usage_counters AS counter (deal_id,user_id,scope_key,bucket_key,usage_count)
  VALUES (p_deal_id,p_user_id,p_scope_key,p_bucket_key,1)
  ON CONFLICT (deal_id,user_id,scope_key,bucket_key) DO UPDATE
    SET usage_count=counter.usage_count+1, updated_at=now()
    WHERE p_limit_count IS NULL OR counter.usage_count<p_limit_count
  RETURNING counter.usage_count INTO next_count;
  IF FOUND THEN
    RETURN QUERY SELECT true,next_count;
  ELSE
    SELECT counter.usage_count INTO next_count FROM deal_usage_counters counter
    WHERE counter.deal_id=p_deal_id AND counter.user_id=p_user_id
      AND counter.scope_key=p_scope_key AND counter.bucket_key=p_bucket_key;
    RETURN QUERY SELECT false,COALESCE(next_count,0);
  END IF;
END;
$$;

-- Online offers can be denied by a usage limit without requesting location.
-- Preserve the null location requirement and allow the existing denial state.
ALTER TABLE deal_activations DROP CONSTRAINT IF EXISTS deal_activations_check;
ALTER TABLE deal_activations ADD CONSTRAINT deal_activations_check CHECK (
  (activation_type='online_offer_access' AND location_decision IN ('not_requested','limit_reached') AND business_location_id IS NULL)
  OR (activation_type='verified_on_site' AND business_location_id IS NOT NULL)
);
