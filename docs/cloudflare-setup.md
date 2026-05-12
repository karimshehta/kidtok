# Cloudflare Stream Setup

دليل خطوة-بخطوة لإعداد Cloudflare Stream للـ Creator system.

## ليه Cloudflare Stream؟

- **رخيص:** $5/شهر = أول 1,000 دقيقة تخزين + 1,000 دقيقة مشاهدة
- **بعدها:** $5 لكل 1,000 دقيقة تخزين، $1 لكل 1,000 دقيقة بث
- مدمج: transcoding تلقائي، HLS adaptive bitrate، صور مصغّرة، CDN عالمي
- بدائله (Mux, AWS MediaConvert) أغلى 3-10 مرات لنفس الميزات

**مثال للتكلفة:** 50 منشئ × 10 فيديوهات × 3 دقائق = 1,500 دقيقة تخزين + 30,000 دقيقة مشاهدة شهرياً = **~$37/شهر**

---

## الخطوات

### 1. فتح حساب Cloudflare

1. روح [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. سجّل بالإيميل وكلمة سر قوية، فعّل الإيميل
3. **تخطّى "Add a site"** — Stream مش محتاجه

### 2. تفعيل Stream

1. من الـ sidebar اضغط **Stream**
2. اضغط **Subscribe to Stream** ($5/شهر)
3. ضيف payment method (لازم حتى للـ trial)

### 3. نسخ Account ID

1. من صفحة Stream → الـ sidebar اليمين، هتلاقي:
   ```
   Account ID: a1b2c3d4e5f6...
   ```
2. انسخها واحفظها (هنحطها في Supabase)

### 4. نسخ Customer Subdomain

1. روح **Stream → Settings** أو شغّل أي فيديو test
2. هتلاقي customer subdomain شكله:
   ```
   customer-xxxxxx.cloudflarestream.com
   ```
3. انسخ الجزء `customer-xxxxxx` بس (بدون `.cloudflarestream.com`)

### 5. إنشاء API Token

1. اضغط على بروفايلك (يمين فوق) → **My Profile**
2. تاب **API Tokens** → **Create Token**
3. اضغط **Custom token → Get started**
4. اسم التوكن: `KidTok Stream API`
5. **Permissions:**
   - `Account` → `Stream` → **Edit**
6. **Account Resources:** اختار حسابك
7. اضغط **Continue to summary** → **Create Token**
8. **انسخ التوكن فوراً** (مش هيتعرض تاني)

### 6. إضافة الـ Secrets في Supabase

روح Supabase Dashboard → **Project Settings → Edge Functions → Secrets**، وضيف:

| Name | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | من الخطوة 3 |
| `CLOUDFLARE_STREAM_API_TOKEN` | من الخطوة 5 |
| `CLOUDFLARE_STREAM_CUSTOMER_CODE` | من الخطوة 4 (الجزء `customer-xxxxxx` بس) |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` | هنضيفه في الخطوة 7 بعد deploy الـ Edge Function |

### 7. (لاحقاً) إعداد الـ Webhook

بعد ما ننشر Edge Function اسمها `creator-cloudflare-webhook`:
1. هتاخد الـ URL من Supabase Functions dashboard
2. روح **Stream → Settings → Webhooks**
3. الصق الـ URL واضغط Save
4. Cloudflare هيديك **Webhook secret** — انسخه
5. حطه في Supabase Edge Functions Secrets باسم `CLOUDFLARE_STREAM_WEBHOOK_SECRET`

---

## Hive Moderation (الـ AI moderation)

بعد ما تخلّص Cloudflare، نفس الخطوات لـ Hive:

1. **التسجيل:** [thehive.ai](https://thehive.ai) → Get Started
2. **اختار Visual Moderation API** (للصور + الفيديوهات)
3. **التسعير:** ~$0.0010 لكل صورة، يعني ~$0.01 للفيديو (10 لقطات تحقّق)
4. **API Key:** من Dashboard → API Keys
5. ضيفها في Supabase باسم `HIVE_API_KEY`

---

## الخطوة الجاية بعد ما تخلّص

ابعتلي **"Cloudflare جاهز"** أو **"Hive جاهز"** وأنا أبدأ:
1. Deploy Edge Functions للـ direct upload
2. Deploy Cloudflare webhook handler
3. Deploy Hive moderation pipeline
4. بناء صفحات الـ Creator dashboard (Upload, My Videos, Stats)
5. بناء صفحات الـ Admin moderation panel
