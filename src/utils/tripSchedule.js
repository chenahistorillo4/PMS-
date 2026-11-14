const parseTripDate = (value) => {
  const dateValue = value?.toDate?.() || value;
  if (dateValue instanceof Date) {
    return Number.isNaN(dateValue.getTime())
      ? null
      : [dateValue.getFullYear(), dateValue.getMonth() + 1, dateValue.getDate()];
  }

  const dateString = String(dateValue || "").trim();
  const dateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch.map(Number);
    const parsedDate = new Date(year, month - 1, day);
    if (
      parsedDate.getFullYear() !== year ||
      parsedDate.getMonth() !== month - 1 ||
      parsedDate.getDate() !== day
    ) {
      return null;
    }
    return [year, month, day];
  }

  const parsedDate = new Date(dateString);
  return Number.isNaN(parsedDate.getTime())
    ? null
    : [parsedDate.getFullYear(), parsedDate.getMonth() + 1, parsedDate.getDate()];
};

const parseDepartureTime = (value) => {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minute > 59) return null;

  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (period === "AM") hour %= 12;
    else if (hour !== 12) hour += 12;
  } else if (hour > 23) {
    return null;
  }

  return [hour, minute];
};

export const isTripDepartureInPast = (trip, now = new Date()) => {
  const tripDate = parseTripDate(trip?.date);
  if (!tripDate) return false;

  const [year, month, day] = tripDate;
  const tripDay = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (tripDay < today) return true;
  if (tripDay > today) return false;

  const departureTime = parseDepartureTime(trip?.departure);
  if (!departureTime) return false;

  const [hour, minute] = departureTime;
  return new Date(year, month - 1, day, hour, minute) <= now;
};
