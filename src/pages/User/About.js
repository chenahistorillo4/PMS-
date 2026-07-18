import { useState, useEffect } from "react";

const INFO_CARDS = [
  {
    id: "1",
    title: "Who We Are",
    description:
      "PMS Port is a modern ferry reservation and ticketing system designed for the routes Pinamalayan - Marinduque - Sibale.",
    image: "/pic5.jpg",
    alt: "Who We Are"
  },
  {
    id: "2",
    title: "Our Mission",
    description:
      "To provide a reliable, user-friendly, and efficient online booking system that improves the travel experience.",
    image: "/pic7.png",
    alt: "Our Mission"
  },
  {
    id: "3",
    title: "Our Vision",
    description:
      "To become the leading digital solution for ferry transportation ensuring convenience and safety.",
    image: "/pic8.png",
    alt: "Our Vision"
  }
];

const FEATURE_CARDS = [
  ["⌚", "Real-time Schedules", "Get up-to-date ferry schedules and availability information"],
  ["✓", "Easy Booking", "Quick and simple online ticket booking with QR boarding passes"],
  ["↔", "Manage Bookings", "View, modify, and manage your reservations anytime, anywhere"],
  ["◈", "Secure Payment", "Multiple secure payment options for your convenience"],
  ["◎", "24/7 Support", "Round-the-clock customer support for assistance"],
  ["⊕", "Safe & Secure", "Your data is protected with industry-standard security"]
];

const CONTACT_CARDS = [
  ["@", "Email", "support@pmsferry.com"],
  ["☎", "Phone", "+63 912 345 6789"],
  ["◐", "Hours", "24/7 Available for You"]
];

