import AdminLayout from '../Admin/AdminLayout';
import QRScanner from './QRScanner';

function PortStaffDashboard() {
  return (
    <AdminLayout active="profile">
      <QRScanner embedded profileOnly />
    </AdminLayout>
  );
}

export default PortStaffDashboard;
