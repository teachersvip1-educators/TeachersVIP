import { domainToASCII } from "node:url"
import { getDomain } from "tldts"

/**
 * A resolver backed by the Public Suffix List should be supplied in production.
 * The dependency-free fallback deliberately performs exact host normalization and
 * never guesses a registrable domain by taking the last two labels.
 */
export interface PublicSuffixResolver {
  registrableDomain(hostname: string): string | null
}

const publicSuffixResolver: PublicSuffixResolver = {
  registrableDomain: (hostname) =>
    getDomain(hostname, { allowPrivateDomains: true }),
}

export type NormalizedDomain = {
  hostname: string
  registrableDomain: string
  usedPublicSuffixResolver: boolean
}

const personalEmailProviders = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "mail.com",
  "yandex.com",
])

function asciiHostname(value: string) {
  const candidate = value
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()
  if (
    !candidate ||
    candidate.includes("/") ||
    candidate.includes("@") ||
    candidate.includes("..")
  )
    return null
  const ascii = domainToASCII(candidate).toLowerCase()
  if (
    !ascii ||
    ascii.length > 253 ||
    ascii.includes(":") ||
    !ascii.includes(".")
  )
    return null
  const labels = ascii.split(".")
  if (
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-"),
    )
  )
    return null
  return ascii
}

export function normalizeDomain(
  value: string,
  resolver?: PublicSuffixResolver,
): NormalizedDomain | null {
  const hostname = asciiHostname(value)
  if (!hostname) return null
  const resolved = (resolver ?? publicSuffixResolver).registrableDomain(
    hostname,
  )
  const registrableDomain = resolved ? asciiHostname(resolved) : null
  return {
    hostname,
    registrableDomain: registrableDomain ?? hostname,
    usedPublicSuffixResolver: true,
  }
}

export function normalizeEmail(value: string, resolver?: PublicSuffixResolver) {
  const email = value.trim().toLowerCase()
  const at = email.lastIndexOf("@")
  if (at <= 0 || at !== email.indexOf("@") || at === email.length - 1)
    return null
  const localPart = email.slice(0, at)
  if (/\s/.test(localPart) || localPart.length > 254) return null
  const domain = normalizeDomain(email.slice(at + 1), resolver)
  if (!domain) return null
  return { email: `${localPart}@${domain.hostname}`, localPart, ...domain }
}

export function isPersonalEmailDomain(
  domain: string,
  resolver?: PublicSuffixResolver,
) {
  const normalized = normalizeDomain(domain, resolver)
  return Boolean(
    normalized && personalEmailProviders.has(normalized.registrableDomain),
  )
}

export function domainLookupCandidates(domain: NormalizedDomain) {
  return [...new Set([domain.hostname, domain.registrableDomain])]
}

export const PERSONAL_EMAIL_PROVIDERS = [...personalEmailProviders]
