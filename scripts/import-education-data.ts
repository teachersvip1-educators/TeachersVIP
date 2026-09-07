/**
 * Import a downloaded official education CSV into the normalized registry.
 *
 * Examples:
 *   pnpm exec tsx scripts/import-education-data.ts --source CCD --file .\ccd.csv --release 2025 --official-url https://nces.ed.gov/ccd/files.asp --dry-run
 *   pnpm exec tsx scripts/import-education-data.ts --source IPEDS --file .\ipeds.csv --release 2024 --official-url https://nces.ed.gov/ipeds/use-the-data
 *
 * Raw files are intentionally not copied into the repository or database. The
 * import keeps a SHA-256 checksum and normalized per-institution snapshots.
 */
import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { domainToASCII } from "node:url"
import { fileURLToPath } from "node:url"
import pg from "pg"
import { getDomain } from "tldts"

type SourceCode = "CCD" | "PSS" | "IPEDS" | "DAPIP"
type InstitutionType = "district" | "public_school" | "charter_school" | "private_school" | "college" | "university" | "other"
type NormalizedRecord = {
  sourceInstitutionId: string
  institutionType: InstitutionType
  name: string
  status: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  countryCode: string
  websiteUrl: string | null
  websiteDomain: string | null
  websiteRegistrableDomain: string | null
}

const sourceUrls: Record<SourceCode, string> = {
  CCD: "https://nces.ed.gov/ccd/files.asp",
  PSS: "https://nces.ed.gov/surveys/pss/pssdata.asp",
  IPEDS: "https://nces.ed.gov/ipeds/use-the-data",
  DAPIP: "https://ope.ed.gov/dapip/",
}

const aliases: Record<string, string[]> = {
  id: [
    "id",
    "id_number",
    "ncessch",
    "leaid",
    "unitid",
    "opeid",
    "institution_id",
    "school_id",
  ],
  name: [
    "name",
    "institution_name",
    "school_name",
    "institution",
    "inst_name",
    "agency_name",
  ],
  type: ["institution_type", "school_type", "sector", "control", "agency_type"],
  status: ["status", "institution_status", "school_status", "active"],
  address1: [
    "address",
    "address1",
    "street",
    "street_address",
    "location_address",
  ],
  address2: ["address2", "suite", "unit"],
  city: ["city", "town", "location_city"],
  state: ["state", "state_code", "st"],
  postalCode: ["zip", "zipcode", "zip_code", "postal_code"],
  country: ["country", "country_code"],
  website: ["website", "website_url", "web", "url", "institution_url"],
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

/** RFC 4180-compatible enough for the published NCES/IPEDS CSV exports. */
function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i]
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (character === '"') quoted = false
      else cell += character
    } else if (character === '"' && cell.length === 0) quoted = true
    else if (character === ",") {
      row.push(cell)
      cell = ""
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[i + 1] === "\n") i += 1
      row.push(cell)
      cell = ""
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
    } else cell += character
  }
  if (cell || row.length) {
    row.push(cell)
    if (row.some((value) => value.trim())) rows.push(row)
  }
  if (!rows.length) return [] as Record<string, string>[]
  const headers = rows[0].map(normalizeHeader)
  return rows
    .slice(1)
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, (values[index] ?? "").trim()]),
      ),
    )
}

function first(row: Record<string, string>, key: string) {
  for (const alias of aliases[key] ?? [])
    if (row[normalizeHeader(alias)]) return row[normalizeHeader(alias)]
  return ""
}

function institutionType(
  source: SourceCode,
  row: Record<string, string>,
): InstitutionType {
  const type = `${first(row, "type")} ${first(row, "name")}`.toLowerCase()
  if (source === "CCD") {
    if (/district|lea|local education/.test(type)) return "district"
    if (/charter/.test(type)) return "charter_school"
    return "public_school"
  }
  if (source === "PSS") return "private_school"
  if (/university/.test(type)) return "university"
  return "college"
}

function normalizeWebsite(value: string) {
  if (!value) return { url: null, domain: null, registrableDomain: null }
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    )
    const domain = domainToASCII(
      url.hostname.replace(/^\.+|\.+$/g, "").toLowerCase(),
    )
    return domain && domain.includes(".")
      ? {
          url: url.toString(),
          domain,
          registrableDomain: getDomain(domain, { allowPrivateDomains: true }),
        }
      : { url: null, domain: null, registrableDomain: null }
  } catch {
    return { url: null, domain: null, registrableDomain: null }
  }
}

function normalizeRecord(
  source: SourceCode,
  row: Record<string, string>,
): NormalizedRecord | null {
  const sourceInstitutionId = first(row, "id")
  const name = first(row, "name")
  if (!sourceInstitutionId || !name) return null
  const website = normalizeWebsite(first(row, "website"))
  return {
    sourceInstitutionId,
    institutionType: institutionType(source, row),
    name,
    status: first(row, "status") || "active",
    addressLine1: first(row, "address1") || null,
    addressLine2: first(row, "address2") || null,
    city: first(row, "city") || null,
    state: first(row, "state") || null,
    postalCode: first(row, "postalCode") || null,
    countryCode: (first(row, "country") || "US").toUpperCase(),
    websiteUrl: website.url,
    websiteDomain: website.domain,
    websiteRegistrableDomain: website.registrableDomain,
  }
}

function checksum(file: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(file)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("error", reject)
    stream.on("end", () => resolve(hash.digest("hex")))
  })
}

