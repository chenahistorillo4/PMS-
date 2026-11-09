import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import jsPDF from "jspdf";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import { Line } from "react-chartjs-2";
import { FiBookOpen, FiCheckCircle, FiDollarSign, FiXCircle } from "react-icons/fi";
import SuperadminLayout from "./SuperadminLayout";
import "./ReportsAnalytics.css";
import {
  buildReportFilterLabel,
  filterBookingsByPeriod,
  getBookingCreatedAt,
  getBookingTripDate,
  getBookingRouteLabel,
  getBookingAmount,
  getPeriodRange,
  isGcashBooking,
  isPayLaterBooking,
  attachPaymentStatuses,
  summarizeBookings,
} from "../../utils/reportHelpers";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

function normalizeBoatSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’;,.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPaidReportBooking(booking) {
  const paymentStatus = String(booking.paymentStatus || "").toLowerCase();
  const paymongoStatus = String(booking.paymongoStatus || "").toLowerCase();
  return ["paid", "completed", "confirmed"].includes(paymentStatus) || paymongoStatus === "paid";
}

function summarizeReportBookings(items) {
  const summary = summarizeBookings(items);
  const paidItems = items.filter(isPaidReportBooking);
  summary.totalRevenue = summarizeBookings(paidItems).totalRevenue;
  return summary;
}

