# توثيق عمليات تطبيق الأندرويد — فذلكة API

> **الغرض:** توثيق أمني دقيق لكل عملية يقوم بها تطبيق الأندرويد (`com.fazlaka.app`) ضد الباك اند، وكيف تُسجَّل كل عملية في سجل التدقيق مع المنصة التي نفّذتها (أندرويد / ويب / كمبيوتر)، وكيف يعمل نظام تنبيهات تسجيل الدخول.
>
> **آخر تحديث:** 2026-08-16 · النسخة الموثقة: v1.0.8+

---

## 1. كيف يعرّف تطبيق الأندرويد عن نفسه؟

كل طلب يرسله التطبيق يحمل ترويسات (Headers) هوية يضيفها `AuthInterceptor` تلقائيًا:

| الترويسة | القيمة من الأندرويد | الاستخدام في الباك اند |
|---|---|---|
| `x-platform` | `MOBILE` | تُخزَّن في `AuthEvent.platform` و`RefreshToken.platform` و`View.platform` و`Geolocation.platform` |
| `x-device-type` | `mobile` | نوع الجهاز في سجل الجلسات والأحداث |
| `x-device-name` | مثال: `Samsung SM-S918B` | اسم الجهاز في الجلسات وإيميل تنبيه الدخول |
| `x-os` | مثال: `Android 15` | نظام التشغيل في الجلسات والأحداث والإيميل |
| `x-app-version` | مثال: `1.0.8` | يُقارن بـ`PlatformConfig.minVersion` لفرض التحديث |
| `x-lat` / `x-lng` | إحداثيات GPS (إن توفّرت صلاحية الموقع) | الموقع الجغرافي في أحداث الدخول والموقع المحفوظ |
| `Accept-Language` | لغة الجهاز | i18n للردود والإيميلات |
| `Authorization` | `Bearer <accessToken>` | المصادقة عبر `ApiAuthGuard` |

**ملاحظة أمنية:** قيمة المنصة تعتمد على ترويسة يرسلها العميل (trust-based). لأي تحقيق أمني، اعتمد على تركيبة `platform + userAgent + deviceName + appVersion`؛ طلبات الأندرويد الحقيقية تأتي بـ`x-platform: MOBILE` مع User-Agent لـOkHttp ودون `x-browser`، بينما طلبات الويب تحمل متصفحًا في `x-browser` أو User-Agent للمتصفح.

### دورة حياة التوكن (Token Flow)

1. **تسجيل الدخول** (`POST /auth/login` أو `POST /auth/login/2fa` أو OAuth أو الهاتف) → يستلم التطبيق `accessToken` (JWT صالح 15 دقيقة) + `refreshToken` (سلسلة عشوائية صالحة 30 يومًا).
2. **كل طلب لاحق** يمرر `accessToken` في ترويسة `Authorization`.
3. **عند انتهاء الصلاحية (401):** `TokenAuthenticator` يرسل `POST /auth/refresh` بالتوكن القديم → يحصل على زوج جديد (تدوير كامل: التوكن القديم يُلغى ويُسجَّل حدث `refresh`) ويعيد المحاولة تلقائيًا مرة واحدة.
4. **الخروج:** `POST /auth/logout` يلغي التوكن الحالي ويُسجَّل `logout`.
5. تغيير كلمة السر / إعادة تعيينها / تغيير الإيميل → **إلغاء كل الجلسات** فورًا.

---

## 2. نظام تنبيهات تسجيل الدخول (Login Alerts)

عند **كل دخول ناجح** (من أي منصة) يرسل الباك اند إيميل «تم تسجيل دخول جديد» إلى صاحب الحساب يتضمن:

- الساعة والتاريخ (بتوقيت ومنطقة المستخدم ولغته)
- الموقع الجغرافي (مدينة/منطقة/دولة) من تحليل الـIP + إحداثيات GPS إن أرسلها التطبيق (`x-lat`/`x-lng`)
- نوع الجهاز واسمه ونظام التشغيل (مثال: `MOBILE · Samsung SM-S918B · Android 15`)
- عنوان الـIP وطريقة الدخول (كلمة مرور / OTP / Google / GitHub / Facebook / هاتف)

**مسارات الدخول التي تُنبَّذ جميعها:** كلمة المرور، إكمال 2FA، Google، GitHub، Facebook، الهاتف (تليجرام).