function About() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const contentElement = document.getElementById("about-page-content");
    if (contentElement) {
      contentElement.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      id="about-page-content"
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed",
        paddingTop: isMobile ? "76px" : "0"
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #007bff 0%, #0056b3 100%)",
          color: "white",
          padding: isMobile ? "20px 12px" : "40px 20px",
          textAlign: "center",
          marginBottom: isMobile ? "20px" : "40px"
        }}
      >
        <h1
          style={{
            fontSize: isMobile ? "1.35rem" : "2.5rem",
            fontWeight: 700,
            marginBottom: isMobile ? "8px" : "15px",
            lineHeight: 1.15
          }}
        >
          About PMS Port
        </h1>
        <p
          style={{
            fontSize: isMobile ? "0.8rem" : "1rem",
            opacity: 0.95,
            maxWidth: "700px",
            margin: "0 auto",
            lineHeight: isMobile ? "1.45" : "1.5"
          }}
        >
          Your trusted platform for seamless ferry bookings and real-time schedules
        </p>
      </div>

      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: isMobile ? "0 10px 24px" : "0 20px 40px"
        }}
      >
        <div
          style={{
            display: isMobile ? "flex" : "grid",
            gridTemplateColumns: isMobile ? undefined : "repeat(3, 1fr)",
            gap: isMobile ? "10px" : "20px",
            marginBottom: isMobile ? "22px" : "40px",
            overflowX: isMobile ? "auto" : "visible",
            paddingBottom: isMobile ? "6px" : "0",
            WebkitOverflowScrolling: isMobile ? "touch" : "auto"
          }}
        >
          {INFO_CARDS.map((card) => (
            <div
              key={card.id}
              style={{
                background: "white",
                borderRadius: "12px",
                overflow: "hidden",
                boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
                transition: "transform 0.3s ease, box-shadow 0.3s ease",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                minWidth: isMobile ? "236px" : "0",
                flex: isMobile ? "0 0 236px" : "1 1 auto"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-5px)";
                e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 15px rgba(0,0,0,0.1)";
              }}
            >
              <div
                style={{
                  position: "relative",
                  overflow: "hidden",
                  width: "100%",
                  flexShrink: 0
                }}
              >
                <img
                  src={card.image}
                  alt={card.alt}
                  style={{
                    width: "100%",
                    height: isMobile ? "128px" : "180px",
                    objectFit: "cover"
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: isMobile ? "8px" : "10px",
                    left: isMobile ? "8px" : "10px",
                    width: isMobile ? "30px" : "40px",
                    height: isMobile ? "30px" : "40px",
                    background: "linear-gradient(135deg, #007bff 0%, #0056b3 100%)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: isMobile ? "0.88rem" : "1.2rem",
                    fontWeight: 700,
                    boxShadow: "0 4px 10px rgba(0,0,0,0.2)"
                  }}
                >
                  {card.id}
                </div>
              </div>

              <div
                style={{
                  padding: isMobile ? "12px 10px" : "20px 15px",
                  width: "100%"
                }}
              >
                <h3
                  style={{
                    fontSize: isMobile ? "0.9rem" : "1.1rem",
                    fontWeight: 700,
                    marginBottom: isMobile ? "6px" : "8px",
                    color: "#2c3e50"
                  }}
                >
                  {card.title}
                </h3>
                <p
                  style={{
                    color: "#666",
                    lineHeight: isMobile ? "1.45" : "1.5",
                    fontSize: isMobile ? "0.74rem" : "0.9rem",
                    margin: 0
                  }}
                >
                  {card.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginBottom: isMobile ? "24px" : "60px"
          }}
        >
          <h2
            style={{
              fontSize: isMobile ? "1.18rem" : "2rem",
              fontWeight: 700,
              textAlign: "center",
              marginBottom: isMobile ? "14px" : "40px",
              color: "#2c3e50"
            }}
          >
            Why Choose PMS Port?
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(3, 1fr)",
              gap: isMobile ? "10px" : "25px"
            }}
          >
            {FEATURE_CARDS.map(([icon, title, description]) => (
              <div
                key={title}
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: isMobile ? "12px 10px" : "30px",
                  textAlign: "center",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
                  borderLeft: "4px solid #007bff",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0",
                  minHeight: isMobile ? "150px" : "auto"
                }}
              >
                <div
                  style={{
                    width: isMobile ? "32px" : "50px",
                    height: isMobile ? "32px" : "50px",
                    background: "#007bff",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: isMobile ? "0.86rem" : "1.5rem",
                    fontWeight: 700,
                    margin: isMobile ? "0 auto 10px" : "0 auto 15px",
                    flexShrink: 0
                  }}
                >
                  {icon}
                </div>
                <div style={{ width: "100%" }}>
                  <h4
                    style={{
                      fontWeight: 600,
                      color: "#2c3e50",
                      marginBottom: isMobile ? "5px" : "10px",
                      fontSize: isMobile ? "0.74rem" : "1rem",
                      lineHeight: 1.35
                    }}
                  >
                    {title}
                  </h4>
                  <p
                    style={{
                      color: "#666",
                      fontSize: isMobile ? "0.64rem" : "0.9rem",
                      lineHeight: isMobile ? "1.35" : "1.6",
                      margin: 0
                    }}
                  >
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, #007bff 0%, #0056b3 100%)",
            color: "white",
            borderRadius: "12px",
            padding: isMobile ? "14px 12px" : "42px 36px",
            textAlign: "center",
            marginBottom: isMobile ? "22px" : "56px"
          }}
        >
          <h2
            style={{
              fontSize: isMobile ? "1rem" : "1.8rem",
              fontWeight: 700,
              marginBottom: isMobile ? "10px" : "18px"
            }}
          >
            Get in Touch
          </h2>
          <p
            style={{
              fontSize: isMobile ? "0.72rem" : "1rem",
              marginBottom: isMobile ? "12px" : "26px",
              lineHeight: isMobile ? "1.4" : "1.7",
              opacity: 0.95
            }}
          >
            Have questions or need assistance? We're here to help!
          </p>

          <div
            style={{
              display: isMobile ? "flex" : "grid",
              gridTemplateColumns: isMobile ? undefined : "repeat(auto-fit, minmax(250px, 1fr))",
              gap: isMobile ? "10px" : "24px",
              marginTop: isMobile ? "10px" : "24px",
              overflowX: isMobile ? "auto" : "visible",
              paddingBottom: isMobile ? "4px" : "0",
              WebkitOverflowScrolling: isMobile ? "touch" : "auto"
            }}
          >
            {CONTACT_CARDS.map(([icon, title, value]) => (
              <div key={title} style={{ minWidth: isMobile ? "138px" : "0", flex: isMobile ? "0 0 138px" : "1 1 auto" }}>
                <div
                  style={{
                    width: isMobile ? "28px" : "46px",
                    height: isMobile ? "28px" : "46px",
                    background: "rgba(255,255,255,0.2)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: isMobile ? "0.82rem" : "1.35rem",
                    fontWeight: 700,
                    margin: isMobile ? "0 auto 6px" : "0 auto 10px"
                  }}
                >
                  {icon}
                </div>
                <h4 style={{ fontWeight: 600, marginBottom: isMobile ? "4px" : "8px", fontSize: isMobile ? "0.78rem" : "0.98rem" }}>
                  {title}
                </h4>
                <p style={{ opacity: 0.9, fontSize: isMobile ? "0.66rem" : "0.92rem", margin: 0 }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#2c3e50",
          color: "white",
          textAlign: "center",
          padding: "30px 20px",
          fontSize: "0.9rem",
          opacity: 0.9
        }}
      >
        <p>© {new Date().getFullYear()} PMS Port. All rights reserved.</p>
      </div>
    </div>
  );
}

export default About;
