import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import "./Register.css";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      alert("Passwords do not match!");
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
          maxWidth: isMobile ? "90%" : "400px",
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
            <label className="form-label" style={{ fontSize: isMobile ? "0.9rem" : "1rem" }}>
              Name
            </label>
            <input
              type="text"
              className="form-control register-control"
              style={{ fontSize: isMobile ? "0.95rem" : "1rem" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label" style={{ fontSize: isMobile ? "0.9rem" : "1rem" }}>
              Email
            </label>
            <input
              type="email"
              className="form-control register-control"
              style={{ fontSize: isMobile ? "0.95rem" : "1rem" }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label" style={{ fontSize: isMobile ? "0.9rem" : "1rem" }}>
              Password
            </label>
            <input
              type="password"
              className="form-control register-control"
              style={{ fontSize: isMobile ? "0.95rem" : "1rem" }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label" style={{ fontSize: isMobile ? "0.9rem" : "1rem" }}>
              Confirm Password
            </label>
            <input
              type="password"
              className="form-control register-control"
              style={{ fontSize: isMobile ? "0.95rem" : "1rem" }}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-100 fw-bold register-submit"
            style={{ fontSize: isMobile ? "0.95rem" : "1rem" }}
          >
            Create Account
          </button>
        </form>

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
