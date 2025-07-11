import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), "trenchsocial/.env")
});

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

export async function connectToMongo() {
  await client.connect();
  const db = client.db("trenchsocial");

  return {
    postsCollection: db.collection("posts"),
    usersCollection: db.collection("users"),
    commentsCollection: db.collection("comments"),
    chatMessagesCollection: db.collection("chat_messages"),
    privateMessagesCollection: db.collection("private_messages"),
    reportsCollection: db.collection("reports"),
    verificationCodesCollection: db.collection("verification_codes")
  };
}
