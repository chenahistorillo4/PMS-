import { useCallback, useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { accountCreationAuth, db } from '../../firebase';
import { useAuth } from '../../hooks/AuthContext';
import AdminLayout from '../Admin/AdminLayout';

const initialForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
};

function PortStaffManagement() {
  const { user } = useAuth();
  const [adminData, setAdminData] = useState(null);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadStaff = useCallback(async () => {
    if (!user) {
      setAdminData(null);
      setStaff([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      const adminSnapshot = await getDoc(doc(db, 'admins', user.uid));
      if (!adminSnapshot.exists()) {
        setAdminData(null);
        setStaff([]);
        setErrorMessage('Your admin profile could not be found. Sign in again or contact support.');
        return;
      }

      const adminRecord = adminSnapshot.data();
      setAdminData(adminRecord);
      const staffCollection = collection(db, 'port_staff');
      const staffQueries = [
        getDocs(query(staffCollection, where('adminId', '==', user.uid))),
      ];
      if (adminRecord.assignedBoat) {
        staffQueries.push(
          getDocs(query(staffCollection, where('assignedBoat', '==', adminRecord.assignedBoat)))
        );
      }
      const staffSnapshots = await Promise.all(staffQueries);
      const staffById = new Map();
      staffSnapshots.forEach((snapshot) => {
        snapshot.docs.forEach((staffDoc) => {
          staffById.set(staffDoc.id, { id: staffDoc.id, ...staffDoc.data() });
        });
      });
      setStaff(
        [...staffById.values()]
          .sort((a, b) => {
            const aDate = a.createdAt?.toDate?.() || a.createdAt || 0;
            const bDate = b.createdAt?.toDate?.() || b.createdAt || 0;
            return bDate - aDate;
          })
      );
    } catch (error) {
      console.error('Error loading port staff accounts:', error);
      setErrorMessage(`Unable to load Port Staff accounts: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!adminData?.assignedBoat) {
      setErrorMessage('No boat is assigned to your admin account. Ask the Super Admin to update it first.');
      return;
    }
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setErrorMessage('Enter a name, email address, and temporary password.');
      return;
    }
    if (form.password.length < 6) {
      setErrorMessage('The password must be at least 6 characters long.');
      return;
    }

    setIsCreating(true);
    try {
      const credential = await createUserWithEmailAndPassword(
        accountCreationAuth,
        form.email.trim(),
        form.password
      );
      const staffUser = credential.user;
      const staffRecord = {
        uid: staffUser.uid,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        role: 'port_staff',
        status: 'active',
        adminId: user.uid,
        adminName: adminData.name || user.email || 'Admin',
        assignedBoat: adminData.assignedBoat,
        assignedRoute: adminData.assignedRoute || null,
        permissions: ['scan_qr'],
        createdAt: new Date(),
        lastLogin: null,
      };

      try {
        await setDoc(doc(db, 'port_staff', staffUser.uid), staffRecord);
      } catch (error) {
        try {
          await deleteUser(staffUser);
        } catch (cleanupError) {
          console.error('Failed to remove the Auth account that was not written to Firestore:', cleanupError);
        }
        throw error;
      }
      setStaff((current) =>
        [{ id: staffUser.uid, ...staffRecord }, ...current]
      );
      setForm(initialForm);
      setSuccessMessage(`The account for ${staffRecord.name} was created. Share the email and temporary password with the staff member securely.`);
    } catch (error) {
      console.error('Error creating port staff account:', error);
      if (error.code === 'auth/email-already-in-use') {
        setErrorMessage('This email address is already in use. Use a different email address.');
      } else if (error.code === 'auth/invalid-email') {
        setErrorMessage('Enter a valid email address.');
      } else {
        setErrorMessage(`Unable to create the account: ${error.message}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleStatus = async (member) => {
    const nextStatus = member.status === 'active' ? 'inactive' : 'active';
    setErrorMessage('');
    try {
      await updateDoc(doc(db, 'port_staff', member.id), { status: nextStatus });
      setStaff((current) =>
        current.map((item) => (item.id === member.id ? { ...item, status: nextStatus } : item))
      );
    } catch (error) {
      console.error('Error updating port staff status:', error);
      setErrorMessage(`Unable to update the account status: ${error.message}`);
    }
  };

  const formatDate = (value) => {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-PH') : 'Not available';
  };

  const filteredStaff = staff.filter((member) =>
    [member.name, member.email, member.assignedBoat]
      .some((value) => (value || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <AdminLayout active="port-staff">
      <main style={{ width: '100%', boxSizing: 'border-box', paddingBottom: 48 }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ margin: '0 0 6px', color: '#17324d', fontSize: '1.3rem', fontWeight: 800 }}>Port Staff</h1>
          <p style={{ margin: 0, color: '#607080', fontSize: '0.95rem' }}>
            Create and manage Port Staff accounts for {adminData?.assignedBoat || 'your assigned boat'}.
          </p>
        </header>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: 20,
              boxShadow: '0 4px 18px rgba(23, 50, 77, 0.08)',
            }}
          >
            <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 800, color: '#17324d' }}>Create a Port Staff account</h2>
            <p style={{ margin: '0 0 20px', color: '#68798a', fontSize: '0.85rem' }}>
              The account will be linked to your assigned boat and route.
            </p>

            <label style={labelStyle}>
              Full name
              <input
                required
                autoComplete="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Email address
              <input
                required
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Phone number <span style={{ color: '#758596', fontWeight: 400 }}></span>
              <input
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Temporary password
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                style={inputStyle}
              />
              <span style={{ color: '#758596', fontWeight: 400, fontSize: 12 }}>
                Must be at least 6 characters.
              </span>
            </label>

            <div style={assignmentStyle}>
              <strong>Assigned boat:</strong> {adminData?.assignedBoat || 'Not assigned'}
              <br />
              <strong>Assigned route:</strong> {adminData?.assignedRoute || 'Not specified'}
            </div>

            {errorMessage && <p role="alert" style={messageStyle('#b42318', '#fff1f0')}>{errorMessage}</p>}
            {successMessage && <p role="status" style={messageStyle('#176b3a', '#eaf7ef')}>{successMessage}</p>}

            <button
              type="submit"
              disabled={isCreating || !adminData?.assignedBoat}
              style={{
                width: '100%',
                border: 0,
                borderRadius: 8,
                padding: '12px 16px',
                background: isCreating || !adminData?.assignedBoat ? '#9bb8d1' : '#1976d2',
                color: '#fff',
                fontWeight: 800,
                cursor: isCreating || !adminData?.assignedBoat ? 'not-allowed' : 'pointer',
              }}
            >
              {isCreating ? 'Creating account...' : 'Create Port Staff Account'}
            </button>
          </form>

          <section
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: 20,
              boxShadow: '0 4px 18px rgba(23, 50, 77, 0.08)',
              minHeight: 220,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: '0 0 5px', fontSize: '1.1rem', fontWeight: 800, color: '#17324d' }}>Manage Port Staff</h2>
                <p style={{ margin: 0, color: '#68798a', fontSize: '0.85rem' }}>
                  Staff assigned to {adminData?.assignedBoat || 'your assigned boat'}
                </p>
              </div>
              <span
                style={{
                  borderRadius: 20,
                  padding: '6px 11px',
                  background: '#eaf3fc',
                  color: '#1769aa',
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                {staff.length}
              </span>
            </div>

            <label style={{ display: 'block', marginTop: 20 }}>
              <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
                Search Port Staff
              </span>
              <input
                type="search"
                placeholder="Search by name, email, or boat..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cad5df', borderRadius: 7, padding: '10px 12px', color: '#20384d', fontSize: '0.9rem' }}
              />
            </label>

            {isLoading ? (
              <p style={{ color: '#68798a', marginTop: 24 }}>Loading accounts...</p>
            ) : errorMessage && staff.length === 0 ? (
              <p style={{ color: '#b42318', marginTop: 24 }}>{errorMessage}</p>
            ) : filteredStaff.length === 0 ? (
              <div style={{ marginTop: 16, padding: 18, background: '#f5f8fb', borderRadius: 10, color: '#68798a' }}>
                {staff.length === 0
                  ? 'No Port Staff accounts are assigned to this boat yet.'
                  : 'No Port Staff accounts match your search.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, fontSize: 13, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f2f7fb', color: '#40596d' }}>
                      {['Name', 'Email', 'Contact Details', 'Assigned Boat', 'Status', 'Created', 'Last Login', 'Actions'].map((heading) => (
                        <th key={heading} style={{ padding: '11px 10px', borderBottom: '1px solid #e5ebf1', whiteSpace: 'nowrap' }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map((member) => (
                      <tr key={member.id}>
                        <td style={tableCellStyle}>{member.name || 'Not provided'}</td>
                        <td style={{ ...tableCellStyle, overflowWrap: 'anywhere' }}>{member.email || 'Not provided'}</td>
                        <td style={tableCellStyle}>{member.phone || 'Not provided'}</td>
                        <td style={tableCellStyle}>{member.assignedBoat || 'Not assigned'}</td>
                        <td style={tableCellStyle}>
                          <span style={statusStyle(member.status)}>
                            {member.status === 'inactive' ? 'Inactive' : 'Active'}
                          </span>
                        </td>
                        <td style={tableCellStyle}>{formatDate(member.createdAt)}</td>
                        <td style={tableCellStyle}>{formatDate(member.lastLogin)}</td>
                        <td style={tableCellStyle}>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(member)}
                            style={statusButtonStyle(member.status)}
                          >
                            {member.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </main>
    </AdminLayout>
  );
}

const labelStyle = {
  display: 'grid',
  gap: 7,
  marginBottom: 15,
  color: '#30475d',
  fontSize: '0.85rem',
  fontWeight: 700,
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #cad5df',
  borderRadius: 7,
  padding: '10px 12px',
  color: '#20384d',
  fontSize: '0.9rem',
};

const assignmentStyle = {
  margin: '2px 0 16px',
  padding: '12px',
  borderRadius: 8,
  background: '#f2f7fb',
  color: '#40596d',
  fontSize: '0.85rem',
  lineHeight: 1.7,
};

const statusStyle = (status) => ({
  background: status === 'inactive' ? '#f1f3f5' : '#eaf7ef',
  color: status === 'inactive' ? '#596775' : '#176b3a',
  borderRadius: 16,
  padding: '5px 9px',
  fontSize: 12,
  fontWeight: 800,
});

const statusButtonStyle = (status) => ({
  border: 0,
  borderRadius: 6,
  padding: '7px 9px',
  background: status === 'active' ? '#fff0e6' : '#eaf7ef',
  color: status === 'active' ? '#a44912' : '#176b3a',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
});

const tableCellStyle = {
  padding: '11px 10px',
  borderBottom: '1px solid #e5ebf1',
  color: '#40596d',
  verticalAlign: 'middle',
};

const messageStyle = (color, background) => ({
  margin: '0 0 14px',
  padding: '11px 12px',
  borderRadius: 8,
  background,
  color,
  fontSize: '0.85rem',
  lineHeight: 1.45,
});

export default PortStaffManagement;
