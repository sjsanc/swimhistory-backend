import { z } from "zod";
import prisma from "../db";
import { publicProcedure, router } from "../trpc";
import { pagedProcedure } from "../utils";

const get = pagedProcedure.query(async (opts) => {
  const response = await prisma.page.findMany({
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

const getById = publicProcedure
  .input(z.object({ id: z.string() }))
  .query(async (opts) => {
    const response = await prisma.page.findUnique({
      where: { id: opts.input.id },
    });

    return response;
  });

const createPage = publicProcedure
  .input(z.object({ title: z.string(), content: z.string() }))
  .mutation(async (opts) => {
    const response = await prisma.page.create({
      data: opts.input,
    });

    return response;
  });

export default router({
  get,
  getById,
  createPage,
});
