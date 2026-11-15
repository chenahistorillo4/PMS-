import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import AdminLayout from "./AdminLayout";
import { CARGO_PRICING_BASES, DEFAULT_CARGO_TYPES, isValidCargoPrice } from "../../utils/cargoPricing";
import { getStaffAccount } from "../../utils/staffAccount";
import { useAuthUser } from "../../hooks/useAuthUser";
import "./CargoManagement.css";

const EMPTY_FORM = {
  name: "",
  pricingBasis: CARGO_PRICING_BASES[0],
  price: "",
  status: "inactive",
};

function CargoManagement() {
  const { user, authReady } = useAuthUser();
  const [cargoTypes, setCargoTypes] = useState([]);
  const [assignedBoat, setAssignedBoat] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    if (!authReady || !user) return undefined;

    let active = true;
    let unsubscribeCargo;
    const loadCargoCatalog = async () => {
      try {
        const account = await getStaffAccount(user.uid);
        const boat = account?.data?.assignedBoat;
        if (!boat) {
          throw new Error("This admin account does not have an assigned boat.");
        }
        if (!active) return;

        setAssignedBoat(boat);
        unsubscribeCargo = onSnapshot(
          query(collection(db, "cargoTypes"), where("boat", "==", boat)),
          (snapshot) => {
            setCargoTypes(snapshot.docs
              .map((cargoDoc) => ({ id: cargoDoc.id, ...cargoDoc.data() }))
              .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))));
            setLoading(false);
          },
          (error) => {
            console.error("Error loading cargo types:", error);
            setMessage({ type: "error", text: "Unable to load cargo types. Check your connection and permissions." });
            setLoading(false);
          }
        );
      } catch (error) {
        console.error("Error loading assigned boat:", error);
        if (!active) return;
        setMessage({ type: "error", text: error.message || "Unable to load the assigned boat." });
        setLoading(false);
      }
    };
    loadCargoCatalog();

    return () => {
      active = false;
      unsubscribeCargo?.();
    };
  }, [authReady, user]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!assignedBoat) {
      setMessage({ type: "error", text: "An assigned boat is required to manage cargo types." });
      return;
    }
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name || !isValidCargoPrice(form.price)) {
      setMessage({ type: "error", text: "Enter a cargo name and a valid non-negative price." });
      return;
    }
    if (form.status === "active" && price <= 0) {
      setMessage({ type: "error", text: "Set a price greater than zero before activating this cargo type." });
      return;
    }
    const duplicate = cargoTypes.some((cargo) =>
      cargo.id !== editingId &&
      cargo.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setMessage({ type: "error", text: "A cargo type with this name already exists." });
      return;
    }

    setSaving(true);
    setMessage({ type: "", text: "" });
    const cargoData = {
      boat: assignedBoat,
      name,
      pricingBasis: form.pricingBasis,
      price,
      status: form.status,
      updatedAt: serverTimestamp(),
    };
    try {
      if (editingId) {
        await updateDoc(doc(db, "cargoTypes", editingId), {
          ...cargoData,
          category: deleteField(),
          size: deleteField(),
        });
        setMessage({ type: "success", text: "Cargo type updated." });
      } else {
        await addDoc(collection(db, "cargoTypes"), {
          ...cargoData,
          createdAt: serverTimestamp(),
        });
        setMessage({ type: "success", text: "Cargo type added." });
      }
      resetForm();
    } catch (error) {
      console.error("Error saving cargo type:", error);
      setMessage({ type: "error", text: error.message || "Unable to save cargo type." });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (cargo) => {
    setEditingId(cargo.id);
    setForm({
      name: cargo.name,
      pricingBasis: cargo.pricingBasis,
      price: String(cargo.price),
      status: cargo.status === "active" ? "active" : "inactive",
    });
    setMessage({ type: "", text: "" });
  };

  const handleDelete = async (cargo) => {
    if (!window.confirm(`Delete ${cargo.name}? Existing bookings keep their saved cargo and price details.`)) {
      return;
    }
    setMessage({ type: "", text: "" });
    try {
      await deleteDoc(doc(db, "cargoTypes", cargo.id));
      if (editingId === cargo.id) resetForm();
      setMessage({ type: "success", text: `${cargo.name} deleted.` });
    } catch (error) {
      console.error("Error deleting cargo type:", error);
      setMessage({ type: "error", text: error.message || "Unable to delete cargo type." });
    }
  };

  const handleToggleStatus = async (cargo) => {
    const nextStatus = cargo.status === "active" ? "inactive" : "active";
    if (nextStatus === "active" && Number(cargo.price) <= 0) {
      setMessage({ type: "error", text: "Set a price greater than zero before activating this cargo type." });
      return;
    }
    try {
      await updateDoc(doc(db, "cargoTypes", cargo.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      setMessage({ type: "success", text: `${cargo.name} is now ${nextStatus}.` });
    } catch (error) {
      console.error("Error updating cargo status:", error);
      setMessage({ type: "error", text: error.message || "Unable to update cargo status." });
    }
  };

  const handleAddSuggestedTypes = async () => {
    if (!assignedBoat) {
      setMessage({ type: "error", text: "An assigned boat is required to add cargo types." });
      return;
    }
    setSeeding(true);
    setMessage({ type: "", text: "" });
    try {
      const currentCatalog = await getDocs(
        query(collection(db, "cargoTypes"), where("boat", "==", assignedBoat))
      );
      const existingNames = new Set(
        currentCatalog.docs.map((cargoDoc) =>
          String(cargoDoc.data().name || "").trim().toLowerCase()
        )
      );
      const results = await Promise.all(DEFAULT_CARGO_TYPES.map(async (cargo) => {
        if (existingNames.has(cargo.name.toLowerCase())) return false;
        const cargoRef = doc(collection(db, "cargoTypes"));
        await setDoc(cargoRef, {
          ...cargo,
          boat: assignedBoat,
          price: 0,
          status: "inactive",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return true;
      }));
      const addedCount = results.filter(Boolean).length;
      setMessage({
        type: "success",
        text: addedCount
          ? `${addedCount} suggested cargo types added as inactive. Set each price and activate those available for booking.`
          : "Suggested cargo types are already in the catalog.",
      });
    } catch (error) {
      console.error("Error adding suggested cargo types:", error);
      setMessage({ type: "error", text: error.message || "Unable to add suggested cargo types." });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <AdminLayout active="cargo">
      <main className="cargo-management-page">
        <header className="cargo-management-header">
          <div>
            <h1>Cargo Pricing Management</h1>
            <p>
              Set cargo prices for <strong>{assignedBoat || "your assigned boat"}</strong>. Passengers see the catalog for their selected trip's boat.
            </p>
          </div>
          <button type="button" className="cargo-secondary-button" onClick={handleAddSuggestedTypes} disabled={seeding}>
            {seeding ? "Adding..." : "Add Suggested Cargo Types"}
          </button>
        </header>

        {message.text && (
          <div className={`cargo-message ${message.type}`} role={message.type === "error" ? "alert" : "status"}>
            {message.text}
          </div>
        )}

        <section className="cargo-editor-card">
          <h2>{editingId ? "Edit Cargo Type" : "Add Cargo Type"}</h2>
          <form onSubmit={handleSubmit} className="cargo-editor-form">
            <label>
              Cargo Name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={80} />
            </label>
            <label>
              Pricing Basis
              <select value={form.pricingBasis} onChange={(event) => setForm({ ...form, pricingBasis: event.target.value })}>
                {CARGO_PRICING_BASES.map((basis) => <option key={basis}>{basis}</option>)}
              </select>
            </label>
            <label>
              Price (₱)
              <input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div className="cargo-form-actions">
              <button type="submit" className="cargo-primary-button" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save Changes" : "Add Cargo Type"}
              </button>
              {editingId && <button type="button" className="cargo-secondary-button" onClick={resetForm}>Cancel Edit</button>}
            </div>
          </form>
        </section>

        <section className="cargo-category-card" aria-label="Cargo types">
          <h2>Cargo Types</h2>
          {loading ? <p className="cargo-empty-state">Loading cargo types...</p> : cargoTypes.length === 0 ? (
            <p className="cargo-empty-state">No cargo types yet.</p>
          ) : (
            <div className="cargo-table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Basis</th><th>Price</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {cargoTypes.map((cargo) => (
                    <tr key={cargo.id}>
                      <td>{cargo.name}</td>
                      <td>{cargo.pricingBasis}</td>
                      <td>₱{Number(cargo.price).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td><span className={`cargo-status ${cargo.status === "active" ? "active" : "inactive"}`}>{cargo.status || "inactive"}</span></td>
                      <td className="cargo-row-actions">
                        <button type="button" onClick={() => handleEdit(cargo)}>Edit</button>
                        <button type="button" onClick={() => handleToggleStatus(cargo)}>{cargo.status === "active" ? "Deactivate" : "Activate"}</button>
                        <button type="button" className="danger" onClick={() => handleDelete(cargo)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </AdminLayout>
  );
}

export default CargoManagement;
