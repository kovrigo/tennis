// SVG symbols from the prototype: the federation shield and the menu icons.
// "Новости" and the place and contact icons are drawn in the same 24px, 1.7 stroke style.

export function IconSprite() {
  return (
    <svg style={{ display: "none" }} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <symbol id="shield" viewBox="0 0 120 152">
        <defs>
          <pattern id="s-net" width="8.2" height="7" patternUnits="userSpaceOnUse">
            <path d="M0 0V7M0 0H8.2" stroke="#E23127" strokeWidth="1.3" />
          </pattern>
          <pattern id="s-mesh" width="7.2" height="7.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0V7.2M0 0H7.2" stroke="#fff" strokeWidth="1.2" opacity=".92" />
          </pattern>
          <clipPath id="s-clip">
            <path d="M12 10H108V86c0 20-18 28-40 36l-8 22-8-22c-22-8-40-16-40-36Z" />
          </clipPath>
        </defs>
        <path d="M12 10H108V86c0 20-18 28-40 36l-8 22-8-22c-22-8-40-16-40-36Z" fill="#2F6FCB" />
        <g clipPath="url(#s-clip)">
          <rect x="17" y="15" width="86" height="37" fill="#fff" />
          <rect x="17" y="15" width="86" height="37" fill="url(#s-net)" />
          <rect x="17" y="15" width="86" height="6" fill="#E23127" />
          <rect x="18.3" y="16.3" width="83.4" height="34.4" fill="none" stroke="#E23127" strokeWidth="2.6" />
        </g>
        <g stroke="#fff" strokeLinecap="round">
          <g transform="translate(38 74) rotate(-26)">
            <ellipse rx="11" ry="15" fill="#2F6FCB" stroke="none" />
            <ellipse rx="11" ry="15" fill="url(#s-mesh)" stroke="none" />
            <ellipse rx="11" ry="15" fill="none" strokeWidth="3.6" />
            <path d="M-3.8 13-1.5 21M3.8 13 1.5 21" fill="none" strokeWidth="3" />
            <path d="M0 21V47" fill="none" strokeWidth="4.8" />
          </g>
          <g transform="translate(82 74) rotate(26)">
            <ellipse rx="11" ry="15" fill="#2F6FCB" stroke="none" />
            <ellipse rx="11" ry="15" fill="url(#s-mesh)" stroke="none" />
            <ellipse rx="11" ry="15" fill="none" strokeWidth="3.6" />
            <path d="M-3.8 13-1.5 21M3.8 13 1.5 21" fill="none" strokeWidth="3" />
            <path d="M0 21V47" fill="none" strokeWidth="4.8" />
          </g>
        </g>
        <circle cx="60" cy="58" r="13.4" fill="#2F6FCB" />
        <circle cx="60" cy="58" r="11" fill="#fff" />
        <path
          d="M52.2 50.2c3.3 3.8 3.3 11.8 0 15.6M67.8 50.2c-3.3 3.8-3.3 11.8 0 15.6"
          fill="none"
          stroke="#2F6FCB"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M12 10H108V86c0 20-18 28-40 36l-8 22-8-22c-22-8-40-16-40-36Z"
          fill="none"
          stroke="#12233F"
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
      </symbol>
      <symbol id="i-cup" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
        <path d="M7 6H4.5v1A3.5 3.5 0 0 0 8 10.5M17 6h2.5v1A3.5 3.5 0 0 1 16 10.5" />
        <path d="M12 14v3.5M8.5 20h7" />
      </symbol>
      <symbol id="i-rating" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 20v-7M12 20V4M19 20v-10M3 20h18" />
      </symbol>
      <symbol id="i-live" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2.6" />
        <path d="M7.2 7.2a6.8 6.8 0 0 0 0 9.6M16.8 7.2a6.8 6.8 0 0 1 0 9.6" />
        <path d="M4.3 4.3a10.9 10.9 0 0 0 0 15.4M19.7 4.3a10.9 10.9 0 0 1 0 15.4" opacity=".45" />
      </symbol>
      <symbol id="i-news" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 4h11v15a1 1 0 0 0 1 1H6a1 1 0 0 1-1-1V4Z" />
        <path d="M16 8h3v11a1 1 0 0 1-2 0" />
        <path d="M8 8h5M8 11.5h5M8 15h3" />
      </symbol>
      <symbol id="i-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z" />
        <circle cx="12" cy="9.8" r="2.3" />
      </symbol>
      <symbol id="i-phone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.6 3.5h2.6l1.4 4.2-2 1.4a11 11 0 0 0 6.3 6.3l1.4-2 4.2 1.4v2.6a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1Z" />
      </symbol>
      <symbol id="i-mail" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
        <path d="m4 6.5 8 6.5 8-6.5" />
      </symbol>
    </svg>
  );
}

export function Shield() {
  return (
    <svg aria-hidden="true">
      <use href="#shield" />
    </svg>
  );
}

export function Icon({ id, size = 17 }: { id: "i-cup" | "i-rating" | "i-live" | "i-news" | "i-pin" | "i-phone" | "i-mail"; size?: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}
