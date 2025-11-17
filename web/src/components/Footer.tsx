/**
 * Footer Component
 * Presentational component for application footer
 * Follows Single Responsibility Principle: Only renders footer UI
 */

import { APP_TEXT } from '../constants/text';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <p>{APP_TEXT.FOOTER_TEXT}</p>
        </div>
      </div>
    </footer>
  );
}
