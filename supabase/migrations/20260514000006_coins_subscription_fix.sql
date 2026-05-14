-- ============================================================
-- Fix: coin-based subscriptions + allow authenticated RPCs
-- ============================================================

-- 1. Add 'coins' to payment_provider allowed values
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_payment_provider_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_payment_provider_check
    CHECK (payment_provider IN ('stripe','paymob','apple','google','manual','coins'));

-- 2. Allow authenticated users to call deduct_user_coins on their own account
--    (they can only deduct from their own balance — enforced inside the function)
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
    RAISE EXCEPTION 'INSUFFICIENT_COINS: have %, need %', COALESCE(v_current, 0), p_amount;
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

-- Grant to authenticated (safe — function checks auth.uid())
REVOKE ALL ON FUNCTION public.deduct_user_coins(uuid, integer, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_user_coins(uuid, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_user_coins(uuid, integer, uuid, text) TO service_role;
