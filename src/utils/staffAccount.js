import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const STAFF_PROFILE_COLLECTIONS = ["admins", "port_staff", "qr_scanners"];

export async function getStaffAccount(userId) {
  for (const collectionName of STAFF_PROFILE_COLLECTIONS) {
    const snapshot = await getDoc(doc(db, collectionName, userId));
    if (snapshot.exists()) {
      return {
        data: snapshot.data(),
        collectionName,
      };
    }
  }

  return null;
}
