/**
 * Convert 24-hour time format (HH:mm) to 12-hour format (h:mm AM/PM)
 * @param {string} time - Time in 24-hour format (e.g., "14:30")
 * @returns {string} Time in 12-hour format (e.g., "2:30 PM")
 */
export const formatTime12Hour = (time) => {
  if (!time) return "N/A";
  
  try {
    // Parse hours and minutes
    const [hours, minutes] = time.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) return time;
    
    // Determine AM/PM
    const period = hours >= 12 ? "PM" : "AM";
    
    // Convert to 12-hour format
    let hours12 = hours % 12;
    if (hours12 === 0) hours12 = 12;
    
    // Format with leading zero for minutes
    const minutesStr = minutes.toString().padStart(2, '0');
    
    return `${hours12}:${minutesStr} ${period}`;
  } catch (error) {
    console.error("Error formatting time:", error);
    return time;
  }
};
