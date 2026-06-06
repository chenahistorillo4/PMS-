function MainLayout({ children }) {
  return (
    <div>
      {/* Blue Navbar for user site */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
        <div className="container">
          <a className="navbar-brand" href="/">PMS Port</a>
          <ul className="navbar-nav ms-auto">
            <li className="nav-item"><a className="nav-link" href="/book">Book Now</a></li>
            <li className="nav-item"><a className="nav-link" href="/schedule">Schedule</a></li>
            <li className="nav-item"><a className="nav-link" href="/about">About Us</a></li>
            <li className="nav-item"><a className="nav-link" href="/manage-booking">Manage Booking</a></li>
            <li className="nav-item"><a className="nav-link" href="/profile">My Profile</a></li>
          </ul>
        </div>
      </nav>

      {/* Page content */}
      <div className="container mt-4">{children}</div>
    </div>
  );
}

export default MainLayout;
