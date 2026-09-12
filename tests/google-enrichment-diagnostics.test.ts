import { describe, expect, it } from "vitest";
import {
  classifyGoogleEnrichmentError,
  sanitizeGoogleDiagnosticText,
} from "@/lib/google-enrichment-diagnostics";

describe("Google enrichment diagnostics", () => {
  it("classifies disabled Places API failures", () => {
    expect(classifyGoogleEnrichmentError(new Error("ApiNotActivatedMapError: Places API (New) has not been used in project"))).toBe("places_api_not_enabled");
  });

  it("classifies referrer/request denied failures", () => {
    expect(classifyGoogleEnrichmentError(new Error("REQUEST_DENIED: This API project is not authorized to use this API"))).toBe("request_denied");
  });

  it("classifies quota failures", () => {
    expect(classifyGoogleEnrichmentError(new Error("OVER_QUERY_LIMIT"))).toBe("quota_exceeded");
  });

  it("redacts API keys from diagnostic messages", () => {
    const input = "https://maps.googleapis.com/maps/api/js?key=AIzaSyExampleSecret123&v=weekly";
    const output = sanitizeGoogleDiagnosticText(input);
    expect(output).not.toContain("AIzaSyExampleSecret123");
    expect(output).toContain("key=[REDACTED]");
  });
});
