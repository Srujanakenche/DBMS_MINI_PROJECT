import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    resource_id: { type: String, required: true, unique: true },
    description: String,
    objectives: [String],
    modules: [{ title: String, chapters: [{ title: String, notes: String }] }],
    tags: [String],
  },
  { collection: "resource_contents", timestamps: true },
);
export const ResourceContent =
  mongoose.models.ResourceContent || mongoose.model("ResourceContent", schema);
let connection: Promise<typeof mongoose> | undefined;
export async function mongo() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing");
  connection ??= mongoose
    .connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .catch((e) => {
      connection = undefined;
      throw e;
    });
  await connection;
}
