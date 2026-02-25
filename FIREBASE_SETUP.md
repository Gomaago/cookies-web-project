# دليل إعداد Firebase

هذا الدليل يساعدك على إعداد Firebase بشكل صحيح للتطبيق.

## الخطوة 1: إنشاء مشروع Firebase

1. اذهب إلى [Firebase Console](https://console.firebase.google.com/)
2. انقر على **Add project** (إضافة مشروع)
3. أدخل اسم المشروع (مثلاً: `cookies-web-app`)
4. اختر الدول المناسبة
5. انقر على **Create Project** (إنشاء المشروع)

## الخطوة 2: تفعيل Firebase Authentication

### تفعيل البريد الإلكتروني وكلمة المرور

1. من لوحة التحكم، انتقل إلى **Authentication** (المصادقة)
2. انقر على علامة التبويب **Sign-in method** (طريقة تسجيل الدخول)
3. انقر على **Email/Password** (البريد الإلكتروني/كلمة المرور)
4. فعّل الخيار **Email/Password** بالنقر على المفتاح
5. انقر على **Save** (حفظ)

## الخطوة 3: إنشاء Firestore Database

1. من لوحة التحكم، انتقل إلى **Firestore Database**
2. انقر على **Create database** (إنشاء قاعدة بيانات)
3. اختر **Start in test mode** (ابدأ في وضع الاختبار)
   - ملاحظة: هذا الوضع آمن فقط للتطوير. للإنتاج، استخدم القواعس الآمنة
4. اختر الموقع الجغرافي الأقرب إليك
5. انقر على **Enable** (تفعيل)

## الخطوة 4: الحصول على بيانات المشروع

1. من لوحة التحكم، انقر على أيقونة الإعدادات ⚙️ في الأعلى
2. اختر **Project Settings** (إعدادات المشروع)
3. انتقل إلى علامة التبويب **General** (عام)
4. انزل إلى قسم **Your apps** (تطبيقاتك)
5. إذا لم يكن هناك تطبيق ويب، انقر على أيقونة الويب `</>`
6. أدخل اسم التطبيق (مثلاً: `Cookies Web App`)
7. انقر على **Register app** (تسجيل التطبيق)
8. انسخ بيانات المشروع (firebaseConfig)

## الخطوة 5: تحديث بيانات Firebase في التطبيق

1. افتح ملف `script.js`
2. ابحث عن `const firebaseConfig = {`
3. استبدل البيانات بالقيم التي نسختها:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",                    // من Firebase Console
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## الخطوة 6: إعداد قواعد الأمان

1. من لوحة التحكم، انتقل إلى **Firestore Database**
2. انقر على علامة التبويب **Rules** (القواعس)
3. استبدل القواعس الحالية بالقواعس التالية:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // السماح لكل مستخدم بقراءة وكتابة بيانات حسابه فقط
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

4. انقر على **Publish** (نشر)

## الخطوة 7: اختبار التطبيق

1. افتح ملف `index.html` في متصفحك
2. جرب إنشاء حساب جديد
3. تحقق من ظهور البيانات في Firestore

## نصائح الأمان

### للتطوير (وضع الاختبار)
- استخدم القواعس المرنة أعلاه
- تأكد من أن البيانات الحساسة محمية

### للإنتاج
1. استبدل القواعس بقواعس أكثر صرامة
2. استخدم متغيرات البيئة لتخزين بيانات Firebase
3. فعّل HTTPS
4. استخدم Web App Firewall

## استكشاف الأخطاء الشائعة

### خطأ: "Firebase is not defined"
- تأكد من تحميل مكتبات Firebase في `index.html`
- تحقق من الاتصال بالإنترنت

### خطأ: "PERMISSION_DENIED"
- تحقق من قواعس Firestore
- تأكد من تسجيل دخول المستخدم

### خطأ: "Invalid API Key"
- تأكد من نسخ البيانات بشكل صحيح
- تحقق من تفعيل API في Firebase

## الموارد الإضافية

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Guide](https://firebase.google.com/docs/firestore)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
