export function NotificationDot({ size = 10, style = {} }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: '#f44336',
        boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.9)',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export function NavNotificationBadge({ count, inline = false, style = {} }) {
  if (!count || count <= 0) return null;

  if (inline) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '18px',
          height: '18px',
          padding: '0 5px',
          marginLeft: 'auto',
          borderRadius: '999px',
          background: '#f44336',
          color: 'white',
          fontSize: '0.7rem',
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }

  return (
    <NotificationDot
      size={9}
      style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        boxShadow: '0 0 0 2px #ffffff',
        ...style,
      }}
    />
  );
}

export function getNotificationCardStyles(isRead, isMobile) {
  return {
    card: {
      background: isRead ? '#eceff1' : '#ffffff',
      padding: isMobile ? '12px 15px' : '18px 20px',
      borderRadius: '12px',
      border: `1px solid ${isRead ? '#cfd8dc' : '#90caf9'}`,
      boxShadow: isRead ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      position: 'relative',
    },
    title: {
      margin: '0 0 5px 0',
      fontSize: isMobile ? '0.9rem' : '1.05rem',
      fontWeight: isRead ? 600 : 700,
      color: isRead ? '#757575' : '#1a1a1a',
    },
    message: {
      margin: '0 0 8px 0',
      fontSize: isMobile ? '0.75rem' : '0.9rem',
      color: isRead ? '#9e9e9e' : '#555',
      lineHeight: '1.4',
    },
    timestamp: {
      fontSize: isMobile ? '0.7rem' : '0.8rem',
      color: isRead ? '#b0bec5' : '#999',
    },
  };
}
