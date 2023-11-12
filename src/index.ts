import { S3Client } from "@aws-sdk/client-s3";
import * as trpcExpress from "@trpc/server/adapters/express";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import logger from "./logger";
import imageRouter, { uploadImages } from "./routes/images";
import pageRouter from "./routes/pages";
import { createContext, router } from "./trpc";

dotenv.config({ path: ".env" });

export const s3Client = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  forcePathStyle: false,
  region: process.env.SPACES_REGION,
  credentials: {
    accessKeyId: process.env.SPACES_KEY ?? "",
    secretAccessKey: process.env.SPACES_SECRET ?? "",
  },
});

const PORT = process.env.PORT || 5050;

const appRouter = router({
  images: imageRouter,
  pages: pageRouter,
});

export type AppRouter = typeof appRouter;

async function main() {
  const app = express();

  app.use(
    morgan("combined", {
      stream: { write: (m) => logger.info(m.trim()) },
    })
  );

  app.use(helmet());
  app.use(cors());

  app.use(express.json());

  app.use("/api", uploadImages);

  app.use(
    "/api",
    trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  app.get("/", (req, res) => {
    res.send("Hello world!");
  });

  const server = app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
  });

  process.on("SIGTERM", () => {
    logger.info("SIGTERM signal received: closing HTTP server");
    server.close();
  });
}

void main();
