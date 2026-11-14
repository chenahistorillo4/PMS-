import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the current passenger home page', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'PMS Port' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /book ticket/i })).toBeInTheDocument();
});
