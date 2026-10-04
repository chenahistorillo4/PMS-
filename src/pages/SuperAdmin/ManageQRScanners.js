import { useState, useEffect } from "react";
import { db, accountCreationAuth } from "../../firebase";
import { collection, getDocs, deleteDoc, doc, updateDoc, setDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import SuperadminLayout from "./SuperadminLayout";
import "./ManageQRScanners.css";

function ManageQRScanners() {
  const [portStaff, setPortStaff] = useState([]);
  const [boats, setBoats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [newStaffData, setNewStaffData] = useState({
    name: "",
    email: "",
    password: "",
    boat: "",
    phone: ""
  });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch Port Staff accounts
  useEffect(() => {
    const fetchPortStaff = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "port_staff"));
        const staffList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setPortStaff(staffList);
      } catch (error) {
        console.error("Error fetching Port Staff:", error);
        alert("Error loading Port Staff accounts");
      } finally {
        setLoading(false);
      }
    };

    const fetchBoats = async () => {
      const querySnapshot = await getDocs(collection(db, "boats"));
      setBoats(querySnapshot.docs.map((boatDoc) => ({ id: boatDoc.id, ...boatDoc.data() })));
    };

    fetchPortStaff();
    fetchBoats();
  }, []);

  // Delete Port Staff account
  const handleDelete = (id) => {
    setDeletingId(id);
    setDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "port_staff", deletingId));
      setPortStaff(portStaff.filter((member) => member.id !== deletingId));
      alert("Port Staff account deleted successfully");
      setDeleteConfirm(false);
      setDeletingId(null);
    } catch (error) {
      alert("Error deleting Port Staff account: " + error.message);
      setIsDeleting(false);
      setDeleteConfirm(false);
      setDeletingId(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm(false);
    setDeletingId(null);
  };

  // Toggle status
  const handleToggleStatus = async (id, currentStatus) => {
    try {
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      await updateDoc(doc(db, "port_staff", id), {
        status: newStatus
      });
      setPortStaff(portStaff.map((member) =>
        member.id === id ? { ...member, status: newStatus } : member
      ));
    } catch (error) {
      alert("Error updating Port Staff status: " + error.message);
    }
  };

  const handleCreatePortStaff = async (e) => {
    e.preventDefault();
    
    if (!newStaffData.name.trim() || !newStaffData.email.trim() || !newStaffData.password.trim()) {
      alert("Please fill in all required fields");
      return;
    }

    if (newStaffData.password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    if (!newStaffData.boat) {
      alert("Please select the boat assigned to this Port Staff member");
      return;
    }

    setIsCreating(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(accountCreationAuth, newStaffData.email.trim(), newStaffData.password);
      const uid = userCredential.user.uid;

      try {
        await setDoc(doc(db, "port_staff", uid), {
          uid,
          name: newStaffData.name.trim(),
          email: newStaffData.email.trim(),
          role: "port_staff",
          status: "active",
          adminName: "Super Admin",
          assignedBoat: newStaffData.boat,
          assignedRoute: boats.find((boat) => boat.name === newStaffData.boat)?.route || null,
          phone: newStaffData.phone.trim() || null,
          permissions: ["scan_qr"],
          createdAt: new Date(),
          lastLogin: null
        });
      } catch (error) {
        try {
          await deleteUser(userCredential.user);
        } catch (cleanupError) {
          console.error("Failed to remove the Auth account that was not written to Firestore:", cleanupError);
        }
        throw error;
      }

      alert("Port Staff account created successfully!");
      setShowCreateModal(false);
      setNewStaffData({ name: "", email: "", password: "", boat: "", phone: "" });
      
      // Refresh Port Staff list
      const querySnapshot = await getDocs(collection(db, "port_staff"));
      setPortStaff(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      if (error.code === "auth/email-already-in-use") {
        alert("Email is already in use");
      } else if (error.code === "auth/invalid-email") {
        alert("Invalid email address");
      } else {
        alert("Error creating Port Staff account: " + error.message);
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Filter Port Staff accounts
  const filteredPortStaff = portStaff.filter((member) =>
    (member.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (member.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (member.assignedBoat || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <SuperadminLayout active="manage-port-staff">
      <div className="manage-scanners-container">
        <div className="manage-scanners-header">
          <h3 className="manage-scanners-title">Manage Port Staff</h3>
        </div>

        {/* Search Bar and Add Button */}
        <div className="manage-scanners-search-section">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="add-scanner-btn"
          >
            + Add Port Staff
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="loading-state">
            Loading Port Staff accounts...
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredPortStaff.length === 0 && (
          <div className="empty-state">
            <p>
              {portStaff.length === 0 ? "No Port Staff accounts created yet" : "No matching results found"}
            </p>
          </div>
        )}

        {/* Port Staff Table */}
        {!loading && filteredPortStaff.length > 0 && (
          <div className="scanners-table-wrapper">
            <table className="scanners-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Contact Details</th>
                <th>Assigned Boat</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPortStaff.map((member) => (
                <tr key={member.id}>
                  <td data-label="Name">{member.name}</td>
                  <td data-label="Email">{member.email}</td>
                  <td data-label="Contact Details">{member.phone || "Not provided"}</td>
                  <td data-label="Assigned Boat">{member.assignedBoat || "Not assigned"}</td>
                  <td data-label="Status">
                    <span className={`status-badge ${member.status === "active" ? "active" : "inactive"}`}>
                      {member.status === "active" ? " Active" : " Inactive"}
                    </span>
                  </td>
                  <td data-label="Created">
                    {member.createdAt?.toDate?.()?.toLocaleDateString?.() || "Unknown"}
                  </td>
                  <td data-label="Last Login">
                    {member.lastLogin ?
                      (typeof member.lastLogin.toDate === 'function'
                        ? member.lastLogin.toDate().toLocaleDateString()
                        : new Date(member.lastLogin).toLocaleDateString())
                      : "Never"}
                  </td>
                  <td data-label="Actions">
                    <div className="action-buttons" style={{ gap: "4px" }}>
                      <button
                        onClick={() => handleToggleStatus(member.id, member.status)}
                        className={member.status === "active" ? "deactivate-btn" : "activate-btn"}
                        style={{ flex: 1 }}
                      >
                        {member.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleDelete(member.id)}
                        className="delete-btn"
                        style={{ flex: 1 }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {/* Create Port Staff Modal */}
        {showCreateModal && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)",
            padding: isMobile ? "16px" : "0"
          }}>
            <div style={{
              backgroundColor: "white",
              borderRadius: "16px",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
              padding: isMobile ? "12px" : "40px",
              maxWidth: "600px",
              width: "100%",
              maxHeight: isMobile ? "90vh" : "80vh",
              overflowY: "auto",
              animation: "slideUp 0.3s ease-out"
            }}>
              <h3 style={{
                margin: "0 0 12px 0",
                color: "#1a1a1a",
                fontSize: isMobile ? "0.8rem" : "1.5rem",
                fontWeight: "700"
              }}>
                Create Port Staff Account
              </h3>

              <form onSubmit={handleCreatePortStaff}>
                {/* Name Field */}
                <div style={{ marginBottom: isMobile ? "10px" : "20px" }}>
                  <label style={{
                    display: "block",
                    marginBottom: isMobile ? "3px" : "8px",
                    fontWeight: "600",
                    color: "#333",
                    fontSize: isMobile ? "0.6rem" : "0.95rem"
                  }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="Enter full name"
                    value={newStaffData.name}
                    onChange={(e) => setNewStaffData({ ...newStaffData, name: e.target.value })}
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 5px" : "12px",
                      borderRadius: "6px",
                      border: "1px solid #ddd",
                      fontSize: isMobile ? "11px" : "1rem",
                      boxSizing: "border-box",
                      transition: "all 0.3s ease",
                      height: isMobile ? "22px" : "auto"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                    onBlur={(e) => e.target.style.borderColor = "#ddd"}
                  />
                </div>

                {/* Email Field */}
                <div style={{ marginBottom: isMobile ? "10px" : "20px" }}>
                  <label style={{
                    display: "block",
                    marginBottom: isMobile ? "3px" : "8px",
                    fontWeight: "600",
                    color: "#333",
                    fontSize: isMobile ? "0.6rem" : "0.95rem"
                  }}>
                    Email Address *
                  </label>
                  <input
                    type="email"
                    placeholder="Enter email address"
                    value={newStaffData.email}
                    onChange={(e) => setNewStaffData({ ...newStaffData, email: e.target.value })}
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 5px" : "12px",
                      borderRadius: "6px",
                      border: "1px solid #ddd",
                      fontSize: isMobile ? "11px" : "1rem",
                      boxSizing: "border-box",
                      transition: "all 0.3s ease",
                      height: isMobile ? "22px" : "auto"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                    onBlur={(e) => e.target.style.borderColor = "#ddd"}
                  />
                </div>

                {/* Password Field */}
                <div style={{ marginBottom: isMobile ? "10px" : "25px" }}>
                  <label style={{
                    display: "block",
                    marginBottom: isMobile ? "3px" : "8px",
                    fontWeight: "600",
                    color: "#333",
                    fontSize: isMobile ? "0.6rem" : "0.95rem"
                  }}>
                    Password *
                  </label>
                  <input
                    type="password"
                    placeholder="Enter password (min. 6 characters)"
                    value={newStaffData.password}
                    onChange={(e) => setNewStaffData({ ...newStaffData, password: e.target.value })}
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 5px" : "12px",
                      borderRadius: "6px",
                      border: "1px solid #ddd",
                      fontSize: isMobile ? "11px" : "1rem",
                      boxSizing: "border-box",
                      transition: "all 0.3s ease",
                      height: isMobile ? "22px" : "auto"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#1976d2"}
                    onBlur={(e) => e.target.style.borderColor = "#ddd"}
                  />
                  <small style={{ display: "block", marginTop: isMobile ? "2px" : "6px", color: "#666", fontSize: isMobile ? "0.55rem" : "0.9rem" }}>
                    Password must be at least 6 characters long
                  </small>
                </div>

                <div style={{ marginBottom: isMobile ? "10px" : "20px" }}>
                  <label style={{ display: "block", marginBottom: isMobile ? "3px" : "8px", fontWeight: "600", color: "#333", fontSize: isMobile ? "0.6rem" : "0.95rem" }}>
                    Assigned Boat *
                  </label>
                  <select
                    value={newStaffData.boat}
                    onChange={(e) => setNewStaffData({ ...newStaffData, boat: e.target.value })}
                    required
                    style={{ width: "100%", padding: isMobile ? "4px 5px" : "12px", borderRadius: "6px", border: "1px solid #ddd", fontSize: isMobile ? "11px" : "1rem", boxSizing: "border-box" }}
                  >
                    <option value="">Select boat</option>
                    {boats.map((boat) => <option key={boat.id} value={boat.name}>{boat.name}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: isMobile ? "10px" : "20px" }}>
                  <label style={{ display: "block", marginBottom: isMobile ? "3px" : "8px", fontWeight: "600", color: "#333", fontSize: isMobile ? "0.6rem" : "0.95rem" }}>
                    Contact Details
                  </label>
                  <input
                    type="tel"
                    placeholder="Enter contact number"
                    value={newStaffData.phone}
                    onChange={(e) => setNewStaffData({ ...newStaffData, phone: e.target.value })}
                    style={{ width: "100%", padding: isMobile ? "4px 5px" : "12px", borderRadius: "6px", border: "1px solid #ddd", fontSize: isMobile ? "11px" : "1rem", boxSizing: "border-box" }}
                  />
                </div>

                {/* Action Buttons */}
                <div style={{
                  display: "flex",
                  gap: isMobile ? "6px" : "12px",
                  justifyContent: "flex-end",
                  flexWrap: "wrap"
                }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    disabled={isCreating}
                    style={{
                      flex: isMobile ? "1" : "0 1 auto",
                      padding: isMobile ? "5px 8px" : "12px 24px",
                      backgroundColor: "#f5f5f5",
                      color: "#333",
                      border: "1px solid #ddd",
                      borderRadius: "6px",
                      fontWeight: "600",
                      fontSize: isMobile ? "0.65rem" : "1rem",
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                      height: isMobile ? "24px" : "auto",
                      minWidth: isMobile ? "auto" : "100px"
                    }}
                    onMouseEnter={(e) => {
                      if (!isCreating) {
                        e.target.style.backgroundColor = "#e0e0e0";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isCreating) {
                        e.target.style.backgroundColor = "#f5f5f5";
                      }
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    style={{
                      flex: isMobile ? "1" : "0 1 auto",
                      padding: isMobile ? "5px 8px" : "12px 24px",
                      backgroundColor: isCreating ? "#ccc" : "#1976d2",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontWeight: "600",
                      fontSize: isMobile ? "0.65rem" : "1rem",
                      cursor: isCreating ? "not-allowed" : "pointer",
                      transition: "all 0.3s ease",
                      height: isMobile ? "24px" : "auto",
                      minWidth: isMobile ? "auto" : "110px",
                      whiteSpace: "nowrap"
                    }}
                    onMouseEnter={(e) => {
                      if (!isCreating) {
                        e.target.style.backgroundColor = "#1565c0";
                        e.target.style.transform = "translateY(-2px)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isCreating) {
                        e.target.style.backgroundColor = "#1976d2";
                        e.target.style.transform = "translateY(0)";
                      }
                    }}
                  >
                    {isCreating ? "Creating..." : "Create Port Staff"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)"
          }}>
            <div style={{
              backgroundColor: "white",
              borderRadius: "16px",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
              padding: "40px",
              maxWidth: "420px",
              width: "90%",
              textAlign: "center",
              animation: "slideUp 0.3s ease-out"
            }}>
              <h3 style={{
                margin: "0 0 16px 0",
                color: "#1a1a1a",
                fontSize: "1.4rem",
                fontWeight: "700",
                letterSpacing: "-0.3px"
              }}>
                Confirm Delete
              </h3>
              <p style={{
                color: "#666",
                margin: "0 0 32px 0",
                fontSize: "0.95rem",
                lineHeight: "1.6",
                fontWeight: "400"
              }}>
                Are you sure you want to delete this Port Staff account?
              </p>
              <div style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                flexWrap: "wrap"
              }}>
                <button
                  onClick={cancelDelete}
                  disabled={isDeleting}
                  style={{
                    padding: "12px 32px",
                    backgroundColor: "#e8e8e8",
                    color: "#333",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "600",
                    cursor: isDeleting ? "not-allowed" : "pointer",
                    fontSize: "0.95rem",
                    transition: "all 0.3s ease",
                    minWidth: "130px",
                    opacity: isDeleting ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!isDeleting) {
                      e.target.style.backgroundColor = "#d0d0d0";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDeleting) {
                      e.target.style.backgroundColor = "#e8e8e8";
                    }
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  style={{
                    padding: "12px 32px",
                    backgroundColor: "#d84545",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "600",
                    cursor: isDeleting ? "not-allowed" : "pointer",
                    fontSize: "0.95rem",
                    transition: "all 0.3s ease",
                    minWidth: "130px",
                    opacity: isDeleting ? 0.7 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!isDeleting) {
                      e.target.style.backgroundColor = "#c53535";
                      e.target.style.transform = "translateY(-1px)";
                      e.target.style.boxShadow = "0 4px 12px rgba(216, 69, 69, 0.3)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDeleting) {
                      e.target.style.backgroundColor = "#d84545";
                      e.target.style.transform = "translateY(0)";
                      e.target.style.boxShadow = "none";
                    }
                  }}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(30px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </SuperadminLayout>
  );
}

export default ManageQRScanners;
