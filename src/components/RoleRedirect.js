import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function RoleRedirect() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          navigate("/login");
          return;
        }

        // Check SUPERADMIN
        const superRef = doc(db, "superadmin", user.uid);
        const superSnap = await getDoc(superRef);
        if (superSnap.exists()) {
          navigate("/superadmin-dashboard");
          return;
        }

        // Check ADMIN
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists()) {
          navigate("/admin-dashboard");
          return;
        }

        const portStaffRef = doc(db, "port_staff", user.uid);
        const portStaffSnap = await getDoc(portStaffRef);
        if (portStaffSnap.exists()) {
          navigate("/port-staff-dashboard");
          return;
        }

        // Check USER
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          navigate("/user-dashboard");
          return;
        }

        // Fallback
        alert("No role found for this account!");
        navigate("/login");
      } catch (error) {
        console.error("Role check failed:", error);
        alert("Error checking role: " + error.message);
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    checkRole();
  }, [navigate]);

  if (loading) {
    return <p className="text-center mt-5">Checking role...</p>;
  }

  return null;
}

export default RoleRedirect;
