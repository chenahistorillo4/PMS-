import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiArrowRight,
  FiAnchor,
  FiBookOpen,
  FiCheckCircle,
  FiClock,
  FiMail,
  FiMapPin,
  FiPhone,
  FiRadio,
  FiShield,
  FiX,
} from "react-icons/fi";
import "../App.css";

const destinations = [
  {
    name: "Marinduque",
    image: "/Marinduque/Boac Plaza.webp",
    places: [
      ["Boac Plaza", "/Marinduque/Boac Plaza.webp"],
      ["Immaculate Concepcion Cathedral Parish", "/Marinduque/Immaculate Concepcion Cathedral Parish.webp"],
      ["Luzon Datum of 1911", "/Marinduque/Luzon Datum of 1911.webp"],
      ["Maniuaya Island", "/Marinduque/Maniuaya Island.webp"],
      ["Mount Malindig", "/Marinduque/Mount Malindig.webp"],
      ["Poctoy White Beach", "/Marinduque/Poctoy White Beach.webp"],
    ],
  },
  {
    name: "Sibale",
    image: "/Sibale/Boat Ride Ezperience.avif",
    places: [
      ["Boat Ride Experience", "/Sibale/Boat Ride Ezperience.avif"],
      ["Mt. Talisay", "/Sibale/Mt.-Talisay.avif"],
      ["The Mangrove Shack", "/Sibale/The-Mangrove-Shack.avif"],
    ],
  },
  {
    name: "Pinamalayan",
    image: "/Pinamalayan/Aplaya De Ana Liza.jpg",
    places: [
      ["Aplaya De Ana Liza", "/Pinamalayan/Aplaya De Ana Liza.jpg"],
      ["Cawa-Cawa Falls", "/Pinamalayan/Cawa-Cawa Falls.webp"],
      ["Magdalena Beach Resort", "/Pinamalayan/Magdalena Beach Resort.webp"],
      ["Pinamalayan Park", "/Pinamalayan/Pinamalayan Park.jpg"],
      ["Pinamalayan Rainbow Junction", "/Pinamalayan/Pinamalayan Rainbow Junction.jpg"],
      ["White Beach", "/Pinamalayan/White Beach.webp"],
    ],
  },
];

const benefits = [
  {
    title: "Real-Time Schedules",
    description: "See updated sailing times and plan your trip with confidence.",
    icon: FiClock,
  },
  {
    title: "QR Boarding Pass",
    description: "Get a convenient digital pass that is ready to scan at the port.",
    icon: FiRadio,
  },
  {
    title: "Safe & Secure Travel",
    description: "Enjoy a reliable booking experience from reservation to boarding.",
    icon: FiShield,
  },
];

const faqs = [
  ["How can I book a ferry ticket?", "Create an account, select your preferred trip schedule, provide the required information, and complete the payment."],
  ["What payment methods are accepted?", "The system accepts digital payments such as GCash and PayLater."],
  ["How will I receive my boarding pass?", "A QR code boarding pass will be generated and sent after successful booking and payment."],
  ["Can I reserve cargo through the system?", "Yes, passengers can reserve cargo space for eligible items during the booking process."],
  ["What should I do if my trip is canceled?", "You may submit a refund request through the system for review and approval."],
  ["Can I cancel my booking?", "Yes, passengers may cancel their booking subject to the port's cancellation and refund policy."],
  ["What should I do if I forget my password?", "Click the \"Forgot Password\" link on the login page and follow the instructions sent to your registered email address."],
  ["Can I use my Google account to sign in?", "Yes, passengers may sign in or create an account using their Google account through the Continue with Google feature."],
  ["Is my personal information secure?", "Yes, the system is designed to protect user information and ensure secure transactions."],
  ["Do I need to print my QR boarding pass?", "No, passengers may present the QR boarding pass using their mobile device during boarding."],
];

