import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let user: { role?: string } | null = null;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user }),
}));

vi.mock("wouter", () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
  useLocation: () => ["/", () => {}],
}));

import { AppSidebar } from "../../client/src/components/layout/AppSidebar";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

afterEach(() => {
  user = null;
});

describe("AppSidebar account action", () => {
  it("offers guests a Log in action instead of Log out", () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar, { open: true, onClose: () => {} }));

    expect(html).toContain('data-testid="button-login"');
    expect(html).toContain('data-testid="link-nav-home"');
    expect(html).toContain('href="/workspace"');
    expect(html).toContain("Log in");
    expect(html).not.toContain('data-testid="button-logout"');
    expect(html).not.toContain("Log out");
  });

  it("offers authenticated users a Log out action", () => {
    user = { role: "user" };
    const html = renderToStaticMarkup(React.createElement(AppSidebar, { open: true, onClose: () => {} }));

    expect(html).toContain('data-testid="button-logout"');
    expect(html).toContain("Log out");
    expect(html).not.toContain('data-testid="button-login"');
  });
});
