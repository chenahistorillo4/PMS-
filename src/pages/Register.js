import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { FcGoogle } from "react-icons/fc";
import { FiArrowRight, FiEye, FiEyeOff, FiLock, FiMail, FiUser } from "react-icons/fi";
import "./Register.css";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      setLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name,
        email,
        createdAt: new Date(),
        phone: "",
        address: "",
        photoURL: "",
        role: "passenger",
      });

      alert("Account created successfully! Please log in with your email and password.");
      navigate("/login");
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    googleSignInPending.current = true;
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const userCredential = await signInWithPopup(auth, provider);
      googleSignInPending.current = false;
      const user = userCredential.user;
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await setDoc(userDocRef, {
          uid: user.uid,
          name: user.displayName || "",
          email: user.email || "",
          createdAt: new Date(),
          phone: "",
          address: "",
          photoURL: user.photoURL || "",
          role: "passenger",
        });
      }

      navigate("/home");
    } catch (error) {
      console.error("❌ Google registration error:", error.code, error.message);
      if (error.code === "auth/popup-blocked") {
        alert("Google sign-in was blocked. Please allow popups for this site and try again.");
      } else if (error.code !== "auth/popup-closed-by-user" && error.code !== "auth/cancelled-popup-request") {
        alert("Google sign-up failed. Please try again.");
      }
    } finally {
      googleSignInPending.current = false;
      setLoading(false);
    }
  };

  return (
    <div
      className="register-page"
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? "15px" : "20px",
      }}
    >
      <div
        className="card shadow p-4 register-card"
        style={{
          maxWidth: isMobile ? "90%" : "420px",
          width: "100%",
          minHeight: "auto",
        }}
      >
        <div
          className="register-header"
          style={{
            textAlign: "center",
            marginBottom: isMobile ? "20px" : "30px",
          }}
        >
          <div
            className="register-logo-shell"
            style={{
              width: isMobile ? "100px" : "120px",
              height: isMobile ? "70px" : "80px",
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
              className="register-logo"
              src="/logoo.png"
              alt="Ferry Logo"
              style={{
                height: isMobile ? "60px" : "80px",
                objectFit: "contain",
              }}
            />
          </div>
          <h2
            className="fw-bold text-center register-title"
            style={{
              margin: "0 0 8px 0",
              fontSize: isMobile ? "1.3rem" : "1.5rem",
            }}
          >
            Create Account
          </h2>
          <p
            className="text-center register-subtitle"
            style={{
              color: "#666",
              fontSize: isMobile ? "0.85rem" : "14px",
              margin: "0",
            }}
          >
            Sign up to get started
          </p>
        </div>

        <form onSubmit={handleRegister}>
          <div className="mb-3">
            <div className="auth-input-wrap">
              <FiUser className="auth-input-icon" aria-hidden="true" />
              <input
                type="text"
                className="form-control register-control auth-input"
                placeholder="Full name"
                style={{ fontSize: isMobile ? "0.95rem" : "1rem" }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="mb-3">
            <div className="auth-input-wrap">
              <FiMail className="auth-input-icon" aria-hidden="true" />
              <input
                type="email"
                className="form-control register-control auth-input"
                placeholder="Email"
                style={{ fontSize: isMobile ? "0.95rem" : "1rem" }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="mb-3">
            <div className="register-password-wrap">
              <FiLock className="auth-input-icon" aria-hidden="true" />
              <input
                type={showPassword ? "text" : "password"}
                className="form-control register-control register-password-input auth-input"
                placeholder="Password"
                style={{ fontSize: isMobile ? "0.95rem" : "1rem" }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                className="password-toggle-btn register-password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="mb-3">
            <div className="register-password-wrap">
              <FiLock className="auth-input-icon" aria-hidden="true" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                className="form-control register-control register-password-input auth-input"
                placeholder="Confirm password"
                style={{ fontSize: isMobile ? "0.95rem" : "1rem" }}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                className="password-toggle-btn register-password-toggle-btn"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                aria-pressed={showConfirmPassword}
                title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirmPassword ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="auth-submit-button register-submit"
            style={{ fontSize: isMobile ? "0.95rem" : "1rem" }}
            disabled={loading}
          >
            <span>{loading ? "Creating Account..." : "Create Account"}</span>
            {!loading && <FiArrowRight aria-hidden="true" />}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>
        <button
          type="button"
          className="google-auth-button"
          onClick={handleGoogleRegister}
          disabled={loading}
        >
          <FcGoogle className="google-auth-icon" aria-hidden="true" />
          Continue with Google
        </button>

        <p className="text-center mt-3 register-login-text" style={{ fontSize: isMobile ? "0.85rem" : "14px" }}>
          Already have an account?{" "}
          <Link to="/login" className="fw-bold text-decoration-none" style={{ color: "#0d5f7a" }}>
            Login here
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
