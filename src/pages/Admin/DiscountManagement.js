import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { db } from "../../firebase";
import { doc, setDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import AdminLayout from "./AdminLayout";
import { useAuthReloadKey, useAuthUser } from "../../hooks/useAuthUser";

function DiscountManagement() {
  const [adminData, setAdminData] = useState(null);
  const [boat, setBoat] = useState(null);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [newDiscountType, setNewDiscountType] = useState("");
  const [newDiscountValue, setNewDiscountValue] = useState("");
  const [activeTab, setActiveTab] = useState("discounts");
  const [promos, setPromos] = useState([]);
  const [promoForm, setPromoForm] = useState({
    name: "",
    percentage: "",
    availability: "unlimited",
    maxReservations: "",
    startDate: "",
    endDate: "",
    description: "",
    active: true,
  });
  const [editingPromoId, setEditingPromoId] = useState(null);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [notif, setNotif] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddDiscountModal, setShowAddDiscountModal] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const { user, authReady } = useAuthUser();
  const reloadKey = useAuthReloadKey();

  // Fetch admin data
  useEffect(() => {
    if (!authReady) return;

    const fetchAdminData = async () => {
      if (!user) {
        setAdminData(null);
        setLoading(false);
        return;
      }

      try {
        const docRef = doc(db, "admins", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setAdminData(docSnap.data());
        } else {
          setAdminData(null);
        }
      } catch (error) {
        console.error("Error fetching admin data:", error);
      }
    };
    fetchAdminData();

    // Handle window resize for mobile detection
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [authReady, user, reloadKey]);

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
          setPromos(Array.isArray(data.promos) ? data.promos : []);
        } else {
          // No discount document exists yet - use local state only
          const docId = Math.random().toString(36).substring(2, 11);
          setBoat({ 
            id: docId, 
            boatName: boatName, 
            discounts: {}
          });
          setPromos([]);
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
          setPromos([]);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchBoatDiscount();
  }, [adminData]);

  const persistDiscounts = async (discounts) => {
    if (!boat?.id || !boat?.boatName) {
      throw new Error("Discount record is missing the assigned boat.");
    }

    const boatRef = doc(db, "discounts", boat.id);
    await setDoc(boatRef, {
      boatName: boat.boatName,
      discounts
    }, { merge: true });
  };

  const persistPromos = async (updatedPromos) => {
    if (!boat?.id || !boat?.boatName) {
      throw new Error("Promo record is missing the assigned boat.");
    }

    await setDoc(doc(db, "discounts", boat.id), {
      boatName: boat.boatName,
      promos: updatedPromos,
    }, { merge: true });
  };

  const openPromoModal = (promo = null) => {
    setEditingPromoId(promo?.id || null);
    setPromoForm(promo
      ? {
        name: promo.name || "",
        percentage: String(promo.percentage ?? ""),
        availability: promo.availability === "limited" ? "limited" : "unlimited",
        maxReservations: promo.maxReservations ? String(promo.maxReservations) : "",
        startDate: promo.startDate || "",
        endDate: promo.endDate || "",
        description: promo.description || "",
        active: Boolean(promo.active),
      }
      : {
        name: "",
        percentage: "",
        availability: "unlimited",
        maxReservations: "",
        startDate: "",
        endDate: "",
        description: "",
        active: true,
      });
    setShowPromoModal(true);
  };

  const handleSavePromo = async (event) => {
    event.preventDefault();
    const percentage = Number(promoForm.percentage);
    const maxReservations = Number(promoForm.maxReservations);
    if (!promoForm.name.trim() || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      setNotif("Enter a promo name and a discount value from 1% to 100%.");
      return;
    }
    if (
      promoForm.availability === "limited" &&
      (!Number.isInteger(maxReservations) || maxReservations <= 0)
    ) {
      setNotif("Enter a maximum reservation count greater than zero for a limited promo.");
      return;
    }
    if (!promoForm.startDate || !promoForm.endDate || promoForm.endDate < promoForm.startDate) {
      setNotif("Enter valid promo dates. The end date must be on or after the start date.");
      return;
    }

    const promo = {
      id: editingPromoId || `promo-${Date.now()}`,
      name: promoForm.name.trim(),
      percentage,
      availability: promoForm.availability,
      maxReservations: promoForm.availability === "limited" ? maxReservations : null,
      startDate: promoForm.startDate,
      endDate: promoForm.endDate,
      description: promoForm.description.trim(),
      active: promoForm.active,
    };
    const updatedPromos = [
      ...promos
        .filter((item) => item.id !== editingPromoId),
      promo,
    ];

    try {
      await persistPromos(updatedPromos);
      setPromos(updatedPromos);
      setShowPromoModal(false);
      setNotif(`"${promo.name}" promo saved successfully.`);
      setTimeout(() => setNotif(""), 3000);
    } catch (error) {
      console.error("Error saving promo:", error);
      setNotif("Failed to save promo. Please try again.");
      setTimeout(() => setNotif(""), 3000);
    }
  };

  const handleDeletePromo = async (promo) => {
    if (!window.confirm(`Are you sure you want to delete "${promo.name}" promo?`)) return;
    const updatedPromos = promos.filter((item) => item.id !== promo.id);
    try {
      await persistPromos(updatedPromos);
      setPromos(updatedPromos);
      setNotif(`"${promo.name}" promo deleted successfully.`);
      setTimeout(() => setNotif(""), 3000);
    } catch (error) {
      console.error("Error deleting promo:", error);
      setNotif("Failed to delete promo. Please try again.");
      setTimeout(() => setNotif(""), 3000);
    }
  };

  const handleAddDiscount = async () => {
    const percentage = Number(newDiscountValue);
    if (!newDiscountType.trim() || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100 || !boat) {
      setNotif("Enter a discount name and a percentage from 1 to 100.");
      setTimeout(() => setNotif(""), 3000);
      return;
    }
    
    try {
      const updatedDiscounts = {
        ...boat.discounts,
        [newDiscountType.trim().toLowerCase()]: percentage / 100
      };

      await persistDiscounts(updatedDiscounts);
      setBoat({ ...boat, discounts: updatedDiscounts });
      
      setNotif(`Added "${newDiscountType}" discount successfully.`);
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

  const handleDeleteDiscount = async (field) => {
    if (window.confirm(`Are you sure you want to delete "${field}" discount?`) && boat) {
      try {
        const updatedDiscounts = { ...boat.discounts };
        delete updatedDiscounts[field];
        await persistDiscounts(updatedDiscounts);
        setBoat({ ...boat, discounts: updatedDiscounts });
        setNotif(`"${field}" discount deleted successfully.`);
        setTimeout(() => setNotif(""), 3000);
      } catch (error) {
        console.error("Error deleting discount:", error);
        setNotif("Failed to delete discount. Please try again.");
        setTimeout(() => setNotif(""), 3000);
      }
    }
  };

  return (
    <AdminLayout active="discount">
      <h2 style={{
        fontWeight: "800",
        fontSize: isMobile ? "1.1rem" : "1.3rem",
        color: "#1a1a1a",
        marginBottom: isMobile ? "12px" : "25px",
        marginTop: "0",
        letterSpacing: "0.3px"
      }}>Discount Management</h2>

      {adminData && (
        <p style={{
          fontSize: isMobile ? "0.8rem" : "0.95rem",
          color: "#666",
          marginBottom: isMobile ? "18px" : "30px",
          fontWeight: "500",
          lineHeight: isMobile ? "1.4" : "1.5"
        }}>
          Create and manage discounts and promotional offers for <strong>{adminData.assignedBoat}</strong>.
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

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: isMobile ? 14 : 20,
          }}>
            <div role="tablist" aria-label="Discount management views" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { id: "discounts", label: "Discounts" },
                { id: "promos", label: "Promos" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: isMobile ? "9px 12px" : "11px 18px",
                    border: activeTab === tab.id ? "2px solid #2876d2" : "1px solid #b8c9dc",
                    borderRadius: "7px",
                    background: activeTab === tab.id ? "#eaf3fc" : "#fff",
                    color: activeTab === tab.id ? "#1b5fa7" : "#444",
                    fontSize: isMobile ? "0.8rem" : "0.95rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => activeTab === "promos" ? openPromoModal() : setShowAddDiscountModal(true)}
              style={{
                background: "#2196f3",
                color: "white",
                border: "none",
                padding: isMobile ? "8px 12px" : "10px 16px",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: isMobile ? "0.8rem" : "0.85rem",
                width: isMobile ? "100%" : "auto",
              }}
            >
              + Add {activeTab === "promos" ? "Promo" : "Discount"}
            </button>
          </div>

          {showPromoModal && createPortal(
            <div style={{
              position: "fixed",
              inset: 0,
              zIndex: 1200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: isMobile ? 12 : 20,
              overflowY: "auto",
              background: "rgba(0,0,0,.5)",
            }}>
              <form onSubmit={handleSavePromo} style={{
                width: "100%",
                maxWidth: 480,
                padding: isMobile ? 16 : 24,
                maxHeight: "calc(100dvh - 24px)",
                overflowY: "auto",
                boxSizing: "border-box",
                borderRadius: 12,
                background: "#fff",
                boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
                fontFamily: "inherit",
                fontSize: isMobile ? "0.88rem" : "0.95rem",
              }}>
                <h2 style={{ margin: "0 0 18px", color: "#1e3a5f", fontSize: isMobile ? "1.1rem" : "1.2rem", fontWeight: 800 }}>
                  {editingPromoId ? "Edit Promo" : "Add Promo"}
                </h2>
                <label style={{ display: "block", marginBottom: 14, color: "#34516f", fontSize: isMobile ? "0.82rem" : "0.88rem", fontWeight: 700 }}>
                  Promo Name
                  <input
                    autoFocus
                    required
                    maxLength={60}
                    value={promoForm.name}
                    onChange={(event) => setPromoForm({ ...promoForm, name: event.target.value })}
                    style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 42, marginTop: 6, padding: "9px 11px", border: "1px solid #cbd8e6", borderRadius: 7, fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 400 }}
                  />
                </label>
                <label style={{ display: "block", marginBottom: 14, color: "#34516f", fontSize: isMobile ? "0.82rem" : "0.88rem", fontWeight: 700 }}>
                  Discount Value (%)
                  <input
                    type="number"
                    required
                    min="1"
                    max="100"
                    step="0.01"
                    value={promoForm.percentage}
                    onChange={(event) => setPromoForm({ ...promoForm, percentage: event.target.value })}
                    style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 42, marginTop: 6, padding: "9px 11px", border: "1px solid #cbd8e6", borderRadius: 7, fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 400 }}
                  />
                </label>
                <label style={{ display: "block", marginBottom: 14, color: "#34516f", fontSize: isMobile ? "0.82rem" : "0.88rem", fontWeight: 700 }}>
                  Promo Availability
                  <select
                    value={promoForm.availability}
                    onChange={(event) => setPromoForm({ ...promoForm, availability: event.target.value })}
                    style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 42, marginTop: 6, padding: "9px 11px", border: "1px solid #cbd8e6", borderRadius: 7, fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 400 }}
                  >
                    <option value="unlimited">Unlimited</option>
                    <option value="limited">Limited</option>
                  </select>
                </label>
                {promoForm.availability === "limited" && (
                  <label style={{ display: "block", marginBottom: 14, color: "#34516f", fontSize: isMobile ? "0.82rem" : "0.88rem", fontWeight: 700 }}>
                    Maximum Reservations
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      value={promoForm.maxReservations}
                      onChange={(event) => setPromoForm({ ...promoForm, maxReservations: event.target.value })}
                      style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 42, marginTop: 6, padding: "9px 11px", border: "1px solid #cbd8e6", borderRadius: 7, fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 400 }}
                    />
                  </label>
                )}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "block", marginBottom: 14, color: "#34516f", fontSize: isMobile ? "0.82rem" : "0.88rem", fontWeight: 700 }}>
                    Start Date
                    <input
                      type="date"
                      required
                      value={promoForm.startDate}
                      onChange={(event) => setPromoForm({ ...promoForm, startDate: event.target.value })}
                      style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 42, marginTop: 6, padding: "9px 11px", border: "1px solid #cbd8e6", borderRadius: 7, fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 400 }}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 14, color: "#34516f", fontSize: isMobile ? "0.82rem" : "0.88rem", fontWeight: 700 }}>
                    End Date
                    <input
                      type="date"
                      required
                      min={promoForm.startDate || undefined}
                      value={promoForm.endDate}
                      onChange={(event) => setPromoForm({ ...promoForm, endDate: event.target.value })}
                      style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 42, marginTop: 6, padding: "9px 11px", border: "1px solid #cbd8e6", borderRadius: 7, fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 400 }}
                    />
                  </label>
                </div>
                <label style={{ display: "block", marginBottom: 14, color: "#34516f", fontSize: isMobile ? "0.82rem" : "0.88rem", fontWeight: 700 }}>
                  Promo Description
                  <textarea
                    maxLength={180}
                    value={promoForm.description}
                    onChange={(event) => setPromoForm({ ...promoForm, description: event.target.value })}
                    style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 84, marginTop: 6, padding: "9px 11px", border: "1px solid #cbd8e6", borderRadius: 7, resize: "vertical", fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 400 }}
                  />
                </label>
                <label style={{ display: "block", marginBottom: 20, color: "#34516f", fontSize: isMobile ? "0.82rem" : "0.88rem", lineHeight: 1.4, fontWeight: 700 }}>
                  Status
                  <select
                    value={promoForm.active ? "active" : "inactive"}
                    onChange={(event) => setPromoForm({ ...promoForm, active: event.target.value === "active" })}
                    style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 42, marginTop: 6, padding: "9px 11px", border: "1px solid #cbd8e6", borderRadius: 7, fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 400 }}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button type="button" onClick={() => setShowPromoModal(false)} style={{ minHeight: 40, padding: "9px 14px", border: "1px solid #cbd8e6", borderRadius: 7, background: "#fff", color: "#34516f", font: "inherit", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button type="submit" style={{ minHeight: 40, padding: "9px 14px", border: 0, borderRadius: 7, background: "#2196f3", color: "#fff", font: "inherit", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer" }}>
                    Save Promo
                  </button>
                </div>
              </form>
            </div>,
            document.body
          )}

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
                  }}>Discount Percentage</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="0.01"
                    required
                    placeholder="e.g., 10"
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
                    Close
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

          {boat ? (
            <section style={{
              background: "#fff",
              border: "1px solid #e0e8f0",
              borderRadius: "12px",
              padding: isMobile ? "15px" : "25px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              overflow: "hidden",
            }}>
              <h2 style={{
                fontSize: isMobile ? "0.9rem" : "1.15rem",
                fontWeight: 800,
                color: "#1e3a5f",
                margin: "0 0 8px",
              }}>
                {activeTab === "promos" ? `Promos for ${boat.boatName}` : `Discounts for ${boat.boatName}`}
              </h2>
              <p style={{ margin: "0 0 16px", color: "#666", fontSize: isMobile ? "0.78rem" : "0.9rem" }}>
                {activeTab === "promos"
                  ? "Active promos are automatically applied to eligible passenger bookings."
                  : "List of all discount offers."}
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: activeTab === "promos" ? (isMobile ? 1050 : 1250) : (isMobile ? 620 : 760), borderCollapse: "collapse", textAlign: "left", fontSize: isMobile ? "0.78rem" : "0.9rem" }}>
                  <thead>
                    <tr style={{ background: "linear-gradient(135deg, #2196f3 0%, #1976d2 100%)", color: "#fff" }}>
                      {(activeTab === "promos"
                        ? ["#", "Promo Name", "Discount Value", "Availability", "Maximum Reservations", "Start Date", "End Date", "Description", "Status", "Actions"]
                        : ["#", "Discount Name", "Discount Value", "Description", "Status", "Actions"]
                      ).map((heading) => (
                        <th key={heading} style={{ padding: isMobile ? "8px 6px" : "14px 12px", fontSize: isMobile ? "0.7rem" : "0.9rem", fontWeight: 700, whiteSpace: "nowrap" }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeTab === "promos" ? (
                      promos.length ? promos.map((promo, index) => (
                        <tr key={promo.id} style={{ borderBottom: "1px solid #e0e8f0" }}>
                          <td style={{ padding: isMobile ? "9px 8px" : "11px 12px", fontWeight: 700 }}>{index + 1}</td>
                          <td style={{ padding: isMobile ? "9px 8px" : "11px 12px", fontWeight: 800 }}>{promo.name}</td>
                          <td style={{ padding: isMobile ? "9px 8px" : "11px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{Number(promo.percentage)}%</td>
                          <td style={{ padding: isMobile ? "9px 8px" : "11px 12px" }}>{promo.availability === "limited" ? "Limited" : "Unlimited"}</td>
                          <td style={{ padding: isMobile ? "9px 8px" : "11px 12px" }}>{promo.availability === "limited" ? promo.maxReservations : "—"}</td>
                          <td style={{ padding: isMobile ? "9px 8px" : "11px 12px", whiteSpace: "nowrap" }}>{promo.startDate || "—"}</td>
                          <td style={{ padding: isMobile ? "9px 8px" : "11px 12px", whiteSpace: "nowrap" }}>{promo.endDate || "—"}</td>
                          <td style={{ padding: isMobile ? "9px 8px" : "11px 12px", minWidth: 140 }}>{promo.description || "—"}</td>
                          <td style={{ padding: isMobile ? "9px 8px" : "11px 12px" }}>
                            <span style={{
                              display: "inline-block",
                              padding: "5px 10px",
                              borderRadius: 7,
                              background: promo.active ? "#c9f4d0" : "#edf0f4",
                              color: promo.active ? "#16752c" : "#596579",
                              fontWeight: 800,
                              fontSize: isMobile ? "0.7rem" : "0.78rem",
                            }}>{promo.active ? "Active" : "Inactive"}</span>
                          </td>
                          <td style={{ padding: isMobile ? "8px" : "8px 12px", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 8 }}>
                              <button type="button" onClick={() => openPromoModal(promo)} style={{ minHeight: isMobile ? 32 : 36, padding: isMobile ? "6px 10px" : "8px 11px", border: 0, borderRadius: 6, background: "#ffb400", color: "#fff", fontSize: isMobile ? "0.75rem" : "0.85rem", lineHeight: 1, fontWeight: 800, cursor: "pointer" }}>Edit</button>
                              <button type="button" onClick={() => handleDeletePromo(promo)} style={{ minHeight: isMobile ? 32 : 36, padding: isMobile ? "6px 10px" : "8px 11px", border: 0, borderRadius: 6, background: "#f44336", color: "#fff", fontSize: isMobile ? "0.75rem" : "0.85rem", lineHeight: 1, fontWeight: 800, cursor: "pointer" }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan="10" style={{ padding: 28, textAlign: "center", color: "#666" }}>No promos yet. Select “Add Promo” to create one.</td></tr>
                      )
                    ) : (
                      Object.keys(boat.discounts || {}).length ? Object.keys(boat.discounts).map((key, index) => (
                        <tr key={key} style={{ borderBottom: "1px solid #e0e8f0" }}>
                          <td style={{ padding: "9px 12px", fontWeight: 700 }}>{index + 1}</td>
                          <td style={{ padding: "9px 12px", fontWeight: 800 }}>{key.charAt(0).toUpperCase() + key.slice(1)} Discount</td>
                          <td style={{ padding: "7px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <input
                                aria-label={`${key} discount percentage`}
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={String((Number(boat.discounts[key]) * 100).toFixed(2)).replace(/\.00$/, "")}
                                disabled={editingDiscount !== key}
                                onChange={(event) => {
                                  const percentage = Number(event.target.value);
                                  const updatedDiscounts = { ...boat.discounts, [key]: percentage / 100 };
                                  setBoat({ ...boat, discounts: updatedDiscounts });
                                  persistDiscounts(updatedDiscounts).catch((error) => {
                                    console.error("Error updating discount:", error);
                                    setNotif("Failed to update discount. Please try again.");
                                    setTimeout(() => setNotif(""), 3000);
                                  });
                                }}
                                style={{ width: 78, padding: "7px", border: "1px solid #cbd8e6", borderRadius: 6 }}
                              />
                              %
                            </div>
                          </td>
                          <td style={{ padding: "9px 12px" }}>Discount for all {key} passengers.</td>
                          <td style={{ padding: "9px 12px" }}>
                            <span style={{ padding: "5px 10px", borderRadius: 7, background: Number(boat.discounts[key]) > 0 ? "#c9f4d0" : "#edf0f4", color: Number(boat.discounts[key]) > 0 ? "#16752c" : "#596579", fontWeight: 800, fontSize: "0.78rem" }}>
                              {Number(boat.discounts[key]) > 0 ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                            <button type="button" onClick={() => setEditingDiscount(editingDiscount === key ? null : key)} style={{ marginRight: 8, padding: "8px 11px", border: 0, borderRadius: 7, background: "#ffb400", color: "#fff", fontWeight: 800, cursor: "pointer" }}>{editingDiscount === key ? "Done" : "Edit"}</button>
                            <button type="button" onClick={() => handleDeleteDiscount(key)} style={{ padding: "8px 11px", border: 0, borderRadius: 7, background: "#f44336", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Delete</button>
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan="6" style={{ padding: 28, textAlign: "center", color: "#666" }}>No discounts configured yet.</td></tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>
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
