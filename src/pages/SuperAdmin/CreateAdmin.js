import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, collection, getDocs, addDoc } from "firebase/firestore";
import SuperadminLayout from "./SuperadminLayout";
import { useNavigate } from "react-router-dom";
import "./CreateAdmin.css";



function CreateAdmin() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [boat, setBoat] = useState("");
  const [route, setRoute] = useState("");
  const [boats, setBoats] = useState([]);
  const [availableRoutes, setAvailableRoutes] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
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

  const handleBoatSelect = (e) => {
    const selectedBoatName = e.target.value;
    setBoat(selectedBoatName);

    const selectedBoat = boats.find(b => b.name === selectedBoatName);
    if (selectedBoat) {
      setRoute(selectedBoat.route);
    } else {
      setRoute("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      let assignedBoat = boat;
      let assignedRoute = route;

      // If boat is not in existing list, add new boat to Firestore
      const existingBoat = boats.find(b => b.name === boat);
      if (!existingBoat && boat && route) {
        await addDoc(collection(db, "boats"), {
          name: boat,
          route: route
        });
      }

      await setDoc(doc(db, "admins", uid), {
        uid,
        name,
        email,
        role: "admin",
        assignedBoat: assignedBoat,
        assignedRoute: assignedRoute,
        availableRoutes: availableRoutes.split(" ,").map(r => r.trim()),
        createdAt: new Date()
      });

      alert("Admin account created successfully!");
      navigate("/manage-admins");
      setName(""); setEmail(""); setPassword(""); setBoat(""); setRoute(""); setAvailableRoutes("");
    } catch (error) {
      alert("Error creating admin: " + error.message);
    }
  };



  return (
    <SuperadminLayout active="create-admin">
      <div className="create-admin-container">
        <div className="create-admin-form-wrapper">
          <h3 className="create-admin-title">Create Admin Account</h3>
          
          <form onSubmit={handleSubmit} className="create-admin-form">
            <label className="form-label">Full Name *</label>
            <input 
              type="text" 
              className="form-control form-input" 
              placeholder="Enter full name" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required 
            />

            <label className="form-label">Email Address *</label>
            <input 
              type="email" 
              className="form-control form-input" 
              placeholder="Enter email address" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />

            <label className="form-label">Password *</label>
            <input 
              type="password" 
              className="form-control form-input" 
              placeholder="Enter password (min. 6 characters)" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
            />

            {/* Select existing boat */}
            <label className="form-label">Select Boat *</label>
            <select 
              className="form-select form-input" 
              value={boat} 
              onChange={handleBoatSelect}
            >
              <option value="">-- Select Boat --</option>
              {boats.map((b) => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>

            {/* If boat is new, type it manually */}
            {!boats.find(b => b.name === boat) && (
              <>
                <label className="form-label">Boat Name *</label>
                <input 
                  type="text" 
                  className="form-control form-input" 
                  placeholder="Enter boat name" 
                  value={boat} 
                  onChange={(e) => setBoat(e.target.value)} 
                  required 
                />
                <label className="form-label">Boat Route *</label>
                <input 
                  type="text" 
                  className="form-control form-input" 
                  placeholder="Enter boat route" 
                  value={route} 
                  onChange={(e) => setRoute(e.target.value)} 
                  required 
                />
              </>
            )}

            {/* If existing boat, show route read-only */}
            {boats.find(b => b.name === boat) && (
              <>
                <label className="form-label">Route</label>
                <input 
                  type="text" 
                  className="form-control form-input" 
                  placeholder="Route" 
                  value={route} 
                  readOnly 
                />
              </>
            )}

            <label className="form-label">Available Routes (comma separated) *</label>
            <input
              type="text"
              className="form-control form-input"
              placeholder="e.g., Route 1, Route 2, Route 3"
              value={availableRoutes}
              onChange={(e) => setAvailableRoutes(e.target.value)}
              required
            />

            <button className="btn btn-primary create-admin-button">Create Admin</button>
          </form>
        </div>
      </div>
    </SuperadminLayout>
  );
}

export default CreateAdmin;
