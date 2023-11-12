import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ObjectCannedACL,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import express from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { z } from "zod";
import { s3Client } from "..";
import prisma from "../db";
import logger from "../logger";
import { publicProcedure, router } from "../trpc";
import { pagedProcedure } from "../utils";

const getImages = pagedProcedure.query(async (opts) => {
  const response = await prisma.image.findMany({
    skip: opts.input.page * opts.input.pageSize,
    take: opts.input.pageSize,
    orderBy: {
      [opts.input.sortBy]: opts.input.ascending ? "asc" : "desc",
    },
  });

  return {
    data: response,
    total: await prisma.page.count(),
  };
});

const getImageById = publicProcedure
  .input(z.object({ id: z.string() }))
  .query(async (opts) => {
    const response = await prisma.image.findUnique({
      where: { id: opts.input.id },
    });

    return response;
  });

const deleteImage = publicProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async (opts) => {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const files = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: process.env.SPACES_BUCKET,
            Prefix: opts.input.id,
          })
        );

        if (files?.KeyCount) {
          await s3Client.send(
            new DeleteObjectsCommand({
              Bucket: process.env.SPACES_BUCKET,
              Delete: {
                Objects: files?.Contents?.map((item) => ({ Key: item.Key })),
                Quiet: false,
              },
            })
          );

          return await tx.image.delete({
            where: { id: opts.input.id },
          });
        }

        throw new Error(`No files found for ID: ${opts.input.id}`);
      });

      return result;
    } catch (err) {
      logger.error((err as Error)?.message);
      throw err;
    }
  });

export default router({
  getImages,
  getImageById,
  deleteImage,
});

// =================================================================================
// EXPRESS IMAGE UPLOAD
// =================================================================================

export const uploadImages = express.Router();

const MAX_UPLOAD_COUNT = 20;

const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.split("/")[0] === "image") cb(null, true);
  else cb(new Error("Only images are allowed!"));
};

const upload = multer({ storage: multer.memoryStorage(), fileFilter });

uploadImages.post(
  "/images/upload",
  upload.array("files", MAX_UPLOAD_COUNT),
  async (req, res) => {
    const files = req?.files as Express.Multer.File[];

    if (files?.length > MAX_UPLOAD_COUNT) {
      return res.status(400).send(`Max ${MAX_UPLOAD_COUNT} files allowed.`);
    }

    const results = [];

    for (const file of files) {
      const id = nanoid(8);

      const params = {
        Bucket: process.env.SPACES_BUCKET,
        Key: `${id}/original.${file.mimetype.split("/")[1]}`,
        Body: file.buffer,
        ACL: ObjectCannedACL.public_read,
      };

      try {
        const result = await s3Client.send(new PutObjectCommand(params));

        if (result.$metadata.httpStatusCode !== 200) {
          throw new Error(
            `Failed to upload image to bucket: ${
              file.originalname
            } - ${JSON.stringify(result)}`
          );
        }

        await prisma.image.create({ data: { id } });

        results.push({ success: true, id });
      } catch (e) {
        logger.error((e as Error)?.message);
        results.push({ success: false, id, error: (e as Error)?.message });
      }
    }

    logger.info({ results });

    if (results.some((result) => !result.success)) {
      return res.status(207).json(results);
    }

    if (results.every((result) => !result.success)) {
      return res.status(500).json(results);
    }

    return res.status(200).json(results);
  }
);
