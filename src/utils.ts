import { z } from "zod";
import { publicProcedure } from "./trpc";

export const pagedParams = z.object({
  page: z.number().default(0),
  pageSize: z.number().default(10),
  ascending: z.boolean().default(true),
  sortBy: z.string().default("createdAt"),
});

export const pagedProcedure = publicProcedure.input(pagedParams);
