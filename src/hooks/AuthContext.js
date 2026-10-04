import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext({ user: null, role: null, authReady: false });

const ROLE_COLLECTIONS = [
  ["superadmin", "superadmin"],
  ["admin", "admins"],
  ["portstaff", "port_staff"],
  ["portstaff", "qr_scanners"],
  ["user", "users"],
];

async function getUserRole(user) {
  let claimRole = null;
  try {
    const tokenResult = await user.getIdTokenResult();
    claimRole = String(tokenResult.claims.role || "")
      .toLowerCase()
      .replace(/[_-]/g, "");
  } catch (error) {
    console.warn("Could not read Firebase role claim; checking Firestore role documents.", error);
  }

  if (["superadmin", "admin", "portstaff", "scanner", "qrscanner", "user"].includes(claimRole)) {
    return ["scanner", "qrscanner"].includes(claimRole) ? "portstaff" : claimRole;
  }

  for (const [roleName, collectionName] of ROLE_COLLECTIONS) {
    const roleSnapshot = await getDoc(doc(db, collectionName, user.uid));
    if (roleSnapshot.exists()) {
      if (roleName === "portstaff" && roleSnapshot.data().status === "inactive") {
        return null;
      }
      return roleName;
    }
  }

  return null;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        if (active) {
          setUser(null);
          setRole(null);
          setAuthReady(true);
        }
        return;
      }

      try {
        const currentRole = await getUserRole(currentUser);
        if (active) {
          setUser(currentUser);
          setRole(currentRole);
          setAuthReady(true);
        }
      } catch (error) {
        console.error("Failed to verify account role:", error);
        if (active) {
          setUser(currentUser);
          setRole(null);
          setAuthReady(true);
        }
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, authReady }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