**الإيقاف الاختياري:** المستخدم يستطيع إيقاف الإيميلات من التفضيلات عبر `PATCH /users/me/preferences` بضبط `loginAlerts: false` (أو إيقاف كل إيميلات `emailNotifications`). القيمة الافتراضية `true`.

---

## 3. سجل العمليات الموثّق بالمنصة (AuthEvent)

كل عملية أدناه تُنشئ صفًا في جدول `AuthEvent` يحمل: `platform` (WEB/MOBILE/DESKTOP)، `device`، `os`، `browser`، `ip`/`ipHash`، `country`/`city`، `lat`/`lng`، `metadata` (JSON)، والوقت.

المستخدم يرى سجله الكامل عبر `GET /auth/security/events` (مع شارة المنصة في التطبيق)، والإدارة عبر `GET /analytics/auth` و`GET /users/admin/:id/activity`.

### 3.1 المصادقة والجلسات

| العملية في التطبيق | الـ Endpoint | حدث التدقيق المسجَّل |
|---|---|---|
| إنشاء حساب | `POST /auth/register` | `register` |
| دخول بكلمة مرور (فاشل/ناجح) | `POST /auth/login` | `login` / `failed_login` |
| إكمال 2FA | `POST /auth/login/2fa` | `login` (method=otp) + `two_factor` |
| دخول Google / GitHub / Facebook | `GET /auth/{provider}` → callback | `google` / `github` / `facebook` |
| دخول بالهاتف (تليجرام) | `POST /auth/phone/login` → `complete` | `phone_login_request` / `login` |
| تجديد التوكن | `POST /auth/refresh` | `refresh` |
| خروج | `POST /auth/logout` | `logout` |
| طلب استعادة كلمة السر | `POST /auth/forgot-password` | `password_reset_request` |
| تعيين كلمة سر جديدة | `POST /auth/reset-password` | `password_reset` |
| تغيير كلمة السر | `POST /auth/change-password` | `password_changed` |
| تفعيل/إيقاف 2FA (بريد أو TOTP) | `/auth/2fa/*` | `two_factor` (metadata: enable/disable/totp) |
| تغيير الإيميل الأساسي | `/auth/change-email/*` | `email_changed` |
| قبول الشروط | `POST /auth/terms-accept` | `terms_accepted` |
| إلغاء جلسة (واحدة/الكل) | `DELETE /auth/sessions[/:id]` | `session_revoked` |
| ربط/فك حساب اجتماعي | `/auth/link/*` | `oauth_link_intent` ثم `{provider}_linked/_unlinked` |

### 3.2 الملف الشخصي والحساب

| العملية في التطبيق | الـ Endpoint | حدث التدقيق |
|---|---|---|
| تعديل البيانات (اسم/بايو/يوزر) | `PATCH /users/me` | `profile_updated` (fields) |
| رفع صورة شخصية | `POST /users/me/avatar` | `avatar_uploaded` |
| رفع غلاف | `POST /users/me/banner` | `banner_uploaded` |
| تعديل التفضيلات (ثيم/لغة/تنبيهات) | `PATCH /users/me/preferences` | `preferences_updated` (fields) |
| تحديث الموقع الجغرافي | `POST /users/me/geolocation` | `geolocation_updated` (lat/lng/platform) |
| إضافة إيميل ثانوي | `POST /user-emails` | `secondary_email_added` |
| توثيق إيميل ثانوي | `POST /user-emails/verify` | `secondary_email_verified` |
| حذف إيميل ثانوي | `DELETE /user-emails` | `secondary_email_removed` |
| تعيين إيميل أساسي | `PATCH /user-emails/primary` | `primary_email_changed` |
| ربط/إزالة الهاتف | `/phone/*` | `phone_verified` / `phone_removed` |
| توثيق الإيميل الأساسي | `POST /auth/verify-email` | `email_verified` |

### 3.3 الأصدقاء

| العملية | الـ Endpoint | حدث التدقيق |
|---|---|---|
| إرسال طلب صداقة | `POST /friends/request/:userId` | `friend_request_sent` |
| قبول/رفض طلب | `POST /friends/requests/:id/{accept,reject}` | `friend_request_accepted` / `friend_request_rejected` |
| حذف صديق | `DELETE /friends/:friendId` | `friend_removed` |
| حظر / فك حظر | `POST /friends/{block,unblock}/:userId` | `user_blocked` / `user_unblocked` |

### 3.4 الرسائل والوسائط

