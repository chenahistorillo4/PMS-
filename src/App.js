import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

// Pages
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Booking from "./pages/User/Booking";
import BookingDetails from "./pages/User/BookingDetails";
import PaymentRedirect from "./pages/User/PaymentRedirect";
import Schedule from "./pages/User/Schedule";
import ManageBooking from "./pages/User/ManageBooking";
import About from "./pages/User/About"; 
import Profile from "./pages/User/Profile";
import UserNotifications from "./pages/User/Notifications";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import AdminProfile from "./pages/Admin/AdminProfile";
import BookingManagement from "./pages/Admin/BookingManagement"; 
import ScheduleManagement from "./pages/Admin/ScheduleManagement";
import PaymentManagement from "./pages/Admin/PaymentManagement";
import DiscountManagement from "./pages/Admin/DiscountManagement";
import AdminNotifications from "./pages/Admin/AdminNotifications";
import SuperadminDashboard from "./pages/SuperAdmin/SuperadminDashboard";
import CreateAccount from "./pages/SuperAdmin/CreateAccount";
import ManageAdmins from "./pages/SuperAdmin/ManageAdmins";
import ManageQRScanners from "./pages/SuperAdmin/ManageQRScanners";
import QRScanner from "./pages/scanner/QRScanner";
import RoleRedirect from "./components/RoleRedirect";
import { Navigate } from "react-router-dom";

// Components
import Navbar from "./components/Navbar";

const HIDDEN_NAVBAR_ROUTES = [
  "/admin-dashboard",
  "/admin-profile",
  "/booking-management",
  "/schedule-management",
  "/payment-management",
  "/discount-management",
  "/admin-notifications",
  "/superadmin-dashboard",
  "/create-account",
  "/manage-admins",
  "/manage-qr-scanners",
  "/qr-scanner"
];

function AppWrapper() {
  const [user, setUser] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const isHiddenNavbarRoute = HIDDEN_NAVBAR_ROUTES.includes(location.pathname);

    if (!isHiddenNavbarRoute) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [location.pathname]);

  return (
    <>
      {/* Show Navbar only if NOT in admin/superadmin routes */}
      {!HIDDEN_NAVBAR_ROUTES.includes(location.pathname) && <Navbar user={user} />}

      <Routes>
        {/* User routes */}
        <Route path="/" element={<Navigate to="/home" />} />
        <Route path="/home" element={<Home user={user} />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/booking" element={<Booking />} />
        <Route path="/booking-details" element={<BookingDetails />} />
        <Route path="/payment-redirect" element={<PaymentRedirect />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/manage" element={<ManageBooking />} />
        <Route path="/manage-booking" element={<ManageBooking />} />
        <Route path="/about" element={<About />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/notifications" element={<UserNotifications />} /> 

        {/* Role redirect route */}
        <Route path="/redirect" element={<RoleRedirect />} />

        {/* Admin routes */}
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/admin-profile" element={<AdminProfile />} />
        <Route path="/booking-management" element={<BookingManagement />} />
        <Route path="/schedule-management" element={<ScheduleManagement />} />
        <Route path="/payment-management" element={<PaymentManagement />} />
        <Route path="/discount-management" element={<DiscountManagement />} />
        <Route path="/admin-notifications" element={<AdminNotifications />} />

        {/* Superadmin routes */}
        <Route path="/superadmin-dashboard" element={<SuperadminDashboard />} />
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/manage-admins" element={<ManageAdmins />} />
        <Route path="/manage-qr-scanners" element={<ManageQRScanners />} />

        {/* QR Scanner route */}
        <Route path="/qr-scanner" element={<QRScanner user={user} />} />
      </Routes>
    </>
  );
} 

function App() {
  return (
    <Router>
      <AppWrapper />
    </Router>
  );
}

export default App;
 