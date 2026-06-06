import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import "./Login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    if (!email.trim()) {
      setErrorMessage("Please enter your email");
      setLoading(false);
      return;
    }

    if (!password.trim()) {
      setErrorMessage("Please enter your password");
      setLoading(false);
      return;
    }

    try {
      console.log("🔐 Attempting login with:", email);
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;
      console.log("✓ Authentication successful. UID:", user.uid);

      // Check SUPERADMIN collection
      const superDocRef = doc(db, "superadmin", user.uid);
      const superDocSnap = await getDoc(superDocRef);

      if (superDocSnap.exists()) {
        console.log("✓ Found SUPERADMIN role");
        navigate("/superadmin-dashboard");
        return;
      }

      // Check ADMINS collection
      const adminDocRef = doc(db, "admins", user.uid);
      const adminDocSnap = await getDoc(adminDocRef);

      if (adminDocSnap.exists()) {
        console.log("✓ Found ADMIN role");
        navigate("/admin-dashboard");
        return;
      }

      // Check SCANNERS collection
      const scannerDocRef = doc(db, "qr_scanners", user.uid);
      const scannerDocSnap = await getDoc(scannerDocRef);

      if (scannerDocSnap.exists()) {
        console.log("✓ Found SCANNER role");
        navigate("/qr-scanner");
        return;
      }

      // Check USERS collection
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        console.log("✓ Found USER role");
        setLoading(false);
        navigate("/home");
        return;
      }

      // Fallback
      console.log("⚠ No role document found!");
      setErrorMessage("No role found for this account!");
      setLoading(false);
      navigate("/home");
    } catch (error) {
      console.error("❌ Login error:", error.code, error.message);
      setLoading(false);
      
      if (error.code === "auth/user-not-found") {
        setErrorMessage("Email not found. Please register first.");
      } else if (error.code === "auth/wrong-password") {
        setErrorMessage("Incorrect password. Please try again.");
      } else if (error.code === "auth/invalid-email") {
        setErrorMessage("Invalid email format.");
      } else if (error.code === "auth/invalid-credential") {
        setErrorMessage("Invalid email or password.");
      } else {
        setErrorMessage("Login failed: " + error.message);
      }
    }
  };

  return (
    <div
      className="login-page"
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div className="card shadow p-4 login-card" style={{ maxWidth: "400px", width: "100%" }}>
        <div className="login-header" style={{ textAlign: "center", marginBottom: "30px" }}>
          <div
            className="login-logo-shell"
            style={{
              width: "120px",
              height: "80px",
              borderRadius: "100px 100px 0 0",
              overflow: "hidden",
              margin: "0 auto 15px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#f0f8ff",
              boxShadow: "0 4px 12px rgba(13, 95, 122, 0.15)",
            }}
          >
            <img
              className="login-logo"
              src="/logoo.png"
              alt="Ferry Logo"
              style={{
                height: "80px",
                objectFit: "contain",
              }}
            />
          </div>
          <h2 className="fw-bold text-center login-title" style={{ margin: "0 0 8px 0" }}>
            Welcome Back
          </h2>
          <p
            className="text-center login-subtitle"
            style={{ color: "#666", fontSize: "14px", margin: "0" }}
          >
            Sign in to your account
          </p>
        </div>

        <h2 className="fw-bold text-center mb-4" style={{ display: "none" }}>
          Login
        </h2>

        {errorMessage && (
          <div
            className="alert alert-danger"
            role="alert"
            style={{ marginBottom: "20px", fontSize: "14px" }}
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-100"
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="text-center mt-3 login-register-text">
          Don't have an account?{" "}
          <Link to="/register" className="fw-bold text-decoration-none">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
