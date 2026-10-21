import { useEffect, useState, useMemo } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import AdminLayout from "./AdminLayout";
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  filterBookingsByPeriod,
  getPeriodRange,
  summarizeBookings,
  buildReportFilterLabel,
  getUniqueRoutesFromBookings,
  getBookingRouteLabel,
  computeDashboardMetrics,
  attachPaymentStatuses,
  isReportableBooking,
  getBookingAmount,
} from "../../utils/reportHelpers";
import ReportPreview from "../../components/ReportPreview";
import { useAuthReloadKey, useAuthUser } from "../../hooks/useAuthUser";
import { getStaffAccount } from "../../utils/staffAccount";

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
  const [reportPeriod, setReportPeriod] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth <= 1024);
  const { user, authReady } = useAuthUser();
  const reloadKey = useAuthReloadKey();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
      setIsTablet(window.innerWidth <= 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!authReady) return;

    const fetchAdminData = async () => {
      if (!user) {
        setAdminData(null);
        setBookings([]);
        return;
      }

      const account = await getStaffAccount(user.uid);
      if (account) {
        setAdminData(account.data);
      } else {
        setAdminData(null);
        setBookings([]);
      }
    };

    fetchAdminData();
  }, [authReady, user, reloadKey]);

  useEffect(() => {
    const fetchBookings = async () => {
      if (!adminData?.assignedBoat) {
        setBookings([]);
        return;
      }
      const [bookingSnap, paymentSnap] = await Promise.all([
        getDocs(query(
          collection(db, "bookings"),
          where("boat", "==", adminData.assignedBoat)
        )),
        getDocs(query(
          collection(db, "payments"),
          where("boat", "==", adminData.assignedBoat)
        ))
      ]);

      // Convert Firestore Timestamp to YYYY-MM-DD string
      const bookingsData = attachPaymentStatuses(
        bookingSnap.docs.map((bookingDoc) => {
          const data = bookingDoc.data();
          const normalized = {
            id: bookingDoc.id,
            ...data,
          };
          if (normalized.date && normalized.date.toDate) {
            normalized.date = normalized.date.toDate().toISOString().split("T")[0];
          }
          return normalized;
        }),
        paymentSnap.docs.map((paymentDoc) => paymentDoc.data())
      );

      setBookings(bookingsData);
    };
    fetchBookings();
  }, [adminData?.assignedBoat, reloadKey]);

  const reportableBookings = useMemo(
    () =>
      bookings.filter(isReportableBooking),
    [bookings]
  );

  const metrics = useMemo(
    () => computeDashboardMetrics(reportableBookings),
    [reportableBookings]
  );

  const groupedByRoute = reportableBookings.reduce((acc, b) => {
    const route = getBookingRouteLabel(b);
    if (!acc[route]) {
      acc[route] = { revenue: 0, bookings: 0 };
    }
    acc[route].revenue += getBookingAmount(b);
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

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: isMobile ? "bottom" : "top",
        labels: {
          boxWidth: isMobile ? 10 : 12,
          font: { size: isMobile ? 10 : 12 },
        },
      },
      title: {
        display: true,
        text: `Performance by Route - ${adminData?.assignedBoat || "Boat"}`,
        font: {
          size: isMobile ? 11 : 14,
          weight: "bold"
        },
        padding: {
          bottom: isMobile ? 12 : 20
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: !isMobile,
          text: "Amount (₱) / Count"
        },
        ticks: {
          font: { size: isMobile ? 10 : 12 },
        },
        grid: {
          drawBorder: false,
          color: "rgba(0,0,0,0.05)"
        }
      },
      x: {
        title: {
          display: !isMobile,
          text: "Routes"
        },
        ticks: {
          font: { size: isMobile ? 9 : 12 },
          maxRotation: isMobile ? 45 : 0,
          minRotation: isMobile ? 45 : 0,
        },
        grid: {
          display: false
        }
      }
    }
  }), [adminData?.assignedBoat, isMobile]);

  const filteredReportBookings = useMemo(() => {
    let filtered = reportableBookings;
    if (reportPeriod) {
      filtered = filterBookingsByPeriod(filtered, reportPeriod);
    } else if (filterDate) {
      filtered = filtered.filter((b) => b.date === filterDate);
    }
    if (filterRoute) {
      filtered = filtered.filter((booking) => getBookingRouteLabel(booking) === filterRoute);
    }
    return filtered;
  }, [reportableBookings, reportPeriod, filterDate, filterRoute]);

  const routeOptions = useMemo(() => {
    const fromBookings = getUniqueRoutesFromBookings(reportableBookings);
    const fromAdmin = adminData?.availableRoutes || [];
    return [...new Set([...fromAdmin, ...fromBookings])].sort();
  }, [reportableBookings, adminData?.availableRoutes]);
  const reportSummary = useMemo(() => summarizeBookings(filteredReportBookings), [filteredReportBookings]);
  const reportFilterLabel = useMemo(
    () => buildReportFilterLabel({ reportPeriod, filterDate, filterRoute }),
    [reportPeriod, filterDate, filterRoute]
  );

  const getReportLabel = () => {
    if (reportPeriod === "weekly") return "weekly";
    if (reportPeriod === "monthly") return "monthly";
    if (filterDate) return filterDate;
    return new Date().toISOString().split("T")[0];
  };

  // Export report as JSON
  const exportAsJSON = () => {
    try {
      const summary = reportSummary;
      const reportDate = getReportLabel();
      
      // Build dynamic filename
      let filename = `admin-report-${reportDate}`;
      if (filterRoute) filename += `-${filterRoute}`;
      filename += ".json";

      const reportData = {
        reportMetadata: {
          generatedAt: new Date().toISOString(),
          reportType: reportPeriod
            ? `${reportPeriod.charAt(0).toUpperCase()}${reportPeriod.slice(1)} Admin Report`
            : "Admin Performance Report",
          systemName: "PMS Port Management System"
        },
        adminInformation: {
          name: adminData?.name || "Unknown",
          assignedBoat: adminData?.assignedBoat || "N/A",
          assignedRoutes: adminData?.availableRoutes || []
        },
        reportFilters: {
          period: reportPeriod || null,
          periodLabel: reportPeriod ? getPeriodRange(reportPeriod)?.label : null,
          date: filterDate || null,
          route: filterRoute || null,
          hasFilters: !!(reportPeriod || filterDate || filterRoute)
        },
        summary: {
          totalBookings: summary.totalBookings,
          completedBookings: summary.completedBookings,
          pendingBookings: summary.pendingBookings,
          cancelledBookings: summary.cancelledBookings,
          totalRevenue: summary.totalRevenue,
          averageRevenuePerBooking: summary.averageRevenuePerBooking
        },
        detailedMetrics: {
          revenueToday: metrics.revenueToday,
          revenueWeek: metrics.revenueWeek,
          revenueMonth: metrics.revenueMonth,
          passengersToday: metrics.passengersToday,
          activeTrips: metrics.activeTrips
        },
        bookingsList: summary.bookingsList
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
      const summary = reportSummary;
      const reportDate = getReportLabel();
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
      pdf.text("PMS Port Management System", marginLeft + 5, 25);

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
      if (reportPeriod || filterDate || filterRoute) {
        pdf.setFillColor(255, 243, 205);
        pdf.rect(marginLeft, yPosition - 2, contentWidth, 16, "F");
        
        pdf.setFontSize(10);
        pdf.setTextColor(251, 140, 0);
        pdf.setFont(undefined, "bold");
        pdf.text("Applied Filters:", marginLeft + 3, yPosition + 2);

        pdf.setFontSize(9);
        pdf.setTextColor(51, 51, 51);
        pdf.setFont(undefined, "normal");
        pdf.text(reportFilterLabel, marginLeft + 3, yPosition + 8);

        yPosition += 22;
      }

      pdf.setFontSize(11);
      pdf.setTextColor(74, 139, 212);
      pdf.setFont(undefined, "bold");
      pdf.text("Report Summary", marginLeft, yPosition);

      yPosition += 8;

      const summaryData = [
        ["Total Bookings", String(summary.totalBookings)],
        ["Total Revenue", "₱" + Number(summary.totalRevenue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
        ["Confirmed", String(summary.completedBookings)],
        ["Pending", String(summary.pendingBookings)],
        ["Cancelled", String(summary.cancelledBookings)]
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
      if (yPosition > pageHeight - 50 && summary.bookingsList.length > 0) {
        pdf.addPage();
        yPosition = 20;
      }

      // Bookings Table
      if (summary.bookingsList.length > 0) {
        pdf.setFontSize(11);
        pdf.setTextColor(74, 139, 212);
        pdf.setFont(undefined, "bold");
        pdf.text("Booking Details", marginLeft, yPosition);
        yPosition += 8;

        const columns = ["Ref #", "Passenger", "Route", "Date", "Amount", "Status"];
        const rows = summary.bookingsList.map((b) => [
          b.referenceNumber || "N/A",
          b.passengerName || "N/A",
          b.route || "N/A",
          b.bookingDate || "N/A",
          "₱" + Number(b.paymentAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
      const summary = reportSummary;
      const filteredRevenue = summary.totalRevenue;
      
      let filterInfo = "";
      if (reportPeriod || filterDate || filterRoute) {
        filterInfo = `
          <div class="filter-info">
            <h3>Applied Filters:</h3>
            <ul>
              ${reportPeriod ? `<li><strong>Period:</strong> ${getPeriodRange(reportPeriod)?.label || reportPeriod}</li>` : ""}
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
      const bookingRows = summary.bookingsList
        .map(
          (booking) => `
            <tr>
              <td>${booking.referenceNumber}</td>
              <td>${booking.passengerName}</td>
              <td>${booking.route}</td>
              <td>${booking.bookingDate}</td>
              <td>₱${Number(booking.paymentAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td>${booking.status}</td>
            </tr>
          `
        )
        .join("");

      printWindow.document.write(`
        <html>
          <head>
            <title>Admin Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
              h1 { color: #4a8bd4; border-bottom: 3px solid #4a8bd4; padding-bottom: 10px; }
              h2 { color: #2c3e50; margin-top: 24px; }
              .header-info, .summary-section, .filter-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 16px 0; }
              .stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
              table { width: 100%; border-collapse: collapse; margin-top: 16px; }
              th, td { border: 1px solid #e0e0e0; padding: 8px 10px; text-align: left; font-size: 0.9rem; }
              th { background: #4a8bd4; color: white; }
            </style>
          </head>
          <body>
            <h1>Admin Report</h1>
            <div class="header-info">
              <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>Admin:</strong> ${adminData?.name || "N/A"}</p>
              <p><strong>Boat:</strong> ${adminData?.assignedBoat || "N/A"}</p>
              <p><strong>Filter:</strong> ${reportFilterLabel}</p>
            </div>
            ${filterInfo}
            <h2>Report Summary</h2>
            <div class="summary-section">
              <div class="stat-row"><span>Total Bookings</span><strong>${summary.totalBookings}</strong></div>
              <div class="stat-row"><span>Total Revenue</span><strong>₱${Number(summary.totalRevenue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <div class="stat-row"><span>Confirmed</span><strong>${summary.completedBookings}</strong></div>
              <div class="stat-row"><span>Pending</span><strong>${summary.pendingBookings}</strong></div>
              <div class="stat-row"><span>Cancelled</span><strong>${summary.cancelledBookings}</strong></div>
            </div>
            ${
              summary.bookingsList.length > 0
                ? `
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
                    ${bookingRows}
                  </table>
                `
                : "<p>No bookings match the selected filters.</p>"
            }
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
  const StatCard = ({ title, value, color, subtitle }) => (
    <div style={{
      backgroundColor: "white",
      borderRadius: isMobile ? "10px" : "12px",
      padding: isMobile ? "10px 7px" : "20px",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
      border: `2px solid ${color}`,
      borderTop: `4px solid ${color}`,
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      minHeight: isMobile ? "86px" : "130px",
      width: "100%",
      boxSizing: "border-box",
    }}>
      <h4 style={{
        margin: isMobile ? "0 0 5px" : "0 0 8px",
        color: "#666",
        fontSize: isMobile ? "0.62rem" : "0.9rem",
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        textAlign: "center",
        lineHeight: 1.3,
      }}>
        {title}
      </h4>
      <div style={{
        fontSize: isMobile ? "1.05rem" : "2.4rem",
        fontWeight: "900",
        color: color,
        margin: "0",
        lineHeight: "1.1",
        textAlign: "center",
        wordBreak: "break-word",
      }}>
        {value}
      </div>
      {subtitle ? (
        <div style={{
          marginTop: isMobile ? "4px" : "8px",
          fontSize: isMobile ? "0.58rem" : "0.82rem",
          color: "#888",
          textAlign: "center",
        }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );

  return (
    <AdminLayout active="reports">
      <div style={{
        maxWidth: "1400px",
        width: "100%",
        margin: "0 auto",
        padding: isMobile ? "16px 12px" : "30px 20px",
        boxSizing: "border-box",
        overflowX: "hidden",
      }}>
        {/* Header */}
        <div style={{
          marginBottom: isMobile ? "24px" : "40px"
        }}>
          <h2 style={{
            fontSize: isMobile ? "1.2rem" : "1.5rem",
            fontWeight: "900",
            color: "#1a1a1a",
            margin: "0 0 8px 0",
            letterSpacing: "-0.5px"
          }}>
            Performance Overview
          </h2>
          <p style={{
            fontSize: isMobile ? "0.9rem" : "1rem",
            color: "#666",
            margin: "0",
            fontWeight: "500",
            lineHeight: 1.5,
          }}>
            Welcome back! Here's your performance overview for {adminData?.assignedBoat || "your boat"}.
          </p>
        </div>

        {/* Metrics Section */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
          gap: isMobile ? "8px" : "24px",
          marginBottom: isMobile ? "24px" : "40px",
          width: "100%",
        }}>
          <StatCard
            title="Today's Revenue"
            value={`₱${metrics.revenueToday.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtitle="Confirmed bookings today"
            color="#4a8bd4"
          />
          <StatCard
            title="Week's Revenue"
            value={`₱${metrics.revenueWeek.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtitle="Last 7 days"
            color="#43a047"
          />
          <StatCard
            title="Month's Revenue"
            value={`₱${metrics.revenueMonth.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtitle="This month"
            color="#fb8c00"
          />
          <StatCard
            title="Total Bookings"
            value={metrics.totalBookings}
            subtitle={`${metrics.confirmedBookings} confirmed`}
            color="#9c27b0"
          />
        </div>

        {/* Chart Section */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: isMobile ? "16px" : "32px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
          marginBottom: isMobile ? "24px" : "40px",
          overflow: "hidden",
        }}>
          <h2 style={{
            fontSize: isMobile ? "1.05rem" : "1.3rem",
            fontWeight: "900",
            color: "#1a1a1a",
            margin: "0 0 24px 0",
            letterSpacing: "-0.3px"
          }}>
            Performance Analytics
          </h2>
          <div style={{ position: "relative", height: isMobile ? "280px" : "400px", marginBottom: "20px" }}>
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
          padding: isMobile ? "16px" : "32px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
          overflow: "hidden",
        }}>
          <h2 style={{
            fontSize: isMobile ? "1.05rem" : "1.3rem",
            fontWeight: "900",
            color: "#1a1a1a",
            margin: "0 0 24px 0",
            letterSpacing: "-0.3px"
          }}>
            Reports & Export
          </h2>

          {/* Filter Section */}
          <div style={{
            marginBottom: isMobile ? "20px" : "32px",
            padding: isMobile ? "16px" : "28px",
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
              alignItems: isMobile ? "flex-start" : "center",
              flexDirection: isMobile ? "column" : "row",
              gap: isMobile ? "10px" : "0",
              marginBottom: "20px"
            }}>
              <h3 style={{
                fontSize: isMobile ? "1rem" : "1.15rem",
                fontWeight: "700",
                color: "#1a1a1a",
                margin: "0"
              }}>
                Customize Your Report
              </h3>
              {(reportPeriod || filterDate || filterRoute) && (
                <div style={{
                  backgroundColor: "#4a8bd4",
                  color: "white",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "0.85rem",
                  fontWeight: "600"
                }}>
                  {[reportPeriod, filterDate, filterRoute].filter(Boolean).length} filter{[reportPeriod, filterDate, filterRoute].filter(Boolean).length !== 1 ? "s" : ""} active
                </div>
              )}
            </div>

            <div style={{
              display: "flex",
              gap: isMobile ? "6px" : "10px",
              flexWrap: "nowrap",
              marginBottom: "20px",
              width: "100%",
            }}>
              {[
                { id: "", label: "All bookings", mobileLabel: "All" },
                { id: "weekly", label: "Weekly report", mobileLabel: "Weekly" },
                { id: "monthly", label: "Monthly report", mobileLabel: "Monthly" },
              ].map((option) => (
                <button
                  key={option.id || "all"}
                  type="button"
                  aria-label={option.label}
                  onClick={() => {
                    setReportPeriod(option.id);
                    if (option.id) setFilterDate("");
                  }}
                  style={{
                    padding: isMobile ? "9px 3px" : "10px 14px",
                    borderRadius: "10px",
                    border: reportPeriod === option.id ? "2px solid #4a8bd4" : "2px solid #d0dbe8",
                    background: reportPeriod === option.id ? "#e6f0f8" : "white",
                    color: "#2c3e50",
                    fontWeight: 600,
                    cursor: "pointer",
                    flex: "1 1 0",
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    fontSize: isMobile ? "0.7rem" : "1rem",
                  }}
                >
                  {isMobile ? option.mobileLabel : option.label}
                </button>
              ))}
            </div>

            {/* Filters Grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: isMobile ? "12px" : "20px",
              marginBottom: "20px"
            }}>
              {/* Date Filter */}
              <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? "6px" : "10px", minWidth: 0 }}>
                <label style={{
                  fontSize: isMobile ? "0.78rem" : "0.95rem",
                  fontWeight: "600",
                  color: "#2c3e50"
                }}>
                  Select Date
                </label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => {
                    setFilterDate(e.target.value);
                    if (e.target.value) setReportPeriod("");
                  }}
                  style={{
                    boxSizing: "border-box",
                    width: "100%",
                    minWidth: 0,
                    padding: isMobile ? "10px 8px" : "12px 14px",
                    border: "2px solid #4a8bd4",
                    borderRadius: "10px",
                    fontSize: isMobile ? "0.78rem" : "0.95rem",
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
              <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? "6px" : "10px", minWidth: 0 }}>
                <label style={{
                  fontSize: isMobile ? "0.78rem" : "0.95rem",
                  fontWeight: "600",
                  color: "#2c3e50"
                }}>
                  Select Route
                </label>
                <select
                  value={filterRoute}
                  onChange={(e) => setFilterRoute(e.target.value)}
                  style={{
                    boxSizing: "border-box",
                    width: "100%",
                    minWidth: 0,
                    padding: isMobile ? "10px 8px" : "12px 14px",
                    border: "2px solid #4a8bd4",
                    borderRadius: "10px",
                    fontSize: isMobile ? "0.78rem" : "0.95rem",
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
                  {routeOptions.map((route) => (
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
              {(reportPeriod || filterDate || filterRoute) && (
                <button
                  onClick={() => {
                    setReportPeriod("");
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
                marginLeft: isMobile ? "0" : "auto",
                width: isMobile ? "100%" : "auto",
              }}>
                Filters will apply to all exports below
              </div>
            </div>
          </div>

          <ReportPreview
            title="Filtered Report Preview"
            filterLabel={reportFilterLabel}
            summary={reportSummary}
            emptyMessage="No bookings match the selected filters. Try Weekly/Monthly or choose a different date or route."
          />

          {/* Export Options Header */}
          <h3 style={{
            fontSize: isMobile ? "1rem" : "1.1rem",
            fontWeight: "700",
            color: "#1a1a1a",
            margin: isMobile ? "22px 0 12px" : "32px 0 20px"
          }}>
            Export Your Data
            {(reportPeriod || filterDate || filterRoute) && (
              <span style={{
                fontSize: isMobile ? "0.72rem" : "0.85rem",
                fontWeight: "400",
                color: "#fb8c00",
                marginLeft: isMobile ? "6px" : "12px"
              }}>
                (with selected filters applied)
              </span>
            )}
          </h3>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: isMobile ? "8px" : "20px"
          }}>
            <button
              onClick={printReport}
              style={{
                padding: isMobile ? "10px 4px" : "28px 20px",
                backgroundColor: "#e6f0f8",
                border: "2px solid #4a8bd4",
                borderRadius: isMobile ? "9px" : "14px",
                color: "#4a8bd4",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: isMobile ? "0.75rem" : "1rem",
                minHeight: isMobile ? "54px" : "auto",
                boxSizing: "border-box"
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
              <div style={{ fontSize: isMobile ? "0.7rem" : "1.05rem", fontWeight: "700", marginBottom: isMobile ? "0" : "6px" }}>{isMobile ? "Print" : "Print Report"}</div>
              {!isMobile && <div style={{ fontSize: "0.8rem", opacity: "0.75" }}>Open print dialog</div>}
            </button>

            <button
              onClick={exportAsJSON}
              style={{
                padding: isMobile ? "10px 4px" : "28px 20px",
                backgroundColor: "#f1f8f4",
                border: "2px solid #43a047",
                borderRadius: isMobile ? "9px" : "14px",
                color: "#43a047",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: isMobile ? "0.75rem" : "1rem",
                minHeight: isMobile ? "54px" : "auto",
                boxSizing: "border-box"
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
              <div style={{ fontSize: isMobile ? "0.7rem" : "1.05rem", fontWeight: "700", marginBottom: isMobile ? "0" : "6px" }}>{isMobile ? "JSON" : "Download JSON"}</div>
              {!isMobile && <div style={{ fontSize: "0.8rem", opacity: "0.75" }}>Export as JSON data</div>}
            </button>

            <button
              onClick={saveAsPDF}
              style={{
                padding: isMobile ? "10px 4px" : "28px 20px",
                backgroundColor: "#fff3e0",
                border: "2px solid #fb8c00",
                borderRadius: isMobile ? "9px" : "14px",
                color: "#fb8c00",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: isMobile ? "0.75rem" : "1rem",
                minHeight: isMobile ? "54px" : "auto",
                boxSizing: "border-box"
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
              <div style={{ fontSize: isMobile ? "0.7rem" : "1.05rem", fontWeight: "700", marginBottom: isMobile ? "0" : "6px" }}>{isMobile ? "PDF" : "Save as PDF"}</div>
              {!isMobile && <div style={{ fontSize: "0.8rem", opacity: "0.75" }}>Download PDF report with filters</div>}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default AdminDashboard;
