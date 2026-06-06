import { useEffect, useState } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import AdminLayout from "./AdminLayout";
import jsPDF from "jspdf";
import "jspdf-autotable";

// Chart.js imports
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function AdminDashboard() {
  const [adminData, setAdminData] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [filterDate, setFilterDate] = useState("");
  const [filterRoute, setFilterRoute] = useState("");
  const [metrics, setMetrics] = useState({
    revenueToday: 0,
    revenueWeek: 0,
    revenueMonth: 0,
    passengersToday: 0,
    activeTrips: 0
  });

  useEffect(() => {
    const fetchAdminData = async () => {
      const user = auth.currentUser;
      if (user) {
        const docRef = doc(db, "admins", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setAdminData(docSnap.data());
        }
      }
    };
    fetchAdminData();
  }, []);

  useEffect(() => {
    const fetchBookings = async () => {
      if (!adminData) return;
      const q = query(
        collection(db, "bookings"),
        where("boat", "==", adminData.assignedBoat)
      );
      const snap = await getDocs(q);

      // Convert Firestore Timestamp to YYYY-MM-DD string
      const bookingsData = snap.docs.map(doc => {
        const data = doc.data();
        if (data.date && data.date.toDate) {
          data.date = data.date.toDate().toISOString().split("T")[0];
        }
        return data;
      });

      setBookings(bookingsData);

      // Compute metrics
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];

      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const revenueToday = bookingsData
        .filter(b => b.date === todayStr)
        .reduce((sum, b) => sum + (b.finalPrice || 0), 0);

      const revenueWeek = bookingsData
        .filter(b => new Date(b.date) >= startOfWeek)
        .reduce((sum, b) => sum + (b.finalPrice || 0), 0);

      const revenueMonth = bookingsData
        .filter(b => new Date(b.date) >= startOfMonth)
        .reduce((sum, b) => sum + (b.finalPrice || 0), 0);

      const passengersToday = bookingsData.filter(b => b.date === todayStr).length;
      const activeTrips = new Set(
        bookingsData.filter(b => b.date === todayStr).map(b => b.tripId)
      ).size;

      setMetrics({
        revenueToday,
        revenueWeek,
        revenueMonth,
        passengersToday,
        activeTrips
      });
    };
    fetchBookings();
  }, [adminData]);

  // Group bookings by route for chart
  const groupedByRoute = bookings.reduce((acc, b) => {
    const route = b.route || "Unknown Route";
    if (!acc[route]) {
      acc[route] = { revenue: 0, bookings: 0 };
    }
    acc[route].revenue += b.paymentAmount || 0;
    acc[route].bookings += 1;
    return acc;
  }, {});

  const chartLabels = Object.keys(groupedByRoute).sort();
  const revenueData = chartLabels.map(route => groupedByRoute[route].revenue);
  const bookingsCountData = chartLabels.map(route => groupedByRoute[route].bookings);

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: "Revenue (₱)",
        data: revenueData,
        backgroundColor: "rgba(33, 150, 243, 0.7)",
        borderColor: "#2196f3",
        borderWidth: 2,
        borderRadius: 6,
        hoverBackgroundColor: "rgba(33, 150, 243, 0.9)"
      },
      {
        label: "Bookings",
        data: bookingsCountData,
        backgroundColor: "rgba(156, 39, 176, 0.7)",
        borderColor: "#9c27b0",
        borderWidth: 2,
        borderRadius: 6,
        hoverBackgroundColor: "rgba(156, 39, 176, 0.9)"
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "top"
      },
      title: {
        display: true,
        text: `Performance by Route - ${adminData?.assignedBoat || "Boat"}`,
        font: {
          size: 14,
          weight: "bold"
        },
        padding: {
          bottom: 20
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: "Amount (₱) / Count"
        },
        grid: {
          drawBorder: false,
          color: "rgba(0,0,0,0.05)"
        }
      },
      x: {
        title: {
          display: true,
          text: "Routes"
        },
        grid: {
          display: false
        }
      }
    }
  };

  // Export report as JSON
  const exportAsJSON = () => {
    try {
      // Filter bookings based on selected filters
      let filteredBookings = bookings;
      if (filterDate) {
        filteredBookings = filteredBookings.filter(b => b.date === filterDate);
      }
      if (filterRoute) {
        filteredBookings = filteredBookings.filter(b => b.route === filterRoute);
      }

      const reportDate = filterDate || new Date().toISOString().split("T")[0];
      
      // Build dynamic filename
      let filename = `admin-report-${reportDate}`;
      if (filterRoute) filename += `-${filterRoute}`;
      filename += ".json";

      // Calculate filtered revenue and statistics
      const filteredRevenue = filteredBookings.reduce((sum, b) => sum + (b.paymentAmount || 0), 0);
      const completedBookings = filteredBookings.filter(b => b.status === "Completed").length;
      const pendingBookings = filteredBookings.filter(b => b.status === "Pending").length;

      const reportData = {
        reportMetadata: {
          generatedAt: new Date().toISOString(),
          reportType: "Admin Performance Report",
          systemName: "Ferry Port Management System"
        },
        adminInformation: {
          name: adminData?.name || "Unknown",
          assignedBoat: adminData?.assignedBoat || "N/A",
          assignedRoutes: adminData?.availableRoutes || []
        },
        reportFilters: {
          date: filterDate || null,
          route: filterRoute || null,
          hasFilters: !!(filterDate || filterRoute)
        },
        summary: {
          totalBookings: filteredBookings.length,
          completedBookings: completedBookings,
          pendingBookings: pendingBookings,
          totalRevenue: filteredRevenue,
          averageRevenuePerBooking: filteredBookings.length > 0 ? (filteredRevenue / filteredBookings.length).toFixed(2) : 0
        },
        detailedMetrics: {
          revenueToday: metrics.revenueToday,
          revenueWeek: metrics.revenueWeek,
          revenueMonth: metrics.revenueMonth,
          passengersToday: metrics.passengersToday,
          activeTrips: metrics.activeTrips
        },
        bookingsList: filteredBookings.map(b => ({
          referenceNumber: b.referenceNumber || "N/A",
          passengerName: b.passengerName || "N/A",
          route: b.route || "N/A",
          bookingDate: b.bookingDate || "N/A",
          paymentAmount: b.paymentAmount || 0,
          status: b.status || "N/A",
          ticketType: b.ticketType || "N/A",
          contactNumber: b.contactNumber || "N/A"
        }))
      };

      const dataStr = JSON.stringify(reportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      alert("JSON file exported successfully!");
    } catch (error) {
      console.error("Error exporting JSON:", error);
      alert("Failed to export JSON. Please try again.");
    }
  };

  // Save as PDF report
  const saveAsPDF = () => {
    try {
      // Filter bookings based on selected filters
      let filteredBookings = bookings;
      if (filterDate) {
        filteredBookings = filteredBookings.filter(b => b.date === filterDate);
      }
      if (filterRoute) {
        filteredBookings = filteredBookings.filter(b => b.route === filterRoute);
      }

      const reportDate = filterDate || new Date().toISOString().split("T")[0];
      let reportFileName = `admin-report-${reportDate}`;
      if (filterRoute) reportFileName += `-${filterRoute}`;
      reportFileName += ".pdf";

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      let yPosition = 20;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginLeft = 15;
      const marginRight = 15;
      const contentWidth = pageWidth - marginLeft - marginRight;

      // Header Background
      pdf.setFillColor(74, 139, 212);
      pdf.rect(marginLeft, 10, contentWidth, 18, "F");

      // Header Title
      pdf.setFontSize(22);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont(undefined, "bold");
      pdf.text("ADMIN REPORT", marginLeft + 5, 18);

      // Subheader
      pdf.setFontSize(9);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont(undefined, "normal");
      pdf.text("Ferry Port Management System", marginLeft + 5, 25);

      yPosition = 35;

      // Admin Info Box
      pdf.setFillColor(240, 247, 251);
      pdf.rect(marginLeft, yPosition - 2, contentWidth, 24, "F");
      
      pdf.setFontSize(10);
      pdf.setTextColor(74, 139, 212);
      pdf.setFont(undefined, "bold");
      pdf.text("Admin Information", marginLeft + 3, yPosition + 2);

      pdf.setFontSize(9);
      pdf.setTextColor(51, 51, 51);
      pdf.setFont(undefined, "normal");
      pdf.text("Admin: " + String(adminData?.name || "N/A").trim(), marginLeft + 3, yPosition + 8);
      pdf.text("Boat: " + String(adminData?.assignedBoat || "N/A").trim(), marginLeft + 3, yPosition + 13);
      pdf.text("Generated: " + new Date().toLocaleString("en-PH"), marginLeft + 3, yPosition + 18);

      yPosition += 30;

      // Filter Information
      if (filterDate || filterRoute) {
        pdf.setFillColor(255, 243, 205);
        pdf.rect(marginLeft, yPosition - 2, contentWidth, 16, "F");
        
        pdf.setFontSize(10);
        pdf.setTextColor(251, 140, 0);
        pdf.setFont(undefined, "bold");
        pdf.text("Applied Filters:", marginLeft + 3, yPosition + 2);

        pdf.setFontSize(9);
        pdf.setTextColor(51, 51, 51);
        pdf.setFont(undefined, "normal");
        let filterText = [];
        if (filterDate) filterText.push("Date: " + filterDate);
        if (filterRoute) filterText.push("Route: " + filterRoute);
        pdf.text(filterText.join(" | "), marginLeft + 3, yPosition + 8);

        yPosition += 22;
      }

      // Revenue Summary
      const filteredRevenue = filteredBookings.reduce((sum, b) => sum + (b.paymentAmount || 0), 0);
      const completedCount = filteredBookings.filter(b => b.status === "Completed").length;
      const pendingCount = filteredBookings.filter(b => b.status === "Pending").length;

      pdf.setFontSize(11);
      pdf.setTextColor(74, 139, 212);
      pdf.setFont(undefined, "bold");
      pdf.text("Report Summary", marginLeft, yPosition);

      yPosition += 8;

      const summaryData = [
        ["Total Bookings", String(filteredBookings.length)],
        ["Total Revenue", "₱" + filteredRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
        ["Completed", String(completedCount)],
        ["Pending", String(pendingCount)]
      ];

      pdf.setFontSize(9);
      pdf.setTextColor(51, 51, 51);
      pdf.setFont(undefined, "normal");
      
      summaryData.forEach((row, index) => {
        if (index % 2 === 0) {
          pdf.setFillColor(245, 249, 252);
          pdf.rect(marginLeft, yPosition - 3, contentWidth, 6, "F");
        }
        pdf.text(row[0], marginLeft + 2, yPosition);
        pdf.text(row[1], pageWidth - marginRight - 30, yPosition);
        yPosition += 6;
      });

      yPosition += 8;

      // Check if we need a new page
      if (yPosition > pageHeight - 50 && filteredBookings.length > 0) {
        pdf.addPage();
        yPosition = 20;
      }

      // Bookings Table
      if (filteredBookings.length > 0) {
        pdf.setFontSize(11);
        pdf.setTextColor(74, 139, 212);
        pdf.setFont(undefined, "bold");
        pdf.text("Booking Details", marginLeft, yPosition);
        yPosition += 8;

        const columns = ["Ref #", "Passenger", "Route", "Date", "Amount", "Status"];
        const rows = filteredBookings.map(b => [
          b.referenceNumber || "N/A",
          b.passengerName || "N/A",
          b.route || "N/A",
          b.bookingDate ? new Date(b.bookingDate).toLocaleDateString("en-PH") : "N/A",
          "₱" + (b.paymentAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          b.status || "N/A"
        ]);

        pdf.autoTable({
          head: [columns],
          body: rows,
          startY: yPosition,
          theme: "striped",
          margin: { left: marginLeft, right: marginRight },
          styles: {
            fontSize: 8,
            cellPadding: 4,
            textColor: 51,
            lineColor: 200
          },
          headStyles: {
            fillColor: [74, 139, 212],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 9
          },
          alternateRowStyles: {
            fillColor: [240, 247, 251]
          }
        });

        yPosition = pdf.autoTable.previous.finalY + 10;
      }

      // Footer
      pdf.setFontSize(8);
      pdf.setTextColor(153, 153, 153);
      pdf.text("This is an automatically generated report.", marginLeft, pageHeight - 10);
      pdf.text("© PMS Port Management System", marginLeft, pageHeight - 5);

      // Save the PDF
      const pdfBlob = pdf.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = reportFileName;
      link.click();
      URL.revokeObjectURL(url);
      alert("PDF downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  // Print report
  const printReport = () => {
    try {
      // Filter bookings based on selected filters
      let filteredBookings = bookings;
      if (filterDate) {
        filteredBookings = filteredBookings.filter(b => b.date === filterDate);
      }
      if (filterRoute) {
        filteredBookings = filteredBookings.filter(b => b.route === filterRoute);
      }

      const filteredRevenue = filteredBookings.reduce((sum, b) => sum + (b.finalPrice || 0), 0);
      
      let filterInfo = "";
      if (filterDate || filterRoute) {
        filterInfo = `
          <div class="filter-info">
            <h3>Applied Filters:</h3>
            <ul>
              ${filterDate ? `<li><strong>Date:</strong> ${filterDate}</li>` : ""}
              ${filterRoute ? `<li><strong>Route:</strong> ${filterRoute}</li>` : ""}
            </ul>
            <p style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddb500;">
              <strong>Filtered Revenue:</strong> PHP ${filteredRevenue.toLocaleString()}
            </p>
          </div>
        `;
      }

      const printWindow = window.open("", "", "height=600,width=800");
      printWindow.document.write(`
        <html>
          <head>
            <title>Admin Report</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                margin: 40px; 
                color: #333; 
                line-height: 1.6;
              }
              h1 { 
                color: #4a8bd4; 
                border-bottom: 3px solid #4a8bd4; 
                padding-bottom: 15px;
                margin-bottom: 20px;
                font-size: 2.2em;
              }
              h2 { 
                color: #2c3e50;
                margin-top: 30px;
                margin-bottom: 15px;
                font-size: 1.4em;
                border-left: 4px solid #4a8bd4;
                padding-left: 12px;
              }
              h3 { color: #555; margin-top: 15px; margin-bottom: 10px; }
              p { margin: 10px 0; color: #666; }
              .header-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
              .header-info p { margin: 8px 0; font-size: 0.95em; }
              .stat-row { 
                display: flex; 
                justify-content: space-between; 
                padding: 14px 0; 
                border-bottom: 1px solid #e0e0e0;
                align-items: center;
              }
              .stat-row:last-child { border-bottom: 2px solid #4a8bd4; }
              .stat-label { font-weight: 600; color: #555; font-size: 0.95em; }
              .stat-value { font-size: 1.3em; font-weight: 700; color: #4a8bd4; }
              .info-box { 
                background: linear-gradient(135deg, #e6f0f8 0%, #eef6fc 100%);
                border-left: 4px solid #4a8bd4; 
                padding: 15px; 
                margin: 15px 0; 
                border-radius: 6px;
              }
              .filter-info { 
                background: linear-gradient(135deg, #fff3cd 0%, #fffaed 100%);
                border-left: 4px solid #fb8c00; 
                padding: 15px; 
                margin: 15px 0 25px 0; 
                border-radius: 6px;
              }
              .filter-info h3 { margin-top: 0; color: #333; }
              .filter-info ul { margin: 10px 0; padding-left: 20px; }
              .filter-info li { margin: 6px 0; color: #555; }
              .summary-section {
                background: #f0f7fb;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                border: 2px solid #d0e8f2;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 15px 0;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              }
              th {
                background: linear-gradient(135deg, #4a8bd4 0%, #3d6fa8 100%);
                color: white;
                padding: 12px;
                text-align: left;
                font-weight: 600;
                font-size: 0.9em;
              }
              td {
                border: 1px solid #e0e0e0;
                padding: 10px 12px;
                font-size: 0.9em;
              }
              tr:nth-child(even) { background: #f9f9f9; }
              tr:hover { background: #f0f7fb; }
              .footer { 
                margin-top: 40px; 
                padding-top: 20px;
                border-top: 2px solid #e0e0e0;
                text-align: center; 
                color: #999; 
                font-size: 0.85em;
              }
              .section-divider {
                height: 2px;
                background: linear-gradient(90deg, transparent, #e0e0e0, transparent);
                margin: 30px 0;
              }
            </style>
          </head>
          <body>
            <h1>Admin Report</h1>
            <div class="header-info">
              <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>Admin:</strong> ${adminData?.name || "N/A"}</p>
              <p><strong>Boat:</strong> ${adminData?.assignedBoat || "N/A"}</p>
            </div>
            ${filterInfo}
            ${
              filterDate || filterRoute
                ? `
                    <div class="section-divider"></div>
                    <h2>Filtered Report Summary</h2>
                    <div class="summary-section">
                      <h3>Key Metrics</h3>
                      <div class="stat-row">
                        <span class="stat-label">Total Bookings</span>
                        <span class="stat-value">${filteredBookings.length}</span>
                      </div>
                      <div class="stat-row">
                        <span class="stat-label">Total Revenue</span>
                        <span class="stat-value">₱${filteredBookings.reduce((sum, b) => sum + (b.paymentAmount || 0), 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div class="stat-row">
                        <span class="stat-label">Completed Bookings</span>
                        <span class="stat-value">${filteredBookings.filter(b => b.status === "Completed").length}</span>
                      </div>
                      <div class="stat-row">
                        <span class="stat-label">Pending Bookings</span>
                        <span class="stat-value">${filteredBookings.filter(b => b.status === "Pending").length}</span>
                      </div>
                    </div>
                    
                    ${
                      filteredBookings.length > 0
                        ? `
                            <div class="section-divider"></div>
                            <h2>Booking Details</h2>
                            <table>
                              <tr>
                                <th>Reference #</th>
                                <th>Passenger</th>
                                <th>Route</th>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Status</th>
                              </tr>
                              ${filteredBookings
                                .map(
                                  (booking) => `
                                <tr>
                                  <td>${booking.referenceNumber || "N/A"}</td>
                                  <td>${booking.passengerName || "N/A"}</td>
                                  <td>${booking.route || "N/A"}</td>
                                  <td>${
                                    booking.bookingDate
                                      ? new Date(booking.bookingDate).toLocaleDateString("en-PH")
                                      : "N/A"
                                  }</td>
                                  <td>₱${(booking.paymentAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  <td>${booking.status || "N/A"}</td>
                                </tr>
                              `
                                )
                                .join("")}
                            </table>
                          `
                        : ""
                    }
                  `
                : `
                    <div class="section-divider"></div>
                    <h2>Performance Overview</h2>
                    <div class="summary-section">
                      <h3>Key Metrics</h3>
                      <div class="stat-row">
                        <span class="stat-label">Total Bookings</span>
                        <span class="stat-value">${bookings.length}</span>
                      </div>
                      <div class="stat-row">
                        <span class="stat-label">Total Revenue</span>
                        <span class="stat-value">₱${bookings
                          .reduce((sum, b) => sum + (b.paymentAmount || 0), 0)
                          .toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div class="stat-row">
                        <span class="stat-label">Completed Bookings</span>
                        <span class="stat-value">${bookings.filter((b) => b.status === "Completed").length}</span>
                      </div>
                      <div class="stat-row">
                        <span class="stat-label">Pending Bookings</span>
                        <span class="stat-value">${bookings.filter((b) => b.status === "Pending").length}</span>
                      </div>
                    </div>
                  `
            }
            <div class="footer">
              <p>This is an automatically generated report. For inquiries, please contact your administrator.</p>
              <p>Report generated on ${new Date().toLocaleString("en-PH")}</p>
            </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
    } catch (error) {
      console.error("Error printing report:", error);
    }
  };

  // Stat Card Component
  const StatCard = ({ title, value, color }) => (
    <div style={{
      backgroundColor: "white",
      borderRadius: "12px",
      padding: "20px",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
      border: `2px solid ${color}`,
      borderTop: `4px solid ${color}`,
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "130px"
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.12)";
        e.currentTarget.style.transform = "translateY(-4px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.06)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <h4 style={{
        margin: "0 0 12px 0",
        color: "#666",
        fontSize: "0.9rem",
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        textAlign: "center"
      }}>
        {title}
      </h4>
      <div style={{
        fontSize: "2.4rem",
        fontWeight: "900",
        color: color,
        margin: "0",
        lineHeight: "1"
      }}>
        {value}
      </div>
    </div>
  );

  return (
    <AdminLayout active="reports">
      <div style={{
        maxWidth: "1400px",
        width: "100%",
        margin: "0 auto",
        padding: "30px 20px",
        boxSizing: "border-box"
      }}>
        {/* Header */}
        <div style={{
          marginBottom: "40px"
        }}>
          <h2 style={{
            fontSize: "1.5rem",
            fontWeight: "900",
            color: "#1a1a1a",
            margin: "0 0 8px 0",
            letterSpacing: "-0.5px"
          }}>
            Performance Overview
          </h2>
          <p style={{
            fontSize: "1rem",
            color: "#666",
            margin: "0",
            fontWeight: "500"
          }}>
            Welcome back! Here's your performance overview for {adminData?.assignedBoat || "your boat"}.
          </p>
        </div>

        {/* Metrics Section */}
        <div style={{
          display: "grid",
          gridTemplateColumns: window.innerWidth < 768 ? "1fr" : window.innerWidth < 1024 ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
          gap: "24px",
          marginBottom: "40px"
        }}>
          <StatCard
            title="Today's Revenue"
            value={`₱${metrics.revenueToday.toLocaleString()}`}
            color="#4a8bd4"
          />
          <StatCard
            title="Week's Revenue"
            value={`₱${metrics.revenueWeek.toLocaleString()}`}
            color="#43a047"
          />
          <StatCard
            title="Month's Revenue"
            value={`₱${metrics.revenueMonth.toLocaleString()}`}
            color="#fb8c00"
          />
          <StatCard
            title="Total Bookings"
            value={bookings.length}
            color="#9c27b0"
          />
        </div>

        {/* Chart Section */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "32px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
          marginBottom: "40px"
        }}>
          <h2 style={{
            fontSize: "1.3rem",
            fontWeight: "900",
            color: "#1a1a1a",
            margin: "0 0 24px 0",
            letterSpacing: "-0.3px"
          }}>
            Performance Analytics
          </h2>
          <div style={{ position: "relative", height: "400px", marginBottom: "20px" }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
          <p style={{
            fontSize: "0.9rem",
            color: "#666",
            marginBottom: "0",
            paddingTop: "15px",
            borderTop: "1px solid #e0e0e0"
          }}>
            Last updated: {new Date().toLocaleDateString("en-PH")}
          </p>
        </div>

        {/* Reports & Export Section */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "32px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)"
        }}>
          <h2 style={{
            fontSize: "1.3rem",
            fontWeight: "900",
            color: "#1a1a1a",
            margin: "0 0 24px 0",
            letterSpacing: "-0.3px"
          }}>
            Reports & Export
          </h2>

          {/* Filter Section */}
          <div style={{
            marginBottom: "32px",
            padding: "28px",
            backgroundColor: "linear-gradient(135deg, #f5f9fc 0%, #f0f7fb 100%)",
            background: "linear-gradient(135deg, #f5f9fc 0%, #f0f7fb 100%)",
            borderRadius: "14px",
            border: "1.5px solid #d0e8f2",
            boxShadow: "0 2px 12px rgba(74, 139, 212, 0.08)"
          }}>
            {/* Filter Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px"
            }}>
              <h3 style={{
                fontSize: "1.15rem",
                fontWeight: "700",
                color: "#1a1a1a",
                margin: "0"
              }}>
                Customize Your Report
              </h3>
              {(filterDate || filterRoute) && (
                <div style={{
                  backgroundColor: "#4a8bd4",
                  color: "white",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "0.85rem",
                  fontWeight: "600"
                }}>
                  {[filterDate, filterRoute].filter(f => f).length} filter{[filterDate, filterRoute].filter(f => f).length !== 1 ? "s" : ""} active
                </div>
              )}
            </div>

            {/* Filters Grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "repeat(2, 1fr)",
              gap: "20px",
              marginBottom: "20px"
            }}>
              {/* Date Filter */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{
                  fontSize: "0.95rem",
                  fontWeight: "600",
                  color: "#2c3e50"
                }}>
                  Select Date
                </label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  style={{
                    padding: "12px 14px",
                    border: "2px solid #4a8bd4",
                    borderRadius: "10px",
                    fontSize: "0.95rem",
                    fontFamily: "inherit",
                    backgroundColor: "white",
                    color: "#333",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    boxShadow: filterDate ? "0 3px 8px rgba(74, 139, 212, 0.15)" : "none"
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = "0 3px 12px rgba(74, 139, 212, 0.2)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = filterDate ? "0 3px 8px rgba(74, 139, 212, 0.15)" : "none";
                  }}
                />
                {filterDate && (
                  <div style={{
                    fontSize: "0.8rem",
                    color: "#4a8bd4",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    ✓ Date selected: {filterDate}
                  </div>
                )}
              </div>

              {/* Route Filter */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{
                  fontSize: "0.95rem",
                  fontWeight: "600",
                  color: "#2c3e50"
                }}>
                  Select Route
                </label>
                <select
                  value={filterRoute}
                  onChange={(e) => setFilterRoute(e.target.value)}
                  style={{
                    padding: "12px 14px",
                    border: "2px solid #4a8bd4",
                    borderRadius: "10px",
                    fontSize: "0.95rem",
                    fontFamily: "inherit",
                    backgroundColor: "white",
                    color: "#333",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    boxShadow: filterRoute ? "0 3px 8px rgba(74, 139, 212, 0.15)" : "none"
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = "0 3px 12px rgba(74, 139, 212, 0.2)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = filterRoute ? "0 3px 8px rgba(74, 139, 212, 0.15)" : "none";
                  }}
                >
                  <option value="">All Routes</option>
                  {(adminData?.availableRoutes || []).map((route) => (
                    <option key={route} value={route}>
                      {route}
                    </option>
                  ))}
                </select>
                {filterRoute && (
                  <div style={{
                    fontSize: "0.8rem",
                    color: "#4a8bd4",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    ✓ Route selected: {filterRoute}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-start",
              flexWrap: "wrap"
            }}>
              {(filterDate || filterRoute) && (
                <button
                  onClick={() => {
                    setFilterDate("");
                    setFilterRoute("");
                  }}
                  style={{
                    padding: "10px 18px",
                    backgroundColor: "#ff6b6b",
                    border: "none",
                    borderRadius: "8px",
                    color: "white",
                    fontWeight: "600",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    transition: "all 0.3s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#ff5252";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 107, 107, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#ff6b6b";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  Clear Filters
                </button>
              )}
              <div style={{
                fontSize: "0.85rem",
                color: "#666",
                display: "flex",
                alignItems: "center",
                marginLeft: "auto"
              }}>
                Filters will apply to all exports below
              </div>
            </div>
          </div>

          {/* Export Options Header */}
          <h3 style={{
            fontSize: "1.1rem",
            fontWeight: "700",
            color: "#1a1a1a",
            margin: "32px 0 20px 0"
          }}>
            Export Your Data
            {(filterDate || filterRoute) && (
              <span style={{
                fontSize: "0.85rem",
                fontWeight: "400",
                color: "#fb8c00",
                marginLeft: "12px"
              }}>
                (with selected filters applied)
              </span>
            )}
          </h3>

          <div style={{
            display: "grid",
            gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "repeat(3, 1fr)",
            gap: "20px"
          }}>
            <button
              onClick={printReport}
              style={{
                padding: "28px 20px",
                backgroundColor: "#e6f0f8",
                border: "2px solid #4a8bd4",
                borderRadius: "14px",
                color: "#4a8bd4",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: "1rem"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#4a8bd4";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.boxShadow = "0 12px 24px rgba(74, 139, 212, 0.25)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#e6f0f8";
                e.currentTarget.style.color = "#4a8bd4";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ fontSize: "1.05rem", fontWeight: "700", marginBottom: "6px" }}>Print Report</div>
              <div style={{ fontSize: "0.8rem", opacity: "0.75" }}>Open print dialog</div>
            </button>

            <button
              onClick={exportAsJSON}
              style={{
                padding: "28px 20px",
                backgroundColor: "#f1f8f4",
                border: "2px solid #43a047",
                borderRadius: "14px",
                color: "#43a047",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: "1rem"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#43a047";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.boxShadow = "0 12px 24px rgba(67, 160, 71, 0.25)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#f1f8f4";
                e.currentTarget.style.color = "#43a047";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ fontSize: "1.05rem", fontWeight: "700", marginBottom: "6px" }}>Download JSON</div>
              <div style={{ fontSize: "0.8rem", opacity: "0.75" }}>Export as JSON data</div>
            </button>

            <button
              onClick={saveAsPDF}
              style={{
                padding: "28px 20px",
                backgroundColor: "#fff3e0",
                border: "2px solid #fb8c00",
                borderRadius: "14px",
                color: "#fb8c00",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: "1rem"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#fb8c00";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.boxShadow = "0 12px 24px rgba(251, 140, 0, 0.25)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#fff3e0";
                e.currentTarget.style.color = "#fb8c00";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ fontSize: "1.05rem", fontWeight: "700", marginBottom: "6px" }}>Save as PDF</div>
              <div style={{ fontSize: "0.8rem", opacity: "0.75" }}>Download PDF report with filters</div>
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default AdminDashboard;
