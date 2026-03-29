/**
 * src/components/UserButton.jsx
 * ─────────────────────────────────────────────────────────────
 * Replaces the hardcoded "JD" avatar in TitleBar with a real
 * Clerk-powered user button.
 *
 * - Signed in:  shows user's avatar (or initials) + dropdown with
 *               profile, manage account, and sign out
 * - Signed out: shows a "Sign in" button that triggers the modal
 *               (by navigating to a protected section)
 *
 * Usage in TitleBar:
 *   import UserButton from "../components/UserButton.jsx";
 *   // Replace the hardcoded avatar div with:
 *   <UserButton dark={dark} setSection={setSection} />
 */

import { useAuth, useUser, UserButton as ClerkUserButton, SignInButton } from "@clerk/clerk-react";
import { useApp } from "../context/AppContext.jsx";

export default function UserButton({ dark }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user }                 = useUser();

  // While Clerk loads, show a placeholder that matches the existing avatar style
  if (!isLoaded) {
    return (
      <div style={{
        width: 30, height: 30, borderRadius: "50%",
        background: dark ? "#1e293b" : "#e2e8f0",
        border: dark ? "1.5px solid rgba(255,255,255,0.1)" : "1.5px solid rgba(0,0,0,0.1)",
      }} />
    );
  }

  // Signed in — use Clerk's UserButton with custom styling to match the design
  if (isSignedIn) {
    return (
      <ClerkUserButton
        appearance={{
          variables: {
            colorPrimary:    dark ? "#94a3b8" : "#0f172a",
            colorBackground: dark ? "#0f172a" : "#ffffff",
            colorText:       dark ? "#e2e8f0" : "#0f172a",
            borderRadius:    "10px",
            fontFamily:      "'DM Sans', sans-serif",
          },
          elements: {
            // Make the avatar button match the existing 30px circle style
            avatarBox: {
              width:  30,
              height: 30,
              borderRadius: "50%",
              border: dark
                ? "1.5px solid rgba(255,255,255,0.1)"
                : "1.5px solid rgba(0,0,0,0.1)",
            },
            userButtonPopoverCard: {
              background: dark ? "#0f172a" : "#ffffff",
              border: dark
                ? "1px solid rgba(255,255,255,0.08)"
                : "1px solid rgba(0,0,0,0.08)",
              boxShadow: dark
                ? "0 16px 48px rgba(0,0,0,0.5)"
                : "0 16px 48px rgba(0,0,0,0.12)",
            },
            userButtonPopoverActionButton: {
              color: dark ? "#94a3b8" : "#475569",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "13px",
            },
            userButtonPopoverActionButton__signOut: {
              color: "#ef4444",
            },
          },
        }}
        // Also show API status dot next to the avatar
        afterSignOutUrl="/"
      />
    );
  }

  // Signed out — show a minimal "Sign in" button
  return (
    <SignInButton mode="modal">
      <button style={{
        padding: "6px 14px",
        borderRadius: 8,
        background: dark ? "#1e293b" : "#0f172a",
        border: dark ? "1px solid rgba(255,255,255,0.08)" : "none",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 12, fontWeight: 500,
        color: dark ? "#94a3b8" : "#e2e8f0",
        cursor: "pointer",
        letterSpacing: "0.01em",
        transition: "opacity 0.2s",
      }}
        onMouseEnter={e => e.target.style.opacity = "0.8"}
        onMouseLeave={e => e.target.style.opacity = "1"}
      >
        Sign in
      </button>
    </SignInButton>
  );
}