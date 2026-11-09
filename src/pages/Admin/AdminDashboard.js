import { useEffect, useState, useMemo } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import AdminLayout from "./AdminLayout";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  filterBookingsByPeriod,
  getPeriodRange,
  getBookingCreatedAt,
  getBookingTripDate,
  summarizeBookings,
  buildReportFilterLabel,
  getUniqueRoutesFromBookings,
  getBookingRouteLabel,
  computeDashboardMetrics,
  attachPaymentStatuses,
  getBookingAmount,
  isReportableBooking,
} from "../../utils/reportHelpers";
import { useAuthReloadKey, useAuthUser } from "../../hooks/useAuthUser";
import { getStaffAccount } from "../../utils/staffAccount";

// Chart.js imports
import { Doughnut, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const formatReportCurrency = (value) =>
  `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function AdminDashboard() {
  const [adminData, setAdminData] = useState(null);

  const [bookings, setBookings] = useState([]);
  const [filterDate, setFilterDate] = useState("");
  const [filterRoute, setFilterRoute] = useState("");
  const [reportPeriod, setReportPeriod] = useState("");
  const [generatedReport, setGeneratedReport] = useState(null);
  const [reportPreview, setReportPreview] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const { user, authReady } = useAuthUser();
  const reloadKey = useAuthReloadKey();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
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

  useEffect(() => {
    setGeneratedReport(null);
  }, [bookings]);

  const reportableBookings = useMemo(
    () =>
      bookings.filter(isReportableBooking),
    [bookings]
  );

  const metrics = useMemo(
    () => computeDashboardMetrics(reportableBookings),
    [reportableBookings]
  );

  const filteredDashboardBookings = useMemo(() => {
    let filtered = bookings;
    if (reportPeriod) {
      filtered = filterBookingsByPeriod(filtered, reportPeriod);
    } else if (filterDate) {
      filtered = filtered.filter((booking) => {
        const tripDate = getBookingTripDate(booking);
        return tripDate
          ? [
            tripDate.getFullYear(),
            String(tripDate.getMonth() + 1).padStart(2, "0"),
            String(tripDate.getDate()).padStart(2, "0"),
          ].join("-") === filterDate
          : booking.date === filterDate;
      });
    }
    if (filterRoute) {
      filtered = filtered.filter((booking) => getBookingRouteLabel(booking) === filterRoute);
    }
    return filtered;
  }, [bookings, reportPeriod, filterDate, filterRoute]);

  const filteredReportBookings = useMemo(
    () => filteredDashboardBookings.filter(isReportableBooking),
    [filteredDashboardBookings]
  );

  const chartData = useMemo(() => {
    let range = reportPeriod ? getPeriodRange(reportPeriod) : null;
    if (filterDate) {
      const selectedDay = new Date(`${filterDate}T00:00:00`);
      range = {
        start: selectedDay,
        end: new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate(), 23, 59, 59, 999),
      };
    }

    const getChartDate = (booking) => {
      const tripDate = getBookingTripDate(booking);
      const createdAt = getBookingCreatedAt(booking);
      if (range && tripDate && tripDate >= range.start && tripDate <= range.end) return tripDate;
      if (range && createdAt && createdAt >= range.start && createdAt <= range.end) return createdAt;
      return tripDate || createdAt;
    };

    if (!range) {
      const dates = filteredDashboardBookings.map(getChartDate).filter(Boolean);
      if (dates.length > 0) {
        const firstDate = new Date(Math.min(...dates.map((date) => date.getTime())));
        const lastDate = new Date(Math.max(...dates.map((date) => date.getTime())));
        range = {
          start: new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate()),
          end: new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate(), 23, 59, 59, 999),
        };
      } else {
        const end = new Date();
        range = {
          start: new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6),
          end: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999),
        };
      }
    }

    const spanDays = Math.max(1, Math.ceil((range.end - range.start) / 86400000) + 1);
    const bucketType = filterDate || reportPeriod
      ? "day"
      : spanDays > 90
        ? "month"
        : spanDays > 31
          ? "week"
          : "day";
    const buckets = [];
    if (bucketType === "month") {
      const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
      const last = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
      while (cursor <= last) {
        const start = new Date(cursor);
        const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
        buckets.push({ start, end, label: start.toLocaleDateString("en-PH", { month: "short", year: "numeric" }) });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else if (bucketType === "week") {
      const cursor = new Date(range.start);
      while (cursor <= range.end) {
        const start = new Date(cursor);
        const end = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 6, 23, 59, 59, 999);
        buckets.push({ start, end, label: start.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) });
        cursor.setDate(cursor.getDate() + 7);
      }
    } else {
      const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
      const lastDay = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
      while (cursor <= lastDay) {
        const start = new Date(cursor);
        const end = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 23, 59, 59, 999);
        buckets.push({ start, end, label: start.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) });
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const bookingsByBucket = buckets.map(({ start, end }) =>
      filteredDashboardBookings.filter((booking) => {
        const date = getChartDate(booking);
        return date && date >= start && date <= end;
      })
    );
    const reportableIds = new Set(filteredReportBookings.map((booking) => booking.id));
    const payLaterBookingsByBucket = bookingsByBucket.map((items) =>
      items.filter((booking) => {
        const paymentMode = String(booking.paymentMode || booking.paymentMethod || booking.payment || "")
          .toLowerCase()
          .replace(/[\s_-]/g, "");
        const status = String(booking.status || "").toLowerCase();
        return paymentMode === "paylater" &&
          !["cancelled", "canceled", "failed"].includes(status) &&
          reportableIds.has(booking.id);
      })
    );

    return {
      labels: buckets.map((bucket) => bucket.label),
      datasets: [
        {
          label: "Bookings",
          data: bookingsByBucket.map((items) => items.length),
          borderColor: "#2f78bd",
          backgroundColor: "rgba(47, 120, 189, 0.12)",
          pointBackgroundColor: "#2f78bd",
          pointRadius: 4,
          tension: 0.35,
          yAxisID: "y",
          fill: true,
        },
        {
          label: "Revenue",
          data: bookingsByBucket.map((items) =>
            items.filter((booking) => reportableIds.has(booking.id))
              .reduce((total, booking) => total + getBookingAmount(booking), 0)
          ),
          borderColor: "#e4a454",
          backgroundColor: "rgba(228, 164, 84, 0.08)",
          pointBackgroundColor: "#e4a454",
          pointRadius: 4,
          tension: 0.35,
          yAxisID: "revenue",
        },
        {
          label: "PayLater Bookings",
          data: payLaterBookingsByBucket.map((items) => items.length),
          borderColor: "#8657c5",
          backgroundColor: "rgba(134, 87, 197, 0.1)",
          pointBackgroundColor: "#8657c5",
          pointRadius: 4,
          tension: 0.35,
          yAxisID: "y",
        },
        {
          label: "PayLater Amount",
          data: payLaterBookingsByBucket.map((items) =>
            items.reduce((total, booking) => total + getBookingAmount(booking), 0)
          ),
          borderColor: "#d16b9c",
          backgroundColor: "rgba(209, 107, 156, 0.08)",
          pointBackgroundColor: "#d16b9c",
          pointRadius: 4,
          pointStyle: "triangle",
          borderDash: [6, 4],
          tension: 0.35,
          yAxisID: "revenue",
        },
      ],
    };
  }, [filteredDashboardBookings, filteredReportBookings, reportPeriod, filterDate]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top", align: "end", labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          label: (context) => ["Revenue", "PayLater Amount"].includes(context.dataset.label)
            ? ` ${context.dataset.label}: ₱${Number(context.parsed.y || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
            : ` ${context.dataset.label}: ${context.parsed.y}`,
        },
      },
    },
    scales: {
      y: { beginAtZero: true, title: { display: true, text: "Bookings" }, grid: { color: "#e7eef5" } },
      revenue: { beginAtZero: true, position: "right", title: { display: true, text: "Amount (PHP)" }, grid: { drawOnChartArea: false } },
      x: { grid: { display: false } },
    },
  }), []);

  const bookingStatusSummary = useMemo(() => {
    const summary = { confirmed: 0, pending: 0, cancelled: 0 };
    filteredDashboardBookings.forEach((booking) => {
      const status = String(booking.status || "pending").toLowerCase();
      if (["confirmed", "completed", "departed", "boarded", "scanned"].includes(status)) {
        summary.confirmed += 1;
      } else if (["cancelled", "canceled", "failed"].includes(status)) {
        summary.cancelled += 1;
      } else {
        summary.pending += 1;
      }
    });
    return summary;
  }, [filteredDashboardBookings]);

  const bookingStatusChartData = useMemo(() => ({
    labels: ["Confirmed", "Pending", "Cancelled"],
    datasets: [{
      data: filteredDashboardBookings.length === 0
        ? [1, 0, 0]
        : [
          bookingStatusSummary.confirmed,
          bookingStatusSummary.pending,
          bookingStatusSummary.cancelled,
        ],
      backgroundColor: ["#16b866", "#ffae00", "#f02d20"],
      borderWidth: 0,
      hoverOffset: 4,
    }],
  }), [bookingStatusSummary, filteredDashboardBookings.length]);

  const bookingStatusChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: "68%",
    plugins: {
      legend: { display: false },
      tooltip: { enabled: bookingStatusSummary.confirmed + bookingStatusSummary.pending + bookingStatusSummary.cancelled > 0 },
    },
  }), [bookingStatusSummary]);

  const routeOptions = useMemo(() => {
    const fromBookings = getUniqueRoutesFromBookings(reportableBookings);
    const fromAdmin = adminData?.availableRoutes || [];
    return [...new Set([...fromAdmin, ...fromBookings])].sort();
  }, [reportableBookings, adminData?.availableRoutes]);
  const reportFilterLabel = useMemo(
    () => buildReportFilterLabel({ reportPeriod, filterDate, filterRoute }),
    [reportPeriod, filterDate, filterRoute]
  );

  const getReportLabel = () => {
    if (reportPeriod === "today") return "today";
    if (reportPeriod === "weekly") return "weekly";
    if (reportPeriod === "monthly") return "monthly";
    if (reportPeriod === "lastMonth") return "last-month";
    if (filterDate) return filterDate;
    return "all-bookings";
  };

  const closeReportPreview = () => {
    if (reportPreview?.url) setTimeout(() => URL.revokeObjectURL(reportPreview.url), 1000);
    setReportPreview(null);
  };

  const downloadReportPreview = () => {
    if (!reportPreview) return;
    const link = document.createElement("a");
    link.href = reportPreview.url;
    link.download = reportPreview.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    closeReportPreview();
  };

  // Export report as JSON
  const exportAsJSON = () => {
    if (!generatedReport) {
      alert("Please generate a report before exporting.");
      return;
    }

    try {
      const { summary, reportPeriod: generatedPeriod, filterDate: generatedDate, filterRoute: generatedRoute, filterLabel } = generatedReport;
      const reportDate = generatedDate || (generatedPeriod ? generatedPeriod.toLowerCase().replace(/[^a-z0-9]+/g, "-") : getReportLabel());
      const generatedMetrics = computeDashboardMetrics(generatedReport.bookings);
      
      // Build dynamic filename
      let filename = `admin-report-${reportDate}`;
      if (generatedRoute) filename += `-${generatedRoute}`;
      filename += ".json";

      const reportData = {
        reportMetadata: {
          generatedAt: generatedReport.generatedAt.toISOString(),
          reportType: generatedPeriod
            ? `${getPeriodRange(generatedPeriod)?.label || generatedPeriod} Admin Report`
            : "Admin Performance Report",
          systemName: "PMS Port Management System"
        },
        adminInformation: {
          name: adminData?.name || "Unknown",
          assignedBoat: adminData?.assignedBoat || "N/A",
          assignedRoutes: adminData?.availableRoutes || []
        },
        reportFilters: {
          period: generatedPeriod || null,
          periodLabel: generatedPeriod ? getPeriodRange(generatedPeriod)?.label : null,
          date: generatedDate || null,
          route: generatedRoute || null,
          label: filterLabel,
          hasFilters: !!(generatedPeriod || generatedDate || generatedRoute)
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
          revenueToday: generatedMetrics.revenueToday,
          revenueWeek: generatedMetrics.revenueWeek,
          revenueMonth: generatedMetrics.revenueMonth,
          passengersToday: generatedMetrics.passengersToday,
          activeTrips: generatedMetrics.activeTrips
        },
        bookingsList: summary.bookingsList
      };

      const dataStr = JSON.stringify(reportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      if (reportPreview?.url) URL.revokeObjectURL(reportPreview.url);
      setReportPreview({ format: "json", filename, url, content: dataStr });
    } catch (error) {
      console.error("Error exporting JSON:", error);
      alert("Failed to export JSON. Please try again.");
    }
  };

  // Save as PDF report
  const saveAsPDF = () => {
    if (!generatedReport) {
      alert("Please generate a report before saving as PDF.");
      return;
    }

    try {
      const { summary, reportPeriod: generatedPeriod, filterDate: generatedDate, filterRoute: generatedRoute, filterLabel } = generatedReport;
      const reportDate = generatedDate || (generatedPeriod ? generatedPeriod.toLowerCase().replace(/[^a-z0-9]+/g, "-") : getReportLabel());
      let reportFileName = `admin-report-${reportDate}`;
      if (generatedRoute) reportFileName += `-${generatedRoute}`;
      reportFileName += ".pdf";

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
      });
      const drawTable = (options) => {
        autoTable(pdf, options);
        return pdf.lastAutoTable.finalY;
      };

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginLeft = 15;
      const marginRight = 15;
      const contentWidth = pageWidth - marginLeft - marginRight;
      const bottomMargin = 18;
      const reportScope = filterLabel || "All bookings";
      const appliedFilters = [
        generatedPeriod ? ["Period", getPeriodRange(generatedPeriod)?.label || generatedPeriod] : null,
        generatedDate ? ["Date", generatedDate] : null,
        generatedRoute ? ["Route", generatedRoute] : null,
      ].filter(Boolean);

      pdf.setFillColor(74, 139, 212);
      pdf.roundedRect(marginLeft, 10, contentWidth, 27, 2, 2, "F");
      pdf.setFontSize(18);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont(undefined, "bold");
      pdf.text("ADMIN REPORT", marginLeft + 6, 21);
      pdf.setFontSize(9);
      pdf.setFont(undefined, "normal");
      pdf.text("PMS Port Management System", marginLeft + 6, 29);
      pdf.setFont(undefined, "bold");
      pdf.text(pdf.splitTextToSize(reportScope, 105), pageWidth - marginRight - 6, 22, { align: "right" });

      let yPosition = 45;
      pdf.setFontSize(11);
      pdf.setTextColor(45, 70, 96);
      pdf.setFont(undefined, "bold");
      pdf.text("Report Information", marginLeft, yPosition);
      yPosition = drawTable({
        startY: yPosition + 3,
        head: [["Administrator", "Assigned Boat", "Generated"]],
        body: [[
          String(adminData?.name || "N/A").trim(),
          String(adminData?.assignedBoat || "N/A").trim(),
          generatedReport.generatedAt.toLocaleString("en-PH"),
        ]],
        theme: "grid",
        margin: { left: marginLeft, right: marginRight, bottom: bottomMargin },
        styles: { fontSize: 9, cellPadding: 3, textColor: [51, 51, 51], lineColor: [220, 228, 236], overflow: "linebreak" },
        headStyles: { fillColor: [240, 247, 251], textColor: [45, 70, 96], fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: contentWidth / 3 },
          1: { cellWidth: contentWidth / 3 },
          2: { cellWidth: contentWidth / 3 },
        },
      }) + 7;

      if (appliedFilters.length) {
        pdf.setFontSize(11);
        pdf.setTextColor(45, 70, 96);
        pdf.setFont(undefined, "bold");
        pdf.text("Applied Filters", marginLeft, yPosition + 2);
        yPosition = drawTable({
          startY: yPosition + 5,
          body: appliedFilters,
          theme: "plain",
          margin: { left: marginLeft, right: marginRight, bottom: bottomMargin },
          styles: { fontSize: 8.5, cellPadding: 1.5, textColor: [51, 51, 51] },
          columnStyles: {
            0: { cellWidth: 30, fontStyle: "bold", textColor: [45, 70, 96] },
            1: { cellWidth: contentWidth - 30 },
          },
        }) + 6;
      }

      pdf.setFontSize(11);
      pdf.setTextColor(45, 70, 96);
      pdf.setFont(undefined, "bold");
      pdf.text("Report Summary", marginLeft, yPosition);

      yPosition = drawTable({
        startY: yPosition + 3,
        head: [["Total Bookings", "Total Revenue", "Confirmed", "Pending", "Cancelled"]],
        body: [[
          String(summary.totalBookings),
          formatReportCurrency(summary.totalRevenue),
          String(summary.completedBookings),
          String(summary.pendingBookings),
          String(summary.cancelledBookings),
        ]],
        theme: "grid",
        margin: { left: marginLeft, right: marginRight, bottom: bottomMargin },
        styles: { fontSize: 9, cellPadding: 4, textColor: [45, 70, 96], lineColor: [220, 228, 236], halign: "center" },
        headStyles: { fillColor: [240, 247, 251], textColor: [45, 70, 96], fontStyle: "bold", fontSize: 8.5 },
        columnStyles: {
          0: { cellWidth: contentWidth / 5 },
          1: { cellWidth: contentWidth / 5 },
          2: { cellWidth: contentWidth / 5 },
          3: { cellWidth: contentWidth / 5 },
          4: { cellWidth: contentWidth / 5 },
        },
      }) + 8;

      if (summary.bookingsList.length > 0) {
        if (yPosition + 18 > pageHeight - bottomMargin) {
          pdf.addPage();
          yPosition = 20;
        }
        pdf.setFontSize(11);
        pdf.setTextColor(45, 70, 96);
        pdf.setFont(undefined, "bold");
        pdf.text("Booking Details", marginLeft, yPosition);
        yPosition += 4;

        const columns = ["Ref #", "Passenger", "Route", "Date", "Amount", "Status"];
        const rows = summary.bookingsList.map((b) => [
          b.referenceNumber || "N/A",
          b.passengerName || "N/A",
          b.route || "N/A",
          b.bookingDate || "N/A",
          formatReportCurrency(b.paymentAmount),
          b.status || "N/A"
        ]);

        drawTable({
          head: [columns],
          body: rows,
          startY: yPosition,
          theme: "striped",
          margin: { left: marginLeft, right: marginRight, bottom: bottomMargin },
          showHead: "everyPage",
          pageBreak: "auto",
          styles: {
            fontSize: 8.5,
            cellPadding: 3,
            overflow: "linebreak",
            textColor: [51, 51, 51],
            lineColor: [220, 228, 236],
          },
          headStyles: {
            fillColor: [74, 139, 212],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 9,
          },
          alternateRowStyles: { fillColor: [240, 247, 251] },
          columnStyles: {
            0: { cellWidth: 34 },
            1: { cellWidth: 52 },
            2: { cellWidth: 60 },
            3: { cellWidth: 32 },
            4: { cellWidth: 43, halign: "right" },
            5: { cellWidth: 46 },
          },
        });
      } else {
        pdf.setFontSize(9);
        pdf.setFont(undefined, "normal");
        pdf.setTextColor(110, 120, 130);
        pdf.text("No bookings match the selected report filters.", marginLeft, yPosition + 6);
      }

      const totalPages = pdf.internal.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        pdf.setPage(pageNumber);
        pdf.setFontSize(8);
        pdf.setTextColor(130, 140, 150);
        pdf.text(
          `PMS Port Management System · Page ${pageNumber} of ${totalPages}`,
          pageWidth / 2,
          pageHeight - 7,
          { align: "center" }
        );
      }

      // Prepare the exact PDF file for preview and download.
      const pdfBlob = pdf.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      if (reportPreview?.url) URL.revokeObjectURL(reportPreview.url);
      setReportPreview({ format: "pdf", filename: reportFileName, url });
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  // Print report
  const printReport = () => {
    if (!generatedReport) {
      alert("Please generate a report before printing.");
      return;
    }

    try {
      const { summary, reportPeriod: generatedPeriod, filterDate: generatedDate, filterRoute: generatedRoute, filterLabel } = generatedReport;
      const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]);
      const reportRows = summary.bookingsList.map((booking) => `
        <tr>
          <td>${escapeHtml(booking.referenceNumber || "N/A")}</td>
          <td>${escapeHtml(booking.passengerName || "N/A")}</td>
          <td>${escapeHtml(booking.route || "N/A")}</td>
          <td>${escapeHtml(booking.bookingDate || "N/A")}</td>
          <td class="amount">${formatReportCurrency(booking.paymentAmount)}</td>
          <td><span class="status">${escapeHtml(booking.status || "N/A")}</span></td>
        </tr>
      `).join("");
      const generatedAt = escapeHtml(generatedReport.generatedAt.toLocaleString("en-PH"));
      const reportScope = escapeHtml(filterLabel || "All bookings");
      const adminName = escapeHtml(adminData?.name || "N/A");
      const boatName = escapeHtml(adminData?.assignedBoat || "N/A");
      const appliedFilters = [
        generatedPeriod ? `Period: ${getPeriodRange(generatedPeriod)?.label || generatedPeriod}` : "",
        generatedDate ? `Date: ${generatedDate}` : "",
        generatedRoute ? `Route: ${generatedRoute}` : "",
      ].filter(Boolean);

      const printWindow = window.open("", "_blank", "height=800,width=1100");
      if (!printWindow) {
        alert("The print window was blocked. Allow pop-ups and try again.");
        return;
      }

      printWindow.document.write(`
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Admin Report - ${reportScope}</title>
            <style>@page { size: A4 landscape; margin: 14mm 12mm 18mm; }
              * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              body { margin: 0; color: #263445; font: 10pt/1.45 Arial, Helvetica, sans-serif; }
              h1, h2, p { margin: 0; }
              .masthead { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 18px 22px; background: #4a8bd4; color: #fff; border-radius: 8px; }
              .masthead h1 { font-size: 21pt; letter-spacing: .5px; }
              .masthead p { margin-top: 4px; opacity: .94; }
              .scope { max-width: 42%; text-align: right; font-weight: 700; }
              .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 14px 0; padding: 12px 16px; border: 1px solid #dce5ef; border-radius: 7px; background: #f5f9fc; }
              .meta span { display: block; color: #687789; font-size: 8pt; text-transform: uppercase; }
              .meta strong { display: block; margin-top: 3px; overflow-wrap: anywhere; }
              .filters { margin: 12px 0; padding: 10px 14px; border-left: 4px solid #f0a531; background: #fff8e9; }
              .filters strong { margin-right: 8px; }
              h2 { margin: 18px 0 8px; color: #315170; font-size: 13pt; break-after: avoid; }
              .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; break-inside: avoid; }
              .metric { padding: 11px 13px; border: 1px solid #dce5ef; border-radius: 7px; background: #fff; break-inside: avoid; }
              .metric span { display: block; color: #687789; font-size: 8pt; }
              .metric strong { display: block; margin-top: 4px; color: #243f5c; font-size: 14pt; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: fixed; }
              thead { display: table-header-group; }
              tr { break-inside: avoid; }
              th, td { border: 1px solid #d7e0e9; padding: 7px 8px; text-align: left; overflow-wrap: anywhere; }
              th:nth-child(1), td:nth-child(1) { width: 14%; }
              th:nth-child(2), td:nth-child(2) { width: 19%; }
              th:nth-child(3), td:nth-child(3) { width: 22%; }
              th:nth-child(4), td:nth-child(4) { width: 13%; }
              th:nth-child(5), td:nth-child(5) { width: 16%; }
              th:nth-child(6), td:nth-child(6) { width: 16%; }
              th { background: #4a8bd4; color: #fff; font-size: 8.5pt; }
              td { font-size: 8.5pt; }
              tbody tr:nth-child(even) { background: #f3f7fb; }
              .amount { text-align: right; white-space: nowrap; }
              .status { text-transform: capitalize; }
              .empty { padding: 18px; border: 1px dashed #cbd6e2; color: #687789; text-align: center; }
              footer { position: fixed; right: 0; bottom: 0; left: 0; padding: 4px 0; border-top: 1px solid #dce5ef; background: #fff; color: #7a8794; font-size: 8pt; text-align: center; }
              @media screen { body { max-width: 1100px; margin: 24px auto; padding: 0 20px; } }
            </style>
          </head>
          <body>
            <header class="masthead">
              <div><h1>ADMIN REPORT</h1><p>PMS Port Management System</p></div>
              <div class="scope">${reportScope}</div>
            </header>
            <section class="meta">
              <div><span>Administrator</span><strong>${adminName}</strong></div>
              <div><span>Assigned Boat</span><strong>${boatName}</strong></div>
              <div><span>Generated</span><strong>${generatedAt}</strong></div>
            </section>
            ${appliedFilters.length ? `
              <section class="filters"><strong>Applied Filters:</strong>${appliedFilters.map(escapeHtml).join(" · ")}</section>
            ` : ""}
            <h2>Report Summary</h2>
            <section class="summary">
              <div class="metric"><span>Total Bookings</span><strong>${summary.totalBookings}</strong></div>
              <div class="metric"><span>Total Revenue</span><strong>${formatReportCurrency(summary.totalRevenue)}</strong></div>
              <div class="metric"><span>Confirmed</span><strong>${summary.completedBookings}</strong></div>
              <div class="metric"><span>Pending</span><strong>${summary.pendingBookings}</strong></div>
              <div class="metric"><span>Cancelled</span><strong>${summary.cancelledBookings}</strong></div>
            </section>
            <h2>Booking Details</h2>
            ${summary.bookingsList.length ? `
              <table>
                <thead><tr><th>Reference #</th><th>Passenger</th><th>Route</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>${reportRows}</tbody>
              </table>
            ` : `<div class="empty">No bookings match the selected report filters.</div>`}
            <footer>PMS Port Management System · ${reportScope}</footer>
          </body>
        </html>
      `);
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
      printWindow.document.close();
    } catch (error) {
      console.error("Error printing report:", error);
    }
  };

  // Stat Card Component
  const StatCard = ({ title, value, color, subtitle }) => (
    <div style={{
      backgroundColor: "rgba(255,255,255,0.96)",
      borderRadius: isMobile ? "10px" : "12px",
      padding: isMobile ? "10px 8px" : "14px 16px",
      boxShadow: "0 3px 12px rgba(36, 76, 117, 0.06)",
      border: "1px solid #e0eaf4",
      borderTop: `3px solid ${color}`,
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "flex-start",
      minHeight: isMobile ? "84px" : "94px",
      width: "100%",
      boxSizing: "border-box",
    }}>
      <h4 style={{
        margin: isMobile ? "0 0 4px" : "0 0 5px",
        color: "#315170",
        fontSize: isMobile ? "0.62rem" : "0.78rem",
        fontWeight: 700,
        lineHeight: 1.3,
      }}>
        {title}
      </h4>
      <div style={{
        fontSize: isMobile ? "1rem" : "1.55rem",
        fontWeight: 900,
        color: color,
        margin: "0",
        lineHeight: "1.1",
        textAlign: "left",
        wordBreak: "break-word",
      }}>
        {value}
      </div>
      {subtitle ? (
        <div style={{
          marginTop: isMobile ? "4px" : "8px",
          fontSize: isMobile ? "0.56rem" : "0.7rem",
          color: "#748397",
          textAlign: "left",
        }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );

  return (
    <AdminLayout active="reports">
      {reportPreview && (
        <div
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeReportPreview();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isMobile ? 10 : 24,
            background: "rgba(0,0,0,0.55)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-report-preview-title"
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              maxWidth: 1050,
              maxHeight: "92vh",
              padding: isMobile ? 14 : 22,
              borderRadius: 12,
              background: "#fff",
              boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 14,
            }}>
              <div style={{ minWidth: 0 }}>
                <h2 id="admin-report-preview-title" style={{
                  margin: 0,
                  color: "#1e3a5f",
                  fontSize: isMobile ? "1rem" : "1.2rem",
                  fontWeight: 800,
                }}>
                  {reportPreview.format.toUpperCase()} Report Preview
                </h2>
                <p style={{
                  margin: "5px 0 0",
                  color: "#666",
                  fontSize: isMobile ? "0.75rem" : "0.85rem",
                  overflowWrap: "anywhere",
                }}>{reportPreview.filename}</p>
              </div>
              <button
                type="button"
                aria-label="Close report preview"
                onClick={closeReportPreview}
                style={{
                  flexShrink: 0,
                  border: "1px solid #d0d0d0",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#444",
                  padding: "5px 10px",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                }}
              >×</button>
            </div>
            {reportPreview.format === "pdf" ? (
              <iframe
                title="PDF report preview"
                src={reportPreview.url}
                style={{
                  width: "100%",
                  minHeight: isMobile ? "55vh" : "68vh",
                  border: "1px solid #dbe3eb",
                  borderRadius: 7,
                  background: "#f4f6f8",
                }}
              />
            ) : (
              <pre style={{
                boxSizing: "border-box",
                width: "100%",
                minHeight: isMobile ? "55vh" : "68vh",
                maxHeight: "68vh",
                overflow: "auto",
                margin: 0,
                padding: isMobile ? 10 : 16,
                border: "1px solid #dbe3eb",
                borderRadius: 7,
                background: "#f7f9fb",
                color: "#243447",
                fontSize: isMobile ? "0.68rem" : "0.8rem",
                lineHeight: 1.5,
                whiteSpace: "pre",
              }}>{reportPreview.content}</pre>
            )}
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 14,
            }}>
              <button
                type="button"
                onClick={closeReportPreview}
                style={{
                  padding: "9px 16px",
                  border: "1px solid #d0d0d0",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#444",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >Cancel</button>
              <button
                type="button"
                onClick={downloadReportPreview}
                style={{
                  padding: "9px 16px",
                  border: "none",
                  borderRadius: 6,
                  background: "#2196f3",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >{reportPreview.format === "pdf" ? "Save PDF" : "Download JSON"}</button>
            </div>
          </section>
        </div>
      )}
      <div style={{
        width: "100%",
        margin: 0,
        padding: 0,
        boxSizing: "border-box",
        overflowX: "hidden",
      }}>
        {/* Header */}
        <div style={{
          marginBottom: isMobile ? "18px" : "24px"
        }}>
          <h2 style={{
            fontSize: isMobile ? "1.2rem" : "1.5rem",
            fontWeight: "900",
            color: "#1a1a1a",
            margin: "0 0 8px 0",
            letterSpacing: "-0.5px"
          }}>
            Reports &amp; Analytics
          </h2>
          <p style={{
            fontSize: isMobile ? "0.9rem" : "1rem",
            color: "#666",
            margin: "0",
            fontWeight: "500",
            lineHeight: 1.5,
          }}>
            Monitor bookings, revenue, and port operations for {adminData?.assignedBoat || "your boat"}.
          </p>
        </div>

        {/* Metrics Section */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
          gap: isMobile ? "8px" : "12px",
          marginBottom: isMobile ? "18px" : "16px",
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
            value={bookings.length}
            subtitle="All bookings"
            color="#9c27b0"
          />
        </div>

        <section style={{
          marginBottom: isMobile ? "16px" : "12px",
          padding: isMobile ? "14px" : "16px",
          borderRadius: "12px",
          border: "1px solid #d5e5f5",
          background: "rgba(255,255,255,0.96)",
          boxShadow: "0 3px 12px rgba(36, 76, 117, 0.06)"
        }}>
          <h2 style={{
            margin: "0 0 14px",
            color: "#174a91",
            fontSize: isMobile ? "1rem" : "1.1rem",
            fontWeight: 800
          }}>
            Generate Report
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(150px, 1fr))",
            alignItems: "end",
            gap: isMobile ? "12px" : "16px"
          }}>
            <div style={{ gridColumn: isMobile ? "1 / -1" : "span 2", minWidth: 0 }}>
              <label style={{ display: "block", marginBottom: "7px", color: "#34516f", fontSize: "0.8rem", fontWeight: 700 }}>
                Report Period
              </label>
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: isMobile ? "center" : "flex-start",
                gap: isMobile ? "8px" : "7px",
              }}>
                {[
                  { value: "today", label: "Today" },
                  { value: "weekly", label: "Weekly" },
                  { value: "", label: "All Bookings" },
                  { value: "monthly", label: "This Month" },
                  { value: "lastMonth", label: "Last Month" },
                ].map((period) => (
                  <button
                    key={period.label}
                    type="button"
                    aria-pressed={reportPeriod === period.value && !filterDate}
                    onClick={() => {
                      setReportPeriod(period.value);
                      setFilterDate("");
                      setGeneratedReport(null);
                    }}
                    style={{
                      minHeight: isMobile ? "40px" : undefined,
                      padding: isMobile ? "8px 13px" : "8px 11px",
                      border: `1px solid ${reportPeriod === period.value && !filterDate ? "#1674c8" : "#cbd8e6"}`,
                      borderRadius: "7px",
                      background: reportPeriod === period.value && !filterDate ? "#1674c8" : "#fff",
                      color: reportPeriod === period.value && !filterDate ? "#fff" : "#34516f",
                      fontSize: isMobile ? "0.82rem" : "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ gridColumn: isMobile ? "1 / -1" : "auto", minWidth: 0 }}>
              <label htmlFor="admin-report-date" style={{ display: "block", marginBottom: "7px", color: "#34516f", fontSize: "0.8rem", fontWeight: 700 }}>
                Select Date
              </label>
              <input
                id="admin-report-date"
                type="date"
                value={filterDate}
                onChange={(event) => {
                  setFilterDate(event.target.value);
                  if (event.target.value) setReportPeriod("");
                  setGeneratedReport(null);
                }}
                style={{
                  boxSizing: "border-box",
                  width: "100%",
                  minWidth: 0,
                  height: "38px",
                  padding: "7px 9px",
                  border: "1px solid #cbd8e6",
                  borderRadius: "7px",
                  color: "#34516f",
                  background: "#fff"
                }}
              />
            </div>
            <div style={{ gridColumn: isMobile ? "1 / -1" : "auto", minWidth: 0 }}>
              <label htmlFor="admin-report-route" style={{ display: "block", marginBottom: "7px", color: "#34516f", fontSize: "0.8rem", fontWeight: 700 }}>
                Select Route
              </label>
              <select
                id="admin-report-route"
                value={filterRoute}
                onChange={(event) => {
                  setFilterRoute(event.target.value);
                  setGeneratedReport(null);
                }}
                style={{
                  boxSizing: "border-box",
                  width: "100%",
                  minWidth: 0,
                  height: "38px",
                  padding: "7px 9px",
                  border: "1px solid #cbd8e6",
                  borderRadius: "7px",
                  color: "#34516f",
                  background: "#fff"
                }}
              >
                <option value="">All Routes</option>
                {routeOptions.map((route) => <option key={route} value={route}>{route}</option>)}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setGeneratedReport({
                  bookings: [...filteredReportBookings],
                  summary: summarizeBookings(filteredReportBookings),
                  reportPeriod,
                  filterDate,
                  filterRoute,
                  filterLabel: reportFilterLabel,
                  generatedAt: new Date(),
                });
                document.getElementById("admin-report-export")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              style={{
                gridColumn: isMobile ? "1 / -1" : "auto",
                width: isMobile ? "100%" : "auto",
                minHeight: "38px",
                padding: "8px 16px",
                border: 0,
                borderRadius: "7px",
                background: "#0875cf",
                color: "#fff",
                fontSize: "0.82rem",
                fontWeight: 800,
                whiteSpace: "nowrap",
                cursor: "pointer"
              }}
            >
              Generate Report
            </button>
            {(reportPeriod || filterDate || filterRoute) && (
              <button
                type="button"
                onClick={() => {
                  setReportPeriod("");
                  setFilterDate("");
                  setFilterRoute("");
                  setGeneratedReport(null);
                }}
                style={{
                  gridColumn: isMobile ? "1 / -1" : "auto",
                  width: isMobile ? "100%" : "auto",
                  minHeight: "38px",
                  padding: "8px 14px",
                  border: "1px solid #d5dce5",
                  borderRadius: "7px",
                  background: "#fff",
                  color: "#526174",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </section>

        {/* Chart Section */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(auto-fit, minmax(320px, 1fr))",
          gap: isMobile ? "14px" : "12px",
          marginBottom: isMobile ? "16px" : "12px",
          alignItems: "stretch"
        }}>
        <section style={{
          backgroundColor: "rgba(255, 255, 255, 0.94)",
          border: "1px solid #dbe6f1",
          borderRadius: "12px",
          padding: isMobile ? "13px 12px" : "16px",
          boxShadow: "0 5px 18px rgba(36, 76, 117, 0.06)",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "12px",
          }}>
            <div>
              <h2 style={{
                margin: 0,
                color: "#182b49",
                fontSize: isMobile ? "0.95rem" : "0.98rem",
                fontWeight: 700,
              }}>
                Booking &amp; Revenue Trends
              </h2>
              <span style={{ display: "block", marginTop: "4px", color: "#8290a1", fontSize: "0.72rem" }}>
                {reportFilterLabel} · {adminData?.assignedBoat || "Assigned boat"}
              </span>
            </div>
          </div>
          <div style={{ position: "relative", height: isMobile ? "220px" : "255px" }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </section>
        <section style={{
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          padding: isMobile ? "13px 12px" : "16px",
          border: "1px solid #dbe6f1",
          borderRadius: "12px",
          backgroundColor: "rgba(255,255,255,0.96)",
          boxShadow: "0 5px 18px rgba(36, 76, 117, 0.06)"
        }}>
          <h2 style={{
            margin: "0 0 12px",
            color: "#182b49",
            fontSize: isMobile ? "0.95rem" : "0.98rem",
            fontWeight: 800
          }}>
            Bookings by Status
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(110px, 0.95fr) minmax(110px, 1fr)",
            alignItems: "center",
            gap: "12px",
            flex: 1
          }}>
            <div style={{ position: "relative", height: isMobile ? "160px" : "190px", minWidth: 0 }}>
              <Doughnut data={bookingStatusChartData} options={bookingStatusChartOptions} />
              <div style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                color: "#172b4d",
                fontWeight: 800,
                textAlign: "center"
              }}>
                <span style={{ fontSize: isMobile ? "1.25rem" : "1.5rem" }}>{filteredDashboardBookings.length}</span>
                <span style={{ fontSize: "0.72rem", fontWeight: 600 }}>Total<br />Bookings</span>
              </div>
            </div>
            <div style={{ display: "grid", gap: "14px" }}>
              {[
                { label: "Confirmed", count: bookingStatusSummary.confirmed, color: "#16b866" },
                { label: "Pending", count: bookingStatusSummary.pending, color: "#ffae00" },
                { label: "Cancelled", count: bookingStatusSummary.cancelled, color: "#f02d20" },
              ].map((item) => (
                <div key={item.label} style={{
                  display: "grid",
                  gridTemplateColumns: "12px minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: "8px",
                  color: "#34465d",
                  fontSize: isMobile ? "0.75rem" : "0.82rem",
                  fontWeight: 700
                }}>
                  <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: item.color }} />
                  <span>{item.label}</span>
                  <span>{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        </div>

        {/* Report Exports */}
        <div id="admin-report-export" style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: isMobile ? "14px" : "18px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
          overflow: "hidden",
        }}>
          <h2 style={{
            fontSize: isMobile ? "1rem" : "1.1rem",
            fontWeight: 800,
            color: "#174a91",
            margin: "0 0 14px"
          }}>
            Export Report
          </h2>
          <div style={{
            marginBottom: "14px",
            padding: "11px 13px",
            borderRadius: "8px",
            background: generatedReport ? "#eef8f1" : "#f4f7fa",
            color: generatedReport ? "#256b3a" : "#65758a",
            fontSize: isMobile ? "0.78rem" : "0.84rem",
            lineHeight: 1.5
          }}>
            {generatedReport
              ? `Generated report: ${generatedReport.filterLabel} · ${generatedReport.summary.totalBookings} booking${generatedReport.summary.totalBookings === 1 ? "" : "s"}. Print, JSON, and PDF will use this exact result.`
              : "Select your filters and click Generate Report. Print, JSON, and PDF will use the generated result."}
          </div>

          {/* Filter Section */}
          <div style={{
            display: "none",
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
                {generatedReport ? `Generated report: ${generatedReport.filterLabel}` : "Generate the report to enable export options."}
              </div>
            </div>
          </div>

          {/* Export Options Header */}
          <h3 style={{
            fontSize: isMobile ? "0.78rem" : "0.85rem",
            fontWeight: 500,
            color: "#718096",
            margin: "0 0 12px"
          }}>
            Preview the generated JSON or PDF before downloading or saving it. Print opens its own print preview.
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
            gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
            gap: isMobile ? "8px" : "12px"
          }}>
            <button
              type="button"
              onClick={printReport}
              disabled={!generatedReport}
              style={{
                padding: isMobile ? "10px 4px" : "11px 14px",
                backgroundColor: "#e6f0f8",
                border: "2px solid #4a8bd4",
                borderRadius: isMobile ? "9px" : "14px",
                color: "#4a8bd4",
                fontWeight: "600",
                cursor: generatedReport ? "pointer" : "not-allowed",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: isMobile ? "0.75rem" : "1rem",
                minHeight: isMobile ? "48px" : "auto",
                opacity: generatedReport ? 1 : 0.55,
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
              {!isMobile && <div style={{ fontSize: "0.72rem", opacity: "0.75" }}>Open print dialog</div>}
            </button>

            <button
              type="button"
              onClick={exportAsJSON}
              disabled={!generatedReport}
              style={{
                padding: isMobile ? "10px 4px" : "11px 14px",
                backgroundColor: "#f1f8f4",
                border: "2px solid #43a047",
                borderRadius: isMobile ? "9px" : "14px",
                color: "#43a047",
                fontWeight: "600",
                cursor: generatedReport ? "pointer" : "not-allowed",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: isMobile ? "0.75rem" : "1rem",
                minHeight: isMobile ? "48px" : "auto",
                opacity: generatedReport ? 1 : 0.55,
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
              {!isMobile && <div style={{ fontSize: "0.72rem", opacity: "0.75" }}>Export as JSON data</div>}
            </button>

            <button
              type="button"
              onClick={saveAsPDF}
              disabled={!generatedReport}
              style={{
                padding: isMobile ? "10px 4px" : "11px 14px",
                backgroundColor: "#fff3e0",
                border: "2px solid #fb8c00",
                borderRadius: isMobile ? "9px" : "14px",
                color: "#fb8c00",
                fontWeight: "600",
                cursor: generatedReport ? "pointer" : "not-allowed",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "center",
                fontSize: isMobile ? "0.75rem" : "1rem",
                minHeight: isMobile ? "48px" : "auto",
                opacity: generatedReport ? 1 : 0.55,
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
              {!isMobile && <div style={{ fontSize: "0.72rem", opacity: "0.75" }}>Download PDF report with filters</div>}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default AdminDashboard;
