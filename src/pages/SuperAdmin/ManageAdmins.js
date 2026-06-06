import { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import SuperadminLayout from "./SuperadminLayout";
import "./ManageAdmins.css";

function ManageAdmins() {
  const [admins, setAdmins] = useState([]);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [newAdminData, setNewAdminData] = useState({
    name: "",
    email: "",
    password: "",
    boat: "",
    route: "",
    availableRoutes: ""
  });
  const [boats, setBoats] = useState([]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch admins and boats from Firestore
  useEffect(() => {
    const fetchAdmins = async () => {
      const querySnapshot = await getDocs(collection(db, "admins"));
      const adminList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAdmins(adminList);
    };
    
    const fetchBoats = async () => {
      const querySnapshot = await getDocs(collection(db, "boats"));
      const boatList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBoats(boatList);
    };
    
    fetchAdmins();
    fetchBoats();
  }, []);

  const handleEdit = (admin) => {
    setEditing(admin.id);
    setFormData(admin);
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    
    if (!newAdminData.name.trim() || !newAdminData.email.trim() || !newAdminData.password.trim()) {
      alert("Please fill in all required fields");
      return;
    }

    if (newAdminData.password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    if (!newAdminData.boat || !newAdminData.route || !newAdminData.availableRoutes.trim()) {
      alert("Please select a boat, enter route, and enter available routes");
      return;
    }

    setIsCreating(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, newAdminData.email, newAdminData.password);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, "admins", uid), {
        uid,
        name: newAdminData.name,
        email: newAdminData.email,
        role: "admin",
        assignedBoat: newAdminData.boat,
        assignedRoute: newAdminData.route,
        availableRoutes: newAdminData.availableRoutes.split(",").map(r => r.trim()),
        createdAt: new Date()
      });

      alert("Admin account created successfully!");
      setShowCreateModal(false);
      setNewAdminData({ name: "", email: "", password: "", boat: "", route: "", availableRoutes: "" });
      
      // Refresh admins list
      const querySnapshot = await getDocs(collection(db, "admins"));
      setAdmins(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      if (error.code === "auth/email-already-in-use") {
        alert("Email is already in use");
      } else if (error.code === "auth/invalid-email") {
        alert("Invalid email address");
      } else {
        alert("Error creating admin: " + error.message);
      }
    } finally {
      setIsCreating(false);
    }
  };



  const handleSave = async () => {
    try {
      await updateDoc(doc(db, "admins", editing), formData);
      alert("Admin updated successfully!");
      setEditing(null);
      // refresh list
      const querySnapshot = await getDocs(collection(db, "admins"));
      setAdmins(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      alert("Error updating admin: " + error.message);
    }
  };

  const handleDelete = (id) => {
    setDeletingId(id);
    setDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "admins", deletingId));
      setAdmins(admins.filter(admin => admin.id !== deletingId));
      alert("Admin deleted successfully!");
      setDeleteConfirm(false);
      setDeletingId(null);
    } catch (error) {
      alert("Error deleting admin: " + error.message);
      setIsDeleting(false);
      setDeleteConfirm(false);
      setDeletingId(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm(false);
    setDeletingId(null);
  };

  // Filter admins by search term
  const filteredAdmins = admins.filter(admin =>
    admin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    admin.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <SuperadminLayout active="manage-admins">
      <div className="manage-admins-container">
        <div className="manage-admins-header">
          <h3 className="manage-admins-title">Manage Admin Accounts</h3>
        </div>

        {/* Search Bar and Add Button */}
        <div className="manage-admins-search-section">
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
            className="add-admin-btn"
          >
            + Add Admin
          </button>
        </div>

        <div className="admins-table-wrapper">
          <table className="admins-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Boat</th>
              <th>Route</th>
              <th>Available Routes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAdmins.map(admin => (
              <tr key={admin.id}>
                {editing === admin.id ? (
                  <>
                    <td data-label="Name">
                      <input 
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #ddd" }}
                      />
                    </td>
                    <td data-label="Email">
                      <input 
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #ddd" }}
                      />
                    </td>
                    <td data-label="Boat">
                      <input 
                        type="text"
                        value={formData.assignedBoat}
                        onChange={(e) => setFormData({ ...formData, assignedBoat: e.target.value })}
                        style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #ddd" }}
                      />
                    </td>
                    <td data-label="Route">
                      <input 
                        type="text"
                        value={formData.assignedRoute}
                        onChange={(e) => setFormData({ ...formData, assignedRoute: e.target.value })}
                        style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #ddd" }}
                      />
                    </td>
                    <td data-label="Available Routes">
                      <input 
                        type="text"
                        value={formData.availableRoutes ? formData.availableRoutes.join(", ") : ""}
                        onChange={(e) => setFormData({ ...formData, availableRoutes: e.target.value.split(",").map(r => r.trim()) })}
                        style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #ddd" }}
                      />
                    </td>
                    <td data-label="Actions">
                      <div className="action-buttons" style={{ gap: "4px", flexWrap: "nowrap" }}>
                        <button 
                          className="save-btn"
                          onClick={handleSave}
                          style={{ padding: "6px 10px", fontSize: "0.8rem", flex: 1 }}
                        >
                          Save
                        </button>
                        <button 
                          className="cancel-btn"
                          onClick={() => setEditing(null)}
                          style={{ padding: "6px 10px", fontSize: "0.8rem", flex: 1 }}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td data-label="Name">{admin.name}</td>
                    <td data-label="Email">{admin.email}</td>
                    <td data-label="Boat">{admin.assignedBoat}</td>
                    <td data-label="Route">{admin.assignedRoute}</td>
                    <td data-label="Available Routes">{admin.availableRoutes ? admin.availableRoutes.join(", ") : ""}</td>
                    <td data-label="Actions">
                      <div className="action-buttons" style={{ gap: "4px" }}>
                        <button 
                          className="edit-btn" 
                          onClick={() => handleEdit(admin)}
                          style={{ flex: 1 }}
                        >
                          Edit
                        </button>
                        <button 
                          className="delete-btn" 
                          onClick={() => handleDelete(admin.id)}
                          style={{ flex: 1 }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {/* Create Admin Modal */}
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
                Create Admin Account
              </h3>

              <form onSubmit={handleCreateAdmin}>
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
                    value={newAdminData.name}
                    onChange={(e) => setNewAdminData({ ...newAdminData, name: e.target.value })}
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
                    value={newAdminData.email}
                    onChange={(e) => setNewAdminData({ ...newAdminData, email: e.target.value })}
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
                <div style={{ marginBottom: isMobile ? "10px" : "20px" }}>
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
                    value={newAdminData.password}
                    onChange={(e) => setNewAdminData({ ...newAdminData, password: e.target.value })}
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

                {/* Boat Selection - Input Field */}
                <div style={{ marginBottom: isMobile ? "10px" : "20px" }}>
                  <label style={{
                    display: "block",
                    marginBottom: isMobile ? "3px" : "8px",
                    fontWeight: "600",
                    color: "#333",
                    fontSize: isMobile ? "0.6rem" : "0.95rem"
                  }}>
                    Boat Name *
                  </label>
                  <input
                    type="text"
                    placeholder="Enter or select boat name"
                    value={newAdminData.boat}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewAdminData({ ...newAdminData, boat: value });
                      const selectedBoat = boats.find(b => b.name === value);
                      if (selectedBoat) {
                        setNewAdminData(prev => ({ ...prev, route: selectedBoat.route }));
                      }
                    }}
                    list="boat-suggestions"
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
                  <datalist id="boat-suggestions">
                    {boats.map((b) => (
                      <option key={b.id} value={b.name} />
                    ))}
                  </datalist>
                  <small style={{ display: "block", marginTop: isMobile ? "2px" : "6px", color: "#666", fontSize: isMobile ? "0.55rem" : "0.9rem" }}>
                    Type to search existing boats or enter a new boat name
                  </small>
                </div>

                {/* Boat Route - if creating new */}
                {newAdminData.boat && !boats.find(b => b.name === newAdminData.boat) && (
                  <div style={{ marginBottom: isMobile ? "10px" : "20px" }}>
                    <label style={{
                      display: "block",
                      marginBottom: isMobile ? "3px" : "8px",
                      fontWeight: "600",
                      color: "#333",
                      fontSize: isMobile ? "0.6rem" : "0.95rem"
                    }}>
                      Boat Route *
                    </label>
                    <input
                      type="text"
                      placeholder="Enter boat route"
                      value={newAdminData.route}
                      onChange={(e) => setNewAdminData({ ...newAdminData, route: e.target.value })}
                      style={{
                        width: "100%",
                        padding: isMobile ? "4px 5px" : "12px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        fontSize: isMobile ? "11px" : "1rem",
                        boxSizing: "border-box",
                        height: isMobile ? "22px" : "auto"
                      }}
                    />
                  </div>
                )}

                {/* Route - if existing boat selected */}
                {boats.find(b => b.name === newAdminData.boat) && newAdminData.boat && (
                  <div style={{ marginBottom: isMobile ? "10px" : "20px" }}>
                    <label style={{
                      display: "block",
                      marginBottom: isMobile ? "3px" : "8px",
                      fontWeight: "600",
                      color: "#333",
                      fontSize: isMobile ? "0.6rem" : "0.95rem"
                    }}>
                      Route (Auto-filled)
                    </label>
                    <input
                      type="text"
                      value={newAdminData.route}
                      readOnly
                      style={{
                        width: "100%",
                        padding: isMobile ? "4px 5px" : "12px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        fontSize: isMobile ? "11px" : "1rem",
                        boxSizing: "border-box",
                        height: isMobile ? "22px" : "auto",
                        backgroundColor: "#f5f5f5",
                        color: "#666"
                      }}
                    />
                  </div>
                )}

                {/* Available Routes */}
                <div style={{ marginBottom: isMobile ? "12px" : "25px" }}>
                  <label style={{
                    display: "block",
                    marginBottom: isMobile ? "3px" : "8px",
                    fontWeight: "600",
                    color: "#333",
                    fontSize: isMobile ? "0.6rem" : "0.95rem"
                  }}>
                    Available Routes (comma separated) *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Route 1, Route 2, Route 3"
                    value={newAdminData.availableRoutes}
                    onChange={(e) => setNewAdminData({ ...newAdminData, availableRoutes: e.target.value })}
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 5px" : "12px",
                      borderRadius: "6px",
                      border: "1px solid #ddd",
                      fontSize: isMobile ? "11px" : "1rem",
                      boxSizing: "border-box",
                      height: isMobile ? "22px" : "auto"
                    }}
                  />
                  <small style={{ display: "block", marginTop: isMobile ? "2px" : "6px", color: "#666", fontSize: isMobile ? "0.55rem" : "0.9rem" }}>
                    Enter all routes this admin can manage
                  </small>
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
                      padding: isMobile ? "5px 8px" : "12px 30px",
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
                    {isCreating ? "Creating..." : "Create Admin"}
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
                Are you sure you want to delete this admin account?
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

export default ManageAdmins;
