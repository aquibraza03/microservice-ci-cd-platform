import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Avatar, AvatarFallback } from "./Avatar";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import { Alert } from "./Alert";
import { Badge } from "./Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card";
import { Checkbox } from "./Checkbox";
import { Donut } from "./Donut";
import { EmptyState } from "./EmptyState";
import { MetricCard } from "./MetricCard";
import { PageHeader } from "./PageHeader";
import { Pagination } from "./Pagination";
import { Progress } from "./Progress";
import { Separator } from "./Separator";
import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";

describe("Button", () => {
  it("renders a real button with the correct default type", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("shows loading state: disabled, aria-busy, and a spinner", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: /Save/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector('[role="status"]')).not.toBeNull();
  });

  it("composes onto a link child with asChild", () => {
    render(
      <Button asChild>
        <a href="/dashboard">Dashboard</a>
      </Button>
    );
    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link).toHaveAttribute("href", "/dashboard");
    expect(link.className).toContain("bg-primary");
  });

  it("fires onClick once per click", async () => {
    const user = userEvent.setup();
    let count = 0;
    render(<Button onClick={() => count++}>Click</Button>);
    await user.click(screen.getByRole("button", { name: "Click" }));
    expect(count).toBe(1);
  });
});

describe("Spinner", () => {
  it("is announced as a status with a descriptive label", () => {
    render(<Spinner label="Loading report" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading report");
  });
});

describe("Alert", () => {
  it("renders title and content", () => {
    render(<Alert title="Disk full">Free up space.</Alert>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Disk full")).toBeInTheDocument();
    expect(screen.getByText("Free up space.")).toBeInTheDocument();
  });

  it("uses role alert for destructive variants", () => {
    render(
      <Alert variant="destructive" title="Failed">
        Something broke.
      </Alert>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("Badge", () => {
  it("applies variant classes and renders label", () => {
    render(<Badge variant="success">Healthy</Badge>);
    const badge = screen.getByText("Healthy");
    expect(badge).toHaveClass("bg-success");
  });
});

describe("Card", () => {
  it("composes card sections", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
      </Card>
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});

describe("Checkbox", () => {
  it("reflects the indeterminate state on the DOM node", () => {
    render(<Checkbox indeterminate aria-label="Select all" />);
    const checkbox = screen.getByRole("checkbox", { name: "Select all" });
    expect(checkbox).toHaveProperty("indeterminate", true);
  });
});

describe("Separator", () => {
  it("is hidden from assistive tech when decorative", () => {
    const { container } = render(<Separator />);
    const separator = container.querySelector("[aria-hidden='true']");
    expect(separator).not.toBeNull();
  });

  it("exposes a labeled separator when an accessible label is provided", () => {
    render(<Separator aria-label="Section divider" />);
    expect(screen.getByRole("separator")).toHaveAttribute("aria-label", "Section divider");
  });
});

describe("StatusBadge", () => {
  it("renders the label with the tone applied", () => {
    const { container } = render(<StatusBadge tone="success">Healthy</StatusBadge>);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    const dot = container.querySelector(".bg-success");
    expect(dot).not.toBeNull();
  });

  it("keeps the label text so meaning is never colour-only", () => {
    render(<StatusBadge tone="destructive">Failed</StatusBadge>);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});

describe("Sparkline", () => {
  it("is exposed as an image with an accessible label", () => {
    render(<Sparkline data={[1, 2, 3]} label="Deployments trend" />);
    const chart = screen.getByRole("img", { name: "Deployments trend" });
    expect(chart).toContainElement(chart.querySelector("title"));
  });

  it("renders a neutral baseline when there is no data", () => {
    render(<Sparkline data={[]} label="Empty series" />);
    expect(screen.getByRole("img", { name: "Empty series" })).toBeInTheDocument();
  });
});

describe("Donut", () => {
  it("describes the whole chart in the accessible label", () => {
    render(
      <Donut
        segments={[
          { value: 24, label: "Succeeded", tone: "success" },
          { value: 6, label: "Failed", tone: "destructive" }
        ]}
        label="Succeeded 24, Failed 6"
      />
    );
    expect(screen.getByRole("img", { name: "Succeeded 24, Failed 6" })).toBeInTheDocument();
  });
});

describe("Progress", () => {
  it("announces its value through the progressbar role", () => {
    render(<Progress value={40} max={100} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  });

  it("clamps values outside the range", () => {
    render(<Progress value={120} max={100} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("EmptyState", () => {
  it("renders title, description, and action", () => {
    render(
      <EmptyState
        title="No data"
        description="Nothing here yet."
        action={<button>Create</button>}
      />
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});

describe("Avatar", () => {
  it("shows the fallback when there is no image", () => {
    render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
    );
    expect(screen.getByText("AB")).toBeInTheDocument();
  });
});

describe("Breadcrumbs", () => {
  it("marks the current page with aria-current", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/projects" },
          { label: "Platform API", current: true }
        ]}
      />
    );
    const current = screen.getByText("Platform API");
    expect(current).toHaveAttribute("aria-current", "page");
    const link = screen.getByRole("link", { name: "Projects" });
    expect(link).toHaveAttribute("href", "/projects");
  });
});

describe("PageHeader", () => {
  it("renders title, description, and actions", () => {
    render(
      <PageHeader title="Projects" description="All projects." actions={<button>New</button>} />
    );
    expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByText("All projects.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });
});

describe("Pagination", () => {
  it("renders the page window and announces the active page", () => {
    render(<Pagination page={2} pageCount={3} onPageChange={() => undefined} />);
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("hides when there is a single page", () => {
    render(<Pagination page={1} pageCount={1} onPageChange={() => undefined} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("MetricCard", () => {
  it("shows loading skeletons while pending", () => {
    const { container } = render(<MetricCard label="Pipeline runs" loading />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("shows an honest empty state instead of a value", () => {
    render(<MetricCard label="Deployments" empty emptyText="No data yet" />);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("renders the value, delta, and sparkline", () => {
    render(
      <MetricCard
        label="Pipeline runs"
        value="184"
        delta={13.5}
        deltaFormatter={(delta) => `+${delta.toFixed(1)}%`}
        sparkline={[1, 2, 3]}
      />
    );
    expect(screen.getByText("184")).toBeInTheDocument();
    expect(screen.getByText("+13.5%")).toBeInTheDocument();
  });
});