| العملية | الـ Endpoint | حدث التدقيق |
|---|---|---|
| إنشاء محادثة مباشرة | `POST /messages/conversations` | `conversation_created` |
| إرسال رسالة (نص/صورة/فيديو/صوت) | `POST /messages/conversations/:id/messages` | `message_sent` (metadata: type، hasAttachment، durationSec) |
| رفع وسيلة شات | `POST /upload/chat?kind=…&durationSec=…` | `media_upload` (metadata: kind، mime، size، duration) |
| إنشاء مجموعة | `POST /messages/groups` | `group_created` |
| إضافة أعضاء | `POST /messages/groups/:id/members` | `group_member_added` |
| إزالة عضو / مغادرة | `DELETE /messages/groups/:id/members/:userId` | `group_member_removed` / `group_left` |

### 3.5 أحداث فشل وأمنية إضافية (تسجَّل تلقائيًا)

- `failed_login` — كل محاولة دخول فاشلة (مع سبب الفشل)
- `lockout` — قفل الحساب بعد 5 محاولات فاشلة لمدة 15 دقيقة
- `geo_mismatch` — عدم تطابق موقع GPS مع موقع الـIP (فرق > 300 كم) في مسارات الإدارة

---

## 4. تدفق رفع الوسائط من الأندرويد (Chat Media)

```
التطبيق يختار/يسجّل الملف (صورة ≤10MB / فيديو / صوت AAC)
        │
        ▼
POST /api/v1/upload/chat?kind=image|video|audio&durationSec=…
(multipart/form-data، مصادَق، مع ترويسات الهوية)
        │
        ▼
الباك اند يتحقق من نوع الملف (MIME whitelist) والحجم
ثم يرفعه إلى Cloudinary (فيديو/صوت) أو ImgBB (صور)
ويسجّل media_upload في AuthEvent + MediaAsset
        │
        ▼
يرجع { url, kind, mimeType, size, durationSec }
        │
        ▼
POST /messages/conversations/:id/messages
type: image|video|audio + attachmentUrl + attachmentMime/Name/Size (+durationSec)
        │
        ▼
message_sent في التدقيق + بث Pusher message:new للمستقبِل
```

**الأنواع المسموحة:** صور jpeg/png/webp/gif/avif — فيديو mp4/webm/ogg — صوت mpeg/mp3/ogg/wav/webm/mp4 — الحد الأقصى 10MB.

---

## 5. الاتصال اللحظي (Realtime — Pusher)

- التطبيق يجلب مفاتيح Pusher من `GET /settings/public` ثم يفتح قناة خاصة `private-user-{userId}`.
- التفويض عبر `POST /realtime/pusher/auth` (يتحقق الباك اند أن معرّف القناة يطابق توكن المستخدم).
- الأحداث الواردة للتطبيق: `message:new`، `message:sent`، `group:invite`، `group:removed`، `notification:new`، `calls:incoming`.

---

## 6. ملخص الضمانات الأمنية لعمليات الأندرويد

1. **كل عملية حساسة مسجّلة** مع المنصة والجهاز والموقع والوقت — لا يمكن تنفيذها دون ترك أثر.
2. **كل دخول يُبلَّغ بالإيميل** فورًا مع تفاصيل الجهاز والموقع.
3. **refresh tokens مُجزَّلة (hashed) في قاعدة البيانات** وتُدار بالتدوير، وجلسات الأجهزة قابلة للإلغاء فرديًا.
4. **قيود المعدل (Throttling)** على مسارات الدخول والرفع العام (6 رفع/دقيقة للرفع العام غير المصادَق).
5. **إقفال تلقائي** للحساب بعد 5 محاولات فاشلة.
6. **بوابات الشروط والتحقق** (`TermsAcceptedGuard`, `EmailVerifiedGuard`) على العمليات المجتمعية.

---

## 7. نقاط يحظر التغاضي عنها في مراجعات الأمان

- `POST /upload/public` متاح بدون مصادقة (مقيّد الآن بـ6 طلبات/دقيقة) — راقب سجله في `MediaAsset`.
- التوكنات تُخزَّن في التطبيق داخل DataStore غير مشفّر — خطة تحسين مستقبلية: Encryption/Keystore.
- إصدار الإنتاج من التطبيق ما زال يشير لعنوان محلي (`10.0.2.2:3001`) — يجب ضبط `API_BASE_URL` قبل النشر وتفعيل HTTPS فقط.