function Home({ user, role, authReady }) {
  const navigate = useNavigate();
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [showFaqs, setShowFaqs] = useState(false);
  const isAuthenticatedPassenger = authReady && Boolean(user?.uid) && role === "user";

  const handleBookClick = () => {
    if (!isAuthenticatedPassenger) {
      navigate("/login");
      return;
    }
    navigate("/booking");
  };

  const handleManageClick = () => {
    if (!isAuthenticatedPassenger) {
      navigate("/login");
      return;
    }
    navigate("/manage");
  };

  return (
    <main className="home-page home-modern-page">
      <section
        className="home-modern-hero"
        style={{ backgroundImage: "url(/homebg.png)" }}
      >
        <div className="home-hero-overlay">
          <div className="home-hero-copy">
            <h1>PMS Port</h1>
            <h2>Pinamalayan-Marinduque-<br />Sibale Ferry</h2>
            <p>Safe&nbsp; • &nbsp;Fast&nbsp; • &nbsp;Reliable</p>
          </div>
          <div className="home-hero-actions">
            <button type="button" className="home-hero-button home-hero-book-button" onClick={handleBookClick}>
              <FiBookOpen /> Book Ticket <FiArrowRight />
            </button>
            <button type="button" className="home-hero-button home-hero-manage-button" onClick={handleManageClick}>
              <FiCheckCircle /> Manage Booking
            </button>
          </div>
        </div>
      </section>

      <section className="home-modern-content">
        <section className="home-announcement">
          <FiRadio className="home-announcement-icon" />
          <div>
            <h2>Latest Schedule</h2>
            <p>Schedule adjustment. Please check the updated ferry times before booking.</p>
          </div>
          <button type="button" onClick={() => navigate("/schedule")}>View All <FiArrowRight /></button>
        </section>

        <section className="home-benefits">
          <h2 className="home-section-title"><span />Why Choose PMS Port?<span /></h2>
          <div className="home-benefit-grid">
            {benefits.map(({ title, description, icon: Icon }) => (
              <div className="home-benefit-card" key={title}>
                <span className="home-benefit-icon"><Icon /></span>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-destinations">
          <h2 className="home-section-title"><span />Explore Our Destinations<span /></h2>
          <div className="home-destination-grid">
            {destinations.map((destination) => (
              <button
                type="button"
                className="home-destination-card"
                key={destination.name}
                onClick={() => setSelectedDestination(destination)}
                aria-label={`View ${destination.name} destinations`}
              >
                <img src={destination.image} alt={`${destination.name} destination`} />
                <div><FiMapPin /> {destination.name}</div>
              </button>
            ))}
          </div>
        </section>

      </section>

      <section className="home-support-banner">
        <div
          className="home-support-image"
          style={{ backgroundImage: "url(/FAQs.jpg)" }}
          aria-hidden="true"
        />
        <div className="home-support-copy">
          <h2>Need Help with Your Booking?</h2>
          <p>Check our FAQs or contact our support team.</p>
          <button type="button" onClick={() => setShowFaqs((current) => !current)}>
            {showFaqs ? "Hide FAQs" : "See FAQs"} <FiArrowRight />
          </button>
        </div>
        <span className="home-support-anchor" aria-hidden="true"><FiAnchor /></span>
      </section>

      {showFaqs && (
        <section className="home-faq-section" aria-labelledby="faq-title">
          <h2 id="faq-title">Frequently Asked Questions</h2>
          <div className="home-faq-list">
            {faqs.map(([question, answer]) => (
              <article className="home-faq-item" key={question}>
                <h3>Q: {question}</h3>
                <p>A: {answer}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className="home-footer">
        <div className="home-footer-main">
          <div className="home-footer-brand">
            <div className="home-footer-logo">
              <img src="/logoo.png" alt="PMS Port logo" />
            </div>
            <strong>PMS Port</strong>
            <span>Pinamalayan-Marinduque-Sibale Ferry</span>
          </div>
          <div className="home-footer-column home-footer-contact">
            <h3>Contact Us</h3>
            <span><FiPhone /> 0966-029-7160</span>
            <span><FiMail /> pmsport2026@gmail.com</span>
            <span><FiMapPin /> Port of Pinamalayan, Oriental Mindoro</span>
          </div>
          <div className="home-footer-tagline">Travel with Ease.<br />Reach More Places.</div>
        </div>
        <div className="home-footer-bottom">
          <span>© 2026 PMS Port. All rights reserved.</span>

        </div>
      </footer>

      {selectedDestination && (
        <div className="home-destination-backdrop" role="presentation">
          <section className="home-destination-modal" role="dialog" aria-modal="true" aria-labelledby="destination-title">
            <button
              type="button"
              className="home-destination-close"
              onClick={() => setSelectedDestination(null)}
              aria-label="Close destinations"
            >
              <FiX />
            </button>
            <h2 id="destination-title">{selectedDestination.name}</h2>
            <p>Explore places to visit in {selectedDestination.name}.</p>
            <div className="home-place-grid">
              {selectedDestination.places.map(([name, image]) => (
                <figure key={image} className="home-place-card">
                  <img src={image} alt={name} />
                  <figcaption>{name}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default Home;
