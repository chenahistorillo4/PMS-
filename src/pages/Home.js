import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

function Home({ user }) {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Scroll to top on mount
  useEffect(() => {
    const contentElement = document.getElementById('home-page-content');
    if (contentElement) {
      contentElement.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleBookClick = () => {
    if (!user) {
      alert("You need to log in first.");
      navigate("/login");
    } else {
      navigate("/booking");
    }
  };

  const handleManageClick = () => {
    if (!user) {
      alert("You need to log in first.");
      navigate("/login");
    } else {
      navigate("/manage");
    }
  };

  return (
    <div id="home-page-content" className="home-page" style={{ paddingTop: isMobile ? "68px" : "0" }}>
      <section
        className="text-center text-white hero-section home-hero-section"
        style={{
          backgroundImage: "url('/homebg.png')",
          backgroundSize: isMobile ? "cover" : "100% 100%",
          backgroundPosition: isMobile ? "right center" : "center",
          backgroundRepeat: "no-repeat",
          minHeight: isMobile ? "auto" : "auto",
          height: isMobile ? "52vh" : "auto",
          width: "100%",
          padding: isMobile ? "42px 12px" : "80px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundAttachment: isMobile ? "scroll" : "scroll"
        }}
      >
        <div 
          className="container home-hero-content"
          style={{
            backgroundColor: "transparent",
            padding: isMobile ? "18px 10px" : "0",
            borderRadius: isMobile ? "12px" : "0",
            backdropFilter: "none"
          }}
        >
          <h1
            className="fw-bold mb-3 home-hero-title"
            style={{
              fontSize: isMobile ? "1.55rem" : "clamp(2rem, 8vw, 3.5rem)",
              color: "#111",
              textShadow: "1px 1px 2px rgba(255,255,255,0.35)",
              marginBottom: isMobile ? "6px" : "12px"
            }}
          >
            PMS Port
          </h1>
          <p
            className="lead mb-2 home-hero-route"
            style={{
              fontSize: isMobile ? "0.78rem" : "clamp(1rem, 4vw, 1.3rem)",
              color: "#111",
              textShadow: "1px 1px 2px rgba(255,255,255,0.35)",
              marginBottom: isMobile ? "4px" : "8px"
            }}
          >
            Pinamalayan-Marinduque-Sibale Ferry
          </p>
          <p
            className="mb-4 home-hero-description"
            style={{
              fontSize: isMobile ? "0.72rem" : "clamp(0.9rem, 3vw, 1.1rem)",
              color: "#111",
              textShadow: "1px 1px 2px rgba(255,255,255,0.35)",
              marginBottom: isMobile ? "14px" : "24px",
              lineHeight: isMobile ? "1.2" : "1.5"
            }}
          >
            Online Reservation & Ticketing System with QR Boarding Pass
          </p>

          <div 
            className="d-flex flex-wrap justify-content-center gap-3 home-hero-actions"
            style={{
              maxWidth: isMobile ? "100%" : "auto",
              gap: isMobile ? "8px" : "12px"
            }}
          >
            <button
              onClick={handleBookClick}
              className="btn btn-light btn-lg home-hero-button"
              style={{
                padding: isMobile ? "8px 16px" : "12px 32px",
                fontSize: isMobile ? "0.74rem" : "1rem",
                fontWeight: "600",
                borderRadius: "8px",
                transition: "all 0.3s ease"
              }}
            >
              Book Your Ticket
            </button>

            <button
              onClick={handleManageClick}
              className="btn btn-outline-light btn-lg home-hero-button"
              style={{
                padding: isMobile ? "8px 16px" : "12px 32px",
                fontSize: isMobile ? "0.74rem" : "1rem",
                fontWeight: "600",
                color: "#111",
                borderRadius: "8px",
                transition: "all 0.3s ease"
              }}
            >
              Manage Booking
            </button>
          </div>
        </div>
      </section>

      <section className="container mt-5">
        <h2 
          className="fw-bold text-center mb-4" 
          style={{
            fontSize: isMobile ? "1.2rem" : "2rem",
            transition: "font-size 0.3s ease"
          }}
        >
          Why Choose PMS Ferry?
        </h2>
        <div className="row text-center">
          <div className="col-md-4">
            <div className="card shadow-sm p-3 rounded">
              <h5 
                className="fw-bold"
                style={{
                  fontSize: isMobile ? "0.8rem" : "1.1rem",
                  transition: "font-size 0.3s ease"
                }}
              >
                Real-Time Schedule
              </h5>
              <p
                style={{
                  fontSize: isMobile ? "0.7rem" : "0.95rem",
                  transition: "font-size 0.3s ease"
                }}
              >
                View updated ferry schedules instantly.
              </p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card shadow-sm p-3 rounded">
              <h5 
                className="fw-bold"
                style={{
                  fontSize: isMobile ? "0.8rem" : "1.1rem",
                  transition: "font-size 0.3s ease"
                }}
              >
                QR Boarding Pass
              </h5>
              <p
                style={{
                  fontSize: isMobile ? "0.7rem" : "0.95rem",
                  transition: "font-size 0.3s ease"
                }}
              >
                Scan your ticket with ease at the port.
              </p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card shadow-sm p-3 rounded">
              <h5 
                className="fw-bold"
                style={{
                  fontSize: isMobile ? "0.8rem" : "1.1rem",
                  transition: "font-size 0.3s ease"
                }}
              >
                Manage Bookings
              </h5>
              <p
                style={{
                  fontSize: isMobile ? "0.7rem" : "0.95rem",
                  transition: "font-size 0.3s ease"
                }}
              >
                Update or cancel your reservations anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section 
        className="text-center mt-5"
        style={{
          padding: isMobile ? "14px 12px" : "30px 20px"
        }}
      >
        <h4 
          className="fw-bold"
          style={{
            fontSize: isMobile ? "1rem" : "1.5rem",
            transition: "font-size 0.3s ease",
            marginBottom: isMobile ? "6px" : "15px"
          }}
        >
          Book Your Ferry Ticket
        </h4>
        <p
          style={{
            fontSize: isMobile ? "0.72rem" : "1rem",
            transition: "font-size 0.3s ease",
            color: "#666"
          }}
        >
          Select your route, date, and passenger details
        </p>
      </section>

      <footer className="bg-dark text-light text-center py-3 mt-5">
        <p>&copy; 2026 PMS Port</p>
      </footer>
    </div>
  );
}

export default Home;
