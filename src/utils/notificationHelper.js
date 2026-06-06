import { collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Create a notification for admin about trip update/cancellation
 */
export const createAdminNotification = async (boat, type, title, message, tripDetails) => {
  try {
    await addDoc(collection(db, "notifications"), {
      boat,
      type,
      title,
      message,
      tripDetails,
      recipientType: "admin",
      isRead: false,
      createdAt: new Date()
    });
    console.log("Admin notification created successfully");
  } catch (error) {
    console.error("Error creating admin notification:", error);
  }
};

/**
 * Create notifications for all users who have bookings for a specific trip
 */
export const createUserNotifications = async (tripId, type, title, message, tripDetails) => {
  try {
    // Find all users with bookings for this trip
    const bookingsQuery = query(
      collection(db, "bookings"),
      where("tripId", "==", tripId)
    );
    const bookingsSnap = await getDocs(bookingsQuery);
    
    // Create notification for each user with a booking
    const notificationPromises = bookingsSnap.docs.map(bookingDoc => {
      const bookingData = bookingDoc.data();
      return addDoc(collection(db, "notifications"), {
        userId: bookingData.userId,
        type,
        title,
        message,
        tripDetails,
        bookingId: bookingDoc.id,
        recipientType: "user",
        isRead: false,
        createdAt: new Date()
      });
    });

    await Promise.all(notificationPromises);
    console.log(`User notifications created for ${bookingsSnap.docs.length} users`);
  } catch (error) {
    console.error("Error creating user notifications:", error);
  }
};

/**
 * Create both admin and user notifications
 */
export const createTripNotifications = async (
  boat,
  tripId,
  type,
  title,
  adminMessage,
  userMessage,
  tripDetails
) => {
  try {
    // Create admin notification
    await createAdminNotification(boat, type, title, adminMessage, tripDetails);
    
    // Create user notifications
    await createUserNotifications(tripId, type, title, userMessage, tripDetails);
  } catch (error) {
    console.error("Error creating notifications:", error);
  }
};
