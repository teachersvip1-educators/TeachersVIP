import { describe, expect, it } from "vitest"
import { normalizeRecord, parseCsv } from "./import-education-data.js"

describe("official education CSV normalization", () => {
  it("handles quoted commas and maps a CCD row to a normalized institution", () => {
    const rows = parseCsv(
      'NCESSCH,School Name,Street Address,City,State,ZIP,Website\n"123","Lincoln, Elementary","1 Main St","Austin","TX","78701","https://www.example.edu/"',
    )
    expect(rows).toHaveLength(1)
    expect(normalizeRecord("CCD", rows[0])).toMatchObject({
      sourceInstitutionId: "123",
      institutionType: "public_school",
      name: "Lincoln, Elementary",
      addressLine1: "1 Main St",
      websiteDomain: "www.example.edu",
      websiteRegistrableDomain: "example.edu",
    })
  })

  it("does not create a record when a stable source id or name is missing", () => {
    expect(
      normalizeRecord("IPEDS", { unitid: "", institution_name: "No ID" }),
    ).toBeNull()
    expect(
      normalizeRecord("IPEDS", { unitid: "42", institution_name: "" }),
    ).toBeNull()
  })

  it("treats DAPIP rows as accredited colleges or universities, not accrediting agencies", () => {
    expect(
      normalizeRecord("DAPIP", {
        opeid: "100",
        institution_name: "Example University",
      })?.institutionType,
    ).toBe("university")
    expect(
      normalizeRecord("DAPIP", {
        opeid: "101",
        institution_name: "Example College",
      })?.institutionType,
    ).toBe("college")
  })
})
