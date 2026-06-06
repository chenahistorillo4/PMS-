import { useState, useEffect, useRef } from "react";
import { db, auth } from "../../firebase";
import { doc, updateDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import AdminLayout from "./AdminLayout";

function DiscountManagement() {
  const [adminData, setAdminData] = useState(null);
  const [boat, setBoat] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [newDiscountType, setNewDiscountType] = useState("");
  const [newDiscountValue, setNewDiscountValue] = useState("");
  const [notif, setNotif] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddDiscountModal, setShowAddDiscountModal] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const initializedRef = useRef(false);

  // Fetch admin data
  useEffect(() => {
    const fetchAdminData = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          const docRef = doc(db, "admins", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setAdminData(docSnap.data());
          }
        } catch (error) {
          console.error("Error fetching admin data:", error);
        }
      }
    };
    fetchAdminData();

    // Handle window resize for mobile detection
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch discount data for admin's assigned boat
  useEffect(() => {
    const fetchBoatDiscount = async () => {
      if (!adminData) return;
      
      try {
        const boatName = adminData.assignedBoat;
        
        // Query discounts collection by boatName
        const discountsRef = collection(db, "discounts");
        const q = query(discountsRef, where("boatName", "==", boatName));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          // Found existing discount document
          const docSnap = querySnapshot.docs[0];
          const data = docSnap.data();
          setBoat({ id: docSnap.id, ...data });
        } else {
          // No discount document exists yet - use local state only
          const docId = Math.random().toString(36).substring(2, 11);
          setBoat({ 
            id: docId, 
            boatName: boatName, 
            discounts: {}
          });
        }
      } catch (error) {
        console.error("Error fetching discounts:", error);
        // Set default boat data even if there's an error
        if (adminData && adminData.assignedBoat) {
          const docId = adminData.assignedBoat.replace(/\s+/g, "_").toLowerCase();
          setBoat({ 
            id: docId, 
            boatName: adminData.assignedBoat, 
            discounts: {}
          });
        }
      } finally {
        setLoading(false);
      }
    };
    fetchBoatDiscount();
  }, [adminData]);

  // Auto-enable edit mode only when no discounts exist on initial load (only on first load)
  useEffect(() => {
    if (!boat || initializedRef.current) return;
    
    const discountsObj = boat.discounts || {};
    const discountKeys = Object.keys(discountsObj);
    const hasDiscounts = discountKeys.length > 0;
    
    if (!hasDiscounts) {
      // No discounts - enable edit mode
      setEditMode(true);
    } else {
      // Has discounts - disable edit mode to show view (only on first load)
      setEditMode(false);
    }
    
    initializedRef.current = true;
  }, [boat]); // Include boat as dependency, but ref prevents re-running after initialization

  const handleAddDiscount = () => {
    if (!newDiscountType || !newDiscountValue || !boat) return;
    
    try {
      // Create new discounts object instead of mutating
      const updatedDiscounts = {
        ...boat.discounts,
        [newDiscountType.toLowerCase()]: parseFloat(newDiscountValue)
      };

      // Just update local state, don't save to Firebase yet
      setBoat({ ...boat, discounts: updatedDiscounts });
      
      setNotif(`Added "${newDiscountType}" discount (click Save Discounts to save)`);
      setTimeout(() => setNotif(""), 3000);
      setNewDiscountType("");
      setNewDiscountValue("");
      setShowAddDiscountModal(false);
    } catch (error) {
      console.error("Error adding discount:", error);
      setNotif("Failed to add discount. Please try again.");
      setTimeout(() => setNotif(""), 3000);
    }
  };

  const handleDeleteDiscount = (field) => {
    if (window.confirm(`Are you sure you want to delete "${field}" discount?`) && boat) {
      // Just update local state, don't save immediately
      const updatedDiscounts = { ...boat.discounts };
      delete updatedDiscounts[field];
      setBoat({ ...boat, discounts: updatedDiscounts });
    }
  };

  const handleSaveDiscounts = async () => {
    if (!boat) return;
    
    try {
      const boatRef = doc(db, "discounts", boat.id);
      await updateDoc(boatRef, { discounts: boat.discounts });
      
      setNotif("Discounts saved successfully!");
      setTimeout(() => setNotif(""), 2000);
      setEditMode(false);
    } catch (error) {
      console.error("Error saving discounts:", error);
      setNotif("Failed to save discounts. Please try again.");
      setTimeout(() => setNotif(""), 3000);
    }
  };

  return (
    <AdminLayout active="discount">
      <h2 style={{
        fontWeight: "800",
        fontSize: isMobile ? "1.1rem" : "1.3rem",
        color: "#1a1a1a",
        marginBottom: isMobile ? "16px" : "25px",
        marginTop: "0",
        letterSpacing: "0.3px"
      }}>Discount Management</h2>

      {adminData && (
        <p style={{
          fontSize: isMobile ? "0.85rem" : "0.95rem",
          color: "#666",
          marginBottom: isMobile ? "20px" : "30px",
          fontWeight: "500"
        }}>
          View and manage discounts for <strong>{adminData.assignedBoat}</strong>
        </p>
      )}

      {loading ? (
        <div style={{
          textAlign: "center",
          padding: isMobile ? "40px 16px" : "60px 20px",
          color: "#999"
        }}>
          <p style={{ fontSize: isMobile ? "0.9rem" : "0.95rem" }}>Loading discount data...</p>
        </div>
      ) : adminData ? (
        <>
          {/* Notification */}
          {notif && (
            <div style={{
              background: "#c8e6c9",
              border: "1px solid #4caf50",
              borderRadius: "8px",
              padding: isMobile ? "12px 10px" : "15px",
              marginBottom: isMobile ? "16px" : "25px",
              color: "#1b5e20",
              fontWeight: 700,
              textAlign: "center",
              fontSize: isMobile ? "0.85rem" : "0.95rem"
            }}>
              {notif}
            </div>
          )}

          {/* Add Discount Button */}
          <div style={{ marginBottom: isMobile ? "16px" : "25px", display: showAddDiscountModal ? "none" : "block" }}>
            <button
              onClick={() => setShowAddDiscountModal(true)}
              style={{
                background: "#2196f3",
                color: "white",
                border: "none",
                padding: isMobile ? "6px 12px" : "10px 16px",
                borderRadius: "8px",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: isMobile ? "0.75rem" : "0.88rem",
                transition: "all 0.3s ease",
                width: "100%",
                maxWidth: isMobile ? "140px" : "180px"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#1976d2";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(33,150,243,0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#2196f3";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
              }}
            >
              + Add Discount
            </button>
          </div>

          {/* Add Discount Modal */}
          {showAddDiscountModal && (
            <div style={{
              position: "fixed",
              top: "0",
              left: "0",
              right: "0",
              bottom: "0",
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "20px"
            }}>
              <div style={{
                background: "white",
                borderRadius: "12px",
                padding: isMobile ? "16px 14px" : "24px",
                boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
                maxWidth: "500px",
                width: "100%"
              }}>
                <h2 style={{
                  fontSize: isMobile ? "1rem" : "1.2rem",
                  fontWeight: 800,
                  color: "#1a1a1a",
                  marginBottom: isMobile ? "12px" : "20px",
                  marginTop: "0"
                }}>Add New Discount</h2>

                <div style={{ marginBottom: isMobile ? "12px" : "18px" }}>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.75rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: "6px"
                  }}>Discount Type</label>
                  <input
                    type="text"
                    placeholder="e.g., Senior, Student, PWD"
                    value={newDiscountType}
                    onChange={(e) => setNewDiscountType(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "0.85rem" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box"
                    }}
                  />
                </div>

                <div style={{ marginBottom: isMobile ? "16px" : "24px" }}>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.75rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: "6px"
                  }}>Amount or Percentage</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 0.15 or 100"
                    value={newDiscountValue}
                    onChange={(e) => setNewDiscountValue(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "0.85rem" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box"
                    }}
                  />
                </div>

                <div style={{
                  display: "flex",
                  gap: isMobile ? "8px" : "12px",
                  justifyContent: "flex-end",
                  flexWrap: "wrap"
                }}>
                  <button
                    onClick={() => {
                      setShowAddDiscountModal(false);
                      setNewDiscountType("");
                      setNewDiscountValue("");
                    }}
                    style={{
                      background: "#f5f5f5",
                      color: "#333",
                      border: "1px solid #ddd",
                      padding: isMobile ? "6px 14px" : "10px 18px",
                      borderRadius: "8px",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: isMobile ? "0.75rem" : "0.85rem",
                      transition: "all 0.3s ease",
                      flex: 1,
                      minWidth: isMobile ? "70px" : "100px"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#e0e0e0";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#f5f5f5";
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAddDiscount()}
                    style={{
                      background: "#4caf50",
                      color: "white",
                      border: "none",
                      padding: isMobile ? "6px 14px" : "10px 18px",
                      borderRadius: "8px",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: isMobile ? "0.75rem" : "0.85rem",
                      transition: "all 0.3s ease",
                      flex: 1,
                      minWidth: isMobile ? "70px" : "100px"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#45a049";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(76,175,80,0.3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#4caf50";
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                    }}
                  >
                    Add Discount
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Discount Management Card */}
          {boat ? (
          <div style={{
            background: "white",
            borderRadius: "12px",
            padding: isMobile ? "14px 12px" : "30px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            border: "2px solid #2196f3",
            "@media (min-width: 768px)": {
              padding: "30px"
            }
          }}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: isMobile ? "flex-start" : "center", 
              marginBottom: isMobile ? "16px" : "25px",
              gap: isMobile ? "10px" : "15px",
              flexWrap: "wrap"
            }}>
              <h2 style={{
                fontSize: isMobile ? "0.95rem" : "1.1rem",
                fontWeight: 800,
                color: "#1a1a1a",
                marginBottom: "0",
                minWidth: isMobile ? "100px" : "150px"
              }}>
                {boat.boatName}
              </h2>
              <div style={{
                display: "flex",
                gap: isMobile ? "6px" : "10px",
                justifyContent: "flex-end",
                flexShrink: 0,
                flexWrap: "wrap"
              }}>
                <button
                  onClick={() => {
                    if (editMode) {
                      handleSaveDiscounts();
                    } else {
                      setEditMode(true);
                    }
                  }}
                  style={{
                    background: editMode ? "#4caf50" : "#ffc107",
                    color: "white",
                    border: "none",
                    padding: isMobile ? "6px 12px" : "10px 20px",
                    borderRadius: "8px",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: isMobile ? "0.7rem" : "0.85rem",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    const bgColor = editMode ? "#45a049" : "#ffa000";
                    e.currentTarget.style.background = bgColor;
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(255,193,7,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    const bgColor = editMode ? "#4caf50" : "#ffc107";
                    e.currentTarget.style.background = bgColor;
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                  }}
                >
                  {editMode ? "Save" : (!boat.discounts || Object.keys(boat.discounts).length === 0 ? "Add" : "Edit")}
                </button>
                {editMode && (
                  <button
                    onClick={() => {
                      setEditMode(false);
                      // Reload the boat data to discard changes
                      const boatName = adminData.assignedBoat;
                      const discountsRef = collection(db, "discounts");
                      const q = query(discountsRef, where("boatName", "==", boatName));
                      getDocs(q).then(querySnapshot => {
                        if (!querySnapshot.empty) {
                          const docSnap = querySnapshot.docs[0];
                          const data = docSnap.data();
                          setBoat({ id: docSnap.id, ...data });
                        }
                      });
                    }}
                    style={{
                      background: "#f5f5f5",
                      color: "#333",
                      border: "1px solid #ddd",
                      padding: isMobile ? "6px 12px" : "10px 20px",
                      borderRadius: "8px",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: isMobile ? "0.7rem" : "0.85rem",
                      transition: "all 0.3s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#e0e0e0";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#f5f5f5";
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Existing Discounts */}
            {boat.discounts && Object.keys(boat.discounts).length > 0 ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: isMobile ? "10px" : "15px",
                marginBottom: editMode ? isMobile ? "20px" : "30px" : "0"
              }}
              className="responsive-grid"
              >
                {Object.keys(boat.discounts).map((key) => (
                  <div key={key} style={{
                    background: "#f8f9fa",
                    border: "1px solid #ddd",
                    borderRadius: "10px",
                    padding: isMobile ? "12px 10px" : "15px",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f0f7fb";
                    e.currentTarget.style.borderColor = "#2196f3";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f8f9fa";
                    e.currentTarget.style.borderColor = "#ddd";
                  }}
                  >
                    <label style={{
                      display: "block",
                      fontSize: isMobile ? "0.7rem" : "0.75rem",
                      fontWeight: 800,
                      color: "#999",
                      marginBottom: isMobile ? "6px" : "10px",
                      textTransform: "uppercase"
                    }}>
                      {key.charAt(0).toUpperCase() + key.slice(1)} Discount
                    </label>
                    <div style={{
                      display: "flex",
                      gap: isMobile ? "6px" : "8px",
                      alignItems: "center",
                      flexWrap: "wrap"
                    }}>
                      <input
                        type="number"
                        step="0.01"
                        value={boat.discounts[key] || 0}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value);
                          const updatedDiscounts = {
                            ...boat.discounts,
                            [key]: newValue
                          };
                          setBoat({ ...boat, discounts: updatedDiscounts });
                        }}
                        disabled={!editMode}
                        style={{
                          flex: 1,
                          minWidth: isMobile ? "70px" : "100px",
                          padding: isMobile ? "6px 8px" : "10px 12px",
                          border: "1px solid #ddd",
                          borderRadius: "8px",
                          fontSize: isMobile ? "0.8rem" : "0.85rem",
                          fontFamily: "inherit",
                          background: editMode ? "white" : "#f0f0f0",
                          cursor: editMode ? "pointer" : "not-allowed",
                          color: "#333"
                        }}
                      />
                      {editMode && (
                        <button
                          onClick={() => handleDeleteDiscount(key)}
                          style={{
                            background: "#f44336",
                            color: "white",
                            border: "none",
                            padding: isMobile ? "6px 10px" : "10px 15px",
                            borderRadius: "6px",
                            fontWeight: 700,
                            cursor: "pointer",
                            fontSize: isMobile ? "0.65rem" : "0.75rem",
                            transition: "all 0.3s ease",
                            whiteSpace: "nowrap"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#d32f2f";
                            e.currentTarget.style.boxShadow = "0 4px 12px rgba(244,67,54,0.3)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#f44336";
                            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                padding: isMobile ? "24px 12px" : "40px 20px",
                textAlign: "center",
                color: "#999",
                background: "#f9f9f9",
                borderRadius: "8px",
                border: "1px solid #e0e0e0",
                marginBottom: editMode ? isMobile ? "20px" : "30px" : "0"
              }}>
                <p style={{ margin: "0", fontSize: isMobile ? "0.9rem" : "0.95rem", fontWeight: 600, color: "#666" }}>No discounts configured yet.</p>
                {editMode && <p style={{ margin: "6px 0 0 0", fontSize: isMobile ? "0.8rem" : "0.85rem", color: "#999" }}>Add a discount below to get started.</p>}
              </div>
            )}

          </div>
          ) : (
            <div style={{
              background: "#f0f0f0",
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: isMobile ? "20px 12px" : "30px",
              textAlign: "center",
              color: "#666"
            }}>
              <p style={{ fontSize: isMobile ? "0.9rem" : "0.95rem", fontWeight: 600 }}>Loading boat discount data...</p>
            </div>
          )}
        </>
      ) : (
        <div style={{
          background: "#fff3cd",
          border: "1px solid #ffc107",
          borderRadius: "8px",
          padding: isMobile ? "14px 12px" : "20px",
          color: "#856404",
          fontWeight: 700,
          fontSize: isMobile ? "0.85rem" : "0.95rem"
        }}>
          <strong>No discount data found</strong> for your assigned boat. Please contact the system administrator.
        </div>
      )}
    </AdminLayout>
  );
}

export default DiscountManagement;
