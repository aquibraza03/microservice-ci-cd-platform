import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type DataTableColumn } from "./DataTable";

type Row = { id: string; name: string; value: number };

const ROWS: Row[] = [
  { id: "1", name: "Alpha", value: 3 },
  { id: "2", name: "Beta", value: 1 },
  { id: "3", name: "Gamma", value: 2 }
];

const columns: DataTableColumn<Row>[] = [
  { id: "name", accessorKey: "name", header: "Name" },
  { id: "value", accessorKey: "value", header: "Value" }
];

describe("DataTable", () => {
  it("renders the data rows", () => {
    render(<DataTable data={ROWS} columns={columns} rowKey={(row) => row.id} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    for (const row of ROWS) {
      expect(screen.getByText(row.name)).toBeInTheDocument();
    }
  });

  it("sorts rows when a sortable header is activated", async () => {
    const user = userEvent.setup();
    render(<DataTable data={ROWS} columns={columns} rowKey={(row) => row.id} pageSize={5} />);
    const valueHeader = screen.getByRole("button", { name: /Sort by Value/ });
    // TanStack's first activation sorts descending.
    await user.click(valueHeader);
    const rowsDesc = screen.getAllByRole("row").slice(1);
    expect(rowsDesc[0]).toHaveTextContent("Alpha");
    await user.click(valueHeader);
    const rowsAsc = screen.getAllByRole("row").slice(1);
    expect(rowsAsc[0]).toHaveTextContent("Beta");
  });

  it("filters rows by the search value", () => {
    const { rerender } = render(
      <DataTable data={ROWS} columns={columns} rowKey={(row) => row.id} searchValue="" />
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    rerender(
      <DataTable data={ROWS} columns={columns} rowKey={(row) => row.id} searchValue="Gamma" />
    );
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("renders the empty state when there are no rows", () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        rowKey={(row) => row.id}
        empty={<p>Nothing to show</p>}
      />
    );
    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
  });

  it("shows skeleton rows while loading", () => {
    const { container } = render(
      <DataTable data={[]} columns={columns} rowKey={(row) => row.id} loading />
    );
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("paginates when rows exceed the page size", () => {
    render(<DataTable data={ROWS} columns={columns} rowKey={(row) => row.id} pageSize={2} />);
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(within(nav).getByText("1 / 2")).toBeInTheDocument();
  });
});