function usage(): never {
  console.error(
    "Usage: import-education-data --source CCD|PSS|IPEDS|DAPIP --file FILE --release VERSION [--official-url URL] [--dry-run]",
  )
  process.exit(2)
}

function args() {
  const values = new Map<string, string | boolean>()
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index]
    if (!argument.startsWith("--")) continue
    const key = argument.slice(2)
    if (key === "dry-run") values.set(key, true)
    else values.set(key, process.argv[++index] ?? "")
  }
  const source = String(values.get("source") ?? "").toUpperCase() as SourceCode
  const file = String(values.get("file") ?? "")
  const release = String(values.get("release") ?? "")
  if (!["CCD", "PSS", "IPEDS", "DAPIP"].includes(source) || !file || !release)
    usage()
  const officialUrl = String(values.get("official-url") || sourceUrls[source])
  if (new URL(officialUrl).origin !== new URL(sourceUrls[source]).origin)
    throw new Error(`The source URL must use the official ${source} origin.`)
  return {
    source,
    file: path.resolve(file),
    release,
    officialUrl,
    dryRun: values.get("dry-run") === true,
  }
}

async function importData() {
  const options = args()
  const fileText = await readFile(options.file, "utf8")
  const fileChecksum = await checksum(options.file)
  const records = parseCsv(fileText)
    .map((row) => normalizeRecord(options.source, row))
    .filter((record): record is NormalizedRecord => Boolean(record))
  const report = {
    source: options.source,
    release: options.release,
    checksumSha256: fileChecksum,
    rowsRead: parseCsv(fileText).length,
    normalizedRecords: records.length,
    skippedRows: parseCsv(fileText).length - records.length,
    inserted: 0,
    updated: 0,
    dryRun: options.dryRun,
  }
  if (options.dryRun) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required for a non-dry import.")
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
  })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const importId = randomUUID()
    const existing = await client.query(
      "SELECT id FROM education_data_imports WHERE source_code = $1 AND release_version = $2 AND checksum_sha256 = $3",
      [options.source, options.release, fileChecksum],
    )
    if (existing.rowCount) {
      await client.query("ROLLBACK")
      console.log(
        JSON.stringify(
          { ...report, skipped: "checksum already imported" },
          null,
          2,
        ),
      )
      return
    }
    await client.query(
      `INSERT INTO education_data_imports (id, source_code, release_version, official_url, checksum_sha256, row_count, status) VALUES ($1,$2,$3,$4,$5,$6,'started')`,
      [
        importId,
        options.source,
        options.release,
        options.officialUrl || sourceUrls[options.source],
        records.length,
      ],
    )
    for (const record of records) {
      const prior = await client.query(
        "SELECT id FROM education_institutions WHERE source_code = $1 AND source_institution_id = $2",
        [options.source, record.sourceInstitutionId],
      )
      const institutionId = prior.rows[0]?.id ?? randomUUID()
      await client.query(
        `INSERT INTO education_institutions (id, source_code, source_institution_id, institution_type, name, status, address_line1, address_line2, city, state, postal_code, country_code, website_url, source_release, last_seen_at, last_import_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),$15)
        ON CONFLICT (source_code, source_institution_id) DO UPDATE SET institution_type=EXCLUDED.institution_type,name=EXCLUDED.name,status=EXCLUDED.status,address_line1=EXCLUDED.address_line1,address_line2=EXCLUDED.address_line2,city=EXCLUDED.city,state=EXCLUDED.state,postal_code=EXCLUDED.postal_code,country_code=EXCLUDED.country_code,website_url=EXCLUDED.website_url,source_release=EXCLUDED.source_release,last_seen_at=now(),last_import_id=EXCLUDED.last_import_id,updated_at=now()`,
        [
          institutionId,
          options.source,
          record.sourceInstitutionId,
          record.institutionType,
          record.name,
          record.status,
          record.addressLine1,
          record.addressLine2,
          record.city,
          record.state,
          record.postalCode,
          record.countryCode,
          record.websiteUrl,
          options.release,
          importId,
        ],
      )
      const normalizedRecord = JSON.stringify(record)
      const recordHash = createHash("sha256")
        .update(normalizedRecord)
        .digest("hex")
      await client.query(
        `INSERT INTO education_institution_snapshots (id, import_id, institution_id, record_hash_sha256, normalized_record) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (import_id,institution_id) DO NOTHING`,
        [randomUUID(), importId, institutionId, recordHash, normalizedRecord],
      )
      if (record.websiteDomain)
        await client.query(
          `INSERT INTO educator_domains (id, normalized_domain, registrable_domain, institution_id, classification, decision, evidence, source_import_id, last_seen_at) VALUES ($1,$2,$3,$4,'unknown','manual_review','Discovered from official institution website; staff-only status requires explicit review.',$5,now()) ON CONFLICT (institution_id,normalized_domain) DO UPDATE SET registrable_domain=EXCLUDED.registrable_domain,last_seen_at=now(),source_import_id=EXCLUDED.source_import_id,updated_at=now()`,
          [
            randomUUID(),
            record.websiteDomain,
            record.websiteRegistrableDomain || record.websiteDomain,
            institutionId,
            importId,
          ],
        )
      if (prior.rowCount) report.updated += 1
      else report.inserted += 1
    }
    await client.query(
      `UPDATE education_data_imports SET status='completed', inserted_count=$2, updated_count=$3 WHERE id=$1`,
      [importId, report.inserted, report.updated],
    )
    await client.query("COMMIT")
    console.log(JSON.stringify(report, null, 2))
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  importData().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })

export { parseCsv, normalizeRecord, normalizeWebsite, type NormalizedRecord }
