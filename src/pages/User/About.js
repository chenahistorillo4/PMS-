import {
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiEdit3,
  FiMail,
  FiMapPin,
  FiPhone,
  FiShield,
  FiTruck,
  FiUserCheck,
} from "react-icons/fi";
import "../../App.css";

const infoCards = [
  {
    title: "Who We Are",
    description:
      "PMS Port is a modern ferry reservation and ticketing system for the Pinamalayan, Marinduque, and Sibale routes.",
    image: "/pic5.jpg",
    icon: FiUserCheck,
  },
  {
    title: "Our Mission",
    description:
      "To provide a reliable, user-friendly, and efficient online booking system that improves every travel experience.",
    image: "/pic7.png",
    icon: FiTruck,
  },
  {
    title: "Our Vision",
    description:
      "To become the leading digital solution for ferry transportation, ensuring convenience, safety, and accessibility.",
    image: "/pic8.png",
    icon: FiShield,
  },
];

const features = [
  ["Real-time Schedules", "Get updated ferry schedules and availability information.", FiClock],
  ["Easy Booking", "Book online quickly and receive a QR boarding pass.", FiCalendar],
  ["Manage Bookings", "View and manage your reservations anytime, anywhere.", FiEdit3],
  ["Secure Payment", "Use convenient and secure digital payment options.", FiShield],
  ["24/7 Support", "Get assistance whenever you need help with your trip.", FiUserCheck],
  ["Safe & Secure", "Your information is protected throughout the process.", FiCheckCircle],
];

function About() {
  return (
    <main className="about-page home-page home-modern-page">
      <section className="about-hero" style={{ backgroundImage: "url(/homebg.png)" }}>
        <div className="about-hero-overlay">
          <h1>About PMS Port</h1>
          <p>Your trusted platform for seamless ferry bookings and real-time schedules.</p>
        </div>
      </section>

      <div className="about-content">
        <section className="about-info-grid">
          {infoCards.map(({ title, description, image, icon: Icon }) => (
            <article className="about-info-card" key={title}>
              <div className="about-info-image">
                <img src={image} alt={title} />
                <span><Icon /></span>
              </div>
              <div className="about-info-body">
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="about-features">
          <h2 className="home-section-title"><span />Why Choose PMS Port?<span /></h2>
          <div className="about-feature-grid">
            {features.map(([title, description, Icon]) => (
              <article className="about-feature-card" key={title}>
                <span className="about-feature-icon"><Icon /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

      </div>

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
          © {new Date().getFullYear()} PMS Port. All rights reserved.
        </div>
      </footer>
    </main>
  );
}

export default About;
