import { useEffect, useState } from 'react';
import {
  buildReportFilterLabel,
  summarizeBookings,
} from '../utils/reportHelpers';

const ITEMS_PER_PAGE = 10;

function formatMoney(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatStatus(status) {
  const value = String(status || 'pending').toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function ReportPreview({
  title = 'Report Preview',
  filterLabel,
  bookings = [],
  summary,
  emptyMessage = 'No bookings match the selected filters.',
  pageSize = ITEMS_PER_PAGE,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const reportSummary = summary || summarizeBookings(bookings);
  const rows = reportSummary.bookingsList;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRows = rows.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterLabel, rows.length, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div
      style={{
        background: '#f8fbff',
        border: '1px solid #d6e4f5',
        borderRadius: '12px',
        padding: isMobile ? '12px' : '16px',
        marginTop: '20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <div>
          <h4 style={{ margin: 0, color: '#1a1a1a', fontSize: isMobile ? '0.95rem' : '1.05rem' }}>{title}</h4>
          <p style={{ margin: '6px 0 0', color: '#666', fontSize: isMobile ? '0.82rem' : '0.9rem' }}>
            {filterLabel || buildReportFilterLabel({})}
          </p>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#4a8bd4', fontWeight: 600 }}>
          {rows.length} booking{rows.length !== 1 ? 's' : ''} shown
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        {[
          { label: 'Total bookings', value: reportSummary.totalBookings },
          { label: 'Confirmed', value: reportSummary.completedBookings },
          { label: 'Pending', value: reportSummary.pendingBookings },
          { label: 'Cancelled', value: reportSummary.cancelledBookings },
          { label: 'Total revenue', value: formatMoney(reportSummary.totalRevenue) },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: 'white',
              border: '1px solid #e3edf7',
              borderRadius: '10px',
              padding: '12px',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#666' }}>{item.label}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a1a', marginTop: '4px' }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '1px dashed #cfd8e3',
            borderRadius: '10px',
            padding: '24px',
            textAlign: 'center',
            color: '#666',
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                background: 'white',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              <thead>
                <tr style={{ background: '#4a8bd4', color: 'white', textAlign: 'left' }}>
                  {['Reference', 'Passenger', 'Route', 'Trip date', 'Amount', 'Status'].map((heading) => (
                    <th key={heading} style={{ padding: isMobile ? '8px 10px' : '10px 12px', fontSize: isMobile ? '0.75rem' : '0.85rem' }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, index) => (
                  <tr
                    key={`${row.referenceNumber}-${startIndex + index}`}
                    style={{ borderBottom: '1px solid #eef2f7' }}
                  >
                    <td style={{ padding: isMobile ? '8px 10px' : '10px 12px', fontSize: isMobile ? '0.75rem' : '0.85rem' }}>{row.referenceNumber}</td>
                    <td style={{ padding: isMobile ? '8px 10px' : '10px 12px', fontSize: isMobile ? '0.75rem' : '0.85rem' }}>{row.passengerName}</td>
                    <td style={{ padding: isMobile ? '8px 10px' : '10px 12px', fontSize: isMobile ? '0.75rem' : '0.85rem' }}>{row.route}</td>
                    <td style={{ padding: isMobile ? '8px 10px' : '10px 12px', fontSize: isMobile ? '0.75rem' : '0.85rem' }}>{row.bookingDate}</td>
                    <td style={{ padding: isMobile ? '8px 10px' : '10px 12px', fontSize: isMobile ? '0.75rem' : '0.85rem' }}>{formatMoney(row.paymentAmount)}</td>
                    <td style={{ padding: isMobile ? '8px 10px' : '10px 12px', fontSize: isMobile ? '0.75rem' : '0.85rem' }}>{formatStatus(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > pageSize && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: isMobile ? '16px' : '20px',
                paddingTop: isMobile ? '16px' : '20px',
                borderTop: '1px solid #e0e0e0',
                flexWrap: 'wrap',
                gap: isMobile ? '8px' : '12px',
              }}
            >
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                style={{
                  background: currentPage === 1 ? '#ccc' : '#2196f3',
                  color: 'white',
                  border: 'none',
                  padding: isMobile ? '8px 12px' : '10px 20px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontSize: isMobile ? '0.8rem' : '0.9rem',
                  opacity: currentPage === 1 ? 0.5 : 1,
                }}
              >
                ← Previous
              </button>

              <div style={{ fontSize: isMobile ? '0.8rem' : '0.9rem', color: '#666', textAlign: 'center' }}>
                Page {currentPage} of {totalPages}
                <div style={{ fontSize: '0.78rem', color: '#999', marginTop: '2px' }}>
                  Showing {startIndex + 1}–{Math.min(startIndex + pageSize, rows.length)} of {rows.length}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                style={{
                  background: currentPage === totalPages ? '#ccc' : '#2196f3',
                  color: 'white',
                  border: 'none',
                  padding: isMobile ? '8px 12px' : '10px 20px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontSize: isMobile ? '0.8rem' : '0.9rem',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
