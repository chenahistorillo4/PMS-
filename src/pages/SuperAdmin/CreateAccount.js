import { useState, useEffect } from "react";
import { accountCreationAuth, db } from "../../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, collection, getDocs } from "firebase/firestore";
import SuperadminLayout from "./SuperadminLayout";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ensureBoatExists } from "../../utils/boatHelpers";

function CreateAccount() {
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get("type"); // Get type from URL (admin or scanner)
  const isFixedType = !!typeParam; // If type is specified in URL, don't allow switching
  
  const [accountType, setAccountType] = useState(typeParam || "admin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [boat, setBoat] = useState("");
  const [route, setRoute] = useState("");
  const [boats, setBoats] = useState([]);
  const [availableRoutes, setAvailableRoutes] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const navigate = useNavigate();

  // Resize listener for mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch boats from Firestore
  useEffect(() => {
    const fetchBoats = async () => {
      const querySnapshot = await getDocs(collection(db, "boats"));
      const boatList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBoats(boatList);
    };
    fetchBoats();
  }, []);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setBoat("");
    setRoute("");
    setAvailableRoutes("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!name.trim() || !email.trim() || !password.trim()) {
      alert("Please fill in all required fields");
      return;
    }

    if (password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    if (accountType === "admin" && (!boat || !route || !availableRoutes.trim())) {
      alert("Please select a boat, enter route, and available routes for admin accounts");
      return;
    }

    if (accountType === "scanner" && !boat) {
      alert("Please select the boat assigned to this QR scanner");
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(accountCreationAuth, email, password);
      const uid = userCredential.user.uid;

      if (accountType === "admin") {
        // Create Admin Account
        let assignedBoat = boat;
        let assignedRoute = route;

        await ensureBoatExists(
          db,
          boat,
          route,
          availableRoutes.split(",").map(r => r.trim()).filter(Boolean)
        );

        await setDoc(doc(db, "admins", uid), {
          uid,
          name,
          email,
          phone: phone.trim() || null,
          role: "admin",
          assignedBoat: assignedBoat,
          assignedRoute: assignedRoute,
          availableRoutes: availableRoutes.split(",").map(r => r.trim()),
          createdAt: new Date()
        });

        alert("Admin account created successfully!");
        navigate("/manage-admins");
      } else {
        // Create QR Scanner Account
        await setDoc(doc(db, "qr_scanners", uid), {
          uid,
          name,
          email,
          role: "qr_scanner",
          assignedBoat: boat,
          assignedRoute: boats.find((item) => item.name === boat)?.route || null,
          phone: phone.trim() || null,
          permissions: ["scan_qr"],
          status: "active",
          createdAt: new Date(),
          lastLogin: null
        });

        alert("QR Scanner account created successfully!");
        navigate("/manage-qr-scanners");
      }

      resetForm();
    } catch (error) {
      if (error.code === "auth/email-already-in-use") {
        alert("Email is already in use");
      } else if (error.code === "auth/invalid-email") {
        alert("Invalid email address");
      } else {
        alert("Error creating account: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SuperadminLayout active="create-account">
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        minHeight: "100%",
        padding: isMobile ? "12px" : "20px",
        position: "sticky",
        top: "0",
        zIndex: "100",
        backgroundColor: "transparent",
        width: "100%"
      }}>
        <div style={{
          width: "100%",
          maxWidth: isFixedType ? (isMobile ? "calc(100% - 24px)" : "450px") : (isMobile ? "calc(100% - 24px)" : "750px"),
          margin: "0 auto"
        }}>
          {/* Header */}
          <div style={{
            marginBottom: isMobile ? "20px" : "30px",
            textAlign: "center"
          }}>
            <h3 style={{
              margin: "0 0 10px 0",
              color: "#333",
              fontWeight: "800",
              fontSize: isMobile ? "1.3rem" : "1.8rem"
            }}>
              {isFixedType 
                ? (accountType === "admin" ? "Create Admin Account" : "Create QR Scanner Account")
                : "Create New Account"
              }
            </h3>
            <p style={{
              color: "#666",
              fontSize: isMobile ? "0.8rem" : "0.95rem",
              margin: "0"
            }}>
              {isFixedType
                ? (accountType === "admin" 
                    ? "Create a new admin account to manage routes and bookings"
                    : "Create a new QR scanner account for staff")
                : "Create admin or QR scanner accounts for your team"
              }
            </p>
          </div>

          {/* Account Type Selector - Tabs (only show if no specific type in URL) */}
          {!isFixedType && (
          <div style={{
            display: "flex",
            gap: isMobile ? "8px" : "10px",
            marginBottom: isMobile ? "20px" : "30px",
            flexWrap: "wrap",
            borderBottom: "2px solid #e0e0e0",
            paddingBottom: "0",
            justifyContent: "center"
          }}>
          <button
            type="button"
            onClick={() => {
              setAccountType("admin");
              resetForm();
            }}
            style={{
              padding: isMobile ? "10px 16px" : "12px 24px",
              border: "none",
              backgroundColor: accountType === "admin" ? "#1976d2" : "transparent",
              color: accountType === "admin" ? "white" : "#666",
              fontSize: isMobile ? "0.9rem" : "1rem",
              fontWeight: accountType === "admin" ? "700" : "600",
              cursor: "pointer",
              borderRadius: "8px 8px 0 0",
              transition: "all 0.3s ease",
              borderBottom: accountType === "admin" ? "3px solid #1565c0" : "none"
            }}
            onMouseEnter={(e) => {
              if (accountType !== "admin") {
                e.target.style.backgroundColor = "#f5f5f5";
              }
            }}
            onMouseLeave={(e) => {
              if (accountType !== "admin") {
                e.target.style.backgroundColor = "transparent";
              }
            }}
          >
            Admin Account
          </button>
          <button
            type="button"
            onClick={() => {
              setAccountType("scanner");
              resetForm();
            }}
            style={{
              padding: isMobile ? "10px 16px" : "12px 24px",
              border: "none",
              backgroundColor: accountType === "scanner" ? "#1976d2" : "transparent",
              color: accountType === "scanner" ? "white" : "#666",
              fontSize: isMobile ? "0.9rem" : "1rem",
              fontWeight: accountType === "scanner" ? "700" : "600",
              cursor: "pointer",
              borderRadius: "8px 8px 0 0",
              transition: "all 0.3s ease",
              borderBottom: accountType === "scanner" ? "3px solid #1565c0" : "none"
            }}
            onMouseEnter={(e) => {
              if (accountType !== "scanner") {
                e.target.style.backgroundColor = "#f5f5f5";
              }
            }}
            onMouseLeave={(e) => {
              if (accountType !== "scanner") {
                e.target.style.backgroundColor = "transparent";
              }
            }}
          >
            QR Scanner Account
          </button>
        </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{
          backgroundColor: "white",
          padding: isMobile ? "20px" : "30px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
        }}>
          {/* Name Field */}
          <div style={{ marginBottom: isMobile ? "16px" : "20px" }}>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "600",
              color: "#333",
              fontSize: isMobile ? "0.85rem" : "0.95rem"
            }}>
              Full Name *
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="Enter full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                padding: "12px",
                borderRadius: "6px",
                border: "1px solid #ddd",
                fontSize: isMobile ? "16px" : "1rem",
                transition: "all 0.3s ease"
              }}
              onFocus={(e) => e.target.style.borderColor = "#1976d2"}
              onBlur={(e) => e.target.style.borderColor = "#ddd"}
            />
          </div>

          {/* Email Field */}
          <div style={{ marginBottom: isMobile ? "16px" : "20px" }}>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "600",
              color: "#333",
              fontSize: isMobile ? "0.85rem" : "0.95rem"
            }}>
              Email Address *
            </label>
            <input
              type="email"
              className="form-control"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                padding: "12px",
                borderRadius: "6px",
                border: "1px solid #ddd",
                fontSize: isMobile ? "16px" : "1rem",
                transition: "all 0.3s ease"
              }}
              onFocus={(e) => e.target.style.borderColor = "#1976d2"}
              onBlur={(e) => e.target.style.borderColor = "#ddd"}
            />
          </div>

          {(accountType === "admin" || accountType === "scanner") && (
          <div style={{ marginBottom: isMobile ? "16px" : "20px" }}>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "600",
              color: "#333",
              fontSize: isMobile ? "0.85rem" : "0.95rem"
            }}>
              {accountType === "admin" ? "Phone Number (for SMS alerts)" : "Contact Details"}
            </label>
            <input
              type="tel"
              className="form-control"
              placeholder="09XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{
                padding: "12px",
                borderRadius: "6px",
                border: "1px solid #ddd",
                fontSize: isMobile ? "16px" : "1rem",
                transition: "all 0.3s ease",
                width: "100%",
                boxSizing: "border-box"
              }}
              onFocus={(e) => e.target.style.borderColor = "#1976d2"}
              onBlur={(e) => e.target.style.borderColor = "#ddd"}
            />
            <small style={{ display: "block", marginTop: "6px", color: "#666", fontSize: "0.85rem" }}>
              {accountType === "admin" ? "Admin receives SMS for new bookings, refunds, and trip alerts" : "Contact number for this QR scanner"}
            </small>
          </div>
          )}

          {/* Password Field */}
          <div style={{ marginBottom: isMobile ? "20px" : "25px" }}>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "600",
              color: "#333",
              fontSize: isMobile ? "0.85rem" : "0.95rem"
            }}>
              Password *
            </label>
            <input
              type="password"
              className="form-control"
              placeholder="Enter password (min. 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                padding: "12px",
                borderRadius: "6px",
                border: "1px solid #ddd",
                fontSize: isMobile ? "16px" : "1rem",
                transition: "all 0.3s ease"
              }}
              onFocus={(e) => e.target.style.borderColor = "#1976d2"}
              onBlur={(e) => e.target.style.borderColor = "#ddd"}
            />
            <small style={{
              display: "block",
              marginTop: "6px",
              color: "#666",
              fontSize: isMobile ? "0.75rem" : "0.9rem"
            }}>
              Password must be at least 6 characters long
            </small>
          </div>

          {/* Admin-Specific Fields */}
          {accountType === "admin" && (
            <>
              <div style={{
                backgroundColor: "#f8f9fa",
                padding: isMobile ? "16px" : "20px",
                borderRadius: "8px",
                marginBottom: isMobile ? "20px" : "25px",
                border: "1px solid #e9ecef"
              }}>
                <h5 style={{
                  margin: "0 0 15px 0",
                  color: "#333",
                  fontWeight: "700",
                  fontSize: isMobile ? "1rem" : "1.1rem"
                }}>
                  Boat & Route Assignment
                </h5>

                {/* Boat Selection - Input Field */}
                <div style={{ marginBottom: isMobile ? "12px" : "15px" }}>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#333",
                    fontSize: isMobile ? "0.85rem" : "0.95rem"
                  }}>
                    Boat Name *
                  </label>
                  <input
                    type="text"
                    placeholder="Enter or select boat name"
                    value={boat}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBoat(value);
                      const selectedBoat = boats.find(b => b.name === value);
                      if (selectedBoat) {
                        setRoute(selectedBoat.route);
                        const routes = Array.isArray(selectedBoat.availableRoutes)
                          ? selectedBoat.availableRoutes
                          : selectedBoat.route ? [selectedBoat.route] : [];
                        setAvailableRoutes(routes.join(", "));
                      } else {
                        setAvailableRoutes("");
                      }
                    }}
                    list="boat-suggestions"
                    style={{
                      padding: "12px",
                      borderRadius: "6px",
                      border: "1px solid #ddd",
                      fontSize: isMobile ? "16px" : "1rem",
                      transition: "all 0.3s ease"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                    onBlur={(e) => e.target.style.borderColor = "#ddd"}
                  />
                  <datalist id="boat-suggestions">
                    {boats.map((b) => (
                      <option key={b.id} value={b.name} />
                    ))}
                  </datalist>
                  <small style={{
                    display: "block",
                    marginTop: "6px",
                    color: "#666",
                    fontSize: isMobile ? "0.75rem" : "0.9rem"
                  }}>
                    Type to search existing boats or enter a new boat name
                  </small>
                </div>

                {/* Boat Route - if creating new */}
                {boat && !boats.find(b => b.name === boat) && (
                  <div style={{ marginBottom: isMobile ? "12px" : "15px" }}>
                    <label style={{
                      display: "block",
                      marginBottom: "8px",
                      fontWeight: "600",
                      color: "#333",
                      fontSize: isMobile ? "0.85rem" : "0.95rem"
                    }}>
                      Boat Route *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Enter boat route"
                      value={route}
                      onChange={(e) => setRoute(e.target.value)}
                      required
                      style={{
                        padding: "12px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        fontSize: isMobile ? "16px" : "1rem"
                      }}
                    />
                  </div>
                )}

                {/* Route - if existing boat selected */}
                {boats.find(b => b.name === boat) && boat && (
                  <div style={{ marginBottom: isMobile ? "12px" : "15px" }}>
                    <label style={{
                      display: "block",
                      marginBottom: "8px",
                      fontWeight: "600",
                      color: "#333",
                      fontSize: isMobile ? "0.85rem" : "0.95rem"
                    }}>
                      Route (Auto-filled)
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={route}
                      readOnly
                      style={{
                        padding: "12px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        fontSize: isMobile ? "16px" : "1rem",
                        backgroundColor: "#f5f5f5",
                        color: "#666"
                      }}
                    />
                  </div>
                )}

                {/* Available Routes */}
                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    color: "#333",
                    fontSize: isMobile ? "0.85rem" : "0.95rem"
                  }}>
                    Available Routes (comma separated) *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g., Route 1, Route 2, Route 3"
                    value={availableRoutes}
                    onChange={(e) => setAvailableRoutes(e.target.value)}
                    required
                    style={{
                      padding: "12px",
                      borderRadius: "6px",
                      border: "1px solid #ddd",
                      fontSize: isMobile ? "16px" : "1rem"
                    }}
                  />
                  <small style={{
                    display: "block",
                    marginTop: "6px",
                    color: "#666",
                    fontSize: isMobile ? "0.75rem" : "0.9rem"
                  }}>
                    Enter all routes this admin can manage
                  </small>
                </div>
              </div>
            </>
          )}

          {/* Scanner Info Box */}
          {accountType === "scanner" && (
            <div style={{ marginBottom: isMobile ? "16px" : "20px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", color: "#333", fontSize: isMobile ? "0.85rem" : "0.95rem" }}>
                Assigned Boat *
              </label>
              <select
                value={boat}
                onChange={(e) => setBoat(e.target.value)}
                required
                className="form-select"
                style={{ padding: "12px", borderRadius: "6px", border: "1px solid #ddd", fontSize: isMobile ? "16px" : "1rem" }}
              >
                <option value="">Select boat</option>
                {boats.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            justifyContent: isMobile ? "stretch" : "flex-end"
          }}>
            <button
              type="button"
              onClick={() => navigate(accountType === "admin" ? "/manage-admins" : "/manage-qr-scanners")}
              style={{
                flex: isMobile ? "1 1 100%" : "0 1 auto",
                padding: isMobile ? "10px 20px" : "12px 24px",
                backgroundColor: "#f5f5f5",
                color: "#333",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontWeight: "600",
                fontSize: isMobile ? "0.95rem" : "1rem",
                cursor: "pointer",
                transition: "all 0.3s ease",
                minWidth: isMobile ? "auto" : "140px"
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
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: isMobile ? "1 1 100%" : "0 1 auto",
                padding: isMobile ? "10px 20px" : "12px 30px",
                backgroundColor: loading ? "#ccc" : "#1976d2",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontWeight: "600",
                fontSize: isMobile ? "0.95rem" : "1rem",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.3s ease",
                minWidth: isMobile ? "auto" : "200px"
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.backgroundColor = "#1565c0";
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow = "0 4px 12px rgba(25, 118, 210, 0.3)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.target.style.backgroundColor = "#1976d2";
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = "none";
                }
              }}
            >
              {loading ? "Creating..." : `Create ${accountType === "admin" ? "Admin" : "Scanner"} Account`}
            </button>
          </div>
        </form>
        </div>
      </div>
    </SuperadminLayout>
  );
}

export default CreateAccount;
