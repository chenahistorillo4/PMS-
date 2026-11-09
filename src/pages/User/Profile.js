import { useEffect, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
} from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  FiCreditCard,
  FiChevronRight,
  FiEdit2,
  FiKey,
  FiLock,
  FiLogOut,
  FiMail,
  FiMapPin,
  FiPhone,
  FiUser,
} from "react-icons/fi";
import { auth, db } from "../../firebase";
import "./Profile.css";
import { useAuthReloadKey, useAuthUser } from "../../hooks/useAuthUser";

function Profile() {
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    photoURL: "",
  });

  const [preview, setPreview] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const { user, authReady } = useAuthUser();
  const reloadKey = useAuthReloadKey();

  const fetchProfileData = async (currentUser = user) => {
    if (!currentUser) return;

    const docRef = doc(db, "users", currentUser.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      setProfile(docSnap.data());
    }
  };

  useEffect(() => {
    const contentElement = document.getElementById("profile-page-content");
    if (contentElement) {
      contentElement.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;

    const loadProfile = async () => {
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setProfile(docSnap.data());
      }
    };
    
    loadProfile();

    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [authReady, user, reloadKey]);

  const handleEditToggle = () => {
    setIsEditingProfile(true);
  };

  const handleCancelEdit = async () => {
    setIsEditingProfile(false);
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    await fetchProfileData();
  };

  const handleUpdate = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setIsSaving(true);
    try {
      await setDoc(doc(db, "users", user.uid), {
        name: profile.name,
        phone: profile.phone,
        address: profile.address,
        photoURL: profile.photoURL,
      }, { merge: true });
      alert("Profile updated successfully!");
      setIsEditingProfile(false);
    } catch (error) {
      alert("Error updating profile: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    // Convert to Base64 for preview and storage
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result); // Base64 data URL
    };
    reader.readAsDataURL(file);
  };

  const handleSavePicture = async () => {
    if (!preview) {
      alert("Please select a file first");
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        alert("User not authenticated");
        return;
      }

      // Save Base64 string directly to Firestore
      await setDoc(doc(db, "users", user.uid), { photoURL: preview }, { merge: true });
      setProfile((prev) => ({ ...prev, photoURL: preview }));
      setPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      alert("Profile picture saved successfully!");
    } catch (error) {
      alert("Error saving profile picture: " + error.message);
    }
  };

  const handleCancelPicture = () => {
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemovePicture = async () => {
    if (!profile.photoURL) {
      alert("No profile picture to remove");
      return;
    }

    if (!window.confirm("Are you sure you want to remove your profile picture?")) {
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) return;
      await setDoc(doc(db, "users", user.uid), { photoURL: "" }, { merge: true });
      setProfile((prev) => ({ ...prev, photoURL: "" }));
      alert("Profile picture removed!");
    } catch (error) {
      alert("Error removing profile picture: " + error.message);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordError("");

    if (!passwordForm.currentPassword) {
      setPasswordError("Please enter your current password");
      return;
    }
    if (!passwordForm.newPassword) {
      setPasswordError("Please enter a new password");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (passwordForm.currentPassword === passwordForm.newPassword) {
      setPasswordError("New password must be different from current password");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error("User not authenticated");
      }

      const credential = EmailAuthProvider.credential(user.email, passwordForm.currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwordForm.newPassword);

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setIsChangingPassword(false);
      alert("Password changed successfully!");
    } catch (error) {
      if (error.code === "auth/wrong-password") {
        setPasswordError("Current password is incorrect");
      } else if (error.code === "auth/weak-password") {
        setPasswordError("New password is too weak. Please use a stronger password");
      } else {
        setPasswordError("Error changing password: " + error.message);
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleCancelPasswordChange = () => {
    setIsChangingPassword(false);
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setPasswordError("");
  };

  const handleLogout = async () => {
    setShowLogoutModal(true);
  };

  const confirmLogoutAction = async () => {
    setShowLogoutModal(false);
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      alert("Logout failed: " + error.message);
    }
  };

  const renderField = (label, value, onChange, disabled = false, Icon = FiUser) => (
    <div className="profile-field">
      <label className="profile-label">
        <Icon aria-hidden="true" />
        {label}
      </label>
      <input
        className="profile-input"
        type="text"
        value={value || ""}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );

  return (
    <div
      className="profile-page"
      id="profile-page-content"
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed",
        paddingTop: isMobile ? "70px" : "110px",
      }}
    >
      <div className="profile-page-shell">
        <header className="profile-page-header">
          <h1 className="profile-title">
            My Profile
          </h1>
          <p>Manage your personal information and account security.</p>
        </header>

        <div className="profile-card">
          <div className="profile-picture-section">
            <div className="profile-picture-wrap">
              <img
                className="profile-picture"
                src={preview || profile.photoURL || "/profile.png"}
                alt="Profile"
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />

            <div className="profile-identity">
              <p className="profile-name">{profile.name || "User"}</p>
              <span className="profile-role">
                <FiUser aria-hidden="true" />
                Passenger
              </span>
              {isEditingProfile && (
                <div className="profile-picture-actions">
                  {!preview && (
                    <button className="profile-button profile-button-primary" onClick={() => fileInputRef.current?.click()}>
                      Update
                    </button>
                  )}
                  {preview && (
                    <button className="profile-button profile-button-success" onClick={handleSavePicture}>
                      Save
                    </button>
                  )}
                  {preview && (
                    <button className="profile-button profile-button-muted" onClick={handleCancelPicture}>
                      Cancel
                    </button>
                  )}
                  {!preview && profile.photoURL && (
                    <button className="profile-button profile-button-danger" onClick={handleRemovePicture}>
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="profile-info-header">
            <h2>
              <FiCreditCard aria-hidden="true" />
              User Information
            </h2>
            {!isEditingProfile && (
              <button className="profile-button profile-button-primary" onClick={handleEditToggle}>
                <FiEdit2 aria-hidden="true" />
                Edit Profile
              </button>
            )}
          </div>

          <div className="profile-fields-grid">
            {renderField("Full Name", profile.name, (e) => setProfile({ ...profile, name: e.target.value }), !isEditingProfile, FiUser)}
            <div className="profile-field">
              <label className="profile-label">
                <FiMail aria-hidden="true" />
                Email
              </label>
              <input className="profile-input" type="email" value={profile.email || ""} disabled />
            </div>
            {renderField("Phone", profile.phone, (e) => setProfile({ ...profile, phone: e.target.value }), !isEditingProfile, FiPhone)}
            {renderField("Address", profile.address, (e) => setProfile({ ...profile, address: e.target.value }), !isEditingProfile, FiMapPin)}
          </div>

          {isEditingProfile && (
            <div className="profile-edit-actions">
              <button className="profile-button profile-button-muted" onClick={handleCancelEdit} disabled={isSaving}>
                Cancel
              </button>
              <button className="profile-button profile-button-primary" onClick={handleUpdate} disabled={isSaving}>
                {isSaving ? "Updating..." : "Update"}
              </button>
            </div>
          )}

          <div className="profile-password-section">
            <div className="profile-password-header">
              <div className="profile-password-description">
                <FiLock aria-hidden="true" />
                <div>
                  <h3>Change Password</h3>
                  <p>Update your account password for security.</p>
                </div>
              </div>
              {!isChangingPassword && (
                <button className="profile-button profile-button-warning profile-password-toggle" onClick={() => setIsChangingPassword(true)}>
                  <FiKey aria-hidden="true" />
                  <span>Change Password</span>
                  <FiChevronRight className="profile-password-chevron" aria-hidden="true" />
                </button>
              )}
            </div>

            {isChangingPassword && (
              <div className="profile-password-card">
                {passwordError && <div className="profile-password-error">{passwordError}</div>}

                <div className="profile-field">
                  <label className="profile-label">Current Password</label>
                  <input
                    className="profile-input"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    disabled={isUpdatingPassword}
                    placeholder="Enter your current password"
                  />
                </div>

                <div className="profile-field">
                  <label className="profile-label">New Password</label>
                  <input
                    className="profile-input"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    disabled={isUpdatingPassword}
                    placeholder="Enter your new password"
                  />
                </div>

                <div className="profile-field">
                  <label className="profile-label">Confirm New Password</label>
                  <input
                    className="profile-input"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    disabled={isUpdatingPassword}
                    placeholder="Confirm your new password"
                  />
                </div>

                <div className="profile-password-actions">
                  <button className="profile-button profile-button-muted" onClick={handleCancelPasswordChange} disabled={isUpdatingPassword}>
                    Cancel
                  </button>
                  <button className="profile-button profile-button-primary" onClick={handlePasswordChange} disabled={isUpdatingPassword}>
                    {isUpdatingPassword ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </div>
            )}

          </div>
          <button className="profile-logout-button" onClick={handleLogout}>
            <FiLogOut aria-hidden="true" />
            Log Out
          </button>
        </div>

        {showLogoutModal && (
          <div className="profile-logout-backdrop" onClick={() => setShowLogoutModal(false)}>
            <div className="profile-logout-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Confirm Logout</h2>
              <p>Are you sure you want to log out?</p>
              <div className="profile-logout-modal-actions">
                <button className="profile-button profile-button-muted" onClick={() => setShowLogoutModal(false)}>
                  Cancel
                </button>
                <button className="profile-button profile-button-danger" onClick={confirmLogoutAction}>
                  Yes, Log Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;
