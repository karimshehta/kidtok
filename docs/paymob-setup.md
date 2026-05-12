# Paymob Setup

دليل ربط Paymob كبوابة دفع للاشتراكات.

## ليه Paymob؟

- يقبل **بطاقات + Mobile Wallets + Apple Pay** في مصر
- نفس الـ gateway اللي كانت مستخدمة في الـ legacy app
- 2.7% + 2 EGP لكل عملية card، 1.5% + 2 EGP للـ wallet
- Apple Pay مدعوم بدون رسوم إضافية

---

## الخطوات

### 1. سجّل حساب Paymob

1. روح [paymob.com](https://paymob.com) → Sign Up Egypt
2. كمل بيانات الشركة (Commercial registration / national ID)
3. استنى موافقة (ساعة لـ يوم)

### 2. خد المفاتيح من Dashboard

من **Settings → Account Info → API Keys**:
- **API Key** (sandbox + production)

من **Developers → Payment Integrations**:
- اعمل integration **Online Card** → `card_integration_id`
- اعمل integration **Mobile Wallet** → `wallet_integration_id`
- (اختياري) Apple Pay → `apple_pay_integration_id`

من **Developers → iFrames**:
- اعمل iFrame جديد، اربطه بالـ card integration → `iframe_id`

من **Developers → Transaction Processing → Callbacks**:
- **Transaction processed callback** = `https://ngjpmfldzoijtfyxopjw.supabase.co/functions/v1/subscription-paymob-callback`
- **Transaction response callback** = نفس الـ URL
- اعمل Save، وانسخ الـ **HMAC** اللي ظاهر فوق

### 3. ضيف الـ Secrets في Supabase

روح **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:

| Name | Value |
|---|---|
| `PAYMOB_API_KEY` | من الخطوة 2 (API Keys) |
| `PAYMOB_HMAC_SECRET` | من الخطوة 2 (Callbacks) |
| `PAYMOB_IFRAME_ID` | من iFrames |
| `PAYMOB_CARD_INTEGRATION_ID` | من Integrations |
| `PAYMOB_WALLET_INTEGRATION_ID` | من Integrations |
| `PAYMOB_APPLE_PAY_INTEGRATION_ID` | من Integrations (اختياري) |
| `APP_URL` | `https://kidtok.vercel.app` (لإعادة التوجيه بعد الدفع) |

### 4. (اختياري) Test mode

لاختبار قبل ما تروح production:
- استخدم `PAYMOB_BASE_URL=https://accept.paymobsolutions.com/api` للـ sandbox
- خد integration IDs من حساب sandbox منفصل

---

## بيانات اختبار

في الـ sandbox فقط:
- **Card number:** `5123456789012346`
- **Expiry:** `12/30`
- **CVV:** `100`
- **OTP:** `123456`

---

## الـ Flow

```
User → /subscription page
       ↓ chooses plan + method
Edge Function (subscription-create)
       ↓ creates pending subscription
       ↓ authenticates with Paymob
       ↓ creates order + payment key
       ↓ returns payment_url
User → Paymob iframe / Wallet / Apple Pay
       ↓ pays
Paymob → callback URL (server + user redirect)
       ↓ HMAC verified
       ↓ subscription marked active
       ↓ other active subs cancelled
User → /subscription/success 🎉
```

---

## التأكد إنه شغّال

1. ادخل بحساب مش admin
2. روح `/subscription`
3. اختار Monthly → "اشترك الآن"
4. اختار بطاقة → هترجع تلقائي على Paymob iframe
5. ادفع بـ test card
6. هترجع على `/subscription/success`
7. روح `/profile` → هتلاقي بطاقة الاشتراك زرقا/وردي

في Supabase SQL Editor، تأكد:
```sql
select * from subscriptions where status='active' order by created_at desc limit 3;
```
