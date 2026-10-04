import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";

// Pages
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Booking from "./pages/User/Booking";
import BookingDetails from "./pages/User/BookingDetails";
import PaymentRedirect from "./pages/User/PaymentRedirect";
import PaymentReturn from "./pages/User/PaymentReturn";
import PaymentQrPh from "./pages/User/PaymentQrPh";
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
import PortStaffManagement from "./pages/PortStaff/PortStaffManagement";
import SuperadminDashboard from "./pages/SuperAdmin/SuperadminDashboard";
import ReportsAnalytics from "./pages/SuperAdmin/ReportsAnalytics";
import AdminLayout from "./pages/Admin/AdminLayout";
import CreateAccount from "./pages/SuperAdmin/CreateAccount";
import ManageAdmins from "./pages/SuperAdmin/ManageAdmins";
import ManageQRScanners from "./pages/SuperAdmin/ManageQRScanners";
import QRScanner from "./pages/PortStaff/QRScanner";
import RoleRedirect from "./components/RoleRedirect";
import { AuthProvider, useAuth } from "./hooks/AuthContext";
import ProtectedRoute from "./hooks/ProtectedRoute";

// Components
import Navbar from "./components/Navbar";
import SeoManager from "./components/SeoManager";

const HIDDEN_NAVBAR_ROUTES = [
  "/admin-dashboard",
  "/admin-profile",
  "/booking-management",
  "/schedule-management",
  "/payment-management",
  "/discount-management",
  "/admin-notifications",
  "/port-staff-management",
  "/port-staff-dashboard",
  "/superadmin-dashboard",
  "/superadmin-reports",
  "/create-account",
  "/manage-admins",
  "/manage-port-staff",
  "/manage-qr-scanners",
  "/qr-scanner"
];

function AppWrapper() {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const isHiddenNavbarRoute = HIDDEN_NAVBAR_ROUTES.includes(location.pathname);

    if (!isHiddenNavbarRoute) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [location.pathname]);

  return (
    <>
      <SeoManager />
      {/* Show Navbar only if NOT in admin/superadmin routes */}
      {!HIDDEN_NAVBAR_ROUTES.includes(location.pathname) && <Navbar user={user} />}

      <Routes>
        {/* User routes */}
        <Route path="/" element={<Navigate to="/home" />} />
        <Route path="/home" element={<Home user={user} />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/booking" element={<ProtectedRoute requiredRole="user"><Booking /></ProtectedRoute>} />
        <Route path="/booking-details" element={<ProtectedRoute requiredRole="user"><BookingDetails /></ProtectedRoute>} />
        <Route path="/payment-redirect" element={<ProtectedRoute requiredRole="user"><PaymentRedirect /></ProtectedRoute>} />
        <Route path="/payment-return" element={<ProtectedRoute requiredRole="user"><PaymentReturn /></ProtectedRoute>} />
        <Route path="/payment-qr" element={<ProtectedRoute requiredRole="user"><PaymentQrPh /></ProtectedRoute>} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/manage" element={<ProtectedRoute requiredRole="user"><ManageBooking /></ProtectedRoute>} />
        <Route path="/manage-booking" element={<ProtectedRoute requiredRole="user"><ManageBooking /></ProtectedRoute>} />
        <Route path="/about" element={<About />} />
        <Route path="/profile" element={<ProtectedRoute requiredRole="user"><Profile /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute requiredRole="user"><UserNotifications /></ProtectedRoute>} />

        {/* Role redirect route */}
        <Route path="/redirect" element={<RoleRedirect />} />

        {/* Admin routes */}
        <Route path="/admin-dashboard" element={<ProtectedRoute requiredRole={["admin", "portstaff"]}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin-profile" element={<ProtectedRoute requiredRole="admin"><AdminProfile /></ProtectedRoute>} />
        <Route path="/booking-management" element={<ProtectedRoute requiredRole={["admin", "portstaff"]}><BookingManagement /></ProtectedRoute>} />
        <Route path="/schedule-management" element={<ProtectedRoute requiredRole={["admin", "portstaff"]}><ScheduleManagement /></ProtectedRoute>} />
        <Route path="/payment-management" element={<ProtectedRoute requiredRole={["admin", "portstaff"]}><PaymentManagement /></ProtectedRoute>} />
        <Route path="/discount-management" element={<ProtectedRoute requiredRole="admin"><DiscountManagement /></ProtectedRoute>} />
        <Route path="/admin-notifications" element={<ProtectedRoute requiredRole="admin"><AdminNotifications /></ProtectedRoute>} />
        <Route path="/port-staff-management" element={<ProtectedRoute requiredRole="admin"><PortStaffManagement /></ProtectedRoute>} />
        <Route path="/port-staff-dashboard" element={<ProtectedRoute requiredRole="portstaff"><Navigate to="/admin-dashboard" replace /></ProtectedRoute>} />

        {/* Superadmin routes */}
        <Route path="/superadmin-dashboard" element={<ProtectedRoute requiredRole="superadmin"><SuperadminDashboard /></ProtectedRoute>} />
        <Route path="/superadmin-reports" element={<ProtectedRoute requiredRole="superadmin"><ReportsAnalytics /></ProtectedRoute>} />
        <Route path="/create-account" element={<ProtectedRoute requiredRole="superadmin"><CreateAccount /></ProtectedRoute>} />
        <Route path="/manage-admins" element={<ProtectedRoute requiredRole="superadmin"><ManageAdmins /></ProtectedRoute>} />
        <Route path="/manage-port-staff" element={<ProtectedRoute requiredRole="superadmin"><ManageQRScanners /></ProtectedRoute>} />
        <Route path="/manage-qr-scanners" element={<Navigate to="/manage-port-staff" replace />} />

        {/* QR Scanner route */}
        <Route path="/qr-scanner" element={<ProtectedRoute requiredRole="portstaff"><AdminLayout active="scan"><QRScanner user={user} embedded /></AdminLayout></ProtectedRoute>} />
        <Route path="/unauthorized" element={<div className="text-center mt-5"><h1>Unauthorized</h1><p>You do not have permission to view this page.</p></div>} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </>
  );
} 

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppWrapper />
      </Router>
    </AuthProvider>
  );
}

export default App;
 