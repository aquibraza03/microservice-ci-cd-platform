import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { configureIntl, detectLocale, getIntlDir, t, translate, useI18n } from "./index";
import { enMessages } from "./messages/en";

function Probe() {
  const { t, locale, dir, formatCurrency } = useI18n();
  return (
    <p>
      {t("login.submit")}|{locale}|{dir}|{formatCurrency(12.5)}
    </p>
  );
}

describe("translate", () => {
  it("interpolates {placeholders} from params", () => {
    expect(translate(enMessages, "landing.copyright", { year: 2026, name: "Acme" })).toBe(
      "© 2026 Acme"
    );
  });

  it("leaves unknown placeholders intact", () => {
    expect(translate(enMessages, "landing.copyright", { year: 2026 })).toBe("© 2026 {name}");
  });

  it("falls back to the key for unknown messages", () => {
    expect(t("missing.key" as Parameters<typeof t>[0])).toBe("missing.key");
  });
});

describe("locale store", () => {
  beforeEach(() => {
    configureIntl({ locale: "en" });
  });

  it("detects direction from the locale", () => {
    expect(getIntlDir("en")).toBe("ltr");
    expect(getIntlDir("ar")).toBe("rtl");
    expect(getIntlDir("he")).toBe("rtl");
  });

  it("configureIntl updates the store and keeps messages by default", () => {
    configureIntl({ locale: "fr" });
    expect(t("login.submit")).toBe("Sign in");
    expect(getIntlDir("fr")).toBe("ltr");
  });

  it("detectLocale falls back to en outside a browser", () => {
    expect(detectLocale()).toBe("en");
  });

  it("useI18n re-renders consumers when the locale changes", () => {
    render(<Probe />);
    expect(screen.getByText(/en\|ltr/)).toBeInTheDocument();

    act(() => {
      configureIntl({ locale: "ar" });
    });
    expect(screen.getByText(/ar\|rtl/)).toBeInTheDocument();
  });
});
