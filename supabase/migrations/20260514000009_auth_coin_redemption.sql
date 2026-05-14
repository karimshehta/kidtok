-- ============================================================
-- Allow authenticated users to redeem subscriptions with coins
-- via a secure wrapper that auto-uses auth.uid()
-- ============================================================

-- Wrapper: no p_user_id param — uses auth.uid() automatically
-- This is safe to grant to authenticated role
CREATE OR REPLACE FUNCTION public.my_redeem_subscription_with_coins(
  p_plan_id integer
)
RETURNS TABLE (
  subscription_id uuid,
  coins_spent     integer,
  new_balance     integer,
  expires_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT * FROM public.redeem_subscription_with_coins(auth.uid(), p_plan_id);
END;
$$;

REVOKE ALL ON FUNCTION public.my_redeem_subscription_with_coins(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_redeem_subscription_with_coins(integer) TO authenticated;

-- Also grant deduct_user_coins to authenticated (users can deduct their own balance)
CREATE OR REPLACE FUNCTION public.deduct_user_coins(
  p_user_id uuid,
  p_amount  integer,
  p_ref_id  uuid DEFAULT NULL,
  p_notes   text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
  v_new     integer;
BEGIN
  -- Security: authenticated users can only deduct from their own balance
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: cannot deduct from another user';
  END IF;

  SELECT balance INTO v_current
    FROM public.user_coins
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF v_current IS NULL OR v_current < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_COINS: have %, need %',
      COALESCE(v_current, 0), p_amount;
  END IF;

  v_new := v_current - p_amount;

  UPDATE public.user_coins
     SET balance = v_new, updated_at = NOW()
   WHERE user_id = p_user_id;

  INSERT INTO public.coin_transactions
    (user_id, amount, type, notes, reference_id)
  VALUES
    (p_user_id, -p_amount, 'subscription_discount', p_notes, p_ref_id);

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_user_coins(uuid, integer, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_user_coins(uuid, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_user_coins(uuid, integer, uuid, text) TO service_role;
