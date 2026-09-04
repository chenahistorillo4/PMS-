import { useState, useEffect } from "react";
import { accountCreationAuth, db } from "../../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import SuperadminLayout from "./SuperadminLayout";
import { useNavigate } from "react-router-dom";
import "./CreateQRScanner.css";

function CreateQRScanner() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!name.trim() || !email.trim() || !password.trim()) {
      alert("Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(accountCreationAuth, email, password);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, "qr_scanners", uid), {
        uid,
        name,
        email,
        role: "qr_scanner",
        permissions: ["scan_qr"],
        status: "active",
        createdAt: new Date(),
        lastLogin: null
      });

      alert("QR Scanner account created successfully!");
      setName("");
      setEmail("");
      setPassword("");
      navigate("/manage-qr-scanners");
    } catch (error) {
      if (error.code === "auth/email-already-in-use") {
        alert("Email is already in use");
      } else if (error.code === "auth/invalid-email") {
        alert("Invalid email address");
      } else {
        alert("Error creating QR Scanner account: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SuperadminLayout active="create-qr-scanner">
      <div className="create-scanner-container">
        <div className="create-scanner-form-wrapper">
          <h3 className="create-scanner-title">Create QR Scanner Account</h3>

          <form onSubmit={handleSubmit} className="create-scanner-form">
            {/* Name Field */}
            <div className="form-group">
              <label className="form-group-label">Full Name</label>
              <input
                type="text"
                className="form-group-input"
                placeholder="Enter full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Email Field */}
            <div className="form-group">
              <label className="form-group-label">Email Address</label>
              <input
                type="email"
                className="form-group-input"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label className="form-group-label">Temporary Password</label>
              <input
                type="password"
                className="form-group-input"
                placeholder="Enter temporary password (min. 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <small style={{
                display: "block",
                marginTop: "6px",
                color: "#666",
                fontSize: "0.9rem"
              }}>
                Password must be at least 6 characters long
              </small>
            </div>

            {/* Info Box */}
            <div style={{
              backgroundColor: "#e3f2fd",
              border: "1px solid #90caf9",
              borderRadius: "6px",
              padding: "10px",
              marginBottom: "12px",
              fontSize: "0.9rem",
              color: "#1565c0",
              lineHeight: "1.4"
            }}>
              <strong>ℹ️ Info:</strong><br />
              • Scan-only access<br />
              • No admin features<br />
            </div>

            {/* Action Buttons */}
            <div style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap"
            }}>
              <button
                type="submit"
                disabled={loading}
                className="create-scanner-button"
                style={{
                  flex: "1 1 calc(50% - 4px)"
                }}
              >
                {loading ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/manage-qr-scanners")}
                style={{
                  flex: "1 1 calc(50% - 4px)",
                  padding: "12px 12px",
                  backgroundColor: "#f5f5f5",
                  color: "#333",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontWeight: "600",
                  fontSize: "1rem",
                  cursor: "pointer",
                  transition: "all 0.3s ease"
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = "#e0e0e0";
                  e.target.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = "#f5f5f5";
                  e.target.style.transform = "translateY(0)";
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </SuperadminLayout>
  );
}

export default CreateQRScanner;
