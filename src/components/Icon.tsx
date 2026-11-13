const PATHS: Record<string, string> = {
  book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  play: "M7 4v16l13-8z",
  pause: "M7 4h4v16H7zM14 4h4v16h-4z",
  back: "M11 18V6l-8.5 6zM21 18V6l-8.5 6z",
  stop: "M6 6h12v12H6z",
  read: "M2 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h8z",
  ear: "M6 8.5a6 6 0 0 1 12 0c0 3.5-3 4.5-3 7.5a3.5 3.5 0 0 1-6.5 1.8M9.5 8.5a2.5 2.5 0 0 1 5 0c0 1.5-1.5 2-1.5 3.5",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  close: "M6 6l12 12M18 6L6 18",
  speaker: "M4 9v6h4l5 4V5L8 9H4zM16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10",
};

const FILLED = new Set(["play", "pause", "back", "stop"]);

export function Icon({ name, title }: { name: keyof typeof PATHS | string; title?: string }) {
  const filled = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      width="24"
      height="24"
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
