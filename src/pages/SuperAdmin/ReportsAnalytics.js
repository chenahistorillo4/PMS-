import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import jsPDF from "jspdf";
import SuperadminLayout from "./SuperadminLayout";
import "./ReportsAnalytics.css";
import {
  buildReportFilterLabel,
  filterBookingsByPeriod,
  getBookingCreatedAt,
  getBookingTripDate,
  getBookingRouteLabel,
  attachPaymentStatuses,
  isReportableBooking,
  summarizeBookings,
} from "../../utils/reportHelpers";

function ReportsAnalytics() {
  const [boats, setBoats] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [reportPeriod, setReportPeriod] = useState("weekly");
  const [reportRoute, setReportRoute] = useState("all");
  const [boatRouteSelections, setBoatRouteSelections] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [reportPage, setReportPage] = useState(0);
  const reportGesture = useRef(null);
  const reportPageRefs = useRef([]);
  const [carouselHeight, setCarouselHeight] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);

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
        setBookings(attachPaymentStatuses(
          bookingsSnapshot.docs.map((bookingDoc) => ({
            id: bookingDoc.id,
            ...bookingDoc.data(),
          })),
          paymentsSnapshot.docs.map((paymentDoc) => paymentDoc.data())
        ));
      } catch (error) {
        console.error("Error fetching boat reports:", error);
        setErrorMessage("Unable to load boat reports right now.");
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, []);

  const searchedBoatNames = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return [];
    return boats
      .filter((boat) => boat.name?.toLowerCase().includes(normalizedSearch))
      .map((boat) => boat.name);
  }, [boats, searchTerm]);

  const reportableBookings = useMemo(
    () => bookings.filter(isReportableBooking),
    [bookings]
  );

  const filteredBookings = useMemo(
    () => filterBookingsByPeriod(reportableBookings, reportPeriod).filter((booking) => {
      if (reportRoute === "all" || searchedBoatNames.length === 0) return true;
      const boatName = booking.boat || "Unassigned boat";
      return !searchedBoatNames.includes(boatName) || getBookingRouteLabel(booking) === reportRoute;
    }),
    [reportableBookings, reportPeriod, reportRoute, searchedBoatNames]
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
      const selectedRoute = boatRouteSelections[boatName] || "all";
      if (selectedRoute !== "all" && getBookingRouteLabel(booking) !== selectedRoute) {
        return;
      }
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
        summary: summarizeBookings(boatBookings),
      }));
  }, [boats, filteredBookings, boatRouteSelections]);

  const totalSummary = useMemo(
    () => summarizeBookings(filteredBookings),
    [filteredBookings]
  );
  const visibleBoatReports = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return boatReports;
    return boatReports.filter((boatReport) => boatReport.name.toLowerCase().includes(normalizedSearch));
  }, [boatReports, searchTerm]);
  const boatRoutes = useMemo(() => {
    const routesByBoat = new Map();
    boats.forEach((boat) => {
      routesByBoat.set(boat.name, new Set(Array.isArray(boat.availableRoutes) ? boat.availableRoutes : [boat.route]));
    });
    return new Map([...routesByBoat.entries()].map(([boatName, routes]) => [
      boatName,
      [...routes].filter((route) => route && route !== "N/A").sort(),
    ]));
  }, [boats]);
  const searchedBoatRoutes = useMemo(() => {
    if (searchedBoatNames.length === 0) return [];
    return [...new Set(searchedBoatNames.flatMap((boatName) => boatRoutes.get(boatName) || []))].sort();
  }, [boatRoutes, searchedBoatNames]);

  useEffect(() => {
    if (reportRoute !== "all" && !searchedBoatRoutes.includes(reportRoute)) {
      setReportRoute("all");
    }
  }, [reportRoute, searchedBoatRoutes]);
  const dailyBoatReports = useMemo(() => {
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const currentDate = new Date();
    const dayOfWeek = currentDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(currentDate);
    weekStart.setDate(currentDate.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weekDays = dayNames.map((name, index) => {
      const start = new Date(weekStart);
      start.setDate(weekStart.getDate() + index);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { name, start, end };
    });
    const reportsByBoat = new Map();

    boats.forEach((boat) => {
      if (boat.name) {
        reportsByBoat.set(boat.name, weekDays.map(() => []));
      }
    });

    const routeBookings = reportableBookings.filter((booking) => {
      const boatName = booking.boat || "Unassigned boat";
      const selectedRoute = boatRouteSelections[boatName] || "all";
      return selectedRoute === "all" || getBookingRouteLabel(booking) === selectedRoute;
    });
    routeBookings.forEach((booking) => {
      const bookingDates = [getBookingCreatedAt(booking), getBookingTripDate(booking)].filter(Boolean);
      const dayIndex = weekDays.findIndex(({ start, end }) =>
        bookingDates.some((date) => date >= start && date <= end)
      );
      if (dayIndex === -1) return;
      const boatName = booking.boat || "Unassigned boat";
      if (!reportsByBoat.has(boatName)) {
        reportsByBoat.set(boatName, weekDays.map(() => []));
      }
      reportsByBoat.get(boatName)[dayIndex].push(booking);
    });

    return [...reportsByBoat.entries()]
      .sort(([firstName], [secondName]) => firstName.localeCompare(secondName))
      .map(([name, days]) => ({
        name,
        days: days.map((dayBookings, index) => ({
          name: weekDays[index].name,
          summary: summarizeBookings(dayBookings),
        })),
      }));
  }, [boats, reportableBookings, boatRouteSelections]);
  const visibleDailyBoatReports = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return dailyBoatReports;
    return dailyBoatReports.filter((boatReport) => boatReport.name.toLowerCase().includes(normalizedSearch));
  }, [dailyBoatReports, searchTerm]);
  const filterLabel = buildReportFilterLabel({ reportPeriod });
  const reportPageCount = 3;

  const changeReportPage = (direction) => {
    setReportPage((currentPage) => Math.max(0, Math.min(reportPageCount - 1, currentPage + direction)));
  };

  useLayoutEffect(() => {
    const activePage = reportPageRefs.current[reportPage];
    if (!activePage) return undefined;

    const updateCarouselHeight = () => {
      setCarouselHeight(activePage.scrollHeight);
    };

    updateCarouselHeight();
    const observer = new ResizeObserver(updateCarouselHeight);
    observer.observe(activePage);
    return () => observer.disconnect();
  }, [reportPage, loading, searchTerm, reportPeriod, reportRoute, boatRouteSelections, visibleDailyBoatReports, visibleBoatReports]);

  const getReportExportData = () => ({
    generatedAt: new Date().toISOString(),
    period: filterLabel,
    boatSearch: searchTerm || "All boats",
    overall: { bookings: totalSummary.totalBookings, revenue: totalSummary.totalRevenue },
    boats: visibleBoatReports.map(({ name, summary }) => ({
      name,
      bookings: summary.totalBookings,
      confirmed: summary.completedBookings,
      pending: summary.pendingBookings,
      cancelled: summary.cancelledBookings,
      revenue: summary.totalRevenue,
    })),
  });

  const exportAsJSON = () => {
    const blob = new Blob([JSON.stringify(getReportExportData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `boat-reports-${reportPeriod}-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveAsPDF = () => {
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
    addLine(`Overall: ${totalSummary.totalBookings} bookings | PHP ${Number(totalSummary.totalRevenue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, 10, [102, 102, 102]);
    visibleBoatReports.forEach((boatReport) => {
      addLine(boatReport.name, 13, [49, 93, 143]);
      addLine(`Bookings: ${boatReport.summary.totalBookings} | Confirmed: ${boatReport.summary.completedBookings} | Revenue: PHP ${Number(boatReport.summary.totalRevenue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, 9);
    });
    pdf.save(`boat-reports-${reportPeriod}-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const printReports = () => {
    const printWindow = window.open("", "", "height=700,width=1000");
    if (!printWindow) return;
    const sections = visibleBoatReports.map(({ name }) => {
      const selectedRoute = boatRouteSelections[name] || "all";
      const routes = selectedRoute === "all" ? (boatRoutes.get(name) || ["All routes"]) : [selectedRoute];
      const routeSections = routes.map((route) => {
        const routeBookings = filteredBookings.filter((booking) =>
          (booking.boat || "Unassigned boat") === name &&
          (route === "All routes" || getBookingRouteLabel(booking) === route)
        );
        const summary = summarizeBookings(routeBookings);
        return `<div class="route-section"><h3>${route}</h3><p>${summary.totalBookings} bookings | ${summary.completedBookings} confirmed | ${summary.pendingBookings} pending | PHP ${Number(summary.totalRevenue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p></div>`;
      }).join("");
      return `<section><h2>${name}</h2>${routeSections}</section>`;
    }).join("");
    printWindow.document.write(`<html><head><title>Boat Reports</title><style>body{font-family:Arial;margin:32px;color:#333}h1{color:#4a8bd4;border-bottom:2px solid #4a8bd4;padding-bottom:8px}h2{color:#315d8f;border-bottom:1px solid #ddd;padding-bottom:6px}h3{color:#666;margin-bottom:4px}.route-section{padding:8px 12px;margin:8px 0;background:#f5f9fd;border-left:3px solid #e4a454}section{page-break-inside:avoid;margin-top:20px}.meta{color:#666}</style></head><body><h1>Boat Reports</h1><p class="meta">${filterLabel} | ${searchTerm || "All boats"} | ${reportRoute === "all" ? "All routes" : reportRoute}</p><p><strong>Overall:</strong> ${totalSummary.totalBookings} bookings | PHP ${Number(totalSummary.totalRevenue || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>${sections}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <SuperadminLayout>
      <div className="reports-page">
        <div className="reports-header">
          <div>
            <h1 className="reports-title">Reports & Analytics</h1>
            <p className="reports-subtitle">Only paid bookings with a scanned passenger QR are included in performance and revenue totals.</p>
          </div>
        </div>

        <div className="reports-toolbar">
          <input
            className="reports-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search boat reports..."
            aria-label="Search boat reports"
          />
          <label className="reports-period-choice">
            <span>Report period</span>
            <select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)}>
              <option value="today">Today</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
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

        <div
          className="reports-carousel"
          style={carouselHeight ? { height: `${carouselHeight}px` } : undefined}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            reportGesture.current = {
              x: event.clientX,
              y: event.clientY,
              moved: false
            };
            setDragOffset(0);
          }}
          onPointerMove={(event) => {
            if (!reportGesture.current) return;
            const distanceX = event.clientX - reportGesture.current.x;
            const distanceY = event.clientY - reportGesture.current.y;
            if (Math.abs(distanceX) > Math.abs(distanceY) && Math.abs(distanceX) > 10) {
              reportGesture.current.moved = true;
              setDragOffset(distanceX);
              event.preventDefault();
            }
          }}
          onPointerUp={(event) => {
            if (!reportGesture.current) return;
            const distance = event.clientX - reportGesture.current.x;
            if (reportGesture.current.moved && Math.abs(distance) > 35) {
              changeReportPage(distance < 0 ? 1 : -1);
            }
            reportGesture.current = null;
            setDragOffset(0);
          }}
          onPointerCancel={() => {
            reportGesture.current = null;
            setDragOffset(0);
          }}
        >
          <div
            className="reports-carousel-track"
            style={{
              transform: `translateX(calc(-${reportPage * 100}% + ${dragOffset}px))`,
              transition: reportGesture.current ? "none" : undefined
            }}
          >
            <section className="reports-carousel-page" ref={(element) => { reportPageRefs.current[0] = element; }}>
        <div className="reports-overview">
          {[
            ["Total bookings", totalSummary.totalBookings],
            ["Confirmed", totalSummary.completedBookings],
            ["Cancelled", totalSummary.cancelledBookings],
            ["Revenue", `₱${totalSummary.totalRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`],
          ].map(([label, value]) => (
            <div className="reports-stat" key={label}>
              <span className="reports-stat-label">{label}</span>
              <strong className="reports-stat-value">{value}</strong>
            </div>
          ))}
        </div>

            </section>
            <section className="reports-carousel-page" ref={(element) => { reportPageRefs.current[1] = element; }}>
        <div className="reports-section-heading">
          <h2>Daily comparison per boat</h2>
          <span>Monday to Sunday · {visibleDailyBoatReports.length} boat{visibleDailyBoatReports.length !== 1 ? "s" : ""}</span>
        </div>

        {loading && <p style={{ color: "#667085" }}>Loading boat reports...</p>}
        {!loading && errorMessage && <p style={{ color: "#c62828" }}>{errorMessage}</p>}
        {!loading && !errorMessage && dailyBoatReports.length === 0 && (
          <div className="reports-empty">No boats or bookings found.</div>
        )}
        <div className="boat-analytics-grid">
          {visibleDailyBoatReports.map((boatReport) => {
            const maxBookings = Math.max(...boatReport.days.map((day) => day.summary.totalBookings), 1);
            const maxRevenue = Math.max(...boatReport.days.map((day) => day.summary.totalRevenue), 1);
            return (
              <div className="analytics-card" key={boatReport.name}>
                <div className="analytics-card-heading">
                  <div>
                    <p className="reports-eyebrow">Monday to Sunday</p>
                    <h2>{boatReport.name}</h2>
                  </div>
                  <div>
                    <select
                      value={boatRouteSelections[boatReport.name] || "all"}
                      onChange={(event) => setBoatRouteSelections((current) => ({
                        ...current,
                        [boatReport.name]: event.target.value,
                      }))}
                      aria-label={`Route for ${boatReport.name}`}
                      className="boat-route-select"
                    >
                      <option value="all">All routes</option>
                      {(boatRoutes.get(boatReport.name) || []).map((route) => (
                        <option key={route} value={route}>{route}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="analytics-legend">
                  <span><i className="legend-swatch bookings" />Bookings</span>
                  <span><i className="legend-swatch revenue" />Revenue</span>
                </div>
                <div className="analytics-days">
                  {boatReport.days.map((day) => (
                    <div className="analytics-day-row" key={day.name}>
                      <span className="analytics-day-label">{day.name.slice(0, 3)}</span>
                      <div className="analytics-series">
                        <div className="analytics-series-track"><div className="analytics-bar-fill bookings" style={{ width: `${(day.summary.totalBookings / maxBookings) * 100}%` }} /></div>
                        <strong>{day.summary.totalBookings}</strong>
                      </div>
                      <div className="analytics-series">
                        <div className="analytics-series-track"><div className="analytics-bar-fill revenue" style={{ width: `${(day.summary.totalRevenue / maxRevenue) * 100}%` }} /></div>
                        <strong>₱{Number(day.summary.totalRevenue).toLocaleString("en-PH", { maximumFractionDigits: 0 })}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

            </section>
            <section className="reports-carousel-page" ref={(element) => { reportPageRefs.current[2] = element; }}>
        <div className="reports-section-heading">
          <h2>Boat performance</h2>
          <span>{filterLabel} · {visibleBoatReports.length} boat{visibleBoatReports.length !== 1 ? "s" : ""}</span>
        </div>

        {loading && <p style={{ color: "#667085" }}>Loading boat reports...</p>}
        {!loading && errorMessage && <p style={{ color: "#c62828" }}>{errorMessage}</p>}
        {!loading && !errorMessage && boatReports.length === 0 && (
          <div className="reports-empty">No boats or bookings found.</div>
        )}
        {!loading && !errorMessage && visibleBoatReports.map((boatReport) => (
          <div className="boat-aggregate-report" key={boatReport.name}>
            <div>
              <h3>{boatReport.name}</h3>
              <span>{filterLabel}</span>
            </div>
            <div className="boat-aggregate-stats">
              <select
                value={boatRouteSelections[boatReport.name] || "all"}
                onChange={(event) => setBoatRouteSelections((current) => ({
                  ...current,
                  [boatReport.name]: event.target.value,
                }))}
                aria-label={`Route summary for ${boatReport.name}`}
                className="boat-route-select"
              >
                <option value="all">All routes</option>
                {(boatRoutes.get(boatReport.name) || []).map((route) => (
                  <option key={route} value={route}>{route}</option>
                ))}
              </select>
              <span><strong>{boatReport.summary.totalBookings}</strong> bookings</span>
              <span><strong>{boatReport.summary.completedBookings}</strong> confirmed</span>
              <span><strong>₱{boatReport.summary.totalRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong> revenue</span>
            </div>
          </div>
        ))}
        {!loading && !errorMessage && boatReports.length > 0 && visibleBoatReports.length === 0 && (
          <div className="reports-empty">No boat reports match your search.</div>
        )}
            </section>
          </div>
        </div>
        <div className="reports-carousel-dots" aria-label="Report pages">
          {["Overview", "Daily comparison", "Boat performance"].map((label, index) => (
            <button
              type="button"
              key={label}
              className={`reports-carousel-dot${reportPage === index ? " active" : ""}`}
              onClick={() => setReportPage(index)}
              aria-label={`Go to ${label}`}
              aria-current={reportPage === index ? "page" : undefined}
            />
          ))}
        </div>

      </div>
    </SuperadminLayout>
  );
}

export default ReportsAnalytics;
