import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';

export const USERS = [
  { username: 'adminC3', password: 'admin123', role: 'Admin C3', name: 'Iwan Gunawan', companyId: 'COMPANY_C3_CORP' },
  { username: 'petugasC3', password: 'petugas123', role: 'Petugas', name: 'Arief Nugroho', companyId: 'COMPANY_C3_CORP' },
  { username: 'kasiejkt', password: 'kasiejkt123', role: 'Kepala Gudang JKT', name: 'Moch. Johar Prasojo', companyId: 'COMPANY_C3_CORP' },
  { username: 'admin', password: 'admin123', role: 'Super Admin', name: 'HQ Warehouse', companyId: 'COMPANY_C3_CORP' },
  { username: 'adji', password: 'adji123', role: 'Developer', name: 'Adji Prasetyo', companyId: 'COMPANY_C3_CORP' }
];

export const loginUser = async (usernameOrEmail: string, password: string) => {
  const email = usernameOrEmail.trim().includes('@') 
    ? usernameOrEmail.trim() 
    : `${usernameOrEmail.trim().toLowerCase()}@gudangpsn.com`;

  try {
    // 1. Try to login with Firebase Auth first
    let firebaseUser;
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      firebaseUser = userCredential.user;
    } catch (fbErr: any) {
      console.warn("Firebase Auth sign-in failed/user not found. Checking DB fallback...", fbErr);
      
      // If Firebase auth fails (e.g., user is not in Firebase but exists in MongoDB/Static list),
      // we try to authenticate with server-side DB. If successful, we auto-register them on Firebase.
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail, password })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Password salah atau akun tidak terdaftar di sistem.");
      }

      const sessionUser = await response.json();

      // Attempt to register the verified user in Firebase Auth so future logins use Firebase directly
      try {
        const createCred = await createUserWithEmailAndPassword(auth, email, password);
        firebaseUser = createCred.user;
        console.log("Auto-registered existing user on Firebase Auth:", email);
      } catch (createErr) {
        console.warn("Firebase auto-registration warning:", createErr);
      }

      localStorage.setItem('currentUser', JSON.stringify(sessionUser));
      return sessionUser;
    }

    // 2. Firebase sign-in was successful. Now retrieve profile from MongoDB and create session.
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        usernameOrEmail, 
        password,
        firebaseUid: firebaseUser.uid,
        firebaseEmail: firebaseUser.email
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Gagal mendapatkan profil pengguna dari database.");
    }

    const sessionUser = await response.json();
    localStorage.setItem('currentUser', JSON.stringify(sessionUser));
    return sessionUser;

  } catch (err: any) {
    console.warn("Authentication failed, checking local static fallbacks...", err);
    
    // Client-side static fallback if backend is offline or completely unavailable
    const cleanUsername = usernameOrEmail.trim().toLowerCase().split('@')[0];
    const staticUser = USERS.find(
      u => u.username.toLowerCase() === cleanUsername && u.password === password
    );

    if (staticUser) {
      const sessionUser = {
        uid: 'static-' + staticUser.username,
        username: staticUser.username,
        role: staticUser.role,
        name: staticUser.name,
        companyId: staticUser.companyId,
        sessionId: 'FALLBACK_' + Math.random().toString(36).substring(2, 10),
        isLocalFallback: true
      };
      localStorage.setItem('currentUser', JSON.stringify(sessionUser));
      return sessionUser;
    }
    
    throw new Error(err.message || "Password salah atau akun tidak terdaftar di sistem.");
  }
};

export const registerUser = async (fullName: string, usernameInput: string, emailInput: string, roleInput: string, passwordInput: string, companyIdOverride?: string) => {
  const loggedInStr = localStorage.getItem('currentUser');
  const companyId = companyIdOverride || (loggedInStr ? JSON.parse(loggedInStr).companyId || 'COMPANY_C3_CORP' : 'COMPANY_C3_CORP');
  const email = emailInput || `${usernameInput.trim().toLowerCase()}@gudangpsn.com`;

  try {
    // 1. Register in Firebase Auth first
    try {
      await createUserWithEmailAndPassword(auth, email, passwordInput);
      console.log("Successfully registered user in Firebase Auth:", email);
    } catch (fbErr: any) {
      console.warn("Firebase Auth registration warning:", fbErr);
      if (fbErr.code !== 'auth/email-already-in-use') {
        throw new Error(`Firebase Auth: ${fbErr.message}`);
      }
    }

    // 2. Register in MongoDB profiles via backend API
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName,
        username: usernameInput,
        email,
        role: roleInput,
        password: passwordInput,
        companyId
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Gagal mendaftarkan user.");
    }

    return await response.json();
  } catch (err: any) {
    console.error("Gagal mendaftarkan user:", err);
    throw new Error(err.message || "Gagal mendaftarkan user.");
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth);
  } catch (fbErr) {
    console.warn("Firebase Auth sign-out warning:", fbErr);
  }
  localStorage.removeItem('currentUser');
};

export const getCurrentUser = () => {
  const stored = localStorage.getItem('currentUser');
  return stored ? JSON.parse(stored) : null;
};
