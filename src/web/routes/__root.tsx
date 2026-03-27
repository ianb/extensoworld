import { useState, useEffect } from "react";
import { Outlet, Link, createRootRoute, useMatchRoute } from "@tanstack/react-router";
import { AuthContext, fetchAuthStatus } from "../auth.js";
import type { AuthUser } from "../auth.js";

export const rootRoute = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const matchRoute = useMatchRoute();
  const isGamePage = matchRoute({ to: "/game/$gameId", fuzzy: true });

  useEffect(() => {
    fetchAuthStatus().then((status) => {
      setUser(status.user);
      setDevMode(status.devMode);
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext value={{ user, devMode, loading }}>
      <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
        <div className="flex-1">
          <Outlet />
        </div>
        {isGamePage ? null : <Footer />}
      </div>
    </AuthContext>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-800 px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-center justify-between text-xs text-gray-500">
        <Link to="/about" className="hover:text-gray-300">
          About
        </Link>
        <a
          href="https://github.com/ianb/roomsuponrooms"
          className="hover:text-gray-300"
          aria-label="GitHub"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
