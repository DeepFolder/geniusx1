import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false, user: null }),
}));

vi.mock("@/features/genius/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggle: () => {} }),
}));

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
  useLocation: () => ["/", () => {}],
}));

import LandingPage from "../../client/src/pages/landing";
import LegalNotice from "../../client/src/pages/legal-notice";
import PrivacyPolicy from "../../client/src/pages/privacy-policy";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("public Genius X1 site", () => {
  it("presents the product and the requested public navigation", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));

    expect(html).toContain("Engineering intelligence");
    expect(html).toContain("Describe your calculation. Get a sourced, step-by-step worksheet.");
    expect(html).toContain('href="/about"');
    expect(html).toContain('href="/privacy-policy"');
    expect(html).toContain('href="/terms-of-service"');
    expect(html).toContain('href="/legal"');
    expect(html).toContain('href="/auth"');
    expect(html).toContain("Size the motor for a ball screw actuator");
    expect(html).toContain("Understanding your problem");
    expect(html).not.toContain("qualified engineer must independently verify");
    expect(html).not.toContain("AI-assisted output may be wrong");
    expect(html).not.toContain("AI-generated calculations may contain errors");

    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).not.toContain('href="/about"');
    expect(header).not.toContain('href="/privacy-policy"');
  });

  it("makes the engineering limitations prominent", () => {
    const html = renderToStaticMarkup(React.createElement(LegalNotice));

    expect(html).toContain("Engineering and AI notice");
    expect(html).toContain("Do not rely on Genius X1 as the sole basis");
    expect(html).toContain("licensed professional");
  });

  it("describes calculation, AI-provider, and privacy-rights processing", () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPolicy));

    expect(html).toContain("Calculation content");
    expect(html).toContain("OpenAI");
    expect(html).toContain("Swiss FADP");
    expect(html).toContain("California residents");
    expect(html).toContain("does not sell personal information");
  });
});