function ReportsAnalytics() {
  const [boats, setBoats] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [reportPeriod, setReportPeriod] = useState("weekly");
  const [reportRoute, setReportRoute] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBoatName, setSelectedBoatName] = useState("");
  const [reportPreview, setReportPreview] = useState(null);

  useEffect(() => {
    const fetchReportData = async () => {
      try {
        const [boatsSnapshot, bookingsSnapshot, paymentsSnapshot] = await Promise.all([
          getDocs(collection(db, "boats")),
          getDocs(collection(db, "bookings")),
          getDocs(collection(db, "payments")),
        ]);

        setBoats(boatsSnapshot.docs.map((boatDoc) => ({
          id: boatDoc.id,
          ...boatDoc.data(),
        })));
        const bookingData = bookingsSnapshot.docs.map((bookingDoc) => ({
          id: bookingDoc.id,
          ...bookingDoc.data(),
        }));
        setBookings(attachPaymentStatuses(
          bookingData,
          paymentsSnapshot.docs.map((paymentDoc) => ({
            id: paymentDoc.id,
            ...paymentDoc.data(),
          }))
        ));
      } catch (error) {
        console.error("Error fetching boat reports:", error);
      }
    };

    fetchReportData();
  }, []);

  const searchedBoatNames = useMemo(() => {
    const normalizedSearch = normalizeBoatSearch(searchTerm);
    if (!normalizedSearch) return [];
    if (selectedBoatName) {
      return boats
        .filter((boat) => normalizeBoatSearch(boat.name) === normalizeBoatSearch(selectedBoatName))
        .map((boat) => boat.name);
    }
    return boats
      .filter((boat) => normalizeBoatSearch(boat.name).includes(normalizedSearch))
      .map((boat) => boat.name);
  }, [boats, searchTerm, selectedBoatName]);
  const boatSuggestions = useMemo(() => {
    const normalizedSearch = normalizeBoatSearch(searchTerm);
    if (!normalizedSearch) return boats.filter((boat) => boat.name).slice(0, 8);
    return boats
      .filter((boat) => normalizeBoatSearch(boat.name).includes(normalizedSearch))
      .slice(0, 8);
  }, [boats, searchTerm]);

  const reportableBookings = useMemo(
    () => bookings.filter((booking) => !["failed"].includes(String(booking.status || "").toLowerCase())),
    [bookings]
  );

  const allRoutes = useMemo(
    () => [...new Set(boats.flatMap((boat) => (
      Array.isArray(boat.availableRoutes) ? boat.availableRoutes : []
    )).filter((route) => route && route !== "N/A"))].sort(),
    [boats]
  );
  const hasBoatFilter = normalizeBoatSearch(searchTerm).length > 0 || reportRoute !== "all";
  const normalizedSearch = normalizeBoatSearch(searchTerm);
  const selectedBoatNames = normalizedSearch
    ? searchedBoatNames
    : boats.map((boat) => boat.name).filter(Boolean);
  const filteredBookings = useMemo(
    () => filterBookingsByPeriod(reportableBookings, reportPeriod).filter((booking) => {
      const boatName = booking.boat || "Unassigned boat";
      const matchesBoat = !normalizedSearch
        || selectedBoatNames.some((name) => normalizeBoatSearch(name) === normalizeBoatSearch(boatName));
      const matchesRoute = reportRoute === "all" || getBookingRouteLabel(booking) === reportRoute;
      return matchesBoat && matchesRoute;
    }),
    [normalizedSearch, reportableBookings, reportPeriod, reportRoute, selectedBoatNames]
  );

  const boatReports = useMemo(() => {
    const reportsByBoat = new Map();

    boats.forEach((boat) => {
      if (boat.name) {
        reportsByBoat.set(boat.name, []);
      }
    });

    filteredBookings.forEach((booking) => {
      const boatName = booking.boat || "Unassigned boat";
        if (!reportsByBoat.has(boatName)) {
        reportsByBoat.set(boatName, []);
      }
      reportsByBoat.get(boatName).push(booking);
    });

    return [...reportsByBoat.entries()]
      .sort(([firstName], [secondName]) => firstName.localeCompare(secondName))
      .map(([name, boatBookings]) => ({
        name,
        bookings: boatBookings,
        summary: summarizeReportBookings(boatBookings),
      }));
  }, [boats, filteredBookings]);

  const overallBookings = useMemo(
    () => filterBookingsByPeriod(reportableBookings, reportPeriod),
    [reportableBookings, reportPeriod]
  );
  const reportScopeBookings = hasBoatFilter ? filteredBookings : overallBookings;
  const reportScopeSummary = useMemo(
    () => summarizeReportBookings(reportScopeBookings),
    [reportScopeBookings]
  );
  const trendData = useMemo(() => {
    const range = getPeriodRange(reportPeriod);
    const isCalendarMonth = reportPeriod === "monthly" || reportPeriod === "lastMonth";
    const dayCount = reportPeriod === "today"
      ? 1
      : isCalendarMonth
        ? new Date(range.start.getFullYear(), range.start.getMonth() + 1, 0).getDate()
        : 7;
    const days = Array.from({ length: dayCount }, (_, index) => {
      if (isCalendarMonth) {
        return new Date(range.start.getFullYear(), range.start.getMonth(), index + 1);
      }
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (dayCount - 1 - index));
      return date;
    });
    const formatDate = (date) => date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    const bookingsByDay = days.map((day) => reportScopeBookings.filter((booking) => {
      return [getBookingCreatedAt(booking), getBookingTripDate(booking)]
        .filter(Boolean)
        .some((date) => date.toDateString() === day.toDateString());
    }));
    const payLaterAmountsByDay = bookingsByDay.map((dayBookings) =>
      dayBookings.filter((booking) => {
        const status = String(booking.status || "").toLowerCase();
        return isPayLaterBooking(booking) &&
          !["cancelled", "canceled", "failed"].includes(status);
      }).reduce((total, booking) => total + getBookingAmount(booking), 0)
    );

    return {
      labels: days.map(formatDate),
      datasets: [
        {
          label: "Bookings",
          data: bookingsByDay.map((dayBookings) => dayBookings.length),
          borderColor: "#2f78bd",
          backgroundColor: "rgba(47, 120, 189, 0.12)",
          pointBackgroundColor: "#2f78bd",
          pointRadius: 4,
          tension: 0.35,
          yAxisID: "y",
          fill: true,
        },
        {
          label: "GCash Revenue",
          data: bookingsByDay.map((dayBookings) => dayBookings
            .filter((booking) => isGcashBooking(booking) && isPaidReportBooking(booking))
            .reduce((total, booking) => total + getBookingAmount(booking), 0)),
          borderColor: "#e4a454",
          backgroundColor: "rgba(228, 164, 84, 0.08)",
          pointBackgroundColor: "#e4a454",
          pointRadius: 4,
          tension: 0.35,
          yAxisID: "revenue",
        },
        {
          label: "PayLater Amount",
          data: payLaterAmountsByDay,
          borderColor: "#7e57c2",
          backgroundColor: "rgba(126, 87, 194, 0.1)",
          pointBackgroundColor: "#7e57c2",
          pointRadius: 4,
          tension: 0.35,
          yAxisID: "revenue",
        },
      ],
    };
  }, [reportPeriod, reportScopeBookings]);
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top", align: "end", labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          label: (context) => ["GCash Revenue", "PayLater Amount"].includes(context.dataset.label)
            ? ` ${context.dataset.label}: ₱${Number(context.parsed.y || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
            : ` ${context.dataset.label}: ${context.parsed.y}`,
        },
      },
    },
    scales: {
      y: { beginAtZero: true, title: { display: true, text: "Bookings" }, grid: { color: "#e7eef5" } },
      revenue: {
        beginAtZero: true,
        position: "right",
        title: { display: true, text: "Revenue (PHP)" },
        grid: { drawOnChartArea: false },
      },
      x: { grid: { display: false } },
    },
  }), []);
  const visibleBoatReports = useMemo(() => {
    const normalizedSearch = normalizeBoatSearch(searchTerm);
    return boatReports.filter((boatReport) => {
      const matchesSearch = !normalizedSearch || normalizeBoatSearch(boatReport.name).includes(normalizedSearch);
      const matchesRoute = reportRoute === "all" || boatReport.summary.totalBookings > 0;
      return matchesSearch && matchesRoute;
    });
  }, [boatReports, reportRoute, searchTerm]);
  const boatRoutes = useMemo(() => {
    const routesByBoat = new Map();
    boats.forEach((boat) => {
      routesByBoat.set(boat.name, new Set(
        Array.isArray(boat.availableRoutes) ? boat.availableRoutes : []
      ));
    });
    return new Map([...routesByBoat.entries()].map(([boatName, routes]) => [
      boatName,
      [...routes].filter((route) => route && route !== "N/A").sort(),
    ]));
  }, [boats]);
  const searchedBoatRoutes = useMemo(() => {
    if (!normalizedSearch) return allRoutes;
    return [...new Set(searchedBoatNames.flatMap((boatName) => boatRoutes.get(boatName) || []))].sort();
  }, [allRoutes, boatRoutes, normalizedSearch, searchedBoatNames]);

  useEffect(() => {
    if (reportRoute !== "all" && !searchedBoatRoutes.includes(reportRoute)) {
      setReportRoute("all");
    }
  }, [reportRoute, searchedBoatRoutes]);
  const filterLabel = buildReportFilterLabel({ reportPeriod });

  const getReportExportData = () => ({
    generatedAt: new Date().toISOString(),
    period: filterLabel,
    boatSearch: searchTerm || "All boats",
    overall: {
      bookings: reportScopeSummary.totalBookings,
      confirmed: reportScopeSummary.completedBookings,
      cancelled: reportScopeSummary.cancelledBookings,
      revenue: reportScopeSummary.totalRevenue,
    },
    routes: reportRoute === "all" ? "All routes" : reportRoute,
    boats: visibleBoatReports.map(({ name, summary }) => ({
      name,
      bookings: summary.totalBookings,
      confirmed: summary.completedBookings,
      pending: summary.pendingBookings,
      cancelled: summary.cancelledBookings,
      revenue: summary.totalRevenue,
    })),
  });

  const closeReportPreview = () => {
    if (reportPreview?.url) {
      setTimeout(() => URL.revokeObjectURL(reportPreview.url), 1000);
    }
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

  const exportAsJSON = () => {
    try {
      const content = JSON.stringify(getReportExportData(), null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      if (reportPreview?.url) URL.revokeObjectURL(reportPreview.url);
      setReportPreview({
        format: "json",
        filename: `reports-${searchTerm.trim() || "all-boats"}-${reportPeriod}-${new Date().toISOString().split("T")[0]}.json`,
        url,
        content,
      });
    } catch (error) {
      console.error("Error preparing JSON report preview:", error);
      alert("Failed to prepare JSON report preview. Please try again.");
    }
  };

  const saveAsPDF = () => {
    try {
      const pdf = new jsPDF();
      let yPosition = 18;
      const addLine = (text, size = 10, color = [51, 51, 51]) => {
        if (yPosition > 280) {
          pdf.addPage();
          yPosition = 18;
        }
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        pdf.text(String(text), 15, yPosition);
        yPosition += 6;
      };
      addLine("PMS Port - Boat Reports", 18, [47, 120, 189]);
      addLine(`Period: ${filterLabel}`);
      addLine(`Overall: ${reportScopeSummary.totalBookings} bookings | PHP ${Number(reportScopeSummary.totalRevenue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, 10, [102, 102, 102]);
      visibleBoatReports.forEach((boatReport) => {
        addLine(boatReport.name, 13, [49, 93, 143]);
        addLine(`Bookings: ${boatReport.summary.totalBookings} | Confirmed: ${boatReport.summary.completedBookings} | Revenue: PHP ${Number(boatReport.summary.totalRevenue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, 9);
      });
      const url = URL.createObjectURL(pdf.output("blob"));
      if (reportPreview?.url) URL.revokeObjectURL(reportPreview.url);
      setReportPreview({
        format: "pdf",
        filename: `reports-${searchTerm.trim() || "all-boats"}-${reportPeriod}-${new Date().toISOString().split("T")[0]}.pdf`,
        url,
      });
    } catch (error) {
      console.error("Error preparing PDF report preview:", error);
      alert("Failed to prepare PDF report preview. Please try again.");
    }
  };

  const printReports = () => {
    const printWindow = window.open("", "", "height=700,width=1000");
    if (!printWindow) return;
    const sections = visibleBoatReports.map(({ name }) => {
      const selectedRoute = reportRoute;
      const routes = selectedRoute === "all" ? (boatRoutes.get(name) || ["All routes"]) : [selectedRoute];
      const routeSections = routes.map((route) => {
        const routeBookings = filteredBookings.filter((booking) =>
          (booking.boat || "Unassigned boat") === name &&
          (route === "All routes" || getBookingRouteLabel(booking) === route)
        );
        const summary = summarizeReportBookings(routeBookings);
        return `<div class="route-section"><h3>${route}</h3><p>${summary.totalBookings} bookings | ${summary.completedBookings} confirmed | ${summary.pendingBookings} pending | PHP ${Number(summary.totalRevenue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p></div>`;
      }).join("");
      return `<section><h2>${name}</h2>${routeSections}</section>`;
    }).join("");
    printWindow.document.write(`<html><head><title>Reports & Analytics</title><style>body{font-family:Arial;margin:32px;color:#333}h1{color:#4a8bd4;border-bottom:2px solid #4a8bd4;padding-bottom:8px}h2{color:#315d8f;border-bottom:1px solid #ddd;padding-bottom:6px}h3{color:#666;margin-bottom:4px}.route-section{padding:8px 12px;margin:8px 0;background:#f5f9fd;border-left:3px solid #e4a454}section{page-break-inside:avoid;margin-top:20px}.meta{color:#666}</style></head><body><h1>Reports & Analytics</h1><p class="meta">${filterLabel} | ${searchTerm || "All boats"} | ${reportRoute === "all" ? "All routes" : reportRoute}</p><p><strong>Overall:</strong> ${reportScopeSummary.totalBookings} bookings | PHP ${Number(reportScopeSummary.totalRevenue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>${sections}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <SuperadminLayout>
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
            padding: "clamp(10px, 3vw, 24px)",
            background: "rgba(0,0,0,0.55)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="superadmin-report-preview-title"
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              maxWidth: 1050,
              maxHeight: "92vh",
              padding: "clamp(14px, 3vw, 22px)",
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
                <h2 id="superadmin-report-preview-title" style={{
                  margin: 0,
                  color: "#1e3a5f",
                  fontSize: "clamp(1rem, 3vw, 1.2rem)",
                  fontWeight: 800,
                }}>
                  {reportPreview.format.toUpperCase()} Report Preview
                </h2>
                <p style={{
                  margin: "5px 0 0",
                  color: "#666",
                  fontSize: "0.85rem",
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
                  minHeight: "min(68vh, 700px)",
                  border: "1px solid #dbe3eb",
                  borderRadius: 7,
                  background: "#f4f6f8",
                }}
              />
            ) : (
              <pre style={{
                boxSizing: "border-box",
                width: "100%",
                minHeight: "min(68vh, 700px)",
                maxHeight: "68vh",
                overflow: "auto",
                margin: 0,
                padding: "clamp(10px, 2vw, 16px)",
                border: "1px solid #dbe3eb",
                borderRadius: 7,
                background: "#f7f9fb",
                color: "#243447",
                fontSize: "clamp(0.68rem, 1.5vw, 0.8rem)",
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
      <div className="reports-page">
        <div className="reports-header">
          <div>
            <h1 className="reports-title">Reports & Analytics</h1>
            <p className="reports-subtitle">Only paid bookings with a scanned passenger QR are included in performance and revenue totals.</p>
          </div>
        </div>

        <div className="reports-toolbar">
          <div className="reports-search-wrapper">
            <input
              className="reports-search"
              type="search"
              value={searchTerm}
              onChange={(event) => {
                setSelectedBoatName("");
                setSearchTerm(event.target.value);
              }}
              placeholder="Search boat reports..."
              aria-label="Search boat reports"
              autoComplete="off"
            />
            {searchTerm.trim() && !selectedBoatName && boatSuggestions.length > 0 && (
              <div className="reports-search-suggestions" role="listbox" aria-label="Possible boats">
                {boatSuggestions.map((boat) => (
                  <button
                    type="button"
                    key={boat.id || boat.name}
                    className="reports-search-suggestion"
                    onClick={() => {
                      setSearchTerm(boat.name);
                      setSelectedBoatName(boat.name);
                    }}
                  >
                    <strong>{boat.name}</strong>
                    <span>{boat.route || (Array.isArray(boat.availableRoutes) ? boat.availableRoutes[0] : "All routes")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="reports-period-choice">
            <span>Report period</span>
            <select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)}>
              <option value="today">Today</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="lastMonth">Last month</option>
            </select>
          </label>
          <label className="reports-period-choice">
            <span>Route</span>
            <select value={reportRoute} onChange={(event) => setReportRoute(event.target.value)}>
              <option value="all">All routes</option>
              {searchedBoatRoutes.map((route) => <option key={route} value={route}>{route}</option>)}
            </select>
          </label>
          <div className="reports-export-actions">
            <button type="button" onClick={printReports} className="reports-print-button">Print Reports</button>
            <button type="button" onClick={exportAsJSON} className="reports-export-button">Download JSON</button>
            <button type="button" onClick={saveAsPDF} className="reports-export-button pdf">Download PDF</button>
          </div>
        </div>

        <div className="reports-sections">
            <section className="reports-section">
        <div className="report-context">
          <strong>{selectedBoatName || (hasBoatFilter ? searchTerm : "All boats")}</strong>
          <span>{filterLabel} · {reportRoute === "all" ? "All routes" : reportRoute}</span>
        </div>
        <div className="reports-overview">
          {[
            ["Total bookings", reportScopeSummary.totalBookings, hasBoatFilter ? "selected boats" : "all boats", "bookings"],
            ["Confirmed", reportScopeSummary.completedBookings, "completed bookings", "ferries"],
            ["Cancelled", reportScopeSummary.cancelledBookings, "cancelled bookings", "pending"],
            ["Paid revenue", `₱${reportScopeSummary.totalRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, "from reportable bookings", "revenue"],
          ].map(([label, value, caption, tone]) => (
            <div className={`reports-stat reports-stat-${tone}`} key={label}>
              <span className="reports-stat-icon" aria-hidden="true">
                {tone === "bookings" ? <FiBookOpen /> : tone === "ferries" ? <FiCheckCircle /> : tone === "pending" ? <FiXCircle /> : <FiDollarSign />}
              </span>
              <span className="reports-stat-label">{label}</span>
              <strong className="reports-stat-value">{value}</strong>
              <small>{caption}</small>
            </div>
          ))}
        </div>
        <div className="overview-dashboard-grid">
          <div className="overview-panel overview-chart-panel">
            <div className="overview-panel-heading">
              <div>
                <h3>Booking &amp; Revenue Trends</h3>
                <span>{filterLabel} · {selectedBoatName || (hasBoatFilter ? searchTerm : "all boats")}</span>
              </div>
            </div>
            <div className="overview-chart">
              <Line data={trendData} options={chartOptions} />
            </div>
          </div>
        </div>

            </section>
        </div>

      </div>
    </SuperadminLayout>
  );
}

export default ReportsAnalytics;
