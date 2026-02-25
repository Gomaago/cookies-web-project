// إعدادات Firebase
// ملاحظة: يجب استبدال هذه القيم ببيانات مشروعك على Firebase
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// الحصول على عناصر DOM
const welcome = document.getElementById("welcome");
const authSection = document.getElementById("auth-section");
const settingsSection = document.getElementById("settings-section");

/**
 * تسجيل مستخدم جديد
 * يقوم بإنشاء حساب جديد باستخدام البريد الإلكتروني وكلمة المرور
 */
function signup() {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    // التحقق من صحة البيانات
    if (!email || !password) {
        alert("يرجى ملء جميع الحقول");
        return;
    }

    if (password.length < 6) {
        alert("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
        return;
    }

    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            console.log("تم التسجيل بنجاح:", userCredential.user.uid);
            initUser(userCredential.user);
        })
        .catch(err => {
            console.error("خطأ في التسجيل:", err);
            alert("خطأ في التسجيل: " + err.message);
        });
}

/**
 * تسجيل دخول المستخدم
 * يقوم بتسجيل دخول مستخدم موجود باستخدام البريد الإلكتروني وكلمة المرور
 */
function login() {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    // التحقق من صحة البيانات
    if (!email || !password) {
        alert("يرجى ملء جميع الحقول");
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            console.log("تم تسجيل الدخول بنجاح:", userCredential.user.uid);
            initUser(userCredential.user);
        })
        .catch(err => {
            console.error("خطأ في تسجيل الدخول:", err);
            alert("خطأ في تسجيل الدخول: " + err.message);
        });
}

/**
 * إعداد بيانات المستخدم
 * يقوم بتحميل إعدادات المستخدم من Firestore أو إنشاء إعدادات افتراضية
 */
function initUser(user) {
    // إخفاء قسم المصادقة وإظهار قسم الإعدادات
    authSection.style.display = "none";
    settingsSection.style.display = "block";

    // الحصول على بيانات المستخدم من Firestore
    const userRef = db.collection("users").doc(user.uid);
    userRef.get().then(doc => {
        if (doc.exists) {
            // المستخدم موجود بالفعل، تحميل بيانات المستخدم
            const data = doc.data();
            console.log("تم تحميل بيانات المستخدم:", data);
            
            welcome.innerText = `أهلاً ${data.username || "المستخدم"}! مرحباً بعودتك.`;
            document.getElementById("username").value = data.username || "";
            document.getElementById("language").value = data.language || "العربية";
            document.getElementById("bgcolor").value = data.bgcolor || "#ffffff";
            document.body.style.backgroundColor = data.bgcolor || "#ffffff";
        } else {
            // مستخدم جديد، إنشاء بيانات افتراضية
            const defaultData = {
                username: "",
                language: "العربية",
                bgcolor: "#ffffff",
                email: user.email,
                createdAt: new Date(),
                lastVisit: new Date()
            };
            
            userRef.set(defaultData).then(() => {
                console.log("تم إنشاء بيانات المستخدم الجديد");
                welcome.innerText = "أهلاً بك! يرجى إدخال بياناتك";
                document.getElementById("username").value = "";
                document.getElementById("language").value = "العربية";
                document.getElementById("bgcolor").value = "#ffffff";
            });
        }
    }).catch(err => {
        console.error("خطأ في تحميل بيانات المستخدم:", err);
        alert("خطأ في تحميل البيانات");
    });
}

/**
 * حفظ إعدادات المستخدم
 * يقوم بحفظ الاسم واللغة ولون الخلفية في Firestore
 */
function savePreferences() {
    const user = auth.currentUser;
    if (!user) {
        alert("يجب تسجيل الدخول أولاً");
        return;
    }

    const username = document.getElementById("username").value.trim();
    const language = document.getElementById("language").value;
    const bgcolor = document.getElementById("bgcolor").value;

    // التحقق من صحة البيانات
    if (!username) {
        alert("يرجى إدخال اسمك");
        return;
    }

    const data = {
        username: username,
        language: language,
        bgcolor: bgcolor,
        email: user.email,
        lastVisit: new Date()
    };

    db.collection("users").doc(user.uid).set(data, { merge: true })
        .then(() => {
            console.log("تم حفظ الإعدادات بنجاح");
            welcome.innerText = `أهلاً ${username}! تم حفظ إعداداتك بنجاح.`;
            document.body.style.backgroundColor = bgcolor;
            
            // تطبيق اللغة إذا لزم الأمر (يمكن توسيع هذا لاحقاً)
            console.log("اللغة المختارة:", language);
        })
        .catch(err => {
            console.error("خطأ في حفظ الإعدادات:", err);
            alert("خطأ في حفظ الإعدادات: " + err.message);
        });
}

/**
 * تسجيل الخروج
 * يقوم بتسجيل خروج المستخدم الحالي
 */
function logout() {
    auth.signOut().then(() => {
        console.log("تم تسجيل الخروج بنجاح");
        
        // إعادة تعيين الواجهة
        authSection.style.display = "block";
        settingsSection.style.display = "none";
        welcome.innerText = "مرحباً بك!";
        document.body.style.backgroundColor = "#ffffff";
        
        // مسح حقول الإدخال
        document.getElementById("email").value = "";
        document.getElementById("password").value = "";
        document.getElementById("username").value = "";
        document.getElementById("language").value = "العربية";
        document.getElementById("bgcolor").value = "#ffffff";
    })
    .catch(err => {
        console.error("خطأ في تسجيل الخروج:", err);
        alert("خطأ في تسجيل الخروج: " + err.message);
    });
}

/**
 * متابعة حالة تسجيل الدخول
 * يتحقق من حالة المستخدم عند تحميل الصفحة أو عند تغيير حالة المصادقة
 */
auth.onAuthStateChanged(user => {
    if (user) {
        console.log("المستخدم مسجل دخول:", user.uid);
        initUser(user);
    } else {
        console.log("لا يوجد مستخدم مسجل دخول");
        // إعادة تعيين الواجهة
        authSection.style.display = "block";
        settingsSection.style.display = "none";
        welcome.innerText = "مرحباً بك!";
        document.body.style.backgroundColor = "#ffffff";
    }
});
