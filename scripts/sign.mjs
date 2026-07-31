// Signs catalog.v1.json with the Ed25519 private key from CATALOG_PRIVATE_KEY
// (base64-encoded 32-byte seed). Writes catalog.v1.json.sig (base64 signature).
import { readFileSync, writeFileSync } from "node:fs"

const privB64 = process.env.CATALOG_PRIVATE_KEY
if (!privB64) {
  console.error("CATALOG_PRIVATE_KEY is not set")
  process.exit(1)
}

const seed = Buffer.from(privB64, "base64")
if (seed.length !== 32) {
  console.error(`CATALOG_PRIVATE_KEY must decode to 32 bytes, got ${seed.length}`)
  process.exit(1)
}

// Build PKCS8 DER wrapper for a raw 32-byte Ed25519 seed.
// Prefix: 302e020100300506032b657004220420 (16 bytes) + seed
const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex")
const pkcs8 = Buffer.concat([pkcs8Prefix, seed])

const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"])
const text = readFileSync("catalog.v1.json")
const sig = await crypto.subtle.sign("Ed25519", key, text)
writeFileSync("catalog.v1.json.sig", Buffer.from(sig).toString("base64") + "\n")
console.log("signed catalog.v1.json ->", "catalog.v1.json.sig")
