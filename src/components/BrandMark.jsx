import React from 'react';

// The one Wendaflow mark; every place that shows the logo renders this.
export function BrandMark({size=31,label='Wendaflow'}) {
 return <span className="brand-mark" style={{'--bm':`${size}px`}} role="img" aria-label={label}>
  <svg viewBox="0 0 32 32" aria-hidden="true">
   <path d="M6.5 8.5v6.2c0 5.9 3 8.8 6.6 8.8 2.2 0 3.4-1.2 3.4-3.3V8.5m0 8.2c0 4.5 1.4 6.8 4.1 6.8 3 0 4.9-2.8 4.9-8.8V8.5" />
   <circle cx="6.5" cy="7" r="1.5" /><circle cx="16.5" cy="7" r="1.5" /><circle cx="25.5" cy="7" r="1.5" />
  </svg>
 </span>;
}
