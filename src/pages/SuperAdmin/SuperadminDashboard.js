import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import SuperadminLayout from "./SuperadminLayout";
import jsPDF from "jspdf";
import {
  filterBookingsByPeriod,
  getPeriodRange,
  summarizeBookings,
  buildReportFilterLabel,
} from "../../utils/reportHelpers";
import ReportPreview from "../../components/ReportPreview";

function SuperadminDashboard() {
  const [stats, setStats] = useState({
    totalAdmins: 0,
    totalScanners: 0,
    totalBoats: 0
  });
  const [loading, setLoading] = useState(true);
  const [systemOperational, setSystemOperational] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [detailedData, setDetailedData] = useState([]);
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [reportPeriod, setReportPeriod] = useState("weekly");

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const adminsSnapshot = await getDocs(collection(db, "admins"));
        const scannersSnapshot = await getDocs(collection(db, "qr_scanners"));
        const boatsSnapshot = await getDocs(collection(db, "boats"));
        const bookingsSnapshot = await getDocs(collection(db, "bookings"));

        setBookings(
          bookingsSnapshot.docs.map((bookingDoc) => {
            const data = bookingDoc.data();
            const normalized = { id: bookingDoc.id, ...data };
            if (normalized.date && normalized.date.toDate) {
              normalized.date = normalized.date.toDate().toISOString().split("T")[0];
            }
            return normalized;
          })
        );

        setStats({
          totalAdmins: adminsSnapshot.size,
          totalScanners: scannersSnapshot.size,
          totalBoats: boatsSnapshot.size
        });
        setSystemOperational(true);
      } catch (error) {
        console.error("Error fetching stats:", error);
        setSystemOperational(false);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const openDetailedModal = async (cardType) => {
    setSelectedCard(cardType);
    setDetailedLoading(true);
    try {
      let data = [];
      if (cardType === "admins") {
        const snapshot = await getDocs(collection(db, "admins"));
        data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } else if (cardType === "scanners") {
        const snapshot = await getDocs(collection(db, "qr_scanners"));
        data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } else if (cardType === "boats") {
        const snapshot = await getDocs(collection(db, "boats"));
        data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      setDetailedData(data);
      setModalOpen(true);
    } catch (error) {
      console.error("Error fetching detailed data:", error);
    } finally {
      setDetailedLoading(false);
    }
  };

  const filteredReportBookings = useMemo(
    () => filterBookingsByPeriod(bookings, reportPeriod || "weekly"),
    [bookings, reportPeriod]
  );
  const reportSummary = useMemo(
    () => summarizeBookings(filteredReportBookings),
    [filteredReportBookings]
  );
  const reportFilterLabel = useMemo(
    () => buildReportFilterLabel({ reportPeriod: reportPeriod || "weekly" }),
    [reportPeriod]
  );

  const getReportSummary = () => reportSummary;

  // Export report as JSON
  const exportAsJSON = () => {
    const summary = getReportSummary();
    const reportData = {
      generatedAt: new Date().toISOString(),
      reportType: `${reportPeriod || "weekly"} system report`,
      periodLabel: getPeriodRange(reportPeriod || "weekly")?.label,
      systemStatus: systemOperational ? "Operational" : "Error",
      statistics: {
        totalAdmins: stats.totalAdmins,
        totalScanners: stats.totalScanners,
        totalBoats: stats.totalBoats,
        totalAccounts: stats.totalAdmins + stats.totalScanners,
      },
      bookingSummary: summary,
    };

    const dataStr = JSON.stringify(reportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `system-${reportPeriod || "weekly"}-report-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Save as PDF report
  const saveAsPDF = () => {
    try {
      const summary = getReportSummary();
      const reportDate = new Date().toISOString().split("T")[0];
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

      // Header
      pdf.setFontSize(20);
      pdf.setTextColor(74, 139, 212);
      pdf.setFont(undefined, "bold");
      pdf.text("System Report", marginLeft, yPosition);
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setTextColor(102, 102, 102);
      pdf.setFont(undefined, "normal");
      pdf.text("PMS Port Management System", marginLeft, yPosition);
      yPosition += 7;
      pdf.text("Generated: " + new Date().toLocaleString(), marginLeft, yPosition);
      yPosition += 12;

      // Divider
      pdf.setDrawColor(74, 139, 212);
      pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
      yPosition += 8;

      // System Status
      pdf.setFontSize(12);
      pdf.setTextColor(74, 139, 212);
      pdf.setFont(undefined, "bold");
      pdf.text("System Status", marginLeft, yPosition);
      yPosition += 8;

      pdf.setFontSize(10);
      pdf.setFont(undefined, "normal");
      const statusText = systemOperational ? "Operational" : "Error";
      if (systemOperational) {
        pdf.setTextColor(67, 160, 71);
      } else {
        pdf.setTextColor(229, 57, 53);
      }
      pdf.setFont(undefined, "bold");
      pdf.text(statusText, marginLeft, yPosition);
      yPosition += 12;

      // Account Statistics
      pdf.setFontSize(12);
      pdf.setTextColor(74, 139, 212);
      pdf.setFont(undefined, "bold");
      pdf.text("Account Statistics", marginLeft, yPosition);
      yPosition += 8;

      pdf.setFontSize(10);
      pdf.setTextColor(51, 51, 51);
      pdf.setFont(undefined, "normal");
      pdf.text("Admin Accounts: " + stats.totalAdmins, marginLeft, yPosition);
      yPosition += 6;
      pdf.text("QR Scanner Accounts: " + stats.totalScanners, marginLeft, yPosition);
      yPosition += 6;
      pdf.text("Registered Boats: " + stats.totalBoats, marginLeft, yPosition);
      yPosition += 6;
      pdf.setFont(undefined, "bold");
      pdf.text("Total Accounts: " + (stats.totalAdmins + stats.totalScanners), marginLeft, yPosition);
      yPosition += 12;

      pdf.setFontSize(12);
      pdf.setTextColor(74, 139, 212);
      pdf.setFont(undefined, "bold");
      pdf.text(`${(reportPeriod || "weekly").toUpperCase()} Booking Summary`, marginLeft, yPosition);
      yPosition += 8;

      pdf.setFontSize(10);
      pdf.setTextColor(51, 51, 51);
      pdf.setFont(undefined, "normal");
      pdf.text("Period: " + (getPeriodRange(reportPeriod || "weekly")?.label || reportPeriod), marginLeft, yPosition);
      yPosition += 6;
      pdf.text("Total Bookings: " + summary.totalBookings, marginLeft, yPosition);
      yPosition += 6;
      pdf.text("Confirmed Bookings: " + summary.completedBookings, marginLeft, yPosition);
      yPosition += 6;
      pdf.text("Pending Bookings: " + summary.pendingBookings, marginLeft, yPosition);
      yPosition += 6;
      pdf.text("Cancelled Bookings: " + summary.cancelledBookings, marginLeft, yPosition);
      yPosition += 6;
      pdf.text("Total Revenue: PHP " + Number(summary.totalRevenue || 0).toLocaleString(), marginLeft, yPosition);
      yPosition += 12;

      // Check if we need a new page
      if (yPosition > pageHeight - 40) {
        pdf.addPage();
        yPosition = 20;
      }

      // Footer
      pdf.setFontSize(8);
      pdf.setTextColor(153, 153, 153);
      pdf.text("This is an automatically generated system report.", marginLeft, pageHeight - 10);
      pdf.text("© PMS Port Management System", marginLeft, pageHeight - 5);

      // Save the PDF using blob method
      const pdfBlob = pdf.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `system-${reportPeriod || "weekly"}-report-${reportDate}.pdf`;
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
    const summary = getReportSummary();
    const printWindow = window.open("", "", "height=600,width=800");
    printWindow.document.write(`
      <html>
        <head>
          <title>System Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
            h1 { color: #4a8bd4; border-bottom: 2px solid #4a8bd4; padding-bottom: 10px; }
            h2 { color: #666; margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
            .stat-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
            .stat-label { font-weight: 600; color: #666; }
            .stat-value { font-size: 1.2em; font-weight: 900; color: #4a8bd4; }
            .status { padding: 8px 12px; border-radius: 4px; display: inline-block; }
            .status.operational { background: #e8f5e9; color: #43a047; }
            .status.error { background: #ffebee; color: #e53935; }
            .footer { margin-top: 40px; text-align: center; color: #999; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <h1>System Report</h1>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>System Status:</strong> <span class="status ${systemOperational ? 'operational' : 'error'}">${systemOperational ? 'Operational' : 'Error'}</span></p>
          
          <h2>Account Statistics</h2>
          <div class="stat-row">
            <span class="stat-label">Admin Accounts</span>
            <span class="stat-value">${stats.totalAdmins}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">QR Scanner Accounts</span>
            <span class="stat-value">${stats.totalScanners}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Registered Boats</span>
            <span class="stat-value">${stats.totalBoats}</span>
          </div>
          <div class="stat-row" style="border-bottom: 2px solid #4a8bd4; font-weight: 600;">
            <span class="stat-label">Total Accounts</span>
            <span class="stat-value">${stats.totalAdmins + stats.totalScanners}</span>
          </div>

          <h2>${(reportPeriod || "weekly").toUpperCase()} Booking Summary</h2>
          <div class="stat-row">
            <span class="stat-label">Period</span>
            <span class="stat-value">${getPeriodRange(reportPeriod || "weekly")?.label || reportPeriod}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Total Bookings</span>
            <span class="stat-value">${summary.totalBookings}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Confirmed</span>
            <span class="stat-value">${summary.completedBookings}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Pending</span>
            <span class="stat-value">${summary.pendingBookings}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Cancelled</span>
            <span class="stat-value">${summary.cancelledBookings}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Total Revenue</span>
            <span class="stat-value">PHP ${Number(summary.totalRevenue || 0).toLocaleString()}</span>
          </div>
          
          <div class="footer">
            <p>This is an automatically generated system report.</p>
            <p>© PMS Port Management System</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const StatCard = ({ title, count, bgColor, onClick }) => (
    <div style={{
      backgroundColor: "white",
      borderRadius: "12px",
      padding: isMobile ? "8px" : "16px",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
      border: `2px solid ${bgColor}`,
      borderTop: `4px solid ${bgColor}`,
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      minHeight: isMobile ? "75px" : "110px",
      minWidth: isMobile ? "calc(50% - 6px)" : "auto"
    }}
      onClick={onClick}
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
        margin: "0 0 6px 0",
        color: "#666",
        fontSize: isMobile ? "0.6rem" : "0.9rem",
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        textAlign: "center"
      }}>
        {title}
      </h4>
      <div style={{
        fontSize: isMobile ? "1.6rem" : "2.4rem",
        fontWeight: "900",
        color: bgColor,
        margin: "0"
      }}>
        {loading ? "-" : count}
      </div>
    </div>
  );

  return (
    <SuperadminLayout active="dashboard">
      <div style={{
        maxWidth: "1400px",
        width: "100%",
        margin: "0 auto",
        padding: isMobile ? "15px 12px" : "30px 20px",
        boxSizing: "border-box"
      }}>
        {/* Header */}
        <div style={{
          marginBottom: isMobile ? "12px" : "20px"
        }}>
          <h1 style={{
            fontSize: isMobile ? "1.2rem" : "2rem",
            fontWeight: "900",
            color: "#1a1a1a",
            margin: "0",
            letterSpacing: "-0.5px"
          }}>
            Superadmin Overview
          </h1>
        </div>

        {/* Note for Data Modal */}
        <p style={{
          fontSize: isMobile ? "0.75rem" : "0.9rem",
          color: "#999",
          margin: "0 0 20px 0",
          fontStyle: "italic"
        }}>
          Click on any stat card to view detailed data
        </p>

        {/* Stats Cards Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(auto-fit, minmax(300px, 1fr))",
          gap: isMobile ? "12px" : "24px",
          marginBottom: isMobile ? "25px" : "40px",
          overflowX: isMobile ? "auto" : "visible",
          paddingBottom: isMobile ? "8px" : "0",
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch"
        }}>
          <StatCard
            title="Admin Accounts"
            count={stats.totalAdmins}
            bgColor="#4a8bd4"
            onClick={() => openDetailedModal("admins")}
          />
          <StatCard
            title="QR Scanner Accounts"
            count={stats.totalScanners}
            bgColor="#43a047"
            onClick={() => openDetailedModal("scanners")}
          />
          <StatCard
            title="Registered Boats"
            count={stats.totalBoats}
            bgColor="#fb8c00"
            onClick={() => openDetailedModal("boats")}
          />
        </div>

        {/* Quick Actions Section */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: isMobile ? "16px" : "32px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
          marginBottom: isMobile ? "25px" : "40px"
        }}>
          <h2 style={{
            fontSize: isMobile ? "0.95rem" : "1.3rem",
            fontWeight: "900",
            color: "#1a1a1a",
            margin: "0 0 16px 0",
            letterSpacing: "-0.3px"
          }}>
            Quick Actions
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: isMobile ? "10px" : "16px"
          }}>
            <a
              href="/manage-admins"
              style={{
                display: "block",
                padding: isMobile ? "12px 10px" : "24px",
                backgroundColor: "#e6f0f8",
                border: "2px solid #4a8bd4",
                borderRadius: "12px",
                textDecoration: "none",
                color: "#4a8bd4",
                fontWeight: "600",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#4a8bd4";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.boxShadow = "0 8px 16px rgba(74, 139, 212, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#e6f0f8";
                e.currentTarget.style.color = "#4a8bd4";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ fontSize: isMobile ? "0.85rem" : "1.1rem", fontWeight: "700" }}>Manage Admins</div>
              <div style={{ fontSize: isMobile ? "0.65rem" : "0.85rem", opacity: "0.8", marginTop: "2px" }}>View and manage admin accounts</div>
            </a>

            <a
              href="/manage-qr-scanners"
              style={{
                display: "block",
                padding: isMobile ? "12px 10px" : "24px",
                backgroundColor: "#f1f8f4",
                border: "2px solid #43a047",
                borderRadius: "12px",
                textDecoration: "none",
                color: "#43a047",
                fontWeight: "600",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#43a047";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.boxShadow = "0 8px 16px rgba(67, 160, 71, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#f1f8f4";
                e.currentTarget.style.color = "#43a047";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ fontSize: isMobile ? "0.85rem" : "1.1rem", fontWeight: "700" }}>Manage QR Scanners</div>
              <div style={{ fontSize: isMobile ? "0.65rem" : "0.85rem", opacity: "0.8", marginTop: "2px" }}>View and manage scanner accounts</div>
            </a>
          </div>
        </div>

        {/* Reports & Export Section */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: isMobile ? "16px" : "32px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
          marginBottom: isMobile ? "25px" : "40px"
        }}>
          <h2 style={{
            fontSize: isMobile ? "0.95rem" : "1.3rem",
            fontWeight: "900",
            color: "#1a1a1a",
            margin: "0 0 16px 0",
            letterSpacing: "-0.3px"
          }}>
            Reports & Export
          </h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
            {[
              { id: "weekly", label: "Weekly report" },
              { id: "monthly", label: "Monthly report" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setReportPeriod(option.id)}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: reportPeriod === option.id ? "2px solid #4a8bd4" : "2px solid #d0dbe8",
                  background: reportPeriod === option.id ? "#e6f0f8" : "white",
                  color: "#2c3e50",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <ReportPreview
            title="Filtered Report Preview"
            filterLabel={reportFilterLabel}
            summary={reportSummary}
            emptyMessage="No bookings match the selected weekly or monthly filter."
          />

          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
            gap: isMobile ? "10px" : "16px"
          }}>
            <button
              onClick={printReport}
              style={{
                padding: isMobile ? "12px 10px" : "24px",
                backgroundColor: "#e6f0f8",
                border: "2px solid #4a8bd4",
                borderRadius: "12px",
                textDecoration: "none",
                color: "#4a8bd4",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: isMobile ? "0.75rem" : "1rem"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#4a8bd4";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.boxShadow = "0 8px 16px rgba(74, 139, 212, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#e6f0f8";
                e.currentTarget.style.color = "#4a8bd4";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ fontSize: isMobile ? "0.85rem" : "1.1rem", fontWeight: "700" }}>Print Report</div>
              <div style={{ fontSize: isMobile ? "0.6rem" : "0.85rem", opacity: "0.8", marginTop: "2px" }}>Open print dialog</div>
            </button>

            <button
              onClick={exportAsJSON}
              style={{
                padding: isMobile ? "12px 10px" : "24px",
                backgroundColor: "#f1f8f4",
                border: "2px solid #43a047",
                borderRadius: "12px",
                color: "#43a047",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: isMobile ? "0.75rem" : "1rem"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#43a047";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.boxShadow = "0 8px 16px rgba(67, 160, 71, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#f1f8f4";
                e.currentTarget.style.color = "#43a047";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ fontSize: isMobile ? "0.85rem" : "1.1rem", fontWeight: "700" }}>Download JSON</div>
              <div style={{ fontSize: isMobile ? "0.6rem" : "0.85rem", opacity: "0.8", marginTop: "2px" }}>Export as JSON data</div>
            </button>

            <button
              onClick={saveAsPDF}
              style={{
                padding: isMobile ? "12px 10px" : "24px",
                backgroundColor: "#fff3e0",
                border: "2px solid #fb8c00",
                borderRadius: "12px",
                color: "#fb8c00",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: isMobile ? "0.75rem" : "1rem"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#fb8c00";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.boxShadow = "0 8px 16px rgba(251, 140, 0, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#fff3e0";
                e.currentTarget.style.color = "#fb8c00";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ fontSize: isMobile ? "0.95rem" : "1.1rem", fontWeight: "700" }}>Save as PDF</div>
              <div style={{ fontSize: isMobile ? "0.7rem" : "0.85rem", opacity: "0.8", marginTop: "4px" }}>Download PDF file</div>
            </button>
          </div>
        </div>

        {/* Detailed Data Modal */}
        {modalOpen && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            padding: isMobile ? "16px" : "0"
          }} onClick={() => setModalOpen(false)}>
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: isMobile ? "16px" : "32px",
              maxWidth: isMobile ? "100%" : "600px",
              width: "100%",
              maxHeight: isMobile ? "80vh" : "70vh",
              overflowY: "auto",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)"
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ margin: 0, fontSize: isMobile ? "1rem" : "1.5rem", color: "#1a1a1a" }}>
                  {selectedCard === "admins" && "Admin Accounts"}
                  {selectedCard === "scanners" && "QR Scanner Accounts"}
                  {selectedCard === "boats" && "Registered Boats"}
                </h2>
                <button onClick={() => setModalOpen(false)} style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#666"
                }}>×</button>
              </div>

              {detailedLoading ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>Loading...</div>
              ) : detailedData.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>No data available</div>
              ) : (
                <div>
                  {detailedData.map((item, index) => (
                    <div key={item.id || index} style={{
                      padding: "12px",
                      borderBottom: "1px solid #eee",
                      fontSize: isMobile ? "0.85rem" : "0.95rem",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      backgroundColor: "#fff"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#f5f5f5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#fff";
                    }}>
                      {selectedCard === "admins" && (
                        <>
                          <span style={{ color: "#666" }}>Name: {item.name}</span><br/>
                          <span style={{ color: "#666" }}>Email: {item.email}</span><br/>
                          <span style={{ color: "#666" }}>Phone: {item.phone || "Not set"}</span>
                        </>
                      )}
                      {selectedCard === "scanners" && (
                        <>
                          <span style={{ color: "#666" }}>Name: {item.name}</span><br/>
                          <span style={{ color: "#666" }}>Email: {item.email || "No email"}</span>
                        </>
                      )}
                      {selectedCard === "boats" && (
                        <>
                          <span style={{ color: "#666" }}>Boat Name: {item.name}</span><br/>
                          <span style={{ color: "#666" }}>Route: {item.route || "N/A"}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}

export default SuperadminDashboard;
