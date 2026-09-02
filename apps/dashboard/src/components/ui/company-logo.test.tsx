// @ts-nocheck — Vitest/RTL types not in dashboard tsconfig; tsc skips this file
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompanyLogo } from "./company-logo";

// Mock brand-map to isolate component behavior where needed, but keep real mapper for URL assertions
vi.mock("@/lib/brand-map", async () => {
  const actual = await vi.importActual<typeof import("@/lib/brand-map")>("@/lib/brand-map");
  return actual;
});

const ORIGINAL_ENV = import.meta.env;

describe("CompanyLogo", () => {
  const clientId = "test-client-123";

  beforeEach(() => {
    // Inject client id
    // @ts-ignore
    import.meta.env = { ...ORIGINAL_ENV, VITE_BRANDFETCH_CLIENT_ID: clientId };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // @ts-ignore
    import.meta.env = ORIGINAL_ENV;
  });

  it("renders img with Brandfetch URL for AAPL (domain/apple.com) size 32 → 64 retina", () => {
    render(<CompanyLogo symbol="AAPL" size={32} theme="light" />);
    const img = screen.getByTestId("company-logo-img") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("cdn.brandfetch.io/domain/apple.com");
    expect(img.src).toContain("w/64/h/64");
    expect(img.src).toContain("fallback/lettermark");
    expect(img.src).toContain("theme/light");
    expect(img.src).toContain(`c=${clientId}`);
    expect(img.loading).toBe("lazy");
    expect(img.decoding).toBe("async");
    expect(img.getAttribute("width")).toBe("32");
    expect(img.getAttribute("height")).toBe("32");
  });

  it("GGAL → domain bancogalicia.com.ar with theme dark", () => {
    render(<CompanyLogo symbol="GGAL" market="bcba" size={32} theme="dark" />);
    const img = screen.getByTestId("company-logo-img") as HTMLImageElement;
    expect(img.src).toContain("bancogalicia.com.ar");
    expect(img.src).toContain("theme/dark");
  });

  it("w/h = 2*size (28 → 56, 40 → 80)", () => {
    const { rerender } = render(<CompanyLogo symbol="AAPL" size={28} theme="light" />);
    expect((screen.getByTestId("company-logo-img") as HTMLImageElement).src).toContain("w/56/h/56");
    rerender(<CompanyLogo symbol="AAPL" size={40} theme="light" />);
    expect((screen.getByTestId("company-logo-img") as HTMLImageElement).src).toContain("w/80/h/80");
  });

  it("onError swaps to lettermark fallback (no longer img)", () => {
    render(<CompanyLogo symbol="AAPL" size={32} theme="light" />);
    const img = screen.getByTestId("company-logo-img");
    fireEvent.error(img);
    expect(screen.getByTestId("company-logo-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("company-logo-img")).not.toBeInTheDocument();
  });

  it("bonos (AL30) → immediate fallback without img, never hits cdn", () => {
    render(<CompanyLogo symbol="AL30" market="bcba" size={32} theme="light" />);
    expect(screen.getByTestId("company-logo-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("company-logo-img")).not.toBeInTheDocument();
    expect(screen.getByTestId("company-logo-fallback").textContent).toMatch(/AL/i);
  });

  it("missing VITE_BRANDFETCH_CLIENT_ID → immediate fallback + warn, no cdn request", () => {
    // @ts-ignore
    import.meta.env = { ...ORIGINAL_ENV, VITE_BRANDFETCH_CLIENT_ID: "" };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<CompanyLogo symbol="GGAL" size={32} theme="light" />);
    expect(screen.getByTestId("company-logo-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("company-logo-img")).not.toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("VITE_BRANDFETCH_CLIENT_ID"), expect.any(String));
  });

  it("theme auto resolves via matchMedia / dark class", () => {
    // default light when no dark class and prefers-light
    render(<CompanyLogo symbol="AAPL" size={32} theme="auto" />);
    const img = screen.getByTestId("company-logo-img") as HTMLImageElement;
    // should be light or dark depending on jsdom default (light)
    expect(img.src).toMatch(/theme\/(light|dark)/);
  });

  it("never calls fetch(cdn.brandfetch.io) — only img src hotlink", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<CompanyLogo symbol="AAPL" size={32} theme="light" />);
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("cdn.brandfetch.io"));
    fetchSpy.mockRestore();
  });
});
