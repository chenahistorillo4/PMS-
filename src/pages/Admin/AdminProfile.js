import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, signOut, updateEmail } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import AdminLayout from "./AdminLayout";
import "./AdminProfile.css";

function AdminProfile() {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
    assignedBoat: "",
    assignedRoute: "",
    availableRoutes: [],
    role: "",
    createdAt: null,
    profilePicture: ""
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [passwordError, setPasswordError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      const user = auth.currentUser;
      if (user) {
        const docRef = doc(db, "admins", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data());
        }
      }
    };
    fetchProfile();

    // Handle window resize
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Update profile info
  const handleUpdate = async () => {
    setIsSaving(true);
    setEmailError("");
    try {
      const user = auth.currentUser;
      if (user) {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(profile.email)) {
          setEmailError("Please enter a valid email address");
          setIsSaving(false);
          return;
        }

        // Update email in Firebase Auth if it changed
        if (user.email !== profile.email) {
          try {
            await updateEmail(user, profile.email);
          } catch (error) {
            if (error.code === "auth/email-already-in-use") {
              setEmailError("This email is already in use by another account");
            } else if (error.code === "auth/invalid-email") {
              setEmailError("Invalid email address");
            } else if (error.code === "auth/requires-recent-login") {
              setEmailError("Please log out and log back in before changing your email");
            } else {
              setEmailError("Error updating email: " + error.message);
            }
            setIsSaving(false);
            return;
          }
        }

        // Update Firestore
        const adminRef = doc(db, "admins", user.uid);
        await updateDoc(adminRef, {
          name: profile.name,
          email: profile.email,
          phone: profile.phone?.trim() || null,
          availableRoutes: profile.availableRoutes
        });
        alert("Profile updated successfully!");
        setIsEditing(false);
      }
    } catch (error) {
      alert("Error updating profile: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    const fetchProfile = async () => {
      const user = auth.currentUser;
      if (user) {
        const docRef = doc(db, "admins", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data());
        }
      }
    };
    fetchProfile();
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    if (timestamp.toDate) {
      return timestamp.toDate().toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    }
    return new Date(timestamp).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  // Handle profile picture file selection
  const handleProfilePictureSelect = async (e) => {
    const file = e.target.files[0];
    if (file) {
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
        setPreviewImage(reader.result); // Base64 data URL
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle saving the profile picture
  const handleSaveProfilePicture = async () => {
    if (!previewImage) {
      alert("Please select an image first");
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        alert("User not logged in");
        return;
      }

      const input = document.getElementById("profilePictureInput");
      const file = input.files[0];
      
      if (!file) {
        alert("No file selected");
        return;
      }
      
      console.log("Starting profile picture save for file:", file.name);
      
      // Save Base64 string directly to Firestore
      const adminRef = doc(db, "admins", user.uid);
      console.log("Saving Base64 to Firestore...");
      
      await updateDoc(adminRef, { profilePicture: previewImage });
      console.log("✓ Saved to Firestore");

      setProfile((prev) => ({ ...prev, profilePicture: previewImage }));
      setPreviewImage(null);
      setIsEditing(false);
      input.value = "";
      console.log("✓ Profile picture saved successfully!");
      alert("Profile picture saved!");
    } catch (error) {
      console.error("Error saving profile picture:", error);
      alert("Error saving profile picture: " + error.message);
    }
  };

  const handleCancelProfilePicture = () => {
    setPreviewImage(null);
    setIsEditing(false);
    const input = document.getElementById("profilePictureInput");
    input.value = "";
  };

  // Handle removing the profile picture
  const handleRemoveProfilePicture = async () => {
    if (!profile.profilePicture) {
      alert("No profile picture to remove");
      return;
    }

    if (!window.confirm("Are you sure you want to remove your profile picture?")) {
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        alert("User not logged in");
        return;
      }

      const adminRef = doc(db, "admins", user.uid);
      await updateDoc(adminRef, { profilePicture: "" });

      setProfile((prev) => ({ ...prev, profilePicture: "" }));
      setIsEditing(false);
      alert("Profile picture removed!");
    } catch (error) {
      console.error("Error removing profile picture:", error);
      alert("Error removing profile picture: " + error.message);
    }
  };

  // Handle password change
  const handlePasswordChange = async () => {
    setPasswordError("");

    // Validation
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
      if (!user || !user.email) throw new Error("User not authenticated");

      // Reauthenticate user
      const credential = EmailAuthProvider.credential(user.email, passwordForm.currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, passwordForm.newPassword);

      // Reset form
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
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
      confirmPassword: ""
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

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };

  return (
    <AdminLayout active="profile">
      <div className={`admin-profile-page${isMobile ? " is-mobile" : ""}`}>
        {/* Header */}
        <h2 className="admin-profile-title" style={{
          fontWeight: "800",
          fontSize: isMobile ? "1.05rem" : "1.3rem",
          color: "#1a1a1a",
          marginBottom: isMobile ? "4px" : "8px",
          marginTop: "0",
          letterSpacing: "0.3px"
        }}>
          My Profile
        </h2>
        <p className="admin-profile-subtitle" style={{
          fontSize: isMobile ? "0.8rem" : "0.95rem",
          color: "#666",
          marginBottom: isMobile ? "18px" : "20px",
          fontWeight: "500",
          lineHeight: "1.4"
        }}>
          View and manage your admin profile information
        </p>

        {/* Profile Card */}
        <div className="admin-profile-content">
          {/* Profile Picture Section (Inside White Box) */}
          <div className={`admin-profile-hero${isEditing ? " is-editing" : ""}`} style={{
            display: "grid",
            justifyContent: "flex-start",
            alignItems: "center",
            flexDirection: "row",
            marginBottom: isMobile ? "18px" : "32px",
            paddingBottom: isMobile ? "15px" : "25px",
            borderBottom: "2px solid #f0f0f0"
          }}>
            <div 
              style={{
                width: isMobile ? "120px" : "140px",
                height: isMobile ? "120px" : "140px",
                borderRadius: "50%",
                backgroundColor: "#e6f0f8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                border: "4px solid #3b7ecc",
                marginBottom: "10px",
                cursor: "default",
                transition: "all 0.3s ease",
                position: "relative",
                boxShadow: "0 4px 12px rgba(59, 126, 204, 0.2)"
              }}
            >
              {previewImage ? (
                <img src={previewImage} alt="Preview" style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover"
                }} />
              ) : profile.profilePicture ? (
                <img src={profile.profilePicture} alt="Profile" style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover"
                }} />
              ) : (
                <img src="/profile.png" alt="Default Profile" style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover"
                }} />
              )}
            </div>
            <input
              id="profilePictureInput"
              type="file"
              accept="image/*"
              onChange={handleProfilePictureSelect}
              style={{
                display: "none"
              }}
            />
            {/* Picture Action Buttons - Only show when editing */}
            {isEditing && (
            <div className="admin-profile-picture-actions" style={{
              display: "flex",
              gap: "6px",
              justifyContent: "flex-start",
              marginBottom: "10px",
              flexWrap: "nowrap"
            }}>
              {!previewImage && (
              <button
                onClick={() => {
                  const fileInput = document.getElementById("profilePictureInput");
                  fileInput.click();
                }}
                style={{
                  padding: isMobile ? "5px 10px" : "8px 16px",
                  backgroundColor: "#3b7ecc",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "600",
                  fontSize: isMobile ? "0.75rem" : "0.85rem",
                  cursor: "pointer",
                  transition: "all 0.3s ease"
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = "#2c6db8";
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = "#3b7ecc";
                }}
              >
                Update
              </button>
              )}

              {previewImage && (
                <button
                  onClick={handleSaveProfilePicture}
                  style={{
                    padding: isMobile ? "5px 10px" : "8px 16px",
                    backgroundColor: "#4caf50",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "600",
                    fontSize: isMobile ? "0.75rem" : "0.85rem",
                    cursor: "pointer",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "#45a049";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "#4caf50";
                  }}
                >
                  Save
                </button>
              )}

              {previewImage && (
                <button
                  onClick={handleCancelProfilePicture}
                  style={{
                    padding: isMobile ? "5px 10px" : "8px 16px",
                    backgroundColor: "#9e9e9e",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "600",
                    fontSize: isMobile ? "0.75rem" : "0.85rem",
                    cursor: "pointer",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "#757575";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "#9e9e9e";
                  }}
                >
                  Cancel
                </button>
              )}

              {!previewImage && profile.profilePicture && (
                <button
                  onClick={handleRemoveProfilePicture}
                  style={{
                    padding: isMobile ? "5px 10px" : "8px 16px",
                    backgroundColor: "#f44336",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "600",
                    fontSize: isMobile ? "0.75rem" : "0.85rem",
                    cursor: "pointer",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "#da190b";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "#f44336";
                  }}
                >
                  Remove
                </button>
              )}
              {isMobile && (
                <button className="admin-profile-logout-button" onClick={handleLogout}>
                  Log Out
                </button>
              )}
            </div>
            )}
            <p style={{
              fontSize: "1.2rem",
              fontWeight: "700",
              color: "#1a1a1a",
              margin: "0",
              textAlign: "left"
            }}>
              {profile.name || "Admin"}
            </p>
            <p className="admin-profile-role">{profile.role || "Admin"}</p>
            <div className="admin-profile-hero-actions">
              {!isEditing && (
                <button className="admin-profile-edit-button" onClick={() => setIsEditing(true)}>
                  Edit Profile
                </button>
              )}
              {(!isEditing || !isMobile) && (
                <button className="admin-profile-logout-button" onClick={handleLogout}>
                  Log Out
                </button>
              )}
            </div>
          </div>
          <div className="admin-profile-info-grid">
          <section className="admin-profile-panel">
            <h3 className="admin-profile-panel-title">Personal Information</h3>
          {/* Profile Fields */}
          <div className="admin-profile-fields" style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: isMobile ? "14px" : "32px",
            marginBottom: isMobile ? "16px" : "28px"
          }}>
            {/* Full Name */}
            <div style={{
              padding: isMobile ? "11px 0" : "0",
              borderBottom: isMobile ? "1px solid #e8e8e8" : "none",
              backgroundColor: isMobile ? "#f9f9f9" : "transparent",
              marginLeft: isMobile ? "-8px" : "0",
              marginRight: isMobile ? "-8px" : "0",
              paddingLeft: isMobile ? "8px" : "0",
              paddingRight: isMobile ? "8px" : "0"
            }}>
              <label style={{
                display: "block",
                fontSize: isMobile ? "0.8rem" : "0.85rem",
                fontWeight: "700",
                color: "#999",
                marginBottom: isMobile ? "5px" : "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Full Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "14px 15px",
                    border: "2px solid #ddd",
                    borderRadius: "8px",
                    fontSize: "1rem",
                    transition: "border-color 0.3s ease",
                    boxSizing: "border-box"
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#3b7ecc"}
                  onBlur={(e) => e.target.style.borderColor = "#ddd"}
                />
              ) : (
                <p style={{
                  fontSize: isMobile ? "0.95rem" : "1.1rem",
                  fontWeight: "600",
                  color: "#1a1a1a",
                  margin: isMobile ? "0 0 5px 0" : "0"
                }}>
                  {profile.name}
                </p>
              )}
            </div>

            {/* Email */}
            <div style={{
              padding: isMobile ? "11px 0" : "0",
              borderBottom: isMobile ? "1px solid #e8e8e8" : "none",
              backgroundColor: isMobile ? "#f9f9f9" : "transparent",
              marginLeft: isMobile ? "-8px" : "0",
              marginRight: isMobile ? "-8px" : "0",
              paddingLeft: isMobile ? "8px" : "0",
              paddingRight: isMobile ? "8px" : "0"
            }}>
              <label style={{
                display: "block",
                fontSize: isMobile ? "0.8rem" : "0.85rem",
                fontWeight: "700",
                color: "#999",
                marginBottom: isMobile ? "5px" : "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Email Address
              </label>
              {isEditing ? (
                <>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => {
                      setProfile({ ...profile, email: e.target.value });
                      setEmailError("");
                    }}
                    style={{
                      width: "100%",
                      padding: "14px 15px",
                      border: emailError ? "2px solid #f44336" : "2px solid #ddd",
                      borderRadius: "8px",
                      fontSize: "1rem",
                      transition: "border-color 0.3s ease",
                      boxSizing: "border-box"
                    }}
                    onFocus={(e) => e.target.style.borderColor = emailError ? "#f44336" : "#3b7ecc"}
                    onBlur={(e) => e.target.style.borderColor = emailError ? "#f44336" : "#ddd"}
                  />
                  {emailError && (
                    <p style={{
                      fontSize: isMobile ? "0.75rem" : "0.8rem",
                      color: "#f44336",
                      margin: "4px 0 0 0",
                      fontWeight: "500"
                    }}>
                      {emailError}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p style={{
                    fontSize: isMobile ? "0.95rem" : "1.1rem",
                    fontWeight: "600",
                    color: "#1a1a1a",
                    margin: isMobile ? "0 0 3px 0" : "0"
                  }}>
                    {profile.email}
                  </p>
                </>
              )}
            </div>

            {/* Phone Number */}
            <div style={{
              padding: isMobile ? "11px 0" : "0",
              borderBottom: isMobile ? "1px solid #e8e8e8" : "none",
              backgroundColor: isMobile ? "#f9f9f9" : "transparent",
              marginLeft: isMobile ? "-8px" : "0",
              marginRight: isMobile ? "-8px" : "0",
              paddingLeft: isMobile ? "8px" : "0",
              paddingRight: isMobile ? "8px" : "0"
            }}>
              <label style={{
                display: "block",
                fontSize: isMobile ? "0.8rem" : "0.85rem",
                fontWeight: "700",
                color: "#999",
                marginBottom: isMobile ? "5px" : "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Phone Number (SMS alerts)
              </label>
              {isEditing ? (
                <>
                  <input
                    type="tel"
                    value={profile.phone || ""}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    placeholder="09XXXXXXXXX"
                    style={{
                      width: "100%",
                      padding: "14px 15px",
                      border: "2px solid #ddd",
                      borderRadius: "8px",
                      fontSize: "1rem",
                      transition: "border-color 0.3s ease",
                      boxSizing: "border-box"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#3b7ecc"}
                    onBlur={(e) => e.target.style.borderColor = "#ddd"}
                  />
                  <p style={{
                    fontSize: isMobile ? "0.75rem" : "0.8rem",
                    color: "#999",
                    margin: "4px 0 0 0"
                  }}>
                    Used for booking, refund, and trip cancellation SMS
                  </p>
                </>
              ) : (
                <p style={{
                  fontSize: isMobile ? "0.95rem" : "1.1rem",
                  fontWeight: "600",
                  color: profile.phone ? "#1a1a1a" : "#999",
                  margin: isMobile ? "0 0 3px 0" : "0"
                }}>
                  {profile.phone || "Not set"}
                </p>
              )}
            </div>
            <div>
              <label>Role</label>
              <p className="admin-profile-extra-value admin-profile-role-value">{profile.role || "N/A"}</p>
            </div>
            <div>
              <label>Member Since</label>
              <p className="admin-profile-extra-value">{formatDate(profile.createdAt)}</p>
            </div>
          </div>
          </section>

          <section className="admin-profile-panel">
            <h3 className="admin-profile-panel-title">Work Assignment</h3>
            <div className="admin-profile-fields" style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: isMobile ? "14px" : "32px",
              marginBottom: isMobile ? "16px" : "28px"
            }}>
            {/* Assigned Boat */}
            <div style={{
              padding: isMobile ? "11px 0" : "0",
              borderBottom: isMobile ? "1px solid #e8e8e8" : "none",
              backgroundColor: isMobile ? "#f9f9f9" : "transparent",
              marginLeft: isMobile ? "-8px" : "0",
              marginRight: isMobile ? "-8px" : "0",
              paddingLeft: isMobile ? "8px" : "0",
              paddingRight: isMobile ? "8px" : "0"
            }}>
              <label style={{
                display: "block",
                fontSize: isMobile ? "0.8rem" : "0.85rem",
                fontWeight: "700",
                color: "#999",
                marginBottom: isMobile ? "5px" : "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Assigned Boat
              </label>
              <p style={{
                fontSize: isMobile ? "0.95rem" : "1.1rem",
                fontWeight: "600",
                color: "#3b7ecc",
                margin: isMobile ? "0 0 3px 0" : "0"
              }}>
                {profile.assignedBoat || "Not Assigned"}
              </p>
              <p style={{
                fontSize: isMobile ? "0.75rem" : "0.85rem",
                color: "#999",
                margin: isMobile ? "2px 0 0 0" : "4px 0 0 0"
              }}>
                Cannot be changed
              </p>
            </div>

            {/* Assigned Route */}
            <div style={{
              padding: isMobile ? "11px 0" : "0",
              borderBottom: isMobile ? "1px solid #e8e8e8" : "none",
              backgroundColor: isMobile ? "#f9f9f9" : "transparent",
              marginLeft: isMobile ? "-8px" : "0",
              marginRight: isMobile ? "-8px" : "0",
              paddingLeft: isMobile ? "8px" : "0",
              paddingRight: isMobile ? "8px" : "0"
            }}>
              <label style={{
                display: "block",
                fontSize: isMobile ? "0.8rem" : "0.85rem",
                fontWeight: "700",
                color: "#999",
                marginBottom: isMobile ? "5px" : "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Assigned Route
              </label>
              <p style={{
                fontSize: isMobile ? "0.95rem" : "1.1rem",
                fontWeight: "600",
                color: "#3b7ecc",
                margin: isMobile ? "0 0 3px 0" : "0"
              }}>
                {profile.assignedRoute || "Not Assigned"}
              </p>
              <p style={{
                fontSize: isMobile ? "0.75rem" : "0.85rem",
                color: "#999",
                margin: isMobile ? "2px 0 0 0" : "4px 0 0 0"
              }}>
                Cannot be changed
              </p>
            </div>

          </div>

          {/* Available Routes */}
          <div className="admin-profile-routes" style={{
            marginBottom: isMobile ? "16px" : "28px",
            marginTop: isMobile ? "12px" : "0",
            paddingTop: isMobile ? "12px" : "0",
            borderTop: isMobile ? "1px solid #e8e8e8" : "none"
          }}>
            <label style={{
              display: "block",
              fontSize: isMobile ? "0.8rem" : "0.85rem",
              fontWeight: "700",
              color: isMobile ? "#999" : "#777",
              marginBottom: isMobile ? "8px" : "11px",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              Available Routes
            </label>
            {isEditing ? (
              <textarea
                value={Array.isArray(profile.availableRoutes) ? profile.availableRoutes.join(", ") : ""}
                onChange={(e) => setProfile({
                  ...profile,
                  availableRoutes: e.target.value.split(",").map(r => r.trim()).filter(r => r)
                })}
                style={{
                  width: "100%",
                  padding: "14px 15px",
                  border: "2px solid #ddd",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  minHeight: "120px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  transition: "border-color 0.3s ease",
                  resize: "vertical"
                }}
                placeholder="Enter routes separated by comma (e.g., Route A, Route B)"
                onFocus={(e) => e.target.style.borderColor = "#3b7ecc"}
                onBlur={(e) => e.target.style.borderColor = "#ddd"}
              />
            ) : (
              <div style={{
                display: "flex",
                flexWrap: isMobile ? "nowrap" : "wrap",
                gap: isMobile ? "6px" : "10px",
                overflowX: isMobile ? "auto" : "visible",
                paddingBottom: isMobile ? "8px" : "0"
              }}>
                {Array.isArray(profile.availableRoutes) && profile.availableRoutes.length > 0 ? (
                  profile.availableRoutes.map((route, idx) => (
                    <span
                      key={idx}
                      style={{
                        padding: isMobile ? "6px 10px" : "8px 16px",
                        backgroundColor: "#e6f0f8",
                        color: "#3b7ecc",
                        borderRadius: "6px",
                        fontSize: isMobile ? "0.8rem" : "0.9rem",
                        fontWeight: "600",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {route}
                    </span>
                  ))
                ) : (
                  <p style={{
                    color: "#999",
                    fontSize: "0.95rem",
                    margin: "0"
                  }}>
                    No routes assigned
                  </p>
                )}
              </div>
            )}
          </div>
          </section>
          </div>

          {/* Action Buttons */}
          {isEditing && (
            <div className="admin-profile-form-actions" style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
              paddingTop: isMobile ? "12px" : "15px",
              borderTop: "2px solid #f0f0f0"
            }}>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                style={{
                  padding: isMobile ? "5px 10px" : "12px 25px",
                  backgroundColor: "#f0f0f0",
                  color: "#333",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "600",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  fontSize: isMobile ? "0.75rem" : "0.95rem",
                  transition: "all 0.3s ease",
                  opacity: isSaving ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isSaving) {
                    e.target.style.backgroundColor = "#e0e0e0";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSaving) {
                    e.target.style.backgroundColor = "#f0f0f0";
                  }
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={isSaving}
                style={{
                  padding: isMobile ? "5px 10px" : "12px 25px",
                  backgroundColor: "#3b7ecc",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "600",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  fontSize: isMobile ? "0.75rem" : "0.95rem",
                  transition: "all 0.3s ease",
                  opacity: isSaving ? 0.7 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isSaving) {
                    e.target.style.backgroundColor = "#2c6db8";
                    e.target.style.transform = "translateY(-2px)";
                    e.target.style.boxShadow = "0 4px 12px rgba(59, 126, 204, 0.2)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSaving) {
                    e.target.style.backgroundColor = "#3b7ecc";
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow = "none";
                  }
                }}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}

          {/* Password Change Section */}
          <div className="admin-profile-security" style={{
            marginTop: isMobile ? "12px" : "25px",
            padding: isMobile ? "12px" : "20px",
            backgroundColor: "#f9f9f9",
            borderRadius: "8px",
            border: "1px solid #e0e0e0"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: isMobile ? "8px" : "20px"
            }}>
              <h3 style={{
                fontSize: isMobile ? "0.95rem" : "1.1rem",
                fontWeight: "700",
                color: "#1a1a1a",
                margin: "0"
              }}>
                Account Security
              </h3>
              {!isChangingPassword && (
                <button
                  onClick={() => setIsChangingPassword(true)}
                  style={{
                    padding: isMobile ? "6px 12px" : "8px 16px",
                    backgroundColor: "#ff9800",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "600",
                    cursor: "pointer",
                    fontSize: isMobile ? "0.75rem" : "0.9rem",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "#f57c00";
                    e.target.style.transform = "translateY(-2px)";
                    e.target.style.boxShadow = "0 4px 12px rgba(255, 152, 0, 0.2)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "#ff9800";
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow = "none";
                  }}
                >
                  Change Password
                </button>
              )}
            </div>

            {isChangingPassword && (
              <div>
                {passwordError && (
                  <div style={{
                    padding: "12px",
                    backgroundColor: "#fee",
                    color: "#c33",
                    borderRadius: "6px",
                    marginBottom: isMobile ? "10px" : "12px",
                    fontSize: "0.9rem",
                    borderLeft: "4px solid #c33"
                  }}>
                    {passwordError}
                  </div>
                )}

                <div style={{
                  marginBottom: isMobile ? "12px" : "15px"
                }}>
                  <label style={{
                    display: "block",
                    fontSize: "0.9rem",
                    fontWeight: "600",
                    color: "#333",
                    marginBottom: "8px"
                  }}>
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({
                      ...passwordForm,
                      currentPassword: e.target.value
                    })}
                    disabled={isUpdatingPassword}
                    placeholder="Enter your current password"
                    style={{
                      width: "100%",
                      padding: "10px 15px",
                      border: "2px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "1rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      transition: "border-color 0.3s ease",
                      opacity: isUpdatingPassword ? 0.6 : 1,
                      cursor: isUpdatingPassword ? "not-allowed" : "text"
                    }}
                    onFocus={(e) => {
                      if (!isUpdatingPassword) {
                        e.target.style.borderColor = "#3b7ecc";
                      }
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "#ddd";
                    }}
                  />
                </div>

                <div style={{
                  marginBottom: isMobile ? "12px" : "15px"
                }}>
                  <label style={{
                    display: "block",
                    fontSize: "0.9rem",
                    fontWeight: "600",
                    color: "#333",
                    marginBottom: "8px"
                  }}>
                    New Password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({
                      ...passwordForm,
                      newPassword: e.target.value
                    })}
                    disabled={isUpdatingPassword}
                    placeholder="Enter your new password"
                    style={{
                      width: "100%",
                      padding: "10px 15px",
                      border: "2px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "1rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      transition: "border-color 0.3s ease",
                      opacity: isUpdatingPassword ? 0.6 : 1,
                      cursor: isUpdatingPassword ? "not-allowed" : "text"
                    }}
                    onFocus={(e) => {
                      if (!isUpdatingPassword) {
                        e.target.style.borderColor = "#3b7ecc";
                      }
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "#ddd";
                    }}
                  />
                </div>

                <div style={{
                  marginBottom: isMobile ? "12px" : "15px"
                }}>
                  <label style={{
                    display: "block",
                    fontSize: "0.9rem",
                    fontWeight: "600",
                    color: "#333",
                    marginBottom: "8px"
                  }}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({
                      ...passwordForm,
                      confirmPassword: e.target.value
                    })}
                    disabled={isUpdatingPassword}
                    placeholder="Confirm your new password"
                    style={{
                      width: "100%",
                      padding: "10px 15px",
                      border: "2px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "1rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      transition: "border-color 0.3s ease",
                      opacity: isUpdatingPassword ? 0.6 : 1,
                      cursor: isUpdatingPassword ? "not-allowed" : "text"
                    }}
                    onFocus={(e) => {
                      if (!isUpdatingPassword) {
                        e.target.style.borderColor = "#3b7ecc";
                      }
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "#ddd";
                    }}
                  />
                </div>

                <div style={{
                  display: "flex",
                  gap: isMobile ? "8px" : "12px",
                  justifyContent: "flex-end",
                  marginTop: isMobile ? "10px" : "0"
                }}>
                  <button
                    onClick={handleCancelPasswordChange}
                    disabled={isUpdatingPassword}
                    style={{
                      padding: isMobile ? "5px 10px" : "10px 20px",
                      backgroundColor: "#f0f0f0",
                      color: "#333",
                      border: "none",
                      borderRadius: "6px",
                      fontWeight: "600",
                      cursor: isUpdatingPassword ? "not-allowed" : "pointer",
                      fontSize: isMobile ? "0.75rem" : "0.9rem",
                      transition: "all 0.3s ease",
                      opacity: isUpdatingPassword ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!isUpdatingPassword) {
                        e.target.style.backgroundColor = "#e0e0e0";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isUpdatingPassword) {
                        e.target.style.backgroundColor = "#f0f0f0";
                      }
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePasswordChange}
                    disabled={isUpdatingPassword}
                    style={{
                      padding: isMobile ? "5px 10px" : "10px 20px",
                      backgroundColor: "#3b7ecc",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontWeight: "600",
                      cursor: isUpdatingPassword ? "not-allowed" : "pointer",
                      fontSize: isMobile ? "0.75rem" : "0.9rem",
                      transition: "all 0.3s ease",
                      opacity: isUpdatingPassword ? 0.7 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!isUpdatingPassword) {
                        e.target.style.backgroundColor = "#2c6db8";
                        e.target.style.transform = "translateY(-2px)";
                        e.target.style.boxShadow = "0 4px 12px rgba(59, 126, 204, 0.2)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isUpdatingPassword) {
                        e.target.style.backgroundColor = "#3b7ecc";
                        e.target.style.transform = "translateY(0)";
                        e.target.style.boxShadow = "none";
                      }
                    }}
                  >
                    {isUpdatingPassword ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <>
          {/* Backdrop */}
          <div 
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000
            }}
            onClick={cancelLogout}
          >
            {/* Modal */}
            <div 
              style={{
                background: "white",
                padding: isMobile ? "20px 16px" : "40px 30px",
                borderRadius: "12px",
                boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)",
                maxWidth: "400px",
                width: "90%",
                textAlign: "center"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{
                fontSize: isMobile ? "1.15rem" : "1.5rem",
                fontWeight: 800,
                color: "#1a1a1a",
                marginBottom: isMobile ? "8px" : "15px",
                margin: isMobile ? "0 0 8px 0" : "0 0 15px 0"
              }}>
                Confirm Logout
              </h2>
              
              <p style={{
                fontSize: isMobile ? "0.85rem" : "1rem",
                color: "#666",
                marginBottom: isMobile ? "16px" : "30px",
                margin: isMobile ? "0 0 16px 0" : "0 0 30px 0",
                lineHeight: "1.5"
              }}>
                Are you sure you want to log out?
              </p>

              {/* Buttons */}
              <div style={{
                display: "flex",
                gap: isMobile ? "8px" : "12px",
                justifyContent: "center"
              }}>
                <button
                  onClick={cancelLogout}
                  style={{
                    padding: isMobile ? "6px 20px" : "10px 30px",
                    background: "#e0e0e0",
                    color: "#333",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 600,
                    fontSize: isMobile ? "0.8rem" : "1rem",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    minWidth: isMobile ? "80px" : "120px"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "#d0d0d0";
                    e.target.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "#e0e0e0";
                    e.target.style.boxShadow = "none";
                  }}
                >
                  Cancel
                </button>

                <button
                  onClick={confirmLogoutAction}
                  style={{
                    padding: isMobile ? "6px 20px" : "10px 30px",
                    background: "#f44336",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 600,
                    fontSize: isMobile ? "0.8rem" : "1rem",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    minWidth: isMobile ? "80px" : "120px"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = "#da190b";
                    e.target.style.boxShadow = "0 4px 12px rgba(244, 67, 54, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = "#f44336";
                    e.target.style.boxShadow = "none";
                  }}
                >
                  Yes, Log Out
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

export default AdminProfile;
