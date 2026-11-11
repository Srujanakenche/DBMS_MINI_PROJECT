import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { defaultPractice } from "../src/lib/practice-content";

async function main() {
  loadEnvConfig(process.cwd());
  const { pool } = await import("../src/lib/db");
  const { mongo, ResourceContent } = await import("../src/lib/mongo");
  try {
    await mongo();
    const { rows } = await pool.query<{ id: string; slug: string }>(
      "SELECT r.id, s.slug FROM resources r JOIN skills s ON s.id = r.primary_skill_id",
    );
    let updated = 0;
    for (const { id, slug } of rows) {
      const practice = defaultPractice(slug);
      if (!practice) continue;
      const result = await ResourceContent.updateOne(
        { resource_id: id, practice: { $exists: false } },
        { $set: { practice } },
      );
      updated += result.modifiedCount;
    }
    console.log(
      `Added editable practice content to ${updated} MongoDB documents.`,
    );
  } finally {
    await Promise.all([pool.end(), mongoose.disconnect()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
