import { useCallback, useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";
import { FiArrowRight, FiEye, FiEyeOff, FiLock, FiMail } from "react-icons/fi";
import "./Login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const googleSignInPending = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    const resetCancelledGoogleSignIn = () => {
      if (!googleSignInPending.current) {
        return;
      }

      window.setTimeout(() => {
        if (googleSignInPending.current) {
          googleSignInPending.current = false;
          setLoading(false);
        }
      }, 300);
    };

    window.addEventListener("focus", resetCancelledGoogleSignIn);
    document.addEventListener("visibilitychange", resetCancelledGoogleSignIn);
    return () => {
      window.removeEventListener("focus", resetCancelledGoogleSignIn);
      document.removeEventListener("visibilitychange", resetCancelledGoogleSignIn);
    };
  }, []);

  const redirectAuthenticatedUser = useCallback(async (user) => {
    const superDocSnap = await getDoc(doc(db, "superadmin", user.uid));
    if (superDocSnap.exists()) {
      navigate("/superadmin-dashboard");
      return;
    }

    const adminDocSnap = await getDoc(doc(db, "admins", user.uid));
    if (adminDocSnap.exists()) {
      navigate("/admin-dashboard");
      return;
    }

    const portStaffDocSnap = await getDoc(doc(db, "port_staff", user.uid));
    if (portStaffDocSnap.exists()) {
      navigate("/port-staff-dashboard");
      return;
    }

    const userDocSnap = await getDoc(doc(db, "users", user.uid));
    if (userDocSnap.exists()) {
      navigate("/home");
      return;
    }

    setErrorMessage("No role found for this account!");
    navigate("/home");
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

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
      await redirectAuthenticatedUser(user);
      setLoading(false);
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

  const handleGoogleLogin = async () => {
    googleSignInPending.current = true;
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const userCredential = await signInWithPopup(auth, provider);
      googleSignInPending.current = false;
      await redirectAuthenticatedUser(userCredential.user);
    } catch (error) {
      console.error("❌ Google login error:", error.code, error.message);
      if (error.code === "auth/popup-blocked") {
        setErrorMessage("Google sign-in was blocked. Please allow popups for this site and try again.");
      } else if (error.code !== "auth/popup-closed-by-user" && error.code !== "auth/cancelled-popup-request") {
        setErrorMessage("Google sign-in failed. Please try again.");
      }
    } finally {
      googleSignInPending.current = false;
      setLoading(false);
    }
  };

  const openForgotPassword = () => {
    setErrorMessage("");
    setSuccessMessage("");
    setShowForgotPassword(true);
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    setErrorMessage("");
    setSuccessMessage("");

    if (!trimmedEmail) {
      setErrorMessage("Please enter your email.");
      return;
    }

    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setSuccessMessage("Password reset link sent. Please check your email.");
      setShowForgotPassword(false);
    } catch (error) {
      console.error("❌ Password reset error:", error.code, error.message);

      if (error.code === "auth/invalid-email") {
        setErrorMessage("Invalid email format.");
      } else if (error.code === "auth/user-not-found") {
        setErrorMessage("Email not found. Please register first.");
      } else {
        setErrorMessage("Unable to send password reset email. Please try again.");
      }
    } finally {
      setLoading(false);
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
      <div className="card shadow p-4 login-card" style={{ maxWidth: "420px", width: "100%" }}>
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
        {successMessage && (
          <div
            className="alert alert-success"
            role="status"
            style={{ marginBottom: "20px", fontSize: "14px" }}
          >
            {successMessage}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <div className="auth-input-wrap">
              <FiMail className="auth-input-icon" aria-hidden="true" />
              <input
                type="email"
                className="form-control auth-input"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>
          <div className="mb-3">
            <div className="password-input-wrap">
              <FiLock className="auth-input-icon" aria-hidden="true" />
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                className="form-control password-input auth-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                disabled={loading}
              >
                {showPassword ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
              </button>
            </div>
            <button
              type="button"
              className="forgot-password-link"
              onClick={openForgotPassword}
              disabled={loading}
            >
              Forgot Password?
            </button>
          </div>
          <button
            type="submit"
            className="auth-submit-button"
            disabled={loading}
          >
            <span>{loading ? "Logging in..." : "Login"}</span>
            {!loading && <FiArrowRight aria-hidden="true" />}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>
        <button
          type="button"
          className="google-auth-button"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <FcGoogle className="google-auth-icon" aria-hidden="true" />
          Continue with Google
        </button>

        <p className="text-center mt-3 login-register-text">
          Don't have an account?{" "}
          <Link to="/register" className="fw-bold text-decoration-none">
            Register here
          </Link>
        </p>
      </div>

      {showForgotPassword && (
        <div className="forgot-password-backdrop" role="presentation">
          <div
            className="forgot-password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-password-title"
          >
            <button
              type="button"
              className="forgot-password-close"
              onClick={() => setShowForgotPassword(false)}
              disabled={loading}
              aria-label="Close forgot password dialog"
            >
              &times;
            </button>
            <h2 id="forgot-password-title">Forgot Password?</h2>
            <p>Enter the email you use to log in. We will send you a password reset link.</p>
            <form onSubmit={handlePasswordReset}>
              <label htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
                type="email"
                className="form-control"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrorMessage("");
                }}
                autoFocus
                disabled={loading}
                required
              />
              {errorMessage && (
                <div className="alert alert-danger forgot-password-error" role="alert">
                  {errorMessage}
                </div>
              )}
              <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                {loading ? "Sending..." : "Continue"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;
