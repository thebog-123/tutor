/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Replit (and similar) serve the dev server through a proxy domain. Without
  // this, Next refuses those cross-origin dev requests and the page hangs.
  allowedDevOrigins: [
    "*.replit.dev",
    "*.repl.co",
    "*.replit.app",
    "*.worf.replit.dev",
    "*.picard.replit.dev",
  ],
};

export default nextConfig;
