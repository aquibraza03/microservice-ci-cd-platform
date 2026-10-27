import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { DataTable, type DataTableColumn } from "./DataTable";
import { Dialog, DialogContent, DialogTitle } from "./Dialog";
import { Input } from "./Input";
import { Label } from "./Label";
import { Progress } from "./Progress";
import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "./Table";

/**
 * WCAG AA accessibility gate for design-system primitives.
 * Every primitive must pass axe without violations when composed correctly.
 */
describe("design system accessibility (axe)", () => {
  it("Button is accessible and keyboard-focusable", async () => {
    const { container } = render(<Button>Save changes</Button>);
    expect(await axe(container)).toHaveNoViolations();

    const button = screen.getByRole("button", { name: "Save changes" });
    button.focus();
    expect(button).toHaveFocus();
  });

  it("loading Button communicates busy state", async () => {
    const { container } = render(<Button loading>Save changes</Button>);
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByRole("button", { name: /Save changes/ })).toHaveAttribute(
      "aria-busy",
      "true"
    );
  });

  it("Alert (default) is announced as a status", async () => {
    const { container } = render(<Alert title="Notice">Content goes here.</Alert>);
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("destructive Alert uses role=alert", async () => {
    const { container } = render(
      <Alert variant="destructive" title="Failed">
        Failed.
      </Alert>
    );
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("form field with a Label is accessible and editable by keyboard", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <Label htmlFor="email">Email address</Label>
        <Input id="email" type="email" />
      </>
    );
    expect(await axe(container)).toHaveNoViolations();

    await user.type(screen.getByLabelText("Email address"), "me@example.com");
    expect(screen.getByLabelText("Email address")).toHaveValue("me@example.com");
  });

  it("Checkbox with an accessible name is accessible", async () => {
    const { container } = render(<Checkbox aria-label="Select all" />);
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByRole("checkbox", { name: "Select all" })).toBeInTheDocument();
  });

  it("Table is accessible when it has a caption and headers", async () => {
    const { container } = render(
      <Table>
        <TableCaption>Deployment history</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Service</TableHead>
            <TableHead scope="col">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableHead scope="row">api</TableHead>
            <TableCell>Healthy</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("StatusBadge keeps meaning in the text label", async () => {
    const { container } = render(<StatusBadge tone="destructive">Failed</StatusBadge>);
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("Progress announces its value", async () => {
    const { container } = render(<Progress value={65} max={100} aria-label="Completion" />);
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "65");
  });

  it("Sparkline exposes an accessible name", async () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} label="Build trend" />);
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByRole("img", { name: "Build trend" })).toBeInTheDocument();
  });

  it("Tabs expose a labelled tablist", async () => {
    const { container } = render(
      <Tabs defaultValue="overview">
        <TabsList aria-label="Project sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="activity">Activity content</TabsContent>
      </Tabs>
    );
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("Dialog content is accessible with a title", async () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Confirm action</DialogTitle>
          <p>Proceed?</p>
        </DialogContent>
      </Dialog>
    );
    const dialog = screen.getByRole("dialog");
    expect(await axe(dialog)).toHaveNoViolations();
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeInTheDocument();
  });

  it("DataTable is accessible with sortable headers", async () => {
    type Row = { id: string; name: string };
    const columns: DataTableColumn<Row>[] = [{ id: "name", accessorKey: "name", header: "Name" }];
    const { container } = render(
      <DataTable
        data={[
          { id: "1", name: "Alpha" },
          { id: "2", name: "Beta" }
        ]}
        columns={columns}
        rowKey={(row) => row.id}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sort by Name/ })).toBeInTheDocument();
  });
});
