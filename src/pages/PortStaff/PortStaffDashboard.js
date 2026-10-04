import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../firebase';
import { useAuth } from '../../hooks/AuthContext';

function PortStaffDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [staffData, setStaffData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const loadStaffProfile = async () => {
      if (!user) return;
      try {
        const staffSnapshot = await getDoc(doc(db, 'port_staff', user.uid));
        if (!staffSnapshot.exists()) {
          setErrorMessage('The Port Staff profile for this account could not be found.');
          return;
        }
        const profile = staffSnapshot.data();
        if (profile.status === 'inactive') {
          setErrorMessage('Your account is inactive. Contact your admin to restore access.');
          return;
        }
        setStaffData({ ...profile, lastLogin: new Date() });
        try {
          await updateDoc(doc(db, 'port_staff', user.uid), {
            lastLogin: serverTimestamp(),
          });
        } catch (error) {
          console.warn('Unable to update the Port Staff last login time:', error);
        }
      } catch (error) {
        console.error('Error loading port staff profile:', error);
        setErrorMessage(`Unable to load your profile: ${error.message}`);
      }
    };

    loadStaffProfile();
  }, [user]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Error signing out port staff:', error);
      setErrorMessage(`Unable to sign out: ${error.message}`);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        padding: 'clamp(20px, 5vw, 64px)',
        background: 'linear-gradient(145deg, #eef6fc, #f7f9fc 55%, #e6f3f7)',
      }}
    >
      <section
        style={{
          maxWidth: 820,
          margin: '0 auto',
          background: '#fff',
          borderRadius: 18,
          padding: 'clamp(24px, 5vw, 48px)',
          boxShadow: '0 12px 40px rgba(28, 73, 110, 0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, color: '#1976d2', fontWeight: 800, letterSpacing: 1, fontSize: 13 }}>
              PORT STAFF PORTAL
            </p>
            <h1 style={{ margin: '8px 0 4px', color: '#17324d', fontSize: 'clamp(26px, 4vw, 36px)' }}>
              Welcome{staffData?.name ? `, ${staffData.name}` : ''}
            </h1>
            <p style={{ margin: 0, color: '#63788a' }}>Your account and assignment information</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              border: '1px solid #cad5df',
              borderRadius: 8,
              background: '#fff',
              color: '#30475d',
              padding: '10px 14px',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Sign out
          </button>
        </div>

        {errorMessage && (
          <p role="alert" style={{ marginTop: 22, padding: 12, borderRadius: 8, color: '#b42318', background: '#fff1f0' }}>
            {errorMessage}
          </p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14,
            marginTop: 30,
          }}
        >
          <InfoCard label="Assigned boat" value={staffData?.assignedBoat || 'Loading...'} />
          <InfoCard label="Assigned route" value={staffData?.assignedRoute || 'Not specified'} />
          <InfoCard
            label="Account status"
            value={
              staffData?.status === 'active'
                ? 'Active'
                : staffData?.status === 'inactive'
                  ? 'Inactive'
                  : 'Loading...'
            }
          />
          <InfoCard label="Managing admin" value={staffData?.adminName || 'Not specified'} />
          <InfoCard
            label="Last login"
            value={staffData?.lastLogin?.toDate?.()?.toLocaleString('en-PH') || staffData?.lastLogin?.toLocaleString?.('en-PH') || 'Just now'}
          />
        </div>

        <div
          style={{
            marginTop: 22,
            padding: 16,
            borderRadius: 10,
            background: '#f4f8fb',
            color: '#516678',
            lineHeight: 1.6,
          }}
        >
          This account is linked to your assigned boat. Contact your admin if you need changes to
          your account or assignments.
        </div>
      </section>
    </main>
  );
}

function InfoCard({ label, value }) {
  return (
    <div style={{ padding: 16, background: '#f7fafd', border: '1px solid #e6edf3', borderRadius: 10 }}>
      <p style={{ margin: '0 0 7px', color: '#718394', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>
        {label}
      </p>
      <p style={{ margin: 0, color: '#20384d', fontWeight: 800, overflowWrap: 'anywhere' }}>{value}</p>
    </div>
  );
}

export default PortStaffDashboard;
