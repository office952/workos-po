import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionTaskTransport } from "../api/types";
import { JobTaskFingerprint } from "./JobTaskFingerprint";

describe("JobTaskFingerprint", () => {
  it("creates one accessible segment per actual operation, without extra product groups", () => {
    const tasks = Array.from({ length: 100 }, (_, i) => ({
      taskId: `t-${i}`,
      seqLabel: String(i + 1),
      processLabel: `Op ${i}`,
      scopeLabel: "Un singur produs",
      status: i === 0 ? "COMPLETED" : "PLANNED",
      statusLabel: i === 0 ? "Finalizată" : "Planificată",
      waitingFor: [],
    })) as unknown as ExecutionTaskTransport[];
    const select = vi.fn();
    render(
      <JobTaskFingerprint
        tasks={tasks}
        selectedTaskId="t-0"
        onSelect={select}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(100);
    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "1 · Op 0 · Finalizată" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "100 · Op 99 · Planificată" }),
    );
    expect(select).toHaveBeenCalledWith("t-99");
    expect(screen.queryByText("Panou ACM")).not.toBeInTheDocument();
  });
});
