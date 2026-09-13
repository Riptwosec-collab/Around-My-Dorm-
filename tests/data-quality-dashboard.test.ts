import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { DataQualityDashboard } from "@/components/DataQualityDashboard";

const seed = PLACES[0]!;

describe("DataQualityDashboard", () => {
  it("renders local coverage and review diagnostics", () => {
    render(React.createElement(DataQualityDashboard, {
      language: "th",
      places: [
        { ...seed, id: "a", slug: "a", verified: true, dataStatus: "verified", latitude: 13.82, longitude: 100.58 },
        { ...seed, id: "b", slug: "b", verified: false, dataStatus: "partial", latitude: null, longitude: null, googleMapsUrl: null },
      ],
    }));

    expect(screen.getByTestId("data-health-total")).toHaveTextContent("2");
    expect(screen.getByTestId("data-health-coordinates")).toHaveTextContent("1");
    expect(screen.getByTestId("data-health-review")).toBeInTheDocument();
    expect(screen.getByText(/ไม่ใช้ External API|No external API request/i)).toBeInTheDocument();
  });
});
