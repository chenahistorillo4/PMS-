import { addDoc, collection, getDocs, query, where } from "firebase/firestore";

export const ensureBoatExists = async (db, name, route, availableRoutes = []) => {
  const boatName = name.trim();
  const boatRoute = route.trim();

  if (!boatName || !boatRoute) {
    return;
  }

  const boatsQuery = query(collection(db, "boats"), where("name", "==", boatName));
  const snapshot = await getDocs(boatsQuery);

  if (snapshot.empty) {
    const boatData = {
      name: boatName,
      route: boatRoute
    };

    if (availableRoutes.length > 0) {
      boatData.availableRoutes = availableRoutes;
    }

    await addDoc(collection(db, "boats"), boatData);
  }
};